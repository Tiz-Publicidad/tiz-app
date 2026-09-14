# TIZ — Puesto integral de Facturación y Cobranzas V1

## Criterio operativo
- Punto de venta ARCA productivo: **00009**.
- Carpeta fiscal única: **Drive / 2026 Facturacion** (`1XYk0vAIsGZCAiJ4s7TGyQYJdVBYvYdGy`).
- Los comprobantes fiscales **no se guardan dentro de la carpeta de la OT**. La OT sólo conserva el vínculo y metadatos.
- Una emisión ARCA autorizada nunca se vuelve a emitir porque falle Drive o el correo. Se reintenta únicamente la etapa pendiente.
- Todo cambio financiero debe quedar auditado con usuario, fecha, valor anterior, valor nuevo y motivo.

## Flujo del operador
1. **Por facturar**: OT aprobadas con saldo no facturado. Mostrar cliente, CUIT, condición IVA, total aprobado, facturado, saldo, días de pago, orden de compra/referencia requerida y alertas de datos faltantes.
2. **Preparar comprobante**: Factura A/B o FCE A/B; anticipo/saldo/total; porcentaje o neto; IVA sugerido 21% editable; ítems de cotización editables sólo antes de emitir; vista previa de totales.
3. **Control previo**: bloquear emisión si faltan CUIT/condición IVA/importe/ítems o si excede saldo. Confirmación final explícita.
4. **ARCA**: emisión productiva PV 00009 con idempotencia y lock por tipo de comprobante. Guardar CAE, vencimiento CAE, número, fecha, operador y respuesta fiscal.
5. **PDF fiscal**: generar PDF con QR y archivar exclusivamente en `2026 Facturacion`. Guardar `driveFileId`, `driveUrl`, nombre y estado de archivo. Si falla, marcar `drivePendiente` sin volver a emitir ARCA.
6. **Envío**: elegir `Facturar y enviar` o `Sólo facturar`. Destinatarios sugeridos por cliente, editables y persistentes. Guardar destinatarios, remitente, fecha, operador y resultado. Permitir reenvío sin nueva factura.
7. **Por cobrar**: al emitir, crear/actualizar previsión de cobro según días del cliente. Mostrar factura, fecha, vencimiento, importe, retenciones, cobrado y saldo.
8. **Cobranza**: registrar cobros parciales/totales, fecha real, medio, referencia bancaria, retenciones discriminadas y observaciones. Nunca alterar el total fiscal de una factura ya emitida.
9. **Cierre**: cuando cobrado + retenciones = total a cobrar, marcar cobrado y conservar trazabilidad.

## Comprobantes y ajustes
- Factura A (1), Factura B (6), FCE A (201), FCE B (206).
- Nota de Crédito A (3), Nota de Crédito B (8), FCE NC A (203), FCE NC B (208).
- Nota de Débito A (2), Nota de Débito B (7), FCE ND A (202), FCE ND B (207).
- NC/ND deben seleccionar un comprobante original compatible y enviar `CbtesAsoc` a ARCA. La interfaz no permite una NC mayor al saldo ajustable salvo autorización administrativa y motivo.
- Los ajustes modifican el saldo económico de la OT y Cobranzas, pero **no reescriben ni borran** la factura original.

## Maestro de clientes
Guardar por cliente: razón social, CUIT, condición IVA, tipo de comprobante sugerido, días de pago, emails de facturación/cobranzas, requiere OC, portal/procedimiento de carga, referencias obligatorias, observaciones administrativas y estado activo. Valores conocidos: Farmacity 30 días; Coppel 45 días.

## Estados visibles
`Por facturar` → `Preparada` → `Emitiendo` → `Autorizada ARCA` → `PDF pendiente/archivado` → `Envío pendiente/enviado` → `Por cobrar` → `Parcialmente cobrado` → `Cobrado`.
Estados de excepción: `Rechazada ARCA`, `Revisión requerida`, `Drive pendiente`, `Email fallido`, `Vencida`, `Disputada`.

## Dashboard del puesto
- Hoy: facturas a emitir, pendientes de PDF, pendientes de envío, cobranzas previstas, vencidas y tareas administrativas.
- Semana: a facturar, facturado neto/IVA/total, a cobrar, cobrado, retenciones y desvío contra previsión.
- Mes: ventas facturadas, cobranzas, deuda vencida, antigüedad de saldos, retenciones y NC/ND emitidas.
- Alertas: CAE autorizado sin PDF, factura sin enviar, factura vencida, cliente sin CUIT/IVA, diferencias cotización↔OT↔cobranzas, emisión en revisión y pagos sin imputar.

## Seguridad y auditoría
- Sólo usuarios incluidos en `ARCA_ALLOWED_EMAILS` pueden emitir.
- Roles recomendados: `facturacion`, `cobranzas`, `admin`. Facturación puede preparar/emitir; Cobranzas registra cobros; Admin puede NC/ND, correcciones de maestro y excepciones.
- Nunca guardar certificados ni claves ARCA en frontend/Firestore/repositorio; sólo Secret Manager.
- Registrar `operador`, timestamps, idempotency key, comprobante asociado y motivo de ajustes.

## Configuración requerida para despliegue
Secret `TIZ_FACTURAS_2026_FOLDER_ID=1XYk0vAIsGZCAiJ4s7TGyQYJdVBYvYdGy` y acceso de la service account de Firebase a esa carpeta. También completar `ARCA_ISSUER_RAZON_SOCIAL`, `ARCA_ISSUER_DOMICILIO` y `ARCA_ISSUER_CONDICION_IVA` para el PDF.

## Regla de despliegue
Primero validar en rama. Desplegar backend sólo después de probar sintaxis, permisos de Drive y una consulta no emisora a ARCA. La primera emisión de cada nuevo tipo de comprobante debe hacerse controlada y verificarse en ARCA antes de habilitar uso masivo.
