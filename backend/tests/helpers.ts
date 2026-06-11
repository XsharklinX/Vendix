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
