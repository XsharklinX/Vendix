import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { verifyBusiness } from '../lib/verifyBusiness'
import { recordStockMovement } from '../lib/stockMovement'
import { logAudit } from '../lib/audit'
import { logger } from '../lib/logger'

const router = Router({ mergeParams: true })
router.use(authMiddleware)

const quoteItemSchema = z.object({
  productId: z.string().optional(),
  name: z.string(),
  quantity: z.number().int().min(1),
  price: z.number().min(0),
})

const quoteSchema = z.object({
  concept: z.string().optional(),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED']).optional().default('PENDING'),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  clientId: z.string().optional(),
  items: z.array(quoteItemSchema).min(1),
})

router.get('/', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const quotes = await prisma.quote.findMany({
    where: { businessId },
    include: {
      items: { include: { product: true } },
      client: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return res.json(quotes)
})

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const data = quoteSchema.parse(req.body)
    const total = data.items.reduce((sum, i) => sum + i.price * i.quantity, 0)

    const lastQuote = await prisma.quote.findFirst({
      where: { businessId },
      orderBy: { number: 'desc' },
    })
    const number = (lastQuote?.number ?? 0) + 1

    const quote = await prisma.quote.create({
      data: {
        number,
        concept: data.concept,
        status: data.status,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        notes: data.notes,
        total,
        clientId: data.clientId || null,
        businessId,
        items: {
          create: data.items.map(i => ({
            productId: i.productId || null,
            name: i.name,
            quantity: i.quantity,
            price: i.price,
          })),
        },
      },
      include: {
        items: true,
        client: { select: { id: true, name: true } },
      },
    })
    return res.status(201).json(quote)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const { status } = z.object({
      status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED']),
    }).parse(req.body)

    const quote = await prisma.quote.update({
      where: { id, businessId },
      data: { status },
      include: { items: true, client: { select: { id: true, name: true } } },
    })
    return res.json(quote)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/:id/convert', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const quote = await prisma.quote.findFirst({
      where: { id, businessId },
      include: { items: true, client: { select: { id: true, name: true } } },
    })
    if (!quote) return res.status(404).json({ error: 'Cotización no encontrada' })
    if (quote.status === 'CONVERTED') return res.status(400).json({ error: 'Esta cotización ya fue convertida en venta' })
    if (quote.status === 'REJECTED' || quote.status === 'EXPIRED') {
      return res.status(400).json({ error: `No se puede convertir una cotización ${quote.status === 'REJECTED' ? 'rechazada' : 'expirada'}` })
    }

    const result = await prisma.$transaction(async (tx) => {
      const txItems = []
      for (const item of quote.items) {
        let cost = 0
        if (item.productId) {
          const product = await tx.product.findUnique({ where: { id: item.productId }, select: { quantity: true, cost: true, name: true } })
          if (product) {
            if (product.quantity < item.quantity) {
              throw new Error(`Stock insuficiente para "${product.name}" (disponible: ${product.quantity}, solicitado: ${item.quantity})`)
            }
            cost = product.cost
            const updated = await tx.product.update({ where: { id: item.productId }, data: { quantity: { decrement: item.quantity } } })
            await recordStockMovement(tx, {
              businessId, productId: item.productId, type: 'SALE',
              quantity: -item.quantity, balanceAfter: updated.quantity,
              reason: `Cotización #${quote.number}`, createdById: req.userId,
            })
          }
        }
        txItems.push({ productId: item.productId || null, name: item.name, quantity: item.quantity, price: item.price, cost })
      }

      const transaction = await tx.transaction.create({
        data: {
          type: 'SALE', amount: quote.total, paymentMethod: 'CASH', status: 'COMPLETED',
          description: `Cotización #${quote.number}${quote.concept ? ` — ${quote.concept}` : ''}`,
          clientId: quote.clientId, businessId, createdById: req.userId || null,
          items: { create: txItems },
        },
        include: { items: true, client: { select: { id: true, name: true } } },
      })

      await tx.quote.update({ where: { id }, data: { status: 'CONVERTED' } })
      return transaction
    }, { timeout: 15000 })

    logAudit(req, businessId, 'CREATE', 'TRANSACTION', result.id, { fromQuote: quote.number, amount: quote.total })
    return res.status(201).json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    if (msg.includes('Stock insuficiente')) return res.status(400).json({ error: msg })
    logger.error({ err: e }, '[quotes] POST /:id/convert')
    return res.status(500).json({ error: msg })
  }
})

router.delete('/:id', async (req: AuthRequest, res) => {
  const { businessId, id } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  await prisma.quote.delete({ where: { id, businessId } })
  return res.json({ ok: true })
})

export default router
