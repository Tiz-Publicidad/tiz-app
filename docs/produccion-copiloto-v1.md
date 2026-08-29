# Producción + Copiloto TIZ V1

## Alcance de esta PR
Primera capa visible del centro de control operativo de Producción. No reemplaza el modelo actual ni modifica reglas de Firestore.

### Vista inicial
- Producción hoy.
- Trabajos pendientes.
- Prioridad NORMAL / ALTA / URGENTE cuando el dato existe.
- Estado operativo y bloqueos cuando el dato existe.
- Operador/responsable asignado.
- Máquina/recurso cuando el dato existe.
- Fecha necesaria usando colocación/producción existente como fallback.
- Indicadores de trabajos que requieren atención, bloqueados, materiales pendientes y trabajos para máquina.
- Seguimiento de tercerizaciones preparado para datos estructurados.
- Panel Copiloto TIZ con sugerencias determinísticas.

## Reglas de sugerencia V1
Se generan alertas sin ejecutar acciones automáticas cuando se detecta, según los datos disponibles:
- trabajo bloqueado;
- fecha necesaria próxima con producción incompleta;
- falta de operador;
- diseño/archivo pendiente;
- indicios de materiales/compras pendientes;
- máquina definida sin operador.

## Compatibilidad
`sectorizacionV35Base.js` conserva exactamente el blob de `sectorizacionV35.js` que estaba en `main` al crear la rama. `sectorizacionV35.js` pasa a ser un loader pequeño que carga primero esa implementación V35 y después `produccionCopilotoV1.js`. Esto permite retirar la capa V1 sin migración destructiva.

## Seguridad
Esta V1 sólo lee datos operativos que ya están cargados en el navegador. No agrega precio de venta, margen, descuentos ni rentabilidad al tablero nuevo. Sin embargo, la app actual todavía carga `obras` como documento completo; por eso la separación real `obras` / `obraComercial` y las reglas de Firestore siguen siendo trabajo pendiente de seguridad.

## Pendiente para próximas iteraciones
- `roles: []` y capacidades centralizadas.
- Tareas/frentes de producción persistentes y auditables.
- Máquinas/recursos configurables persistentes.
- Tercerizaciones y contactos como colección/estructura formal.
- Necesidades de materiales conectadas a Stock/Compras.
- Histórico de sugerencias aceptadas/rechazadas.
- Separación física de información comercial sensible.
- Comparar cualquier DRAFT de reglas con Firebase Console antes de desplegar.
