'use strict';
const admin=require('firebase-admin');
const {onRequest}=require('firebase-functions/v2/https');
const {onDocumentWritten}=require('firebase-functions/v2/firestore');
const C=require('./analisisPreliminarCoreV1');
if(!admin.apps.length)admin.initializeApp();
const ORIGINS=new Set(['https://tiz-publicidad.github.io','https://tiz---app.web.app','https://tiz---app.firebaseapp.com','https://tiz---app--facturacion-cobranzas-v2-n8fm9m8n.web.app']);
const projection=(id,w)=>({obraId:id,ot:String(w.ot||w.nroCotizacion||''),cliente:String(w.cliente||''),descripcion:String(w.desc||w.descripcion||''),activa:C.active(w)});
exports.analisisPreliminarAprobacionV1=onDocumentWritten({document:'obras/{obraId}',region:'us-central1',retry:true},async event=>{
 const before=event.data?.before.exists?event.data.before.data():null,after=event.data?.after.exists?event.data.after.data():null;
 const db=admin.firestore(),ref=db.collection('analisisPreliminares').doc(event.params.obraId);
 // Event time is the approval commit time, never the delayed trigger execution time.
 const at=event.data?.after.updateTime?.toDate().toISOString()||event.time;
 await db.runTransaction(async tx=>{const [snap,latest]=await Promise.all([tx.get(ref),tx.get(db.collection('obras').doc(event.params.obraId))]);const latestWork=latest.exists?latest.data():null;const latestAt=latest.updateTime?.toDate().toISOString()||at;if(!snap.exists){if(!C.isApproval(before,after))return;tx.create(ref,{...projection(event.params.obraId,latestWork||after),aprobadoEn:at,venceEn:new Date(Date.parse(at)+C.LIMIT_MS).toISOString(),reportes:{},fuente:'aprobacion-obra',obraActualizadaEn:latestAt,...(!latestWork?{activa:false}:{})});return;}
 // Out-of-order events must not restore an obsolete title or archived work.
 if(snap.data().obraActualizadaEn&&snap.data().obraActualizadaEn>latestAt)return;
 tx.update(ref,latestWork?{...projection(event.params.obraId,latestWork),obraActualizadaEn:latestAt}:{activa:false,obraActualizadaEn:latestAt});
 });
});
async function save(db,body,user){const id=String(body.obraId||''),sector=String(body.sector||'');if(!/^[\w-]{1,150}$/.test(id)||!C.canWrite(user,sector))throw Error('Obra o puesto no autorizado.');const ref=db.collection('analisisPreliminares').doc(id);return db.runTransaction(async tx=>{const [snap,work]=await Promise.all([tx.get(ref),tx.get(db.collection('obras').doc(id))]);if(!snap.exists||!work.exists||!C.active(work.data()))throw Error('La obra no tiene un análisis activo.');const current=snap.data();const report=C.nextReport(current.reportes?.[sector],body,user,sector,current,new Date().toISOString());tx.update(ref,{['reportes.'+sector]:report});tx.set(ref.collection('versiones').doc(sector+'-'+report.revision),{...report,sector});return {ok:true,reporte:report};});}
exports.analisisPreliminarV1=onRequest({region:'us-central1',invoker:'public',timeoutSeconds:60},async(req,res)=>{
 const origin=req.get('origin');if(ORIGINS.has(origin)){res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');}res.set('Access-Control-Allow-Headers','Authorization, Content-Type');res.set('Access-Control-Allow-Methods','POST, OPTIONS');res.set('Cache-Control','no-store');if(req.method==='OPTIONS')return res.status(204).send('');if(req.method!=='POST')return res.status(405).json({ok:false,error:'Usá POST.'});
 try{const bearer=req.get('authorization')||'';if(!bearer.startsWith('Bearer '))return res.status(401).json({ok:false,error:'Iniciá sesión en TIZ.'});const token=await admin.auth().verifyIdToken(bearer.slice(7));let user;try{user=C.operator(token.email)}catch(e){return res.status(403).json({ok:false,error:e.message})}const db=admin.firestore(),body=req.body||{};
 if(body.mode==='list'){const snap=await db.collection('analisisPreliminares').orderBy('aprobadoEn','desc').get();const obras=snap.docs.map(d=>{const v=d.data();return {...projection(d.id,{ot:v.ot,cliente:v.cliente,desc:v.descripcion,archivado:!v.activa}),aprobadoEn:v.aprobadoEn,venceEn:v.venceEn,reportes:user.isAdmin?v.reportes:{[user.sector]:v.reportes?.[user.sector]||null}}}).filter(w=>w.activa);return res.json({ok:true,obras,servidorEn:new Date().toISOString(),sector:user.sector,isAdmin:user.isAdmin});}
 if(body.mode==='save')return res.json(await save(db,body,user));throw Error('Operación inválida.');
 }catch(e){console.error('[TIZ análisis preliminar]',e.message);return res.status(400).json({ok:false,error:e.message||'No se pudo guardar el análisis.'});}
});
