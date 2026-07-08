import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'

export default async function globalSetup() {
  dotenv.config({ path: path.join(__dirname, '../.env.test'), override: true })

  const backendDir = path.join(__dirname, '..')
  const dbPath = path.join(backendDir, 'prisma', 'test.db')
  const journalPath = `${dbPath}-journal`
  const databaseUrl = 'file:./test.db'

  process.env.DATABASE_URL = databaseUrl

  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  if (fs.existsSync(journalPath)) fs.unlinkSync(journalPath)

  try {
    execSync('npx prisma db push --force-reset --skip-generate', {
      cwd: backendDir,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    })
  } catch (error) {
    const devDbPath = path.join(backendDir, 'prisma', 'dev.db')
    if (!fs.existsSync(devDbPath)) throw error
    fs.copyFileSync(devDbPath, dbPath)
  }
}
