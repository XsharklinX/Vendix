import request from 'supertest'
import app from '../src/app'
import { authed, registerBusiness } from './helpers'

async function createProduct(token: string, businessId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`/api/businesses/${businessId}/products`)
    .set(authed(token))
    .send({
      name: 'Producto de prueba',
      price: 100,
      cost: 50,
      quantity: 10,
      ...overrides,
    })
  return res.body
}

describe('Flujo de venta (POST /transactions)', () => {
  it('crea una venta, calcula el ITBIS/descuento enviados y descuenta el stock', async () => {
    const { token, businessId } = await registerBusiness()
    const product = await createProduct(token, businessId)

    // 2 unidades a 100 c/u = 200, descuento 10% = 20, base imponible 180, ITBIS 18% = 32.4
    const subtotal = 200
    const discountValue = 20
    const taxable = subtotal - discountValue
    const taxAmount = Number((taxable * 0.18).toFixed(2))
    const amount = Number((taxable + taxAmount).toFixed(2))

    const res = await request(app)
      .post(`/api/businesses/${businessId}/transactions`)
      .set(authed(token))
      .send({
        type: 'SALE',
        amount,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        discountValue,
        discountType: 'PERCENT',
        taxAmount,
        items: [
          { productId: product.id, name: product.name, quantity: 2, price: 100, cost: 50 },
        ],
      })

    expect(res.status).toBe(201)
    expect(res.body.amount).toBeCloseTo(amount)
    expect(res.body.discountValue).toBeCloseTo(discountValue)
    expect(res.body.taxAmount).toBeCloseTo(taxAmount)
    expect(res.body.items).toHaveLength(1)

    const productsAfter = await request(app)
      .get(`/api/businesses/${businessId}/products`)
      .set(authed(token))
    const productAfter = productsAfter.body.find((p: { id: string }) => p.id === product.id)

    expect(productAfter.quantity).toBe(8)
  })

  it('rechaza una venta cuando no hay stock suficiente', async () => {
    const { token, businessId } = await registerBusiness()
    const product = await createProduct(token, businessId, { quantity: 1 })

    const res = await request(app)
      .post(`/api/businesses/${businessId}/transactions`)
      .set(authed(token))
      .send({
        type: 'SALE',
        amount: 200,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        items: [
          { productId: product.id, name: product.name, quantity: 2, price: 100, cost: 50 },
        ],
      })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/Stock insuficiente/i)

    const productsAfter = await request(app)
      .get(`/api/businesses/${businessId}/products`)
      .set(authed(token))
    const productAfter = productsAfter.body.find((p: { id: string }) => p.id === product.id)

    expect(productAfter.quantity).toBe(1)
  })

  it('rechaza acceso a transacciones de otro negocio', async () => {
    const { businessId } = await registerBusiness()
    const other = await registerBusiness()

    const res = await request(app)
      .get(`/api/businesses/${businessId}/transactions`)
      .set(authed(other.token))

    expect(res.status).toBe(403)
  })
})
