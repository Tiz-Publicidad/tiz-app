# CODEX BRIEF — TIZ Facturación y Cobranzas integral V2

Trabajar exclusivamente en la rama `codex/facturacion-cobranzas-audit-v2`.

## Contexto
Este repositorio creció mediante parches y wrappers sucesivos. No continuar ese patrón. Antes de modificar, leer:
1. `FACTURACION_COBRANZAS_AUDIT_V2.md`
2. `COBRANZAS_REDESIGN_V1.md` de la rama `codex/cobranzas-redesign-v1`
3. `functions/arcaProduccionGeneral.js`
4. `facturacionProduccionV67.js`
5. módulos V83–V106 actualmente activos en `main`.

También revisar el historial de commits recientes relacionados con facturación/cobranzas para entender regresiones y no reintroducirlas.

## Objetivo de producto
Construir un puesto completo de Facturación y Cobranzas para un operador administrativo.

Debe poder:
- ver qué facturar hoy;
- emitir factura real por ARCA PV 00009;
- facturar total o porcentajes parciales;
- manejar varias facturas por OT;
- guardar y recuperar PDF fiscal en Drive;
- enviar/re-enviar factura;
- gestionar destinatarios por cliente;
- ver por cobrar real por factura/OT;
- registrar cobros parciales/totales;
- registrar retenciones;
- manejar fechas de vencimiento y días de pago;
- registrar seguimientos;
- proyectar cobranzas por semana/mes;
- mostrar vencidas y compromisos;
- cerrar en Histórico;
- emitir reportes;
- detectar inconsistencias antes de que se conviertan en problemas.

## Restricciones críticas
- No tocar `main`.
- No invocar ARCA producción desde tests automáticos.
- No emitir una FC real como prueba sin instrucción humana explícita.
- No crear OTs duplicadas.
- No usar hardcodes de OT/factura.
- No escribir Firestore desde render.
- No encadenar wrappers de `renderCobranzas`, `setCobTab` o `guardarPresupuestoCompleto`.
- No reemitir una factura si CAE pudo haber sido autorizado.
- Preservar backend ARCA salvo defectos concretos.
- Punto de venta productivo: 00009.

## Arquitectura obligatoria
Tres capas:
1. **Data adapter** puro y de sólo lectura.
2. **Actions** para todas las escrituras e integraciones.
3. **UI owner** único.

La UI legacy debe retirarse del loader activo del preview, no necesariamente borrarse del repo.

## Base recomendada
Reutilizar y modernizar desde `codex/cobranzas-redesign-v1`:
- `facturacionCobranzasDataV1.js`
- `facturacionCobranzasActionsV1.js`
- `facturacionCobranzasUIV1.js`

Portarlos al estado actual de `main`, no hacer merge ciego de esa rama porque está atrasada.

## Flujo canónico
`Aprobado → Para facturar → ARCA → PDF/Drive → Enviar → Por cobrar → Cobros/retenciones → Histórico`

## Fuente de verdad
Una OT principal.
Hijos:
- invoices[]
- payments[]
- retentions[]
- followups[]
- delivery/email state

Legacy puede leerse mediante adaptador, pero nuevas escrituras deben concentrarse en el modelo canónico y compatibilidad mínima.

## Dashboard mínimo
- Por facturar
- Facturas sin enviar
- Por cobrar
- Vencidas
- Cobros comprometidos esta semana
- Cobrado semana/mes
- Retenciones
- Proyección 8 semanas
- Seguimientos para hoy
- Errores operativos: ARCA/Drive/email/datos incompletos

## IA
La IA puede:
- priorizar cobranzas;
- detectar anomalías;
- resumir agenda diaria;
- señalar riesgo de vencimiento;
- detectar FC sin enviar/PDF;
- sugerir seguimiento.

La IA nunca debe:
- emitir ARCA sola;
- marcar cobrado sola;
- enviar comunicaciones irreversibles sin acción humana.

## Primera fase de trabajo
Antes de reescribir:
1. Mapear todos los owners actuales de render/acciones.
2. Crear pruebas unitarias del adaptador canónico.
3. Crear fixtures representativos:
   - total 100%;
   - anticipo 50 + saldo 50;
   - 30 + 20 + 50;
   - histórica cobrada;
   - histórica parcialmente cobrada;
   - factura ARCA sin PDF;
   - factura sin enviar;
   - cobro parcial;
   - retención;
   - vencida;
   - FCE.
4. Validar cálculos de por facturar / por cobrar.
5. Portar data/actions/UI V1.3.
6. Crear preview aislado.
7. Ejecutar smoke tests.
8. Sólo después probar una operación real controlada.

## Criterio de salida
No declarar listo por apariencia. Requiere:
- tests verdes;
- preview estable;
- sin writes en render;
- sin wrappers competidores;
- ARCA/Drive/email separados e idempotentes;
- pruebas de total/parcial;
- prueba de cobro;
- prueba histórica;
- prueba de vencimiento;
- prueba de recuperación post-CAE;
- conciliación contra datos reales sin diferencias no explicadas.

Al finalizar, entregar:
- resumen de arquitectura;
- lista de archivos legacy retirados del loader;
- lista de migraciones;
- matriz de pruebas y resultados;
- riesgos pendientes;
- plan de rollback;
- PR a `main` sin merge automático.
