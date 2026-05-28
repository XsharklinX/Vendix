/**
 * Lanzador para desarrollo en Electron.
 * VS Code establece ELECTRON_RUN_AS_NODE=1 lo que rompe require('electron').
 * Este script lo elimina antes de lanzar el proceso Electron.
 */
const { spawn } = require('child_process')
const path = require('path')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const electronBin = require('electron')
const projectRoot = path.join(__dirname, '..')

const proc = spawn(electronBin, [projectRoot], {
  env,
  stdio: 'inherit',
  cwd: projectRoot,
})

proc.on('close', code => process.exit(code ?? 0))
