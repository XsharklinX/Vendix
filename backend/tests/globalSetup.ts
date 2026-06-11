import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'

export default async function globalSetup() {
  dotenv.config({ path: path.join(__dirname, '../.env.test') })

  const backendDir = path.join(__dirname, '..')
  const dbPath = path.join(backendDir, 'prisma', 'test.db')
  const journalPath = `${dbPath}-journal`

  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  if (fs.existsSync(journalPath)) fs.unlinkSync(journalPath)

  execSync('npx prisma migrate deploy', {
    cwd: backendDir,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  })
}
