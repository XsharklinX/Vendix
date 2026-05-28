import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { api, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { formatCurrency, formatDate, QUOTE_STATUS_LABELS } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { Plus, FileText, Trash2, PlusCircle, AlertTriangle, ShoppingBag } from 'lucide-react'

const itemSchema = z.object({
  productId: z.string().optional(),
  name: z.string().min(1, 'Descripción requerida'),
  quantity: z.coerce.number().int().min(1),
  price: z.coerce.number().min(0),
})

const schema = z.object({
  concept: z.string().optional(),
  clientId: z.string().optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, 'Agrega al menos un producto'),
})

type Form = z.infer<typeof schema>

interface Quote {
  id: string
  number: number
  concept?: string
  status: string
  total: number
  validUntil?: string
  client?: { id: string; name: string; phone?: string }
  items: { id: string; name: string; quantity: number; price: number; productId?: string }[]
  createdAt: string
}

export function Cotizaciones() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const qc = useQueryClient()

  const [modalOpen, setModalOpen] = useState(false)
  const [detailQuote, setDetailQuote] = useState<Quote | null>(null)
  const [error, setError] = useState('')

  const { data: quotes = [], isLoading } = useQuery<Quote[]>({
    queryKey: ['quotes', bid],
    queryFn: () => api.get(`/businesses/${bid}/quotes`).then(r => r.data),
  })

  const { data: clients = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['clients', bid],
    queryFn: () => api.get(`/businesses/${bid}/clients`).then(r => r.data),
  })

  const { data: products = [] } = useQuery<{ id: string; name: string; price: number }[]>({
    queryKey: ['products', bid],
    queryFn: () => api.get(`/businesses/${bid}/products`).then(r => r.data),
  })

  const { register, handleSubmit, control, watch, reset, setValue, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { items: [{ name: '', quantity: 1, price: 0 }] },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = watch('items')

  const subtotal = watchedItems?.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0) ?? 0

  const createMutation = useMutation({
    mutationFn: (data: Form) => api.post(`/businesses/${bid}/quotes`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes', bid] }); setModalOpen(false); reset() },
    onError: (e) => setError(getErrorMessage(e)),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/businesses/${bid}/quotes/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes', bid] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/businesses/${bid}/quotes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes', bid] }),
  })

  const convertMutation = useMutation({
    mutationFn: (quote: Quote) =>
      api.post(`/businesses/${bid}/transactions`, {
        type: 'SALE',
        amount: quote.total,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        clientId: quote.client?.id || undefined,
        description: `Cotización #${quote.number}${quote.concept ? ` — ${quote.concept}` : ''}`,
        items: quote.items.map(i => ({
          productId: i.productId || undefined,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          cost: 0,
        })),
      }),
    onSuccess: (_, quote) => {
      qc.invalidateQueries({ queryKey: ['quotes', bid] })
      qc.invalidateQueries({ queryKey: ['recent-tx', bid] })
      setDetailQuote(null)
      toast.success(`Venta de ${formatCurrency(quote.total, cur)} registrada`)
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  })

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId)
    if (product) {
      setValue(`items.${index}.name`, product.name)
      setValue(`items.${index}.price`, product.price)
      setValue(`items.${index}.productId`, product.id)
    }
  }

  return (
    <div>
      <PageHeader
        title="Cotizaciones"
        subtitle={`${quotes.length} cotizaciones`}
        action={
          <button onClick={() => { setModalOpen(true); reset({ items: [{ name: '', quantity: 1, price: 0 }] }); setError('') }} className="btn-primary">
            <Plus size={16} /> Crear cotización
          </button>
        }
      />

      <div className="p-6">
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="py-16 text-center text-gray-400">Cargando...</div>
          ) : quotes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No hay cotizaciones"
              description="Crea cotizaciones para tus clientes de forma ilimitada"
              action={<button onClick={() => setModalOpen(true)} className="btn-primary">Crear cotización</button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">#</th>
                    <th className="table-header">Cliente</th>
                    <th className="table-header">Concepto</th>
                    <th className="table-header">Estado</th>
                    <th className="table-header">Fecha</th>
                    <th className="table-header text-right">Total</th>
                    <th className="table-header text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {quotes.map(q => {
                    const statusInfo = QUOTE_STATUS_LABELS[q.status]
                    const isOverdue = q.status === 'PENDING' && q.validUntil && new Date(q.validUntil) < new Date()
                    return (
                      <tr key={q.id} className={`hover:bg-gray-50/50 cursor-pointer ${isOverdue ? 'bg-amber-50/40' : ''}`} onClick={() => setDetailQuote(q)}>
                        <td className="table-cell font-mono text-gray-500">#{q.number}</td>
                        <td className="table-cell font-medium text-gray-900">{q.client?.name || 'Sin cliente'}</td>
                        <td className="table-cell text-gray-500">{q.concept || `${q.items.length} producto(s)`}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={q.status}
                              onClick={e => e.stopPropagation()}
                              onChange={e => updateStatus.mutate({ id: q.id, status: e.target.value })}
                              className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${statusInfo?.color}`}
                            >
                              <option value="PENDING">Pendiente</option>
                              <option value="ACCEPTED">Aceptada</option>
                              <option value="REJECTED">Rechazada</option>
                              <option value="EXPIRED">Expirada</option>
                            </select>
                            {isOverdue && (
                              <span title="Cotización vencida" className="text-amber-500">
                                <AlertTriangle size={13} />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="table-cell text-gray-500 text-xs">
                          <div>{formatDate(q.createdAt)}</div>
                          {q.validUntil && (
                            <div className={`text-[10px] ${isOverdue ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                              {isOverdue ? 'Venció ' : 'Válida hasta '}{formatDate(q.validUntil)}
                            </div>
                          )}
                        </td>
                        <td className="table-cell text-right font-semibold text-gray-900">{formatCurrency(q.total, cur)}</td>
                        <td className="table-cell" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-center">
                            <button onClick={() => confirm('¿Eliminar cotización?') && deleteMutation.mutate(q.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva cotización" size="xl">
        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}
        <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Cliente</label>
              <select {...register('clientId')} className="input">
                <option value="">Sin cliente</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Válida hasta</label>
              <input {...register('validUntil')} type="date" className="input" />
            </div>
            <div className="col-span-2">
              <label className="label">Concepto</label>
              <input {...register('concept')} className="input" placeholder="Descripción de la cotización" />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Productos / Servicios *</label>
              <button type="button" onClick={() => append({ name: '', quantity: 1, price: 0 })} className="text-blue-600 text-xs flex items-center gap-1 hover:underline">
                <PlusCircle size={13} /> Agregar línea
              </button>
            </div>
            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-5">
                    <select
                      className="input text-xs mb-1"
                      onChange={e => handleProductSelect(index, e.target.value)}
                    >
                      <option value="">Seleccionar del inventario...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input {...register(`items.${index}.name`)} className="input text-sm" placeholder="O escribe descripción" />
                  </div>
                  <div className="col-span-2">
                    <input {...register(`items.${index}.quantity`)} type="number" min={1} className="input text-sm" placeholder="Cant." />
                  </div>
                  <div className="col-span-3">
                    <input {...register(`items.${index}.price`)} type="number" step="0.01" className="input text-sm" placeholder="Precio" />
                  </div>
                  <div className="col-span-1 pt-2 text-right text-xs text-gray-500">
                    {formatCurrency((Number(watchedItems?.[index]?.price) || 0) * (Number(watchedItems?.[index]?.quantity) || 0), cur)}
                  </div>
                  <div className="col-span-1 pt-1">
                    {fields.length > 1 && (
                      <button type="button" onClick={() => remove(index)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {errors.items && <p className="text-red-500 text-xs mt-1">{errors.items.message || errors.items.root?.message}</p>}
          </div>

          <div>
            <label className="label">Notas</label>
            <textarea {...register('notes')} className="input" rows={2} placeholder="Condiciones, observaciones..." />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div className="text-lg font-bold text-gray-900">
              Total: {formatCurrency(subtotal, cur)}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={isSubmitting} className="btn-primary">
                {isSubmitting ? 'Creando...' : 'Crear cotización'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Detail modal */}
      <Modal open={!!detailQuote} onClose={() => setDetailQuote(null)} title={`Cotización #${detailQuote?.number}`} size="lg">
        {detailQuote && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-gray-500">Cliente</p><p className="font-medium">{detailQuote.client?.name || 'Sin cliente'}</p></div>
              <div><p className="text-gray-500">Estado</p><span className={`badge ${QUOTE_STATUS_LABELS[detailQuote.status]?.color}`}>{QUOTE_STATUS_LABELS[detailQuote.status]?.label}</span></div>
              <div><p className="text-gray-500">Fecha</p><p className="font-medium">{formatDate(detailQuote.createdAt)}</p></div>
              {detailQuote.validUntil && (
                <div>
                  <p className="text-gray-500">Válida hasta</p>
                  {(() => {
                    const expired = detailQuote.status === 'PENDING' && new Date(detailQuote.validUntil!) < new Date()
                    return (
                      <p className={`font-medium flex items-center gap-1 ${expired ? 'text-amber-600' : ''}`}>
                        {expired && <AlertTriangle size={13} />}
                        {formatDate(detailQuote.validUntil!)}
                        {expired && <span className="text-xs">(vencida)</span>}
                      </p>
                    )
                  })()}
                </div>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">Descripción</th>
                  <th className="table-header text-center">Cant.</th>
                  <th className="table-header text-right">Precio unit.</th>
                  <th className="table-header text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {detailQuote.items.map(item => (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="table-cell">{item.name}</td>
                    <td className="table-cell text-center">{item.quantity}</td>
                    <td className="table-cell text-right">{formatCurrency(item.price, cur)}</td>
                    <td className="table-cell text-right font-medium">{formatCurrency(item.price * item.quantity, cur)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={3} className="table-cell text-right font-bold">Total</td>
                  <td className="table-cell text-right text-lg font-bold text-blue-600">{formatCurrency(detailQuote.total, cur)}</td>
                </tr>
              </tfoot>
            </table>

            {detailQuote.status === 'ACCEPTED' && (
              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={() => convertMutation.mutate(detailQuote)}
                  disabled={convertMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
                >
                  <ShoppingBag size={16} />
                  {convertMutation.isPending ? 'Registrando...' : 'Convertir en venta'}
                </button>
                <p className="text-xs text-gray-400 text-center mt-1.5">Se registra como venta en efectivo (puedes editarla en Movimientos)</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
