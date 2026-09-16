# TIZ App — Rediseño Facturación y Cobranzas V1

## Objetivo
Reconstruir el módulo de Facturación y Cobranzas para que un operador administrativo pueda trabajar todos los días sin depender de lógica heredada, loaders por versión ni parches visuales.

Se preserva la integración ARCA ya operativa. El rediseño reemplaza la lógica de cola, estados, facturas, cobros, dashboards y lectura de datos.

## Problema actual
El módulo actual fue creciendo mediante capas que envuelven funciones globales (`renderCobranzas`, `setCobTab`) y normalizan datos en distintos momentos. Hay múltiples fuentes para una misma verdad: `DB.cobranzas`, `DB.obras`, `presupuestos`, `facturaArca`, `facturasArca`, `comprobantesArca`, `nrfc`, `finanzas`, `sectores.facturacion` y `gestionSectores.facturacion`.

Consecuencias observadas:
- el resultado cambia según el orden de carga de scripts;
- una factura puede aparecer o desaparecer según qué renderer quede activo;
- una obra aprobada puede no entrar en “Para facturar” si no fue promovida previamente a `DB.obras`;
- facturas históricas/manuales y ARCA no comparten una representación única;
- una misma OT puede necesitar anticipo y saldo, pero la UI mezcla “facturado” con “cobrado”;
- el operador no tiene una cola clara de trabajo ni prioridades;
- los smoke tests actuales comprueban archivos/strings, no el comportamiento real de negocio.

## Principios del rediseño
1. Una sola fuente normalizada en memoria.
2. Un solo renderer dueño de Facturación y Cobranzas.
3. Ningún wrapper encadenado sobre `renderCobranzas`.
4. Facturación y cobranza son estados separados.
5. Una OT = una fila principal; facturas y cobros son movimientos hijos.
6. Anticipo y saldo se registran como movimientos, no como filas duplicadas.
7. “Para facturar” nace de presupuestos aprobados, no de una lista de obras previamente sincronizada.
8. “Por cobrar” nace de facturas emitidas/manuales con saldo pendiente, no del estado textual de la OT.
9. Las facturas históricas no se hardcodean por número; se importan/normalizan de cualquier campo heredado.
10. ARCA es un servicio de emisión, no la fuente de navegación del módulo.

## Modelo canónico propuesto

### workItem
Representa la OT / presupuesto aprobado.

Campos mínimos:
- `obraId`
- `presupuestoId`
- `ot`
- `clienteId`
- `clienteNombre`
- `descripcion`
- `importeAprobado`
- `estadoObra`
- `diasPago`
- `requiereOC`
- `oc`
- `fechaAprobacion`

### invoice
Una OT puede tener 0..N facturas.

Campos mínimos:
- `id`
- `obraId`
- `ot`
- `origen`: `arca | manual | historica`
- `tipoParte`: `anticipo | saldo | total | otro`
- `porcentaje`
- `neto`
- `iva`
- `total`
- `numeroCompleto`
- `cbteTipo`
- `cae`
- `fechaEmision`
- `fechaVencimientoPago`
- `driveFileId`
- `driveUrl`
- `estadoEnvio`: `pendiente | enviado`
- `emailUltimoEnvioAt`

### payment
Una factura puede tener 0..N cobros.

Campos mínimos:
- `id`
- `obraId`
- `invoiceId`
- `fecha`
- `importe`
- `medio`
- `referencia`
- `retenciones`
- `observaciones`

## Cálculos derivados
No se guardan como estados arbitrarios; se calculan.

- `facturado = suma(invoice.neto o total según criterio definido)`
- `porFacturar = max(0, importeAprobado - facturado)`
- `cobrado = suma(payment.importe + retenciones computables)`
- `porCobrar = max(0, totalFacturado - cobrado)`
- `facturacionEstado = sin_facturar | parcial | completa`
- `cobranzaEstado = no_cobrado | parcial | cobrado | vencido`

## Pantallas

### 1. Dashboard
Debe responder: “¿Qué tiene que hacer hoy el operador?”

Bloques:
- Para facturar hoy
- Facturas emitidas pendientes de envío
- Cobros previstos esta semana
- Vencidas / reclamar
- Cobros ingresados esta semana
- Retenciones pendientes de cargar/revisar

KPIs secundarios:
- Total por facturar
- Total por cobrar
- Vencido
- Cobrado del mes
- Facturado del mes

### 2. Para facturar
Fuente: unión canónica de presupuestos aprobados + facturas existentes.

Columnas:
- OT
- Cliente / obra
- Presupuesto aprobado
- Facturado
- Por facturar
- Tipo sugerido (`Total`, `Anticipo`, `Saldo`)
- OC / datos requeridos
- CUIT / condición IVA
- Días de pago
- Acción

Estados visuales:
- gris: no facturado
- amarillo: facturación parcial
- verde: facturación completa
- rojo: faltan datos obligatorios

Acciones:
- Facturar
- Facturar saldo
- Registrar factura manual
- Ver detalle

