# Frontend

## Stack y herramientas

| Herramienta | Rol |
|---|---|
| React 18 | UI framework |
| TypeScript | Tipado estático |
| Vite | Bundler + dev server |
| Tailwind CSS | Estilos utilitarios |
| React Router DOM v6 | Enrutamiento SPA |
| TanStack React Query v5 | Server state, caché, refetch |
| Zustand | Estado global del cliente |
| React Hook Form + Zod | Formularios con validación |
| Recharts | Gráficas |
| Axios | Cliente HTTP con interceptores |
| react-hot-toast | Notificaciones toast |
| Lucide React | Iconos SVG |
| date-fns | Utilidades de fecha |

---

## Estructura de archivos

```
frontend/src/
├── main.tsx                        # Punto de entrada React
├── App.tsx                         # Router + QueryClient + Toaster
│
├── pages/
│   ├── auth/
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── ForgotPassword.tsx
│   │   ├── ResetPassword.tsx
│   │   └── VerifyEmail.tsx
│   ├── Dashboard.tsx
│   ├── Vender.tsx
│   ├── Movimientos.tsx
│   ├── Inventario.tsx
│   ├── Estadísticas.tsx
│   ├── Cotizaciones.tsx
│   ├── Clientes.tsx
│   ├── Proveedores.tsx
│   ├── Empleados.tsx
│   ├── Caja.tsx
│   ├── CuentasCobrar.tsx
│   ├── Reportes.tsx
│   ├── Configuraciones.tsx
│   ├── AuditLog.tsx
│   └── Onboarding.tsx
│
├── components/
│   ├── Layout/
│   │   ├── Layout.tsx
│   │   └── Sidebar.tsx
│   └── ui/
│       ├── Modal.tsx
│       ├── EmptyState.tsx
│       ├── ConfirmDialog.tsx
│       ├── PageHeader.tsx
│       ├── NotificationBell.tsx
│       ├── ErrorBoundary.tsx
│       ├── PlanLimitModal.tsx
│       └── ImportCSV.tsx
│
├── store/
│   └── auth.ts                     # Zustand auth store
│
├── hooks/
│   └── usePlanLimit.ts
│
└── lib/
    ├── api.ts
    ├── utils.ts
    ├── export.ts
    └── generateInvoicePdf.ts
```

---

## Enrutamiento (`App.tsx`)

```tsx
// Rutas públicas (sin Layout)
/login
/register
/forgot-password
/reset-password
/verify-email
/onboarding

// Rutas protegidas (con Layout, requieren JWT)
/                    → Dashboard
/vender              → Vender
/movimientos         → Movimientos
/inventario          → Inventario
/estadisticas        → Estadísticas
/cotizaciones        → Cotizaciones
/clientes            → Clientes
/proveedores         → Proveedores
/empleados           → Empleados  [OwnerOnly]
/caja                → Caja
/cuentas-cobrar      → CuentasCobrar
/reportes            → Reportes   [OwnerOnly]
/configuraciones     → Configuraciones [OwnerOnly]
/audit               → AuditLog   [OwnerOnly]
```

### Guards de ruta

**PrivateRoute:** Si no hay token en el store → redirige a `/login`.

**OwnerOnly:** Si el usuario es `CASHIER` → redirige al Dashboard. Envuelve rutas de administración.

---

## Estado global — Zustand (`store/auth.ts`)

```ts
interface AuthState {
  user: User | null;
  business: Business | null;
  token: string | null;

  login: (user, business, token) => void;
  logout: () => void;
  setBusiness: (business) => void;  // cambio de negocio activo
  updateBusiness: (partial) => void; // actualizar campos del negocio
}
```

El store persiste en `localStorage` mediante `zustand/middleware/persist`.

Al hacer `logout()`:
- Limpia el store
- Elimina el token de localStorage
- React Query invalida todas las queries

---

## Server state — React Query

**Configuración global en `App.tsx`:**
```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,  // 30 segundos antes de considerar datos obsoletos
      retry: 1,
    },
  },
});
```

### Patrón de uso en páginas

```tsx
// Fetch
const { data: products, isLoading } = useQuery({
  queryKey: ['products', businessId],
  queryFn: () => api.get(`/businesses/${businessId}/products`).then(r => r.data),
});

// Mutación con invalidación
const createMutation = useMutation({
  mutationFn: (data) => api.post(`/businesses/${businessId}/products`, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products', businessId] });
    toast.success('Producto creado');
  },
});
```

### Query keys convención

```
['products', businessId]
['clients', businessId]
['transactions', businessId, filters]
['stats-dashboard', businessId]
['notifications', businessId]
['billing-status']
```

