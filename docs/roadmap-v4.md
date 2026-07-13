# Vendix — Roadmap v4: próximas versiones

Fecha: 2026-07-10
Rama: `codex/roadmap-fases-vendix`

Este documento consolida y prioriza lo que sigue, después de auditar el estado real del código (no solo los roadmaps anteriores, que en varios puntos ya estaban desactualizados respecto al trabajo hecho). Los tres roadmaps previos (`roadmap-v3.md` técnico, `roadmap-saas.md` cloud, `roadmap-diferenciacion.md` producto/UX) siguen siendo la referencia detallada por área — este documento es el mapa de prioridades entre los tres.

---

## Lo que se construyó desde el último corte (resumen honesto)

Más de lo que el propio roadmap técnico registraba. En orden cronológico real:

- **v2.1** — Papelera funcional (Inventario, Clientes, Empleados — falta Proveedores), filtros persistentes, dashboard con retry, pantalla de estado del sistema
- **v2.2** — Export CSV-UTF8, aging de cuentas por cobrar, "Copiar resumen" de cierre de caja, cierre diario persistido (`DailyCloseSnapshot`)
- **v2.3** — Kardex ampliado, alertas de sin-movimiento y margen bajo, import CSV/XLSX con preview, conteo físico con ajuste automático, transferencias internas (sin modelo de sucursal real todavía)
- **v2.4** — Canje de puntos en el POS, recordatorios y cotizaciones-por-vencer en Planner, campaña de clientes inactivos (genera lista, no envía masivo), etiquetas manuales de cliente
- **v2.5** — Auto-update con canal estable/beta, logs accesibles, backup/restore en 2 pasos, reparador SQLite básico
- **v3.0** — Tests reales (19 backend + 22 frontend, todos pasan), CI en GitHub Actions, logging de errores 5xx
- **v3.2** — Backend cloud con Postgres, Docker Cloud para self-host, permisos granulares (parcial), sync multi-dispositivo del catálogo maestro (MVP funcional, alcance limitado)
- **Recién agregado (sin versión aún)** — Tip del día ("¿Sabías que...?"): tips contextuales rotativos, más frecuentes para usuarios nuevos, primera pieza real de la Fase 1 de `roadmap-diferenciacion.md`

Este historial importa porque cambia las prioridades: **la base técnica está más sólida de lo que el roadmap anterior asumía** (tests, CI, cloud, sync ya existen). Lo que falta ahora es menos "construir desde cero" y más "cerrar huecos y pulir lo que ya funciona a medias".

---

## Filtro de decisión (se mantiene)

**¿Esto hace que vender sea más rápido, que el dueño confíe más en sus números, o que el producto se sienta terminado?** Si no, no entra.

---

## Fase A — Cerrar huecos de una tarde (días)

> *Trabajo ya empezado que quedó a medio camino — el mayor retorno por menor esfuerzo de todo este documento.*

### A.1 Papelera en Proveedores
`TrashPanel` está integrado en Inventario, Clientes y Empleados pero no en Proveedores, pese a que el backend ya soporta `deletedAt` en `Supplier`. Es copiar el mismo patrón que ya existe en las otras tres páginas.

### A.2 Modo oscuro en componentes compartidos
`QueryError`, `Pagination` y `EmptyState` siguen sin clases `dark:` (confirmado, sigue pendiente de `roadmap-v3.md` 1.2). Se ven mal sobre fondo oscuro. 20-30 minutos de trabajo mecánico.

### A.3 Verificar firma de código de Windows
Hay señales contradictorias: `docs/v2.5-desktop-profesional.md` dice explícitamente que falta certificado real (`CSC_LINK`/`CSC_KEY_PASSWORD`), pero conversaciones anteriores sugerían que se había resuelto. **Antes de prometer nada a usuarios, verificar en el próximo build (`npm run dist`) si SmartScreen sigue mostrando advertencia.** Si sigue pendiente, es el ítem 3.4 de `roadmap-v3.md` sin resolver — bloquea conversión de descargas.

