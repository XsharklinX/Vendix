import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export function formatCurrency(amount: number, currency = 'DOP'): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date, fmt = 'dd MMM yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, fmt, { locale: es })
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd MMM yyyy, HH:mm', { locale: es })
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export const TX_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  SALE: { label: 'Venta', color: 'text-green-700 bg-green-50' },
  EXPENSE: { label: 'Gasto', color: 'text-red-700 bg-red-50' },
  INCOME: { label: 'Ingreso', color: 'text-blue-700 bg-blue-50' },
  PURCHASE: { label: 'Compra', color: 'text-orange-700 bg-orange-50' },
}

export const QUOTE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendiente', color: 'text-yellow-700 bg-yellow-50' },
  ACCEPTED: { label: 'Aceptada', color: 'text-green-700 bg-green-50' },
  REJECTED: { label: 'Rechazada', color: 'text-red-700 bg-red-50' },
  EXPIRED: { label: 'Expirada', color: 'text-gray-600 bg-gray-100' },
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
}
