# Calidad en TIZ

Primera versión: sección propia con Dashboard, Pendientes e Histórico y búsqueda por OT, obra, cliente, responsable o detalle. Calidad también aparece en sectores de Obras y tareas, con notas en la ficha. La ficha ya tenía un resumen de Calidad: se conserva y se enlaza al registro de liberación para salida a colocación.

## Registros

- **Anomalía:** qué ocurrió, área, categoría, gravedad, fecha, responsable y plazo de corrección. Puede estar vinculada a una OT o a una referencia interna (máquina, recepción, proceso, auditoría 5S). El cierre registra corrección y verificación, fecha real y usuario. Conserva el hallazgo original.
- **Control aleatorio:** etapa, criterio de aceptación, tamaño del lote, cantidad revisada y defectuosas, resultado y responsable. Un resultado no conforme queda pendiente de corrección. Registra un control realizado; no elige automáticamente las unidades de la muestra ni presume representatividad estadística.
- **Liberación:** OT, etapa, criterio de aceptación, responsable y resultado Liberado/Retenido. Un resultado retenido requiere seguimiento. Las OT con registros pendientes no admiten nuevas liberaciones. Liberar Salida a colocación actualiza `sectores.calidad.aprobado`; liberar Materiales, Diseño, Producción o Entrega registra esa etapa sin aprobar la salida.

Una observación nueva deja Calidad como Observado. Verificar y cerrar esa observación no libera automáticamente la OT. Estos registros no cierran la obra ni modifican producción, fechas de colocación, fotos ni cobros. Las evidencias son enlaces opcionales a archivos existentes; no se crean carpetas ni se implementa un nuevo cargador de fotos.

## Responsables iniciales

En esta versión las cuentas habituales de la app pueden registrar anomalías. Los formularios de controles, liberaciones y verificación de cierres se habilitan a Administración, Pablo y un perfil asignado a Calidad. Se mantiene el portal exclusivo de Colocaciones de Ariel. No se da de alta ni se cambia de sector a ninguna cuenta: para asignar a Tropi al nuevo sector se necesita su correo real.

Se conservan las reglas generales de Firestore y los permisos existentes; estas opciones de interfaz no sustituyen una política adicional de seguridad por roles en el servidor.

## Datos y conservación

Los registros de OT se guardan en `obras/{id}.calidadGestion.registros.{registroId}` mediante transacciones sobre la versión vigente de la obra. Los registros internos se guardan en `calidadRegistros/{registroId}`. El cierre comprueba que el registro siga pendiente y evita doble cierre. Se conservan usuario y fecha de creación y cierre. No se permite editar ni eliminar registros desde este módulo.

El dashboard muestra pendientes, vencidos, liberaciones registradas y unidades revisadas. El porcentaje de defectos describe sólo los controles cargados, no toda la producción. No hay todavía tendencias por período, costos de retrabajo, muestreo automático ni generación de PDF.

## Próximos pasos sugeridos

1. Asignar la cuenta del responsable de Calidad (Tropi) y acordar quién puede verificar cada tipo de trabajo.
2. Definir criterios por familia: letras/carteles, impresiones/vinilos, placas/muebles. Usar el plano y la especificación de cada OT, sin presuponer materiales iguales.
3. Registrar causas de retrabajo y verificar si la corrección se repite o funciona; incorporar reclamos externos como anomalías con categoría y responsable.
4. Incorporar controles de recepción a Compras y una revisión antes de salida a colocación.
5. Agregar auditorías 5S por sector y seguimiento de compromisos.
6. Evaluar indicadores por semana (recurrencias, tiempo de resolución, primera aprobación), exportación de actas de liberación y controles de permisos en el servidor cuando se incorporen nuevas cuentas.

Validación inicial: pruebas de fechas, permisos de formularios, coherencia de cantidades, liberación con pendientes, conservación del resultado original, enlaces seguros, registros internos y transacciones que conservan otros sectores; checks completos de publicación.
