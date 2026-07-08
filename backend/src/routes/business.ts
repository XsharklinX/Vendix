import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { logAudit } from '../lib/audit'
import { recordStockMovement } from '../lib/stockMovement'
import { logger } from '../lib/logger'

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
    return res.json(businesses)
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
    return res.json(business)
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
    return res.json(updated)
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

    const [categories, products, clients, suppliers, employees, transactions, quotes, cashSessions] =
      await Promise.all([
        prisma.category.findMany({ where: { businessId: business.id } }),
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
      categories,
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

const importSchema = z.object({
  categories: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1),
  })).optional().default([]),
  products: z.array(z.object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    price: z.coerce.number().min(0),
    cost: z.coerce.number().min(0).optional().default(0),
    quantity: z.coerce.number().int().min(0).optional().default(0),
    barcode: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    taxExempt: z.boolean().optional().default(false),
    lowStockThreshold: z.coerce.number().int().min(0).nullable().optional(),
    categoryId: z.string().nullable().optional(),
    volumePricing: z.array(z.object({
      minQty: z.coerce.number().int().min(1),
      price: z.coerce.number().min(0),
    })).optional().default([]),
  })).optional().default([]),
  clients: z.array(z.object({
    name: z.string().min(1),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    document: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    isVip: z.boolean().optional().default(false),
    discountRate: z.coerce.number().min(0).max(1).optional().default(0),
    loyaltyPoints: z.coerce.number().int().min(0).optional().default(0),
  })).optional().default([]),
  suppliers: z.array(z.object({
    name: z.string().min(1),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    document: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
  })).optional().default([]),
  employees: z.array(z.object({
    name: z.string().min(1),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    salary: z.coerce.number().min(0).optional().default(0),
    commissionRate: z.coerce.number().min(0).optional().default(0),
    active: z.boolean().optional().default(true),
  })).optional().default([]),
}).passthrough()

// Restaurar datos desde un respaldo JSON (importación aditiva, omite duplicados)
router.post('/:id/import/validate', async (req: AuthRequest, res) => {
  try {
    const business = await prisma.business.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!business) return res.status(403).json({ error: 'Acceso denegado' })

    const data = importSchema.parse(req.body)
    const counts = {
      categories: data.categories.length,
      products: data.products.length,
      clients: data.clients.length,
      suppliers: data.suppliers.length,
      employees: data.employees.length,
    }
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
    const warnings: string[] = []

    if (!total) warnings.push('El archivo no contiene datos importables.')
    if (!req.body.exportedAt) warnings.push('El archivo no tiene fecha de exportacion.')
    if (!req.body.business?.name) warnings.push('El archivo no incluye metadatos del negocio original.')

    return res.json({
      ok: total > 0,
      validatedAt: new Date().toISOString(),
      sourceBusiness: req.body.business?.name ?? null,
      exportedAt: req.body.exportedAt ?? null,
      counts,
      warnings,
    })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: 'El archivo no tiene el formato esperado de Vendix',
        detail: e.errors[0].message,
        field: e.errors[0].path.join('.'),
      })
    }
    logger.error({ err: e }, '[business] POST /:id/import/validate')
    return res.status(500).json({ ok: false, error: 'No se pudo validar el respaldo' })
  }
})

