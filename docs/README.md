# Vendix (FinanzasPro) — Documentación Oficial

> Versión 1.1.0 · Express + Prisma + React + Electron · Windows

Vendix es un sistema de gestión de ventas, inventario y contabilidad diseñado para pequeños negocios en Latinoamérica. Funciona tanto como aplicación web como aplicación de escritorio Windows. Incluye soporte nativo para los requerimientos fiscales de República Dominicana (NCF, ITBIS).

---

## Índice de documentación

| Archivo | Descripción |
|---|---|
| [architecture.md](architecture.md) | Stack, estructura de archivos, flujo de arranque, patrones de diseño |
| [database.md](database.md) | Esquema Prisma completo, modelos, relaciones y migraciones |
| [api-reference.md](api-reference.md) | Todos los endpoints REST documentados con parámetros y respuestas |
| [auth-security.md](auth-security.md) | Autenticación JWT, roles, middleware, rate limiting, plan limits |
| [features.md](features.md) | Todas las funcionalidades de usuario explicadas en detalle |
| [frontend.md](frontend.md) | Estructura React, páginas, componentes, estado global, hooks |
| [integrations.md](integrations.md) | Stripe, Twilio WhatsApp, Email (Resend/SMTP), Swagger |
| [build-deploy.md](build-deploy.md) | Scripts de desarrollo, build de producción, Electron, distribución |
| [env-configuration.md](env-configuration.md) | Todas las variables de entorno explicadas |

---

## Inicio rápido

```bash
# 1. Instalar todas las dependencias e inicializar la base de datos
npm run setup

# 2. Modo desarrollo (backend + frontend simultáneo)
npm run dev

# 3. Modo desarrollo con Electron
npm run dev:electron
```

Acceso web: `http://localhost:5173`  
API: `http://localhost:3001/api`  
Swagger UI: `http://localhost:3001/api/docs`

---

## Arquitectura en una línea

```
frontend (React/Vite :5173)  ──HTTP──►  backend (Express :3001)  ──Prisma──►  SQLite
                                               │
                              electron/src/main.ts (desktop shell)
```

---

## Requisitos del sistema

| Requisito | Mínimo |
|---|---|
| Node.js | v18+ |
| npm | v9+ |
| SO (desarrollo) | Windows / macOS / Linux |
| SO (distribución) | Windows 10 64-bit |
| RAM | 512 MB |

---

## Licencia

ISC © 2025 FinanzasPro / Vendix
