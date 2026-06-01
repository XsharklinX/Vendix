# Funcionalidades

## 1. Punto de Venta — Vender (`Vender.tsx`)

La pantalla principal de operación diaria. Permite registrar ventas de forma rápida.

### Búsqueda de productos
- Búsqueda en tiempo real por **nombre** o **código de barras**
- Resultados instantáneos con nombre, precio y stock disponible
- Soporte de lector de código de barras USB/serial

### Carrito de compra
- Añadir / quitar productos con botones de cantidad
- Editar precio unitario directamente en el carrito
- Descuento por ítem o descuento global (monto fijo o porcentaje)
- Descuento automático VIP si el cliente seleccionado tiene `vipDiscount > 0`
- **Persistencia de sesión:** el carrito se guarda en `sessionStorage` y sobrevive recargas accidentales de la página

### Precios por volumen
Si el producto tiene `VolumePricing` configurado, el precio se ajusta automáticamente al alcanzar la cantidad mínima.

### Selección de cliente
- Búsqueda de cliente por nombre o teléfono
- Si se selecciona un cliente VIP, su descuento se aplica al total
- Las ventas con cliente pueden quedar en estado `PENDING` (venta a crédito)

### Métodos de pago
- **Efectivo (CASH):** muestra campo de monto recibido y calcula vuelto
- **Tarjeta (CARD)**
- **Transferencia (TRANSFER)**

### Multi-moneda
- Selector de moneda alternativa (USD, EUR, COP, MXN, VES, DOP)
- Campo de tasa de cambio manual
- Muestra el equivalente en la moneda local en tiempo real
- Los datos `originalCurrency`, `exchangeRate` y `originalAmount` se guardan en la transacción

### NCF (República Dominicana)
- Si el negocio tiene `ncfEnabled: true`, se genera automáticamente el número de comprobante fiscal
- El NCF se incluye en el recibo y en la factura PDF

### Post-venta
- **Recibo:** impresión directa vía `window.print()` con CSS optimizado para impresora térmica
- **Factura PDF:** genera un documento HTML/CSS completo en una ventana emergente con estilos A4, datos del negocio, cliente, ítems y totales; el usuario activa `Ctrl+P`
- El carrito se limpia automáticamente tras la venta exitosa

---

## 2. Inventario (`Inventario.tsx`)

### Gestión de productos
- Listado con nombre, categoría, precio, costo, stock y margen calculado
- Indicador visual de stock bajo (cuando `stock ≤ lowStockThreshold`)
- Creación y edición de productos con formulario completo
- Eliminación con confirmación

### Categorías
- Crear y asignar categorías a productos
- Filtro por categoría en la lista

### Importación masiva
- Subir archivo CSV o Excel con columnas: `nombre, precio, costo, stock, codigo_barras, categoria`
- Previsualización antes de confirmar
- Reporte de ítems creados, omitidos y errores

### Historial de precios
- Modal con línea de tiempo de cambios de precio de cada producto

### Precios por volumen
- Configurar niveles de precio escalonado por cantidad desde el modal de edición

---

## 3. Movimientos / Transacciones (`Movimientos.tsx`)

Registro completo de todos los movimientos financieros.

### Tipos de movimiento
| Tipo | Descripción |
|---|---|
| `SALE` | Venta de productos o servicios |
| `EXPENSE` | Gasto del negocio |
| `INCOME` | Ingreso adicional (no venta) |
| `PURCHASE` | Compra a proveedor |

### Filtros
- Por tipo (`SALE`, `EXPENSE`, `INCOME`, `PURCHASE`)
- Por estado (`COMPLETED`, `PENDING`, `CANCELLED`)
- Por rango de fechas

### Devoluciones
- Botón de anulación/devolución en cada transacción
- Restaura el stock si la transacción tenía ítems

### Deuda pendiente
- Las ventas con `status: PENDING` representan deudas por cobrar
- Se pueden marcar como cobradas (`COMPLETED`) directamente desde la lista

---

## 4. Dashboard (`Dashboard.tsx`)

Panel de control con métricas en tiempo real del negocio.

### Tarjetas KPI
| Métrica | Descripción |
|---|---|
| Ventas hoy | Total en dinero y número de transacciones |
| Ventas del mes | Acumulado del mes en curso |
| Margen del mes | `(ventas - costo) / ventas × 100` |
| Mejor hora | Hora del día con más ventas históricamente |

### Gráfica de ventas
- Área chart de los últimos 30 días
- Muestra ventas y gastos superpuestos
- Construido con Recharts

### Top 5 productos
- Productos más vendidos del mes por cantidad
- Con barra de progreso relativa al primero

### Alertas
- Stock bajo: lista de productos por debajo del umbral
- Deudas pendientes: clientes con saldo pendiente

### Resumen financiero gerencial
- Margen por categoría con barras de progreso y código de color (verde > 30%, amarillo > 10%, rojo ≤ 10%)
- Productos con pérdida (margen negativo o < 10%)
- Días sin ventas en el período

### Sesión de caja
- Estado visible en el dashboard: abierta / cerrada
- Acceso directo a la pantalla Caja

---

## 5. Estadísticas (`Estadísticas.tsx`)

Analytics avanzados con comparativas y tendencias.

- Ventas por período con comparativa mes anterior
- Rendimiento por categoría de producto
- Márgenes por producto
- Tendencias de crecimiento

