import { Suspense, useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { Menu, TrendingUp } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useAuthStore } from '@/store/auth'
import { NotificationBell } from '@/components/ui/NotificationBell'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { PlanLimitModal } from '@/components/ui/PlanLimitModal'
import { CommandPalette } from '@/components/ui/CommandPalette'
import { HelpCenter } from '@/components/ui/HelpCenter'
import { TipOfTheDay } from '@/components/ui/TipOfTheDay'
import { DatabaseGuard } from '@/components/ui/DatabaseGuard'
import { usePlanLimit } from '@/hooks/usePlanLimit'

export function Layout() {
  const { token, business } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const planLimit = usePlanLimit()

  if (!token) return <Navigate to="/login" replace />
  if (!business) return <Navigate to="/login" replace />

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-slate-800">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold">
        Saltar al contenido
      </a>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto min-w-0 flex flex-col">
        {/* Barra móvil */}
        <div className="lg:hidden sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 px-4 py-3 flex items-center gap-3 shadow-sm flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu size={20} className="text-gray-600 dark:text-slate-300" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
              <TrendingUp size={14} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 dark:text-slate-100 text-sm">Vendix</span>
          </div>
          <span className="text-gray-300 dark:text-slate-600 text-sm">·</span>
          <span className="text-sm text-gray-500 dark:text-slate-400 truncate flex-1">{business.name}</span>
          <ThemeToggle />
          <NotificationBell />
        </div>

        <div id="main-content" className="flex-1 overflow-y-auto">
          <Suspense fallback={<ContentLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      <PlanLimitModal open={planLimit.open} onClose={planLimit.close} message={planLimit.message} />
      <CommandPalette />
      <HelpCenter />
      <TipOfTheDay />
      <DatabaseGuard />
    </div>
  )
}

// Indicador ligero para transiciones entre páginas: ocupa solo el área de
// contenido (Sidebar y barra superior permanecen visibles), evitando el
// "flash" de pantalla blanca completa.
function ContentLoader() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-200 dark:border-slate-600 border-t-blue-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-blue-400" />
    </div>
  )
}
