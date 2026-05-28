import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/auth'

const schema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  email: z.string().email('Correo inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  businessName: z.string().min(2, 'Nombre de negocio requerido'),
})

type Form = z.infer<typeof schema>

export function Register() {
  const { setAuth, token } = useAuthStore()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  if (token) return <Navigate to="/" replace />

  const onSubmit = async (data: Form) => {
    setError('')
    try {
      const res = await api.post('/auth/register', data)
      setAuth(res.data.token, res.data.user, [res.data.business])
      navigate('/onboarding', { replace: true })
    } catch (e) {
      setError(getErrorMessage(e))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4">
            <span className="text-white font-bold text-2xl">V</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Vendix</h1>
          <p className="text-gray-500 text-sm mt-1">Crea tu cuenta gratis</p>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Crear cuenta</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Tu nombre</label>
                <input {...register('name')} className="input" placeholder="Juan Pérez" />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div className="col-span-2">
                <label className="label">Nombre del negocio</label>
                <input {...register('businessName')} className="input" placeholder="Mi Tienda" />
                {errors.businessName && <p className="text-red-500 text-xs mt-1">{errors.businessName.message}</p>}
              </div>
              <div className="col-span-2">
                <label className="label">Correo electrónico</label>
                <input {...register('email')} type="email" className="input" placeholder="correo@ejemplo.com" />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
              </div>
              <div className="col-span-2">
                <label className="label">Contraseña</label>
                <input {...register('password')} type="password" className="input" placeholder="Mínimo 6 caracteres" />
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
              </div>
            </div>

            <button type="submit" disabled={isSubmitting} className="w-full btn-primary justify-center py-2.5">
              {isSubmitting ? 'Creando cuenta...' : 'Crear cuenta gratis'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="text-blue-600 font-medium hover:underline">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
