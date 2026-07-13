import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { verifyBusiness } from '../lib/verifyBusiness'
import { checkProductLimit } from '../middleware/planLimits'
import { logAudit } from '../lib/audit'
import { recordStockMovement } from '../lib/stockMovement'
import { logger } from '../lib/logger'
import { recordSyncChange } from '../lib/syncOutbox'

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
  lowStockThreshold: z.coerce.number().int().min(0).optional().nullable(),
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

// ── Kardex (movimientos de inventario) ──

router.get('/:id/stock-movements', async (req: AuthRequest, res) => {
  const { businessId, id } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const movements = await prisma.stockMovement.findMany({
    where: { productId: id, businessId },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return res.json(movements)
})

// ── Ajuste manual de inventario (con motivo) ──

router.post('/:id/adjust-stock', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const { quantity, reason } = z.object({
      quantity: z.coerce.number().int().refine(n => n !== 0, 'La cantidad no puede ser cero'),
      reason: z.string().min(1).max(200),
    }).parse(req.body)

    const product = await prisma.product.findFirst({ where: { id, businessId } })
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' })
    if (product.quantity + quantity < 0) {
      return res.status(400).json({ error: `Stock insuficiente (disponible: ${product.quantity})` })
    }

    const updated = await prisma.$transaction(async tx => {
      const updatedProduct = await tx.product.update({
        where: { id },
        data: { quantity: { increment: quantity } },
      })
      await recordStockMovement(tx, {
        businessId, productId: id, type: 'ADJUSTMENT',
        quantity, balanceAfter: updatedProduct.quantity,
        reason, createdById: req.userId,
      })
      return updatedProduct
    })

    logAudit(req, businessId, 'UPDATE', 'PRODUCT', id, { adjustStock: quantity, reason, newQuantity: updated.quantity })
    return res.json(updated)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    logger.error({ err: e }, '[products] POST /:id/adjust-stock')
    return res.status(500).json({ error: 'Error interno' })
  }
})

// ── Operaciones en lote ──

router.post('/:id/physical-count', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const { countedQty, reason } = z.object({
      countedQty: z.coerce.number().int().min(0),
      reason: z.string().max(200).optional(),
    }).parse(req.body)

    const result = await prisma.$transaction(async tx => {
      const product = await tx.product.findFirst({ where: { id, businessId } })
      if (!product) throw new Error('Producto no encontrado')
      const difference = countedQty - product.quantity
      const updatedProduct = await tx.product.update({ where: { id }, data: { quantity: countedQty } })
      const count = await tx.physicalInventoryCount.create({
        data: {
          productId: id,
          businessId,
          expectedQty: product.quantity,
          countedQty,
          difference,
          reason: reason || null,
          createdById: req.userId || null,
        },
      })
      if (difference !== 0) {
        await recordStockMovement(tx, {
          businessId,
          productId: id,
          type: 'PHYSICAL_COUNT',
          quantity: difference,
          balanceAfter: updatedProduct.quantity,
          reason: reason || 'Conteo físico',
          refType: 'PHYSICAL_COUNT',
          refId: count.id,
          createdById: req.userId,
        })
      }
      return { count, product: updatedProduct }
    })

    logAudit(req, businessId, 'UPDATE', 'PRODUCT', id, {
      physicalCount: true,
      expectedQty: result.count.expectedQty,
      countedQty: result.count.countedQty,
      difference: result.count.difference,
    })
    return res.status(201).json(result)
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.errors[0].message : e instanceof Error ? e.message : 'Error interno'
    logger.error({ err: e }, '[products] POST /:id/physical-count')
    return res.status(msg === 'Producto no encontrado' ? 404 : 400).json({ error: msg })
  }
})

