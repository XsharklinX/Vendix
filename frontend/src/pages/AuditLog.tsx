import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { formatDate } from '@/lib/utils'
import { Shield, User, ShoppingCart, Package, Users, Settings, ChevronDown, ChevronUp } from 'lucide-react'

interface AuditEntry {
  id: string
  action: string
  entity: string
  entityId?: string
  metadata?: Record<string, unknown>
  ip?: string
  createdAt: string
  user: { id: string; name: string; role: string }
}

const ENTITY_ICONS: Record<string, React.ElementType> = {
  TRANSACTION: ShoppingCart,
  PRODUCT: Package,
  CLIENT: Users,
  BUSINESS: Settings,
  AUTH: Shield,
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN: 'bg-purple-100 text-purple-700',
  LOGOUT: 'bg-gray-100 text-gray-600',
  IMPORT: 'bg-amber-100 text-amber-700',
}

export function AuditLog() {
  const { business } = useAuthStore()
  const bid = business!.id
  const [expanded, setExpanded] = useState<string | null>(null)
  const [entityFilter, setEntityFilter] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 30

  const { data } = useQuery<{ logs: AuditEntry[]; total: number }>({
    queryKey: ['audit', bid, entityFilter, page],
    queryFn: () => api.get(`/businesses/${bid}/audit`, {
      params: {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        ...(entityFilter ? { entity: entityFilter } : {}),
      },
    }).then(r => r.data),
    placeholderData: (prev) => prev,
  })

  const logs: AuditEntry[] = data?.logs ?? []
  const total: number = data?.total ?? 0

  return (
    <div className="animate-fade-in">
      <div className="page-header bg-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
            <Shield size={18} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Log de Auditoría</h1>
            <p className="text-xs text-gray-400">Registro de todas las acciones en tu negocio</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={entityFilter}
            onChange={e => { setEntityFilter(e.target.value); setPage(0) }}
            className="input text-sm w-40"
          >
            <option value="">Todas las acciones</option>
            {['TRANSACTION', 'PRODUCT', 'CLIENT', 'BUSINESS', 'AUTH'].map(e => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-6">
        {logs.length === 0 ? (
          <div className="card p-12 text-center">
            <Shield size={36} className="mx-auto mb-3 text-gray-200" />
            <p className="text-gray-400 text-sm">No hay registros de auditoría</p>
            <p className="text-gray-300 text-xs mt-1">Las acciones aparecerán aquí automáticamente</p>
          </div>
        ) : (
          <div className="card overflow-hidden divide-y divide-gray-50">
            {logs.map(log => {
              const Icon = ENTITY_ICONS[log.entity] || User
              const isOpen = expanded === log.id
              const actionColor = ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'

              return (
                <div key={log.id}>
                  <div
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50 cursor-pointer transition-colors"
                    onClick={() => setExpanded(isOpen ? null : log.id)}
                  >
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon size={14} className="text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${actionColor}`}>
                          {log.action}
                        </span>
                        <span className="text-sm text-gray-500">{log.entity}</span>
                        {log.entityId && (
                          <span className="text-xs text-gray-400 font-mono truncate max-w-[120px]">#{log.entityId.slice(-6)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-600 font-medium">{log.user.name}</span>
                        <span className="text-[10px] text-gray-400">{log.user.role}</span>
                        {log.ip && <span className="text-[10px] text-gray-300">{log.ip}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">{formatDate(log.createdAt, 'dd/MM HH:mm')}</span>
                      {log.metadata && (
                        isOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />
                      )}
                    </div>
                  </div>

                  {isOpen && log.metadata && (
                    <div className="px-5 pb-3 bg-gray-50/50">
                      <pre className="text-xs text-gray-600 bg-gray-100 rounded-lg p-3 overflow-x-auto">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-gray-400">{total} registros en total</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary text-sm px-3 py-1.5"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-500 flex items-center px-2">
                {page + 1} / {Math.ceil(total / PAGE_SIZE)}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= total}
                className="btn-secondary text-sm px-3 py-1.5"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
