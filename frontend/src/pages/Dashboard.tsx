import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { formatCurrency, formatDate, TX_TYPE_LABELS } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, Package, Users, Truck, ShoppingCart,
  ArrowRight, DollarSign, ArrowUpRight, ArrowDownRight, AlertTriangle,
  Clock, BarChart2, Star, CheckCircle2, CreditCard, Zap,
  Settings2, X, ChevronUp, ChevronDown, Eye, EyeOff
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine
} from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Product { id: string; name: string; quantity: number; category?: { name: string } }
interface TopProduct { name: string; productId?: string; totalQty: number; totalRevenue: number }
interface HourData { hour: number; total: number; count: number }
interface CategoryMargin { category: string; revenue: number; cost: number; grossProfit: number; margin: number; units: number }
interface LossProduct { id: string; name: string; price: number; cost: number; margin: number; category: string; stock: number }
interface SalesGaps { totalDays: number; daysWithSales: number; daysWithoutSales: number }
interface PendingTx { id: string; type: string; amount: number; status: string }

// ── Widget system ─────────────────────────────────────────────────────────────
interface WidgetDef { id: string; label: string; description: string; hideable: boolean }
interface WidgetState { id: string; visible: boolean }

const WIDGET_DEFS: WidgetDef[] = [
  { id: 'status',    label: 'Alertas del día',              description: 'Lo que necesita tu atención ahora mismo',           hideable: false },
  { id: 'kpis',      label: 'Métricas principales',         description: 'Ventas hoy, mes, ganancia bruta y mejor hora',      hideable: true },
  { id: 'chart',     label: 'Gráfico de ventas',            description: 'Ventas y gastos — últimos 7, 30 o 90 días',         hideable: true },
  { id: 'top',       label: 'Top productos y hora pico',    description: 'Productos más vendidos y horario de mayor venta',   hideable: true },
  { id: 'monthly',   label: 'Resumen del mes y movimientos',description: 'Totales mensuales y últimas transacciones',         hideable: true },
  { id: 'analytics', label: 'Análisis gerencial',           description: 'Margen por categoría, productos en pérdida, gaps',  hideable: true },
]

const DEFAULT_LAYOUT: WidgetState[] = WIDGET_DEFS.map(w => ({ id: w.id, visible: true }))

