import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { verifyBusiness } from '../lib/verifyBusiness'
import { checkTransactionLimit } from '../middleware/planLimits'
import { logAudit } from '../lib/audit'
import { checkLowStock } from '../lib/notifications'
import { logger } from '../lib/logger'

const router = Router({ mergeParams: true })
router.use(authMiddleware)

const itemSchema = z.object({
  productId: z.string().optional(),
  name: z.string(),
  quantity: z.number().int().min(1),
  price: z.number().min(0),
  cost: z.number().min(0).optional().default(0),
})

const txSchema = z.object({
  type: z.enum(['SALE', 'EXPENSE', 'INCOME', 'PURCHASE']),
  amount: z.number().min(0),
  description: z.string().optional(),
  paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER']).optional().default('CASH'),
  status: z.enum(['COMPLETED', 'PENDING', 'CANCELLED']).optional().default('COMPLETED'),
  discountValue: z.number().min(0).optional().default(0),
  discountType: z.enum(['NONE', 'PERCENT', 'FIXED']).optional().default('NONE'),
  taxAmount: z.number().min(0).optional().default(0),
  ncfNumber: z.string().optional(),
  originalCurrency: z.string().optional(),
  exchangeRate: z.number().min(0).optional().default(1),
  originalAmount: z.number().min(0).optional(),
  clientId: z.string().optional(),
  supplierId: z.string().optional(),
  cashSessionId: z.string().optional(),
  items: z.array(itemSchema).optional().default([]),
})

const calculateLoyaltyPoints = (amount: number) => Math.max(0, Math.floor(amount / 100))

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const { from, to, type, status, page, limit } = req.query

    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1)
    const pageSize = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 200)

    const where: Record<string, unknown> = { businessId }
    if (type) where.type = type
    if (status) where.status = status
    if (from || to) {
      where.createdAt = {}
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from as string)
      if (to) {
        const toDate = new Date(to as string)
        toDate.setHours(23, 59, 59, 999)
        ;(where.createdAt as Record<string, unknown>).lte = toDate
      }
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          items: { include: { product: true } },
          client: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
      prisma.transaction.count({ where }),
    ])

    return res.json({
      data: transactions,
      total,
      page: pageNum,
      pages: Math.ceil(total / pageSize),
      limit: pageSize,
    })
  } catch (e) {
    logger.error({ err: e }, '[transactions] GET /')
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/', checkTransactionLimit, async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const data = txSchema.parse(req.body)

    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          type: data.type,
          amount: data.amount,
          description: data.description,
          paymentMethod: data.paymentMethod,
          status: data.status,
          discountValue: data.discountValue,
          discountType: data.discountType,
          taxAmount: data.taxAmount,
          ncfNumber: data.ncfNumber || null,
          originalCurrency: data.originalCurrency || null,
          exchangeRate: data.exchangeRate ?? 1,
          originalAmount: data.originalAmount || null,
          clientId: data.clientId || null,
          supplierId: data.supplierId || null,
          cashSessionId: data.cashSessionId || null,
          businessId,
          createdById: req.userId || null,
          items: {
            create: data.items.map(item => ({
              productId: item.productId || null,
              name: item.name,
              quantity: item.quantity,
              price: item.price,
              cost: item.cost,
            })),
          },
        },
        include: {
          items: true,
          client: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
        },
      })

      // Descontar inventario en ventas (tanto completadas como fiado/pendientes)
      if (data.type === 'SALE' && (data.status === 'COMPLETED' || data.status === 'PENDING')) {
        for (const item of data.items) {
          if (item.productId) {
            const product = await tx.product.findUnique({
              where: { id: item.productId },
              select: { quantity: true, name: true },
            })
            if (product && product.quantity < item.quantity) {
              throw new Error(`Stock insuficiente para "${product.name}" (disponible: ${product.quantity}, solicitado: ${item.quantity})`)
            }
            await tx.product.update({
              where: { id: item.productId },
              data: { quantity: { decrement: item.quantity } },
            })
          }
        }
      }

      // Añadir inventario en compras completadas
      if (data.type === 'PURCHASE' && data.status === 'COMPLETED') {
        for (const item of data.items) {
          if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: { quantity: { increment: item.quantity } },
            })
          }
        }
      }

      if (data.type === 'SALE' && data.status === 'COMPLETED' && data.clientId) {
        const earnedPoints = calculateLoyaltyPoints(data.amount)
        if (earnedPoints > 0) {
          await tx.client.update({
            where: { id: data.clientId, businessId },
            data: { loyaltyPoints: { increment: earnedPoints } },
          })
        }
      }

      return created
    })

    logAudit(req, businessId, 'CREATE', 'TRANSACTION', transaction.id, {
      type: data.type, amount: data.amount, status: data.status,
      clientId: data.clientId, items: data.items.length,
    })

    // Check low stock after any sale that touched inventory
    if (data.type === 'SALE' && data.items.some(i => i.productId)) {
      checkLowStock(businessId, req.userId!).catch(() => {})
    }

    return res.status(201).json(transaction)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    if (e instanceof Error && e.message.startsWith('Stock insuficiente'))
      return res.status(409).json({ error: e.message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const data = txSchema.partial().parse(req.body)

    const updated = await prisma.$transaction(async (tx) => {
      // Si se está cancelando una SALE, restaurar stock
      if (data.status === 'CANCELLED') {
        const original = await tx.transaction.findFirst({
          where: { id, businessId, type: 'SALE' },
          include: { items: true },
        })
        if (original && original.status !== 'CANCELLED') {
          for (const item of original.items) {
            if (item.productId) {
              await tx.product.update({
                where: { id: item.productId },
                data: { quantity: { increment: item.quantity } },
              })
            }
          }
          if (original.clientId && original.status === 'COMPLETED') {
            const pointsToReverse = calculateLoyaltyPoints(original.amount)
            if (pointsToReverse > 0) {
              await tx.client.update({
                where: { id: original.clientId, businessId },
                data: { loyaltyPoints: { decrement: pointsToReverse } },
              })
            }
          }
        }
      }

      return tx.transaction.update({
        where: { id, businessId },
        data: {
          description: data.description,
          paymentMethod: data.paymentMethod,
          status: data.status,
        },
        include: {
          items: true,
          client: { select: { id: true, name: true } },
        },
      })
    })

    logAudit(req, businessId, 'UPDATE', 'TRANSACTION', id, { status: data.status })
    return res.json(updated)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    logger.error({ err: e }, '[transactions] PUT /:id')
    return res.status(500).json({ error: 'Error interno' })
  }
})

