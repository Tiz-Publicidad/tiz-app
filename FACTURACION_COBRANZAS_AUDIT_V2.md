# TIZ — Auditoría integral Facturación y Cobranzas V2

Fecha de inicio: 2026-09-21
Rama de trabajo: `codex/facturacion-cobranzas-audit-v2`
Base: `main@1c4696d627659148ecacb343a10fec0cc72aa9b8`

## Objetivo

Convertir Facturación y Cobranzas en un puesto operativo completo, estable y auditable, manejable por una sola persona sin depender de planillas paralelas ni de entrar a ARCA para la operación cotidiana.

El flujo objetivo es:

`Presupuesto aprobado → Para facturar → Emitir ARCA → PDF/Drive → Enviar → Por cobrar → Cobros/retenciones → Histórico`

Una OT es la unidad principal. Anticipos, saldos, facturas, cobros, retenciones y notas son movimientos hijos de esa OT; nunca deben generar OTs duplicadas.

## Reglas operativas confirmadas

- Punto de venta electrónico: **00009**.
- Integración fiscal real: ARCA producción.
- Soportar Factura A, Factura B y FCE A/B.
- Condición frente al IVA del receptor por cliente.
- IVA sugerido 21%, editable: exento, 0%, 2,5%, 5%, 10,5%, 21%, 27% según corresponda.
- Facturación parcial por porcentaje: anticipo, etapas intermedias y saldo.
- Una OT puede tener varias facturas.
- Nunca emitir por encima del saldo pendiente.
- PDF fiscal debe archivarse en la carpeta general **2026 Facturacion**, no en la carpeta de la OT.
- Luego de emitir: registrar CAE, número, fecha, porcentaje, neto, IVA, total, saldo pendiente y estado de envío.
- Envío de factura: enviar ahora o sólo facturar; recordar destinatarios por cliente.
- Si una factura queda sin enviar, debe aparecer como tarea.
- Cobranzas debe mostrar vencimientos, vencidas, próximas, pagos parciales, retenciones, fecha prevista, días de pago y próximo seguimiento.
- Farmacity: 30 días. Coppel: 45 días.
- Al marcar una cuenta como Cobrado debe salir de Por cobrar y pasar a Histórico.
- Para facturar sólo muestra saldo realmente no facturado.
- Por cobrar sólo muestra facturas efectivamente emitidas con saldo de cobro.
- Estados históricos del Excel deben respetarse sin confundir anticipo/saldo con dos OTs.
- Cliente y estado editables desde Obras y Presupuestos.
- OT ordenadas por primeros 4 dígitos descendente, sin ceros a la izquierda.
- Mantener indicador de facturación en Obras con número de factura.

## Hallazgos críticos iniciales

### 1. Demasiados propietarios de la misma UI

Hoy `window.renderCobranzas` es envuelta/reemplazada por múltiples archivos:

- cobranzasIndicadorEnvioV100.js
- cobranzasCompatFacturasV102.js
- cobranzasCompatPresupuestosV103.js
- cobranzasGestionUnificadaV104.js
- cobranzasFuenteUnicaV106.js
- tizAprobadasFacturacionV66.js

Esto hace que el comportamiento dependa del orden de carga y explica regresiones donde una corrección válida queda anulada por otro módulo.

**Acción V2:** un solo propietario de render y navegación. Los demás módulos deben convertirse en adaptadores puros o retirarse de la cadena activa.

### 2. Guardado de Presupuestos también tiene múltiples wrappers

`window.guardarPresupuestoCompleto` aparece en:

- sectorizacionV35.js
- tizFixCotizacionesV65.js
- driveFolderNameSyncV110.js
- baseMadreSyncV111.js / V115

Esto repite el mismo problema: efectos secundarios de Drive, Base Madre, promoción a Obra y generación de archivos se ejecutan según orden de carga.

**Acción V2:** el guardado debe emitir un único evento/acción transaccional; los efectos secundarios se ejecutan desde una capa de acciones explícita.

### 3. Cobranzas modifica datos durante render

`cobranzasFuenteUnicaV106.js` y `cobranzasEstabilidadV105.js` reconcilian, crean/actualizan Obras y normalizan facturas mientras se renderiza o refresca la UI.

