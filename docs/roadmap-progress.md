# Roadmap de estabilizacion y mejoras

Fecha de inicio: 2026-05-19
Rama de trabajo: `codex/roadmap-fases-vendix`

## Principio de trabajo

Los cambios de este roadmap deben preservar los flujos existentes: vender, inventario, caja, cuentas por cobrar, reportes, configuracion, multi-negocio y Electron. Las mejoras deben apoyarse en endpoints y modelos existentes siempre que sea viable.

## Fase 1 - Estabilizacion

Aplicado:
- Se corrigio la llamada de `Planner` a WhatsApp para usar una ruta existente.
- Se agregaron aliases backend para compatibilidad con la documentacion: `/whatsapp/reminder/:clientId` y `/whatsapp/bulk-reminder`.
- Se restauro el entorno de build reinstalando dependencias dev en `backend` y `frontend`.
- Se verifico `npm run build:backend` y `npm run build:frontend`.

Riesgos:
- La carpeta `Vendix` esta sin trackear dentro del repo Git padre `E:\Programacion`; los cambios existen en disco pero Git los ve como un arbol nuevo completo.

## Fase 2 - UX segura

Aplicado:
- `Planner` e `Inventario` ahora usan `business.lowStockThreshold` cuando existe, evitando el umbral fijo de 5 unidades.

Pendiente recomendado:
- Guardar filtros frecuentes por usuario.
- Mejorar responsive de tablas grandes.
- Revisar textos con caracteres mal codificados en archivos existentes.

## Fase 3 - Inventario y compras

Aplicado:
- Se agrego accion de reabastecimiento desde `Inventario`.
- El reabastecimiento registra una transaccion `PURCHASE` con item de producto, aprovechando la logica backend existente que incrementa stock en compras completadas.
- Permite asociar proveedor, costo unitario, cantidad y nota.

Pendiente recomendado:
- Kardex completo por producto.
- Umbral de stock por producto.
- Ordenes de compra separadas de transacciones finales.

## Fase 4 - Finanzas y cuentas por cobrar

Aplicado:
- `CuentasCobrar` ahora muestra aging de deuda por rangos: `0-7`, `8-15`, `16-30` y `+30` dias.
- Cada cliente con deuda muestra la antiguedad de su deuda mas vieja.
- Se agrego auditoria para apertura/cierre de caja y marcado masivo de deuda como pagada.

Pendiente recomendado:
- Cierre diario con snapshot persistido.
- Reporte de utilidad por cliente.
- Exportacion de aging a CSV/PDF.

## Fase 5 - Offline y desktop

Aplicado:
- POS sincroniza ventas offline al montar y tambien cuando el navegador vuelve a estar online.
- La sincronizacion invalida inventario y transacciones recientes al completarse.

Pendiente recomendado:
- Pantalla dedicada de cola offline.
- Reintentos con backoff y detalle de errores por venta.
- Restauracion de backup desde JSON con validacion previa.

## Fase 6 - IA y planner

Aplicado:
- El asistente IA limita mensajes excesivamente largos.
- El contexto IA usa el umbral real de stock bajo del negocio.
- Se corrigio el texto de seguridad: la API key se envia al backend local para completar consultas.

Riesgos:
- Guardar API keys de IA en `localStorage` sigue siendo sensible. Recomendacion: usar claves configuradas del lado backend, cifrado local o un proveedor propio.
- El asistente IA solo ve un contexto resumido; no debe prometer respuestas sobre datos que no esten en ese resumen.

## Verificacion

Checkpoint inicial:
- `npm run build:backend`: pasa.
- `npm run build:frontend`: pasa con warnings no bloqueantes de Vite/chunk size.

Cada fase nueva debe volver a ejecutar ambas builds antes de considerarse cerrada.

## v1.2 - Nomina y equipo

Aplicado el 2026-05-28:
- Se extendio `Employee` con `commissionRate`.
- Se agregaron modelos `PayrollPayment` y `AttendanceRecord`.
- El modulo `Empleados` ahora tiene pestanas de equipo, pagos de nomina, ventas/comisiones y asistencia.
- Registrar pago de nomina crea automaticamente una transaccion `EXPENSE`.
- Ventas por empleado y comisiones se calculan por periodo emparejando `Employee.email` con el usuario cajero.
- La asistencia permite entrada/salida y calcula horas trabajadas.
- El reporte de nomina se puede imprimir como PDF desde navegador y exportar como CSV compatible con Excel.

