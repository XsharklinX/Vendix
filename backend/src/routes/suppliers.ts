import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { verifyBusiness } from '../lib/verifyBusiness'
import { logger } from '../lib/logger'
import { recordSyncChange } from '../lib/syncOutbox'

const router = Router({ mergeParams: true })
router.use(authMiddleware)

const supplierSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  document: z.string().optional(),
  address: z.string().optional(),
})

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const deletedFilter = req.query.deleted === 'only' ? { not: null } : null

    const [suppliers, debtRows] = await Promise.all([
      prisma.supplier.findMany({
        where: { businessId, deletedAt: deletedFilter },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      prisma.transaction.groupBy({
        by: ['supplierId'],
        where: { businessId, type: 'PURCHASE', status: 'PENDING', supplierId: { not: null } },
        _sum: { amount: true },
      }),
    ])

    const debtBySupplier: Record<string, number> = {}
    for (const row of debtRows) {
      if (row.supplierId) debtBySupplier[row.supplierId] = row._sum.amount ?? 0
    }

    const result = suppliers.map(s => ({ ...s, pendingDebt: debtBySupplier[s.id] ?? 0 }))
    return res.json(result)
  } catch (e) {
    logger.error({ err: e }, '[suppliers] GET /')
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const data = supplierSchema.parse(req.body)
    const supplier = await prisma.supplier.create({ data: { ...data, businessId } })
    await recordSyncChange({ businessId, entity: 'supplier', entityId: supplier.id, operation: 'UPSERT', payload: supplier })
    return res.status(201).json(supplier)
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

    const data = supplierSchema.partial().parse(req.body)
    const supplier = await prisma.supplier.update({ where: { id, businessId }, data })
    await recordSyncChange({ businessId, entity: 'supplier', entityId: supplier.id, operation: 'UPSERT', payload: supplier })
    return res.json(supplier)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.delete('/:id', async (req: AuthRequest, res) => {
  const { businessId, id } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const supplier = await prisma.supplier.update({ where: { id, businessId }, data: { deletedAt: new Date() } })
  await recordSyncChange({ businessId, entity: 'supplier', entityId: id, operation: 'DELETE', payload: supplier })
  return res.json({ ok: true })
})

router.post('/:id/restore', async (req: AuthRequest, res) => {
  const { businessId, id } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const supplier = await prisma.supplier.update({ where: { id, businessId }, data: { deletedAt: null } })
  await recordSyncChange({ businessId, entity: 'supplier', entityId: supplier.id, operation: 'UPSERT', payload: supplier })
  return res.json({ ok: true })
})

export default router
