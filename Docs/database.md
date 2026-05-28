# Base de Datos

Vendix usa **SQLite** como motor de base de datos gestionado a través de **Prisma ORM**. En entornos de producción cloud se puede migrar a PostgreSQL cambiando únicamente el `provider` en `schema.prisma` y la `DATABASE_URL`.

---

## Configuración

```
# backend/.env
DATABASE_URL="file:./dev.db"
```

Comandos Prisma:

```bash
cd backend
npx prisma db push          # Aplica cambios del schema a la BD sin migraciones
npx prisma generate         # Regenera el cliente tipado de Prisma
npx prisma studio           # UI visual para explorar la BD
npx prisma db push --accept-data-loss   # Para cambios destructivos en dev
```

---

## Diagrama de relaciones

```
User ──────────────┬──── Business ──────┬──── Product ──────── TransactionItem
                   │         │           ├──── Category
                   │         │           ├──── Client ────────── Transaction
                   │         │           ├──── Supplier
                   │         │           ├──── Employee
                   │         │           ├──── Transaction ───── TransactionItem
                   │         │           ├──── Quote ──────────── QuoteItem
                   │         │           ├──── CashSession
                   │         │           ├──── Notification
                   │         │           ├──── AuditLog
                   │         │           └──── Invoice (Stripe)
                   │         │
                   └─── (owner / staff)
```

---

## Modelos

### User

Representa a un usuario registrado en la plataforma. Puede ser propietario (`OWNER`) de uno o varios negocios, o cajero (`CASHIER`) asignado a uno.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | ID auto-incremental |
| `email` | String (unique) | Correo electrónico |
| `password` | String | Hash bcrypt |
| `name` | String | Nombre completo |
| `role` | Enum(`OWNER`, `CASHIER`) | Rol en la plataforma |
| `emailVerified` | Boolean | ¿Email confirmado? |
| `verifyToken` | String? | Token para verificación |
| `resetToken` | String? | Token para reset de contraseña |
| `resetTokenExpiry` | DateTime? | Expiración del reset token |
| `createdAt` | DateTime | Fecha de creación |
| `stripeCustomerId` | String? | ID de cliente Stripe |
| `subscriptionId` | String? | ID de suscripción Stripe |
| `subscriptionStatus` | String? | Estado: `active`, `canceled`, etc. |
| `planExpiresAt` | DateTime? | Fecha de expiración del plan Pro |

**Relaciones:**
- `businesses` → `Business[]` (propietario)
- `staffAt` → `Business?` (negocio donde es cajero)
- `notifications` → `Notification[]`

---

### Business

El negocio es la unidad central de la aplicación. Todos los recursos (productos, clientes, transacciones, etc.) pertenecen a un negocio.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | ID auto-incremental |
| `name` | String | Nombre del negocio |
| `currency` | String | Código ISO (`DOP`, `USD`, `EUR`, etc.) |
| `taxRate` | Float | Tasa de impuesto (ej. `0.18` para 18%) |
| `taxName` | String | Nombre del impuesto (ej. `ITBIS`) |
| `taxIncluded` | Boolean | ¿El impuesto está incluido en el precio? |
| `taxEnabled` | Boolean | ¿Aplicar impuesto en ventas? |
| `lowStockThreshold` | Int | Umbral para alertas de bajo stock |
| `ncfEnabled` | Boolean | ¿Generar NCF? (RD) |
| `ncfType` | String | Tipo de NCF (ej. `B01`, `B02`) |
| `ncfSequence` | Int | Secuencia actual del NCF |
| `autoBackupEnabled` | Boolean | ¿Backup automático activo? |
| `autoBackupInterval` | Int | Intervalo de backup en días |
| `lastBackupAt` | DateTime? | Última vez que se hizo backup |
| `ownerId` | Int (FK) | Propietario (User) |
| `createdAt` | DateTime | Fecha de creación |

**Relaciones:**
- `owner` → `User`
- `staff` → `User[]` (cajeros asignados)
- `products`, `categories`, `clients`, `suppliers`, `employees`, `transactions`, `quotes`, `cashSessions`, `notifications`, `auditLogs`, `invoices`

---

### Product

Producto o servicio del inventario.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | |
| `name` | String | Nombre del producto |
| `description` | String? | Descripción |
| `price` | Float | Precio de venta |
| `cost` | Float | Costo/precio de compra |
| `stock` | Int | Unidades en inventario |
| `barcode` | String? | Código de barras (unique por negocio) |
| `categoryId` | Int? (FK) | Categoría |
| `taxExempt` | Boolean | ¿Exento de impuesto? |
| `businessId` | Int (FK) | Negocio propietario |
| `createdAt` | DateTime | |

**Relaciones:**
- `category` → `Category?`
- `transactionItems` → `TransactionItem[]`
- `quoteItems` → `QuoteItem[]`
- `priceHistory` → `PriceHistory[]`
- `volumePricing` → `VolumePricing[]`

---

### Category

Categoría de productos.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | |
| `name` | String | Nombre de la categoría |
| `businessId` | Int (FK) | |

---

### PriceHistory

Registro de cambios de precio de un producto.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | |
| `productId` | Int (FK) | |
| `oldPrice` | Float | Precio anterior |
| `newPrice` | Float | Precio nuevo |
| `changedAt` | DateTime | Fecha del cambio |

---

### VolumePricing

Precios especiales por cantidad (pricing escalonado).

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | |
| `productId` | Int (FK) | |
| `minQty` | Int | Cantidad mínima para activar el precio |
| `price` | Float | Precio especial |

---

### Client

