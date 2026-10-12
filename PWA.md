# TIZ en Android

La PWA usa el mismo sitio, usuarios, permisos, Firebase y módulos de escritorio.
En Chrome para Android, abrir TIZ y elegir **Instalar TIZ** o usar el menú de
Chrome → **Instalar aplicación / Agregar a la pantalla principal**.

El menú móvil reutiliza la navegación existente. Colocaciones presenta las
acciones como renglones adaptados a tarjetas en pantallas pequeñas; las tablas
anchas de otros módulos conservan desplazamiento horizontal.

## Publicaciones

El workflow de Pages inserta el commit publicado en `meta[name=tiz-build]` y
en `DEPLOY_COMMIT.txt`. La app comprueba versiones al volver a primer plano y
cada dos minutos mientras está visible. Muestra **Actualizar**; no recarga
automáticamente las sesiones abiertas. Si hay campos modificados, pide verificar
que estén guardados. Los cambios en `sw.js` esperan la aplicación de la actualización.

Mantener versiones de scripts y estilos al modificar módulos, como en escritorio.
Si cambian los archivos precargados, incrementar `CACHE` en `sw.js`.

## Conexión

El service worker no almacena HTML de la app, módulos, respuestas de Firebase,
Drive, facturación, solicitudes autenticadas ni operaciones de escritura.
Sólo precarga una pantalla informativa sin datos de negocio y el icono.
El ingreso de Google mantiene el flujo existente. El trabajo offline y las
notificaciones push requieren un desarrollo separado.

Validación: `node --test tests/pwaV1.test.cjs` y pruebas de los módulos afectados.
