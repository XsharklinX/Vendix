import { Prisma } from '@prisma/client'

type TxClient = Prisma.TransactionClient

// Registra un movimiento de inventario (kardex). `quantity` es el delta con
// signo (+entra, -sale) y `balanceAfter` es el stock resultante del producto.
export async function recordStockMovement(tx: TxClient, params: {
  businessId: string
  productId: string
  type: 'SALE' | 'RETURN' | 'PURCHASE' | 'RECEPTION' | 'ADJUSTMENT' | 'CANCEL' | 'PHYSICAL_COUNT' | 'TRANSFER_OUT' | 'TRANSFER_IN'
  quantity: number
  balanceAfter: number
  reason?: string | null
  refType?: string | null
  refId?: string | null
  createdById?: string | null
}) {
  await tx.stockMovement.create({
    data: {
      businessId: params.businessId,
      productId: params.productId,
      type: params.type,
      quantity: params.quantity,
      balanceAfter: params.balanceAfter,
      reason: params.reason ?? null,
      refType: params.refType ?? null,
      refId: params.refId ?? null,
      createdById: params.createdById ?? null,
    },
  })
}
