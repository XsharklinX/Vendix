import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { verifyBusiness } from '../lib/verifyBusiness'

const router = Router({ mergeParams: true })
router.use(authMiddleware)

router.get('/summary', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { from, to } = req.query

  const dateFilter: Record<string, unknown> = {}
  if (from || to) {
    dateFilter.createdAt = {}
    if (from) (dateFilter.createdAt as Record<string, unknown>).gte = new Date(from as string)
    if (to) {
      const toDate = new Date(to as string)
      toDate.setHours(23, 59, 59, 999)
      ;(dateFilter.createdAt as Record<string, unknown>).lte = toDate
    }
  }

  const [sales, expenses, purchases, products, clients, suppliers] = await Promise.all([
    prisma.transaction.aggregate({
      where: { businessId, type: 'SALE', status: 'COMPLETED', ...dateFilter },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: { businessId, type: 'EXPENSE', status: 'COMPLETED', ...dateFilter },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: { businessId, type: 'PURCHASE', status: 'COMPLETED', ...dateFilter },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.product.count({ where: { businessId } }),
    prisma.client.count({ where: { businessId } }),
    prisma.supplier.count({ where: { businessId } }),
  ])

  const totalSales = sales._sum.amount ?? 0
  const totalExpenses = (expenses._sum.amount ?? 0) + (purchases._sum.amount ?? 0)

  // Calcular costo de ventas para ganancia real
  const salesItems = await prisma.transactionItem.findMany({
    where: {
      transaction: {
        businessId,
        type: 'SALE',
        status: 'COMPLETED',
        ...dateFilter,
      },
    },
  })
  const costOfSales = salesItems.reduce((sum, i) => sum + i.cost * i.quantity, 0)
  const grossProfit = totalSales - costOfSales
  const netProfit = grossProfit - (expenses._sum.amount ?? 0)

  return res.json({
    totalSales,
    totalExpenses: expenses._sum.amount ?? 0,
    totalPurchases: purchases._sum.amount ?? 0,
    grossProfit,
    netProfit,
    salesCount: sales._count,
    expensesCount: expenses._count,
    productsCount: products,
    clientsCount: clients,
    suppliersCount: suppliers,
  })
})

router.get('/chart', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { days = '30' } = req.query
  const daysNum = Math.max(parseInt(days as string, 10) || 30, 1)
  const from = new Date()
  from.setDate(from.getDate() - daysNum)
  from.setHours(0, 0, 0, 0)

  const transactions = await prisma.transaction.findMany({
    where: {
      businessId,
      status: 'COMPLETED',
      type: { in: ['SALE', 'EXPENSE'] },
      createdAt: { gte: from },
    },
    select: { type: true, amount: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  // Agrupar por día
  const byDay = new Map<string, { sales: number; expenses: number }>()

  for (let i = 0; i <= daysNum; i++) {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().split('T')[0]
    byDay.set(key, { sales: 0, expenses: 0 })
  }

  for (const tx of transactions) {
    const key = tx.createdAt.toISOString().split('T')[0]
    const day = byDay.get(key)
    if (day) {
      if (tx.type === 'SALE') day.sales += tx.amount
      else day.expenses += tx.amount
    }
  }

  const chart = Array.from(byDay.entries()).map(([date, values]) => ({
    date,
    ventas: values.sales,
    gastos: values.expenses,
  }))

  return res.json(chart)
})

router.get('/yesterday', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const from = new Date(yesterday); from.setHours(0, 0, 0, 0)
  const to = new Date(yesterday); to.setHours(23, 59, 59, 999)

  const sales = await prisma.transaction.aggregate({
    where: { businessId, type: 'SALE', status: 'COMPLETED', createdAt: { gte: from, lte: to } },
    _sum: { amount: true },
    _count: true,
  })
  return res.json({ totalSales: sales._sum.amount ?? 0, salesCount: sales._count })
})

router.get('/by-hour', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { days = '30' } = req.query
  const from = new Date()
  from.setDate(from.getDate() - (Math.max(parseInt(days as string, 10) || 30, 1)))
  from.setHours(0, 0, 0, 0)

  const transactions = await prisma.transaction.findMany({
    where: { businessId, type: 'SALE', status: 'COMPLETED', createdAt: { gte: from } },
    select: { amount: true, createdAt: true },
  })

  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, total: 0, count: 0 }))
  for (const tx of transactions) {
    const h = tx.createdAt.getHours()
    byHour[h].total += tx.amount
    byHour[h].count++
  }
  return res.json(byHour)
})

