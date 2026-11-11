# Lectura parcial de comprobantes

Cuando un renglón no tiene descripción, cantidad, precio neto o IVA válidos, el lector conserva la cabecera y los renglones legibles. Devuelve los índices originales y la descripción de los pendientes en `itemsNoLeidos`, sin inventar valores.

La pantalla muestra `Cargar sin el ítem 2` (o los números correspondientes) y sólo aplica los datos tras elegir esa opción. El archivo original no se modifica. La lectura pendiente se descarta al cerrar, abrir otra compra, cambiar de archivo o iniciar otro análisis.

Al guardar una lectura parcial se exige un total impreso legible y coincidencia con la suma de los ítems, con tolerancia de $0,05 por redondeo. Se guarda el detalle de los renglones omitidos y el total del comprobante en `lecturaParcial`. Las compras normales mantienen su validación actual.

## Activación

1. Publicar el frontend con `compras.js` e `index.html` de este cambio.
2. En el proyecto existente de Google Apps Script del lector de comprobantes, reemplazar el código por `services/tizComprasIA.gs`.
3. En **Implementar > Administrar implementaciones**, editar la implementación web existente y seleccionar **Nueva versión**. Mantener su configuración de acceso, las propiedades del proyecto y el enlace privado de conexión. No crear ni compartir otra clave.
4. Actualizar TIZ y analizar el PDF original. Debe aparecer **Cargar sin el ítem 2** para el envío con cantidad/precio ilegibles; al pulsarlo se carga el producto y luego se confirman proveedor e insumo mediante el flujo habitual.

GitHub Pages publica sólo la pantalla. No actualiza la implementación de Google Apps Script. Con el lector anterior se sigue recibiendo únicamente un error, sin los datos necesarios para recuperar los otros ítems.

## Validación

`node --check compras.js`

`node --test tests/comprasLecturaEstadoV1.test.cjs tests/comprasLecturaParcialV1.test.cjs tests/comprasIngresoV1.test.cjs tests/comprasCatalogoIngresoV1.test.cjs`

Las pruebas simulan la respuesta del lector y el flujo de pantalla. No sustituyen una lectura del PDF con Gemini en la implementación activa.
