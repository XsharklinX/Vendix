import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  name: string
  email: string
  role: string
  emailVerified: boolean
  onboardingCompleted: boolean
}

interface Business {
  id: string
  name: string
  currency: string
  lowStockThreshold?: number
  type?: string
  city?: string
}

interface AuthState {
  token: string | null
  user: User | null
  business: Business | null
  businesses: Business[]
  setAuth: (token: string, user: User, businesses: Business[]) => void
  setBusiness: (business: Business) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      business: null,
      businesses: [],
      setAuth: (token, user, businesses) =>
        set({ token, user, businesses, business: businesses[0] ?? null }),
      setBusiness: (business) => set({ business }),
      logout: () => set({ token: null, user: null, business: null, businesses: [] }),
    }),
    { name: 'vendix-auth' }
  )
)
