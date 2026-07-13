import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { Wallet, Lock, Unlock, TrendingUp, TrendingDown, Banknote, CreditCard, ArrowLeftRight, Clock, CheckCircle, AlertCircle, Download } from 'lucide-react'
import { exportCSV } from '@/lib/export'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { QueryError } from '@/components/ui/QueryError'
import { CardRowSkeleton } from '@/components/ui/Skeleton'

interface CashTx {
  amount: number
  type: string
  paymentMethod: string
}

interface CashSession {
  id: string
  openAmount: number
  closeAmount?: number
  notes?: string
  openedAt: string
  closedAt?: string
  status: string
  transactions: CashTx[]
}

function sessionSummary(session: CashSession) {
  const txs = session.transactions ?? []
  const sales = txs.filter(t => t.type === 'SALE').reduce((s, t) => s + t.amount, 0)
  const expenses = txs.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0)
  const income = txs.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0)
  const cashIn = txs.filter(t => (t.type === 'SALE' || t.type === 'INCOME') && t.paymentMethod === 'CASH').reduce((s, t) => s + t.amount, 0)
  const cashOut = txs.filter(t => t.type === 'EXPENSE' && t.paymentMethod === 'CASH').reduce((s, t) => s + t.amount, 0)
  const expectedCash = session.openAmount + cashIn - cashOut
  return { sales, expenses, income, expectedCash, count: txs.length }
}

