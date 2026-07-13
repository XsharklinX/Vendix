export interface Tip {
  id: string
  text: string
  /** Solo se muestra a usuarios nuevos (primeros 7 días) si es true, o a todos si se omite */
  newUserOnly?: boolean
}

export const TIPS: Tip[] = [
  { id: 'shortcuts-payment', text: 'En Vender, usa F1 para efectivo, F2 para tarjeta y F3 para transferencia — cobras sin tocar el mouse.' },
  { id: 'shortcut-fiado', text: 'F4 marca la venta como "al fiado" al instante. Aparece en Cuentas por Cobrar automáticamente.' },
  { id: 'shortcut-search', text: 'Presiona "/" en cualquier momento dentro de Vender para saltar directo al buscador de productos.' },
  { id: 'command-palette', text: 'Ctrl+K abre el buscador rápido desde cualquier pantalla: productos, clientes o secciones, sin usar el menú.' },
  { id: 'category-pills', text: 'En el punto de venta puedes filtrar productos por categoría tocando los botones redondeados sobre la lista.' },
  { id: 'whatsapp-reminder', text: 'Desde "Lo que te deben" puedes enviar un recordatorio de pago por WhatsApp con un solo toque.' },
  { id: 'bulk-price', text: '¿Subiste el costo de varios productos? En Inventario, selecciona varios con el checkbox y cambia el precio de todos a la vez.' },
  { id: 'trash-restore', text: '¿Borraste algo por error? Nada se pierde para siempre — revisa la papelera para restaurar productos, clientes o proveedores eliminados.' },
  { id: 'offline-sale', text: 'Si se va el internet, puedes seguir vendiendo. Vendix guarda todo y sincroniza solo cuando vuelve la conexión.' },
  { id: 'kardex', text: 'Cada producto tiene un kardex — el historial completo de entradas, salidas y ajustes de stock, con quién lo hizo y cuándo.' },
  { id: 'volume-pricing', text: 'Puedes configurar precios especiales por volumen: "a partir de 12 unidades, tal precio" — se aplica solo en el carrito.' },
  { id: 'client-vip', text: 'Marca a un cliente como VIP y asígnale un descuento — se aplicará automáticamente en cada venta que le hagas.' },
  { id: 'ncf-auto', text: 'Si tienes NCF activado, Vendix genera el número de comprobante fiscal automáticamente en cada venta completada.' },
  { id: 'itbis-toggle', text: 'El ITBIS no se aplica por defecto en cada venta — actívalo solo cuando la venta lo necesite, desde el carrito.' },
  { id: 'export-csv', text: 'Casi cualquier lista de Vendix (inventario, clientes, movimientos) se puede exportar a CSV con el botón "Exportar".' },
  { id: 'dark-mode', text: '¿Prefieres trabajar de noche? Cambia a modo oscuro con el ícono de sol/luna junto a las notificaciones.' },
  { id: 'sound-toggle', text: 'Los sonidos de confirmación de venta se pueden activar o ajustar de volumen desde Configuración.' },
  { id: 'quote-to-sale', text: 'Una cotización aceptada se convierte en venta con un solo clic, sin volver a capturar los productos.' },
  { id: 'low-stock-alert', text: 'Puedes definir un umbral de stock bajo por producto o dejar el general del negocio — las alertas se ajustan solas.' },
  { id: 'multi-currency', text: 'Vendix acepta cobros en otra moneda dentro de una venta — solo indica la tasa de cambio del día.' },
  { id: 'employee-commission', text: 'Cada empleado puede tener su propia comisión por venta — se calcula solo al momento de pagar la nómina.' },
  { id: 'purchase-order', text: 'Las órdenes de compra permiten recibir mercancía en partes — el inventario se actualiza según lo que va llegando.' },
  { id: 'aging-debt', text: 'En Cuentas por Cobrar puedes filtrar deudas por antigüedad: 7, 15 o 30+ días — para saber a quién llamar primero.' },

  // Bienvenida — solo primeros días de uso
  { id: 'welcome-onboarding', text: '¿Sabías que puedes elegir una plantilla de negocio en el inicio? Ya trae categorías e impuestos configurados para ti.', newUserOnly: true },
  { id: 'welcome-template', text: 'Vendix se adapta a tu tipo de negocio desde el primer día — colmado, restaurante, ferretería o salón, cada uno con su propia configuración inicial.', newUserOnly: true },
  { id: 'welcome-help', text: 'Si algo no se ve claro, no hace falta buscar en internet — casi todo en Vendix se explica solo mientras lo usas.', newUserOnly: true },
]

function isNewUser(firstSeenAt: number | null): boolean {
  if (!firstSeenAt) return true
  const days = (Date.now() - firstSeenAt) / (1000 * 60 * 60 * 24)
  return days <= 7
}

/** Elige el siguiente tip a mostrar: prioriza los de bienvenida si el usuario es nuevo,
 * evita repetir hasta agotar el resto, y reinicia el ciclo cuando ya se vieron todos. */
export function pickNextTip(shownIds: string[], firstSeenAt: number | null): Tip {
  const newUser = isNewUser(firstSeenAt)
  const pool = newUser ? TIPS : TIPS.filter(t => !t.newUserOnly)

  const unseen = pool.filter(t => !shownIds.includes(t.id))
  const candidates = unseen.length > 0 ? unseen : pool

  return candidates[Math.floor(Math.random() * candidates.length)]
}
