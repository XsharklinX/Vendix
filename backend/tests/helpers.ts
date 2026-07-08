import request from 'supertest'
import app from '../src/app'

let counter = 0

export async function registerBusiness(overrides: Partial<{ name: string; email: string; password: string; businessName: string }> = {}) {
  counter++
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}-${counter}`
  const res = await request(app).post('/api/auth/register').send({
    name: overrides.name ?? `Owner ${counter}`,
    email: overrides.email ?? `owner-${unique}@example.com`,
    password: overrides.password ?? 'password123',
    businessName: overrides.businessName ?? `Negocio ${counter}`,
  })

  return {
    token: res.body.token as string,
    businessId: res.body.business.id as string,
    userId: res.body.user.id as string,
    body: res.body,
  }
}

export function authed(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export async function createProduct(token: string, businessId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`/api/businesses/${businessId}/products`)
    .set(authed(token))
    .send({
      name: `Producto ${Date.now()}-${Math.random().toString(36).slice(2)}`,
      price: 100,
      cost: 50,
      quantity: 10,
      ...overrides,
    })

  if (res.status !== 201) {
    throw new Error(`No se pudo crear producto de prueba: ${res.status} ${JSON.stringify(res.body)}`)
  }

  return res.body
}

export async function createClient(token: string, businessId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`/api/businesses/${businessId}/clients`)
    .set(authed(token))
    .send({
      name: `Cliente ${Date.now()}-${Math.random().toString(36).slice(2)}`,
      phone: '809-000-0000',
      ...overrides,
    })

  if (res.status !== 201) {
    throw new Error(`No se pudo crear cliente de prueba: ${res.status} ${JSON.stringify(res.body)}`)
  }

  return res.body
}
