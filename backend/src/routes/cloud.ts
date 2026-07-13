import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { verifyBusiness } from '../lib/verifyBusiness'
import { extractIncomingUpdatedAt, isLocalNewerOrEqual } from '../lib/syncConflict'
import { resolveTransactionReferences } from '../lib/syncReferences'
import { logger } from '../lib/logger'

const router = Router()
router.use(authMiddleware)

const entitySchema = z.enum(['product', 'client', 'supplier', 'employee', 'transaction'])
const operationSchema = z.enum(['UPSERT', 'DELETE'])

const registerDeviceSchema = z.object({
  deviceKey: z.string().min(8).max(160),
  name: z.string().min(1).max(120),
  platform: z.string().max(80).optional(),
})

const pushChangeSchema = z.object({
  id: z.string().optional(),
  deviceId: z.string().optional(),
  entity: entitySchema,
  entityId: z.string().min(1),
  operation: operationSchema,
  payload: z.record(z.unknown()).default({}),
  version: z.coerce.number().int().min(1).optional().default(1),
  conflictPolicy: z.enum(['LAST_WRITE_WINS', 'APPEND_ONLY']).optional().default('LAST_WRITE_WINS'),
})

const pushSchema = z.object({
  deviceId: z.string().optional(),
  changes: z.array(pushChangeSchema).min(1).max(250),
})

function cleanString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function cleanNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function cleanBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

