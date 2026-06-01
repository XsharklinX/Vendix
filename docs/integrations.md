# Integraciones externas

---

## Email — Resend / SMTP (`lib/email.ts`)

### Descripción
La app abstrae el envío de email detrás de una función `sendEmail()` que detecta automáticamente el proveedor disponible en las variables de entorno.

### Prioridad de proveedor
1. **Resend** — si `RESEND_API_KEY` está presente
2. **SMTP** — si `SMTP_HOST` está presente
3. **Consola** — en desarrollo sin configuración (imprime en stdout)

### API interna

```ts
sendEmail({
  to: string,
  subject: string,
  html: string,
  attachments?: { filename: string; content: Buffer }[]
})
```

### Emails que envía la app

| Evento | Asunto | Contenido |
|---|---|---|
| Registro | "Verifica tu correo — Vendix" | Link de verificación con token |
| Reset de contraseña | "Restablecer contraseña" | Link con token (expira en 1h) |
| Backup automático | "Backup de [negocio] — [fecha]" | JSON adjunto con todos los datos |

### Configuración Resend

```env
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=noreply@tudominio.com
```

### Configuración SMTP

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tucuenta@gmail.com
SMTP_PASS=tu_app_password
EMAIL_FROM=tucuenta@gmail.com
```

> Para Gmail es necesario generar una "Contraseña de aplicación" en la configuración de seguridad de Google.

---

## Stripe — Billing (`routes/billing.ts`)

### Descripción
Gestión de suscripciones Pro. Usa Stripe Checkout para el pago y el Customer Portal para la gestión de facturación.

### Flujo de upgrade (Free → Pro)

```
Usuario hace clic en "Upgrade" en Configuraciones → Suscripción
  │
  POST /billing/checkout { priceId, successUrl, cancelUrl }
  │
  Backend: stripe.checkout.sessions.create({
    customer_email: user.email,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url, cancel_url
  })
  │
  Frontend recibe { url } → window.location.href = url
  │
  Usuario completa el pago en Stripe Checkout
  │
  Stripe envía webhook → POST /billing/webhook
  │
  Backend: actualiza User.subscriptionStatus = 'active'
           actualiza User.planExpiresAt
           crea Invoice en BD
```

### Webhook eventos manejados

| Evento Stripe | Acción en la app |
|---|---|
| `checkout.session.completed` | Guarda `stripeCustomerId` y `subscriptionId` en User |
| `customer.subscription.updated` | Actualiza `subscriptionStatus` y `planExpiresAt` |
| `customer.subscription.deleted` | Marca suscripción como cancelada (`subscriptionStatus = 'canceled'`) |
| `invoice.paid` | Crea registro en tabla `Invoice` |

### Portal de facturación

```
POST /billing/portal
  │
  Backend: stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: APP_URL + '/configuraciones?tab=billing'
  })
  │
  Frontend recibe { url } → window.open(url)
```

Permite al usuario: cambiar método de pago, ver facturas pasadas, cancelar suscripción.

### Variables de entorno requeridas

```env
STRIPE_SECRET_KEY=sk_live_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
STRIPE_PRO_PRICE_ID=price_xxxx        # Precio mensual
STRIPE_PRO_YEARLY_PRICE_ID=price_xxxx # Precio anual
```

### Planes y límites

| Plan | Precio | Productos | Clientes | Transacciones/mes |
|---|---|---|---|---|
| Free | $0 | 300 | 500 | 1.000 |
| Pro | Configurable en Stripe | Ilimitado | Ilimitado | Ilimitado |

---

## WhatsApp — Twilio (`routes/whatsapp.ts`)

### Descripción
Envío de recordatorios de deuda a clientes vía WhatsApp Business API usando Twilio.

### Endpoints

**Individual:**
```
POST /businesses/:bId/whatsapp/reminder/:clientId
```
Envía un mensaje con el monto de deuda pendiente del cliente.

**Masivo:**
```
POST /businesses/:bId/whatsapp/bulk-reminder
```
Busca todos los clientes con transacciones en estado `PENDING` y envía un mensaje a cada uno que tenga teléfono registrado.

**Respuesta:**
```json
{ "sent": 5, "failed": 1, "total": 6 }
```

### Plantilla del mensaje

```
Hola [nombre del cliente],

Te recordamos que tienes un saldo pendiente de [monto] en [nombre del negocio].

Por favor contáctanos para coordinar el pago.

Gracias.
```

### Variables de entorno requeridas

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

> El número `+14155238886` es el sandbox de Twilio. En producción se requiere un número aprobado de WhatsApp Business.

### Requisito del cliente
El cliente debe tener el campo `phone` registrado en el formato internacional: `+18095551234`.

---

## Swagger / OpenAPI (`lib/swagger.ts`)

### Descripción
Documentación interactiva de la API generada automáticamente con OpenAPI 3.0.

### Acceso
- **UI:** `http://localhost:3001/api/docs`
- **JSON spec:** `http://localhost:3001/api/docs.json`

### Configuración en `index.ts`

```ts
import { setupSwagger } from './lib/swagger';
setupSwagger(app); // registra las rutas /api/docs y /api/docs.json
```

### Características
- Todos los endpoints documentados con parámetros, body schemas y respuestas
- Autenticación Bearer JWT integrada en la UI (botón "Authorize")
- Generación automática de modelos Zod → OpenAPI schema

---

## Backup automático (`lib/backupScheduler.ts`)

### Descripción
Scheduler de backups periódicos con entrega por email.

### Cómo funciona

```
startBackupScheduler()
  ├─ setInterval(runBackupScheduler, 6 horas)
  └─ setInterval(runDailyNotifications, 24 horas)

runBackupScheduler()
  ├─ Busca todos los Business con autoBackupEnabled = true
  ├─ Para cada uno: verifica si han pasado autoBackupInterval días desde lastBackupAt
  ├─ buildBackupPayload(businessId): consulta productos, transacciones, clientes, proveedores, empleados, cotizaciones
  ├─ Serializa a JSON
  ├─ sendEmail() con adjunto: backup-[negocio]-[fecha].json
  └─ Actualiza lastBackupAt = now()

runDailyNotifications()
  └─ Para cada negocio: checkPendingDebts(businessId, ownerId)
```

### Payload del backup

```json
{
  "business": { ... },
  "products": [ ... ],
  "transactions": [ ... ],
  "transactionItems": [ ... ],
  "clients": [ ... ],
  "suppliers": [ ... ],
  "employees": [ ... ],
  "quotes": [ ... ],
  "quoteItems": [ ... ],
  "exportedAt": "ISO timestamp"
}
```

### Configuración del intervalo

El usuario elige el intervalo en Configuraciones → Backup:
- Diario: 1 día
- Semanal: 7 días
- Quincenal: 15 días
- Mensual: 30 días

El scheduler comprueba cada 6 horas, pero solo envía si han pasado `autoBackupInterval` días desde el último envío.

---

## Integración desktop — Electron

Ver [build-deploy.md](build-deploy.md) para el detalle completo del modo escritorio.

En resumen, `electron/src/main.ts`:
1. Levanta el servidor Express como proceso hijo (`child_process.spawn`)
2. Espera hasta que el backend responde en el puerto configurado
3. Crea un `BrowserWindow` y carga `frontend/dist/index.html`
4. El frontend hace las llamadas a `/api/*` que Electron intercepta y redirige al backend local
