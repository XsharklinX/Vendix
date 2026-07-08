import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api, getErrorMessage, getErrorField } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { Modal } from '@/components/ui/Modal'
import { useSoundStore } from '@/store/sound'
import { playSound } from '@/lib/sound'
import {
  Building2, Users, Shield, Download, Plus,
  Trash2, ChevronRight, Store, Percent, FileText, Database, Settings,
  Briefcase, Phone, MapPin, Mail, Hash, AlertTriangle, CheckCircle2, Upload,
  Volume2, VolumeX, Monitor, Server, Cloud, RefreshCw,
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

type Tab = 'general' | 'impuestos' | 'ncf' | 'facturacion' | 'staff' | 'negocios' | 'backup' | 'sync' | 'sistema'

const FIELD_TABS: Record<string, Tab> = {
  name: 'general', email: 'general', lowStockThreshold: 'general',
  taxName: 'impuestos', taxRate: 'impuestos',
  ncfType: 'ncf', ncfSequence: 'ncf',
  invoicePrefix: 'facturacion', invoiceSequence: 'facturacion', logoUrl: 'facturacion', invoiceTemplate: 'facturacion',
  autoBackupEnabled: 'backup', autoBackupInterval: 'backup',
}

interface StaffUser { id: string; name: string; email: string; role: string }

interface BusinessData {
  id: string; name: string; type?: string; currency: string
  city?: string; phone?: string; address?: string; email?: string; taxId?: string
  lowStockThreshold?: number; taxRate?: number; taxName?: string; taxIncluded?: boolean
  ncfType?: string; ncfSequence?: number; plan?: string
  invoicePrefix?: string; invoiceSequence?: number; invoiceTemplate?: string; logoUrl?: string
  autoBackupEnabled?: boolean; autoBackupInterval?: number; lastBackupAt?: string
}

interface SystemStatus {
  appVersion: string
  environment: string
  startedAt: string
  updatedAt: string | null
  userDataPath: string | null
  databasePath: string | null
  frontendDist: string | null
}

interface DatabaseCheck {
  ok: boolean
  checkedAt?: string
  repairedAt?: string
  messages?: string[]
  before?: string[]
  after?: string[]
  actions?: string[]
  requiredRestore?: boolean
  wasHealthyBeforeRepair?: boolean
  error?: string
}

interface SyncWorkerStatus {
  enabled: boolean
  running: boolean
  configured: boolean
  cloudUrl: string | null
  localBusinessId: string | null
  cloudBusinessId: string | null
  deviceId: string | null
  deviceKey: string | null
  lastRunAt: string | null
  lastPushAt: string | null
  lastPullAt: string | null
  lastPullCursor: string | null
  lastError: string | null
  lastPushedCount: number
  lastPulledCount: number
}

interface BackupValidation {
  ok: boolean
  validatedAt: string
  sourceBusiness: string | null
  exportedAt: string | null
  counts: Record<string, number>
  warnings: string[]
  error?: string
  detail?: string
}

const tabItems: { key: Tab; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'general', label: 'General', icon: Store, desc: 'Datos básicos del negocio' },
  { key: 'impuestos', label: 'Impuestos', icon: Percent, desc: 'ITBIS, IVA, configuración fiscal' },
  { key: 'ncf', label: 'NCF / DGII', icon: FileText, desc: 'Comprobantes fiscales RD' },
  { key: 'facturacion', label: 'Facturación', icon: Hash, desc: 'Facturas, logo y plantillas' },
  { key: 'staff', label: 'Usuarios', icon: Users, desc: 'Cajeros y operadores' },
  { key: 'negocios', label: 'Mis negocios', icon: Briefcase, desc: 'Gestionar negocios' },
  { key: 'backup', label: 'Respaldo', icon: Database, desc: 'Exportar datos' },
  { key: 'sistema', label: 'Sistema', icon: Monitor, desc: 'Estado, versión y rutas locales' },
  { key: 'sync', label: 'Cloud sync', icon: Cloud, desc: 'Sincronizacion local/cloud' },
]