### A.4 Dashboard: loading state por widget
Sigue exactamente como estaba — 14 queries independientes sin skeleton individual (`roadmap-v3.md` 1.3, nunca se tocó).

---

## Fase B — El sync necesita terminar lo que empezó (2-3 semanas)

> *Es la pieza más grande a medio construir. Terminarla bien vale más que empezar algo nuevo.*

### B.1 Extender el sync a ventas (append-only)
El MVP de v3.2 sincroniza catálogo (productos, clientes, proveedores, empleados) pero **no ventas ni caja** — que es exactamente lo que un dueño con 2 dispositivos más quiere ver ("¿cuánto vendió el cajero hoy, visto desde mi casa?"). Las transacciones son append-only por diseño de la app — es el caso más simple de sincronizar (nunca hay conflicto, solo se agregan) y el roadmap SaaS original ya lo identificaba como el 80% de valor con 20% del riesgo.

**Qué hacer:** extender `syncOutbox.ts` para registrar `transaction` como entidad sincronizable (solo creación, nunca edición — las ventas no se editan, se anulan con una transacción nueva de reverso). Servidor y worker ya tienen la infraestructura — es agregar el tipo de entidad al mapa existente, no construir el mecanismo desde cero.

### B.2 Conflictos reales, no "el último que llega gana" ciego
Hoy `LAST_WRITE_WINS` no compara `updatedAt` de origen vs destino — simplemente aplica lo último que procesa. Con 2+ dispositivos activos esto puede pisar cambios silenciosamente.

**Qué hacer:** en `applySyncChange` (servidor) y `applyRemoteChange` (worker), comparar `updatedAt` del cambio entrante contra el registro existente antes de aplicar — descartar si el registro local es más reciente, en vez de aplicar siempre.

### B.3 Activar el worker por defecto para cuentas Pro
Hoy `VENDIX_SYNC_ENABLED=false` por defecto incluso con plan Pro activo. Sin esto, todo lo de B.1/B.2 no lo ve nadie.

**Qué hacer:** al confirmar plan Pro (vía `/api/license`), activar el worker automáticamente en el desktop. Requiere que A.3 y la Fase C de `roadmap-saas.md` (planLimits real) avancen en paralelo.

---

## Fase C — Reactivar el negocio del SaaS (1-2 semanas)

> *`LicenseGrant` y el sync existen; falta la pieza que convierte esto en ingresos.*

### C.1 Reactivar `planLimits.ts`
Confirmado: sigue siendo pass-through puro (`Infinity` en todo), pese a que `LicenseGrant` ya resuelve planes. No hay ninguna diferencia funcional hoy entre plan Free y Pro más allá de lo que el usuario decida activar manualmente.

**Qué hacer:** el mínimo viable es simple — el respaldo cloud (roadmap-saas.md 2.1, sigue sin construirse) y el sync (Fase B de este documento) deberían estar detrás de un check de plan real, no de env vars sueltas.

### C.2 Respaldo automático a la nube
Sigue siendo el ítem de mayor ROI de todo `roadmap-saas.md` y no se ha tocado. Con esto solo, ya hay algo vendible como plan Pro sin depender de que el sync esté perfecto.

### C.3 LemonSqueezy — seguimiento
Estado de la solicitud de cuenta enviada la sesión pasada — confirmar si ya fue aprobada. Si sigue pendiente de respuesta, vale la pena escribirles de nuevo o evaluar Paddle como alternativa si pasan más de ~2 semanas sin respuesta.

---

## Fase D — Autoexplicación (1-2 semanas)

> *`roadmap-diferenciacion.md` Fase 1 — el "Tip del día" ya es el primer paso. Falta lo que más impacto tiene en "no necesito buscar una guía".*

