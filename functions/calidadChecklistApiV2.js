'use strict';
const admin=require('firebase-admin'),PDFDocument=require('pdfkit'),crypto=require('node:crypto'),C=require('./calidadChecklistCoreV2');
const USERS={'info@tizpublicidad.com':'Ventas','giancarlo.pareja@tizpublicidad.com':'Ventas','pablo.aciar@tizpublicidad.com':'Producción','julieta.aguirre@tizpublicidad.com':'Diseño','carolina.flores@tizpublicidad.com':'Compras','cristiantizpublicidad@gmail.com':'Calidad'};
const ORIGINS=new Set(['https://tiz-publicidad.github.io','https://tiz---app.web.app','https://tiz---app.firebaseapp.com']);
const fail=(s,status=400)=>Object.assign(Error(s),{status});
async function operator(req){const h=req.get('authorization')||'';if(!h.startsWith('Bearer '))throw fail('Iniciá sesión en TIZ.',401);const token=await admin.auth().verifyIdToken(h.slice(7)),email=C.norm(token.email);if(!USERS[email])throw fail('Tu cuenta no tiene acceso a estos formularios.',403);return {email,sector:USERS[email],isAdmin:['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com'].includes(email),restrictedChecklists:email==='cristiantizpublicidad@gmail.com'};}
function keyFor(record){const identity=record.obraId?'obra:'+record.obraId:record.ot?'ot:'+record.ot:'referencia:'+C.norm(record.cliente)+'|'+C.norm(record.descripcion);return crypto.createHash('sha256').update(identity).digest('hex').slice(0,32);}
async function save(db,body,user,at=new Date().toISOString()){
 const input=body.formulario||{},stage=C.T(input.etapa);if(!C.STAGES[stage])throw fail('Etapa inválida.');
 const key=body.key?C.T(body.key):keyFor(input),id=C.docId(key,stage),ref=db.collection('calidadChecklists').doc(id);
 return db.runTransaction(async tx=>{
  const currentSnap=await tx.get(ref),current=currentSnap.exists?currentSnap.data():{},prevStage=C.PREVIOUS[stage],previousSnap=prevStage?await tx.get(db.collection('calidadChecklists').doc(C.docId(key,prevStage))):null,previous=previousSnap?.exists?previousSnap.data():null;
  // Frozen work identity prevents changing which OT an existing checklist belongs to.
  if(current.revision&&['obraId','ot','cliente','descripcion'].some(k=>C.T(current[k])!==C.T(input[k])))throw fail('La obra del checklist cambió. Abrí el formulario correcto.',409);
  if(previous&&['obraId','ot','cliente','descripcion'].some(k=>C.T(previous[k])!==C.T(input[k])))throw fail('Los formularios deben pertenecer a la misma obra.',409);
  let work=null;if(input.obraId){if(!/^[\w-]{1,150}$/.test(input.obraId))throw fail('Obra inválida.');const snap=await tx.get(db.collection('obras').doc(input.obraId));if(!snap.exists)throw fail('La obra ya no está disponible.',404);work=snap.data();if(work.archivado||work.revisionVigente===false||work.revisionOperativa===false)throw fail('La obra no está disponible para revisión.');if(C.T(work.ot)!==C.T(input.ot))throw fail('La OT no coincide con la obra.',409);}
  if(input.validar===true&&stage!=='produccion'&&work&&Object.values(work.calidadGestion?.registros||{}).some(r=>r.estado==='Pendiente'))throw fail('La obra tiene observaciones de Calidad pendientes.');
  if(input.validar===true&&previous){const beforePrev=C.PREVIOUS[prevStage];if(beforePrev){const ancestor=await tx.get(db.collection('calidadChecklists').doc(C.docId(key,beforePrev)));if(!ancestor.exists||ancestor.data().estado!=='Validado'||ancestor.data().revision!==previous.anteriorRevision)throw fail('Cambió la aprobación de Producción. Revisá la liberación para Colocación.');}}
  const record={...C.clean(input,user,at,current,previous),key,id};
  tx.set(ref,record);tx.set(ref.collection('versiones').doc(String(record.revision)),record);
  return {ok:true,key,id,record};
 });
}
function pdf(record,displayState){return new Promise((resolve,reject)=>{
 const doc=new PDFDocument({size:'A4',margin:42,bufferPages:true,info:{Title:'TIZ - '+C.STAGES[record.etapa]}}),chunks=[];doc.on('data',c=>chunks.push(c));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
 const width=511;let pages=0;
 function header(){pages++;doc.fillColor('#db2374').font('Helvetica-Bold').fontSize(28).text('TIZ',42,35);doc.fillColor('#555').font('Helvetica').fontSize(9).text('PUBLICIDAD · GESTIÓN DE CALIDAD',110,45);doc.strokeColor('#db2374').moveTo(42,78).lineTo(553,78).stroke();doc.y=93;}
 header();
 function ensure(h){if(doc.y+h>758){doc.addPage();header();}}
 function line(text,size=10,bold=false){doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size);const h=doc.heightOfString(C.T(text),{width});ensure(h+10);doc.fillColor('#222').text(C.T(text),42,doc.y,{width}).moveDown(.2);}
 line(C.STAGES[record.etapa],18,true);line('OT '+(record.ot||'Sin OT')+' · '+record.cliente,12,true);line(record.descripcion,11);
 const state=displayState||record.estado;line((state==='Validado'?'APROBADO':'NO LIBERADO · '+state.toUpperCase())+' · Revisión '+record.revision,11,true);
 line('Fecha: '+record.fecha+'   |   Preparó: '+record.preparadoPor+'   |   Seguimiento: '+record.seguimiento);
 if(record.anteriorEtapa)line('Etapa anterior: '+C.STAGES[record.anteriorEtapa]+' · revisión '+record.anteriorRevision,9);
 line('Alcance de esta obra',12,true);line(record.alcance||'Sin completar');if(record.referenciaPlano){line('Plano / archivo de referencia',11,true);line(record.referenciaPlano);}
 doc.moveDown(.5);
 record.items.forEach((item,i)=>{
  doc.font('Helvetica').fontSize(10);const h=doc.heightOfString(item.titulo,{width:460})+doc.heightOfString('Criterio: '+(item.criterio||'Por definir'),{width:460})+(item.nota?doc.heightOfString('Observación: '+item.nota,{width:460}):0)+32;
  ensure(Math.min(h,600));const y=doc.y;doc.rect(42,y,12,12).strokeColor('#aaa').stroke();doc.font('Helvetica-Bold').fontSize(11).fillColor('#222').text((i+1)+'. '+item.titulo,64,y,{width:489});doc.y=Math.max(doc.y,y+15);line('Estado: '+item.estado,9,true);line('Criterio: '+(item.criterio||'Por definir'));if(item.nota)line('Observación: '+item.nota);doc.moveDown(.15);doc.strokeColor('#ddd').moveTo(42,doc.y).lineTo(553,doc.y).stroke();doc.moveDown(.3);
 });
 if(record.observaciones){line('Observaciones y pendientes',12,true);line(record.observaciones);}if(record.evidencia){line('Evidencia / fotos',12,true);line(record.evidencia,9);}if(record.conformidad){line('Resultado / conformidad',12,true);line(record.conformidad);}
 line('Registro: '+record.creadoPor+' · '+record.creadoEn,8);if(record.validadoPor)line('Aprobó: '+record.validadoPor+' · '+record.validadoEn,8);
 ensure(30);doc.moveDown(.5);line('Firma / aclaración: ___________________________________________________',10);
 const range=doc.bufferedPageRange();for(let p=range.start;p<range.start+range.count;p++){doc.switchToPage(p);doc.font('Helvetica').fontSize(8).fillColor('#777').text('TIZ · Checklist por obra · '+(p+1)+' / '+range.count,42,785,{width,align:'right',lineBreak:false});}doc.end();
});}
const FORM_FIELDS=['key','etapa','estado','revision','fecha','creadoEn','creadoPor','obraId','ot','cliente','descripcion','alcance','referenciaPlano','preparadoPor','seguimiento','observaciones','evidencia','conformidad','items','anteriorEtapa','anteriorRevision','validadoPor','validadoEn'];
function projectChecklist(d){const r=d.data();return {...Object.fromEntries(FORM_FIELDS.filter(k=>r[k]!==undefined).map(k=>[k,r[k]])),id:d.id};}
async function read(db,body){const id=C.docId(C.T(body.key),C.T(body.etapa)),ref=db.collection('calidadChecklists').doc(id),revision=Number(body.revision||0),snap=revision?await ref.collection('versiones').doc(String(revision)).get():await ref.get();if(!snap.exists)throw fail('El checklist no está guardado.',404);return snap.data();}
async function handle(req,res){
 const origin=req.get('origin');if(ORIGINS.has(origin)){res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');}res.set('Access-Control-Allow-Headers','Authorization, Content-Type');res.set('Access-Control-Allow-Methods','POST, OPTIONS');if(req.method==='OPTIONS')return res.status(204).send('');if(req.method!=='POST')return res.status(405).json({ok:false,error:'Usá POST.'});
 try{const user=await operator(req),db=admin.firestore(),mode=C.T(req.body?.mode).replace(/^quality-checklist-/, '');if(mode==='record-save')return res.json(await require('./calidadPortalV1').saveRecord(db,req.body,user));if(mode==='list'){const [quality,forms]=await Promise.all([require('./calidadPortalV1').list(db),db.collection('calidadChecklists').get()]);return res.json({ok:true,...quality,checklists:forms.docs.map(projectChecklist)});}if(mode==='mother'){const {google}=require('googleapis'),auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']}),sheets=google.sheets({version:'v4',auth});const rows=await require('./baseMadreLayoutV1').readWorks(sheets,'1mOhuPKcMG8PO3QsY3g84WL4p3o43t4ilK8Jx1DHjF5M','Base de datos');return res.json({ok:true,rows:rows.filter(r=>['pendiente','cobrado pendiente'].includes(C.norm(r.status))&&(r.ot||r.desc||r.cliente)),leidoEn:new Date().toISOString()});}if(mode==='save')return res.json(await save(db,req.body,user));if(mode==='pdf'){const record=await read(db,req.body),records={};for(const stage of Object.keys(C.STAGES)){const s=await db.collection('calidadChecklists').doc(C.docId(record.key,stage)).get();if(s.exists)records[stage]=s.data();}const data=await pdf(record,records[record.etapa]?.revision!==record.revision?'Versión histórica - '+record.estado:C.status(record,records));res.set('Content-Type','application/pdf');res.set('Cache-Control','no-store');res.set('Content-Disposition','attachment; filename="TIZ-OT-'+(record.ot.replace(/[^0-9.-]/g,'')||'sin-OT')+'-'+record.etapa+'-R'+record.revision+'.pdf"');return res.send(data);}throw fail('Operación inválida.');}
 catch(e){return res.status(e.status||400).json({ok:false,error:e.message||'No se pudo guardar el checklist.'});}
}
exports.handle=handle;

