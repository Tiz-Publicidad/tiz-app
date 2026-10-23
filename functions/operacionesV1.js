'use strict';
const C=require('./analisisPreliminarCoreV1');
const FEDE='contrerasfedericograbriel365@gmail.com';
const USERS=new Set([FEDE,'pablo.aciar@tizpublicidad.com','info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com']);
const text=v=>String(v??'').trim();
function authorize(email){email=text(email).toLowerCase();if(!USERS.has(email))throw Object.assign(Error('Sin permiso para Operaciones.'),{status:403});return email;}
const key=w=>w.ot?'ot-'+C.baseOt(w.ot):w.id;
function project(item,w={},saved={}){const p=w.sectores?.produccion||{};return {id:item.id,key:key(item),obraOperativaId:item.obraOperativaId,ot:item.ot,cliente:item.cliente,descripcion:item.descripcion,sourceRows:item.sourceRows,driveFolderUrl:item.driveFolderUrl,produccion:{estado:text(p.estado)||(w.fprod_r?'Terminada':'Pendiente'),compromiso:text(p.compromiso??w.fprod_c),real:text(p.real??w.fprod_r),responsable:text(p.responsable)||'Pablo',notas:text(p.notas)},operaciones:{revision:Number(saved.revision)||0,tareas:Array.isArray(saved.tareas)?saved.tareas.map(t=>t.responsable==='contrerasfedericogabriel@gmail.com'?{...t,responsable:FEDE}:t):[],notas:text(saved.notas),actualizadoEn:text(saved.actualizadoEn),actualizadoPor:text(saved.actualizadoPor)}};}
async function items(db){const [snap,source]=await Promise.all([db.collection('obras').get(),require('./analisisPreliminarApiV1').motherRows()]);const works=snap.docs.map(d=>({id:d.id,...d.data()}));return {works,queue:C.workList(source,works)};}
async function list(db,email){authorize(email);const [{works,queue},saved]=await Promise.all([items(db),db.collection('operacionesPlaneamiento').get()]);const records=new Map(saved.docs.map(d=>[d.id,d.data()]));return {ok:true,obras:queue.map(i=>project(i,works.find(w=>w.id===i.obraOperativaId),records.get(key(i)))),leidoEn:new Date().toISOString()};}
function clean(input,old,email,at){
 if(!Array.isArray(input.tareas)||input.tareas.length>100)throw Error('Cargá hasta 100 tareas.');
 const seen=new Set(),tareas=input.tareas.map(t=>{
  const id=text(t.id),tarea=text(t.tarea),fecha=text(t.fecha),estado=text(t.estado),pendiente=text(t.pendiente);
  if(!/^[\w-]{1,80}$/.test(id)||seen.has(id))throw Error('Identificador de tarea inválido o repetido.');seen.add(id);
  if(!tarea||tarea.length>1000||pendiente.length>3000)throw Error('Completá la tarea y revisá la extensión del pendiente.');
  if(!['Pendiente','En curso','Bloqueada','Terminada'].includes(estado))throw Error('Estado de tarea inválido.');
  if(fecha&&(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||new Date(fecha+'T12:00:00Z').toISOString().slice(0,10)!==fecha))throw Error('Fecha de tarea inválida.');
  if(estado==='Bloqueada'&&!pendiente)throw Error('Indicá qué falta para resolver la tarea bloqueada.');
  const prior=old?.tareas?.find(x=>x.id===id);return {id,tarea,fecha,estado,pendiente,responsable:FEDE,cerradoEn:estado==='Terminada'?(prior?.cerradoEn||at):''};
 });
 const notas=text(input.notas);if(notas.length>6000)throw Error('Las notas admiten hasta 6000 caracteres.');
 return {tareas,notas,revision:(Number(old?.revision)||0)+1,actualizadoPor:email,actualizadoEn:at};
}
async function save(db,body,email){
 email=authorize(email);const id=text(body.key);if(!/^[\w-]{1,150}$/.test(id))throw Error('Obra inválida.');const {queue}=await items(db),item=queue.find(w=>key(w)===id);if(!item)throw Error('La obra ya no está activa. Actualizá el listado.');
 return db.runTransaction(async tx=>{const ref=db.collection('operacionesPlaneamiento').doc(id),snap=await tx.get(ref),old=snap.exists?snap.data():null;if(Number(body.revision||0)!==(Number(old?.revision)||0))throw Object.assign(Error('El plan cambió. Actualizá antes de guardar.'),{status:409});const value=clean(body,old,email,new Date().toISOString());tx.set(ref,{...value,ot:item.ot,obraId:item.obraOperativaId||item.id});tx.set(ref.collection('versiones').doc(String(value.revision)),{...value});return {ok:true,operaciones:value};});
}
async function handle(req,res){res.set('Cache-Control','no-store');try{const header=req.get('authorization')||'';if(!header.startsWith('Bearer '))throw Object.assign(Error('Iniciá sesión en TIZ.'),{status:401});const admin=require('firebase-admin'),token=await admin.auth().verifyIdToken(header.slice(7)),email=authorize(token.email),db=admin.firestore();if(req.body?.mode==='operations-list')return res.json(await list(db,email));if(req.body?.mode==='operations-save')return res.json(await save(db,req.body,email));throw Error('Operación inválida.');}catch(e){return res.status(e.status||400).json({ok:false,error:e.message});}}
module.exports={FEDE,authorize,project,key,clean,list,save,handle};

