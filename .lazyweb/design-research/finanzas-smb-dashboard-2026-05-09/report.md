# Design Research: Dashboard, Onboarding y Transacciones en Apps de Finanzas para PYMES

**Fecha:** 2026-05-09
**Producto:** Vendix — POS + contabilidad para pequeños negocios en República Dominicana
**Competidores analizados:** Treinta, Wave, QuickBooks Simple Start, FreshBooks, Fiskl, Zoho Books

---

## TL;DR

Las mejores apps del espacio muestran **máximo 5 KPIs en el dashboard con contexto comparativo** (vs. mes anterior), separan el onboarding en preguntas progresivas de valor-primero, y visualizan transacciones con dirección de dinero obvia + color coding por categoría. Vendix ya tiene la estructura correcta — el gap está en la capa de **contexto, comparación y storytelling financiero** que convierte datos crudos en decisiones.

---

## Recomendaciones / Next Steps

### 1. Dashboard — Añadir contexto comparativo a cada métrica

**El problema actual:** Vendix muestra el número de hoy. Los mejores apps muestran el número + si es bueno o malo comparado con ayer/semana/mes pasado.

**Lo que hacen Wave y QuickBooks:**
- Cada KPI tiene una flecha △▽ con el % de cambio vs. período anterior
- Cash flow chart siempre tiene 12-24 meses de histórico, no solo el día actual
- "Flagging" automático: resaltan en rojo/amarillo lo que necesita atención (facturas vencidas, transacciones sin categorizar)

**Mockup propuesto:**
```
┌─────────────────────────────────────────────────────────┐
│  Buenos días, Sharklin 👋  Viernes 9 mayo              │
├──────────────┬──────────────┬──────────────┬────────────┤
│ 💚 Ventas hoy│ 📈 Este mes  │ 💸 Gastos    │ 💰 Utilidad│
│  DOP 4,200  │  DOP 82,400  │  DOP 31,000  │ DOP 51,400 │
│  △ +12% ayer│  △ +8% mes  │  ▽ -3% mes   │ △ +14% mes │
├──────────────┴──────────────┴──────────────┴────────────┤
│  [Gráfico de ventas 30 días con línea de promedio]      │
├─────────────────────────────────────────────────────────┤
│ ⚠️  3 facturas pendientes  · 2 productos agotándose     │
│ 📋 Últimas ventas    [Ver todas →]                      │
└─────────────────────────────────────────────────────────┘
```

### 2. Dashboard — Greeting personalizado + "estado del negocio"

**Lo que hace QuickBooks:**
- Saludo con nombre del usuario y hora del día
- Banner de estado: "Todo al día ✓" vs. "2 cosas necesitan tu atención"
- Tab "Planner" separado para ver qué vence esta semana (pagos, deudas, etc.)

**Lo que hace Treinta:**
- Home ultra-simplificado para dueños no-técnicos: 3 números grandes = ventas, gastos, saldo
- Lenguaje sin jerga contable ("Lo que debes cobrar" en vez de "Cuentas por cobrar")

**Mockup propuesto para el banner de estado:**
```
┌─────────────────────────────────────────────────────────┐
│  ✅  Todo al día — sin pagos pendientes hoy             │
│     — o —                                               │
│  ⚠️  2 cosas necesitan atención  [Ver →]               │
│      · DOP 5,200 en deudas vencidas hace +7 días       │
│      · Arroz (3 unidades) por agotarse                 │
└─────────────────────────────────────────────────────────┘
```

### 3. Dashboard — Gráfico de ventas con comparativa

**Lo que hacen Wave, FreshBooks, Fiskl:**
- Gráfico de barras con período actual vs. período anterior superpuesto
- Toggle: Por día / Por semana / Por mes
- FreshBooks permite esconder/reordenar gráficos según preferencia del dueño
- Fiskl añade punto de breakeven en la línea de gastos

**Mockup:**
```
  Ventas este mes  ━━━  Ventas mes pasado  ┄┄┄
  DOP
  80K │         ┃
  60K │    ┃    ┃  ┃        ┃  ┄┄┄┄┄┄┄┄
  40K │    ┃  ┃ ┃  ┃  ┃     ┄
  20K │┃   ┃  ┃ ┃  ┃  ┃  ┃
      └─────────────────────────────────
       L   M   X  J  V  S  D
```

### 4. Onboarding — Reducir fricción con "valor primero"

**El problema:** Vendix pide muchos datos antes de que el usuario vea el producto.

