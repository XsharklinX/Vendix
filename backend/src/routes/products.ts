import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { verifyBusiness } from '../lib/verifyBusiness'
import { checkProductLimit } from '../middleware/planLimits'
import { logAudit } from '../lib/audit'

const router = Router({ mergeParams: true })
router.use(authMiddleware)

const cleanString = z.string().optional().transform(v => v === '' ? undefined : v)

const productSchema = z.object({
  name: z.string().min(1),
  description: cleanString,
  price: z.coerce.number().min(0),
  cost: z.coerce.number().min(0).optional().default(0),
  quantity: z.coerce.number().int().min(0).optional().default(0),
  barcode: cleanString,
  imageUrl: cleanString,
  categoryId: cleanString,
  taxExempt: z.boolean().optional().default(false),
})

// ── Categorías (ANTES de /:id) ──

router.get('/categories', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const cats = await prisma.category.findMany({ where: { businessId }, orderBy: { name: 'asc' } })
  return res.json(cats)
})

router.post('/categories', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const { name } = z.object({ name: z.string().min(1) }).parse(req.body)
    const existing = await prisma.category.findFirst({ where: { businessId, name } })
    if (existing) return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' })

    const cat = await prisma.category.create({ data: { name, businessId } })
    return res.status(201).json(cat)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.delete('/categories/:catId', async (req: AuthRequest, res) => {
  const { businessId, catId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  await prisma.product.updateMany({
    where: { businessId, categoryId: catId },
    data: { categoryId: null },
  })
  await prisma.category.delete({ where: { id: catId, businessId } })
  return res.json({ ok: true })
})

// ── Historial de precios (ANTES de /:id) ──

router.get('/:id/price-history', async (req: AuthRequest, res) => {
  const { businessId, id } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const history = await prisma.priceHistory.findMany({
    where: { productId: id },
    orderBy: { changedAt: 'desc' },
    take: 50,
  })
  return res.json(history)
})

// ── Productos ──

router.get('/', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { search } = req.query
  const where: Record<string, unknown> = { businessId }
  if (search) where.name = { contains: search as string }

  const products = await prisma.product.findMany({
    where,
    include: { category: true, volumePricing: { orderBy: { minQty: 'asc' } } },
    orderBy: { name: 'asc' },
    take: 500,
  })
  return res.json(products)
})

router.post('/', checkProductLimit, async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const data = productSchema.parse(req.body)
    const product = await prisma.product.create({
      data: { ...data, businessId },
      include: { category: true },
    })
    logAudit(req, businessId, 'CREATE', 'PRODUCT', product.id, { name: product.name, price: product.price })
    return res.status(201).json(product)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    console.error('Error creating product:', e)
    return res.status(500).json({ error: 'Error interno al crear el producto' })
  }
})

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const data = productSchema.partial().parse(req.body)

    if (data.price !== undefined) {
      const current = await prisma.product.findUnique({ where: { id }, select: { price: true } })
      if (current && current.price !== data.price) {
        await prisma.priceHistory.create({
          data: { productId: id, oldPrice: current.price, newPrice: data.price },
        })
      }
    }

    const product = await prisma.product.update({
      where: { id, businessId },
      data,
      include: { category: true },
    })
    logAudit(req, businessId, 'UPDATE', 'PRODUCT', id, data)
    return res.json(product)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    console.error('Error updating product:', e)
    return res.status(500).json({ error: 'Error interno al actualizar el producto' })
  }
})

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    await prisma.product.delete({ where: { id, businessId } })
    logAudit(req, businessId, 'DELETE', 'PRODUCT', id)
    return res.json({ ok: true })
  } catch (e) {
    console.error('Error deleting product:', e)
    return res.status(500).json({ error: 'No se puede eliminar el producto (puede tener ventas asociadas)' })
  }
})

// ── Importación masiva desde CSV/Excel ───────────────────────────────────────

router.post('/import', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const rowSchema = z.object({
      name: z.string().min(1),
      price: z.coerce.number().min(0),
      cost: z.coerce.number().min(0).optional().default(0),
      quantity: z.coerce.number().int().min(0).optional().default(0),
      barcode: z.string().optional(),
      description: z.string().optional(),
    })

    const rows = z.array(rowSchema).min(1).max(500).parse(req.body)

    const created = await prisma.$transaction(
      rows.map(row => prisma.product.create({
        data: {
          name: row.name,
          price: row.price,
          cost: row.cost,
          quantity: row.quantity,
          barcode: row.barcode || null,
          description: row.description || null,
          businessId,
        },
      }))
    )

    return res.status(201).json({ created: created.length, products: created })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message, details: e.errors })
    return res.status(500).json({ error: 'Error al importar productos' })
  }
})

// ── Precios por volumen ──

router.get('/:id/volume-pricing', async (req: AuthRequest, res) => {
  const { businessId, id } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const rules = await prisma.volumePricing.findMany({
    where: { productId: id },
    orderBy: { minQty: 'asc' },
  })
  return res.json(rules)
})

router.post('/:id/volume-pricing', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const { minQty, price } = z.object({
      minQty: z.number().int().min(1),
      price: z.number().min(0),
    }).parse(req.body)

    const rule = await prisma.volumePricing.create({ data: { productId: id, minQty, price } })
    return res.status(201).json(rule)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.delete('/:id/volume-pricing/:ruleId', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  await prisma.volumePricing.delete({ where: { id: req.params.ruleId } })
  return res.json({ ok: true })
})

export default router
