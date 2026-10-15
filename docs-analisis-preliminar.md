# Análisis preliminar por obra

Al crear una obra aprobada o cambiarla a Aprobado, el evento de Firestore registra la aprobación y un vencimiento 48 horas corridas después. No crea análisis para obras históricas al editar otros campos. Reaprobar una obra con análisis conserva su plazo original.

Puestos: Ventas, Diseño, Compras, Producción, Calidad, Colocaciones, Facturación y Cobranzas. Cada cuenta completa su puesto; Administración puede elegir cualquiera y consultar el seguimiento consolidado. Los portales de Calidad y Colocaciones acceden por API autenticada y reciben únicamente identidad operativa, plazos y el reporte de su puesto.

En cada pantalla aparece una tabla compacta con la obra, el plazo restante y el botón Cargar análisis preliminar. El formulario permite agregar y quitar renglones: tarea, qué sí se puede iniciar, qué no y motivo, responsable de resolver el pendiente. Admite Nada por ahora y Sin pendientes con explicación del alcance. No inicia tareas ni libera etapas automáticamente.

Guardar borrador no cuenta como presentación. Presentar exige completar las filas y registra fecha del servidor, operador, cumplimiento y horas transcurridas. Las ediciones posteriores conservan la primera presentación. Una revisión optimista rechaza escrituras desactualizadas. Cada guardado conserva su versión por puesto.

El reloj del navegador se ajusta con la hora del servidor. El seguimiento se actualiza al guardar y consulta nuevas aprobaciones periódicamente. Los análisis archivados o de revisiones no vigentes dejan de mostrarse; se conserva el historial.

## Despliegue

Workflow deploy-analisis-preliminar.yml: despliega analisisPreliminarAprobacionV1, analisisPreliminarV1 y las reglas de Firestore. Pages publica la interfaz. El trigger necesita que el proyecto permita eventos de Firestore de segunda generación (Eventarc). Las reglas conservan el acceso previo y reservan analisisPreliminares a la API y al trigger.

Validación: node --test tests/analisisPreliminarV1.test.cjs.
