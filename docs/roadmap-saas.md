# Vendix SaaS — Plan por fases: de app de escritorio a producto con suscripción

Fecha: 2026-06-17
Rama: `codex/roadmap-fases-vendix`

---

## La decisión de arquitectura (leer primero)

Hay dos caminos para "convertir Vendix en SaaS", y elegir mal cuesta meses:

**Camino A — Web SaaS puro:** todo corre en la nube, el usuario abre un navegador. Es el modelo clásico, pero **destruye la ventaja competitiva actual de Vendix**: un POS que funciona sin internet. Un colmado en RD con internet intermitente no puede depender de que la nube responda para cobrar.

**Camino B — Local-first + nube (recomendado):** la app sigue funcionando 100% local (Electron + SQLite como hoy), y la nube agrega: respaldo automático, sincronización entre dispositivos, acceso web de consulta, y el sistema de licencias/suscripción. Si no hay internet, todo sigue funcionando; cuando vuelve, se sincroniza.

**Este plan sigue el Camino B.** Es el mismo modelo de productos como Loyverse o Square Register: la caja nunca se detiene, la nube suma valor.

### Modelo de negocio propuesto

| Plan | Precio sugerido | Incluye |
|---|---|---|
| **Gratis** | RD$0 | Todo lo local: POS, inventario, caja, reportes. 1 dispositivo, sin nube. |
| **Pro** | ~US$9.99/mes o US$89/año | Respaldo automático en la nube, sync multi-dispositivo, acceso web de consulta, soporte prioritario |
| **Negocio** (futuro) | ~US$19.99/mes | Multi-sucursal, empleados ilimitados con cuentas, reportes consolidados |

La clave: **lo gratis es genuinamente útil** (así se corre la voz), y lo pago resuelve el miedo real del dueño: *"¿y si se me daña la computadora y pierdo todo?"*. Ese miedo es el mejor vendedor de la suscripción.

---

## Fase 1 — Backend en la nube (2-3 semanas) ✅ DESPLEGADA (2026-07-07)

> *Objetivo: un servidor central desplegado, con la misma API que ya existe, sobre PostgreSQL.*

### 1.1 ~~Migrar el schema a PostgreSQL~~ ✅
`updatedAt` agregado a todos los modelos sincronizables. `scripts/gen-cloud-schema.js` regenera `schema.production.prisma` (Postgres) automáticamente desde `schema.prisma` (SQLite) para evitar drift manual. Índices compuestos migrados igual. (`Decimal` vs `Float` para montos: pendiente de evaluar, no bloqueante — Postgres/Neon ya en uso).

### 1.2 ~~Separar "servidor cloud" de "servidor local"~~ ✅
`VENDIX_CLOUD_MODE=true` activa verificación de email obligatoria en login. Resto del código Express es el mismo binario para ambos modos.

### 1.3 ~~Desplegar~~ ✅
- **Neon.tech**: proyecto Postgres creado y en uso (schema aplicado con `prisma db push --schema schema.production.prisma`)
- **Railway**: proyecto `powerful-renewal`, servicio `vendix-api`, dominio público `https://vendix-api-production-0bba.up.railway.app` — **GET /api/health responde 200 en producción**
- Dominio custom (`api.vendix.app`) — pendiente, hoy usa el subdominio de Railway
- Backups automáticos de Postgres — Neon los incluye por defecto

**Lecciones del deploy (documentadas en memoria de proyecto para no repetir):**
- Railway no acepta `DOCKERFILE` como builder vía `railway environment edit` (el enum GraphQL no lo incluye) — la única vía real es un `railway.json` en la raíz del build context con `{"build":{"builder":"DOCKERFILE","dockerfilePath":"Dockerfile"}}`
- En un monorepo, `cd backend && railway up` no escopa el build si el proyecto fue enlazado desde la raíz — usar `railway up ./backend --path-as-root --service <svc> --environment production --detach` desde la raíz del repo
- Railway propaga `NODE_ENV=production` al build de Docker, lo que rompe `npm ci` (omite devDependencies como `typescript`) — el Dockerfile ahora usa `npm ci --include=dev` explícitamente
- Faltaba `backend/.dockerignore` — sin él, un build sin `--path-as-root` podía sobrescribir `node_modules` limpio con el local

### 1.4 ~~Cuenta en la nube desde el desktop~~ ✅ (vía pestaña "Cloud sync" en Configuraciones)
La pestaña "Cloud sync" agregada en v3.2 cubre esto — vincula la instalación local al servidor cloud. Verificar en la próxima sesión si el flujo específico de "registrarse/iniciar sesión" está completo o si solo expone el estado del worker de sync (son cosas relacionadas pero no idénticas).

