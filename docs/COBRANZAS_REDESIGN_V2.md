# TIZ — Rediseño Facturación y Cobranzas V2

Fecha: 2026-09-16
Rama: `codex/cobranzas-redesign-v2`

## Objetivo
Reconstruir Facturación y Cobranzas como un módulo operativo único y estable para que una persona pueda trabajar todos los días sin conocer la historia técnica de la app.

La integración fiscal existente con ARCA, PDF/Drive y envío de correo se conserva y se desacopla de la nueva UI.

## Problema actual
La pantalla actual está compuesta por múltiples scripts históricos que redefinen `renderCobranzas`, `setCobTab`, estados y reconciliaciones. La misma OT puede leerse desde `obras`, `presupuestos`, `finanzas`, `facturaArca`, `facturasArca`, `comprobantesArca`, `nrfc`, sectores y parches específicos. Eso hace que el resultado dependa del orden de carga.

V2 elimina esa arquitectura de capas para el módulo nuevo: un adaptador de datos, un modelo normalizado y un renderer.

## Principios operativos
1. Una OT es la unidad operativa principal.
2. Una OT puede tener cero, una o varias facturas.
3. Una factura puede tener cero, uno o varios cobros/retenciones.
4. Facturado y cobrado son dimensiones distintas.
5. Nunca se infiere que una factura desapareció porque falta un campo moderno: todo dato histórico reconocido se normaliza.
6. Una cotización aprobada debe aparecer inmediatamente en `Para facturar`, aun si todavía falta materializar su documento de Obra.
7. ARCA sólo emite. La UI decide qué corresponde facturar; ARCA no decide el estado operativo.
8. Ninguna factura autorizada se reemite por fallas de PDF, Drive o email.

## Fuente de verdad V2
### Entrada
- `DB.presupuestos`: origen de trabajos aprobados pendientes de facturación.
- `DB.obras`: datos operativos, vínculo con presupuesto y datos históricos.
- datos fiscales históricos dentro de la obra (`facturaArca`, `facturasArca`, `comprobantesArca`, `nrfc`, `finanzas.anticipo`, `finanzas.saldo`, sector Facturación).

### Modelo normalizado en memoria
Cada OT se transforma en:

```js
{
  ot,
  obraId,
  presupuestoId,
  cliente,
  descripcion,
  totalAprobado,
  condicionPagoDias,
  requiereOC,
  oc,
  facturas: [
    {
      id,
      numero,
      fecha,
      tipo,
      cae,
      neto,
      iva,
      total,
      origen: 'arca' | 'manual' | 'historica',
      enviada,
      pdfUrl,
      vencimiento,
      estado
    }
  ],
  cobros: [
    {fecha, importe, retenciones, medio, referencia, observaciones}
  ],
  totalFacturado,
  saldoPorFacturar,
  totalCobrado,
  totalRetenciones,
  saldoPorCobrar,
  proximoVencimiento,
  diasVencido,
  estadoFacturacion,
  estadoCobranza,
  alertas: []
}
```

No se escribe este objeto completo en Firestore: es una vista normalizada derivada de las fuentes existentes. Las nuevas operaciones sí se guardan en estructuras canónicas.

## Estructura canónica nueva
Para nuevas facturas y cobros:

- `obras/{obraId}/facturas` se representa dentro del documento como `facturasV2[]` mientras TIZ siga usando documentos simples.
- `cobrosV2[]` para cobros y retenciones.
- Los campos ARCA originales se conservan por compatibilidad.
- Se mantiene una función de lectura de legado, pero no parches por OT ni por número de factura.

## Pantallas

### 1. Dashboard
No es un tablero decorativo. Debe responder qué tiene que hacer la operadora hoy.

Fila 1 — trabajo pendiente:
- Por facturar: cantidad + importe.
- Facturas sin enviar.
- Cobros esperados esta semana.
- Vencidos: cantidad + importe.

Fila 2 — flujo de caja:
- Facturado esta semana.
- Cobrado esta semana.
- Retenciones esta semana.
- Desvío: previsto vs cobrado.

Bloques de acción:
- `Requieren facturación hoy`.
- `Vencen en 7 días`.
- `Vencidas`.
- `Problemas / datos faltantes`.

Cada elemento debe abrir directamente la OT correspondiente.

### 2. Para facturar
La lista nace de la unión `presupuestos aprobados + obras`, no de `DB.obras` sola.

Columnas:
- OT
- Cliente / descripción
- Total aprobado
- Ya facturado
- Saldo por facturar
- Condición de pago
- CUIT / IVA
- OC / referencia
- Alerta
- Acción