Eso puede producir:
- loops de sincronización;
- escrituras repetidas;
- estados que cambian solos;
- alertas repetidas;
- resultados distintos según timing.

**Acción V2:** render 100% de sólo lectura. Migraciones/reconciliaciones sólo en tareas explícitas e idempotentes.

### 4. Existen facturas históricas hardcodeadas

`cobranzasFuenteUnicaV106.js` contiene una tabla `HIST` con OTs/facturas concretas.

**Acción V2:** eliminar hardcodes operativos. Todo histórico debe venir de Firestore/migración auditable.

### 5. ARCA backend es una base sólida

`functions/arcaProduccionGeneral.js` ya contiene controles importantes:

- autenticación Firebase + lista de operadores permitidos;
- PV fijo 9;
- CUIT y condición IVA;
- tipos 1, 6, 201, 206;
- validación de IVA;
- idempotency key;
- lock por punto de venta/tipo;
- FECompUltimoAutorizado;
- CAE real;
- bloqueo de neto superior al saldo;
- registro en `facturasArca`, `finanzas`, `nrfc`, `ffc`.

No se reescribe salvo defectos fiscales concretos encontrados en pruebas.

### 6. Modelo financiero está parcialmente duplicado

Actualmente una factura puede aparecer simultáneamente en:
- facturaArca
- facturasArca
- comprobantesArca
- nrfc / ffc
- finanzas.anticipo
- finanzas.saldo
- sectores.facturacion
- facturasManual

Esto obliga a deduplicar constantemente y provoca saldos incorrectos.

**Acción V2:** definir un modelo canónico de movimientos y un adaptador de lectura legacy. Las nuevas escrituras sólo se hacen al modelo canónico y campos mínimos de compatibilidad.

## Arquitectura objetivo

### A. Data adapter
Responsable de leer Firestore/legacy y devolver:

- OT
- presupuesto aprobado
- total aprobado
- facturas[]
- total facturado
- saldo por facturar
- cobros[]
- retenciones[]
- total cobrado
- saldo por cobrar
- vencimientos
- estado de envío
- seguimiento
- alertas

Sin escribir datos.

### B. Actions
Única capa autorizada a escribir:

- emitir factura ARCA
- registrar factura histórica/manual
- enviar/reintentar email
- archivar/reintentar PDF Drive
- registrar cobro
- registrar retención
- actualizar días/fecha de pago
- registrar seguimiento
- marcar cierre histórico

Todas idempotentes y con mensajes de error concretos.

### C. UI
Un solo módulo propietario:

- Dashboard
- Para facturar
- Por cobrar
- Retenciones
- Histórico
- Alertas
- Configuración

### D. Auditoría
Cada movimiento importante guarda:
- usuario
- timestamp
- operación
- OT
- factura afectada
- valores antes/después cuando corresponda

## Puesto operativo — dashboard requerido

El operador debe entrar y saber inmediatamente:

1. qué debe facturar hoy;
2. qué facturas emitidas faltan enviar;
3. qué vence esta semana;
4. qué está vencido;
5. qué cobros fueron prometidos para hoy;
6. qué clientes requieren seguimiento;
7. cuánto se proyecta cobrar por semana y por mes;
8. cuánto se facturó/cobró/retuvo;
9. qué errores operativos necesitan intervención.

## Reportes requeridos

- Facturación por semana/mes.
- Cobranza por semana/mes.
- Proyección 8 semanas.
- Vencimientos.
- Vencidas.
- Retenciones.
- Facturado vs cobrado.
- Saldo por facturar.
- Saldo por cobrar.
- Por cliente.
- Por OT.
- Facturas sin enviar.
- PDFs pendientes de Drive.
- Seguimientos vencidos.
- Exportación Excel/PDF.

## IA / asistencia operativa

La IA no debe tomar decisiones fiscales ni emitir sola.

Puede ayudar a:
- priorizar cobranzas por vencimiento, monto e historial;
- detectar facturas sin enviar;
- detectar saldos incoherentes;
- detectar OT aprobada sin factura;
- detectar factura emitida sin PDF/Drive;
- detectar cobro prometido sin seguimiento;
- resumir agenda diaria;
- sugerir próximos contactos;
- explicar anomalías al operador.

