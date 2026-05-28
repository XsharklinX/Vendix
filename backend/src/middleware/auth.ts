import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../lib/jwt'

export interface AuthRequest extends Request {
  userId?: string
  email?: string
  role?: string
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' })
  }
  try {
    const token = header.slice(7)
    const payload = verifyToken(token)
    req.userId = payload.userId
    req.email = payload.email
    req.role = payload.role
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' })
  }
}
