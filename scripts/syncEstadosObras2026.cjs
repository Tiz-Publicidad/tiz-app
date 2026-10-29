'use strict';
const crypto=require('node:crypto');
const text=v=>String(v??'').trim();
const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const ot=v=>text(v).replace(/^(OT|CT)\s*/i,'').replace(/^0+(?=\d)/,'').replace(/\s+/g,' ');
const STATES=new Map(['Pendiente','Enviado','Aprobado','Entregado','Cobrado pendiente','Cobrado'].map(s=>[norm(s),s]));
const active=o=>!o.archivado&&o.revisionVigente!==false&&o.revisionOperativa!==false;
const identity=o=>JSON.stringify([ot(o.ot),norm(o.cliente),norm(o.desc||o.descripcion)]);
const hash=rows=>crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
function plan(rows,works){
 const source=rows.filter(r=>text(r.ot)&&text(r.cliente)&&STATES.has(norm(r.status))),by=new Map(),used=new Set();
 for(const r of source){const k=JSON.stringify([ot(r.ot),norm(r.cliente)]);if(!by.has(k))by.set(k,[]);by.get(k).push(r);}
 const updates=[],unchanged=[],ambiguous=[],unmatched=[];
 for(const w of works.filter(active)){
  let candidates=by.get(JSON.stringify([ot(w.ot),norm(w.cliente)]))||[];
  if(!candidates.length){unmatched.push(w.id);continue;}
  const exact=candidates.filter(r=>norm(r.desc)===norm(w.desc||w.descripcion));
  if(exact.length)candidates=exact;
  const states=new Set(candidates.map(r=>STATES.get(norm(r.status))));
  if(states.size!==1){ambiguous.push({id:w.id,rows:candidates.map(r=>r.row)});continue;}
  candidates.forEach(r=>used.add(r.row));
  const entry={id:w.id,before:w.estado??null,after:[...states][0],identity:identity(w),rows:candidates.map(r=>r.row).sort((a,b)=>a-b)};
  (text(w.estado)===entry.after?unchanged:updates).push(entry);
 }
 return {updates,unchanged,ambiguous,unmatched,source,unmatchedRows:source.filter(r=>!used.has(r.row)).map(r=>r.row),invalidRows:rows.filter(r=>(r.ot||r.desc||r.cliente||r.status)&&!source.includes(r)).map(r=>r.row)};
}
async function apply(db,p,sourceHash,actor,runId){
 let updated=0,conflicts=0;
 for(const entry of p.updates){
  const changed=await db.runTransaction(async tx=>{
   const ref=db.collection('obras').doc(entry.id),snap=await tx.get(ref);if(!snap.exists)return false;
   const w=snap.data();if(!active(w)||identity(w)!==entry.identity||(w.estado??null)!==entry.before)return false;
   const at=new Date().toISOString(),audit=db.collection('auditoriaEstadosObras2026').doc(runId+'-'+entry.id);
   tx.create(audit,{obraId:entry.id,antes:entry.before,despues:entry.after,estadoPlanilla2026Anterior:w.estadoPlanilla2026??null,filas:entry.rows,sourceHash,fecha:at,operador:actor});
   tx.update(ref,{estado:entry.after,estadoPlanilla2026:{estado:entry.after,filas:entry.rows,spreadsheetId:'1mOhuPKcMG8PO3QsY3g84WL4p3o43t4ilK8Jx1DHjF5M',hoja:'Base de datos',sourceHash,actualizadoEn:at,actualizadoPor:actor}});
   return true;
  });if(changed)updated++;else conflicts++;
 }
 return {updated,conflicts};
}
async function main(){
 const {createRequire}=require('node:module'),path=require('node:path'),req=createRequire(path.resolve(__dirname,'../functions/package.json'));
 const admin=req('firebase-admin'),{google}=req('googleapis'),layout=require('../functions/baseMadreLayoutV1');
 if(!admin.apps.length)admin.initializeApp({projectId:'tiz---app'});
 const sheets=google.sheets({version:'v4',auth:new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})});
 const read=()=>layout.readWorks(sheets,'1mOhuPKcMG8PO3QsY3g84WL4p3o43t4ilK8Jx1DHjF5M','Base de datos');
 const rows=await read(),sourceHash=hash(rows),snapshot=await admin.firestore().collection('obras').limit(5001).get();
 if(snapshot.size>5000)throw Error('LIMIT');
 const works=snapshot.docs.map(d=>({...d.data(),id:d.id})),p=plan(rows,works);
 console.log(JSON.stringify({sourceHash,obras:works.length,filasValidas:p.source.length,actualizar:p.updates.length,sinCambios:p.unchanged.length,obrasAmbiguas:p.ambiguous.length,obrasSinCoincidencia:p.unmatched.length,filasSinCoincidencia:p.unmatchedRows,filasSinDatosValidos:p.invalidRows}));
 if(process.env.APPLY_ESTADOS!=='true')return;
 if(!process.env.EXPECTED_SOURCE_SHA||process.env.EXPECTED_SOURCE_SHA!==sourceHash||hash(await read())!==sourceHash)throw Error('SOURCE_CHANGED');
 const result=await apply(admin.firestore(),p,sourceHash,process.env.GITHUB_ACTOR||'sincronizacion-autorizada',crypto.randomUUID());
 const after=await admin.firestore().collection('obras').limit(5001).get(),fresh=new Map(after.docs.map(d=>[d.id,d.data()]));
 const verified=p.updates.filter(e=>fresh.get(e.id)?.estado===e.after).length;
 console.log(JSON.stringify({...result,verificados:verified,fuenteSinCambios:hash(await read())===sourceHash}));
 if(verified!==result.updated||result.conflicts)process.exitCode=2;
}
module.exports={plan,apply,hash,identity};
if(require.main===module)main().catch(error=>{console.error('No se completó la sincronización:',error.code||error.message?.replace(/[^A-Z_]/g,'').slice(0,80)||'ERROR');process.exitCode=1;});

