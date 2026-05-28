import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { verifyBusiness } from '../lib/verifyBusiness'

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
      status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED']),
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

router.delete('/:id', async (req: AuthRequest, res) => {
  const { businessId, id } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  await prisma.quote.delete({ where: { id, businessId } })
  return res.json({ ok: true })
})

export default router
