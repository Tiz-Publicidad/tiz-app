'use strict';
const C=require('./analisisPreliminarCoreV1');
const text=v=>String(v??'').trim();
const labels=C.SECTORS;
const STATES=['Pendiente','En curso','Bloqueada','Terminada'];
const day=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
function isoDate(v){const s=text(v),m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:/^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
function due(fecha,hora){const d=isoDate(fecha),h=text(hora)||'09:00';if(!d||!/^([01]\d|2[0-3]):[0-5]\d$/.test(h))throw Error('Completá una fecha y hora válidas.');const v=new Date(d+'T'+h+':00-03:00');if(!Number.isFinite(v.getTime())||day(v)!==d)throw Error('La fecha no es válida.');return v.toISOString();}
function sectorKey(label){return Object.keys(labels).find(s=>C.norm(labels[s])===C.norm(label))||(['facturacion','cobranzas','facturacion y cobranzas'].includes(C.norm(label))?'facturacion':'');}
// Resolve saved task ownership after Fede's email change; authentication has no legacy alias.
function taskEmail(value){const email=text(value).toLowerCase();return email==='contrerasfedericogabriel@gmail.com'?'contrerasfedericograbriel365@gmail.com':email;}
function ownerOf(t){return taskEmail(t.asignadoA||t.responsableEmail);}
function canAccess(t,u){if(u.isAdmin)return true;const email=ownerOf(t);if(email)return !!C.USERS[email]&&C.canWrite(u,C.USERS[email]);const sector=sectorKey(t.sector);return !!sector&&C.canWrite(u,sector);}
function inAgenda(t,u){return t.origen==='clemen-secretaria'&&canAccess(t,u)&&(taskEmail(t.creadoPor)===u.email||ownerOf(t)===u.email);}
function project(id,t){let vence=text(t.venceEn);if(!Number.isFinite(Date.parse(vence))){try{vence=due(t.fecha,t.horaIni||t.hora)}catch(_){vence='';}}const estado=t.completada===true?'Terminada':STATES.includes(t.estado)?t.estado:'Pendiente';return {id,revision:Number(t.revision)||0,titulo:text(t.desc||t.titulo),notas:text(t.notas),ot:C.baseOt(t.obraOt||t.ot),cliente:text(t.cliente),asignadoA:ownerOf(t),sector:text(t.sector),estado,venceEn:vence,recordarEn:text(t.recordarEn)||vence,creadoPor:text(t.creadoPor),actualizadoPor:text(t.actualizadoPor),cerradoEn:text(t.cerradoEn),motivoBloqueo:text(t.motivoBloqueo),driveFolderUrl:C.driveFolder(t)};}
function clean(input,old,u,at,work){
 const titulo=text(input.titulo);if(!titulo||titulo.length>1500)throw Error('Escribí un encargo de hasta 1500 caracteres.');const notas=text(input.notas),motivo=text(input.motivo);if(notas.length>6000||motivo.length>2000)throw Error('Las notas o el motivo son demasiado largos.');
 const owner=taskEmail(input.asignadoA||ownerOf(old||{})||u.email);if(!C.USERS[owner]||!C.canWrite(u,C.USERS[owner]))throw Object.assign(Error('No podés asignar encargos a ese puesto.'),{status:403});
 const estado=text(input.estado)||'Pendiente';if(!STATES.includes(estado))throw Error('Estado inválido.');const venceEn=due(input.fecha,input.hora),recordarEn=due(input.recordarFecha||input.fecha,input.recordarHora||input.hora);
 const prev=old?project('',old):null,reprograma=!!prev&&prev.venceEn!==venceEn;if(reprograma&&!motivo)throw Error('Indicá por qué reprogramás el encargo.');if(estado==='Bloqueada'&&!motivo)throw Error('Indicá qué falta para resolver el bloqueo.');
 const ot=C.baseOt(input.ot);if(ot&&!work)throw Error('No se encontró esa OT. Elegí una obra del listado.');if(text(input.ot)&&!ot)throw Error('La OT no es válida.');
 const [y,m,d]=isoDate(input.fecha).split('-');
 return {desc:titulo,notas,obraOt:ot,obraId:work?.obraOperativaId||work?.id||'',cliente:work?.cliente||'',driveFolderUrl:work?.driveFolderUrl||'',asignadoA:owner,sector:old&&!ownerOf(old)&&old.sector&&owner===u.email?old.sector:labels[C.USERS[owner]],estado,fecha:`${Number(d)}/${Number(m)}/${y}`,horaIni:input.hora,horaFin:input.hora,venceEn,recordarEn,motivoBloqueo:estado==='Bloqueada'?motivo:'',completada:estado==='Terminada',completadaFecha:estado==='Terminada'?day(at).split('-').reverse().join('/'):'',cerradoEn:estado==='Terminada'?(old?.cerradoEn||at):'',revision:(Number(old?.revision)||0)+1,creadoEn:old?.creadoEn||at,creadoPor:old?.creadoPor||u.email,actualizadoEn:at,actualizadoPor:u.email,origen:old?.origen||'clemen-secretaria',ultimoMotivo:motivo};
}
module.exports={STATES,day,isoDate,due,sectorKey,ownerOf,canAccess,inAgenda,project,clean};


