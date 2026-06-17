# TIZ — Gestión Operativa

Aplicación web interna de TIZ Publicidad para seguimiento operativo.

## Estructura

```text
index.html                 # Estructura HTML principal
src/styles.css             # Estilos visuales
src/app.js                 # Lógica, Firebase, permisos, render y CRUD
backup/index-original.html # Copia completa del último archivo monolítico
docs/bitacora.md           # Registro de cambios
docs/roadmap.md            # Próximas mejoras
```

## Usuarios actuales

La app usa Firebase Auth con lista autorizada dentro de `src/app.js`.

Usuarios cargados actualmente:

- info@tizpublicidad.com — Ventas / Admin
- pablo.aciar@tizpublicidad.com — Producción
- julieta.aguirre@tizpublicidad.com — Diseño
- carolina.flores@tizpublicidad.com — Compras
- arielbenitezpublicidad@gmail.com — Colocaciones

## Importante

Esta versión separa el archivo único original en HTML, CSS y JavaScript para que sea más fácil mantenerlo en GitHub.
