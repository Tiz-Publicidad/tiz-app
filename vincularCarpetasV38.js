// TIZ V65 bootstrap: conserva V38 y carga el parche de cotizaciones.
(function(){
  'use strict';
  function load(src,onload){
    var s=document.createElement('script');
    s.src=src;
    if(onload)s.onload=onload;
    s.onerror=function(){console.error('[TIZ V65] No se pudo cargar '+src);};
    document.body.appendChild(s);
  }
  load('vincularCarpetasV38.original.js?v=TIZ-V38-ORIGINAL-20260903',function(){
    load('tizFixCotizacionesV65.js?v=TIZ-V65-CT-DRIVE-FACTURACION-CLIENTES-20260907');
  });
})();