async function applySyncChange(businessId: string, change: z.infer<typeof pushChangeSchema>) {
  if (change.operation === 'DELETE') {
    if (change.entity === 'product') {
      await prisma.product.updateMany({ where: { id: change.entityId, businessId }, data: { deletedAt: new Date() } })
    }
    if (change.entity === 'client') {
      await prisma.client.updateMany({ where: { id: change.entityId, businessId }, data: { deletedAt: new Date() } })
    }
    if (change.entity === 'supplier') {
      await prisma.supplier.updateMany({ where: { id: change.entityId, businessId }, data: { deletedAt: new Date() } })
    }
    if (change.entity === 'employee') {
      await prisma.employee.updateMany({ where: { id: change.entityId, businessId }, data: { deletedAt: new Date() } })
    }
    return
  }

  const payload = change.payload

  if (change.entity === 'product') {
    const existing = await prisma.product.findFirst({ where: { id: change.entityId, businessId }, select: { updatedAt: true } })
    if (isLocalNewerOrEqual(existing?.updatedAt, extractIncomingUpdatedAt(payload))) {
      logger.info({ businessId, entity: 'product', entityId: change.entityId }, '[sync] cambio descartado: local es más reciente')
      return
    }
    const data = {
      name: cleanString(payload.name) || 'Producto sincronizado',
      description: cleanString(payload.description),
      price: cleanNumber(payload.price),
      cost: cleanNumber(payload.cost),
      quantity: Math.trunc(cleanNumber(payload.quantity)),
      barcode: cleanString(payload.barcode),
      imageUrl: cleanString(payload.imageUrl),
      taxExempt: cleanBoolean(payload.taxExempt),
      lowStockThreshold: payload.lowStockThreshold == null ? undefined : Math.trunc(cleanNumber(payload.lowStockThreshold)),
      deletedAt: null,
    }
    const updated = await prisma.product.updateMany({ where: { id: change.entityId, businessId }, data })
    if (updated.count === 0) {
      await prisma.product.create({ data: { id: change.entityId, businessId, ...data } })
    }
  }

  if (change.entity === 'client') {
    const existing = await prisma.client.findFirst({ where: { id: change.entityId, businessId }, select: { updatedAt: true } })
    if (isLocalNewerOrEqual(existing?.updatedAt, extractIncomingUpdatedAt(payload))) {
      logger.info({ businessId, entity: 'client', entityId: change.entityId }, '[sync] cambio descartado: local es más reciente')
      return
    }
    const manualTags = Array.isArray(payload.manualTags)
      ? JSON.stringify(payload.manualTags.map(String).filter(Boolean))
      : typeof payload.manualTags === 'string'
        ? payload.manualTags
        : undefined
    const data = {
      name: cleanString(payload.name) || 'Cliente sincronizado',
      phone: cleanString(payload.phone),
      email: cleanString(payload.email),
      document: cleanString(payload.document),
      address: cleanString(payload.address),
      isVip: cleanBoolean(payload.isVip),
      discountRate: cleanNumber(payload.discountRate),
      loyaltyPoints: Math.trunc(cleanNumber(payload.loyaltyPoints)),
      manualTags,
      deletedAt: null,
    }
    const updated = await prisma.client.updateMany({ where: { id: change.entityId, businessId }, data })
    if (updated.count === 0) {
      await prisma.client.create({ data: { id: change.entityId, businessId, ...data } })
    }
  }

  if (change.entity === 'supplier') {
    const existing = await prisma.supplier.findFirst({ where: { id: change.entityId, businessId }, select: { updatedAt: true } })
    if (isLocalNewerOrEqual(existing?.updatedAt, extractIncomingUpdatedAt(payload))) {
      logger.info({ businessId, entity: 'supplier', entityId: change.entityId }, '[sync] cambio descartado: local es más reciente')
      return
    }
    const data = {
      name: cleanString(payload.name) || 'Proveedor sincronizado',
      phone: cleanString(payload.phone),
      email: cleanString(payload.email),
      document: cleanString(payload.document),
      address: cleanString(payload.address),
      deletedAt: null,
    }
    const updated = await prisma.supplier.updateMany({ where: { id: change.entityId, businessId }, data })
    if (updated.count === 0) {
      await prisma.supplier.create({ data: { id: change.entityId, businessId, ...data } })
    }
  }

  if (change.entity === 'employee') {
    const existing = await prisma.employee.findFirst({ where: { id: change.entityId, businessId }, select: { updatedAt: true } })
    if (isLocalNewerOrEqual(existing?.updatedAt, extractIncomingUpdatedAt(payload))) {
      logger.info({ businessId, entity: 'employee', entityId: change.entityId }, '[sync] cambio descartado: local es más reciente')
      return
    }
    const data = {
      name: cleanString(payload.name) || 'Empleado sincronizado',
      phone: cleanString(payload.phone),
      email: cleanString(payload.email),
      role: cleanString(payload.role),
      salary: cleanNumber(payload.salary),
      commissionRate: cleanNumber(payload.commissionRate),
      active: cleanBoolean(payload.active, true),
      deletedAt: null,
    }
    const updated = await prisma.employee.updateMany({ where: { id: change.entityId, businessId }, data })
    if (updated.count === 0) {
      await prisma.employee.create({ data: { id: change.entityId, businessId, ...data } })
    }
  }

  if (change.entity === 'transaction') {
    // Append-only: si ya existe (por id), no se toca — las ventas no se editan
    // vía sync, solo se crean (anular = una transacción de reverso nueva).
    const existing = await prisma.transaction.findFirst({ where: { id: change.entityId, businessId }, select: { id: true } })
    if (existing) return

    const items = Array.isArray(payload.items) ? payload.items as Record<string, unknown>[] : []
    const refs = await resolveTransactionReferences(businessId, payload)
    await prisma.transaction.create({
      data: {
        id: change.entityId,
        businessId,
        type: cleanString(payload.type) || 'SALE',
        amount: cleanNumber(payload.amount),
        description: cleanString(payload.description),
        paymentMethod: cleanString(payload.paymentMethod) || 'CASH',
        status: cleanString(payload.status) || 'COMPLETED',
        discountValue: cleanNumber(payload.discountValue),
        discountType: cleanString(payload.discountType) || 'NONE',
        taxAmount: cleanNumber(payload.taxAmount),
        returnOfId: cleanString(payload.returnOfId),
        ncfNumber: cleanString(payload.ncfNumber),
        originalCurrency: cleanString(payload.originalCurrency),
        exchangeRate: cleanNumber(payload.exchangeRate, 1),
        originalAmount: payload.originalAmount == null ? undefined : cleanNumber(payload.originalAmount),
        invoiceNumber: cleanString(payload.invoiceNumber),
        clientId: refs.clientId,
        supplierId: refs.supplierId,
        items: {
          create: items.map(item => ({
            productId: refs.resolveProductId(cleanString(item.productId)),
            name: cleanString(item.name) || 'Producto',
            quantity: Math.trunc(cleanNumber(item.quantity)),
            price: cleanNumber(item.price),
            cost: cleanNumber(item.cost),
          })),
        },
      },
    })
  }
}

router.get('/status', (_req, res) => {
  return res.json({
    ok: true,
    mode: process.env.VENDIX_CLOUD_MODE === 'true' ? 'cloud' : 'local',
    databaseProvider: process.env.DATABASE_URL?.startsWith('postgres') ? 'postgresql' : 'sqlite',
    syncEnabled: process.env.VENDIX_SYNC_ENABLED === 'true',
    backupsEnabled: process.env.VENDIX_CLOUD_BACKUPS === 'true',
    generatedAt: new Date().toISOString(),
  })
})

