const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const packagePath = path.join(rootDir, 'package.json')
const lockPath = path.join(rootDir, 'package-lock.json')
const buildNumber = Number.parseInt(process.env.RELEASE_BUILD_NUMBER || '', 10)

if (!Number.isInteger(buildNumber) || buildNumber < 1) {
  throw new Error('RELEASE_BUILD_NUMBER debe ser un entero positivo')
}

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const [major, minor, patch] = packageJson.version.split('.').map(Number)

if (![major, minor, patch].every(Number.isInteger)) {
  throw new Error(`Version base invalida: ${packageJson.version}`)
}

const releaseVersion = `${major}.${minor}.${patch + buildNumber}`
packageJson.version = releaseVersion
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)

const lockJson = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
lockJson.version = releaseVersion
if (lockJson.packages?.['']) lockJson.packages[''].version = releaseVersion
fs.writeFileSync(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`)

console.log(`Version CI preparada: ${releaseVersion}`)
