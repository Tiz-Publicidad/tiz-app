// TIZ V127 - Fechas y resultado semanal de cobranzas.
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.TIZCobranzaSemanalV127=api;})(typeof window!=="undefined"?window:null,function(){
"use strict";
const cents=x=>Math.round((Number(x)||0)*100)/100;
function fechaValida(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")))return false;const d=new Date(value+"T12:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;}
function hoy(){const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(x=>[x.type,x.value]));return parts.year+"-"+parts.month+"-"+parts.day;}
const iso=d=>d.toISOString().slice(0,10);
function semana(fecha){if(!fechaValida(fecha))return null;const d=new Date(fecha+"T12:00:00Z"),day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()-day+1);const inicio=iso(d),end=new Date(d);end.setUTCDate(end.getUTCDate()+6);const thu=new Date(d);thu.setUTCDate(thu.getUTCDate()+3);thu.setUTCHours(0,0,0,0);const y=thu.getUTCFullYear(),y0=new Date(Date.UTC(y,0,1));const num=Math.ceil(((thu-y0)/86400000+1)/7);return{inicio,fin:iso(end),iso:y+"-W"+String(num).padStart(2,"0"),mes:fecha.slice(0,7)};}
function informe(data,mes){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes))throw new Error("Seleccioná un mes válido.");
 const start=mes+"-01",last=new Date(start+"T12:00:00Z");last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);const end=iso(last),groups=new Map();
 for(let d=new Date(start+"T12:00:00Z");iso(d)<=end;d.setUTCDate(d.getUTCDate()+1)){const w=semana(iso(d));if(!groups.has(w.inicio))groups.set(w.inicio,{...w,numero:groups.size+1,proyectado:0,ingresado:0,retenciones:0,cobros:[]});}
 let sinVencimiento=0,sinFechaCobro=0;
 for(const work of data.workItems||[]){
  if(work.anuladaConNC)continue;
  for(const i of work.invoices||[]){
   if(i.familia==="credito")continue;
   const creditos=(work.invoices||[]).filter(c=>c.familia==="credito"&&Number(c.raw?.asociado?.cbteTipo)===Number(i.cbteTipo)&&Number(c.raw?.asociado?.ptoVta)===Number(i.ptoVta)&&Number(c.raw?.asociado?.cbteNro)===Number(i.cbteNro)).reduce((s,c)=>s+Number(c.total||c.neto||0),0);
   const importe=Math.max(0,cents(Number(i.total||i.neto||0)-creditos));if(!importe)continue;
   const date=i.fechaVencimientoPago;if(!fechaValida(date)){sinVencimiento++;continue;}
   if(date.slice(0,7)!==mes)continue;groups.get(semana(date).inicio).proyectado+=importe;
  }
 }
 for(const p of data.payments||[]){
  if(!fechaValida(p.fecha)){if(Number(p.importe)||Number(p.retenciones))sinFechaCobro++;continue;}
  if(p.fecha.slice(0,7)!==mes)continue;
  const row=groups.get(semana(p.fecha).inicio);row.ingresado+=Number(p.importe)||0;row.retenciones+=Number(p.retenciones)||0;row.cobros.push(p);
 }
 const semanas=[...groups.values()].map(x=>({...x,proyectado:cents(x.proyectado),ingresado:cents(x.ingresado),retenciones:cents(x.retenciones),aplicado:cents(x.ingresado+x.retenciones),diferencia:cents(x.ingresado+x.retenciones-x.proyectado),cumplimiento:x.proyectado?Math.round((x.ingresado+x.retenciones)/x.proyectado*10000)/100:null}));
 return{mes,semanas,sinVencimiento,sinFechaCobro};
}
return{fechaValida,hoy,semana,informe};
});
