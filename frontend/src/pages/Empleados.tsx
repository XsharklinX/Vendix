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
import { Plus, Briefcase, Search, Edit2, Trash2, Phone, Download } from 'lucide-react'

const schema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  role: z.string().optional(),
  salary: z.coerce.number().min(0).optional(),
  active: z.boolean().optional(),
})

type Form = z.infer<typeof schema>

interface Employee {
  id: string; name: string; phone?: string; email?: string
  role?: string; salary: number; active: boolean
}

export function Empleados() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const qc = useQueryClient()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [search, setSearch] = useState('')

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ['employees', bid],
    queryFn: () => api.get(`/businesses/${bid}/employees`).then(r => r.data),
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { active: true, salary: 0 },
  })

  const saveMutation = useMutation({
    mutationFn: (data: Form) => editing
      ? api.put(`/businesses/${bid}/employees/${editing.id}`, data)
      : api.post(`/businesses/${bid}/employees`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees', bid] })
      closeModal()
      toast.success(editing ? 'Empleado actualizado' : 'Empleado agregado correctamente')
    },
    onError: () => toast.error('No se pudo guardar el empleado'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/businesses/${bid}/employees/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees', bid] }); toast.success('Empleado eliminado') },
    onError: () => toast.error('No se pudo eliminar el empleado'),
  })

  const openCreate = () => { setEditing(null); reset({ active: true, salary: 0 }); setModalOpen(true) }
  const openEdit = (e: Employee) => { setEditing(e); reset(e); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setEditing(null) }

  const handleDelete = async (e: Employee) => {
    const ok = await confirm('Eliminar empleado', `¿Eliminar a "${e.name}" del registro?`, true)
    if (ok) deleteMutation.mutate(e.id)
  }

  const handleExport = () => {
    const rows = employees.map(e => ({ ...e, statusLabel: e.active ? 'Activo' : 'Inactivo' }))
    exportCSV('empleados', rows, EXPORT_COLUMNS.empleados)
    toast.success('Lista de empleados exportada como CSV')
  }

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.role?.toLowerCase().includes(search.toLowerCase())
  )

  const activeCount = employees.filter(e => e.active).length
  const totalPayroll = employees.filter(e => e.active).reduce((s, e) => s + e.salary, 0)

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Empleados"
        subtitle={`${activeCount} activos · Nómina mensual: ${formatCurrency(totalPayroll, cur)}`}
        icon={<Briefcase size={18} className="text-indigo-500" />}
        action={
          <div className="flex gap-2">
            <button onClick={handleExport} className="btn-secondary"><Download size={15} /> Exportar</button>
            <button onClick={openCreate} className="btn-primary"><Plus size={16} /> Agregar empleado</button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o cargo..." className="input pl-10" />
        </div>

        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="py-20 text-center text-gray-400">
              <div className="inline-block w-6 h-6 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mb-3" />
              <p className="text-sm">Cargando empleados...</p>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title={search ? 'No se encontró ese empleado' : 'No hay empleados registrados'}
              description="Agrega los miembros de tu equipo de trabajo"
              action={!search ? <button onClick={openCreate} className="btn-primary">Agregar primer empleado</button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Empleado</th>
                    <th className="table-header">Cargo / Rol</th>
                    <th className="table-header">Teléfono</th>
                    <th className="table-header text-right">Salario mensual</th>
                    <th className="table-header text-center">Estado</th>
                    <th className="table-header text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(emp => (
                    <tr key={emp.id} className="table-row">
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${emp.active ? 'bg-gradient-to-br from-indigo-400 to-indigo-600' : 'bg-gray-200'}`}>
                            <span className={`font-bold text-sm ${emp.active ? 'text-white' : 'text-gray-400'}`}>{emp.name[0].toUpperCase()}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{emp.name}</p>
                            {emp.email && <p className="text-xs text-gray-400">{emp.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        {emp.role
                          ? <span className="badge bg-indigo-50 text-indigo-700">{emp.role}</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="table-cell">
                        {emp.phone
                          ? <div className="flex items-center gap-1.5 text-sm text-gray-600"><Phone size={12} className="text-gray-400" />{emp.phone}</div>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="table-cell text-right font-bold text-gray-900">
                        {formatCurrency(emp.salary, cur)}
                      </td>
                      <td className="table-cell text-center">
                        <span className={`badge font-semibold ${emp.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {emp.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(emp)} className="btn-ghost text-xs px-2.5 py-1.5 text-blue-600 hover:bg-blue-50">
                            <Edit2 size={14} /> Editar
                          </button>
                          <button onClick={() => handleDelete(emp)} className="btn-ghost text-xs px-2.5 py-1.5 text-red-500 hover:bg-red-50">
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

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Editar empleado' : 'Nuevo empleado'}>
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Nombre completo *</label>
            <input {...register('name')} className="input" placeholder="Nombre del empleado" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Cargo / Rol</label>
              <input {...register('role')} className="input" placeholder="Ej: Cajero, Vendedor..." />
            </div>
            <div>
              <label className="label">Salario mensual</label>
              <input {...register('salary')} type="number" step="0.01" className="input" placeholder="0.00" />
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input {...register('phone')} className="input" placeholder="809-000-0000" />
            </div>
            <div>
              <label className="label">Correo electrónico</label>
              <input {...register('email')} type="email" className="input" placeholder="correo@ejemplo.com" />
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <input {...register('active')} type="checkbox" id="emp-active" className="w-4 h-4 rounded accent-blue-600 cursor-pointer" />
            <label htmlFor="emp-active" className="text-sm font-medium text-gray-700 cursor-pointer">
              Empleado activo (aparece en nómina)
            </label>
          </div>
          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
            <button type="button" onClick={closeModal} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Guardando...' : editing ? 'Guardar cambios' : 'Agregar empleado'}
            </button>
          </div>
        </form>
      </Modal>

      {confirmDialog}
    </div>
  )
}