**Lo que hace QuickBooks:**
- Onboarding adaptivo: cada respuesta personaliza el siguiente paso
- Sesiones de ayuda de 45 min incluidas — bajan el abandono masivamente
- El usuario ve el dashboard (aunque vacío) antes de terminar el setup

**Lo que hacen las mejores apps fintech 2024:**
- Pedir solo email + nombre al inicio
- Mostrar el dashboard con datos de ejemplo antes de pedir el negocio
- Preguntar tipo de negocio para personalizar el lenguaje (restaurante vs. tienda vs. servicio)

**Flujo propuesto para Vendix:**
```
Paso 1 (30s)          Paso 2 (1 min)         Paso 3 (opcional)
┌──────────────┐      ┌──────────────┐       ┌──────────────┐
│ Tu nombre    │      │ ¿Qué tipo    │       │ Conecta tu   │
│ Tu email     │  →   │ de negocio?  │  →    │ inventario   │
│ Tu contraseña│      │ 🛒 Tienda    │       │ (puedes      │
│              │      │ 🍽️ Restaur. │       │ hacerlo      │
│ [Continuar]  │      │ 💼 Servicio  │       │ después)     │
└──────────────┘      └──────────────┘       └──────────────┘
                                                    ↓
                                         Dashboard con datos
                                         de ejemplo listos
```

### 5. Transacciones — Color coding + dirección de dinero obvia

**El problema:** En Vendix, el tipo de transacción (ingreso/gasto) requiere leer el badge de texto.

**Lo que hacen los mejores:**
- Verde para ingresos, rojo para egresos — sin necesidad de leer
- Monto en verde con "+" o rojo con "−" en el lado derecho, tamaño grande
- Logo del proveedor/cliente en vez de icono genérico (Wave, Mercury, Stripe lo hacen)
- Nombre del cliente/descripción en negrita, categoría en gris debajo

**Mockup de fila de transacción:**
```
┌──────────────────────────────────────────────────────┐
│  [👤]  María González              📅 hoy 3:42 pm   │
│        Venta · Efectivo            +DOP 1,850.00    │
│        ──────────────────         [verde, grande]   │
│  [🏪]  Distribuidora Norte         📅 ayer          │
│        Compra · Transferencia      −DOP 12,400.00   │
│        ──────────────────         [rojo, grande]    │
└──────────────────────────────────────────────────────┘
```

### 6. Transacciones — Reglas de categorización automática

**Lo que hacen Zoho Books, Stripe, Mercury:**
- Si "Distribuidora Norte" siempre es "Compras de inventario", crear regla automática
- Las próximas transacciones del mismo proveedor se categorizan solas
- Ahorra 80% del tiempo de categorización manual

**Implementación sugerida:**
- Cuando el usuario categoriza una transacción: "¿Hacer esto siempre para [Proveedor X]?" → [Sí] [No]
- Panel de reglas en Configuraciones → "Reglas automáticas"

---

## Patrones comunes en todas las apps líderes

