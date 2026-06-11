import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { logger } from '../lib/logger'

const router = Router()
router.use(authMiddleware)

// Nunca exponer el blob cifrado de la API key de IA en respuestas al frontend.
function omitAiKey<T extends { aiApiKeyEnc?: string | null }>(business: T): Omit<T, 'aiApiKeyEnc'> {
  const { aiApiKeyEnc: _aiApiKeyEnc, ...rest } = business
  return rest
}

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
  invoicePrefix: z.string().min(1).max(12).optional().nullable(),
  invoiceSequence: z.coerce.number().int().min(1).optional().nullable(),
  invoiceTemplate: z.enum(['classic', 'modern', 'thermal']).optional().nullable(),
  logoUrl: z.string().url().optional().nullable().or(z.literal('')),
  autoBackupEnabled: z.boolean().optional().nullable(),
  autoBackupInterval: z.number().int().min(1).max(365).optional().nullable(),
})

router.get('/', async (req: AuthRequest, res) => {
  try {
    const businesses = await prisma.business.findMany({
      where: { userId: req.userId },
    })
    return res.json(businesses.map(omitAiKey))
  } catch (e) {
    logger.error({ err: e }, '[business] GET /')
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
    return res.json(omitAiKey(business))
  } catch (e) {
    logger.error({ err: e }, '[business] GET /:id')
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
    return res.json(omitAiKey(updated))
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: e.errors[0].message, field: e.errors[0].path[0] })
    }
    logger.error({ err: e }, '[business] PUT /:id')
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
      business: omitAiKey(business),
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
    logger.error({ err: e }, '[business] GET /:id/export')
    return res.status(500).json({ error: 'Error al exportar' })
  }
})

// Eliminar todos los datos operativos del negocio (mantiene cuenta y negocio)
router.delete('/:id/reset', async (req: AuthRequest, res) => {
  try {
    const business = await prisma.business.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!business) return res.status(403).json({ error: 'Acceso denegado' })

    const { confirm } = z.object({ confirm: z.literal(business.name) }).parse(req.body)
    void confirm

    await prisma.$transaction([
      prisma.transactionItem.deleteMany({ where: { transaction: { businessId: business.id } } }),
      prisma.quoteItem.deleteMany({ where: { quote: { businessId: business.id } } }),
      prisma.transaction.deleteMany({ where: { businessId: business.id } }),
      prisma.quote.deleteMany({ where: { businessId: business.id } }),
      prisma.cashSession.deleteMany({ where: { businessId: business.id } }),
      prisma.auditLog.deleteMany({ where: { businessId: business.id } }),
      prisma.product.deleteMany({ where: { businessId: business.id } }),
      prisma.client.deleteMany({ where: { businessId: business.id } }),
      prisma.supplier.deleteMany({ where: { businessId: business.id } }),
      prisma.employee.deleteMany({ where: { businessId: business.id } }),
    ])

    return res.json({ ok: true })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'El nombre del negocio no coincide' })
    logger.error({ err: e }, '[business] DELETE /:id/reset')
    return res.status(500).json({ error: 'Error interno' })
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
    logger.error({ err: e }, '[business] POST /:id/next-ncf')
    return res.status(500).json({ error: 'Error interno' })
  }
})

export default router
