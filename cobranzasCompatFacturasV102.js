// TIZ V102 - Compatibilidad de facturas historicas/manuales para V101.
(function(){
'use strict';
const num=v=>Number(v)||0;
function normalizeInvoiceHistory(){
  for(const o of (window.DB?.obras||[])){
    if(!o) continue;
    const sf=o?.sectores?.facturacion||o?.gestionSectores?.facturacion||{};
    const fa=o?.facturaArca||{};
    const raw=o.finanzas||{};
    const ant={facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0,...(raw.anticipo||{})};
    const sal={facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0,...(raw.saldo||{})};
    const histNro=o.nrfc||sf.nroFactura||fa.numeroCompleto||'';
    const histFecha=o.ffc||o.fechaFactura||sf.fechaFactura||fa.fecha||'';
    if(histNro&&!o.nrfc){o.nrfc=histNro;o.ffc=histFecha;}
    if(histNro&&!ant.nroFactura&&!sal.nroFactura){
      sal.nroFactura=histNro;
      sal.fechaFactura=histFecha;
      sal.facturado=true;
      if(!num(sal.monto)&&num(raw.total||o.neto||o.importe)>0) sal.monto=num(raw.total||o.neto||o.importe);
      o.finanzas={...raw,anticipo:ant,saldo:sal};
    }
  }
}
const priorRender=window.renderCobranzas;
if(typeof priorRender==='function') window.renderCobranzas=function(){normalizeInvoiceHistory();return priorRender.apply(this,arguments)};
const priorSet=window.setCobTab;
if(typeof priorSet==='function') window.setCobTab=function(tab,button){normalizeInvoiceHistory();return priorSet.apply(this,arguments)};
window.tizNormalizarFacturasHistoricasV102=normalizeInvoiceHistory;
setTimeout(()=>{normalizeInvoiceHistory();if(window.cobTab==='cobrar')window.renderCobranzas?.()},0);
window.addEventListener('load',()=>{normalizeInvoiceHistory();if(window.cobTab==='cobrar')window.renderCobranzas?.()},{once:true});
})();
