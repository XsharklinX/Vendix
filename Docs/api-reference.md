# API Reference

Base URL: `http://localhost:3001/api`  
Documentación interactiva: `http://localhost:3001/api/docs` (Swagger UI)

Todos los endpoints protegidos requieren el header:
```
Authorization: Bearer <jwt_token>
```

---

## Autenticación (`/auth`)

### `POST /auth/register`
Crea una cuenta nueva con su primer negocio.

**Body:**
```json
{
  "name": "Juan Pérez",
  "email": "juan@email.com",
  "password": "min8chars",
  "businessName": "Mi Tienda"
}
```
**Respuesta 201:** `{ token, user, business }`

---

### `POST /auth/login`
Inicia sesión. Soporta propietarios y cajeros.

**Body:** `{ email, password }`  
**Respuesta 200:** `{ token, user, business }`  
**Errores:** `401` credenciales inválidas · `403` email no verificado

---

### `POST /auth/forgot-password`
Envía email con link de reset.

**Body:** `{ email }`  
**Respuesta 200:** `{ message }`

---

### `POST /auth/reset-password`
Aplica el nuevo password con el token del email.

**Body:** `{ token, password }`  
**Respuesta 200:** `{ message }`

---

### `GET /auth/verify-email?token=xxx`
Verifica el correo electrónico del usuario.

**Respuesta 200:** `{ message }`

---

### `POST /auth/staff` 🔒 Owner
Crea un usuario cajero y lo asocia al negocio.

**Body:** `{ name, email, password, businessId }`  
**Respuesta 201:** `{ user }`

---

### `DELETE /auth/staff/:userId` 🔒 Owner
Elimina un cajero del negocio.

---

## Negocios (`/businesses`)

### `GET /businesses` 🔒
Lista todos los negocios del usuario autenticado.

**Respuesta 200:** `Business[]`

---

### `POST /businesses` 🔒 Owner
Crea un negocio adicional.

**Body:** `{ name, currency? }`  
**Respuesta 201:** `Business`

---

### `GET /businesses/:id` 🔒
Obtiene un negocio por ID (verifica pertenencia).

---

### `PUT /businesses/:id` 🔒 Owner
Actualiza configuración del negocio.

**Body (campos opcionales):**
```json
{
  "name": "string",
  "currency": "DOP",
  "taxRate": 0.18,
  "taxName": "ITBIS",
  "taxIncluded": true,
  "taxEnabled": true,
  "lowStockThreshold": 5,
  "ncfEnabled": true,
  "ncfType": "B01",
  "autoBackupEnabled": true,
  "autoBackupInterval": 7
}
```

---

### `DELETE /businesses/:id` 🔒 Owner
Elimina el negocio y todos sus datos (cascade).

---

### `GET /businesses/:id/export` 🔒
Exporta todos los datos del negocio como JSON.

---

### `GET /businesses/:id/ncf` 🔒
Obtiene y auto-incrementa el siguiente número NCF.

**Respuesta:** `{ ncf: "B01-00000001" }`

---

## Productos (`/businesses/:bId/products`)

### `GET /businesses/:bId/products` 🔒
Lista todos los productos del negocio.

**Query params:** `?search=&categoryId=&lowStock=true`  
**Respuesta 200:** `Product[]` (incluye `category`, `volumePricing`)

---

### `POST /businesses/:bId/products` 🔒 · Plan limit: 300
Crea un producto.

**Body:**
```json
{
  "name": "string",
  "price": 100.0,
  "cost": 60.0,
  "stock": 50,
  "barcode": "string?",
  "categoryId": 1,
  "taxExempt": false,
  "description": "string?"
}
```

---

### `PUT /businesses/:bId/products/:id` 🔒
Actualiza un producto. Si cambia el precio, guarda en `PriceHistory`.

---

### `DELETE /businesses/:bId/products/:id` 🔒 Owner
Elimina un producto.

---

### `GET /businesses/:bId/products/:id/price-history` 🔒
Historial de cambios de precio.

---

### `POST /businesses/:bId/products/bulk` 🔒
Importación masiva desde CSV/Excel.

**Body:** `{ products: Product[] }`  
**Respuesta:** `{ created, skipped, errors }`

