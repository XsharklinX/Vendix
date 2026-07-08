# Vendix — Roadmap de diferenciación: ser la mejor app para negocios de RD

Fecha: 2026-07-07
Rama: `codex/roadmap-fases-vendix`

---

## La apuesta estratégica

No competimos con Treinta siendo más simples que Treinta — ahí no ganamos. Treinta existe para el vendedor más informal posible: anotar una venta, anotar un fiado, ver cuánto tengo. Vendix ya es un sistema más profundo (NCF fiscal, POS con código de barras, kardex, caja con sesiones, nómina, órdenes de compra, cotizaciones, offline real). Esa profundidad es nuestra ventaja — y también nuestro riesgo, si la experiencia no la esconde bien.

**La apuesta:** ser la app que un negocio usa desde que es informal hasta que factura fiscal, tiene empleados y necesita reportes reales — sin que el usuario sienta el salto. Treinta se queda corto en el momento exacto en que el negocio empieza a crecer de verdad (inventario real, NCF, empleados). Ese es el punto donde capturamos al usuario, y lo hacemos con una experiencia que se siente tan simple como Treinta el primer día y revela poder progresivamente.

### Los cuatro pilares

1. **Revelación progresiva** — la complejidad existe pero no se impone; aparece cuando el negocio la necesita
2. **UI que se auto-explica** — cero necesidad de buscar un tutorial en YouTube
3. **Obsesión por el mercado dominicano** — NCF, WhatsApp, español real, denominaciones RD$, soporte humano
4. **Offline como argumento de venta** — no un detalle técnico, un mensaje de marketing: *"tu negocio no se detiene aunque se vaya la luz"*

### Lo que NO vamos a hacer
- No vamos a quitar profundidad para parecer más simples (eso es rendirnos, no diferenciarnos)
- No vamos a copiar el modelo de anuncios/freemium ruidoso de Treinta — nuestro free tier es genuinamente completo, sin ads
- No vamos a perseguir feature parity con ERPs pesados (Alegra, Siigo) — esos ganan en contabilidad formal compleja, nosotros ganamos en velocidad de uso diario

---

## Estado actual — lo que ya tenemos a favor

- **WhatsApp nativo** ya integrado (links `wa.me`) en CuentasCobrar y Planner — sin depender de una API de pago
- **Checklist de primeros pasos** en Dashboard (`OnboardingChecklist.tsx`) — base para expandir a un tour real
- **Onboarding con plantillas de negocio** (Abarrotes, Restaurante, Ferretería, Salón) — ya reduce fricción inicial
- **Offline real** con cola de sincronización — no es un checkbox de marketing, funciona de verdad
- **NCF automático** — algo que Treinta no ofrece y que todo negocio formal en RD necesita eventualmente
- **Sonidos, atajos de teclado, command palette** — pulido que la mayoría de competidores locales no tiene

Lo que falta es conectar estas piezas en una narrativa de producto coherente y eliminar la fricción que obliga a alguien a "buscar cómo se hace X".

---

## Fase 1 — Autoexplicación (2-3 semanas)

> *Objetivo: que nadie necesite un tutorial externo para usar cualquier función por primera vez.*

### 1.1 Tour guiado de la primera venta (no un modal, una acción)
Hoy el onboarding termina y el usuario llega a un Dashboard con 15+ secciones sin guía. La checklist existe pero es pasiva (hay que hacer clic para explorar).

**Qué hacer:** al terminar el onboarding, llevar directo a Vender.tsx con un overlay ligero tipo spotlight: *"Toca un producto para agregarlo al carrito"* → *"Ahora cobra"* → *"¡Listo, esa fue tu primera venta!"*. 3-4 pasos máximo, saltable en cualquier momento, nunca vuelve a aparecer. Reutilizar el patrón visual ya usado en `CommandPalette`/`Modal`.

### 1.2 Tooltips contextuales la primera vez (no siempre)
Términos como "NCF", "ITBIS", "kardex", "sesión de caja" son jerga para alguien nuevo en esto, aunque sean comunes en RD.

**Qué hacer:** un hook `useFirstTimeHint(key)` que muestra un tooltip pequeño la primera vez que un elemento aparece en pantalla (guardado en localStorage, igual que `OnboardingChecklist`), con una frase humana: *"NCF es el número de factura que exige la DGII — lo generamos automático"*. No más de 1 hint visible a la vez, nunca modal bloqueante.

