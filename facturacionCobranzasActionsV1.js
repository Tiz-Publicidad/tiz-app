// TIZ Facturacion y Cobranzas V1 - acciones
(function(){
'use strict';
function obra(id){return (window.DB?.obras||[]).find(o=>o.id===id)||null}
async function registrarCobro(obraId,payload){
  const o=obra(obraId);if(!o)throw new Error('No se encontro la OT');
  if(typeof window.updateDoc_!=='function')throw new Error('Firestore no disponible');
  const cobros=Array.isArray(o.cobros)?[...o.cobros]:[];
  const row={id:'cob-'+Date.now(),fecha:String(payload?.fecha||new Date().toISOString().slice(0,10)),importe:Number(payload?.importe)||0,medio:String(payload?.medio||''),referencia:String(payload?.referencia||''),retenciones:Number(payload?.retenciones)||0,observaciones:String(payload?.observaciones||''),creadoAt:new Date().toISOString()};
  if(!(row.importe>0))throw new Error('El importe del cobro debe ser mayor a cero');
  cobros.push(row);await window.updateDoc_('obras',obraId,{cobros});o.cobros=cobros;window.TIZFactCobUIV1?.render?.();return row;
}
async function registrarFacturaManual(obraId,payload){
  const o=obra(obraId);if(!o)throw new Error('No se encontro la OT');
  if(typeof window.updateDoc_!=='function')throw new Error('Firestore no disponible');
  const facturas=Array.isArray(o.facturasManual)?[...o.facturasManual]:[];
  const numero=String(payload?.numeroCompleto||payload?.nroFactura||'').trim();if(!numero)throw new Error('Falta el numero de factura');
  const row={id:'manual-'+Date.now(),origen:'manual',numeroCompleto:numero,fecha:String(payload?.fecha||new Date().toISOString().slice(0,10)),neto:Number(payload?.neto)||0,iva:Number(payload?.iva)||0,total:Number(payload?.total)||((Number(payload?.neto)||0)+(Number(payload?.iva)||0)),porcentaje:Number(payload?.porcentaje)||0,tipoParte:String(payload?.tipoParte||'otro'),estadoEnvio:String(payload?.estadoEnvio||'pendiente')};
  facturas.push(row);await window.updateDoc_('obras',obraId,{facturasManual:facturas});o.facturasManual=facturas;window.TIZFactCobUIV1?.render?.();return row;
}
function emitirArca(obraId){if(typeof window.abrirFacturacionGeneralV63!=='function')throw new Error('El facturador ARCA no esta disponible');return window.abrirFacturacionGeneralV63(obraId)}
window.TIZFactCobActionsV1={registrarCobro,registrarFacturaManual,emitirArca};
})();