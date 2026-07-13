import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { api, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { formatCurrency } from '@/lib/utils'
import { exportCSV, EXPORT_COLUMNS } from '@/lib/export'
import { PageHeader } from '@/components/ui/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { QueryError } from '@/components/ui/QueryError'
import { TableRowSkeleton } from '@/components/ui/Skeleton'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Plus, Package, Search, Edit2, Trash2, AlertTriangle, Download, Tag, History, TrendingUp, TrendingDown, Upload, ShoppingCart, ClipboardList, SlidersHorizontal, Scale, ArrowRightLeft } from 'lucide-react'
import { Pagination } from '@/components/ui/Pagination'
import { ImportCSV } from '@/components/ui/ImportCSV'
import { formatDate } from '@/lib/utils'
import { TrashPanel } from '@/components/ui/TrashPanel'
import { usePersistentState } from '@/lib/usePersistentState'

interface PriceHistoryEntry {
  id: string
  oldPrice: number
  newPrice: number
  changedAt: string
}

interface StockMovement {
  id: string
  type: string
  quantity: number
  balanceAfter: number
  reason?: string | null
  refType?: string | null
  createdAt: string
  createdBy?: { name: string } | null
}

const STOCK_MOVEMENT_LABELS: Record<string, string> = {
  SALE: 'Venta',
  RETURN: 'Devolución',
  PURCHASE: 'Compra',
  RECEPTION: 'Recepción de OC',
  ADJUSTMENT: 'Ajuste manual',
  CANCEL: 'Anulación',
  PHYSICAL_COUNT: 'Conteo físico',
  TRANSFER_OUT: 'Transferencia salida',
  TRANSFER_IN: 'Transferencia entrada',
}

const schema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  description: z.string().optional(),
  price: z.coerce.number().min(0, 'El precio no puede ser negativo'),
  cost: z.coerce.number().min(0, 'El costo no puede ser negativo').optional(),
  quantity: z.coerce.number().int().min(0, 'La cantidad no puede ser negativa').optional(),
  barcode: z.string().optional(),
  categoryId: z.string().optional(),
  lowStockThreshold: z.union([z.coerce.number().int().min(0), z.literal('')]).optional(),
})

type Form = z.infer<typeof schema>

interface Product {
  id: string
  name: string
  description?: string
  price: number
  cost: number
  quantity: number
  barcode?: string
  categoryId?: string
  lowStockThreshold?: number | null
  category?: { id: string; name: string }
}

interface InventoryAlerts {
  lowStock: Product[]
  lowMargin: Array<Product & { margin: number }>
  noMovement: Product[]
  meta: { noMovementDays: number; lowMarginThreshold: number; lowStockDefault: number }
}

