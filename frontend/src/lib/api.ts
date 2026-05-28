import axios from 'axios'
import { useAuthStore } from '@/store/auth'
import { emitPlanLimit } from '@/hooks/usePlanLimit'

export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
    }
    if (err.response?.status === 402 || err.response?.status === 429) {
      const msg = err.response?.data?.error || err.response?.data?.message
      emitPlanLimit(msg)
    }
    return Promise.reject(err)
  }
)

export const getErrorMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error || err.message || 'Error desconocido'
  }
  return 'Error desconocido'
}
