import { Zap, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface Props {
  open: boolean
  onClose: () => void
  message?: string
}

export function PlanLimitModal({ open, onClose, message }: Props) {
  const navigate = useNavigate()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in">
        <button onClick={onClose} className="absolute right-4 top-4 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-500">
          <X size={16} />
        </button>

        <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-200">
          <Zap size={24} className="text-white" />
        </div>

        <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100 text-center mb-2">Límite del plan gratuito</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 text-center mb-5">
          {message || 'Has alcanzado el límite de tu plan gratuito. Actualiza a Pro para continuar sin restricciones.'}
        </p>

        <div className="bg-blue-50 dark:bg-blue-950/40 rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-200 mb-2">Plan Pro incluye:</p>
          <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1.5">
            <li>✓ Productos ilimitados</li>
            <li>✓ Clientes ilimitados</li>
            <li>✓ Transacciones ilimitadas</li>
            <li>✓ Respaldos automáticos</li>
            <li>✓ Soporte prioritario</li>
          </ul>
        </div>

        <button
          onClick={() => { navigate('/configuraciones?tab=billing'); onClose() }}
          className="btn-primary w-full mb-2"
        >
          <Zap size={15} /> Ver planes Pro
        </button>
        <button onClick={onClose} className="btn-secondary w-full text-sm">
          Continuar con plan gratuito
        </button>
      </div>
    </div>
  )
}
