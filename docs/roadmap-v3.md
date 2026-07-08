# Vendix — Roadmap v4: De producto funcional a producto listo para producción

Fecha: 2026-06-17
Rama: `codex/roadmap-fases-vendix`

---

## Lo que ya tiene Vendix (resumen ejecutivo)

**Core de ventas:** POS con multi-moneda, descuentos por %, volumen y cliente VIP, fiado con cuentas por cobrar, NCF fiscal, 3 plantillas de recibo (clásico/compacto/térmico), cola offline con sincronización, atajos de teclado (F1-F4), sonidos de confirmación, filtro por categoría en POS.

**Inventario:** CRUD con kardex, movimientos de stock, ajuste manual con motivo, alertas por producto y umbral global, historial de precios, importación CSV, operaciones bulk (cambio masivo de precio/categoría/eliminar), paginación.

**Finanzas:** Caja con sesiones (apertura/cierre con usuario), movimientos con paginación y filtros, cotizaciones con conversión directa a venta, cuentas por cobrar con búsqueda y filtro por antigüedad, reportes fiscales (606/607, cierre Z), estadísticas con gráficas.

**Contactos:** Clientes con fidelización (puntos, VIP, segmentos automáticos), timeline CRM, notas, precios personalizados. Proveedores con órdenes de compra y recepción de mercancía. Empleados con nómina, asistencia y comisiones.

**Infraestructura:** Electron + Express + Prisma/SQLite, JWT auth con roles (OWNER/CASHIER), soft-deletes, número de factura persistido, auditoría, backup/restore JSON, CSP + rate limiting, skeleton loaders + error states + retry en toda la app, responsive (columnas adaptativas), accesibilidad básica (focus trap, skip-to-content, aria-labels), command palette (Ctrl+K), modo oscuro, onboarding con plantillas de negocio, exportación CSV universal.

---

## Filtro de decisión

**¿Esto hace que vender sea más rápido, que el dueño confíe más en sus números, o que el producto se sienta terminado?** Si no, no entra.

---

## Fase 1 — Completar lo empezado (días)

> *Features que están a medias: el backend lo soporta pero el frontend no lo expone.*

### 1.1 Papelera / restaurar eliminados
Los soft-deletes funcionan en backend (Product, Client, Supplier, Employee) pero no hay forma de ver ni restaurar lo eliminado desde la UI. Un cajero que borra un producto por error no tiene cómo recuperarlo.

**Qué hacer:** una pestaña "Papelera" (o sección colapsable) en Inventario, Clientes, Proveedores y Empleados que muestre items con `deletedAt != null` y botón "Restaurar". Endpoint `POST /:id/restore` ya existe.

### 1.2 Modo oscuro en componentes nuevos
`QueryError`, `Pagination`, `EmptyState` y `printDocument` no tienen clases `dark:`. La app soporta modo oscuro pero estos componentes se ven con fondo blanco/gris claro sobre fondo oscuro.

**Qué hacer:** agregar `dark:bg-*`, `dark:text-*`, `dark:border-*` a los 3 componentes UI. El helper de impresión no necesita dark mode (siempre imprime en claro).

### 1.3 Dashboard sin loading states
Dashboard tiene 14 queries independientes sin skeleton ni manejo de error. Si una falla, el widget queda vacío sin explicación.

**Qué hacer:** cada widget card debe mostrar un skeleton pulse mientras `data` es undefined, y un mini-error si la query falla. No es un solo `isLoading` de página — es por widget.

---

## Fase 2 — Lo que el dueño necesita esta semana (1-2 semanas)

> *Funciones que un dueño preguntaría "¿por qué no puedo hacer esto?"*

### 2.1 Exportar reportes como PDF
Los reportes se generan en HTML y se abren en `window.open` para imprimir. Pero "imprimir a PDF" depende de que el usuario sepa hacer Ctrl+P → guardar como PDF. Un botón "Descargar PDF" directo es más profesional y funciona mejor en Electron.

**Qué hacer:** usar `window.print()` con `@media print` ya funciona, pero agregar un botón explícito "Descargar PDF" que use `webContents.printToPDF()` en Electron o la API de impresión del navegador con destination 'save' como fallback.

### 2.2 Historial de precios visible en POS
El POS muestra el precio actual pero no si cambió recientemente. Un dueño que subió precios quiere confirmar que el nuevo precio es el correcto antes de cobrar.

**Qué hacer:** tooltip o badge sutil en la tarjeta del producto en Vender.tsx si el precio cambió en los últimos 7 días: "↑ Antes: RD$X". No intrusivo, solo informativo.

### 2.3 Resumen diario automático al cerrar caja
Al cerrar la caja se muestra un modal con cifras, pero no se puede compartir ese resumen. El dueño quiere enviárselo por WhatsApp al socio o guardarlo.

**Qué hacer:** botón "Copiar resumen" o "Compartir" en el modal de cierre que genere un texto plano con: fecha, ventas, gastos, efectivo esperado vs contado, diferencia. Formato WhatsApp-friendly.

