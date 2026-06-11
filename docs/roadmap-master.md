# Vendix — Roadmap maestro y análisis técnico

Fecha de análisis: 2026-06-09  
Versión base analizada: v1.1.0 (rama `codex/roadmap-fases-vendix`)  
Redactado con auditoría automatizada de las 19 páginas, 14 rutas backend, esquema Prisma y configuración Electron.

---

## 1. Estado del producto hoy

### Qué existe y funciona

| Módulo | Estado | Notas |
|---|---|---|
| POS / Vender | ✅ Completo | Offline queue, volumen, multi-moneda |
| Dashboard | ✅ Completo | Widgets arrastrables, KPIs en tiempo real |
| Inventario | ✅ Completo | Barcode, categorías, CSV bulk, reabastecimiento |
| Movimientos / Caja | ✅ Completo | Apertura/cierre, historial, confirmación al cerrar |
| Clientes + CRM | ✅ Completo | Timeline, puntos, segmentos automáticos, notas |
| Empleados + Nómina | ✅ Completo | Comisiones, asistencia, exportación CSV |
| Reportes | ✅ Completo | 10+ vistas, exportación Excel |
| Cotizaciones | ✅ Completo | Búsqueda, filtros |
| Órdenes de compra | ✅ Completo | Recepción parcial, estados, PDF |
| Proveedores | ✅ Completo | CRUD básico |
| Cuentas por cobrar | ⚠️ Parcial | Aging visible, falta drill-down por transacción |
| Facturación / NCF | ✅ Completo | 3 plantillas, envío por email |
| Planner | ✅ Completo | Eventos, recordatorios CRM |
| Asistente IA | ✅ Completo | Multi-proveedor (Groq, OpenAI, xAI) |
| Auditoría | ✅ Completo | Paginado |
| Onboarding | ✅ Completo | Wizard inicial |
| Auth | ✅ Completo | JWT, bcrypt, roles, email verification |
| Desktop (Electron) | ✅ Funcional | contextIsolation, updater, single-instance |
| Estadísticas (tab) | ⚠️ Ligero | Contenido mínimo, candidato a fusionar con Reportes |

### Lo que aún no existe

- Tests: **0 archivos** de prueba en todo el proyecto
- CSP headers en Electron ni en backend
- Firma digital del instalador .exe (causa del error antivirus)
- Error boundaries en la SPA
- Virtualización de listas largas
- Paginación en búsqueda de productos en el POS

---

## 2. Deuda técnica catalogada

### Crítica (afecta estabilidad o seguridad en producción)

| # | Problema | Ubicación | Impacto |
|---|---|---|---|
| T1 | 0% de tests — cualquier cambio puede romper flujos sin saberlo | Todo el proyecto | Alto |
| T2 | El instalador .exe falla con antivirus (sin firma de código) | `electron-builder`, cert signing | Alto |
| T3 | Sin Content-Security-Policy en Electron ni en headers Express | `electron/main.ts`, `backend/src/app.ts` | Alto |
| T4 | API keys de IA guardadas en localStorage | `frontend/src/pages/AiAssistant.tsx` | Medio-alto |
| T5 | Sin Error Boundaries — un error en cualquier componente tira toda la app | `frontend/src/App.tsx` o similar | Medio |

### Alta prioridad (afecta calidad de producto)

| # | Problema | Ubicación | Impacto |
|---|---|---|---|
| T6 | Búsqueda de productos en POS carga todo el catálogo sin paginar | `Vender.tsx`, query `['products', bid]` | Si tienes +500 SKUs, slow render |
| T7 | Tablas de Movimientos y Reportes no virtualizadas | `Movimientos.tsx`, `Reportes.tsx` | Con +5k filas, UI lenta |
| T8 | Sin `helmet.js` en Express — faltan X-Frame-Options, HSTS, X-Content-Type | `backend/src/app.ts` | Seguridad headers |
| T9 | Migrations con `prisma db push` en lugar de `prisma migrate` — no rastreable ni reversible | `backend/prisma/` | Riesgo en producción |
| T10 | `stripeSubscriptionId` en Business model — stub sin uso — genera confusión | `schema.prisma` | Deuda conceptual |

### Baja prioridad / mejoras de código

