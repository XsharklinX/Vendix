# Autenticación y Seguridad

## Modelo de autenticación

Vendix usa **JWT (JSON Web Tokens)** sin estado de sesión en el servidor. Cada token tiene una validez de **30 días** y se almacena en el cliente (localStorage / Zustand store).

---

## Flujo de registro

```
POST /auth/register
  │
  ├─ Validación Zod (name, email, password ≥8, businessName)
  ├─ Verifica email único
  ├─ bcrypt.hash(password, 10)
  ├─ Prisma.create(User) + Prisma.create(Business)
  ├─ Genera verifyToken (random hex 32)
  ├─ Envía email de verificación con link
  │     → APP_URL/verify-email?token=xxx
  └─ Retorna { token, user, business }
```

El usuario puede usar la app sin verificar el email, pero algunas funciones pueden requerirlo.

---

## Flujo de login

```
POST /auth/login
  │
  ├─ Busca User por email
  ├─ bcrypt.compare(password, user.password)
  ├─ Si OWNER → busca primer Business de ese owner
  ├─ Si CASHIER → busca el Business al que está asignado (staffAt)
  ├─ Genera JWT { userId, businessId }
  └─ Retorna { token, user, business }
```

---

## Flujo de reset de contraseña

```
POST /auth/forgot-password
  ├─ Genera resetToken (random hex 32)
  ├─ Guarda resetToken + resetTokenExpiry (1 hora)
  └─ Envía email con link → APP_URL/reset-password?token=xxx

POST /auth/reset-password
  ├─ Busca User con resetToken válido y no expirado
  ├─ bcrypt.hash(newPassword, 10)
  └─ Limpia resetToken y resetTokenExpiry
```

---

## JWT

**Librería:** `jsonwebtoken`  
**Expiración:** `30d`  
**Payload:**

```ts
{
  userId: number;
  businessId: number;
  iat: number;
  exp: number;
}
```

**Generación (`lib/jwt.ts`):**
```ts
export const signToken = (userId: number, businessId: number): string =>
  jwt.sign({ userId, businessId }, process.env.JWT_SECRET!, { expiresIn: '30d' });
```

**Verificación:**
```ts
export const verifyToken = (token: string) =>
  jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
```

---

## Middleware de autenticación (`middleware/auth.ts`)

Se aplica a todos los endpoints protegidos.

```
Request llega con: Authorization: Bearer <token>
  │
  ├─ Extrae token del header
  ├─ jwt.verify(token, JWT_SECRET)
  ├─ Adjunta req.userId y req.businessId al request
  └─ next()
  
  Si falla: 401 { error: "Token inválido" }
```

---

## Roles y permisos

### OWNER
- Acceso completo a todas las funciones
- Puede crear/eliminar cajeros
- Puede eliminar recursos (productos, clientes, etc.)
- Accede a configuración del negocio y billing

### CASHIER
- Solo puede ver y crear (no eliminar)
- No accede a: Configuraciones, Reportes, AuditLog, Empleados
- Puede: vender, ver inventario, ver clientes, registrar movimientos

**Middleware `verifyBusiness` (`lib/verifyBusiness.ts`):**

```ts
export const verifyBusiness = async (req, businessId, requireOwner = false) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  
  if (user.role === 'CASHIER') {
    if (requireOwner) throw new ForbiddenError();
    if (user.staffAtId !== businessId) throw new ForbiddenError();
  } else {
    // OWNER: verifica que el negocio le pertenezca
    const biz = await prisma.business.findFirst({ where: { id: businessId, ownerId: req.userId } });
    if (!biz) throw new NotFoundError();
  }
};
```

En las rutas que requieren OWNER se llama con `requireOwner = true`.

---

## Límites del plan gratuito (`middleware/planLimits.ts`)

| Recurso | Límite gratuito |
|---|---|
| Productos | 300 |
| Clientes | 500 |
| Transacciones por mes | 1.000 |

El middleware se inserta **antes del handler** en los endpoints de creación:

```
POST /products → checkProductLimit → handler
POST /clients  → checkClientLimit  → handler
POST /transactions → checkTransactionLimit → handler
```

Si se supera el límite:
- Retorna `402 Payment Required`
- El interceptor de Axios en el frontend dispara `emitPlanLimit()`
- Se muestra el modal `PlanLimitModal` con CTA de upgrade

---

## Rate limiting (`middleware/rateLimiter.ts`)

Dos configuraciones distintas:

| Endpoint | Límite | Ventana |
|---|---|---|
| `/auth/*` | 20 requests | 15 minutos |
| `/api/*` (resto) | 300 requests | 1 minuto |

Basado en `express-rate-limit`. Identifica clientes por IP.

Si se excede: `429 Too Many Requests`.

---

## Seguridad de contraseñas

- Hash con **bcrypt** con factor de costo `10`
- La contraseña nunca se retorna en ninguna respuesta de la API
- Mínimo 8 caracteres (validado con Zod)

---

## CORS

Configurado en `backend/src/index.ts`:

```ts
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
  credentials: true
}));
```

En modo desktop (Electron), el renderer carga el frontend estático directamente, sin necesidad de CORS.

---

## Auditoría (`lib/audit.ts`)

Todas las operaciones relevantes generan un `AuditLog` de forma **no bloqueante**:

```ts
export const logAudit = (
  req: Request,
  businessId: number,
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'REGISTER',
  entity: string,
  entityId?: string | number,
  meta?: Record<string, unknown>
) => {
  prisma.auditLog.create({
    data: {
      userId: req.userId!,
      businessId,
      action,
      entity,
      entityId: entityId?.toString(),
      meta: meta ? JSON.stringify(meta) : null,
      ip: req.ip
    }
  }).catch(console.error); // non-blocking
};
```

Entidades auditadas: `TRANSACTION`, `PRODUCT`, `AUTH`, `BUSINESS`, `CLIENT`.

---

## Seguridad del webhook de Stripe

El endpoint `/billing/webhook` usa body raw (antes de que el JSON parser lo procese) para verificar la firma:

```ts
app.post('/billing/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
    // ...
  }
);
```

Sin este paso, cualquier POST podría simular eventos de Stripe.

---

## Recomendaciones para producción

1. Cambiar `JWT_SECRET` por un valor aleatorio de ≥64 caracteres
2. Configurar `CORS_ORIGIN` con el dominio real del frontend
3. Usar HTTPS (certificado TLS) en el servidor Express
4. Migrar SQLite a PostgreSQL para entornos multi-usuario
5. Considerar `contextIsolation: true` + preload script en Electron
6. Habilitar `helmet` para headers de seguridad HTTP
