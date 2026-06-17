# Bitácora TIZ App

## 2026-06-17 — Reestructura inicial

Se tomó el último `index.html` usado por TIZ y se separó en una estructura más profesional:

- `index.html`: estructura HTML.
- `src/styles.css`: estilos.
- `src/app.js`: lógica de Firebase, permisos, CRUD y renderizado.
- `backup/index-original.html`: respaldo íntegro del archivo original.

Objetivo: mantener la app funcionando igual, pero facilitar cambios futuros.

## Próximo paso recomendado

Subir estos archivos a la raíz del repositorio GitHub, no dentro de una carpeta contenedora.
