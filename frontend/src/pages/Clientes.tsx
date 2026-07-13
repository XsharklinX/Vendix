import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { api, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { exportCSV, EXPORT_COLUMNS } from '@/lib/export'
import { PageHeader } from '@/components/ui/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { QueryError } from '@/components/ui/QueryError'
import { Pagination } from '@/components/ui/Pagination'
import { TableRowSkeleton } from '@/components/ui/Skeleton'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { TrashPanel } from '@/components/ui/TrashPanel'
import { usePersistentState } from '@/lib/usePersistentState'
import {
  Plus,
  Users,
  Search,
  Edit2,
  Trash2,
  Phone,
  Mail,
  Download,
  Star,
  MessageSquare,
  Clock,
  Gift,
  Activity,
  CheckCircle2,
  Tag,
  X,
} from 'lucide-react'

const schema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  phone: z.string().optional(),
  email: z.string().email('Correo invalido').optional().or(z.literal('')),
  document: z.string().optional(),
  address: z.string().optional(),
  isVip: z.boolean().optional().default(false),
  discountRate: z.coerce.number().min(0).max(100).optional().default(0),
  manualTagsText: z.string().optional(),
})

type Form = z.infer<typeof schema>

interface Client {
  id: string
  name: string
  phone?: string
  email?: string
  document?: string
  address?: string
  pendingDebt: number
  totalSales: number
  lastSaleAt?: string | null
  loyaltyPoints: number
  segments: string[]
  manualTags?: string[]
  isVip: boolean
  discountRate: number
  _count: { transactions: number }
}

interface TimelineEvent {
  id: string
  type: string
  title: string
  description?: string
  amount?: number
  status?: string
  date: string
  metadata?: { points?: number; items?: number; completedAt?: string | null }
}

interface TimelineResponse {
  client: Client
  events: TimelineEvent[]
}

interface ClientPriceEntry {
  id: string
  productId: string
  price: number
  product: { id: string; name: string; price: number; barcode?: string | null }
}

interface ProductLite {
  id: string
  name: string
  price: number
  barcode?: string | null
}

const segmentStyles: Record<string, string> = {
  VIP: 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
  Nuevo: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  Frecuente: 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
  'En riesgo': 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
}

