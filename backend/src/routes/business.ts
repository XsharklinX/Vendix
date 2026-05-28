import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authMiddleware)

const updateSchema = z.object({
  name: z.string().min(2).optional().nullable(),
  type: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  taxId: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  lowStockThreshold: z.coerce.number().int().min(0).optional().nullable(),
  taxRate: z.coerce.number().min(0).max(1).optional().nullable(),
  taxName: z.string().optional().nullable(),
  taxIncluded: z.boolean().optional().nullable(),
  ncfType: z.string().optional().nullable(),
  ncfSequence: z.number().int().min(1).optional().nullable(),
  autoBackupEnabled: z.boolean().optional().nullable(),
  autoBackupInterval: z.number().int().min(1).max(365).optional().nullable(),
})

router.get('/', async (req: AuthRequest, res) => {
  try {
    const businesses = await prisma.business.findMany({
      where: { userId: req.userId },
    })
    return res.json(businesses)
  } catch (e) {
    console.error('[business] GET /', e)
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = z.object({ name: z.string().min(2) }).parse(req.body)
    const business = await prisma.business.create({
      data: { ...data, userId: req.userId!, currency: 'DOP' },
    })
    return res.status(201).json(business)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const business = await prisma.business.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!business) return res.status(404).json({ error: 'Negocio no encontrado' })
    return res.json(business)
  } catch (e) {
    console.error('[business] GET /:id', e)
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const parsed = updateSchema.parse(req.body)
    const business = await prisma.business.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!business) return res.status(404).json({ error: 'Negocio no encontrado' })

    // Strip null values — only send defined fields to Prisma
    const data = Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => v !== null && v !== undefined)
    )

    const updated = await prisma.business.update({
      where: { id: req.params.id },
      data,
    })
    return res.json(updated)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    console.error('[business] PUT /:id', e)
    return res.status(500).json({ error: 'Error interno' })
  }
})

// Exportar toda la data del negocio como JSON
router.get('/:id/export', async (req: AuthRequest, res) => {
  try {
    const business = await prisma.business.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!business) return res.status(403).json({ error: 'Acceso denegado' })

    const [products, clients, suppliers, employees, transactions, quotes, cashSessions] =
      await Promise.all([
        prisma.product.findMany({ where: { businessId: business.id }, include: { volumePricing: true } }),
        prisma.client.findMany({ where: { businessId: business.id } }),
        prisma.supplier.findMany({ where: { businessId: business.id } }),
        prisma.employee.findMany({ where: { businessId: business.id } }),
        prisma.transaction.findMany({
          where: { businessId: business.id },
          include: { items: true },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.quote.findMany({
          where: { businessId: business.id },
          include: { items: true },
        }),
        prisma.cashSession.findMany({ where: { businessId: business.id } }),
      ])

    const payload = {
      exportedAt: new Date().toISOString(),
      business,
      products,
      clients,
      suppliers,
      employees,
      transactions,
      quotes,
      cashSessions,
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="vendix-backup-${business.name.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json"`
    )
    return res.json(payload)
  } catch (e) {
    console.error('[business] GET /:id/export', e)
    return res.status(500).json({ error: 'Error al exportar' })
  }
})

// Generar próximo NCF (DGII República Dominicana)
router.post('/:id/next-ncf', async (req: AuthRequest, res) => {
  try {
    const business = await prisma.business.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!business) return res.status(403).json({ error: 'Acceso denegado' })
    if (!business.ncfType) return res.status(400).json({ error: 'Tipo de NCF no configurado' })

    const seq = business.ncfSequence
    const ncf = `${business.ncfType}${String(seq).padStart(8, '0')}`

    await prisma.business.update({
      where: { id: business.id },
      data: { ncfSequence: seq + 1 },
    })

    return res.json({ ncf, next: seq + 1 })
  } catch (e) {
    console.error('[business] POST /:id/next-ncf', e)
    return res.status(500).json({ error: 'Error interno' })
  }
})

export default router
