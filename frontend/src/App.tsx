import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { Layout } from '@/components/Layout/Layout'
import { Login } from '@/pages/auth/Login'
import { Register } from '@/pages/auth/Register'
import { ForgotPassword } from '@/pages/auth/ForgotPassword'
import { ResetPassword } from '@/pages/auth/ResetPassword'
import { VerifyEmail } from '@/pages/auth/VerifyEmail'
import { Onboarding } from '@/pages/Onboarding'
import { AuditLog } from '@/pages/AuditLog'
import { Dashboard } from '@/pages/Dashboard'
import { Vender } from '@/pages/Vender'
import { Movimientos } from '@/pages/Movimientos'
import { Estadisticas } from '@/pages/Estadisticas'
import { Inventario } from '@/pages/Inventario'
import { Cotizaciones } from '@/pages/Cotizaciones'
import { Clientes } from '@/pages/Clientes'
import { Proveedores } from '@/pages/Proveedores'
import { Empleados } from '@/pages/Empleados'
import { OrdenesCompra } from '@/pages/OrdenesCompra'
import { Configuraciones } from '@/pages/Configuraciones'
import { Caja } from '@/pages/Caja'
import { CuentasCobrar } from '@/pages/CuentasCobrar'
import { Reportes } from '@/pages/Reportes'
import { AiAssistant } from '@/pages/AiAssistant'
import { Planner } from '@/pages/Planner'
import { useAuthStore } from '@/store/auth'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // No reintentar en 401/403/404 — son errores definitivos
        const status = (error as { response?: { status?: number } })?.response?.status
        if (status === 401 || status === 403 || status === 404) return false
        return failureCount < 2
      },
      staleTime: 30_000,
    },
    mutations: {
      onError: (error) => {
        console.error('[query] mutation error:', error)
      },
    },
  },
})

// Protege rutas que los cajeros (CASHIER) no deben ver
function OwnerOnly({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.role === 'CASHIER') return <Navigate to="/vender" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<Layout />}>
            <Route path="/" element={<OwnerOnly><ErrorBoundary><Dashboard /></ErrorBoundary></OwnerOnly>} />
            <Route path="/vender" element={<ErrorBoundary><Vender /></ErrorBoundary>} />
            <Route path="/movimientos" element={<OwnerOnly><ErrorBoundary><Movimientos /></ErrorBoundary></OwnerOnly>} />
            <Route path="/estadisticas" element={<OwnerOnly><ErrorBoundary><Estadisticas /></ErrorBoundary></OwnerOnly>} />
            <Route path="/inventario" element={<OwnerOnly><ErrorBoundary><Inventario /></ErrorBoundary></OwnerOnly>} />
            <Route path="/cotizaciones" element={<OwnerOnly><ErrorBoundary><Cotizaciones /></ErrorBoundary></OwnerOnly>} />
            <Route path="/clientes" element={<OwnerOnly><ErrorBoundary><Clientes /></ErrorBoundary></OwnerOnly>} />
            <Route path="/proveedores" element={<OwnerOnly><ErrorBoundary><Proveedores /></ErrorBoundary></OwnerOnly>} />
            <Route path="/ordenes-compra" element={<OwnerOnly><ErrorBoundary><OrdenesCompra /></ErrorBoundary></OwnerOnly>} />
            <Route path="/empleados" element={<OwnerOnly><ErrorBoundary><Empleados /></ErrorBoundary></OwnerOnly>} />
            <Route path="/configuraciones" element={<OwnerOnly><ErrorBoundary><Configuraciones /></ErrorBoundary></OwnerOnly>} />
            <Route path="/caja" element={<ErrorBoundary><Caja /></ErrorBoundary>} />
            <Route path="/cuentas-cobrar" element={<OwnerOnly><ErrorBoundary><CuentasCobrar /></ErrorBoundary></OwnerOnly>} />
            <Route path="/reportes" element={<OwnerOnly><ErrorBoundary><Reportes /></ErrorBoundary></OwnerOnly>} />
            <Route path="/asistente-ia" element={<OwnerOnly><ErrorBoundary><AiAssistant /></ErrorBoundary></OwnerOnly>} />
            <Route path="/planner" element={<OwnerOnly><ErrorBoundary><Planner /></ErrorBoundary></OwnerOnly>} />
            <Route path="/auditoria" element={<OwnerOnly><ErrorBoundary><AuditLog /></ErrorBoundary></OwnerOnly>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>

      <Toaster
        position="top-right"
        gutter={8}
        toastOptions={{
          duration: 3500,
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '500',
            padding: '12px 16px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </QueryClientProvider>
    </ErrorBoundary>
  )
}
