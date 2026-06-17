# Bitácora de trabajo — TIZ App

Fecha de generación: 2026-06-17 18:09

## Contexto

El proyecto venía como un único archivo `index.html` generado/actualizado con ayuda de Claude y pegado manualmente en GitHub.

Repositorio indicado por Giancarlo:

https://github.com/gianxr85/tiz-app/blob/main/index.html

## Pedido actual

Rearmar la app con una estructura más profesional para poder continuar el desarrollo y que interactúen 5 usuarios distintos.

## Decisión tomada

Se separó el archivo único en:

- `index.html`
- `src/styles.css`
- `src/app.js`
- `docs/firebase-y-usuarios.md`
- `backup/index-original.html`

## Usuarios/sectores detectados en el código

- info@tizpublicidad.com → Ventas / Admin
- pablo.aciar@tizpublicidad.com → Producción
- julieta.aguirre@tizpublicidad.com → Diseño
- carolina.flores@tizpublicidad.com → Compras
- arielbenitezpublicidad@gmail.com → Colocaciones

## Próximo paso recomendado

Subir esta estructura a GitHub y luego seguir separando `src/app.js` por módulos: `firebase.js`, `auth.js`, `obras.js`, `clientes.js`, `cobranzas.js`, `presupuestos.js`, `tareas.js`, `utils.js`.
