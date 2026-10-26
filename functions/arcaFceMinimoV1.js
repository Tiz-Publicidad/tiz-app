'use strict';
const URL='https://servicioscf.afip.gob.ar/facturadecreditoelectronica/default.asp';
const TTL=60*60*1000;
const months={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
function calendar(value){
 const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)throw Error('Fecha inválida para el mínimo FCE');
 const date=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));if(date.toISOString().slice(0,10)!==value)throw Error('Fecha inválida para el mínimo FCE');return value;
}
function parse(html){
 const text=String(html||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&iacute;/gi,'í').replace(/&oacute;/gi,'ó').replace(/\s+/g,' ');
 const pattern=/Desde el (\d{1,2}) de ([a-z]+) de (\d{4})\s*,?\s+el monto m[ií]nimo[^$]{1,300}\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?)(?=\s|\()/gi;
 const matches=[...text.matchAll(pattern)];if(matches.length!==1)throw Error('No se pudo identificar un único mínimo FCE en la fuente oficial');
 const [,day,month,year,amount]=matches[0],monthNumber=months[month.toLowerCase()];if(!monthNumber)throw Error('Mes inválido en el mínimo FCE');
 const desde=calendar(`${year}-${String(monthNumber).padStart(2,'0')}-${day.padStart(2,'0')}`),montoDesde=Number(amount.replace(/\./g,'').replace(',','.'));
 if(!Number.isFinite(montoDesde)||montoDesde<=0)throw Error('Monto inválido en el mínimo FCE');
 return {desde,montoDesde,sourceUrl:URL};
}
// A published general minimum rules out mandatory FCE below it, without asserting
// whether the recipient is a large company. At/above it, use the recipient service.
function decision({fecha,total},minimum){
 calendar(fecha);if(!Number.isFinite(total)||total<=0)throw Error('Total inválido para el mínimo FCE');
 calendar(minimum.desde);if(!Number.isFinite(minimum.montoDesde)||minimum.montoDesde<=0)throw Error('Mínimo FCE inválido');
 if(fecha<minimum.desde||Math.round(total*100)>=Math.round(minimum.montoDesde*100))return null;
 return {obligado:null,montoDesde:minimum.montoDesde,requiereFce:false,total,criterio:'inferior_minimo_general',vigenteDesde:minimum.desde,fuente:'ARCA.minimoGeneralFCE',sourceUrl:URL,verificadoAt:new Date().toISOString()};
}
function createReader(fetcher=fetch,clock=Date.now){
 let cached=null,pending=null;
 return async function(input){
  if(cached&&clock()-cached.at<TTL)return decision(input,cached.value);
  if(!pending){pending=(async()=>{const response=await fetcher(URL,{redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Fuente oficial FCE no disponible');const value=parse(await response.text());cached={value,at:clock()};return value;})();}
  try{return decision(input,await pending)}finally{pending=null}
 };
}
const check=createReader();
module.exports={URL,parse,decision,createReader,check};
