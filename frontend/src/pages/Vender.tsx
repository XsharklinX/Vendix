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
import { buildInvoiceHtml } from '@/lib/generateInvoicePdf'
import { DocumentPreviewModal } from '@/components/ui/DocumentPreviewModal'
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

export interface ReceiptData {
  transactionId?: string
  receiptNo?: string
  businessName: string; businessAddress?: string; businessPhone?: string
  businessEmail?: string; businessTaxId?: string
  currency: string; items: CartItem[]
  subtotal: number; discountLabel: string; discountAmt: number
  taxName: string; taxAmount: number; taxIncluded?: boolean; total: number
  paymentMethod: string; clientName?: string; status: string; ncfNumber?: string
  cashReceived?: number; change?: number; cashierName?: string
}

export function buildReceiptHtml(data: ReceiptData): string {
  const fmt = (n: number) => formatCurrency(n, data.currency)
  const receiptNo = data.receiptNo
    || (data.transactionId
      ? data.transactionId.slice(-8).toUpperCase()
      : Date.now().toString().slice(-8))
  const rows = data.items.map(i => `
    <tr>
      <td class="item-name">${i.product.name}</td>
      <td class="right muted">${i.qty} × ${fmt(i.unitPrice)}</td>
      <td class="right bold">${fmt(i.unitPrice * i.qty)}</td>
    </tr>`).join('')
  const contactLine = [data.businessPhone, data.businessEmail].filter(Boolean).join('  ·  ')
  const paymentLabel = PAYMENT_LABELS[data.paymentMethod as keyof typeof PAYMENT_LABELS] || data.paymentMethod

  return `<!DOCTYPE html><html><head>
    <meta charset="utf-8"><title>Recibo ${receiptNo}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Courier New',Courier,monospace;font-size:11px;line-height:1.45;width:80mm;padding:5mm;color:#1a1a1a}
      .center{text-align:center} .right{text-align:right}
      .bold{font-weight:700} .muted{color:#666}
      .biz-name{font-size:16px;font-weight:800;letter-spacing:.3px;text-transform:uppercase}
      .biz-info{font-size:9.5px;color:#444;margin-top:2px}
      hr{border:none;border-top:1px dashed #999;margin:6px 0}
      hr.solid{border-top:1.5px solid #1a1a1a}
      table{width:100%;border-collapse:collapse}
      td{padding:1.5px 0;font-size:11px;vertical-align:top}
      .item-name{max-width:38mm;word-break:break-word}
      thead td{font-size:9.5px;text-transform:uppercase;letter-spacing:.3px;color:#777;border-bottom:1px solid #ccc;padding-bottom:3px}
      .meta td{font-size:10px;padding:1px 0}
      .meta .label{color:#777}
      .total-table td{font-size:17px;font-weight:800;padding-top:2px}
      .badge{display:inline-block;padding:3px 12px;border-radius:4px;font-size:10.5px;font-weight:800;letter-spacing:.4px}
      .badge-paid{background:#dcfce7;color:#166534}
      .badge-pending{background:#fef9c3;color:#854d0e}
      .footer{font-size:9px;color:#888}
      .footer .thanks{font-size:11px;font-weight:700;color:#1a1a1a;margin-bottom:3px}
      @media print{@page{margin:0;size:80mm auto}}
    </style>
  </head><body>
    <div class="center">
      <p class="biz-name">${data.businessName}</p>
      ${data.businessAddress ? `<p class="biz-info">${data.businessAddress}</p>` : ''}
      ${contactLine ? `<p class="biz-info">${contactLine}</p>` : ''}
      ${data.businessTaxId ? `<p class="biz-info">RNC/Tax ID: ${data.businessTaxId}</p>` : ''}
    </div>

    <hr class="solid">
    <table class="meta">
      <tr><td class="label">Recibo No.</td><td class="right bold">${receiptNo}</td></tr>
      <tr><td class="label">Fecha</td><td class="right">${new Date().toLocaleString('es-DO')}</td></tr>
      ${data.cashierName ? `<tr><td class="label">Atendido por</td><td class="right">${data.cashierName}</td></tr>` : ''}
      ${data.ncfNumber ? `<tr><td class="label">NCF</td><td class="right bold">${data.ncfNumber}</td></tr>` : ''}
      ${data.clientName ? `<tr><td class="label">Cliente</td><td class="right">${data.clientName}</td></tr>` : ''}
    </table>
    <hr>

    <table>
      <thead><tr><td>Producto</td><td class="right">Cant. × precio</td><td class="right">Importe</td></tr></thead>
      ${rows}
    </table>
    <hr>

    <table>
      <tr><td class="muted">Subtotal</td><td class="right">${fmt(data.subtotal)}</td></tr>
      ${data.discountAmt > 0 ? `<tr><td class="muted">Descuento (${data.discountLabel})</td><td class="right">-${fmt(data.discountAmt)}</td></tr>` : ''}
      ${data.taxAmount > 0
        ? `<tr><td class="muted">${data.taxName}${data.taxIncluded ? ' (incluido)' : ''}</td><td class="right">${fmt(data.taxAmount)}</td></tr>`
        : `<tr><td class="muted">${data.taxName}</td><td class="right muted">No aplica</td></tr>`}
    </table>
    <hr class="solid">
    <table class="total-table"><tr><td>TOTAL</td><td class="right">${fmt(data.total)}</td></tr></table>

    ${data.cashReceived ? `
    <table style="margin-top:5px">
      <tr><td class="muted">Efectivo recibido</td><td class="right">${fmt(data.cashReceived)}</td></tr>
      <tr><td class="bold">Cambio entregado</td><td class="right bold">${fmt(data.change ?? 0)}</td></tr>
    </table>` : ''}

    <hr>
    <div class="center">
      <span class="badge ${data.status === 'PENDING' ? 'badge-pending' : 'badge-paid'}">
        ${data.status === 'PENDING' ? 'PENDIENTE · AL FIADO' : `PAGADO · ${paymentLabel.toUpperCase()}`}
      </span>
    </div>

    <hr>
    <div class="center footer">
      <p class="thanks">¡Gracias por su compra!</p>
      <p>Conserve este recibo como comprobante de su transacción.</p>
      ${!data.ncfNumber ? '<p style="margin-top:3px">Este documento no es un comprobante fiscal válido.</p>' : ''}
      <p style="margin-top:6px;color:#bbb">Generado con Vendix · vendix.app</p>
    </div>
  </body></html>`
}

