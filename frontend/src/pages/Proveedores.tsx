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
import { TableRowSkeleton } from '@/components/ui/Skeleton'
import { TrashPanel } from '@/components/ui/TrashPanel'
import { Plus, Truck, Search, Edit2, Trash2, Phone, Mail, Download } from 'lucide-react'

const schema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  phone: z.string().optional(),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  document: z.string().optional(),
  address: z.string().optional(),
})

type Form = z.infer<typeof schema>

interface Supplier {
  id: string; name: string; phone?: string; email?: string
  document?: string; address?: string; pendingDebt: number
}

export function Proveedores() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const qc = useQueryClient()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [search, setSearch] = useState('')
  const [showTrash, setShowTrash] = useState(false)

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ['suppliers', bid],
    queryFn: () => api.get(`/businesses/${bid}/suppliers`).then(r => r.data),
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const saveMutation = useMutation({
    mutationFn: (data: Form) => editing
      ? api.put(`/businesses/${bid}/suppliers/${editing.id}`, data)
      : api.post(`/businesses/${bid}/suppliers`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers', bid] })
      closeModal()
      toast.success(editing ? 'Proveedor actualizado' : 'Proveedor creado correctamente')
    },
    onError: () => toast.error('No se pudo guardar el proveedor'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/businesses/${bid}/suppliers/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers', bid] }); toast.success('Proveedor eliminado') },
    onError: () => toast.error('No se pudo eliminar el proveedor'),
  })

  const openCreate = () => { setEditing(null); reset({}); setModalOpen(true) }
  const openEdit = (s: Supplier) => { setEditing(s); reset(s); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setEditing(null); reset({}) }

  const handleDelete = async (s: Supplier) => {
    const ok = await confirm('Eliminar proveedor', `¿Eliminar a "${s.name}"? Esta acción no se puede deshacer.`, true)
    if (ok) deleteMutation.mutate(s.id)
  }

  const handleExport = () => {
    exportCSV('proveedores', suppliers as unknown as Record<string, unknown>[], EXPORT_COLUMNS.proveedores)
    toast.success('Proveedores exportados como CSV')
  }

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) || s.phone?.includes(search)
  )

  const totalDebt = suppliers.reduce((s, sup) => s + sup.pendingDebt, 0)

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Proveedores"
        subtitle={`${suppliers.length} proveedores · ${formatCurrency(totalDebt, cur)} les debes`}
        icon={<Truck size={18} className="text-teal-500 dark:text-teal-400" />}
        action={
          <div className="flex gap-2">
            <button onClick={() => setShowTrash(v => !v)} className={`btn-secondary ${showTrash ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300' : ''}`}><Trash2 size={15} /> Papelera</button>
            <button onClick={handleExport} className="btn-secondary"><Download size={15} /> Exportar</button>
            <button onClick={openCreate} className="btn-primary"><Plus size={16} /> Crear proveedor</button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {totalDebt > 0 && (
          <div className="card p-4 bg-orange-50 dark:bg-orange-950/40 border-orange-100 dark:border-orange-900/50 flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/40 rounded-xl flex items-center justify-center">
              <Truck size={18} className="text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-orange-800 dark:text-orange-200">Total que les debes</p>
              <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{formatCurrency(totalDebt, cur)}</p>
            </div>
          </div>
        )}

        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar proveedor por nombre..." className="input pl-10" />
        </div>

        {showTrash && <TrashPanel businessId={bid} queryKey="suppliers" endpoint="suppliers" label="Proveedor" />}

        <div className="card overflow-hidden">
          {isLoading ? (
            <TableRowSkeleton rows={6} cols={5} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Truck}
              title={search ? 'No se encontró ese proveedor' : 'No hay proveedores registrados'}
              description="Agrega proveedores para gestionar tus compras y pagos pendientes"
              action={!search ? <button onClick={openCreate} className="btn-primary">Crear primer proveedor</button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="table-header">Proveedor</th>
                    <th className="table-header">Contacto</th>
                    <th className="table-header">RNC / Documento</th>
                    <th className="table-header text-right">Deuda pendiente</th>
                    <th className="table-header text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                  {filtered.map(s => (
                    <tr key={s.id} className="table-row">
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-teal-600 rounded-xl flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-sm">{s.name[0].toUpperCase()}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-slate-100">{s.name}</p>
                            {s.address && <p className="text-xs text-gray-400 dark:text-slate-500 truncate max-w-[200px]">{s.address}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="space-y-0.5">
                          {s.phone && <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300"><Phone size={12} className="text-gray-400 dark:text-slate-500" />{s.phone}</div>}
                          {s.email && <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500"><Mail size={11} />{s.email}</div>}
                          {!s.phone && !s.email && <span className="text-gray-400 dark:text-slate-500 text-sm">—</span>}
                        </div>
                      </td>
                      <td className="table-cell text-gray-500 dark:text-slate-400">{s.document || '—'}</td>
                      <td className="table-cell text-right">
                        <span className={`text-base font-bold ${s.pendingDebt > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {formatCurrency(s.pendingDebt, cur)}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(s)} className="btn-ghost text-xs px-2.5 py-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40">
                            <Edit2 size={14} /> Editar
                          </button>
                          <button onClick={() => handleDelete(s)} className="btn-ghost text-xs px-2.5 py-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40">
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

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Editar proveedor' : 'Nuevo proveedor'}>
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Nombre del proveedor *</label>
            <input {...register('name')} className="input" placeholder="Nombre de la empresa o persona" />
            {errors.name && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Teléfono</label>
              <input {...register('phone')} className="input" placeholder="809-000-0000" />
            </div>
            <div>
              <label className="label">Correo electrónico</label>
              <input {...register('email')} type="email" className="input" placeholder="correo@proveedor.com" />
              {errors.email && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">RNC / Documento</label>
              <input {...register('document')} className="input" placeholder="000-00000-0" />
            </div>
            <div>
              <label className="label">Dirección</label>
              <input {...register('address')} className="input" placeholder="Dirección del negocio" />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-slate-700">
            <button type="button" onClick={closeModal} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear proveedor'}
            </button>
          </div>
        </form>
      </Modal>

      {confirmDialog}
    </div>
  )
}
