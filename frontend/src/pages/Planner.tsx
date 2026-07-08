import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { formatCurrency } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  CalendarCheck, MessageCircle, ArrowRight, Package,
  CheckCircle2, AlertTriangle, Clock, ShoppingBag, FileText,
  Users, Truck, Wallet
} from 'lucide-react'
import { format, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

interface Client { id: string; name: string; phone?: string; pendingDebt: number }
interface Supplier { id: string; name: string; phone?: string; pendingDebt: number }
interface Product { id: string; name: string; quantity: number; price: number }
interface Quote { id: string; clientName?: string; total: number; status: string; createdAt: string; validUntil?: string | null; client?: { name: string; phone?: string } }
interface CashSession { status: string; openedAt?: string }
interface CrmReminder { id: string; content: string; dueAt: string; status: string; client: { id: string; name: string; phone?: string } }

function SectionHeader({ icon, title, count, color }: {
  icon: React.ReactNode; title: string; count?: number; color: string
}) {
  return (
    <div className={`flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50/60`}>
      <span className={color}>{icon}</span>
      <h2 className="font-bold text-gray-900 text-sm flex-1">{title}</h2>
      {count !== undefined && (
        <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </div>
  )
}

function EmptySection({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 px-5 py-4">
      <CheckCircle2 size={15} className="text-green-500 flex-shrink-0" />
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  )
}

export function Planner() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const lowStockThreshold = business?.lowStockThreshold ?? 5
  const qc = useQueryClient()

  const today = new Date()

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients', bid],
    queryFn: () => api.get(`/businesses/${bid}/clients`).then(r => r.data),
    enabled: !!bid, staleTime: 60_000,
  })

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers', bid],
    queryFn: () => api.get(`/businesses/${bid}/suppliers`).then(r => r.data),
    enabled: !!bid, staleTime: 60_000,
  })

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products', bid],
    queryFn: () => api.get(`/businesses/${bid}/products`).then(r => r.data),
    enabled: !!bid, staleTime: 60_000,
  })

  const { data: quotes = [] } = useQuery<Quote[]>({
    queryKey: ['quotes', bid],
    queryFn: () => api.get(`/businesses/${bid}/quotes`, { params: { status: 'PENDING' } }).then(r => r.data),
    enabled: !!bid, staleTime: 60_000,
  })

  const { data: crmReminders = [] } = useQuery<CrmReminder[]>({
    queryKey: ['crm-reminders', bid],
    queryFn: () => api.get(`/businesses/${bid}/clients/crm/reminders`).then(r => r.data),
    enabled: !!bid, staleTime: 60_000,
  })

  const { data: cashSession } = useQuery<CashSession | null>({
    queryKey: ['cash-session', bid],
    queryFn: () => api.get(`/businesses/${bid}/transactions/cash-session/current`).then(r => r.data),
    enabled: !!bid, staleTime: 30_000,
  })

  const markPaidMutation = useMutation({
    mutationFn: (clientId: string) => api.post(`/businesses/${bid}/transactions/mark-paid/${clientId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients', bid] })
      toast.success('Marcado como pagado')
    },
    onError: () => toast.error('No se pudo marcar como pagado'),
  })

  const debtClients = clients.filter(c => c.pendingDebt > 0).sort((a, b) => b.pendingDebt - a.pendingDebt)
  const debtSuppliers = suppliers.filter(s => s.pendingDebt > 0).sort((a, b) => b.pendingDebt - a.pendingDebt)
  const lowStock = products.filter(p => p.quantity >= 0 && p.quantity <= lowStockThreshold).sort((a, b) => a.quantity - b.quantity)
  const outOfStock = lowStock.filter(p => p.quantity === 0)
  const almostOut = lowStock.filter(p => p.quantity > 0)
  const pendingQuotes = quotes.filter(q => q.status === 'PENDING')
  const expiringQuotes = pendingQuotes.filter(q => {
    if (!q.validUntil) return false
    const diffDays = Math.ceil((new Date(q.validUntil).getTime() - today.getTime()) / 86_400_000)
    return diffDays <= 7
  })

  const totalPendingDebt = debtClients.reduce((s, c) => s + c.pendingDebt, 0)
  const totalSupplierDebt = debtSuppliers.reduce((s, c) => s + c.pendingDebt, 0)

  const allClear = debtClients.length === 0 && debtSuppliers.length === 0 && lowStock.length === 0 && pendingQuotes.length === 0 && crmReminders.length === 0

  const dayName = format(today, "EEEE d 'de' MMMM", { locale: es })
  const dayCapitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1)

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Mi semana"
        subtitle={dayCapitalized}
        icon={<CalendarCheck size={18} className="text-blue-500" />}
      />

      <div className="p-6 space-y-4">
        {/* Banner de estado general */}
        {allClear ? (
          <div className="card p-4 flex items-center gap-3 bg-green-50 border-green-100">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={20} className="text-green-600" />
            </div>
            <div>
              <p className="font-bold text-green-800">¡Todo al día!</p>
              <p className="text-sm text-green-600">No hay tareas pendientes para hoy.</p>
            </div>
          </div>
        ) : (
          <div className="card p-4 flex items-center gap-3 bg-amber-50 border-amber-100">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-amber-800">
                {[
                  debtClients.length > 0 && `${debtClients.length} cobro${debtClients.length > 1 ? 's' : ''} pendiente${debtClients.length > 1 ? 's' : ''}`,
                  debtSuppliers.length > 0 && `${debtSuppliers.length} pago${debtSuppliers.length > 1 ? 's' : ''} a proveedores`,
                  outOfStock.length > 0 && `${outOfStock.length} producto${outOfStock.length > 1 ? 's' : ''} agotado${outOfStock.length > 1 ? 's' : ''}`,
                  pendingQuotes.length > 0 && `${pendingQuotes.length} presupuesto${pendingQuotes.length > 1 ? 's' : ''} sin respuesta`,
                ].filter(Boolean).join(' · ')}
              </p>
              <p className="text-xs text-amber-600 mt-0.5">Atiende estos puntos para tener el día completo.</p>
            </div>
          </div>
        )}

        {/* Estado de caja */}
        <div className="card overflow-hidden">
          <SectionHeader icon={<Wallet size={15} />} title="Caja" color="text-emerald-600" />
          <div className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${cashSession?.status === 'OPEN' ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {cashSession?.status === 'OPEN' ? 'Caja abierta' : 'Caja cerrada'}
                </p>
                {cashSession?.status === 'OPEN' && cashSession.openedAt && (
                  <p className="text-xs text-gray-400">Desde {format(new Date(cashSession.openedAt), 'h:mm a')}</p>
                )}
              </div>
            </div>
            <Link to="/caja" className="btn-secondary text-xs px-3 py-1.5">
              {cashSession?.status === 'OPEN' ? 'Ver caja' : 'Abrir caja'} <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        <div className="card overflow-hidden">
          <SectionHeader
            icon={<CalendarCheck size={15} />}
            title="Seguimientos CRM"
            count={crmReminders.length}
            color="text-pink-500"
          />
          {crmReminders.length === 0 ? (
            <EmptySection text="No hay recordatorios CRM pendientes en los próximos 14 días." />
          ) : (
            <div className="divide-y divide-gray-50">
              {crmReminders.slice(0, 8).map(reminder => (
                <div key={reminder.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/70 transition-colors">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${reminder.status === 'OVERDUE' ? 'bg-red-100' : 'bg-pink-100'}`}>
                    <CalendarCheck size={15} className={reminder.status === 'OVERDUE' ? 'text-red-600' : 'text-pink-600'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{reminder.client.name}</p>
                    <p className="text-xs text-gray-500 truncate">{reminder.content}</p>
                    <p className={`text-[11px] font-semibold ${reminder.status === 'OVERDUE' ? 'text-red-500' : 'text-pink-500'}`}>
                      {reminder.status === 'OVERDUE' ? 'Vencido' : 'Pendiente'} · {format(new Date(reminder.dueAt), 'dd MMM h:mm a', { locale: es })}
                    </p>
                  </div>
                  {reminder.client.phone && (
                    <a
                      href={`https://wa.me/${reminder.client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${reminder.client.name}, queríamos dar seguimiento: ${reminder.content}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-green-100 hover:bg-green-200 transition-colors"
                    >
                      <MessageCircle size={13} className="text-green-700" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lo que te deben */}
        <div className="card overflow-hidden">
          <SectionHeader
            icon={<Users size={15} />}
            title="Lo que te deben"
            count={debtClients.length}
            color="text-red-500"
          />
          {debtClients.length === 0 ? (
            <EmptySection text="Ningún cliente te debe dinero hoy." />
          ) : (
            <div>
              {/* Resumen total */}
              <div className="px-5 py-3 bg-red-50/60 flex items-center justify-between border-b border-red-100/60">
                <p className="text-xs text-red-600 font-medium">Total pendiente de cobro</p>
                <p className="text-sm font-black text-red-600">{formatCurrency(totalPendingDebt, cur)}</p>
              </div>
              <div className="divide-y divide-gray-50">
                {debtClients.slice(0, 8).map(client => (
                  <div key={client.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/70 transition-colors group">
                    <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-red-600 font-bold text-sm">{client.name[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{client.name}</p>
                      {client.phone && <p className="text-xs text-gray-400">{client.phone}</p>}
                    </div>
                    <p className="text-sm font-black text-red-600 flex-shrink-0">{formatCurrency(client.pendingDebt, cur)}</p>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      {client.phone && (
                        <a
                          href={`https://wa.me/${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${client.name}, te recordamos que tienes una deuda pendiente de ${formatCurrency(client.pendingDebt, cur)}. ¡Gracias!`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-green-100 hover:bg-green-200 transition-colors"
                          title="Recordar por WhatsApp"
                        >
                          <MessageCircle size={13} className="text-green-700" />
                        </a>
                      )}
                      <button
                        onClick={() => markPaidMutation.mutate(client.id)}
                        className="p-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 transition-colors"
                        title="Marcar como pagado"
                      >
                        <CheckCircle2 size={13} className="text-blue-700" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {debtClients.length > 8 && (
                <Link to="/cuentas-cobrar" className="flex items-center justify-center gap-1.5 py-3 text-xs text-blue-500 hover:bg-gray-50 transition-colors border-t border-gray-100">
                  Ver {debtClients.length - 8} más <ArrowRight size={11} />
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Lo que debes */}
        <div className="card overflow-hidden">
          <SectionHeader
            icon={<Truck size={15} />}
            title="Lo que debes a proveedores"
            count={debtSuppliers.length}
            color="text-orange-500"
          />
          {debtSuppliers.length === 0 ? (
            <EmptySection text="No tienes pagos pendientes con proveedores." />
          ) : (
            <div>
              <div className="px-5 py-3 bg-orange-50/60 flex items-center justify-between border-b border-orange-100/60">
                <p className="text-xs text-orange-600 font-medium">Total que les debes</p>
                <p className="text-sm font-black text-orange-600">{formatCurrency(totalSupplierDebt, cur)}</p>
              </div>
              <div className="divide-y divide-gray-50">
                {debtSuppliers.slice(0, 5).map(supplier => (
                  <div key={supplier.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/70 transition-colors">
                    <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-orange-600 font-bold text-sm">{supplier.name[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{supplier.name}</p>
                      {supplier.phone && <p className="text-xs text-gray-400">{supplier.phone}</p>}
                    </div>
                    <p className="text-sm font-black text-orange-600 flex-shrink-0">{formatCurrency(supplier.pendingDebt, cur)}</p>
                  </div>
                ))}
              </div>
              {debtSuppliers.length > 5 && (
                <Link to="/proveedores" className="flex items-center justify-center gap-1.5 py-3 text-xs text-blue-500 hover:bg-gray-50 transition-colors border-t border-gray-100">
                  Ver {debtSuppliers.length - 5} más <ArrowRight size={11} />
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Inventario crítico */}
        {lowStock.length > 0 && (
          <div className="card overflow-hidden">
            <SectionHeader
              icon={<Package size={15} />}
              title="Inventario crítico"
              count={lowStock.length}
              color="text-amber-500"
            />
            <div className="divide-y divide-gray-50">
              {outOfStock.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Package size={15} className="text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-red-500 font-medium">Agotado</p>
                  </div>
                  <Link to="/inventario" className="text-xs text-blue-500 hover:underline flex-shrink-0">
                    Reabastecer →
                  </Link>
                </div>
              ))}
              {almostOut.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Package size={15} className="text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-amber-600 font-medium">Solo {p.quantity} en stock</p>
                  </div>
                  <Link to="/inventario" className="text-xs text-blue-500 hover:underline flex-shrink-0">
                    Reabastecer →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {expiringQuotes.length > 0 && (
          <div className="card overflow-hidden">
            <SectionHeader
              icon={<FileText size={15} />}
              title="Cotizaciones por vencer"
              count={expiringQuotes.length}
              color="text-yellow-500"
            />
            <div className="divide-y divide-gray-50">
              {expiringQuotes.slice(0, 6).map(q => {
                const daysToExpire = q.validUntil ? Math.ceil((new Date(q.validUntil).getTime() - today.getTime()) / 86_400_000) : 0
                return (
                  <div key={q.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/70 transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
                      <FileText size={15} className="text-yellow-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{q.client?.name || q.clientName || 'Sin cliente'}</p>
                      <p className="text-xs text-yellow-600 font-medium">
                        Vence {daysToExpire <= 0 ? 'hoy' : `en ${daysToExpire} día${daysToExpire !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-gray-700 flex-shrink-0">{formatCurrency(q.total, cur)}</p>
                    <Link to="/cotizaciones" className="text-xs text-blue-500 hover:underline flex-shrink-0">Ver →</Link>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Presupuestos pendientes de respuesta */}
        {pendingQuotes.length > 0 && (
          <div className="card overflow-hidden">
            <SectionHeader
              icon={<FileText size={15} />}
              title="Presupuestos sin respuesta"
              count={pendingQuotes.length}
              color="text-yellow-500"
            />
            <div className="divide-y divide-gray-50">
              {pendingQuotes.slice(0, 5).map(q => {
                const daysAgo = Math.floor((today.getTime() - new Date(q.createdAt).getTime()) / 86_400_000)
                const isStale = daysAgo >= 3
                return (
                  <div key={q.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/70 transition-colors">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0
                      ${isStale ? 'bg-red-100' : 'bg-yellow-100'}`}>
                      <FileText size={15} className={isStale ? 'text-red-500' : 'text-yellow-600'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{q.clientName || 'Sin cliente'}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={10} />
                        {isToday(new Date(q.createdAt)) ? 'Hoy' : `Hace ${daysAgo} día${daysAgo > 1 ? 's' : ''}`}
                        {isStale && <span className="text-red-400 font-medium ml-1">· Sin respuesta</span>}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-gray-700 flex-shrink-0">{formatCurrency(q.total, cur)}</p>
                    <Link to="/cotizaciones" className="text-xs text-blue-500 hover:underline flex-shrink-0">
                      Ver →
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: '/vender', icon: ShoppingBag, label: 'Nueva venta', color: 'text-green-600', bg: 'bg-green-50' },
            { to: '/movimientos', icon: ArrowRight, label: 'Ver movimientos', color: 'text-purple-600', bg: 'bg-purple-50' },
            { to: '/inventario', icon: Package, label: 'Inventario', color: 'text-cyan-600', bg: 'bg-cyan-50' },
            { to: '/cotizaciones', icon: FileText, label: 'Nuevo presupuesto', color: 'text-yellow-600', bg: 'bg-yellow-50' },
          ].map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={`card p-4 flex flex-col items-center gap-2 text-center hover:shadow-md transition-shadow ${item.bg} border-0`}
            >
              <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center`}>
                <item.icon size={18} className={item.color} />
              </div>
              <p className={`text-xs font-semibold ${item.color}`}>{item.label}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