router.get('/top-products', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { from, to } = req.query
  const dateFilter: Record<string, unknown> = {}
  if (from) dateFilter.gte = new Date(from as string)
  if (to) {
    const d = new Date(to as string)
    d.setHours(23, 59, 59, 999)
    dateFilter.lte = d
  }

  const items = await prisma.transactionItem.groupBy({
    by: ['name', 'productId'],
    where: {
      transaction: {
        businessId,
        type: 'SALE',
        status: 'COMPLETED',
        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
      },
    },
    _sum: { quantity: true, price: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 10,
  })

  return res.json(items.map(i => ({
    name: i.name,
    productId: i.productId,
    totalQty: i._sum.quantity ?? 0,
    totalRevenue: (i._sum.price ?? 0),
  })))
})

// ── Ticket promedio por día de la semana ─────────────────────────────────────

router.get('/avg-ticket-by-weekday', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { from, to } = req.query
  const dateFilter: Record<string, unknown> = {}
  if (from || to) {
    dateFilter.createdAt = {}
    if (from) (dateFilter.createdAt as Record<string, unknown>).gte = new Date(from as string)
    if (to) {
      const toDate = new Date(to as string)
      toDate.setHours(23, 59, 59, 999)
      ;(dateFilter.createdAt as Record<string, unknown>).lte = toDate
    }
  }

  const sales = await prisma.transaction.findMany({
    where: { businessId, type: 'SALE', status: 'COMPLETED', ...dateFilter },
    select: { amount: true, createdAt: true },
  })

  const labels = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const byDow = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }))
  for (const s of sales) {
    const d = byDow[s.createdAt.getDay()]
    d.total += s.amount
    d.count++
  }

  return res.json(byDow.map((d, i) => ({
    day: labels[i],
    avgTicket: d.count > 0 ? d.total / d.count : 0,
    count: d.count,
  })))
})

// ── Productos más devueltos ──────────────────────────────────────────────────

router.get('/top-returns', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { from, to } = req.query
  const dateFilter: Record<string, unknown> = {}
  if (from || to) {
    dateFilter.createdAt = {}
    if (from) (dateFilter.createdAt as Record<string, unknown>).gte = new Date(from as string)
    if (to) {
      const toDate = new Date(to as string)
      toDate.setHours(23, 59, 59, 999)
      ;(dateFilter.createdAt as Record<string, unknown>).lte = toDate
    }
  }

  const items = await prisma.transactionItem.groupBy({
    by: ['name', 'productId'],
    where: { transaction: { businessId, type: 'RETURN', ...dateFilter } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 10,
  })

  return res.json(items.map(i => ({
    name: i.name,
    productId: i.productId,
    totalQty: i._sum.quantity ?? 0,
  })))
})

// ── Clientes nuevos vs recurrentes ───────────────────────────────────────────

router.get('/customer-retention', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { from, to } = req.query
  const dateFilter: Record<string, unknown> = {}
  if (from || to) {
    dateFilter.createdAt = {}
    if (from) (dateFilter.createdAt as Record<string, unknown>).gte = new Date(from as string)
    if (to) {
      const toDate = new Date(to as string)
      toDate.setHours(23, 59, 59, 999)
      ;(dateFilter.createdAt as Record<string, unknown>).lte = toDate
    }
  }

  const salesInPeriod = await prisma.transaction.findMany({
    where: { businessId, type: 'SALE', status: 'COMPLETED', clientId: { not: null }, ...dateFilter },
    select: { clientId: true },
    distinct: ['clientId'],
  })
  const clientIds = salesInPeriod.map(s => s.clientId!).filter(Boolean)

  if (clientIds.length === 0) {
    return res.json({ newClients: 0, returningClients: 0, total: 0 })
  }

  const firstSales = await prisma.transaction.groupBy({
    by: ['clientId'],
    where: { businessId, type: 'SALE', status: 'COMPLETED', clientId: { in: clientIds } },
    _min: { createdAt: true },
  })

  const periodFrom = from ? new Date(from as string) : null
  let newClients = 0
  let returningClients = 0
  for (const f of firstSales) {
    const firstDate = f._min.createdAt
    if (periodFrom && firstDate && firstDate >= periodFrom) newClients++
    else returningClients++
  }

  return res.json({ newClients, returningClients, total: clientIds.length })
})