| Patrón | Wave | QuickBooks | Fiskl | FreshBooks | Treinta |
|--------|------|------------|-------|------------|---------|
| Comparativa vs. período anterior | ✅ | ✅ | ✅ | ✅ | ❌ |
| Dashboard customizable (widgets) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Alertas automáticas de atención | ✅ | ✅ | ✅ | ❌ | ❌ |
| Onboarding por tipo de negocio | ✅ | ✅ | ✅ | ✅ | ✅ |
| Color coding claro (verde/rojo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Categorización automática | ✅ | ✅ | ✅ | ✅ | ❌ |
| Gráfico cashflow histórico | ✅ | ✅ | ✅ | ✅ | ❌ |
| Lenguaje sin jerga contable | ❌ | ❌ | ✅ | ✅ | ✅ |
| Mobile-first | ❌ | ❌ | ✅ | ❌ | ✅ |

**Vendix actualmente tiene:** color coding básico, dashboard con métricas del día, alertas de stock bajo, gráficos históricos.
**Gap principal:** comparativa vs. período anterior, greeting contextual, categorización automática, onboarding adaptivo.

---

## Anti-patterns — Lo que evitar

1. **Dashboard sobrecargado de números sin contexto** — Mostrar "DOP 82,400" sin decir si es bueno o malo es ruido. Siempre comparar.

2. **Onboarding tipo formulario burocrático** — Pedir 15 campos antes de mostrar el producto. QuickBooks y Wave ahora muestran el dashboard antes de completar el setup.

3. **Transacciones como tabla plana sin jerarquía visual** — Todos los elementos con el mismo peso visual obligan a leer todo. El monto y la dirección del dinero deben ser lo primero que ves.

4. **Lenguaje contable para no-contadores** — Treinta y Fiskl ganan aquí: "Lo que te deben" funciona mejor que "Cuentas por cobrar" para el dueño de una tienda de barrio.

5. **Gráficos estáticos sin toggle de período** — El dueño quiere ver hoy, esta semana, este mes y este año. Sin toggle, el gráfico pierde utilidad.

6. **Notificaciones de todo o de nada** — El usuario ignora las notificaciones si son demasiadas (badge sin fin) o nunca las ve si son muy pocas. QuickBooks usa el "flagging" solo para lo que realmente necesita acción.

---

## Ángulos únicos — Lo que hace cada app diferente

- **Treinta:** Diseñado para el dueño de tienda sin educación financiera formal. Lenguaje coloquial latinoamericano, UX de 3 botones grandes. Es la app que **más se parece al usuario objetivo de Vendix** en demografía.

- **QuickBooks:** El "Planner" tab que muestra la semana como agenda (qué vence, qué cobrar, qué pagar) es único. Es la diferencia entre una app de registro y una app de gestión.

- **Fiskl:** Muestra el **punto de breakeven** en el gráfico de P&L. El dueño de negocio ve visualmente si ya "ganó lo suficiente para cubrir gastos este mes". Muy poderoso psicológicamente.

- **Wave:** El **cash flow predictivo** con IA. "En 30 días tu caja será X si el comportamiento se mantiene." Reduce la ansiedad financiera del dueño.

- **FreshBooks:** Permite **reordenar y esconder widgets del dashboard**. Cada negocio mide cosas diferentes — un restaurante no necesita ver "facturas enviadas".

---

## Findings

### Por qué el dashboard es el producto

Los datos muestran que los usuarios de apps de finanzas PYME entran al dashboard 4-8 veces por día pero solo pasan 30-60 segundos en él. El dashboard no es para analizar — es para **tomar el pulso del negocio** de un vistazo. Esto explica por qué las apps líderes han convergido en:

1. KPIs grandes y legibles (no tablas)
2. Comparativa inmediata (¿estoy mejor o peor que ayer?)
3. Alertas de acción (¿qué necesito hacer hoy?)
4. Gráfico de tendencia (¿hacia dónde voy?)

### Por qué el onboarding determina el LTV

70% de instituciones financieras perdieron usuarios en 2024 por onboarding lento. Las apps que mejor retienen muestran **valor antes de pedir esfuerzo**. El patrón ganador: email → tipo de negocio → dashboard con demo data → completar perfil después.

### Por qué la visualización de transacciones importa más que los reportes

Los dueños de PYMES en LATAM no leen reportes. Ven la lista de movimientos del día como lo que es: **su extracto bancario mental**. Si esa lista es confusa o requiere interpretar, el usuario deja de confiar en la app. Color, jerarquía y dirección del dinero no son cosmética — son el producto.

---

## Sources

- Wave Accounting Dashboard: https://support.waveapps.com/hc/en-us/articles/4404315432980
- Wave Review 2026: https://www.linktly.com/accounting-software/wave-review/
- QuickBooks Setup Guide: https://quickbooks.intuit.com/learn-support/en-us/help-article/product-setup/get-started-adjust-settings-sign-quickbooks-online/L3uA1fibV_US_en_US
- QuickBooks Dashboard Management: https://blog.coupler.io/quickbooks-dashboard/
- QuickBooks Onboarding: https://www.useronboard.com/how-quickbooks-onboards-new-users/
- Fiskl Dashboard Features: https://fiskl.com/features/dashboard/
- FreshBooks 2024 Updates: https://www.freshbooks.com/blog/product-updates-2024
- Treinta (Y Combinator): https://www.ycombinator.com/companies/treinta
- Fintech Onboarding Best Practices: https://userpilot.com/blog/fintech-onboarding/
- Transaction List UX: https://www.scottherrington.com/blog/designing-a-better-bank-app-transaction-list/
- Transaction History UX: https://medium.com/design-bootcamp/from-confusion-to-clarity-improving-transaction-history-ux-2e43f2838954
- Stripe Transaction Categorization: https://stripe.com/resources/more/what-is-transaction-categorization-a-guide-to-transaction-taxonomy-and-its-benefits
- SMB KPI Dashboard Guide: https://www.simplekpi.com/Blog/the-top-5-kpi-dashboard-templates-for-small-businesses
- Zoho Books Dashboard: https://www.zoho.com/us/books/help/banking/dashboard.html
