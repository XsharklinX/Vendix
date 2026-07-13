import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Search, LayoutDashboard, ShoppingCart, ArrowLeftRight, BarChart3,
  Package, FileText, Users, Truck, Settings, Briefcase, Wallet,
  CreditCard, Printer, Shield, CalendarCheck, WifiOff, User as UserIcon,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useCommandPaletteStore } from '@/store/commandPalette'

interface Product { id: string; name: string; sku?: string }
interface Client { id: string; name: string }

interface PaletteItem {
  id: string
  label: string
  hint?: string
  icon: typeof Search
  to: string
}

export function CommandPalette() {
  const navigate = useNavigate()
  const { user, business } = useAuthStore()
  const isOwner = user?.role !== 'CASHIER'
  const bid = business?.id ?? ''
  const { open, setOpen } = useCommandPaletteStore()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useCommandPaletteStore.getState().toggle()
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [setOpen])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products', bid],
    queryFn: () => api.get(`/businesses/${bid}/products`).then(r => r.data),
    enabled: open && !!bid,
    staleTime: 60_000,
  })

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients', bid],
    queryFn: () => api.get(`/businesses/${bid}/clients`).then(r => r.data),
    enabled: open && !!bid && isOwner,
    staleTime: 60_000,
  })

  const navItems: PaletteItem[] = useMemo(() => [
    { id: 'nav-dashboard', label: 'Inicio', icon: LayoutDashboard, to: '/' },
    ...(isOwner ? [{ id: 'nav-planner', label: 'Mi semana', icon: CalendarCheck, to: '/planner' }] : []),
    { id: 'nav-vender', label: 'Vender', icon: ShoppingCart, to: '/vender' },
    { id: 'nav-caja', label: 'Caja', icon: Wallet, to: '/caja' },
    { id: 'nav-cola-offline', label: 'Cola offline', icon: WifiOff, to: '/cola-offline' },
    ...(isOwner ? [
      { id: 'nav-movimientos', label: 'Movimientos', icon: ArrowLeftRight, to: '/movimientos' },
      { id: 'nav-estadisticas', label: 'Estadísticas', icon: BarChart3, to: '/estadisticas' },
    ] : []),
    { id: 'nav-inventario', label: 'Inventario', icon: Package, to: '/inventario' },
    ...(isOwner ? [
      { id: 'nav-cotizaciones', label: 'Cotizaciones', icon: FileText, to: '/cotizaciones' },
      { id: 'nav-cuentas-cobrar', label: 'Lo que te deben', icon: CreditCard, to: '/cuentas-cobrar' },
      { id: 'nav-reportes', label: 'Reportes', icon: Printer, to: '/reportes' },
      { id: 'nav-clientes', label: 'Clientes', icon: Users, to: '/clientes' },
      { id: 'nav-proveedores', label: 'Proveedores', icon: Truck, to: '/proveedores' },
      { id: 'nav-ordenes-compra', label: 'Ordenes de compra', icon: Package, to: '/ordenes-compra' },
      { id: 'nav-empleados', label: 'Empleados', icon: Briefcase, to: '/empleados' },
      { id: 'nav-configuraciones', label: 'Configuraciones', icon: Settings, to: '/configuraciones' },
      { id: 'nav-auditoria', label: 'Auditoría', icon: Shield, to: '/auditoria' },
    ] : []),
  ], [isOwner])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return navItems

    const matchedNav = navItems.filter(i => i.label.toLowerCase().includes(q))

    const matchedProducts: PaletteItem[] = products
      .filter(p => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
      .slice(0, 5)
      .map(p => ({ id: `product-${p.id}`, label: p.name, hint: p.sku ? `SKU ${p.sku} · Inventario` : 'Inventario', icon: Package, to: '/inventario' }))

    const matchedClients: PaletteItem[] = clients
      .filter(c => c.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map(c => ({ id: `client-${c.id}`, label: c.name, hint: 'Cliente', icon: UserIcon, to: '/clientes' }))

    return [...matchedNav, ...matchedProducts, ...matchedClients]
  }, [query, navItems, products, clients])

  useEffect(() => setActiveIndex(0), [query])

  const select = (item: PaletteItem) => {
    navigate(item.to)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[activeIndex]) select(results[activeIndex])
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Búsqueda rápida" className="relative w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 overflow-hidden animate-fade-in">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <Search size={16} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar páginas, productos, clientes…"
            className="flex-1 text-sm outline-none placeholder:text-gray-400 dark:text-slate-500"
          />
          <kbd className="hidden sm:inline text-[10px] font-semibold text-gray-400 dark:text-slate-500 border border-gray-200 dark:border-slate-600 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400 dark:text-slate-500">Sin resultados</div>
          ) : results.map((item, i) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => select(item)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === activeIndex ? 'bg-blue-50 dark:bg-blue-950/40' : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                  <Icon size={14} className="text-gray-500 dark:text-slate-400" />
                </div>
                <span className="flex-1 text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{item.label}</span>
                {item.hint && <span className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">{item.hint}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
