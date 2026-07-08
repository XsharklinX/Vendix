import request from 'supertest'
import app from '../src/app'
import { authed, createClient, createProduct, registerBusiness } from './helpers'

describe('Flujo de cotizacion', () => {
  it('crea una cotizacion y la convierte en venta descontando inventario', async () => {
    const { token, businessId } = await registerBusiness()
    const client = await createClient(token, businessId)
    const product = await createProduct(token, businessId, { quantity: 5, price: 120, cost: 60 })

    const quote = await request(app)
      .post(`/api/businesses/${businessId}/quotes`)
      .set(authed(token))
      .send({
        concept: 'Venta mayorista',
        clientId: client.id,
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        items: [
          { productId: product.id, name: product.name, quantity: 2, price: 120 },
        ],
      })

    expect(quote.status).toBe(201)
    expect(quote.body.number).toBe(1)
    expect(quote.body.total).toBe(240)
    expect(quote.body.items).toHaveLength(1)

    const converted = await request(app)
      .post(`/api/businesses/${businessId}/quotes/${quote.body.id}/convert`)
      .set(authed(token))

    expect(converted.status).toBe(201)
    expect(converted.body.type).toBe('SALE')
    expect(converted.body.amount).toBe(240)
    expect(converted.body.client.id).toBe(client.id)

    const productsAfter = await request(app)
      .get(`/api/businesses/${businessId}/products`)
      .set(authed(token))
    const productAfter = productsAfter.body.find((p: { id: string }) => p.id === product.id)
    expect(productAfter.quantity).toBe(3)

    const quotesAfter = await request(app)
      .get(`/api/businesses/${businessId}/quotes`)
      .set(authed(token))
    expect(quotesAfter.body.find((q: { id: string; status: string }) => q.id === quote.body.id).status).toBe('CONVERTED')
  })

  it('no convierte una cotizacion si el inventario no alcanza', async () => {
    const { token, businessId } = await registerBusiness()
    const product = await createProduct(token, businessId, { quantity: 1 })

    const quote = await request(app)
      .post(`/api/businesses/${businessId}/quotes`)
      .set(authed(token))
      .send({
        items: [
          { productId: product.id, name: product.name, quantity: 2, price: 100 },
        ],
      })

    const converted = await request(app)
      .post(`/api/businesses/${businessId}/quotes/${quote.body.id}/convert`)
      .set(authed(token))

    expect(converted.status).toBe(400)
    expect(converted.body.error).toMatch(/Stock insuficiente/i)
  })
})
