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
import { useConfirm } from '@/components/ui/ConfirmDialog'
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
} from 'lucide-react'

const schema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  phone: z.string().optional(),
  email: z.string().email('Correo invalido').optional().or(z.literal('')),
  document: z.string().optional(),
  address: z.string().optional(),
  isVip: z.boolean().optional().default(false),
  discountRate: z.coerce.number().min(0).max(100).optional().default(0),
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

const segmentStyles: Record<string, string> = {
  VIP: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Nuevo: 'bg-blue-50 text-blue-700 border-blue-200',
  Frecuente: 'bg-green-50 text-green-700 border-green-200',
  'En riesgo': 'bg-red-50 text-red-700 border-red-200',
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
  const [search, setSearch] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [noteType, setNoteType] = useState<'NOTE' | 'REMINDER'>('NOTE')
  const [noteDueAt, setNoteDueAt] = useState('')
  const [redeemPoints, setRedeemPoints] = useState('')
  const [redeemAmount, setRedeemAmount] = useState('')

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients', bid],
    queryFn: () => api.get(`/businesses/${bid}/clients`).then(r => r.data),
  })

  const { data: timeline, isLoading: timelineLoading } = useQuery<TimelineResponse>({
    queryKey: ['client-timeline', bid, selectedClient?.id],
    enabled: Boolean(selectedClient),
    queryFn: () => api.get(`/businesses/${bid}/clients/${selectedClient!.id}/timeline`).then(r => r.data),
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const saveMutation = useMutation({
    mutationFn: (data: Form) => {
      const payload = { ...data, discountRate: (data.discountRate ?? 0) / 100 }
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

  const openCreate = () => { setEditing(null); reset({}); setModalOpen(true) }
  const openEdit = (c: Client) => {
    setEditing(c)
    reset({ ...c, discountRate: Math.round(c.discountRate * 100) })
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
  }

  const closeCrm = () => setSelectedClient(null)

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.document?.includes(search) ||
    c.segments.some(s => s.toLowerCase().includes(search.toLowerCase()))
  )

  const totalDebt = clients.reduce((s, c) => s + c.pendingDebt, 0)
  const totalPoints = clients.reduce((s, c) => s + c.loyaltyPoints, 0)

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Clientes"
        subtitle={`${clients.length} clientes - ${formatCurrency(totalDebt, cur)} te deben - ${totalPoints} puntos activos`}
        icon={<Users size={18} className="text-pink-500" />}
        action={
          <div className="flex gap-2">
            <button onClick={handleExport} className="btn-secondary"><Download size={15} /> Exportar</button>
            <button onClick={openCreate} className="btn-primary"><Plus size={16} /> Crear cliente</button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase text-gray-400">Deuda pendiente</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totalDebt, cur)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase text-gray-400">Puntos activos</p>
            <p className="text-2xl font-bold text-emerald-600">{totalPoints}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase text-gray-400">Clientes en riesgo</p>
            <p className="text-2xl font-bold text-orange-600">{clients.filter(c => c.segments.includes('En riesgo')).length}</p>
          </div>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, telefono, documento o segmento..." className="input pl-10" />
        </div>

        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="py-20 text-center text-gray-400">
              <div className="inline-block w-6 h-6 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mb-3" />
              <p className="text-sm">Cargando clientes...</p>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={search ? 'No se encontro ese cliente' : 'No hay clientes registrados'}
              description={search ? 'Intenta con otro nombre, numero o segmento' : 'Agrega clientes para hacer seguimiento de sus compras, deudas y fidelizacion'}
              action={!search ? <button onClick={openCreate} className="btn-primary">Crear primer cliente</button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Cliente</th>
                    <th className="table-header">Contacto</th>
                    <th className="table-header">Segmentos</th>
                    <th className="table-header text-right">Total comprado</th>
                    <th className="table-header text-center">Puntos</th>
                    <th className="table-header text-right">Deuda</th>
                    <th className="table-header text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(c => (
                    <tr key={c.id} className="table-row">
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gradient-to-br from-pink-400 to-rose-500 rounded-xl flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-sm">{c.name[0].toUpperCase()}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-gray-900">{c.name}</p>
                              {c.isVip && <span className="flex items-center gap-0.5 text-xs text-yellow-600 font-bold"><Star size={10} className="fill-yellow-500 text-yellow-500" />VIP</span>}
                            </div>
                            {c.document && <p className="text-xs text-gray-400">{c.document}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="space-y-0.5">
                          {c.phone && <div className="flex items-center gap-1.5 text-sm text-gray-600"><Phone size={12} className="text-gray-400" />{c.phone}</div>}
                          {c.email && <div className="flex items-center gap-1.5 text-xs text-gray-400"><Mail size={11} />{c.email}</div>}
                          {!c.phone && !c.email && <span className="text-gray-400 text-sm">-</span>}
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex flex-wrap gap-1">
                          {c.segments.length === 0 ? <span className="text-xs text-gray-400">Sin etiqueta</span> : c.segments.map(segment => (
                            <span key={segment} className={`text-xs px-2 py-1 rounded-full border font-semibold ${segmentStyles[segment] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>{segment}</span>
                          ))}
                        </div>
                      </td>
                      <td className="table-cell text-right font-semibold">{formatCurrency(c.totalSales || 0, cur)}</td>
                      <td className="table-cell text-center">
                        <span className="badge bg-emerald-50 text-emerald-700">{c.loyaltyPoints}</span>
                      </td>
                      <td className="table-cell text-right">
                        <span className={`text-base font-bold ${c.pendingDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(c.pendingDebt, cur)}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openCrm(c)} className="btn-ghost text-xs px-2.5 py-1.5 text-emerald-600 hover:bg-emerald-50">
                            <Activity size={14} /> CRM
                          </button>
                          <button onClick={() => openEdit(c)} className="btn-ghost text-xs px-2.5 py-1.5 text-blue-600 hover:bg-blue-50">
                            <Edit2 size={14} /> Editar
                          </button>
                          <button onClick={() => handleDelete(c)} className="btn-ghost text-xs px-2.5 py-1.5 text-red-500 hover:bg-red-50">
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
        </div>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Editar cliente' : 'Nuevo cliente'}>
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Nombre completo *</label>
            <input {...register('name')} className="input" placeholder="Ej: Juan Carlos Perez" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Telefono</label>
              <input {...register('phone')} className="input" placeholder="809-000-0000" />
            </div>
            <div>
              <label className="label">Correo electronico</label>
              <input {...register('email')} type="email" className="input" placeholder="correo@ejemplo.com" />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
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
            <div className="flex items-center gap-2 p-3 border border-gray-200 rounded-xl">
              <input type="checkbox" id="isVip" {...register('isVip')} className="w-4 h-4 accent-yellow-500" />
              <label htmlFor="isVip" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                <Star size={13} className="text-yellow-500" /> Cliente VIP
              </label>
            </div>
            <div>
              <label className="label">Descuento VIP (%)</label>
              <input type="number" min={0} max={100} step={1} {...register('discountRate')} className="input" placeholder="Ej: 10" />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
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
              <div className="rounded-xl border border-gray-100 p-3">
                <p className="text-xs text-gray-400">Total comprado</p>
                <p className="font-bold text-gray-900">{formatCurrency(selectedClient.totalSales || 0, cur)}</p>
              </div>
              <div className="rounded-xl border border-gray-100 p-3">
                <p className="text-xs text-gray-400">Puntos</p>
                <p className="font-bold text-emerald-600">{selectedClient.loyaltyPoints}</p>
              </div>
              <div className="rounded-xl border border-gray-100 p-3">
                <p className="text-xs text-gray-400">Ultima compra</p>
                <p className="font-bold text-gray-900">{selectedClient.lastSaleAt ? formatDateTime(selectedClient.lastSaleAt) : 'Sin compras'}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
              <div className="flex items-center gap-2 font-bold text-gray-800"><MessageSquare size={16} /> Nota o recordatorio</div>
              <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} className="input min-h-[90px]" placeholder="Ej: Llamar para ofrecer reposicion la proxima semana..." />
              <div className="grid grid-cols-2 gap-3">
                <select value={noteType} onChange={e => setNoteType(e.target.value as 'NOTE' | 'REMINDER')} className="input">
                  <option value="NOTE">Nota</option>
                  <option value="REMINDER">Recordatorio</option>
                </select>
                <input type="datetime-local" value={noteDueAt} onChange={e => setNoteDueAt(e.target.value)} disabled={noteType !== 'REMINDER'} className="input disabled:bg-gray-50" />
              </div>
              <button
                onClick={() => noteMutation.mutate()}
                disabled={!noteContent.trim() || noteMutation.isPending}
                className="btn-primary w-full"
              >
                Guardar seguimiento
              </button>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
              <div className="flex items-center gap-2 font-bold text-emerald-800"><Gift size={16} /> Canjear puntos como descuento</div>
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

            <div className="space-y-3">
              <div className="flex items-center gap-2 font-bold text-gray-800"><Clock size={16} /> Timeline</div>
              {timelineLoading ? (
                <p className="text-sm text-gray-400">Cargando historial...</p>
              ) : timeline?.events.length === 0 ? (
                <p className="text-sm text-gray-400">Sin actividad registrada.</p>
              ) : (
                <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
                  {timeline?.events.map(event => (
                    <div key={`${event.type}-${event.id}`} className="rounded-xl border border-gray-100 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">{event.title}</p>
                          <p className="text-xs text-gray-400">{formatDateTime(event.date)}</p>
                          {event.description && <p className="text-sm text-gray-600 mt-1">{event.description}</p>}
                          {event.metadata?.points && <p className="text-xs text-emerald-600 mt-1">{event.metadata.points} puntos</p>}
                        </div>
                        <div className="text-right">
                          {event.amount !== undefined && <p className="font-bold text-gray-900">{formatCurrency(event.amount, cur)}</p>}
                          <span className="text-xs text-gray-400">{event.status}</span>
                        </div>
                      </div>
                      {event.type === 'REMINDER' && event.status !== 'COMPLETED' && (
                        <button onClick={() => completeNoteMutation.mutate(event.id)} className="mt-2 text-xs font-semibold text-emerald-700 flex items-center gap-1">
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
