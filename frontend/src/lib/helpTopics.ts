// Preguntas frecuentes del centro de ayuda in-app. Mantener respuestas cortas
// (2-3 líneas) — esto es para resolver dudas rápidas dentro de la app, no para
// reemplazar la documentación completa de docs/.
export interface HelpTopic {
  id: string
  question: string
  answer: string
  to?: string
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'caja-abrir',
    question: '¿Cómo abro o cierro la caja?',
    answer: 'Ve a "Caja" en el menú, indica el monto inicial en efectivo y confirma. Al cerrar el turno, cuenta el efectivo real y Vendix te muestra la diferencia contra lo esperado.',
    to: '/caja',
  },
  {
    id: 'caja-doble',
    question: 'Dice que ya hay una caja abierta, pero yo no la abrí',
    answer: 'Otro usuario (u otra sesión tuya) la dejó abierta. Ve a "Caja" para ver quién y cuándo la abrió antes de cerrarla o continuar con ella.',
    to: '/caja',
  },
  {
    id: 'venta-offline',
    question: '¿Qué pasa si se va el internet mientras vendo?',
    answer: 'Vendix sigue funcionando: las ventas se guardan localmente y se sincronizan solas apenas vuelve la conexión. Puedes ver el estado en "Cola offline".',
    to: '/cola-offline',
  },
  {
    id: 'carrito-recuperar',
    question: 'Se cerró la app a mitad de una venta, ¿perdí el carrito?',
    answer: 'No — Vendix guarda el carrito automáticamente. Al reabrir "Vender" te ofrece recuperarlo tal como estaba.',
    to: '/vender',
  },
  {
    id: 'itbis-activar',
    question: '¿Cómo activo o desactivo el ITBIS?',
    answer: 'En Configuraciones → pestaña Impuestos. Por defecto viene desactivado; actívalo si tu negocio factura con ITBIS y define la tasa.',
    to: '/configuraciones?tab=impuestos',
  },
  {
    id: 'ncf-config',
    question: '¿Cómo configuro los NCF para facturar?',
    answer: 'En Configuraciones → pestaña NCF, define tu secuencia y tipo de comprobante autorizado por la DGII antes de emitir facturas fiscales.',
    to: '/configuraciones?tab=ncf',
  },
  {
    id: 'papelera',
    question: 'Eliminé un producto/cliente/empleado por error, ¿se puede recuperar?',
    answer: 'Sí. Cada sección (Inventario, Clientes, Empleados, Proveedores) tiene un botón "Papelera" que muestra lo eliminado y permite restaurarlo con un clic.',
  },
  {
    id: 'stock-bajo',
    question: '¿Cómo cambio el umbral de stock bajo?',
    answer: 'Por defecto es 5 unidades para todo el negocio (Configuraciones → General), pero puedes definir un umbral distinto por producto individual en Inventario.',
    to: '/inventario',
  },
  {
    id: 'precio-anterior',
    question: '¿Por qué un producto muestra "Antes: RD$X" en el POS?',
    answer: 'Es un aviso de que el precio cambió en los últimos 7 días, para que tú y tu equipo no vendan por error al precio viejo.',
    to: '/vender',
  },
  {
    id: 'cotizacion-a-venta',
    question: '¿Cómo convierto una cotización en una venta?',
    answer: 'Abre la cotización en "Cotizaciones" y usa el botón "Convertir a venta". Los productos y precios pasan automáticamente al POS.',
    to: '/cotizaciones',
  },
  {
    id: 'cobro-whatsapp',
    question: '¿Cómo envío un recordatorio de cobro por WhatsApp?',
    answer: 'En "Cuentas por cobrar", cada cliente con deuda tiene un botón de WhatsApp que abre un mensaje ya redactado — puedes editarlo antes de enviar.',
    to: '/cuentas-cobrar',
  },
  {
    id: 'backup',
    question: '¿Cómo hago un respaldo de mis datos?',
    answer: 'En Configuraciones → pestaña Backup puedes exportar todo tu negocio a un archivo JSON y restaurarlo después en 2 pasos si algo sale mal.',
    to: '/configuraciones?tab=backup',
  },
  {
    id: 'multi-negocio',
    question: '¿Puedo administrar más de un negocio con la misma cuenta?',
    answer: 'Sí. Usa el selector de negocio arriba en el menú lateral para crear o cambiar entre negocios — cada uno tiene sus propios datos, inventario y caja.',
  },
  {
    id: 'staff-permisos',
    question: '¿Cómo agrego un cajero o empleado con acceso limitado?',
    answer: 'En Configuraciones → pestaña Staff, invita al usuario con rol "Cajero". No verá reportes financieros ni configuración, solo el POS y su caja.',
    to: '/configuraciones?tab=staff',
  },
  {
    id: 'cierre-z',
    question: '¿Qué es el Cierre Z y dónde lo veo?',
    answer: 'Es el resumen fiscal del día (ventas, impuestos, formas de pago) listo para imprimir. Está en "Reportes" — útil para el cuadre diario.',
    to: '/reportes',
  },
  {
    id: 'orden-compra',
    question: '¿Cómo registro mercancía que recibí de un proveedor?',
    answer: 'Crea una Orden de Compra con los productos y cantidades. Al marcarla como recibida (total o parcial), el inventario se actualiza solo.',
    to: '/ordenes-compra',
  },
  {
    id: 'modo-oscuro',
    question: '¿Cómo activo el modo oscuro?',
    answer: 'Con el ícono de sol/luna en la barra superior. Se recuerda tu preferencia y respeta el modo de tu sistema si no la cambias manualmente.',
  },
  {
    id: 'atajos-pos',
    question: '¿Hay atajos de teclado para vender más rápido?',
    answer: 'Sí, en "Vender": F1-F4 cambian método de pago, Enter cobra, Esc cancela, y "/" enfoca la búsqueda de productos.',
    to: '/vender',
  },
]
