import { Response, NextFunction } from 'express'
import { prisma } from './prisma'
import { AuthRequest } from '../middleware/auth'

export const DEFAULT_CASHIER_PERMISSIONS = [
  'pos:write',
  'sales:read',
  'inventory:read',
]

export function parsePermissions(value?: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

export function serializePermissions(value?: string[] | null) {
  return value?.length ? JSON.stringify([...new Set(value)]) : null
}

export function hasPermission(role: string | undefined, permissions: string[], permission: string) {
  if (role === 'OWNER' || role === 'ADMIN') return true
  if (permissions.includes('*')) return true
  return permissions.includes(permission)
}

export function requirePermission(permission: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'Token requerido' })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, permissions: true, disabledAt: true },
    })
    if (!user || user.disabledAt) return res.status(403).json({ error: 'Usuario inactivo o sin acceso' })

    if (!hasPermission(user.role, parsePermissions(user.permissions), permission)) {
      return res.status(403).json({ error: 'Permiso insuficiente', permission })
    }

    next()
  }
}

export function requireSupportRole(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.role !== 'ADMIN' && req.role !== 'SUPPORT') {
    return res.status(403).json({ error: 'Acceso reservado para soporte' })
  }
  next()
}