export function Vender() {
  const { business, user } = useAuthStore()
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
  const [applyTax, setApplyTax] = useState(true)
  const [successModal, setSuccessModal] = useState(false)
  const [lastSaleData, setLastSaleData] = useState<ReceiptData | null>(null)
  const [previewDoc, setPreviewDoc] = useState<{ title: string; html: string; filename: string } | null>(null)
  const [cartListModal, setCartListModal] = useState(false)
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
  const taxAmount = applyTax && taxRate > 0 && taxableAmount > 0
    ? taxIncluded ? taxableAmount - taxableAmount / (1 + taxRate) : taxableAmount * taxRate
    : 0
  const total = (applyTax && taxIncluded) ? afterDiscount : afterDiscount + taxAmount
  const change = cashReceived > 0 ? cashReceived - total : 0

  const sellMutation = useMutation({
    mutationFn: (data: unknown) => api.post(`/businesses/${bid}/transactions`, data as Record<string, unknown>),
    onSuccess: async (res, vars) => {
      qc.invalidateQueries({ queryKey: ['products', bid] })
      qc.invalidateQueries({ queryKey: ['recent-tx', bid] })
      qc.invalidateQueries({ queryKey: ['stats-summary-today', bid] })
      const v = vars as {
        amount: number; taxAmount: number; discountType: string; discountValue: number
        paymentMethod: string; status: string; clientId?: string; ncfNumber?: string
        _snapshot: { items: CartItem[]; subtotal: number; discountAmt: number; discountLabel: string; clientName?: string }
      }
      let receiptNo: string | undefined
      try {
        const numRes = await api.post(`/businesses/${bid}/invoicing/next-number`)
        receiptNo = numRes.data.invoiceNumber
      } catch { /* receipt falls back to transaction id / timestamp */ }
      setLastSaleData({
        transactionId: res.data.id,
        receiptNo,
        businessName: business!.name,
        businessAddress: bizData?.address,
        businessPhone: bizData?.phone,
        businessEmail: bizData?.email,
        businessTaxId: bizData?.taxId,
        currency: cur,
        items: v._snapshot.items,
        subtotal: v._snapshot.subtotal,
        discountLabel: v._snapshot.discountLabel,
        discountAmt: v._snapshot.discountAmt,
        taxName,
        taxAmount: v.taxAmount,
        taxIncluded,
        total: v.amount,
        paymentMethod: v.paymentMethod,
        clientName: v._snapshot.clientName,
        status: v.status,
        ncfNumber: v.ncfNumber,
        cashReceived: v.paymentMethod === 'CASH' && cashReceived > 0 ? cashReceived : undefined,
        change: v.paymentMethod === 'CASH' && cashReceived > 0 ? change : undefined,
        cashierName: user?.name,
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
    setApplyTax(true)
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
            <button
              onClick={() => setCartListModal(true)}
              className="badge bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
              title="Ver productos añadidos"
            >
              {cartCount}
            </button>
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

        {/* ITBIS / impuesto */}
        {taxRate > 0 && (
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
            <div>
              <p className="text-xs font-semibold text-gray-700">Aplicar {taxName}</p>
              <p className="text-[10px] text-gray-400">
                {(taxRate * 100).toFixed(0)}% · {taxIncluded ? 'incluido en el precio' : 'se añade al total'}
                {!applyTax && ' · esta venta no llevará impuesto'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setApplyTax(v => !v)}
              aria-pressed={applyTax}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${applyTax ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${applyTax ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        )}

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
              {filtered.map(p => {
                const cartItem = cart.find(item => item.product.id === p.id)
                const qtyInCart = cartItem?.qty ?? 0
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={p.quantity === 0}
                    className={`card p-3.5 text-left transition-all duration-150 group relative
                      ${p.quantity === 0
                        ? 'opacity-40 cursor-not-allowed'
                        : qtyInCart > 0
                          ? 'border-blue-500 bg-blue-50/20 shadow-sm'
                          : 'hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 cursor-pointer active:scale-95'}`}
                  >
                    {qtyInCart > 0 && (
                      <span className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm">
                        {qtyInCart}
                      </span>
                    )}
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
                )
              })}
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
        {CartPanel()}
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
              {CartPanel()}
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
              <p className="text-gray-400 text-sm mb-4">
                {lastSaleData.clientName ? `Cliente: ${lastSaleData.clientName}` : 'Venta general'}
              </p>
              <div className="bg-gray-50 rounded-xl p-3 mb-6 max-h-40 overflow-y-auto text-left text-xs space-y-1.5 border border-gray-100">
                <p className="font-semibold text-gray-500 mb-1">Productos vendidos:</p>
                {lastSaleData.items.map(item => (
                  <div key={item.product.id} className="flex justify-between text-gray-700">
                    <span className="truncate pr-2">{item.qty}x {item.product.name}</span>
                    <span className="font-semibold whitespace-nowrap">{formatCurrency(item.unitPrice * item.qty, cur)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-sm mb-6">Guardada offline</p>
          )}
          <div className="flex gap-2 flex-wrap">
            {lastSaleData && (
              <button
                onClick={() => {
                  const receiptNo = lastSaleData!.receiptNo
                    || (lastSaleData!.transactionId
                      ? lastSaleData!.transactionId.slice(-8).toUpperCase()
                      : Date.now().toString().slice(-8))
                  setPreviewDoc({
                    title: 'Recibo de venta',
                    html: buildReceiptHtml(lastSaleData!),
                    filename: `recibo-${receiptNo}.html`,
                  })
                }}
                className="flex-1 btn-secondary justify-center py-3 gap-2"
              >
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
                  const invoiceNumber = lastSaleData!.receiptNo || Date.now().toString().slice(-6)
                  setPreviewDoc({
                    title: 'Factura',
                    filename: `factura-${invoiceNumber}.html`,
                    html: buildInvoiceHtml({
                      invoiceNumber,
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
                    }),
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

      <Modal open={cartListModal} onClose={() => setCartListModal(false)} title={`Productos en el carrito (${cartCount})`} size="lg">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {cart.map(item => (
            <div key={item.product.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{item.product.name}</p>
                <p className="text-xs text-gray-500">{formatCurrency(item.unitPrice, cur)} c/u</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => updateQty(item.product.id, -1)} className="p-1.5 rounded-lg bg-white border border-gray-200 hover:border-blue-300 transition-colors">
                  <Minus size={13} />
                </button>
                <span className="w-7 text-center text-sm font-bold">{item.qty}</span>
                <button onClick={() => updateQty(item.product.id, 1)} className="p-1.5 rounded-lg bg-white border border-gray-200 hover:border-blue-300 transition-colors">
                  <Plus size={13} />
                </button>
              </div>
              <p className="w-24 text-right text-sm font-bold text-gray-900 flex-shrink-0">
                {formatCurrency(item.unitPrice * item.qty, cur)}
              </p>
              <button onClick={() => removeFromCart(item.product.id)} className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-4 mt-3 border-t border-gray-100">
          <span className="text-sm font-semibold text-gray-600">Subtotal ({cartCount} productos)</span>
          <span className="text-lg font-black text-gray-900">{formatCurrency(rawSubtotal, cur)}</span>
        </div>
      </Modal>

      <DocumentPreviewModal
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.title ?? ''}
        html={previewDoc?.html ?? ''}
        filename={previewDoc?.filename ?? 'documento.html'}
      />

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
