import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { verifyBusiness } from '../lib/verifyBusiness'
import { logAudit } from '../lib/audit'
import { logger } from '../lib/logger'
import { recordSyncChange } from '../lib/syncOutbox'

const router = Router({ mergeParams: true })
router.use(authMiddleware)

const clientSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  document: z.string().optional(),
  address: z.string().optional(),
  isVip: z.boolean().optional().default(false),
  discountRate: z.number().min(0).max(1).optional().default(0),
  manualTags: z.array(z.string()).optional(),
})

const noteSchema = z.object({
  type: z.enum(['NOTE', 'REMINDER']).optional().default('NOTE'),
  content: z.string().min(1),
  dueAt: z.string().datetime().optional().nullable(),
})

const redeemSchema = z.object({
  points: z.number().int().min(1),
  discountAmount: z.number().min(0),
  notes: z.string().optional(),
})

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

function buildSegments(client: {
  isVip: boolean
  createdAt: Date
  pendingDebt: number
  completedSalesCount: number
  totalSales: number
  salesLast90Days: number
  lastSaleAt: Date | null
}) {
  const now = new Date()
  const ageDays = Math.floor((now.getTime() - client.createdAt.getTime()) / 86_400_000)
  const daysSinceSale = client.lastSaleAt
    ? Math.floor((now.getTime() - client.lastSaleAt.getTime()) / 86_400_000)
    : null

  const segments: string[] = []
  if (client.isVip || client.totalSales >= 50_000 || client.completedSalesCount >= 20) segments.push('VIP')
  if (ageDays <= 30 && client.completedSalesCount <= 1) segments.push('Nuevo')
  if (client.salesLast90Days >= 5) segments.push('Frecuente')
  if ((daysSinceSale !== null && daysSinceSale >= 60) || client.pendingDebt > 0) segments.push('En riesgo')
  return segments
}

