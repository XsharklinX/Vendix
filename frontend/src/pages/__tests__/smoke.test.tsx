import { describe, expect, it, vi, beforeEach } from 'vitest'
import type React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Login } from '../auth/Login'
import { Vender } from '../Vender'
import { Inventario } from '../Inventario'
import { Caja } from '../Caja'

const mockProducts = [
  { id: 'p1', name: 'Cafe premium', price: 100, cost: 50, quantity: 8, taxExempt: false, volumePricing: [] },
]

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn((url: string) => {
      if (url.includes('/products/inventory-alerts')) {
        return Promise.resolve({
          data: {
            lowStock: [],
            lowMargin: [],
            noMovement: [],
            meta: { noMovementDays: 60, lowMarginThreshold: 0.15, lowStockDefault: 5 },
          },
        })
      }
      if (url.includes('/products')) return Promise.resolve({ data: mockProducts })
      if (url.includes('/categories')) return Promise.resolve({ data: [] })
      if (url.includes('/suppliers')) return Promise.resolve({ data: [] })
      if (url.includes('/clients')) return Promise.resolve({ data: [] })
      if (url.includes('/cash-session/current')) return Promise.resolve({ data: null })
      if (url.includes('/cash-session/history')) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: {} })
    }),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
  getErrorMessage: (e: unknown) => String(e),
  getErrorField: () => undefined,
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    token: null,
    user: { id: 'u1', name: 'Owner', role: 'OWNER' },
    business: { id: 'biz1', name: 'Negocio smoke', currency: 'DOP', lowStockThreshold: 5 },
    businesses: [{ id: 'biz1', name: 'Negocio smoke', currency: 'DOP' }],
    setAuth: vi.fn(),
    setBusiness: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('@/lib/offlineQueue', () => ({
  saveOfflineSale: vi.fn(),
  getOfflineSales: vi.fn(() => Promise.resolve([])),
  removeOfflineSale: vi.fn(),
}))

vi.mock('@/lib/export', () => ({
  exportCSV: vi.fn(),
  EXPORT_COLUMNS: {
    products: [],
  },
}))

function renderPage(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        {ui}
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe('Smoke tests de pantallas criticas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    if (typeof localStorage.clear === 'function') localStorage.clear()
  })

  it('renderiza Login', () => {
    renderPage(<Login />)
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
    expect(screen.getByText(/vendix/i)).toBeInTheDocument()
  })

  it('renderiza POS con productos', async () => {
    renderPage(<Vender />)
    const productButtons = await screen.findAllByRole('button', { name: /Cafe premium/i })
    expect(productButtons.some(button => button.textContent?.includes('disp.'))).toBe(true)
  })

  it('renderiza Inventario con listado base', async () => {
    renderPage(<Inventario />)
    expect((await screen.findAllByText(/Cafe premium/i)).length).toBeGreaterThan(0)
    expect(screen.getByText(/Inventario/i)).toBeInTheDocument()
  })

  it('renderiza Caja en estado sin apertura', async () => {
    renderPage(<Caja />)
    await waitFor(() => {
      expect(screen.getByText(/Abrir nuevo turno/i)).toBeInTheDocument()
    })
  })
})
