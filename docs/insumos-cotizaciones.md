# Insumos desde Cotizaciones

El detalle de Ventas vive en Cotizaciones, antes de aprobar. Las filas describen la cantidad necesaria para la cotización completa. La IA propone materiales y nunca confirma cantidades ni revisiones. Una fila sin vínculo al catálogo, cantidad positiva, unidad convertible, precio de compra o revisión bloquea la aprobación. Los faltantes y conteos desconocidos se muestran en rojo y requieren marcar una compra o verificación pendiente.

## Vincular y crear desde la cotización

Cada fila ofrece **Buscar / vincular** y **Nuevo insumo**. La búsqueda usa código, descripción, familia y subfamilia del catálogo compartido `articulosCompra`. Vincular conserva cantidad y unidad de uso y exige revisar nuevamente la fila; no hace conversiones implícitas ni registra movimientos de stock.

Ventas y Compras pueden dar de alta un insumo con descripción, unidad, familia, subfamilia y tipo de control. El servidor usa el contador compartido `comprasSecuencias/insumos`, evita descripciones duplicadas y hace idempotentes los reintentos mediante `altasInsumosCotizacion`. Se reservan los códigos de la base TIZ. El alta no genera una compra, un precio ni un ingreso de stock. Si falta el costo de Compras, la cotización puede conservarse como borrador, pero no aprobarse todavía.

El catálogo tiene un botón **Cerrar** y cada resultado ofrece **Editar**, además de Vincular. Editar permite modificar descripción, familia, subfamilia, control y unidad de registro. Una unidad equivocada se corrige directamente si el insumo no tiene compras, conteos, reservas ni cotizaciones aprobadas. En ese caso se reinician sus equivalencias y se conservan el código y el mínimo de stock. Con registros anteriores, la unidad original no se renombra: se usa **Unidades y equivalencias**, con un rendimiento explícito, para cambiar la unidad de control. Por ejemplo, para tinta comprada por litro y controlada en m² se debe indicar cuántos m² rinde un litro. Las ediciones quedan auditadas y se rechazan los cambios simultáneos sobre una ficha desactualizada. La cantidad de la cotización se conserva y la fila requiere revisión antes de aprobar.

Para impresión propia sobre lona aportada por el cliente, corresponde vincular la tinta consumida, sin agregar lona. La cantidad de tinta se carga según el consumo previsto; no se deduce de los m² vendidos. Un trabajo contratado a terceros puede vincularse como servicio sin stock, con su propio costo.

## Aprobación transitoria con costos pendientes

Mientras se completa la carga inicial de Compras, el botón **Permitir aprobación con costos pendientes** habilita una excepción para el detalle actual de una cotización. Sólo cubre insumos que todavía no tienen ninguna compra con precio registrado; no permite ignorar precios inválidos, moneda sin convertir o unidades incompatibles. Cantidad, vínculo al catálogo, revisión y verificación de stock siguen siendo obligatorios. Después de habilitarlo, se elige Aprobado y se guarda normalmente. La autorización se pierde al cambiar el detalle y no se hereda al abrir otra cotización.

El servidor vuelve a comprobar el catálogo y registra insumos pendientes, motivo, usuario y fecha en el resumen aprobado. El costo total y los costos individuales desconocidos se guardan como `null`, con `estadoCosto: pendiente`; el subtotal de costos conocidos queda separado. No se inventa un precio cero ni se modifica el precio de venta. Cuando Compras incorpora los precios, las nuevas aprobaciones ya no requieren la excepción. Los resúmenes previamente aprobados conservan su estado y sus datos históricos.

## Fecha de aprobación y alta en Obras

La aprobación guarda la fecha del servidor en la cotización. Al promoverla a Obra, se toma su día en Buenos Aires como fecha de alta y su semana ISO como semana de venta. La fecha original de cotización queda en el documento comercial y en `infoPresupuesto.fechaCotizacion`. Reintentar, editar o sincronizar una obra no cambia su fecha de alta. Las obras nativas marcadas con `fechaAltaObraOrigen: aprobacion` conservan esos datos ante la sincronización de la referencia externa.

## Presentaciones de compra y unidad de control

La unidad original del artículo se conserva para interpretar los registros históricos. unidadCompraPreferida indica cómo se compra y unidadControl la unidad operativa de stock y consumo. equivalenciasStock relaciona unidades con la original: si la original es ROLLO, { "M²": 68.5 }; si la original ya es M² y se compra por rollos, { "ROLLO": 1/68.5 }. La interfaz siempre pide la relación legible «1 ROLLO contiene 68,5 m²». No se infieren tamaños desde la descripción ni se renombra la unidad de registros antiguos.

Se configura desde Compras → Catálogo → Unidades o desde Definir equivalencia en Cotizaciones. Se eligen unidad de compra y unidad de control, ancho/largo opcionales para área y se revisa el cálculo antes de guardar. La aritmética de las medidas debe coincidir con la equivalencia; las escalas métricas fijas tampoco se pueden reemplazar por valores arbitrarios. Una relación histórica desconocida exige confirmación explícita. Cada dimensión o presentación distinta debe usar un insumo identificable; no cambiar la medida de un artículo para mezclar rollos distintos.

