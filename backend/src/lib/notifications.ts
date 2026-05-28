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
    const threshold = business?.lowStockThreshold ?? 5

    const lowItems = await prisma.product.findMany({
      where: { businessId, quantity: { lte: threshold, gt: 0 } },
      select: { id: true, name: true, quantity: true },
      take: 5,
    })

    const outOfStock = await prisma.product.findMany({
      where: { businessId, quantity: 0 },
      select: { id: true, name: true },
      take: 3,
    })

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
