const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const backendDir = path.join(rootDir, 'backend')
const runtimeDir = path.join(rootDir, '.build', 'backend-runtime')
const sourcePrismaDir = path.join(backendDir, 'node_modules', '.prisma')
const runtimePrismaDir = path.join(runtimeDir, 'node_modules', '.prisma')

fs.rmSync(runtimeDir, { recursive: true, force: true })
fs.mkdirSync(runtimeDir, { recursive: true })
fs.copyFileSync(path.join(backendDir, 'package.json'), path.join(runtimeDir, 'package.json'))
fs.copyFileSync(path.join(backendDir, 'package-lock.json'), path.join(runtimeDir, 'package-lock.json'))

const installArgs = ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund']
if (process.platform === 'win32') {
  execFileSync('cmd.exe', ['/d', '/s', '/c', `npm ${installArgs.join(' ')}`], {
    cwd: runtimeDir,
    stdio: 'inherit',
  })
} else {
  execFileSync('npm', installArgs, { cwd: runtimeDir, stdio: 'inherit' })
}

fs.cpSync(sourcePrismaDir, runtimePrismaDir, {
  recursive: true,
  filter: source => !path.basename(source).includes('.tmp'),
})

console.log(`Backend runtime listo en ${runtimeDir}`)
