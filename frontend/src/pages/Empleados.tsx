import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
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
  Plus, Briefcase, Search, Edit2, Trash2, Phone, Download,
  Wallet, Clock, LogIn, LogOut, Printer, Percent, Receipt,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { format, startOfMonth } from 'date-fns'

const schema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  role: z.string().optional(),
  salary: z.coerce.number().min(0).optional(),
  commissionRate: z.coerce.number().min(0).max(100).optional(),
  active: z.boolean().optional(),
})

type Form = z.infer<typeof schema>
type Tab = 'team' | 'payroll' | 'sales' | 'attendance'

interface Employee {
  id: string
  name: string
  phone?: string
  email?: string
  role?: string
  salary: number
  commissionRate: number
  active: boolean
}

interface SalesRow {
  employee: Employee
  matchedUser: { id: string; name: string; email: string } | null
  count: number
  total: number
  tax: number
  commissionRate: number
  commissionAmount: number
}

interface PayrollPayment {
  id: string
  employee: Employee
  period: string
  baseSalary: number
  commissionAmount: number
  bonusAmount: number
  deductions: number
  totalAmount: number
  paidAt: string
  notes?: string
}

interface AttendanceRecord {
  id: string
  employee: Employee
  checkIn: string
  checkOut?: string
  hours?: number | null
}

import { printDocument } from '@/lib/print'

function printPayrollReport(businessName: string, rows: PayrollPayment[], currency: string) {
  const total = rows.reduce((sum, r) => sum + r.totalAmount, 0)
  const body = rows.map(r => `
    <tr><td>${r.employee.name}</td><td>${r.period}</td><td>${new Date(r.paidAt).toLocaleDateString('es-DO')}</td>
    <td class="r">${formatCurrency(r.baseSalary, currency)}</td><td class="r">${formatCurrency(r.commissionAmount, currency)}</td><td class="r">${formatCurrency(r.totalAmount, currency)}</td></tr>
  `).join('')

  printDocument({
    title: 'Reporte de nómina',
    businessName,
    body: `<table><thead><tr><th>Empleado</th><th>Periodo</th><th>Pago</th><th class="r">Salario</th><th class="r">Comisión</th><th class="r">Total</th></tr></thead><tbody>${body}</tbody>
      <tfoot><tr><td colspan="5" class="r total">Total pagado</td><td class="r total">${formatCurrency(total, currency)}</td></tr></tfoot></table>`,
  })
}