router.post('/:id/import', async (req: AuthRequest, res) => {
  try {
    const business = await prisma.business.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!business) return res.status(403).json({ error: 'Acceso denegado' })

    const data = importSchema.parse(req.body)
    if (!data.categories.length && !data.products.length && !data.clients.length
      && !data.suppliers.length && !data.employees.length) {
      return res.status(400).json({ error: 'El archivo no contiene datos para importar' })
    }

    const summary = {
      categories: { created: 0, skipped: 0 },
      products: { created: 0, skipped: 0 },
      clients: { created: 0, skipped: 0 },
      suppliers: { created: 0, skipped: 0 },
      employees: { created: 0, skipped: 0 },
    }

    await prisma.$transaction(async tx => {
      // Categorías
      const existingCategories = await tx.category.findMany({ where: { businessId: business.id } })
      const categoryByName = new Map(existingCategories.map(c => [c.name.toLowerCase(), c.id]))
      const categoryIdMap = new Map<string, string>()

      for (const cat of data.categories) {
        const key = cat.name.toLowerCase()
        let newId = categoryByName.get(key)
        if (!newId) {
          const created = await tx.category.create({ data: { name: cat.name, businessId: business.id } })
          newId = created.id
          categoryByName.set(key, newId)
          summary.categories.created++
        } else {
          summary.categories.skipped++
        }
        if (cat.id) categoryIdMap.set(cat.id, newId)
      }

      // Productos
      const existingProducts = await tx.product.findMany({ where: { businessId: business.id } })
      const productByBarcode = new Map(existingProducts.filter(p => p.barcode).map(p => [p.barcode as string, p]))
      const productByName = new Map(existingProducts.map(p => [p.name.toLowerCase(), p]))

      for (const p of data.products) {
        const existing = (p.barcode && productByBarcode.get(p.barcode)) || productByName.get(p.name.toLowerCase())
        if (existing) {
          summary.products.skipped++
          continue
        }
        const categoryId = p.categoryId ? categoryIdMap.get(p.categoryId) : undefined
        const created = await tx.product.create({
          data: {
            name: p.name,
            description: p.description ?? undefined,
            price: p.price,
            cost: p.cost,
            quantity: p.quantity,
            barcode: p.barcode ?? undefined,
            imageUrl: p.imageUrl ?? undefined,
            taxExempt: p.taxExempt,
            lowStockThreshold: p.lowStockThreshold ?? undefined,
            categoryId: categoryId ?? undefined,
            businessId: business.id,
            volumePricing: p.volumePricing.length
              ? { create: p.volumePricing.map(v => ({ minQty: v.minQty, price: v.price })) }
              : undefined,
          },
        })
        if (created.quantity > 0) {
          await recordStockMovement(tx, {
            businessId: business.id, productId: created.id, type: 'ADJUSTMENT',
            quantity: created.quantity, balanceAfter: created.quantity,
            reason: 'Importación de respaldo', createdById: req.userId,
          })
        }
        summary.products.created++
        if (p.barcode) productByBarcode.set(p.barcode, created)
        productByName.set(p.name.toLowerCase(), created)
      }

      // Clientes
      const existingClients = await tx.client.findMany({ where: { businessId: business.id } })
      const clientByDoc = new Map(existingClients.filter(c => c.document).map(c => [c.document as string, c]))
      const clientByNamePhone = new Map(existingClients.map(c => [`${c.name.toLowerCase()}|${c.phone ?? ''}`, c]))

      for (const c of data.clients) {
        const existing = (c.document && clientByDoc.get(c.document)) || clientByNamePhone.get(`${c.name.toLowerCase()}|${c.phone ?? ''}`)
        if (existing) {
          summary.clients.skipped++
          continue
        }
        const created = await tx.client.create({
          data: {
            name: c.name,
            phone: c.phone ?? undefined,
            email: c.email ?? undefined,
            document: c.document ?? undefined,
            address: c.address ?? undefined,
            isVip: c.isVip,
            discountRate: c.discountRate,
            loyaltyPoints: c.loyaltyPoints,
            businessId: business.id,
          },
        })
        summary.clients.created++
        if (c.document) clientByDoc.set(c.document, created)
        clientByNamePhone.set(`${c.name.toLowerCase()}|${c.phone ?? ''}`, created)
      }

      // Proveedores
      const existingSuppliers = await tx.supplier.findMany({ where: { businessId: business.id } })
      const supplierByName = new Set(existingSuppliers.map(s => s.name.toLowerCase()))

      for (const s of data.suppliers) {
        if (supplierByName.has(s.name.toLowerCase())) {
          summary.suppliers.skipped++
          continue
        }
        await tx.supplier.create({
          data: {
            name: s.name,
            phone: s.phone ?? undefined,
            email: s.email ?? undefined,
            document: s.document ?? undefined,
            address: s.address ?? undefined,
            businessId: business.id,
          },
        })
        summary.suppliers.created++
        supplierByName.add(s.name.toLowerCase())
      }

      // Empleados
      const existingEmployees = await tx.employee.findMany({ where: { businessId: business.id } })
      const employeeKeys = new Set(existingEmployees.map(e => `${e.name.toLowerCase()}|${e.role ?? ''}`))

      for (const e of data.employees) {
        const key = `${e.name.toLowerCase()}|${e.role ?? ''}`
        if (employeeKeys.has(key)) {
          summary.employees.skipped++
          continue
        }
        await tx.employee.create({
          data: {
            name: e.name,
            phone: e.phone ?? undefined,
            email: e.email ?? undefined,
            role: e.role ?? undefined,
            salary: e.salary,
            commissionRate: e.commissionRate,
            active: e.active,
            businessId: business.id,
          },
        })
        summary.employees.created++
        employeeKeys.add(key)
      }
    }, { timeout: 30000 })

    logAudit(req, business.id, 'CREATE', 'BACKUP_IMPORT', business.id, summary)
    return res.json({ ok: true, summary })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    logger.error({ err: e }, '[business] POST /:id/import')
    return res.status(500).json({ error: 'Error al importar el respaldo' })
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
