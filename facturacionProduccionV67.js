// TIZ V91 - compatibilidad: la facturacion real tiene un unico propietario (Facturador Integral V90).
(function(){
'use strict';
function notReady(){
  alert('El facturador integral todavía no terminó de cargar. Actualizá la página y volvé a intentar. No se emitió ningún comprobante.');
}
// Este archivo queda sólo por compatibilidad con páginas antiguas. El loader actual no lo carga.
// Facturador Integral V90 reemplaza estos aliases al iniciar.
if(typeof window.abrirFacturacionIntegralV83==='function'){
  window.abrirFacturacionProduccionV67=window.abrirFacturacionIntegralV83;
  window.abrirFacturacionGeneralV63=window.abrirFacturacionIntegralV83;
}else{
  window.abrirFacturacionProduccionV67=notReady;
  window.abrirFacturacionGeneralV63=notReady;
}
})();
