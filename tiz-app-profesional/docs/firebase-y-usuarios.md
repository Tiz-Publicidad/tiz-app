# Firebase / Usuarios

La app usa Firebase Auth con Google y Firestore.

Usuarios autorizados actuales dentro de `src/app.js`:

- info@tizpublicidad.com → Ventas / Admin
- pablo.aciar@tizpublicidad.com → Producción
- julieta.aguirre@tizpublicidad.com → Diseño
- carolina.flores@tizpublicidad.com → Compras
- arielbenitezpublicidad@gmail.com → Colocaciones

Para agregar o quitar usuarios, editar el objeto `USER_SECTOR_MAP` en `src/app.js`.

Recomendación próxima etapa: mover usuarios y permisos a Firestore para no tener que tocar código cada vez que cambia el equipo.
