/**
 * Creates electron/assets/seed.db from a temporary database with the current
 * Prisma schema. Electron copies this empty seed into userData on first run.
 */
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const backendDir = path.join(__dirname, '../backend')
const seedDir = path.join(__dirname, '../electron/assets')
const seedDest = path.join(seedDir, 'seed.db')
const tempDb = path.join(backendDir, 'prisma', 'seed-build.db')
const tempJournal = `${tempDb}-journal`

console.log('Creating seed.db...')

try {
  fs.closeSync(fs.openSync(tempDb, 'w'))

  // Prisma resolves relative file: URLs from prisma/schema.prisma.
  execSync('npx prisma migrate deploy', {
    cwd: backendDir,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'file:./seed-build.db' },
  })

  if (!fs.existsSync(tempDb)) {
    console.error('seed-build.db was not created after prisma migrate deploy')
    process.exit(1)
  }

  fs.mkdirSync(seedDir, { recursive: true })
  fs.copyFileSync(tempDb, seedDest)
  console.log(`seed.db created at ${seedDest}`)
} finally {
  if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb)
  if (fs.existsSync(tempJournal)) fs.unlinkSync(tempJournal)
}
