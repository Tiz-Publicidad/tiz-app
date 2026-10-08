# Colocaciones V130 — tres solapas

La pantalla principal tiene Base de datos, OT aprobadas y Calendario, con los colores institucionales negro y dorado. Base muestra compromiso, OT/obra, acción, responsable y estado; permite buscar y filtrar por semana, responsable e histórico. OT aprobadas muestra un listado breve; los contactos, planos, controles, ayudamemorias y resultados aparecen al abrir la ficha de cada obra. Calendario muestra ayer, hoy y próximos seis días con fecha argentina.

Cargar acción ofrece OT opcional, tarea, responsable y compromiso. Más datos se despliega cuando hace falta. Las acciones sin OT se guardan en `colocacionesPendientes`; al asociarlas se conserva el registro de origen y se agrega la acción a `obras/{id}.colocacionesGestion.acciones` en una transacción. Se rechazan versiones viejas y colocaciones cerradas. Los contactos se heredan de la cotización y se pueden completar por obra, con cargo, teléfono y correo.

## Google Sheet específico

Administración vincula una planilla específica de Colocaciones mediante su enlace. La configuración se guarda en Firebase, sin incluir la identidad de la planilla en el código público. La hoja exclusiva `TIZZ - Acciones` contiene sólo datos operativos de colocación. Las otras hojas manuales no se modifican. La hoja se creó en Planificación TIZ — Colocaciones y sus encabezados se verificaron; la sincronización necesita que el servicio esté publicado y la vinculación se complete en la app.

Guardar, asociar o modificar acciones programa su envío al Sheet. El servicio lee los datos actuales en Firebase; no acepta filas arbitrarias del navegador. La identidad estable evita duplicados al asociar un pendiente sin OT. Se usa RAW, no fórmulas; se rechaza sobrescribir destinos que tengan fórmulas. Se muestra el último envío confirmado o el error pendiente; hay reintentos cada cinco minutos y recuperación al abrir/actualizar la base. El envío ocurre mientras la app está abierta. No hay aún un disparador permanente de Firebase ni lectura de cambios manuales desde el Sheet hacia la app.

## Gestión dentro de la obra

Registrar resultado conserva el compromiso original. Cerrar la acción la lleva al histórico; si sigue pendiente, se crea una próxima acción enlazada. La preparación distingue colocación propia, externa y mixta; registra relevamiento, planos enviados y recepción, insumos, colocador, acceso, personal, calidad y evidencia final. El cierre completo exige cero pendientes, control final y fotos.

Desde la ficha se puede imprimir o actualizar manualmente `Colocaciones/OT {número} - Colocaciones.pdf` dentro de la carpeta OT vinculada. Se reutilizan carpeta y archivo; se rechazan duplicados ambiguos y se conservan los datos guardados si Drive falla. No se envían importes comerciales ni comprobantes fiscales.

Clemen guarda ayudamemorias y recupera experiencias del mismo tipo de obra, indicando su origen. Calendario ofrece sugerencias de visitas abiertas de la misma zona hasta el domingo de esta semana. La confirmación reasigna fecha a las acciones elegidas en una única transacción, conservando la fecha anterior. Son reglas sobre experiencia registrada, sin modelo generativo, geocodificación ni cálculo de distancias.

La exportación `.ics` permite enviar pendientes con fecha a un calendario; no existe sincronización automática con Google Calendar. El estado Entregado del Excel Madre sigue pendiente de una ampliación separada; no se cierra una colocación por un estado fiscal o una entrega.

## Validación y vista de prueba

`docs/colocaciones-v128-preview.html` muestra datos ficticios y cambios en memoria. `docs/colocaciones-v130-mockup.html` es la misma vista, autónoma, para revisar sin conexión. No escribe en Firebase, Drive ni Sheets.

Pruebas: `tests/colocacionesV128.test.cjs`, `tests/colocacionesGeneralV129.test.cjs`, `tests/colocacionesSheetV130.test.cjs` y comprobaciones existentes de Pages y el despliegue exclusivo deploy-colocaciones.yml. El servicio requiere iniciar sesión y pertenecer a los usuarios habilitados para Colocaciones. No cambia reglas de Firestore ni permisos de Drive. Esta preparación local no implica que los cambios estén publicados.