export function Configuraciones() {
  const { business, businesses, setAuth, user, setBusiness, token } = useAuthStore()
  const bid = business!.id
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('general')
  const { enabled: soundEnabled, volume: soundVolume, setEnabled: setSoundEnabled, setVolume: setSoundVolume } = useSoundStore()

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
  const [invoiceForm, setInvoiceForm] = useState({ invoicePrefix: 'FAC', invoiceSequence: 1, invoiceTemplate: 'classic', logoUrl: '' })

  // Backup form state
  const [backupForm, setBackupForm] = useState({ autoBackupEnabled: false, autoBackupInterval: 7 })

  // Staff
  const [staffModal, setStaffModal] = useState(false)
  const [staffForm, setStaffForm] = useState({ name: '', email: '', password: '' })

  // Reset data
  const [resetModal, setResetModal] = useState(false)
  const [resetConfirm, setResetConfirm] = useState('')

  // Other
  const [newBizName, setNewBizName] = useState('')
  const [addingBiz, setAddingBiz] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importSummary, setImportSummary] = useState<Record<string, { created: number; skipped: number }> | null>(null)
  const [pendingImportJson, setPendingImportJson] = useState<unknown | null>(null)
  const [backupValidation, setBackupValidation] = useState<BackupValidation | null>(null)
  const [updateState, setUpdateState] = useState<VendixUpdateState | null>(null)
  const [logInfo, setLogInfo] = useState<VendixLogInfo | null>(null)
  const [dbCheck, setDbCheck] = useState<DatabaseCheck | null>(null)
  const [syncConfig, setSyncConfig] = useState<VendixSyncConfigInput>({
    enabled: false,
    cloudUrl: '',
    cloudToken: '',
    localBusinessId: bid,
    cloudBusinessId: '',
    deviceKey: '',
    deviceName: '',
    intervalMs: 60000,
  })
  const [syncTokenSaved, setSyncTokenSaved] = useState(false)

  const { data: bizData } = useQuery<BusinessData>({
    queryKey: ['business', bid],
    queryFn: () => api.get(`/businesses/${bid}`).then(r => r.data),
  })

  const { data: staffList = [], refetch: refetchStaff } = useQuery<StaffUser[]>({
    queryKey: ['staff', bid],
    queryFn: () => api.get(`/auth/staff/${bid}`).then(r => r.data),
  })

  const { data: systemStatus } = useQuery<SystemStatus>({
    queryKey: ['system-status'],
    queryFn: () => api.get('/system/status').then(r => r.data),
    enabled: tab === 'sistema',
  })

  const { data: syncStatus, refetch: refetchSyncStatus } = useQuery<SyncWorkerStatus>({
    queryKey: ['sync-worker-status'],
    queryFn: () => api.get('/system/sync-worker').then(r => r.data),
    enabled: tab === 'sync',
    refetchInterval: tab === 'sync' ? 15000 : false,
  })

  useEffect(() => {
    if (tab !== 'sistema' || !window.electronAPI) return

    window.electronAPI.getUpdateState().then(setUpdateState).catch(() => undefined)
    window.electronAPI.getLogInfo().then(setLogInfo).catch(() => undefined)
    const unsubscribe = window.electronAPI.onUpdateState(setUpdateState)
    return unsubscribe
  }, [tab])

  useEffect(() => {
    if (tab !== 'sync') return
    if (!window.electronAPI) {
      setSyncConfig(current => ({ ...current, localBusinessId: current.localBusinessId || bid }))
      return
    }

    window.electronAPI.getSyncConfig().then(config => {
      setSyncTokenSaved(config.hasCloudToken)
      setSyncConfig({
        enabled: config.enabled,
        cloudUrl: config.cloudUrl,
        cloudToken: '',
        localBusinessId: config.localBusinessId || bid,
        cloudBusinessId: config.cloudBusinessId || bid,
        deviceKey: config.deviceKey || `vendix-${bid.slice(0, 8)}`,
        deviceName: config.deviceName || 'Caja principal',
        intervalMs: config.intervalMs || 60000,
      })
    }).catch(() => undefined)
  }, [tab, bid])

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
    setInvoiceForm({
      invoicePrefix: bizData.invoicePrefix ?? 'FAC',
      invoiceSequence: bizData.invoiceSequence ?? 1,
      invoiceTemplate: bizData.invoiceTemplate ?? 'classic',
      logoUrl: bizData.logoUrl ?? '',
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
    onError: (e) => {
      toast.error(getErrorMessage(e))
      const field = getErrorField(e)
      if (!field) return
      const targetTab = FIELD_TABS[field]
      if (targetTab) setTab(targetTab)
      setTimeout(() => {
        const el = document.getElementById(`field-${field}`)
        if (!el) return
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.focus()
        el.classList.add('ring-2', 'ring-red-500')
        setTimeout(() => el.classList.remove('ring-2', 'ring-red-500'), 2000)
      }, targetTab ? 100 : 0)
    },
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

  const handleSaveInvoice = async () => {
    setSaving(true)
    try {
      await updateMutation.mutateAsync({
        invoicePrefix: invoiceForm.invoicePrefix,
        invoiceSequence: invoiceForm.invoiceSequence,
        invoiceTemplate: invoiceForm.invoiceTemplate,
        logoUrl: invoiceForm.logoUrl || '',
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

  const resetMutation = useMutation({
    mutationFn: () => api.delete(`/businesses/${bid}/reset`, { data: { confirm: business!.name } }),
    onSuccess: () => {
      qc.clear()
      setResetModal(false)
      setResetConfirm('')
      toast.success('Todos los datos han sido eliminados')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const importMutation = useMutation({
    mutationFn: (data: unknown) => api.post(`/businesses/${bid}/import`, data).then(r => r.data),
    onSuccess: (data) => {
      setImportSummary(data.summary)
      setPendingImportJson(null)
      setBackupValidation(null)
      qc.invalidateQueries({ queryKey: ['products', bid] })
      qc.invalidateQueries({ queryKey: ['clients', bid] })
      qc.invalidateQueries({ queryKey: ['suppliers', bid] })
      qc.invalidateQueries({ queryKey: ['employees', bid] })
      toast.success('Respaldo restaurado correctamente')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const validateBackupMutation = useMutation({
    mutationFn: (data: unknown) => api.post(`/businesses/${bid}/import/validate`, data).then(r => r.data as BackupValidation),
    onSuccess: (data) => {
      setBackupValidation(data)
      if (data.ok) toast.success('Respaldo validado. Revisa el resumen antes de restaurar.')
      else toast.error(data.error || 'El respaldo no contiene datos importables')
    },
    onError: (e) => {
      setBackupValidation(null)
      setPendingImportJson(null)
      toast.error(getErrorMessage(e))
    },
  })

  const checkDatabaseMutation = useMutation({
    mutationFn: () => api.get('/system/database/check').then(r => r.data as DatabaseCheck),
    onSuccess: (data) => {
      setDbCheck(data)
      if (data.ok) toast.success('Base de datos validada correctamente')
      else toast.error('La base de datos requiere revision')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const repairDatabaseMutation = useMutation({
    mutationFn: () => api.post('/system/database/repair').then(r => r.data as DatabaseCheck),
    onSuccess: (data) => {
      setDbCheck(data)
      if (data.ok) toast.success('Reparacion basica completada')
      else toast.error('La reparacion no resolvio todos los problemas')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const saveSyncConfigMutation = useMutation({
    mutationFn: async () => {
      if (!window.electronAPI) throw new Error('Disponible solo en la app instalada')
      return window.electronAPI.saveSyncConfig(syncConfig)
    },
    onSuccess: async (config) => {
      setSyncTokenSaved(config.hasCloudToken)
      setSyncConfig(current => ({ ...current, cloudToken: '' }))
      await api.post('/system/sync-worker/reload').catch(() => undefined)
      await refetchSyncStatus()
      toast.success('Configuracion de sincronizacion guardada')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : getErrorMessage(e)),
  })

  const runSyncMutation = useMutation({
    mutationFn: () => api.post('/system/sync-worker/run').then(r => r.data as SyncWorkerStatus),
    onSuccess: (data) => {
      refetchSyncStatus()
      if (data.lastError) toast.error(data.lastError)
      else toast.success('Sincronizacion ejecutada')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string)
        setPendingImportJson(json)
        setImportSummary(null)
        validateBackupMutation.mutate(json)
      } catch {
        toast.error('El archivo no es un JSON válido')
      }
    }
    reader.readAsText(file)
  }

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
                    <input id="field-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="Mi Tienda" />
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
                    <input id="field-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input" placeholder="negocio@ejemplo.com" />
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
                  id="field-lowStockThreshold"
                  type="number" min={0}
                  value={form.lowStockThreshold}
                  onChange={e => setForm(f => ({ ...f, lowStockThreshold: parseInt(e.target.value) || 0 }))}
                  className="input w-32"
                />
                <p className="text-xs text-gray-400 mt-1.5">Recibirás alertas cuando un producto tenga menos de este número de unidades.</p>
              </div>

              <div className="card p-5">
                <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2 mb-1">
                  {soundEnabled ? <Volume2 size={15} className="text-gray-400" /> : <VolumeX size={15} className="text-gray-400" />} Sonidos
                </h3>
                <p className="text-xs text-gray-400 mb-4">Activa pequeños sonidos al completar una venta, escanear un código o recibir notificaciones.</p>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm font-medium text-gray-700">Activar sonidos</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundEnabled}
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${soundEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-600'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${soundEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </label>
                {soundEnabled && (
                  <div className="mt-4">
                    <label className="label">Volumen</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min={0} max={1} step={0.05}
                        value={soundVolume}
                        onChange={e => setSoundVolume(parseFloat(e.target.value))}
                        onMouseUp={() => playSound('notify')}
                        onTouchEnd={() => playSound('notify')}
                        className="flex-1"
                      />
                      <span className="text-xs text-gray-400 w-10 text-right">{Math.round(soundVolume * 100)}%</span>
                    </div>
                  </div>
                )}
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

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Cobrar impuesto</p>
                    <p className="text-xs text-gray-400">
                      {taxForm.taxRate > 0
                        ? `${taxForm.taxName} ${taxForm.taxRate}% activo — se aplica a cada venta`
                        : 'Desactivado — las ventas no incluirán impuesto'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTaxForm(f => ({ ...f, taxRate: f.taxRate > 0 ? 0 : 18 }))}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${taxForm.taxRate > 0 ? 'bg-blue-600' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${taxForm.taxRate > 0 ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {taxForm.taxRate > 0 && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label">Nombre del impuesto</label>
                        <input
                          id="field-taxName"
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
                            id="field-taxRate"
                            type="number" min={1} max={100} step={0.1}
                            value={taxForm.taxRate}
                            onChange={e => setTaxForm(f => ({ ...f, taxRate: parseFloat(e.target.value) || 0 }))}
                            className="input pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">%</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">ITBIS dominicano = 18%</p>
                      </div>
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer">
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
                            : 'El impuesto se agrega al total al momento de cobrar'}
                        </p>
                      </div>
                    </label>

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
                  </>
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
                  <select id="field-ncfType" value={ncfForm.ncfType} onChange={e => setNcfForm(f => ({ ...f, ncfType: e.target.value }))} className="input">
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
                      id="field-ncfSequence"
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
          {tab === 'facturacion' && (
            <div className="space-y-5 max-w-xl">
              <div className="card p-5 space-y-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Hash size={16} className="text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Facturación profesional</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Configura numeración interna, logo y diseño de factura.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Prefijo de factura</label>
                    <input id="field-invoicePrefix" value={invoiceForm.invoicePrefix} onChange={e => setInvoiceForm(f => ({ ...f, invoicePrefix: e.target.value.toUpperCase() }))} className="input" placeholder="FAC" />
                  </div>
                  <div>
                    <label className="label">Próxima secuencia</label>
                    <input id="field-invoiceSequence" type="number" min={1} value={invoiceForm.invoiceSequence} onChange={e => setInvoiceForm(f => ({ ...f, invoiceSequence: parseInt(e.target.value) || 1 }))} className="input" />
                  </div>
                </div>

                <div>
                  <label className="label">Plantilla predeterminada</label>
                  <select value={invoiceForm.invoiceTemplate} onChange={e => setInvoiceForm(f => ({ ...f, invoiceTemplate: e.target.value }))} className="input">
                    <option value="classic">Clásica A4</option>
                    <option value="modern">Moderna</option>
                    <option value="thermal">Térmica / recibo ancho</option>
                  </select>
                </div>

                <div>
                  <label className="label">URL del logo</label>
                  <input id="field-logoUrl" value={invoiceForm.logoUrl} onChange={e => setInvoiceForm(f => ({ ...f, logoUrl: e.target.value }))} className="input" placeholder="https://..." />
                  <p className="text-xs text-gray-400 mt-1">Debe ser una URL pública para que también aparezca en emails.</p>
                </div>

                <div className="bg-indigo-50 rounded-xl p-4">
                  <p className="text-xs text-indigo-600 font-semibold">Próxima factura</p>
                  <p className="text-xl font-black text-indigo-700">{invoiceForm.invoicePrefix || 'FAC'}-{String(invoiceForm.invoiceSequence).padStart(6, '0')}</p>
                </div>
              </div>

              <button onClick={handleSaveInvoice} disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : 'Guardar configuración de factura'}
              </button>
            </div>
          )}

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

              {/* Manual import / restore */}
              {user?.role !== 'CASHIER' && (
                <div className="card p-6 flex items-start gap-5">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-200">
                    <Upload size={24} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 mb-1">Restaurar desde respaldo</h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Sube un archivo JSON de respaldo para restaurar productos, categorías, clientes, proveedores y empleados.
                      Los registros que ya existan (mismo código de barras, nombre o documento) se omiten para evitar duplicados.
                    </p>
                    <label className="btn-secondary cursor-pointer inline-flex">
                      <Upload size={16} />
                      {validateBackupMutation.isPending ? 'Validando...' : importMutation.isPending ? 'Restaurando...' : 'Seleccionar archivo JSON'}
                      <input type="file" accept="application/json" className="hidden" onChange={handleImportFile} disabled={importMutation.isPending || validateBackupMutation.isPending} />
                    </label>

                    {backupValidation && (
                      <div className={`mt-4 rounded-xl border p-3 text-sm space-y-3 ${backupValidation.ok ? 'border-blue-100 bg-blue-50/60' : 'border-amber-100 bg-amber-50/60'}`}>
                        <div>
                          <p className={`font-semibold flex items-center gap-1.5 ${backupValidation.ok ? 'text-blue-800' : 'text-amber-800'}`}>
                            {backupValidation.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                            Validacion previa del respaldo
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            Origen: {backupValidation.sourceBusiness || 'No identificado'} · Exportado: {backupValidation.exportedAt ? new Date(backupValidation.exportedAt).toLocaleString('es-DO') : 'Sin fecha'}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {Object.entries(backupValidation.counts).map(([key, value]) => (
                            <div key={key} className="rounded-lg bg-white/70 px-2 py-1.5 border border-white">
                              <span className="font-semibold text-gray-800">{value}</span> <span className="text-gray-500">{key}</span>
                            </div>
                          ))}
                        </div>
                        {backupValidation.warnings.length > 0 && (
                          <div className="space-y-1">
                            {backupValidation.warnings.map(warning => (
                              <p key={warning} className="text-xs text-amber-700">• {warning}</p>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            disabled={!backupValidation.ok || !pendingImportJson || importMutation.isPending}
                            onClick={() => pendingImportJson && importMutation.mutate(pendingImportJson)}
                            className="btn-primary"
                          >
                            {importMutation.isPending ? 'Restaurando...' : 'Confirmar restauracion'}
                          </button>
                          <button
                            onClick={() => { setPendingImportJson(null); setBackupValidation(null) }}
                            className="btn-secondary"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {importSummary && (
                      <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm space-y-1">
                        <p className="font-semibold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 size={14} /> Restauración completada</p>
                        {Object.entries(importSummary).map(([key, v]) => (
                          <p key={key} className="text-emerald-700 text-xs">
                            {key}: {v.created} agregado(s), {v.skipped} omitido(s) por duplicado
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

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

              {/* Zona de peligro */}
              {user?.role !== 'CASHIER' && (
                <div className="card p-5 border border-red-200 bg-red-50/40 space-y-3">
                  <div className="flex items-center gap-2">
                    <Trash2 size={16} className="text-red-500" />
                    <h3 className="font-semibold text-red-700 text-sm">Zona de peligro</h3>
                  </div>
                  <p className="text-sm text-red-600">
                    Elimina permanentemente <strong>todos los datos operativos</strong>: productos, clientes, proveedores,
                    empleados, ventas, cotizaciones y movimientos. Tu cuenta y configuración del negocio se conservan.
                  </p>
                  <p className="text-xs text-red-500 font-medium">Esta acción no se puede deshacer. Descarga un respaldo antes.</p>
                  <button
                    onClick={() => { setResetModal(true); setResetConfirm('') }}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 border border-red-300 rounded-xl hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={14} /> Eliminar todos los datos
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Sistema ─────────────────────────────────────────────────────── */}
          {tab === 'sync' && (
            <div className="space-y-4 max-w-4xl">
              <div className="card p-5 border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-950/30 dark:to-slate-900">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-cyan-600 flex items-center justify-center shadow-sm">
                      <Cloud size={22} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-slate-100">Sincronizacion local/cloud</h3>
                      <p className="text-sm text-gray-600 dark:text-slate-400 max-w-2xl">
                        Activa el worker automatico para enviar cambios locales al backend cloud y recibir cambios de otros equipos. El POS local sigue funcionando aunque la nube falle.
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                    syncStatus?.enabled && syncStatus?.configured
                      ? 'bg-emerald-100 text-emerald-700'
                      : syncStatus?.enabled
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                  }`}>
                    {syncStatus?.enabled ? (syncStatus.configured ? 'Activo' : 'Incompleto') : 'Apagado'}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="card p-5 space-y-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-slate-100">Configuracion</h3>
                      <p className="text-sm text-gray-500 dark:text-slate-400">Se guarda localmente en la carpeta de datos de Vendix.</p>
                    </div>
                    <label className="inline-flex items-center gap-3 cursor-pointer">
                      <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">Activar</span>
                      <button
                        type="button"
                        onClick={() => setSyncConfig(current => ({ ...current, enabled: !current.enabled }))}
                        className={`relative h-7 w-12 rounded-full transition-colors ${syncConfig.enabled ? 'bg-cyan-600' : 'bg-gray-200'}`}
                      >
                        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${syncConfig.enabled ? 'right-1' : 'left-1'}`} />
                      </button>
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="label">URL del backend cloud</label>
                      <input value={syncConfig.cloudUrl} onChange={e => setSyncConfig(f => ({ ...f, cloudUrl: e.target.value }))} className="input" placeholder="https://api.tu-dominio.com" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Token cloud</label>
                      <input
                        type="password"
                        value={syncConfig.cloudToken || ''}
                        onChange={e => setSyncConfig(f => ({ ...f, cloudToken: e.target.value }))}
                        className="input"
                        placeholder={syncTokenSaved ? 'Token guardado. Escribe uno nuevo para reemplazarlo.' : 'Pega aqui el JWT del usuario cloud'}
                      />
                      <p className="text-xs text-gray-400 mt-1">{syncTokenSaved ? 'Hay un token guardado. Por seguridad no se muestra en pantalla.' : 'No hay token guardado todavia.'}</p>
                    </div>
                    <div>
                      <label className="label">ID negocio local</label>
                      <input value={syncConfig.localBusinessId} onChange={e => setSyncConfig(f => ({ ...f, localBusinessId: e.target.value }))} className="input font-mono text-xs" />
                    </div>
                    <div>
                      <label className="label">ID negocio cloud</label>
                      <input value={syncConfig.cloudBusinessId} onChange={e => setSyncConfig(f => ({ ...f, cloudBusinessId: e.target.value }))} className="input font-mono text-xs" />
                    </div>
                    <div>
                      <label className="label">Clave del dispositivo</label>
                      <input value={syncConfig.deviceKey} onChange={e => setSyncConfig(f => ({ ...f, deviceKey: e.target.value }))} className="input" placeholder="desktop-main" />
                    </div>
                    <div>
                      <label className="label">Nombre del dispositivo</label>
                      <input value={syncConfig.deviceName} onChange={e => setSyncConfig(f => ({ ...f, deviceName: e.target.value }))} className="input" placeholder="Caja principal" />
                    </div>
                    <div>
                      <label className="label">Intervalo</label>
                      <select value={syncConfig.intervalMs} onChange={e => setSyncConfig(f => ({ ...f, intervalMs: Number(e.target.value) }))} className="input">
                        <option value={15000}>15 segundos</option>
                        <option value={30000}>30 segundos</option>
                        <option value={60000}>1 minuto</option>
                        <option value={300000}>5 minutos</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                    <button
                      className="btn-primary"
                      disabled={!window.electronAPI || saveSyncConfigMutation.isPending || (syncConfig.enabled && (!syncConfig.cloudUrl || (!syncConfig.cloudToken && !syncTokenSaved) || !syncConfig.localBusinessId || !syncConfig.cloudBusinessId || !syncConfig.deviceKey))}
                      onClick={() => saveSyncConfigMutation.mutate()}
                    >
                      {saveSyncConfigMutation.isPending ? 'Guardando...' : 'Guardar configuracion'}
                    </button>
                    <button className="btn-secondary" disabled={runSyncMutation.isPending || !syncStatus?.configured} onClick={() => runSyncMutation.mutate()}>
                      <RefreshCw size={14} className={runSyncMutation.isPending ? 'animate-spin' : ''} />
                      {runSyncMutation.isPending ? 'Probando...' : 'Probar ahora'}
                    </button>
                  </div>

                  {!window.electronAPI && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                      Esta configuracion solo se puede guardar desde la app instalada de escritorio.
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="card p-5 space-y-3">
                    <h3 className="font-bold text-gray-900 dark:text-slate-100">Estado del worker</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3"><p className="text-xs text-gray-400">Configurado</p><p className="font-semibold">{syncStatus?.configured ? 'Si' : 'No'}</p></div>
                      <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3"><p className="text-xs text-gray-400">Ejecutando</p><p className="font-semibold">{syncStatus?.running ? 'Si' : 'No'}</p></div>
                      <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3"><p className="text-xs text-gray-400">Ultimo push</p><p className="font-semibold">{syncStatus?.lastPushedCount ?? 0}</p></div>
                      <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3"><p className="text-xs text-gray-400">Ultimo pull</p><p className="font-semibold">{syncStatus?.lastPulledCount ?? 0}</p></div>
                    </div>
                    {[
                      ['Ultima corrida', syncStatus?.lastRunAt],
                      ['Ultimo envio', syncStatus?.lastPushAt],
                      ['Ultima recepcion', syncStatus?.lastPullAt],
                    ].map(([label, value]) => (
                      <div key={label} className="text-xs">
                        <p className="font-semibold text-gray-400">{label}</p>
                        <p className="text-gray-700 dark:text-slate-300">{value ? new Date(value).toLocaleString('es-DO') : 'No disponible'}</p>
                      </div>
                    ))}
                    {syncStatus?.lastError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{syncStatus.lastError}</div>}
                  </div>

                  <div className="card p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Recomendacion</p>
                    <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">Antes de activar en produccion, prueba con un negocio duplicado y confirma que productos, clientes, proveedores y empleados suben y bajan correctamente.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'sistema' && (
            <div className="space-y-4 max-w-3xl">
              <div className="card p-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 dark:bg-slate-700 flex items-center justify-center">
                    <Server size={22} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-slate-100">Estado operativo</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Información útil para soporte, backups y diagnóstico de instalación.</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="card p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-slate-100">Actualizaciones</h3>
                      <p className="text-sm text-gray-500 dark:text-slate-400">Canal, busqueda manual y aviso visible de nueva version.</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                      updateState?.status === 'downloaded' || updateState?.status === 'available'
                        ? 'bg-emerald-100 text-emerald-700'
                        : updateState?.status === 'error'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}>
                      {updateState?.status || 'desktop'}
                    </span>
                  </div>

                  {updateState?.status === 'downloaded' && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-sm font-semibold text-emerald-800">Nueva version disponible</p>
                      <p className="text-xs text-emerald-700 mt-1">{updateState.message}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3">
                      <p className="text-xs text-gray-400">Instalada</p>
                      <p className="font-semibold text-gray-900 dark:text-slate-100">{updateState?.currentVersion || systemStatus?.appVersion || 'dev'}</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3">
                      <p className="text-xs text-gray-400">Canal</p>
                      <p className="font-semibold text-gray-900 dark:text-slate-100">{updateState?.channel || 'stable'}</p>
                    </div>
                  </div>

                  {updateState?.message && <p className="text-xs text-gray-500 dark:text-slate-400">{updateState.message}</p>}

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-secondary"
                      disabled={!window.electronAPI || updateState?.status === 'checking' || updateState?.status === 'downloading'}
                      onClick={async () => {
                        if (!window.electronAPI) return toast.error('Disponible solo en la app instalada')
                        setUpdateState(await window.electronAPI.checkForUpdates())
                      }}
                    >
                      Buscar actualizacion
                    </button>
                    <button
                      className="btn-primary"
                      disabled={!window.electronAPI || updateState?.status !== 'downloaded'}
                      onClick={() => window.electronAPI?.installUpdate()}
                    >
                      Reiniciar e instalar
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={!window.electronAPI}
                      onClick={async () => {
                        if (!window.electronAPI) return
                        const next = updateState?.channel === 'beta' ? 'stable' : 'beta'
                        setUpdateState(await window.electronAPI.setUpdateChannel(next))
                      }}
                    >
                      Usar canal {updateState?.channel === 'beta' ? 'estable' : 'beta'}
                    </button>
                  </div>
                </div>

                <div className="card p-5 space-y-4">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-slate-100">Logs y diagnostico</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Archivos utiles para soporte y mantenimiento local.</p>
                  </div>

                  <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3">
                    <p className="text-xs text-gray-400">Archivo de log</p>
                    <p className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-slate-300">{logInfo?.path || 'No disponible en navegador'}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {logInfo?.updatedAt ? `Actualizado ${new Date(logInfo.updatedAt).toLocaleString('es-DO')}` : 'Sin lecturas recientes'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-secondary"
                      disabled={!window.electronAPI}
                      onClick={async () => {
                        if (!window.electronAPI) return toast.error('Disponible solo en la app instalada')
                        await window.electronAPI.openLogFile()
                        setLogInfo(await window.electronAPI.getLogInfo())
                      }}
                    >
                      Abrir log
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={!window.electronAPI}
                      onClick={() => window.electronAPI?.openUserData()}
                    >
                      Abrir carpeta de datos
                    </button>
                  </div>

                  {logInfo?.tail && (
                    <pre className="max-h-36 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] text-slate-200 whitespace-pre-wrap">{logInfo.tail}</pre>
                  )}
                </div>
              </div>

              <div className="card p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-slate-100">Base de datos</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Validacion SQLite y reparacion basica antes de recurrir a restaurar backup.</p>
                  </div>
                  {dbCheck && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${dbCheck.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {dbCheck.ok ? 'Saludable' : 'Revisar'}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-secondary"
                    disabled={checkDatabaseMutation.isPending}
                    onClick={() => checkDatabaseMutation.mutate()}
                  >
                    {checkDatabaseMutation.isPending ? 'Validando...' : 'Validar base de datos'}
                  </button>
                  <button
                    className="btn-primary"
                    disabled={repairDatabaseMutation.isPending}
                    onClick={() => repairDatabaseMutation.mutate()}
                  >
                    {repairDatabaseMutation.isPending ? 'Reparando...' : 'Reparacion basica'}
                  </button>
                </div>
                {dbCheck && (
                  <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3 text-xs text-gray-600 dark:text-slate-300 space-y-1">
                    {(dbCheck.after || dbCheck.messages || []).map(message => (
                      <p key={message}>{message}</p>
                    ))}
                    {dbCheck.requiredRestore && <p className="font-semibold text-red-600">Si esto persiste, restaura un respaldo validado.</p>}
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ['Versión instalada', systemStatus?.appVersion || 'development'],
                  ['Entorno', systemStatus?.environment || 'development'],
                  ['Inicio del servidor', systemStatus?.startedAt ? new Date(systemStatus.startedAt).toLocaleString('es-DO') : 'No disponible'],
                  ['Última actualización', systemStatus?.updatedAt ? new Date(systemStatus.updatedAt).toLocaleString('es-DO') : 'No disponible'],
                  ['Último respaldo', bizData?.lastBackupAt ? new Date(bizData.lastBackupAt).toLocaleString('es-DO') : 'Sin respaldos registrados'],
                  ['Negocio activo', business?.name || 'No disponible'],
                ].map(([label, value]) => (
                  <div key={label} className="card p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">{label}</p>
                    <p className="mt-1 font-semibold text-gray-900 dark:text-slate-100">{value}</p>
                  </div>
                ))}
              </div>

              <div className="card overflow-hidden">
                {[
                  ['Ruta de datos de usuario', systemStatus?.userDataPath],
                  ['Base de datos SQLite', systemStatus?.databasePath],
                  ['Frontend empaquetado', systemStatus?.frontendDist],
                ].map(([label, value]) => (
                  <div key={label} className="border-b border-gray-100 dark:border-slate-700 last:border-b-0 px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">{label}</p>
                    <p className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-slate-300">{value || 'No disponible en desarrollo'}</p>
                  </div>
                ))}
              </div>

              <div className="card p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Uso recomendado</p>
                <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">Si necesitas soporte, comparte esta pantalla junto con el archivo de log ubicado en la carpeta de datos de usuario.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal eliminar todos los datos */}
      <Modal open={resetModal} onClose={() => { setResetModal(false); setResetConfirm('') }} title="Eliminar todos los datos" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-200">
            <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700 space-y-1">
              <p className="font-semibold">Esta acción es irreversible.</p>
              <p>Se eliminarán todos los productos, clientes, proveedores, empleados, ventas, cotizaciones y movimientos del negocio <strong>{business?.name}</strong>.</p>
            </div>
          </div>
          <div>
            <label className="label">
              Escribe <span className="font-mono font-bold text-gray-800">{business?.name}</span> para confirmar
            </label>
            <input
              value={resetConfirm}
              onChange={e => setResetConfirm(e.target.value)}
              className="input"
              placeholder={business?.name}
              autoComplete="off"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={() => { setResetModal(false); setResetConfirm('') }} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button
              disabled={resetConfirm !== business?.name || resetMutation.isPending}
              onClick={() => resetMutation.mutate()}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 size={14} />
              {resetMutation.isPending ? 'Eliminando...' : 'Sí, eliminar todo'}
            </button>
          </div>
        </div>
      </Modal>

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
