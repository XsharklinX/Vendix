import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '@/lib/api'

export function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    if (!token) { setStatus('error'); return }
    api.post('/auth/verify-email', { token })
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="card p-8 text-center max-w-sm w-full">
        {status === 'loading' && (
          <>
            <div className="w-12 h-12 border-4 border-blue-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Verificando tu correo...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✅</span>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">¡Correo verificado!</h2>
            <p className="text-gray-500 text-sm mb-6">Tu cuenta está activa. Ya puedes usar Vendix con todas las funciones.</p>
            <Link to="/" className="btn-primary justify-center w-full py-2.5">Ir al dashboard</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">❌</span>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Enlace inválido</h2>
            <p className="text-gray-500 text-sm mb-6">El enlace expiró o ya fue usado. Solicita uno nuevo desde tu perfil.</p>
            <Link to="/" className="btn-primary justify-center w-full py-2.5">Ir al dashboard</Link>
          </>
        )}
      </div>
    </div>
  )
}
