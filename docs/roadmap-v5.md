# Vendix — Roadmap v5: por versión

Fecha: 2026-07-12
Rama: `codex/roadmap-fases-vendix`

Este documento reorganiza el análisis de `docs/roadmap-v4.md` (fases A-E, generado 2026-07-10 tras auditoría directa del código) en versiones concretas y publicables. La lógica de fondo no cambia — sigue siendo "cerrar huecos antes de construir nuevo, terminar el sync antes de cobrar por él, pagar deuda técnica antes de que se vuelva más cara" — pero cada entrega ahora tiene un número de versión, un objetivo de una frase, y un criterio de cierre verificable, siguiendo el mismo formato que ya usa `docs/roadmap-progress.md` para versiones pasadas (v1.2 → v2.0).

**Filtro de decisión (se mantiene):** ¿esto hace que vender sea más rápido, que el dueño confíe más en sus números, o que el producto se sienta terminado? Si no, no entra en una versión — va a "Futuro".

---

## v2.6 — Cierre de huecos

**Objetivo:** que no quede nada a medio hacer antes de sumar algo nuevo. Esta versión es casi enteramente trabajo ya hecho en esta rama, sin commitear todavía.

Ya completado (sesión 2026-07-11/12):
- Roadmap "confianza diaria" (9 items): recuperación de carrito, health check de DB, bloqueo de doble apertura de caja, semáforo del día, posición financiera (tengo/me deben/debo), recordatorios WhatsApp más cálidos, notificaciones de caja/cotizaciones.
- Dark mode global en las 18 páginas y componentes compartidos.

Falta para cerrar v2.6 (Fase A de `roadmap-v4.md`):
- [ ] **Papelera en Proveedores** — `TrashPanel` ya está en Inventario/Clientes/Empleados; el backend ya soporta `deletedAt` en `Supplier`. Copiar el patrón existente.
- [ ] **Verificar firma de código Windows** — señales contradictorias sobre si `CSC_LINK`/`CSC_KEY_PASSWORD` quedaron configurados. Confirmar en el próximo `npm run dist` si SmartScreen sigue avisando.
- [ ] **Dashboard: loading por widget** — 14 queries independientes sin skeleton individual, en vez de un loading global.

**Cierre:** commit + tag `v2.6.0`, build de instalador probado, `docs/roadmap-progress.md` actualizado con lo aplicado.

---

## v2.7 — Autoexplicación

**Objetivo:** que un dueño nuevo no necesite preguntarle a nadie cómo usar la app (Fase D de `roadmap-v4.md`, primer paso de `roadmap-diferenciacion.md`).

- [ ] **Tour guiado de la primera venta** — overlay tipo spotlight de 3-4 pasos en la primera visita a `Vender.tsx`, saltable, no vuelve a aparecer.
- [ ] **Centro de ayuda in-app** — buscador estilo `CommandPalette` con 15-20 preguntas reales, para no depender de WhatsApp a soporte.
- [ ] **Historial de precios en el POS** — badge "↑ Antes: RD$X" en la tarjeta de producto si el precio cambió en los últimos 7 días.

No depende de v2.6 técnicamente (es frontend/copy), puede adelantarse en paralelo si hay ancho de banda.

**Cierre:** commit + tag `v2.7.0`.

---

## v3.0 — Sync completo

**Objetivo:** multi-dispositivo deja de ser "solo ve el catálogo" y pasa a ser "ve el negocio completo". Salto de versión mayor porque es capacidad nueva real, no un pulido (Fase B de `roadmap-v4.md`).

- [ ] **Extender el sync a ventas y caja** — el MVP de v3.2 (histórico) sincroniza catálogo (productos, clientes, proveedores, empleados) pero no transacciones. Las ventas son append-only por diseño (nunca se editan, se anulan con reverso) — es el caso más simple de sincronizar. Agregar `transaction` al mapa de entidades de `syncOutbox.ts`, la infraestructura de servidor/worker ya existe.
- [ ] **Conflictos reales por `updatedAt`** — hoy `LAST_WRITE_WINS` no compara timestamps, aplica lo último que procesa sin más. En `applySyncChange` (servidor) y `applyRemoteChange` (worker), comparar `updatedAt` entrante contra el registro existente antes de aplicar.
- [ ] **Activar el worker por defecto en plan Pro** — hoy `VENDIX_SYNC_ENABLED=false` incluso con Pro activo. Al confirmar plan Pro vía `/api/license`, activar el worker automáticamente en el desktop.