| # | Problema |
|---|---|
| T11 | Sin `useMemo` en cálculos pesados de Reportes.tsx y Dashboard.tsx |
| T12 | `Estadisticas.tsx` (8KB, contenido mínimo) — evaluar fusionar con Reportes o expandir |
| T13 | `electron/main.ts` no declara explícitamente `webSecurity: true` (es el default pero debería ser explícito) |
| T14 | Sin logger estructurado en backend — console.error disperso, difícil de monitorear en producción |
| T15 | CORS en whitelist hardcodeada, no gestionada por variable de entorno unificada |

---

## 3. Roadmap por versión

### v2.1 — Estabilidad y pulido UX *(1–2 semanas)*

Objetivo: cerrar huecos visibles que el usuario final siente.

**Fixes:**
- [ ] `CuentasCobrar`: agregar drill-down por cliente — modal o página detalle con lista de facturas pendientes, botón "Marcar pagada" por transacción individual, estado de cuenta descargable
- [ ] `Estadísticas`: expandir con 4–5 métricas útiles (ticket promedio por día de semana, productos más devueltos, horarios de mayor venta, ratio clientes nuevos vs. recurrentes) o fusionarla con Reportes
- [ ] Skeletons de carga consistentes en todas las páginas donde faltan (Movimientos list, Proveedores, Cotizaciones)
- [ ] Número de recibo derivado de secuencia real (`Business.invoiceSequence`) en lugar de `Date.now()` — ya existe el campo, solo falta usarlo en el recibo térmico

