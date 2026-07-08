import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { requireSupportRole } from '../lib/permissions'

const router = Router()
router.use(authMiddleware, requireSupportRole)

router.get('/overview', async (_req, res) => {
  const [
    users,
    businesses,
    products,
    transactions,
    pendingQuotes,
    openCashSessions,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.business.count(),
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.transaction.count(),
    prisma.quote.count({ where: { status: 'PENDING' } }),
    prisma.cashSession.count({ where: { status: 'OPEN' } }),
  ])

  return res.json({
    users,
    businesses,
    products,
    transactions,
    pendingQuotes,
    openCashSessions,
    generatedAt: new Date().toISOString(),
  })
})

router.get('/businesses', async (req, res) => {
  const query = z.object({
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  }).parse(req.query)

  const businesses = await prisma.business.findMany({
    where: query.search
      ? {
          OR: [
            { name: { contains: query.search } },
            { email: { contains: query.search } },
            { taxId: { contains: query.search } },
          ],
        }
      : undefined,
    take: query.limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      plan: true,
      subscriptionStatus: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true, lastLoginAt: true } },
      _count: {
        select: {
          products: true,
          clients: true,
          transactions: true,
          quotes: true,
        },
      },
    },
  })

  return res.json(businesses)
})

router.get('/businesses/:businessId/health', async (req, res) => {
  const { businessId } = req.params
  const [business, lowStock, pendingDebt, pendingQuotes, lastSale, lastBackup] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, plan: true, subscriptionStatus: true, createdAt: true, updatedAt: true },
    }),
    prisma.product.count({ where: { businessId, deletedAt: null, quantity: { lte: 0 } } }),
    prisma.transaction.aggregate({
      where: { businessId, type: 'SALE', status: 'PENDING' },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.quote.count({ where: { businessId, status: 'PENDING' } }),
    prisma.transaction.findFirst({
      where: { businessId, type: 'SALE' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, amount: true, status: true, createdAt: true },
    }),
    prisma.business.findUnique({
      where: { id: businessId },
      select: { lastBackupAt: true },
    }),
  ])

  if (!business) return res.status(404).json({ error: 'Negocio no encontrado' })

  return res.json({
    business,
    lowStock,
    pendingDebt: {
      count: pendingDebt._count._all,
      total: pendingDebt._sum.amount ?? 0,
    },
    pendingQuotes,
    lastSale,
    lastBackupAt: lastBackup?.lastBackupAt ?? null,
    generatedAt: new Date().toISOString(),
  })
})

export default router
