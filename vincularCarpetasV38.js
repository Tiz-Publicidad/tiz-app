// TIZ V66 bootstrap: conserva V38, V65 y agrega aprobadas a Para facturar.
(function(){
  'use strict';
  function load(src,onload){
    var s=document.createElement('script');
    s.src=src;
    if(onload)s.onload=onload;
    s.onerror=function(){console.error('[TIZ] No se pudo cargar '+src);};
    document.body.appendChild(s);
  }
  load('vincularCarpetasV38.original.js?v=TIZ-V38-ORIGINAL-20260903',function(){
    load('tizFixCotizacionesV65.js?v=TIZ-V65-CT-DRIVE-FACTURACION-CLIENTES-20260907',function(){
      load('tizAprobadasFacturacionV66.js?v=TIZ-V66-APROBADAS-PARA-FACTURAR-20260907');
    });
  });
})();
