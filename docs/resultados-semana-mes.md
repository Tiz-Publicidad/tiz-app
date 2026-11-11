# Resultados de la app por fecha real

Las vistas «Por semana» y «Por mes» de Estadística muestran resultados de los registros de la app. «Ver planilla histórica TIZ 2026» conserva la consulta existente, incluidas sus metas y acumulados oficiales. Ambos orígenes se muestran separados.

- Ventas: fecha de aprobación y valor neto de la cotización vigente.
- Producción: fecha real de producción, cantidad de OT y valor neto de esas OT. Al cambiar el estado de Obras a Producida se registra la fecha del día en Argentina si todavía no había una real.
- Entregas: fecha del cambio a Entregado, cantidad y valor neto. Pasar después a Cobrado no cambia la fecha. Volver a Pendiente anula el resultado de entrega hasta confirmar una nueva entrega.
- Cobranzas: importes efectivamente recibidos en sus fechas de cobro. Las retenciones se informan separadas. No se usa la fecha de vencimiento como fecha de cobro ni se considera que cambiar el estado a Cobrado sea un movimiento de dinero.

Cada OT cuenta una sola vez por etapa; cada pago identificado, una sola vez. Los cuatro indicadores no se suman entre sí. La agrupación semanal usa lunes a domingo e identificación ISO; el mes y el año corresponden a la fecha real en Argentina.

Los históricos sin fecha real quedan identificados como pendientes. No se les asigna la fecha de instalación prevista, la de vencimiento ni la fecha de publicación de esta función. Importes sin dato o pendientes de conversión a ARS conservan el recuento y se señalan como pendientes. Las revisiones no operativas y las bajas respetan la selección de Obras.

Sólo las cuentas que ya tienen acceso a estadísticas económicas pueden ver estos importes o exportarlos. Se espera la carga de Obras, Clientes, Cotizaciones y Cobranzas antes de calcular; los cambios de esas fuentes refrescan los resultados.
