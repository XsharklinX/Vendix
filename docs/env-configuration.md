# Variables de entorno

Archivo: `backend/.env`

---

## Base de datos

| Variable | Requerida | Ejemplo | Descripción |
|---|---|---|---|
| `DATABASE_URL` | Sí | `file:./dev.db` | Cadena de conexión Prisma. Para SQLite: `file:./dev.db`. Para PostgreSQL: `postgresql://user:pass@host:5432/db` |

---

## Servidor

| Variable | Requerida | Ejemplo | Descripción |
|---|---|---|---|
| `PORT` | No | `3001` | Puerto en el que escucha Express. Por defecto `3001` |
| `NODE_ENV` | No | `development` | Entorno de ejecución. Afecta logging de Prisma y comportamiento de errores |
| `APP_URL` | Sí | `http://localhost:5173` | URL del frontend. Se usa para construir links en los emails (verificación, reset) |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Orígenes permitidos por CORS. Separados por coma para múltiples orígenes |
| `FRONTEND_DIST` | No | `../frontend/dist` | Ruta al build del frontend. Solo en modo desktop para servir estáticos desde Express |

---

## Autenticación

| Variable | Requerida | Ejemplo | Descripción |
|---|---|---|---|
| `JWT_SECRET` | Sí | `cambiar_en_produccion_64chars` | Clave secreta para firmar los JWT. Usar al menos 64 caracteres aleatorios en producción |

---

## Email

Solo se necesita configurar uno de los dos proveedores (Resend tiene prioridad sobre SMTP).

### Resend (recomendado)

| Variable | Requerida | Ejemplo | Descripción |
|---|---|---|---|
| `RESEND_API_KEY` | No* | `re_xxxxxxxxxxxx` | API key de Resend.com |
| `EMAIL_FROM` | No* | `noreply@midominio.com` | Dirección de envío. Debe estar verificada en Resend |

### SMTP

| Variable | Requerida | Ejemplo | Descripción |
|---|---|---|---|
| `SMTP_HOST` | No* | `smtp.gmail.com` | Servidor SMTP |
| `SMTP_PORT` | No* | `587` | Puerto SMTP. 587 para TLS, 465 para SSL |
| `SMTP_USER` | No* | `tucuenta@gmail.com` | Usuario SMTP |
| `SMTP_PASS` | No* | `xxxxxxxxxxxx` | Contraseña SMTP (para Gmail: App Password) |
| `EMAIL_FROM` | No* | `tucuenta@gmail.com` | Dirección de envío |

> \* Si no se configura ningún proveedor, los emails se imprimen en consola (útil en desarrollo).

---

## Stripe (Billing)

| Variable | Requerida | Ejemplo | Descripción |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | No* | `sk_live_xxxx` | Clave secreta de Stripe. En desarrollo usar `sk_test_xxxx` |
| `STRIPE_WEBHOOK_SECRET` | No* | `whsec_xxxx` | Secret del webhook de Stripe (obtenido en el dashboard de Stripe al configurar el webhook) |
| `STRIPE_PRO_PRICE_ID` | No* | `price_xxxx` | ID del precio mensual del plan Pro en Stripe |
| `STRIPE_PRO_YEARLY_PRICE_ID` | No* | `price_xxxx` | ID del precio anual del plan Pro en Stripe |

> \* Requeridas si se quiere activar el sistema de suscripciones. Sin ellas, el módulo de billing no funciona pero el resto de la app sí.

### Configurar el webhook de Stripe

1. Instalar Stripe CLI: `stripe listen --forward-to localhost:3001/billing/webhook`
2. En producción: registrar `https://tudominio.com/api/billing/webhook` en el dashboard de Stripe
3. Seleccionar eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`

---

## Twilio WhatsApp

| Variable | Requerida | Ejemplo | Descripción |
|---|---|---|---|
| `TWILIO_ACCOUNT_SID` | No* | `ACxxxxxxxxxxxx` | Account SID de Twilio |
| `TWILIO_AUTH_TOKEN` | No* | `xxxxxxxxxxxx` | Auth Token de Twilio |
| `TWILIO_WHATSAPP_FROM` | No* | `whatsapp:+14155238886` | Número de WhatsApp de Twilio (sandbox o aprobado) |

> \* Requeridas solo si se usan los recordatorios por WhatsApp. Sin ellas, los endpoints de WhatsApp retornan error 500.

---

## Archivo `.env` de ejemplo completo

```env
# ─── Base de datos ───────────────────────────────────────────────────────────
DATABASE_URL="file:./dev.db"

# ─── Servidor ────────────────────────────────────────────────────────────────
PORT=3001
NODE_ENV=development
APP_URL="http://localhost:5173"
CORS_ORIGIN="http://localhost:5173"

# ─── Autenticación ───────────────────────────────────────────────────────────
JWT_SECRET="reemplazar_con_64_caracteres_aleatorios_en_produccion"

# ─── Email — Resend (activa uno de los dos proveedores) ──────────────────────
# RESEND_API_KEY=re_xxxxxxxxxxxx
# EMAIL_FROM=noreply@midominio.com

# ─── Email — SMTP ────────────────────────────────────────────────────────────
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=tucuenta@gmail.com
# SMTP_PASS=tu_app_password
# EMAIL_FROM=tucuenta@gmail.com

# ─── Stripe ──────────────────────────────────────────────────────────────────
# STRIPE_SECRET_KEY=sk_test_xxxx
# STRIPE_WEBHOOK_SECRET=whsec_xxxx
# STRIPE_PRO_PRICE_ID=price_xxxx
# STRIPE_PRO_YEARLY_PRICE_ID=price_xxxx

# ─── Twilio WhatsApp ─────────────────────────────────────────────────────────
# TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx
# TWILIO_AUTH_TOKEN=xxxxxxxxxxxx
# TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

---

## Notas de seguridad

- **Nunca commitear `.env` al repositorio.** Asegurarse de que `.env` está en `.gitignore`.
- En producción, usar un gestor de secretos (AWS Secrets Manager, Railway env vars, Doppler, etc.).
- El `JWT_SECRET` debe ser único por instalación. Generarlo con: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- Las claves de Stripe en producción empiezan con `sk_live_`; las de prueba con `sk_test_`. Nunca usar claves live en desarrollo.
