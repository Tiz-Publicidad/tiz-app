'use strict';
const ID='1mOhuPKcMG8PO3QsY3g84WL4p3o43t4ilK8Jx1DHjF5M';
const SECTORS=[['ventas','Ventas',1],['produccion','Producción',8],['colocaciones','Colocaciones',15],['cobranzas','Facturación y Cobranzas',22]];
const numeric=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
function parse(rows){
 if(String(rows[6]?.[2]).trim()!=='Semana'||String(rows[6]?.[4]).trim()!=='Ventas Aprobadas')throw Error('Cambió la estructura de Estadistica en TIZ 2026. Revisar encabezados antes de importar.');
 const sectors=SECTORS.map(([id,label,start])=>{
  if(String(rows[6]?.[start+1]).trim()!=='Semana'||String(rows[6]?.[start+3]).trim()!==(id==='ventas'?'Ventas Aprobadas':'Mensual Realizado'))throw Error('Cambió el encabezado de '+label+' en Estadistica.');
  const weekly=[],monthly=[];let month='';
  for(let i=7;i<59;i++){
   const r=rows[i]||[],s=r[start+1];if(!Number.isInteger(s)||s!==i-6)throw Error('Falta una semana en Estadistica: '+label+', fila '+(i+1));
   if(r[start]){month=String(r[start]).trim();monthly.push({month,actual:numeric(r[start+3]),target:numeric(r[start+4])});}
   weekly.push({week:s,month,actual:numeric(r[start+2])});
  }
  if(monthly.length!==12)throw Error('Faltan meses en Estadistica: '+label);
  return {id,label,actual:numeric(rows[5]?.[start+3]),target:numeric(rows[5]?.[start+4]),weekly,monthly};
 });
 return {ok:true,year:2026,source:{spreadsheetId:ID,tab:'Estadistica',range:'A1:AB59'},sectors,readAt:new Date().toISOString()};
}
async function load(sheets,email){
 if(!['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com'].includes(String(email||'').toLowerCase()))throw Object.assign(Error('Estadísticas económicas habilitadas sólo para Administración.'),{status:403});
 const response=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:"'Estadistica'!A1:AB59",valueRenderOption:'UNFORMATTED_VALUE'});
 return parse(response.data.values||[]);
}
module.exports={parse,load};
