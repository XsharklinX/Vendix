import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import swaggerUi from 'swagger-ui-express'

import { logger } from './lib/logger'
import { prisma } from './lib/prisma'
import authRouter from './routes/auth'
import businessRouter from './routes/business'
import productsRouter from './routes/products'
import clientsRouter from './routes/clients'
import suppliersRouter from './routes/suppliers'
import employeesRouter from './routes/employees'
import purchaseOrdersRouter from './routes/purchaseOrders'
import transactionsRouter from './routes/transactions'
import quotesRouter from './routes/quotes'
import statsRouter from './routes/stats'
import notificationsRouter from './routes/notifications'
import auditRouter from './routes/audit'
import invoicingRouter from './routes/invoicing'
import supportRouter from './routes/support'
import cloudRouter from './routes/cloud'
import licenseRouter from './routes/license'
import { authLimiter, apiLimiter } from './middleware/rateLimiter'
import { swaggerSpec } from './lib/swagger'
import { getSyncWorkerState, runSyncOnce, startSyncWorker } from './lib/syncWorker'

const app = express()
const startedAt = new Date()

app.use((req, res, next) => {
  const requestId = req.header('x-request-id') || randomUUID()
  const started = Date.now()
  res.setHeader('X-Request-Id', requestId)

  res.on('finish', () => {
    if (res.statusCode >= 500) {
      logger.error({
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
      }, '[http] server error')
    }
  })

  next()
})

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5173', 'http://localhost:3100']

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // 'unsafe-inline' en estilos: recharts y otros componentes usan el atributo style.
      styleSrc: ["'self'", "'unsafe-inline'"],
      // https: para logos de negocio cargados desde URLs externas en Configuraciones.
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'self'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}))

app.use(cors({ origin: allowedOrigins, credentials: true }))

app.use(express.json({ limit: '5mb' }))
app.use(apiLimiter)

// ── API Docs ──────────────────────────────────────────────────────────────────
// Swagger UI inyecta scripts/estilos inline para arrancar — relajar la CSP solo aquí.
app.use('/api/docs', (_req, res, next) => {
  res.removeHeader('Content-Security-Policy')
  next()
})
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Vendix API Docs',
  customCss: '.swagger-ui .topbar { display: none }',
}))
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec))

// ── Auth ──────────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRouter)

// ── Global routes ─────────────────────────────────────────────────────────────
app.use('/api/notifications', notificationsRouter)
app.use('/api/businesses', businessRouter)
app.use('/api/support', supportRouter)
app.use('/api/cloud', cloudRouter)
app.use('/api/license', licenseRouter)

// ── Business-scoped routes ────────────────────────────────────────────────────
const bizRoutes = express.Router({ mergeParams: true })
bizRoutes.use('/products', productsRouter)
bizRoutes.use('/clients', clientsRouter)
bizRoutes.use('/suppliers', suppliersRouter)
bizRoutes.use('/employees', employeesRouter)
bizRoutes.use('/purchase-orders', purchaseOrdersRouter)
bizRoutes.use('/transactions', transactionsRouter)
bizRoutes.use('/quotes', quotesRouter)
bizRoutes.use('/stats', statsRouter)
bizRoutes.use('/audit', auditRouter)
bizRoutes.use('/invoicing', invoicingRouter)

app.use('/api/businesses/:businessId', bizRoutes)

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date() }))

app.get('/api/system/status', (_req, res) => {
  res.json({
    ok: true,
    appVersion: process.env.APP_VERSION || process.env.npm_package_version || 'development',
    environment: process.env.NODE_ENV || 'development',
    startedAt,
    updatedAt: process.env.APP_UPDATED_AT || null,
    userDataPath: process.env.APP_USER_DATA_PATH || null,
    databasePath: process.env.APP_DB_PATH || process.env.DATABASE_URL?.replace(/^file:/, '') || null,
    frontendDist: process.env.FRONTEND_DIST || null,
  })
})

app.get('/api/system/sync-worker', (_req, res) => {
  res.json(getSyncWorkerState())
})

app.post('/api/system/sync-worker/run', async (_req, res) => {
  const state = await runSyncOnce()
  res.json(state)
})

app.post('/api/system/sync-worker/reload', (_req, res) => {
  startSyncWorker()
  res.json(getSyncWorkerState())
})

// ── Serve frontend in desktop mode ────────────────────────────────────────────
app.get('/api/system/database/check', async (_req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, string>>>('PRAGMA integrity_check')
    const messages = rows.flatMap(row => Object.values(row)).filter(Boolean)
    const ok = messages.length === 1 && messages[0].toLowerCase() === 'ok'

    return res.json({
      ok,
      checkedAt: new Date().toISOString(),
      messages: messages.length ? messages : ['Sin respuesta de SQLite'],
    })
  } catch (err) {
    logger.error({ err }, '[system] database check')
    return res.status(500).json({ ok: false, error: 'No se pudo validar la base de datos' })
  }
})

app.post('/api/system/database/repair', async (_req, res) => {
  try {
    const before = await prisma.$queryRawUnsafe<Array<Record<string, string>>>('PRAGMA integrity_check')
    const beforeMessages = before.flatMap(row => Object.values(row)).filter(Boolean)
    const beforeOk = beforeMessages.length === 1 && beforeMessages[0].toLowerCase() === 'ok'

    await prisma.$executeRawUnsafe('PRAGMA optimize')
    await prisma.$executeRawUnsafe('REINDEX')
    await prisma.$executeRawUnsafe('VACUUM')

    const after = await prisma.$queryRawUnsafe<Array<Record<string, string>>>('PRAGMA integrity_check')
    const afterMessages = after.flatMap(row => Object.values(row)).filter(Boolean)
    const afterOk = afterMessages.length === 1 && afterMessages[0].toLowerCase() === 'ok'

    return res.json({
      ok: afterOk,
      repairedAt: new Date().toISOString(),
      actions: ['PRAGMA optimize', 'REINDEX', 'VACUUM'],
      before: beforeMessages.length ? beforeMessages : ['Sin respuesta de SQLite'],
      after: afterMessages.length ? afterMessages : ['Sin respuesta de SQLite'],
      requiredRestore: !afterOk,
      wasHealthyBeforeRepair: beforeOk,
    })
  } catch (err) {
    logger.error({ err }, '[system] database repair')
    return res.status(500).json({ ok: false, error: 'No se pudo ejecutar la reparacion basica' })
  }
})

const frontendDist = process.env.FRONTEND_DIST
if (frontendDist && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist))
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendDist, 'index.html'))
    }
  })
}

// ── Manejador de errores global ───────────────────────────────────────────────
// Red de seguridad para errores no atrapados en rutas/middlewares: evita que
// Express devuelva el stack trace por defecto y mantiene el proceso vivo.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, '[app] error no controlado')
  if (res.headersSent) return
  res.status(500).json({ error: 'Error interno' })
})

export default app