---

### `GET /businesses/:bId/categories` 🔒
Lista categorías del negocio.

### `POST /businesses/:bId/categories` 🔒
Crea una categoría. **Body:** `{ name }`

### `DELETE /businesses/:bId/categories/:id` 🔒 Owner

---

### `POST /businesses/:bId/products/:id/volume-pricing` 🔒
Añade un nivel de precio por volumen.

**Body:** `{ minQty, price }`

### `DELETE /businesses/:bId/products/:id/volume-pricing/:vpId` 🔒

---

## Transacciones (`/businesses/:bId/transactions`)

### `GET /businesses/:bId/transactions` 🔒
Lista movimientos con paginación y filtros.

**Query params:** `?type=SALE&status=COMPLETED&from=2025-01-01&to=2025-12-31&page=1&limit=50`  
**Respuesta:** `{ transactions, total, page, pages }`

---

### `POST /businesses/:bId/transactions` 🔒 · Plan limit: 1000/mes
Registra un movimiento. Para ventas con ítems, descuenta el stock automáticamente.

**Body:**
```json
{
  "type": "SALE",
  "amount": 500.0,
  "description": "Venta al por mayor",
  "paymentMethod": "CASH",
  "status": "COMPLETED",
  "discount": 50.0,
  "discountType": "fixed",
  "clientId": 1,
  "ncf": "B01-00000001",
  "originalCurrency": "USD",
  "exchangeRate": 58.5,
  "originalAmount": 8.55,
  "items": [
    { "productId": 1, "quantity": 2, "price": 250.0, "cost": 150.0 }
  ]
}
```

**Side effects:** `logAudit()` + `checkLowStock()`

---

### `PUT /businesses/:bId/transactions/:id` 🔒
Actualiza estado de una transacción (ej. `PENDING` → `COMPLETED`).

---

### `DELETE /businesses/:bId/transactions/:id` 🔒 Owner
Anula / devuelve una transacción. Restaura stock si aplica.

---

### `GET /businesses/:bId/cash-sessions` 🔒
Lista sesiones de caja.

### `POST /businesses/:bId/cash-sessions` 🔒
Abre una sesión de caja. **Body:** `{ openingAmount }`

### `PUT /businesses/:bId/cash-sessions/:id` 🔒
Cierra una sesión. **Body:** `{ closingAmount }`

---

## Clientes (`/businesses/:bId/clients`)

### `GET /businesses/:bId/clients` 🔒
Lista clientes. Incluye suma de deudas pendientes.

**Query params:** `?search=`

### `POST /businesses/:bId/clients` 🔒 · Plan limit: 500
**Body:** `{ name, email?, phone?, address?, isVip?, vipDiscount? }`

### `PUT /businesses/:bId/clients/:id` 🔒

### `DELETE /businesses/:bId/clients/:id` 🔒 Owner

---

## Proveedores (`/businesses/:bId/suppliers`)

### `GET /businesses/:bId/suppliers` 🔒
### `POST /businesses/:bId/suppliers` 🔒 · **Body:** `{ name, email?, phone?, address? }`
### `PUT /businesses/:bId/suppliers/:id` 🔒
### `DELETE /businesses/:bId/suppliers/:id` 🔒 Owner

---

## Empleados (`/businesses/:bId/employees`)

### `GET /businesses/:bId/employees` 🔒
### `POST /businesses/:bId/employees` 🔒 · **Body:** `{ name, role, salary?, phone?, isActive? }`
### `PUT /businesses/:bId/employees/:id` 🔒
### `DELETE /businesses/:bId/employees/:id` 🔒 Owner

---

## Cotizaciones (`/businesses/:bId/quotes`)

### `GET /businesses/:bId/quotes` 🔒
**Query params:** `?status=DRAFT`

### `POST /businesses/:bId/quotes` 🔒
**Body:**
```json
{
  "clientId": 1,
  "status": "DRAFT",
  "expiresAt": "2025-12-31",
  "notes": "string?",
  "items": [{ "productId": 1, "quantity": 2, "price": 100 }]
}
```

