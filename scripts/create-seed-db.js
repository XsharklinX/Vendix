/**
 * Crea electron/assets/seed.db copiando el dev.db generado por prisma db push.
 * El seed.db es una base de datos SQLite vacía con el esquema aplicado.
 * Electron la copia a userData en el primer arranque.
 */
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const backendDir = path.join(__dirname, '../backend')
const seedDir = path.join(__dirname, '../electron/assets')
const seedDest = path.join(seedDir, 'seed.db')

console.log('📦 Creando seed.db...')

// Aplicar el schema en dev.db
execSync('npx prisma db push --force-reset', {
  cwd: backendDir,
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: 'file:./prisma/dev.db' },
})

const devDb = path.join(backendDir, 'prisma', 'dev.db')
if (!fs.existsSync(devDb)) {
  console.error('❌ No se encontró dev.db después de prisma db push')
  process.exit(1)
}

fs.mkdirSync(seedDir, { recursive: true })
fs.copyFileSync(devDb, seedDest)
console.log(`✅ seed.db creado en ${seedDest}`)
