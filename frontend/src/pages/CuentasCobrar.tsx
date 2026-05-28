import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { CreditCard, Phone, CheckCircle, AlertCircle, Users, DollarSign, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { differenceInCalendarDays } from 'date-fns'

interface PendingTx {
  id: string
  amount: number
  description?: string
  createdAt: string
  paymentMethod: string
}

interface ClientWithDebt {
  id: string
  name: string
  phone?: string
  email?: string
  pendingDebt: number
  pendingTransactions: PendingTx[]
  oldestDebtDays: number
}

export function CuentasCobrar() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const qc = useQueryClient()
  const { confirm, dialog } = useConfirm()

  const { data: clients = [], isLoading } = useQuery<ClientWithDebt[]>({
    queryKey: ['clients-debt', bid],
    queryFn: async () => {
      const [clientsRes, txRes] = await Promise.all([
        api.get(`/businesses/${bid}/clients`).then(r => r.data),
        api.get(`/businesses/${bid}/transactions`, { params: { type: 'SALE' } }).then(r => r.data),
      ])
      const pendingByClient: Record<string, PendingTx[]> = {}
      for (const tx of txRes) {
        if (tx.status === 'PENDING' && tx.clientId) {
          if (!pendingByClient[tx.clientId]) pendingByClient[tx.clientId] = []
          pendingByClient[tx.clientId].push(tx)
        }
      }
      const today = new Date()
      return clientsRes
        .map((c: ClientWithDebt) => ({
          ...c,
          pendingTransactions: pendingByClient[c.id] ?? [],
          pendingDebt: (pendingByClient[c.id] ?? []).reduce((s: number, t: PendingTx) => s + t.amount, 0),
          oldestDebtDays: (pendingByClient[c.id] ?? []).reduce((max: number, t: PendingTx) => {
            return Math.max(max, differenceInCalendarDays(today, new Date(t.createdAt)))
          }, 0),
        }))
        .filter((c: ClientWithDebt) => c.pendingDebt > 0)
        .sort((a: ClientWithDebt, b: ClientWithDebt) => b.pendingDebt - a.pendingDebt)
    },
  })

  const markPaidMutation = useMutation({
    mutationFn: (clientId: string) => api.post(`/businesses/${bid}/transactions/mark-paid/${clientId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients-debt', bid] })
      qc.invalidateQueries({ queryKey: ['transactions', bid] })
      toast.success('Deuda marcada como pagada')
    },
    onError: () => toast.error('No se pudo actualizar'),
  })

  const totalDebt = clients.reduce((s, c) => s + c.pendingDebt, 0)
  const agingBuckets = clients.reduce((acc, client) => {
    if (client.oldestDebtDays <= 7) acc.current += client.pendingDebt
    else if (client.oldestDebtDays <= 15) acc.week2 += client.pendingDebt
    else if (client.oldestDebtDays <= 30) acc.month += client.pendingDebt
    else acc.critical += client.pendingDebt
    return acc
  }, { current: 0, week2: 0, month: 0, critical: 0 })

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Lo que te deben"
        subtitle="Clientes que se fueron sin pagar — dale seguimiento"
      />

      <div className="p-6 space-y-6">
        {/* Resumen */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="stat-card bg-gradient-to-br from-red-400 to-rose-600 shadow-lg shadow-red-200">
            <div className="relative z-10 flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <DollarSign size={20} className="text-white" />
              </div>
            </div>
            <p className="text-white/70 text-xs relative z-10">Total pendiente de cobro</p>
            <p className="text-white text-2xl font-bold relative z-10">{formatCurrency(totalDebt, cur)}</p>
          </div>
          <div className="stat-card bg-gradient-to-br from-orange-400 to-amber-600 shadow-lg shadow-orange-200">
            <div className="relative z-10 flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Users size={20} className="text-white" />
              </div>
            </div>
            <p className="text-white/70 text-xs relative z-10">Clientes con deuda</p>
            <p className="text-white text-2xl font-bold relative z-10">{clients.length}</p>
          </div>
          <div className="stat-card bg-gradient-to-br from-blue-400 to-blue-700 shadow-lg shadow-blue-200">
            <div className="relative z-10 flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <CreditCard size={20} className="text-white" />
              </div>
            </div>
            <p className="text-white/70 text-xs relative z-10">Promedio por cliente</p>
            <p className="text-white text-2xl font-bold relative z-10">
              {clients.length > 0 ? formatCurrency(totalDebt / clients.length, cur) : formatCurrency(0, cur)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: '0-7 días', value: agingBuckets.current, color: 'text-green-700', bg: 'bg-green-50' },
            { label: '8-15 días', value: agingBuckets.week2, color: 'text-yellow-700', bg: 'bg-yellow-50' },
            { label: '16-30 días', value: agingBuckets.month, color: 'text-orange-700', bg: 'bg-orange-50' },
            { label: '+30 días', value: agingBuckets.critical, color: 'text-red-700', bg: 'bg-red-50' },
          ].map(bucket => (
            <div key={bucket.label} className={`rounded-2xl p-4 ${bucket.bg}`}>
              <p className={`text-xs font-semibold ${bucket.color}`}>{bucket.label}</p>
              <p className={`text-lg font-black ${bucket.color}`}>{formatCurrency(bucket.value, cur)}</p>
            </div>
          ))}
        </div>

        {/* Lista de clientes con deuda */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Cargando...</div>
        ) : clients.length === 0 ? (
          <div className="card p-12 text-center">
            <CheckCircle size={48} className="text-green-400 mx-auto mb-3" />
            <p className="font-semibold text-gray-700">¡Sin deudas pendientes!</p>
            <p className="text-sm text-gray-400 mt-1">Todos los clientes están al día</p>
            <Link to="/vender" className="btn-primary mt-4 inline-flex">Registrar venta</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {clients.map(client => (
              <div key={client.id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 bg-gradient-to-br from-orange-400 to-red-500 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                      {client.name[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900">{client.name}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {client.phone && (
                          <a href={`tel:${client.phone}`} className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600">
                            <Phone size={11} /> {client.phone}
                          </a>
                        )}
                        <span className="flex items-center gap-1 text-xs text-orange-600">
                          <AlertCircle size={11} /> {client.pendingTransactions.length} venta{client.pendingTransactions.length !== 1 ? 's' : ''} pendiente{client.pendingTransactions.length !== 1 ? 's' : ''}
                        </span>
                        <span className={`text-xs font-semibold ${
                          client.oldestDebtDays > 30 ? 'text-red-600'
                          : client.oldestDebtDays > 15 ? 'text-orange-600'
                          : client.oldestDebtDays > 7 ? 'text-yellow-600'
                          : 'text-green-600'
                        }`}>
                          Antigüedad: {client.oldestDebtDays} día{client.oldestDebtDays !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Total deuda</p>
                      <p className="text-lg font-bold text-red-600">{formatCurrency(client.pendingDebt, cur)}</p>
                    </div>
                    {client.phone && (
                      <a
                        href={`https://wa.me/${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${client.name}, te recordamos que tienes una deuda pendiente de ${formatCurrency(client.pendingDebt, cur)}. ¡Gracias!`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary px-2.5 py-2 text-green-600 border-green-200 hover:bg-green-50"
                        title="Recordatorio por WhatsApp"
                      >
                        <MessageCircle size={15} />
                      </a>
                    )}
                    <button
                      onClick={async () => {
                        const ok = await confirm(
                          'Marcar como pagado',
                          `¿Marcar todas las deudas de ${client.name} como pagadas? (${formatCurrency(client.pendingDebt, cur)})`,
                          false
                        )
                        if (ok) markPaidMutation.mutate(client.id)
                      }}
                      disabled={markPaidMutation.isPending}
                      className="btn-primary bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                    >
                      <CheckCircle size={15} />
                      Cobrar todo
                    </button>
                  </div>
                </div>

                {/* Desglose de transacciones */}
                {client.pendingTransactions.length > 0 && (
                  <div className="mt-4 border-t border-gray-100 pt-3 space-y-1.5">
                    {client.pendingTransactions.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between text-sm py-1.5 px-3 rounded-lg bg-gray-50">
                        <div>
                          <span className="text-gray-700">{tx.description || 'Venta'}</span>
                          <span className="text-gray-400 text-xs ml-2">{formatDate(tx.createdAt, 'dd MMM, HH:mm')}</span>
                        </div>
                        <span className="font-semibold text-red-500">{formatCurrency(tx.amount, cur)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {dialog}
    </div>
  )
}
