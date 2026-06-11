import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, ArrowLeftRight, BarChart3,
  Package, FileText, Users, Truck, Settings, LogOut,
  ChevronDown, Plus, Briefcase, TrendingUp, Wallet,
  CreditCard, X, Building2, Printer, Shield, Sparkles, CalendarCheck
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useState } from 'react'
import { NotificationBell } from '@/components/ui/NotificationBell'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

interface Product { id: string; quantity: number }
interface CashSession { status: string }

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, business, businesses, setBusiness, logout } = useAuthStore()
  const isOwner = user?.role !== 'CASHIER'
  const bid = business?.id ?? ''
  const [bizOpen, setBizOpen] = useState(false)

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products', bid],
    queryFn: () => api.get(`/businesses/${bid}/products`).then(r => r.data),
    enabled: !!bid,
    staleTime: 60_000,
  })

  const { data: cashSession } = useQuery<CashSession | null>({
    queryKey: ['cash-session', bid],
    queryFn: () => api.get(`/businesses/${bid}/transactions/cash-session/current`).then(r => r.data),
    enabled: !!bid,
    staleTime: 30_000,
  })

  const threshold = 5
  const lowStockCount = products.filter(p => p.quantity >= 0 && p.quantity <= threshold).length
  const cajaOpen = cashSession?.status === 'OPEN'

  // Badge del Planner: tareas pendientes (stock crítico)
  const plannerBadge = lowStockCount > 0 ? lowStockCount : null

  const navSections = [
    {
      section: 'GESTIONA TU NEGOCIO',
      items: [
        { to: '/', icon: LayoutDashboard, label: 'Inicio', color: 'text-blue-500' },
        ...(isOwner ? [{ to: '/planner', icon: CalendarCheck, label: 'Mi semana', color: 'text-blue-500', badge: plannerBadge, badgeColor: 'bg-amber-500' }] : []),
        { to: '/vender', icon: ShoppingCart, label: 'Vender', color: 'text-green-500' },
        { to: '/caja', icon: Wallet, label: 'Caja', color: 'text-emerald-500', badge: cajaOpen ? '●' : null, badgeColor: 'bg-green-500' },
        ...(isOwner ? [
          { to: '/movimientos', icon: ArrowLeftRight, label: 'Movimientos', color: 'text-purple-500' },
          { to: '/estadisticas', icon: BarChart3, label: 'Estadísticas', color: 'text-orange-500' },
        ] : []),
        { to: '/inventario', icon: Package, label: 'Inventario', color: 'text-cyan-500', badge: lowStockCount > 0 ? lowStockCount : null, badgeColor: 'bg-red-500' },
        ...(isOwner ? [
          { to: '/cotizaciones', icon: FileText, label: 'Cotizaciones', color: 'text-yellow-500' },
          { to: '/cuentas-cobrar', icon: CreditCard, label: 'Lo que te deben', color: 'text-red-500' },
          { to: '/reportes', icon: Printer, label: 'Reportes', color: 'text-indigo-500' },
          { to: '/asistente-ia', icon: Sparkles, label: 'Asistente IA', color: 'text-violet-500' },
        ] : []),
      ],
    },
    ...(isOwner ? [{
      section: 'CONTACTOS',
      items: [
        { to: '/clientes', icon: Users, label: 'Clientes', color: 'text-pink-500' },
        { to: '/proveedores', icon: Truck, label: 'Proveedores', color: 'text-teal-500' },
        { to: '/ordenes-compra', icon: Package, label: 'Ordenes de compra', color: 'text-emerald-500', badge: lowStockCount > 0 ? lowStockCount : null, badgeColor: 'bg-amber-500' },
        { to: '/empleados', icon: Briefcase, label: 'Empleados', color: 'text-indigo-500' },
      ],
    }] : []),
    ...(isOwner ? [{
      section: 'CUENTA',
      items: [
        { to: '/configuraciones', icon: Settings, label: 'Configuraciones', color: 'text-gray-500' },
        { to: '/auditoria', icon: Shield, label: 'Auditoría', color: 'text-purple-500' },
      ],
    }] : []),
  ]

  return (
    <aside className={`
      fixed lg:sticky inset-y-0 left-0 z-50
      w-64 bg-white border-r border-gray-100 flex flex-col h-screen shadow-sm
      transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
    `}>
      {/* Header */}
      <div className="px-5 py-5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-sm shadow-blue-300">
            <TrendingUp size={20} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-gray-900 text-base">Vendix</span>
            <p className="text-xs text-gray-400">Gestión de ventas</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="hidden lg:block"><NotificationBell /></div>
          <ThemeToggle />
          <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
            <X size={16} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Selector de negocio */}
      <div className="px-4 py-3 border-b border-gray-100">
        <button
          onClick={() => setBizOpen(!bizOpen)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group"
        >
          <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-white font-bold text-sm">{business?.name?.[0]?.toUpperCase()}</span>
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{business?.name}</p>
            <p className="text-xs text-gray-400 truncate">
              {business?.type ? `${business.type}${business?.city ? ` · ${business.city}` : ''}` : user?.name}
            </p>
          </div>
          <ChevronDown size={15} className={`text-gray-400 transition-transform duration-200 flex-shrink-0 ${bizOpen ? 'rotate-180' : ''}`} />
        </button>

        {bizOpen && (
          <div className="mt-2 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden animate-fade-in">
            <div className="px-3 py-2 border-b border-gray-50">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Mis negocios</p>
            </div>
            {businesses.map(b => (
              <button
                key={b.id}
                onClick={() => { setBusiness(b); setBizOpen(false); onClose() }}
                className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors flex items-center gap-2.5
                  ${b.id === business?.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0
                  ${b.id === business?.id ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {b.name[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className={`font-semibold truncate ${b.id === business?.id ? 'text-blue-700' : ''}`}>{b.name}</p>
                  {(b as { type?: string }).type && (
                    <p className="text-xs text-gray-400 truncate">{(b as { type?: string }).type}</p>
                  )}
                </div>
                {b.id === business?.id && <span className="ml-auto text-blue-400 text-xs">✓</span>}
              </button>
            ))}
            <NavLink
              to="/configuraciones"
              onClick={() => { setBizOpen(false); onClose() }}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100 font-medium"
            >
              <Plus size={14} />
              Agregar negocio
            </NavLink>
          </div>
        )}
      </div>

      {/* Estado de caja */}
      {cajaOpen !== undefined && (
        <div className={`mx-3 mt-2 px-3 py-2 rounded-xl flex items-center gap-2 text-xs font-medium ${cajaOpen ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cajaOpen ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
          {cajaOpen ? 'Caja abierta' : 'Caja cerrada'}
          <NavLink to="/caja" onClick={onClose} className="ml-auto text-blue-500 hover:underline">
            {cajaOpen ? 'Ver' : 'Abrir'}
          </NavLink>
        </div>
      )}

      {/* Navegación */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
        {navSections.map((section) => (
          <div key={section.section}>
            <p className="px-4 mb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              {section.section}
            </p>
            <div className="space-y-0.5">
              {section.items.map(item => {
                const Icon = item.icon
                const badge = (item as { badge?: number | string | null }).badge
                const badgeColor = (item as { badgeColor?: string }).badgeColor ?? 'bg-red-500'
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `nav-item ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors
                          ${isActive ? 'bg-white/20' : 'bg-gray-100 group-hover:bg-gray-200'}`}>
                          <Icon size={15} className={isActive ? 'text-white' : item.color} />
                        </div>
                        <span className="flex-1">{item.label}</span>
                        {badge !== null && badge !== undefined && (
                          <span className={`${badgeColor} text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none`}>
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Usuario + cerrar sesión */}
      <div className="p-3 border-t border-gray-100 space-y-1">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-7 h-7 bg-gradient-to-br from-gray-400 to-gray-600 rounded-full flex items-center justify-center">
            <Building2 size={13} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-700 truncate">{user?.name}</p>
            <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full nav-item nav-item-inactive text-red-400 hover:bg-red-50 hover:text-red-600"
        >
          <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
            <LogOut size={14} className="text-red-500" />
          </div>
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
