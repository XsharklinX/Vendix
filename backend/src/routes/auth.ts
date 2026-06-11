import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { signToken } from '../lib/jwt'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from '../lib/email'
import { logAudit } from '../lib/audit'
import { logger } from '../lib/logger'

const router = Router()

// ── Schemas ──────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  businessName: z.string().min(2),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const staffSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  businessId: z.string(),
})

// ── Register ─────────────────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body)

    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) return res.status(400).json({ error: 'El correo ya está registrado' })

    const hashed = await bcrypt.hash(data.password, 10)

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashed,
        role: 'OWNER',
        emailVerified: true,
        businesses: {
          create: { name: data.businessName, currency: 'DOP' },
        },
      },
      include: { businesses: true },
    })

    const token = signToken({ userId: user.id, email: user.email, role: user.role })
    const bizId = user.businesses[0]?.id
    if (bizId) logAudit(req, bizId, 'REGISTER', 'AUTH', user.id, { email: user.email })
    return res.status(201).json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email,
        role: user.role, emailVerified: user.emailVerified,
        onboardingCompleted: user.onboardingCompleted,
      },
      business: user.businesses[0],
      businesses: user.businesses,
    })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// ── Login ─────────────────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const data = loginSchema.parse(req.body)

    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { businesses: true },
    })
    if (!user) return res.status(400).json({ error: 'Credenciales incorrectas' })

    const valid = await bcrypt.compare(data.password, user.password)
    if (!valid) return res.status(400).json({ error: 'Credenciales incorrectas' })

    const token = signToken({ userId: user.id, email: user.email, role: user.role })

    const userPayload = {
      id: user.id, name: user.name, email: user.email,
      role: user.role, emailVerified: user.emailVerified,
      onboardingCompleted: user.onboardingCompleted,
    }

    if (user.role === 'CASHIER') {
      const biz = user.staffOf
        ? await prisma.business.findUnique({ where: { id: user.staffOf } })
        : null
      if (biz) logAudit(req, biz.id, 'LOGIN', 'AUTH', user.id, { role: 'CASHIER' })
      return res.json({ token, user: userPayload, businesses: biz ? [biz] : [] })
    }

    const firstBizId = user.businesses[0]?.id
    if (firstBizId) logAudit(req, firstBizId, 'LOGIN', 'AUTH', user.id)
    return res.json({ token, user: userPayload, businesses: user.businesses })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// ── Me ────────────────────────────────────────────────────────────────────────

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { businesses: true },
    })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
    const { password: _, emailVerifyToken: __, resetToken: ___, ...safe } = user
    return res.json(safe)
  } catch {
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// ── Verificar email ───────────────────────────────────────────────────────────

router.post('/verify-email', async (req, res) => {
  try {
    const { token } = z.object({ token: z.string() }).parse(req.body)

    const user = await prisma.user.findFirst({ where: { emailVerifyToken: token } })
    if (!user) return res.status(400).json({ error: 'Token inválido o expirado' })

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null },
    })

    sendWelcomeEmail(user.email, user.name).catch(err => logger.error({ err }, '[auth] sendWelcomeEmail failed'))
    return res.json({ ok: true, message: '¡Correo verificado correctamente!' })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// Reenviar verificación
router.post('/resend-verification', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } })
    if (!user || user.emailVerified) return res.json({ ok: true })

    const token = crypto.randomBytes(32).toString('hex')
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifyToken: token } })
    await sendVerificationEmail(user.email, user.name, token)

    return res.json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// ── Olvidé mi contraseña ──────────────────────────────────────────────────────

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body)

    const user = await prisma.user.findUnique({ where: { email } })
    // Siempre responder OK para no exponer si el email existe
    if (!user) return res.json({ ok: true })

    const token = crypto.randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    })

    await sendPasswordResetEmail(user.email, user.name, token)
    return res.json({ ok: true })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// ── Restablecer contraseña ────────────────────────────────────────────────────

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = z.object({
      token: z.string(),
      password: z.string().min(6),
    }).parse(req.body)

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    })
    if (!user) return res.status(400).json({ error: 'El enlace ha expirado o es inválido' })

    const hashed = await bcrypt.hash(password, 10)
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, resetToken: null, resetTokenExpiry: null },
    })

    return res.json({ ok: true, message: 'Contraseña actualizada correctamente' })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// ── Completar onboarding ──────────────────────────────────────────────────────

router.post('/complete-onboarding', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await prisma.user.update({
      where: { id: req.userId },
      data: { onboardingCompleted: true },
    })
    return res.json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'No se pudo completar el onboarding' })
  }
})

// ── Staff (cajeros) ───────────────────────────────────────────────────────────

router.post('/staff', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const data = staffSchema.parse(req.body)

    const biz = await prisma.business.findFirst({
      where: { id: data.businessId, userId: req.userId },
    })
    if (!biz) return res.status(403).json({ error: 'Acceso denegado' })

    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) return res.status(400).json({ error: 'El correo ya está registrado' })

    const hashed = await bcrypt.hash(data.password, 10)
    const staff = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashed,
        role: 'CASHIER',
        staffOf: data.businessId,
        emailVerified: true,
      },
    })

    return res.status(201).json({
      id: staff.id, name: staff.name, email: staff.email, role: staff.role,
    })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
})

router.get('/staff/:businessId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    const biz = await prisma.business.findFirst({ where: { id: businessId, userId: req.userId } })
    if (!biz) return res.status(403).json({ error: 'Acceso denegado' })

    const staff = await prisma.user.findMany({
      where: { staffOf: businessId, role: 'CASHIER' },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })
    return res.json(staff)
  } catch {
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
})

router.delete('/staff/:staffId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const staff = await prisma.user.findUnique({ where: { id: req.params.staffId } })
    if (!staff || staff.role !== 'CASHIER') return res.status(404).json({ error: 'No encontrado' })

    const biz = await prisma.business.findFirst({
      where: { id: staff.staffOf ?? '', userId: req.userId },
    })
    if (!biz) return res.status(403).json({ error: 'Acceso denegado' })

    await prisma.user.delete({ where: { id: req.params.staffId } })
    return res.json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
})

export default router
