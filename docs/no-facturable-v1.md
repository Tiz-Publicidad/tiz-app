# Condición No facturable desde el presupuesto

La casilla **No facturable** se carga en el presupuesto comercial. Está destildada por defecto; los documentos anteriores sin el campo `noFacturable` siguen siendo facturables. Cobrar en efectivo no cambia esta condición automáticamente.

Al aprobar, la condición se conserva en la obra y se sincroniza con **Nro FC (S)** de Base Madre: marcada escribe `N/A`; destildada elimina solamente esa marca. No completa fecha de factura ni inventa un comprobante. La edición y las revisiones conservan la condición; un presupuesto nuevo la limpia. Los cambios quedan en `historialFacturabilidad` del presupuesto y de la obra.

Las obras no facturables no suman pendientes de facturación. Conservan el importe aprobado y los cobros reales, y aparecen en Cuentas a cobrar hasta completar el pago. No se dan por cobradas al tildar. Las emisiones nuevas y la carga manual de FC se bloquean mientras la condición esté activa.

No se reemplazan números fiscales, fechas, fórmulas ni cobros. Si hay comprobantes registrados o un número/formula en Nro FC, se exige revisión en lugar de sobrescribirlo. Una condición contradictoria nunca oculta las facturas existentes. La conciliación reconoce N/A y no lo importa como factura ni lo usa para cerrar una cobranza. Los N/A históricos sin condición explícita se dejan para revisión.

## Publicación y verificación

La propuesta se prepara en rama, sin modificar datos productivos. El despliegue necesita tanto el frontend como `sincronizarBaseMadreV120`, `facturacionIntegralEmitirV83` y el emisor anterior de `arcaProduccionGeneral.js`. Los workflows existentes publican automáticamente al incorporar cambios en main. El frontend comprueba que el backend confirme N/A; si el backend aún no está actualizado, muestra sincronización pendiente en vez de anunciar éxito. Una aprobación y sus cobros se pueden reintentar sin crear otra obra.

Antes de habilitar el uso, comprobar con un presupuesto de prueba: aprobar con la casilla marcada, confirmar N/A en su fila, registrar pago parcial, revisar el saldo, destildar y comprobar que solamente desaparece N/A. Estas operaciones no se ejecutan sobre registros reales durante las pruebas automatizadas.

Se cubren valores predeterminados, altas, ediciones, revisiones, reversión, cobros parciales/completos, conciliación, emisiones bloqueadas, idempotencia fiscal, columnas reordenadas, fórmulas y comprobantes existentes. Las pruebas de cobros anteriores se actualizan para incluir la fecha obligatoria de pago.
