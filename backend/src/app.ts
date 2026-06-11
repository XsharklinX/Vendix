import express from 'express'
import helmet from 'helmet'
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
import purchaseOrdersRouter from './routes/purchaseOrders'
import transactionsRouter from './routes/transactions'
import quotesRouter from './routes/quotes'
import statsRouter from './routes/stats'
import notificationsRouter from './routes/notifications'
import auditRouter from './routes/audit'
import aiRouter from './routes/ai'
import invoicingRouter from './routes/invoicing'
import { authLimiter, apiLimiter } from './middleware/rateLimiter'
import { swaggerSpec } from './lib/swagger'

const app = express()

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

app.use(express.json())
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
bizRoutes.use('/ai', aiRouter)
bizRoutes.use('/invoicing', invoicingRouter)

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

export default app
