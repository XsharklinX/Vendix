import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { verifyBusiness } from '../lib/verifyBusiness'
import { logAudit } from '../lib/audit'
import { recordStockMovement } from '../lib/stockMovement'
import { logger } from '../lib/logger'

const router = Router({ mergeParams: true })
router.use(authMiddleware)

const itemSchema = z.object({
  productId: z.string().optional(),
  name: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  cost: z.coerce.number().min(0),
})

const orderSchema = z.object({
  supplierId: z.string().optional().or(z.literal('')),
  notes: z.string().optional(),
  status: z.enum(['DRAFT', 'SENT']).optional().default('DRAFT'),
  items: z.array(itemSchema).min(1),
})

const statusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED']),
})

async function nextOrderNumber(businessId: string) {
  const last = await prisma.purchaseOrder.findFirst({
    where: { businessId },
    orderBy: { number: 'desc' },
    select: { number: true },
  })
  return (last?.number ?? 0) + 1
}

router.get('/', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { supplierId, status } = req.query
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      businessId,
      ...(supplierId ? { supplierId: supplierId as string } : {}),
      ...(status ? { status: status as string } : {}),
    },
    include: { supplier: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  return res.json(orders)
})

router.get('/reorder-alerts', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { lowStockThreshold: true } })
  const threshold = business?.lowStockThreshold ?? 5
  const all = await prisma.product.findMany({
    where: { businessId },
    include: { category: true },
    orderBy: [{ quantity: 'asc' }, { name: 'asc' }],
  })
  const products = all
    .filter(p => p.quantity <= (p.lowStockThreshold ?? threshold))
    .slice(0, 100)
  return res.json({ threshold, products })
})

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const data = orderSchema.parse(req.body)
    const total = data.items.reduce((sum, item) => sum + item.quantity * item.cost, 0)
    const number = await nextOrderNumber(businessId)

    const order = await prisma.purchaseOrder.create({
      data: {
        number,
        businessId,
        supplierId: data.supplierId || null,
        status: data.status,
        notes: data.notes,
        total,
        items: { create: data.items },
      },
      include: { supplier: true, items: { include: { product: true } } },
    })
    logAudit(req, businessId, 'CREATE', 'PURCHASE_ORDER', order.id, { number, total })
    return res.status(201).json(order)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    logger.error({ err: e }, '[purchase-orders] create')
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.put('/:id/status', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const { status } = statusSchema.parse(req.body)
    const order = await prisma.purchaseOrder.update({
      where: { id, businessId },
      data: { status },
      include: { supplier: true, items: { include: { product: true } } },
    })
    logAudit(req, businessId, 'UPDATE', 'PURCHASE_ORDER', id, { status })
    return res.json(order)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/:id/receive', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const { items } = z.object({
      items: z.array(z.object({
        itemId: z.string(),
        receivedQty: z.coerce.number().int().min(0),
      })).min(1),
    }).parse(req.body)

    const order = await prisma.purchaseOrder.findFirst({
      where: { id, businessId },
      include: { items: true },
    })
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' })
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Esta orden no admite recepciones adicionales' })
    }

    const received = await prisma.$transaction(async tx => {
      for (const row of items) {
        const item = order.items.find(i => i.id === row.itemId)
        if (!item) continue
        const remaining = item.quantity - item.receivedQty
        const qty = Math.min(row.receivedQty, remaining)
        if (qty <= 0) continue

        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQty: { increment: qty } },
        })
        if (item.productId) {
          const updatedProduct = await tx.product.update({
            where: { id: item.productId },
            data: { quantity: { increment: qty }, cost: item.cost },
          })
          await recordStockMovement(tx, {
            businessId, productId: item.productId, type: 'RECEPTION',
            quantity: qty, balanceAfter: updatedProduct.quantity,
            refType: 'PURCHASE_ORDER', refId: id, createdById: req.userId,
          })
        }
      }

      const refreshed = await tx.purchaseOrder.findUnique({
        where: { id },
        include: { supplier: true, items: { include: { product: true } } },
      })
      const allReceived = refreshed!.items.every(i => i.receivedQty >= i.quantity)
      const anyReceived = refreshed!.items.some(i => i.receivedQty > 0)
      return tx.purchaseOrder.update({
        where: { id },
        data: {
          status: allReceived ? 'COMPLETED' : anyReceived ? 'PARTIALLY_RECEIVED' : refreshed!.status,
          receivedAt: allReceived ? new Date() : refreshed!.receivedAt,
        },
        include: { supplier: true, items: { include: { product: true } } },
      })
    })

    logAudit(req, businessId, 'UPDATE', 'PURCHASE_ORDER', id, { action: 'RECEIVE_ITEMS' })
    return res.json(received)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    logger.error({ err: e }, '[purchase-orders] receive')
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.delete('/:id', async (req: AuthRequest, res) => {
  const { businessId, id } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const order = await prisma.purchaseOrder.findFirst({ where: { id, businessId }, include: { items: true } })
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' })
  if (order.items.some(i => i.receivedQty > 0)) {
    return res.status(400).json({ error: 'No se puede eliminar una orden con mercancía recibida' })
  }

  await prisma.purchaseOrder.delete({ where: { id, businessId } })
  logAudit(req, businessId, 'DELETE', 'PURCHASE_ORDER', id)
  return res.json({ ok: true })
})

export default router
