# Costos por renglón del presupuesto

El cotizador muestra una matriz con un ítem de venta por fila y un insumo por columna. Los códigos y nombres de material están en encabezados compactos; la primera columna queda fija y la tabla tiene desplazamiento horizontal. Los detalles de proveedor, equivalencias, stock y revisión se abren desde «Datos del insumo».

Cada celda contiene el consumo total del insumo para ese renglón completo, incluyendo todas las unidades cotizadas. El pie suma los consumos por insumo para la cotización. Una columna compartida puede usarse en varios trabajos. Vincular dos columnas con el mismo artículo y unidad las une conservando cantidades.

El costo neto por renglón usa los precios y equivalencias del catálogo. El índice es un multiplicador directo (2,7 = costo × 2,7), no un porcentaje de margen. «Usar precio» actualiza el precio unitario comercial a partir del total sugerido y la cantidad vendida, sólo tras pulsar el botón. No aplica precios con costo sin resolver, índice inválido, moneda de venta distinta de ARS o consumos pendientes de repartir.

Los consumos anteriores de un único ítem se conservan en esa fila. Si había varios ítems sin distribución, se conservan en «Consumos por repartir». No se asignan al primer trabajo ni se multiplican por cada uno. Quitar un trabajo conserva sus consumos en esa fila común para revisarlos.

La distribución e índices se guardan en `items[].insumosMatrizV1`, campo interno de cada ítem comercial. `insumosVentas` conserva los totales consolidados que usa la aprobación y la OT. El servidor existente ya conserva `items`; este cambio no requiere desplegar Functions ni Apps Script. El PDF del cliente sigue usando descripción, cantidad y precio comerciales.

Los presupuestos aprobados conservan su bloqueo y sus costos de aprobación. Para modificarlos se crea una nueva revisión.

Validación: 38 pruebas de modelo, equivalencias, costos, aprobación y matriz; verificación del flujo de pantalla en DOM (editar cantidades, sumar totales, aplicar precios explícitamente, guardar/reabrir, agregar/quitar columnas, moneda y bloqueo de aprobaciones).

## Precios previstos y edición

Cada columna tiene una × visible que elimina ese insumo y sus consumos. + Agregar insumo crea una columna. + Ítem a cotizar y la × del renglón permiten sumar o quitar trabajos; al quitar un trabajo desde la matriz se eliminan sus consumos, conservando los de los demás.

El campo Previsto neto toma ARS por unidad de uso (por ejemplo, por m²). Vacío usa el precio sugerido de Compras convertido a esa unidad. Un valor explícito, incluso cero, es manual, se conserva al guardar y aprobar y nunca modifica Compras. Usar sugerido borra la excepción manual. Cambiar la unidad borra el precio manual para evitar aplicarlo a otra medida.

La aprobación conserva precio, unidad y origen. MATERIALES OT mantiene numérico el costo neto en E y muestra «manual» en el formato de la celda, con precio por unidad y origen en su nota. Las actualizaciones sólo cambian A:E y conservan los bloques de Producción y Pañol.
