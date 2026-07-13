import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { formatCurrency } from '@/lib/utils'
import { exportCSV } from '@/lib/export'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  FileText, Printer, TrendingUp, Package, Users, Calendar,
  Receipt, ClipboardList, UserCheck, Download, Copy, FileSpreadsheet
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, subDays } from 'date-fns'
import { es } from 'date-fns/locale'

type ReportType = 'daily' | 'monthly' | 'inventory' | 'clients' | 'cierrez' | '606' | '607' | 'employees' | 'profitProducts' | 'profitClients' | 'aging' | 'fiscal'

interface CierreZData {
  date: string
  totalSales: number; totalReturns: number; totalExpenses: number
  totalTax: number; netSales: number; profit: number; salesCount: number
  byPaymentMethod: Record<string, { count: number; total: number }>
  cashSession: { openAmount: number; closeAmount: number | null; expectedCash: number; difference: number | null; status: string } | null
  transactions: Array<{ id: string; type: string; paymentMethod: string; amount: number; taxAmount: number; description: string | null; createdAt: string; client: { name: string } | null; createdBy: { name: string } | null }>
}

interface Report606Data {
  month: string
  rows: Array<{ fecha: string; rnc_cedula: string; razon_social: string; tipo_bienes: string; ncf: string; monto_facturado: number; itbis_facturado: number }>
  totals: { monto: number; itbis: number; count: number }
}

interface Report607Data {
  month: string
  rows: Array<{ fecha: string; ncf: string; rnc_cedula: string; razon_social: string; tipo_ingreso: string; monto_facturado: number; itbis_facturado: number; monto_sin_impuesto: number }>
  totals: { monto: number; itbis: number; count: number }
}

interface EmployeeReportData {
  from: string | null; to: string | null
  employees: Array<{ userId: string; name: string; role: string; count: number; total: number; tax: number; byMethod: Record<string, number> }>
  totals: { count: number; total: number }
}

interface ProfitabilityData {
  groupBy: 'product' | 'client'
  rows: Array<{ id: string; name: string; quantity?: number; sales: number; cost: number; profit: number; margin: number; count?: number }>
  totals: { sales: number; cost: number; profit: number; quantity?: number; count?: number }
}

interface AgingData {
  rows: Array<{ id: string; clientName: string; phone: string; document: string; invoiceNumber: string; date: string; amount: number; days: number; bucket: string }>
  buckets: Record<string, { count: number; total: number }>
  total: number
  count: number
}

interface FiscalSummaryData {
  month: string
  rows: Array<{ date: string; status: string; invoiceNumber: string; ncf: string; clientName: string; document: string; amount: number; taxAmount: number; taxableAmount: number }>
  totals: { sales: number; tax: number; taxable: number; ncfCount: number; invoiceCount: number; cancelledCount: number; cancelledAmount: number }
}

import { printDocument } from '@/lib/print'

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const REPORT_CSS = `
  h3{font-size:13px;font-weight:700;margin:16px 0 8px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px;margin-bottom:16px}
  .card{border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px}
  .card .lbl{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:600}
  .card .val{font-size:17px;font-weight:800;color:#1d4ed8;margin-top:2px}
  .card .sub{font-size:10px;color:#9ca3af}
  th{background:#1e3a8a}
  tbody tr:nth-child(even) td{background:#f9fafb}
  tfoot td{background:#f3f4f6!important;font-weight:700;border-top:2px solid #e5e7eb}
  .bg{background:#dcfce7;color:#15803d}
  .br{background:#fee2e2;color:#b91c1c}
  .bb{background:#dbeafe;color:#1d4ed8}
`

function openPrintWindow(title: string, bizName: string, bizMeta: string, body: string) {
  printDocument({ title, businessName: bizName, subtitle: bizMeta, body, css: REPORT_CSS, autoClose: true })
}

