type InvoiceItem = {
  name: string
  quantity: number
  price: number
  total: number
}

export type InvoiceHtmlData = {
  title?: string
  invoiceNumber: string
  ncfNumber?: string | null
  date: Date | string
  template?: string
  business: {
    name: string
    address?: string | null
    city?: string | null
    phone?: string | null
    email?: string | null
    taxId?: string | null
    logoUrl?: string | null
    currency: string
    taxName?: string | null
  }
  client?: {
    name: string
    phone?: string | null
    email?: string | null
    document?: string | null
    address?: string | null
  } | null
  items: InvoiceItem[]
  subtotal: number
  discountAmount?: number
  taxAmount: number
  total: number
  status?: string
  notes?: string | null
}

const esc = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

function fmt(value: number, currency: string) {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value || 0)
}

function templateCss(template: string) {
  if (template === 'thermal') {
    return `
      body{font-family:Consolas,monospace;max-width:340px;margin:0 auto;padding:18px;color:#111827}
      .top{text-align:center;border-bottom:1px dashed #111;padding-bottom:10px}.logo{max-height:48px;margin-bottom:6px}
      h1{font-size:18px;margin:0}.meta,.muted{font-size:11px;color:#4b5563}.grid{display:block}.box{margin:10px 0}
      table{width:100%;border-collapse:collapse;font-size:11px}th{border-bottom:1px dashed #111;text-align:left;padding:5px 0}td{padding:5px 0;border-bottom:1px dotted #ddd}.r{text-align:right}
      .totals{margin-top:10px}.line{display:flex;justify-content:space-between;font-size:12px;padding:3px 0}.grand{font-size:16px;font-weight:800;border-top:1px dashed #111;margin-top:6px;padding-top:6px}
      @media print{@page{size:80mm auto;margin:0}body{padding:8px}}
    `
  }
  if (template === 'modern') {
    return `
      body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:0;padding:42px;color:#0f172a;background:#f8fafc}
      .sheet{background:#fff;max-width:780px;margin:0 auto;border-radius:22px;padding:34px;box-shadow:0 24px 70px rgba(15,23,42,.12)}
      .top{display:flex;justify-content:space-between;gap:24px;border-bottom:4px solid #14b8a6;padding-bottom:22px}.logo{max-height:70px;max-width:160px;object-fit:contain}
      h1{font-size:30px;margin:0;color:#0f766e}.badge{background:#ccfbf1;color:#0f766e;border-radius:999px;padding:6px 12px;font-weight:800;display:inline-block}
      .meta,.muted{color:#64748b;font-size:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:24px 0}.box{background:#f8fafc;border-radius:16px;padding:16px}
      table{width:100%;border-collapse:collapse}th{background:#0f766e;color:white;text-align:left;padding:10px;font-size:11px}td{padding:10px;border-bottom:1px solid #e2e8f0}.r{text-align:right}
      .totals{margin-left:auto;width:300px;margin-top:18px}.line{display:flex;justify-content:space-between;padding:7px 0}.grand{font-size:20px;font-weight:900;border-top:2px solid #0f766e;margin-top:8px;padding-top:10px}
      @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0}@page{size:A4;margin:1.2cm}}
    `
  }
  return `
    body{font-family:Segoe UI,Arial,sans-serif;margin:0;padding:34px;color:#1e293b;background:#fff}
    .sheet{max-width:760px;margin:0 auto}.top{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #e2e8f0;padding-bottom:18px}.logo{max-height:64px;max-width:150px;object-fit:contain}
    h1{font-size:28px;margin:0;color:#2563eb}.badge{background:#eff6ff;color:#2563eb;border-radius:8px;padding:5px 11px;font-weight:800;display:inline-block}
    .meta,.muted{color:#64748b;font-size:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:24px 0}.box{border:1px solid #e2e8f0;border-radius:12px;padding:14px}
    table{width:100%;border-collapse:collapse}th{background:#f8fafc;color:#64748b;text-align:left;padding:10px;font-size:11px;text-transform:uppercase}td{padding:10px;border-bottom:1px solid #f1f5f9}.r{text-align:right}
    .totals{margin-left:auto;width:300px;margin-top:18px}.line{display:flex;justify-content:space-between;padding:7px 0}.grand{font-size:20px;font-weight:900;border-top:2px solid #e2e8f0;margin-top:8px;padding-top:10px}
    @media print{@page{size:A4;margin:1.2cm}body{padding:0}}
  `
}

export function buildInvoiceHtml(data: InvoiceHtmlData) {
  const template = data.template || 'classic'
  const currency = data.business.currency || 'DOP'
  const date = typeof data.date === 'string' ? new Date(data.date) : data.date
  const rows = data.items.map(item => `
    <tr>
      <td>${esc(item.name)}</td>
      <td class="r">${item.quantity}</td>
      <td class="r">${fmt(item.price, currency)}</td>
      <td class="r">${fmt(item.total, currency)}</td>
    </tr>
  `).join('')

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${esc(data.title || `Factura ${data.invoiceNumber}`)}</title>
  <style>${templateCss(template)}</style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div>
        ${data.business.logoUrl ? `<img class="logo" src="${esc(data.business.logoUrl)}" alt="Logo">` : ''}
        <h1>${esc(data.business.name)}</h1>
        <div class="meta">
          ${[data.business.address, data.business.city].filter(Boolean).map(esc).join(' · ')}<br>
          ${data.business.phone ? `Tel: ${esc(data.business.phone)}<br>` : ''}
          ${data.business.email ? `${esc(data.business.email)}<br>` : ''}
          ${data.business.taxId ? `RNC/ID: ${esc(data.business.taxId)}` : ''}
        </div>
      </div>
      <div style="text-align:right">
        <div class="badge">${esc(data.invoiceNumber)}</div>
        <h2>${esc(data.title || 'FACTURA')}</h2>
        <div class="meta">Fecha: ${date.toLocaleDateString('es-DO')}</div>
        ${data.ncfNumber ? `<div class="meta">NCF: ${esc(data.ncfNumber)}</div>` : ''}
        ${data.status ? `<div class="meta">Estado: ${esc(data.status)}</div>` : ''}
      </div>
    </div>

    <div class="grid">
      <div class="box">
        <strong>Emisor</strong>
        <div class="muted">${esc(data.business.name)}</div>
      </div>
      <div class="box">
        <strong>Cliente</strong>
        <div>${esc(data.client?.name || 'Consumidor final')}</div>
        <div class="muted">
          ${data.client?.document ? `Doc: ${esc(data.client.document)}<br>` : ''}
          ${data.client?.phone ? `Tel: ${esc(data.client.phone)}<br>` : ''}
          ${data.client?.email ? esc(data.client.email) : ''}
        </div>
      </div>
    </div>

    <table>
      <thead><tr><th>Descripcion</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="line"><span>Subtotal</span><strong>${fmt(data.subtotal, currency)}</strong></div>
      ${(data.discountAmount ?? 0) > 0 ? `<div class="line"><span>Descuento</span><strong>-${fmt(data.discountAmount ?? 0, currency)}</strong></div>` : ''}
      ${data.taxAmount > 0 ? `<div class="line"><span>${esc(data.business.taxName || 'Impuesto')}</span><strong>${fmt(data.taxAmount, currency)}</strong></div>` : ''}
      <div class="line grand"><span>Total</span><span>${fmt(data.total, currency)}</span></div>
    </div>

    ${data.notes ? `<p class="muted">${esc(data.notes)}</p>` : ''}
    <p class="muted" style="margin-top:28px">Powered by Vendix</p>
  </div>
</body>
</html>`
}