function parseManualTags(value?: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const { search, page, limit, deleted } = req.query
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const deletedFilter = deleted === 'only' ? { not: null } : null
    const clientWhere: Record<string, unknown> = { businessId, deletedAt: deletedFilter }
    if (search) {
      clientWhere.OR = [
        { name: { contains: search as string } },
        { phone: { contains: search as string } },
        { document: { contains: search as string } },
      ]
    }

    const usePagination = !!page
    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1)
    const pageSize = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 200)

    const [clients, clientTotal, debtRows, saleRows, recentSaleRows] = await Promise.all([
      prisma.client.findMany({
        where: clientWhere,
        include: { _count: { select: { transactions: true } } },
        orderBy: { name: 'asc' },
        skip: usePagination ? (pageNum - 1) * pageSize : 0,
        take: usePagination ? pageSize : 500,
      }),
      usePagination ? prisma.client.count({ where: clientWhere }) : Promise.resolve(0),
      prisma.transaction.groupBy({
        by: ['clientId'],
        where: { businessId, type: 'SALE', status: 'PENDING', clientId: { not: null } },
        _sum: { amount: true },
      }),
      prisma.transaction.groupBy({
        by: ['clientId'],
        where: { businessId, type: 'SALE', status: 'COMPLETED', clientId: { not: null } },
        _sum: { amount: true },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.transaction.groupBy({
        by: ['clientId'],
        where: {
          businessId,
          type: 'SALE',
          status: 'COMPLETED',
          clientId: { not: null },
          createdAt: { gte: ninetyDaysAgo },
        },
        _count: { _all: true },
      }),
    ])

    const debtByClient: Record<string, number> = {}
    for (const row of debtRows) {
      if (row.clientId) debtByClient[row.clientId] = row._sum.amount ?? 0
    }

    const salesByClient: Record<string, { totalSales: number; completedSalesCount: number; lastSaleAt: Date | null }> = {}
    for (const row of saleRows) {
      if (row.clientId) {
        salesByClient[row.clientId] = {
          totalSales: row._sum.amount ?? 0,
          completedSalesCount: row._count._all,
          lastSaleAt: row._max.createdAt ?? null,
        }
      }
    }

    const recentSalesByClient: Record<string, number> = {}
    for (const row of recentSaleRows) {
      if (row.clientId) recentSalesByClient[row.clientId] = row._count._all
    }

    const result = clients.map(c => {
      const pendingDebt = debtByClient[c.id] ?? 0
      const saleStats = salesByClient[c.id] ?? { totalSales: 0, completedSalesCount: 0, lastSaleAt: null }
      const salesLast90Days = recentSalesByClient[c.id] ?? 0
      return {
        ...c,
        manualTags: parseManualTags(c.manualTags),
        pendingDebt,
        totalSales: saleStats.totalSales,
        lastSaleAt: saleStats.lastSaleAt,
        segments: [
          ...buildSegments({
            isVip: c.isVip,
            createdAt: c.createdAt,
            pendingDebt,
            completedSalesCount: saleStats.completedSalesCount,
            totalSales: saleStats.totalSales,
            salesLast90Days,
            lastSaleAt: saleStats.lastSaleAt,
          }),
          ...parseManualTags(c.manualTags),
        ],
      }
    })
    if (usePagination) {
      return res.json({ data: result, total: clientTotal, pages: Math.ceil(clientTotal / pageSize) })
    }
    return res.json(result)
  } catch (e) {
    logger.error({ err: e }, '[clients] GET /')
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const data = clientSchema.parse(req.body)
    const { manualTags, ...clientData } = data
    const client = await prisma.client.create({
      data: { ...clientData, manualTags: manualTags ? JSON.stringify(manualTags) : null, businessId },
    })
    logAudit(req, businessId, 'CREATE', 'CLIENT', client.id, { name: client.name })
    await recordSyncChange({ businessId, entity: 'client', entityId: client.id, operation: 'UPSERT', payload: client })
    return res.status(201).json(client)
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

    const data = clientSchema.partial().parse(req.body)
    const { manualTags, ...clientData } = data
    const client = await prisma.client.update({
      where: { id, businessId },
      data: { ...clientData, manualTags: manualTags ? JSON.stringify(manualTags) : manualTags === undefined ? undefined : null },
    })
    logAudit(req, businessId, 'UPDATE', 'CLIENT', id, { fields: Object.keys(data) })
    await recordSyncChange({ businessId, entity: 'client', entityId: client.id, operation: 'UPSERT', payload: client })
    return res.json(client)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.delete('/:id', async (req: AuthRequest, res) => {
  const { businessId, id } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const client = await prisma.client.update({ where: { id, businessId }, data: { deletedAt: new Date() } })
  logAudit(req, businessId, 'DELETE', 'CLIENT', id)
  await recordSyncChange({ businessId, entity: 'client', entityId: id, operation: 'DELETE', payload: client })
  return res.json({ ok: true })
})

router.post('/:id/restore', async (req: AuthRequest, res) => {
  const { businessId, id } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const client = await prisma.client.update({ where: { id, businessId }, data: { deletedAt: null } })
  logAudit(req, businessId, 'UPDATE', 'CLIENT', id, { restored: true })
  await recordSyncChange({ businessId, entity: 'client', entityId: client.id, operation: 'UPSERT', payload: client })
  return res.json({ ok: true })
})

router.get('/crm/reminders', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const now = new Date()
  const to = new Date()
  to.setDate(to.getDate() + 14)
  const reminders = await prisma.clientNote.findMany({
    where: {
      businessId,
      type: 'REMINDER',
      completedAt: null,
      dueAt: { not: null, lte: to },
    },
    include: { client: { select: { id: true, name: true, phone: true } } },
    orderBy: { dueAt: 'asc' },
    take: 50,
  })
  return res.json(reminders.map(r => ({
    ...r,
    status: r.dueAt && r.dueAt < now ? 'OVERDUE' : 'OPEN',
  })))
})

router.get('/crm/inactive-campaign', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const days = Math.max(parseInt(req.query.days as string, 10) || 60, 1)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const clients = await prisma.client.findMany({
    where: { businessId, deletedAt: null },
    include: {
      transactions: {
        where: { type: 'SALE', status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
    take: 500,
  })
  const rows = clients
    .map(c => {
      const lastSale = c.transactions[0]?.createdAt ?? null
      const daysSinceSale = lastSale ? Math.floor((Date.now() - lastSale.getTime()) / 86_400_000) : null
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        manualTags: parseManualTags(c.manualTags),
        lastSaleAt: lastSale,
        daysSinceSale,
      }
    })
    .filter(c => !c.lastSaleAt || (c.lastSaleAt && c.lastSaleAt < cutoff))

  return res.json({ days, count: rows.length, clients: rows })
})

router.get('/:id/timeline', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const client = await prisma.client.findFirst({ where: { id, businessId } })
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' })

    const [transactions, notes, redemptions] = await Promise.all([
      prisma.transaction.findMany({
        where: { businessId, clientId: id },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.clientNote.findMany({
        where: { businessId, clientId: id },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      prisma.loyaltyRedemption.findMany({
        where: { businessId, clientId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ])

    const events = [
      ...transactions.map(tx => ({
        id: tx.id,
        type: tx.status === 'PENDING' ? 'DEBT' : 'TRANSACTION',
        title: tx.type === 'SALE' ? 'Venta' : tx.type,
        description: tx.description,
        amount: tx.amount,
        status: tx.status,
        date: tx.createdAt,
        metadata: { paymentMethod: tx.paymentMethod, items: tx.items.length },
      })),
      ...notes.map(note => ({
        id: note.id,
        type: note.type,
        title: note.type === 'REMINDER' ? 'Recordatorio' : 'Nota',
        description: note.content,
        status: note.completedAt ? 'COMPLETED' : note.dueAt && note.dueAt < startOfDay(new Date()) ? 'OVERDUE' : 'OPEN',
        date: note.dueAt ?? note.createdAt,
        metadata: { createdAt: note.createdAt, completedAt: note.completedAt },
      })),
      ...redemptions.map(redemption => ({
        id: redemption.id,
        type: 'LOYALTY_REDEMPTION',
        title: 'Canje de puntos',
        description: redemption.notes,
        amount: redemption.discountAmount,
        status: 'COMPLETED',
        date: redemption.createdAt,
        metadata: { points: redemption.points },
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return res.json({ client, events })
  } catch (e) {
    logger.error({ err: e }, '[clients] GET /:id/timeline')
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/:id/notes', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const client = await prisma.client.findFirst({ where: { id, businessId } })
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' })

    const data = noteSchema.parse(req.body)
    const note = await prisma.clientNote.create({
      data: {
        businessId,
        clientId: id,
        type: data.type,
        content: data.content,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        createdById: req.userId,
      },
    })

    logAudit(req, businessId, 'CREATE', 'CLIENT_NOTE', note.id, { clientId: id, type: note.type })
    return res.status(201).json(note)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.put('/:clientId/notes/:noteId', async (req: AuthRequest, res) => {
  try {
    const { businessId, clientId, noteId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const data = noteSchema.partial().extend({
      completed: z.boolean().optional(),
    }).parse(req.body)

    const note = await prisma.clientNote.update({
      where: { id: noteId, businessId, clientId },
      data: {
        type: data.type,
        content: data.content,
        dueAt: data.dueAt ? new Date(data.dueAt) : data.dueAt === null ? null : undefined,
        completedAt: data.completed === undefined ? undefined : data.completed ? new Date() : null,
      },
    })

    logAudit(req, businessId, 'UPDATE', 'CLIENT_NOTE', note.id, { clientId, completed: data.completed })
    return res.json(note)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.delete('/:clientId/notes/:noteId', async (req: AuthRequest, res) => {
  const { businessId, clientId, noteId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  await prisma.clientNote.delete({ where: { id: noteId, businessId, clientId } })
  logAudit(req, businessId, 'DELETE', 'CLIENT_NOTE', noteId, { clientId })
  return res.json({ ok: true })
})

router.post('/:id/redeem-points', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const data = redeemSchema.parse(req.body)
    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({ where: { id, businessId } })
      if (!client) throw new Error('CLIENT_NOT_FOUND')
      if (client.loyaltyPoints < data.points) throw new Error('INSUFFICIENT_POINTS')

      const updatedClient = await tx.client.update({
        where: { id, businessId },
        data: { loyaltyPoints: { decrement: data.points } },
      })

      const redemption = await tx.loyaltyRedemption.create({
        data: {
          businessId,
          clientId: id,
          points: data.points,
          discountAmount: data.discountAmount,
          notes: data.notes,
          createdById: req.userId,
        },
      })

      return { client: updatedClient, redemption }
    })

    logAudit(req, businessId, 'CREATE', 'LOYALTY_REDEMPTION', result.redemption.id, {
      clientId: id,
      points: data.points,
      discountAmount: data.discountAmount,
    })

    return res.status(201).json(result)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    if (e instanceof Error && e.message === 'CLIENT_NOT_FOUND') return res.status(404).json({ error: 'Cliente no encontrado' })
    if (e instanceof Error && e.message === 'INSUFFICIENT_POINTS') return res.status(400).json({ error: 'Puntos insuficientes' })
    return res.status(500).json({ error: 'Error interno' })
  }
})

// ── Lista de precios por cliente ──

router.get('/:id/price-list', async (req: AuthRequest, res) => {
  const { businessId, id } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const list = await prisma.clientPriceList.findMany({
    where: { clientId: id, client: { businessId } },
    include: { product: { select: { id: true, name: true, price: true, barcode: true } } },
    orderBy: { product: { name: 'asc' } },
  })
  return res.json(list)
})

router.post('/:id/price-list', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const { productId, price } = z.object({
      productId: z.string().min(1),
      price: z.coerce.number().min(0),
    }).parse(req.body)

    const [client, product] = await Promise.all([
      prisma.client.findFirst({ where: { id, businessId } }),
      prisma.product.findFirst({ where: { id: productId, businessId } }),
    ])
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' })
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' })

    const entry = await prisma.clientPriceList.upsert({
      where: { clientId_productId: { clientId: id, productId } },
      update: { price },
      create: { clientId: id, productId, price },
      include: { product: { select: { id: true, name: true, price: true, barcode: true } } },
    })

    logAudit(req, businessId, 'UPDATE', 'CLIENT_PRICE_LIST', id, { productId, price })
    return res.status(201).json(entry)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    logger.error({ err: e }, '[clients] POST /:id/price-list')
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.delete('/:id/price-list/:entryId', async (req: AuthRequest, res) => {
  const { businessId, id, entryId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  await prisma.clientPriceList.deleteMany({ where: { id: entryId, clientId: id } })
  logAudit(req, businessId, 'DELETE', 'CLIENT_PRICE_LIST', id, { entryId })
  return res.json({ ok: true })
})

export default router
