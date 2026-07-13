import { prisma } from './prisma'
import { sendEmail } from './email'
import { checkPendingDebts, checkExpiringQuotes, checkStaleCashSession } from './notifications'
import { logger } from './logger'

async function buildBackupPayload(businessId: string) {
  const [business, products, clients, suppliers, employees, transactions, quotes] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.product.findMany({ where: { businessId } }),
    prisma.client.findMany({ where: { businessId } }),
    prisma.supplier.findMany({ where: { businessId } }),
    prisma.employee.findMany({ where: { businessId } }),
    prisma.transaction.findMany({ where: { businessId }, include: { items: true }, orderBy: { createdAt: 'desc' }, take: 5000 }),
    prisma.quote.findMany({ where: { businessId }, include: { items: true } }),
  ])
  return { exportedAt: new Date().toISOString(), business, products, clients, suppliers, employees, transactions, quotes }
}

export async function runBackupScheduler() {
  try {
    const now = new Date()
    const businesses = await prisma.business.findMany({
      where: { autoBackupEnabled: true },
      include: { user: { select: { email: true, name: true } } },
    })

    for (const biz of businesses) {
      const intervalMs = (biz.autoBackupInterval ?? 7) * 24 * 60 * 60 * 1000
      const lastBackup = biz.lastBackupAt ?? new Date(0)
      if (now.getTime() - lastBackup.getTime() < intervalMs) continue

      try {
        const payload = await buildBackupPayload(biz.id)
        const json = JSON.stringify(payload, null, 2)
        const filename = `vendix-backup-${biz.name.replace(/\s+/g, '-')}-${now.toISOString().slice(0, 10)}.json`

        await sendEmail({
          to: biz.user.email,
          subject: `Respaldo automático — ${biz.name}`,
          html: `
            <p>Hola ${biz.user.name},</p>
            <p>Aquí está tu respaldo automático de <strong>${biz.name}</strong> generado el ${now.toLocaleDateString('es-DO')}.</p>
            <p>Adjunto encontrarás el archivo JSON con todos tus datos.</p>
            <p>— Vendix</p>
          `,
          attachments: [{ filename, content: Buffer.from(json) }],
        })

        await prisma.business.update({
          where: { id: biz.id },
          data: { lastBackupAt: now },
        })

        logger.info(`[Backup] Sent to ${biz.user.email} for business "${biz.name}"`)
      } catch (err) {
        logger.error({ err, businessId: biz.id }, '[Backup] Failed')
      }
    }
  } catch (err) {
    logger.error({ err }, '[Backup] Scheduler error')
  }
}

async function runDailyNotifications() {
  try {
    const businesses = await prisma.business.findMany({
      select: { id: true, userId: true },
    })
    for (const biz of businesses) {
      checkPendingDebts(biz.id, biz.userId).catch(() => {})
      checkExpiringQuotes(biz.id, biz.userId).catch(() => {})
      checkStaleCashSession(biz.id, biz.userId).catch(() => {})
    }
  } catch {
    // Non-blocking
  }
}

// Run every 6 hours
export function startBackupScheduler() {
  const SIX_HOURS = 6 * 60 * 60 * 1000
  const ONE_DAY = 24 * 60 * 60 * 1000
  runBackupScheduler()
  setInterval(runBackupScheduler, SIX_HOURS)
  setInterval(runDailyNotifications, ONE_DAY)
  logger.info('[Backup] Scheduler started (checks every 6h)')
}
