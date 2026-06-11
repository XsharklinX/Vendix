import request from 'supertest'
import app from '../src/app'
import { authed, registerBusiness } from './helpers'

describe('Auth', () => {
  it('registra un nuevo usuario y negocio', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Ana',
      email: 'ana@example.com',
      password: 'password123',
      businessName: 'Tienda de Ana',
    })

    expect(res.status).toBe(201)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.email).toBe('ana@example.com')
    expect(res.body.business.name).toBe('Tienda de Ana')
  })

  it('rechaza el registro con un correo ya existente', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Beto',
      email: 'beto@example.com',
      password: 'password123',
      businessName: 'Tienda de Beto',
    })

    const res = await request(app).post('/api/auth/register').send({
      name: 'Beto Otro',
      email: 'beto@example.com',
      password: 'password123',
      businessName: 'Otra Tienda',
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/registrado/i)
  })

  it('inicia sesión con credenciales válidas', async () => {
    const { body: registerBody } = await registerBusiness({ email: 'login@example.com', password: 'secret123' })
    expect(registerBody.token).toBeTruthy()

    const res = await request(app).post('/api/auth/login').send({
      email: 'login@example.com',
      password: 'secret123',
    })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.email).toBe('login@example.com')
  })

  it('rechaza credenciales inválidas', async () => {
    await registerBusiness({ email: 'wrongpass@example.com', password: 'secret123' })

    const res = await request(app).post('/api/auth/login').send({
      email: 'wrongpass@example.com',
      password: 'incorrecta',
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/incorrectas/i)
  })

  it('GET /me requiere un token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('GET /me rechaza un token inválido', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer token-invalido')
    expect(res.status).toBe(401)
  })

  it('GET /me devuelve el usuario autenticado', async () => {
    const { token, body } = await registerBusiness({ email: 'me@example.com' })

    const res = await request(app).get('/api/auth/me').set(authed(token))

    expect(res.status).toBe(200)
    expect(res.body.email).toBe('me@example.com')
    expect(res.body.id).toBe(body.user.id)
    expect(res.body.password).toBeUndefined()
  })
})
