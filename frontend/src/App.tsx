import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { Layout } from '@/components/Layout/Layout'
import { useAuthStore } from '@/store/auth'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

const Login = lazy(() => import('@/pages/auth/Login').then(module => ({ default: module.Login })))
const Register = lazy(() => import('@/pages/auth/Register').then(module => ({ default: module.Register })))
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword').then(module => ({ default: module.ForgotPassword })))
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword').then(module => ({ default: module.ResetPassword })))
const VerifyEmail = lazy(() => import('@/pages/auth/VerifyEmail').then(module => ({ default: module.VerifyEmail })))
const Onboarding = lazy(() => import('@/pages/Onboarding').then(module => ({ default: module.Onboarding })))
const AuditLog = lazy(() => import('@/pages/AuditLog').then(module => ({ default: module.AuditLog })))
const Dashboard = lazy(() => import('@/pages/Dashboard').then(module => ({ default: module.Dashboard })))
const Vender = lazy(() => import('@/pages/Vender').then(module => ({ default: module.Vender })))
const Movimientos = lazy(() => import('@/pages/Movimientos').then(module => ({ default: module.Movimientos })))
const Estadisticas = lazy(() => import('@/pages/Estadisticas').then(module => ({ default: module.Estadisticas })))
const Inventario = lazy(() => import('@/pages/Inventario').then(module => ({ default: module.Inventario })))
const Cotizaciones = lazy(() => import('@/pages/Cotizaciones').then(module => ({ default: module.Cotizaciones })))
const Clientes = lazy(() => import('@/pages/Clientes').then(module => ({ default: module.Clientes })))
const Proveedores = lazy(() => import('@/pages/Proveedores').then(module => ({ default: module.Proveedores })))
const Empleados = lazy(() => import('@/pages/Empleados').then(module => ({ default: module.Empleados })))
const OrdenesCompra = lazy(() => import('@/pages/OrdenesCompra').then(module => ({ default: module.OrdenesCompra })))
const Configuraciones = lazy(() => import('@/pages/Configuraciones').then(module => ({ default: module.Configuraciones })))
const Caja = lazy(() => import('@/pages/Caja').then(module => ({ default: module.Caja })))
const CuentasCobrar = lazy(() => import('@/pages/CuentasCobrar').then(module => ({ default: module.CuentasCobrar })))
const Reportes = lazy(() => import('@/pages/Reportes').then(module => ({ default: module.Reportes })))
const AiAssistant = lazy(() => import('@/pages/AiAssistant').then(module => ({ default: module.AiAssistant })))
const Planner = lazy(() => import('@/pages/Planner').then(module => ({ default: module.Planner })))

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

function RouteLoader() {
  return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Cargando...</div>
}

export default function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<RouteLoader />}>
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
        </Suspense>
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
