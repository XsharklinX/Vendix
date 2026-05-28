import { prisma } from './prisma'
import { Request } from 'express'
import { AuthRequest } from '../middleware/auth'

export async function logAudit(
  req: AuthRequest | Request,
  businessId: string,
  action: string,
  entity: string,
  entityId?: string,
  metadata?: object
) {
  const userId = (req as AuthRequest).userId
  if (!userId) return
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        businessId,
        action,
        entity,
        entityId: entityId ?? null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ip: req.ip ?? null,
      },
    })
  } catch {
    // Non-blocking — audit failures must never break normal operations
  }
}