### 1.3 Textos en español dominicano real, no traducción genérica
Auditar copy actual: reemplazar términos técnicos residuales (`taxRate`, mensajes de error genéricos) por lenguaje que un dueño de colmado reconozca. Ejemplo: no "Error al procesar la transacción" → "No se pudo completar la venta, intenta de nuevo".

**Qué hacer:** pasada de copywriting sobre toasts de error, labels de formularios, y estados vacíos (ya mejorados en fase anterior, pero verificar consistencia de tono).

### 1.4 Centro de ayuda in-app (buscador, no documento largo)
Hoy no existe ningún punto de ayuda dentro de la app — si algo no es obvio, el usuario sale a buscar en Google o WhatsApp a soporte.

**Qué hacer:** un ícono de "?" persistente (esquina, junto a NotificationBell) que abre un panel de búsqueda estilo CommandPalette pero con 15-20 preguntas frecuentes reales ("¿Cómo cierro la caja?", "¿Cómo agrego un empleado?", "¿Qué es el ITBIS?"), cada una con 2-3 líneas de respuesta + link directo a la sección. Contenido curado a mano, no genérico.

---

## Fase 2 — Revelación progresiva (3-4 semanas)

> *Objetivo: el Dashboard y el sidebar no abruman a un negocio que recién empieza.*

### 2.1 Sidebar adaptativo por madurez del negocio
Hoy el sidebar muestra las mismas 15+ secciones a todos desde el día 1 (Nómina, Órdenes de Compra, Auditoría, Cotizaciones...) — abrumador para un colmado que solo necesita vender y ver inventario.

**Qué hacer:** basado en la plantilla de negocio elegida en onboarding + uso real (si nunca entra a Empleados en 30 días, colapsarlo bajo "Más opciones"), mostrar solo las secciones relevantes al inicio. Secciones avanzadas (Nómina, Órdenes de Compra, Auditoría) empiezan colapsadas bajo un "Ver todo" expandible, se promueven a visibles automáticamente cuando el usuario las usa la primera vez.

### 2.2 Dashboard que se adapta al tamaño del negocio
14 widgets desde el día 1 es mucho para alguien con 3 productos cargados. Un dashboard vacío de gráficas también desmotiva.

**Qué hacer:** para negocios nuevos (< 30 días o < 20 transacciones), Dashboard simplificado: solo "Ventas de hoy", "Lo que te deben", y el checklist de primeros pasos. Las gráficas y widgets avanzados se activan solos cuando hay suficiente data para que tengan sentido (evita el "gráfico vacío" que confunde).

### 2.3 "Modo simple" vs "Modo completo" explícito (opcional, evaluar)
Alternativa más directa a 2.1/2.2: un toggle en Configuraciones, "Vista simple" (solo Vender, Caja, Inventario, Cuentas por Cobrar) vs "Vista completa" (todo). Menos elegante que la adaptación automática, pero más predecible y fácil de construir primero — se puede lanzar como v1 mientras 2.1 madura.

---

## Fase 3 — Obsesión por el mercado dominicano (2-3 semanas)

> *Objetivo: que un dueño de colmado sienta que la app fue hecha para él, no adaptada de otro país.*

### 3.1 Recordatorios de fiado por WhatsApp, proactivos
Hoy el envío de WhatsApp es manual (botón en CuentasCobrar). Treinta y otros compiten fuerte aquí con recordatorios automáticos.

**Qué hacer:** notificación in-app + opción de "recordatorio automático" configurable (ej. cada lunes, deudas > 7 días) que arma el link de WhatsApp pre-llenado y solo requiere un clic para enviar — sigue siendo manual en el envío final (evita spam/costos de API), pero elimina la fricción de tener que ir a buscar quién debe.

### 3.2 Calculadora de cambio en RD$ con denominaciones reales
Verificar que las denominaciones sugeridas en el POS (`getDenomPresets`) reflejen los billetes/monedas reales de RD (2000, 1000, 500, 200, 100, 50, 20, 10, 5, 1) y que el cálculo de cambio sugiera billetes disponibles, no solo el monto.

### 3.3 Soporte humano real, accesible desde la app
Ya existe `routes/support.ts` en el backend — verificar qué tan visible es desde el frontend. Un negocio dominicano confía más en poder escribirle a alguien que en un FAQ.

