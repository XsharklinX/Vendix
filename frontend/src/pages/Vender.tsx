import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { formatCurrency } from '@/lib/utils'
import {
  Search, Plus, Minus, Trash2, ShoppingCart, CheckCircle,
  CreditCard, Banknote, ArrowLeftRight, Printer, Tag, Star,
  Barcode, X, ChevronUp, FileText, Globe, Zap, WifiOff, Mail,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { generateInvoicePdf } from '@/lib/generateInvoicePdf'
import { saveOfflineSale, getOfflineSales, removeOfflineSale } from '@/lib/offlineQueue'

interface VolumePricing { id: string; minQty: number; price: number }
interface Product {
  id: string; name: string; price: number; cost: number
  quantity: number; taxExempt: boolean; barcode?: string
  category?: { name: string }
  volumePricing: VolumePricing[]
}
interface CartItem { product: Product; qty: number; unitPrice: number }
interface ClientBasic { id: string; name: string; phone?: string; isVip: boolean; discountRate: number }

const PAYMENT_LABELS = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia' }
const PAYMENT_ICONS = { CASH: Banknote, CARD: CreditCard, TRANSFER: ArrowLeftRight }

const DENOMINATIONS: Record<string, number[]> = {
  DOP: [50, 100, 200, 500, 1000, 2000],
  USD: [1, 5, 10, 20, 50, 100],
  EUR: [5, 10, 20, 50, 100, 200],
  COP: [1000, 2000, 5000, 10000, 20000, 50000],
  MXN: [20, 50, 100, 200, 500, 1000],
  VES: [1, 5, 10, 20, 50, 100],
}

function getDenomPresets(total: number, currency: string): number[] {
  const denoms = DENOMINATIONS[currency] ?? [1, 5, 10, 20, 50, 100]
  const presets: number[] = []
  for (const d of denoms) {
    if (d >= total) { presets.push(d); if (presets.length >= 4) break }
  }
  if (presets.length === 0) return denoms.slice(-4)
  while (presets.length < 4) {
    const next = denoms[denoms.indexOf(presets[presets.length - 1]) + 1]
    if (next) presets.push(next)
    else break
  }
  return presets
}

function getVolumePrice(product: Product, qty: number): number {
  if (!product.volumePricing?.length) return product.price
  const applicable = product.volumePricing
    .filter(r => qty >= r.minQty)
    .sort((a, b) => b.minQty - a.minQty)
  return applicable[0]?.price ?? product.price
}

function printReceipt(data: {
  transactionId?: string
  businessName: string; currency: string; items: CartItem[]
  subtotal: number; discountLabel: string; discountAmt: number
  taxName: string; taxAmount: number; total: number
  paymentMethod: string; clientName?: string; status: string; ncfNumber?: string
  cashReceived?: number; change?: number
}) {
  const win = window.open('', '_blank', 'width=320,height=600')
  if (!win) return
  const fmt = (n: number) => formatCurrency(n, data.currency)
  const rows = data.items.map(i =>
    `<tr><td>${i.product.name}</td><td style="text-align:right">${i.qty}x${fmt(i.unitPrice)}</td><td style="text-align:right">${fmt(i.unitPrice*i.qty)}</td></tr>`
  ).join('')
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8"><title>Recibo</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:monospace;font-size:12px;width:80mm;padding:6mm}
      h1{text-align:center;font-size:15px;margin-bottom:4px}
      .c{text-align:center} hr{border:none;border-top:1px dashed #000;margin:6px 0}
      table{width:100%;border-collapse:collapse} td{padding:2px 0}
      .total{font-size:15px;font-weight:bold}
      @media print{@page{margin:0;size:80mm auto}}
    </style>
  </head><body>
    <h1>${data.businessName}</h1>
    <p class="c">${new Date().toLocaleString('es-DO')}</p>
    ${data.ncfNumber ? `<p class="c">NCF: ${data.ncfNumber}</p>` : ''}
    ${data.clientName ? `<p class="c">Cliente: ${data.clientName}</p>` : ''}
    <hr><table>${rows}</table><hr>
    ${data.discountAmt > 0 ? `<table><tr><td>Subtotal</td><td style="text-align:right">${fmt(data.subtotal)}</td></tr><tr><td>Descuento (${data.discountLabel})</td><td style="text-align:right">-${fmt(data.discountAmt)}</td></tr></table>` : ''}
    ${data.taxAmount > 0 ? `<table><tr><td>${data.taxName}</td><td style="text-align:right">${fmt(data.taxAmount)}</td></tr></table>` : ''}
    <hr>
    <table><tr><td class="total">TOTAL</td><td class="total" style="text-align:right">${fmt(data.total)}</td></tr></table>
    ${data.cashReceived ? `<table><tr><td>Recibido</td><td style="text-align:right">${fmt(data.cashReceived)}</td></tr><tr><td><b>Cambio</b></td><td style="text-align:right"><b>${fmt(data.change ?? 0)}</b></td></tr></table>` : ''}
    <p class="c" style="margin-top:4px">Pago: ${PAYMENT_LABELS[data.paymentMethod as keyof typeof PAYMENT_LABELS] || data.paymentMethod}</p>
    ${data.status === 'PENDING' ? '<p class="c" style="font-weight:bold">*** AL FIADO ***</p>' : ''}
    <hr><p class="c">Gracias por su compra</p><p class="c" style="color:#999">Powered by Vendix</p>
  </body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 400)
}

export function Vender() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER'>('CASH')
  const [clientId, setClientId] = useState('')
  const [status, setStatus] = useState<'COMPLETED' | 'PENDING'>('COMPLETED')
  const [discountType, setDiscountType] = useState<'NONE' | 'PERCENT' | 'FIXED'>('NONE')
  const [discountValue, setDiscountValue] = useState(0)
  const [successModal, setSuccessModal] = useState(false)
  const [lastSaleData, setLastSaleData] = useState<Parameters<typeof printReceipt>[0] | null>(null)
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false)
  const [ncfNumber, setNcfNumber] = useState('')
  const [generatingNcf, setGeneratingNcf] = useState(false)
  const [altCurrency, setAltCurrency] = useState('')
  const [exchangeRate, setExchangeRate] = useState(1)
  const [cashReceived, setCashReceived] = useState(0)
  const [quickProductModal, setQuickProductModal] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickPrice, setQuickPrice] = useState(0)
  const [quickQty, setQuickQty] = useState(1)
  const [offlinePending, setOfflinePending] = useState(0)

  const barcodeRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Cart persistence
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`cart-${bid}`)
      if (saved) setCart(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [bid])

  useEffect(() => {
    try { sessionStorage.setItem(`cart-${bid}`, JSON.stringify(cart)) }
    catch { /* ignore */ }
  }, [cart, bid])

  const syncOfflineSales = useCallback(async () => {
    const pending = await getOfflineSales()
    const mine = pending.filter(s => s.businessId === bid)
    setOfflinePending(mine.length)
    if (mine.length > 0 && navigator.onLine) {
      const tid = toast.loading(`Sincronizando ${mine.length} venta(s) offline...`)
      let synced = 0
      for (const sale of mine) {
        try {
          await api.post(`/businesses/${bid}/transactions`, sale.data)
          await removeOfflineSale(sale.id)
          synced++
        } catch (e) {
          console.error('[offline-sync] No se pudo sincronizar venta', sale.id, e)
        }
      }
      toast.dismiss(tid)
      if (synced > 0) {
        toast.success(`${synced} venta(s) offline sincronizadas`)
        qc.invalidateQueries({ queryKey: ['products', bid] })
        qc.invalidateQueries({ queryKey: ['recent-tx', bid] })
        setOfflinePending(mine.length - synced)
      }
    }
  }, [bid, qc])

  // Sync on mount, on reconnect, and every 5 min while online
  useEffect(() => {
    syncOfflineSales()
    window.addEventListener('online', syncOfflineSales)
    const interval = setInterval(() => {
      if (navigator.onLine) syncOfflineSales()
    }, 5 * 60 * 1000)
    return () => {
      window.removeEventListener('online', syncOfflineSales)
      clearInterval(interval)
    }
  }, [syncOfflineSales])

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products', bid],
    queryFn: () => api.get(`/businesses/${bid}/products`).then(r => r.data),
  })

  const { data: clients = [] } = useQuery<ClientBasic[]>({
    queryKey: ['clients', bid],
    queryFn: () => api.get(`/businesses/${bid}/clients`).then(r => r.data),
  })

  const { data: bizData } = useQuery({
    queryKey: ['business', bid],
    queryFn: () => api.get(`/businesses/${bid}`).then(r => r.data),
  })

  const taxRate: number = bizData?.taxRate ?? 0
  const taxName: string = bizData?.taxName ?? 'ITBIS'
  const taxIncluded: boolean = bizData?.taxIncluded ?? true
  const hasNcf: boolean = !!bizData?.ncfType

  useEffect(() => {
    if (!clientId) { setDiscountType('NONE'); setDiscountValue(0); return }
    const client = clients.find(c => c.id === clientId)
    if (client?.isVip && client.discountRate > 0) {
      setDiscountType('PERCENT')
      setDiscountValue(client.discountRate * 100)
    }
  }, [clientId, clients])

  // Reset cash received when switching payment method
  useEffect(() => {
    if (paymentMethod !== 'CASH') setCashReceived(0)
  }, [paymentMethod])

  const addToCart = useCallback((product: Product) => {
    const isQuick = product.id.startsWith('quick-')
    if (!isQuick && product.quantity === 0) { toast.error(`"${product.name}" está sin stock`); return }
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id)
      if (existing) {
        if (!isQuick && existing.qty >= product.quantity) { toast.error('No hay más unidades disponibles'); return prev }
        const newQty = existing.qty + 1
        return prev.map(i => i.product.id === product.id
          ? { ...i, qty: newQty, unitPrice: getVolumePrice(product, newQty) }
          : i
        )
      }
      return [...prev, { product, qty: 1, unitPrice: getVolumePrice(product, 1) }]
    })
  }, [])

  const handleBarcodeKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && barcodeInput.trim()) {
      const code = barcodeInput.trim()
      const found = products.find(p =>
        p.barcode === code || p.name.toLowerCase() === code.toLowerCase()
      )
      if (found) { addToCart(found); toast.success(`${found.name} agregado`) }
      else toast.error(`Código "${code}" no encontrado`)
      setBarcodeInput('')
    }
  }

  const generateNcf = async () => {
    setGeneratingNcf(true)
    try {
      const res = await api.post(`/businesses/${bid}/next-ncf`)
      setNcfNumber(res.data.ncf)
      toast.success(`NCF generado: ${res.data.ncf}`)
    } catch { toast.error('Error al generar NCF') }
    finally { setGeneratingNcf(false) }
  }

  const rawSubtotal = cart.reduce((s, i) => s + i.unitPrice * i.qty, 0)
  const discountAmount = discountType === 'PERCENT'
    ? rawSubtotal * (discountValue / 100)
    : discountType === 'FIXED' ? Math.min(discountValue, rawSubtotal) : 0
  const afterDiscount = rawSubtotal - discountAmount
  const taxableAmount = cart.filter(i => !i.product.taxExempt).reduce((s, i) => s + i.unitPrice * i.qty, 0) - discountAmount
  const taxAmount = taxableAmount > 0
    ? taxIncluded ? taxableAmount - taxableAmount / (1 + taxRate) : taxableAmount * taxRate
    : 0
  const total = taxIncluded ? afterDiscount : afterDiscount + taxAmount
  const change = cashReceived > 0 ? cashReceived - total : 0

  const sellMutation = useMutation({
    mutationFn: (data: unknown) => api.post(`/businesses/${bid}/transactions`, data as Record<string, unknown>),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['products', bid] })
      qc.invalidateQueries({ queryKey: ['recent-tx', bid] })
      qc.invalidateQueries({ queryKey: ['stats-summary-today', bid] })
      const v = vars as {
        amount: number; taxAmount: number; discountType: string; discountValue: number
        paymentMethod: string; status: string; clientId?: string; ncfNumber?: string
        _snapshot: { items: CartItem[]; subtotal: number; discountAmt: number; discountLabel: string; clientName?: string }
      }
      setLastSaleData({
        transactionId: res.data.id,
        businessName: business!.name,
        currency: cur,
        items: v._snapshot.items,
        subtotal: v._snapshot.subtotal,
        discountLabel: v._snapshot.discountLabel,
        discountAmt: v._snapshot.discountAmt,
        taxName,
        taxAmount: v.taxAmount,
        total: v.amount,
        paymentMethod: v.paymentMethod,
        clientName: v._snapshot.clientName,
        status: v.status,
        ncfNumber: v.ncfNumber,
        cashReceived: v.paymentMethod === 'CASH' && cashReceived > 0 ? cashReceived : undefined,
        change: v.paymentMethod === 'CASH' && cashReceived > 0 ? change : undefined,
      })
      setCartDrawerOpen(false)
      setSuccessModal(true)
    },
    onError: async (err: unknown, variables: unknown) => {
      const isOffline = !navigator.onLine || (err as { code?: string })?.code === 'ERR_NETWORK'
      if (isOffline) {
        const { _snapshot, ...txData } = variables as Record<string, unknown>
        void _snapshot
        await saveOfflineSale(bid, txData as Record<string, unknown>)
        setOfflinePending(p => p + 1)
        toast.success('Sin conexión — venta guardada para sincronizar', { icon: '📶', duration: 4000 })
        setCartDrawerOpen(false)
        setSuccessModal(true)
        setLastSaleData(null)
      } else {
        const errMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        toast.error(errMsg || 'Error al procesar la venta')
      }
    },
  })

  const handleSell = useCallback(() => {
    if (cart.length === 0) { toast.error('Agrega productos al carrito'); return }
    const client = clients.find(c => c.id === clientId)
    const hasAltCurrency = altCurrency && altCurrency !== cur && exchangeRate > 0
    sellMutation.mutate({
      type: 'SALE',
      amount: Math.round(total * 100) / 100,
      paymentMethod,
      status,
      discountValue: discountAmount,
      discountType,
      taxAmount: Math.round(taxAmount * 100) / 100,
      clientId: clientId || undefined,
      ncfNumber: ncfNumber || undefined,
      originalCurrency: hasAltCurrency ? altCurrency : undefined,
      exchangeRate: hasAltCurrency ? exchangeRate : 1,
      originalAmount: hasAltCurrency ? Math.round((total / exchangeRate) * 100) / 100 : undefined,
      items: cart.map(i => ({
        productId: i.product.id.startsWith('quick-') ? undefined : i.product.id,
        name: i.product.name,
        quantity: i.qty,
        price: i.unitPrice,
        cost: i.product.id.startsWith('quick-') ? 0 : i.product.cost,
      })),
      _snapshot: {
        items: [...cart],
        subtotal: rawSubtotal,
        discountAmt: discountAmount,
        discountLabel: discountType === 'PERCENT' ? `${discountValue}%` : formatCurrency(discountValue, cur),
        clientName: client?.name,
      },
    })
  }, [cart, clients, clientId, altCurrency, cur, exchangeRate, total, paymentMethod, status,
      discountAmount, discountType, discountValue, taxAmount, ncfNumber, rawSubtotal, sellMutation])

  // Keep a ref so keyboard handler always calls latest handleSell
  const handleSellRef = useRef(handleSell)
  useEffect(() => { handleSellRef.current = handleSell }, [handleSell])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return

      if (e.key === 'F1') { e.preventDefault(); setPaymentMethod('CASH') }
      if (e.key === 'F2') { e.preventDefault(); setPaymentMethod('CARD') }
      if (e.key === 'F3') { e.preventDefault(); setPaymentMethod('TRANSFER') }
      if (e.key === 'F4') { e.preventDefault(); setStatus(s => s === 'COMPLETED' ? 'PENDING' : 'COMPLETED') }
      if (e.key === 'Enter' && !e.shiftKey && cart.length > 0 && !successModal && !quickProductModal) {
        e.preventDefault(); handleSellRef.current()
      }
      if (e.key === 'Escape') {
        if (successModal) { resetSale(); return }
        if (cartDrawerOpen) { setCartDrawerOpen(false); return }
        if (quickProductModal) { setQuickProductModal(false); return }
        if (cart.length > 0) { setCart([]); toast('Carrito vaciado') }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cart, successModal, cartDrawerOpen, quickProductModal])

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.product.id !== id) return i
      const isQuick = i.product.id.startsWith('quick-')
      const newQty = Math.max(1, isQuick ? i.qty + delta : Math.min(i.qty + delta, i.product.quantity))
      return { ...i, qty: newQty, unitPrice: getVolumePrice(i.product, newQty) }
    }))
  }

  const removeFromCart = (id: string) => setCart(prev => prev.filter(i => i.product.id !== id))

  const resetSale = useCallback(() => {
    setCart([])
    setClientId('')
    setPaymentMethod('CASH')
    setStatus('COMPLETED')
    setDiscountType('NONE')
    setDiscountValue(0)
    setNcfNumber('')
    setAltCurrency('')
    setExchangeRate(1)
    setCashReceived(0)
    setSuccessModal(false)
    try { sessionStorage.removeItem(`cart-${bid}`) } catch { /* ignore */ }
  }, [bid])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode && p.barcode.includes(search))
  )

  const selectedClient = clients.find(c => c.id === clientId)
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)

  // ── Cart Panel ────────────────────────────────────────────────────────────
  const CartPanel = () => (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart size={18} className="text-gray-600" />
          <span className="font-bold text-gray-900">Carrito</span>
        </div>
        {cart.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="badge bg-blue-600 text-white">{cartCount}</span>
            <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-600 transition-colors">
              Vaciar
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cart.length === 0 ? (
          <div className="text-center py-10">
            <ShoppingCart size={28} className="mx-auto mb-2 text-gray-200" />
            <p className="text-gray-400 text-sm">Toca un producto para agregarlo</p>
            <p className="text-gray-300 text-xs mt-1">Atajos: F1 Efectivo · F2 Tarjeta · F3 Transf.</p>
          </div>
        ) : (
          cart.map(item => (
            <div key={item.product.id} className="flex items-center gap-2 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{item.product.name}
                  {item.product.id.startsWith('quick-') && (
                    <span className="ml-1 text-[9px] bg-yellow-100 text-yellow-600 px-1 rounded">rápido</span>
                  )}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <p className="text-xs font-bold text-blue-600">{formatCurrency(item.unitPrice * item.qty, cur)}</p>
                  {item.unitPrice !== item.product.price && <span className="text-[10px] text-purple-500 font-medium">vol.</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => updateQty(item.product.id, -1)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 hover:border-blue-300">
                  <Minus size={12} />
                </button>
                <span className="w-7 text-center text-sm font-bold text-gray-900">{item.qty}</span>
                <button onClick={() => updateQty(item.product.id, 1)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 hover:border-blue-300">
                  <Plus size={12} />
                </button>
                <button onClick={() => removeFromCart(item.product.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 ml-0.5">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-gray-100 space-y-3 flex-shrink-0">
        {/* Cliente */}
        <div>
          <label className="label">Cliente (opcional)</label>
          <select value={clientId} onChange={e => setClientId(e.target.value)} className="input text-sm">
            <option value="">Venta general</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.isVip ? '★ ' : ''}{c.name}</option>
            ))}
          </select>
          {selectedClient?.isVip && (
            <p className="text-xs text-purple-600 mt-1 flex items-center gap-1">
              <Star size={10} /> VIP — {(selectedClient.discountRate * 100).toFixed(0)}% aplicado
            </p>
          )}
        </div>

        {/* Descuento */}
        <div>
          <label className="label">Descuento</label>
          <div className="flex gap-1.5">
            {(['NONE', 'PERCENT', 'FIXED'] as const).map(t => (
              <button key={t} onClick={() => { setDiscountType(t); if (t === 'NONE') setDiscountValue(0) }}
                className={`flex-1 py-1.5 text-xs rounded-lg border font-semibold transition-all
                  ${discountType === t ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300'}`}>
                {t === 'NONE' ? 'Ninguno' : t === 'PERCENT' ? '%' : 'Fijo'}
              </button>
            ))}
          </div>
          {discountType !== 'NONE' && (
            <input
              type="number" min={0}
              max={discountType === 'PERCENT' ? 100 : rawSubtotal}
              value={discountValue}
              onChange={e => setDiscountValue(Number(e.target.value))}
              className="input mt-1.5 text-sm"
              placeholder={discountType === 'PERCENT' ? '% descuento' : 'Monto fijo'}
            />
          )}
        </div>

        {/* NCF */}
        {hasNcf && (
          <div>
            <label className="label flex items-center gap-1"><FileText size={11} /> NCF</label>
            <div className="flex gap-2">
              <input
                type="text" value={ncfNumber} onChange={e => setNcfNumber(e.target.value)}
                className="input text-sm flex-1 font-mono"
                placeholder={`${bizData?.ncfType}00000001`}
              />
              <button onClick={generateNcf} disabled={generatingNcf} className="btn-secondary text-xs px-3 flex-shrink-0">
                {generatingNcf ? '...' : 'Auto'}
              </button>
            </div>
          </div>
        )}

        {/* Multi-moneda */}
        <div>
          <label className="label flex items-center gap-1"><Globe size={11} /> Moneda del pago</label>
          <div className="flex gap-2">
            <select value={altCurrency}
              onChange={e => { setAltCurrency(e.target.value); if (!e.target.value) setExchangeRate(1) }}
              className="input text-sm flex-1">
              <option value="">{cur} (predeterminado)</option>
              {['USD', 'EUR', 'COP', 'MXN', 'DOP'].filter(c => c !== cur).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {altCurrency && altCurrency !== cur && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-xs text-gray-500">1 {altCurrency} =</span>
                <input type="number" min={0.01} step={0.01} value={exchangeRate}
                  onChange={e => setExchangeRate(parseFloat(e.target.value) || 1)}
                  className="input text-sm w-20" />
                <span className="text-xs text-gray-500">{cur}</span>
              </div>
            )}
          </div>
          {altCurrency && altCurrency !== cur && exchangeRate > 0 && (
            <p className="text-xs text-blue-600 mt-1">
              Equivale a {altCurrency} {(total / exchangeRate).toFixed(2)}
            </p>
          )}
        </div>

        {/* Método de pago */}
        <div>
          <label className="label">Forma de pago</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['CASH', 'CARD', 'TRANSFER'] as const).map((m, idx) => {
              const Icon = PAYMENT_ICONS[m]
              return (
                <button key={m} onClick={() => setPaymentMethod(m)}
                  className={`py-2 text-xs rounded-xl border font-semibold transition-all flex flex-col items-center gap-1
                    ${paymentMethod === m
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-blue-200 hover:text-blue-600'}`}>
                  <Icon size={14} />
                  <span>{PAYMENT_LABELS[m].split(' ')[0]}</span>
                  <span className="text-[9px] opacity-50">F{idx + 1}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Efectivo recibido y cambio */}
        {paymentMethod === 'CASH' && (
          <div className="space-y-1.5">
            <label className="label flex items-center gap-1"><Banknote size={11} /> Efectivo recibido</label>
            <input
              type="number" min={0} step={0.01}
              value={cashReceived || ''}
              onChange={e => setCashReceived(parseFloat(e.target.value) || 0)}
              className="input text-sm"
              placeholder={`Monto recibido (${cur})`}
            />
            <div className="flex gap-1.5 flex-wrap">
              {getDenomPresets(total, cur).map(d => (
                <button key={d} onClick={() => setCashReceived(d)}
                  className="px-2.5 py-1 text-xs rounded-lg bg-gray-100 hover:bg-blue-100 hover:text-blue-700 font-semibold text-gray-600 transition-colors">
                  {formatCurrency(d, cur)}
                </button>
              ))}
            </div>
            {cashReceived > 0 && (
              <div className={`p-2.5 rounded-xl text-center ${cashReceived >= total ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <p className={`text-xs font-medium ${cashReceived >= total ? 'text-green-600' : 'text-red-600'}`}>
                  {cashReceived >= total ? 'Cambio a entregar' : 'Faltante'}
                </p>
                <p className={`text-xl font-black ${cashReceived >= total ? 'text-green-700' : 'text-red-700'}`}>
                  {formatCurrency(Math.abs(cashReceived - total), cur)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Estado */}
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => setStatus('COMPLETED')}
            className={`py-2.5 text-xs rounded-xl border font-semibold transition-all
              ${status === 'COMPLETED' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-200 hover:border-green-300'}`}>
            ✓ Cobrado
          </button>
          <button onClick={() => setStatus('PENDING')}
            className={`py-2.5 text-xs rounded-xl border font-semibold transition-all
              ${status === 'PENDING' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white text-gray-500 border-gray-200 hover:border-yellow-300'}`}>
            Al fiado <span className="text-[9px] opacity-60">F4</span>
          </button>
        </div>

        {/* Totales */}
        <div className="bg-gray-50 rounded-2xl p-3 space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatCurrency(rawSubtotal, cur)}</span></div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-orange-600"><span>Descuento</span><span>-{formatCurrency(discountAmount, cur)}</span></div>
          )}
          {taxAmount > 0 && (
            <div className="flex justify-between text-gray-500">
              <span>{taxName} {taxIncluded ? '(inc.)' : ''}</span><span>{formatCurrency(taxAmount, cur)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-1.5 border-t border-gray-200">
            <span className="font-semibold text-gray-700">Total</span>
            <span className="text-2xl font-black text-gray-900">{formatCurrency(total, cur)}</span>
          </div>
        </div>

        <button
          onClick={handleSell}
          disabled={cart.length === 0 || sellMutation.isPending}
          className={`w-full py-4 rounded-2xl font-bold text-base transition-all duration-150
            ${cart.length > 0
              ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
        >
          {sellMutation.isPending ? 'Procesando...' : cart.length === 0 ? 'Selecciona productos' : `Cobrar ${formatCurrency(total, cur)}`}
        </button>
        <p className="text-center text-[10px] text-gray-300">Enter para cobrar · Esc para vaciar</p>
      </div>
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden animate-fade-in relative">
      {/* ── Panel de productos ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
        <div className="px-4 py-3 bg-white border-b border-gray-100 space-y-2.5">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">Nueva venta</h1>
            <div className="flex items-center gap-2">
              {offlinePending > 0 && (
                <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2 py-1 rounded-full">
                  <WifiOff size={11} /> {offlinePending} pendiente(s)
                </span>
              )}
              <button
                onClick={() => setQuickProductModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-yellow-50 border border-yellow-200 text-yellow-700 hover:bg-yellow-100 transition-colors"
              >
                <Zap size={13} /> Venta rápida
              </button>
            </div>
          </div>

          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef} value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="input pl-9 text-sm"
            />
          </div>

          <div className="relative">
            <Barcode size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={barcodeRef} value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeKey}
              placeholder="Escanear código de barras..."
              className="input pl-9 text-sm bg-amber-50 border-amber-200 focus:border-amber-400 focus:ring-amber-200"
            />
            {barcodeInput && (
              <button onClick={() => setBarcodeInput('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X size={14} className="text-gray-400" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay productos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  disabled={p.quantity === 0}
                  className={`card p-3.5 text-left transition-all duration-150 group
                    ${p.quantity === 0
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 cursor-pointer active:scale-95'}`}
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center mb-2.5 group-hover:from-blue-200 group-hover:to-blue-300 transition-colors">
                    <span className="text-blue-700 font-bold text-base">{p.name[0].toUpperCase()}</span>
                  </div>
                  <p className="text-xs font-semibold text-gray-900 line-clamp-2 mb-1.5 leading-snug">{p.name}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    <p className="text-sm font-bold text-blue-600">{formatCurrency(p.price, cur)}</p>
                    {p.taxExempt && <span className="text-[9px] text-gray-400">exento</span>}
                    {p.volumePricing?.length > 0 && <Tag size={9} className="text-purple-500" />}
                  </div>
                  <p className={`text-[10px] mt-1 font-medium ${p.quantity === 0 ? 'text-red-500' : p.quantity <= 3 ? 'text-yellow-600' : 'text-gray-400'}`}>
                    {p.quantity === 0 ? 'Sin stock' : `${p.quantity} disp.`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mobile: floating cart button */}
        <div className="lg:hidden p-3 bg-white border-t border-gray-100 flex-shrink-0">
          <button
            onClick={() => setCartDrawerOpen(true)}
            className="w-full py-3.5 rounded-2xl font-bold text-base bg-gradient-to-r from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-200 flex items-center justify-between px-5"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} />
              <span>Carrito</span>
              {cartCount > 0 && <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">{cartCount}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span>{formatCurrency(total, cur)}</span>
              <ChevronUp size={18} />
            </div>
          </button>
        </div>
      </div>

      {/* ── Desktop: sidebar carrito ──────────────────────────────────────── */}
      <div className="hidden lg:flex w-80 bg-white border-l border-gray-100 flex-col shadow-xl">
        <CartPanel />
      </div>

      {/* ── Mobile: bottom drawer ──────────────────────────────────────────── */}
      {cartDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCartDrawerOpen(false)} />
          <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-bold text-gray-900">Carrito</h2>
              <button onClick={() => setCartDrawerOpen(false)} className="p-1.5 rounded-xl hover:bg-gray-100">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <CartPanel />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de éxito ─────────────────────────────────────────────────── */}
      <Modal open={successModal} onClose={resetSale} title="" size="sm">
        <div className="text-center py-4">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle size={48} className="text-green-500" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">¡Venta registrada!</h3>
          {lastSaleData ? (
            <>
              <p className="text-3xl font-black text-green-600 mb-1">{formatCurrency(lastSaleData.total, cur)}</p>
              {lastSaleData.status === 'PENDING' && <p className="text-amber-600 text-sm font-medium mb-1">Registrado al fiado</p>}
              {lastSaleData.cashReceived && lastSaleData.cashReceived > 0 && (
                <p className="text-gray-600 text-sm mb-1">
                  Cambio: <span className="font-bold text-green-600">{formatCurrency(lastSaleData.change ?? 0, cur)}</span>
                </p>
              )}
              {lastSaleData.ncfNumber && <p className="text-gray-400 text-xs font-mono mb-1">NCF: {lastSaleData.ncfNumber}</p>}
              <p className="text-gray-400 text-sm mb-6">
                {lastSaleData.clientName ? `Cliente: ${lastSaleData.clientName}` : 'Venta general'}
              </p>
            </>
          ) : (
            <p className="text-gray-500 text-sm mb-6">Guardada offline</p>
          )}
          <div className="flex gap-2 flex-wrap">
            {lastSaleData && (
              <button onClick={() => printReceipt(lastSaleData!)} className="flex-1 btn-secondary justify-center py-3 gap-2">
                <Printer size={16} /> Recibo
              </button>
            )}
            {lastSaleData && (
              <button
                onClick={async () => {
                  if (!lastSaleData.transactionId) return
                  try {
                    const res = await api.post(`/businesses/${bid}/invoicing/transactions/${lastSaleData.transactionId}/email`, {
                      template: bizData?.invoiceTemplate,
                    })
                    toast.success(`Factura enviada a ${res.data.to}`)
                  } catch (e: unknown) {
                    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
                    toast.error(msg || 'No se pudo enviar la factura')
                  }
                }}
                className="flex-1 btn-secondary justify-center py-3 gap-2"
              >
                <Mail size={16} /> Email
              </button>
            )}
            {lastSaleData && (
              <button
                onClick={() => {
                  const txNum = Date.now().toString().slice(-6)
                  generateInvoicePdf({
                    invoiceNumber: txNum,
                    date: new Date().toLocaleDateString('es-DO'),
                    businessName: business!.name,
                    businessAddress: bizData?.address,
                    businessPhone: bizData?.phone,
                    businessEmail: bizData?.email,
                    businessTaxId: bizData?.taxId,
                    logoUrl: bizData?.logoUrl,
                    template: bizData?.invoiceTemplate,
                    currency: cur,
                    clientName: lastSaleData!.clientName,
                    ncfNumber: lastSaleData!.ncfNumber,
                    items: lastSaleData!.items.map(i => ({
                      name: i.product.name, qty: i.qty, unitPrice: i.unitPrice,
                      total: i.unitPrice * i.qty,
                    })),
                    subtotal: lastSaleData!.subtotal,
                    discountAmt: lastSaleData!.discountAmt,
                    discountLabel: lastSaleData!.discountLabel,
                    taxName: lastSaleData!.taxName,
                    taxAmount: lastSaleData!.taxAmount,
                    total: lastSaleData!.total,
                    paymentMethod: lastSaleData!.paymentMethod,
                    status: lastSaleData!.status as 'COMPLETED' | 'PENDING',
                  })
                }}
                className="flex-1 btn-secondary justify-center py-3 gap-2"
              >
                <FileText size={16} /> Factura PDF
              </button>
            )}
            <button onClick={resetSale} className="flex-1 btn-primary justify-center py-3">
              Nueva venta
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal producto rápido ─────────────────────────────────────────── */}
      {quickProductModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setQuickProductModal(false)}>
          <div className="bg-white rounded-2xl p-5 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Zap size={16} className="text-yellow-500" /> Venta rápida
            </h3>
            <p className="text-xs text-gray-400 mb-4">Añade un producto sin registrarlo en el inventario</p>
            <div className="space-y-2.5">
              <input
                value={quickName}
                onChange={e => setQuickName(e.target.value)}
                placeholder="Nombre del producto o servicio"
                className="input text-sm"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (!quickName.trim() || quickPrice <= 0) return
                    const tempProduct: Product = {
                      id: `quick-${Date.now()}`,
                      name: quickName.trim(),
                      price: quickPrice,
                      cost: 0,
                      quantity: 9999,
                      taxExempt: false,
                      volumePricing: [],
                    }
                    for (let i = 0; i < quickQty; i++) addToCart(tempProduct)
                    setQuickProductModal(false)
                    setQuickName(''); setQuickPrice(0); setQuickQty(1)
                  }
                }}
              />
              <div className="flex gap-2">
                <input
                  type="number" min={0} step={0.01}
                  value={quickPrice || ''}
                  onChange={e => setQuickPrice(parseFloat(e.target.value) || 0)}
                  placeholder={`Precio (${cur})`}
                  className="input text-sm flex-1"
                />
                <input
                  type="number" min={1}
                  value={quickQty}
                  onChange={e => setQuickQty(parseInt(e.target.value) || 1)}
                  placeholder="Cant."
                  className="input text-sm w-20"
                />
              </div>
              {quickName && quickPrice > 0 && (
                <p className="text-xs text-blue-600 font-medium">
                  Total: {formatCurrency(quickPrice * quickQty, cur)}
                </p>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setQuickProductModal(false); setQuickName(''); setQuickPrice(0); setQuickQty(1) }}
                className="flex-1 btn-secondary">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!quickName.trim() || quickPrice <= 0) { toast.error('Nombre y precio requeridos'); return }
                  const tempProduct: Product = {
                    id: `quick-${Date.now()}`,
                    name: quickName.trim(),
                    price: quickPrice,
                    cost: 0,
                    quantity: 9999,
                    taxExempt: false,
                    volumePricing: [],
                  }
                  for (let i = 0; i < quickQty; i++) addToCart(tempProduct)
                  setQuickProductModal(false)
                  setQuickName(''); setQuickPrice(0); setQuickQty(1)
                }}
                disabled={!quickName.trim() || quickPrice <= 0}
                className="flex-1 btn-primary"
              >
                Agregar al carrito
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