Toda acción irreversible (emitir ARCA, enviar factura, marcar cobrado) requiere acción humana explícita.

## Matriz mínima de pruebas punta a punta

### Flujo 1 — factura total
Aprobado → Para facturar → Factura ARCA PV 00009 → CAE → PDF → Drive → email → Por cobrar → cobro total → Histórico.

### Flujo 2 — anticipo 50% + saldo 50%
Aprobado → emitir 50% → saldo por facturar 50% → cobrar anticipo → emitir saldo → cobrar saldo → Histórico.

### Flujo 3 — tres etapas
30% + 20% + 50%, sin duplicar OT ni inflar saldos.

### Flujo 4 — factura emitida, email pendiente
Debe quedar en alerta y permitir reintento sin volver a emitir ARCA.

### Flujo 5 — PDF/Drive falla luego de CAE
Nunca reemitir. Recuperar/archivar PDF de la factura ya autorizada.

### Flujo 6 — cobro parcial
Por cobrar debe mostrar saldo exacto y mantener la misma factura.

### Flujo 7 — retención
Retención reduce saldo de cobranza sin alterar neto facturado.

### Flujo 8 — histórico previo al sistema
Factura y cobro histórico se muestran sin intentar reemitir.

### Flujo 9 — anticipo/saldo histórico en dos renglones
Consolidar en una sola OT con movimientos parciales.

### Flujo 10 — FCE
Validar tipo, vencimiento de pago y referencia correspondiente según requisitos ARCA.

## Criterio de finalización

No se considera terminado por “se ve bien”.

Debe pasar:
1. sintaxis;
2. tests de datos;
3. tests de acciones;
4. deploy preview aislado;
5. smoke test de los flujos anteriores;
6. prueba real controlada de ARCA;
7. prueba real de Drive/email;
8. comparación de saldos esperados vs Firestore;
9. recién entonces PR/merge a main.

## Política de rama

- Todo este trabajo se hace en `codex/facturacion-cobranzas-audit-v2`.
- No tocar `main` mientras dure la auditoría integral.
- No publicar cambios parciales de Facturación/Cobranzas en producción.
- ARCA producción no se invoca en pruebas automáticas.


## Hallazgos P0/P1 agregados tras revisar el historial y el código

### P0 — múltiples owners de Cobranzas
Además de la documentación anterior, se confirmó que varias capas siguen reemplazando o envolviendo `window.renderCobranzas` y `window.setCobTab`. Este patrón es una causa directa de regresiones, pantallas inconsistentes y fixes que dejan de surtir efecto según el orden de carga.

**Regla V2:** un único renderer activo. Los módulos legacy pueden seguir existiendo para rollback, pero no formar parte del loader productivo del módulo nuevo.

### P0 — escrituras dentro del render
`cobranzasFuenteUnicaV106.js` ejecuta reconciliaciones y escrituras de Firestore desde hooks asociados a render/refresco. Esto puede generar loops, alertas repetidas, cambios de estado no solicitados y resultados dependientes del timing.

**Regla V2:** render = sólo lectura. Las reparaciones de datos deben ser comandos/migraciones explícitos, idempotentes y auditables.

### P0 — hardcodes operativos
Se detectaron facturas históricas concretas hardcodeadas dentro de runtime productivo.

**Regla V2:** no debe existir ninguna factura/OT específica en lógica general. Todo histórico entra por migración o datos persistidos.

### P0 — FCE y vencimiento de pago
El backend ARCA productivo construye `FchVtoPago` para 201/206 usando la fecha del comprobante. Debe revisarse con los días de pago reales del cliente/operación antes de considerar la FCE validada para producción.

### P1 — notas de crédito/débito
El backend actual soporta 1, 6, 201 y 206. Si se incorporan NC/ND, deben implementarse como flujos separados, con comprobante asociado obligatorio y pruebas fiscales propias. No se agregan sólo por UI.

### P1 — post-CAE
PDF, Drive y email son pasos posteriores a la autorización fiscal. Si alguno falla:
- no reemitir;
- recuperar la factura autorizada;
- reintentar PDF/Drive/email sobre la misma FC;
- mostrar tarea pendiente al operador.

