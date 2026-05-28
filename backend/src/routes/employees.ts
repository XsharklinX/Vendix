import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { verifyBusiness } from '../lib/verifyBusiness'
import { logAudit } from '../lib/audit'

const router = Router({ mergeParams: true })
router.use(authMiddleware)

const employeeSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  role: z.string().optional(),
  salary: z.coerce.number().min(0).optional().default(0),
  commissionRate: z.coerce.number().min(0).max(100).optional().default(0),
  active: z.boolean().optional().default(true),
})

const dateRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  period: z.string().optional(),
})

function buildDateRange(from?: string, to?: string) {
  const where: { gte?: Date; lte?: Date } = {}
  if (from) where.gte = new Date(`${from}T00:00:00`)
  if (to) where.lte = new Date(`${to}T23:59:59.999`)
  return Object.keys(where).length ? where : undefined
}

router.get('/', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const employees = await prisma.employee.findMany({
    where: { businessId },
    orderBy: { name: 'asc' },
  })
  return res.json(employees)
})

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const data = employeeSchema.parse(req.body)
    const employee = await prisma.employee.create({ data: { ...data, businessId } })
    logAudit(req, businessId, 'CREATE', 'EMPLOYEE', employee.id, { name: employee.name })
    return res.status(201).json(employee)
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

    const data = employeeSchema.partial().parse(req.body)
    const employee = await prisma.employee.update({ where: { id, businessId }, data })
    logAudit(req, businessId, 'UPDATE', 'EMPLOYEE', id, data)
    return res.json(employee)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.delete('/:id', async (req: AuthRequest, res) => {
  const { businessId, id } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  await prisma.employee.delete({ where: { id, businessId } })
  logAudit(req, businessId, 'DELETE', 'EMPLOYEE', id)
  return res.json({ ok: true })
})