### D.1 Tour guiado de la primera venta
El onboarding termina en un Dashboard sin guía. Sigue pendiente exactamente como se describió: overlay tipo spotlight de 3-4 pasos en la primera visita a Vender.tsx, saltable, no vuelve a aparecer.

### D.2 Centro de ayuda in-app
No existe ningún punto de ayuda dentro de la app todavía. Un buscador estilo `CommandPalette` con 15-20 preguntas reales cubriría la mayoría de las dudas que hoy terminan en WhatsApp a soporte o búsquedas en Google.

### D.3 Historial de precios visible en el POS
Sigue siendo un pendiente puntual y pequeño (`roadmap-v3.md` 2.2) — badge "↑ Antes: RD$X" en la tarjeta de producto si el precio cambió en los últimos 7 días.

---

## Fase E — Deuda técnica que ya no se puede posponer (2-3 semanas)

> *Las páginas monolíticas no se estabilizaron — crecieron.*

### E.1 Dividir páginas monolíticas — ahora es más urgente
Comparado con el último corte, todas crecieron: Configuraciones pasó de 1015 a **1576 líneas** (+55%, por Cloud sync + permisos), Vender de 1238 a 1284, Reportes de 870 a 1186, Inventario de 859 a 1104, Dashboard de 781 a 830. Cada nueva feature en estos archivos es cada vez más riesgosa de tocar.

**Prioridad de división, por tamaño e impacto:** Configuraciones primero (por pestaña: General/Tax/Receipt/Backup/Users/CloudSync/Permissions), luego Reportes, luego Vender.

### E.2 Bundle de Inventario
Sigue siendo el bundle más pesado del frontend (confirmado por el propio `docs/v2.3-inventario-serio.md`). Analizar con `vite-bundle-visualizer` antes de seguir agregando features ahí.

### E.3 Mapear cobertura real de `requirePermission`
El sistema de permisos (`permissions.ts`) existe y es sólido en diseño, pero no todas las rutas lo aplican todavía — solo se confirmó en algunas. Antes de anunciar "permisos granulares" como feature, hacer un barrido ruta por ruta.

---

## Lo que sigue sin justificarse (se mantiene igual que roadmap-v3.md)

- **i18n**, **migrar de SQLite**, **IA/chatbots**, **expandir el Planner**, **modo offline completo de todo** — mismos argumentos que antes, nada cambió que amerite revisar esto.
- **Multi-sucursal real** — v2.3 ya dejó la puerta entreabierta (transferencias con destino en texto libre, sin modelo `Branch`), pero seguir construyendo esto sin validar cuántos usuarios tienen 2+ negocios sigue siendo prematuro.
- **App móvil companion, pasarelas de pago (Azul/Cardnet)** — igual que antes, evaluar solo si hay tracción real.

---

## Orden sugerido

```
Fase A (huecos rápidos) ──┬──→ Fase D (autoexplicación) ── en paralelo, equipos/tiempo distinto
                           │
                           └──→ Fase B (sync completo) ──→ Fase C (negocio SaaS)
                                                                    │
Fase E (deuda técnica) ── continuo, meter cuando haya espacio ──────┘
```

La Fase A se hace primero porque es literalmente barata (menos de un día completo). Fase D puede avanzar en paralelo por ser trabajo mayormente de frontend/copy, sin depender de B o C. La secuencia B→C es la que de verdad mueve el negocio: no tiene sentido cobrar (C) por un sync que solo mueve la mitad de los datos que un dueño con 2 dispositivos necesita ver (B). La Fase E se intercala cuando haya que tocar esos archivos de todos modos — no bloquea nada más, pero cada vez que se posterga cuesta más caro.

---

*Documento generado: 2026-07-10 · Basado en auditoría directa del código (no solo de los roadmaps previos) tras confirmar que hubo trabajo significativo — sync multi-dispositivo, tests, CI, permisos — no reflejado en `roadmap-v3.md`/`roadmap-saas.md` al momento de escribirlos.*
