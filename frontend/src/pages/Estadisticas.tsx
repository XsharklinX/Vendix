import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { formatCurrency } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart } from 'lucide-react'

type Period = 'today' | 'week' | '30days' | 'month' | 'custom'

function getPeriodDates(period: Period, custom: { from: string; to: string }) {
  const now = new Date()
  switch (period) {
    case 'today': return { from: format(now, 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd'), days: 1 }
    case 'week': return { from: format(subDays(now, 7), 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd'), days: 7 }
    case '30days': return { from: format(subDays(now, 30), 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd'), days: 30 }
    case 'month': return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd'), days: 31 }
    case 'custom': return { ...custom, days: 30 }
  }
}

export function Estadisticas() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'

  const [period, setPeriod] = useState<Period>('30days')
  const [custom, setCustom] = useState({
    from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  })

  const dates = getPeriodDates(period, custom)

  const { data: summary } = useQuery({
    queryKey: ['stats-summary', bid, dates.from, dates.to],
    queryFn: () => api.get(`/businesses/${bid}/stats/summary`, {
      params: { from: dates.from, to: dates.to }
    }).then(r => r.data),
  })

  const { data: chart } = useQuery({
    queryKey: ['stats-chart', bid, dates.days],
    queryFn: () => api.get(`/businesses/${bid}/stats/chart`, {
      params: { days: dates.days }
    }).then(r => r.data),
  })

  const { data: topProducts } = useQuery({
    queryKey: ['top-products', bid, dates.from, dates.to],
    queryFn: () => api.get(`/businesses/${bid}/stats/top-products`, {
      params: { from: dates.from, to: dates.to }
    }).then(r => r.data),
  })

  const periods: { value: Period; label: string }[] = [
    { value: 'today', label: 'Hoy' },
    { value: 'week', label: '7 días' },
    { value: '30days', label: '30 días' },
    { value: 'month', label: 'Este mes' },
    { value: 'custom', label: 'Personalizado' },
  ]

  return (
    <div>
      <PageHeader title="Estadísticas" />

      <div className="p-6 space-y-6">
        {/* Period filter */}
        <div className="card p-4 flex flex-wrap gap-2 items-center">
          {periods.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${period === p.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {p.label}
            </button>
          ))}
          {period === 'custom' && (
            <div className="flex gap-2 items-center">
              <input type="date" value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className="input w-36 text-sm" />
              <span className="text-gray-400">—</span>
              <input type="date" value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className="input w-36 text-sm" />
            </div>
          )}
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total ventas', value: formatCurrency(summary?.totalSales ?? 0, cur), icon: ShoppingCart, color: 'text-green-600 bg-green-50', sub: `${summary?.salesCount ?? 0} transacciones` },
            { label: 'Total gastos', value: formatCurrency(summary?.totalExpenses ?? 0, cur), icon: TrendingDown, color: 'text-red-600 bg-red-50', sub: `${summary?.expensesCount ?? 0} gastos` },
            { label: 'Ganancia bruta', value: formatCurrency(summary?.grossProfit ?? 0, cur), icon: TrendingUp, color: 'text-blue-600 bg-blue-50', sub: 'Ventas - costo productos' },
            { label: 'Ganancia neta', value: formatCurrency(summary?.netProfit ?? 0, cur), icon: DollarSign, color: (summary?.netProfit ?? 0) >= 0 ? 'text-indigo-600 bg-indigo-50' : 'text-red-600 bg-red-50', sub: 'Ganancia bruta - gastos' },
          ].map(card => {
            const Icon = card.icon
            return (
              <div key={card.label} className="card p-5">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-xs text-gray-500">{card.label}</p>
                  <div className={`p-2 rounded-lg ${card.color}`}>
                    <Icon size={14} />
                  </div>
                </div>
                <p className="text-xl font-bold text-gray-900">{card.value}</p>
                <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
              </div>
            )
          })}
        </div>

        {/* Area chart */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Ventas vs Gastos</h2>
          {chart && chart.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="gVentas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gGastos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip formatter={(v: number) => formatCurrency(v, cur)} labelFormatter={l => l} />
                <Legend />
                <Area type="monotone" dataKey="ventas" stroke="#3b82f6" fill="url(#gVentas)" strokeWidth={2} name="Ventas" />
                <Area type="monotone" dataKey="gastos" stroke="#ef4444" fill="url(#gGastos)" strokeWidth={2} name="Gastos" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos en el período</div>
          )}
        </div>

        {/* Top products */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Productos más vendidos</h2>
          {topProducts && topProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProducts.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#94a3b8' }} width={120} />
                <Tooltip formatter={(v: number) => [v, 'Unidades vendidas']} />
                <Bar dataKey="totalQty" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Unidades" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-400 text-sm">Sin ventas en el período</div>
          )}
        </div>
      </div>
    </div>
  )
}
