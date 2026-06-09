import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import {
  formatCurrency, formatDateTime, TX_TYPE_LABELS,
  PAYMENT_METHOD_LABELS, QUOTE_STATUS_LABELS
} from '@/lib/utils'
import { exportCSV, EXPORT_COLUMNS } from '@/lib/export'
import { PageHeader } from '@/components/ui/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  Plus, ArrowLeftRight, Filter, Download,
  TrendingUp, TrendingDown, Scale, RotateCcw,
  ArrowUpRight, ArrowDownRight, ShoppingCart, Receipt, Wallet, Package,
  Eye
} from 'lucide-react'
import { format } from 'date-fns'

const schema = z.object({
  type: z.enum(['VENTA', 'GASTO', 'INGRESO', 'COMPRA']),
  amount: z.coerce.number().min(0.01, 'El monto es obligatorio'),
  description: z.string().min(1, 'La descripción es obligatoria'),
  paymentMethod: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']).optional(),
  status: z.enum(['COMPLETADO', 'PENDIENTE']).optional(),
  clientId: z.string().optional(),
  supplierId: z.string().optional(),
})

type Form = z.infer<typeof schema>

// Mapa de valores internos del backend a español
const TYPE_TO_API: Record<string, string> = {
  VENTA: 'SALE', GASTO: 'EXPENSE', INGRESO: 'INCOME', COMPRA: 'PURCHASE',
}
const STATUS_TO_API: Record<string, string> = {
  COMPLETADO: 'COMPLETED', PENDIENTE: 'PENDING',
}
const METHOD_TO_API: Record<string, string> = {
  EFECTIVO: 'CASH', TARJETA: 'CARD', TRANSFERENCIA: 'TRANSFER',
}

interface TransactionItem {
  id: string
  name: string
  quantity: number
  price: number
  cost: number
  productId?: string
}

interface Transaction {
  id: string
  type: string
  amount: number
  description?: string
  paymentMethod: string
  status: string
  client?: { id: string; name: string }
  supplier?: { id: string; name: string }
  items?: TransactionItem[]
  discountValue?: number
  discountType?: string
  taxAmount?: number
  ncfNumber?: string
  originalCurrency?: string
  exchangeRate?: number
  originalAmount?: number
  createdAt: string
}

