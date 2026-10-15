# Análisis preliminar por obra

Cada puesto informa qué tareas puede iniciar, cuáles no y por qué, y quién debe resolver el pendiente. El formulario permite agregar y quitar renglones y guardar borradores. Presentar exige completar el alcance; Nada por ahora y Sin pendientes son respuestas válidas cuando corresponden. No inicia tareas ni libera etapas automáticamente.

## Plazo y obras incluidas

Las altas aprobadas y los cambios a Aprobado registran analisisPreliminarAprobadoEn con serverTimestamp en la misma escritura o transacción. Su vencimiento es 48 horas corridas después de esa aprobación.

La lista también incluye Pendiente y Cobrado pendiente de TIZ 2026, sin límite de antigüedad, y las obras activas de la app. Agrupa anticipo y saldo por OT. Las obras anteriores sin marca de aprobación reciben 48 horas desde la primera habilitación del análisis; la interfaz lo identifica expresamente como habilitación y no inventa una fecha de aprobación histórica.

La primera presentación fija fecha, operador, tiempo de respuesta y cumplimiento. Los borradores no cuentan. Las ediciones conservan el cumplimiento original, rechazan revisiones desactualizadas y crean una versión por puesto.

Las referencias presentes únicamente en TIZ 2026 conservan su propio análisis sin crear otra obra. Si luego se vinculan a la app, mantienen el análisis, el vencimiento y las presentaciones. Las consultas sólo exponen datos operativos; no incluyen precios ni datos fiscales.

## Interfaz y permisos

En Calidad y Colocaciones el contador y el botón aparecen junto a cada obra. El panel se aloja dentro de calidad-root o c128-root para que los renderizados modernos y el ocultamiento de componentes heredados no lo tapen.

Administración puede elegir los ocho puestos y consultar su cumplimiento. Los demás usuarios completan su puesto y las delegaciones operativas ya existentes: Pablo puede gestionar Calidad y Colocaciones; Compras puede gestionar Colocaciones. Los usuarios externos de Calidad y Colocaciones siguen usando la API autenticada y no reciben acceso directo adicional a Firestore.

## Despliegue y validación

El workflow deploy-functions.yml publica sincronizarBaseMadreV120 con preliminary-list y preliminary-save. Pages publica la interfaz. No requiere Eventarc ni identidades nuevas. Se conservan los permisos de Firestore existentes.

Pruebas: node --test tests/analisisPreliminarV1.test.cjs. Incluye la regresión del ocultamiento del contador, fechas de habilitación, agrupación de referencias, conservación de presentaciones, concurrencia y máscara de datos por puesto.
