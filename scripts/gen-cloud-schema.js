// Regenera prisma/schema.production.prisma (PostgreSQL) desde prisma/schema.prisma (SQLite).
// Correr tras cualquier cambio de schema: node scripts/gen-cloud-schema.js
const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'backend', 'prisma', 'schema.prisma')
const dst = path.join(__dirname, '..', 'backend', 'prisma', 'schema.production.prisma')

const local = fs.readFileSync(src, 'utf8')

const header = `// GENERADO por scripts/gen-cloud-schema.js — NO EDITAR A MANO.
// Fuente de verdad: prisma/schema.prisma (SQLite). Este archivo solo cambia el provider a PostgreSQL.
// Uso: npx prisma generate --schema prisma/schema.production.prisma
`

// Quitar el comentario de cabecera original (primera línea si es comentario) y cambiar provider
const body = local
  .split('\n')
  .filter((line, i) => !(i === 0 && line.startsWith('//')))
  .join('\n')
  .replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"')

fs.writeFileSync(dst, header + body)
console.log('schema.production.prisma regenerado desde schema.prisma')
