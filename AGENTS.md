# AGENTS.md — TIZ App

## Objetivo
Evolucionar TIZ App gradualmente hacia un sistema operativo interno que reduzca carga administrativa, anticipe problemas y reutilice el histórico, sin reescribir la aplicación ni romper compatibilidad.

## Reglas de trabajo
- No modificar `main` directamente.
- Trabajar en ramas y abrir Pull Request contra `main`.
- No mergear sin aprobación explícita de TIZ.
- Inspeccionar y reutilizar código existente antes de crear módulos paralelos.
- Mantener compatibilidad con datos históricos durante las migraciones.
- No desplegar reglas de Firestore sin compararlas con las reglas efectivamente desplegadas.

## Principio de producto
Cualquier dato que se le pida cargar a una persona debe devolver más tiempo o control del que consume.

## Seguridad y permisos
- Separar persona, rol y capacidad. Evitar hardcodear personas en lógica de negocio.
- Migrar gradualmente desde `role` único a `roles: []` + capacidades.
- Producción no debe recibir precio de venta, descuentos, margen, rentabilidad ni información comercial sensible.
- Ocultar campos en UI no es una barrera de seguridad suficiente; la separación debe resolverse también en modelo, consultas y reglas.

## Producción
- Usar `Trabajos pendientes`; no usar `cola de producción`.
- Priorizar pendientes, bloqueos, motivos, dependencias, materiales, proveedores, fechas, prioridades y terminados.
- Evitar inicialmente fichaje detallado de horas, Gantt complejo o burocracia extra.
- Una OT sigue siendo una OT; puede tener múltiples tareas/frentes y dependencias no lineales.
- Máquinas, recursos y operadores deben ser configurables.

## Copiloto TIZ
Primera etapa: IA observa → IA sugiere → persona confirma → app ejecuta.
Las primeras sugerencias pueden ser determinísticas e históricas antes de integrar un LLM.
Nunca enviar información comercial sensible a copilotos de Producción.

## Datos y auditoría
- Aprovechar `obras` y la sectorización canónica existente mientras se migra.
- Guardar auditoría útil al incorporar acciones nuevas.
- Cada interacción útil debería generar histórico estructurado con la menor carga humana posible.

## Validación antes de PR
- Navegación y autenticación existentes deben seguir funcionando.
- El tablero nuevo debe tolerar obras históricas con campos faltantes.
- No debe aparecer información comercial sensible en Producción.
- Cambios de seguridad no verificados contra Firebase productivo deben quedar documentados como DRAFT.
