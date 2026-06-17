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
