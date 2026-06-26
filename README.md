# TIZ — Gestión Operativa

Aplicación interna para seguimiento operativo de TIZ Publicidad.

## Versión v3 — Roles por puesto

Esta versión mantiene la app funcionando como antes, pero mejora la estructura de permisos: la app ya no muestra nombres de usuario como identidad operativa, sino **puestos**.

Puestos definidos:

- Admin
- Ventas
- Compras
- Producción
- Diseño
- Colocaciones
- Cobranzas

## Estructura

```text
index.html                 # HTML principal
src/styles.css             # Estilos visuales
src/app.js                 # Firebase, roles, permisos, render y CRUD
backup/index-original.html # Respaldo del último archivo monolítico
README.md                  # Guía del proyecto
docs/bitacora.md           # Registro de cambios
docs/roadmap.md            # Próximas mejoras
```

## Cómo agregar usuarios

Editar en `src/app.js` el mapa `USER_ROLE_MAP`:

```js
const USER_ROLE_MAP = {
  'info@tizpublicidad.com': 'Admin',
  'pablo.aciar@tizpublicidad.com': 'Producción',
  'carolina.flores@tizpublicidad.com': 'Compras',
  'cobranzas@tizpublicidad.com': 'Cobranzas',
};
```

El email se usa solo para validar acceso. La app trabaja por puesto.


## Versión v4 — Presupuestos reales TIZ

Agrega ítems múltiples por obra, cálculos auxiliares, numeración automática de clientes y respaldo automático en Drive/Sheets al aprobar una obra.

### Configuración obligatoria para Drive

1. Crear en Drive la carpeta madre: `Ordenes de trabajo aprobadas`.
2. Copiar el ID de esa carpeta.
3. Pegar `apps_script_drive_sheets_v4.gs` en Google Apps Script.
4. Reemplazar `PEGAR_ID_CARPETA_ORDENES_APROBADAS` por el ID de la carpeta madre.
5. Implementar como Aplicación web, ejecutar como `Yo`, acceso `Cualquier persona`.
6. Copiar la URL `/exec`.
7. En `index.html`, reemplazar `PEGAR_URL_WEB_APP_APPS_SCRIPT_AQUI` por esa URL.