**UX:**
- [ ] Al guardar cambios en Configuraciones, hacer scroll automático al primer campo con error en lugar de solo mostrar un toast
- [ ] En `Cotizaciones`, permitir convertir una cotización en venta directamente (botón "Generar venta") — el modelo `Quote` ya existe, solo falta el flujo
- [ ] En `OrdenesCompra`, permitir generar una orden a partir de los productos con stock bajo (enlace desde alerta de inventario → crear OC predeterminada)
- [ ] Menú de navegación colapsable para pantallas pequeñas (11–13") sin perder accesibilidad

---

### v2.2 — Seguridad y profesionalización técnica *(1–2 semanas)*

Objetivo: que la app pueda correr en producción sin vergüenza técnica.

**Seguridad:**
- [ ] **T3**: Agregar CSP en Electron via `session.defaultSession.webRequest` y en Express via `helmet.js`
  ```ts
  // backend/src/app.ts
  import helmet from 'helmet'
  app.use(helmet())
  ```
- [ ] **T4**: Mover API keys de IA a configuración del negocio en backend (`Business.aiApiKey` cifrado con AES-256), no en localStorage del frontend
- [ ] **T8**: Instalar `helmet` y configurar headers mínimos: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- [ ] Regenerar `JWT_SECRET` en setup si aún es el placeholder del `.env.example`
- [ ] Agregar `Secure` y `SameSite=Strict` en cualquier cookie (aunque actualmente se usa JWT en header, verificar si hay cookies involuntarias)

**Electron:**
- [ ] **T2**: Evaluar compra de certificado OV de firma de código (~$70-150/año en DigiCert, Sectigo) para firmar el .exe — elimina el problema del antivirus para usuarios finales
- [ ] Hasta tener certificado: documentar en README que el usuario debe agregar exclusión en Windows Defender
- [ ] Agregar `webSecurity: true` explícito en BrowserWindow options

**Backend:**
- [ ] **T9**: Migrar de `prisma db push` a `prisma migrate dev` con migraciones versionadas. Crear migración inicial desde el estado actual:
  ```bash
  npx prisma migrate dev --name init
  ```
- [ ] Agregar logger estructurado: instalar `pino` + `pino-pretty`, reemplazar `console.error` disperso

---

### v2.3 — Testing y CI/CD *(2–4 semanas)*

Objetivo: poder hacer cambios con confianza. Actualmente **0% cobertura** — el mayor riesgo técnico del proyecto.

**Tests de backend (prioridad alta):**
- [ ] Configurar Jest + Supertest en `backend/`
- [ ] Tests de integración para los flujos críticos (ejecutan contra una base SQLite en memoria):
  - Flujo de venta: `POST /transactions` — verifica descuento correcto, cálculo de ITBIS, decremento de stock
  - Flujo de caja: apertura → venta → cierre, verifica amounts
  - Auth: login, token inválido, expirado
  - Límites de plan: `planLimits` middleware devuelve 403 cuando corresponde
- [ ] Tests unitarios para `calculateTax()`, `applyDiscount()`, funciones de cálculo en routes

**Tests de frontend (prioridad media):**
- [ ] Configurar Vitest + Testing Library en `frontend/`
- [ ] Pruebas de componentes críticos: `CartPanel` (agrega, modifica qty, vacía), `printReceipt` → `buildReceiptHtml` (output contiene campos esperados), `ConfirmDialog` (bloquea acción si usuario cancela)

**E2E (prioridad baja pero muy valiosa):**
- [ ] Playwright ya tiene configuración parcial (`playwright.config.ts` detectado en `$harky` — trasladar patrón a Vendix)
- [ ] Happy path: login → crear producto → venta → recibo

**CI/CD:**
- [ ] Agregar job `test` en `.github/workflows/release.yml` — el build solo se publica si los tests pasan
- [ ] Agregar linting: ESLint ya está parcialmente configurado — agregar reglas estrictas y hacerlo parte del CI
- [ ] `npm run typecheck` como script separado que corra en CI

---

### v2.4 — Performance *(1–2 semanas)*

Objetivo: que la app no se sienta lenta cuando el negocio crece.

- [ ] **T6**: Paginar/virtualizar búsqueda de productos en POS — usar `useInfiniteQuery` o búsqueda server-side con debounce (endpoint ya soporta paginación con `page` y `limit`)
- [ ] **T7**: Virtualizar tabla de Movimientos con `@tanstack/react-virtual` — esencial con más de 3k transacciones
- [ ] **T11**: Envolver cálculos de Reportes.tsx en `useMemo` — actualmente se recalculan en cada render del componente padre
- [ ] Lazy loading de páginas en React Router — actualmente todas las páginas se importan en el bundle principal. Con `React.lazy()` el load time inicial bajaría ~40%
- [ ] Agregar índice compuesto en `Transaction(businessId, type, createdAt)` para queries de reportes que filtran por tipo y fecha simultáneamente

---

### v3.0 — Expansión de funcionalidad *(4–8 semanas)*

Estas son las funciones que darían un salto de valor perceptible para el usuario de negocio.

**Finanzas:**
- [ ] **Cierre diario con snapshot persistido** — guardar totales de ventas, gastos, caja al final del día como registro inmutable (no recalculado, auditable). Ideal para negocios que deben reportar a contabilidad
- [ ] **Estado de cuenta por cliente** — PDF descargable con historial de deuda, pagos y saldo pendiente
- [ ] **Exportación de aging a PDF** — desde CuentasCobrar → "Exportar envejecimiento de cartera"
- [ ] **Conciliación de caja** — comparar lo que debería haber (ventas en efectivo) vs. lo que se declaró al cerrar, con varianza visual

**Inventario:**
- [ ] **Kardex completo por producto** — historial de entradas/salidas con motivo (venta, devolución, ajuste, compra)
- [ ] **Umbral de stock por producto** (override del umbral global del negocio)
- [ ] **Ajuste de inventario manual** con motivo (pérdida, caducidad, corrección) — registra en auditoría

**Ventas:**
- [ ] **Cotización → Venta** en un click
- [ ] **Devoluciones con reingreso a inventario** — actualmente la devolución existe como tipo de transacción pero no hay flujo que devuelva el stock automáticamente
- [ ] **Precio por lista de precio** — un cliente VIP puede tener una lista de precios diferente a la general, en lugar de solo un % de descuento

**Operaciones:**
- [ ] **Restauración de backup desde JSON** — ya existe la exportación, falta el flow de importación con validación previa
- [ ] **Cola offline visual** — pantalla dedicada que muestre ventas pendientes de sincronizar, con retry manual y detalle de error

---

### v4.0 — SaaS y escala *(2–4 meses, según monetización)*

Estos cambios transforman Vendix de desktop app a plataforma SaaS capaz de facturar.

**Infraestructura:**
- [ ] Migrar base de datos de SQLite a PostgreSQL para deployments cloud multiusuario
- [ ] Dockerizar el backend con `docker-compose` (app + postgres + nginx)
- [ ] Definir modelo de datos de tenancy: actualmente `Business.userId` asume 1 dueño, escalar a organizaciones con múltiples dueños
- [ ] CDN para assets (logos de negocio actualmente guardados como URL externa — considerar S3/R2)

**Monetización:**
- [ ] Integrar Stripe Billing — el campo `Business.stripeSubscriptionId` ya existe en el schema, el scaffold está hecho. Solo falta el flujo de checkout y el webhook
- [ ] Definir planes: Free (1 negocio, 100 productos), Pro (~$15/mes), Business (~$35/mes, multi-negocio ilimitado, AI, exportaciones avanzadas)
- [ ] Portal de cliente Stripe para gestión de suscripción sin contactar soporte

**Producto:**
- [ ] App móvil PWA o React Native (inventario rápido, consultar ventas del día desde el teléfono)
- [ ] Panel de administración multi-negocio para cadenas/franquicias — vista consolidada de todas las sucursales
- [ ] API pública con autenticación OAuth2 para integraciones (WooCommerce, Shopify, contabilidades externas)
- [ ] Módulo de facturación electrónica DGII (República Dominicana) — integración directa con el sistema de la DGII para envío automático de NCF

---

## 4. Quick wins (se pueden hacer en 1–2 días cada uno)

Cambios de alto impacto percibido, bajo esfuerzo técnico — para hacer ya:

| # | Acción | Impacto |
|---|---|---|
| Q1 | Instalar `helmet` en Express (`npm i helmet`) y añadir `app.use(helmet())` | Seguridad básica en 5 minutos |
| Q2 | `React.lazy()` en todas las rutas de App.tsx | Carga inicial 30–40% más rápida |
| Q3 | Agregar Error Boundary global en App.tsx — cuando algo crashea, mostrar pantalla amigable en lugar de pantalla en blanco | UX crítica |
| Q4 | Usar `invoiceSequence` real del negocio como número de recibo en lugar de `Date.now()` | Profesionalismo |
| Q5 | Botón "Cotización → Venta" en la pantalla de cotizaciones | Elimina re-trabajo del usuario |
| Q6 | Exclusión de Windows Defender documentada en README (hasta tener firma de código) | Soporte a usuarios |
| Q7 | `npm run typecheck` en CI (ya existe tsconfig, solo falta el step en release.yml) | Previene regresos de tipo |

---

## 5. Métricas de madurez actual

| Área | Score | Comentario |
|---|---|---|
| Funcionalidad | 8/10 | Módulos completos, pocos huecos |
| UX / UI | 7/10 | Consistente, falta polish en móvil y listas largas |
| Seguridad backend | 7/10 | Auth + Zod fuertes, faltan headers y AI keys |
| Seguridad Electron | 6/10 | contextIsolation OK, falta CSP y firma |
| Testing | 1/10 | 0 tests — el punto más débil del proyecto |
| Performance | 6/10 | OK hasta ~1k registros, después degradará |
| Mantenibilidad | 7/10 | Código limpio, sin migraciones rastreables |
| DevOps / CI | 6/10 | Release automático existe, sin tests ni linting en CI |
| **Overall** | **6.5/10** | Producto sólido, necesita madurar en calidad técnica |

---

## 6. Orden de trabajo recomendado

Si hay que priorizar con tiempo y recursos limitados:

1. **Esta semana**: Quick wins Q1–Q7 (ninguno tarda más de 2h)
2. **Semana 2**: v2.2 Seguridad — helmet, mover AI keys, Prisma migrate
3. **Semana 3–4**: Primer bloque de tests (backend flows críticos)
4. **Semana 5**: v2.1 UX — CuentasCobrar drill-down, Cotización→Venta, skeletons
5. **Semana 6**: v2.4 Performance — lazy loading + virtualización de tablas
6. **Mes 2**: v3.0 Finanzas — cierre diario, Kardex, estado de cuenta
7. **Mes 3+**: v4.0 SaaS si hay intención de monetizar

---

*Documento generado: 2026-06-09 · Próxima revisión recomendada: v2.3 completado*