router.get('/:id/physical-counts', async (req: AuthRequest, res) => {
  const { businessId, id } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const counts = await prisma.physicalInventoryCount.findMany({
    where: { businessId, productId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return res.json(counts)
})

router.post('/:id/transfer', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const { quantity, fromLocation, toLocation, notes, destinationProductId } = z.object({
      quantity: z.coerce.number().int().min(1),
      fromLocation: z.string().min(1).optional().default('Principal'),
      toLocation: z.string().min(1),
      notes: z.string().max(200).optional(),
      destinationProductId: z.string().optional(),
    }).parse(req.body)

    const result = await prisma.$transaction(async tx => {
      const product = await tx.product.findFirst({ where: { id, businessId } })
      if (!product) throw new Error('Producto no encontrado')
      if (product.quantity < quantity) throw new Error(`Stock insuficiente (disponible: ${product.quantity})`)
      const origin = await tx.product.update({ where: { id }, data: { quantity: { decrement: quantity } } })
      let destination = null
      if (destinationProductId) {
        destination = await tx.product.update({ where: { id: destinationProductId, businessId }, data: { quantity: { increment: quantity } } })
      }
      const transfer = await tx.stockTransfer.create({
        data: {
          productId: id,
          destinationProductId: destinationProductId || null,
          businessId,
          quantity,
          fromLocation,
          toLocation,
          notes: notes || null,
          createdById: req.userId || null,
        },
      })
      const reason = `${fromLocation} -> ${toLocation}${notes ? `: ${notes}` : ''}`
      await recordStockMovement(tx, {
        businessId, productId: id, type: 'TRANSFER_OUT',
        quantity: -quantity, balanceAfter: origin.quantity,
        reason, refType: 'STOCK_TRANSFER', refId: transfer.id, createdById: req.userId,
      })
      if (destinationProductId && destination) {
        await recordStockMovement(tx, {
          businessId, productId: destinationProductId, type: 'TRANSFER_IN',
          quantity, balanceAfter: destination.quantity,
          reason, refType: 'STOCK_TRANSFER', refId: transfer.id, createdById: req.userId,
        })
      }
      return transfer
    })

    logAudit(req, businessId, 'UPDATE', 'PRODUCT', id, { transfer: true, quantity, toLocation })
    return res.status(201).json(result)
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.errors[0].message : e instanceof Error ? e.message : 'Error interno'
    logger.error({ err: e }, '[products] POST /:id/transfer')
    return res.status(msg.startsWith('Stock insuficiente') ? 409 : 400).json({ error: msg })
  }
})

router.get('/inventory-alerts', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const since = new Date()
  since.setDate(since.getDate() - 60)
  const [business, products, movedProductIds] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { lowStockThreshold: true } }),
    prisma.product.findMany({ where: { businessId, deletedAt: null }, include: { category: true }, orderBy: { name: 'asc' }, take: 1000 }),
    prisma.stockMovement.findMany({ where: { businessId, createdAt: { gte: since } }, select: { productId: true }, distinct: ['productId'] }),
  ])
  const moved = new Set(movedProductIds.map(m => m.productId))
  const defaultThreshold = business?.lowStockThreshold ?? 5
  const lowStock = products.filter(p => p.quantity <= (p.lowStockThreshold ?? defaultThreshold))
  const lowMargin = products
    .filter(p => p.price > 0 && p.cost > 0)
    .map(p => ({ ...p, margin: ((p.price - p.cost) / p.price) * 100 }))
    .filter(p => p.margin < 15)
  const noMovement = products.filter(p => !moved.has(p.id))

  return res.json({
    lowStock,
    lowMargin,
    noMovement,
    meta: { noMovementDays: 60, lowMarginThreshold: 15, lowStockDefault: defaultThreshold },
  })
})

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(['updatePrice', 'updateCategory', 'delete']),
  value: z.union([z.string(), z.number()]).optional(),
})

router.patch('/bulk', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const { ids, action, value } = bulkSchema.parse(req.body)

    const result = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where: { id: { in: ids }, businessId } })
      if (products.length === 0) throw new Error('Ningún producto encontrado')

      if (action === 'delete') {
        await tx.product.updateMany({ where: { id: { in: ids }, businessId }, data: { deletedAt: new Date() } })
        return { action, affected: products.length }
      }

      if (action === 'updatePrice') {
        const percent = Number(value)
        if (!percent || percent === 0) throw new Error('Porcentaje inválido')
        for (const p of products) {
          const newPrice = Math.round(p.price * (1 + percent / 100) * 100) / 100
          await tx.product.update({ where: { id: p.id }, data: { price: Math.max(0, newPrice) } })
          if (p.price !== newPrice) {
            await tx.priceHistory.create({ data: { productId: p.id, oldPrice: p.price, newPrice: Math.max(0, newPrice) } })
          }
        }
        return { action, affected: products.length, percent }
      }

      if (action === 'updateCategory') {
        const categoryId = String(value) || null
        await tx.product.updateMany({ where: { id: { in: ids }, businessId }, data: { categoryId } })
        return { action, affected: products.length, categoryId }
      }

      throw new Error('Acción no soportada')
    }, { timeout: 15000 })

    logAudit(req, businessId, 'UPDATE', 'PRODUCT', 'BULK', result)
    return res.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.errors[0].message : e instanceof Error ? e.message : 'Error interno'
    logger.error({ err: e }, '[products] PATCH /bulk')
    return res.status(400).json({ error: msg })
  }
})

// ── Productos ──

