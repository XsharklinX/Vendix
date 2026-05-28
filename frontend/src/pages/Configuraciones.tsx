import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { Modal } from '@/components/ui/Modal'
import {
  Building2, Users, Shield, Download, Plus,
  Trash2, ChevronRight, Store, Percent, FileText, Database, Settings,
  Briefcase, Phone, MapPin, Mail, Hash, AlertTriangle, CheckCircle2,
} from 'lucide-react'

const CURRENCIES = [
  { code: 'DOP', name: 'Peso Dominicano', symbol: 'RD$' },
  { code: 'USD', name: 'Dólar Americano', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'COP', name: 'Peso Colombiano', symbol: 'COP$' },
  { code: 'MXN', name: 'Peso Mexicano', symbol: 'MX$' },
  { code: 'VES', name: 'Bolívar Venezolano', symbol: 'Bs' },
]

const BUSINESS_TYPES = [
  'Tienda al por menor', 'Farmacia / Droguería', 'Supermercado / Colmado',
  'Restaurante / Comida', 'Servicios profesionales', 'Belleza / Salud',
  'Tecnología', 'Ropa / Moda', 'Construcción / Ferretería', 'Otro',
]

const NCF_TYPES = [
  { code: 'B01', label: 'B01 — Crédito Fiscal' },
  { code: 'B02', label: 'B02 — Consumidor Final' },
  { code: 'B14', label: 'B14 — Régimen Especial' },
  { code: 'B15', label: 'B15 — Gubernamental' },
]

type Tab = 'general' | 'impuestos' | 'ncf' | 'staff' | 'negocios' | 'backup'

interface StaffUser { id: string; name: string; email: string; role: string }

interface BusinessData {
  id: string; name: string; type?: string; currency: string
  city?: string; phone?: string; address?: string; email?: string; taxId?: string
  lowStockThreshold?: number; taxRate?: number; taxName?: string; taxIncluded?: boolean
  ncfType?: string; ncfSequence?: number; plan?: string
  autoBackupEnabled?: boolean; autoBackupInterval?: number; lastBackupAt?: string
}

const tabItems: { key: Tab; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'general', label: 'General', icon: Store, desc: 'Datos básicos del negocio' },
  { key: 'impuestos', label: 'Impuestos', icon: Percent, desc: 'ITBIS, IVA, configuración fiscal' },
  { key: 'ncf', label: 'NCF / DGII', icon: FileText, desc: 'Comprobantes fiscales RD' },
  { key: 'staff', label: 'Usuarios', icon: Users, desc: 'Cajeros y operadores' },
  { key: 'negocios', label: 'Mis negocios', icon: Briefcase, desc: 'Gestionar negocios' },
  { key: 'backup', label: 'Respaldo', icon: Database, desc: 'Exportar datos' },
]

