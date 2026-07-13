import { logger } from './logger'
import { prisma } from './prisma'

type SyncEntity = 'product' | 'client' | 'supplier' | 'employee' | 'transaction'
type SyncOperation = 'UPSERT' | 'DELETE'
type ConflictPolicy = 'LAST_WRITE_WINS' | 'APPEND_ONLY'

type RecordSyncChangeInput = {
  businessId: string
  entity: SyncEntity
  entityId: string
  operation: SyncOperation
  payload?: Record<string, unknown>
  deviceId?: string | null
  version?: number
  conflictPolicy?: ConflictPolicy
}

export async function recordSyncChange(input: RecordSyncChangeInput) {
  if (process.env.VENDIX_SYNC_OUTBOX === 'false') return null

  try {
    return await prisma.syncChange.create({
      data: {
        businessId: input.businessId,
        deviceId: input.deviceId ?? null,
        entity: input.entity,
        entityId: input.entityId,
        operation: input.operation,
        payload: JSON.stringify(input.payload ?? {}),
        version: input.version ?? 1,
        conflictPolicy: input.conflictPolicy ?? 'LAST_WRITE_WINS',
        appliedAt: new Date(),
        syncStatus: 'PENDING',
      },
    })
  } catch (error) {
    logger.warn({ err: error, entity: input.entity, entityId: input.entityId }, '[sync] outbox record failed')
    return null
  }
}
