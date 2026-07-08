import { useEffect, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListRowSkeleton } from '@/components/ui/Skeleton'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { getOfflineSales, removeOfflineSale, type PendingSale } from '@/lib/offlineQueue'
import { WifiOff, RefreshCw, Trash2, CheckCircle2 } from 'lucide-react'

interface OfflineItem { productId?: string; name: string; quantity: number; price: number }
interface OfflineSaleData {
  amount: number
  paymentMethod: string
  status: string
  items: OfflineItem[]
}

export function OfflineQueue() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const qc = useQueryClient()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [sales, setSales] = useState<PendingSale[]>([])
  const [loading, setLoading] = useState(true)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [online, setOnline] = useState(navigator.onLine)

  const load = useCallback(async () => {
    setLoading(true)
    const all = await getOfflineSales()
    setSales(all.filter(s => s.businessId === bid).sort((a, b) => b.savedAt - a.savedAt))
    setLoading(false)
  }, [bid])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const retry = async (sale: PendingSale) => {
    setRetryingId(sale.id)
    try {
      await api.post(`/businesses/${bid}/transactions`, sale.data)
      await removeOfflineSale(sale.id)
      qc.invalidateQueries({ queryKey: ['products', bid] })
      qc.invalidateQueries({ queryKey: ['recent-tx', bid] })
      toast.success('Venta sincronizada correctamente')
      await load()
    } catch (e) {
      toast.error(getErrorMessage(e) || 'No se pudo sincronizar la venta')
    } finally {
      setRetryingId(null)
    }
  }

  const retryAll = async () => {
    for (const sale of sales) {
      await retry(sale)
    }
  }

  const handleDelete = async (sale: PendingSale) => {
    const ok = await confirm('Descartar venta', 'Esta venta pendiente se eliminara permanentemente y no se registrara en el sistema. Continuar?', true)
    if (ok) {
      await removeOfflineSale(sale.id)
      toast.success('Venta descartada')
      await load()
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Cola offline"
        subtitle={`${sales.length} venta(s) pendiente(s) de sincronizar`}
        icon={<WifiOff size={18} className="text-orange-500" />}
        action={sales.length > 0 && (
          <button onClick={retryAll} disabled={!online || retryingId !== null} className="btn-primary">
            <RefreshCw size={15} /> Reintentar todo
          </button>
        )}
      />

      <div className="p-6 space-y-4">
        <div className={`rounded-xl px-4 py-2.5 text-sm font-medium flex items-center gap-2 ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
          <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-orange-500 animate-pulse'}`} />
          {online ? 'Conectado' : 'Sin conexion'}
        </div>

        <div className="card overflow-hidden">
          {loading ? (
            <ListRowSkeleton rows={4} />
          ) : sales.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              tone="green"
              title="¡Todo al día!"
              description="No tienes ventas pendientes por sincronizar. Todo se guardó correctamente en el servidor."
            />
          ) : (
            <div className="divide-y divide-gray-50">
              {sales.map(sale => {
                const data = sale.data as unknown as OfflineSaleData
                return (
                  <div key={sale.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-bold text-gray-900">{formatCurrency(data.amount, cur)}</p>
                      <p className="text-xs text-gray-400">{formatDateTime(new Date(sale.savedAt).toISOString())}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {data.items?.length ?? 0} producto(s) - {data.paymentMethod}
                        {data.status === 'PENDING' && ' - Al fiado'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => retry(sale)}
                        disabled={!online || retryingId === sale.id}
                        className="btn-secondary text-xs px-3 py-1.5"
                      >
                        {retryingId === sale.id ? 'Sincronizando...' : 'Reintentar'}
                      </button>
                      <button onClick={() => handleDelete(sale)} className="btn-ghost text-xs px-2.5 py-1.5 text-red-500 hover:bg-red-50">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {confirmDialog}
    </div>
  )
}
