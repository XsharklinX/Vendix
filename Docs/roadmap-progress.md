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
