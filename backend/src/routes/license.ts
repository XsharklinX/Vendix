import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { logger } from '../lib/logger'

const router = Router()
router.use(authMiddleware)

// Los admins se definen por env var en el servidor cloud (nunca en el desktop):
// ADMIN_EMAILS=correo1@x.com,correo2@x.com
function isAdmin(email?: string): boolean {
  if (!email || !process.env.ADMIN_EMAILS) return false
  return process.env.ADMIN_EMAILS
    .split(',')
    .map(e => e.trim().toLowerCase())
    .includes(email.toLowerCase())
}

function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!isAdmin(req.email)) return res.status(403).json({ error: 'Acceso denegado' })
  next()
}

// ── Resolución de licencia del usuario actual ────────────────────────────────
// Prioridad: cortesía activa > suscripción pagada del negocio > free.
router.get('/', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { email: true, businesses: { select: { plan: true, subscriptionStatus: true, subscriptionEndsAt: true } } },
    })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const now = new Date()
    const grant = await prisma.licenseGrant.findUnique({ where: { email: user.email.toLowerCase() } })
    if (grant && !grant.revokedAt && (!grant.expiresAt || grant.expiresAt > now)) {
      return res.json({
        plan: grant.plan,
        source: 'complimentary',
        validUntil: grant.expiresAt,
        isAdmin: isAdmin(user.email),
      })
    }

    const paidBiz = user.businesses.find(b =>
      b.plan !== 'free' && b.subscriptionStatus === 'active' &&
      (!b.subscriptionEndsAt || b.subscriptionEndsAt > now)
    )
    if (paidBiz) {
      return res.json({
        plan: paidBiz.plan,
        source: 'subscription',
        validUntil: paidBiz.subscriptionEndsAt,
        isAdmin: isAdmin(user.email),
      })
    }

    return res.json({ plan: 'free', source: 'none', validUntil: null, isAdmin: isAdmin(user.email) })
  } catch (e) {
    logger.error({ err: e }, '[license] GET /')
    return res.status(500).json({ error: 'Error interno' })
  }
})

// ── Administración de cortesías (solo ADMIN_EMAILS) ──────────────────────────

router.get('/grants', requireAdmin, async (_req: AuthRequest, res) => {
  const grants = await prisma.licenseGrant.findMany({ orderBy: { createdAt: 'desc' } })
  return res.json(grants)
})

const grantSchema = z.object({
  email: z.string().email(),
  plan: z.enum(['pro', 'business']).optional().default('pro'),
  note: z.string().max(300).optional(),
  expiresAt: z.string().datetime().optional(),
})

router.post('/grants', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const data = grantSchema.parse(req.body)
    const email = data.email.toLowerCase()
    const grant = await prisma.licenseGrant.upsert({
      where: { email },
      update: {
        plan: data.plan,
        note: data.note,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        revokedAt: null,
        grantedBy: req.email,
      },
      create: {
        email,
        plan: data.plan,
        note: data.note,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        grantedBy: req.email,
      },
    })
    logger.info({ email, plan: data.plan, by: req.email }, '[license] cortesía otorgada')
    return res.status(201).json(grant)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    logger.error({ err: e }, '[license] POST /grants')
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.delete('/grants/:id', requireAdmin, async (req: AuthRequest, res) => {
  await prisma.licenseGrant.update({ where: { id: req.params.id }, data: { revokedAt: new Date() } })
  logger.info({ id: req.params.id, by: req.email }, '[license] cortesía revocada')
  return res.json({ ok: true })
})

export default router
