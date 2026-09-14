// TIZ V97 - compatibilidad: la tabla de Cobranzas ya no puede ser modificada por V73.
// La gestion operativa se mantiene en cobranzasDesdeObrasV41 y el estado visible en V96/V97.
(function(){
  'use strict';
  window.__TIZ_COBRANZAS_V73_TABLE_MUTATOR_DISABLED = true;
})();