router.get('/', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { search, page, limit, deleted } = req.query
  const deletedFilter = deleted === 'only' ? { not: null } : null
  const where: Record<string, unknown> = { businessId, deletedAt: deletedFilter }
  if (search) where.name = { contains: search as string }

  const recentPriceChange = { changedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
  const include = {
    category: true,
    volumePricing: { orderBy: { minQty: 'asc' as const } },
    // Solo el cambio de precio mas reciente dentro de los ultimos 7 dias, si existe —
    // alimenta el badge "Antes: RD$X" en el POS sin pedir el historial completo por producto.
    priceHistory: { where: recentPriceChange, orderBy: { changedAt: 'desc' as const }, take: 1 },
  }
  const orderBy = { name: 'asc' as const }

  if (page) {
    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1)
    const pageSize = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 200)
    const [data, total] = await Promise.all([
      prisma.product.findMany({ where, include, orderBy, skip: (pageNum - 1) * pageSize, take: pageSize }),
      prisma.product.count({ where }),
    ])
    return res.json({ data, total, pages: Math.ceil(total / pageSize) })
  }

  const products = await prisma.product.findMany({ where, include, orderBy, take: 500 })
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
    await recordSyncChange({ businessId, entity: 'product', entityId: product.id, operation: 'UPSERT', payload: product })
    return res.status(201).json(product)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    logger.error({ err: e }, '[products] POST /')
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
    await recordSyncChange({ businessId, entity: 'product', entityId: product.id, operation: 'UPSERT', payload: product })
    return res.json(product)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    logger.error({ err: e }, '[products] PUT /:id')
    return res.status(500).json({ error: 'Error interno al actualizar el producto' })
  }
})

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const product = await prisma.product.update({ where: { id, businessId }, data: { deletedAt: new Date() } })
    logAudit(req, businessId, 'DELETE', 'PRODUCT', id)
    await recordSyncChange({ businessId, entity: 'product', entityId: id, operation: 'DELETE', payload: product })
    return res.json({ ok: true })
  } catch (e) {
    logger.error({ err: e }, '[products] DELETE /:id')
    return res.status(500).json({ error: 'No se pudo eliminar el producto' })
  }
})

router.post('/:id/restore', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const product = await prisma.product.update({ where: { id, businessId }, data: { deletedAt: null } })
    logAudit(req, businessId, 'UPDATE', 'PRODUCT', id, { restored: true })
    await recordSyncChange({ businessId, entity: 'product', entityId: product.id, operation: 'UPSERT', payload: product })
    return res.json({ ok: true })
  } catch (e) {
    logger.error({ err: e }, '[products] POST /:id/restore')
    return res.status(500).json({ error: 'No se pudo restaurar el producto' })
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
      category: z.string().optional(),
      lowStockThreshold: z.coerce.number().int().min(0).nullable().optional(),
    })

    const rows = z.array(rowSchema).min(1).max(500).parse(req.body)
    const barcodes = rows.map(r => r.barcode?.trim()).filter(Boolean) as string[]
    const duplicateBarcodes = new Set(barcodes.filter((barcode, index) => barcodes.indexOf(barcode) !== index))
    if (duplicateBarcodes.size > 0) {
      return res.status(400).json({ error: `Códigos duplicados en archivo: ${Array.from(duplicateBarcodes).join(', ')}` })
    }

    const existing = await prisma.product.findMany({
      where: {
        businessId,
        OR: [
          { name: { in: rows.map(r => r.name.trim()) } },
          ...(barcodes.length ? [{ barcode: { in: barcodes } }] : []),
        ],
      },
      select: { name: true, barcode: true },
    })
    const existingNames = new Set(existing.map(p => p.name.toLowerCase()))
    const existingBarcodes = new Set(existing.map(p => p.barcode).filter(Boolean))

    const created = await prisma.$transaction(async tx => {
      const categoryCache = new Map<string, string>()
      const products = []
      for (const row of rows) {
        const name = row.name.trim()
        const barcode = row.barcode?.trim() || null
        if (existingNames.has(name.toLowerCase()) || (barcode && existingBarcodes.has(barcode))) continue

        let categoryId: string | null = null
        const categoryName = row.category?.trim()
        if (categoryName) {
          categoryId = categoryCache.get(categoryName) ?? null
          if (!categoryId) {
            const existingCategory = await tx.category.findFirst({ where: { businessId, name: categoryName } })
            const cat = existingCategory ?? await tx.category.create({ data: { name: categoryName, businessId } })
            categoryId = cat.id
            categoryCache.set(categoryName, categoryId)
          }
        }

        products.push(await tx.product.create({
          data: {
            name,
            price: row.price,
            cost: row.cost,
            quantity: row.quantity,
            barcode,
            description: row.description?.trim() || null,
            lowStockThreshold: row.lowStockThreshold ?? null,
            categoryId,
            businessId,
          },
        }))
      }
      return products
    })

    return res.status(201).json({ created: created.length, skipped: rows.length - created.length, products: created })
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