router.get('/businesses/:businessId/sync-manifest', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!)) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }

  const [
    business,
    products,
    clients,
    suppliers,
    employees,
    transactions,
    quotes,
    purchaseOrders,
    auditLogs,
  ] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { id: true, name: true, updatedAt: true, lastBackupAt: true } }),
    prisma.product.aggregate({ where: { businessId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.client.aggregate({ where: { businessId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.supplier.aggregate({ where: { businessId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.employee.aggregate({ where: { businessId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.transaction.aggregate({ where: { businessId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.quote.aggregate({ where: { businessId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.purchaseOrder.aggregate({ where: { businessId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.auditLog.aggregate({ where: { businessId }, _count: { _all: true }, _max: { createdAt: true } }),
  ])

  return res.json({
    business,
    generatedAt: new Date().toISOString(),
    entities: {
      products: { count: products._count._all, updatedAt: products._max.updatedAt },
      clients: { count: clients._count._all, updatedAt: clients._max.updatedAt },
      suppliers: { count: suppliers._count._all, updatedAt: suppliers._max.updatedAt },
      employees: { count: employees._count._all, updatedAt: employees._max.updatedAt },
      transactions: { count: transactions._count._all, updatedAt: transactions._max.updatedAt },
      quotes: { count: quotes._count._all, updatedAt: quotes._max.updatedAt },
      purchaseOrders: { count: purchaseOrders._count._all, updatedAt: purchaseOrders._max.updatedAt },
      auditLogs: { count: auditLogs._count._all, updatedAt: auditLogs._max.createdAt },
    },
  })
})

router.post('/businesses/:businessId/sync/devices', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!)) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }

  const data = registerDeviceSchema.parse(req.body)
  const device = await prisma.syncDevice.upsert({
    where: { businessId_deviceKey: { businessId, deviceKey: data.deviceKey } },
    update: { name: data.name, platform: data.platform, lastSeenAt: new Date() },
    create: { businessId, deviceKey: data.deviceKey, name: data.name, platform: data.platform, lastSeenAt: new Date() },
  })

  return res.status(201).json(device)
})

router.get('/businesses/:businessId/sync/changes', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!)) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }

  const query = z.object({
    since: z.string().datetime().optional(),
    deviceId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional().default(250),
  }).parse(req.query)

  const changes = await prisma.syncChange.findMany({
    where: {
      businessId,
      createdAt: query.since ? { gt: new Date(query.since) } : undefined,
      deviceId: query.deviceId ? { not: query.deviceId } : undefined,
    },
    orderBy: { createdAt: 'asc' },
    take: query.limit,
  })

  const nextCursor = changes.at(-1)?.createdAt?.toISOString() ?? query.since ?? null
  return res.json({
    changes: changes.map(change => ({
      ...change,
      payload: JSON.parse(change.payload),
    })),
    nextCursor,
  })
})

router.get('/businesses/:businessId/sync/outbox-status', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!)) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }

  const query = z.object({
    deviceId: z.string().optional(),
  }).parse(req.query)

  const where = {
    businessId,
    ...(query.deviceId ? { deviceId: query.deviceId } : {}),
  }

  const [summary, byEntity, byOperation, lastChanges, devices] = await Promise.all([
    prisma.syncChange.aggregate({
      where,
      _count: { _all: true },
      _max: { createdAt: true, appliedAt: true },
    }),
    prisma.syncChange.groupBy({
      by: ['entity'],
      where,
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.syncChange.groupBy({
      by: ['operation'],
      where,
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.syncChange.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        deviceId: true,
        entity: true,
        entityId: true,
        operation: true,
        conflictPolicy: true,
        createdAt: true,
        appliedAt: true,
      },
    }),
    prisma.syncDevice.findMany({
      where: { businessId },
      orderBy: { lastSeenAt: 'desc' },
      take: 20,
    }),
  ])

  return res.json({
    total: summary._count._all,
    lastChangeAt: summary._max.createdAt,
    lastAppliedAt: summary._max.appliedAt,
    byEntity: byEntity.map(row => ({ entity: row.entity, count: row._count._all, lastChangeAt: row._max.createdAt })),
    byOperation: byOperation.map(row => ({ operation: row.operation, count: row._count._all, lastChangeAt: row._max.createdAt })),
    lastChanges,
    devices,
  })
})

router.post('/businesses/:businessId/sync/push', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!)) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }

  const data = pushSchema.parse(req.body)
  if (data.deviceId) {
    await prisma.syncDevice.updateMany({
      where: { id: data.deviceId, businessId },
      data: { lastSeenAt: new Date() },
    })
  }

  const applied: string[] = []
  const rejected: Array<{ entity: string; entityId: string; reason: string }> = []

  for (const change of data.changes) {
    try {
      await applySyncChange(businessId, change)
      const created = await prisma.syncChange.create({
        data: {
          businessId,
          deviceId: change.deviceId ?? data.deviceId,
          entity: change.entity,
          entityId: change.entityId,
          operation: change.operation,
          payload: JSON.stringify(change.payload),
          version: change.version,
          conflictPolicy: change.conflictPolicy,
          appliedAt: new Date(),
          syncStatus: 'SYNCED',
          syncedAt: new Date(),
        },
      })
      applied.push(created.id)
    } catch (error) {
      rejected.push({
        entity: change.entity,
        entityId: change.entityId,
        reason: error instanceof Error ? error.message : 'No se pudo aplicar el cambio',
      })
    }
  }

  return res.json({
    ok: rejected.length === 0,
    applied,
    rejected,
    syncedAt: new Date().toISOString(),
  })
})

export default router