**Entregable de la fase:** ~~API desplegada y accesible~~ ✅, ~~cuenta cloud creable desde el desktop~~ ✅ (verificar alcance exacto), sync del catálogo maestro ✅ parcial (ver Fase 2).

---

## Fase 2 — Respaldo y sincronización en la nube (3-4 semanas) — INICIADA, PARCIAL (v3.2)

> *Objetivo: los datos del negocio viven seguros en la nube. Empezar simple, evolucionar a sync real.*

### 2.1 Respaldo automático a la nube — sigue pendiente
No implementado todavía. `GET /:id/export` + `backupScheduler` existen localmente, pero no suben a la nube automáticamente. Sigue siendo el ítem de mayor ROI de esta fase — con solo esto ya es vendible el plan Pro.

### 2.2 Sync incremental — implementado, pero más simple de lo diseñado aquí
v3.2 entregó un MVP real y funcional (no un esqueleto), pero con alcance menor al descrito en este documento:
- ✅ `updatedAt` en todos los modelos sincronizables (Fase 1.1)
- ✅ Outbox local (`syncOutbox.ts`) — registra cada cambio de forma tolerante a fallos, desactivable por env
- ✅ Worker local (`syncWorker.ts`) — loop `ensureDevice → push → pull` configurable, cursor persistido en disco
- ✅ Servidor (`routes/cloud.ts`) — `POST /sync/push`, `GET /sync/changes?since=`, manifest, registro de dispositivos
- ✅ UI: pestaña "Cloud sync" en Configuraciones
- ⚠️ **Alcance real: solo 4 entidades maestras** (`product`, `client`, `supplier`, `employee`) — **ventas, caja, pagos y auditoría NO sincronizan** (por diseño, para no arriesgar el historial append-only; sigue siendo la limitación central)
- ⚠️ **Conflictos: `LAST_WRITE_WINS` puro** — sin comparación real de `updatedAt` origen/destino más allá de "el último que llega gana". Más simple y más arriesgado que lo que proponía este documento originalmente.
- El worker está **apagado por defecto** (`VENDIX_SYNC_ENABLED=false`)

**Qué falta para cerrar esta fase de verdad:** extender el sync a transacciones (append-only, tal como se diseñó aquí — es lo más seguro de sincronizar y lo que más valor le da al dueño con 2+ dispositivos), y resolver conflictos comparando `updatedAt` real en vez de "el último que llega gana" ciego.

### 2.3 El stock: sigue siendo el problema difícil, sin resolver
Como las ventas no están en el alcance del sync (ver 2.2), el problema de stock negativo por ventas concurrentes en dos dispositivos **ni siquiera se ha presentado todavía** porque no hay nada que dispare el conflicto. Cuando se extienda el sync a ventas, esta pieza (recalcular stock desde `StockMovement`) sigue siendo necesaria y no se ha construido.

**Entregable de la fase:** respaldo cloud automático (2.1, pendiente) y sync multi-dispositivo del catálogo maestro (2.2, hecho parcial) — sync de ventas/stock (2.3) sigue abierto.

---

## Fase 3 — Suscripciones y licencias (2 semanas)

> *Objetivo: cobrar. Stripe se removió del código pero el esqueleto quedó.*

### 3.1 Pasarela de pago: tarjeta + PayPal (decisión tomada)
**Requisito del producto: el cliente paga con tarjeta o con PayPal.** La vía elegida es un *merchant of record* — **Paddle o LemonSqueezy** — porque:
- Ambos aceptan **tarjeta Y PayPal** en el mismo checkout, sin integrar PayPal aparte
- Actúan como vendedor legal (ellos facturan al cliente, manejan impuestos) y te transfieren a ti — resuelve que Stripe no deposita a bancos dominicanos
- El modelo Business conserva `plan`, `stripeSubscriptionId` (renombrar mentalmente a `subscriptionId`), `subscriptionStatus` — no hay migración de schema
- Integración: checkout hosted + webhook `subscription_created` / `subscription_cancelled` → actualizar `Business.plan`
- **Primer paso: crear cuenta en LemonSqueezy (más simple) y verificar el payout a RD (transferencia/PayPal payout) antes de escribir código**

### 3.2 Licencia en el desktop
La app local consulta el estado del plan al servidor cloud:
- `GET /cloud/license` devuelve `{ plan, validUntil }` firmado; se cachea localmente
- **Gracia offline de 14 días**: si no puede verificar, las features Pro siguen activas 14 días (nunca castigar por mala conexión)
- Si la suscripción venció: las features cloud se desactivan, **lo local sigue gratis para siempre** — jamás secuestrar los datos del usuario

