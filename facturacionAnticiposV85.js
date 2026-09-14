// TIZ V97 - compatibilidad: anticipos y saldos quedan integrados al render estable de Cobranzas.
// Se elimina cualquier observer, polling o re-render paralelo para evitar titileo y columnas duplicadas.
(function(){
  'use strict';
  window.__TIZ_FACTURACION_ANTICIPOS_V85_TABLE_MUTATOR_DISABLED = true;
})();
