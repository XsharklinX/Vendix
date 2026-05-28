import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { Plus, Truck, Printer, PackageCheck, AlertTriangle, Send, Trash2 } from 'lucide-react'

interface Supplier { id: string; name: string }
interface Product { id: string; name: string; quantity: number; cost: number; price: number; category?: { name: string } }
interface OrderItem { id: string; productId?: string; name: string; quantity: number; receivedQty: number; cost: number }
interface PurchaseOrder {
  id: string
  number: number
  status: string
  supplier?: Supplier
  notes?: string
  total: number
  createdAt: string
  items: OrderItem[]
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  PARTIALLY_RECEIVED: 'Recibida parcial',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
}

function printOrder(order: PurchaseOrder, businessName: string, currency: string) {
  const rows = order.items.map(item => `
    <tr>
      <td>${item.name}</td>
      <td class="r">${item.quantity}</td>
      <td class="r">${formatCurrency(item.cost, currency)}</td>
      <td class="r">${formatCurrency(item.quantity * item.cost, currency)}</td>
    </tr>
  `).join('')
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Orden de compra ${order.number}</title>
    <style>body{font-family:Arial;padding:32px;color:#111827}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:20px}th{background:#0f766e;color:white;text-align:left;padding:8px;font-size:12px}td{border-bottom:1px solid #e5e7eb;padding:8px;font-size:12px}.r{text-align:right}.meta{color:#6b7280;font-size:12px}.total{font-weight:800;background:#f3f4f6}@media print{@page{margin:1.5cm}}</style>
  </head><body>
    <h1>${businessName} - Orden de compra #${order.number}</h1>
    <p class="meta">Proveedor: ${order.supplier?.name ?? 'Sin proveedor'} · Fecha: ${new Date(order.createdAt).toLocaleDateString('es-DO')}</p>
    <p class="meta">Estado: ${STATUS_LABELS[order.status] ?? order.status}</p>
    <table><thead><tr><th>Producto</th><th class="r">Cantidad</th><th class="r">Costo</th><th class="r">Subtotal</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3" class="r total">Total</td><td class="r total">${formatCurrency(order.total, currency)}</td></tr></tfoot></table>
    ${order.notes ? `<p><strong>Notas:</strong> ${order.notes}</p>` : ''}
  </body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}

export function OrdenesCompra() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const qc = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrder | null>(null)
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<Array<{ productId: string; quantity: number; cost: number }>>([])
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({})

  const { data: orders = [] } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders', bid],
    queryFn: () => api.get(`/businesses/${bid}/purchase-orders`).then(r => r.data),
  })

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers', bid],
    queryFn: () => api.get(`/businesses/${bid}/suppliers`).then(r => r.data),
  })

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products', bid],
    queryFn: () => api.get(`/businesses/${bid}/products`).then(r => r.data),
  })

  const { data: reorder } = useQuery<{ threshold: number; products: Product[] }>({
    queryKey: ['reorder-alerts', bid],
    queryFn: () => api.get(`/businesses/${bid}/purchase-orders/reorder-alerts`).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => {
      const payloadItems = items
        .filter(item => item.productId && item.quantity > 0)
        .map(item => {
          const product = products.find(p => p.id === item.productId)!
          return { productId: product.id, name: product.name, quantity: item.quantity, cost: item.cost }
        })
      return api.post(`/businesses/${bid}/purchase-orders`, { supplierId, notes, items: payloadItems })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders', bid] })
      setCreateOpen(false)
      setItems([])
      setSupplierId('')
      setNotes('')
      toast.success('Orden de compra creada')
    },
    onError: () => toast.error('No se pudo crear la orden'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.put(`/businesses/${bid}/purchase-orders/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders', bid] })
      toast.success('Estado actualizado')
    },
  })

  const receiveMutation = useMutation({
    mutationFn: () => api.post(`/businesses/${bid}/purchase-orders/${receiveOrder!.id}/receive`, {
      items: receiveOrder!.items.map(item => ({ itemId: item.id, receivedQty: receiveQty[item.id] ?? 0 })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders', bid] })
      qc.invalidateQueries({ queryKey: ['products', bid] })
      qc.invalidateQueries({ queryKey: ['reorder-alerts', bid] })
      setReceiveOrder(null)
      setReceiveQty({})
      toast.success('Mercancia recibida e inventario actualizado')
    },
    onError: () => toast.error('No se pudo recibir la mercancia'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/businesses/${bid}/purchase-orders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders', bid] })
      toast.success('Orden eliminada')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'No se pudo eliminar')
    },
  })

  const addItem = (product?: Product) => {
    setItems(prev => [...prev, { productId: product?.id ?? '', quantity: 1, cost: product?.cost ?? 0 }])
  }

  const total = items.reduce((sum, item) => sum + item.quantity * item.cost, 0)

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Ordenes de compra"
        subtitle="Planifica compras, recibe mercancia y actualiza inventario"
        icon={<Truck size={18} className="text-teal-500" />}
        action={<button onClick={() => setCreateOpen(true)} className="btn-primary"><Plus size={16} /> Crear orden</button>}
      />

      <div className="p-6 space-y-4">
        {(reorder?.products.length ?? 0) > 0 && (
          <div className="card p-4 bg-amber-50 border-amber-100">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-amber-600" />
              <p className="font-bold text-amber-800">Alertas de reorden (umbral {reorder?.threshold})</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {reorder!.products.slice(0, 10).map(p => (
                <button key={p.id} onClick={() => { setCreateOpen(true); addItem(p) }} className="px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-sm text-amber-700 hover:bg-amber-100">
                  {p.name} · {p.quantity} uds.
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Orden</th>
                <th className="table-header">Proveedor</th>
                <th className="table-header">Estado</th>
                <th className="table-header text-right">Total</th>
                <th className="table-header">Fecha</th>
                <th className="table-header text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map(order => (
                <tr key={order.id} className="table-row">
                  <td className="table-cell font-bold">OC-{String(order.number).padStart(4, '0')}</td>
                  <td className="table-cell">{order.supplier?.name ?? 'Sin proveedor'}</td>
                  <td className="table-cell"><span className="badge bg-teal-50 text-teal-700">{STATUS_LABELS[order.status] ?? order.status}</span></td>
                  <td className="table-cell text-right font-bold">{formatCurrency(order.total, cur)}</td>
                  <td className="table-cell text-gray-500">{formatDateTime(order.createdAt)}</td>
                  <td className="table-cell">
                    <div className="flex justify-center gap-1">
                      {order.status === 'DRAFT' && <button onClick={() => statusMutation.mutate({ id: order.id, status: 'SENT' })} className="btn-ghost text-xs text-blue-600"><Send size={13} /> Enviar</button>}
                      {order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && <button onClick={() => { setReceiveOrder(order); setReceiveQty({}) }} className="btn-ghost text-xs text-emerald-600"><PackageCheck size={13} /> Recibir</button>}
                      <button onClick={() => printOrder(order, business?.name ?? 'Vendix', cur)} className="btn-ghost text-xs text-gray-600"><Printer size={13} /></button>
                      <button onClick={() => deleteMutation.mutate(order.id)} className="btn-ghost text-xs text-red-500"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nueva orden de compra" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Proveedor</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="input">
                <option value="">Sin proveedor</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Notas</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} className="input" placeholder="Condiciones, entrega..." />
            </div>
          </div>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-center">
                <select value={item.productId} onChange={e => {
                  const product = products.find(p => p.id === e.target.value)
                  setItems(prev => prev.map((row, i) => i === index ? { ...row, productId: e.target.value, cost: product?.cost ?? row.cost } : row))
                }} className="input col-span-6">
                  <option value="">Seleccionar producto</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} · stock {p.quantity}</option>)}
                </select>
                <input type="number" min="1" value={item.quantity} onChange={e => setItems(prev => prev.map((row, i) => i === index ? { ...row, quantity: Number(e.target.value) } : row))} className="input col-span-2" />
                <input type="number" min="0" step="0.01" value={item.cost} onChange={e => setItems(prev => prev.map((row, i) => i === index ? { ...row, cost: Number(e.target.value) } : row))} className="input col-span-3" />
                <button onClick={() => setItems(prev => prev.filter((_, i) => i !== index))} className="btn-ghost text-red-500 col-span-1"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center border-t border-gray-100 pt-3">
            <button onClick={() => addItem()} className="btn-secondary"><Plus size={14} /> Agregar producto</button>
            <div className="text-right">
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-xl font-black">{formatCurrency(total, cur)}</p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setCreateOpen(false)} className="btn-secondary">Cancelar</button>
            <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || items.length === 0} className="btn-primary">Crear orden</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!receiveOrder} onClose={() => setReceiveOrder(null)} title={`Recibir OC-${String(receiveOrder?.number ?? '').padStart(4, '0')}`} size="lg">
        {receiveOrder && (
          <div className="space-y-4">
            {receiveOrder.items.map(item => {
              const remaining = item.quantity - item.receivedQty
              return (
                <div key={item.id} className="grid grid-cols-12 gap-3 items-center p-3 bg-gray-50 rounded-xl">
                  <div className="col-span-6">
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500">Ordenado {item.quantity} · Recibido {item.receivedQty} · Pendiente {remaining}</p>
                  </div>
                  <input type="number" min="0" max={remaining} value={receiveQty[item.id] ?? 0} onChange={e => setReceiveQty(q => ({ ...q, [item.id]: Number(e.target.value) }))} className="input col-span-3" />
                  <button onClick={() => setReceiveQty(q => ({ ...q, [item.id]: remaining }))} className="btn-secondary col-span-3 text-xs">Recibir pendiente</button>
                </div>
              )
            })}
            <div className="flex justify-end gap-3 border-t border-gray-100 pt-3">
              <button onClick={() => setReceiveOrder(null)} className="btn-secondary">Cancelar</button>
              <button onClick={() => receiveMutation.mutate()} disabled={receiveMutation.isPending} className="btn-primary"><PackageCheck size={15} /> Actualizar inventario</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
