# Vendix

<p align="center">
  <strong>POS, inventario, finanzas y CRM para pequenos negocios.</strong><br>
  Una plataforma de gestion comercial disenada para operar con claridad desde el primer dia.
</p>

<p align="center">
  <a href="https://xsharklinx.github.io/Vendix/"><strong>Ver sitio web</strong></a>
  ·
  <a href="docs/README.md">Documentacion</a>
  ·
  <a href="DEPLOY.md">Despliegue</a>
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square">
  <img alt="React" src="https://img.shields.io/badge/React-18-149ECA?style=flat-square">
  <img alt="Express" src="https://img.shields.io/badge/Express-Node.js-101828?style=flat-square">
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-SQLite-2D3748?style=flat-square">
  <img alt="Electron" src="https://img.shields.io/badge/Desktop-Electron-47848F?style=flat-square">
</p>

---

## Que es Vendix

Vendix centraliza la operacion diaria de un pequeno negocio: ventas, inventario, caja, cuentas por cobrar, proveedores, nomina, facturacion y seguimiento de clientes. Puede ejecutarse como aplicacion web o como instalador de escritorio para Windows.

El objetivo es reducir hojas de calculo, registros duplicados y decisiones tomadas sin contexto. Cada venta alimenta inventario, caja, reportes y CRM desde un mismo flujo.

## Capacidades

| Area | Incluye |
|---|---|
| Punto de venta | Carrito, descuentos, efectivo, tarjeta, transferencia, credito, recibos e impresion |
| Inventario | Productos, categorias, costos, margenes, alertas de stock bajo y reabastecimiento |
| Caja y finanzas | Apertura/cierre, movimientos, gastos, ingresos, compras, devoluciones y reportes |
| Clientes | Cuentas por cobrar, aging de deuda, estados de cuenta y seguimiento comercial |
| CRM y fidelizacion | Timeline, notas, recordatorios, puntos, canjes y segmentos automaticos |
| Compras | Proveedores, ordenes de compra, estados y recepcion parcial de mercancia |
| Equipo | Empleados, nomina, comisiones por venta y asistencia |
| Facturacion | Logo, datos fiscales, NCF, numeracion propia, plantillas y envio por email |
| Gestion | Multi-negocio, roles, auditoria, backups, notificaciones y asistente IA |

## Inicio rapido

### Requisitos

- Node.js 18 o superior
- npm 9 o superior

### Instalacion

```bash
git clone https://github.com/XsharklinX/Vendix.git
cd Vendix
npm run setup
npm run dev
```

Durante desarrollo:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- API docs: `http://localhost:3001/api/docs`

Antes de usar datos reales, cambia `JWT_SECRET` en `backend/.env`:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Comandos principales

```bash
npm run dev              # Frontend y backend en paralelo
npm run build:backend    # Compila la API TypeScript
npm run build:frontend   # Compila la aplicacion React
npm run build            # Build completo para escritorio
npm run dist             # Genera instalador Windows
npm run dist:portable    # Genera ejecutable portable
npm run release:github   # Publica instalador y latest.yml en GitHub Releases
```

Los pushes de codigo a `main` publican automaticamente una nueva release de Windows si el build completo termina correctamente. Consulta [Releases y auto-update](docs/releases-and-auto-update.md) para el flujo detallado.

Para sincronizar el schema local:

```bash
cd backend
npx prisma generate
npx prisma db push
```

## Solucion de problemas

### El instalador de Windows no abre o falla con error 0xc0000005

El instalador (`Vendix-Setup-x.x.x.exe`) y el ejecutable portable no estan firmados digitalmente. Windows Defender u otro antivirus puede poner en cuarentena o modificar el archivo despues de generarlo, lo que corrompe el binario y provoca el error `0xc0000005` al abrirlo.

Para evitarlo:

1. Revisa el historial de protección de Windows Defender (`Seguridad de Windows > Protección antivirus y contra amenazas > Historial de protección`) y restaura el archivo si fue puesto en cuarentena.
2. Agrega una exclusion para la carpeta de salida antes de generar el build:

```powershell
Add-MpPreference -ExclusionPath "E:\Programacion\Vendix\release"
```

3. Vuelve a ejecutar `npm run dist` o `npm run dist:portable`.
4. Verifica que el hash del instalador coincida con el registrado en `release/latest.yml` antes de distribuirlo.

## Arquitectura

```text
Vendix/
|-- backend/         API Express, Prisma y SQLite
|-- frontend/        React, Vite y Tailwind CSS
|-- electron/        Shell de escritorio para Windows
|-- scripts/         Helpers de build y base inicial
|-- docs/            Landing de GitHub Pages y documentacion tecnica
|-- DEPLOY.md        Guia de despliegue
`-- README.md
```

| Capa | Tecnologia |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Estado | TanStack Query, Zustand |
| Backend | Node.js, Express, TypeScript |
| Datos | Prisma ORM, SQLite |
| Desktop | Electron |
| Seguridad | JWT, bcrypt, rate limiting, auditoria |

## Formas de uso

| Modalidad | Uso recomendado |
|---|---|
| Escritorio Windows | Un negocio que opera en una computadora y prioriza simplicidad |
| Red local | Varias computadoras o tablets conectadas al mismo Wi-Fi |
| Cloud | Acceso remoto desde diferentes ubicaciones y dispositivos |

Consulta [DEPLOY.md](DEPLOY.md) antes de publicar una instancia. SQLite funciona bien en escritorio y red local; para un despliegue cloud serio conviene definir almacenamiento persistente o migrar a PostgreSQL.

## Estado del producto

Vendix esta en desarrollo activo. Las funciones principales estan operativas, pero existen mejoras planificadas:

- Generacion de PDF binario server-side para facturas y estados de cuenta.
- Aplicacion directa de canjes de puntos dentro del POS.
- Integracion de recordatorios CRM en Planner.
- Experiencia PWA y responsive movil dedicada.
- Hardening adicional para produccion cloud.

El detalle se mantiene en [docs/roadmap-progress.md](docs/roadmap-progress.md).

## GitHub Pages

La landing publica vive en `docs/`. Para publicarla:

1. Abre `Settings > Pages` en GitHub.
2. En `Build and deployment`, selecciona `Deploy from a branch`.
3. Selecciona la rama principal y la carpeta `/docs`.
4. Guarda la configuracion.

## Documentacion

- [Arquitectura](docs/architecture.md)
- [Referencia API](docs/api-reference.md)
- [Seguridad](docs/auth-security.md)
- [Base de datos](docs/database.md)
- [Configuracion de entorno](docs/env-configuration.md)
- [Roadmap implementado](docs/roadmap-progress.md)
- [Releases y auto-update](docs/releases-and-auto-update.md)

## Contribuir

Antes de proponer cambios:

1. Ejecuta `npm run build:backend`.
2. Ejecuta `npm run build:frontend`.
3. Evita romper los flujos existentes de venta, inventario, caja y cuentas por cobrar.
4. Documenta cualquier cambio de schema o variable de entorno.

## Licencia

Este repositorio se publica bajo licencia MIT.
