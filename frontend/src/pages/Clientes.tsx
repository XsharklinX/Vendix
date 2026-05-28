import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { formatCurrency } from '@/lib/utils'
import { exportCSV, EXPORT_COLUMNS } from '@/lib/export'
import { PageHeader } from '@/components/ui/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Plus, Users, Search, Edit2, Trash2, Phone, Mail, Download, Star } from 'lucide-react'

const schema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  phone: z.string().optional(),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  document: z.string().optional(),
  address: z.string().optional(),
  isVip: z.boolean().optional().default(false),
  discountRate: z.coerce.number().min(0).max(100).optional().default(0),
})

type Form = z.infer<typeof schema>

interface Client {
  id: string; name: string; phone?: string; email?: string
  document?: string; address?: string; pendingDebt: number
  isVip: boolean; discountRate: number
  _count: { transactions: number }
}

export function Clientes() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const qc = useQueryClient()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [search, setSearch] = useState('')

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients', bid],
    queryFn: () => api.get(`/businesses/${bid}/clients`).then(r => r.data),
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

  const openCreate = () => { setEditing(null); reset({}); setModalOpen(true) }
  const openEdit = (c: Client) => {
    setEditing(c)
    reset({ ...c, discountRate: Math.round(c.discountRate * 100) })
    setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); reset({}) }

  const handleDelete = async (c: Client) => {
    const ok = await confirm('Eliminar cliente', `¿Seguro que deseas eliminar a "${c.name}"?`, true)
    if (ok) deleteMutation.mutate(c.id)
  }

  const handleExport = () => {
    exportCSV('clientes', clients.map(c => ({ ...c, pendingDebt: c.pendingDebt })), EXPORT_COLUMNS.clientes)
    toast.success('Clientes exportados como CSV')
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) || c.document?.includes(search)
  )

  const totalDebt = clients.reduce((s, c) => s + c.pendingDebt, 0)

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Clientes"
        subtitle={`${clients.length} clientes · ${formatCurrency(totalDebt, cur)} te deben`}
        icon={<Users size={18} className="text-pink-500" />}
        action={
          <div className="flex gap-2">
            <button onClick={handleExport} className="btn-secondary"><Download size={15} /> Exportar</button>
            <button onClick={openCreate} className="btn-primary"><Plus size={16} /> Crear cliente</button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {totalDebt > 0 && (
          <div className="card p-4 bg-red-50 border-red-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
              <Users size={18} className="text-red-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-800">Total que te deben</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(totalDebt, cur)}</p>
            </div>
          </div>
        )}

        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, teléfono o documento..." className="input pl-10" />
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
              title={search ? 'No se encontró ese cliente' : 'No hay clientes registrados'}
              description={search ? 'Intenta con otro nombre o número' : 'Agrega clientes para hacer seguimiento de sus compras y deudas'}
              action={!search ? <button onClick={openCreate} className="btn-primary">Crear primer cliente</button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Cliente</th>
                    <th className="table-header">Teléfono / Correo</th>
                    <th className="table-header">Documento</th>
                    <th className="table-header text-center">Compras</th>
                    <th className="table-header text-right">Deuda pendiente</th>
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
                            {c.address && <p className="text-xs text-gray-400 truncate max-w-[180px]">{c.address}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="space-y-0.5">
                          {c.phone && <div className="flex items-center gap-1.5 text-sm text-gray-600"><Phone size={12} className="text-gray-400" />{c.phone}</div>}
                          {c.email && <div className="flex items-center gap-1.5 text-xs text-gray-400"><Mail size={11} />{c.email}</div>}
                          {!c.phone && !c.email && <span className="text-gray-400 text-sm">—</span>}
                        </div>
                      </td>
                      <td className="table-cell text-gray-500">{c.document || '—'}</td>
                      <td className="table-cell text-center">
                        <span className="badge bg-gray-100 text-gray-600">{c._count.transactions}</span>
                      </td>
                      <td className="table-cell text-right">
                        <span className={`text-base font-bold ${c.pendingDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(c.pendingDebt, cur)}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center justify-center gap-1">
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
            <input {...register('name')} className="input" placeholder="Ej: Juan Carlos Pérez" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Teléfono</label>
              <input {...register('phone')} className="input" placeholder="809-000-0000" />
            </div>
            <div>
              <label className="label">Correo electrónico</label>
              <input {...register('email')} type="email" className="input" placeholder="correo@ejemplo.com" />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">Cédula / Documento</label>
              <input {...register('document')} className="input" placeholder="000-0000000-0" />
            </div>
            <div>
              <label className="label">Dirección</label>
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

      {confirmDialog}
    </div>
  )
}
