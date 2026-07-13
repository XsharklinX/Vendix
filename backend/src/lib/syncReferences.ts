import { prisma } from './prisma'

// Al sincronizar una transacción entrante, el cliente/proveedor/producto que
// referencia puede no existir todavía en el destino — por ejemplo, si el
// negocio activó el sync después de tener historial (esos registros viejos
// nunca pasaron por el outbox) o si el otro dispositivo aún no empujó su
// propio cambio de creación. En vez de dejar que la venta entera falle por
// una FK inválida, se descarta solo la referencia rota (queda null) y se
// conserva el resto de la transacción — el nombre del ítem ya viene guardado
// en el payload, así que no se pierde información visible.
export async function resolveTransactionReferences(businessId: string, payload: Record<string, unknown>) {
  const clientId = typeof payload.clientId === 'string' ? payload.clientId : undefined
  const supplierId = typeof payload.supplierId === 'string' ? payload.supplierId : undefined
  const items = Array.isArray(payload.items) ? payload.items as Record<string, unknown>[] : []
  const productIds = [...new Set(
    items.map(i => typeof i.productId === 'string' ? i.productId : undefined).filter((id): id is string => Boolean(id))
  )]

  const [client, supplier, products] = await Promise.all([
    clientId ? prisma.client.findFirst({ where: { id: clientId, businessId }, select: { id: true } }) : Promise.resolve(null),
    supplierId ? prisma.supplier.findFirst({ where: { id: supplierId, businessId }, select: { id: true } }) : Promise.resolve(null),
    productIds.length ? prisma.product.findMany({ where: { id: { in: productIds }, businessId }, select: { id: true } }) : Promise.resolve([]),
  ])

  const validProductIds = new Set(products.map(p => p.id))

  return {
    clientId: client ? clientId : undefined,
    supplierId: supplier ? supplierId : undefined,
    resolveProductId: (id?: string) => (id && validProductIds.has(id) ? id : undefined),
  }
}
