import jwt from 'jsonwebtoken'

const envSecret = process.env.JWT_SECRET
if (!envSecret) {
  throw new Error('JWT_SECRET no está definido. Configúralo en el archivo .env antes de iniciar el servidor.')
}
const SECRET: string = envSecret

export function signToken(payload: { userId: string; email: string; role?: string }) {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' })
}

export function verifyToken(token: string): { userId: string; email: string; role: string } {
  return jwt.verify(token, SECRET) as { userId: string; email: string; role: string }
}