Cliente del negocio.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | |
| `name` | String | Nombre |
| `email` | String? | Correo |
| `phone` | String? | Teléfono |
| `address` | String? | Dirección |
| `isVip` | Boolean | ¿Cliente VIP? |
| `vipDiscount` | Float | Descuento automático en % (0–1) |
| `businessId` | Int (FK) | |
| `createdAt` | DateTime | |

**Relaciones:**
- `transactions` → `Transaction[]`

---

### Supplier

Proveedor de productos.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | |
| `name` | String | |
| `email` | String? | |
| `phone` | String? | |
| `address` | String? | |
| `businessId` | Int (FK) | |
| `createdAt` | DateTime | |

---

### Employee

Empleado registrado en el negocio.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | |
| `name` | String | |
| `role` | String | Cargo o puesto |
| `salary` | Float? | Salario |
| `phone` | String? | |
| `isActive` | Boolean | ¿Empleado activo? |
| `businessId` | Int (FK) | |
| `createdAt` | DateTime | |

---

### Transaction

Movimiento financiero: venta, gasto, ingreso o compra.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | |
| `type` | Enum | `SALE`, `EXPENSE`, `INCOME`, `PURCHASE` |
| `amount` | Float | Monto total |
| `description` | String? | Descripción libre |
| `paymentMethod` | String | `CASH`, `CARD`, `TRANSFER` |
| `status` | String | `COMPLETED`, `PENDING`, `CANCELLED` |
| `discount` | Float | Descuento aplicado (monto absoluto) |
| `discountType` | String? | `fixed` o `percent` |
| `ncf` | String? | Número de Comprobante Fiscal |
| `taxAmount` | Float | Monto de impuesto calculado |
| `clientId` | Int? (FK) | Cliente asociado (ventas a crédito) |
| `businessId` | Int (FK) | |
| `cashSessionId` | Int? (FK) | Sesión de caja activa |
| `originalCurrency` | String? | Moneda original (multi-moneda) |
| `exchangeRate` | Float? | Tasa de cambio usada |
| `originalAmount` | Float? | Monto en la moneda original |
| `createdAt` | DateTime | |

**Relaciones:**
- `items` → `TransactionItem[]`
- `client` → `Client?`
- `cashSession` → `CashSession?`

---

### TransactionItem

Línea de producto dentro de una transacción.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | |
| `transactionId` | Int (FK) | |
| `productId` | Int? (FK) | Producto (puede ser nulo si fue eliminado) |
| `productName` | String | Nombre snapshot al momento de la venta |
| `quantity` | Int | Cantidad |
| `price` | Float | Precio unitario al momento de la venta |
| `cost` | Float | Costo unitario snapshot |

---

### Quote

Cotización / presupuesto.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | |
| `clientId` | Int? (FK) | Cliente |
| `status` | String | `DRAFT`, `SENT`, `ACCEPTED`, `REJECTED` |
| `expiresAt` | DateTime? | Fecha de vencimiento |
| `notes` | String? | Notas libres |
| `businessId` | Int (FK) | |
| `createdAt` | DateTime | |

**Relaciones:**
- `items` → `QuoteItem[]`

---

### QuoteItem

Línea de producto dentro de una cotización.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | |
| `quoteId` | Int (FK) | |
| `productId` | Int? (FK) | |
| `productName` | String | Snapshot del nombre |
| `quantity` | Int | |
| `price` | Float | Precio en el momento de la cotización |

---

### CashSession

Sesión de caja (turno de apertura/cierre de caja registradora).

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | |
| `openedAt` | DateTime | Hora de apertura |
| `closedAt` | DateTime? | Hora de cierre (null = abierta) |
| `openingAmount` | Float | Efectivo inicial |
| `closingAmount` | Float? | Efectivo al cierre (contado) |
| `expectedAmount` | Float? | Efectivo esperado (calculado) |
| `businessId` | Int (FK) | |

---

### Notification

Notificación in-app para el usuario.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | |
| `userId` | Int (FK) | Destinatario |
| `type` | String | `LOW_STOCK`, `PENDING_DEBT`, `INFO` |
| `title` | String | Título de la notificación |
| `body` | String | Cuerpo / descripción |
| `link` | String? | URL destino al hacer clic |
| `read` | Boolean | ¿Leída? |
| `createdAt` | DateTime | |

---

### Invoice

Registro de facturas de Stripe (plan Pro).

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | |
| `businessId` | Int (FK) | |
| `stripeInvoiceId` | String | ID de Stripe |
| `amount` | Float | Monto cobrado |
| `currency` | String | Moneda (usd) |
| `status` | String | `paid`, `open`, etc. |
| `pdfUrl` | String? | URL al PDF de Stripe |
| `createdAt` | DateTime | |

---

### AuditLog

Registro de auditoría de todas las acciones relevantes.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | |
| `userId` | Int | Usuario que realizó la acción |
| `businessId` | Int | Negocio afectado |
| `action` | String | `CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `REGISTER` |
| `entity` | String | `TRANSACTION`, `PRODUCT`, `AUTH`, etc. |
| `entityId` | String? | ID del registro afectado |
| `meta` | String? | JSON con detalles adicionales |
| `ip` | String? | Dirección IP del cliente |
| `createdAt` | DateTime | |

---

## Índices y rendimiento

Prisma crea automáticamente índices en todos los campos `@unique` y las FKs. Para tablas con alto volumen (`transactions`, `auditLogs`) se recomienda añadir índices compuestos en una migración futura:

```prisma
@@index([businessId, createdAt])
@@index([businessId, type])
```

---

## Migraciones

El proyecto usa `prisma db push` en lugar de `prisma migrate` para mayor agilidad en desarrollo. Al pasar a producción en PostgreSQL, se recomienda cambiar a `prisma migrate deploy` para mantener un historial de migraciones.