export function Inventario() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const qc = useQueryClient()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const LOW_STOCK = business?.lowStockThreshold ?? 5
  const [modalOpen, setModalOpen] = useState(false)
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [priceHistoryProduct, setPriceHistoryProduct] = useState<Product | null>(null)
  const [restockProduct, setRestockProduct] = useState<Product | null>(null)
  const [restockForm, setRestockForm] = useState({ quantity: '', unitCost: '', supplierId: '', notes: '' })
  const [kardexProduct, setKardexProduct] = useState<Product | null>(null)
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null)
  const [adjustForm, setAdjustForm] = useState({ quantity: '', reason: '' })
  const [countProduct, setCountProduct] = useState<Product | null>(null)
  const [countForm, setCountForm] = useState({ countedQty: '', reason: '' })
  const [transferProduct, setTransferProduct] = useState<Product | null>(null)
  const [transferForm, setTransferForm] = useState({ quantity: '', fromLocation: 'Principal', toLocation: '', notes: '' })
  const [search, setSearch] = usePersistentState(`vendix:${bid}:inventario:search`, '')
  const [filterCat, setFilterCat] = usePersistentState(`vendix:${bid}:inventario:category`, '')
  const [filterLowStock, setFilterLowStock] = usePersistentState(`vendix:${bid}:inventario:lowStock`, false)
  const [showTrash, setShowTrash] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'' | 'price' | 'category' | 'delete'>('')
  const [bulkValue, setBulkValue] = useState('')

  const { data: products = [], isLoading, isError, refetch, isRefetching } = useQuery<Product[]>({
    queryKey: ['products', bid],
    queryFn: () => api.get(`/businesses/${bid}/products`).then(r => r.data),
  })

  const { data: inventoryAlerts } = useQuery<InventoryAlerts>({
    queryKey: ['inventory-alerts', bid],
    queryFn: () => api.get(`/businesses/${bid}/products/inventory-alerts`).then(r => r.data),
  })

  const { data: categories = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['categories', bid],
    queryFn: () => api.get(`/businesses/${bid}/products/categories`).then(r => r.data),
  })

  const { data: suppliers = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['suppliers', bid],
    queryFn: () => api.get(`/businesses/${bid}/suppliers`).then(r => r.data),
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const saveMutation = useMutation({
    mutationFn: (data: Form) => {
      const payload = { ...data, lowStockThreshold: data.lowStockThreshold === '' || data.lowStockThreshold === undefined ? null : data.lowStockThreshold }
      return editing
        ? api.put(`/businesses/${bid}/products/${editing.id}`, payload)
        : api.post(`/businesses/${bid}/products`, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', bid] })
      closeModal()
      toast.success(editing ? 'Producto actualizado' : 'Producto creado correctamente')
    },
    onError: () => toast.error('No se pudo guardar el producto'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/businesses/${bid}/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', bid] })
      toast.success('Producto eliminado')
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  })

  const saveCatMutation = useMutation({
    mutationFn: (name: string) => api.post(`/businesses/${bid}/products/categories`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories', bid] })
      setNewCatName('')
      toast.success('Categoría creada')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'No se pudo crear la categoría')
    },
  })

  const deleteCatMutation = useMutation({
    mutationFn: (catId: string) => api.delete(`/businesses/${bid}/products/categories/${catId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories', bid] })
      qc.invalidateQueries({ queryKey: ['products', bid] })
      toast.success('Categoría eliminada')
    },
  })

  const restockMutation = useMutation({
    mutationFn: () => {
      const quantity = parseInt(restockForm.quantity, 10)
      const unitCost = parseFloat(restockForm.unitCost)
      if (!restockProduct || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
        throw new Error('Datos de reabastecimiento inválidos')
      }
      return api.post(`/businesses/${bid}/transactions`, {
        type: 'PURCHASE',
        amount: quantity * unitCost,
        description: restockForm.notes || `Reabastecimiento de ${restockProduct.name}`,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        supplierId: restockForm.supplierId || undefined,
        items: [{
          productId: restockProduct.id,
          name: restockProduct.name,
          quantity,
          price: unitCost,
          cost: unitCost,
        }],
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', bid] })
      qc.invalidateQueries({ queryKey: ['transactions', bid] })
      setRestockProduct(null)
      setRestockForm({ quantity: '', unitCost: '', supplierId: '', notes: '' })
      toast.success('Stock actualizado con compra registrada')
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'No se pudo reabastecer el producto'
      toast.error(msg)
    },
  })

  const openCreate = () => { setEditing(null); reset({}); setModalOpen(true) }
  const openEdit = (p: Product) => {
    setEditing(p)
    reset({ name: p.name, description: p.description, price: p.price, cost: p.cost, quantity: p.quantity, barcode: p.barcode, categoryId: p.categoryId, lowStockThreshold: p.lowStockThreshold ?? '' })
    setModalOpen(true)
  }
  const openRestock = (p: Product) => {
    setRestockProduct(p)
    setRestockForm({ quantity: '', unitCost: String(p.cost ?? 0), supplierId: '', notes: '' })
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); reset({}) }

  const handleDelete = async (p: Product) => {
    const ok = await confirm('Eliminar producto', `¿Seguro que deseas eliminar "${p.name}"? Esta acción no se puede deshacer.`, true)
    if (ok) deleteMutation.mutate(p.id)
  }

  const handleExport = () => {
    const rows = products.map(p => ({
      name: p.name,
      categoryName: p.category?.name || '',
      price: p.price,
      cost: p.cost,
      quantity: p.quantity,
      profit: p.price - p.cost,
      barcode: p.barcode || '',
    }))
    exportCSV('inventario', rows, EXPORT_COLUMNS.inventario)
    toast.success('Inventario exportado como CSV')
  }

  const { data: priceHistory = [], isLoading: loadingHistory } = useQuery<PriceHistoryEntry[]>({
    queryKey: ['price-history', priceHistoryProduct?.id],
    queryFn: () => api.get(`/businesses/${bid}/products/${priceHistoryProduct!.id}/price-history`).then(r => r.data),
    enabled: !!priceHistoryProduct,
  })

  const { data: stockMovements = [], isLoading: loadingKardex } = useQuery<StockMovement[]>({
    queryKey: ['stock-movements', kardexProduct?.id],
    queryFn: () => api.get(`/businesses/${bid}/products/${kardexProduct!.id}/stock-movements`).then(r => r.data),
    enabled: !!kardexProduct,
  })

  const adjustMutation = useMutation({
    mutationFn: () => {
      const quantity = parseInt(adjustForm.quantity, 10)
      if (!adjustProduct || !Number.isFinite(quantity) || quantity === 0 || !adjustForm.reason.trim()) {
        throw new Error('Indica una cantidad distinta de cero y un motivo')
      }
      return api.post(`/businesses/${bid}/products/${adjustProduct.id}/adjust-stock`, {
        quantity, reason: adjustForm.reason.trim(),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', bid] })
      qc.invalidateQueries({ queryKey: ['stock-movements', adjustProduct?.id] })
      setAdjustProduct(null)
      setAdjustForm({ quantity: '', reason: '' })
      toast.success('Inventario ajustado')
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  })

  const physicalCountMutation = useMutation({
    mutationFn: () => {
      const countedQty = parseInt(countForm.countedQty, 10)
      if (!countProduct || !Number.isFinite(countedQty) || countedQty < 0) {
        throw new Error('Indica la cantidad contada')
      }
      return api.post(`/businesses/${bid}/products/${countProduct.id}/physical-count`, {
        countedQty,
        reason: countForm.reason.trim() || undefined,
      })
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['products', bid] })
      qc.invalidateQueries({ queryKey: ['inventory-alerts', bid] })
      qc.invalidateQueries({ queryKey: ['stock-movements', countProduct?.id] })
      const diff = res.data.count?.difference ?? 0
      setCountProduct(null)
      setCountForm({ countedQty: '', reason: '' })
      toast.success(diff === 0 ? 'Conteo registrado sin diferencia' : `Conteo registrado. Diferencia: ${diff}`)
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  })

  const transferMutation = useMutation({
    mutationFn: () => {
      const quantity = parseInt(transferForm.quantity, 10)
      if (!transferProduct || !Number.isFinite(quantity) || quantity <= 0 || !transferForm.toLocation.trim()) {
        throw new Error('Indica cantidad y destino')
      }
      return api.post(`/businesses/${bid}/products/${transferProduct.id}/transfer`, {
        quantity,
        fromLocation: transferForm.fromLocation.trim() || 'Principal',
        toLocation: transferForm.toLocation.trim(),
        notes: transferForm.notes.trim() || undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', bid] })
      qc.invalidateQueries({ queryKey: ['inventory-alerts', bid] })
      qc.invalidateQueries({ queryKey: ['stock-movements', transferProduct?.id] })
      setTransferProduct(null)
      setTransferForm({ quantity: '', fromLocation: 'Principal', toLocation: '', notes: '' })
      toast.success('Transferencia registrada')
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  })

  const bulkMutation = useMutation({
    mutationFn: (params: { action: string; value?: string | number }) =>
      api.patch(`/businesses/${bid}/products/bulk`, { ids: Array.from(selected), ...params }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['products', bid] })
      setSelected(new Set())
      setBulkAction('')
      setBulkValue('')
      const count = res.data.affected ?? 0
      toast.success(`${count} producto${count !== 1 ? 's' : ''} actualizado${count !== 1 ? 's' : ''}`)
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  })

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleAll = () => {
    if (selected.size === paged.length) setSelected(new Set())
    else setSelected(new Set(paged.map(p => p.id)))
  }

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search)
    const matchCat = !filterCat || p.categoryId === filterCat
    const matchLow = !filterLowStock || p.quantity <= LOW_STOCK
    return matchSearch && matchCat && matchLow
  })
  const totalFiltered = filtered.length
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalValue = products.reduce((s, p) => s + p.cost * p.quantity, 0)
  const lowStockCount = products.filter(p => p.quantity >= 0 && p.quantity <= LOW_STOCK).length
  const outOfStock = products.filter(p => p.quantity === 0).length

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Inventario"
        subtitle={`${products.length} productos · Valor total: ${formatCurrency(totalValue, cur)}`}
        icon={<Package size={18} className="text-cyan-500 dark:text-cyan-400" />}
        action={
          <div className="flex gap-2">
            <button onClick={handleExport} className="btn-secondary" title="Exportar a CSV">
              <Download size={15} /> Exportar
            </button>
            <button onClick={() => setImportOpen(true)} className="btn-secondary" title="Importar desde CSV/Excel">
              <Upload size={15} /> Importar
            </button>
            <button onClick={() => setCatModalOpen(true)} className="btn-secondary">
              <Tag size={15} /> Categorías
            </button>
            <button onClick={() => setShowTrash(v => !v)} className={`btn-secondary ${showTrash ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300' : ''}`}>
              <Trash2 size={15} /> Papelera
            </button>
            <button onClick={openCreate} className="btn-primary">
              <Plus size={16} /> Crear producto
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {showTrash && <TrashPanel businessId={bid} queryKey="products" endpoint="products" label="Producto" />}

        {/* Alertas de stock */}
        {(lowStockCount > 0 || outOfStock > 0) && (
          <div className="flex flex-wrap gap-3">
            {outOfStock > 0 && (
              <button
                onClick={() => setFilterLowStock(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
              >
                <AlertTriangle size={15} />
                {outOfStock} {outOfStock === 1 ? 'producto sin stock' : 'productos sin stock'}
              </button>
            )}
            {lowStockCount > 0 && (
              <button
                onClick={() => setFilterLowStock(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800 rounded-xl text-yellow-700 dark:text-yellow-300 text-sm font-medium hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-colors"
              >
                <AlertTriangle size={15} />
                {lowStockCount} con bajo stock (≤{LOW_STOCK} uds.)
              </button>
            )}
          </div>
        )}

        {inventoryAlerts && (inventoryAlerts.lowMargin.length > 0 || inventoryAlerts.noMovement.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {inventoryAlerts.lowMargin.length > 0 && (
              <div className="rounded-2xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="text-orange-600 dark:text-orange-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-orange-800 dark:text-orange-200">Margen bajo detectado</p>
                    <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                      {inventoryAlerts.lowMargin.length} producto{inventoryAlerts.lowMargin.length !== 1 ? 's' : ''} por debajo de {inventoryAlerts.meta.lowMarginThreshold}% de margen.
                    </p>
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                      Revisa precios/costos: {inventoryAlerts.lowMargin.slice(0, 3).map(p => p.name).join(', ')}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {inventoryAlerts.noMovement.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <Package size={18} className="text-slate-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-slate-800">Productos sin movimiento</p>
                    <p className="text-xs text-slate-600 mt-1">
                      {inventoryAlerts.noMovement.length} producto{inventoryAlerts.noMovement.length !== 1 ? 's' : ''} sin Kardex en {inventoryAlerts.meta.noMovementDays} dias.
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      Posible inventario lento: {inventoryAlerts.noMovement.slice(0, 3).map(p => p.name).join(', ')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Barra de búsqueda + filtros */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Buscar por nombre o código de barras..."
              className="input pl-10"
            />
          </div>
          <select
            value={filterCat}
            onChange={e => { setFilterCat(e.target.value); setPage(1) }}
            className="input w-48"
          >
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={() => { setFilterLowStock(!filterLowStock); setPage(1) }}
            className={`btn-secondary flex items-center gap-2 ${filterLowStock ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300' : ''}`}
          >
            <AlertTriangle size={14} />
            Bajo stock
            {filterLowStock && <span className="text-xs">(activo)</span>}
          </button>
        </div>

        {/* Barra de acciones en lote */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800">
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">{selected.size} seleccionado{selected.size !== 1 ? 's' : ''}</span>
            <select value={bulkAction} onChange={e => { setBulkAction(e.target.value as typeof bulkAction); setBulkValue('') }} className="input text-sm py-1.5 w-auto">
              <option value="">Acción en lote...</option>
              <option value="price">Cambiar precio %</option>
              <option value="category">Cambiar categoría</option>
              <option value="delete">Eliminar</option>
            </select>
            {bulkAction === 'price' && (
              <input type="number" placeholder="Ej: 10 o -5" value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="input text-sm py-1.5 w-28" />
            )}
            {bulkAction === 'category' && (
              <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="input text-sm py-1.5 w-auto">
                <option value="">Sin categoría</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {bulkAction && (
              <button
                disabled={bulkMutation.isPending || (bulkAction === 'price' && !bulkValue)}
                onClick={async () => {
                  if (bulkAction === 'delete') {
                    const ok = await confirm('Eliminar productos', `¿Eliminar ${selected.size} producto${selected.size !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`, true)
                    if (!ok) return
                  }
                  bulkMutation.mutate({
                    action: bulkAction === 'price' ? 'updatePrice' : bulkAction === 'category' ? 'updateCategory' : 'delete',
                    value: bulkAction === 'price' ? Number(bulkValue) : bulkAction === 'category' ? bulkValue : undefined,
                  })
                }}
                className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${bulkAction === 'delete' ? 'bg-red-600 hover:bg-red-700 text-white' : 'btn-primary'}`}
              >
                {bulkMutation.isPending ? 'Aplicando...' : 'Aplicar'}
              </button>
            )}
            <button onClick={() => { setSelected(new Set()); setBulkAction('') }} className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 ml-auto">Cancelar</button>
          </div>
        )}

        {/* Tabla */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <TableRowSkeleton rows={8} cols={5} />
          ) : isError ? (
            <QueryError onRetry={() => refetch()} retrying={isRefetching} />
          ) : totalFiltered === 0 ? (
            <EmptyState
              icon={Package}
              tone="blue"
              title={search ? 'Sin resultados' : 'Tu inventario está vacío'}
              description={search ? 'Intenta con otro nombre o código' : 'Agrega tu primer producto para empezar a controlar tu stock y venderlo en el POS'}
              action={!search ? <button onClick={openCreate} className="btn-primary">Crear primer producto</button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="table-header w-10"><input type="checkbox" checked={selected.size === paged.length && paged.length > 0} onChange={toggleAll} className="rounded border-gray-300 dark:border-slate-600" /></th>
                    <th className="table-header">Producto</th>
                    <th className="table-header hidden lg:table-cell">Categoría</th>
                    <th className="table-header text-right">Precio</th>
                    <th className="table-header text-right hidden md:table-cell">Costo</th>
                    <th className="table-header text-center">Stock</th>
                    <th className="table-header text-right hidden lg:table-cell">Ganancia</th>
                    <th className="table-header text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                  {paged.map(p => {
                    const profit = p.price - p.cost
                    const margin = p.price > 0 ? (profit / p.price * 100) : 0
                    return (
                      <tr key={p.id} className={`table-row ${selected.has(p.id) ? 'bg-blue-50/50' : ''}`}>
                        <td className="table-cell w-10"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-gray-300 dark:border-slate-600" /></td>
                        <td className="table-cell">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-cyan-50 dark:bg-cyan-950/40 rounded-xl flex items-center justify-center flex-shrink-0">
                              <span className="text-cyan-600 dark:text-cyan-400 font-bold text-sm">{p.name[0].toUpperCase()}</span>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-slate-100">{p.name}</p>
                              {p.barcode && <p className="text-xs text-gray-400 dark:text-slate-500 font-mono">{p.barcode}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="table-cell hidden lg:table-cell">
                          {p.category
                            ? <span className="badge bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">{p.category.name}</span>
                            : <span className="text-gray-400 dark:text-slate-500 text-xs">—</span>
                          }
                        </td>
                        <td className="table-cell text-right font-bold text-gray-900 dark:text-slate-100">
                          {formatCurrency(p.price, cur)}
                        </td>
                        <td className="table-cell text-right text-gray-500 dark:text-slate-400 hidden md:table-cell">
                          {formatCurrency(p.cost, cur)}
                        </td>
                        <td className="table-cell text-center">
                          <span className={`badge font-bold ${
                            p.quantity === 0
                              ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                              : p.quantity <= (p.lowStockThreshold ?? LOW_STOCK)
                              ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                              : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                          }`}>
                            {p.quantity === 0 ? 'Sin stock' : `${p.quantity} uds.`}
                          </span>
                        </td>
                        <td className="table-cell text-right hidden lg:table-cell">
                          <span className={`font-bold ${margin >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                            {formatCurrency(profit, cur)}
                          </span>
                          <span className={`text-xs ml-1 ${margin >= 0 ? 'text-green-500 dark:text-green-400' : 'text-red-400 dark:text-red-400'}`}>
                            ({margin.toFixed(0)}%)
                          </span>
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEdit(p)} className="btn-ghost text-xs px-2.5 py-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40">
                              <Edit2 size={14} /> Editar
                            </button>
                            <button onClick={() => setPriceHistoryProduct(p)} className="btn-ghost text-xs px-2.5 py-1.5 text-purple-500 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40" title="Historial de precios">
                              <History size={14} />
                            </button>
                            <button onClick={() => openRestock(p)} className="btn-ghost text-xs px-2.5 py-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="Reabastecer stock">
                              <ShoppingCart size={14} />
                            </button>
                            <button onClick={() => setKardexProduct(p)} className="btn-ghost text-xs px-2.5 py-1.5 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/40" title="Kardex (movimientos de inventario)">
                              <ClipboardList size={14} />
                            </button>
                            <button onClick={() => { setAdjustProduct(p); setAdjustForm({ quantity: '', reason: '' }) }} className="btn-ghost text-xs px-2.5 py-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40" title="Ajuste manual de inventario">
                              <SlidersHorizontal size={14} />
                            </button>
                            <button onClick={() => { setCountProduct(p); setCountForm({ countedQty: String(p.quantity), reason: '' }) }} className="btn-ghost text-xs px-2.5 py-1.5 text-slate-600 hover:bg-slate-50" title="Conteo físico">
                              <Scale size={14} />
                            </button>
                            <button onClick={() => { setTransferProduct(p); setTransferForm({ quantity: '', fromLocation: 'Principal', toLocation: '', notes: '' }) }} className="btn-ghost text-xs px-2.5 py-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40" title="Transferencia interna">
                              <ArrowRightLeft size={14} />
                            </button>
                            <button onClick={() => handleDelete(p)} className="btn-ghost text-xs px-2.5 py-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40">
                              <Trash2 size={14} />
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
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={totalFiltered} label="productos" />
        </div>
      </div>

      {/* Modal crear/editar producto */}
      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Editar producto' : 'Nuevo producto'} size="lg">
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Nombre del producto *</label>
              <input {...register('name')} className="input" placeholder="Ej: Bravo Pañales Talla M" />
              {errors.name && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Precio de venta *</label>
              <input {...register('price')} type="number" step="0.01" className="input" placeholder="0.00" />
              {errors.price && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.price.message}</p>}
            </div>
            <div>
              <label className="label">Costo del producto</label>
              <input {...register('cost')} type="number" step="0.01" className="input" placeholder="0.00" />
            </div>
            <div>
              <label className="label">Cantidad en stock</label>
              <input {...register('quantity')} type="number" className="input" placeholder="0" />
            </div>
            <div>
              <label className="label">Código de barras</label>
              <input {...register('barcode')} className="input" placeholder="Opcional" />
            </div>
            <div>
              <label className="label">Umbral de stock bajo</label>
              <input {...register('lowStockThreshold')} type="number" min="0" className="input" placeholder={`Predeterminado: ${LOW_STOCK}`} />
            </div>
            <div className="col-span-2">
              <label className="label">Categoría</label>
              <select {...register('categoryId')} className="input">
                <option value="">Sin categoría</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Descripción</label>
              <textarea {...register('description')} className="input" rows={2} placeholder="Descripción opcional del producto" />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-slate-700">
            <button type="button" onClick={closeModal} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear producto'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal categorías */}
      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title="Gestionar categorías" size="sm">
        <div className="space-y-3">
          {categories.length === 0
            ? <p className="text-gray-400 dark:text-slate-500 text-sm text-center py-4">No hay categorías creadas</p>
            : categories.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
                <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{c.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 dark:text-slate-500">{products.filter(p => p.categoryId === c.id).length} productos</span>
                  <button
                    onClick={async () => {
                      const ok = await confirm('Eliminar categoría', `¿Eliminar "${c.name}"? Los productos asociados quedarán sin categoría.`, true)
                      if (ok) deleteCatMutation.mutate(c.id)
                    }}
                    className="btn-ghost p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          }
          <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-slate-700">
            <input
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="Nueva categoría..."
              className="input flex-1"
              onKeyDown={e => e.key === 'Enter' && newCatName.trim() && saveCatMutation.mutate(newCatName.trim())}
            />
            <button
              onClick={() => newCatName.trim() && saveCatMutation.mutate(newCatName.trim())}
              disabled={!newCatName.trim()}
              className="btn-primary"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal historial de precios */}
      <Modal
        open={!!priceHistoryProduct}
        onClose={() => setPriceHistoryProduct(null)}
        title={`Historial de precios — ${priceHistoryProduct?.name ?? ''}`}
        size="sm"
      >
        {loadingHistory ? (
          <p className="text-center text-gray-400 dark:text-slate-500 py-6">Cargando...</p>
        ) : priceHistory.length === 0 ? (
          <div className="text-center py-8">
            <History size={36} className="text-gray-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-gray-400 dark:text-slate-500 text-sm">Sin cambios de precio registrados</p>
            <p className="text-gray-300 dark:text-slate-600 text-xs mt-1">Los cambios futuros aparecerán aquí</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500 font-semibold px-3 mb-3">
              <span>Precio anterior → nuevo</span>
              <span>Fecha</span>
            </div>
            {priceHistory.map(h => {
              const up = h.newPrice > h.oldPrice
              return (
                <div key={h.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
                  <div className="flex items-center gap-2">
                    {up
                      ? <TrendingUp size={15} className="text-red-500 dark:text-red-400" />
                      : <TrendingDown size={15} className="text-green-500 dark:text-green-400" />
                    }
                    <span className="text-sm text-gray-500 dark:text-slate-400">{formatCurrency(h.oldPrice, cur)}</span>
                    <span className="text-gray-300 dark:text-slate-600">→</span>
                    <span className={`text-sm font-bold ${up ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {formatCurrency(h.newPrice, cur)}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${up ? 'bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400' : 'bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400'}`}>
                      {up ? '+' : ''}{(((h.newPrice - h.oldPrice) / h.oldPrice) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-slate-500">{formatDate(h.changedAt, 'dd MMM yyyy')}</span>
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      <Modal
        open={!!restockProduct}
        onClose={() => setRestockProduct(null)}
        title={`Reabastecer — ${restockProduct?.name ?? ''}`}
        size="sm"
      >
        {restockProduct && (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 p-3">
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Stock actual</p>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{restockProduct.quantity} uds.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Cantidad a comprar *</label>
                <input
                  type="number"
                  min="1"
                  value={restockForm.quantity}
                  onChange={e => setRestockForm(f => ({ ...f, quantity: e.target.value }))}
                  className="input"
                  placeholder="0"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Costo unitario *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={restockForm.unitCost}
                  onChange={e => setRestockForm(f => ({ ...f, unitCost: e.target.value }))}
                  className="input"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className="label">Proveedor</label>
              <select
                value={restockForm.supplierId}
                onChange={e => setRestockForm(f => ({ ...f, supplierId: e.target.value }))}
                className="input"
              >
                <option value="">Sin proveedor específico</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Nota</label>
              <input
                value={restockForm.notes}
                onChange={e => setRestockForm(f => ({ ...f, notes: e.target.value }))}
                className="input"
                placeholder="Ej: compra de reposición semanal"
              />
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3 flex justify-between text-sm">
              <span className="text-gray-500 dark:text-slate-400">Total de compra</span>
              <span className="font-bold text-gray-900 dark:text-slate-100">
                {formatCurrency((parseFloat(restockForm.unitCost) || 0) * (parseInt(restockForm.quantity, 10) || 0), cur)}
              </span>
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-slate-700">
              <button type="button" onClick={() => setRestockProduct(null)} className="btn-secondary">Cancelar</button>
              <button
                type="button"
                onClick={() => restockMutation.mutate()}
                disabled={restockMutation.isPending || !restockForm.quantity}
                className="btn-primary"
              >
                {restockMutation.isPending ? 'Registrando...' : 'Registrar compra'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Kardex */}
      <Modal
        open={!!kardexProduct}
        onClose={() => setKardexProduct(null)}
        title={`Kardex — ${kardexProduct?.name ?? ''}`}
        size="lg"
      >
        {loadingKardex ? (
          <p className="text-center text-gray-400 dark:text-slate-500 py-6">Cargando...</p>
        ) : stockMovements.length === 0 ? (
          <div className="text-center py-8">
            <ClipboardList size={36} className="text-gray-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-gray-400 dark:text-slate-500 text-sm">Sin movimientos de inventario registrados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700">
                <tr>
                  <th className="table-header">Fecha</th>
                  <th className="table-header">Tipo</th>
                  <th className="table-header text-right">Cantidad</th>
                  <th className="table-header text-right">Saldo</th>
                  <th className="table-header">Motivo / Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                {stockMovements.map(m => (
                  <tr key={m.id} className="table-row">
                    <td className="table-cell text-xs text-gray-500 dark:text-slate-400">{formatDate(m.createdAt, 'dd MMM yyyy HH:mm')}</td>
                    <td className="table-cell">
                      <span className="badge bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">{STOCK_MOVEMENT_LABELS[m.type] ?? m.type}</span>
                    </td>
                    <td className={`table-cell text-right font-bold ${m.quantity >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                      {m.quantity >= 0 ? '+' : ''}{m.quantity}
                    </td>
                    <td className="table-cell text-right text-gray-700 dark:text-slate-300">{m.balanceAfter}</td>
                    <td className="table-cell text-xs text-gray-500 dark:text-slate-400">
                      {m.reason || '—'}{m.createdBy?.name ? ` · ${m.createdBy.name}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Modal ajuste manual de inventario */}
      <Modal
        open={!!adjustProduct}
        onClose={() => setAdjustProduct(null)}
        title={`Ajustar inventario — ${adjustProduct?.name ?? ''}`}
        size="sm"
      >
        {adjustProduct && (
          <div className="space-y-4">
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/50 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">Stock actual</p>
              <p className="text-2xl font-black text-amber-700 dark:text-amber-300">{adjustProduct.quantity} uds.</p>
            </div>
            <div>
              <label className="label">Cantidad a ajustar *</label>
              <input
                type="number"
                value={adjustForm.quantity}
                onChange={e => setAdjustForm(f => ({ ...f, quantity: e.target.value }))}
                className="input"
                placeholder="Positivo para sumar, negativo para restar"
                autoFocus
              />
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Ej: -2 para descontar 2 unidades por pérdida o caducidad, +5 para sumar un conteo manual.</p>
            </div>
            <div>
              <label className="label">Motivo *</label>
              <input
                value={adjustForm.reason}
                onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))}
                className="input"
                placeholder="Ej: pérdida, caducidad, corrección de conteo"
              />
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-slate-700">
              <button type="button" onClick={() => setAdjustProduct(null)} className="btn-secondary">Cancelar</button>
              <button
                type="button"
                onClick={() => adjustMutation.mutate()}
                disabled={adjustMutation.isPending || !adjustForm.quantity || !adjustForm.reason.trim()}
                className="btn-primary"
              >
                {adjustMutation.isPending ? 'Guardando...' : 'Aplicar ajuste'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!countProduct}
        onClose={() => setCountProduct(null)}
        title={`Conteo físico — ${countProduct?.name ?? ''}`}
        size="sm"
      >
        {countProduct && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <p className="text-xs text-slate-500 font-medium">Esperado en sistema</p>
                <p className="text-2xl font-black text-slate-800">{countProduct.quantity}</p>
              </div>
              <div className={`rounded-xl border p-3 ${
                countForm.countedQty && parseInt(countForm.countedQty, 10) !== countProduct.quantity
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50'
                  : 'bg-green-50 dark:bg-green-950/40 border-green-100 dark:border-green-900/50'
              }`}>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Diferencia</p>
                <p className={`text-2xl font-black ${
                  countForm.countedQty && parseInt(countForm.countedQty, 10) !== countProduct.quantity ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300'
                }`}>
                  {countForm.countedQty ? (parseInt(countForm.countedQty, 10) || 0) - countProduct.quantity : 0}
                </p>
              </div>
            </div>
            <div>
              <label className="label">Cantidad contada *</label>
              <input
                type="number"
                min="0"
                value={countForm.countedQty}
                onChange={e => setCountForm(f => ({ ...f, countedQty: e.target.value }))}
                className="input"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Motivo / nota</label>
              <input
                value={countForm.reason}
                onChange={e => setCountForm(f => ({ ...f, reason: e.target.value }))}
                className="input"
                placeholder="Ej: conteo mensual, auditoría, merma detectada"
              />
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-slate-700">
              <button type="button" onClick={() => setCountProduct(null)} className="btn-secondary">Cancelar</button>
              <button
                type="button"
                onClick={() => physicalCountMutation.mutate()}
                disabled={physicalCountMutation.isPending || !countForm.countedQty}
                className="btn-primary"
              >
                {physicalCountMutation.isPending ? 'Guardando...' : 'Registrar conteo'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!transferProduct}
        onClose={() => setTransferProduct(null)}
        title={`Transferencia interna — ${transferProduct?.name ?? ''}`}
        size="sm"
      >
        {transferProduct && (
          <div className="space-y-4">
            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 p-3">
              <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">Stock disponible</p>
              <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{transferProduct.quantity} uds.</p>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">Base preparada para sucursales futuras. Por ahora registra salida interna.</p>
            </div>
            <div>
              <label className="label">Cantidad *</label>
              <input
                type="number"
                min="1"
                value={transferForm.quantity}
                onChange={e => setTransferForm(f => ({ ...f, quantity: e.target.value }))}
                className="input"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Origen</label>
                <input
                  value={transferForm.fromLocation}
                  onChange={e => setTransferForm(f => ({ ...f, fromLocation: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Destino *</label>
                <input
                  value={transferForm.toLocation}
                  onChange={e => setTransferForm(f => ({ ...f, toLocation: e.target.value }))}
                  className="input"
                  placeholder="Ej: almacén, vitrina, sucursal norte"
                />
              </div>
            </div>
            <div>
              <label className="label">Notas</label>
              <input
                value={transferForm.notes}
                onChange={e => setTransferForm(f => ({ ...f, notes: e.target.value }))}
                className="input"
                placeholder="Opcional"
              />
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-slate-700">
              <button type="button" onClick={() => setTransferProduct(null)} className="btn-secondary">Cancelar</button>
              <button
                type="button"
                onClick={() => transferMutation.mutate()}
                disabled={transferMutation.isPending || !transferForm.quantity || !transferForm.toLocation.trim()}
                className="btn-primary"
              >
                {transferMutation.isPending ? 'Registrando...' : 'Registrar transferencia'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {confirmDialog}

      {/* Import CSV Modal */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Importar productos desde CSV/Excel" size="lg">
        <ImportCSV businessId={bid} onClose={() => setImportOpen(false)} />
      </Modal>
    </div>
  )
}