**Qué hacer:** botón de soporte por WhatsApp Business visible (no escondido en Configuraciones), con mensaje pre-armado que incluye contexto útil (versión de la app, tipo de negocio) para que el soporte no tenga que preguntar lo básico.

### 3.4 Validación de RNC/Cédula para clientes con NCF fiscal
Negocios formales necesitan validar el RNC de sus clientes para facturas con crédito fiscal. Si no existe, es una fricción real para negocios B2B (ferreterías que venden a otras empresas, por ejemplo).

**Qué hacer:** evaluar si integrar con el padrón de contribuyentes de la DGII (dato público, se puede scrapear/consultar) para autocompletar nombre de empresa al ingresar RNC — ahorra tipeo y evita errores en facturas fiscales.

---

## Fase 4 — Offline como argumento de venta (1-2 semanas, mayormente marketing)

> *Objetivo: convertir una fortaleza técnica silenciosa en la razón #1 para elegir Vendix.*

### 4.1 Indicador de estado offline más visible y tranquilizador
Hoy existe detección offline y cola de sincronización, pero el mensaje al usuario debe sentirse como una ventaja, no como una alerta de error.

**Qué hacer:** revisar el copy del indicador offline — de "sin conexión" (suena a error) a algo como "Modo sin internet — tus ventas se guardan y sincronizan solas" (tranquiliza y educa sobre la ventaja).

### 4.2 Mensaje explícito en onboarding y landing
En el wizard de onboarding y en cualquier material de marketing/landing, decir explícitamente: *"Vendix funciona aunque se vaya la luz o el internet — tu negocio no se detiene"*. Esto es un diferenciador real contra apps que dependen 100% de la nube (incluyendo Treinta en ciertos flujos).

### 4.3 Prueba de fuego: modo avión real en checklist de QA
Antes de cualquier lanzamiento importante, correr un checklist manual: activar modo avión, hacer una venta completa (con cliente, descuento, multi-producto), verificar que sincroniza sin pérdida de datos al reconectar. Esto no es solo QA — es la garantía detrás de la promesa de marketing.

---

## Fase 5 — Medir si está funcionando (continuo, en paralelo)

No se puede saber si "la app se entiende sola" sin datos. Cuando el modo cloud + analytics opt-in de `roadmap-saas.md` esté listo, instrumentar:

- **Tasa de finalización del onboarding** — ¿cuántos llegan a la primera venta real?
- **Tiempo hasta la primera venta** — el número que más le importa a Treinta también nos importa a nosotros
- **Uso del centro de ayuda** — qué preguntas se buscan más (revela qué no es obvio en la UI)
- **Secciones nunca visitadas por segmento de negocio** — valida si la revelación progresiva (Fase 2) está bien calibrada
- **Retención a 30/60/90 días por plantilla de negocio** — ¿el colmado se queda más que la ferretería, o al revés?

---

## Orden de ejecución recomendado

```
Fase 1 (autoexplicación) — el impacto más inmediato en "no necesito buscar guías"
    ↓
Fase 3 (mercado dominicano) — puede ir en paralelo con Fase 1, son equipos de trabajo distintos (copy/soporte vs código)
    ↓
Fase 2 (revelación progresiva) — requiere que Fase 1 esté sólida primero (tooltips + tour ya deben existir)
    ↓
Fase 4 (offline como marketing) — rápida, mayormente copy, se puede intercalar en cualquier punto
    ↓
Fase 5 (medir) — depende de que exista el modo cloud (roadmap-saas.md Fase 1, ya desplegada)
```

---

## Riesgo principal

El riesgo no es técnico, es de disciplina de producto: es muy fácil que "revelación progresiva" se convierta en una excusa para nunca simplificar de verdad, o que el centro de ayuda se llene de FAQs genéricas en vez de las 15-20 preguntas reales que la gente hace. Cada ítem de este roadmap debe validarse con el mismo filtro de siempre: **¿esto hace que alguien sin experiencia previa entienda la app sin ayuda externa, o solo se ve bien en la lista?**

---

*Documento generado: 2026-07-07 · Complementa `roadmap-v3.md` (calidad técnica) y `roadmap-saas.md` (infraestructura cloud). Este documento cubre la dimensión de producto/UX y posicionamiento competitivo frente a Treinta y similares en el mercado dominicano.*
