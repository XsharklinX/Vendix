# Arquitectura

## Stack tecnológico

### Backend

| Tecnología | Versión | Rol |
|---|---|---|
| Node.js + Express | 4.18 | Servidor HTTP |
| TypeScript | — | Tipado estático |
| Prisma ORM | 5.10 | Acceso a base de datos |
| SQLite | — | Base de datos (dev/desktop) |
| Zod | 3.22 | Validación de esquemas |
| jsonwebtoken | 9.0 | Autenticación JWT |
| bcryptjs | 2.4 | Hashing de contraseñas |
| nodemailer / resend | — | Envío de emails |
| Stripe SDK | 22 | Pagos y suscripciones |
| Twilio | 6 | WhatsApp / SMS |
| express-rate-limit | 8.3 | Rate limiting |
| tsx | — | Ejecución TypeScript en dev |

### Frontend

| Tecnología | Versión | Rol |
|---|---|---|
| React | 18.2 | UI framework |
| TypeScript | — | Tipado estático |
| Vite | — | Bundler |
| Tailwind CSS | 3.4 | Estilos utilitarios |
| React Router DOM | 6.22 | Enrutamiento SPA |
| TanStack React Query | 5.20 | Server state / caché |
| Zustand | 4.5 | Estado global del cliente |
| React Hook Form | 7.50 | Formularios |
| Zod | 3.22 | Validación de formularios |
| Recharts | 2.12 | Gráficas |
| Axios | 1.6 | Cliente HTTP |
| react-hot-toast | 2.6 | Notificaciones toast |
| Lucide React | 0.330 | Iconos |
| date-fns | 3.3 | Utilidades de fechas |

### Desktop (Electron)

| Tecnología | Versión | Rol |
|---|---|---|
| Electron | 31 | Shell de escritorio |
| electron-builder | — | Empaquetado Windows |

---

## Estructura de archivos

```
FinanzasPro/
│
├── package.json                    # Monorepo raíz, scripts de orquestación
│
├── backend/
│   ├── src/
│   │   ├── index.ts                # Entry point del servidor Express
│   │   ├── routes/
│   │   │   ├── auth.ts             # Registro, login, verificación, staff
│   │   │   ├── business.ts         # CRUD de negocios
│   │   │   ├── products.ts         # Inventario, categorías, bulk import
│   │   │   ├── transactions.ts     # Ventas, gastos, sesiones de caja
│   │   │   ├── clients.ts          # Clientes, deudas pendientes
│   │   │   ├── suppliers.ts        # Proveedores
│   │   │   ├── employees.ts        # Empleados
│   │   │   ├── quotes.ts           # Cotizaciones
│   │   │   ├── stats.ts            # Dashboard y analytics
│   │   │   ├── notifications.ts    # Notificaciones in-app
│   │   │   ├── billing.ts          # Stripe: checkout, portal, webhooks
│   │   │   ├── audit.ts            # Log de auditoría
│   │   │   └── whatsapp.ts         # Recordatorios WhatsApp (Twilio)
│   │   ├── middleware/
│   │   │   ├── auth.ts             # Verificación JWT
│   │   │   ├── planLimits.ts       # Límites del plan gratuito
│   │   │   └── rateLimiter.ts      # Rate limiting
│   │   └── lib/
│   │       ├── prisma.ts           # Singleton Prisma client
│   │       ├── jwt.ts              # Generación/verificación de tokens
│   │       ├── email.ts            # Abstracción de envío de emails
│   │       ├── audit.ts            # Helper de logAudit()
│   │       ├── notifications.ts    # checkLowStock(), checkPendingDebts()
│   │       ├── backupScheduler.ts  # Scheduler de backups y notificaciones
│   │       ├── swagger.ts          # Especificación OpenAPI
│   │       └── verifyBusiness.ts   # Verificación de acceso al negocio
│   ├── prisma/
│   │   └── schema.prisma           # Esquema de base de datos
│   ├── dev.db                      # Base de datos SQLite (dev)
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx                # Entry point React
│   │   ├── App.tsx                 # Router principal + Query Provider
│   │   ├── pages/
│   │   │   ├── auth/               # Login, Register, ForgotPassword, etc.
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Vender.tsx
│   │   │   ├── Movimientos.tsx
│   │   │   ├── Inventario.tsx
│   │   │   ├── Estadísticas.tsx
│   │   │   ├── Cotizaciones.tsx
│   │   │   ├── Clientes.tsx
│   │   │   ├── Proveedores.tsx
│   │   │   ├── Empleados.tsx
│   │   │   ├── Caja.tsx
│   │   │   ├── CuentasCobrar.tsx
│   │   │   ├── Reportes.tsx
│   │   │   ├── Configuraciones.tsx
│   │   │   ├── AuditLog.tsx
│   │   │   └── Onboarding.tsx
│   │   ├── components/
│   │   │   ├── Layout/
│   │   │   │   ├── Layout.tsx      # Wrapper con sidebar y notificaciones
│   │   │   │   └── Sidebar.tsx     # Navegación + badges de estado
│   │   │   └── ui/
│   │   │       ├── Modal.tsx
│   │   │       ├── EmptyState.tsx
│   │   │       ├── ConfirmDialog.tsx
│   │   │       ├── PageHeader.tsx
│   │   │       ├── NotificationBell.tsx
│   │   │       ├── ErrorBoundary.tsx
│   │   │       ├── PlanLimitModal.tsx
│   │   │       └── ImportCSV.tsx
│   │   ├── store/
│   │   │   └── auth.ts             # Zustand: usuario, negocio, token
│   │   ├── hooks/
│   │   │   └── usePlanLimit.ts     # Modal de upgrade
│   │   └── lib/
│   │       ├── api.ts              # Axios con interceptores
│   │       ├── utils.ts            # Formateo de moneda, fechas, labels
│   │       ├── export.ts           # Exportación CSV
│   │       └── generateInvoicePdf.ts # Generación de facturas PDF
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── electron/
│   ├── src/
│   │   └── main.ts                 # Electron main: ventana, IPC, backend embed
│   └── assets/
│       └── seed.db                 # BD inicial para instalaciones nuevas
│
├── scripts/
│   ├── launch-dev.js               # Script de desarrollo con Electron
│   └── create-seed-db.js          # Generador de BD semilla
│
└── release/                        # Output de electron-builder
```