Riesgos:
- La vinculacion empleado-cajero por email es pragmatica. Para una version futura conviene `Employee.userId`.

## v1.3 - Ordenes de compra

Aplicado el 2026-05-28:
- Se agregaron modelos `PurchaseOrder` y `PurchaseOrderItem`.
- Se agrego nueva pantalla `Ordenes de compra`.
- Crear orden con proveedor, productos, cantidades y costos.
- Estados soportados: `DRAFT`, `SENT`, `PARTIALLY_RECEIVED`, `COMPLETED`, `CANCELLED`.
- Recibir mercancia parcial o completa actualiza inventario automaticamente.
- Se agregaron alertas de reorden usando `lowStockThreshold`.
- Se puede imprimir una orden como PDF desde navegador.

Riesgos:
- Recibir una orden actualiza inventario, pero no crea automaticamente una transaccion financiera para evitar duplicados contables. Si el flujo de negocio lo requiere, debe agregarse una accion explicita de "registrar factura/compra".

Verificacion v1.2/v1.3:
- `npx prisma generate`: pasa.
- `npx prisma db push`: pasa.
- `npm run build:backend`: pasa.
- `npm run build:frontend`: pasa con warnings no bloqueantes.

## v1.4 - Facturacion profesional

Aplicado el 2026-05-28:
- Se extendio `Business` con `invoicePrefix`, `invoiceSequence`, `invoiceTemplate` y `logoUrl`.
- Se agrego configuracion de facturacion en la pantalla `Configuraciones`.
- Se agregaron plantillas de factura `classic`, `modern` y `thermal`.
- Se agrego generador backend de factura/estado de cuenta en HTML imprimible.
- Se agregaron endpoints para obtener siguiente numero, ver factura de una venta, enviar factura por email, enviar cotizacion por email, ver estado de cuenta y enviar estado de cuenta por email.
- El envio por email reutiliza `sendEmail` y soporta adjuntos HTML codificados para Resend.
- En `Vender`, despues de una venta exitosa, se puede imprimir factura o enviarla por email al cliente.
- En `Cuentas por cobrar`, se puede abrir o enviar por email el estado de cuenta de un cliente.

Riesgos:
- El backend genera HTML imprimible y lo adjunta por email; no genera todavia un PDF binario server-side.
- La numeracion de factura avanza cuando se envia desde backend; la impresion local del POS aun no consume la secuencia persistida.
- El envio real depende de tener proveedor de email configurado y email valido en el cliente.

Verificacion v1.4:
- `npx prisma generate`: pasa.
- `npx prisma db push`: pasa.
- `npm run build:backend`: pasa.
- `npm run build:frontend`: pasa con warnings no bloqueantes de Vite/chunk size.

## v2.0 - CRM y fidelizacion

Aplicado el 2026-05-28:
- Se agrego `Client.loyaltyPoints`.
- Se agregaron modelos `ClientNote` y `LoyaltyRedemption`.
- La lista de clientes ahora devuelve deuda, ventas acumuladas, ultima compra, puntos y segmentos automaticos.
- Se agregaron notas y recordatorios por cliente.
- Se agrego timeline de cliente con ventas, deudas, notas, recordatorios y canjes.
- Las ventas completadas con cliente acumulan puntos automaticamente.
- Las cancelaciones/devoluciones revierten puntos calculados.
- Se agrego canje manual de puntos como descuento registrado en historial.
- La pantalla `Clientes` ahora incluye KPIs CRM, segmentos, puntos y panel CRM por cliente.

Riesgos:
- El canje queda registrado, pero todavia no se aplica automaticamente como descuento dentro del POS.
- La tasa de puntos esta fija en `floor(monto / 100)`.
- Los recordatorios no aparecen aun en `Planner`.
- Las etiquetas son calculadas, no editables manualmente.

Verificacion v2.0:
- `npx prisma generate`: pasa.
- `npx prisma db push`: pasa.
- `npm run build:backend`: pasa.
- `npm run build:frontend`: pasa con warnings no bloqueantes de Vite/chunk size.