// Caja
router.post('/cash-session/open', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const { openAmount, notes } = z.object({
      openAmount: z.number().min(0),
      notes: z.string().optional(),
    }).parse(req.body)

    const existing = await prisma.cashSession.findFirst({
      where: { businessId, status: 'OPEN' },
    })
    if (existing) return res.status(400).json({ error: 'Ya hay una caja abierta' })

    const session = await prisma.cashSession.create({
      data: { openAmount, notes, businessId },
    })
    logAudit(req, businessId, 'CREATE', 'CASH_SESSION', session.id, { openAmount })
    return res.status(201).json(session)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/cash-session/close', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const { closeAmount, notes } = z.object({
      closeAmount: z.number().min(0),
      notes: z.string().optional(),
    }).parse(req.body)

    const session = await prisma.cashSession.findFirst({
      where: { businessId, status: 'OPEN' },
    })
    if (!session) return res.status(404).json({ error: 'No hay caja abierta' })

    const closed = await prisma.cashSession.update({
      where: { id: session.id },
      data: { closeAmount, notes, closedAt: new Date(), status: 'CLOSED' },
      include: { transactions: { select: { amount: true, type: true } } },
    })
    logAudit(req, businessId, 'UPDATE', 'CASH_SESSION', session.id, { closeAmount })
    return res.json(closed)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/cash-session/current', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const session = await prisma.cashSession.findFirst({
      where: { businessId, status: 'OPEN' },
      include: {
        transactions: {
          select: { amount: true, type: true, paymentMethod: true },
          where: { status: 'COMPLETED' },
        },
      },
    })
    return res.json(session)
  } catch (e) {
    logger.error({ err: e }, '[transactions] GET /cash-session/current')
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/cash-session/history', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const sessions = await prisma.cashSession.findMany({
      where: { businessId },
      include: {
        transactions: {
          select: { amount: true, type: true, paymentMethod: true },
          where: { status: 'COMPLETED' },
        },
      },
      orderBy: { openedAt: 'desc' },
      take: 20,
    })
    return res.json(sessions)
  } catch (e) {
    logger.error({ err: e }, '[transactions] GET /cash-session/history')
    return res.status(500).json({ error: 'Error interno' })
  }
})

// Devolver/anular una venta — crea transacción RETURN y restaura stock
router.post('/return/:txId', async (req: AuthRequest, res) => {
  try {
    const { businessId, txId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const original = await prisma.transaction.findFirst({
      where: { id: txId, businessId, type: 'SALE' },
      include: { items: true },
    })
    if (!original) return res.status(404).json({ error: 'Venta no encontrada' })
    if (original.status === 'CANCELLED') return res.status(400).json({ error: 'La venta ya fue anulada' })

    const returned = await prisma.$transaction(async (tx) => {
      // Marcar original como cancelada
      await tx.transaction.update({
        where: { id: txId },
        data: { status: 'CANCELLED' },
      })

      // Crear transacción de devolución
      const ret = await tx.transaction.create({
        data: {
          type: 'RETURN',
          amount: original.amount,
          description: `Devolución de venta`,
          paymentMethod: original.paymentMethod,
          status: 'COMPLETED',
          returnOfId: txId,
          clientId: original.clientId,
          businessId,
          items: {
            create: original.items.map(i => ({
              productId: i.productId,
              name: i.name,
              quantity: i.quantity,
              price: i.price,
              cost: i.cost,
            })),
          },
        },
        include: { items: true },
      })

      // Restaurar stock
      for (const item of original.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { quantity: { increment: item.quantity } },
          })
        }
      }

      if (original.clientId && original.status === 'COMPLETED') {
        const pointsToReverse = calculateLoyaltyPoints(original.amount)
        if (pointsToReverse > 0) {
          await tx.client.update({
            where: { id: original.clientId, businessId },
            data: { loyaltyPoints: { decrement: pointsToReverse } },
          })
        }
      }

      return ret
    })

    logAudit(req, businessId, 'DELETE', 'TRANSACTION', txId, { type: 'RETURN', amount: original.amount })
    return res.status(201).json(returned)
  } catch (e) {
    logger.error({ err: e }, '[transactions] POST /return/:txId')
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/mark-paid/:clientId', async (req: AuthRequest, res) => {
  try {
    const { businessId, clientId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const result = await prisma.transaction.updateMany({
      where: { businessId, clientId, type: 'SALE', status: 'PENDING' },
      data: { status: 'COMPLETED' },
    })
    logAudit(req, businessId, 'UPDATE', 'TRANSACTION', clientId, { action: 'MARK_CLIENT_DEBT_PAID', updated: result.count })
    return res.json({ ok: true })
  } catch (e) {
    logger.error({ err: e }, '[transactions] POST /mark-paid/:clientId')
    return res.status(500).json({ error: 'Error interno' })
  }
})

export default router
