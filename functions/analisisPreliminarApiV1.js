'use strict';
const admin=require('firebase-admin'),C=require('./analisisPreliminarCoreV1');
let motherCache=null,motherReadAt=0;
async function motherRows(){
 if(motherCache&&Date.now()-motherReadAt<60000)return motherCache;
 const {google}=require('googleapis'),auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']}),sheets=google.sheets({version:'v4',auth});
 try{motherCache=await require('./baseMadreLayoutV1').readWorks(sheets,'1mOhuPKcMG8PO3QsY3g84WL4p3o43t4ilK8Jx1DHjF5M','Base de datos');motherReadAt=Date.now();return motherCache;}catch(e){throw Error('No se pudo leer TIZ 2026: '+e.message);}
}
async function ensure(db,input,recordId){
 let item=input;
 if(typeof input==='string'){const work=await db.collection('obras').doc(input).get();if(!work.exists)return null;const w=work.data();item={id:input,obraOperativaId:input,ot:String(w.ot||''),cliente:String(w.cliente||''),descripcion:String(w.desc||''),sourceRows:[],activa:C.active(w),aprobacion:w.analisisPreliminarAprobadoEn?.toDate?.().toISOString()||''};}
 const id=recordId||item.id,ref=db.collection('analisisPreliminares').doc(id);
 return db.runTransaction(async tx=>{const snap=await tx.get(ref),old=snap.exists?snap.data():null;let work=null;if(item.obraOperativaId){const ws=await tx.get(db.collection('obras').doc(item.obraOperativaId));if(!ws.exists||!C.active(ws.data()))return null;work=ws.data();}
 const known=work?.analisisPreliminarAprobadoEn?.toDate?.().toISOString()||item.aprobacion,at=known||new Date().toISOString();
 const identity={obraId:id,obraOperativaId:item.obraOperativaId||'',ot:item.ot,cliente:item.cliente,descripcion:item.descripcion,sourceRows:item.sourceRows||[],activa:true};
 const record=old||{aprobadoEn:at,venceEn:new Date(Date.parse(at)+C.LIMIT_MS).toISOString(),inicioTipo:known?'aprobacion':'habilitacion',reportes:{}};
 if(!old)tx.create(ref,{...identity,...record,fuente:known?'aprobacion-atomica':'habilitacion-inicial'});
 else if(['obraOperativaId','cliente','descripcion','ot'].some(k=>String(old[k]||'')!==String(identity[k]||''))||JSON.stringify(old.sourceRows||[])!==JSON.stringify(identity.sourceRows))tx.update(ref,identity);
 return {...record,...identity,inicioTipo:record.inicioTipo||'aprobacion'};
 });
}
async function list(db,user){
 const [works,saved,source]=await Promise.all([db.collection('obras').get(),db.collection('analisisPreliminares').get(),motherRows()]),previous=saved.docs.map(d=>({id:d.id,...d.data()})),items=C.workList(source,works.docs.map(d=>({id:d.id,...d.data()}))),obras=[];
 const resolved=await Promise.all(items.map(async item=>{const byId=previous.find(r=>r.id===item.id),matches=item.ot?previous.filter(r=>C.baseOt(r.ot)===item.ot):[],old=byId||(matches.length===1?matches[0]:null),same=old&&['obraOperativaId','cliente','descripcion','ot'].every(k=>String(old[k]||'')===String(item[k]||''))&&JSON.stringify(old.sourceRows||[])===JSON.stringify(item.sourceRows||[]),v=same?{...old,obraId:old.id,inicioTipo:old.inicioTipo||'aprobacion'}:await ensure(db,item,old?.id);if(!v)return null;const allowed=Object.keys(C.SECTORS).filter(s=>C.canWrite(user,s));return {...v,driveFolderUrl:item.driveFolderUrl||'',reportes:Object.fromEntries(allowed.map(s=>[s,C.reportFor(v.reportes,s)||null]))};}));obras.push(...resolved.filter(Boolean));
 return {ok:true,obras,servidorEn:new Date().toISOString(),sector:user.sector,isAdmin:user.isAdmin,sectoresAutorizados:Object.keys(C.SECTORS).filter(s=>C.canWrite(user,s))};
}
async function save(db,body,user){
 const id=String(body.obraId||''),sector=String(body.sector||'')==='cobranzas'?'facturacion':String(body.sector||'');if(!/^[\w-]{1,150}$/.test(id)||!C.canWrite(user,sector))throw Error('Obra o puesto no autorizado.');const ref=db.collection('analisisPreliminares').doc(id),pre=await ref.get();if(!pre.exists)throw Error('El análisis no está disponible. Volvé a abrir la obra.');const initial=pre.data(),workId=initial.obraOperativaId||(initial.fuente==='aprobacion-atomica'?id:'');
 if(!workId){const rows=await motherRows();if(!rows.some(r=>C.pendingState(r.status)&&(initial.ot?C.baseOt(r.ot)===C.baseOt(initial.ot):initial.sourceRows?.includes(r.row)&&String(r.cliente).trim()===initial.cliente)))throw Error('La obra ya no está pendiente en TIZ 2026. Actualizá el listado.');}
 return db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw Error('El análisis no está disponible.');const current=snap.data();if(workId){const ws=await tx.get(db.collection('obras').doc(workId));if(!ws.exists||!C.active(ws.data()))throw Error('La obra no tiene un análisis activo.');}const report=C.nextReport(C.reportFor(current.reportes,sector),body,user,sector,current,new Date().toISOString());tx.update(ref,{['reportes.'+sector]:report});tx.set(ref.collection('versiones').doc(sector+'-'+report.revision),{...report,sector});return {ok:true,reporte:report};});
}
async function handle(req,res){
 res.set('Cache-Control','no-store');
 try{const bearer=req.get('authorization')||'';if(!bearer.startsWith('Bearer '))return res.status(401).json({ok:false,error:'Iniciá sesión en TIZ.'});const token=await admin.auth().verifyIdToken(bearer.slice(7));let user;try{user=C.operator(token.email)}catch(e){return res.status(403).json({ok:false,error:e.message})}const db=admin.firestore(),body=req.body||{},mode=String(body.mode||'').replace(/^preliminary-/,'');if(mode==='weekly')return res.json(await require('./analisisIndicadoresV1').load(db,user,body.semana));if(mode==='list')return res.json(await list(db,user));if(mode==='save')return res.json(await save(db,body,user));throw Error('Operación inválida.');}
 catch(e){console.error('[TIZ análisis preliminar]',e.message);return res.status(e.status||400).json({ok:false,error:e.message||'No se pudo guardar el análisis.'});}
}
exports.handle=handle;
exports.ensure=ensure;

exports.motherRows=motherRows;
