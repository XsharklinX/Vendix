import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'

export async function checkProductLimit(_req: AuthRequest, _res: Response, next: NextFunction) {
  next()
}

export async function checkTransactionLimit(_req: AuthRequest, _res: Response, next: NextFunction) {
  next()
}

export async function checkClientLimit(_req: AuthRequest, _res: Response, next: NextFunction) {
  next()
}

export const FREE_LIMITS = {
  products: Infinity,
  clients: Infinity,
  transactionsPerMonth: Infinity,
  businesses: Infinity,
  staff: Infinity,
}
