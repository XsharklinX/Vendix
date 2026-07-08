import request from 'supertest'
import app from '../src/app'
import { authed, createClient, createProduct, registerBusiness } from './helpers'

describe('Flujo de backup', () => {
  it('exporta, valida e importa un respaldo sin duplicar datos existentes', async () => {
    const source = await registerBusiness()
    await createProduct(source.token, source.businessId, { name: 'Cafe backup', barcode: 'BK-001' })
    await createClient(source.token, source.businessId, { name: 'Cliente backup', document: '001-0000000-1' })

    const exported = await request(app)
      .get(`/api/businesses/${source.businessId}/export`)
      .set(authed(source.token))

    expect(exported.status).toBe(200)
    expect(exported.body.products).toHaveLength(1)
    expect(exported.body.clients).toHaveLength(1)

    const target = await registerBusiness()
    const validation = await request(app)
      .post(`/api/businesses/${target.businessId}/import/validate`)
      .set(authed(target.token))
      .send(exported.body)

    expect(validation.status).toBe(200)
    expect(validation.body.ok).toBe(true)
    expect(validation.body.counts.products).toBe(1)
    expect(validation.body.counts.clients).toBe(1)

    const imported = await request(app)
      .post(`/api/businesses/${target.businessId}/import`)
      .set(authed(target.token))
      .send(exported.body)

    expect(imported.status).toBe(200)
    expect(imported.body.summary.products.created).toBe(1)
    expect(imported.body.summary.clients.created).toBe(1)

    const importedAgain = await request(app)
      .post(`/api/businesses/${target.businessId}/import`)
      .set(authed(target.token))
      .send(exported.body)

    expect(importedAgain.status).toBe(200)
    expect(importedAgain.body.summary.products.skipped).toBeGreaterThanOrEqual(1)
    expect(importedAgain.body.summary.clients.skipped).toBeGreaterThanOrEqual(1)
  })

  it('rechaza respaldos sin entidades importables', async () => {
    const { token, businessId } = await registerBusiness()

    const validation = await request(app)
      .post(`/api/businesses/${businessId}/import/validate`)
      .set(authed(token))
      .send({ exportedAt: new Date().toISOString(), products: [], clients: [] })

    expect(validation.status).toBe(200)
    expect(validation.body.ok).toBe(false)
    expect(validation.body.warnings).toContain('El archivo no contiene datos importables.')
  })
})