export function Clientes() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const qc = useQueryClient()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [search, setSearch] = usePersistentState(`vendix:${bid}:clientes:search`, '')
  const [showTrash, setShowTrash] = useState(false)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50
  const [noteContent, setNoteContent] = useState('')
  const [noteType, setNoteType] = useState<'NOTE' | 'REMINDER'>('NOTE')
  const [noteDueAt, setNoteDueAt] = useState('')
  const [redeemPoints, setRedeemPoints] = useState('')
  const [redeemAmount, setRedeemAmount] = useState('')
  const [priceProductId, setPriceProductId] = useState('')
  const [priceValue, setPriceValue] = useState('')
  const [campaignDays, setCampaignDays] = useState(60)

  const { data: clients = [], isLoading, isError, refetch } = useQuery<Client[]>({
    queryKey: ['clients', bid],
    queryFn: () => api.get(`/businesses/${bid}/clients`).then(r => r.data),
  })

  const { data: timeline, isLoading: timelineLoading } = useQuery<TimelineResponse>({
    queryKey: ['client-timeline', bid, selectedClient?.id],
    enabled: Boolean(selectedClient),
    queryFn: () => api.get(`/businesses/${bid}/clients/${selectedClient!.id}/timeline`).then(r => r.data),
  })

  const { data: priceList = [] } = useQuery<ClientPriceEntry[]>({
    queryKey: ['client-price-list', bid, selectedClient?.id],
    enabled: Boolean(selectedClient),
    queryFn: () => api.get(`/businesses/${bid}/clients/${selectedClient!.id}/price-list`).then(r => r.data),
  })

  const { data: products = [] } = useQuery<ProductLite[]>({
    queryKey: ['products', bid],
    enabled: Boolean(selectedClient),
    queryFn: () => api.get(`/businesses/${bid}/products`).then(r => r.data),
  })

  const { data: inactiveCampaign } = useQuery<{ days: number; count: number; clients: Array<{ id: string; name: string; phone?: string; daysSinceSale: number | null }> }>({
    queryKey: ['inactive-campaign', bid, campaignDays],
    queryFn: () => api.get(`/businesses/${bid}/clients/crm/inactive-campaign`, { params: { days: campaignDays } }).then(r => r.data),
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const saveMutation = useMutation({
    mutationFn: (data: Form) => {
      const { manualTagsText, ...rest } = data
      const payload = {
        ...rest,
        discountRate: (data.discountRate ?? 0) / 100,
        manualTags: (manualTagsText ?? '').split(',').map(t => t.trim()).filter(Boolean),
      }
      return editing
        ? api.put(`/businesses/${bid}/clients/${editing.id}`, payload)
        : api.post(`/businesses/${bid}/clients`, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients', bid] })
      closeModal()
      toast.success(editing ? 'Cliente actualizado' : 'Cliente creado correctamente')
    },
    onError: () => toast.error('No se pudo guardar el cliente'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/businesses/${bid}/clients/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients', bid] }); toast.success('Cliente eliminado') },
    onError: () => toast.error('No se pudo eliminar el cliente'),
  })

  const noteMutation = useMutation({
    mutationFn: () => api.post(`/businesses/${bid}/clients/${selectedClient!.id}/notes`, {
      type: noteType,
      content: noteContent,
      dueAt: noteType === 'REMINDER' && noteDueAt ? new Date(noteDueAt).toISOString() : null,
    }),
    onSuccess: () => {
      setNoteContent('')
      setNoteDueAt('')
      setNoteType('NOTE')
      qc.invalidateQueries({ queryKey: ['client-timeline', bid, selectedClient?.id] })
      toast.success('Seguimiento guardado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const completeNoteMutation = useMutation({
    mutationFn: (noteId: string) => api.put(`/businesses/${bid}/clients/${selectedClient!.id}/notes/${noteId}`, { completed: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-timeline', bid, selectedClient?.id] })
      toast.success('Recordatorio completado')
    },
  })

  const redeemMutation = useMutation({
    mutationFn: () => api.post(`/businesses/${bid}/clients/${selectedClient!.id}/redeem-points`, {
      points: Number(redeemPoints),
      discountAmount: Number(redeemAmount),
      notes: 'Canje manual desde CRM',
    }),
    onSuccess: () => {
      setRedeemPoints('')
      setRedeemAmount('')
      qc.invalidateQueries({ queryKey: ['clients', bid] })
      qc.invalidateQueries({ queryKey: ['client-timeline', bid, selectedClient?.id] })
      toast.success('Puntos canjeados')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const addPriceMutation = useMutation({
    mutationFn: () => api.post(`/businesses/${bid}/clients/${selectedClient!.id}/price-list`, {
      productId: priceProductId,
      price: Number(priceValue),
    }),
    onSuccess: () => {
      setPriceProductId('')
      setPriceValue('')
      qc.invalidateQueries({ queryKey: ['client-price-list', bid, selectedClient?.id] })
      toast.success('Precio especial guardado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const deletePriceMutation = useMutation({
    mutationFn: (entryId: string) => api.delete(`/businesses/${bid}/clients/${selectedClient!.id}/price-list/${entryId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-price-list', bid, selectedClient?.id] })
      toast.success('Precio especial eliminado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const openCreate = () => { setEditing(null); reset({}); setModalOpen(true) }
  const openEdit = (c: Client) => {
    setEditing(c)
    reset({ ...c, discountRate: Math.round(c.discountRate * 100), manualTagsText: (c.manualTags ?? []).join(', ') })
    setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); reset({}) }

  const handleDelete = async (c: Client) => {
    const ok = await confirm('Eliminar cliente', `Seguro que deseas eliminar a "${c.name}"?`, true)
    if (ok) deleteMutation.mutate(c.id)
  }

  const handleExport = () => {
    exportCSV('clientes', clients.map(c => ({ ...c, pendingDebt: c.pendingDebt })), EXPORT_COLUMNS.clientes)
    toast.success('Clientes exportados como CSV')
  }

  const openCrm = (client: Client) => {
    setSelectedClient(client)
    setNoteContent('')
    setNoteDueAt('')
    setRedeemPoints('')
    setRedeemAmount('')
    setPriceProductId('')
    setPriceValue('')
  }

  const closeCrm = () => setSelectedClient(null)

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.document?.includes(search) ||
    c.segments.some(s => s.toLowerCase().includes(search.toLowerCase()))
  )
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalDebt = clients.reduce((s, c) => s + c.pendingDebt, 0)
  const totalPoints = clients.reduce((s, c) => s + c.loyaltyPoints, 0)

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Clientes"
        subtitle={`${clients.length} clientes - ${formatCurrency(totalDebt, cur)} te deben - ${totalPoints} puntos activos`}
        icon={<Users size={18} className="text-pink-500 dark:text-pink-400" />}
        action={
          <div className="flex gap-2">
            <button onClick={handleExport} className="btn-secondary"><Download size={15} /> Exportar</button>
            <button onClick={() => setShowTrash(v => !v)} className={`btn-secondary ${showTrash ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300' : ''}`}><Trash2 size={15} /> Papelera</button>
            <button onClick={openCreate} className="btn-primary"><Plus size={16} /> Crear cliente</button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {showTrash && <TrashPanel businessId={bid} queryKey="clients" endpoint="clients" label="Cliente" />}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase text-gray-400 dark:text-slate-500">Deuda pendiente</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(totalDebt, cur)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase text-gray-400 dark:text-slate-500">Puntos activos</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{totalPoints}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase text-gray-400 dark:text-slate-500">Clientes en riesgo</p>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{clients.filter(c => c.segments.includes('En riesgo')).length}</p>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-slate-100">Campaña de reactivación</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {inactiveCampaign?.count ?? 0} cliente{(inactiveCampaign?.count ?? 0) !== 1 ? 's' : ''} sin comprar hace {campaignDays}+ días.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select value={campaignDays} onChange={e => setCampaignDays(Number(e.target.value))} className="input w-32 text-sm">
                <option value={30}>30 días</option>
                <option value={60}>60 días</option>
                <option value={90}>90 días</option>
                <option value={120}>120 días</option>
              </select>
              {inactiveCampaign && inactiveCampaign.clients.length > 0 && (
                <button
                  onClick={() => {
                    const text = inactiveCampaign.clients.slice(0, 30).map(c => `${c.name}${c.phone ? ` - ${c.phone}` : ''}`).join('\n')
                    navigator.clipboard.writeText(text)
                    toast.success('Lista de campaña copiada')
                  }}
                  className="btn-secondary text-sm"
                >
                  Copiar lista
                </button>
              )}
            </div>
          </div>
          {inactiveCampaign && inactiveCampaign.clients.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {inactiveCampaign.clients.slice(0, 8).map(c => (
                <span key={c.id} className="rounded-full bg-orange-50 dark:bg-orange-950/40 border border-orange-100 dark:border-orange-900/50 px-3 py-1 text-xs font-semibold text-orange-700 dark:text-orange-300">
                  {c.name}{c.daysSinceSale ? ` · ${c.daysSinceSale}d` : ' · nunca compró'}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Buscar por nombre, telefono, documento o segmento..." className="input pl-10" />
        </div>

        <div className="card overflow-hidden">
          {isLoading ? (
            <TableRowSkeleton rows={6} cols={5} />
          ) : isError ? (
            <QueryError onRetry={() => refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              tone="rose"
              title={search ? 'No se encontró ese cliente' : 'Aún no tienes clientes registrados'}
              description={search ? 'Intenta con otro nombre, número o segmento' : 'Registra a tus clientes para llevar el control de sus compras, deudas y fidelización'}
              action={!search ? <button onClick={openCreate} className="btn-primary">Crear primer cliente</button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="table-header">Cliente</th>
                    <th className="table-header hidden md:table-cell">Contacto</th>
                    <th className="table-header hidden lg:table-cell">Segmentos</th>
                    <th className="table-header text-right hidden md:table-cell">Total comprado</th>
                    <th className="table-header text-center hidden lg:table-cell">Puntos</th>
                    <th className="table-header text-right">Deuda</th>
                    <th className="table-header text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                  {paged.map(c => (
                    <tr key={c.id} className="table-row">
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gradient-to-br from-pink-400 to-rose-500 rounded-xl flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-sm">{c.name[0].toUpperCase()}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-gray-900 dark:text-slate-100">{c.name}</p>
                              {c.isVip && <span className="flex items-center gap-0.5 text-xs text-yellow-600 dark:text-yellow-400 font-bold"><Star size={10} className="fill-yellow-500 text-yellow-500 dark:text-yellow-400" />VIP</span>}
                            </div>
                            {c.document && <p className="text-xs text-gray-400 dark:text-slate-500">{c.document}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="table-cell hidden md:table-cell">
                        <div className="space-y-0.5">
                          {c.phone && <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300"><Phone size={12} className="text-gray-400 dark:text-slate-500" />{c.phone}</div>}
                          {c.email && <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500"><Mail size={11} />{c.email}</div>}
                          {!c.phone && !c.email && <span className="text-gray-400 dark:text-slate-500 text-sm">-</span>}
                        </div>
                      </td>
                      <td className="table-cell hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {c.segments.length === 0 ? <span className="text-xs text-gray-400 dark:text-slate-500">Sin etiqueta</span> : c.segments.map(segment => (
                            <span key={segment} className={`text-xs px-2 py-1 rounded-full border font-semibold ${segmentStyles[segment] || 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-600'}`}>{segment}</span>
                          ))}
                        </div>
                      </td>
                      <td className="table-cell text-right font-semibold hidden md:table-cell">{formatCurrency(c.totalSales || 0, cur)}</td>
                      <td className="table-cell text-center hidden lg:table-cell">
                        <span className="badge bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">{c.loyaltyPoints}</span>
                      </td>
                      <td className="table-cell text-right">
                        <span className={`text-base font-bold ${c.pendingDebt > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {formatCurrency(c.pendingDebt, cur)}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openCrm(c)} className="btn-ghost text-xs px-2.5 py-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
                            <Activity size={14} /> CRM
                          </button>
                          <button onClick={() => openEdit(c)} className="btn-ghost text-xs px-2.5 py-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40">
                            <Edit2 size={14} /> Editar
                          </button>
                          <button onClick={() => handleDelete(c)} className="btn-ghost text-xs px-2.5 py-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={filtered.length} label="clientes" />
        </div>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Editar cliente' : 'Nuevo cliente'}>
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Nombre completo *</label>
            <input {...register('name')} className="input" placeholder="Ej: Juan Carlos Perez" />
            {errors.name && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Telefono</label>
              <input {...register('phone')} className="input" placeholder="809-000-0000" />
            </div>
            <div>
              <label className="label">Correo electronico</label>
              <input {...register('email')} type="email" className="input" placeholder="correo@ejemplo.com" />
              {errors.email && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">Cedula / Documento</label>
              <input {...register('document')} className="input" placeholder="000-0000000-0" />
            </div>
            <div>
              <label className="label">Direccion</label>
              <input {...register('address')} className="input" placeholder="Sector, calle..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-3 border border-gray-200 dark:border-slate-600 rounded-xl">
              <input type="checkbox" id="isVip" {...register('isVip')} className="w-4 h-4 accent-yellow-500" />
              <label htmlFor="isVip" className="text-sm font-medium text-gray-700 dark:text-slate-300 flex items-center gap-1">
                <Star size={13} className="text-yellow-500 dark:text-yellow-400" /> Cliente VIP
              </label>
            </div>
            <div>
              <label className="label">Descuento VIP (%)</label>
              <input type="number" min={0} max={100} step={1} {...register('discountRate')} className="input" placeholder="Ej: 10" />
            </div>
          </div>
          <div>
            <label className="label">Etiquetas manuales</label>
            <input {...register('manualTagsText')} className="input" placeholder="Ej: mayorista, cumple abril, preferente" />
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Separalas por coma. Se muestran junto a los segmentos automáticos.</p>
          </div>
          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-slate-700">
            <button type="button" onClick={closeModal} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(selectedClient)} onClose={closeCrm} title={selectedClient ? `CRM - ${selectedClient.name}` : 'CRM'}>
        {selectedClient && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-gray-100 dark:border-slate-700 p-3">
                <p className="text-xs text-gray-400 dark:text-slate-500">Total comprado</p>
                <p className="font-bold text-gray-900 dark:text-slate-100">{formatCurrency(selectedClient.totalSales || 0, cur)}</p>
              </div>
              <div className="rounded-xl border border-gray-100 dark:border-slate-700 p-3">
                <p className="text-xs text-gray-400 dark:text-slate-500">Puntos</p>
                <p className="font-bold text-emerald-600 dark:text-emerald-400">{selectedClient.loyaltyPoints}</p>
              </div>
              <div className="rounded-xl border border-gray-100 dark:border-slate-700 p-3">
                <p className="text-xs text-gray-400 dark:text-slate-500">Ultima compra</p>
                <p className="font-bold text-gray-900 dark:text-slate-100">{selectedClient.lastSaleAt ? formatDateTime(selectedClient.lastSaleAt) : 'Sin compras'}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 dark:border-slate-700 p-4 space-y-3">
              <div className="flex items-center gap-2 font-bold text-gray-800 dark:text-slate-200"><MessageSquare size={16} /> Nota o recordatorio</div>
              <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} className="input min-h-[90px]" placeholder="Ej: Llamar para ofrecer reposicion la proxima semana..." />
              <div className="grid grid-cols-2 gap-3">
                <select value={noteType} onChange={e => setNoteType(e.target.value as 'NOTE' | 'REMINDER')} className="input">
                  <option value="NOTE">Nota</option>
                  <option value="REMINDER">Recordatorio</option>
                </select>
                <input type="datetime-local" value={noteDueAt} onChange={e => setNoteDueAt(e.target.value)} disabled={noteType !== 'REMINDER'} className="input disabled:bg-gray-50 dark:disabled:bg-slate-800" />
              </div>
              <button
                onClick={() => noteMutation.mutate()}
                disabled={!noteContent.trim() || noteMutation.isPending}
                className="btn-primary w-full"
              >
                Guardar seguimiento
              </button>
            </div>

            <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/40 p-4 space-y-3">
              <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-200"><Gift size={16} /> Canjear puntos como descuento</div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" min={1} max={selectedClient.loyaltyPoints} value={redeemPoints} onChange={e => setRedeemPoints(e.target.value)} className="input" placeholder="Puntos" />
                <input type="number" min={0} value={redeemAmount} onChange={e => setRedeemAmount(e.target.value)} className="input" placeholder={`Descuento en ${cur}`} />
              </div>
              <button
                onClick={() => redeemMutation.mutate()}
                disabled={!redeemPoints || !redeemAmount || redeemMutation.isPending}
                className="btn-secondary w-full"
              >
                Registrar canje
              </button>
            </div>

            <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/40 p-4 space-y-3">
              <div className="flex items-center gap-2 font-bold text-indigo-800 dark:text-indigo-200"><Tag size={16} /> Lista de precios especiales</div>
              {priceList.length > 0 && (
                <div className="space-y-1.5">
                  {priceList.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">{entry.product.name}</p>
                        <p className="text-xs text-gray-400 dark:text-slate-500">
                          Precio normal: {formatCurrency(entry.product.price, cur)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-indigo-700 dark:text-indigo-300">{formatCurrency(entry.price, cur)}</span>
                        <button onClick={() => deletePriceMutation.mutate(entry.id)} className="btn-ghost text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 p-1.5">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                <select value={priceProductId} onChange={e => setPriceProductId(e.target.value)} className="input">
                  <option value="">Seleccionar producto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.price, cur)})</option>
                  ))}
                </select>
                <input type="number" min={0} step="0.01" value={priceValue} onChange={e => setPriceValue(e.target.value)} className="input w-28" placeholder="Precio" />
                <button
                  onClick={() => addPriceMutation.mutate()}
                  disabled={!priceProductId || !priceValue || addPriceMutation.isPending}
                  className="btn-primary"
                >
                  Guardar
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 font-bold text-gray-800 dark:text-slate-200"><Clock size={16} /> Timeline</div>
              {timelineLoading ? (
                <p className="text-sm text-gray-400 dark:text-slate-500">Cargando historial...</p>
              ) : timeline?.events.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-slate-500">Sin actividad registrada.</p>
              ) : (
                <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
                  {timeline?.events.map(event => (
                    <div key={`${event.type}-${event.id}`} className="rounded-xl border border-gray-100 dark:border-slate-700 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-slate-100">{event.title}</p>
                          <p className="text-xs text-gray-400 dark:text-slate-500">{formatDateTime(event.date)}</p>
                          {event.description && <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">{event.description}</p>}
                          {event.metadata?.points && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{event.metadata.points} puntos</p>}
                        </div>
                        <div className="text-right">
                          {event.amount !== undefined && <p className="font-bold text-gray-900 dark:text-slate-100">{formatCurrency(event.amount, cur)}</p>}
                          <span className="text-xs text-gray-400 dark:text-slate-500">{event.status}</span>
                        </div>
                      </div>
                      {event.type === 'REMINDER' && event.status !== 'COMPLETED' && (
                        <button onClick={() => completeNoteMutation.mutate(event.id)} className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 size={13} /> Marcar completado
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {confirmDialog}
    </div>
  )
}
