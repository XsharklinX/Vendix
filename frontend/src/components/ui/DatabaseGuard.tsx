import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'
import { api } from '@/lib/api'

interface CheckResult {
  ok: boolean
  messages?: string[]
}

// Revisión silenciosa de la salud de la base de datos al abrir la app.
// Si todo está bien, no aparece nada. Si SQLite reporta corrupción, muestra un
// aviso discreto y no bloqueante que lleva a la reparación en Configuración.
// Corre una sola vez por sesión de app (guardado en sessionStorage).
export function DatabaseGuard() {
  const [problem, setProblem] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem('vendix_db_checked') === '1') return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/system/database/check')
        const data = res.data as CheckResult
        sessionStorage.setItem('vendix_db_checked', '1')
        if (!cancelled && data && data.ok === false) {
          const detail = (data.messages || []).filter(m => m.toLowerCase() !== 'ok')[0]
          setProblem(detail || 'La base de datos reportó una inconsistencia.')
        }
      } catch {
        // Si el endpoint no responde (ej. modo cloud sin SQLite), no molestamos.
        sessionStorage.setItem('vendix_db_checked', '1')
      }
    }, 6000)
    return () => { cancelled = true; clearTimeout(t) }
  }, [])

  if (!problem || dismissed) return null

  return (
    <div role="alert" className="fixed bottom-5 left-5 z-40 w-80 max-w-[calc(100vw-2.5rem)] animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-red-200 dark:border-red-800 dark:border-red-900/50 overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <div className="w-9 h-9 bg-red-50 dark:bg-red-950/40 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-red-500 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-xs font-bold text-red-600 dark:text-red-400 mb-1">Revisa tu base de datos</p>
            <p className="text-sm text-gray-700 dark:text-slate-200 leading-snug mb-2">
              Detectamos una posible inconsistencia. Tus datos están, pero conviene repararla antes de que afecte un reporte.
            </p>
            <Link
              to="/configuraciones?tab=sistema"
              onClick={() => setDismissed(true)}
              className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline"
            >
              Ir a reparar →
            </Link>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 flex-shrink-0"
            aria-label="Cerrar aviso"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
