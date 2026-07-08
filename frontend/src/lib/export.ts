// Genera y descarga un archivo CSV desde un array de objetos
export function exportCSV(filename: string, rows: Record<string, unknown>[], columns: { key: string; label: string }[]) {
  const header = columns.map(c => `"${c.label}"`).join(',')
  const body = rows.map(row =>
    columns.map(c => {
      const val = row[c.key] ?? ''
      return `"${String(val).replace(/"/g, '""')}"`
    }).join(',')
  ).join('\n')

  const bom = '\uFEFF' // BOM para que Excel abra UTF-8 correctamente
  const blob = new Blob([bom + header + '\n' + body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export const EXPORT_COLUMNS = {
  inventario: [
    { key: 'name', label: 'Producto' },
    { key: 'categoryName', label: 'Categoría' },
    { key: 'price', label: 'Precio de Venta' },
    { key: 'cost', label: 'Costo' },
    { key: 'quantity', label: 'Stock' },
    { key: 'profit', label: 'Ganancia Unitaria' },
    { key: 'barcode', label: 'Código de Barras' },
  ],
  clientes: [
    { key: 'name', label: 'Nombre' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Correo' },
    { key: 'document', label: 'Documento' },
    { key: 'address', label: 'Dirección' },
    { key: 'pendingDebt', label: 'Deuda Pendiente' },
  ],
  proveedores: [
    { key: 'name', label: 'Nombre' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Correo' },
    { key: 'document', label: 'Documento' },
    { key: 'address', label: 'Dirección' },
    { key: 'pendingDebt', label: 'Deuda Pendiente' },
  ],
  empleados: [
    { key: 'name', label: 'Nombre' },
    { key: 'role', label: 'Cargo' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Correo' },
    { key: 'salary', label: 'Salario' },
    { key: 'statusLabel', label: 'Estado' },
  ],
  movimientos: [
    { key: 'typeLabel', label: 'Tipo' },
    { key: 'description', label: 'Descripción' },
    { key: 'amount', label: 'Monto' },
    { key: 'paymentMethodLabel', label: 'Método de Pago' },
    { key: 'statusLabel', label: 'Estado' },
    { key: 'contactName', label: 'Cliente / Proveedor' },
    { key: 'date', label: 'Fecha' },
  ],
  cotizaciones: [
    { key: 'number', label: '#' },
    { key: 'concept', label: 'Concepto' },
    { key: 'clientName', label: 'Cliente' },
    { key: 'total', label: 'Total' },
    { key: 'statusLabel', label: 'Estado' },
    { key: 'date', label: 'Fecha' },
  ],
  cuentasCobrar: [
    { key: 'name', label: 'Cliente' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'pendingDebt', label: 'Deuda Pendiente' },
    { key: 'pendingCount', label: 'Ventas Pendientes' },
    { key: 'oldestDebtDays', label: 'Antigüedad (días)' },
  ],
  ordenesCompra: [
    { key: 'orderNumber', label: 'Orden' },
    { key: 'supplierName', label: 'Proveedor' },
    { key: 'status', label: 'Estado' },
    { key: 'total', label: 'Total' },
    { key: 'date', label: 'Fecha' },
  ],
}
