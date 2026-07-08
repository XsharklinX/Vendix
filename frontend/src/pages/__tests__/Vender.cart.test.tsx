import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Vender } from '../Vender'

const mockProducts = [
  { id: 'p1', name: 'Coca Cola', price: 100, cost: 50, quantity: 10, taxExempt: false, volumePricing: [] },
  { id: 'p2', name: 'Agua', price: 50, cost: 20, quantity: 5, taxExempt: false, volumePricing: [] },
]

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn((url: string) => {
      if (url.includes('/products')) return Promise.resolve({ data: mockProducts })
      if (url.includes('/clients')) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: {} })
    }),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
  getErrorMessage: (e: unknown) => String(e),
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    business: { id: 'biz1', name: 'Negocio de prueba', currency: 'DOP' },
    user: { id: 'u1', name: 'Cajero' },
    token: 'fake-token',
  }),
}))

vi.mock('@/lib/offlineQueue', () => ({
  saveOfflineSale: vi.fn(),
  getOfflineSales: vi.fn(() => Promise.resolve([])),
  removeOfflineSale: vi.fn(),
}))

function renderVender() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <Vender />
    </QueryClientProvider>
  )
}

function getCartItem(name: string) {
  const matches = screen.getAllByText(name)
  const item = matches.map(el => el.closest('[class*="bg-blue-50/50"]')).find(Boolean)
  if (!item) throw new Error(`No se encontró el item de carrito para "${name}"`)
  return item as HTMLElement
}

async function findProductButton(name: RegExp) {
  const buttons = await screen.findAllByRole('button', { name })
  const productButton = buttons.find(button => button.textContent?.includes('disp.'))
  if (!productButton) throw new Error(`No se encontro boton de producto para ${name}`)
  return productButton
}

describe('Vender — carrito de compras', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('agrega un producto al carrito al hacer click en él', async () => {
    renderVender()

    const productButton = await findProductButton(/Coca Cola/i)
    fireEvent.click(productButton)

    const cartItem = await waitFor(() => getCartItem('Coca Cola'))
    expect(cartItem).toHaveTextContent('1')
    expect(screen.queryByText('Toca un producto para agregarlo')).not.toBeInTheDocument()
  })

  it('modifica la cantidad de un producto en el carrito con los botones +/-', async () => {
    renderVender()

    const productButton = await findProductButton(/Coca Cola/i)
    fireEvent.click(productButton)

    let cartItem = await waitFor(() => getCartItem('Coca Cola'))
    const incrementBtn = cartItem.querySelector('svg.lucide-plus')!.closest('button') as HTMLElement
    const decrementBtn = cartItem.querySelector('svg.lucide-minus')!.closest('button') as HTMLElement

    fireEvent.click(incrementBtn)
    cartItem = getCartItem('Coca Cola')
    expect(cartItem).toHaveTextContent('2')

    fireEvent.click(decrementBtn)
    cartItem = getCartItem('Coca Cola')
    expect(cartItem).toHaveTextContent('1')
  })

  it('vacía el carrito al pulsar "Vaciar"', async () => {
    renderVender()

    const cocaButton = await findProductButton(/Coca Cola/i)
    const aguaButton = await findProductButton(/Agua/i)
    fireEvent.click(cocaButton)
    fireEvent.click(aguaButton)

    await waitFor(() => getCartItem('Coca Cola'))
    await waitFor(() => getCartItem('Agua'))

    fireEvent.click(screen.getByText('Vaciar'))

    await waitFor(() => {
      expect(screen.getByText('Toca un producto para agregarlo')).toBeInTheDocument()
    })
    expect(screen.queryByText('Vaciar')).not.toBeInTheDocument()
  })
})
