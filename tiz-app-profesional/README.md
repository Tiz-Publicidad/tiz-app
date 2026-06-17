# TIZ — Gestión Operativa

Aplicación web interna para seguimiento operativo de TIZ Publicidad.

## Estructura

```text
index.html              # Estructura principal de la app
src/styles.css          # Estilos visuales
src/app.js              # Lógica, Firebase, permisos, render y CRUD
backup/index-original.html # Copia del archivo original completo
README.md               # Guía del proyecto
```

## Funcionalidades actuales

- Login con Google.
- Permisos por usuario/sector.
- Dashboard.
- Obras.
- Planificación semanal.
- Producción.
- Colocaciones.
- Diseño.
- Cobranzas.
- Presupuestos.
- Clientes.
- Retenciones.
- Tareas.
- Métricas de vendedores.
- Estadística.
- Firebase Firestore en tiempo real.

## Usuarios actuales

Ver `docs/firebase-y-usuarios.md`.

## Cómo subir a GitHub

1. Descomprimir este paquete.
2. Subir estos archivos al repositorio `tiz-app`.
3. Reemplazar el `index.html` anterior por el nuevo.
4. Agregar la carpeta `src/`, `docs/` y `backup/`.
5. Hacer commit con un mensaje como:

```text
Reestructura app en HTML, CSS y JS separados
```

## Próximas mejoras recomendadas

1. Separar `src/app.js` en módulos más chicos.
2. Mover usuarios/permisos a Firestore.
3. Crear reglas de seguridad Firestore.
4. Agregar backups/exportación automática.
5. Mejorar versión mobile.
