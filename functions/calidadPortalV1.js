'use strict';
const C=require('./calidadCoreV1');
const text=v=>String(v??'').trim();
const RECORD_FIELDS=['id','obraId','referencia','tipo','etapa','area','categoria','fecha','detalle','criterio','responsable','vencimiento','resultado','evidencia','gravedad','lote','revisadas','defectuosas','estado','creadoEn','creadoPor','historial','decision','causa','subcausa','autorizacionDesvio','accion','verificacion','fechaReal','cerradoEn','cerradoPor'];
function projectRecord(r){return Object.fromEntries(RECORD_FIELDS.filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));}
function projectWork(d){const w=d.data();return {id:d.id,ot:text(w.ot),cliente:text(w.cliente),desc:text(w.desc||w.descripcion),estado:text(w.estado),archivado:!!w.archivado,revisionVigente:w.revisionVigente!==false,revisionOperativa:w.revisionOperativa!==false,calidadGestion:{registros:Object.fromEntries(Object.entries(w.calidadGestion?.registros||{}).map(([id,r])=>[id,projectRecord(r)]))},sectores:{calidad:w.sectores?.calidad||{}},driveFolderUrl:text(w.driveFolderUrl),driveFolderId:text(w.driveFolderId)};}
async function list(db){const [works,records]=await Promise.all([db.collection('obras').get(),db.collection('calidadRegistros').get()]);return {obras:works.docs.map(projectWork),calidad:records.docs.map(d=>({...projectRecord(d.data()),id:d.id}))};}
async function saveRecord(db,body,user,at=new Date().toISOString()){
 if(!C.canControl(user))throw Error('Tu cuenta no puede gestionar los registros de Calidad.');
 const record=body.record?{...C.clean(body.record,user,at),...C.validateDecision(body.record,user,at)}:null;
 const obraId=record?.obraId||text(body.obraId),id=record?.id||text(body.id);
 if(!/^[\w-]{1,150}$/.test(id)||obraId&&!/^[\w-]{1,150}$/.test(obraId))throw Error('Identificador inválido.');
 return db.runTransaction(async tx=>{
  const ref=db.collection(obraId?'obras':'calidadRegistros').doc(obraId||id),snap=await tx.get(ref);
  let result;
  if(obraId){
   if(!snap.exists)throw Error('La OT ya no está disponible.');
   const w={...snap.data(),id:obraId};if(w.archivado||w.revisionVigente===false||w.revisionOperativa===false)throw Error('La OT no está disponible para edición.');
   let patch;if(record){patch=C.registerPatch(w,record);result=record;}else{const old=w.calidadGestion?.registros?.[id];if(!old)throw Error('El registro ya no está disponible.');result=C.closeRecord(old,body.fields,user,at);patch={['calidadGestion.registros.'+id]:result};}tx.update(ref,patch);
  }else{
   if(record){if(snap.exists)throw Error('Ese registro ya existe.');result=record;tx.set(ref,result);}else{if(!snap.exists)throw Error('El registro ya no está disponible.');result=C.closeRecord(snap.data(),body.fields,user,at);tx.set(ref,result);}
  }
  return {ok:true,record:result};
 });
}
module.exports={projectWork,list,saveRecord};
