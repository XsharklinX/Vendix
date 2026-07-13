import request from 'supertest'
import app from '../src/app'
import { authed, registerBusiness } from './helpers'

describe('Flujo de caja (apertura → venta → cierre)', () => {
  it('abre la caja, registra una venta en efectivo y cierra con el monto esperado', async () => {
    const { token, businessId } = await registerBusiness()

    const open = await request(app)
      .post(`/api/businesses/${businessId}/transactions/cash-session/open`)
      .set(authed(token))
      .send({ openAmount: 100 })

    expect(open.status).toBe(201)
    expect(open.body.status).toBe('OPEN')
    expect(open.body.openAmount).toBe(100)

    const sale = await request(app)
      .post(`/api/businesses/${businessId}/transactions`)
      .set(authed(token))
      .send({
        type: 'SALE',
        amount: 50,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        cashSessionId: open.body.id,
        items: [],
      })
    expect(sale.status).toBe(201)
    expect(sale.body.cashSessionId).toBe(open.body.id)

    const current = await request(app)
      .get(`/api/businesses/${businessId}/transactions/cash-session/current`)
      .set(authed(token))
    expect(current.status).toBe(200)
    expect(current.body.id).toBe(open.body.id)
    expect(current.body.transactions).toHaveLength(1)

    // Efectivo esperado: apertura (100) + ventas en efectivo (50) = 150
    const close = await request(app)
      .post(`/api/businesses/${businessId}/transactions/cash-session/close`)
      .set(authed(token))
      .send({ closeAmount: 150 })

    expect(close.status).toBe(200)
    expect(close.body.status).toBe('CLOSED')
    expect(close.body.closeAmount).toBe(150)
  })

  it('no permite abrir una segunda caja mientras hay una abierta', async () => {
    const { token, businessId } = await registerBusiness()

    await request(app)
      .post(`/api/businesses/${businessId}/transactions/cash-session/open`)
      .set(authed(token))
      .send({ openAmount: 50 })

    const second = await request(app)
      .post(`/api/businesses/${businessId}/transactions/cash-session/open`)
      .set(authed(token))
      .send({ openAmount: 50 })

    // 409 Conflict: ya existe una caja abierta (recurso en conflicto)
    expect(second.status).toBe(409)
    expect(second.body.error).toMatch(/caja abierta/i)
  })

  it('responde 404 al cerrar caja si no hay ninguna abierta', async () => {
    const { token, businessId } = await registerBusiness()

    const close = await request(app)
      .post(`/api/businesses/${businessId}/transactions/cash-session/close`)
      .set(authed(token))
      .send({ closeAmount: 0 })

    expect(close.status).toBe(404)
  })
})