// ── Margen por categoría ─────────────────────────────────────────────────────

router.get('/margin-by-category', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { days = '30' } = req.query
  const from = new Date()
  from.setDate(from.getDate() - (Math.max(parseInt(days as string, 10) || 30, 1)))
  from.setHours(0, 0, 0, 0)

  const items = await prisma.transactionItem.findMany({
    where: {
      transaction: { businessId, type: 'SALE', status: 'COMPLETED', createdAt: { gte: from } },
      productId: { not: null },
    },
    select: { price: true, cost: true, quantity: true, product: { select: { category: { select: { name: true } } } } },
  })

  const byCategory = new Map<string, { revenue: number; cost: number; units: number }>()

  for (const item of items) {
    const cat = item.product?.category?.name ?? 'Sin categoría'
    const existing = byCategory.get(cat) ?? { revenue: 0, cost: 0, units: 0 }
    existing.revenue += item.price * item.quantity
    existing.cost += item.cost * item.quantity
    existing.units += item.quantity
    byCategory.set(cat, existing)
  }

  const result = Array.from(byCategory.entries())
    .map(([category, data]) => ({
      category,
      revenue: data.revenue,
      cost: data.cost,
      grossProfit: data.revenue - data.cost,
      margin: data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue) * 100 : 0,
      units: data.units,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  return res.json(result)
})

// ── Productos con margen negativo o bajo ─────────────────────────────────────

router.get('/loss-products', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const products = await prisma.product.findMany({
    where: { businessId, cost: { gt: 0 } },
    select: { id: true, name: true, price: true, cost: true, quantity: true, category: { select: { name: true } } },
  })

  const loss = products
    .filter(p => p.cost > 0)
    .map(p => ({
      id: p.id,
      name: p.name,
      price: p.price,
      cost: p.cost,
      margin: p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : -100,
      category: p.category?.name ?? 'Sin categoría',
      stock: p.quantity,
    }))
    .filter(p => p.margin < 10)
    .sort((a, b) => a.margin - b.margin)

  return res.json(loss)
})

// ── Días sin ventas en el período ────────────────────────────────────────────

router.get('/sales-gaps', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { days = '30' } = req.query
  const daysNum = Math.max(parseInt(days as string, 10) || 30, 1)
  const from = new Date()
  from.setDate(from.getDate() - daysNum)
  from.setHours(0, 0, 0, 0)

  const transactions = await prisma.transaction.findMany({
    where: { businessId, type: 'SALE', status: 'COMPLETED', createdAt: { gte: from } },
    select: { createdAt: true },
  })

  const salesDays = new Set(transactions.map(t => t.createdAt.toISOString().split('T')[0]))

  const gaps: string[] = []
  for (let i = 0; i < daysNum; i++) {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().split('T')[0]
    if (!salesDays.has(key)) gaps.push(key)
  }

  return res.json({ totalDays: daysNum, daysWithSales: salesDays.size, daysWithoutSales: gaps.length, gaps })
})

// ── Consolidated dashboard endpoint ─────────────────────────────────────────

