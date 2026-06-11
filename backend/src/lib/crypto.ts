import crypto from 'crypto'

// Deriva una clave de 256 bits a partir de JWT_SECRET. Reutilizamos ese
// secreto (ya generado por instalación en Electron) en vez de pedir una
// variable de entorno adicional.
const SECRET = process.env.JWT_SECRET || 'fallback-secret'
const KEY = crypto.scryptSync(SECRET, 'vendix-ai-key-salt', 32)
const ALGORITHM = 'aes-256-gcm'

// Cifra un texto plano. Formato del resultado: iv:authTag:ciphertext (hex).
export function encrypt(plainText: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`
}

// Descifra un texto generado por encrypt(). Devuelve null si el formato es inválido.
export function decrypt(payload: string): string | null {
  const parts = payload.split(':')
  if (parts.length !== 3) return null

  try {
    const [ivHex, authTagHex, ciphertextHex] = parts
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
    const plainText = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final(),
    ])
    return plainText.toString('utf8')
  } catch {
    return null
  }
}
