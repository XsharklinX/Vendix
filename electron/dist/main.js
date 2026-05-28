"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const crypto_1 = __importDefault(require("crypto"));
// ── Constantes ──────────────────────────────────────────────────────────────
const PORT = 3001;
const isDev = !electron_1.app.isPackaged;
let mainWindow = null;
let tray = null;
let serverProcess = null;
// ── Helpers de rutas ────────────────────────────────────────────────────────
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
    const env = {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'production',
        DATABASE_URL: `file:${dbPath}`,
        JWT_SECRET: jwtSecret,
        FRONTEND_DIST: frontendDist,
        CORS_ORIGIN: `http://localhost:${PORT}`,
    };
    serverProcess = (0, child_process_1.spawn)(process.execPath, [serverScript], {
        env,
        stdio: isDev ? 'inherit' : 'pipe',
    });
    serverProcess.on('error', err => {
        electron_1.dialog.showErrorBox('Error del servidor', `No se pudo iniciar el servidor:\n${err.message}`);
    });
    if (!isDev && serverProcess.stderr) {
        const logFile = path_1.default.join(electron_1.app.getPath('userData'), 'server.log');
        const logStream = fs_1.default.createWriteStream(logFile, { flags: 'a' });
        serverProcess.stdout?.pipe(logStream);
        serverProcess.stderr?.pipe(logStream);
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
    const iconPath = resourcePath('electron', 'assets', 'icon.png');
    const img = fs_1.default.existsSync(iconPath)
        ? electron_1.nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
        : electron_1.nativeImage.createEmpty();
    tray = new electron_1.Tray(img);
    tray.setToolTip('Vendix');
    const menu = electron_1.Menu.buildFromTemplate([
        { label: 'Abrir Vendix', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
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
electron_1.app.whenReady().then(async () => {
    const dbPath = ensureDatabase();
    const jwtSecret = getOrCreateJwtSecret();
    if (!isDev) {
        startServer(dbPath, jwtSecret);
    }
    await createWindow();
    createTray();
});
electron_1.app.on('window-all-closed', () => {
    // No salir al cerrar ventana — app vive en la bandeja
});
electron_1.app.on('activate', () => {
    mainWindow?.show();
});
electron_1.app.on('before-quit', () => {
    electron_1.app.isQuitting = true;
    serverProcess?.kill();
});
// Evitar múltiples instancias
const gotLock = electron_1.app.requestSingleInstanceLock();
if (!gotLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on('second-instance', () => {
        mainWindow?.show();
        mainWindow?.focus();
    });
}
electron_1.app.isQuitting = false;
