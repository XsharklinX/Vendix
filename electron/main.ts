import { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import http from 'http'
import crypto from 'crypto'
import electronUpdater, { type AppUpdater } from 'electron-updater'

// ── Constantes ──────────────────────────────────────────────────────────────
const PORT = 3001
const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function writeServerLog(message: string) {
  const logFile = path.join(app.getPath('userData'), 'server.log')
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`)
}

function getAutoUpdater(): AppUpdater {
  // electron-updater is CommonJS; destructuring avoids ESM interop issues.
  return electronUpdater.autoUpdater
}

function configureAutoUpdates() {
  if (isDev) return

  const autoUpdater = getAutoUpdater()
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', error => {
    console.error('[updater]', error)
    writeServerLog(`[updater] error: ${error.stack || error.message}`)
  })

  autoUpdater.on('checking-for-update', () => {
    writeServerLog('[updater] buscando actualizaciones')
  })

  autoUpdater.on('update-available', info => {
    writeServerLog(`[updater] actualizacion disponible: ${info.version}`)
  })

  autoUpdater.on('update-not-available', info => {
    writeServerLog(`[updater] sin actualizaciones: ${info.version}`)
  })

  autoUpdater.on('update-downloaded', info => {
    writeServerLog(`[updater] actualizacion descargada: ${info.version}`)
    dialog.showMessageBox({
      type: 'info',
      title: 'Actualizacion disponible',
      message: `Vendix ${info.version} ya esta lista para instalar.`,
      detail: 'La aplicacion se cerrara para aplicar la actualizacion. Tus datos locales se conservaran.',
      buttons: ['Reiniciar e instalar', 'Mas tarde'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        app.isQuitting = true
        autoUpdater.quitAndInstall()
      }
    }).catch(error => console.error('[updater] dialog', error))
  })

  autoUpdater.checkForUpdatesAndNotify().catch(error => {
    console.error('[updater] check', error)
  })
}

// ── Helpers de rutas ────────────────────────────────────────────────────────
function resourcePath(...parts: string[]) {
  return isDev
    ? path.join(__dirname, '..', ...parts)
    : path.join(process.resourcesPath, ...parts)
}

// ── Config persistente (JWT secret, etc.) ───────────────────────────────────
function getConfig(): Record<string, string> {
  const configFile = path.join(app.getPath('userData'), 'config.json')
  try { return JSON.parse(fs.readFileSync(configFile, 'utf8')) } catch { return {} }
}

function saveConfig(data: Record<string, string>) {
  const configFile = path.join(app.getPath('userData'), 'config.json')
  fs.writeFileSync(configFile, JSON.stringify(data, null, 2))
}

function getOrCreateJwtSecret(): string {
  const config = getConfig()
  if (config.jwtSecret) return config.jwtSecret
  const secret = crypto.randomBytes(48).toString('hex')
  saveConfig({ ...config, jwtSecret: secret })
  return secret
}

// ── Base de datos ────────────────────────────────────────────────────────────
function ensureDatabase(): string {
  const dbPath = path.join(app.getPath('userData'), 'vendix.db')
  if (!fs.existsSync(dbPath)) {
    const seedPath = resourcePath('electron', 'assets', 'seed.db')
    if (fs.existsSync(seedPath)) {
      fs.copyFileSync(seedPath, dbPath)
    }
  }
  return dbPath
}

// ── Servidor Express ─────────────────────────────────────────────────────────
function startServer(dbPath: string, jwtSecret: string) {
  const serverScript = resourcePath('backend', 'dist', 'index.js')
  const frontendDist = resourcePath('frontend', 'dist')
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'production',
    DATABASE_URL: `file:${dbPath}`,
    JWT_SECRET: jwtSecret,
    FRONTEND_DIST: frontendDist,
    CORS_ORIGIN: `http://localhost:${PORT}`,
  }

  try {
    Object.assign(process.env, env)
    writeServerLog(`cargando backend: ${serverScript}`)
    require(serverScript)
    writeServerLog('backend cargado')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const details = error instanceof Error ? error.stack || error.message : String(error)
    writeServerLog(`error cargando backend: ${details}`)
    dialog.showErrorBox('Error del servidor', `No se pudo iniciar el servidor:\n${message}`)
    throw error
  }
}

// ── Esperar a que el servidor responda ───────────────────────────────────────
function waitForServer(maxAttempts = 40): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const check = () => {
      const req = http.get(`http://localhost:${PORT}/api/health`, res => {
        if (res.statusCode === 200) resolve()
        else retry()
      })
      req.on('error', retry)
      req.setTimeout(1000, () => { req.destroy(); retry() })
    }
    const retry = () => {
      attempts++
      if (attempts >= maxAttempts) {
        reject(new Error('El servidor tardó demasiado en iniciar'))
      } else {
        setTimeout(check, 500)
      }
    }
    check()
  })
}

// ── Ventana principal ────────────────────────────────────────────────────────
async function createWindow() {
  const iconPath = resourcePath('electron', 'assets', 'icon.png')
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    backgroundColor: '#f8fafc',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  })

  // Abrir links externos en el navegador, no en la app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    // Mostrar pantalla de carga mientras el servidor arranca
    const loadingHtml = `
      <html><body style="font-family:system-ui;background:#f8fafc;display:flex;
        flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;color:#64748b">
        <div style="font-size:48px;margin-bottom:16px">💰</div>
        <h2 style="margin:0 0 8px;color:#1e293b;font-size:18px">Vendix</h2>
        <p style="margin:0;font-size:13px">Iniciando aplicación...</p>
        <div style="margin-top:20px;width:160px;height:3px;background:#e2e8f0;border-radius:2px;overflow:hidden">
          <div style="height:100%;background:#3b82f6;border-radius:2px;animation:load 1.5s ease-in-out infinite"
            id="bar"></div>
        </div>
        <style>@keyframes load{0%{width:0%}50%{width:70%}100%{width:100%}}</style>
      </body></html>
    `
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml)}`)
    mainWindow.show()

    try {
      await waitForServer()
      await mainWindow.loadURL(`http://localhost:${PORT}`)
    } catch (err) {
      dialog.showErrorBox('Error de inicio', String(err))
      app.quit()
      return
    }
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  // Minimizar a bandeja en vez de cerrar
  mainWindow.on('close', e => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
}

// ── Tray (bandeja del sistema) ───────────────────────────────────────────────
function createTray() {
  const iconPath = resourcePath('electron', 'assets', 'icon.png')
  const img = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty()

  tray = new Tray(img)
  tray.setToolTip('Vendix')

  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Vendix', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    ...(!isDev ? [{
      label: 'Buscar actualizaciones',
      click: () => {
        getAutoUpdater().checkForUpdatesAndNotify().catch(error => console.error('[updater] manual check', error))
      },
    }] : []),
    { type: 'separator' },
    { label: `Versión ${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Salir', click: () => {
        app.isQuitting = true
        app.quit()
      }
    },
  ])

  tray.setContextMenu(menu)
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus() })
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const dbPath = ensureDatabase()
  const jwtSecret = getOrCreateJwtSecret()

  if (!isDev) {
    startServer(dbPath, jwtSecret)
  }

  await createWindow()
  createTray()
  configureAutoUpdates()
})

app.on('window-all-closed', () => {
  // No salir al cerrar ventana — app vive en la bandeja
})

app.on('activate', () => {
  mainWindow?.show()
})

app.on('before-quit', () => {
  app.isQuitting = true
})

// Evitar múltiples instancias
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

// Extender tipos de Electron
declare global {
  namespace Electron {
    interface App { isQuitting: boolean }
  }
}
app.isQuitting = false
