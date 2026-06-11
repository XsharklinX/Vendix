import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { verifyBusiness } from '../lib/verifyBusiness'
import { sendEmail } from '../lib/email'
import { buildInvoiceHtml } from '../lib/invoiceHtml'
import { logAudit } from '../lib/audit'
import { logger } from '../lib/logger'

const router = Router({ mergeParams: true })
router.use(authMiddleware)

function calcSubtotal(items: Array<{ quantity: number; price: number }>) {
  return items.reduce((sum, item) => sum + item.quantity * item.price, 0)
}

async function getBusinessOr403(businessId: string, userId: string) {
  if (!await verifyBusiness(businessId, userId)) return null
  return prisma.business.findUnique({ where: { id: businessId } })
}

async function nextInvoiceNumber(businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business) throw new Error('Negocio no encontrado')
  const invoiceNumber = `${business.invoicePrefix || 'FAC'}-${String(business.invoiceSequence).padStart(6, '0')}`
  await prisma.business.update({
    where: { id: businessId },
    data: { invoiceSequence: business.invoiceSequence + 1 },
  })
  return { invoiceNumber, next: business.invoiceSequence + 1 }
}

router.post('/next-number', async (req: AuthRequest, res) => {
  try {
    const { businessId } = req.params
    const business = await getBusinessOr403(businessId, req.userId!)
    if (!business) return res.status(403).json({ error: 'Acceso denegado' })
    const result = await nextInvoiceNumber(businessId)
    return res.json(result)
  } catch (e) {
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/transactions/:transactionId/html', async (req: AuthRequest, res) => {
  try {
    const { businessId, transactionId } = req.params
    const business = await getBusinessOr403(businessId, req.userId!)
    if (!business) return res.status(403).json({ error: 'Acceso denegado' })

    const tx = await prisma.transaction.findFirst({
      where: { id: transactionId, businessId, type: 'SALE' },
      include: { items: true, client: true },
    })
    if (!tx) return res.status(404).json({ error: 'Venta no encontrada' })

    const invoiceNumber = (req.query.invoiceNumber as string) || `${business.invoicePrefix}-${String(business.invoiceSequence).padStart(6, '0')}`
    const template = (req.query.template as string) || business.invoiceTemplate
    const subtotal = calcSubtotal(tx.items)
    const html = buildInvoiceHtml({
      invoiceNumber,
      ncfNumber: tx.ncfNumber,
      date: tx.createdAt,
      template,
      business,
      client: tx.client,
      items: tx.items.map(item => ({ name: item.name, quantity: item.quantity, price: item.price, total: item.quantity * item.price })),
      subtotal,
      discountAmount: tx.discountValue,
      taxAmount: tx.taxAmount,
      total: tx.amount,
      status: tx.status,
      notes: tx.description,
    })
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.send(html)
  } catch (e) {
    logger.error({ err: e }, '[invoicing] transaction html')
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/transactions/:transactionId/email', async (req: AuthRequest, res) => {
  try {
    const { businessId, transactionId } = req.params
    const business = await getBusinessOr403(businessId, req.userId!)
    if (!business) return res.status(403).json({ error: 'Acceso denegado' })

    const { to, template, invoiceNumber, message } = z.object({
      to: z.string().email().optional(),
      template: z.enum(['classic', 'modern', 'thermal']).optional(),
      invoiceNumber: z.string().optional(),
      message: z.string().optional(),
    }).parse(req.body)

    const tx = await prisma.transaction.findFirst({
      where: { id: transactionId, businessId, type: 'SALE' },
      include: { items: true, client: true },
    })
    if (!tx) return res.status(404).json({ error: 'Venta no encontrada' })
    const recipient = to || tx.client?.email
    if (!recipient) return res.status(400).json({ error: 'El cliente no tiene email' })

    const number = invoiceNumber || (await nextInvoiceNumber(businessId)).invoiceNumber
    const subtotal = calcSubtotal(tx.items)
    const invoiceHtml = buildInvoiceHtml({
      invoiceNumber: number,
      ncfNumber: tx.ncfNumber,
      date: tx.createdAt,
      template: template || business.invoiceTemplate,
      business,
      client: tx.client,
      items: tx.items.map(item => ({ name: item.name, quantity: item.quantity, price: item.price, total: item.quantity * item.price })),
      subtotal,
      discountAmount: tx.discountValue,
      taxAmount: tx.taxAmount,
      total: tx.amount,
      status: tx.status,
      notes: tx.description,
    })

    await sendEmail({
      to: recipient,
      subject: `Factura ${number} - ${business.name}`,
      html: `<p>${message || 'Adjuntamos tu factura de compra.'}</p><p>Total: <strong>${business.currency} ${tx.amount.toFixed(2)}</strong></p>`,
      attachments: [{ filename: `factura-${number}.html`, content: Buffer.from(invoiceHtml, 'utf8') }],
    })
    logAudit(req, businessId, 'SEND', 'INVOICE', transactionId, { to: recipient, invoiceNumber: number })
    return res.json({ ok: true, invoiceNumber: number, to: recipient })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    logger.error({ err: e }, '[invoicing] transaction email')
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/quotes/:quoteId/email', async (req: AuthRequest, res) => {
  try {
    const { businessId, quoteId } = req.params
    const business = await getBusinessOr403(businessId, req.userId!)
    if (!business) return res.status(403).json({ error: 'Acceso denegado' })

    const { to, template, message } = z.object({
      to: z.string().email().optional(),
      template: z.enum(['classic', 'modern', 'thermal']).optional(),
      message: z.string().optional(),
    }).parse(req.body)

    const quote = await prisma.quote.findFirst({ where: { id: quoteId, businessId }, include: { items: true, client: true } })
    if (!quote) return res.status(404).json({ error: 'Cotización no encontrada' })
    const recipient = to || quote.client?.email
    if (!recipient) return res.status(400).json({ error: 'El cliente no tiene email' })

    const html = buildInvoiceHtml({
      title: 'COTIZACION',
      invoiceNumber: `COT-${String(quote.number).padStart(6, '0')}`,
      date: quote.createdAt,
      template: template || business.invoiceTemplate,
      business,
      client: quote.client,
      items: quote.items.map(item => ({ name: item.name, quantity: item.quantity, price: item.price, total: item.quantity * item.price })),
      subtotal: quote.total,
      taxAmount: 0,
      total: quote.total,
      status: quote.status,
      notes: quote.notes,
    })

    await sendEmail({
      to: recipient,
      subject: `Cotización ${quote.number} - ${business.name}`,
      html: `<p>${message || 'Adjuntamos la cotización solicitada.'}</p><p>Total: <strong>${business.currency} ${quote.total.toFixed(2)}</strong></p>`,
      attachments: [{ filename: `cotizacion-${quote.number}.html`, content: Buffer.from(html, 'utf8') }],
    })
    logAudit(req, businessId, 'SEND', 'QUOTE', quoteId, { to: recipient })
    return res.json({ ok: true, to: recipient })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/clients/:clientId/statement/html', async (req: AuthRequest, res) => {
  try {
    const { businessId, clientId } = req.params
    const business = await getBusinessOr403(businessId, req.userId!)
    if (!business) return res.status(403).json({ error: 'Acceso denegado' })

    const client = await prisma.client.findFirst({ where: { id: clientId, businessId } })
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' })
    const transactions = await prisma.transaction.findMany({
      where: { businessId, clientId, type: 'SALE' },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
    const pending = transactions.filter(tx => tx.status === 'PENDING')
    const totalPending = pending.reduce((sum, tx) => sum + tx.amount, 0)
    const rows = transactions.map(tx => `
      <tr><td>${tx.createdAt.toLocaleDateString('es-DO')}</td><td>${tx.description || 'Venta'}</td><td>${tx.status}</td><td class="r">${business.currency} ${tx.amount.toFixed(2)}</td></tr>
    `).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Estado de cuenta</title>
      <style>body{font-family:Arial;padding:34px;color:#111827}.r{text-align:right}table{width:100%;border-collapse:collapse}th{background:#1e3a8a;color:white;text-align:left;padding:8px}td{border-bottom:1px solid #e5e7eb;padding:8px}.total{font-size:22px;font-weight:900;color:#b91c1c}</style>
      </head><body><h1>${business.name}</h1><h2>Estado de cuenta</h2><p>Cliente: <strong>${client.name}</strong></p><p class="total">Pendiente: ${business.currency} ${totalPending.toFixed(2)}</p>
      <table><thead><tr><th>Fecha</th><th>Concepto</th><th>Estado</th><th class="r">Monto</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.send(html)
  } catch (e) {
    logger.error({ err: e }, '[invoicing] statement html')
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/clients/:clientId/statement/email', async (req: AuthRequest, res) => {
  try {
    const { businessId, clientId } = req.params
    const business = await getBusinessOr403(businessId, req.userId!)
    if (!business) return res.status(403).json({ error: 'Acceso denegado' })
    const { to } = z.object({ to: z.string().email().optional() }).parse(req.body)
    const client = await prisma.client.findFirst({ where: { id: clientId, businessId } })
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' })
    const recipient = to || client.email
    if (!recipient) return res.status(400).json({ error: 'El cliente no tiene email' })

    const transactions = await prisma.transaction.findMany({ where: { businessId, clientId, type: 'SALE' }, orderBy: { createdAt: 'desc' }, take: 300 })
    const totalPending = transactions.filter(t => t.status === 'PENDING').reduce((sum, tx) => sum + tx.amount, 0)
    const rows = transactions.map(tx => `<tr><td>${tx.createdAt.toLocaleDateString('es-DO')}</td><td>${tx.status}</td><td>${business.currency} ${tx.amount.toFixed(2)}</td></tr>`).join('')
    const statementHtml = `<html><body><h1>Estado de cuenta - ${client.name}</h1><p>Pendiente: ${business.currency} ${totalPending.toFixed(2)}</p><table>${rows}</table></body></html>`
    await sendEmail({
      to: recipient,
      subject: `Estado de cuenta - ${business.name}`,
      html: `<p>Adjuntamos tu estado de cuenta.</p><p>Pendiente: <strong>${business.currency} ${totalPending.toFixed(2)}</strong></p>`,
      attachments: [{ filename: `estado-cuenta-${client.name.replace(/\s+/g, '-')}.html`, content: Buffer.from(statementHtml, 'utf8') }],
    })
    logAudit(req, businessId, 'SEND', 'CLIENT_STATEMENT', clientId, { to: recipient })
    return res.json({ ok: true, to: recipient })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    return res.status(500).json({ error: 'Error interno' })
  }
})

export default router
