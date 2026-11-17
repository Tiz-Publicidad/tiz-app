'use strict';
const C=require('./calidadCoreV1');
const text=v=>String(v??'').trim();
const TRACKING_FIELDS=['version','planRevision','planificadoPorCalidad','produccionPrevista','colocacionPrevista','avisoDias','calidadAprobada','calidadAprobadaEn','calidadAprobadaPor','produccionPlanificada','produccionPlanificadaEn','produccionPlanificadaPor','produccionReal','colocacionReal','cierreResultado','cierreFecha','retrabajoDetalle','retrabajoResuelto','retrabajoResueltoFecha','actualizadoEn','actualizadoPor'];
const projectTracking=value=>Object.fromEntries(TRACKING_FIELDS.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
const RECORD_FIELDS=['id','obraId','sourceOt','sourceCliente','sourceObra','referencia','tipo','etapa','area','categoria','fecha','detalle','criterio','responsable','vencimiento','resultado','evidencia','gravedad','lote','revisadas','defectuosas','estado','creadoEn','creadoPor','historial','decision','causa','subcausa','autorizacionDesvio','accion','verificacion','fechaReal','cerradoEn','cerradoPor'];
function projectRecord(r){return Object.fromEntries(RECORD_FIELDS.filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));}
function projectWork(d){const w=d.data();return {id:d.id,vigenciaComercial:w.vigenciaComercial,revisionComercialId:w.presupuestoId||w.cotizacionId||'',ot:text(w.ot),cliente:text(w.cliente),desc:text(w.desc||w.descripcion),estado:text(w.estado),fechaAltaObra:text(w.fechaAltaObra||w.fecha||w.fechaAprobacion),semanaVenta:Number(w.semanaVenta||w.semana)||0,fprod_c:text(w.fprod_c),fprod_r:text(w.fprod_r),fcol_c:text(w.fcol_c),fcol_r:text(w.fcol_r),obraSeguimientoV2:projectTracking(w.obraSeguimientoV2),archivado:!!w.archivado,revisionVigente:w.revisionVigente!==false,revisionOperativa:w.revisionOperativa!==false,calidadGestion:{registros:Object.fromEntries(Object.entries(w.calidadGestion?.registros||{}).map(([id,r])=>[id,projectRecord(r)]))},sectores:{calidad:w.sectores?.calidad||{}},driveFolderUrl:text(w.driveFolderUrl),driveFolderId:text(w.driveFolderId)};}
async function list(db){const [works,records]=await Promise.all([db.collection('obras').get(),db.collection('calidadRegistros').get()]);const marked=await C.commercial().read(db,works.docs.map(d=>({id:d.id,...d.data()})));return {obras:marked.map(w=>projectWork({id:w.id,data:()=>w})),calidad:records.docs.map(d=>({...projectRecord(d.data()),id:d.id}))};}
async function saveRecord(db,body,user,at=new Date().toISOString(),readMother=()=>require('./analisisPreliminarApiV1').motherRows()){
 if(!C.canControl(user))throw Error('Tu cuenta no puede gestionar los registros de Calidad.');
 const input=body.record?{...C.clean(body.record,user,at),...C.validateDecision(body.record,user,at)}:null;
 const initialObraId=input?.obraId||text(body.obraId),id=input?.id||text(body.id),source=input?.sourceOt?await readMother():null;
 if(!/^[\w-]{1,150}$/.test(id)||initialObraId&&!/^[\w-]{1,150}$/.test(initialObraId))throw Error('Identificador inválido.');
 const base=v=>String(v||'').match(/\d{4,7}/)?.[0]?.replace(/^0+/,'')||'';
 return db.runTransaction(async tx=>{
  const record=input?{...input}:null;let obraId=initialObraId,prior=[];
  if(source){
   if(obraId)throw Error('Seleccioná la ficha de la OT o el trabajo de TIZ 2026.');
   const worksSnap=await tx.get(db.collection('obras')),works=await C.commercial().read(db,worksSnap.docs.map(d=>({...d.data(),id:d.id})));
   const item=C.motherWorks(source,works).find(o=>o.ot===record.sourceOt);
   if(!item)throw Error('La OT ya no está pendiente en TIZ 2026. Actualizá el listado.');
   const candidates=works.filter(w=>base(w.ot)===record.sourceOt&&!w.archivado&&w.revisionVigente!==false&&w.revisionOperativa!==false&&!w.bajaObra?.activa&&C.norm(w.estado)!=='baja');
   if(candidates.length>1)throw Error('Hay más de una ficha para esta OT. Seleccioná la ficha del trabajo.');
   Object.assign(record,{sourceCliente:item.cliente,sourceObra:item.desc,referencia:item.referencia,obraId:candidates[0]?.id||''});obraId=record.obraId;
  }
  if(record?.tipo==='Liberación'&&record.resultado==='Liberado'){
   const records=await tx.get(db.collection('calidadRegistros'));prior=records.docs.map(d=>d.data());
  }
  const ref=db.collection(obraId?'obras':'calidadRegistros').doc(obraId||id),snap=await tx.get(ref);let result;
  if(obraId){
   if(!snap.exists)throw Error('La OT ya no está disponible.');
   const w={...snap.data(),id:obraId};if(w.archivado||w.revisionVigente===false||w.revisionOperativa===false)throw Error('La OT no está disponible para edición.');
   if(record?.tipo==='Liberación'&&record.resultado==='Liberado'&&prior.some(r=>r.sourceOt===base(w.ot)&&C.pending(r)))throw Error('Esta OT tiene observaciones de Calidad pendientes. Resolvelas antes de liberar.');
   let patch;if(record){patch=C.registerPatch(w,record);result=record;}else{const old=w.calidadGestion?.registros?.[id];if(!old)throw Error('El registro ya no está disponible.');result=C.closeRecord(old,body.fields,user,at);patch={['calidadGestion.registros.'+id]:result};}tx.update(ref,patch);
  }else{
   if(record){
    if(snap.exists)throw Error('Ese registro ya existe.');
    if(record.sourceOt&&record.tipo==='Liberación'&&record.resultado==='Liberado'&&prior.some(r=>(r.sourceOt===record.sourceOt||r.referencia===record.referencia)&&C.pending(r)))throw Error('Esta OT tiene observaciones de Calidad pendientes. Resolvelas antes de liberar.');
    result=record;tx.set(ref,result);
   }else{if(!snap.exists)throw Error('El registro ya no está disponible.');result=C.closeRecord(snap.data(),body.fields,user,at);tx.set(ref,result);}
  }
  return {ok:true,record:result};
 });
}

module.exports={projectWork,list,saveRecord};
