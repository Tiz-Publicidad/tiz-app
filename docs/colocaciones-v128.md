# Colocaciones V128

Primera versión del seguimiento por obra. La agenda usa la fecha de Argentina y muestra ayer, hoy y los próximos seis días. Las acciones anteriores y sin fecha continúan visibles en los filtros.

- Los contactos parten de la cotización vinculada y permiten completar cargo, teléfono, correo y observaciones por obra.
- Cada acción tiene responsable, compromiso, contacto, prioridad, observaciones y datos para calendario.
- Registrar un resultado conserva la acción y su compromiso original. Si queda pendiente, se crea una próxima acción enlazada. El histórico consulta las acciones cerradas/reprogramadas sin borrar registros.
- La preparación distingue colocación propia, externa y mixta; registra versión, archivo, fecha y destinatario de planos enviados y recepción confirmada.
- El cierre de toda la colocación exige cero acciones pendientes, control final y fotos. Se puede reabrir conservando el historial.
- Clemen permite guardar ayudamemorias, convertirlas en acciones propuestas y recuperar experiencias guardadas en obras del mismo tipo con su origen. Las sugerencias de esta versión usan reglas y experiencia registrada; no hay un modelo generativo conectado.
- Calendario: exportación `.ics` por acción o para las pendientes con fecha. No existe sincronización automática con Google Calendar. Reimportar un archivo en algunos calendarios puede crear copias; los cambios de fecha se gestionan primero en TIZZ.
- Importación: se lee localmente una planilla con hojas Colocaciones e Histórico. El usuario revisa el vínculo de cada fila. Sólo se propone una obra cuando la OT coincide de forma única; nunca se asigna por similitud del cliente. Los registros existentes no se sobrescriben. Importaciones interrumpidas se pueden reintentar.

Los datos nuevos se guardan en `obras/{id}.colocacionesGestion`, separados de los mapas heredados. Las escrituras usan campos individuales dentro de una transacción de Firestore. El resultado se valida contra el documento actual para evitar cierres simultáneos. No se muestran importes comerciales ni se modifican permisos de acceso existentes.

`docs/colocaciones-v128-preview.html` permite probar la interfaz con datos ficticios y guardado sólo en memoria.

Validación: `node --test tests/colocacionesV128.test.cjs`, además de los chequeos existentes del despliegue de GitHub Pages.