### 3.3 Licencias de cortesía (IMPLEMENTADO en Fase 1)
El dueño no paga por su propia app, y puede regalar Pro a quien quiera:
- Modelo `LicenseGrant` — cortesía por **email** con plan, nota, expiración opcional y revocación
- `GET /api/license` — resuelve la licencia del usuario actual con prioridad: cortesía activa > suscripción pagada > free
- Admin (definido por env `ADMIN_EMAILS` en el servidor cloud): `GET/POST /api/license/grants`, `DELETE /grants/:id`
- La cortesía se otorga por correo **aunque la cuenta no exista todavía** — al registrarse con ese email, ya es Pro
- Otorgar cortesía vía Swagger (`/api/docs`) o curl; UI de admin llega después si hace falta

### 3.4 Reactivar planLimits
El middleware existe pero es pass-through. Definir límites reales solo para features cloud:
- Free: sin respaldo cloud, sin sync, 1 dispositivo
- Pro: todo activado
- Gating en frontend: `PlanLimitModal` ya existe — mostrar upgrade en vez de la feature

**Entregable de la fase:** flujo completo: registrarse → probar Pro (trial 14 días) → pagar → sync activado → cancelar sin perder datos locales.

---

## Fase 4 — Acceso web + presencia (2-3 semanas)

> *Objetivo: el dueño consulta su negocio desde cualquier navegador, y hay una página que vende el producto.*

### 4.1 Web app de consulta (no POS)
El frontend ya es una SPA que habla con la API — servirla desde el servidor cloud es casi gratis:
- `app.vendix.app` con login → Dashboard, Reportes, Estadísticas, Clientes, CuentasCobrar (lectura y gestión ligera)
- **Ocultar el POS en modo web** (vender requiere la caja física local) — o permitirlo con advertencia para negocios de servicios
- Es el mismo build de Vite con un flag `VITE_CLOUD_MODE`

### 4.2 Landing page
- `vendix.app`: qué hace, screenshots, precios, botón de descarga del .exe + registro cloud
- Testimonios cuando existan; antes, GIFs del POS funcionando
- SEO básico en español: "sistema de ventas para colmado", "POS República Dominicana", "programa de facturación NCF"

### 4.3 Distribución del desktop
- Firma de código (SmartScreen bloquea instaladores sin firma — mata conversión). Azure Trusted Signing (~US$9.99/mes) es la vía barata actual
- Auto-update ya funciona (electron-updater + GitHub Releases) — mantener

**Entregable de la fase:** alguien encuentra vendix.app, descarga, usa gratis, y paga Pro desde la app.

---

## Fase 5 — Operación (continuo)

- **Monitoreo:** Sentry (errores frontend+backend, tier gratis) + uptime monitor (UptimeRobot gratis)
- **Analytics de producto:** eventos anónimos opt-in (cuántos usan cotizaciones, cuántos NCF) para decidir el roadmap con datos
- **Soporte:** WhatsApp Business como canal (es lo que el mercado objetivo usa) + FAQ en la landing
- **Legal:** términos de servicio y política de privacidad (plantillas + revisión), factura por la suscripción
- **Métricas norte:** instalaciones activas/semana, conversión free→Pro (sano: 2-5%), churn mensual (<5%)

---

## Resumen de costos iniciales

| Concepto | Costo |
|---|---|
| Hosting API (Railway/Render) | ~US$5-10/mes |
| PostgreSQL (Neon free tier) | US$0 al inicio |
| Dominio .app | ~US$15/año |
| Firma de código (Azure Trusted Signing) | ~US$10/mes |
| Stripe/Paddle | % por transacción (2.9-5%) |
| **Total para arrancar** | **~US$25-35/mes** |

Con 4-5 suscriptores Pro se cubre la infraestructura.

---

## Orden de ejecución y dependencias

```
Fase 1 (backend cloud) ──→ Fase 2.1 (respaldo cloud) ──→ Fase 3 (suscripciones) ──→ Fase 4 (web + landing)
                                    └──→ Fase 2.2-2.3 (sync real) — puede ir en paralelo con Fase 3/4
```

**El camino más corto a cobrar el primer peso:** Fase 1 → Fase 2.1 → Fase 3. Con solo "respaldo automático en la nube + restaurar en cualquier PC" ya hay una suscripción vendible, sin resolver el problema difícil del sync. El sync multi-dispositivo llega después como razón de upgrade/retención.

---

## Riesgos principales

1. **Pasarela de pago desde RD** (Fase 3.1) — investigar Paddle/LemonSqueezy vs entidad US *antes* de escribir código de billing
2. **Sync de stock** — mitigado con recálculo server-side desde StockMovement (append-only)
3. **Costo de tu tiempo** — cada fase es "shippeable" por separado; no empezar la siguiente sin cerrar la anterior
4. **Soporte** — cada usuario pago espera respuestas; definir horario/canal desde el día 1

---

*Documento generado: 2026-06-17 · Complementa `roadmap-v3.md` (calidad del producto local). Este documento cubre la dimensión SaaS/nube.*