export function Empleados() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const qc = useQueryClient()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [activeTab, setActiveTab] = useState<Tab>('team')
  const [modalOpen, setModalOpen] = useState(false)
  const [payrollOpen, setPayrollOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [paying, setPaying] = useState<Employee | null>(null)
  const [search, setSearch] = usePersistentState(`vendix:${bid}:empleados:search`, '')
  const [showTrash, setShowTrash] = useState(false)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [payrollForm, setPayrollForm] = useState({ period: format(new Date(), 'yyyy-MM'), commissionAmount: 0, bonusAmount: 0, deductions: 0, notes: '' })

  const { data: employees = [], isLoading, isError, refetch } = useQuery<Employee[]>({
    queryKey: ['employees', bid],
    queryFn: () => api.get(`/businesses/${bid}/employees`).then(r => r.data),
  })

  const { data: salesReport } = useQuery<{ rows: SalesRow[] }>({
    queryKey: ['employee-sales-report', bid, from, to],
    queryFn: () => api.get(`/businesses/${bid}/employees/sales-report`, { params: { from, to } }).then(r => r.data),
    enabled: activeTab === 'sales' || payrollOpen,
  })

  const { data: payroll = [] } = useQuery<PayrollPayment[]>({
    queryKey: ['employee-payroll', bid, from, to],
    queryFn: () => api.get(`/businesses/${bid}/employees/payroll`, { params: { from, to } }).then(r => r.data),
    enabled: activeTab === 'payroll',
  })

  const { data: attendance = [] } = useQuery<AttendanceRecord[]>({
    queryKey: ['employee-attendance', bid, from, to],
    queryFn: () => api.get(`/businesses/${bid}/employees/attendance`, { params: { from, to } }).then(r => r.data),
    enabled: activeTab === 'attendance',
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { active: true, salary: 0, commissionRate: 0 },
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

  const payrollMutation = useMutation({
    mutationFn: () => api.post(`/businesses/${bid}/employees/${paying!.id}/payroll`, {
      period: payrollForm.period,
      baseSalary: paying!.salary,
      commissionAmount: payrollForm.commissionAmount,
      bonusAmount: payrollForm.bonusAmount,
      deductions: payrollForm.deductions,
      notes: payrollForm.notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-payroll', bid] })
      qc.invalidateQueries({ queryKey: ['transactions', bid] })
      setPayrollOpen(false)
      setPaying(null)
      toast.success('Pago de nomina registrado como gasto')
    },
    onError: () => toast.error('No se pudo registrar el pago'),
  })

  const attendanceMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'check-in' | 'check-out' }) =>
      api.post(`/businesses/${bid}/employees/${id}/attendance/${action}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-attendance', bid] })
      toast.success('Asistencia actualizada')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'No se pudo actualizar asistencia')
    },
  })

  const openCreate = () => { setEditing(null); reset({ active: true, salary: 0, commissionRate: 0 }); setModalOpen(true) }
  const openEdit = (e: Employee) => { setEditing(e); reset(e); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setEditing(null) }

  const openPayroll = (employee: Employee) => {
    const commissionAmount = salesReport?.rows.find(r => r.employee.id === employee.id)?.commissionAmount ?? 0
    setPaying(employee)
    setPayrollForm({ period: format(new Date(), 'yyyy-MM'), commissionAmount, bonusAmount: 0, deductions: 0, notes: '' })
    setPayrollOpen(true)
  }

  const handleDelete = async (e: Employee) => {
    const ok = await confirm('Eliminar empleado', `Eliminar a "${e.name}" del registro?`, true)
    if (ok) deleteMutation.mutate(e.id)
  }

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.role?.toLowerCase().includes(search.toLowerCase())
  )
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const activeCount = employees.filter(e => e.active).length
  const totalPayroll = employees.filter(e => e.active).reduce((s, e) => s + e.salary, 0)
  const payrollTotal = payroll.reduce((sum, p) => sum + p.totalAmount, 0)
  const salesTotal = salesReport?.rows.reduce((sum, row) => sum + row.total, 0) ?? 0
  const commissionTotal = salesReport?.rows.reduce((sum, row) => sum + row.commissionAmount, 0) ?? 0
  const totalHours = attendance.reduce((sum, r) => sum + (r.hours ?? 0), 0)

  const handleExportEmployees = () => {
    exportCSV('empleados', employees.map(e => ({ ...e, statusLabel: e.active ? 'Activo' : 'Inactivo' })), EXPORT_COLUMNS.empleados)
    toast.success('Lista de empleados exportada como CSV')
  }

  const handleExportPayroll = () => {
    exportCSV('nomina', payroll.map(p => ({
      empleado: p.employee.name,
      periodo: p.period,
      salario: p.baseSalary,
      comision: p.commissionAmount,
      bono: p.bonusAmount,
      deducciones: p.deductions,
      total: p.totalAmount,
      fecha: p.paidAt,
    })), [
      { key: 'empleado', label: 'Empleado' },
      { key: 'periodo', label: 'Periodo' },
      { key: 'salario', label: 'Salario' },
      { key: 'comision', label: 'Comision' },
      { key: 'bono', label: 'Bono' },
      { key: 'deducciones', label: 'Deducciones' },
      { key: 'total', label: 'Total' },
      { key: 'fecha', label: 'Fecha' },
    ])
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Nomina y equipo"
        subtitle={`${activeCount} activos · Nomina base: ${formatCurrency(totalPayroll, cur)}`}
        icon={<Briefcase size={18} className="text-indigo-500" />}
        action={
          <div className="flex gap-2">
            <button onClick={handleExportEmployees} className="btn-secondary"><Download size={15} /> Exportar</button>
            <button onClick={() => setShowTrash(v => !v)} className={`btn-secondary ${showTrash ? 'bg-rose-50 border-rose-200 text-rose-700' : ''}`}><Trash2 size={15} /> Papelera</button>
            <button onClick={openCreate} className="btn-primary"><Plus size={16} /> Agregar empleado</button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {showTrash && <TrashPanel businessId={bid} queryKey="employees" endpoint="employees" label="Empleado" />}

        <div className="card p-2 flex flex-wrap gap-2">
          {([
            ['team', 'Equipo', Briefcase],
            ['payroll', 'Pagos de nomina', Wallet],
            ['sales', 'Ventas y comisiones', Percent],
            ['attendance', 'Asistencia', Clock],
          ] as Array<[Tab, string, LucideIcon]>).map(([tab, label, Icon]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 ${activeTab === tab ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {activeTab !== 'team' && (
          <div className="card p-4 flex flex-wrap gap-3 items-center">
            <span className="text-sm text-gray-500">Periodo</span>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input w-40" />
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input w-40" />
          </div>
        )}

        {activeTab === 'team' && (
          <>
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Buscar por nombre o cargo..." className="input pl-10" />
            </div>
            <div className="card overflow-hidden">
              {isLoading ? (
                <TableRowSkeleton rows={5} cols={5} />
              ) : isError ? (
                <QueryError onRetry={() => refetch()} />
              ) : filtered.length === 0 ? (
                <EmptyState icon={Briefcase} tone="rose" title="Aún trabajas solo" description="Agrega a los miembros de tu equipo para controlar accesos, horarios y comisiones" action={<button onClick={openCreate} className="btn-primary">Agregar primer empleado</button>} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="table-header">Empleado</th>
                        <th className="table-header">Cargo</th>
                        <th className="table-header">Telefono</th>
                        <th className="table-header text-right">Salario</th>
                        <th className="table-header text-right">Comision</th>
                        <th className="table-header text-center">Estado</th>
                        <th className="table-header text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {paged.map(emp => (
                        <tr key={emp.id} className="table-row">
                          <td className="table-cell">
                            <p className="font-semibold text-gray-900">{emp.name}</p>
                            {emp.email && <p className="text-xs text-gray-400">{emp.email}</p>}
                          </td>
                          <td className="table-cell">{emp.role ? <span className="badge bg-indigo-50 text-indigo-700">{emp.role}</span> : '—'}</td>
                          <td className="table-cell">{emp.phone ? <span className="flex items-center gap-1 text-sm"><Phone size={12} />{emp.phone}</span> : '—'}</td>
                          <td className="table-cell text-right font-bold">{formatCurrency(emp.salary, cur)}</td>
                          <td className="table-cell text-right font-bold text-emerald-600">{emp.commissionRate}%</td>
                          <td className="table-cell text-center"><span className={`badge ${emp.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{emp.active ? 'Activo' : 'Inactivo'}</span></td>
                          <td className="table-cell">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => openPayroll(emp)} className="btn-ghost text-xs px-2 py-1.5 text-emerald-600 hover:bg-emerald-50"><Wallet size={14} /> Pagar</button>
                              <button onClick={() => openEdit(emp)} className="btn-ghost text-xs px-2 py-1.5 text-blue-600 hover:bg-blue-50"><Edit2 size={14} /> Editar</button>
                              <button onClick={() => handleDelete(emp)} className="btn-ghost text-xs px-2 py-1.5 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={filtered.length} label="empleados" />
            </div>
          </>
        )}

        {activeTab === 'payroll' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card p-4"><p className="text-xs text-gray-500">Pagos</p><p className="text-2xl font-bold">{payroll.length}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500">Total pagado</p><p className="text-2xl font-bold text-emerald-600">{formatCurrency(payrollTotal, cur)}</p></div>
              <div className="card p-4 flex gap-2 items-center justify-end">
                <button onClick={handleExportPayroll} className="btn-secondary"><Download size={14} /> CSV/Excel</button>
                <button onClick={() => printPayrollReport(business?.name ?? 'Vendix', payroll, cur)} className="btn-secondary"><Printer size={14} /> PDF</button>
              </div>
            </div>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr><th className="table-header">Empleado</th><th className="table-header">Periodo</th><th className="table-header">Fecha</th><th className="table-header text-right">Salario</th><th className="table-header text-right">Comision</th><th className="table-header text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {payroll.map(p => (
                    <tr key={p.id} className="table-row">
                      <td className="table-cell font-semibold">{p.employee.name}</td>
                      <td className="table-cell">{p.period}</td>
                      <td className="table-cell text-gray-500">{formatDateTime(p.paidAt)}</td>
                      <td className="table-cell text-right">{formatCurrency(p.baseSalary, cur)}</td>
                      <td className="table-cell text-right text-emerald-600">{formatCurrency(p.commissionAmount, cur)}</td>
                      <td className="table-cell text-right font-bold">{formatCurrency(p.totalAmount, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'sales' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card p-4"><p className="text-xs text-gray-500">Ventas del periodo</p><p className="text-2xl font-bold text-green-600">{formatCurrency(salesTotal, cur)}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500">Comisiones ganadas</p><p className="text-2xl font-bold text-emerald-600">{formatCurrency(commissionTotal, cur)}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500">Nota</p><p className="text-sm text-gray-500">Se empareja empleado con cajero por email.</p></div>
            </div>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr><th className="table-header">Empleado</th><th className="table-header">Usuario cajero</th><th className="table-header text-center">Ventas</th><th className="table-header text-right">Total vendido</th><th className="table-header text-right">%</th><th className="table-header text-right">Comision</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {(salesReport?.rows ?? []).map(row => (
                    <tr key={row.employee.id} className="table-row">
                      <td className="table-cell font-semibold">{row.employee.name}</td>
                      <td className="table-cell text-gray-500">{row.matchedUser?.email ?? 'Sin vincular'}</td>
                      <td className="table-cell text-center">{row.count}</td>
                      <td className="table-cell text-right font-semibold">{formatCurrency(row.total, cur)}</td>
                      <td className="table-cell text-right">{row.commissionRate}%</td>
                      <td className="table-cell text-right font-bold text-emerald-600">{formatCurrency(row.commissionAmount, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card p-4"><p className="text-xs text-gray-500">Registros</p><p className="text-2xl font-bold">{attendance.length}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500">Horas trabajadas</p><p className="text-2xl font-bold text-blue-600">{totalHours.toFixed(2)}h</p></div>
              <div className="card p-4 flex flex-wrap gap-2 justify-end">
                {employees.filter(e => e.active).slice(0, 4).map(emp => (
                  <button key={emp.id} onClick={() => attendanceMutation.mutate({ id: emp.id, action: 'check-in' })} className="btn-secondary text-xs"><LogIn size={12} /> {emp.name}</button>
                ))}
              </div>
            </div>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr><th className="table-header">Empleado</th><th className="table-header">Entrada</th><th className="table-header">Salida</th><th className="table-header text-right">Horas</th><th className="table-header text-center">Accion</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {attendance.map(r => (
                    <tr key={r.id} className="table-row">
                      <td className="table-cell font-semibold">{r.employee.name}</td>
                      <td className="table-cell">{formatDateTime(r.checkIn)}</td>
                      <td className="table-cell">{r.checkOut ? formatDateTime(r.checkOut) : <span className="badge bg-green-100 text-green-700">Abierto</span>}</td>
                      <td className="table-cell text-right">{r.hours != null ? `${r.hours.toFixed(2)}h` : '—'}</td>
                      <td className="table-cell text-center">
                        {!r.checkOut && <button onClick={() => attendanceMutation.mutate({ id: r.employee.id, action: 'check-out' })} className="btn-secondary text-xs"><LogOut size={12} /> Salida</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Editar empleado' : 'Nuevo empleado'}>
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Nombre completo *</label>
            <input {...register('name')} className="input" placeholder="Nombre del empleado" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Cargo / Rol</label><input {...register('role')} className="input" placeholder="Cajero, vendedor..." /></div>
            <div><label className="label">Salario mensual</label><input {...register('salary')} type="number" step="0.01" className="input" /></div>
            <div><label className="label">% comision</label><input {...register('commissionRate')} type="number" step="0.01" className="input" /></div>
            <div><label className="label">Telefono</label><input {...register('phone')} className="input" /></div>
            <div className="col-span-2"><label className="label">Correo del cajero</label><input {...register('email')} type="email" className="input" placeholder="Debe coincidir con el usuario cajero para comisiones" /></div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <input {...register('active')} type="checkbox" id="emp-active" className="w-4 h-4 rounded accent-blue-600 cursor-pointer" />
            <label htmlFor="emp-active" className="text-sm font-medium text-gray-700 cursor-pointer">Empleado activo</label>
          </div>
          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
            <button type="button" onClick={closeModal} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">{isSubmitting ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={payrollOpen} onClose={() => setPayrollOpen(false)} title={`Pagar nomina - ${paying?.name ?? ''}`}>
        {paying && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Periodo</label><input type="month" value={payrollForm.period} onChange={e => setPayrollForm(f => ({ ...f, period: e.target.value }))} className="input" /></div>
              <div><label className="label">Salario base</label><input value={paying.salary} disabled className="input bg-gray-50" /></div>
              <div><label className="label">Comision</label><input type="number" step="0.01" value={payrollForm.commissionAmount} onChange={e => setPayrollForm(f => ({ ...f, commissionAmount: Number(e.target.value) }))} className="input" /></div>
              <div><label className="label">Bono</label><input type="number" step="0.01" value={payrollForm.bonusAmount} onChange={e => setPayrollForm(f => ({ ...f, bonusAmount: Number(e.target.value) }))} className="input" /></div>
              <div><label className="label">Deducciones</label><input type="number" step="0.01" value={payrollForm.deductions} onChange={e => setPayrollForm(f => ({ ...f, deductions: Number(e.target.value) }))} className="input" /></div>
              <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Total a pagar</p><p className="text-xl font-black text-emerald-700">{formatCurrency(Math.max(0, paying.salary + payrollForm.commissionAmount + payrollForm.bonusAmount - payrollForm.deductions), cur)}</p></div>
            </div>
            <div><label className="label">Notas</label><input value={payrollForm.notes} onChange={e => setPayrollForm(f => ({ ...f, notes: e.target.value }))} className="input" /></div>
            <div className="flex justify-end gap-3 border-t border-gray-100 pt-3">
              <button onClick={() => setPayrollOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={() => payrollMutation.mutate()} disabled={payrollMutation.isPending} className="btn-primary"><Receipt size={15} /> Registrar pago</button>
            </div>
          </div>
        )}
      </Modal>

      {confirmDialog}
    </div>
  )
}