export function Reportes() {
  const { business } = useAuthStore()
  const bid = business!.id
  const cur = business?.currency || 'DOP'
  const taxName = (business as unknown as Record<string, unknown>)?.taxName as string || 'ITBIS'

  const today = new Date()
  const [reportType, setReportType] = useState<ReportType>('daily')
  const [date, setDate] = useState(format(today, 'yyyy-MM-dd'))
  const [month, setMonth] = useState(format(today, 'yyyy-MM'))
  const [empFrom, setEmpFrom] = useState(format(startOfMonth(today), 'yyyy-MM-dd'))
  const [empTo, setEmpTo] = useState(format(today, 'yyyy-MM-dd'))

  const fromDate = reportType === 'daily'
    ? format(startOfDay(new Date(date + 'T00:00:00')), 'yyyy-MM-dd')
    : format(startOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
  const toDate = reportType === 'daily'
    ? format(endOfDay(new Date(date + 'T00:00:00')), 'yyyy-MM-dd')
    : format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')

  const { data: transactions = [] } = useQuery<Record<string, unknown>[]>({
    queryKey: ['report-tx', bid, fromDate, toDate],
    queryFn: () => api.get(`/businesses/${bid}/transactions`, { params: { from: fromDate, to: toDate, limit: 200 } }).then(r => r.data.data ?? []),
    enabled: reportType === 'daily' || reportType === 'monthly',
  })

  const { data: products = [] } = useQuery<Record<string, unknown>[]>({
    queryKey: ['products', bid],
    queryFn: () => api.get(`/businesses/${bid}/products`).then(r => r.data),
    enabled: reportType === 'inventory',
  })

  const { data: clients = [] } = useQuery<Record<string, unknown>[]>({
    queryKey: ['clients', bid],
    queryFn: () => api.get(`/businesses/${bid}/clients`).then(r => r.data),
    enabled: reportType === 'clients',
  })

  const { data: cierreZ } = useQuery<CierreZData>({
    queryKey: ['cierre-z', bid, date],
    queryFn: () => api.get(`/businesses/${bid}/stats/cierre-z`, { params: { date } }).then(r => r.data),
    enabled: reportType === 'cierrez',
  })

  const { data: r606 } = useQuery<Report606Data>({
    queryKey: ['report-606', bid, month],
    queryFn: () => api.get(`/businesses/${bid}/stats/606`, { params: { month } }).then(r => r.data),
    enabled: reportType === '606',
  })

  const { data: r607 } = useQuery<Report607Data>({
    queryKey: ['report-607', bid, month],
    queryFn: () => api.get(`/businesses/${bid}/stats/607`, { params: { month } }).then(r => r.data),
    enabled: reportType === '607',
  })

  const { data: empReport } = useQuery<EmployeeReportData>({
    queryKey: ['emp-report', bid, empFrom, empTo],
    queryFn: () => api.get(`/businesses/${bid}/stats/by-employee`, { params: { from: empFrom, to: empTo } }).then(r => r.data),
    enabled: reportType === 'employees',
  })

  const { data: profitReport } = useQuery<ProfitabilityData>({
    queryKey: ['profitability', bid, reportType, fromDate, toDate],
    queryFn: () => api.get(`/businesses/${bid}/stats/profitability`, {
      params: { from: fromDate, to: toDate, groupBy: reportType === 'profitClients' ? 'client' : 'product' },
    }).then(r => r.data),
    enabled: reportType === 'profitProducts' || reportType === 'profitClients',
  })

  const { data: agingReport } = useQuery<AgingData>({
    queryKey: ['aging-receivables', bid],
    queryFn: () => api.get(`/businesses/${bid}/stats/aging-receivables`).then(r => r.data),
    enabled: reportType === 'aging',
  })

  const { data: fiscalSummary } = useQuery<FiscalSummaryData>({
    queryKey: ['fiscal-summary', bid, month],
    queryFn: () => api.get(`/businesses/${bid}/stats/fiscal-summary`, { params: { month } }).then(r => r.data),
    enabled: reportType === 'fiscal',
  })

  const salesTx = useMemo(() => transactions.filter(t => t.type === 'SALE' && t.status === 'COMPLETED'), [transactions])
  const expenseTx = useMemo(() => transactions.filter(t => (t.type === 'EXPENSE' || t.type === 'PURCHASE') && t.status === 'COMPLETED'), [transactions])
  const returnTx = useMemo(() => transactions.filter(t => t.type === 'RETURN'), [transactions])
  const totalSales = useMemo(() => salesTx.reduce((s, t) => s + (t.amount as number), 0), [salesTx])
  const totalExpenses = useMemo(() => expenseTx.reduce((s, t) => s + (t.amount as number), 0), [expenseTx])
  const totalReturns = useMemo(() => returnTx.reduce((s, t) => s + (t.amount as number), 0), [returnTx])
  const totalTax = useMemo(() => salesTx.reduce((s, t) => s + ((t.taxAmount as number) || 0), 0), [salesTx])
  const profit = totalSales - totalExpenses - totalReturns

  const fc = (n: number) => `${cur} ${(n || 0).toFixed(2)}`
  const bizMeta = [(business as unknown as Record<string, unknown>)?.address, (business as unknown as Record<string, unknown>)?.city, (business as unknown as Record<string, unknown>)?.phone].filter(Boolean).join(' Â· ')
  const bizName = business?.name ?? ''

  function copyWhatsAppSummary() {
    const lines = reportType === 'cierrez' && cierreZ ? [
      `*${bizName} - Cierre ${cierreZ.date}*`,
      `Ventas: ${formatCurrency(cierreZ.totalSales, cur)} (${cierreZ.salesCount})`,
      `Gastos/compras: ${formatCurrency(cierreZ.totalExpenses, cur)}`,
      `${taxName}: ${formatCurrency(cierreZ.totalTax, cur)}`,
      `Utilidad: ${formatCurrency(cierreZ.profit, cur)}`,
      cierreZ.cashSession ? `Caja esperada: ${formatCurrency(cierreZ.cashSession.expectedCash, cur)}` : '',
      cierreZ.cashSession?.closeAmount != null ? `Caja declarada: ${formatCurrency(cierreZ.cashSession.closeAmount, cur)}` : '',
      cierreZ.cashSession?.difference != null ? `Diferencia: ${formatCurrency(cierreZ.cashSession.difference, cur)}` : '',
    ] : [
      `*${bizName} - Resumen ${reportType === 'daily' ? date : month}*`,
      `Ventas: ${formatCurrency(totalSales, cur)} (${salesTx.length})`,
      `Gastos/compras: ${formatCurrency(totalExpenses, cur)}`,
      `${taxName}: ${formatCurrency(totalTax, cur)}`,
      `Utilidad neta: ${formatCurrency(profit, cur)}`,
    ]
    navigator.clipboard.writeText(lines.filter(Boolean).join('\n'))
  }

  function exportCurrentExcel() {
    if (reportType === 'profitProducts' || reportType === 'profitClients') {
      exportCSV(`reporte_utilidad_${reportType === 'profitClients' ? 'clientes' : 'productos'}`, profitReport?.rows ?? [], [
        { key: 'name', label: reportType === 'profitClients' ? 'Cliente' : 'Producto' },
        { key: 'quantity', label: 'Unidades' },
        { key: 'count', label: 'Ventas' },
        { key: 'sales', label: 'Ventas' },
        { key: 'cost', label: 'Costo' },
        { key: 'profit', label: 'Utilidad' },
        { key: 'margin', label: 'Margen %' },
      ])
      return
    }
    if (reportType === 'aging') {
      exportCSV('aging_cuentas_por_cobrar', agingReport?.rows ?? [], [
        { key: 'clientName', label: 'Cliente' },
        { key: 'phone', label: 'Telefono' },
        { key: 'document', label: 'Documento' },
        { key: 'invoiceNumber', label: 'Factura' },
        { key: 'date', label: 'Fecha' },
        { key: 'amount', label: 'Monto' },
        { key: 'days', label: 'Dias' },
        { key: 'bucket', label: 'Rango' },
      ])
      return
    }
    if (reportType === 'fiscal') {
      exportCSV('resumen_fiscal', fiscalSummary?.rows ?? [], [
        { key: 'date', label: 'Fecha' },
        { key: 'status', label: 'Estado' },
        { key: 'invoiceNumber', label: 'Factura' },
        { key: 'ncf', label: 'NCF' },
        { key: 'clientName', label: 'Cliente' },
        { key: 'document', label: 'RNC/Cedula' },
        { key: 'amount', label: 'Ventas' },
        { key: 'taxAmount', label: taxName },
        { key: 'taxableAmount', label: 'Base imponible' },
      ])
      return
    }
    exportCSV('movimientos_reporte', transactions, [
      { key: 'createdAt', label: 'Fecha' },
      { key: 'type', label: 'Tipo' },
      { key: 'description', label: 'Descripcion' },
      { key: 'paymentMethod', label: 'Metodo' },
      { key: 'status', label: 'Estado' },
      { key: 'amount', label: 'Monto' },
      { key: 'taxAmount', label: taxName },
    ])
  }

  function buildAndPrint() {
    const methodLabels: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia' }

    if (reportType === 'daily' || reportType === 'monthly') {
      const title = reportType === 'daily'
        ? `Cierre del ${format(new Date(date + 'T00:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: es })}`
        : `Resumen de ${format(new Date(month + '-01'), "MMMM yyyy", { locale: es })}`
      const rows = transactions.slice(0, 100).map(tx => `<tr>
        <td>${(tx.createdAt as string)?.slice(0, 10) ?? ''}</td>
        <td><span class="badge ${tx.type === 'SALE' ? 'bg' : 'br'}">${tx.type === 'SALE' ? 'Venta' : tx.type === 'RETURN' ? 'DevoluciÃ³n' : tx.type === 'EXPENSE' ? 'Gasto' : tx.type}</span></td>
        <td>${esc(tx.description || 'â€”')}</td>
        <td>${methodLabels[tx.paymentMethod as string] || (tx.paymentMethod as string)}</td>
        <td class="r">${fc(tx.amount as number)}</td>
      </tr>`).join('')
      const body = `
        <div class="grid">
          <div class="card"><div class="lbl">Ventas brutas</div><div class="val">${fc(totalSales)}</div><div class="sub">${salesTx.length} ventas</div></div>
          <div class="card"><div class="lbl">Gastos</div><div class="val" style="color:#b91c1c">${fc(totalExpenses)}</div></div>
          ${totalTax > 0 ? `<div class="card"><div class="lbl">${taxName} recaudado</div><div class="val">${fc(totalTax)}</div></div>` : ''}
          <div class="card"><div class="lbl">Utilidad neta</div><div class="val" style="color:${profit >= 0 ? '#15803d' : '#b91c1c'}">${fc(profit)}</div></div>
        </div>
        <h3>MÃ©todos de pago</h3>
        <div class="grid">
          ${['CASH', 'CARD', 'TRANSFER'].map(m => {
            const t = salesTx.filter(tx => tx.paymentMethod === m).reduce((s, tx) => s + (tx.amount as number), 0)
            return t > 0 ? `<div class="card"><div class="lbl">${methodLabels[m]}</div><div class="val">${fc(t)}</div></div>` : ''
          }).join('')}
        </div>
        <h3>Movimientos (${transactions.length})</h3>
        <table><thead><tr><th>Fecha</th><th>Tipo</th><th>DescripciÃ³n</th><th>MÃ©todo</th><th class="r">Monto</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4" class="r">Total ventas</td><td class="r">${fc(totalSales)}</td></tr></tfoot></table>`
      openPrintWindow(title, bizName, bizMeta, body)

    } else if (reportType === 'cierrez' && cierreZ) {
      const title = `Cierre Z â€” ${cierreZ.date}`
      const rows = cierreZ.transactions.slice(0, 200).map(tx => `<tr>
        <td>${tx.createdAt?.slice(11, 16)}</td>
        <td><span class="badge ${tx.type === 'SALE' ? 'bg' : 'br'}">${tx.type === 'SALE' ? 'Venta' : tx.type === 'EXPENSE' ? 'Gasto' : tx.type}</span></td>
        <td>${esc(tx.client?.name || tx.description || 'â€”')}</td>
        <td>${esc(tx.createdBy?.name || 'â€”')}</td>
        <td>${methodLabels[tx.paymentMethod] || tx.paymentMethod}</td>
        <td class="r">${fc(tx.amount)}</td>
      </tr>`).join('')
      const cs = cierreZ.cashSession
      const body = `
        <div class="grid">
          <div class="card"><div class="lbl">Ventas brutas</div><div class="val">${fc(cierreZ.totalSales)}</div><div class="sub">${cierreZ.salesCount} ventas</div></div>
          <div class="card"><div class="lbl">Devoluciones</div><div class="val" style="color:#b91c1c">-${fc(cierreZ.totalReturns)}</div></div>
          <div class="card"><div class="lbl">Gastos/Compras</div><div class="val" style="color:#b91c1c">-${fc(cierreZ.totalExpenses)}</div></div>
          <div class="card"><div class="lbl">${taxName} recaudado</div><div class="val">${fc(cierreZ.totalTax)}</div></div>
          <div class="card"><div class="lbl">Utilidad del dÃ­a</div><div class="val" style="color:${cierreZ.profit >= 0 ? '#15803d' : '#b91c1c'}">${fc(cierreZ.profit)}</div></div>
        </div>
        <h3>Desglose por mÃ©todo de pago</h3>
        <table><thead><tr><th>MÃ©todo</th><th class="r">Transacciones</th><th class="r">Total</th></tr></thead><tbody>
          ${['CASH', 'CARD', 'TRANSFER'].map(m => {
            const d = cierreZ.byPaymentMethod[m]
            return d?.total > 0 ? `<tr><td>${methodLabels[m]}</td><td class="r">${d.count}</td><td class="r">${fc(d.total)}</td></tr>` : ''
          }).join('')}
        </tbody></table>
        ${cs ? `<h3>SesiÃ³n de caja</h3>
        <table><thead><tr><th>Concepto</th><th class="r">Monto</th></tr></thead><tbody>
          <tr><td>Apertura de caja</td><td class="r">${fc(cs.openAmount)}</td></tr>
          <tr><td>Ventas en efectivo</td><td class="r">${fc(cierreZ.byPaymentMethod['CASH']?.total ?? 0)}</td></tr>
          <tr><td>Gastos pagados en caja</td><td class="r">-${fc(cierreZ.totalExpenses)}</td></tr>
          <tr><td>Efectivo esperado en caja</td><td class="r">${fc(cs.expectedCash)}</td></tr>
          ${cs.closeAmount != null ? `<tr><td>Cierre declarado</td><td class="r">${fc(cs.closeAmount)}</td></tr>
          <tr><td><strong>Diferencia</strong></td><td class="r" style="color:${(cs.difference ?? 0) === 0 ? '#15803d' : '#b91c1c'}"><strong>${fc(cs.difference ?? 0)}</strong></td></tr>` : ''}
        </tbody></table>` : ''}
        <h3>Movimientos del dÃ­a (${cierreZ.transactions.length})</h3>
        <table><thead><tr><th>Hora</th><th>Tipo</th><th>Cliente/Desc.</th><th>Cajero</th><th>MÃ©todo</th><th class="r">Monto</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="5" class="r">Total ventas netas</td><td class="r">${fc(cierreZ.netSales)}</td></tr></tfoot></table>`
      openPrintWindow(title, bizName, bizMeta, body)

    } else if (reportType === '606' && r606) {
      const title = `Reporte 606 â€” Compras â€” ${r606.month}`
      const rows = r606.rows.map(r => `<tr>
        <td>${r.fecha}</td><td>${esc(r.rnc_cedula)}</td><td>${esc(r.razon_social)}</td>
        <td class="c">${r.tipo_bienes === '01' ? 'Compra' : 'Gasto'}</td>
        <td>${esc(r.ncf)}</td><td class="r">${fc(r.monto_facturado)}</td><td class="r">${fc(r.itbis_facturado)}</td>
      </tr>`).join('')
      const body = `
        <div class="grid">
          <div class="card"><div class="lbl">Total comprobantes</div><div class="val">${r606.totals.count}</div></div>
          <div class="card"><div class="lbl">Monto total</div><div class="val">${fc(r606.totals.monto)}</div></div>
          <div class="card"><div class="lbl">${taxName} total</div><div class="val">${fc(r606.totals.itbis)}</div></div>
        </div>
        <table><thead><tr><th>Fecha</th><th>RNC/CÃ©dula</th><th>RazÃ³n Social</th><th class="c">Tipo</th><th>NCF</th><th class="r">Monto</th><th class="r">${taxName}</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="5" class="r">Totales</td><td class="r">${fc(r606.totals.monto)}</td><td class="r">${fc(r606.totals.itbis)}</td></tr></tfoot></table>`
      openPrintWindow(title, bizName, bizMeta, body)

    } else if (reportType === '607' && r607) {
      const title = `Reporte 607 â€” Ventas â€” ${r607.month}`
      const rows = r607.rows.map(r => `<tr>
        <td>${r.fecha}</td><td>${esc(r.ncf)}</td><td>${esc(r.rnc_cedula)}</td>
        <td>${esc(r.razon_social)}</td><td class="r">${fc(r.monto_facturado)}</td>
        <td class="r">${fc(r.itbis_facturado)}</td><td class="r">${fc(r.monto_sin_impuesto)}</td>
      </tr>`).join('')
      const body = `
        <div class="grid">
          <div class="card"><div class="lbl">Comprobantes</div><div class="val">${r607.totals.count}</div></div>
          <div class="card"><div class="lbl">Ventas brutas</div><div class="val">${fc(r607.totals.monto)}</div></div>
          <div class="card"><div class="lbl">${taxName} recaudado</div><div class="val">${fc(r607.totals.itbis)}</div></div>
        </div>
        <table><thead><tr><th>Fecha</th><th>NCF</th><th>RNC/CÃ©dula</th><th>RazÃ³n Social</th><th class="r">Monto</th><th class="r">${taxName}</th><th class="r">Sin impuesto</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4" class="r">Totales</td><td class="r">${fc(r607.totals.monto)}</td><td class="r">${fc(r607.totals.itbis)}</td><td class="r">${fc(r607.totals.monto - r607.totals.itbis)}</td></tr></tfoot></table>`
      openPrintWindow(title, bizName, bizMeta, body)

    } else if (reportType === 'inventory') {
      const title = `Inventario â€” ${format(today, 'dd/MM/yyyy')}`
      const rows = [...products].sort((a, b) => (a.name as string).localeCompare(b.name as string)).map(p => `<tr>
        <td>${esc(p.name as string)}</td>
        <td class="c"><span class="badge ${(p.quantity as number) === 0 ? 'br' : (p.quantity as number) <= 5 ? 'by' : 'bg'}">${p.quantity}</span></td>
        <td class="r">${fc(p.price as number)}</td>
        <td class="r">${fc(p.cost as number)}</td>
        <td class="r">${fc((p.cost as number) * (p.quantity as number))}</td>
      </tr>`).join('')
      const totalValue = products.reduce((s, p) => s + (p.cost as number) * (p.quantity as number), 0)
      const body = `
        <div class="grid">
          <div class="card"><div class="lbl">Productos</div><div class="val">${products.length}</div></div>
          <div class="card"><div class="lbl">Valor al costo</div><div class="val">${fc(totalValue)}</div></div>
          <div class="card"><div class="lbl">Agotados</div><div class="val" style="color:#b91c1c">${products.filter(p => (p.quantity as number) === 0).length}</div></div>
        </div>
        <table><thead><tr><th>Producto</th><th class="c">Stock</th><th class="r">Precio</th><th class="r">Costo</th><th class="r">Valor stock</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4" class="r">Total valor inventario (al costo)</td><td class="r">${fc(totalValue)}</td></tr></tfoot></table>`
      openPrintWindow(title, bizName, bizMeta, body)

    } else if (reportType === 'clients') {
      const title = `Listado de clientes â€” ${format(today, 'dd/MM/yyyy')}`
      const rows = (clients as Record<string, unknown>[]).map(c => `<tr>
        <td>${esc(c.name as string)}</td>
        <td>${esc((c.phone as string) || 'â€”')}</td>
        <td>${esc((c.document as string) || 'â€”')}</td>
        <td class="c">${(c._count as Record<string, unknown>)?.transactions as number || 0}</td>
        <td class="r" style="color:${(c.pendingDebt as number) > 0 ? '#b91c1c' : '#15803d'}">${fc((c.pendingDebt as number) || 0)}</td>
      </tr>`).join('')
      const body = `
        <div class="grid">
          <div class="card"><div class="lbl">Total clientes</div><div class="val">${clients.length}</div></div>
          <div class="card"><div class="lbl">Deuda pendiente total</div><div class="val" style="color:#b91c1c">${fc(clients.reduce((s, c) => s + ((c.pendingDebt as number) || 0), 0))}</div></div>
        </div>
        <table><thead><tr><th>Cliente</th><th>TelÃ©fono</th><th>Documento</th><th class="c">Compras</th><th class="r">Deuda pendiente</th></tr></thead>
        <tbody>${rows}</tbody></table>`
      openPrintWindow(title, bizName, bizMeta, body)

    } else if (reportType === 'employees' && empReport) {
      const title = `Reporte de empleados â€” ${empFrom} al ${empTo}`
      const rows = empReport.employees.map(e => `<tr>
        <td>${esc(e.name)}</td>
        <td class="c"><span class="badge bb">${e.role}</span></td>
        <td class="c">${e.count}</td>
        <td class="r">${fc(e.total)}</td>
        <td class="r">${fc(e.tax)}</td>
        <td class="r">${fc(e.byMethod['CASH'] ?? 0)}</td>
        <td class="r">${fc(e.byMethod['CARD'] ?? 0)}</td>
        <td class="r">${fc(e.byMethod['TRANSFER'] ?? 0)}</td>
      </tr>`).join('')
      const body = `
        <div class="grid">
          <div class="card"><div class="lbl">Cajeros</div><div class="val">${empReport.employees.length}</div></div>
          <div class="card"><div class="lbl">Total ventas</div><div class="val">${fc(empReport.totals.total)}</div></div>
          <div class="card"><div class="lbl">Transacciones</div><div class="val">${empReport.totals.count}</div></div>
        </div>
        <table><thead><tr><th>Empleado</th><th class="c">Rol</th><th class="c">Ventas</th><th class="r">Total</th><th class="r">${taxName}</th><th class="r">Efectivo</th><th class="r">Tarjeta</th><th class="r">Transfer.</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="2" class="r">Totales</td><td class="c">${empReport.totals.count}</td><td class="r">${fc(empReport.totals.total)}</td><td colspan="4"></td></tr></tfoot></table>`
      openPrintWindow(title, bizName, bizMeta, body)
    } else if ((reportType === 'profitProducts' || reportType === 'profitClients') && profitReport) {
      const isClient = reportType === 'profitClients'
      const title = `Utilidad por ${isClient ? 'cliente' : 'producto'} - ${fromDate} al ${toDate}`
      const rows = profitReport.rows.map(r => `<tr>
        <td>${esc(r.name)}</td>
        <td class="r">${isClient ? (r.count ?? 0) : (r.quantity ?? 0)}</td>
        <td class="r">${fc(r.sales)}</td>
        <td class="r">${fc(r.cost)}</td>
        <td class="r" style="color:${r.profit >= 0 ? '#15803d' : '#b91c1c'}">${fc(r.profit)}</td>
        <td class="r">${r.margin.toFixed(1)}%</td>
      </tr>`).join('')
      const body = `
        <div class="grid">
          <div class="card"><div class="lbl">Ventas</div><div class="val">${fc(profitReport.totals.sales)}</div></div>
          <div class="card"><div class="lbl">Costo</div><div class="val">${fc(profitReport.totals.cost)}</div></div>
          <div class="card"><div class="lbl">Utilidad</div><div class="val" style="color:${profitReport.totals.profit >= 0 ? '#15803d' : '#b91c1c'}">${fc(profitReport.totals.profit)}</div></div>
        </div>
        <table><thead><tr><th>${isClient ? 'Cliente' : 'Producto'}</th><th class="r">${isClient ? 'Ventas' : 'Unidades'}</th><th class="r">Ingresos</th><th class="r">Costo</th><th class="r">Utilidad</th><th class="r">Margen</th></tr></thead>
        <tbody>${rows}</tbody></table>`
      openPrintWindow(title, bizName, bizMeta, body)
    } else if (reportType === 'aging' && agingReport) {
      const title = 'Aging de cuentas por cobrar'
      const rows = agingReport.rows.map(r => `<tr>
        <td>${esc(r.clientName)}</td><td>${esc(r.phone)}</td><td>${esc(r.invoiceNumber || '-')}</td>
        <td>${r.date}</td><td class="r">${r.days}</td><td class="c">${r.bucket}</td><td class="r">${fc(r.amount)}</td>
      </tr>`).join('')
      const body = `
        <div class="grid">
          <div class="card"><div class="lbl">Total pendiente</div><div class="val">${fc(agingReport.total)}</div></div>
          <div class="card"><div class="lbl">Facturas pendientes</div><div class="val">${agingReport.count}</div></div>
          ${Object.entries(agingReport.buckets).map(([bucket, v]) => `<div class="card"><div class="lbl">${bucket} dias</div><div class="val">${fc(v.total)}</div><div class="sub">${v.count} cuentas</div></div>`).join('')}
        </div>
        <table><thead><tr><th>Cliente</th><th>Telefono</th><th>Factura</th><th>Fecha</th><th class="r">Dias</th><th class="c">Rango</th><th class="r">Monto</th></tr></thead>
        <tbody>${rows}</tbody><tfoot><tr><td colspan="6" class="r">Total</td><td class="r">${fc(agingReport.total)}</td></tr></tfoot></table>`
      openPrintWindow(title, bizName, bizMeta, body)
    } else if (reportType === 'fiscal' && fiscalSummary) {
      const title = `Resumen fiscal - ${fiscalSummary.month}`
      const rows = fiscalSummary.rows.map(r => `<tr>
        <td>${r.date}</td><td>${esc(r.invoiceNumber || '-')}</td><td>${esc(r.ncf || '-')}</td>
        <td>${esc(r.clientName)}</td><td class="c">${r.status}</td><td class="r">${fc(r.amount)}</td><td class="r">${fc(r.taxAmount)}</td>
      </tr>`).join('')
      const body = `
        <div class="grid">
          <div class="card"><div class="lbl">Ventas validas</div><div class="val">${fc(fiscalSummary.totals.sales)}</div></div>
          <div class="card"><div class="lbl">${taxName}</div><div class="val">${fc(fiscalSummary.totals.tax)}</div></div>
          <div class="card"><div class="lbl">NCF emitidos</div><div class="val">${fiscalSummary.totals.ncfCount}</div></div>
          <div class="card"><div class="lbl">Anulaciones</div><div class="val" style="color:#b91c1c">${fiscalSummary.totals.cancelledCount}</div><div class="sub">${fc(fiscalSummary.totals.cancelledAmount)}</div></div>
        </div>
        <table><thead><tr><th>Fecha</th><th>Factura</th><th>NCF</th><th>Cliente</th><th class="c">Estado</th><th class="r">Monto</th><th class="r">${taxName}</th></tr></thead>
        <tbody>${rows}</tbody></table>`
      openPrintWindow(title, bizName, bizMeta, body)
    }
  }

  const REPORT_TYPES = [
    { key: 'daily', label: 'Cierre diario', icon: Calendar, section: 'Ventas' },
    { key: 'monthly', label: 'Resumen mensual', icon: TrendingUp, section: 'Ventas' },
    { key: 'cierrez', label: 'Cierre Z', icon: Receipt, section: 'Ventas' },
    { key: 'profitProducts', label: 'Utilidad productos', icon: TrendingUp, section: 'Ventas' },
    { key: 'profitClients', label: 'Utilidad clientes', icon: Users, section: 'Ventas' },
    { key: '606', label: '606 Compras', icon: ClipboardList, section: 'Fiscal' },
    { key: '607', label: '607 Ventas', icon: ClipboardList, section: 'Fiscal' },
    { key: 'fiscal', label: 'Fiscal claro', icon: Receipt, section: 'Fiscal' },
    { key: 'aging', label: 'Aging CxC', icon: ClipboardList, section: 'Gestión' },
    { key: 'inventory', label: 'Inventario', icon: Package, section: 'Gestión' },
    { key: 'clients', label: 'Clientes', icon: Users, section: 'Gestión' },
    { key: 'employees', label: 'Empleados', icon: UserCheck, section: 'Gestión' },
  ] as const

  const sections = ['Ventas', 'Fiscal', 'Gestión']

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Reportes"
        subtitle="Genera e imprime reportes de tu negocio"
        icon={<FileText size={18} className="text-indigo-500 dark:text-indigo-400" />}
        action={
          <div className="flex items-center gap-2">
            {(reportType === 'daily' || reportType === 'cierrez') && (
              <button onClick={copyWhatsAppSummary} className="btn-secondary">
                <Copy size={15} /> WhatsApp
              </button>
            )}
            <button onClick={exportCurrentExcel} className="btn-secondary">
              <FileSpreadsheet size={15} /> Excel
            </button>
            <button onClick={buildAndPrint} className="btn-primary">
              <Download size={15} /> PDF
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-5">
        {/* Selector de tipo por secciones */}
        <div className="space-y-2">
          {sections.map(section => (
            <div key={section} className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 w-14">{section}</span>
              {REPORT_TYPES.filter(r => r.section === section).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setReportType(key)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all
                    ${reportType === key
                      ? 'bg-indigo-600 text-white border-indigo-600 dark:border-indigo-500 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-700'}`}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Selectores de fecha */}
        {(reportType === 'daily' || reportType === 'cierrez') && (
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-500 dark:text-slate-400 font-medium">Fecha:</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input w-44" />
          </div>
        )}
        {(reportType === 'monthly' || reportType === '606' || reportType === '607' || reportType === 'fiscal' || reportType === 'profitProducts' || reportType === 'profitClients') && (
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-500 dark:text-slate-400 font-medium">Mes:</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input w-44" />
          </div>
        )}
        {reportType === 'employees' && (
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-gray-500 dark:text-slate-400 font-medium">PerÃ­odo:</label>
            <input type="date" value={empFrom} onChange={e => setEmpFrom(e.target.value)} className="input w-44" />
            <span className="text-gray-400 dark:text-slate-500">â€”</span>
            <input type="date" value={empTo} onChange={e => setEmpTo(e.target.value)} className="input w-44" />
          </div>
        )}

        {/* â”€â”€ Reporte diario / mensual â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {(reportType === 'daily' || reportType === 'monthly') && (
          <div className="space-y-4">
            <div className="card p-5">
              <div className="text-center mb-4 border-b border-gray-100 dark:border-slate-700 pb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">{business?.name}</h2>
                <p className="text-gray-500 dark:text-slate-400 text-sm">
                  {reportType === 'daily'
                    ? `Cierre del ${format(new Date(date + 'T00:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: es })}`
                    : `Resumen de ${format(new Date(month + '-01'), "MMMM yyyy", { locale: es })}`
                  }
                </p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Generado: {format(today, "dd/MM/yyyy HH:mm")}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="bg-green-50 dark:bg-green-950/40 rounded-xl p-4">
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium">Ventas brutas</p>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">{formatCurrency(totalSales, cur)}</p>
                  <p className="text-xs text-green-500 dark:text-green-400">{salesTx.length} transacciones</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/40 rounded-xl p-4">
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">Gastos y compras</p>
                  <p className="text-2xl font-bold text-red-700 dark:text-red-300">{formatCurrency(totalExpenses, cur)}</p>
                </div>
                {totalTax > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-950/40 rounded-xl p-4">
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">{taxName} recaudado</p>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{formatCurrency(totalTax, cur)}</p>
                  </div>
                )}
                {totalReturns > 0 && (
                  <div className="bg-orange-50 dark:bg-orange-950/40 rounded-xl p-4">
                    <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Devoluciones</p>
                    <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">-{formatCurrency(totalReturns, cur)}</p>
                  </div>
                )}
              </div>
              <div className="bg-gray-900 dark:bg-slate-100 text-white rounded-xl p-4 text-center">
                <p className="text-sm text-gray-300 dark:text-slate-600">Utilidad neta</p>
                <p className={`text-3xl font-black ${profit >= 0 ? 'text-green-400 dark:text-green-400' : 'text-red-400 dark:text-red-400'}`}>
                  {formatCurrency(profit, cur)}
                </p>
              </div>
            </div>

            {salesTx.length > 0 && (
              <div className="card p-5">
                <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-3">Desglose por forma de pago</h3>
                {(['CASH', 'CARD', 'TRANSFER'] as const).map(method => {
                  const label = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia' }[method]
                  const total = salesTx.filter(t => t.paymentMethod === method).reduce((s, t) => s + (t.amount as number), 0)
                  if (total === 0) return null
                  return (
                    <div key={method} className="flex justify-between py-2 border-b border-gray-50 dark:border-slate-800 last:border-0">
                      <span className="text-gray-600 dark:text-slate-300">{label}</span>
                      <span className="font-semibold">{formatCurrency(total, cur)}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {transactions.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                  <p className="font-semibold text-sm text-gray-700 dark:text-slate-300">Detalle de movimientos</p>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-800">
                    <tr>
                      <th className="table-header">Tipo</th>
                      <th className="table-header">DescripciÃ³n</th>
                      <th className="table-header">Pago</th>
                      <th className="table-header text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                    {transactions.slice(0, 50).map(tx => (
                      <tr key={tx.id as string} className="table-row">
                        <td className="table-cell">
                          <span className={`badge ${tx.type === 'SALE' ? 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40' : tx.type === 'RETURN' ? 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40' : 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40'}`}>
                            {tx.type === 'SALE' ? 'Venta' : tx.type === 'RETURN' ? 'DevoluciÃ³n' : tx.type === 'EXPENSE' ? 'Gasto' : tx.type as string}
                          </span>
                        </td>
                        <td className="table-cell text-gray-600 dark:text-slate-300">{(tx.description as string) || 'â€”'}</td>
                        <td className="table-cell text-gray-500 dark:text-slate-400">{{ CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transfer' }[tx.paymentMethod as string] || (tx.paymentMethod as string)}</td>
                        <td className={`table-cell text-right font-semibold ${tx.type === 'SALE' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                          {tx.type === 'SALE' ? '+' : 'âˆ’'}{formatCurrency(tx.amount as number, cur)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {transactions.length > 50 && (
                  <p className="text-center text-xs text-gray-400 dark:text-slate-500 py-3">Mostrando 50 de {transactions.length} movimientos. Usa Exportar PDF para ver todos.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* â”€â”€ Cierre Z â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {reportType === 'cierrez' && cierreZ && (
          <div className="space-y-4">
            <div className="card p-5">
              <div className="text-center mb-5 border-b border-gray-100 dark:border-slate-700 pb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Cierre Z</h2>
                <p className="text-gray-500 dark:text-slate-400 text-sm">{format(new Date(cierreZ.date + 'T00:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: es })}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">Generado: {format(today, "dd/MM/yyyy HH:mm")}</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Ventas brutas', val: cierreZ.totalSales, count: `${cierreZ.salesCount} ventas`, color: 'green' },
                  { label: 'Devoluciones', val: -cierreZ.totalReturns, color: 'orange' },
                  { label: 'Gastos/Compras', val: -cierreZ.totalExpenses, color: 'red' },
                  { label: `${taxName} recaudado`, val: cierreZ.totalTax, color: 'blue' },
                  { label: 'Ventas netas', val: cierreZ.netSales, color: 'indigo' },
                ].map(({ label, val, count, color }) => (
                  <div key={label} className={`bg-${color}-50 rounded-xl p-3`}>
                    <p className={`text-xs text-${color}-600 font-medium`}>{label}</p>
                    <p className={`text-xl font-bold text-${color}-700`}>{formatCurrency(Math.abs(val), cur)}</p>
                    {count && <p className={`text-xs text-${color}-500`}>{count}</p>}
                  </div>
                ))}
                <div className={`bg-gray-900 dark:bg-slate-100 rounded-xl p-3`}>
                  <p className="text-xs text-gray-400 dark:text-slate-500 font-medium">Utilidad del dÃ­a</p>
                  <p className={`text-xl font-bold ${cierreZ.profit >= 0 ? 'text-green-400 dark:text-green-400' : 'text-red-400 dark:text-red-400'}`}>
                    {formatCurrency(cierreZ.profit, cur)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="card p-5">
                <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-3">Por mÃ©todo de pago</h3>
                {['CASH', 'CARD', 'TRANSFER'].map(m => {
                  const d = cierreZ.byPaymentMethod[m]
                  const label = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia' }[m]
                  return (
                    <div key={m} className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800 last:border-0">
                      <span className="text-gray-600 dark:text-slate-300 text-sm">{label}</span>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(d?.total ?? 0, cur)}</p>
                        <p className="text-xs text-gray-400 dark:text-slate-500">{d?.count ?? 0} transacciones</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {cierreZ.cashSession && (
                <div className="card p-5">
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                    SesiÃ³n de caja
                    <span className={`badge text-xs ${cierreZ.cashSession.status === 'OPEN' ? 'text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40' : 'text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700'}`}>
                      {cierreZ.cashSession.status === 'OPEN' ? 'Abierta' : 'Cerrada'}
                    </span>
                  </h3>
                  {[
                    { label: 'Apertura', val: cierreZ.cashSession.openAmount },
                    { label: 'Efectivo esperado', val: cierreZ.cashSession.expectedCash },
                    ...(cierreZ.cashSession.closeAmount != null ? [{ label: 'Cierre declarado', val: cierreZ.cashSession.closeAmount }] : []),
                  ].map(({ label, val }) => (
                    <div key={label} className="flex justify-between py-1.5 border-b border-gray-50 dark:border-slate-800 last:border-0 text-sm">
                      <span className="text-gray-500 dark:text-slate-400">{label}</span>
                      <span className="font-semibold">{formatCurrency(val, cur)}</span>
                    </div>
                  ))}
                  {cierreZ.cashSession.difference != null && (
                    <div className={`mt-3 p-3 rounded-lg text-center ${Math.abs(cierreZ.cashSession.difference) < 0.01 ? 'bg-green-50 dark:bg-green-950/40' : 'bg-red-50 dark:bg-red-950/40'}`}>
                      <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Diferencia</p>
                      <p className={`text-xl font-black ${Math.abs(cierreZ.cashSession.difference) < 0.01 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatCurrency(cierreZ.cashSession.difference, cur)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                <p className="font-semibold text-sm text-gray-700 dark:text-slate-300">Movimientos ({cierreZ.transactions.length})</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800">
                  <tr>
                    <th className="table-header">Hora</th>
                    <th className="table-header">Tipo</th>
                    <th className="table-header">Cliente</th>
                    <th className="table-header">Cajero</th>
                    <th className="table-header text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                  {cierreZ.transactions.slice(0, 50).map(tx => (
                    <tr key={tx.id} className="table-row">
                      <td className="table-cell text-gray-400 dark:text-slate-500 text-xs">{tx.createdAt?.slice(11, 16)}</td>
                      <td className="table-cell">
                        <span className={`badge ${tx.type === 'SALE' ? 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40' : 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40'}`}>
                          {tx.type === 'SALE' ? 'Venta' : tx.type === 'EXPENSE' ? 'Gasto' : tx.type}
                        </span>
                      </td>
                      <td className="table-cell text-gray-600 dark:text-slate-300">{tx.client?.name || tx.description || 'â€”'}</td>
                      <td className="table-cell text-gray-400 dark:text-slate-500 text-xs">{tx.createdBy?.name || 'â€”'}</td>
                      <td className={`table-cell text-right font-semibold ${tx.type === 'SALE' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                        {formatCurrency(tx.amount, cur)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {reportType === 'cierrez' && !cierreZ && (
          <div className="card p-12 text-center text-gray-400 dark:text-slate-500">
            <Receipt size={36} className="mx-auto mb-3 opacity-30" />
            <p>Selecciona una fecha para ver el Cierre Z</p>
          </div>
        )}

        {(reportType === 'profitProducts' || reportType === 'profitClients') && profitReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Ventas', val: formatCurrency(profitReport.totals.sales, cur) },
                { label: 'Costo', val: formatCurrency(profitReport.totals.cost, cur) },
                { label: 'Utilidad', val: formatCurrency(profitReport.totals.profit, cur) },
              ].map(item => (
                <div key={item.label} className="card p-4">
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">{item.label}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{item.val}</p>
                </div>
              ))}
            </div>
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                <p className="font-semibold text-sm text-gray-700 dark:text-slate-300">
                  Utilidad por {reportType === 'profitClients' ? 'cliente' : 'producto'}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead className="bg-gray-50 dark:bg-slate-800">
                    <tr>
                      <th className="table-header">{reportType === 'profitClients' ? 'Cliente' : 'Producto'}</th>
                      <th className="table-header text-right">{reportType === 'profitClients' ? 'Ventas' : 'Unidades'}</th>
                      <th className="table-header text-right">Ingresos</th>
                      <th className="table-header text-right">Costo</th>
                      <th className="table-header text-right">Utilidad</th>
                      <th className="table-header text-right">Margen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                    {profitReport.rows.slice(0, 80).map(row => (
                      <tr key={row.id} className="table-row">
                        <td className="table-cell font-medium text-gray-900 dark:text-slate-100">{row.name}</td>
                        <td className="table-cell text-right">{reportType === 'profitClients' ? row.count ?? 0 : row.quantity ?? 0}</td>
                        <td className="table-cell text-right">{formatCurrency(row.sales, cur)}</td>
                        <td className="table-cell text-right">{formatCurrency(row.cost, cur)}</td>
                        <td className={`table-cell text-right font-semibold ${row.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(row.profit, cur)}</td>
                        <td className="table-cell text-right">{row.margin.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {reportType === 'aging' && agingReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="card p-4">
                <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Total pendiente</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{formatCurrency(agingReport.total, cur)}</p>
              </div>
              {Object.entries(agingReport.buckets).map(([bucket, data]) => (
                <div key={bucket} className="card p-4">
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">{bucket} dias</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{formatCurrency(data.total, cur)}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">{data.count} cuenta(s)</p>
                </div>
              ))}
            </div>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[820px]">
                  <thead className="bg-gray-50 dark:bg-slate-800">
                    <tr>
                      <th className="table-header">Cliente</th>
                      <th className="table-header">Telefono</th>
                      <th className="table-header">Factura</th>
                      <th className="table-header">Fecha</th>
                      <th className="table-header text-right">Dias</th>
                      <th className="table-header">Rango</th>
                      <th className="table-header text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                    {agingReport.rows.map(row => (
                      <tr key={row.id} className="table-row">
                        <td className="table-cell font-medium text-gray-900 dark:text-slate-100">{row.clientName}</td>
                        <td className="table-cell text-gray-500 dark:text-slate-400">{row.phone || '-'}</td>
                        <td className="table-cell text-gray-500 dark:text-slate-400">{row.invoiceNumber || '-'}</td>
                        <td className="table-cell">{row.date}</td>
                        <td className="table-cell text-right">{row.days}</td>
                        <td className="table-cell"><span className="badge bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">{row.bucket}</span></td>
                        <td className="table-cell text-right font-semibold text-red-600 dark:text-red-400">{formatCurrency(row.amount, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {reportType === 'fiscal' && fiscalSummary && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card p-4"><p className="text-xs text-gray-500 dark:text-slate-400">Ventas validas</p><p className="text-xl font-bold">{formatCurrency(fiscalSummary.totals.sales, cur)}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500 dark:text-slate-400">{taxName}</p><p className="text-xl font-bold">{formatCurrency(fiscalSummary.totals.tax, cur)}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500 dark:text-slate-400">NCF emitidos</p><p className="text-xl font-bold">{fiscalSummary.totals.ncfCount}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500 dark:text-slate-400">Anulaciones</p><p className="text-xl font-bold text-red-600 dark:text-red-400">{fiscalSummary.totals.cancelledCount}</p></div>
            </div>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-gray-50 dark:bg-slate-800">
                    <tr>
                      <th className="table-header">Fecha</th>
                      <th className="table-header">Factura</th>
                      <th className="table-header">NCF</th>
                      <th className="table-header">Cliente</th>
                      <th className="table-header">Estado</th>
                      <th className="table-header text-right">Monto</th>
                      <th className="table-header text-right">{taxName}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                    {fiscalSummary.rows.map((row, index) => (
                      <tr key={`${row.invoiceNumber}-${index}`} className="table-row">
                        <td className="table-cell">{row.date}</td>
                        <td className="table-cell">{row.invoiceNumber || '-'}</td>
                        <td className="table-cell">{row.ncf || '-'}</td>
                        <td className="table-cell">{row.clientName}</td>
                        <td className="table-cell"><span className={`badge ${row.status === 'CANCELLED' ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300' : 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300'}`}>{row.status}</span></td>
                        <td className="table-cell text-right">{formatCurrency(row.amount, cur)}</td>
                        <td className="table-cell text-right">{formatCurrency(row.taxAmount, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* â”€â”€ Reporte 606 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {reportType === '606' && r606 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Comprobantes', val: String(r606.totals.count), isCur: false },
                { label: 'Monto total', val: formatCurrency(r606.totals.monto, cur), isCur: true },
                { label: `${taxName} total`, val: formatCurrency(r606.totals.itbis, cur), isCur: true },
              ].map(({ label, val }) => (
                <div key={label} className="card p-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium mb-1">{label}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{val}</p>
                </div>
              ))}
            </div>
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                <p className="font-semibold text-sm text-gray-700 dark:text-slate-300">606 â€” Compras ({r606.month})</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800">
                  <tr>
                    <th className="table-header">Fecha</th>
                    <th className="table-header">RNC/CÃ©dula</th>
                    <th className="table-header">RazÃ³n Social</th>
                    <th className="table-header">Tipo</th>
                    <th className="table-header">NCF</th>
                    <th className="table-header text-right">Monto</th>
                    <th className="table-header text-right">{taxName}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                  {r606.rows.map((row, i) => (
                    <tr key={i} className="table-row">
                      <td className="table-cell text-gray-500 dark:text-slate-400 text-xs">{row.fecha}</td>
                      <td className="table-cell text-gray-600 dark:text-slate-300">{row.rnc_cedula || 'â€”'}</td>
                      <td className="table-cell font-medium">{row.razon_social}</td>
                      <td className="table-cell"><span className="badge text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40">{row.tipo_bienes === '01' ? 'Compra' : 'Gasto'}</span></td>
                      <td className="table-cell text-gray-500 dark:text-slate-400 text-xs">{row.ncf || 'â€”'}</td>
                      <td className="table-cell text-right font-semibold">{formatCurrency(row.monto_facturado, cur)}</td>
                      <td className="table-cell text-right text-blue-600 dark:text-blue-400">{formatCurrency(row.itbis_facturado, cur)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-slate-800 font-bold">
                    <td className="table-cell" colSpan={5}>Totales</td>
                    <td className="table-cell text-right text-gray-900 dark:text-slate-100">{formatCurrency(r606.totals.monto, cur)}</td>
                    <td className="table-cell text-right text-blue-700 dark:text-blue-300">{formatCurrency(r606.totals.itbis, cur)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* â”€â”€ Reporte 607 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {reportType === '607' && r607 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Comprobantes', val: String(r607.totals.count) },
                { label: 'Ventas brutas', val: formatCurrency(r607.totals.monto, cur) },
                { label: `${taxName} recaudado`, val: formatCurrency(r607.totals.itbis, cur) },
              ].map(({ label, val }) => (
                <div key={label} className="card p-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium mb-1">{label}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{val}</p>
                </div>
              ))}
            </div>
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                <p className="font-semibold text-sm text-gray-700 dark:text-slate-300">607 â€” Ventas ({r607.month})</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800">
                  <tr>
                    <th className="table-header">Fecha</th>
                    <th className="table-header">NCF</th>
                    <th className="table-header">RNC/CÃ©dula</th>
                    <th className="table-header">RazÃ³n Social</th>
                    <th className="table-header text-right">Monto</th>
                    <th className="table-header text-right">{taxName}</th>
                    <th className="table-header text-right">Sin imp.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                  {r607.rows.map((row, i) => (
                    <tr key={i} className="table-row">
                      <td className="table-cell text-gray-500 dark:text-slate-400 text-xs">{row.fecha}</td>
                      <td className="table-cell text-gray-500 dark:text-slate-400 text-xs">{row.ncf || 'â€”'}</td>
                      <td className="table-cell text-gray-600 dark:text-slate-300">{row.rnc_cedula || 'â€”'}</td>
                      <td className="table-cell font-medium">{row.razon_social}</td>
                      <td className="table-cell text-right font-semibold">{formatCurrency(row.monto_facturado, cur)}</td>
                      <td className="table-cell text-right text-blue-600 dark:text-blue-400">{formatCurrency(row.itbis_facturado, cur)}</td>
                      <td className="table-cell text-right text-gray-500 dark:text-slate-400">{formatCurrency(row.monto_sin_impuesto, cur)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-slate-800 font-bold">
                    <td className="table-cell" colSpan={4}>Totales</td>
                    <td className="table-cell text-right text-gray-900 dark:text-slate-100">{formatCurrency(r607.totals.monto, cur)}</td>
                    <td className="table-cell text-right text-blue-700 dark:text-blue-300">{formatCurrency(r607.totals.itbis, cur)}</td>
                    <td className="table-cell text-right text-gray-600 dark:text-slate-300">{formatCurrency(r607.totals.monto - r607.totals.itbis, cur)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* â”€â”€ Inventario â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {reportType === 'inventory' && (
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 flex items-center justify-between">
              <p className="font-semibold text-gray-700 dark:text-slate-300">Inventario â€” {format(today, "dd/MM/yyyy")}</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">{products.length} productos</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800">
                <tr>
                  <th className="table-header">Producto</th>
                  <th className="table-header text-center">Stock</th>
                  <th className="table-header text-right">Precio</th>
                  <th className="table-header text-right">Costo</th>
                  <th className="table-header text-right">Valor stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                {(products as Record<string, unknown>[]).sort((a, b) => (a.name as string).localeCompare(b.name as string)).map(p => (
                  <tr key={p.id as string} className="table-row">
                    <td className="table-cell font-medium text-gray-900 dark:text-slate-100">{p.name as string}</td>
                    <td className="table-cell text-center">
                      <span className={`badge ${(p.quantity as number) === 0 ? 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40' : (p.quantity as number) <= 5 ? 'text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950/40' : 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40'}`}>
                        {p.quantity as number}
                      </span>
                    </td>
                    <td className="table-cell text-right">{formatCurrency(p.price as number, cur)}</td>
                    <td className="table-cell text-right text-gray-500 dark:text-slate-400">{formatCurrency(p.cost as number, cur)}</td>
                    <td className="table-cell text-right font-semibold">{formatCurrency((p.cost as number) * (p.quantity as number), cur)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-slate-800 font-bold">
                  <td className="table-cell" colSpan={4}>Total valor inventario (al costo)</td>
                  <td className="table-cell text-right text-blue-700 dark:text-blue-300">
                    {formatCurrency(products.reduce((s, p) => s + (p.cost as number) * (p.quantity as number), 0), cur)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* â”€â”€ Clientes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {reportType === 'clients' && (
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 flex items-center justify-between">
              <p className="font-semibold text-gray-700 dark:text-slate-300">Clientes â€” {format(today, "dd/MM/yyyy")}</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">{clients.length} clientes</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800">
                <tr>
                  <th className="table-header">Cliente</th>
                  <th className="table-header">TelÃ©fono</th>
                  <th className="table-header">Documento</th>
                  <th className="table-header text-center">Compras</th>
                  <th className="table-header text-right">Deuda pendiente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                {(clients as Record<string, unknown>[]).map(c => (
                  <tr key={c.id as string} className="table-row">
                    <td className="table-cell font-medium text-gray-900 dark:text-slate-100">
                      {Boolean(c.isVip) && <span className="text-yellow-500 dark:text-yellow-400 mr-1">â˜…</span>}{c.name as string}
                    </td>
                    <td className="table-cell text-gray-500 dark:text-slate-400">{(c.phone as string) || 'â€”'}</td>
                    <td className="table-cell text-gray-500 dark:text-slate-400">{(c.document as string) || 'â€”'}</td>
                    <td className="table-cell text-center">{(c._count as Record<string, unknown>)?.transactions as number || 0}</td>
                    <td className={`table-cell text-right font-semibold ${(c.pendingDebt as number) > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {formatCurrency((c.pendingDebt as number) || 0, cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* â”€â”€ Empleados â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {reportType === 'employees' && empReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Empleados activos', val: String(empReport.employees.length) },
                { label: 'Total ventas', val: formatCurrency(empReport.totals.total, cur) },
                { label: 'Transacciones', val: String(empReport.totals.count) },
              ].map(({ label, val }) => (
                <div key={label} className="card p-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium mb-1">{label}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{val}</p>
                </div>
              ))}
            </div>
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                <p className="font-semibold text-sm text-gray-700 dark:text-slate-300">Ventas por empleado â€” {empFrom} al {empTo}</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800">
                  <tr>
                    <th className="table-header">Empleado</th>
                    <th className="table-header">Rol</th>
                    <th className="table-header text-center">Ventas</th>
                    <th className="table-header text-right">Total</th>
                    <th className="table-header text-right">{taxName}</th>
                    <th className="table-header text-right">Efectivo</th>
                    <th className="table-header text-right">Tarjeta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                  {empReport.employees.map(emp => (
                    <tr key={emp.userId} className="table-row">
                      <td className="table-cell font-medium text-gray-900 dark:text-slate-100">{emp.name}</td>
                      <td className="table-cell">
                        <span className="badge text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40">{emp.role}</span>
                      </td>
                      <td className="table-cell text-center">{emp.count}</td>
                      <td className="table-cell text-right font-semibold text-green-600 dark:text-green-400">{formatCurrency(emp.total, cur)}</td>
                      <td className="table-cell text-right text-blue-600 dark:text-blue-400">{formatCurrency(emp.tax, cur)}</td>
                      <td className="table-cell text-right text-gray-600 dark:text-slate-300">{formatCurrency(emp.byMethod['CASH'] ?? 0, cur)}</td>
                      <td className="table-cell text-right text-gray-600 dark:text-slate-300">{formatCurrency(emp.byMethod['CARD'] ?? 0, cur)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-slate-800 font-bold">
                    <td className="table-cell" colSpan={2}>Totales</td>
                    <td className="table-cell text-center">{empReport.totals.count}</td>
                    <td className="table-cell text-right text-green-700 dark:text-green-300">{formatCurrency(empReport.totals.total, cur)}</td>
                    <td className="table-cell" colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
        {reportType === 'employees' && !empReport && (
          <div className="card p-12 text-center text-gray-400 dark:text-slate-500">
            <UserCheck size={36} className="mx-auto mb-3 opacity-30" />
            <p>Selecciona un perÃ­odo para ver el reporte de empleados</p>
          </div>
        )}
      </div>
    </div>
  )
}