---

## 6. Clientes (`Clientes.tsx`)

### Gestión
- CRUD completo de clientes
- Marcar como VIP con descuento automático (%)
- Campo de teléfono para WhatsApp

### Deudas pendientes
- Vista de deuda acumulada por cliente
- Ordenar por monto de deuda

### Recordatorios WhatsApp
- Botón individual: envía mensaje de deuda a un cliente específico
- Botón masivo: envía a todos los clientes con deuda > 0
- Requiere integración Twilio activa (ver [integrations.md](integrations.md))

---

## 7. Caja (`Caja.tsx`)

### Sesiones de caja
- **Abrir caja:** registra el monto inicial de efectivo
- **Cerrar caja:** registra el monto contado al final; la app calcula el esperado basado en ventas en efectivo
- Diferencia = monto contado − monto esperado (detecta sobrantes/faltantes)
- Solo puede haber una sesión abierta por negocio a la vez

### Indicador global
El estado de la caja (abierta/cerrada) se muestra en el sidebar con un badge de color.

---

## 8. Cuentas por Cobrar (`CuentasCobrar.tsx`)

Vista consolidada de todas las ventas con estado `PENDING`:
- Agrupadas por cliente
- Con fecha de la transacción y monto
- Botón para marcar como cobrada directamente

---

## 9. Cotizaciones (`Cotizaciones.tsx`)

### Estados
| Estado | Descripción |
|---|---|
| `DRAFT` | Borrador, no enviado |
| `SENT` | Enviado al cliente |
| `ACCEPTED` | Cliente aceptó |
| `REJECTED` | Cliente rechazó |

- Crear cotización con ítems, cliente y fecha de vencimiento
- Convertir cotización aceptada en transacción de venta

---

## 10. Proveedores (`Proveedores.tsx`)

- CRUD de proveedores con contacto
- Vista de deuda pendiente hacia proveedores (compras en estado `PENDING`)

---

## 11. Empleados (`Empleados.tsx`)

- Registro de empleados con cargo y salario
- Marcar como activo/inactivo
- Información de contacto

---

## 12. Reportes (`Reportes.tsx`)

- Exportar transacciones a CSV con filtros de fecha y tipo
- Resumen financiero del período: ingresos, gastos, utilidad bruta, neta
- Vista de impresión

---

## 13. Configuraciones (`Configuraciones.tsx`)

Panel con múltiples pestañas:

### General
- Nombre del negocio
- Moneda principal
- Umbral de stock bajo

### Impuestos
- Nombre del impuesto (ej. ITBIS)
- Tasa porcentual
- Impuesto incluido en precio o añadido al total

### NCF (República Dominicana)
- Activar/desactivar NCF
- Tipo de NCF (B01, B02, etc.)
- Reiniciar secuencia

### Staff / Cajeros
- Crear nuevos cajeros (nombre + email + contraseña)
- Ver cajeros existentes
- Eliminar cajeros

### Múltiples negocios
- Crear un negocio adicional
- Cambiar de negocio activo desde el selector en el sidebar

### Suscripción (Billing)
- Ver plan actual (Free / Pro)
- Tarjetas de upgrade (mensual / anual con Stripe Checkout)
- Historial de facturas
- Acceso al portal de facturación de Stripe

### Backup automático
- Toggle para activar/desactivar
- Selector de intervalo: Diario (1), Semanal (7), Quincenal (15), Mensual (30)
- Fecha del último backup realizado
- El backup se envía por email como archivo JSON adjunto

---

## 14. Log de Auditoría (`AuditLog.tsx`)

Registro inmutable de todas las acciones del negocio:
- Quién realizó la acción
- Qué acción fue (CREATE, UPDATE, DELETE, LOGIN)
- Sobre qué entidad (TRANSACTION, PRODUCT, AUTH...)
- IP de origen y fecha/hora
- Filtros por tipo de entidad y acción
- Paginación

Solo visible para propietarios (`OWNER`).

---

## 15. Notificaciones in-app

### Tipos automáticos
| Tipo | Cuándo se genera |
|---|---|
| `LOW_STOCK` | Después de cada venta que deja un producto en/bajo el umbral |
| `PENDING_DEBT` | Cada 24 h si hay clientes con deudas pendientes |

### UI
- Campana en el header con badge de no leídas
- Panel desplegable con lista de notificaciones
- Marcar como leída individualmente o todas
- Click en notificación navega al recurso relacionado

---

## 16. Onboarding (`Onboarding.tsx`)

Wizard de bienvenida para usuarios nuevos:
1. Nombre del negocio
2. Moneda y país
3. Primer producto (opcional)
4. Primer cliente (opcional)

---

## 17. Multi-negocio

Un propietario puede crear y gestionar múltiples negocios desde la misma cuenta:
- Cada negocio tiene su propia configuración, inventario, clientes y transacciones
- El negocio activo se selecciona desde el selector en el sidebar
- El JWT incluye el `businessId` activo; cambiar de negocio actualiza el token

---

## 18. Modo escritorio (Electron)

La aplicación funciona como app nativa de Windows:
- Sin necesidad de navegador ni servidor externo
- La BD SQLite vive en `%APPDATA%/Vendix/`
- Instalador NSIS o portable `.exe`
- Se actualiza mediante nueva distribución del instalador
