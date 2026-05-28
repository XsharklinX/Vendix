import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import swaggerUi from 'swagger-ui-express'

import authRouter from './routes/auth'
import businessRouter from './routes/business'
import productsRouter from './routes/products'
import clientsRouter from './routes/clients'
import suppliersRouter from './routes/suppliers'
import employeesRouter from './routes/employees'
import transactionsRouter from './routes/transactions'
import quotesRouter from './routes/quotes'
import statsRouter from './routes/stats'
import notificationsRouter from './routes/notifications'
import auditRouter from './routes/audit'
import aiRouter from './routes/ai'
import { authLimiter, apiLimiter } from './middleware/rateLimiter'
import { swaggerSpec } from './lib/swagger'
import { startBackupScheduler } from './lib/backupScheduler'

const app = express()
const PORT = process.env.PORT || 3001

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5173', 'http://localhost:3001']

app.use(cors({ origin: allowedOrigins, credentials: true }))

app.use(express.json())
app.use(apiLimiter)

// ── API Docs ──────────────────────────────────────────────────────────────────
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

// ── Business-scoped routes ────────────────────────────────────────────────────
const bizRoutes = express.Router({ mergeParams: true })
bizRoutes.use('/products', productsRouter)
bizRoutes.use('/clients', clientsRouter)
bizRoutes.use('/suppliers', suppliersRouter)
bizRoutes.use('/employees', employeesRouter)
bizRoutes.use('/transactions', transactionsRouter)
bizRoutes.use('/quotes', quotesRouter)
bizRoutes.use('/stats', statsRouter)
bizRoutes.use('/audit', auditRouter)
bizRoutes.use('/ai', aiRouter)

app.use('/api/businesses/:businessId', bizRoutes)

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date() }))

// ── Serve frontend in desktop mode ────────────────────────────────────────────
const frontendDist = process.env.FRONTEND_DIST
if (frontendDist && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist))
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendDist, 'index.html'))
    }
  })
}

app.listen(PORT, () => {
  console.log(`\n🚀 Vendix API → http://localhost:${PORT}`)
  console.log(`📚 API Docs  → http://localhost:${PORT}/api/docs`)
  startBackupScheduler()
})