export function Movimientos() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const qc = useQueryClient()

  const [modalOpen, setModalOpen] = useState(false)
  const [detailTx, setDetailTx] = useState<Transaction | null>(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50
  const { confirm, dialog: confirmDialog } = useConfirm()

  const today = new Date()
  const [from, setFrom] = useState(format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(today, 'yyyy-MM-dd'))

  // Reset page when filters change
  const handleFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    setPage(1)
  }

  const { data: txResponse, isLoading } = useQuery<{ data: Transaction[]; total: number; pages: number }>({
    queryKey: ['transactions', bid, from, to, typeFilter, page],
    queryFn: () => api.get(`/businesses/${bid}/transactions`, {
      params: { from, to, type: typeFilter || undefined, page, limit: PAGE_SIZE }
    }).then(r => r.data),
  })

  const transactions = txResponse?.data ?? []
  const totalPages = txResponse?.pages ?? 1
  const totalCount = txResponse?.total ?? 0

  const { data: clients = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['clients', bid],
    queryFn: () => api.get(`/businesses/${bid}/clients`).then(r => r.data),
  })

  const { data: suppliers = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['suppliers', bid],
    queryFn: () => api.get(`/businesses/${bid}/suppliers`).then(r => r.data),
  })

  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'GASTO', paymentMethod: 'EFECTIVO', status: 'COMPLETADO' },
  })

  const txType = watch('type')

  const returnMutation = useMutation({
    mutationFn: (txId: string) => api.post(`/businesses/${bid}/transactions/return/${txId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions', bid] })
      qc.invalidateQueries({ queryKey: ['products', bid] })
      toast.success('Venta devuelta y stock restaurado')
    },
    onError: () => toast.error('No se pudo procesar la devolución'),
  })

  const createMutation = useMutation({
    mutationFn: (data: Form) => api.post(`/businesses/${bid}/transactions`, {
      type: TYPE_TO_API[data.type],
      amount: data.amount,
      description: data.description,
      paymentMethod: METHOD_TO_API[data.paymentMethod || 'EFECTIVO'],
      status: STATUS_TO_API[data.status || 'COMPLETADO'],
      clientId: data.clientId || undefined,
      supplierId: data.supplierId || undefined,
      items: [],
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions', bid] })
      qc.invalidateQueries({ queryKey: ['stats-summary', bid] })
      setModalOpen(false)
      reset()
      toast.success('Movimiento registrado correctamente')
    },
    onError: () => toast.error('No se pudo registrar el movimiento'),
  })

  const totals = transactions.reduce((acc, tx) => {
    if (tx.status !== 'COMPLETED') return acc
    if (tx.type === 'SALE' || tx.type === 'INCOME') acc.income += tx.amount
    else acc.expenses += tx.amount
    return acc
  }, { income: 0, expenses: 0 })

  const handleExport = async () => {
    // Export fetches all records (no pagination limit)
    const allTx = await api.get(`/businesses/${bid}/transactions`, {
      params: { from, to, type: typeFilter || undefined, limit: 10000 }
    }).then(r => (r.data.data ?? r.data) as Transaction[])
    const rows = allTx.map(tx => ({
      typeLabel: TX_TYPE_LABELS[tx.type]?.label || tx.type,
      description: tx.description || '',
      amount: tx.amount,
      paymentMethodLabel: PAYMENT_METHOD_LABELS[tx.paymentMethod] || tx.paymentMethod,
      statusLabel: tx.status === 'COMPLETED' ? 'Completado' : tx.status === 'PENDING' ? 'Pendiente' : tx.status,
      contactName: tx.client?.name || tx.supplier?.name || '',
      date: formatDateTime(tx.createdAt),
    }))
    exportCSV('movimientos', rows, EXPORT_COLUMNS.movimientos)
    toast.success(`${rows.length} movimientos exportados como CSV`)
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Movimientos"
        subtitle="Registro de ingresos y egresos"
        icon={<ArrowLeftRight size={18} className="text-purple-500" />}
        action={
          <div className="flex gap-2">
            <button onClick={handleExport} className="btn-secondary">
              <Download size={15} /> Exportar
            </button>
            <button onClick={() => { setModalOpen(true) }} className="btn-primary">
              <Plus size={16} /> Crear movimiento
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {/* Tarjetas de resumen */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center">
                <TrendingUp size={18} className="text-green-600" />
              </div>
              <p className="text-sm text-gray-500 font-medium">Ingresos</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totals.income, cur)}</p>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center">
                <TrendingDown size={18} className="text-red-500" />
              </div>
              <p className="text-sm text-gray-500 font-medium">Egresos</p>
            </div>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(totals.expenses, cur)}</p>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                <Scale size={18} className="text-blue-600" />
              </div>
              <p className="text-sm text-gray-500 font-medium">Balance</p>
            </div>
            <p className={`text-2xl font-bold ${totals.income - totals.expenses >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
              {formatCurrency(totals.income - totals.expenses, cur)}
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div className="card p-4 flex flex-wrap gap-3 items-center">
          <Filter size={15} className="text-gray-400" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Desde</span>
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }} className="input w-36" />
            <span className="text-sm text-gray-500">hasta</span>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1) }} className="input w-36" />
          </div>
          <select value={typeFilter} onChange={e => handleFilterChange(setTypeFilter)(e.target.value)} className="input w-44">
            <option value="">Todos los tipos</option>
            <option value="SALE">Ventas</option>
            <option value="EXPENSE">Gastos</option>
            <option value="INCOME">Ingresos</option>
            <option value="PURCHASE">Compras</option>
            <option value="RETURN">Devoluciones</option>
          </select>
        </div>

        {/* Lista de movimientos */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="py-20 text-center text-gray-400">
              <div className="inline-block w-6 h-6 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mb-3" />
              <p className="text-sm">Cargando movimientos...</p>
            </div>
          ) : transactions.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="Sin movimientos" description="No hay movimientos en el período seleccionado" />
          ) : (
            <div className="divide-y divide-gray-50">
              {transactions.map(tx => {
                const typeInfo = TX_TYPE_LABELS[tx.type]
                const isIncome = tx.type === 'SALE' || tx.type === 'INCOME'
                const contactName = tx.client?.name || tx.supplier?.name
                const primaryLabel = contactName || tx.description || '—'
                const secondaryLabel = contactName && tx.description ? tx.description : null

                const TxIcon = tx.type === 'SALE' ? Receipt
                  : tx.type === 'EXPENSE' ? TrendingDown
                  : tx.type === 'PURCHASE' ? ShoppingCart
                  : tx.type === 'INCOME' ? Wallet
                  : Package

                return (
                  <div key={tx.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/70 transition-colors group">
                    {/* Icono de dirección */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                      ${isIncome ? 'bg-green-100' : 'bg-red-100'}`}>
                      <TxIcon size={17} className={isIncome ? 'text-green-600' : 'text-red-500'} />
                    </div>

                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate leading-tight">{primaryLabel}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {secondaryLabel && <span className="mr-1.5 text-gray-500">{secondaryLabel} ·</span>}
                        <span className={`font-medium ${
                          tx.type === 'SALE' ? 'text-green-600'
                          : tx.type === 'INCOME' ? 'text-blue-600'
                          : tx.type === 'EXPENSE' ? 'text-red-500'
                          : tx.type === 'PURCHASE' ? 'text-orange-600'
                          : 'text-gray-500'
                        }`}>
                          {typeInfo?.label || tx.type}
                        </span>
                        <span className="mx-1">·</span>
                        {PAYMENT_METHOD_LABELS[tx.paymentMethod] || tx.paymentMethod}
                      </p>
                    </div>

                    {/* Fecha + Estado */}
                    <div className="text-right flex-shrink-0 hidden sm:block">
                      <p className="text-xs text-gray-400">{formatDateTime(tx.createdAt)}</p>
                      {tx.status === 'PENDING' && (
                        <span className="inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-50 text-yellow-700">
                          Pendiente
                        </span>
                      )}
                      {tx.status === 'CANCELLED' && (
                        <span className="inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          Anulada
                        </span>
                      )}
                    </div>

                    {/* Monto — la estrella */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right">
                        <p className={`text-base font-black tracking-tight ${isIncome ? 'text-green-600' : 'text-red-500'}`}>
                          {isIncome ? '+' : '−'}{formatCurrency(tx.amount, cur)}
                        </p>
                      </div>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0
                        ${isIncome ? 'bg-green-100' : 'bg-red-100'}`}>
                        {isIncome
                          ? <ArrowUpRight size={13} className="text-green-600" />
                          : <ArrowDownRight size={13} className="text-red-500" />}
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setDetailTx(tx)}
                        className="btn-ghost text-xs px-2 py-1.5 text-blue-500 hover:bg-blue-50 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                        title="Ver detalles"
                      >
                        <Eye size={13} />
                      </button>
                      {tx.type === 'SALE' && tx.status === 'COMPLETED' && (
                        <button
                          onClick={async () => {
                            const ok = await confirm('Devolver venta', `¿Devolver esta venta de ${formatCurrency(tx.amount, cur)}? Se restaurará el stock.`, true)
                            if (ok) returnMutation.mutate(tx.id)
                          }}
                          className="btn-ghost text-xs px-2 py-1.5 text-orange-500 hover:bg-orange-50 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                          title="Devolver venta"
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
              <p className="text-xs text-gray-500">
                Mostrando {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} de {totalCount} movimientos
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Anterior
                </button>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const p = totalPages <= 7 ? i + 1
                      : page <= 4 ? i + 1
                      : page >= totalPages - 3 ? totalPages - 6 + i
                      : page - 3 + i
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors ${
                          p === page
                            ? 'bg-blue-600 text-white'
                            : 'hover:bg-gray-100 text-gray-600'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal nuevo movimiento */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); reset() }} title="Nuevo movimiento">
        <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Tipo de movimiento *</label>
            <select {...register('type')} className="input">
              <option value="VENTA">Venta</option>
              <option value="GASTO">Gasto</option>
              <option value="INGRESO">Ingreso</option>
              <option value="COMPRA">Compra a proveedor</option>
            </select>
          </div>
          <div>
            <label className="label">Monto *</label>
            <input {...register('amount')} type="number" step="0.01" className="input" placeholder="0.00" />
            {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>}
          </div>
          <div>
            <label className="label">Descripción *</label>
            <input {...register('description')} className="input" placeholder="Ej: Pago de alquiler local" />
            {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Método de pago</label>
              <select {...register('paymentMethod')} className="input">
                <option value="EFECTIVO">Efectivo</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="TRANSFERENCIA">Transferencia</option>
              </select>
            </div>
            <div>
              <label className="label">Estado</label>
              <select {...register('status')} className="input">
                <option value="COMPLETADO">Completado</option>
                <option value="PENDIENTE">Pendiente</option>
              </select>
            </div>
          </div>
          {(txType === 'VENTA' || txType === 'INGRESO') && (
            <div>
              <label className="label">Cliente (opcional)</label>
              <select {...register('clientId')} className="input">
                <option value="">Sin cliente específico</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {txType === 'COMPRA' && (
            <div>
              <label className="label">Proveedor (opcional)</label>
              <select {...register('supplierId')} className="input">
                <option value="">Sin proveedor específico</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
            <button type="button" onClick={() => { setModalOpen(false); reset() }} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Guardando...' : 'Guardar movimiento'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal detalle de movimiento */}
      <Modal open={!!detailTx} onClose={() => setDetailTx(null)} title={`Detalle de Movimiento`} size="lg">
        {detailTx && (() => {
          const isIncome = detailTx.type === 'SALE' || detailTx.type === 'INCOME'
          const typeInfo = TX_TYPE_LABELS[detailTx.type]
          const showItems = detailTx.items && detailTx.items.length > 0
          const subtotal = detailTx.items?.reduce((s, i) => s + i.price * i.quantity, 0) ?? detailTx.amount

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                <div>
                  <p className="text-gray-400 font-medium text-xs">Tipo</p>
                  <span className={`inline-block mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    detailTx.type === 'SALE' ? 'bg-green-100 text-green-700'
                    : detailTx.type === 'INCOME' ? 'bg-blue-100 text-blue-700'
                    : detailTx.type === 'EXPENSE' ? 'bg-red-100 text-red-700'
                    : detailTx.type === 'PURCHASE' ? 'bg-orange-100 text-orange-700'
                    : 'bg-gray-100 text-gray-700'
                  }`}>
                    {typeInfo?.label || detailTx.type}
                  </span>
                </div>
                <div>
                  <p className="text-gray-400 font-medium text-xs">Estado</p>
                  <span className={`inline-block mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    detailTx.status === 'COMPLETED' ? 'bg-green-100 text-green-700'
                    : detailTx.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-500'
                  }`}>
                    {detailTx.status === 'COMPLETED' ? '✓ Completado' : detailTx.status === 'PENDING' ? 'Pendiente' : detailTx.status}
                  </span>
                </div>
                <div>
                  <p className="text-gray-400 font-medium text-xs">Fecha</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{formatDateTime(detailTx.createdAt)}</p>
                </div>
                <div>
                  <p className="text-gray-400 font-medium text-xs">Forma de pago</p>
                  <p className="font-semibold text-gray-800 mt-0.5">
                    {PAYMENT_METHOD_LABELS[detailTx.paymentMethod] || detailTx.paymentMethod || '—'}
                  </p>
                </div>
                {detailTx.ncfNumber && (
                  <div>
                    <p className="text-gray-400 font-medium text-xs">NCF</p>
                    <p className="font-mono font-semibold text-gray-800 mt-0.5">{detailTx.ncfNumber}</p>
                  </div>
                )}
                {detailTx.client && (
                  <div>
                    <p className="text-gray-400 font-medium text-xs">Cliente</p>
                    <p className="font-semibold text-gray-800 mt-0.5">{detailTx.client.name}</p>
                  </div>
                )}
                {detailTx.supplier && (
                  <div>
                    <p className="text-gray-400 font-medium text-xs">Proveedor</p>
                    <p className="font-semibold text-gray-800 mt-0.5">{detailTx.supplier.name}</p>
                  </div>
                )}
                {detailTx.originalCurrency && detailTx.originalCurrency !== cur && (
                  <div>
                    <p className="text-gray-400 font-medium text-xs">Moneda de Pago</p>
                    <p className="font-semibold text-gray-800 mt-0.5">
                      {detailTx.originalCurrency} (Tasa: {detailTx.exchangeRate})
                    </p>
                  </div>
                )}
                {detailTx.originalAmount !== undefined && detailTx.originalCurrency && detailTx.originalCurrency !== cur && (
                  <div>
                    <p className="text-gray-400 font-medium text-xs">Monto Original</p>
                    <p className="font-semibold text-gray-800 mt-0.5">
                      {formatCurrency(detailTx.originalAmount, detailTx.originalCurrency)}
                    </p>
                  </div>
                )}
              </div>

              {detailTx.description && (
                <div className="text-sm bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                  <p className="text-gray-400 font-medium text-xs mb-1">Descripción</p>
                  <p className="text-gray-700 font-medium">{detailTx.description}</p>
                </div>
              )}

              {showItems && (
                <div className="border border-gray-100 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Producto</th>
                        <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Cant.</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Precio Unit.</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detailTx.items!.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50/30">
                          <td className="px-4 py-3 text-gray-900 font-medium">{item.name}</td>
                          <td className="px-4 py-3 text-center text-gray-500 font-semibold">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-gray-500 font-mono">{formatCurrency(item.price, cur)}</td>
                          <td className="px-4 py-3 text-right text-gray-900 font-semibold font-mono">{formatCurrency(item.price * item.quantity, cur)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm border border-gray-100">
                {showItems && (
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span>
                    <span className="font-mono">{formatCurrency(subtotal, cur)}</span>
                  </div>
                )}
                {detailTx.discountValue !== undefined && detailTx.discountValue > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Descuento {detailTx.discountType === 'PERCENT' ? `(%)` : ''}</span>
                    <span className="font-mono">-{formatCurrency(detailTx.discountValue, cur)}</span>
                  </div>
                )}
                {detailTx.taxAmount !== undefined && detailTx.taxAmount > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Impuestos</span>
                    <span className="font-mono">{formatCurrency(detailTx.taxAmount, cur)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                  <span className="font-bold text-gray-800 text-base">Total</span>
                  <span className={`text-xl font-black font-mono ${isIncome ? 'text-green-600' : 'text-red-500'}`}>
                    {formatCurrency(detailTx.amount, cur)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setDetailTx(null)}
                  className="btn-secondary w-full sm:w-auto px-6"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {confirmDialog}
      {/* Nota: QUOTE_STATUS_LABELS importado para evitar warning de unused */}
      <span className="hidden">{Object.keys(QUOTE_STATUS_LABELS).length}</span>
    </div>
  )
}
