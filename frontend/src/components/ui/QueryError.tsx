import { AlertTriangle, RefreshCw } from 'lucide-react'

interface QueryErrorProps {
  message?: string
  onRetry?: () => void
  retrying?: boolean
}

export function QueryError({
  message = 'No se pudo cargar la información. Verifica tu conexión e intenta de nuevo.',
  onRetry,
  retrying,
}: QueryErrorProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 bg-amber-50 dark:bg-amber-950/40 rounded-full flex items-center justify-center mb-4">
        <AlertTriangle size={24} className="text-amber-400 dark:text-amber-300" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-1">Error de carga</h3>
      <p className="text-sm text-gray-500 dark:text-slate-400 max-w-xs mb-4">{message}</p>
      {onRetry && (
        <button onClick={onRetry} disabled={retrying} className="btn-primary gap-2">
          <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} />
          {retrying ? 'Reintentando...' : 'Reintentar'}
        </button>
      )}
    </div>
  )
}