function useWidgetLayout(bid: string) {
  const key = `vendix_dash_${bid}`

  const load = (): WidgetState[] => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return DEFAULT_LAYOUT
      const saved = JSON.parse(raw) as WidgetState[]
      // Merge: keep saved order/visibility but add any new widgets at end
      const merged = saved.filter(s => WIDGET_DEFS.some(d => d.id === s.id))
      WIDGET_DEFS.forEach(d => { if (!merged.some(m => m.id === d.id)) merged.push({ id: d.id, visible: true }) })
      return merged
    } catch { return DEFAULT_LAYOUT }
  }

  const [layout, setLayoutState] = useState<WidgetState[]>(load)

  const save = useCallback((next: WidgetState[]) => {
    setLayoutState(next)
    localStorage.setItem(key, JSON.stringify(next))
  }, [key])

  const toggle = (id: string) => {
    const def = WIDGET_DEFS.find(d => d.id === id)
    if (def && !def.hideable) return
    save(layout.map(w => w.id === id ? { ...w, visible: !w.visible } : w))
  }

  const move = (id: string, dir: -1 | 1) => {
    const idx = layout.findIndex(w => w.id === id)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= layout.length) return
    const next = [...layout]
    ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
    save(next)
  }

  const reset = () => save(DEFAULT_LAYOUT)

  return { layout, toggle, move, reset }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function DeltaBadge({ current, previous, label = 'ayer' }: { current: number; previous: number; label?: string }) {
  if (!previous || previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  const up = pct >= 0
  return (
    <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap
      ${up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
      {up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {Math.abs(pct).toFixed(0)}% vs. {label}
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

// ── Customize Drawer ──────────────────────────────────────────────────────────
function CustomizeDrawer({
  open, onClose, layout, onToggle, onMove, onReset
}: {
  open: boolean
  onClose: () => void
  layout: WidgetState[]
  onToggle: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onReset: () => void
}) {
  if (!open) return null
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Personalizar inicio</h2>
            <p className="text-xs text-gray-400 mt-0.5">Activa, desactiva y reordena secciones</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {layout.map((w, idx) => {
            const def = WIDGET_DEFS.find(d => d.id === w.id)!
            const isFirst = idx === 0
            const isLast = idx === layout.length - 1
            return (
              <div key={w.id}
                className={`rounded-xl border p-3.5 transition-all ${
                  w.visible ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
                }`}>
                <div className="flex items-start gap-3">
                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0 mt-0.5">
                    <button
                      onClick={() => onMove(w.id, -1)}
                      disabled={isFirst}
                      className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronUp size={13} className="text-gray-500" />
                    </button>
                    <button
                      onClick={() => onMove(w.id, 1)}
                      disabled={isLast}
                      className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronDown size={13} className="text-gray-500" />
                    </button>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-tight ${w.visible ? 'text-gray-900' : 'text-gray-400'}`}>
                      {def.label}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-snug">{def.description}</p>
                    {!def.hideable && (
                      <span className="inline-block mt-1.5 text-[10px] font-semibold px-1.5 py-0.5 bg-blue-50 text-blue-500 rounded-full">
                        Siempre visible
                      </span>
                    )}
                  </div>

                  {/* Toggle */}
                  {def.hideable && (
                    <button
                      onClick={() => onToggle(w.id)}
                      className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${
                        w.visible
                          ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                      title={w.visible ? 'Ocultar' : 'Mostrar'}
                    >
                      {w.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-4 py-3 border-t border-gray-100">
          <button onClick={onReset} className="w-full btn-secondary text-sm justify-center">
            Restaurar orden por defecto
          </button>
        </div>
      </div>
    </>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export function Dashboard() {
  const { business, user } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const today = format(new Date(), 'yyyy-MM-dd')
  const firstName = user?.name?.split(' ')[0] ?? ''
  const [chartDays, setChartDays] = useState<7 | 30 | 90>(30)
  const [customizeOpen, setCustomizeOpen] = useState(false)

  const { layout, toggle, move, reset } = useWidgetLayout(bid)

  const now = new Date()
  const monthFrom = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd')
  const lastMonthFrom = format(new Date(now.getFullYear(), now.getMonth() - 1, 1), 'yyyy-MM-dd')
  const lastMonthTo = format(new Date(now.getFullYear(), now.getMonth(), 0), 'yyyy-MM-dd')

  const { data: summaryMonth } = useQuery({
    queryKey: ['stats-summary', bid, 'month'],
    queryFn: () => api.get(`/businesses/${bid}/stats/summary`, { params: { from: monthFrom, to: today } }).then(r => r.data),
    enabled: !!bid,
  })
  const { data: summaryToday } = useQuery({
    queryKey: ['stats-summary-today', bid],
    queryFn: () => api.get(`/businesses/${bid}/stats/summary`, { params: { from: today, to: today } }).then(r => r.data),
    enabled: !!bid,
  })
  const { data: summaryYesterday } = useQuery({
    queryKey: ['stats-yesterday', bid],
    queryFn: () => api.get(`/businesses/${bid}/stats/yesterday`).then(r => r.data),
    enabled: !!bid,
  })
  const { data: summaryLastMonth } = useQuery({
    queryKey: ['stats-summary', bid, 'last-month'],
    queryFn: () => api.get(`/businesses/${bid}/stats/summary`, { params: { from: lastMonthFrom, to: lastMonthTo } }).then(r => r.data),
    enabled: !!bid, staleTime: 5 * 60_000,
  })
  const { data: chart } = useQuery({
    queryKey: ['stats-chart', bid, chartDays],
    queryFn: () => api.get(`/businesses/${bid}/stats/chart`, { params: { days: chartDays } }).then(r => r.data),
    enabled: !!bid,
  })
  const { data: recentTx = [] } = useQuery<Record<string, unknown>[]>({
    queryKey: ['recent-tx', bid],
    queryFn: () => api.get(`/businesses/${bid}/transactions`, { params: { limit: 8 } }).then(r => r.data.data ?? r.data),
    enabled: !!bid,
  })
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products', bid],
    queryFn: () => api.get(`/businesses/${bid}/products`).then(r => r.data),
    enabled: !!bid,
  })
  const { data: topProducts = [] } = useQuery<TopProduct[]>({
    queryKey: ['top-products', bid],
    queryFn: () => api.get(`/businesses/${bid}/stats/top-products`, { params: { from: monthFrom, to: today } }).then(r => r.data),
    enabled: !!bid,
  })
  const { data: byHour = [] } = useQuery<HourData[]>({
    queryKey: ['stats-hour', bid],
    queryFn: () => api.get(`/businesses/${bid}/stats/by-hour`, { params: { days: 30 } }).then(r => r.data),
    enabled: !!bid,
  })
  const { data: marginByCategory = [] } = useQuery<CategoryMargin[]>({
    queryKey: ['margin-by-category', bid],
    queryFn: () => api.get(`/businesses/${bid}/stats/margin-by-category`, { params: { days: 30 } }).then(r => r.data),
    enabled: !!bid,
  })
  const { data: lossProducts = [] } = useQuery<LossProduct[]>({
    queryKey: ['loss-products', bid],
    queryFn: () => api.get(`/businesses/${bid}/stats/loss-products`).then(r => r.data),
    enabled: !!bid,
  })
  const { data: salesGaps } = useQuery<SalesGaps>({
    queryKey: ['sales-gaps', bid],
    queryFn: () => api.get(`/businesses/${bid}/stats/sales-gaps`, { params: { days: 30 } }).then(r => r.data),
    enabled: !!bid,
  })
  const { data: pendingTx = [] } = useQuery<PendingTx[]>({
    queryKey: ['pending-tx', bid],
    queryFn: () => api.get(`/businesses/${bid}/transactions`, { params: { status: 'PENDING', limit: 500 } }).then(r => r.data.data ?? r.data),
    enabled: !!bid, staleTime: 60_000,
  })

  // Derived data
  const LOW_STOCK = 5
  const lowStockProducts = products.filter(p => p.quantity >= 0 && p.quantity <= LOW_STOCK)
  const outOfStock = products.filter(p => p.quantity === 0)
  const bestHour = byHour.reduce((best, h) => h.total > (best?.total ?? 0) ? h : best, null as HourData | null)
  const formatHour = (h: number) => { const ampm = h < 12 ? 'AM' : 'PM'; const d = h === 0 ? 12 : h > 12 ? h - 12 : h; return `${d}:00 ${ampm}` }
  const grossMarginPct = summaryMonth?.totalSales > 0 ? ((summaryMonth.grossProfit / summaryMonth.totalSales) * 100).toFixed(1) : null
  const peakHourData = byHour.filter(h => h.count > 0).slice(6, 22)
  const pendingSales = pendingTx.filter(t => t.type === 'SALE')
  const pendingDebtTotal = pendingSales.reduce((s, t) => s + t.amount, 0)
  const attentionItems = [
    ...outOfStock.slice(0, 2).map(p => ({ text: `${p.name} — agotado`, to: '/inventario', color: 'red' as const })),
    ...lowStockProducts.filter(p => p.quantity > 0).slice(0, 2).map(p => ({ text: `${p.name} — solo ${p.quantity} en stock`, to: '/inventario', color: 'amber' as const })),
    ...(pendingSales.length > 0 ? [{ text: `${pendingSales.length} venta${pendingSales.length > 1 ? 's' : ''} pendiente${pendingSales.length > 1 ? 's' : ''} de cobro — ${formatCurrency(pendingDebtTotal, cur)}`, to: '/cuentas-cobrar', color: 'red' as const }] : []),
  ]
  const dateLabel = format(now, "EEEE, dd 'de' MMMM", { locale: es })
  const dateCapitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)

  // ── Widget render map ────────────────────────────────────────────────────────
  const renderWidget = (id: string) => {
    switch (id) {

      case 'status':
        return attentionItems.length === 0 ? (
          <div key="status" className="flex items-center gap-3 px-5 py-3.5 bg-green-50 border border-green-200 rounded-2xl">
            <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />
            <p className="text-sm font-medium text-green-700">Todo al día — sin alertas pendientes</p>
          </div>
        ) : (
          <div key="status" className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-amber-200">
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
              <p className="text-sm font-bold text-amber-800">
                {attentionItems.length} {attentionItems.length === 1 ? 'cosa necesita' : 'cosas necesitan'} tu atención
              </p>
            </div>
            <div className="divide-y divide-amber-100">
              {attentionItems.map((item, i) => (
                <Link key={i} to={item.to}
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-amber-100/50 transition-colors group">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.color === 'red' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <p className={`text-sm ${item.color === 'red' ? 'text-red-700' : 'text-amber-800'}`}>{item.text}</p>
                  <ArrowRight size={13} className="ml-auto text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>
        )

      case 'kpis':
        return (
          <div key="kpis" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
                  <ShoppingCart size={16} className="text-green-600" />
                </div>
                <DeltaBadge current={summaryToday?.totalSales ?? 0} previous={summaryYesterday?.totalSales ?? 0} label="ayer" />
              </div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Ventas hoy</p>
              <p className="text-2xl font-black text-gray-900 mt-0.5 leading-tight">{formatCurrency(summaryToday?.totalSales ?? 0, cur)}</p>
              <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                <span className="font-medium">{summaryToday?.salesCount ?? 0} ventas</span>
                <span>·</span>
                <span>ayer {formatCurrency(summaryYesterday?.totalSales ?? 0, cur)}</span>
              </p>
            </div>

            <div className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                  <TrendingUp size={16} className="text-blue-600" />
                </div>
                <DeltaBadge current={summaryMonth?.totalSales ?? 0} previous={summaryLastMonth?.totalSales ?? 0} label="mes ant." />
              </div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Ventas del mes</p>
              <p className="text-2xl font-black text-gray-900 mt-0.5 leading-tight">{formatCurrency(summaryMonth?.totalSales ?? 0, cur)}</p>
              <p className="text-xs text-gray-400 mt-1.5">
                <span className="font-medium">{summaryMonth?.salesCount ?? 0} transacciones</span>
                {summaryLastMonth?.totalSales > 0 && <span> · mes ant. {formatCurrency(summaryLastMonth.totalSales, cur)}</span>}
              </p>
            </div>

            <div className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
                  <DollarSign size={16} className="text-purple-600" />
                </div>
                {grossMarginPct && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full
                    ${parseFloat(grossMarginPct) >= 30 ? 'bg-green-100 text-green-700' :
                      parseFloat(grossMarginPct) >= 15 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-600'}`}>
                    {grossMarginPct}%
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Ganancia bruta</p>
              <p className="text-2xl font-black text-gray-900 mt-0.5 leading-tight">{formatCurrency(summaryMonth?.grossProfit ?? 0, cur)}</p>
              <p className="text-xs text-gray-400 mt-1.5">Margen sobre ventas del mes</p>
            </div>

            <div className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Zap size={16} className="text-amber-600" />
                </div>
              </div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Mejor hora (30d)</p>
              <p className="text-2xl font-black text-gray-900 mt-0.5 leading-tight">
                {bestHour ? formatHour(bestHour.hour) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1.5">
                {bestHour ? `${formatCurrency(bestHour.total, cur)} · ${bestHour.count} ventas` : 'Sin datos suficientes'}
              </p>
            </div>
          </div>
        )

      case 'chart':
        return (
          <div key="chart" className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-bold text-gray-900">Ventas y Gastos</h2>
                <p className="text-xs text-gray-400 mt-0.5">Últimos {chartDays} días</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />Ventas</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />Gastos</span>
                </div>
                <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
                  {([7, 30, 90] as const).map(d => (
                    <button key={d} onClick={() => setChartDays(d)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${chartDays === d
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'}`}>
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {chart && chart.some((d: { ventas: number; gastos: number }) => d.ventas > 0 || d.gastos > 0) ? (() => {
              const chartTyped = chart as { ventas: number; gastos: number }[]
              const totalGastosPeriodo = chartTyped.reduce((s, d) => s + d.gastos, 0)
              const avgDailyExpense = chartTyped.length > 0 ? totalGastosPeriodo / chartTyped.length : 0
              const breakevenValue = avgDailyExpense > 0 ? avgDailyExpense : null
              return (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chart} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f87171" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => formatCurrency(v, cur).replace(/\s/g, '')} width={70} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 12, color: '#f1f5f9', fontSize: 12 }}
                      formatter={(v: number, name: string) => [formatCurrency(v, cur), name === 'ventas' ? 'Ventas' : 'Gastos']}
                      labelFormatter={l => formatDate(l)}
                    />
                    {breakevenValue && (
                      <ReferenceLine
                        y={breakevenValue}
                        stroke="#f59e0b"
                        strokeDasharray="5 3"
                        strokeWidth={1.5}
                        label={{ value: 'Punto de equilibrio', position: 'insideTopRight', fontSize: 10, fill: '#f59e0b', fontWeight: 600 }}
                      />
                    )}
                    <Area type="monotone" dataKey="ventas" stroke="#3b82f6" fill="url(#gV)" strokeWidth={2.5} dot={false} />
                    <Area type="monotone" dataKey="gastos" stroke="#f87171" fill="url(#gG)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )
            })() : (
              <div className="h-40 flex flex-col items-center justify-center text-gray-400">
                <TrendingUp size={32} className="mb-2 opacity-30" />
                <p className="text-sm">Aún no hay datos de ventas.</p>
                <Link to="/vender" className="text-blue-500 text-sm mt-1 hover:underline">Registra tu primera venta →</Link>
              </div>
            )}
          </div>
        )

      case 'top':
        return (
          <div key="top" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star size={15} className="text-amber-500" />
                  <h2 className="font-bold text-gray-900">Top productos</h2>
                </div>
                <span className="text-xs text-gray-400">Este mes</span>
              </div>
              {topProducts.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {topProducts.slice(0, 5).map((p, i) => (
                    <div key={p.name} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 transition-colors">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                        ${i === 0 ? 'bg-amber-100 text-amber-600' : i === 1 ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-400'}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-900">{p.totalQty} uds.</p>
                        <p className="text-xs text-gray-400">{formatCurrency(p.totalRevenue, cur)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center text-gray-400">
                  <BarChart2 size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Sin ventas este mes</p>
                </div>
              )}
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={15} className="text-blue-500" />
                <h2 className="font-bold text-gray-900">Pico de ventas</h2>
                <span className="text-xs text-gray-400 ml-auto">Últimos 30 días</span>
              </div>
              {peakHourData.some(h => h.count > 0) ? (
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={peakHourData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={h => `${h}h`} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 10, fontSize: 11, color: '#f1f5f9' }}
                      formatter={(v: number) => [formatCurrency(v, cur), 'Ventas']}
                      labelFormatter={h => `${formatHour(Number(h))}`}
                    />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                      {peakHourData.map(entry => (
                        <Cell key={entry.hour} fill={entry.hour === bestHour?.hour ? '#3b82f6' : '#dbeafe'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-36 flex flex-col items-center justify-center text-gray-400">
                  <Clock size={28} className="mb-2 opacity-20" />
                  <p className="text-sm">Sin datos suficientes</p>
                </div>
              )}
            </div>
          </div>
        )

      case 'monthly':
        return (
          <div key="monthly" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-5">
              <h2 className="font-bold text-gray-900 mb-4">Resumen del mes</h2>
              <div className="space-y-1.5">
                {[
                  { label: 'Total ventas', value: summaryMonth?.totalSales ?? 0, prev: summaryLastMonth?.totalSales, color: 'text-green-600', icon: ArrowUpRight, bg: 'bg-green-50' },
                  { label: 'Total gastos', value: summaryMonth?.totalExpenses ?? 0, prev: summaryLastMonth?.totalExpenses, color: 'text-red-500', icon: ArrowDownRight, bg: 'bg-red-50' },
                  { label: 'Ganancia bruta', value: summaryMonth?.grossProfit ?? 0, color: 'text-blue-600', icon: DollarSign, bg: 'bg-blue-50' },
                  { label: 'Ganancia neta', value: summaryMonth?.netProfit ?? 0, color: (summaryMonth?.netProfit ?? 0) >= 0 ? 'text-purple-600' : 'text-red-500', icon: TrendingUp, bg: 'bg-purple-50' },
                  { label: 'Compras a proveedores', value: summaryMonth?.totalPurchases ?? 0, color: 'text-orange-600', icon: Truck, bg: 'bg-orange-50' },
                ].map(item => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 ${item.bg} rounded-lg flex items-center justify-center`}>
                          <Icon size={13} className={item.color} />
                        </div>
                        <span className="text-sm text-gray-600">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.prev !== undefined && item.prev > 0 && (
                          <DeltaBadge current={item.value} previous={item.prev} label="mes ant." />
                        )}
                        <span className={`text-sm font-bold ${item.color}`}>{formatCurrency(item.value, cur)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-bold text-gray-900">Últimos movimientos</h2>
                <Link to="/movimientos" className="text-blue-500 text-xs flex items-center gap-1 hover:underline font-medium">
                  Ver todos <ArrowRight size={13} />
                </Link>
              </div>
              {recentTx.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {recentTx.map((tx) => {
                    const typeInfo = TX_TYPE_LABELS[tx.type as string]
                    const isIncome = tx.type === 'SALE' || tx.type === 'INCOME'
                    const isPending = tx.status === 'PENDING'
                    const contact = (tx.client as { name: string } | undefined)?.name || (tx.supplier as { name: string } | undefined)?.name
                    return (
                      <div key={tx.id as string} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0
                            ${isIncome ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                            {isIncome ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                              {contact || tx.description as string || typeInfo?.label || tx.type as string}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                              <span>{typeInfo?.label}</span>
                              {isPending && <span className="px-1 py-0 bg-yellow-100 text-yellow-700 rounded text-[10px] font-semibold">Pendiente</span>}
                              <span>· {formatDate(tx.createdAt as string, 'dd MMM, HH:mm')}</span>
                            </p>
                          </div>
                        </div>
                        <span className={`text-base font-black flex-shrink-0 ml-3 ${isIncome ? 'text-green-600' : 'text-red-500'}`}>
                          {isIncome ? '+' : '−'}{formatCurrency(tx.amount as number, cur)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="py-10 text-center">
                  <p className="text-gray-400 text-sm">No hay movimientos aún.</p>
                  <Link to="/vender" className="text-blue-500 text-sm mt-1 hover:underline inline-block">Registra una venta →</Link>
                </div>
              )}
            </div>
          </div>
        )

      case 'analytics':
        if (!marginByCategory.length && !lossProducts.length && !((salesGaps?.daysWithoutSales ?? 0) > 0)) return null
        return (
          <div key="analytics" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {marginByCategory.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-bold text-gray-900 flex items-center gap-2">
                    <BarChart2 size={16} className="text-blue-500" /> Margen por categoría (30d)
                  </h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {marginByCategory.slice(0, 6).map(cat => (
                    <div key={cat.category} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-800 truncate">{cat.category}</span>
                          <span className={`text-xs font-bold ml-2 flex-shrink-0
                            ${cat.margin >= 30 ? 'text-green-600' : cat.margin >= 15 ? 'text-amber-600' : 'text-red-500'}`}>
                            {cat.margin.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${cat.margin >= 30 ? 'bg-green-500' : cat.margin >= 15 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(100, Math.max(0, cat.margin))}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(cat.revenue, cur)} · {cat.units} uds</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-4">
              {salesGaps && salesGaps.daysWithoutSales > 0 && (
                <div className="card p-4 flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <AlertTriangle size={20} className="text-amber-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{salesGaps.daysWithoutSales} días sin ventas</p>
                    <p className="text-xs text-gray-400">de los últimos 30 días — {salesGaps.daysWithSales} días con ventas</p>
                  </div>
                </div>
              )}
              {lossProducts.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                      <TrendingDown size={14} className="text-red-500" /> Productos con margen bajo
                    </h2>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {lossProducts.slice(0, 5).map(p => (
                      <div key={p.id} className="px-5 py-2.5 flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                          <p className="text-xs text-gray-400">{p.category} · stock: {p.stock}</p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <p className={`text-sm font-bold ${p.margin < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                            {p.margin.toFixed(1)}%
                          </p>
                          <p className="text-xs text-gray-400">{formatCurrency(p.price, cur)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  // Unused import guard
  void [Users, Package, CreditCard]

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header bg-white">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{getGreeting()}, {firstName} 👋</h1>
          <p className="text-sm text-gray-400">{dateCapitalized} · {format(now, 'yyyy')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCustomizeOpen(true)}
            className="btn-secondary text-sm"
            title="Personalizar dashboard"
          >
            <Settings2 size={15} />
            Personalizar
          </button>
          <Link to="/vender" className="btn-primary">
            <ShoppingCart size={16} /> Nueva venta
          </Link>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {layout
          .filter(w => w.visible)
          .map(w => renderWidget(w.id))
          .filter(Boolean)}
      </div>

      <CustomizeDrawer
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        layout={layout}
        onToggle={toggle}
        onMove={move}
        onReset={reset}
      />
    </div>
  )
}
