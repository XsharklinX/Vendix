import request from 'supertest'
import app from '../src/app'
import { authed, createClient, registerBusiness } from './helpers'

describe('Cliente y deuda pendiente', () => {
  it('refleja una venta pendiente como deuda y segmento de riesgo', async () => {
    const { token, businessId } = await registerBusiness()
    const client = await createClient(token, businessId, { name: 'Cliente con deuda' })

    const sale = await request(app)
      .post(`/api/businesses/${businessId}/transactions`)
      .set(authed(token))
      .send({
        type: 'SALE',
        amount: 750,
        paymentMethod: 'CASH',
        status: 'PENDING',
        clientId: client.id,
        items: [],
      })

    expect(sale.status).toBe(201)

    const clients = await request(app)
      .get(`/api/businesses/${businessId}/clients`)
      .set(authed(token))

    expect(clients.status).toBe(200)
    const clientAfter = clients.body.find((c: { id: string }) => c.id === client.id)
    expect(clientAfter.pendingDebt).toBe(750)
    expect(clientAfter.segments).toContain('En riesgo')
  })

  it('mantiene etiquetas manuales junto a segmentos automaticos', async () => {
    const { token, businessId } = await registerBusiness()
    const client = await createClient(token, businessId, {
      name: 'Cliente etiquetado',
      manualTags: ['Mayorista', 'Credito aprobado'],
    })

    const clients = await request(app)
      .get(`/api/businesses/${businessId}/clients`)
      .set(authed(token))

    const clientAfter = clients.body.find((c: { id: string }) => c.id === client.id)
    expect(clientAfter.manualTags).toEqual(['Mayorista', 'Credito aprobado'])
    expect(clientAfter.segments).toEqual(expect.arrayContaining(['Mayorista', 'Credito aprobado']))
  })
})