**Depende de:** v2.6 cerrada (menos ruido de bugs pendientes al tocar código de sync).

**Cierre:** commit + tag `v3.0.0`, prueba manual con 2 dispositivos simulados.

---

## v3.1 — Negocio SaaS

**Objetivo:** primera versión que puede cobrar de verdad, no solo tener la infraestructura lista (Fase C de `roadmap-v4.md`).

- [ ] **Reactivar `planLimits.ts`** — sigue siendo pass-through puro (`Infinity` en todo) pese a que `LicenseGrant` ya resuelve planes. Poner el respaldo cloud y el sync (v3.0) detrás de un check de plan real.
- [ ] **Respaldo automático a la nube** — el ítem de mayor ROI de `roadmap-saas.md` sin construir todavía. Con esto solo ya hay algo vendible como plan Pro sin depender de que el sync esté perfecto.
- [ ] **LemonSqueezy** — confirmar si la solicitud de cuenta (enviada 2026-07-07) ya fue aprobada. Si pasan más de ~2 semanas sin respuesta, evaluar Paddle como alternativa.

**Depende de:** v3.0 (el respaldo/sync son lo que justifica cobrar).

**Cierre:** commit + tag `v3.1.0`, primer cobro real de prueba end-to-end.

---

## v3.2 — Deuda técnica

**Objetivo:** pagar lo que se venía posponiendo antes de que cada feature nueva sea más cara de tocar (Fase E de `roadmap-v4.md`). Se intercala con las versiones anteriores cuando haya que tocar esos archivos de todos modos — no bloquea nada, pero se vuelve más caro cuanto más se posterga.

- [ ] **Dividir páginas monolíticas** — todas crecieron desde el último corte: `Configuraciones.tsx` 1576 líneas (+55%, por cloud sync + permisos), `Vender.tsx` 1284, `Reportes.tsx` 1186, `Inventario.tsx` 1104, `Dashboard.tsx` 830. Orden de prioridad: Configuraciones (por pestaña: General/Tax/Receipt/Backup/Users/CloudSync/Permissions), luego Reportes, luego Vender.
- [ ] **Bundle de Inventario** — sigue siendo el más pesado del frontend (488KB). Analizar con `vite-bundle-visualizer` antes de seguir agregando features ahí.
- [ ] **Mapear cobertura real de `requirePermission`** — el sistema de permisos existe y es sólido en diseño, pero no todas las rutas lo aplican. Barrido ruta por ruta antes de anunciar "permisos granulares" como feature terminada.

**Cierre:** commit + tag `v3.2.0`.

---

## Futuro (sin versión asignada — evaluar solo con tracción real)

- **Multi-sucursal real** — v2.3 dejó la puerta entreabierta (transferencias con destino en texto libre, sin modelo `Branch`), pero seguir construyendo sin validar cuántos usuarios tienen 2+ negocios es prematuro.
- **App móvil companion.**
- **Pasarelas de pago locales** (AZUL/Cardnet).
- **i18n, migrar de SQLite, IA/chatbots, expandir el Planner, modo offline completo de todo** — sin argumento nuevo que justifique revisar esto.

---

## Orden y dependencias

```
v2.6 (cierre de huecos) ──┬──→ v2.7 (autoexplicación) ── en paralelo, no bloquea
                          │
                          └──→ v3.0 (sync completo) ──→ v3.1 (negocio SaaS)

v3.2 (deuda técnica) ── continua, se intercala cuando haya que tocar esos archivos igual
```

v2.6 va primero porque es literalmente lo que ya está hecho, solo falta cerrar 3 ítems chicos. v2.7 puede adelantarse en paralelo por ser mayormente frontend/copy. La secuencia v3.0→v3.1 es la que de verdad mueve el negocio: no tiene sentido cobrar por un sync que solo mueve la mitad de los datos. v3.2 no tiene fecha fija — se mete cuando el archivo en cuestión haya que tocarlo de todos modos.

---

*Documento generado: 2026-07-12 · Reorganiza `docs/roadmap-v4.md` (fases A-E) en versiones concretas. La auditoría de código subyacente sigue siendo la de esa fecha (2026-07-10) más el trabajo de v2.6 ya aplicado el 2026-07-11/12.*
