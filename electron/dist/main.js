"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const crypto_1 = __importDefault(require("crypto"));
const electron_updater_1 = __importDefault(require("electron-updater"));
// ── Constantes ──────────────────────────────────────────────────────────────
const PORT = 3100;
const isDev = !electron_1.app.isPackaged;
let mainWindow = null;
let tray = null;
const updateState = {
    status: 'idle',
    currentVersion: electron_1.app.getVersion(),
    availableVersion: null,
    channel: 'stable',
    message: null,
    lastCheckedAt: null,
    downloadedAt: null,
};
function writeServerLog(message) {
    const logFile = path_1.default.join(electron_1.app.getPath('userData'), 'server.log');
    fs_1.default.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
}
function getLogFilePath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'server.log');
}
function setUpdateState(next) {
    Object.assign(updateState, next);
    mainWindow?.webContents.send('vendix:update-state', updateState);
}
function getAutoUpdater() {
    // electron-updater is CommonJS; destructuring avoids ESM interop issues.
    return electron_updater_1.default.autoUpdater;
}
function configureAutoUpdates() {
    if (isDev)
        return;
    const autoUpdater = getAutoUpdater();
    const config = getConfig();
    const channel = config.updateChannel === 'beta' ? 'beta' : 'stable';
    updateState.channel = channel;
    autoUpdater.channel = channel === 'beta' ? 'beta' : 'latest';
    autoUpdater.allowPrerelease = channel === 'beta';
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', error => {
        console.error('[updater]', error);
        writeServerLog(`[updater] error: ${error.stack || error.message}`);
        setUpdateState({ status: 'error', message: error.message, lastCheckedAt: new Date().toISOString() });
    });
    autoUpdater.on('checking-for-update', () => {
        writeServerLog('[updater] buscando actualizaciones');
        setUpdateState({ status: 'checking', message: 'Buscando actualizaciones...', lastCheckedAt: new Date().toISOString() });
    });
    autoUpdater.on('update-available', info => {
        writeServerLog(`[updater] actualizacion disponible: ${info.version}`);
        setUpdateState({
            status: 'available',
            availableVersion: info.version,
            message: `Vendix ${info.version} esta disponible. La descarga iniciara automaticamente.`,
            lastCheckedAt: new Date().toISOString(),
        });
    });
    autoUpdater.on('update-not-available', info => {
        writeServerLog(`[updater] sin actualizaciones: ${info.version}`);
        setUpdateState({
            status: 'not-available',
            availableVersion: null,
            message: 'Ya tienes la ultima version disponible para este canal.',
            lastCheckedAt: new Date().toISOString(),
        });
    });
    autoUpdater.on('download-progress', progress => {
        setUpdateState({
            status: 'downloading',
            message: `Descargando actualizacion ${Math.round(progress.percent)}%`,
        });
    });
    autoUpdater.on('update-downloaded', info => {
        writeServerLog(`[updater] actualizacion descargada: ${info.version}`);
        setUpdateState({
            status: 'downloaded',
            availableVersion: info.version,
            message: `Vendix ${info.version} esta lista para instalar.`,
            downloadedAt: new Date().toISOString(),
        });
        electron_1.dialog.showMessageBox({
            type: 'info',
            title: 'Actualizacion disponible',
            message: `Vendix ${info.version} ya esta lista para instalar.`,
            detail: 'La aplicacion se cerrara para aplicar la actualizacion. Tus datos locales se conservaran.',
            buttons: ['Reiniciar e instalar', 'Mas tarde'],
            defaultId: 0,
            cancelId: 1,
        }).then(({ response }) => {
            if (response === 0) {
                electron_1.app.isQuitting = true;
                autoUpdater.quitAndInstall();
            }
        }).catch(error => console.error('[updater] dialog', error));
    });
    autoUpdater.checkForUpdatesAndNotify().catch(error => {
        console.error('[updater] check', error);
    });
}
// ── Helpers de rutas ────────────────────────────────────────────────────────
function registerIpcHandlers() {
    electron_1.ipcMain.handle('vendix:get-update-state', () => updateState);
    electron_1.ipcMain.handle('vendix:check-for-updates', async () => {
        if (isDev) {
            setUpdateState({
                status: 'not-available',
                message: 'Las actualizaciones automaticas solo funcionan en la app instalada.',
                lastCheckedAt: new Date().toISOString(),
            });
            return updateState;
        }
        await getAutoUpdater().checkForUpdates();
        return updateState;
    });
    electron_1.ipcMain.handle('vendix:install-update', () => {
        if (isDev || updateState.status !== 'downloaded')
            return false;
        electron_1.app.isQuitting = true;
        getAutoUpdater().quitAndInstall();
        return true;
    });
    electron_1.ipcMain.handle('vendix:set-update-channel', (_event, channel) => {
        const safeChannel = channel === 'beta' ? 'beta' : 'stable';
        const config = getConfig();
        saveConfig({ ...config, updateChannel: safeChannel });
        setUpdateState({
            channel: safeChannel,
            message: safeChannel === 'beta'
                ? 'Canal beta activado. Recibiras versiones de prueba cuando existan.'
                : 'Canal estable activado. Recibiras solo versiones publicas.',
        });
        if (!isDev) {
            const autoUpdater = getAutoUpdater();
            autoUpdater.channel = safeChannel === 'beta' ? 'beta' : 'latest';
            autoUpdater.allowPrerelease = safeChannel === 'beta';
        }
        return updateState;
    });
    electron_1.ipcMain.handle('vendix:get-log-info', () => {
        const filePath = getLogFilePath();
        const exists = fs_1.default.existsSync(filePath);
        const stat = exists ? fs_1.default.statSync(filePath) : null;
        const content = exists ? fs_1.default.readFileSync(filePath, 'utf8').split(/\r?\n/).slice(-200).join('\n') : '';
        return {
            path: filePath,
            exists,
            size: stat?.size ?? 0,
            updatedAt: stat?.mtime.toISOString() ?? null,
            tail: content,
        };
    });
    electron_1.ipcMain.handle('vendix:get-sync-config', () => getSyncConfig());
    electron_1.ipcMain.handle('vendix:save-sync-config', (_event, input) => {
        return saveSyncConfig(input);
    });
    electron_1.ipcMain.handle('vendix:open-user-data', async () => {
        await electron_1.shell.openPath(electron_1.app.getPath('userData'));
        return true;
    });
    electron_1.ipcMain.handle('vendix:open-log-file', async () => {
        const filePath = getLogFilePath();
        if (!fs_1.default.existsSync(filePath))
            writeServerLog('log creado manualmente desde Configuracion');
        await electron_1.shell.openPath(filePath);
        return true;
    });
}
function resourcePath(...parts) {
    return isDev
        ? path_1.default.join(__dirname, '..', ...parts)
        : path_1.default.join(process.resourcesPath, ...parts);
}
// ── Config persistente (JWT secret, etc.) ───────────────────────────────────
function getConfig() {
    const configFile = path_1.default.join(electron_1.app.getPath('userData'), 'config.json');
    try {
        return JSON.parse(fs_1.default.readFileSync(configFile, 'utf8'));
    }
    catch {
        return {};
    }
}
function saveConfig(data) {
    const configFile = path_1.default.join(electron_1.app.getPath('userData'), 'config.json');
    fs_1.default.writeFileSync(configFile, JSON.stringify(data, null, 2));
}
function getSyncConfig() {
    const config = getConfig();
    return {
        enabled: config.syncEnabled === 'true',
        cloudUrl: config.syncCloudUrl || '',
        hasCloudToken: Boolean(config.syncCloudToken),
        localBusinessId: config.syncLocalBusinessId || '',
        cloudBusinessId: config.syncCloudBusinessId || '',
        deviceKey: config.syncDeviceKey || '',
        deviceName: config.syncDeviceName || '',
        intervalMs: Number(config.syncIntervalMs || 60000),
    };
}
function applySyncConfigToEnv(config = getConfig()) {
    process.env.VENDIX_SYNC_ENABLED = config.syncEnabled === 'true' ? 'true' : 'false';
    process.env.VENDIX_CLOUD_URL = config.syncCloudUrl || '';
    process.env.VENDIX_CLOUD_TOKEN = config.syncCloudToken || '';
    process.env.VENDIX_SYNC_LOCAL_BUSINESS_ID = config.syncLocalBusinessId || '';
    process.env.VENDIX_SYNC_CLOUD_BUSINESS_ID = config.syncCloudBusinessId || '';
    process.env.VENDIX_SYNC_DEVICE_KEY = config.syncDeviceKey || '';
    process.env.VENDIX_SYNC_DEVICE_NAME = config.syncDeviceName || '';
    process.env.VENDIX_SYNC_INTERVAL_MS = config.syncIntervalMs || '60000';
}
function saveSyncConfig(input) {
    const current = getConfig();
    const next = {
        ...current,
        syncEnabled: input.enabled ? 'true' : 'false',
        syncCloudUrl: (input.cloudUrl || '').trim().replace(/\/+$/, ''),
        syncLocalBusinessId: (input.localBusinessId || '').trim(),
        syncCloudBusinessId: (input.cloudBusinessId || '').trim(),
        syncDeviceKey: (input.deviceKey || '').trim(),
        syncDeviceName: (input.deviceName || '').trim(),
        syncIntervalMs: String(Math.max(Number(input.intervalMs) || 60000, 15000)),
    };
    if (typeof input.cloudToken === 'string' && input.cloudToken.trim()) {
        next.syncCloudToken = input.cloudToken.trim();
    }
    else if (current.syncCloudToken) {
        next.syncCloudToken = current.syncCloudToken;
    }
    saveConfig(next);
    applySyncConfigToEnv(next);
    return getSyncConfig();
}
function getOrCreateJwtSecret() {
    const config = getConfig();
    if (config.jwtSecret)
        return config.jwtSecret;
    const secret = crypto_1.default.randomBytes(48).toString('hex');
    saveConfig({ ...config, jwtSecret: secret });
    return secret;
}
// ── Base de datos ────────────────────────────────────────────────────────────
function ensureDatabase() {
    const dbPath = path_1.default.join(electron_1.app.getPath('userData'), 'vendix.db');
    if (!fs_1.default.existsSync(dbPath)) {
        const seedPath = resourcePath('electron', 'assets', 'seed.db');
        if (fs_1.default.existsSync(seedPath)) {
            fs_1.default.copyFileSync(seedPath, dbPath);
        }
    }
    return dbPath;
}
// ── Servidor Express ─────────────────────────────────────────────────────────
function startServer(dbPath, jwtSecret) {
    const serverScript = resourcePath('backend', 'dist', 'index.js');
    const frontendDist = resourcePath('frontend', 'dist');
    const config = getConfig();
    const env = {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'production',
        DATABASE_URL: `file:${dbPath}`,
        JWT_SECRET: jwtSecret,
        FRONTEND_DIST: frontendDist,
        CORS_ORIGIN: `http://localhost:${PORT}`,
        APP_VERSION: electron_1.app.getVersion(),
        APP_USER_DATA_PATH: electron_1.app.getPath('userData'),
        APP_DB_PATH: dbPath,
        APP_UPDATED_AT: fs_1.default.existsSync(process.execPath) ? fs_1.default.statSync(process.execPath).mtime.toISOString() : new Date().toISOString(),
        VENDIX_SYNC_ENABLED: config.syncEnabled === 'true' ? 'true' : 'false',
        VENDIX_CLOUD_URL: config.syncCloudUrl || '',
        VENDIX_CLOUD_TOKEN: config.syncCloudToken || '',
        VENDIX_SYNC_LOCAL_BUSINESS_ID: config.syncLocalBusinessId || '',
        VENDIX_SYNC_CLOUD_BUSINESS_ID: config.syncCloudBusinessId || '',
        VENDIX_SYNC_DEVICE_KEY: config.syncDeviceKey || '',
        VENDIX_SYNC_DEVICE_NAME: config.syncDeviceName || '',
        VENDIX_SYNC_INTERVAL_MS: config.syncIntervalMs || '60000',
    };
    try {
        Object.assign(process.env, env);
        writeServerLog(`cargando backend: ${serverScript}`);
        require(serverScript);
        writeServerLog('backend cargado');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const details = error instanceof Error ? error.stack || error.message : String(error);
        writeServerLog(`error cargando backend: ${details}`);
        electron_1.dialog.showErrorBox('Error del servidor', `No se pudo iniciar el servidor:\n${message}`);
        throw error;
    }
}
// ── Esperar a que el servidor responda ───────────────────────────────────────
function waitForServer(maxAttempts = 40) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
            const req = http_1.default.get(`http://localhost:${PORT}/api/health`, res => {
                if (res.statusCode === 200)
                    resolve();
                else
                    retry();
            });
            req.on('error', retry);
            req.setTimeout(1000, () => { req.destroy(); retry(); });
        };
        const retry = () => {
            attempts++;
            if (attempts >= maxAttempts) {
                reject(new Error('El servidor tardó demasiado en iniciar'));
            }
            else {
                setTimeout(check, 500);
            }
        };
        check();
    });
}
// ── Ventana principal ────────────────────────────────────────────────────────
async function createWindow() {
    const iconPath = resourcePath('electron', 'assets', 'icon.png');
    const icon = fs_1.default.existsSync(iconPath) ? electron_1.nativeImage.createFromPath(iconPath) : undefined;
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 640,
        icon,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
        },
        show: false,
        backgroundColor: '#f8fafc',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    });
    // Abrir links externos en el navegador, no en la app
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
    // CSP de respaldo a nivel Electron (defensa en profundidad además de helmet en Express).
    // En dev se omite: el servidor de Vite usa scripts inline/eval para HMR.
    if (!isDev) {
        electron_1.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [
                        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
                            "img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; " +
                            "object-src 'none'; frame-src 'self'; base-uri 'self'",
                    ],
                },
            });
        });
    }
    if (isDev) {
        await mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
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
    `;
        await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml)}`);
        mainWindow.show();
        try {
            await waitForServer();
            await mainWindow.loadURL(`http://localhost:${PORT}`);
        }
        catch (err) {
            electron_1.dialog.showErrorBox('Error de inicio', String(err));
            electron_1.app.quit();
            return;
        }
    }
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
        mainWindow?.focus();
    });
    // Minimizar a bandeja en vez de cerrar
    mainWindow.on('close', e => {
        if (!electron_1.app.isQuitting) {
            e.preventDefault();
            mainWindow?.hide();
        }
    });
}
// ── Tray (bandeja del sistema) ───────────────────────────────────────────────
function createTray() {
    const icoPath = resourcePath('electron', 'assets', 'icon.ico');
    const pngPath = resourcePath('electron', 'assets', 'icon.png');
    const iconFile = process.platform === 'win32' && fs_1.default.existsSync(icoPath) ? icoPath : pngPath;
    const img = fs_1.default.existsSync(iconFile)
        ? electron_1.nativeImage.createFromPath(iconFile).resize({ width: 16, height: 16 })
        : electron_1.nativeImage.createEmpty();
    tray = new electron_1.Tray(img);
    tray.setToolTip('Vendix');
    const menu = electron_1.Menu.buildFromTemplate([
        { label: 'Abrir Vendix', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
        ...(!isDev ? [{
                label: 'Buscar actualizaciones',
                click: () => {
                    getAutoUpdater().checkForUpdatesAndNotify().catch(error => console.error('[updater] manual check', error));
                },
            }] : []),
        { type: 'separator' },
        { label: `Versión ${electron_1.app.getVersion()}`, enabled: false },
        { type: 'separator' },
        {
            label: 'Salir', click: () => {
                electron_1.app.isQuitting = true;
                electron_1.app.quit();
            }
        },
    ]);
    tray.setContextMenu(menu);
    tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}
// ── Lifecycle ────────────────────────────────────────────────────────────────
// Evitar múltiples instancias. Esto debe ir ANTES de registrar app.whenReady():
// si una segunda instancia llega a registrar el handler de "ready", podría
// intentar levantar el backend en el puerto 3100 antes de que app.quit()
// surta efecto, provocando un EADDRINUSE.
const gotLock = electron_1.app.requestSingleInstanceLock();
if (!gotLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on('second-instance', () => {
        mainWindow?.show();
        mainWindow?.focus();
    });
    electron_1.app.whenReady().then(async () => {
        registerIpcHandlers();
        const config = getConfig();
        updateState.channel = config.updateChannel === 'beta' ? 'beta' : 'stable';
        const dbPath = ensureDatabase();
        const jwtSecret = getOrCreateJwtSecret();
        if (!isDev) {
            startServer(dbPath, jwtSecret);
        }
        await createWindow();
        createTray();
        configureAutoUpdates();
    });
    electron_1.app.on('window-all-closed', () => {
        // No salir al cerrar ventana — app vive en la bandeja
    });
    electron_1.app.on('activate', () => {
        mainWindow?.show();
    });
    electron_1.app.on('before-quit', () => {
        electron_1.app.isQuitting = true;
    });
}
electron_1.app.isQuitting = false;
