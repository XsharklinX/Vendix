import fs from 'fs'
import path from 'path'
import { logger } from './logger'
import { prisma } from './prisma'

type SyncEntity = 'product' | 'client' | 'supplier' | 'employee'
type SyncOperation = 'UPSERT' | 'DELETE'

type RemoteChange = {
  id: string
  deviceId?: string | null
  entity: SyncEntity
  entityId: string
  operation: SyncOperation
  payload: Record<string, unknown>
  version?: number
  conflictPolicy?: 'LAST_WRITE_WINS' | 'APPEND_ONLY'
  createdAt: string
}

type SyncWorkerState = {
  enabled: boolean
  running: boolean
  configured: boolean
  cloudUrl: string | null
  localBusinessId: string | null
  cloudBusinessId: string | null
  deviceId: string | null
  deviceKey: string | null
  lastRunAt: string | null
  lastPushAt: string | null
  lastPullAt: string | null
  lastPullCursor: string | null
  lastError: string | null
  lastPushedCount: number
  lastPulledCount: number
}

const state: SyncWorkerState = {
  enabled: process.env.VENDIX_SYNC_ENABLED === 'true',
  running: false,
  configured: false,
  cloudUrl: null,
  localBusinessId: null,
  cloudBusinessId: null,
  deviceId: null,
  deviceKey: null,
  lastRunAt: null,
  lastPushAt: null,
  lastPullAt: null,
  lastPullCursor: null,
  lastError: null,
  lastPushedCount: 0,
  lastPulledCount: 0,
}

let timer: NodeJS.Timeout | null = null

function getStateFilePath() {
  const baseDir = process.env.APP_USER_DATA_PATH || process.cwd()
  return path.join(baseDir, 'sync-worker-state.json')
}

function loadCursor() {
  try {
    const file = JSON.parse(fs.readFileSync(getStateFilePath(), 'utf8'))
    state.lastPullCursor = typeof file.lastPullCursor === 'string' ? file.lastPullCursor : null
    state.deviceId = typeof file.deviceId === 'string' ? file.deviceId : null
  } catch {
    // First run or no persisted state.
  }
}

function persistCursor() {
  try {
    fs.writeFileSync(getStateFilePath(), JSON.stringify({
      deviceId: state.deviceId,
      lastPullCursor: state.lastPullCursor,
      updatedAt: new Date().toISOString(),
    }, null, 2))
  } catch (error) {
    logger.warn({ err: error }, '[sync-worker] could not persist cursor')
  }
}

function requiredConfig() {
  const cloudUrl = process.env.VENDIX_CLOUD_URL?.replace(/\/+$/, '') || ''
  const token = process.env.VENDIX_CLOUD_TOKEN || ''
  const cloudBusinessId = process.env.VENDIX_SYNC_CLOUD_BUSINESS_ID || process.env.VENDIX_SYNC_BUSINESS_ID || ''
  const localBusinessId = process.env.VENDIX_SYNC_LOCAL_BUSINESS_ID || process.env.VENDIX_SYNC_BUSINESS_ID || cloudBusinessId
  const deviceKey = process.env.VENDIX_SYNC_DEVICE_KEY || `${process.env.COMPUTERNAME || 'vendix'}-${localBusinessId}`.slice(0, 160)
  const deviceName = process.env.VENDIX_SYNC_DEVICE_NAME || process.env.COMPUTERNAME || 'Vendix Desktop'

  state.cloudUrl = cloudUrl || null
  state.localBusinessId = localBusinessId || null
  state.cloudBusinessId = cloudBusinessId || null
  state.deviceKey = deviceKey || null
  state.configured = Boolean(cloudUrl && token && localBusinessId && cloudBusinessId && deviceKey)

  return { cloudUrl, token, cloudBusinessId, localBusinessId, deviceKey, deviceName }
}

