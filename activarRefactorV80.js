// Loader final V80. Debe ser el ultimo script cargado.
(function(){
  'use strict';
  if(document.querySelector('script[data-tiz-v80]'))return;
  const s=document.createElement('script');
  s.src='tizCoreOperativoV80.js?v=TIZ-V80-CORE-20260907-2028';
  s.dataset.tizV80='1';
  s.onload=()=>console.info('[TIZ] Core V80 cargado');
  s.onerror=e=>console.error('[TIZ] No se pudo cargar Core V80',e);
  document.head.appendChild(s);
})();
