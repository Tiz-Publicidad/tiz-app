'use strict';
const C=require('./obrasSeguimientoCoreV2');
// Consulta operativa común. No devuelve importes, datos fiscales, adjuntos ni contactos.
const USERS=Object.freeze(['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com','pablo.aciar@tizpublicidad.com','julieta.aguirre@tizpublicidad.com','carolina.flores@tizpublicidad.com','cristiantizpublicidad@gmail.com','arielbenitezpublicidad@gmail.com','contrerasfedericograbriel365@gmail.com']);
const ORIGINS=new Set(['https://tiz-publicidad.github.io','https://tiz---app.web.app','https://tiz---app.firebaseapp.com']);
const text=v=>String(v??'').trim(),fail=(m,s)=>Object.assign(Error(m),{status:s});
const dates=['produccionPrevista','colocacionPrevista','produccionReal','colocacionReal','cierreFecha','retrabajoResueltoFecha'];
function projectWork(d){const w=d.data(),s=w.obraSeguimientoV2||{},tracking={};
 for(const k of dates)tracking[k]=C.iso(s[k]);
 for(const k of ['planificadoPorCalidad','calidadAprobada','produccionPlanificada','retrabajoResuelto'])tracking[k]=s[k]===true;
 for(const k of ['version','planRevision','avisoDias'])tracking[k]=Number(s[k])||0;
 for(const k of ['cierreResultado','retrabajoDetalle','actualizadoEn'])tracking[k]=text(s[k]);
 // Campos ausentes conservan los aliases históricos que usa el listado agrupado.
 for(const k of dates)if(s[k]==null)delete tracking[k];
 return {id:d.id,ot:text(w.ot),cliente:text(w.cliente),desc:text(w.desc||w.descripcion),estado:text(w.estado),fechaAltaObra:C.iso(w.fechaAltaObra||w.fecha||w.fechaAprobacion)||C.iso(w._ts),semanaVenta:Number(w.semanaVenta??w.semana)||0,fprod_c:C.iso(w.fprod_c??w.gestionSectores?.produccion?.compromiso),fprod_r:C.iso(w.fprod_r),fcol_c:C.iso(w.fcol_c??w.gestionSectores?.colocaciones?.compromiso),fcol_r:C.iso(w.fcol_r),obraSeguimientoV2:tracking,archivado:!!w.archivado,revisionVigente:w.revisionVigente!==false,revisionOperativa:w.revisionOperativa!==false};
}
async function operator(req,admin){const h=req.get('authorization')||'';if(!h.startsWith('Bearer '))throw fail('Iniciá sesión en TIZ.',401);const token=await admin.auth().verifyIdToken(h.slice(7)),email=text(token.email).toLowerCase();if(!USERS.includes(email))throw fail('Tu cuenta no tiene acceso a TIZ.',403);return email;}
async function handle(req,res,admin=require('firebase-admin')){
 try{if(req.method!=='POST')throw fail('Método no permitido.',405);const origin=req.get('origin');if(origin&&!ORIGINS.has(origin))throw fail('Origen no permitido.',403);await operator(req,admin);if(req.body?.mode!=='obras-consulta-list')throw fail('Esta consulta sólo permite leer Obras.',400);const snap=await admin.firestore().collection('obras').get();return res.json({ok:true,obras:snap.docs.map(projectWork)});}catch(e){return res.status(e.status||500).json({ok:false,error:e.message||'No se pudo consultar Obras.'});}
}
module.exports={USERS,projectWork,operator,handle};
