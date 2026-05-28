import { Resend } from 'resend'
import nodemailer from 'nodemailer'

const APP_URL = process.env.APP_URL || 'http://localhost:5173'
const FROM_NAME = 'Vendix'
const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@vendix.app'

// ── Transport selection ───────────────────────────────────────────────────────

function getTransport() {
  if (process.env.RESEND_API_KEY) return 'resend'
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp'
  return 'console'
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const smtpTransport = (process.env.SMTP_USER && process.env.SMTP_PASS)
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null

// ── Core send ────────────────────────────────────────────────────────────────

interface Attachment { filename: string; content: Buffer }

export async function sendEmail({ to, subject, html, attachments }: {
  to: string; subject: string; html: string; attachments?: Attachment[]
}) {
  return send(to, subject, html, attachments)
}

async function send(to: string, subject: string, html: string, attachments?: Attachment[]) {
  const transport = getTransport()

  if (transport === 'resend' && resend) {
    await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    })
    return
  }

  if (transport === 'smtp' && smtpTransport) {
    await smtpTransport.sendMail({
      from: `"${FROM_NAME}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      attachments,
    })
    return
  }

  // Console fallback — strip HTML tags and show plain text + clickable link
  const plain = html.replace(/<a[^>]+href="([^"]+)"[^>]*>[^<]+<\/a>/gi, (_, url) => `\n➡  ${url}\n`)
                    .replace(/<[^>]+>/g, '')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim()

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`📧  EMAIL (modo dev — configura RESEND_API_KEY o SMTP_USER)`)
  console.log(`  Para : ${to}`)
  console.log(`  Asunto: ${subject}`)
  console.log(`─`.repeat(60))
  console.log(plain)
  console.log(`${'─'.repeat(60)}\n`)
}

// ── Email templates ───────────────────────────────────────────────────────────

export async function sendVerificationEmail(to: string, name: string, token: string) {
  const url = `${APP_URL}/verify-email?token=${token}`
  await send(to, 'Verifica tu cuenta en Vendix', `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:#2563eb;padding:28px 32px">
        <h1 style="color:#fff;margin:0;font-size:22px">Vendix</h1>
        <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px">Sistema de gestión de ventas</p>
      </div>
      <div style="padding:32px">
        <h2 style="color:#1e293b;margin:0 0 12px">Hola, ${name} 👋</h2>
        <p style="color:#475569;margin:0 0 24px">Gracias por registrarte en <strong>Vendix</strong>. Confirma tu correo haciendo clic en el botón para activar tu cuenta.</p>
        <a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
          Verificar mi cuenta →
        </a>
        <p style="color:#94a3b8;font-size:12px;margin:24px 0 0">El enlace expira en <strong>24 horas</strong>. Si no creaste esta cuenta, ignora este correo.</p>
        <p style="color:#cbd5e1;font-size:11px;margin:8px 0 0;word-break:break-all">O copia este enlace: ${url}</p>
      </div>
    </div>
  `)
}

export async function sendPasswordResetEmail(to: string, name: string, token: string) {
  const url = `${APP_URL}/reset-password?token=${token}`
  await send(to, 'Restablece tu contraseña en Vendix', `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:#2563eb;padding:28px 32px">
        <h1 style="color:#fff;margin:0;font-size:22px">Vendix</h1>
      </div>
      <div style="padding:32px">
        <h2 style="color:#1e293b;margin:0 0 12px">Restablecer contraseña</h2>
        <p style="color:#475569;margin:0 0 24px">Hola ${name}, recibimos una solicitud para restablecer la contraseña de tu cuenta Vendix. Haz clic abajo para crear una nueva contraseña.</p>
        <a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
          Restablecer contraseña →
        </a>
        <p style="color:#94a3b8;font-size:12px;margin:24px 0 0">El enlace expira en <strong>1 hora</strong>. Si no solicitaste esto, ignora este correo.</p>
        <p style="color:#cbd5e1;font-size:11px;margin:8px 0 0;word-break:break-all">O copia: ${url}</p>
      </div>
    </div>
  `)
}

export async function sendWelcomeEmail(to: string, name: string) {
  await send(to, '¡Bienvenido a Vendix! 🎉', `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:28px 32px">
        <h1 style="color:#fff;margin:0;font-size:22px">¡Bienvenido a Vendix!</h1>
      </div>
      <div style="padding:32px">
        <p style="color:#475569;margin:0 0 16px">Hola <strong>${name}</strong>, tu cuenta está activa. Aquí lo que puedes hacer:</p>
        <ul style="color:#374151;padding-left:20px;margin:0 0 24px">
          <li style="margin-bottom:8px">✅ Registra ventas al instante desde el POS</li>
          <li style="margin-bottom:8px">📦 Controla tu inventario en tiempo real</li>
          <li style="margin-bottom:8px">👥 Gestiona clientes y fiados</li>
          <li style="margin-bottom:8px">📊 Reportes y estadísticas de tu negocio</li>
        </ul>
        <a href="${APP_URL}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600">
          Ir a Vendix →
        </a>
      </div>
    </div>
  `)
}
