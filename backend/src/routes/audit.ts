import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { verifyBusiness } from '../lib/verifyBusiness'

const router = Router({ mergeParams: true })
router.use(authMiddleware)

router.get('/', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { limit = '50', offset = '0', entity } = req.query

  const where: Record<string, unknown> = { businessId }
  if (entity) where.entity = entity

  const take = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 200)
  const skip = Math.max(parseInt(offset as string, 10) || 0, 0)

  try {
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.auditLog.count({ where }),
    ])

    return res.json({
      logs: logs.map(l => {
        let metadata = null
        if (l.metadata) {
          try { metadata = JSON.parse(l.metadata) } catch { metadata = null }
        }
        return { ...l, metadata }
      }),
      total,
    })
  } catch {
    return res.status(500).json({ error: 'Error al cargar el registro de auditoría' })
  }
})

export default router
