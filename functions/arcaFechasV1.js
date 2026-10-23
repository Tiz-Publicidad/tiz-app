/* WSFEv1 v4.7: fechas de emisión y período de servicios. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZArcaFechasV1=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const fail=message=>Object.assign(new Error(message),{status:400});
 function iso(value){
  const s=String(value??''),d=new Date(s+'T12:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(+d)||d.toISOString().slice(0,10)!==s)throw fail('Ingresá una fecha válida (AAAA-MM-DD).');
  return s;
 }
 function today(now=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
 }
 function add(date,days){const d=new Date(iso(date)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Number(days));return d.toISOString().slice(0,10);}
 function concept(value=1){const c=Number(value);if(![1,2,3].includes(c))throw fail('Seleccioná Productos, Servicios o Productos y servicios.');return c;}
 function limits({hoy=today(),concepto=1,fce=false,ultimaFecha='',ultimoNumero=0}={}){
  iso(hoy);concepto=concept(concepto);if(ultimaFecha)iso(ultimaFecha);
  const dias=fce||concepto===1?5:10,baseMin=add(hoy,-dias),min=ultimaFecha&&ultimaFecha>baseMin?ultimaFecha:baseMin;
  // TIZ enables today's and earlier dates; future dating is outside this flow.
  return {hoy,min,max:hoy,dias,baseMin,ultimaFecha,ultimoNumero};
 }
 function validate(value,bounds){const date=iso(value);if(date<bounds.min||date>bounds.max)throw fail(`La fecha de emisión debe estar entre ${bounds.min} y ${bounds.max}.${bounds.ultimaFecha?' Último comprobante de este tipo y punto de venta: '+bounds.ultimaFecha+'.':''}`);return date;}
 function serviceDates({concepto,fecha,desde,hasta,diasPago}){
  concepto=concept(concepto);fecha=iso(fecha);
  const vencimiento=add(fecha,diasPago);
  if(concepto===1)return {fecha,fechaVencimientoPago:vencimiento};
  desde=iso(desde||fecha);hasta=iso(hasta||fecha);
  if(desde>hasta)throw fail('El inicio del período de servicios no puede ser posterior al final.');
  return {fecha,fechaServicioDesde:desde,fechaServicioHasta:hasta,fechaVencimientoPago:vencimiento};
 }
 return {iso,today,add,concept,limits,validate,serviceDates};
});