### `PUT /businesses/:bId/quotes/:id` 🔒
### `DELETE /businesses/:bId/quotes/:id` 🔒 Owner

---

## Estadísticas (`/businesses/:bId/stats`)

### `GET /businesses/:bId/stats/dashboard` 🔒
Endpoint consolidado con todas las métricas del dashboard en una sola petición.

**Respuesta:**
```json
{
  "today": { "sales": 0, "count": 0 },
  "yesterday": { "sales": 0, "count": 0 },
  "month": { "sales": 0, "expenses": 0, "income": 0, "profit": 0 },
  "topProducts": [{ "name": "", "quantity": 0, "revenue": 0 }],
  "cashSession": { "id": 0, "openingAmount": 0, "openedAt": "" } | null
}
```

---

### `GET /businesses/:bId/stats` 🔒
Estadísticas generales con rango de fechas.

**Query params:** `?from=&to=`  
**Respuesta:** totales por tipo, conteos, promedio diario.

---

### `GET /businesses/:bId/stats/chart` 🔒
Datos para gráfica de ventas de los últimos 30 días.

**Respuesta:** `[{ date: "2025-01-01", sales: 0, expenses: 0 }]`

---

### `GET /businesses/:bId/stats/top-products` 🔒
Top 5 productos por cantidad vendida en el mes.

---

### `GET /businesses/:bId/stats/margin-by-category` 🔒
Margen por categoría de producto.

**Respuesta:** `[{ category, revenue, cost, margin, marginPct }]`

---

### `GET /businesses/:bId/stats/loss-products` 🔒
Productos con margen negativo o menor al 10%.

---

### `GET /businesses/:bId/stats/sales-gaps` 🔒
Días sin ventas en el período.

**Query params:** `?from=&to=`

---

## Notificaciones (`/businesses/:bId/notifications`)

### `GET /businesses/:bId/notifications` 🔒
Lista notificaciones del usuario autenticado.

**Query params:** `?unreadOnly=true`

### `PUT /businesses/:bId/notifications/:id/read` 🔒
Marca una notificación como leída.

### `PUT /businesses/:bId/notifications/read-all` 🔒
Marca todas como leídas.

### `DELETE /businesses/:bId/notifications/:id` 🔒

---

## Auditoría (`/businesses/:bId/audit`)

### `GET /businesses/:bId/audit` 🔒 Owner
Lista el log de auditoría con paginación.

**Query params:** `?entity=TRANSACTION&action=CREATE&page=1&limit=50`  
**Respuesta:** `{ logs: AuditLog[], total, page, pages }`

---

## Facturación / Billing (`/billing`)

### `GET /billing/status` 🔒
Estado actual de la suscripción del usuario.

**Respuesta:** `{ plan: "FREE"|"PRO", status, expiresAt, invoices }`

---

### `POST /billing/checkout` 🔒
Crea una sesión de Stripe Checkout para upgrade.

**Body:** `{ priceId, successUrl, cancelUrl }`  
**Respuesta:** `{ url }` (redirigir al usuario)

---

### `POST /billing/portal` 🔒
Abre el portal de facturación de Stripe (cancelar, cambiar método de pago).

**Respuesta:** `{ url }`

---

### `POST /billing/webhook`
Webhook de Stripe (requiere `Stripe-Signature` header y body raw).  
Maneja: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`.

---

## WhatsApp (`/businesses/:bId/whatsapp`)

### `POST /businesses/:bId/whatsapp/reminder/:clientId` 🔒
Envía un recordatorio de deuda a un cliente específico por WhatsApp.

---

### `POST /businesses/:bId/whatsapp/bulk-reminder` 🔒
Envía recordatorios a todos los clientes con deuda pendiente.

**Respuesta:** `{ sent, failed, total }`

---

## Códigos de error estándar

| Código | Significado |
|---|---|
| `400` | Validación fallida (Zod) |
| `401` | Token inválido o expirado |
| `402` | Límite del plan gratuito alcanzado |
| `403` | Sin permisos (CASHIER intentando acción de OWNER) |
| `404` | Recurso no encontrado |
| `409` | Conflicto (ej. email ya registrado) |
| `429` | Rate limit excedido |
| `500` | Error interno del servidor |