### 2.4 Alertas de cotizaciones por vencer
Las cotizaciones tienen `validUntil` pero no se notifica cuando están por expirar. El dueño pierde ventas porque se le olvida darle seguimiento.

**Qué hacer:** en el job de notificaciones (`checkLowStock` pattern), agregar check de cotizaciones PENDING cuyo `validUntil` sea en los próximos 3 días. Crear notificación "Cotización #X para {cliente} vence en N días".

---

## Fase 3 — Calidad de producción (semanas)

> *Lo que separa un proyecto personal de algo que un usuario pagaría por usar.*

### 3.1 Testing real
Solo 3 archivos de test en backend, 0 en frontend. No hay CI. Un cambio en `transactions.ts` puede romper el POS sin que nadie lo note hasta que un cajero intente cobrar.

**Qué hacer (mínimo viable con máximo ROI):**
- Backend: tests de integración para los 5 flujos críticos: crear venta (con stock), crear cotización y convertirla, abrir/cerrar caja, crear cliente y verificar segmentos, export/import backup. Con supertest contra el app Express real + db SQLite en memoria.
- Frontend: smoke tests con Vitest + Testing Library para Vender.tsx (agregar producto al carrito, cobrar) y Login (credenciales inválidas, flujo exitoso).
- GitHub Actions CI que corra `npm test` en cada push.

### 3.2 Dividir páginas monolíticas
Cinco archivos superan 800 líneas: Vender (1238), Configuraciones (1015), Reportes (870), Inventario (859), Dashboard (781). Cada cambio es arriesgado.

**Qué hacer:**
- `Vender.tsx` → extraer `CartPanel`, `PaymentSection`, `SuccessModal`, `QuickProductModal`
- `Configuraciones.tsx` → un archivo por pestaña: `GeneralTab`, `TaxTab`, `ReceiptTab`, `BackupTab`, `UsersTab`
- `Inventario.tsx` → extraer `BulkActionBar`, `ProductTable`, `KardexModal`, `RestockModal`

### 3.3 Bundle de Inventario demasiado grande
`Inventario.js` pesa 466KB (157KB gzip) — más que `vendor-react` (161KB). Probablemente arrastra dependencias que no necesita o tiene código duplicado.

**Qué hacer:** analizar con `npx vite-bundle-visualizer`, identificar qué pesa tanto (¿zod completo? ¿lucide-react sin tree-shake? ¿ImportCSV?), y aplicar lazy imports o code splitting donde haga falta.

### 3.4 Electron: firma de código + auto-update robusto
La app no está firmada — Windows SmartScreen muestra advertencia al instalar. El auto-update funciona pero sin firma el OS puede bloquearlo.

**Qué hacer:** adquirir certificado de firma de código (o usar un servicio gratuito como SignPath para open source), configurar `electron-builder` con `sign` + `publish` a GitHub Releases, verificar que el flujo completo funciona: publicar release → usuario recibe notificación → descarga → instala sin advertencia.

---

## Fase 4 — Diferenciación (meses, solo si hay tracción)

> *Ideas que solo valen la pena si hay usuarios reales pidiendo esto.*

### 4.1 Multi-sucursal
Un dueño con 2+ locales quiere ver reportes consolidados y mover inventario entre sucursales. Hoy cada negocio es independiente.

**Evaluar primero:** ¿cuántos usuarios tienen >1 negocio creado? Si es < 5%, no invertir.

### 4.2 App móvil companion (no POS)
No reemplaza el POS de escritorio — es una app de consulta para el dueño: ver ventas del día, stock bajo, deudas, desde el celular sin abrir la laptop. La PWA ya cubre algo de esto pero una app nativa con notificaciones push sería más sticky.

**Evaluar primero:** ¿los usuarios acceden desde móvil? Revisar analytics del service worker.

### 4.3 Integraciones con pasarelas de pago
Conectar con pagos electrónicos (Azul, Cardnet en RD) para registrar automáticamente ventas con tarjeta sin entrada manual.

**Evaluar primero:** depende del mercado objetivo y del costo de integración con cada pasarela.

---

## Lo que NO hacer

- **i18n** — foco en mercado hispanohablante. Solo internacionalizar si hay demanda real.
- **Migrar de SQLite** — soporta el caso de uso local. PostgreSQL solo si se ofrece SaaS multi-tenant.
- **IA / chatbots / asistentes** — eliminado por decisión de producto. No aporta al core.
- **Expandir el Planner** — completo. Cualquier feature nueva ahí es feature creep.
- **Modo offline completo** — la cola de ventas offline ya existe. Replicar toda la app offline (inventario, clientes, reportes) es un nivel de complejidad que no se justifica para el caso de uso.

---

*Documento generado: 2026-06-17 · Basado en el estado real del código tras completar Fases 1-4 del roadmap v3.*