Estados de fila:
- Lista para facturar
- Facturación parcial
- Datos faltantes
- Bloqueada / revisar

Acción primaria:
- `Facturar`
- `Facturar saldo`

Acciones secundarias:
- Gestionar datos
- Ver facturas existentes

Una OT desaparece de esta cola sólo cuando `saldoPorFacturar <= 0`.

### 3. Por cobrar
La unidad principal es la OT pero se muestra claramente su composición por facturas.

Columnas:
- OT
- Cliente / obra
- Facturas
- Total facturado
- Cobrado
- Retenciones
- Saldo a cobrar
- Próximo vencimiento
- Antigüedad
- Estado
- Acción

Filtros:
- Todos
- A vencer
- Vencidos
- Pago parcial
- Cobrados
- Sin fecha

Indicadores:
- Punto amarillo: factura emitida con envío pendiente.
- Punto verde: factura enviada.
- Estado de cobranza separado del punto de envío.

### 4. Panel de gestión de OT
Un único panel lateral con pestañas:

#### Facturas
- listado de todas las facturas de la OT
- ARCA/manual/histórica
- fecha, número, neto, IVA, total
- PDF
- enviada/no enviada
- agregar factura manual
- emitir saldo con ARCA

#### Cobros
- registrar cobro
- fecha
- importe
- medio
- referencia
- retenciones discriminadas
- permite cobros parciales

#### Seguimiento
- fecha comprometida
- próximo contacto
- nota de gestión
- responsable
- estado: por llamar / prometió pago / observado / disputa / esperando OC, etc.

#### Resumen
- aprobado
- facturado
- por facturar
- cobrado
- retenciones
- por cobrar

## Dashboard de aging
Buckets estándar:
- Vigente
- 1–30 días vencido
- 31–60
- 61–90
- 90+

Debe poder filtrar por cliente y ordenar por importe o antigüedad.

## Reglas de negocio
- `saldoPorFacturar = totalAprobado - totalFacturadoNeto`.
- `saldoPorCobrar = totalFacturadoTotal - cobros - retenciones - notasDeCredito`.
- Facturar no implica cobrar.
- Enviar una factura no implica cobrar.
- Registrar un cobro no modifica el total fiscal.
- Las retenciones reducen el saldo financiero pero se muestran separadas del efectivo cobrado.
- Anticipo y saldo son facturas/movimientos dentro de la misma OT, nunca filas duplicadas de OT.

## ARCA — preservar
Se mantienen sin reescritura funcional:
- `facturacionProduccionV67.js` como interfaz temporal de emisión.
- endpoint `arcaProduccionEmitirGeneral`.
- secretos/certificados.
- idempotencia y locks.
- CAE, numeración y validaciones fiscales.
- PDF/Drive y envío existentes.

V2 sólo llamará al facturador con `obraId` e importe calculado.

## Qué queda fuera del módulo nuevo
No se cargan ni se ejecutan dentro de V2 los renderers/parches históricos de Cobranzas (V69, V70, V71, V72, V73, V74, V75, V76, V98, V100, V101, V102, V103, V104, V105, V106). Permanecen en la rama de backup para referencia y migración, pero no gobiernan la UI nueva.

## Migración
1. Leer todas las obras y presupuestos sin escribir cambios.
2. Generar reporte de inconsistencias: aprobada sin obra, obra sin presupuesto, factura sin total, factura duplicada, cobro sin factura, etc.
3. Construir modelo V2 en memoria.
4. Comparar totales V2 con datos actuales.
5. Sólo después persistir campos canónicos nuevos; nunca borrar el legado durante la primera etapa.

## Validación mínima antes de publicar
Casos obligatorios:
- una cotización nueva aprobada aparece en `Para facturar` sin recargar manualmente;
- OT 4680 conserva factura `00009-00000001`;
- una factura histórica/manual sin CAE aparece en `Por cobrar`;
- una OT con anticipo muestra facturado parcial + saldo por facturar;
- cobro parcial reduce saldo por cobrar pero no saldo por facturar;
- cambio de estado de envío actualiza punto amarillo/verde;
- una OT 100% facturada sale de `Para facturar`;
- una OT 100% cobrada queda accesible en Histórico/Cobrados;
- ninguna prueba emite ARCA salvo acción explícita del operador.

## Estrategia de despliegue
- No tocar `main` durante la reconstrucción.
- Probar en `codex/cobranzas-redesign-v2` con preview aislado.
- Mantener rama `backup/cobranzas-pre-redesign-20260916` como fotografía del estado previo.
- Recién integrar a `main` cuando los casos anteriores pasen con datos reales.