### 3. Por cobrar
Fuente: facturas emitidas/manuales con saldo pendiente.

Una fila por OT, con resumen de movimientos.

Columnas:
- OT
- Cliente / obra
- Presupuesto
- Facturación
- Cobranza
- Saldo a cobrar
- Próximo vencimiento
- Estado
- PDF
- Acción

Indicadores:
- punto facturación: gris / amarillo / verde
- punto cobranza: gris / amarillo / verde / rojo

### 4. Panel lateral de gestión
Al abrir una OT:
- encabezado con OT, cliente, descripción y presupuesto
- pestaña Facturas: todas las facturas de la OT
- pestaña Cobros: todos los cobros
- pestaña Resumen: presupuesto, facturado, por facturar, cobrado, retenciones, por cobrar

Acciones:
- registrar factura manual
- emitir ARCA
- registrar cobro
- registrar retenciones
- cambiar estado de envío
- enviar/re-enviar factura

### 5. Histórico
No es una cola operativa. Es consulta.
Filtros por OT, cliente, factura, fecha, estado, enviado/no enviado, cobrado/no cobrado.

## Referencias de producto
Patrones tomados como referencia:
- Odoo: pago parcial mantiene la factura abierta y muestra saldo pendiente; la conciliación de pago es independiente de la emisión.
- Xubio: “Cuentas a cobrar” muestra comprobantes no cancelados o parcialmente cancelados; el cobro se registra desde el comprobante y permite importe parcial.
- Colppy: contempla el caso crítico de facturas que existen en ARCA pero no quedaron registradas localmente, con una acción explícita de recuperación en lugar de reemitir.

Aplicación a TIZ:
- mantener la factura abierta si el pago es parcial;
- no cambiar “por cobrar” al emitir, sólo al registrar cobro;
- separar estado de envío de estado de cobranza;
- incluir una futura acción “Recuperar desde ARCA” para detectar comprobantes autorizados no registrados localmente y evitar duplicados.

## Estrategia técnica

### Fase A — Congelar lo actual
No modificar `main` mientras se construye este módulo.
Trabajo en `codex/cobranzas-redesign-v1`.

### Fase B — Adaptador de datos único
Crear `facturacionCobranzasDataV1.js`.
Responsabilidad única: leer estructuras antiguas y devolver:
- workItems
- invoices
- payments

No modifica DOM.
No envuelve renderers.
No hardcodea facturas específicas.

### Fase C — UI única
Crear `facturacionCobranzasUIV1.js`.
Único dueño de:
- tabs
- tablas
- filtros
- panel lateral
- estados visuales

### Fase D — Acciones
Crear `facturacionCobranzasActionsV1.js`.
Responsable de:
- factura manual
- cobro
- retenciones
- cambios de estado de envío
- invocar emisión ARCA existente

### Fase E — Migración controlada
Al activar el nuevo módulo:
- no borrar campos históricos;
- leerlos mediante el adaptador;
- escribir nuevos movimientos sólo en el esquema canónico;
- migrar gradualmente registros antiguos;
- mantener un reporte de registros no reconocidos.

### Fase F — Validación real
El preview no se aprueba por strings ni loaders.
Casos mínimos obligatorios:
1. presupuesto aprobado nuevo aparece en Para facturar;
2. OT sin factura muestra 100% por facturar;
3. anticipo 30% muestra 70% por facturar;
4. factura manual histórica aparece sin CAE;
5. factura ARCA aparece con CAE/PDF;
6. factura enviada cambia punto amarillo a verde;
7. cobro parcial mantiene saldo abierto;
8. cobro total lleva saldo a cero;
9. OT con dos facturas mantiene una sola fila principal;
10. ninguna factura existente desaparece entre recargas.

## Qué conservar
- backend ARCA de producción;
- emisión real y CAE;
- lógica de PDF fiscal/Drive que ya funciona;
- envío de email de factura;
- clientes, CUIT, condición IVA;
- punto de venta configurado;
- funciones de Firestore (`updateDoc_`, listeners, autenticación) que sean estables.

## Qué retirar de la cadena de Cobranzas al activar V1
Una vez validado el reemplazo, sacar del loader operativo los renderers/parches que compiten por el DOM, incluyendo las capas V100/V101/V102/V103/V104/V105/V106 y cualquier renderer histórico que envuelva `renderCobranzas` o `setCobTab`.

Los archivos se mantienen en Git para auditoría/rollback; se eliminan de la cadena activa, no necesariamente del repositorio.

## Criterio de aceptación para pasar a main
No se mezcla a `main` hasta que un operador pueda completar este flujo en preview:
1. abrir una OT aprobada nueva;
2. emitir o registrar un anticipo;
3. verla como parcial;
4. emitir saldo;
5. enviar factura;
6. registrar cobro parcial;
7. registrar cobro final/retenciones;
8. verla cerrada;
9. buscarla luego en Histórico;
10. recargar navegador y conservar exactamente el mismo estado.
