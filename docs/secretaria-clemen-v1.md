# Clemen — primera versión de la secretaria virtual

La burbuja vive en `document.body` y permanece en todas las pantallas autenticadas, incluidos los portales de Calidad, Colocaciones y Operaciones. Clemen IA y Mis tareas también abren el panel. Conserva el borrador al navegar o cerrar/reabrir la burbuja; salir de la cuenta borra el estado local.

- **Mi día:** pendientes para hoy, vencidos, sin fecha y análisis preliminar del puesto.
- **Agenda:** filtros por día/estado; tareas anteriores y encargos nuevos desde la misma colección `tareas`.
- **Encargo:** descripción, responsable autorizado, OT opcional, fecha/hora, recordatorio y notas. Un pedido escrito prepara un borrador con hoy/mañana/pasado mañana, fechas explícitas, hora y OT; requiere revisar y guardar.
- **Seguimiento:** completar, pasar a En curso, bloquear y reprogramar. Cambios de fecha y bloqueos requieren motivo. Cada cambio conserva una revisión y el operador.

Las lecturas y cambios usan los modos `secretary-list` y `secretary-save` de `sincronizarBaseMadreV120`, con token Firebase y autorización de la lista de cuentas y puestos existente. Administración puede gestionar todos los encargos; los demás usuarios sólo sus puestos autorizados. No se amplían las reglas de Firestore ni los accesos financieros.

Se mantienen los campos históricos y metadata ajena de `tareas`. Los nuevos campos incluyen `asignadoA`, `venceEn`, `recordarEn`, `estado`, `revision` y `actualizadoPor`; las versiones están en `versionesClemen`. Completar un encargo no cambia el estado de una obra ni de una acción de Colocaciones. La OT y Drive reutilizan los vínculos existentes.

Los avisos se muestran dentro de TIZ mientras está abierta y visible, en horario argentino. Esta versión no envía correo/WhatsApp, no modifica Google Calendar y no avisa con la app cerrada. Voz y notificaciones de escritorio quedan para una etapa posterior.
