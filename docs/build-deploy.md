# Build y Distribución

## Comandos disponibles

Todos los comandos se ejecutan desde la raíz del monorepo (`e:/Programacion/FinanzasPro/`).

| Comando | Descripción |
|---|---|
| `npm run setup` | Instalación completa: deps + Prisma generate + db push |
| `npm run dev` | Backend + Frontend en paralelo |
| `npm run dev:electron` | Backend + Frontend + ventana Electron |
| `npm run dev:backend` | Solo el backend (Express + tsx watch) |
| `npm run dev:frontend` | Solo el frontend (Vite) |
| `npm run build` | Build completo (backend + frontend + seed + electron) |
| `npm run dist` | Build + empaquetado NSIS para Windows |
| `npm run dist:portable` | Build + portable `.exe` para Windows |

---

## Setup inicial

```bash
npm run setup
```

Este comando ejecuta en secuencia:
1. `cd backend && npm install && npx prisma generate && npx prisma db push`
2. `cd frontend && npm install`
3. `npm install` (raíz — instala electron, concurrently, electron-builder)

Resultado: BD SQLite creada en `backend/dev.db` con el esquema completo.

---

## Desarrollo (`npm run dev`)

```
concurrently:
  ├─ BACKEND:  cd backend && tsx watch src/index.ts
  │            → http://localhost:3001
  └─ FRONTEND: cd frontend && vite
               → http://localhost:5173 (proxy /api → :3001)
```

Hot-reload activo en ambos. Los cambios en `.ts` del backend reinician el servidor automáticamente vía `tsx watch`.

---

## Desarrollo con Electron (`npm run dev:electron`)

```
concurrently:
  ├─ BACK:     tsx watch backend/src/index.ts (:3001)
  ├─ FRONT:    vite frontend (:5173)
  └─ ELECTRON: electron electron/dist/main.js
```

El proceso Electron espera a que el backend esté disponible antes de crear la ventana. En modo dev, el `BrowserWindow` carga `http://localhost:5173`.

---

## Build de producción (`npm run build`)

Ejecuta en secuencia:

```bash
# 1. Compila el backend TypeScript → JavaScript
cd backend && npm run build
# Output: backend/dist/

# 2. Compila el frontend React → HTML/CSS/JS
cd frontend && npm run build
# Output: frontend/dist/

# 3. Genera la BD semilla para instalaciones nuevas
node scripts/create-seed-db.js
# Output: electron/assets/seed.db

# 4. Compila el main process de Electron
tsc -p electron/tsconfig.json
# Output: electron/dist/main.js

# 5. Elimina devDependencies del backend para reducir el tamaño
cd backend && npm prune --omit=dev
```

---

## Empaquetado Windows

### Instalador NSIS (`npm run dist`)

```bash
npm run build && electron-builder --win --x64
```

**Output:** `release/Vendix Setup 1.1.0.exe`

El instalador permite elegir directorio, crea accesos directos en escritorio y menú inicio, y lanza la app al terminar.

### Portable (`npm run dist:portable`)

```bash
npm run build && electron-builder --win portable --x64
```

**Output:** `release/Vendix-Portable-1.1.0.exe`

Ejecutable autocontenido, sin instalación. Guarda los datos en el directorio del ejecutable.

---

## Configuración de electron-builder (`package.json → build`)

```json
{
  "appId": "com.vendix.app",
  "productName": "Vendix",
  "directories": {
    "output": "release",
    "buildResources": "electron/assets"
  },
  "files": [
    "electron/dist/**/*",
    "package.json"
  ],
  "extraResources": [
    { "from": "backend/dist",                    "to": "backend/dist" },
    { "from": "backend/node_modules",            "to": "backend/node_modules" },
    { "from": "backend/prisma/schema.prisma",    "to": "backend/prisma/schema.prisma" },
    { "from": "frontend/dist",                   "to": "frontend/dist" },
    { "from": "electron/assets/seed.db",         "to": "electron/assets/seed.db" }
  ]
}
```

Los `extraResources` se copian a `resources/` dentro del paquete Electron, accesibles en runtime mediante `process.resourcesPath`.

---

## Proceso Electron en producción (`electron/src/main.ts`)

Al arrancar el ejecutable:

1. **BD inicial:** copia `electron/assets/seed.db` → `%APPDATA%/Vendix/data.db` si no existe aún.
2. **Backend:** lanza `backend/dist/index.js` como proceso hijo con `DATABASE_URL` apuntando a la BD de `%APPDATA%`.
3. **Espera:** polling hasta que el backend responde en el puerto configurado.
4. **Ventana:** crea `BrowserWindow` y carga `frontend/dist/index.html`.
5. **Cierre:** al cerrar la ventana, mata el proceso backend hijo antes de salir.

---

## Estructura del paquete distribuido

```
release/
├── win-unpacked/
│   ├── Vendix.exe                  # Ejecutable principal de Electron
│   ├── resources/
│   │   ├── app.asar                # Código del main process
│   │   ├── backend/
│   │   │   ├── dist/               # Backend compilado
│   │   │   ├── node_modules/       # Dependencias runtime del backend
│   │   │   └── prisma/schema.prisma
│   │   ├── frontend/dist/          # Frontend compilado (HTML/CSS/JS)
│   │   └── electron/assets/seed.db
│   └── [Chromium + Node binaries]
├── Vendix Setup 1.1.0.exe          # Instalador
└── Vendix-Portable-1.1.0.exe       # Portable (si se generó)
```

---

## Base de datos en modo desktop

| Escenario | Ruta de la BD |
|---|---|
| Primera instalación | Copia de `seed.db` a `%APPDATA%/Vendix/data.db` |
| Instalaciones posteriores | Usa la BD existente en `%APPDATA%/Vendix/data.db` |
| Actualización de la app | La BD no se toca; solo se actualiza el código |

Si hay cambios de esquema en una actualización, el proceso Electron ejecuta `prisma db push` al arrancar para aplicar las migraciones.

---

## Requisitos para build

- Node.js v18+
- npm v9+
- Windows (para generar `.exe`; cross-compile requiere Wine)
- `npm run setup` ejecutado previamente

---

## Variables de entorno en producción

El archivo `.env` del backend debe configurarse antes del build. En modo Electron, las variables se inyectan en el proceso hijo del backend mediante el código del main process.

Ver [env-configuration.md](env-configuration.md) para la referencia completa.
