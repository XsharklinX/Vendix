import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { api, getErrorMessage } from '@/lib/api'

interface Row {
  name: string
  price: string | number
  cost?: string | number
  quantity?: string | number
  barcode?: string
  category?: string
  lowStockThreshold?: string | number
  description?: string
}

interface ImportCSVProps {
  businessId: string
  onClose: () => void
}

const TEMPLATE_HEADERS = ['name', 'price', 'cost', 'quantity', 'barcode', 'category', 'lowStockThreshold', 'description']
const TEMPLATE_EXAMPLE = [
  ['Coca-Cola 2L', 85, 55, 24, '7501055311850', 'Bebidas', 6, 'Refresco 2 litros'],
  ['Pan de molde', 75, 45, 12, '', 'Panaderia', 4, ''],
  ['Aceite Mazola 1L', 180, 120, 8, '', 'Despensa', 3, ''],
]

export function ImportCSV({ businessId, onClose }: ImportCSVProps) {
  const [rows, setRows] = useState<Row[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped?: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()
    const data = [TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = TEMPLATE_HEADERS.map((_, i) => ({ wch: i === 0 ? 25 : 16 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Productos')
    XLSX.writeFile(wb, 'plantilla-productos-vendix.xlsx')
  }

  const parseFile = (file: File) => {
    setRows([])
    setErrors([])
    setWarnings([])
    setResult(null)

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'csv') {
      Papa.parse<Row>(file, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data, errors: parseErrors }) => {
          if (parseErrors.length) setErrors(parseErrors.map(e => `Fila ${e.row}: ${e.message}`))
          validateAndSet(data)
        },
      })
      return
    }
    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader()
      reader.onload = (e) => {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        validateAndSet(XLSX.utils.sheet_to_json<Row>(ws))
      }
      reader.readAsArrayBuffer(file)
      return
    }
    setErrors(['Formato no soportado. Usa .csv, .xlsx o .xls'])
  }

  const validateAndSet = (data: Row[]) => {
    const errs: string[] = []
    const warns: string[] = []
    const valid: Row[] = []
    const seenNames = new Set<string>()
    const seenBarcodes = new Set<string>()

    data.slice(0, 500).forEach((row, i) => {
      const line = i + 2
      const name = String(row.name ?? '').trim()
      if (!name) return errs.push(`Fila ${line}: nombre requerido`)
      const normalizedName = name.toLowerCase()
      if (seenNames.has(normalizedName)) return errs.push(`Fila ${line}: producto duplicado en archivo (${name})`)
      seenNames.add(normalizedName)

      const price = parseFloat(String(row.price))
      if (Number.isNaN(price) || price < 0) return errs.push(`Fila ${line}: precio invalido`)
      const cost = parseFloat(String(row.cost ?? 0))
      if (Number.isNaN(cost) || cost < 0) return errs.push(`Fila ${line}: costo invalido`)
      const quantity = parseInt(String(row.quantity ?? 0), 10)
      if (Number.isNaN(quantity) || quantity < 0) return errs.push(`Fila ${line}: stock invalido`)
      const threshold = row.lowStockThreshold === undefined || row.lowStockThreshold === ''
        ? null
        : parseInt(String(row.lowStockThreshold), 10)
      if (threshold !== null && (Number.isNaN(threshold) || threshold < 0)) return errs.push(`Fila ${line}: umbral invalido`)

      const barcode = row.barcode ? String(row.barcode).trim() : ''
      if (barcode) {
        if (seenBarcodes.has(barcode)) return errs.push(`Fila ${line}: codigo de barras duplicado (${barcode})`)
        seenBarcodes.add(barcode)
      } else {
        warns.push(`Fila ${line}: sin codigo de barras`)
      }
      if (price > 0 && cost > 0 && ((price - cost) / price) * 100 < 15) warns.push(`Fila ${line}: margen bajo para ${name}`)
      valid.push(row)
    })

    setErrors(errs)
    setWarnings(warns.slice(0, 30))
    setRows(valid)
  }

  const handleImport = async () => {
    if (rows.length === 0) return
    setImporting(true)
    try {
      const payload = rows.map(r => ({
        name: String(r.name).trim(),
        price: parseFloat(String(r.price)),
        cost: parseFloat(String(r.cost ?? 0)) || 0,
        quantity: parseInt(String(r.quantity ?? 0), 10) || 0,
        barcode: r.barcode ? String(r.barcode).trim() : undefined,
        category: r.category ? String(r.category).trim() : undefined,
        lowStockThreshold: r.lowStockThreshold === undefined || r.lowStockThreshold === '' ? undefined : parseInt(String(r.lowStockThreshold), 10),
        description: r.description ? String(r.description).trim() : undefined,
      }))
      const res = await api.post(`/businesses/${businessId}/products/import`, payload)
      setResult({ created: res.data.created, skipped: res.data.skipped })
      qc.invalidateQueries({ queryKey: ['products', businessId] })
      toast.success(`${res.data.created} productos importados${res.data.skipped ? `, ${res.data.skipped} omitidos` : ''}`)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-100 dark:border-blue-900/50">
        <FileSpreadsheet size={20} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Plantilla Excel validada</p>
          <p className="text-xs text-blue-600 dark:text-blue-400">Incluye categoria, umbral de stock y ejemplo de formato correcto.</p>
        </div>
        <button onClick={downloadTemplate} className="btn-secondary text-xs px-3 py-1.5 flex-shrink-0">
          <Download size={13} /> Plantilla
        </button>
      </div>

      {!result && (
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-200 dark:border-slate-600 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/30 transition-all group"
        >
          <Upload size={32} className="mx-auto mb-3 text-gray-300 dark:text-slate-600 group-hover:text-blue-400 dark:group-hover:text-blue-400 transition-colors" />
          <p className="font-semibold text-gray-700 dark:text-slate-300 text-sm">Arrastra tu archivo aqui o haz clic</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Soporta .csv, .xlsx, .xls. Maximo 500 filas.</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={e => e.target.files?.[0] && parseFile(e.target.files[0])}
          />
        </div>
      )}

      {errors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/40 rounded-xl p-4 space-y-1 max-h-32 overflow-y-auto">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
              <AlertCircle size={11} className="flex-shrink-0 mt-0.5" /> {e}
            </p>
          ))}
        </div>
      )}

      {warnings.length > 0 && errors.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-4 space-y-1 max-h-32 overflow-y-auto">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
              <AlertCircle size={11} className="flex-shrink-0 mt-0.5" /> {w}
            </p>
          ))}
        </div>
      )}

      {rows.length > 0 && !result && (
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
            Vista previa: {rows.length} producto{rows.length !== 1 ? 's' : ''} valido{rows.length !== 1 ? 's' : ''}
          </p>
          <div className="border border-gray-100 dark:border-slate-700 rounded-xl overflow-hidden max-h-64 overflow-auto">
            <table className="w-full text-xs min-w-[760px]">
              <thead className="bg-gray-50 dark:bg-slate-800 sticky top-0">
                <tr>
                  {['Nombre', 'Precio', 'Costo', 'Stock', 'Categoria', 'Umbral', 'Codigo'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                {rows.slice(0, 30).map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-slate-100 max-w-[180px] truncate">{r.name}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-slate-300">{r.price}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-slate-300">{r.cost || 0}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-slate-300">{r.quantity || 0}</td>
                    <td className="px-3 py-2 text-gray-500 dark:text-slate-400">{r.category || '-'}</td>
                    <td className="px-3 py-2 text-gray-500 dark:text-slate-400">{r.lowStockThreshold || '-'}</td>
                    <td className="px-3 py-2 text-gray-400 dark:text-slate-500 font-mono">{r.barcode || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 30 && <p className="text-center text-xs text-gray-400 dark:text-slate-500 py-2">y {rows.length - 30} mas...</p>}
          </div>
        </div>
      )}

      {result && (
        <div className="text-center py-6">
          <CheckCircle2 size={48} className="mx-auto mb-4 text-green-500 dark:text-green-400" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">{result.created} productos importados</h3>
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">
            Tu inventario ha sido actualizado{result.skipped ? `; ${result.skipped} duplicados fueron omitidos` : ''}
          </p>
        </div>
      )}

      <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-slate-700">
        <button onClick={onClose} className="btn-secondary">
          <X size={15} /> {result ? 'Cerrar' : 'Cancelar'}
        </button>
        {rows.length > 0 && !result && (
          <button onClick={handleImport} disabled={importing} className="btn-primary">
            <Upload size={15} />
            {importing ? 'Importando...' : `Importar ${rows.length} productos`}
          </button>
        )}
      </div>
    </div>
  )
}