router.get('/dashboard', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const yesterdayEnd = new Date(todayStart); yesterdayEnd.setMilliseconds(-1)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [today, yesterday, month, topProducts] = await Promise.all([
    prisma.transaction.aggregate({
      where: { businessId, type: 'SALE', status: 'COMPLETED', createdAt: { gte: todayStart } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.transaction.aggregate({
      where: { businessId, type: 'SALE', status: 'COMPLETED', createdAt: { gte: yesterdayStart, lte: yesterdayEnd } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.transaction.aggregate({
      where: { businessId, type: 'SALE', status: 'COMPLETED', createdAt: { gte: monthStart } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.transactionItem.groupBy({
      by: ['name'],
      where: { transaction: { businessId, type: 'SALE', status: 'COMPLETED', createdAt: { gte: monthStart } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    }),
  ])

  return res.json({
    today: { totalSales: today._sum.amount ?? 0, salesCount: today._count },
    yesterday: { totalSales: yesterday._sum.amount ?? 0, salesCount: yesterday._count },
    month: { totalSales: month._sum.amount ?? 0, salesCount: month._count },
    topProducts: topProducts.map(p => ({ name: p.name, totalQty: p._sum.quantity ?? 0 })),
  })
})

// ── Cierre Z (end-of-day report) ─────────────────────────────────────────────

router.get('/cierre-z', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { date } = req.query
  const target = date ? new Date(date as string) : new Date()
  const from = new Date(target); from.setHours(0, 0, 0, 0)
  const to = new Date(target); to.setHours(23, 59, 59, 999)

  const [transactions, cashSession] = await Promise.all([
    prisma.transaction.findMany({
      where: { businessId, createdAt: { gte: from, lte: to } },
      include: {
        items: true,
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.cashSession.findFirst({
      where: { businessId, openedAt: { gte: from, lte: to } },
      orderBy: { openedAt: 'desc' },
    }),
  ])

  const sales = transactions.filter(t => t.type === 'SALE' && t.status === 'COMPLETED')
  const returns = transactions.filter(t => t.type === 'RETURN')
  const expenses = transactions.filter(t => (t.type === 'EXPENSE' || t.type === 'PURCHASE') && t.status === 'COMPLETED')

  const totalSales = sales.reduce((s, t) => s + t.amount, 0)
  const totalReturns = returns.reduce((s, t) => s + t.amount, 0)
  const totalExpenses = expenses.reduce((s, t) => s + t.amount, 0)
  const totalTax = sales.reduce((s, t) => s + (t.taxAmount || 0), 0)

  const byPaymentMethod = ['CASH', 'CARD', 'TRANSFER'].reduce((acc, method) => {
    const methodSales = sales.filter(t => t.paymentMethod === method)
    acc[method] = {
      count: methodSales.length,
      total: methodSales.reduce((s, t) => s + t.amount, 0),
    }
    return acc
  }, {} as Record<string, { count: number; total: number }>)

  const cashSalesTotal = byPaymentMethod['CASH']?.total ?? 0
  const expectedCash = (cashSession?.openAmount ?? 0) + cashSalesTotal - totalExpenses

  return res.json({
    date: from.toISOString().split('T')[0],
    totalSales,
    totalReturns,
    totalExpenses,
    totalTax,
    netSales: totalSales - totalReturns,
    profit: totalSales - totalReturns - totalExpenses,
    salesCount: sales.length,
    byPaymentMethod,
    cashSession: cashSession ? {
      openAmount: cashSession.openAmount,
      closeAmount: cashSession.closeAmount,
      expectedCash,
      difference: cashSession.closeAmount != null ? cashSession.closeAmount - expectedCash : null,
      status: cashSession.status,
    } : null,
    transactions,
  })
})

// ── Reporte 606 (compras — DGII) ──────────────────────────────────────────────

router.get('/606', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { month } = req.query
  const target = month ? new Date((month as string) + '-01') : new Date()
  const from = new Date(target.getFullYear(), target.getMonth(), 1)
  const to = new Date(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59, 999)

  const transactions = await prisma.transaction.findMany({
    where: {
      businessId,
      type: { in: ['PURCHASE', 'EXPENSE'] },
      status: 'COMPLETED',
      createdAt: { gte: from, lte: to },
    },
    include: { supplier: { select: { name: true, document: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const rows = transactions.map(t => ({
    fecha: t.createdAt.toISOString().split('T')[0],
    rnc_cedula: t.supplier?.document ?? '',
    razon_social: t.supplier?.name ?? t.description ?? 'Gastos generales',
    tipo_bienes: t.type === 'PURCHASE' ? '01' : '02',
    ncf: t.ncfNumber ?? '',
    monto_facturado: t.amount,
    itbis_facturado: t.taxAmount ?? 0,
  }))

  const totals = {
    monto: rows.reduce((s, r) => s + r.monto_facturado, 0),
    itbis: rows.reduce((s, r) => s + r.itbis_facturado, 0),
    count: rows.length,
  }

  return res.json({ month: from.toISOString().slice(0, 7), rows, totals })
})

// ── Reporte 607 (ventas — DGII) ───────────────────────────────────────────────

router.get('/607', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { month } = req.query
  const target = month ? new Date((month as string) + '-01') : new Date()
  const from = new Date(target.getFullYear(), target.getMonth(), 1)
  const to = new Date(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59, 999)

  const transactions = await prisma.transaction.findMany({
    where: {
      businessId,
      type: 'SALE',
      status: 'COMPLETED',
      createdAt: { gte: from, lte: to },
    },
    include: { client: { select: { name: true, document: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const rows = transactions.map(t => ({
    fecha: t.createdAt.toISOString().split('T')[0],
    ncf: t.ncfNumber ?? '',
    rnc_cedula: t.client?.document ?? '',
    razon_social: t.client?.name ?? 'Consumidor final',
    tipo_ingreso: '01',
    monto_facturado: t.amount,
    itbis_facturado: t.taxAmount ?? 0,
    monto_sin_impuesto: t.amount - (t.taxAmount ?? 0),
  }))

  const totals = {
    monto: rows.reduce((s, r) => s + r.monto_facturado, 0),
    itbis: rows.reduce((s, r) => s + r.itbis_facturado, 0),
    count: rows.length,
  }

  return res.json({ month: from.toISOString().slice(0, 7), rows, totals })
})

// ── Ventas por empleado/cajero ────────────────────────────────────────────────

router.get('/by-employee', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { from, to } = req.query
  const dateFilter: Record<string, unknown> = {}
  if (from) dateFilter.gte = new Date(from as string)
  if (to) {
    const d = new Date(to as string); d.setHours(23, 59, 59, 999)
    dateFilter.lte = d
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      businessId,
      type: 'SALE',
      status: 'COMPLETED',
      ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
    },
    select: {
      amount: true, taxAmount: true, discountValue: true,
      paymentMethod: true, createdAt: true,
      createdBy: { select: { id: true, name: true, role: true } },
    },
  })

  const byEmployee = new Map<string, {
    userId: string; name: string; role: string
    count: number; total: number; tax: number
    byMethod: Record<string, number>
  }>()

  for (const t of transactions) {
    const key = t.createdBy?.id ?? 'unknown'
    const label = t.createdBy?.name ?? 'Sin asignar'
    const role = t.createdBy?.role ?? 'UNKNOWN'
    const existing = byEmployee.get(key) ?? { userId: key, name: label, role, count: 0, total: 0, tax: 0, byMethod: {} }
    existing.count++
    existing.total += t.amount
    existing.tax += t.taxAmount ?? 0
    existing.byMethod[t.paymentMethod] = (existing.byMethod[t.paymentMethod] ?? 0) + t.amount
    byEmployee.set(key, existing)
  }

  const result = Array.from(byEmployee.values()).sort((a, b) => b.total - a.total)

  return res.json({
    from: from ?? null,
    to: to ?? null,
    employees: result,
    totals: {
      count: result.reduce((s, e) => s + e.count, 0),
      total: result.reduce((s, e) => s + e.total, 0),
    },
  })
})

router.get('/profitability', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { from, to, groupBy = 'product' } = req.query
  const createdAt: Record<string, unknown> = {}
  if (from) createdAt.gte = new Date(from as string)
  if (to) {
    const d = new Date(to as string); d.setHours(23, 59, 59, 999)
    createdAt.lte = d
  }

  const sales = await prisma.transaction.findMany({
    where: {
      businessId,
      type: 'SALE',
      status: 'COMPLETED',
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
    },
    include: {
      items: true,
      client: { select: { id: true, name: true } },
    },
  })

  if (groupBy === 'client') {
    const byClient = new Map<string, { id: string; name: string; sales: number; cost: number; profit: number; count: number }>()
    for (const sale of sales) {
      const id = sale.client?.id ?? 'sin-cliente'
      const name = sale.client?.name ?? 'Consumidor final'
      const cost = sale.items.reduce((s, item) => s + item.cost * item.quantity, 0)
      const current = byClient.get(id) ?? { id, name, sales: 0, cost: 0, profit: 0, count: 0 }
      current.sales += sale.amount
      current.cost += cost
      current.profit += sale.amount - cost
      current.count++
      byClient.set(id, current)
    }
    const rows = Array.from(byClient.values()).sort((a, b) => b.profit - a.profit)
    return res.json({
      groupBy: 'client',
      rows: rows.map(r => ({ ...r, margin: r.sales > 0 ? (r.profit / r.sales) * 100 : 0 })),
      totals: rows.reduce((acc, r) => ({
        sales: acc.sales + r.sales,
        cost: acc.cost + r.cost,
        profit: acc.profit + r.profit,
        count: acc.count + r.count,
      }), { sales: 0, cost: 0, profit: 0, count: 0 }),
    })
  }

  const byProduct = new Map<string, { id: string; name: string; quantity: number; sales: number; cost: number; profit: number }>()
  for (const sale of sales) {
    for (const item of sale.items) {
      const id = item.productId ?? item.name
      const current = byProduct.get(id) ?? { id, name: item.name, quantity: 0, sales: 0, cost: 0, profit: 0 }
      const revenue = item.price * item.quantity
      const cost = item.cost * item.quantity
      current.quantity += item.quantity
      current.sales += revenue
      current.cost += cost
      current.profit += revenue - cost
      byProduct.set(id, current)
    }
  }
  const rows = Array.from(byProduct.values()).sort((a, b) => b.profit - a.profit)
  return res.json({
    groupBy: 'product',
    rows: rows.map(r => ({ ...r, margin: r.sales > 0 ? (r.profit / r.sales) * 100 : 0 })),
    totals: rows.reduce((acc, r) => ({
      sales: acc.sales + r.sales,
      cost: acc.cost + r.cost,
      profit: acc.profit + r.profit,
      quantity: acc.quantity + r.quantity,
    }), { sales: 0, cost: 0, profit: 0, quantity: 0 }),
  })
})

router.get('/aging-receivables', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const pending = await prisma.transaction.findMany({
    where: { businessId, type: 'SALE', status: 'PENDING' },
    include: { client: { select: { id: true, name: true, phone: true, document: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const now = Date.now()
  const rows = pending.map(t => {
    const days = Math.max(0, Math.floor((now - t.createdAt.getTime()) / 86_400_000))
    const bucket = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+'
    return {
      id: t.id,
      clientId: t.client?.id ?? null,
      clientName: t.client?.name ?? 'Sin cliente',
      phone: t.client?.phone ?? '',
      document: t.client?.document ?? '',
      invoiceNumber: t.invoiceNumber ?? '',
      date: t.createdAt.toISOString().slice(0, 10),
      amount: t.amount,
      days,
      bucket,
    }
  })
  const buckets = ['0-30', '31-60', '61-90', '90+'].reduce((acc, bucket) => {
    const items = rows.filter(r => r.bucket === bucket)
    acc[bucket] = { count: items.length, total: items.reduce((s, r) => s + r.amount, 0) }
    return acc
  }, {} as Record<string, { count: number; total: number }>)
  return res.json({ rows, buckets, total: rows.reduce((s, r) => s + r.amount, 0), count: rows.length })
})

router.get('/fiscal-summary', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { month } = req.query
  const target = month ? new Date((month as string) + '-01') : new Date()
  const from = new Date(target.getFullYear(), target.getMonth(), 1)
  const to = new Date(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59, 999)
  const transactions = await prisma.transaction.findMany({
    where: { businessId, type: 'SALE', createdAt: { gte: from, lte: to } },
    include: { client: { select: { name: true, document: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const completed = transactions.filter(t => t.status === 'COMPLETED')
  const cancelled = transactions.filter(t => t.status === 'CANCELLED')
  const rows = transactions.map(t => ({
    date: t.createdAt.toISOString().slice(0, 10),
    status: t.status,
    invoiceNumber: t.invoiceNumber ?? '',
    ncf: t.ncfNumber ?? '',
    clientName: t.client?.name ?? 'Consumidor final',
    document: t.client?.document ?? '',
    amount: t.amount,
    taxAmount: t.taxAmount ?? 0,
    taxableAmount: t.amount - (t.taxAmount ?? 0),
  }))
  return res.json({
    month: from.toISOString().slice(0, 7),
    rows,
    totals: {
      sales: completed.reduce((s, t) => s + t.amount, 0),
      tax: completed.reduce((s, t) => s + (t.taxAmount ?? 0), 0),
      taxable: completed.reduce((s, t) => s + t.amount - (t.taxAmount ?? 0), 0),
      ncfCount: completed.filter(t => !!t.ncfNumber).length,
      invoiceCount: completed.length,
      cancelledCount: cancelled.length,
      cancelledAmount: cancelled.reduce((s, t) => s + t.amount, 0),
    },
  })
})

router.get('/daily-close-snapshots', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const snapshots = await prisma.dailyCloseSnapshot.findMany({
    where: { businessId },
    orderBy: { date: 'desc' },
    take: 60,
  })
  return res.json(snapshots)
})

// ── Posición del día: cuánto tengo, cuánto me deben, cuánto debo ──────────────
// Consolida en un solo lugar lo que hoy exige entrar a Caja + Cuentas por Cobrar
// + Proveedores por separado.
router.get('/position', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)

  const [openSession, receivable, payable] = await Promise.all([
    prisma.cashSession.findFirst({ where: { businessId, status: 'OPEN' }, orderBy: { openedAt: 'desc' } }),
    // Lo que me deben: ventas al fiado (SALE PENDING)
    prisma.transaction.aggregate({
      where: { businessId, type: 'SALE', status: 'PENDING' },
      _sum: { amount: true }, _count: true,
    }),
    // Lo que debo: compras a crédito (PURCHASE PENDING)
    prisma.transaction.aggregate({
      where: { businessId, type: 'PURCHASE', status: 'PENDING' },
      _sum: { amount: true }, _count: true,
    }),
  ])

  // Efectivo esperado en la caja abierta = apertura + ventas en efectivo del turno − gastos del turno
  let cashInDrawer: number | null = null
  if (openSession) {
    const [cashSales, sessionExpenses] = await Promise.all([
      prisma.transaction.aggregate({
        where: { businessId, cashSessionId: openSession.id, type: 'SALE', status: 'COMPLETED', paymentMethod: 'CASH' },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { businessId, cashSessionId: openSession.id, type: { in: ['EXPENSE', 'PURCHASE'] }, status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ])
    cashInDrawer = openSession.openAmount + (cashSales._sum.amount ?? 0) - (sessionExpenses._sum.amount ?? 0)
  }

  return res.json({
    cashInDrawer,                                   // null si no hay caja abierta
    cashSessionOpen: !!openSession,
    receivable: receivable._sum.amount ?? 0,        // me deben
    receivableCount: receivable._count,
    payable: payable._sum.amount ?? 0,              // debo a proveedores
    payableCount: payable._count,
    generatedAt: new Date().toISOString(),
    dayStart: dayStart.toISOString(),
  })
})

// ── Pulso del día: ¿hoy vas mejor, igual o peor que tu promedio? ──────────────
// Compara la venta de hoy contra el promedio de los días CON ventas de las últimas
// 4 semanas (excluye hoy). Devuelve un veredicto simple, no una gráfica.
router.get('/pulse', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const windowStart = new Date(todayStart); windowStart.setDate(windowStart.getDate() - 28)

  const [todayAgg, priorSales] = await Promise.all([
    prisma.transaction.aggregate({
      where: { businessId, type: 'SALE', status: 'COMPLETED', createdAt: { gte: todayStart } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.transaction.findMany({
      where: { businessId, type: 'SALE', status: 'COMPLETED', createdAt: { gte: windowStart, lt: todayStart } },
      select: { amount: true, createdAt: true },
    }),
  ])

  // Agrupar ventas previas por día para sacar el promedio de días operativos
  const byDay = new Map<string, number>()
  for (const t of priorSales) {
    const key = t.createdAt.toISOString().slice(0, 10)
    byDay.set(key, (byDay.get(key) ?? 0) + t.amount)
  }
  const activeDays = byDay.size
  const priorTotal = Array.from(byDay.values()).reduce((s, v) => s + v, 0)
  const average = activeDays > 0 ? priorTotal / activeDays : 0
  const today = todayAgg._sum.amount ?? 0

  // Veredicto con margen de ±15% para que "igual" no sea una línea imposible de tocar
  let verdict: 'above' | 'onpar' | 'below' | 'nodata' = 'nodata'
  let deltaPct: number | null = null
  if (activeDays >= 3) {
    deltaPct = average > 0 ? Math.round(((today - average) / average) * 100) : (today > 0 ? 100 : 0)
    if (deltaPct >= 15) verdict = 'above'
    else if (deltaPct <= -15) verdict = 'below'
    else verdict = 'onpar'
  }

  return res.json({
    today,
    todayCount: todayAgg._count,
    average: Math.round(average * 100) / 100,
    activeDays,
    verdict,
    deltaPct,
    generatedAt: now.toISOString(),
  })
})

export default router
