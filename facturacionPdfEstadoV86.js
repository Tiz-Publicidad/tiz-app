// TIZ V93 — compatibilidad histórica desactivada.
// La gestión de estado PDF/Drive queda exclusivamente en facturacionDriveRetryUIV83.js.
// Este archivo se conserva para no romper referencias antiguas del HTML, pero NO observa el DOM,
// NO ejecuta auto-recuperaciones y NO vuelve a renderizar Cobranzas.
(function(){
  'use strict';
  window.__tizPdfEstadoV86Disabled = true;
})();