async function requestJson<T>(url: string, options: RequestInit & { token: string }): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.token}`,
      ...(options.headers || {}),
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
  }

  return await res.json() as T
}

async function ensureDevice(config: ReturnType<typeof requiredConfig>) {
  if (state.deviceId) return state.deviceId

  const device = await requestJson<{ id: string }>(
    `${config.cloudUrl}/api/cloud/businesses/${config.cloudBusinessId}/sync/devices`,
    {
      method: 'POST',
      token: config.token,
      body: JSON.stringify({
        deviceKey: config.deviceKey,
        name: config.deviceName,
        platform: process.platform,
      }),
    }
  )

  state.deviceId = device.id
  persistCursor()
  return device.id
}

function parsePayload(payload: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(payload)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

async function pushPending(config: ReturnType<typeof requiredConfig>, deviceId: string) {
  const changes = await prisma.syncChange.findMany({
    where: {
      businessId: config.localBusinessId,
      syncStatus: { in: ['PENDING', 'FAILED'] },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })

  if (!changes.length) return 0

  const response = await requestJson<{ applied: string[]; rejected: Array<{ entityId: string; reason: string }> }>(
    `${config.cloudUrl}/api/cloud/businesses/${config.cloudBusinessId}/sync/push`,
    {
      method: 'POST',
      token: config.token,
      body: JSON.stringify({
        deviceId,
        changes: changes.map(change => ({
          id: change.id,
          deviceId,
          entity: change.entity,
          entityId: change.entityId,
          operation: change.operation,
          payload: parsePayload(change.payload),
          version: change.version,
          conflictPolicy: change.conflictPolicy,
        })),
      }),
    }
  )

  const now = new Date()
  const rejectedByEntityId = new Map(response.rejected.map(item => [item.entityId, item.reason]))

  await Promise.all(changes.map(change => {
    const rejected = rejectedByEntityId.get(change.entityId)
    return prisma.syncChange.update({
      where: { id: change.id },
      data: rejected
        ? { syncStatus: 'FAILED', syncError: rejected }
        : { syncStatus: 'SYNCED', syncedAt: now, syncError: null },
    })
  }))

  state.lastPushAt = now.toISOString()
  state.lastPushedCount = response.applied.length
  return response.applied.length
}

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

async function applyRemoteChange(localBusinessId: string, change: RemoteChange) {
  if (change.operation === 'DELETE') {
    if (change.entity === 'product') await prisma.product.updateMany({ where: { id: change.entityId, businessId: localBusinessId }, data: { deletedAt: new Date() } })
    if (change.entity === 'client') await prisma.client.updateMany({ where: { id: change.entityId, businessId: localBusinessId }, data: { deletedAt: new Date() } })
    if (change.entity === 'supplier') await prisma.supplier.updateMany({ where: { id: change.entityId, businessId: localBusinessId }, data: { deletedAt: new Date() } })
    if (change.entity === 'employee') await prisma.employee.updateMany({ where: { id: change.entityId, businessId: localBusinessId }, data: { deletedAt: new Date() } })
    return
  }

  const payload = change.payload

  if (change.entity === 'product') {
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
    const updated = await prisma.product.updateMany({ where: { id: change.entityId, businessId: localBusinessId }, data })
    if (updated.count === 0) await prisma.product.create({ data: { id: change.entityId, businessId: localBusinessId, ...data } })
  }

  if (change.entity === 'client') {
    const manualTags = Array.isArray(payload.manualTags)
      ? JSON.stringify(payload.manualTags.map(String).filter(Boolean))
      : typeof payload.manualTags === 'string' ? payload.manualTags : undefined
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
    const updated = await prisma.client.updateMany({ where: { id: change.entityId, businessId: localBusinessId }, data })
    if (updated.count === 0) await prisma.client.create({ data: { id: change.entityId, businessId: localBusinessId, ...data } })
  }

  if (change.entity === 'supplier') {
    const data = {
      name: cleanString(payload.name) || 'Proveedor sincronizado',
      phone: cleanString(payload.phone),
      email: cleanString(payload.email),
      document: cleanString(payload.document),
      address: cleanString(payload.address),
      deletedAt: null,
    }
    const updated = await prisma.supplier.updateMany({ where: { id: change.entityId, businessId: localBusinessId }, data })
    if (updated.count === 0) await prisma.supplier.create({ data: { id: change.entityId, businessId: localBusinessId, ...data } })
  }

  if (change.entity === 'employee') {
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
    const updated = await prisma.employee.updateMany({ where: { id: change.entityId, businessId: localBusinessId }, data })
    if (updated.count === 0) await prisma.employee.create({ data: { id: change.entityId, businessId: localBusinessId, ...data } })
  }
}

async function pullRemote(config: ReturnType<typeof requiredConfig>, deviceId: string) {
  const params = new URLSearchParams({ deviceId, limit: '100' })
  if (state.lastPullCursor) params.set('since', state.lastPullCursor)

  const response = await requestJson<{ changes: RemoteChange[]; nextCursor: string | null }>(
    `${config.cloudUrl}/api/cloud/businesses/${config.cloudBusinessId}/sync/changes?${params.toString()}`,
    { method: 'GET', token: config.token }
  )

  for (const change of response.changes) {
    await applyRemoteChange(config.localBusinessId, change)
    await prisma.syncChange.create({
      data: {
        businessId: config.localBusinessId,
        deviceId: change.deviceId ?? null,
        entity: change.entity,
        entityId: change.entityId,
        operation: change.operation,
        payload: JSON.stringify(change.payload ?? {}),
        version: change.version ?? 1,
        conflictPolicy: change.conflictPolicy ?? 'LAST_WRITE_WINS',
        appliedAt: new Date(),
        syncStatus: 'PULLED',
        syncedAt: new Date(),
        remoteChangeId: change.id,
      },
    })
  }

  state.lastPullCursor = response.nextCursor
  state.lastPullAt = new Date().toISOString()
  state.lastPulledCount = response.changes.length
  persistCursor()
  return response.changes.length
}

export async function runSyncOnce() {
  if (state.running) return state

  const config = requiredConfig()
  state.enabled = process.env.VENDIX_SYNC_ENABLED === 'true'
  if (!state.enabled || !state.configured) return state

  state.running = true
  state.lastRunAt = new Date().toISOString()
  state.lastError = null

  try {
    const deviceId = await ensureDevice(config)
    await pushPending(config, deviceId)
    await pullRemote(config, deviceId)
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : 'Error desconocido'
    logger.warn({ err: error }, '[sync-worker] sync failed')
  } finally {
    state.running = false
  }

  return state
}

export function startSyncWorker() {
  if (timer) clearInterval(timer)
  timer = null

  state.enabled = process.env.VENDIX_SYNC_ENABLED === 'true'
  requiredConfig()
  loadCursor()

  if (!state.enabled) {
    logger.info('[sync-worker] disabled')
    return
  }

  if (!state.configured) {
    logger.warn('[sync-worker] enabled but not configured')
    return
  }

  const interval = Math.max(Number(process.env.VENDIX_SYNC_INTERVAL_MS) || 60_000, 15_000)
  void runSyncOnce()
  timer = setInterval(() => void runSyncOnce(), interval)
  logger.info({ interval }, '[sync-worker] started')
}

export function stopSyncWorker() {
  if (timer) clearInterval(timer)
  timer = null
}

export function getSyncWorkerState() {
  requiredConfig()
  return state
}
