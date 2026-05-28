import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { verifyBusiness } from '../lib/verifyBusiness'

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
})

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const [clients, debtRows] = await Promise.all([
      prisma.client.findMany({
        where: { businessId },
        include: { _count: { select: { transactions: true } } },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      prisma.transaction.groupBy({
        by: ['clientId'],
        where: { businessId, type: 'SALE', status: 'PENDING', clientId: { not: null } },
        _sum: { amount: true },
      }),
    ])

    const debtByClient: Record<string, number> = {}
    for (const row of debtRows) {
      if (row.clientId) debtByClient[row.clientId] = row._sum.amount ?? 0
    }

    const result = clients.map(c => ({ ...c, pendingDebt: debtByClient[c.id] ?? 0 }))
    return res.json(result)
  } catch (e) {
    console.error('[clients] GET /', e)
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const data = clientSchema.parse(req.body)
    const client = await prisma.client.create({ data: { ...data, businessId } })
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
    const client = await prisma.client.update({ where: { id, businessId }, data })
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

  await prisma.client.delete({ where: { id, businessId } })
  return res.json({ ok: true })
})

export default router
