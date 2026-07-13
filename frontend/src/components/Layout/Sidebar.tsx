import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, ArrowLeftRight, BarChart3,
  Package, FileText, Users, Truck, Settings, LogOut,
  ChevronDown, Plus, Briefcase, TrendingUp, Wallet,
  CreditCard, X, Building2, Printer, Shield, CalendarCheck, WifiOff, Search, HelpCircle
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useState } from 'react'
import { countOfflineSales } from '@/lib/offlineQueue'
import { NotificationBell } from '@/components/ui/NotificationBell'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useCommandPaletteStore } from '@/store/commandPalette'
import { useHelpCenterStore } from '@/store/helpCenter'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

interface Product { id: string; quantity: number; lowStockThreshold?: number | null }
interface CashSession { status: string }

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, business, businesses, setBusiness, logout } = useAuthStore()
  const isOwner = user?.role !== 'CASHIER'
  const bid = business?.id ?? ''
  const [bizOpen, setBizOpen] = useState(false)
  const openCommandPalette = useCommandPaletteStore(s => s.setOpen)
  const openHelpCenter = useHelpCenterStore(s => s.setOpen)

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

  const { data: offlinePending = 0 } = useQuery({
    queryKey: ['offline-pending', bid],
    queryFn: () => countOfflineSales(bid),
    enabled: !!bid,
    refetchInterval: 10_000,
  })

  const defaultThreshold = business?.lowStockThreshold ?? 5
  const lowStockCount = products.filter(p => p.quantity >= 0 && p.quantity <= (p.lowStockThreshold ?? defaultThreshold)).length
  const cajaOpen = cashSession?.status === 'OPEN'

  // Badge del Planner: tareas pendientes (stock crítico)
  const plannerBadge = lowStockCount > 0 ? lowStockCount : null

  const navSections = [
    {
      section: 'GESTIONA TU NEGOCIO',
      items: [
        { to: '/', icon: LayoutDashboard, label: 'Inicio', color: 'text-blue-500 dark:text-blue-400' },
        ...(isOwner ? [{ to: '/planner', icon: CalendarCheck, label: 'Mi semana', color: 'text-blue-500 dark:text-blue-400', badge: plannerBadge, badgeColor: 'bg-amber-500' }] : []),
        { to: '/vender', icon: ShoppingCart, label: 'Vender', color: 'text-green-500 dark:text-green-400' },
        { to: '/caja', icon: Wallet, label: 'Caja', color: 'text-green-500 dark:text-green-400', badge: cajaOpen ? '●' : null, badgeColor: 'bg-green-500' },
        ...(offlinePending > 0 ? [{ to: '/cola-offline', icon: WifiOff, label: 'Cola offline', color: 'text-orange-500 dark:text-orange-400', badge: offlinePending, badgeColor: 'bg-orange-500' }] : []),
        ...(isOwner ? [
          { to: '/movimientos', icon: ArrowLeftRight, label: 'Movimientos', color: 'text-blue-500 dark:text-blue-400' },
          { to: '/estadisticas', icon: BarChart3, label: 'Estadísticas', color: 'text-green-500 dark:text-green-400' },
        ] : []),
        { to: '/inventario', icon: Package, label: 'Inventario', color: 'text-blue-500 dark:text-blue-400', badge: lowStockCount > 0 ? lowStockCount : null, badgeColor: 'bg-red-500' },
        ...(isOwner ? [
          { to: '/cotizaciones', icon: FileText, label: 'Cotizaciones', color: 'text-amber-500 dark:text-amber-400' },
          { to: '/cuentas-cobrar', icon: CreditCard, label: 'Lo que te deben', color: 'text-red-500 dark:text-red-400' },
          { to: '/reportes', icon: Printer, label: 'Reportes', color: 'text-amber-500 dark:text-amber-400' },
        ] : []),
      ],
    },
    ...(isOwner ? [{
      section: 'CONTACTOS',
      items: [
        { to: '/clientes', icon: Users, label: 'Clientes', color: 'text-pink-500 dark:text-pink-400' },
        { to: '/proveedores', icon: Truck, label: 'Proveedores', color: 'text-teal-500 dark:text-teal-400' },
        { to: '/ordenes-compra', icon: Package, label: 'Ordenes de compra', color: 'text-teal-500 dark:text-teal-400', badge: lowStockCount > 0 ? lowStockCount : null, badgeColor: 'bg-amber-500' },
        { to: '/empleados', icon: Briefcase, label: 'Empleados', color: 'text-pink-500 dark:text-pink-400' },
      ],
    }] : []),
    ...(isOwner ? [{
      section: 'CUENTA',
      items: [
        { to: '/configuraciones', icon: Settings, label: 'Configuraciones', color: 'text-gray-500 dark:text-slate-400' },
        { to: '/auditoria', icon: Shield, label: 'Auditoría', color: 'text-gray-500 dark:text-slate-400' },
      ],
    }] : []),
  ]

  return (
    <aside aria-label="Menú de navegación" className={`
      fixed lg:sticky inset-y-0 left-0 z-50
      w-64 bg-white dark:bg-slate-800 border-r border-gray-100 dark:border-slate-700 flex flex-col h-screen shadow-sm
      transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
    `}>
      {/* Header */}
      <div className="px-5 py-5 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-sm shadow-blue-300">
            <TrendingUp size={20} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-gray-900 dark:text-slate-100 text-base">Vendix</span>
            <p className="text-xs text-gray-400 dark:text-slate-500">Gestión de ventas</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="hidden lg:block"><NotificationBell /></div>
          <ThemeToggle />
          <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700" aria-label="Cerrar menú">
            <X size={16} className="text-gray-500 dark:text-slate-400" />
          </button>
        </div>
      </div>

      {/* Selector de negocio */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700">
        <button
          onClick={() => setBizOpen(!bizOpen)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors group"
        >
          <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-white font-bold text-sm">{business?.name?.[0]?.toUpperCase()}</span>
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{business?.name}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 truncate">
              {business?.type ? `${business.type}${business?.city ? ` · ${business.city}` : ''}` : user?.name}
            </p>
          </div>
          <ChevronDown size={15} className={`text-gray-400 dark:text-slate-500 transition-transform duration-200 flex-shrink-0 ${bizOpen ? 'rotate-180' : ''}`} />
        </button>

        {bizOpen && (
          <div className="mt-2 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden animate-fade-in">
            <div className="px-3 py-2 border-b border-gray-50 dark:border-slate-800">
              <p className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-widest">Mis negocios</p>
            </div>
            {businesses.map(b => (
              <button
                key={b.id}
                onClick={() => { setBusiness(b); setBizOpen(false); onClose() }}
                className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2.5
                  ${b.id === business?.id ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-slate-300'}`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0
                  ${b.id === business?.id ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300'}`}>
                  {b.name[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className={`font-semibold truncate ${b.id === business?.id ? 'text-blue-700 dark:text-blue-300' : ''}`}>{b.name}</p>
                  {(b as { type?: string }).type && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{(b as { type?: string }).type}</p>
                  )}
                </div>
                {b.id === business?.id && <span className="ml-auto text-blue-400 dark:text-blue-400 text-xs">✓</span>}
              </button>
            ))}
            <NavLink
              to="/configuraciones"
              onClick={() => { setBizOpen(false); onClose() }}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 border-t border-gray-100 dark:border-slate-700 font-medium"
            >
              <Plus size={14} />
              Agregar negocio
            </NavLink>
          </div>
        )}
      </div>

      {/* Búsqueda global + ayuda */}
      <div className="px-4 pt-3 flex items-center gap-2">
        <button
          onClick={() => openCommandPalette(true)}
          className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-left"
        >
          <Search size={14} className="text-gray-400 dark:text-slate-500" />
          <span className="flex-1 text-sm text-gray-400 dark:text-slate-500">Buscar...</span>
          <kbd className="hidden xl:inline text-[10px] font-semibold text-gray-400 dark:text-slate-500 border border-gray-200 dark:border-slate-600 rounded px-1.5 py-0.5 bg-white dark:bg-slate-800">Ctrl K</kbd>
        </button>
        <button
          onClick={() => openHelpCenter(true)}
          aria-label="Centro de ayuda"
          title="Centro de ayuda"
          className="flex-shrink-0 p-2 rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        >
          <HelpCircle size={16} className="text-gray-400 dark:text-slate-500" />
        </button>
      </div>

      {/* Estado de caja */}
      {cajaOpen !== undefined && (
        <div className={`mx-3 mt-2 px-3 py-2 rounded-xl flex items-center gap-2 text-xs font-medium ${cajaOpen ? 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300' : 'bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-slate-400'}`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cajaOpen ? 'bg-green-500 animate-pulse' : 'bg-gray-300 dark:bg-slate-600'}`} />
          {cajaOpen ? 'Caja abierta' : 'Caja cerrada'}
          <NavLink to="/caja" onClick={onClose} className="ml-auto text-blue-500 dark:text-blue-400 hover:underline">
            {cajaOpen ? 'Ver' : 'Abrir'}
          </NavLink>
        </div>
      )}

      {/* Navegación */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
        {navSections.map((section) => (
          <div key={section.section}>
            <p className="px-4 mb-1.5 text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">
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
                          ${isActive ? 'bg-white/20' : 'bg-gray-100 dark:bg-slate-700 group-hover:bg-gray-200 dark:group-hover:bg-slate-600'}`}>
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
      <div className="p-3 border-t border-gray-100 dark:border-slate-700 space-y-1">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-7 h-7 bg-gradient-to-br from-gray-400 dark:from-slate-500 to-gray-600 dark:to-slate-300 rounded-full flex items-center justify-center">
            <Building2 size={13} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-700 dark:text-slate-300 truncate">{user?.name}</p>
            <p className="text-[10px] text-gray-400 dark:text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full nav-item nav-item-inactive text-red-400 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400"
        >
          <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
            <LogOut size={14} className="text-red-500 dark:text-red-400" />
          </div>
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
