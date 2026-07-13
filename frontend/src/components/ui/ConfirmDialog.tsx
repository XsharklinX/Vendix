import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar', danger = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${danger ? 'bg-red-100 dark:bg-red-900/40' : 'bg-yellow-100 dark:bg-yellow-900/40'}`}>
          <AlertTriangle size={24} className={danger ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'} />
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-2">{title}</h3>
        <p className="text-gray-500 dark:text-slate-400 text-sm mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 btn-secondary justify-center py-2.5">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-sm text-white transition-colors
              ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// Hook para usar el diálogo de confirmación fácilmente
import { useState } from 'react'

export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean
    title: string
    message: string
    danger: boolean
    resolve: ((v: boolean) => void) | null
  }>({ open: false, title: '', message: '', danger: false, resolve: null })

  const confirm = (title: string, message: string, danger = false): Promise<boolean> => {
    return new Promise(resolve => {
      setState({ open: true, title, message, danger, resolve })
    })
  }

  const handleConfirm = () => {
    state.resolve?.(true)
    setState(s => ({ ...s, open: false }))
  }

  const handleCancel = () => {
    state.resolve?.(false)
    setState(s => ({ ...s, open: false }))
  }

  const dialog = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      message={state.message}
      danger={state.danger}
      confirmLabel={state.danger ? 'Sí, eliminar' : 'Confirmar'}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )

  return { confirm, dialog }
}
