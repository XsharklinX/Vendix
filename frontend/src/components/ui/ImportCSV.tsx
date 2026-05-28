import { useState, useRef } from 'react'
import { Upload, Download, CheckCircle2, AlertCircle, X, FileSpreadsheet } from 'lucide-react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { api, getErrorMessage } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

interface Row {
  name: string
  price: string | number
  cost?: string | number
  quantity?: string | number
  barcode?: string
  description?: string
}

interface ImportCSVProps {
  businessId: string
  onClose: () => void
}

const TEMPLATE_HEADERS = ['name', 'price', 'cost', 'quantity', 'barcode', 'description']
const TEMPLATE_EXAMPLE = [
  ['Coca-Cola 2L', 85, 55, 24, '7501055311850', 'Refresco 2 litros'],
  ['Pan de molde', 75, 45, 12, '', ''],
  ['Aceite Mazola 1L', 180, 120, 8, '', ''],
]

export function ImportCSV({ businessId, onClose }: ImportCSVProps) {
  const [rows, setRows] = useState<Row[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ created: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()
    const data = [TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = TEMPLATE_HEADERS.map((_, i) => ({ wch: i === 0 ? 25 : 15 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Productos')
    XLSX.writeFile(wb, 'plantilla-productos-vendix.xlsx')
  }

  const parseFile = (file: File) => {
    setRows([])
    setErrors([])
    setResult(null)

    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'csv') {
      Papa.parse<Row>(file, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data, errors: parseErrors }) => {
          if (parseErrors.length) {
            setErrors(parseErrors.map(e => `Fila ${e.row}: ${e.message}`))
          }
          validateAndSet(data)
        },
      })
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader()
      reader.onload = (e) => {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json<Row>(ws)
        validateAndSet(data)
      }
      reader.readAsArrayBuffer(file)
    } else {
      setErrors(['Formato no soportado. Usa .csv, .xlsx o .xls'])
    }
  }

  const validateAndSet = (data: Row[]) => {
    const errs: string[] = []
    const valid: Row[] = []

    data.slice(0, 500).forEach((row, i) => {
      if (!row.name || String(row.name).trim() === '') {
        errs.push(`Fila ${i + 2}: nombre requerido`)
        return
      }
      const price = parseFloat(String(row.price))
      if (isNaN(price) || price < 0) {
        errs.push(`Fila ${i + 2}: precio inválido`)
        return
      }
      valid.push(row)
    })

    setErrors(errs)
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
        quantity: parseInt(String(r.quantity ?? 0)) || 0,
        barcode: r.barcode ? String(r.barcode).trim() : undefined,
        description: r.description ? String(r.description).trim() : undefined,
      }))

      const res = await api.post(`/businesses/${businessId}/products/import`, payload)
      setResult({ created: res.data.created })
      qc.invalidateQueries({ queryKey: ['products', businessId] })
      toast.success(`${res.data.created} productos importados`)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Download template */}
      <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
        <FileSpreadsheet size={20} className="text-blue-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-blue-800">Plantilla Excel</p>
          <p className="text-xs text-blue-600">Descarga la plantilla con el formato correcto</p>
        </div>
        <button onClick={downloadTemplate} className="btn-secondary text-xs px-3 py-1.5 flex-shrink-0">
          <Download size={13} /> Plantilla
        </button>
      </div>

      {/* File input */}
      {!result && (
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all group"
        >
          <Upload size={32} className="mx-auto mb-3 text-gray-300 group-hover:text-blue-400 transition-colors" />
          <p className="font-semibold text-gray-700 text-sm">Arrastra tu archivo aquí o haz clic</p>
          <p className="text-xs text-gray-400 mt-1">Soporta .csv, .xlsx, .xls — máximo 500 filas</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={e => e.target.files?.[0] && parseFile(e.target.files[0])}
          />
        </div>
      )}

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 rounded-xl p-4 space-y-1 max-h-32 overflow-y-auto">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-600 flex items-start gap-1.5">
              <AlertCircle size={11} className="flex-shrink-0 mt-0.5" /> {e}
            </p>
          ))}
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && !result && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">
            Vista previa — {rows.length} producto{rows.length !== 1 ? 's' : ''} a importar
          </p>
          <div className="border border-gray-100 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Nombre', 'Precio', 'Costo', 'Stock', 'Código'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 font-medium text-gray-900 max-w-[150px] truncate">{r.name}</td>
                    <td className="px-3 py-2 text-gray-600">{r.price}</td>
                    <td className="px-3 py-2 text-gray-600">{r.cost || 0}</td>
                    <td className="px-3 py-2 text-gray-600">{r.quantity || 0}</td>
                    <td className="px-3 py-2 text-gray-400 font-mono">{r.barcode || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 20 && (
              <p className="text-center text-xs text-gray-400 py-2">y {rows.length - 20} más...</p>
            )}
          </div>
        </div>
      )}

      {/* Success state */}
      {result && (
        <div className="text-center py-6">
          <CheckCircle2 size={48} className="mx-auto mb-4 text-green-500" />
          <h3 className="text-lg font-bold text-gray-900">{result.created} productos importados</h3>
          <p className="text-sm text-gray-400 mt-1">Tu inventario ha sido actualizado</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
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