---

## Flujo de arranque

### Desarrollo web (`npm run dev`)

```
npm run dev
  └─ concurrently:
       ├─ cd backend && tsx watch src/index.ts  (puerto 3001)
       └─ cd frontend && vite                   (puerto 5173)
```

### Desarrollo Electron (`npm run dev:electron`)

```
concurrently:
  ├─ backend (tsx watch, :3001)
  ├─ frontend (vite, :5173)
  └─ electron/dist/main.js
       └─ Crea BrowserWindow → carga http://localhost:5173
       └─ Levanta proceso backend embebido
```

### Producción (standalone)

El ejecutable de Electron lleva embebidos:
- `backend/dist/` (JS compilado)
- `frontend/dist/` (HTML/CSS/JS)
- `electron/assets/seed.db` (BD inicial)

Al arrancar, `electron/src/main.ts`:
1. Copia `seed.db` a `userData/` si no existe una BD
2. Levanta el servidor Express como proceso hijo
3. Espera a que el backend esté disponible
4. Carga `frontend/dist/index.html` en el BrowserWindow

---

## Patrones de diseño

### Backend

| Patrón | Aplicación |
|---|---|
| Route handler | Cada recurso tiene su propio archivo en `routes/` |
| Middleware chain | `authenticate` → `planLimits` → handler |
| Repository (ligero) | Queries directas via Prisma en los handlers |
| Non-blocking side effects | `logAudit()` y `checkLowStock()` no bloquean la respuesta |
| Singleton | `lib/prisma.ts` exporta una sola instancia de PrismaClient |
| Scheduler | `backupScheduler.ts` usa `setInterval` (6h backups, 24h deudas) |

### Frontend

| Patrón | Aplicación |
|---|---|
| Server state | React Query maneja fetch, caché e invalidación |
| Client state | Zustand para auth y estado global de UI |
| Form state | React Hook Form + Zod para validación |
| Protected routes | HOC wrapper `OwnerOnly` previene acceso de cajeros |
| Event bus (ligero) | `CustomEvent` en `window` para plan-limit (desacoplado de árbol React) |
| Error boundary | Clase React `ErrorBoundary` envuelve toda la app |

---

## Convención de URLs de la API

Todos los recursos de un negocio siguen el patrón:

```
/api/businesses/:businessId/[recurso]
```

Ejemplo:
```
GET  /api/businesses/1/products
POST /api/businesses/1/transactions
GET  /api/businesses/1/stats/dashboard
```

Recursos que no pertenecen a un negocio específico:
```
POST /api/auth/register
POST /api/auth/login
GET  /api/businesses          (lista de negocios del usuario)
```
