import { prisma } from './prisma'

export async function createNotification(userId: string, type: string, title: string, body: string, link?: string) {
  try {
    await prisma.notification.create({ data: { userId, type, title, body, link } })
  } catch {
    // Non-blocking — never throws
  }
}

export async function checkLowStock(businessId: string, userId: string) {
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { lowStockThreshold: true },
    })
    const defaultThreshold = business?.lowStockThreshold ?? 5

    const products = await prisma.product.findMany({
      where: { businessId },
      select: { id: true, name: true, quantity: true, lowStockThreshold: true },
    })

    const lowItems = products
      .filter(p => p.quantity > 0 && p.quantity <= (p.lowStockThreshold ?? defaultThreshold))
      .slice(0, 5)

    const outOfStock = products.filter(p => p.quantity === 0).slice(0, 3)

    if (lowItems.length > 0) {
      const names = lowItems.map(p => `${p.name} (${p.quantity})`).join(', ')
      await createNotification(
        userId,
        'LOW_STOCK',
        'Stock bajo',
        `${lowItems.length} producto(s) con stock bajo: ${names}`,
        '/inventario'
      )
    }

    if (outOfStock.length > 0) {
      const names = outOfStock.map(p => p.name).join(', ')
      await createNotification(
        userId,
        'LOW_STOCK',
        'Sin stock',
        `${outOfStock.length} producto(s) agotados: ${names}`,
        '/inventario'
      )
    }
  } catch {
    // Non-blocking
  }
}

export async function checkPendingDebts(businessId: string, userId: string) {
  try {
    const result = await prisma.transaction.aggregate({
      where: { businessId, type: 'SALE', status: 'PENDING' },
      _count: { id: true },
      _sum: { amount: true },
    })

    if ((result._count.id ?? 0) > 0) {
      await createNotification(
        userId,
        'PENDING_DEBT',
        'Deudas pendientes',
        `Tienes ${result._count.id} venta(s) al fiado por cobrar — Total: RD$${(result._sum.amount ?? 0).toFixed(2)}`,
        '/cuentas-cobrar'
      )
    }
  } catch {
    // Non-blocking
  }
}

// Cotizaciones PENDING cuyo validUntil vence dentro de los próximos 3 días.
// Evita perder ventas por simple olvido de seguimiento.
export async function checkExpiringQuotes(businessId: string, userId: string) {
  try {
    const now = new Date()
    const in3days = new Date(now); in3days.setDate(in3days.getDate() + 3); in3days.setHours(23, 59, 59, 999)

    const quotes = await prisma.quote.findMany({
      where: {
        businessId,
        status: 'PENDING',
        validUntil: { not: null, gte: now, lte: in3days },
      },
      include: { client: { select: { name: true } } },
      orderBy: { validUntil: 'asc' },
      take: 5,
    })

    if (quotes.length === 0) return

    const first = quotes[0]
    const daysLeft = Math.max(0, Math.ceil((first.validUntil!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    const who = first.client?.name ? ` para ${first.client.name}` : ''
    const detail = quotes.length === 1
      ? `La cotización #${first.number}${who} vence en ${daysLeft} día(s).`
      : `${quotes.length} cotizaciones están por vencer. La #${first.number}${who} en ${daysLeft} día(s).`

    await createNotification(userId, 'QUOTE_EXPIRING', 'Cotización por vencer', detail, '/cotizaciones')
  } catch {
    // Non-blocking
  }
}

// Caja que lleva demasiado tiempo abierta (cruzó la medianoche del día en que se
// abrió, o más de 16 horas). Para que cerrar el turno no dependa de la memoria.
export async function checkStaleCashSession(businessId: string, userId: string) {
  try {
    const session = await prisma.cashSession.findFirst({
      where: { businessId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    })
    if (!session) return

    const now = new Date()
    const hoursOpen = (now.getTime() - session.openedAt.getTime()) / (60 * 60 * 1000)
    const crossedMidnight = session.openedAt.toDateString() !== now.toDateString()

    if (hoursOpen >= 16 || crossedMidnight) {
      const openedLabel = session.openedAt.toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })
      await createNotification(
        userId,
        'CASH_SESSION',
        'Caja abierta hace tiempo',
        `La caja lleva abierta desde ${openedLabel}. Considera cerrar el turno para cuadrar el efectivo.`,
        '/caja'
      )
    }
  } catch {
    // Non-blocking
  }
}