---

## Cliente HTTP — Axios (`lib/api.ts`)

```ts
const api = axios.create({ baseURL: '/api' });

// Request interceptor: añade JWT
api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    if (err.response?.status === 402 || err.response?.status === 429) {
      emitPlanLimit(err.response.data?.message);
    }
    return Promise.reject(err);
  }
);
```

---

## Formularios

Todos los formularios usan **React Hook Form** con validación **Zod**:

```tsx
const schema = z.object({
  name: z.string().min(1, 'Requerido'),
  price: z.number().positive('Debe ser mayor a 0'),
});

const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(schema),
});
```

---

## Componentes UI

### `Layout.tsx`
Wrapper de todas las páginas protegidas. Contiene:
- Sidebar (desktop)
- Mobile menu toggle
- `NotificationBell` en el header
- `PlanLimitModal` (siempre montado, oculto hasta que se dispara)

### `Sidebar.tsx`
Navegación principal con secciones:
- **Gestiona tu negocio:** Dashboard, Vender, Movimientos, Estadísticas, Inventario, Cotizaciones, Caja
- **Contactos:** Clientes, Proveedores, Empleados
- **Cuenta:** Configuraciones, AuditLog, Reportes

Badges en tiempo real:
- **Stock bajo:** query a `/products?lowStock=true`, muestra contador en ítem de Inventario
- **Caja abierta:** query a `/cash-sessions`, muestra punto verde en ítem de Caja

### `NotificationBell.tsx`
- Icono de campana en el header con badge numérico
- Panel desplegable al hacer clic
- Muestra últimas 10 notificaciones no leídas
- Acciones: leer una, leer todas

### `PlanLimitModal.tsx`
- Modal de upgrade que aparece cuando el backend devuelve `402`
- No está en el árbol de la pantalla actual; se comunica mediante evento personalizado
- Listado de beneficios Pro
- Botón que navega a `/configuraciones?tab=billing`

### `ErrorBoundary.tsx`
Componente de clase React que envuelve toda la app en `App.tsx`. Captura errores no controlados en el árbol de componentes y muestra una pantalla de error con botón de recarga.

### `Modal.tsx`
Wrapper genérico de diálogo modal con overlay, accesibilidad (foco atrapado) y cierre con Escape.

### `ImportCSV.tsx`
Componente de drag-and-drop + file picker para subir CSV/Excel. Parsea el archivo en el cliente y llama a `onData(rows)`.

---

## Hook de plan limit (`hooks/usePlanLimit.ts`)

Sistema de evento personalizado para desacoplar el modal del árbol React:

```ts
export const PLAN_LIMIT_EVENT = 'plan-limit-reached';

export const emitPlanLimit = (message?: string) =>
  window.dispatchEvent(new CustomEvent(PLAN_LIMIT_EVENT, { detail: { message } }));

export const usePlanLimit = () => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    const handler = (e: Event) => {
      setMessage((e as CustomEvent).detail?.message);
      setOpen(true);
    };
    window.addEventListener(PLAN_LIMIT_EVENT, handler);
    return () => window.removeEventListener(PLAN_LIMIT_EVENT, handler);
  }, []);

  return { open, message, close: () => setOpen(false) };
};
```

---

## Utilidades (`lib/utils.ts`)

```ts
formatCurrency(amount, currency)  // Formatea con Intl.NumberFormat
formatDate(date)                   // dd/MM/yyyy
getTypeLabel(type)                 // 'SALE' → 'Venta'
getStatusLabel(status)             // 'PENDING' → 'Pendiente'
calcMargin(price, cost)            // Retorna % de margen
```

---

## Exportación de datos (`lib/export.ts`)

```ts
exportToCsv(data: Record<string, unknown>[], filename: string)
// Genera un blob CSV y dispara la descarga
```

---

## Generación de facturas PDF (`lib/generateInvoicePdf.ts`)

```ts
interface InvoiceData {
  business: { name, currency, taxName, taxRate };
  transaction: { id, createdAt, paymentMethod, ncf? };
  client?: { name, phone? };
  items: { productName, quantity, price, cost }[];
  totals: { subtotal, tax, discount, total };
}

export const generateInvoicePdf = (data: InvoiceData) => {
  const win = window.open('', '_blank');
  win.document.write(/* HTML A4 con estilos inline */);
  win.document.close();
  win.print();
};
```

Genera un HTML completo con diseño de factura A4 y llama a `window.print()`. No requiere dependencias externas.

---

## Proxy Vite (`vite.config.ts`)

```ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
});
```

Todas las llamadas a `/api/*` se proxean al backend en desarrollo, evitando problemas de CORS.