### P1 — modelo financiero duplicado
Hoy una factura puede aparecer en varios campos legacy. La rama `codex/cobranzas-redesign-v1` ya tiene un adaptador V1.3 que deduplica por PV+número/CAE y es una mejor base que seguir extendiendo V100–V106.

## Errores y fricciones históricas que V2 debe evitar

Del trabajo de esta conversación se incorporan como casos obligatorios:

- Error Firebase `No Firebase App '[DEFAULT]' has been created` al intentar emitir.
- Facturación desde PV incorrecto: se fija **PV 00009**.
- Obras sin factura apareciendo en `Por cobrar`.
- Obras realmente pendientes de factura faltando en `Para facturar`.
- Estados históricos del Excel no respetados.
- Anticipo/saldo históricos tratados como dos OT cuando deben ser una sola OT con movimientos.
- Facturas emitidas sin PDF de Drive visible.
- Factura emitida pero no enviada sin indicador claro.
- Riesgo de reemitir cuando ARCA pudo haber autorizado pero falló el paso siguiente.
- Pantalla negra/owners duplicados de Facturación y Cobranzas.
- Estados que entran en loop o cambian solos.
- Alertas repetidas de sincronización.
- Datos de cliente incompletos: CUIT, condición IVA, email, días de pago.
- Necesidad de editar cliente/estado desde Obras y Presupuestos.
- Reportes y dashboards que no reflejan saldos reales.
- Necesidad de búsqueda por OT, cliente, descripción y factura.
- Históricos previos al sistema que no deben contaminar la cola operativa.
- Necesidad de un verdadero puesto de operador, no sólo una tabla.

## Reutilización recomendada

Tomar como base la arquitectura ya desarrollada en `codex/cobranzas-redesign-v1`:

- `facturacionCobranzasDataV1.js`
- `facturacionCobranzasActionsV1.js`
- `facturacionCobranzasUIV1.js`

Esa rama ya implementa el enfoque correcto:
- adaptador canónico;
- UI única;
- acciones separadas;
- una OT como fila principal;
- facturas/cobros como movimientos;
- conciliación de fuentes legacy.

La auditoría V2 debe portar lo útil a una rama fresca basada en el `main` actual, revisar diferencias y evitar traer de vuelta wrappers o hacks descartados.


## Regla central de gestión: los comprobantes nunca desaparecen

El módulo no debe usar el texto de estado como fuente de navegación. Una factura autorizada o registrada es un movimiento permanente de la OT y debe seguir visible en:
- detalle de la OT;
- histórico de comprobantes;
- búsqueda global;
- reportes.

Cambiar el estado operativo no borra, reemplaza ni oculta movimientos existentes.

### Estado operativo canónico

El estado se deriva de movimientos reales:

1. **Pendiente de facturación**: saldo por facturar > 0 y no hay facturación completa.
2. **Facturado parcial**: existe factura y queda saldo por facturar.
3. **Facturado**: saldo por facturar = 0 y queda saldo por cobrar.
4. **Cobrado pendiente**: existe cobro/retención parcial y queda saldo por cobrar.
5. **Cobrado**: saldo por cobrar = 0.
6. **Histórico**: cierre administrativo; conserva todos los movimientos.

La interfaz puede permitir una acción del operador para cambiar/confirmar gestión, pero debe validar consistencia:
- no permitir marcar "Facturado" si no existe factura;
- no permitir marcar "Cobrado" si queda saldo por cobrar, salvo cierre excepcional explícito y auditado;
- no permitir volver a "Pendiente de facturación" borrando facturas existentes;
- para corregir una factura se usa NC/ND o ajuste histórico explícito, nunca se oculta el comprobante.

### Vista "Todas las OT"

Debe existir una vista maestra independiente de las colas operativas. Sirve para buscar cualquier OT y ver:
- estado operativo;
- facturas;
- cobros;
- retenciones;
- saldo por facturar;
- saldo por cobrar;
- vencimiento;
- estado de envío;
- próxima gestión.

Así una OT puede salir de una cola porque completó una etapa, pero nunca desaparecer del módulo.