Ejemplo: 1 rollo de 1,37 × 50 m ingresa 68,5 m². Una compra de ARS 68.500 por rollo da ARS 1.000 por m². Un requerimiento de 5 m² se calcula como 5 m² de stock y ARS 5.000 de costo. Las cantidades necesarias pueden incluir merma y no tienen que coincidir con la superficie impresa vendida.

Las compras conservan cantidad, unidad, precio y total del comprobante. Guardan además la cantidad/unidad de stock y el factor usado en ese momento; editar otros datos del comprobante no reescribe una conversión ya guardada. Si se cambia la unidad que leyó la IA, se exige confirmar esa corrección antes de revisar y guardar la compra. El catálogo, cotizador, conteos y planes comparan cantidades y precios en la unidad de control. Los conteos nuevos guardan su propia unidad; uno anterior sin unidad utiliza la original del artículo. Un primer conteo establece saldo, sin inventar consumo anterior. Los datos ya mal cargados pueden requerir revisión o un conteo físico; no se reinterpretan como rollos sólo porque la presentación nueva sea ROLLO.

El stock informado parte del último conteo, suma entradas destinadas a Stock posteriores a ese día y resta planes abiertos convertidos a la misma unidad. Compras del mismo día del conteo no se suman otra vez porque no se conoce el orden. Configurar unidades no cambia cantidades físicas ni aprueba una obra. El consumo real sigue el registro operativo de stock y los conteos; el presupuesto conserva su estimación separada.


El servidor vuelve a leer catálogo, compras, conteos y planes en la transacción de aprobación. Guarda la cotización y `aprobacionesInsumosCotizacion/{presupuestoId}` juntos. El cliente no puede escribir esa validación. El resumen congelado incluye cantidades, equivalencia, costo por unidad de stock, proveedor, fecha, compra de origen, importe y moneda de venta. La OT recibe la misma base. Cambiar materiales aprobados exige una nueva revisión; los precios posteriores no reescriben la estimación original. Las cotizaciones anteriores sin base siguen recibiendo actualizaciones operativas, pero para aprobar nuevamente deben completar materiales. No se presenta un resultado como ganancia real: faltan todavía los consumos y otros costos reales de Producción y Colocaciones.

## Aprobación durante la implementación y sugerencias de impresión

En Cotizaciones, **Aprobar y dejar insumos pendientes** selecciona Aprobado y ejecuta el guardado en un solo paso. Permite continuar con detalle por completar, sin revisión, vínculo, equivalencia, conteo o costo. Sigue validando permisos de Ventas, importes comerciales, cantidades explícitas positivas y conflictos de edición. No aprueba otros presupuestos ni cambia el stock. Cada cotización requiere su propia acción; editar sus materiales invalida el permiso. El resumen versión 3 conserva los pendientes concretos, usuario y fecha. Las cantidades de stock sin conversión y los costos sin resolver se guardan como `null`; se muestra el subtotal conocido por separado. El botón anterior limitado a costos queda reemplazado en la interfaz; el servidor sigue aceptando esa modalidad para compatibilidad.

El desglose verifica soporte y tinta / impresión separados para trabajos impresos. Si el cliente aporta el soporte, propone sólo impresión. Los artículos combinados no reciben una segunda línea de tinta. Las sugerencias conservan cantidad vacía y requieren revisión; no se deduce rendimiento en litros desde m². Si hay varios artículos posibles, se deja el vínculo por confirmar.

Al aprobar por primera vez, el servidor conserva las selecciones de artículos revisadas por Ventas en `memoriaInsumosCotizacion`, separadas por soporte, técnica UV/general y trabajo con/sin soporte. Reutiliza el último ejemplo para completar sugerencias de trabajos similares. Guarda hasta ocho ejemplos por contexto, sólo identificadores de artículos y fechas, sin clientes, precios ni cantidades. No aprende de propuestas sin revisar ni duplica ejemplos al reintentar un guardado. Esta memoria es una ayuda del sistema; no reentrena el modelo. Las reglas se aplican a la respuesta del servicio compartido y no requieren republicar Apps Script.

## Publicación

Publicar primero `sincronizarBaseMadreV120`, después las reglas y finalmente el sitio. El endpoint nuevo usa autenticación Firebase; aprobación e IA quedan limitadas a las cuentas de Ventas. Ventas y Compras pueden definir equivalencias. El endpoint de catálogo acepta los mismos cinco usuarios internos de Firestore.

El desglose reutiliza el enlace compartido de Compras (`configuracionCompras/iaComprobantes`). El servidor valida el enlace de Google Apps Script y prepara la descripción y el catálogo. El navegador los envía a `analyzeMaterials` mediante el mismo POST y consulta de estado JSONP que usa Compras; el resultado queda en caché para recuperar respuestas demoradas. La clave de Gemini permanece en las propiedades del mismo servicio; no se copia al sitio ni se requiere habilitar otro proveedor. El código del servicio está en `services/tizComprasIA.gs`, que conserva la lectura de comprobantes. Publicar una nueva versión en la implementación existente antes del backend. Una falla de IA conserva el borrador y permite la carga manual, sin sugerencias falsas.

Validación local: `node --test tests/insumosCotizacionV1.test.cjs tests/cotizacionesEstadoV1.test.cjs tests/cotizacionesOrdenV1.test.cjs tests/tipoFacturaCotizacionV1.test.cjs`. Las pruebas de interfaz usan datos ficticios; no se aprueban presupuestos reales para probar el flujo.
