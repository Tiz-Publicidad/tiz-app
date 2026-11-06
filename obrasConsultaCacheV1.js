/* Conserva la consulta común y refleja cambios operativos recibidos mientras se lee. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TIZObrasConsultaCacheV1=factory();})(typeof window==='object'?window:globalThis,()=>{
'use strict';
const dates=['produccionPrevistaOriginal','colocacionPrevistaOriginal','produccionPrevista','colocacionPrevista','produccionReal','colocacionReal','cierreFecha','retrabajoResueltoFecha'];
const text=v=>String(v??'').trim();
function driveFolder(w){try{const u=new URL(text(w.driveFolderUrl));if(u.protocol==='https:'&&u.hostname==='drive.google.com'&&!u.username&&!u.password&&/^\/(?:drive\/(?:u\/\d+\/)?folders|folders)\/[\w-]+/.test(u.pathname))return u.href;}catch(_){}return /^[\w-]{10,200}$/.test(text(w.driveFolderId))?'https://drive.google.com/drive/folders/'+w.driveFolderId:'';}
function project(w,C){const s=w.obraSeguimientoV2||{},tracking={reprogramaciones:C.replanHistory([{obraSeguimientoV2:s}])};
 for(const k of dates)if(s[k]!=null)tracking[k]=C.iso(s[k]);
 for(const k of ['planificadoPorCalidad','calidadAprobada','produccionPlanificada','retrabajoResuelto'])tracking[k]=s[k]===true;
 for(const k of ['version','planRevision','avisoDias'])tracking[k]=Number(s[k])||0;
 for(const k of ['cierreResultado','retrabajoDetalle','actualizadoEn'])tracking[k]=text(s[k]);
 return{id:w.id,ot:text(w.ot),cliente:text(w.cliente),desc:text(w.desc||w.descripcion),estado:text(w.estado),driveFolderUrl:driveFolder(w),bajaObra:w.bajaObra?{activa:w.bajaObra.activa===true,motivo:text(w.bajaObra.motivo),fecha:text(w.bajaObra.fecha),usuario:text(w.bajaObra.usuario)}:null,fechaAltaObra:C.iso(w.fechaAltaObra||w.fecha||w.fechaAprobacion)||C.iso(w._ts),semanaVenta:Number(w.semanaVenta??w.semana)||0,fprod_c:C.iso(w.fprod_c??w.gestionSectores?.produccion?.compromiso),fprod_r:C.iso(w.fprod_r),fcol_c:C.iso(w.fcol_c??w.gestionSectores?.colocaciones?.compromiso),fcol_r:C.iso(w.fcol_r),obraSeguimientoV2:tracking,archivado:!!w.archivado,revisionVigente:w.revisionVigente!==false,revisionOperativa:w.revisionOperativa!==false};
}
const snapshot=(works,C)=>new Map(works.filter(w=>w?.id).map(w=>[w.id,project(w,C)]));
function merge(source,previous,current,C){const next=snapshot(current,C),works=new Map(source.map(w=>[w.id,{...w}]));
 for(const [id,local]of next){const old=previous?.get(id),saved=works.get(id);
  if(!saved){works.set(id,local);continue;}
  // Una carga parcial o antigua del puesto no reemplaza la consulta común completa.
  if(!old)continue;
  for(const [k,v]of Object.entries(local))if(JSON.stringify(v)!==JSON.stringify(old[k]))saved[k]=v;
 }
 return{works:[...works.values()],local:next};
}
return{project,snapshot,merge};
});
