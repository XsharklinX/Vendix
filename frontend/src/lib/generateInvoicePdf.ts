export interface InvoiceData {
  invoiceNumber: string
  date: string
  businessName: string
  businessAddress?: string
  businessPhone?: string
  businessEmail?: string
  businessTaxId?: string
  logoUrl?: string
  currency: string
  clientName?: string
  clientPhone?: string
  clientEmail?: string
  ncfNumber?: string
  items: { name: string; qty: number; unitPrice: number; total: number }[]
  subtotal: number
  discountAmt: number
  discountLabel?: string
  taxName: string
  taxAmount: number
  total: number
  paymentMethod: string
  status: 'COMPLETED' | 'PENDING'
  notes?: string
  template?: 'classic' | 'modern' | 'thermal'
}

const fmt = (n: number, cur: string) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(n)

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia',
}

export function generateInvoicePdf(data: InvoiceData) {
  const win = window.open('', '_blank', 'width=800,height=900')
  if (!win) return
  const template = data.template ?? 'classic'

  const rows = data.items.map(i => `
    <tr>
      <td>${i.name}</td>
      <td class="num">${i.qty}</td>
      <td class="num">${fmt(i.unitPrice, data.currency)}</td>
      <td class="num">${fmt(i.total, data.currency)}</td>
    </tr>
  `).join('')

  win.document.write(`<!DOCTYPE html><html lang="es"><head>
    <meta charset="utf-8">
    <title>Factura ${data.invoiceNumber}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1e293b; background: ${template === 'modern' ? '#f8fafc' : '#fff'}; padding: 32px; max-width: ${template === 'thermal' ? '340px' : '720px'}; margin: 0 auto; }
      body.modern .invoice-meta .num-badge, body.modern .logo-area h1 { color:#0f766e; }
      body.modern .invoice-meta .num-badge { background:#ccfbf1; }
      body.thermal { font-family: Consolas, monospace; font-size: 11px; }
      body.thermal .header, body.thermal .parties { display:block; text-align:center; }
      body.thermal .invoice-meta { text-align:center; margin-top:12px; }
      .brand-logo { max-height: 64px; max-width: 160px; object-fit: contain; margin-bottom: 8px; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
      .logo-area h1 { font-size: 26px; font-weight: 800; color: #2563eb; letter-spacing: -0.5px; }
      .logo-area p { color: #64748b; font-size: 12px; margin-top: 2px; }
      .invoice-meta { text-align: right; }
      .invoice-meta h2 { font-size: 22px; font-weight: 700; color: #1e293b; }
      .invoice-meta .num-badge { background: #eff6ff; color: #2563eb; font-weight: 700; font-size: 13px; padding: 3px 10px; border-radius: 6px; display: inline-block; margin-top: 4px; }
      .invoice-meta p { color: #64748b; font-size: 12px; margin-top: 4px; }
      .divider { border: none; border-top: 2px solid #e2e8f0; margin: 20px 0; }
      .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
      .party h3 { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
      .party p { font-size: 13px; color: #1e293b; line-height: 1.6; }
      .party .biz-name { font-weight: 700; font-size: 15px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      thead tr { background: #f8fafc; }
      th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }
      td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      .totals { margin-left: auto; width: 260px; }
      .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #475569; }
      .totals-row.discount { color: #f59e0b; }
      .totals-row.total-final { border-top: 2px solid #e2e8f0; margin-top: 6px; padding-top: 10px; font-size: 18px; font-weight: 800; color: #1e293b; }
      .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
      .payment-badge { background: #f0fdf4; color: #16a34a; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 6px; }
      .fiado-badge { background: #fefce8; color: #ca8a04; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 6px; }
      .ncf { background: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px; display: inline-block; margin-bottom: 8px; }
      .powered { color: #cbd5e1; font-size: 11px; }
      @media print { body { padding: 16px; } @page { margin: 0; size: A4; } }
    </style>
  </head><body class="${template}">
    <div class="header">
      <div class="logo-area">
        ${data.logoUrl ? `<img class="brand-logo" src="${data.logoUrl}" alt="Logo">` : ''}
        <h1>${data.businessName}</h1>
        ${data.businessAddress ? `<p>${data.businessAddress}</p>` : ''}
        ${data.businessPhone ? `<p>Tel: ${data.businessPhone}</p>` : ''}
        ${data.businessEmail ? `<p>${data.businessEmail}</p>` : ''}
        ${data.businessTaxId ? `<p>RNC: ${data.businessTaxId}</p>` : ''}
      </div>
      <div class="invoice-meta">
        <h2>FACTURA</h2>
        <div class="num-badge">#${data.invoiceNumber}</div>
        <p>Fecha: ${data.date}</p>
      </div>
    </div>

    ${data.ncfNumber ? `<div class="ncf">NCF: ${data.ncfNumber}</div>` : ''}

    <div class="parties">
      <div class="party">
        <h3>Emisor</h3>
        <p class="biz-name">${data.businessName}</p>
      </div>
      ${data.clientName ? `
      <div class="party">
        <h3>Cliente</h3>
        <p class="biz-name">${data.clientName}</p>
        ${data.clientPhone ? `<p>${data.clientPhone}</p>` : ''}
        ${data.clientEmail ? `<p>${data.clientEmail}</p>` : ''}
      </div>` : ''}
    </div>

    <hr class="divider">

    <table>
      <thead>
        <tr>
          <th>Descripción</th>
          <th class="num">Cant.</th>
          <th class="num">Precio</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="totals-row"><span>Subtotal</span><span>${fmt(data.subtotal, data.currency)}</span></div>
      ${data.discountAmt > 0 ? `<div class="totals-row discount"><span>Descuento ${data.discountLabel || ''}</span><span>-${fmt(data.discountAmt, data.currency)}</span></div>` : ''}
      ${data.taxAmount > 0 ? `<div class="totals-row"><span>${data.taxName}</span><span>${fmt(data.taxAmount, data.currency)}</span></div>` : ''}
      <div class="totals-row total-final"><span>TOTAL</span><span>${fmt(data.total, data.currency)}</span></div>
    </div>

    <div class="footer">
      <div>
        <span class="${data.status === 'PENDING' ? 'fiado-badge' : 'payment-badge'}">
          ${data.status === 'PENDING' ? 'AL FIADO' : PAYMENT_LABELS[data.paymentMethod] || data.paymentMethod}
        </span>
        ${data.notes ? `<p style="color:#64748b;font-size:12px;margin-top:6px">${data.notes}</p>` : ''}
      </div>
      <span class="powered">Powered by Vendix</span>
    </div>
  </body></html>`)

  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 400)
}
