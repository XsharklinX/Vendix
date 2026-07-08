import 'dotenv/config'
import app from './app'
import { logger } from './lib/logger'
import { startBackupScheduler } from './lib/backupScheduler'
import { startSyncWorker } from './lib/syncWorker'

const PORT = process.env.PORT || 3100

// Red de seguridad: loguear y seguir corriendo en vez de tumbar el proceso
// (crítico en el empaquetado de escritorio, donde un crash silencioso del
// backend deja a la app sin API sin que el usuario entienda por qué).
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, '[process] unhandledRejection')
})
process.on('uncaughtException', (err) => {
  logger.error({ err }, '[process] uncaughtException')
})

app.listen(PORT, () => {
  logger.info(`🚀 Vendix API → http://localhost:${PORT}`)
  logger.info(`📚 API Docs  → http://localhost:${PORT}/api/docs`)
  startBackupScheduler()
  startSyncWorker()
})
