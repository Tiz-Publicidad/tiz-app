'use strict';
const {setTimeout: delay}=require('node:timers/promises');
const {google}=require('googleapis');
const {logistics}=require('./otLogisticaCoreV1');
const {sheetId}=require('./materialesProduccionApiV1');
const {norm,text}=require('./materialesProduccionCoreV1');
const V=require('./vigenciaComercialCoreV1');

async function syncAddress(sheets,id,ot,domicilio){
 const {data}=await sheets.spreadsheets.get({
  spreadsheetId:id,ranges:["'FICHA'!A1:F1000"],
  fields:'properties(title),sheets(properties(sheetId),data(startRow,rowData(values(formattedValue,userEnteredValue))))',
 });
 const actualOt=data.properties?.title?.match(/\bOT\s*0*(\d+)/i)?.[1];
 if(!ot||Number(actualOt)!==Number(ot))throw Error('La hoja no corresponde a la OT');
 const tab=data.sheets?.[0],grid=tab?.data?.[0],positions=[];
 let addressSection=-1;
 for(const [index,row] of (grid?.rowData||[]).entries()){
  const cells=row.values||[];
  const label=cells.findIndex(cell=>cell.formattedValue==='DATOS DE OBRA / COLOCACIÓN');
  if(label>=0)addressSection=label;
  if(cells.some(cell=>cell.formattedValue==='INFORMACIÓN Y PLANEAMIENTO'))addressSection=-1;
  if(addressSection<0||cells[addressSection]?.formattedValue!=='Dirección'||cells[addressSection+3]?.formattedValue!=='Contacto')continue;
  positions.push({rowIndex:(grid.startRow||0)+index,columnIndex:addressSection+1,value:cells[addressSection+1]?.userEnteredValue});
 }
 if(positions.length!==1)throw Error('No se encontró un campo Dirección único');
 const {rowIndex,columnIndex,value}=positions[0];
 if(value?.formulaValue)throw Error('El campo Dirección contiene una fórmula');
 if(value?.stringValue===domicilio)return false;
 const column=String.fromCharCode(65+columnIndex);
 const result=await sheets.spreadsheets.values.update({
  spreadsheetId:id,range:"'FICHA'!"+column+(rowIndex+1),valueInputOption:'RAW',
  includeValuesInResponse:true,requestBody:{values:[[domicilio]]}
 });
 if(result.data.updatedData?.values?.[0]?.[0]!==domicilio)throw Error('No se pudo verificar el domicilio guardado');
 return true;
}

async function run(db,sheets){
 const [snapshot,quotes]=await Promise.all([db.collection('obras').get(),V.quoteRows(db)]);
 const targets=new Map();
 const stats={actualizadas:0,yaCorrectas:0,sinDomicilio:0,sinFicha:0,pendientes:0};
 for(const doc of snapshot.docs){
  const obra={...doc.data(),id:doc.id};
  if(obra.archivado||obra.revisionVigente===false||obra.revisionOperativa===false||['baja','cancelado','cancelada'].includes(norm(obra.estado))||!V.visible(obra,quotes))continue;
  const domicilio=logistics(obra,V.quoteFor(obra,quotes)||{}).domicilio;
  if(!domicilio||['adefinir','pedirdomicilio'].includes(domicilio.toLowerCase().replace(/\s+/g,''))){stats.sinDomicilio++;continue;}
  let id;
  try{id=sheetId(obra);}catch{stats.sinFicha++;continue;}
  const ot=text(obra.ot||obra.nroCotizacion).match(/\d+/)?.[0];
  const group=targets.get(id)||[];
  group.push({ot,domicilio});
  targets.set(id,group);
 }
 for(const [id,group] of targets){
  const [{ot,domicilio}]=group;
  try{
   if(group.length!==1)throw Error('Ficha vinculada a más de una obra vigente');
   if(await syncAddress(sheets,id,ot,domicilio))stats.actualizadas++;
   else stats.yaCorrectas++;
  }catch(err){
   stats.pendientes++;
   console.error('OT '+(ot||'sin número')+' pendiente ('+(err.response?.status||err.status||err.message)+')');
  }
  await delay(1050);
 }
 console.log(JSON.stringify(stats));
 return stats;
}

if(require.main===module){
 const admin=require('firebase-admin');
 if(!admin.apps.length)admin.initializeApp({projectId:'tiz---app'});
 const auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets']});
 run(admin.firestore(),google.sheets({version:'v4',auth})).then(stats=>{if(stats.pendientes)process.exitCode=1;}).catch(err=>{console.error(err.message);process.exitCode=1;});
}
module.exports={run,syncAddress};
