// Comparación de conflictos LAST_WRITE_WINS por timestamp real, en vez de
// aplicar ciegamente el último cambio que llega sin importar cuál es más
// reciente. Usado tanto por el servidor cloud (cloud.ts) como por el worker
// local (syncWorker.ts) para no pisar un cambio local más nuevo con uno
// remoto más viejo que llegó tarde.
export function extractIncomingUpdatedAt(payload: Record<string, unknown>): Date | null {
  const raw = payload.updatedAt
  if (typeof raw !== 'string' && !(raw instanceof Date)) return null
  const d = new Date(raw as string)
  return Number.isNaN(d.getTime()) ? null : d
}

// true si el registro local es igual o más reciente que el cambio entrante —
// en ese caso el cambio entrante debe descartarse (el local gana).
export function isLocalNewerOrEqual(localUpdatedAt: Date | null | undefined, incomingUpdatedAt: Date | null): boolean {
  if (!localUpdatedAt || !incomingUpdatedAt) return false
  return localUpdatedAt.getTime() >= incomingUpdatedAt.getTime()
}
