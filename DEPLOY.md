# Guía de Despliegue — Vendix

## ¿Qué opción usar?

| Opción | Cuándo usarla | Dificultad |
|--------|--------------|-----------|
| **A. App de escritorio (Electron)** | Una sola computadora, sin internet requerido | Media |
| **B. Servidor local** | Varias computadoras en la misma red Wi-Fi | Baja |
| **C. Cloud (Vercel + Render)** | Acceso desde cualquier lugar con internet | Media |

---

## Antes de cualquier despliegue — OBLIGATORIO

Abrir `backend/.env` y cambiar el `JWT_SECRET` por una clave segura:

```bash
# Generar una clave segura (ejecutar en la terminal):
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copiar el resultado y reemplazar el valor de `JWT_SECRET` en `backend/.env`.

---

## Opción A — App de escritorio (Electron) `.exe`

La forma más simple para un solo usuario en Windows. Los datos se guardan localmente.

### Requisitos
- Node.js 18+ instalado en la computadora donde se va a construir
- Windows 10/11

### Pasos
```bash
# 1. En la terminal, desde la carpeta raíz del proyecto:
npm run setup

# 2. Construir el instalador:
npm run dist

# 3. El instalador estará en:
# release/Vendix Setup X.X.X.exe
```

Dar ese `.exe` al usuario para que lo instale. La base de datos SQLite se crea automáticamente en su computadora.

### Actualizar la app
Repetir `npm run dist` y dar el nuevo instalador al usuario.

---

## Opción B — Servidor local (web en la red)

Ideal si el negocio tiene varias computadoras o tablets en la misma red.

### Pasos
```bash
# En la computadora que actuará de servidor:
npm run setup
npm run dev
```

Desde otras computadoras en la misma red, abrir:
```
http://[IP-DEL-SERVIDOR]:5173
```

Para encontrar la IP: `ipconfig` en Windows → "Dirección IPv4"

### En producción (modo servidor permanente)
```bash
npm run build:backend
npm run build:frontend
# Luego en backend/:
node dist/index.js
```

---

## Opción C — Cloud (acceso desde cualquier lugar)

Arquitectura:
```
Usuario → Vercel (frontend) → Render.com (backend) → SQLite / PostgreSQL
```

### 1. Backend en Render.com (gratis)

1. Crear cuenta en **render.com** con GitHub
2. New → Web Service → conectar el repositorio
3. Configurar:
   - Root Directory: `backend`
   - Runtime: `Docker`
   - Instance Type: Free
4. Variables de entorno:
   ```
   DATABASE_URL = file:./prod.db
   JWT_SECRET   = (tu clave generada arriba)
   PORT         = 3001
   NODE_ENV     = production
   CORS_ORIGIN  = https://TU-APP.vercel.app
   ```
5. Deploy → copiar la URL que te asigna Render

### 2. Frontend en Vercel (gratis)

1. Actualizar `frontend/vercel.json` con la URL de Render:
   ```json
   {
     "rewrites": [
       { "source": "/api/(.*)", "destination": "https://TU-APP.onrender.com/api/$1" },
       { "source": "/(.*)", "destination": "/index.html" }
     ]
   }
   ```
2. Crear cuenta en **vercel.com** → New Project → importar repositorio
3. Configurar:
   - Root Directory: `frontend`
   - Framework: Vite
4. Deploy → tu app estará en `https://tu-app.vercel.app`

> **Nota sobre SQLite en cloud**: Render no garantiza persistencia del disco en el plan gratuito.
> Para producción seria, usar **Turso** (SQLite distribuido, gratis hasta 500 MB) o cambiar a PostgreSQL
> con el archivo `prisma/schema.production.prisma`.

---

## Email (recuperar contraseña)

Sin email configurado, el reset de contraseña imprime el link en la consola del servidor.
Para activarlo, agregar una de estas opciones en `backend/.env`:

**Opción 1 — Resend** (recomendado, gratis hasta 3,000/mes):
```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
```
Registrarse en resend.com, crear API key.

**Opción 2 — Gmail SMTP**:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tucorreo@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
```
La contraseña debe ser una "contraseña de aplicación" (no la contraseña normal).
Activar en: Google Account → Security → App passwords.

---

## Comandos útiles

```bash
# Desarrollo
npm run dev                    # Frontend + backend en paralelo

# Base de datos
cd backend && npm run db:studio  # Ver los datos con Prisma Studio
cd backend && npm run db:push    # Sincronizar cambios del schema

# Respaldo manual
# En la app: Configuraciones → Respaldo → Descargar respaldo JSON
# O copiar directamente: backend/prisma/dev.db
```

---

## Releases de Windows y auto-update

El comando `npm run build` solo compila la aplicacion. Para generar el instalador NSIS:

```bash
npm run dist
```

Los artefactos quedan en `release/`:

```text
Vendix-Setup-X.Y.Z.exe
Vendix-Setup-X.Y.Z.exe.blockmap
latest.yml
```

Cada push de codigo a `main` ejecuta el workflow `.github/workflows/release.yml`. Si el build completo termina correctamente, GitHub Actions genera una version patch unica y publica automaticamente el instalador, `.blockmap` y `latest.yml`.

Los cambios exclusivamente de documentacion no generan instaladores nuevos. Para publicar una version definida manualmente:

1. Incrementar `version` en `package.json`.
2. Confirmar que `npm run build` pasa.
3. Crear un commit.
4. Publicar un tag:

```bash
git tag v1.2.0
git push origin v1.2.0
```

Las instalaciones existentes consultan GitHub Releases al iniciar, descargan la version mas reciente y tambien permiten buscar actualizaciones desde el menu de bandeja.

No publicar la release como draft y no mezclar `latest.yml` con un `.exe` generado por otra build.

---

## Checklist antes de entregar

- [ ] `JWT_SECRET` cambiado en `backend/.env` (no dejar el valor por defecto)
- [ ] Build de producción probado (`npm run build`)
- [ ] Usuario registrado y negocio configurado
- [ ] Impuestos y moneda configurados en Configuraciones
- [ ] NCF configurado si el negocio está en RD (Configuraciones → NCF/DGII)
- [ ] Primer backup hecho (Configuraciones → Respaldo)
