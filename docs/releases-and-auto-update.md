# Releases y auto-update

Vendix usa `electron-builder`, NSIS y `electron-updater` para distribuir actualizaciones de Windows mediante GitHub Releases.

## Artefactos esperados

Cada release debe publicar juntos:

- `Vendix-Setup-X.Y.Z.exe`
- `Vendix-Setup-X.Y.Z.exe.blockmap`
- `latest.yml`

`latest.yml` permite que una instalacion existente detecte la version nueva. No debe mezclarse con el `.exe` de otra build.

## Crear release automatica

Cada push de codigo a `main` ejecuta `.github/workflows/release.yml`. Si el build completo termina correctamente, GitHub Actions:

- genera una version patch unica para esa ejecucion;
- compila backend, frontend, seed y Electron;
- prepara el runtime minimo del backend;
- publica el instalador, `.blockmap` y `latest.yml` en GitHub Releases.

Los cambios exclusivamente dentro de `docs/` o archivos Markdown no generan un instalador nuevo. Tambien puedes iniciar el workflow manualmente desde GitHub Actions.

Para publicar una version definida manualmente, actualiza `version` en `package.json`, crea el tag y subelo:

```bash
git tag v1.2.0
git push origin v1.2.0
```

## Generar instalador local

```bash
npm run dist
```

El instalador queda en `release/`. Esta build sirve para validacion local. Para publicar auto-update usa el workflow por tag o:

```powershell
$env:GH_TOKEN="tu_token"
npm run release:github
```

`npm run dist` crea primero `.build/backend-runtime/` con dependencias de produccion. No uses `npm prune` sobre `backend/node_modules`: eliminaria tipos y herramientas necesarias para seguir desarrollando.

## Solucion de problemas

Si la app instalada muestra `El servidor tardo demasiado en iniciar`:

1. Confirma que `backend/prisma/schema.prisma` mantiene `engineType = "binary"`.
2. Ejecuta `npm run dist` para regenerar cliente Prisma, runtime e instalador.
3. Reinstala con el nuevo `release/Vendix-Setup-X.Y.Z.exe`.
4. Revisa `%APPDATA%\Vendix\server.log` si el fallo persiste.

El motor binario de Prisma es necesario porque el backend se carga dentro del proceso Electron. El motor Node-API predeterminado puede bloquearse por incompatibilidad de ABI.

## Comportamiento de la aplicacion

- La app instalada busca actualizaciones al arrancar.
- Tambien permite buscarlas desde el menu de bandeja.
- Descarga automaticamente la version mas reciente.
- Cuando termina la descarga, pregunta si debe reiniciar e instalar. Si eliges hacerlo mas tarde, se aplica al cerrar la app.
- La base SQLite del usuario vive en `userData` y no se reemplaza durante la actualizacion.
- Los eventos del actualizador quedan registrados en `%APPDATA%\Vendix\server.log`.

## Consideraciones

- GitHub Releases debe ser publico para actualizaciones publicas simples.
- No publiques releases como draft: el actualizador no las detecta.
- Incrementa siempre `version`. Reutilizar la misma version no actualiza instalaciones existentes.
- Para distribucion comercial conviene firmar el instalador de Windows para evitar advertencias de SmartScreen.
