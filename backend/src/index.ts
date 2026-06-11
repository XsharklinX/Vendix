import 'dotenv/config'
import app from './app'
import { logger } from './lib/logger'
import { startBackupScheduler } from './lib/backupScheduler'

const PORT = process.env.PORT || 3100

app.listen(PORT, () => {
  logger.info(`🚀 Vendix API → http://localhost:${PORT}`)
  logger.info(`📚 API Docs  → http://localhost:${PORT}/api/docs`)
  startBackupScheduler()
})