router.get('/sales-report', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { from, to } = dateRangeSchema.parse(req.query)
  const createdAt = buildDateRange(from, to)

  const [employees, users] = await Promise.all([
    prisma.employee.findMany({ where: { businessId }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({ select: { id: true, email: true, name: true, role: true } }),
  ])

  const userByEmail = new Map(users.map(u => [u.email.toLowerCase(), u]))

  const rows = await Promise.all(employees.map(async employee => {
    const user = employee.email ? userByEmail.get(employee.email.toLowerCase()) : null
    const where = {
      businessId,
      type: 'SALE',
      status: 'COMPLETED',
      ...(createdAt ? { createdAt } : {}),
      ...(user ? { createdById: user.id } : { createdById: '__NO_MATCH__' }),
    }
    const [summary, transactions] = await Promise.all([
      prisma.transaction.aggregate({ where, _sum: { amount: true, taxAmount: true }, _count: true }),
      prisma.transaction.findMany({
        where,
        select: { id: true, amount: true, taxAmount: true, createdAt: true, paymentMethod: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ])
    const total = summary._sum.amount ?? 0
    return {
      employee,
      matchedUser: user ? { id: user.id, name: user.name, email: user.email } : null,
      count: summary._count,
      total,
      tax: summary._sum.taxAmount ?? 0,
      commissionRate: employee.commissionRate,
      commissionAmount: total * (employee.commissionRate / 100),
      transactions,
    }
  }))

  return res.json({ from: from ?? null, to: to ?? null, rows })
})

router.get('/payroll', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { from, to, period } = dateRangeSchema.parse(req.query)
  const paidAt = buildDateRange(from, to)
  const payments = await prisma.payrollPayment.findMany({
    where: { businessId, ...(period ? { period } : {}), ...(paidAt ? { paidAt } : {}) },
    include: { employee: true },
    orderBy: { paidAt: 'desc' },
    take: 500,
  })
  return res.json(payments)
})

router.post('/:id/payroll', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const data = z.object({
      period: z.string().min(4),
      baseSalary: z.coerce.number().min(0),
      commissionAmount: z.coerce.number().min(0).optional().default(0),
      bonusAmount: z.coerce.number().min(0).optional().default(0),
      deductions: z.coerce.number().min(0).optional().default(0),
      paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER']).optional().default('CASH'),
      notes: z.string().optional(),
    }).parse(req.body)

    const employee = await prisma.employee.findFirst({ where: { id, businessId } })
    if (!employee) return res.status(404).json({ error: 'Empleado no encontrado' })

    const totalAmount = Math.max(0, data.baseSalary + data.commissionAmount + data.bonusAmount - data.deductions)
    const result = await prisma.$transaction(async tx => {
      const transaction = await tx.transaction.create({
        data: {
          type: 'EXPENSE',
          amount: totalAmount,
          description: `Pago de nómina ${data.period} - ${employee.name}`,
          paymentMethod: data.paymentMethod,
          status: 'COMPLETED',
          businessId,
          createdById: req.userId || null,
        },
      })
      const payment = await tx.payrollPayment.create({
        data: {
          employeeId: id,
          businessId,
          transactionId: transaction.id,
          period: data.period,
          baseSalary: data.baseSalary,
          commissionAmount: data.commissionAmount,
          bonusAmount: data.bonusAmount,
          deductions: data.deductions,
          totalAmount,
          notes: data.notes,
        },
        include: { employee: true },
      })
      return { payment, transaction }
    })

    logAudit(req, businessId, 'CREATE', 'PAYROLL_PAYMENT', result.payment.id, { employeeId: id, totalAmount })
    return res.status(201).json(result)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    console.error('[employees] payroll error', e)
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/attendance', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { from, to } = dateRangeSchema.parse(req.query)
  const date = buildDateRange(from, to)
  const records = await prisma.attendanceRecord.findMany({
    where: { businessId, ...(date ? { date } : {}) },
    include: { employee: true },
    orderBy: [{ date: 'desc' }, { checkIn: 'desc' }],
    take: 500,
  })
  return res.json(records.map(r => ({
    ...r,
    hours: r.checkOut ? Math.max(0, (r.checkOut.getTime() - r.checkIn.getTime()) / 36e5) : null,
  })))
})

router.post('/:id/attendance/check-in', async (req: AuthRequest, res) => {
  try {
    const { businessId, id } = req.params
    if (!await verifyBusiness(businessId, req.userId!))
      return res.status(403).json({ error: 'Acceso denegado' })

    const { notes } = z.object({ notes: z.string().optional() }).parse(req.body)
    const employee = await prisma.employee.findFirst({ where: { id, businessId } })
    if (!employee) return res.status(404).json({ error: 'Empleado no encontrado' })

    const now = new Date()
    const open = await prisma.attendanceRecord.findFirst({ where: { employeeId: id, businessId, checkOut: null } })
    if (open) return res.status(400).json({ error: 'Este empleado ya tiene una entrada abierta' })

    const record = await prisma.attendanceRecord.create({
      data: {
        employeeId: id,
        businessId,
        date: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        checkIn: now,
        notes,
      },
      include: { employee: true },
    })
    logAudit(req, businessId, 'CREATE', 'ATTENDANCE', record.id, { employeeId: id, type: 'CHECK_IN' })
    return res.status(201).json(record)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/:id/attendance/check-out', async (req: AuthRequest, res) => {
  const { businessId, id } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const open = await prisma.attendanceRecord.findFirst({
    where: { employeeId: id, businessId, checkOut: null },
    orderBy: { checkIn: 'desc' },
  })
  if (!open) return res.status(404).json({ error: 'No hay una entrada abierta para este empleado' })

  const record = await prisma.attendanceRecord.update({
    where: { id: open.id },
    data: { checkOut: new Date() },
    include: { employee: true },
  })
  logAudit(req, businessId, 'UPDATE', 'ATTENDANCE', record.id, { employeeId: id, type: 'CHECK_OUT' })
  return res.json({ ...record, hours: Math.max(0, (record.checkOut!.getTime() - record.checkIn.getTime()) / 36e5) })
})

export default router