export function Caja() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const qc = useQueryClient()

  const [openForm, setOpenForm] = useState({ amount: '', notes: '' })
  const [closeForm, setCloseForm] = useState({ amount: '', notes: '' })
  const [historyOpen, setHistoryOpen] = useState(false)
  const [detailSession, setDetailSession] = useState<CashSession | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

  const { data: current, isLoading, isError, refetch } = useQuery<CashSession | null>({
    queryKey: ['cash-session', bid],
    queryFn: () => api.get(`/businesses/${bid}/transactions/cash-session/current`).then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: history = [] } = useQuery<CashSession[]>({
    queryKey: ['cash-session-history', bid],
    queryFn: () => api.get(`/businesses/${bid}/transactions/cash-session/history`).then(r => r.data),
    enabled: historyOpen,
  })

  const openMutation = useMutation({
    mutationFn: () => api.post(`/businesses/${bid}/transactions/cash-session/open`, {
      openAmount: parseFloat(openForm.amount) || 0,
      notes: openForm.notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-session', bid] })
      setOpenForm({ amount: '', notes: '' })
      toast.success('Caja abierta correctamente')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'No se pudo abrir la caja')
    },
  })

  const closeMutation = useMutation({
    mutationFn: () => api.post(`/businesses/${bid}/transactions/cash-session/close`, {
      closeAmount: parseFloat(closeForm.amount) || 0,
      notes: closeForm.notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-session', bid] })
      qc.invalidateQueries({ queryKey: ['cash-session-history', bid] })
      setCloseForm({ amount: '', notes: '' })
      toast.success('Caja cerrada correctamente')
    },
    onError: () => toast.error('No se pudo cerrar la caja'),
  })

  const isOpen = current?.status === 'OPEN'
  const summary = current ? sessionSummary(current) : null
  const expectedClose = summary ? summary.expectedCash : 0
  const closeDiff = closeForm.amount ? parseFloat(closeForm.amount) - expectedClose : null

  if (isLoading) {
    return <div className="p-6"><div className="card overflow-hidden"><CardRowSkeleton rows={4} /></div></div>
  }
  if (isError) {
    return <div className="p-6"><QueryError onRetry={() => refetch()} /></div>
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Caja Registradora"
        subtitle={isOpen ? 'Turno abierto' : 'Sin turno activo'}
        action={
          <button onClick={() => setHistoryOpen(true)} className="btn-secondary">
            <Clock size={16} /> Historial
          </button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Estado actual */}
        <div className={`card p-6 border-2 ${isOpen ? 'border-green-200 dark:border-green-800 bg-green-50/30' : 'border-gray-200 dark:border-slate-600'}`}>
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isOpen ? 'bg-green-100 dark:bg-green-900/40' : 'bg-gray-100 dark:bg-slate-700'}`}>
              {isOpen ? <Unlock size={24} className="text-green-600 dark:text-green-400" /> : <Lock size={24} className="text-gray-500 dark:text-slate-400" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isOpen ? 'bg-green-500 animate-pulse' : 'bg-gray-400 dark:bg-slate-500'}`} />
                <span className={`font-bold text-lg ${isOpen ? 'text-green-700 dark:text-green-300' : 'text-gray-700 dark:text-slate-300'}`}>
                  {isOpen ? 'Caja Abierta' : 'Caja Cerrada'}
                </span>
              </div>
              {isOpen && current && (
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
                  Turno desde {formatDate(current.openedAt, "dd MMM 'a las' HH:mm")} · Monto inicial: {formatCurrency(current.openAmount, cur)}
                </p>
              )}
            </div>
          </div>
        </div>

        {isOpen && summary ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Resumen del turno */}
            <div className="card p-5">
              <h2 className="font-bold text-gray-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <TrendingUp size={18} className="text-blue-500 dark:text-blue-400" />
                Resumen del turno
              </h2>
              <div className="space-y-3">
                {[
                  { label: 'Ventas realizadas', value: formatCurrency(summary.sales, cur), icon: TrendingUp, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/40' },
                  { label: 'Gastos registrados', value: formatCurrency(summary.expenses, cur), icon: TrendingDown, color: 'text-red-500 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40' },
                  { label: 'Otros ingresos', value: formatCurrency(summary.income, cur), icon: Wallet, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40' },
                  { label: 'Efectivo esperado en caja', value: formatCurrency(summary.expectedCash, cur), icon: Banknote, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/40' },
                ].map(item => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-slate-800 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 ${item.bg} rounded-lg flex items-center justify-center`}>
                          <Icon size={14} className={item.color} />
                        </div>
                        <span className="text-sm text-gray-600 dark:text-slate-300">{item.label}</span>
                      </div>
                      <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
                    </div>
                  )
                })}
                <div className="pt-2 text-xs text-gray-400 dark:text-slate-500 text-center">
                  {summary.count} transacciones en este turno
                </div>
              </div>
            </div>

            {/* Cierre de caja */}
            <div className="card p-5">
              <h2 className="font-bold text-gray-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <Lock size={18} className="text-red-500 dark:text-red-400" />
                Cerrar turno
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="label">Efectivo real en caja *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={closeForm.amount}
                    onChange={e => setCloseForm(f => ({ ...f, amount: e.target.value }))}
                    className="input"
                    placeholder="0.00"
                  />
                  {closeDiff !== null && (
                    <div className={`flex items-center gap-1.5 mt-2 text-sm font-medium ${Math.abs(closeDiff) < 0.01 ? 'text-green-600 dark:text-green-400' : closeDiff > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500 dark:text-red-400'}`}>
                      {Math.abs(closeDiff) < 0.01
                        ? <><CheckCircle size={14} /> Sin diferencia</>
                        : closeDiff > 0
                        ? <><AlertCircle size={14} /> Sobrante: {formatCurrency(closeDiff, cur)}</>
                        : <><AlertCircle size={14} /> Faltante: {formatCurrency(Math.abs(closeDiff), cur)}</>
                      }
                    </div>
                  )}
                </div>
                <div>
                  <label className="label">Notas del cierre</label>
                  <textarea
                    value={closeForm.notes}
                    onChange={e => setCloseForm(f => ({ ...f, notes: e.target.value }))}
                    className="input"
                    rows={2}
                    placeholder="Observaciones opcionales..."
                  />
                </div>
                <button
                  onClick={async () => {
                    const diff = closeForm.amount ? parseFloat(closeForm.amount) - expectedClose : null
                    const diffMsg = diff !== null && Math.abs(diff) >= 0.01
                      ? ` Hay una ${diff > 0 ? 'sobrante' : 'diferencia'} de ${formatCurrency(Math.abs(diff), cur)}.`
                      : ''
                    const ok = await confirm(
                      'Cerrar turno',
                      `¿Confirmas el cierre de caja con ${formatCurrency(parseFloat(closeForm.amount) || 0, cur)} en efectivo?${diffMsg}`,
                      true
                    )
                    if (ok) closeMutation.mutate()
                  }}
                  disabled={!closeForm.amount || closeMutation.isPending}
                  className="btn-primary w-full bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700"
                >
                  <Lock size={16} />
                  {closeMutation.isPending ? 'Cerrando...' : 'Cerrar turno'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Apertura de caja */
          <div className="max-w-md mx-auto">
            <div className="card p-6">
              <h2 className="font-bold text-gray-900 dark:text-slate-100 mb-5 flex items-center gap-2">
                <Unlock size={18} className="text-green-500 dark:text-green-400" />
                Abrir nuevo turno
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="label">Monto inicial en caja *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openForm.amount}
                    onChange={e => setOpenForm(f => ({ ...f, amount: e.target.value }))}
                    className="input"
                    placeholder="0.00"
                    autoFocus
                  />
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Cuánto efectivo hay en caja al comenzar el turno</p>
                </div>
                <div>
                  <label className="label">Notas (opcional)</label>
                  <input
                    value={openForm.notes}
                    onChange={e => setOpenForm(f => ({ ...f, notes: e.target.value }))}
                    className="input"
                    placeholder="Observaciones del turno..."
                  />
                </div>
                <button
                  onClick={() => openMutation.mutate()}
                  disabled={openMutation.isPending}
                  className="btn-primary w-full"
                >
                  <Unlock size={16} />
                  {openMutation.isPending ? 'Abriendo...' : 'Abrir turno'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Métodos de pago del turno */}
        {isOpen && current && current.transactions.length > 0 && (
          <div className="card p-5">
            <h2 className="font-bold text-gray-900 dark:text-slate-100 mb-4">Desglose por método de pago</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { method: 'CASH', label: 'Efectivo', icon: Banknote, color: 'from-green-400 to-emerald-600' },
                { method: 'CARD', label: 'Tarjeta', icon: CreditCard, color: 'from-blue-400 to-blue-600' },
                { method: 'TRANSFER', label: 'Transferencia', icon: ArrowLeftRight, color: 'from-purple-400 to-violet-600' },
              ].map(({ method, label, icon: Icon, color }) => {
                const total = current.transactions
                  .filter(t => t.paymentMethod === method && (t.type === 'SALE' || t.type === 'INCOME'))
                  .reduce((s, t) => s + t.amount, 0)
                return (
                  <div key={method} className={`bg-gradient-to-br ${color} rounded-2xl p-4 text-white`}>
                    <Icon size={18} className="text-white/80 mb-2" />
                    <p className="text-white/70 text-xs">{label}</p>
                    <p className="text-white font-bold text-lg">{formatCurrency(total, cur)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal historial */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Historial de turnos" size="lg">
        {history.length > 0 && (
          <div className="mb-4">
            <button onClick={() => {
              const rows = history.map(s => {
                const sum = sessionSummary(s)
                return { apertura: formatDate(s.openedAt), cierre: s.closedAt ? formatDate(s.closedAt) : 'Abierta', montoApertura: s.openAmount, ventas: sum.sales, gastos: sum.expenses, ingresos: sum.income, esperadoCierre: sum.expectedCash, montoCierre: s.closeAmount ?? '', diferencia: s.closeAmount != null ? (s.closeAmount - sum.expectedCash).toFixed(2) : '' }
              })
              exportCSV('historial-caja', rows, [
                { key: 'apertura', label: 'Apertura' }, { key: 'cierre', label: 'Cierre' },
                { key: 'montoApertura', label: 'Monto Apertura' }, { key: 'ventas', label: 'Ventas' },
                { key: 'gastos', label: 'Gastos' }, { key: 'ingresos', label: 'Otros Ingresos' },
                { key: 'esperadoCierre', label: 'Esperado Cierre' }, { key: 'montoCierre', label: 'Monto Cierre' },
                { key: 'diferencia', label: 'Diferencia' },
              ])
              toast.success('Historial de caja exportado como CSV')
            }} className="btn-secondary text-sm"><Download size={14} /> Exportar CSV</button>
          </div>
        )}
        {history.length === 0 ? (
          <p className="text-center text-gray-400 dark:text-slate-500 py-8">No hay turnos anteriores</p>
        ) : (
          <div className="space-y-2">
            {history.map(s => {
              const sum = sessionSummary(s)
              const diff = s.closeAmount !== undefined ? s.closeAmount - sum.expectedCash : null
              return (
                <div key={s.id} className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  onClick={() => setDetailSession(s)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${s.status === 'OPEN' ? 'bg-green-500' : 'bg-gray-400 dark:bg-slate-500'}`} />
                        <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                          {formatDate(s.openedAt, "dd MMM yyyy, HH:mm")}
                        </span>
                        {s.status === 'OPEN' && <span className="badge bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs">Abierto</span>}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        Apertura: {formatCurrency(s.openAmount, cur)} · Ventas: {formatCurrency(sum.sales, cur)} · {sum.count} transacciones
                      </p>
                    </div>
                    <div className="text-right">
                      {s.closeAmount !== undefined && diff !== null && (
                        <span className={`text-sm font-bold ${Math.abs(diff) < 0.01 ? 'text-green-600 dark:text-green-400' : diff > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500 dark:text-red-400'}`}>
                          {Math.abs(diff) < 0.01 ? 'Sin diferencia' : diff > 0 ? `+${formatCurrency(diff, cur)}` : `-${formatCurrency(Math.abs(diff), cur)}`}
                        </span>
                      )}
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                        {s.closedAt ? formatDate(s.closedAt, 'HH:mm') : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      {confirmDialog}

      {/* Modal detalle turno */}
      <Modal open={!!detailSession} onClose={() => setDetailSession(null)} title="Detalle del turno" size="sm">
        {detailSession && (() => {
          const sum = sessionSummary(detailSession)
          const diff = detailSession.closeAmount !== undefined ? detailSession.closeAmount - sum.expectedCash : null
          return (
            <div className="space-y-3 text-sm">
              {[
                ['Apertura', formatDate(detailSession.openedAt, "dd MMM yyyy 'a las' HH:mm")],
                ['Cierre', detailSession.closedAt ? formatDate(detailSession.closedAt, "dd MMM yyyy 'a las' HH:mm") : '—'],
                ['Monto inicial', formatCurrency(detailSession.openAmount, cur)],
                ['Total ventas', formatCurrency(sum.sales, cur)],
                ['Total gastos', formatCurrency(sum.expenses, cur)],
                ['Efectivo esperado', formatCurrency(sum.expectedCash, cur)],
                ['Efectivo real', detailSession.closeAmount !== undefined ? formatCurrency(detailSession.closeAmount, cur) : '—'],
                ['Diferencia', diff !== null ? (Math.abs(diff) < 0.01 ? 'Sin diferencia' : `${diff > 0 ? '+' : ''}${formatCurrency(diff, cur)}`) : '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2 border-b border-gray-50 dark:border-slate-800 last:border-0">
                  <span className="text-gray-500 dark:text-slate-400">{label}</span>
                  <span className="font-semibold text-gray-900 dark:text-slate-100">{value}</span>
                </div>
              ))}
              {detailSession.notes && (
                <p className="text-gray-500 dark:text-slate-400 italic text-xs pt-1">Nota: {detailSession.notes}</p>
              )}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
