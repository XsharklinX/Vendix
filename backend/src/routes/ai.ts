import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { verifyBusiness } from '../lib/verifyBusiness'
import { logger } from '../lib/logger'
import { encrypt, decrypt } from '../lib/crypto'

const router = Router({ mergeParams: true })
router.use(authMiddleware)

const PROVIDER_URLS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
}

const DEFAULT_MODELS: Record<string, string> = {
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-4o-mini',
  openrouter: 'google/gemini-flash-1.5',
  xai: 'grok-3-mini',
}

const settingsSchema = z.object({
  apiKey: z.string().optional(),
  provider: z.enum(['groq', 'openai', 'openrouter', 'xai']).optional(),
  model: z.string().max(100).optional().nullable(),
})

// Devuelve la configuración guardada SIN exponer la API key (solo si hay una configurada).
router.get('/settings', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { aiProvider: true, aiModel: true, aiApiKeyEnc: true },
  })

  return res.json({
    provider: business?.aiProvider ?? 'groq',
    model: business?.aiModel ?? '',
    hasApiKey: !!business?.aiApiKeyEnc,
  })
})

// Guarda la configuración del proveedor de IA. La API key se cifra antes de
// persistirse; nunca se devuelve en texto plano.
router.put('/settings', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  try {
    const parsed = settingsSchema.parse(req.body)
    const data: { aiProvider?: string; aiModel?: string | null; aiApiKeyEnc?: string | null } = {}

    if (parsed.provider !== undefined) data.aiProvider = parsed.provider
    if (parsed.model !== undefined) data.aiModel = parsed.model
    if (parsed.apiKey !== undefined) {
      data.aiApiKeyEnc = parsed.apiKey.trim() ? encrypt(parsed.apiKey.trim()) : null
    }

    await prisma.business.update({ where: { id: businessId }, data })
    return res.json({ ok: true })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
    logger.error({ err: e }, '[ai] PUT /settings')
    return res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/chat', async (req: AuthRequest, res) => {
  const { businessId } = req.params
  if (!await verifyBusiness(businessId, req.userId!))
    return res.status(403).json({ error: 'Acceso denegado' })

  const { message } = req.body

  if (!message?.trim()) return res.status(400).json({ error: 'Mensaje requerido' })
  if (message.length > 1000) return res.status(400).json({ error: 'El mensaje es demasiado largo' })

  const aiSettings = await prisma.business.findUnique({
    where: { id: businessId },
    select: { aiApiKeyEnc: true, aiProvider: true, aiModel: true },
  })

  if (!aiSettings?.aiApiKeyEnc) {
    return res.status(400).json({ error: 'Configura tu API key del asistente de IA primero' })
  }

  const apiKey = decrypt(aiSettings.aiApiKeyEnc)
  if (!apiKey) return res.status(500).json({ error: 'No se pudo leer la API key configurada' })

  const provider = aiSettings.aiProvider || 'groq'
  const model = aiSettings.aiModel || undefined

  const apiUrl = PROVIDER_URLS[provider]
  if (!apiUrl) return res.status(400).json({ error: 'Proveedor no soportado' })

  // Build business context (last 30 days)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, currency: true, taxName: true, lowStockThreshold: true },
  })
  const lowStockThreshold = business?.lowStockThreshold ?? 5

  const [todaySales, monthSales, monthExpenses, topProducts, lowStock, pendingDebts] = await Promise.all([
    prisma.transaction.aggregate({
      where: { businessId, type: 'SALE', status: 'COMPLETED', createdAt: { gte: todayStart } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.transaction.aggregate({
      where: { businessId, type: 'SALE', status: 'COMPLETED', createdAt: { gte: monthStart } },
      _sum: { amount: true, taxAmount: true }, _count: true,
    }),
    prisma.transaction.aggregate({
      where: { businessId, type: { in: ['EXPENSE', 'PURCHASE'] }, status: 'COMPLETED', createdAt: { gte: monthStart } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.transactionItem.groupBy({
      by: ['name'],
      where: { transaction: { businessId, type: 'SALE', status: 'COMPLETED', createdAt: { gte: monthStart } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    }),
    prisma.product.count({
      where: { businessId, quantity: { lte: lowStockThreshold } },
    }).catch(() => 0),
    prisma.transaction.aggregate({
      where: { businessId, type: 'SALE', status: 'PENDING' },
      _sum: { amount: true }, _count: true,
    }),
  ])

  const monthSalesTotal = monthSales._sum.amount ?? 0
  const monthExpensesTotal = monthExpenses._sum.amount ?? 0
  const monthProfit = monthSalesTotal - monthExpensesTotal
  const cur = business?.currency ?? 'DOP'

  const systemPrompt = `Eres un asistente de negocios inteligente para ${business?.name ?? 'este negocio'}.
Tienes acceso a los datos reales del negocio y debes responder en español de forma concisa y útil.
Usa siempre la moneda ${cur}.

=== DATOS DEL NEGOCIO (${now.toLocaleDateString('es-DO')}) ===

VENTAS HOY:
- Total: ${cur} ${(todaySales._sum.amount ?? 0).toFixed(2)}
- Transacciones: ${todaySales._count}

ESTE MES (${now.toLocaleString('es-DO', { month: 'long' })}):
- Ventas brutas: ${cur} ${monthSalesTotal.toFixed(2)} (${monthSales._count} ventas)
- ${business?.taxName ?? 'ITBIS'} recaudado: ${cur} ${(monthSales._sum.taxAmount ?? 0).toFixed(2)}
- Gastos/Compras: ${cur} ${monthExpensesTotal.toFixed(2)} (${monthExpenses._count} transacciones)
- Utilidad estimada: ${cur} ${monthProfit.toFixed(2)}

PRODUCTOS MÁS VENDIDOS (este mes):
${topProducts.map((p, i) => `${i + 1}. ${p.name} — ${p._sum.quantity ?? 0} unidades`).join('\n')}

ALERTAS:
- Productos con stock bajo (≤${lowStockThreshold} unidades): ${lowStock}
- Deudas pendientes de clientes: ${cur} ${(pendingDebts._sum.amount ?? 0).toFixed(2)} (${pendingDebts._count} ventas)

Responde de forma directa. Si te preguntan algo que no está en estos datos, indícalo claramente. No inventes cifras.`

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://vendix.app', 'X-Title': 'Vendix' } : {}),
      },
      body: JSON.stringify({
        model: model ?? DEFAULT_MODELS[provider],
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return res.status(502).json({ error: `Error del proveedor de IA: ${response.status}`, detail: errText })
    }

    const data = await response.json() as { choices?: { message?: { content?: string } }[] }
    const reply = data.choices?.[0]?.message?.content ?? 'Sin respuesta del modelo.'

    return res.json({ reply })
  } catch (err) {
    logger.error({ err }, '[AI chat error]')
    return res.status(500).json({ error: 'Error al conectar con el proveedor de IA' })
  }
})

export default router
