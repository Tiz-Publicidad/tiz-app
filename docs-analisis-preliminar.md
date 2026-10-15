# Análisis preliminar por obra

Al crear una obra aprobada o cambiarla a Aprobado, el mismo guardado de Firestore registra la aprobación con serverTimestamp y un vencimiento 48 horas corridas después. No crea análisis para obras históricas al editar otros campos. Reaprobar una obra con análisis conserva su plazo original.

Puestos: Ventas, Diseño, Compras, Producción, Calidad, Colocaciones, Facturación y Cobranzas. Cada cuenta completa su puesto; Administración puede elegir cualquiera y consultar el seguimiento consolidado. Los portales de Calidad y Colocaciones acceden por API autenticada y reciben únicamente identidad operativa, plazos y el reporte de su puesto.

En cada pantalla aparece una tabla compacta con la obra, el plazo restante y el botón Cargar análisis preliminar. El formulario permite agregar y quitar renglones: tarea, qué sí se puede iniciar, qué no y motivo, responsable de resolver el pendiente. Admite Nada por ahora y Sin pendientes con explicación del alcance. No inicia tareas ni libera etapas automáticamente.

Guardar borrador no cuenta como presentación. Presentar exige completar las filas y registra fecha del servidor, operador, cumplimiento y horas transcurridas. Las ediciones posteriores conservan la primera presentación. Una revisión optimista rechaza escrituras desactualizadas. Cada guardado conserva su versión por puesto.

El reloj del navegador se ajusta con la hora del servidor. El seguimiento se actualiza al guardar y consulta nuevas aprobaciones periódicamente. Los análisis archivados o de revisiones no vigentes dejan de mostrarse; se conserva el historial.

## Despliegue

Workflow deploy-functions.yml (identidad de despliegue existente): despliega la API sincronizarBaseMadreV120 con las operaciones preliminary-list y preliminary-save, y las reglas de Firestore. El workflow deploy-analisis-preliminar.yml valida la lógica sin credenciales. Pages publica la interfaz. No requiere Eventarc ni funciones nuevas. Las reglas conservan el acceso previo y reservan analisisPreliminares a la API.

Los helpers de alta y cambio de estado registran la marca analisisPreliminarAprobadoEn junto con la aprobación. Las actualizaciones leen el estado vigente dentro de una transacción y no reinician la marca. El análisis se materializa al consultarlo usando esa fecha del servidor, por lo que abrir la app más tarde no cambia el vencimiento.

Validación: node --test tests/analisisPreliminarV1.test.cjs.
