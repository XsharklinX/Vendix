import path from 'path'
import fs from 'fs'

function tryUnlink(filePath: string) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    // El archivo puede seguir bloqueado brevemente en Windows tras desconectar Prisma — no es crítico.
  }
}

export default async function globalTeardown() {
  const backendDir = path.join(__dirname, '..')
  const dbPath = path.join(backendDir, 'prisma', 'test.db')

  tryUnlink(dbPath)
  tryUnlink(`${dbPath}-journal`)
}
