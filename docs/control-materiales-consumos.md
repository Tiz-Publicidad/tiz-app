# Control de materiales y consumos

Materiales por OT integra tres vistas: revisión de los insumos de Ventas, necesidad total de compra y entregas/devoluciones. Stock / conteo integra el cierre físico y los desvíos históricos. Los pendientes generan avisos y no bloquean aprobaciones ni revisiones.

## Revisión y compra

Revisar materiales abre un formulario con la previsión aprobada de Ventas, o su borrador si no existe. Se conserva la fuente original y se guarda por separado la cantidad confirmada, unidad, fecha prevista de consumo, sector y motivo de corrección. Los planes antiguos vacíos pueden recuperar la previsión de Ventas al abrirse. No se escriben planes al abrir o cancelar.

La necesidad de compra agrupa todas las líneas de planes activos por identificador de artículo y unidad de control. Descuenta entregas netas de devoluciones de cada OT y compara la necesidad pendiente total con el stock físico estimado, una sola vez. No suma faltantes calculados individualmente por OT. Las conversiones requieren equivalencias explícitas. Las cantidades pendientes o los saldos desconocidos no se presentan como cero. Se informa cuántas OT faltan revisar. La exportación conserva cantidades netas sin redondearlas a presentaciones comerciales.

## Movimientos

Las entregas, adicionales y devoluciones registran fecha, OT, artículo, cantidad/unidad, sector, motivo, observación, usuario e instante de carga. Se agregan mediante transacción al historial del plan. Las compras directas a OT reducen su necesidad pendiente, pero no modifican el depósito; debe evitarse registrar la misma entrega dos veces. Una entrega al sector mide salida del depósito, no demuestra consumo final en la obra.

Las salidas posteriores al último conteo ajustan el saldo estimado. Las incluidas en ese conteo no se descuentan otra vez. Los movimientos de planes cerrados siguen formando parte del historial físico; esos planes ya no reservan materiales.

## Conteos y desvíos

Cada saldo se compara con el último conteo de ese artículo y los ingresos de compras destinadas a stock en el intervalo. El primer conteo sólo fija una referencia. La fecha de cierre e instante de corte permiten distinguir movimientos cargados el mismo día. Conviene cargar compras y movimientos antes del cierre y usar la fecha real de cada operación.

Consumo observado = saldo anterior + ingresos del período − saldo contado.

El cierre congela la previsión de consumo de los próximos siete días, basada en las fechas previstas de las líneas. El siguiente cierre compara con esa copia, sin recalcular el pasado con planes modificados posteriormente. Si el cierre no coincide con el período previsto, faltan fechas o hay conversiones pendientes, se informa que la comparación no está cerrada. Los conteos históricos previos no reciben una previsión inventada retroactivamente.

Las entregas netas explican el consumo observado; no se suman otra vez a éste. La diferencia entre consumo observado y salidas registradas queda como saldo por conciliar. No se atribuye automáticamente a un sector. El desvío frente a la previsión se muestra por insumo/unidad y se valoriza con el último costo neto por unidad de control disponible al cierre. Los costos desconocidos siguen pendientes. No se suman cantidades de diferentes unidades.

Las explicaciones pueden ingresarse al contar o agregarse después; conservan sector, motivo, OT, observación, usuario e instante. Las explicaciones posteriores se anexan sin alterar los cálculos originales. El historial permite filtrar por semana y sector. Los excesos sin explicación también generan un aviso en Alertas.

## Alcance

No se generan órdenes de compra ni se envían mensajes. No hay cambios masivos de datos existentes. Las escrituras usan los permisos vigentes del usuario autenticado; el acceso de los sectores depende de esos permisos. Los errores de conexión o cambios simultáneos se informan conservando el formulario, sin sobrescribir la revisión de otra persona.
