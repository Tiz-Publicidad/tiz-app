/* Canal de venta y seguimiento de cobros sin crear facturas. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZCanalVentaV1=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const round=n=>Math.round((n+Number.EPSILON)*100)/100;
 function channel(work={},quote={}){return (work.canalVenta??quote.canalVenta)==='canal_2'?'canal_2':'habitual';}
 function selection(value){if(!['A','B','','SIN_FACTURA'].includes(value))throw Error('Elegí el tipo de factura o Canal 2.');return {tipoFacturaSolicitada:['A','B'].includes(value)?value:'',canalVenta:value==='SIN_FACTURA'?'canal_2':'habitual'};}
 function selected(record={}){return channel(record)==='canal_2'?'SIN_FACTURA':['A','B'].includes(record.tipoFacturaSolicitada)?record.tipoFacturaSolicitada:'';}
 function apply(w,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Buenos_Aires'}).format(new Date())){
  w.canalVenta=channel(w.obra||{},w.presupuesto||{});w.sinFacturacion=w.canalVenta==='canal_2';
  const registration=w.obra?.cobranzaSinFactura||{};
  w.cobranzaSinFacturaHabilitada=!!(w.sinFacturacion&&!(w.invoices||[]).length&&registration.habilitada&&Number.isFinite(registration.importe)&&registration.importe>0);
  if(!w.sinFacturacion||(w.invoices||[]).length||w.bajaObra)return w;
  w.porFacturar=0;w.facturacionEstado='sin_facturacion';
  if(!w.cobranzaSinFacturaHabilitada)return w;
  w.importeCobroSinFactura=round(registration.importe);
  w.cobradoReconocido=round(Math.min(w.importeCobroSinFactura,w.cobrado+w.retenciones));
  w.porCobrarCalculado=round(Math.max(0,w.importeCobroSinFactura-w.cobrado-w.retenciones));
  w.porCobrar=w.historicoCerrado?0:w.porCobrarCalculado;
  w.cobradoPct=Math.min(100,round(w.cobradoReconocido/w.importeCobroSinFactura*100));
  w.proximoVencimiento=registration.vencimiento||'';
  w.cobranzaEstado=w.porCobrar<=.01?'cobrado':w.cobradoReconocido>0?'parcial':w.proximoVencimiento&&w.proximoVencimiento<today?'vencido':'pendiente';
  w.estadoOperativo=w.porCobrar<=.01?'cobrado':w.cobradoReconocido>0?'cobrado_pendiente':'pendiente_cobro';
  return w;
 }
 function validateRegistration(w,amount,vencimiento){
  if((w.invoices||[]).length)throw Error('La obra tiene facturas registradas. Revisá sus comprobantes antes de registrar un cobro sin factura.');
  if(w.bajaObra||w.historicoCerrado)throw Error('La obra está dada de baja o tiene el cobro cerrado.');
  if(!Number.isFinite(amount)||amount<=0)throw Error('Ingresá el importe total a cobrar.');
  if(amount+.01<w.cobrado+w.retenciones)throw Error('El importe a cobrar no puede ser menor que los cobros y retenciones registrados.');
  if(vencimiento&&(!/^\d{4}-\d{2}-\d{2}$/.test(vencimiento)||Number.isNaN(Date.parse(vencimiento))||new Date(vencimiento+'T12:00:00Z').toISOString().slice(0,10)!==vencimiento))throw Error('Ingresá un vencimiento válido.');
 }
 return {channel,selection,selected,apply,validateRegistration};
});
