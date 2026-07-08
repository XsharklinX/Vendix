const BASE_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 32px; color: #111827; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #1e40af; color: white; text-align: left; padding: 8px 10px; font-size: 12px; }
  td { border-bottom: 1px solid #e5e7eb; padding: 8px 10px; font-size: 12px; }
  .r { text-align: right; }
  .c { text-align: center; }
  .meta { color: #6b7280; font-size: 12px; margin: 2px 0; }
  .total { font-weight: 800; background: #f3f4f6; }
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb; }
  .hdr-r { text-align: right; }
  .rtitle { font-size: 18px; font-weight: 700; color: #1e40af; }
  .rdate { font-size: 11px; color: #9ca3af; margin-top: 2px; }
  .ftr { margin-top: 24px; text-align: center; font-size: 10px; color: #d1d5db; border-top: 1px solid #f3f4f6; padding-top: 8px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 10px; font-weight: 700; }
  .by { background: #fef9c3; color: #854d0e; }
  @media print { @page { margin: 1.5cm; size: A4; } }
`

function esc(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface PrintOptions {
  title: string
  businessName?: string
  subtitle?: string
  body: string
  css?: string
  autoClose?: boolean
}

export function printDocument({ title, businessName, subtitle, body, css, autoClose = false }: PrintOptions) {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return

  const header = businessName
    ? `<div class="hdr">
        <div><h1>${esc(businessName)}</h1>${subtitle ? `<div class="meta">${esc(subtitle)}</div>` : ''}</div>
        <div class="hdr-r"><div class="rtitle">${esc(title)}</div><div class="rdate">Generado: ${new Date().toLocaleString('es-DO')}</div></div>
       </div>`
    : `<h1>${esc(title)}</h1>`

  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>${BASE_CSS}${css ? '\n' + css : ''}</style></head><body>
    ${header}
    ${body}
    <div class="ftr">Vendix — Sistema de gestión de ventas</div>
  </body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); if (autoClose) win.close() }, 400)
}
