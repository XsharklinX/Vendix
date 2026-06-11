import { describe, it, expect } from 'vitest'
import { buildReceiptHtml, type ReceiptData } from '../Vender'

function makeData(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    transactionId: 'tx-1234567890',
    businessName: 'Mi Negocio',
    currency: 'DOP',
    items: [
      {
        product: { id: 'p1', name: 'Producto A', price: 100, cost: 50, quantity: 10, taxExempt: false, volumePricing: [] },
        qty: 2,
        unitPrice: 100,
      },
    ],
    subtotal: 200,
    discountLabel: '0%',
    discountAmt: 0,
    taxName: 'ITBIS',
    taxAmount: 36,
    taxIncluded: true,
    total: 200,
    paymentMethod: 'CASH',
    status: 'COMPLETED',
    ...overrides,
  }
}

describe('buildReceiptHtml', () => {
  it('incluye el nombre del negocio, los productos y el total', () => {
    const html = buildReceiptHtml(makeData())

    expect(html).toContain('Mi Negocio')
    expect(html).toContain('Producto A')
    expect(html).toContain('2 ×')
    expect(html).toContain('TOTAL')
  })

  it('usa los últimos 8 caracteres del id de transacción como número de recibo cuando no hay receiptNo', () => {
    const html = buildReceiptHtml(makeData({ transactionId: 'tx-1234567890' }))

    expect(html).toContain('34567890'.toUpperCase())
  })

  it('prefiere receiptNo sobre el id de transacción', () => {
    const html = buildReceiptHtml(makeData({ receiptNo: 'A-0001' }))

    expect(html).toContain('A-0001')
  })

  it('muestra el descuento solo cuando discountAmt > 0', () => {
    const sinDescuento = buildReceiptHtml(makeData({ discountAmt: 0 }))
    expect(sinDescuento).not.toContain('Descuento')

    const conDescuento = buildReceiptHtml(makeData({ discountAmt: 20, discountLabel: '10%' }))
    expect(conDescuento).toContain('Descuento (10%)')
  })

  it('muestra el badge PENDIENTE cuando el estado es PENDING', () => {
    const html = buildReceiptHtml(makeData({ status: 'PENDING' }))

    expect(html).toContain('PENDIENTE')
    expect(html).toContain('badge-pending')
  })

  it('muestra el badge PAGADO con el método de pago cuando está completada', () => {
    const html = buildReceiptHtml(makeData({ status: 'COMPLETED', paymentMethod: 'CARD' }))

    expect(html).toContain('PAGADO · TARJETA')
    expect(html).toContain('badge-paid')
  })

  it('incluye el efectivo recibido y el cambio cuando se proporcionan', () => {
    const html = buildReceiptHtml(makeData({ cashReceived: 250, change: 50 }))

    expect(html).toContain('Efectivo recibido')
    expect(html).toContain('Cambio entregado')
  })

  it('incluye el aviso de comprobante no fiscal cuando no hay NCF', () => {
    const html = buildReceiptHtml(makeData({ ncfNumber: undefined }))

    expect(html).toContain('no es un comprobante fiscal válido')
  })

  it('incluye el NCF en la tabla de metadatos cuando se proporciona', () => {
    const html = buildReceiptHtml(makeData({ ncfNumber: 'B0100000001' }))

    expect(html).toContain('B0100000001')
    expect(html).not.toContain('no es un comprobante fiscal válido')
  })
})