export function Configuraciones() {
  const { business, businesses, setAuth, user, setBusiness, token } = useAuthStore()
  const bid = business!.id
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('general')

  // General form state
  const [form, setForm] = useState({
    name: '', type: '', currency: 'DOP', city: '', phone: '',
    address: '', email: '', taxId: '', lowStockThreshold: 5,
  })

  // Tax form state
  const [taxForm, setTaxForm] = useState({
    taxName: 'ITBIS', taxRate: 18, taxIncluded: true,
  })

  // NCF form state
  const [ncfForm, setNcfForm] = useState({ ncfType: '', ncfSequence: 1 })

  // Backup form state
  const [backupForm, setBackupForm] = useState({ autoBackupEnabled: false, autoBackupInterval: 7 })

  // Staff
  const [staffModal, setStaffModal] = useState(false)
  const [staffForm, setStaffForm] = useState({ name: '', email: '', password: '' })

  // Other
  const [newBizName, setNewBizName] = useState('')
  const [addingBiz, setAddingBiz] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data: bizData } = useQuery<BusinessData>({
    queryKey: ['business', bid],
    queryFn: () => api.get(`/businesses/${bid}`).then(r => r.data),
  })

  const { data: staffList = [], refetch: refetchStaff } = useQuery<StaffUser[]>({
    queryKey: ['staff', bid],
    queryFn: () => api.get(`/auth/staff/${bid}`).then(r => r.data),
  })

  // Sync forms when bizData loads
  useEffect(() => {
    if (!bizData) return
    setForm({
      name: bizData.name ?? '',
      type: bizData.type ?? '',
      currency: bizData.currency ?? 'DOP',
      city: bizData.city ?? '',
      phone: bizData.phone ?? '',
      address: bizData.address ?? '',
      email: bizData.email ?? '',
      taxId: bizData.taxId ?? '',
      lowStockThreshold: bizData.lowStockThreshold ?? 5,
    })
    setTaxForm({
      taxName: bizData.taxName ?? 'ITBIS',
      taxRate: bizData.taxRate != null ? Math.round(bizData.taxRate * 100 * 10) / 10 : 18,
      taxIncluded: bizData.taxIncluded ?? true,
    })
    setNcfForm({
      ncfType: bizData.ncfType ?? '',
      ncfSequence: bizData.ncfSequence ?? 1,
    })
    setBackupForm({
      autoBackupEnabled: bizData.autoBackupEnabled ?? false,
      autoBackupInterval: bizData.autoBackupInterval ?? 7,
    })
  }, [bizData])

  const updateMutation = useMutation({
    mutationFn: (data: object) => api.put(`/businesses/${bid}`, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['business', bid] })
      setBusiness(res.data)
      toast.success('Cambios guardados')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const handleSaveGeneral = async () => {
    setSaving(true)
    try {
      await updateMutation.mutateAsync(form)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveTax = async () => {
    setSaving(true)
    try {
      await updateMutation.mutateAsync({
        taxName: taxForm.taxName,
        taxRate: taxForm.taxRate / 100,
        taxIncluded: taxForm.taxIncluded,
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNcf = async () => {
    setSaving(true)
    try {
      await updateMutation.mutateAsync({
        ncfType: ncfForm.ncfType || null,
        ncfSequence: ncfForm.ncfSequence,
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveBackup = async () => {
    setSaving(true)
    try {
      await updateMutation.mutateAsync(backupForm)
    } finally {
      setSaving(false)
    }
  }

  const addBizMutation = useMutation({
    mutationFn: (name: string) => api.post('/businesses', { name }),
    onSuccess: async () => {
      const me = await api.get('/auth/me')
      setAuth(token!, me.data, me.data.businesses)
      setNewBizName('')
      setAddingBiz(false)
      toast.success('Negocio creado')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const createStaffMutation = useMutation({
    mutationFn: (data: object) => api.post('/auth/staff', data),
    onSuccess: () => {
      refetchStaff()
      setStaffModal(false)
      setStaffForm({ name: '', email: '', password: '' })
      toast.success('Cajero creado correctamente')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const deleteStaffMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/staff/${id}`),
    onSuccess: () => { refetchStaff(); toast.success('Cajero eliminado') },
    onError: () => toast.error('No se pudo eliminar'),
  })

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get(`/businesses/${bid}/export`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `vendix-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Respaldo descargado')
    } catch {
      toast.error('Error al exportar los datos')
    } finally {
      setExporting(false)
    }
  }

  const activeTab = tabItems.find(t => t.key === tab)!

  return (
    <div className="animate-fade-in">
      <div className="page-header bg-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center">
            <Settings size={18} className="text-gray-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Configuraciones</h1>
            <p className="text-xs text-gray-400">Ajusta tu negocio a tu manera</p>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* Sidebar de tabs */}
        <aside className="w-56 border-r border-gray-100 bg-white p-3 space-y-1 overflow-y-auto flex-shrink-0 hidden sm:block">
          {tabItems.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group ${
                  tab === t.key
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                    : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <Icon size={16} className={tab === t.key ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'} />
                <div className="min-w-0">
                  <p className={`text-sm font-medium truncate ${tab === t.key ? 'text-white' : ''}`}>{t.label}</p>
                </div>
                {tab === t.key && <ChevronRight size={14} className="ml-auto text-white/60" />}
              </button>
            )
          })}
        </aside>

        {/* Mobile tab selector */}
        <div className="sm:hidden w-full absolute z-10 bg-white border-b border-gray-100 px-4 py-2">
          <select
            value={tab}
            onChange={e => setTab(e.target.value as Tab)}
            className="input text-sm"
          >
            {tabItems.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:pt-6 pt-16">
          {/* Section header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <activeTab.icon size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">{activeTab.label}</h2>
              <p className="text-xs text-gray-400">{activeTab.desc}</p>
            </div>
          </div>

          {/* ── General ──────────────────────────────────────────────────────── */}
          {tab === 'general' && (
            <div className="space-y-5 max-w-xl">
              <div className="card p-5 space-y-4">
                <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                  <Building2 size={15} className="text-gray-400" /> Identidad del negocio
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="label">Nombre del negocio *</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="Mi Tienda" />
                  </div>
                  <div>
                    <label className="label">Tipo de negocio</label>
                    <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="input">
                      <option value="">Seleccionar...</option>
                      {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Moneda</label>
                    <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="input">
                      {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol} — {c.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="card p-5 space-y-4">
                <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                  <MapPin size={15} className="text-gray-400" /> Contacto y ubicación
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label"><MapPin size={11} className="inline mr-1" />Ciudad</label>
                    <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="input" placeholder="Santo Domingo" />
                  </div>
                  <div>
                    <label className="label"><Phone size={11} className="inline mr-1" />Teléfono</label>
                    <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input" placeholder="809-000-0000" />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Dirección</label>
                    <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="input" placeholder="Calle, número, sector" />
                  </div>
                  <div>
                    <label className="label"><Mail size={11} className="inline mr-1" />Email del negocio</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input" placeholder="negocio@ejemplo.com" />
                  </div>
                  <div>
                    <label className="label"><Hash size={11} className="inline mr-1" />RNC / Cédula fiscal</label>
                    <input value={form.taxId} onChange={e => setForm(f => ({ ...f, taxId: e.target.value }))} className="input" placeholder="000-00000-0" />
                  </div>
                </div>
              </div>

              <div className="card p-5">
                <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2 mb-4">
                  <AlertTriangle size={15} className="text-amber-400" /> Alertas de inventario
                </h3>
                <label className="label">Alerta stock bajo (unidades)</label>
                <input
                  type="number" min={0}
                  value={form.lowStockThreshold}
                  onChange={e => setForm(f => ({ ...f, lowStockThreshold: parseInt(e.target.value) || 0 }))}
                  className="input w-32"
                />
                <p className="text-xs text-gray-400 mt-1.5">Recibirás alertas cuando un producto tenga menos de este número de unidades.</p>
              </div>

              <button onClick={handleSaveGeneral} disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          )}

          {/* ── Impuestos ────────────────────────────────────────────────────── */}
          {tab === 'impuestos' && (
            <div className="space-y-5 max-w-xl">
              <div className="card p-5 space-y-5">
                <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                  <Percent size={15} className="text-gray-400" /> Configuración del impuesto
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Nombre del impuesto</label>
                    <input
                      value={taxForm.taxName}
                      onChange={e => setTaxForm(f => ({ ...f, taxName: e.target.value }))}
                      className="input"
                      placeholder="ITBIS / IVA / VAT"
                    />
                  </div>
                  <div>
                    <label className="label">Tasa (%)</label>
                    <div className="relative">
                      <input
                        type="number" min={0} max={100} step={0.1}
                        value={taxForm.taxRate}
                        onChange={e => setTaxForm(f => ({ ...f, taxRate: parseFloat(e.target.value) || 0 }))}
                        className="input pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">%</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">ITBIS dominicano = 18%</p>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div
                      onClick={() => setTaxForm(f => ({ ...f, taxIncluded: !f.taxIncluded }))}
                      className={`w-10 h-6 rounded-full transition-colors cursor-pointer relative flex-shrink-0 ${taxForm.taxIncluded ? 'bg-blue-600' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${taxForm.taxIncluded ? 'right-1' : 'left-1'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Precios incluyen impuesto</p>
                      <p className="text-xs text-gray-400">
                        {taxForm.taxIncluded
                          ? 'El impuesto se extrae del precio (precio ya incluye ITBIS)'
                          : 'El impuesto se agrega al total al momento de cobrar'
                        }
                      </p>
                    </div>
                  </label>
                </div>

                {/* Preview */}
                {taxForm.taxRate > 0 && (
                  <div className="bg-gray-50 rounded-xl p-4 text-sm">
                    <p className="font-medium text-gray-700 mb-2">Vista previa con precio RD$100</p>
                    {taxForm.taxIncluded ? (
                      <div className="space-y-1 text-gray-600">
                        <div className="flex justify-between"><span>Precio</span><span>RD$100.00</span></div>
                        <div className="flex justify-between text-gray-400"><span>{taxForm.taxName} incluido</span><span>RD${(100 - 100 / (1 + taxForm.taxRate / 100)).toFixed(2)}</span></div>
                        <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-1"><span>Total al cliente</span><span>RD$100.00</span></div>
                      </div>
                    ) : (
                      <div className="space-y-1 text-gray-600">
                        <div className="flex justify-between"><span>Precio base</span><span>RD$100.00</span></div>
                        <div className="flex justify-between text-gray-400"><span>{taxForm.taxName} {taxForm.taxRate}%</span><span>+RD${(100 * taxForm.taxRate / 100).toFixed(2)}</span></div>
                        <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-1"><span>Total al cliente</span><span>RD${(100 * (1 + taxForm.taxRate / 100)).toFixed(2)}</span></div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button onClick={handleSaveTax} disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : 'Guardar configuración de impuesto'}
              </button>
            </div>
          )}

          {/* ── NCF / DGII ───────────────────────────────────────────────────── */}
          {tab === 'ncf' && (
            <div className="space-y-5 max-w-xl">
              <div className="card p-5 space-y-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText size={16} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Números de Comprobante Fiscal (NCF)</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Requerido por la DGII para negocios en República Dominicana.</p>
                  </div>
                </div>

                <div>
                  <label className="label">Tipo de comprobante predeterminado</label>
                  <select value={ncfForm.ncfType} onChange={e => setNcfForm(f => ({ ...f, ncfType: e.target.value }))} className="input">
                    <option value="">Sin NCF (desactivado)</option>
                    {NCF_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
                  </select>
                  <p className="text-xs text-gray-400 mt-1.5">
                    La mayoría de negocios al consumidor final usan <strong>B02</strong>. Para ventas a empresas con crédito fiscal, usa <strong>B01</strong>.
                  </p>
                </div>

                {ncfForm.ncfType && (
                  <div>
                    <label className="label">Próxima secuencia</label>
                    <input
                      type="number" min={1}
                      value={ncfForm.ncfSequence}
                      onChange={e => setNcfForm(f => ({ ...f, ncfSequence: parseInt(e.target.value) || 1 }))}
                      className="input w-40"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      El próximo NCF generado será: <strong className="text-gray-700">{ncfForm.ncfType}{String(ncfForm.ncfSequence).padStart(8, '0')}</strong>
                    </p>
                  </div>
                )}

                {bizData?.ncfType && (
                  <div className="bg-green-50 rounded-xl p-4 flex items-center gap-3">
                    <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-green-800">NCF activo</p>
                      <p className="text-xs text-green-600">Tipo: {bizData.ncfType} · Próximo: {bizData.ncfType}{String(bizData.ncfSequence ?? 1).padStart(8, '0')}</p>
                    </div>
                  </div>
                )}
              </div>

              <button onClick={handleSaveNcf} disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : 'Guardar configuración NCF'}
              </button>
            </div>
          )}

          {/* ── Staff ────────────────────────────────────────────────────────── */}
          {tab === 'staff' && (
            <div className="space-y-5 max-w-xl">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Los cajeros solo pueden acceder al módulo de ventas.</p>
                <button onClick={() => setStaffModal(true)} className="btn-primary">
                  <Plus size={15} /> Nuevo cajero
                </button>
              </div>

              {/* Owner */}
              <div className="card p-4 flex items-center gap-3 border-blue-100">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Shield size={16} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{user?.name}</p>
                  <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                </div>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">OWNER</span>
              </div>

              {staffList.length === 0 ? (
                <div className="card p-10 text-center text-gray-400">
                  <Users size={36} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No hay cajeros registrados</p>
                  <p className="text-xs mt-1">Crea uno para que pueda acceder al POS</p>
                </div>
              ) : (
                <div className="card divide-y divide-gray-50 overflow-hidden">
                  {staffList.map(s => (
                    <div key={s.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50 group">
                      <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
                        <span className="text-purple-700 font-bold text-sm">{s.name[0].toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.email}</p>
                      </div>
                      <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">CAJERO</span>
                      <button
                        onClick={() => deleteStaffMutation.mutate(s.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Negocios ─────────────────────────────────────────────────────── */}
          {tab === 'negocios' && (
            <div className="space-y-4 max-w-xl">
              <div className="card divide-y divide-gray-50 overflow-hidden">
                {businesses.map(b => (
                  <div key={b.id} className={`flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors ${b.id === bid ? 'bg-blue-50/40' : ''}`}
                    onClick={() => setBusiness(b)}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${b.id === bid ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {b.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold truncate ${b.id === bid ? 'text-blue-700' : 'text-gray-900'}`}>{b.name}</p>
                      <p className="text-xs text-gray-400">{b.currency}</p>
                    </div>
                    {b.id === bid && <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Activo</span>}
                  </div>
                ))}
              </div>

              {addingBiz ? (
                <div className="card p-4 flex gap-3">
                  <input
                    value={newBizName}
                    onChange={e => setNewBizName(e.target.value)}
                    placeholder="Nombre del nuevo negocio"
                    className="input flex-1"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && addBizMutation.mutate(newBizName)}
                  />
                  <button onClick={() => addBizMutation.mutate(newBizName)} disabled={!newBizName.trim() || addBizMutation.isPending} className="btn-primary">
                    {addBizMutation.isPending ? 'Creando...' : 'Crear'}
                  </button>
                  <button onClick={() => setAddingBiz(false)} className="btn-secondary">Cancelar</button>
                </div>
              ) : (
                <button onClick={() => setAddingBiz(true)} className="btn-secondary">
                  <Plus size={15} /> Agregar negocio
                </button>
              )}
            </div>
          )}

          {/* ── Backup ───────────────────────────────────────────────────────── */}
          {tab === 'backup' && (
            <div className="space-y-4 max-w-xl">
              {/* Manual export */}
              <div className="card p-6 flex items-start gap-5">
                <div className="w-14 h-14 bg-gradient-to-br from-green-400 to-emerald-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-green-200">
                  <Download size={24} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 mb-1">Exportar respaldo completo</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Descarga todos tus datos — productos, clientes, transacciones, empleados, cotizaciones — en un archivo JSON.
                    Guárdalo en Google Drive, USB o correo.
                  </p>
                  <button onClick={handleExport} disabled={exporting} className="btn-primary">
                    <Download size={16} />
                    {exporting ? 'Exportando...' : 'Descargar respaldo JSON'}
                  </button>
                </div>
              </div>

              {/* Auto backup settings */}
              <div className="card p-5 space-y-4">
                <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                  <Database size={15} className="text-gray-400" /> Respaldo automático por correo
                </h3>
                <p className="text-xs text-gray-500">
                  Recibirás un archivo de respaldo en tu correo registrado según el intervalo configurado.
                  Requiere SMTP o Resend configurado en el servidor.
                </p>

                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setBackupForm(f => ({ ...f, autoBackupEnabled: !f.autoBackupEnabled }))}
                    className={`w-10 h-6 rounded-full transition-colors cursor-pointer relative flex-shrink-0 ${backupForm.autoBackupEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${backupForm.autoBackupEnabled ? 'right-1' : 'left-1'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">Activar respaldo automático</p>
                    <p className="text-xs text-gray-400">
                      {backupForm.autoBackupEnabled ? 'Respaldo automático activado' : 'Desactivado'}
                    </p>
                  </div>
                </label>

                {backupForm.autoBackupEnabled && (
                  <div>
                    <label className="label">Frecuencia</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number" min={1} max={365}
                        value={backupForm.autoBackupInterval}
                        onChange={e => setBackupForm(f => ({ ...f, autoBackupInterval: parseInt(e.target.value) || 7 }))}
                        className="input w-24"
                      />
                      <span className="text-sm text-gray-500">días</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {[1, 7, 14, 30].map(d => (
                        <button
                          key={d}
                          onClick={() => setBackupForm(f => ({ ...f, autoBackupInterval: d }))}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${backupForm.autoBackupInterval === d ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}
                        >
                          {d === 1 ? 'Diario' : d === 7 ? 'Semanal' : d === 14 ? 'Quincenal' : 'Mensual'}
                        </button>
                      ))}
                    </div>
                    {bizData?.lastBackupAt && (
                      <p className="text-xs text-gray-400 mt-2">
                        Último respaldo: {new Date(bizData.lastBackupAt).toLocaleDateString('es-DO', { dateStyle: 'medium' })}
                      </p>
                    )}
                  </div>
                )}

                <button onClick={handleSaveBackup} disabled={saving} className="btn-primary">
                  {saving ? 'Guardando...' : 'Guardar configuración de respaldo'}
                </button>
              </div>

              <div className="card p-4 bg-amber-50 border border-amber-100 flex items-start gap-3">
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Recomendación</p>
                  <p className="text-sm text-amber-700 mt-0.5">Realiza un respaldo al menos una vez por semana. Los datos se almacenan en este servidor.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal crear cajero */}
      <Modal open={staffModal} onClose={() => setStaffModal(false)} title="Nuevo cajero" size="sm">
        <div className="space-y-3">
          <div>
            <label className="label">Nombre completo</label>
            <input value={staffForm.name} onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="Juan Pérez" />
          </div>
          <div>
            <label className="label">Correo electrónico</label>
            <input type="email" value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} className="input" placeholder="cajero@negocio.com" />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input type="password" value={staffForm.password} onChange={e => setStaffForm(f => ({ ...f, password: e.target.value }))} className="input" placeholder="Mínimo 6 caracteres" />
          </div>
          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
            <button onClick={() => setStaffModal(false)} className="btn-secondary">Cancelar</button>
            <button
              onClick={() => createStaffMutation.mutate({ ...staffForm, businessId: bid })}
              disabled={!staffForm.name || !staffForm.email || !staffForm.password || createStaffMutation.isPending}
              className="btn-primary"
            >
              {createStaffMutation.isPending ? 'Creando...' : 'Crear cajero'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
