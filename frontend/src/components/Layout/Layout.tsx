import { useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { Menu, TrendingUp } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useAuthStore } from '@/store/auth'
import { NotificationBell } from '@/components/ui/NotificationBell'
import { PlanLimitModal } from '@/components/ui/PlanLimitModal'
import { usePlanLimit } from '@/hooks/usePlanLimit'

export function Layout() {
  const { token, business } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const planLimit = usePlanLimit()

  if (!token) return <Navigate to="/login" replace />
  if (!business) return <Navigate to="/login" replace />

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto min-w-0 flex flex-col">
        {/* Barra móvil */}
        <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu size={20} className="text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
              <TrendingUp size={14} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 text-sm">Vendix</span>
          </div>
          <span className="text-gray-300 text-sm">·</span>
          <span className="text-sm text-gray-500 truncate flex-1">{business.name}</span>
          <NotificationBell />
        </div>

        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>

      <PlanLimitModal open={planLimit.open} onClose={planLimit.close} message={planLimit.message} />
    </div>
  )
}
