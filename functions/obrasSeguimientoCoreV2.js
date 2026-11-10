/* Identidad por OT y seguimiento operativo. Compartido por servidor e interfaz. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZObrasSeguimientoCoreV2=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const STATES=['Cobrado','Cobrado pendiente','Pendiente','Entregado','Baja'];
const REPLAN_REASONS=Object.freeze([
 ['cliente','Cliente / aprobación'],['diseno','Diseño / información faltante'],
 ['materiales','Materiales / insumos'],['proveedor','Proveedor externo'],
 ['capacidad','Capacidad / personal'],['planificacion','Planificación / coordinación'],
 ['calidad','Calidad / retrabajo'],['logistica','Logística / transporte'],
 ['acceso','Acceso / condiciones de obra'],['clima','Clima'],
 ['otro','Otro'],['investigacion','En investigación']
]);
function replanHistory(members){const events=new Map();for(const o of members)for(const e of o.obraSeguimientoV2?.reprogramaciones||[]){
 if(!e||!Array.isArray(e.cambios)||!e.id)continue;
 const old=events.get(e.id);if(!old)events.set(e.id,{...e,cambios:e.cambios.map(c=>({...c}))});
 else for(const c of e.cambios)if(!old.cambios.some(x=>x.etapa===c.etapa&&x.anterior===c.anterior&&x.nueva===c.nueva))old.cambios.push({...c});
 }return [...events.values()].sort((a,b)=>T(a.fecha).localeCompare(T(b.fecha))||T(a.id).localeCompare(T(b.id)));}
const T=v=>String(v??'').trim(),norm=v=>T(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const ot=v=>T(v).replace(/^0+(?=\d)/,'').replace(/\s+/g,'').replace(/,/g,'.').toLowerCase();
const base=v=>{const m=ot(v).match(/^\d{4,7}/);return m?String(Number(m[0])):'';};
const day=(now=new Date())=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),get=k=>p.find(x=>x.type===k).value;return get('year')+'-'+get('month')+'-'+get('day');};
function iso(v){let s=T(v),y,m,d;if(!s)return'';if(v?.toDate)return day(v.toDate());if(/^\d{4}-\d{2}-\d{2}T/.test(s))s=s.slice(0,10);let a=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(a)[,y,m,d]=a;else{a=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!a)return'';[,d,m,y]=a;if(Number(y)<100)y=2000+Number(y);}const z=new Date(Date.UTC(+y,+m-1,+d));return z.getUTCFullYear()===+y&&z.getUTCMonth()===+m-1&&z.getUTCDate()===+d?z.toISOString().slice(0,10):'';}
const state=v=>STATES.includes(T(v))?T(v):'Pendiente';
const canPlan=u=>!!u&&(u.isAdmin||u.sector==='Calidad'||['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com'].includes(T(u.email).toLowerCase()));
const canProduction=u=>canPlan(u)||T(u?.email).toLowerCase()==='pablo.aciar@tizpublicidad.com';
const canSync=u=>['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com','pablo.aciar@tizpublicidad.com'].includes(T(u?.email).toLowerCase());
const EDITABLE_STATES=['Pendiente','Entregado','Cobrado pendiente','Cobrado'];
const canStatus=u=>['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com','pablo.aciar@tizpublicidad.com','carolina.flores@tizpublicidad.com'].includes(T(u?.email).toLowerCase());
function statusPatch(work,estado,user,at=new Date().toISOString()){
 if(!canStatus(user))throw Error('Tu cuenta no puede modificar el estado de Obras.');
 if(isBaja(work)||!active(work))throw Error('La obra ya no está activa. Actualizá el listado.');
 if(!EDITABLE_STATES.includes(estado))throw Error('Elegí un estado válido para la obra.');
 return {estado,cobr:estado,estadoGestionV1:{estado,anterior:T(work.estado),fecha:at,usuario:T(user.email)}};
}
const active=o=>(!o.archivado||isBaja(o))&&o.revisionVigente!==false&&o.revisionOperativa!==false;
const isBaja=o=>o?.bajaObra?.activa===true||norm(o?.estado)==='baja';
const canBaja=u=>!!u&&(u.sector==='Ventas'||['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com'].includes(T(u.email).toLowerCase()));
function stageSignal(g,phase,label,today=day()){
 const planned=iso(g[phase+'Prevista']),real=iso(g.seguimiento?.[phase+'Real']);
 if(!planned)return {color:'',label:'Sin fecha prevista'};
 const remaining=days(planned,today);
 // El compromiso futuro conserva su aviso de calendario, sin verde anticipado.
 if(remaining>2)return {color:'gray',label:label+' pendiente · fecha prevista: '+planned};
 if(remaining>0)return {color:'yellow',label:label+' próxima a vencer · fecha prevista: '+planned};
 if(real&&real<=today)return real<=planned?{color:'green',label:label+' cumplida en fecha · Real: '+real}:{color:'red',label:label+' cumplida con atraso · Real: '+real};
 return {color:'red',label:label+(remaining===0?' vence hoy':' vencida')+' · falta registrar fecha real'};
}
function productionSignal(g,today=day()){return stageSignal(g,'produccion','Producción',today);}
function placementSignal(g,today=day()){return stageSignal(g,'colocacion','Colocación',today);}
function bajaPatch(work,motivo,user,reactivar=false,at=new Date().toISOString()){
 if(!canBaja(user))throw Error('Solo Ventas puede dar de baja o reactivar trabajos desde Presupuestos.');
 motivo=T(motivo);if(motivo.length<3||motivo.length>1000)throw Error('Indicá un motivo de entre 3 y 1000 caracteres.');
 if(reactivar&&!isBaja(work))throw Error('La obra ya está activa. Actualizá el listado.');
 if(!reactivar&&isBaja(work))throw Error('La obra ya está dada de baja. Actualizá el listado.');
 const old=work.bajaObra||{},estado=reactivar?(old.estadoAnterior&&old.estadoAnterior!=='Baja'?old.estadoAnterior:'Pendiente'):'Baja';
 const event={accion:reactivar?'reactivacion':'baja',motivo,fecha:at,usuario:T(user.email),estadoAnterior:T(work.estado),estadoNuevo:estado};
 return {estado,archivado:reactivar?!!old.archivadoAnterior:true,bajaObra:reactivar?{...old,activa:false,reactivadaEn:at,reactivadaPor:T(user.email),motivoReactivacion:motivo}:{activa:true,motivo,fecha:at,usuario:T(user.email),estadoAnterior:T(work.estado)||'Pendiente',archivadoAnterior:!!work.archivado},historialBajaObra:[...(Array.isArray(work.historialBajaObra)?work.historialBajaObra:[]),event]};
}
function family(v){const n=norm(v);if(n==='gtl'||n==='getthelook')return'getthelook';if(n==='kpl'||n==='kplconstructora'||n==='kplminiso')return'kpl';if(n==='yale'||n==='yalehid')return'yale';if(n==='fernahnossaxtiro'||n==='xtirofernahnos')return'fernahnos';if(n==='jumbaly'||n==='jumbalay')return'jumbalay';return n;}
function aggregateStatus(rows){const states=rows.map(r=>T(r.estado));if(states.length&&states.every(s=>s==='Cobrado'))return'Cobrado';const saldo=rows.filter(r=>/\bsaldo\b/i.test(r.desc));if(saldo.length&&new Set(saldo.map(r=>r.estado)).size===1)return state(saldo[0].estado);for(const s of ['Pendiente','Cobrado pendiente','Entregado'])if(states.includes(s))return s;return'Pendiente';}
function references(data){
 if(!Array.isArray(data?.rows)||data.firstRow!==2)throw Error('La referencia de obras no tiene encabezados válidos.');
 const h=data.rows[0]||[],find=(names,required=true)=>{const hits=h.flatMap((v,i)=>names.includes(norm(v))?[i]:[]);if(required&&hits.length!==1)throw Error('Revisar la columna '+names[0]+' en la referencia.');return hits.length===1?hits[0]:-1;};
 const col={ot:find(['otct','ot']),desc:find(['descripciondelaobra','descripcion']),cliente:find(['cliente']),alta:find(['fecha']),semana:find(['sem','semana']),prod:find(['fdeprod']),col:find(['fcol']),estado:find(['status','estado'])};
 return data.rows.slice(1).map((r,i)=>({row:i+3,ot:T(r[col.ot]),desc:T(r[col.desc]),cliente:T(r[col.cliente]),fechaAlta:iso(r[col.alta]),semana:Number(r[col.semana])||0,produccionPrevista:iso(r[col.prod]),colocacionPrevista:iso(r[col.col]),estado:T(r[col.estado])})).filter(r=>r.ot||r.desc||r.cliente);
}

function instant(value){
 if(value?.toMillis){const n=value.toMillis();return Number.isFinite(n)?n:0;}
 if(value?.toDate)return instant(value.toDate());
 if(value instanceof Date)return Number.isFinite(value.getTime())?value.getTime():0;
 const seconds=value?.seconds??value?._seconds;if(Number.isFinite(seconds))return seconds*1000+(Number(value.nanoseconds??value._nanoseconds)||0)/1e6;
 const s=T(value);if(/^\d{4}-\d{2}-\d{2}T/.test(s)){const n=Date.parse(s);return Number.isFinite(n)?n:0;}
 const date=iso(s);return date?Date.parse(date+'T00:00:00-03:00'):0;
}
function approvalStamp(work={}){const n=instant(work.fechaAprobacion)||instant(work.insumosVentasAprobados?.aprobadoEn);return n?new Date(n).toISOString():'';}
function approvalTime(work={}){return instant(approvalStamp(work))||instant(work.fechaAltaObra)||instant(work.fechaAlta)||instant(work.fecha)||instant(work._ts);}
function approvalWeek(work={}){
 const stamp=approvalStamp(work);let date=stamp?day(new Date(stamp)):'';
 if(!date){const saved=[work.semanaVenta,work.semana].map(Number).find(n=>Number.isInteger(n)&&n>=1&&n<=53);if(saved)return saved;date=iso(work.fechaAltaObra)||iso(work.fechaAlta)||iso(work.fecha)||iso(work._ts);}
 if(!date)return 0;const d=new Date(date+'T12:00:00Z'),dow=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-dow);d.setUTCHours(0,0,0,0);return Math.ceil(((d-new Date(Date.UTC(d.getUTCFullYear(),0,1)))/86400000+1)/7);
}
function compareApproved(a,b){return approvalTime(b)-approvalTime(a)||T(a.cliente).localeCompare(T(b.cliente),'es')||T(a.id||a.key).localeCompare(T(b.id||b.key));}

function grouped(works=[]){
 const map=new Map();for(const o of works.filter(active)){const key=ot(o.ot)?ot(o.ot)+'|'+family(o.cliente):'sin-ot:'+o.id;const a=map.get(key)||[];a.push(o);map.set(key,a);}
 return [...map.entries()].map(([key,members])=>{
   members.sort((a,b)=>T(b.obraSeguimientoV2?.actualizadoEn).localeCompare(T(a.obraSeguimientoV2?.actualizadoEn))||Number(/\b(anticipo|saldo)\b/i.test(a.desc||''))-Number(/\b(anticipo|saldo)\b/i.test(b.desc||''))||T(a.id).localeCompare(T(b.id)));
   const o=members[0],s=o.obraSeguimientoV2||{},alta=iso(o.fechaAltaObra||o.fecha||o.fechaAprobacion)||iso(o._ts),prod=iso(s.produccionPrevista??o.fprod_c??o.gestionSectores?.produccion?.compromiso),col=iso(s.colocacionPrevista??o.fcol_c??o.gestionSectores?.colocaciones?.compromiso);
   const estados=members.map(m=>({estado:state(m.estado),desc:m.desc||m.descripcion||''}));
   const cancelled=members.find(isBaja),approved=Math.max(0,...members.map(m=>instant(approvalStamp(m))));
   return {key,id:o.id,ids:members.map(m=>m.id),versions:Object.fromEntries(members.map(m=>[m.id,Number(m.obraSeguimientoV2?.version)||0])),ot:T(o.ot),desc:T(o.desc||o.descripcion),cliente:T(o.cliente),estado:cancelled?'Baja':aggregateStatus(estados),bajaObra:cancelled?.bajaObra||null,fechaAprobacion:approved?new Date(approved).toISOString():'',fechaAlta:alta,semana:approvalWeek({...o,fechaAprobacion:approved?new Date(approved).toISOString():o.fechaAprobacion}),produccionPrevista:prod,colocacionPrevista:col,seguimiento:{...s,reprogramaciones:replanHistory(members),produccionPrevista:prod,colocacionPrevista:col,produccionReal:iso(s.produccionReal??o.fprod_r),colocacionReal:iso(s.colocacionReal??o.fcol_r)},members};
 }).sort(compareApproved);
}
function clientAliases(group,clients=[]){const result=new Set([family(group.cliente)]);for(const c of clients){const names=[c.nombre,c.razonSocial,c.razon_social,c.nombreFiscal].map(family).filter(Boolean);if(names.some(n=>result.has(n))||group.members.some(m=>m.clienteId===c.id))names.forEach(n=>result.add(n));}return result;}
function linkReference(groups,rows,clients=[]){
 return groups.map(g=>{const aliases=clientAliases(g,clients),sameOt=rows.filter(r=>ot(r.ot)===ot(g.ot)&&r.ot),byClient=sameOt.filter(r=>aliases.has(family(r.cliente))||!r.cliente&&norm(g.desc).includes(norm(r.desc))&&norm(r.desc).length>10);
   let matches=byClient;if(!matches.length&&sameOt.length&&new Set(sameOt.map(r=>family(r.cliente))).size===1&&sameOt.every(r=>family(r.cliente).startsWith(family(g.cliente))&&family(g.cliente).length>7))matches=sameOt;
   if(!matches.length&&base(g.ot)){const variants=new Set(groups.filter(x=>base(x.ot)===base(g.ot)&&family(x.cliente)===family(g.cliente)).map(x=>ot(x.ot)));const sourceVariants=new Set(rows.filter(r=>base(r.ot)===base(g.ot)&&aliases.has(family(r.cliente))).map(r=>ot(r.ot)));if(variants.size===1&&sourceVariants.size===1)matches=rows.filter(r=>base(r.ot)===base(g.ot)&&aliases.has(family(r.cliente)));}
   return {group:g,rows:matches};
 });
}
function referencePlan(works,source,clients=[],at=new Date().toISOString()){
 const groups=grouped(works),links=linkReference(groups,source,clients),updates=[],unmatched=[];
 for(const {group:g,rows} of links){if(g.estado==='Baja')continue;if(!rows.length){unmatched.push({ot:g.ot,cliente:g.cliente,id:g.id});continue;}
   const first=[...rows].filter(r=>r.fechaAlta).sort((a,b)=>a.fechaAlta.localeCompare(b.fechaAlta))[0]||rows[0],validStates=rows.filter(r=>STATES.includes(r.estado)),status=validStates.length?aggregateStatus(validStates):null;
   const uniqueDate=field=>{const d=[...new Set(rows.map(r=>r[field]).filter(Boolean))];return d.length===1?d[0]:null;};
   for(const o of g.members){const p={...(status?{estado:status,cobr:status}:{}),referenciaGoogle2026:{filas:rows.map(r=>r.row),leidaEn:at,estado:status||T(o.estado),ot:rows[0].ot}};
     if(o.fechaAltaObraOrigen!=='aprobacion'){if(first.fechaAlta)p.fechaAltaObra=first.fechaAlta;if(first.semana){p.semanaVenta=first.semana;p.semana=first.semana;}}
     for(const [field,root] of [['produccionPrevista','fprod_c'],['colocacionPrevista','fcol_c']]){const value=uniqueDate(field);if(value!==null&&!o.obraSeguimientoV2?.planificadoPorCalidad){p[root]=value;p['obraSeguimientoV2.'+field]=value;p['gestionSectores.'+(field==='produccionPrevista'?'produccion':'colocaciones')+'.compromiso']=value;}}
     if(['fprod_c','fcol_c'].some(k=>k in p&&p[k]!==iso(o[k]))){p['obraSeguimientoV2.version']=(Number(o.obraSeguimientoV2?.version)||0)+1;p['obraSeguimientoV2.calidadAprobada']=false;p['obraSeguimientoV2.produccionPlanificada']=false;}
     updates.push({id:o.id,patch:p,sourceRows:rows.map(r=>r.row)});
   }
 }
 return {groups:groups.length,linked:links.filter(x=>x.rows.length).length,updates,unmatched};
}
function trackingPatch(work,input,user,at=new Date().toISOString(),today=day(),eventId=''){
 if(isBaja(work))throw Error('La obra está dada de baja. Reactivala antes de modificar su seguimiento.');
 if(!canProduction(user))throw Error('Calidad administra las fechas y el cierre; Producción confirma su planificación y fecha real.');
 const old=work.obraSeguimientoV2||{},s={...old},allowed=['produccionPrevista','colocacionPrevista','avisoDias','calidadAprobada','produccionPlanificada','produccionReal','colocacionReal','cierreResultado','cierreFecha','retrabajoDetalle','retrabajoResuelto','retrabajoResueltoFecha','reprogramacionMotivo','reprogramacionDetalle'];
 for(const k of Object.keys(input))if(!allowed.includes(k))throw Error('Campo de seguimiento inválido: '+k);
 if(!canPlan(user)&&Object.keys(input).some(k=>!['produccionPlanificada','produccionReal'].includes(k)))throw Error('Las fechas previstas, la aprobación y el cierre los registra Calidad.');
 for(const [k,v] of Object.entries(input)){
   if(k==='reprogramacionMotivo'||k==='reprogramacionDetalle')continue;
   if(['calidadAprobada','produccionPlanificada','retrabajoResuelto'].includes(k)){if(typeof v!=='boolean')throw Error('Confirmación inválida.');s[k]=v;}
   else if(k==='avisoDias'){if(![1,2].includes(Number(v)))throw Error('Elegí aviso con 1 o 2 días.');s[k]=Number(v);}
   else if(k.endsWith('Prevista')||k.endsWith('Real')||k.endsWith('Fecha')){if(T(v)&&!iso(v))throw Error('Fecha inválida.');s[k]=iso(v);}
   else{s[k]=T(v);if(s[k].length>3000)throw Error('El detalle es demasiado largo.');}
 }
 const prod=s.produccionPrevista??iso(work.fprod_c),col=s.colocacionPrevista??iso(work.fcol_c);
 if(prod&&col&&prod>col)throw Error('La producción prevista no puede quedar después de la colocación prevista.');
 for(const k of ['produccionReal','colocacionReal','cierreFecha','retrabajoResueltoFecha'])if(s[k]&&s[k]>today)throw Error('Las fechas reales y de cierre no pueden ser futuras.');
 const changed=prod!==(old.produccionPrevista??iso(work.fprod_c))||col!==(old.colocacionPrevista??iso(work.fcol_c));
 const cambios=[];
 for(const [campo,root,etapa] of [['produccionPrevista','fprod_c','produccion'],['colocacionPrevista','fcol_c','colocacion']]){
  const anterior=iso(old[campo]??work[root]),nueva=iso(s[campo]??work[root]);
  const original=campo+'Original';if(!s[original]&&(anterior||nueva))s[original]=anterior||nueva;
  if(anterior&&anterior!==nueva)cambios.push({etapa,anterior,nueva,desplazamientoDias:nueva?days(nueva,anterior):null});
 }
 if(cambios.length){
  const motivo=T(input.reprogramacionMotivo),detalle=T(input.reprogramacionDetalle);
  if(!REPLAN_REASONS.some(([id])=>id===motivo))throw Error('Seleccioná el motivo de la reprogramación.');
  if(detalle.length<5||detalle.length>2000)throw Error('Describí el motivo de la reprogramación con entre 5 y 2000 caracteres.');
  const event={id:eventId||T(work.id)+':'+at+':'+((Number(old.version)||0)+1),fecha:at,usuario:T(user.email),motivo,detalle,cambios};
  s.reprogramaciones=[...(old.reprogramaciones||[]),event];
 }
 if(changed){s.calidadAprobada=input.calidadAprobada===true;s.produccionPlanificada=input.produccionPlanificada===true;s.planRevision=(Number(old.planRevision)||0)+1;}
 if(s.calidadAprobada&&!col&&!prod)throw Error('Cargá primero al menos una fecha prevista para aprobar Calidad.');
 if(s.calidadAprobada&&Object.values(work.calidadGestion?.registros||{}).some(r=>r.estado==='Pendiente'))throw Error('Resolvé las observaciones pendientes de Calidad antes de confirmar la aprobación.');
 if(s.produccionPlanificada&&!prod)throw Error('Cargá la fecha prevista de producción antes de confirmarla.');
 if(s.calidadAprobada&&(!old.calidadAprobada||changed)){s.calidadAprobadaEn=at;s.calidadAprobadaPor=user.email;}
 if(s.produccionPlanificada&&(!old.produccionPlanificada||changed)){s.produccionPlanificadaEn=at;s.produccionPlanificadaPor=user.email;}
 if(!['','ok','retrabajo'].includes(s.cierreResultado||''))throw Error('Elegí cierre OK o con retrabajo.');
 if(s.cierreResultado){if(!s.cierreFecha)throw Error('Indicá la fecha del cierre.');if(!(s.colocacionReal||col))throw Error('Registrá la colocación real o prevista antes del cierre.');if(s.cierreFecha<(s.colocacionReal||col))throw Error('El cierre no puede ser anterior a la colocación.');}
 if(s.cierreResultado==='retrabajo'&&!s.retrabajoDetalle)throw Error('Describí el retrabajo realizado o pendiente.');
 if(old.cierreResultado==='retrabajo'&&s.cierreResultado!=='retrabajo')throw Error('Conservá el retrabajo registrado; marcá su resolución en lugar de borrarlo.');
 if(s.retrabajoResuelto&&(!s.retrabajoResueltoFecha||s.cierreResultado!=='retrabajo'))throw Error('Indicá cuándo se resolvió el retrabajo.');
 if(s.retrabajoResuelto&&s.retrabajoResueltoFecha<s.cierreFecha)throw Error('La resolución debe ser posterior al registro del retrabajo.');
 if(canPlan(user)&&('produccionPrevista'in input||'colocacionPrevista'in input))s.planificadoPorCalidad=true;
 s.version=(Number(old.version)||0)+1;s.actualizadoEn=at;s.actualizadoPor=user.email;s.avisoDias=Number(s.avisoDias)||2;
 const patch={obraSeguimientoV2:s};
 for(const [field,root,sector] of [['produccionPrevista','fprod_c','produccion'],['colocacionPrevista','fcol_c','colocaciones'],['produccionReal','fprod_r','produccion'],['colocacionReal','fcol_r','colocaciones']])if(field in input){patch[root]=s[field];patch['gestionSectores.'+sector+'.'+(field.endsWith('Real')?'real':'compromiso')]=s[field];patch['sectores.'+sector+'.'+(field.endsWith('Real')?'real':'compromiso')]=s[field];}
 return patch;
}
const days=(a,b)=>Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000);
function deadlines(groups,today=day()){
 const rows=[];
 for(const g of groups){if(isBaja(g))continue;const s=g.seguimiento||{},historical=g.estado==='Cobrado'&&!s.planificadoPorCalidad&&!s.actualizadoEn,closed=!!s.cierreResultado;
  for(const [phase,label,planned,actual] of [['produccion','Producción',g.produccionPrevista,s.produccionReal],['colocacion','Colocación',g.colocacionPrevista,s.colocacionReal]]){
   const prevista=iso(planned),real=iso(actual);if(!prevista)continue;
   const diff=days(real||today,prevista),status=real?(diff>0?'atrasada':'en-fecha'):(historical||closed?'sin-fecha-real':diff>0?'vencida':diff===0?'hoy':'prevista');
   rows.push({id:g.id,ot:g.ot,cliente:g.cliente,desc:g.desc,phase,label,prevista,real,status,atrasoDias:['atrasada','vencida'].includes(status)?diff:0});
  }
 }
 return rows;
}
function alerts(g,today=day()){
 if(isBaja(g))return [];
 const s=g.seguimiento||{},lead=Number(s.avisoDias)||2,result=[];if(s.cierreResultado==='ok'||s.cierreResultado==='retrabajo'&&s.retrabajoResuelto)return result;
 if(s.cierreResultado==='retrabajo')return [{kind:'retrabajo',date:s.cierreFecha,text:'Retrabajo pendiente de resolver',days:days(s.cierreFecha,today)}];
 if(g.estado==='Cobrado'&&!s.planificadoPorCalidad&&!s.actualizadoEn)return result;
 for(const r of deadlines([g],today).filter(r=>r.status==='vencida'))result.push({kind:r.phase+'-vencida',date:r.prevista,text:r.label+': fecha vencida sin registrar ejecución · '+r.atrasoDias+' día(s) de atraso',days:-r.atrasoDias});
 if(g.produccionPrevista&&!s.produccionReal&&!s.produccionPlanificada&&days(g.produccionPrevista,today)<=lead)result.push({kind:'produccion',date:g.produccionPrevista,text:'Confirmar planificación de Producción',days:days(g.produccionPrevista,today)});
 if(g.produccionPrevista&&!s.produccionReal&&!s.calidadAprobada&&days(g.produccionPrevista,today)<=lead)result.push({kind:'calidad-produccion',date:g.produccionPrevista,text:'Confirmar aprobación de Calidad antes de producir',days:days(g.produccionPrevista,today)});
 if(g.colocacionPrevista&&!s.colocacionReal&&!s.calidadAprobada&&days(g.colocacionPrevista,today)<=lead)result.push({kind:'calidad',date:g.colocacionPrevista,text:'Confirmar aprobación de Calidad antes de colocar',days:days(g.colocacionPrevista,today)});
 if(g.colocacionPrevista&&days(g.colocacionPrevista,today)<0&&!s.cierreResultado)result.push({kind:'cierre',date:g.colocacionPrevista,text:'Registrar cierre OK o retrabajo',days:days(g.colocacionPrevista,today)});
 return result;
}
function metrics(groups){groups=groups.filter(g=>!isBaja(g));const prod=groups.filter(g=>g.produccionPrevista&&g.seguimiento.produccionReal),col=groups.filter(g=>g.colocacionPrevista&&g.seguimiento.colocacionReal),closed=groups.filter(g=>g.seguimiento.cierreResultado);return {produccionesConFechaReal:prod.length,produccionesEnFecha:prod.filter(g=>g.seguimiento.produccionReal<=g.produccionPrevista).length,colocacionesConFechaReal:col.length,colocacionesEnFecha:col.filter(g=>g.seguimiento.colocacionReal<=g.colocacionPrevista).length,cerradas:closed.length,cerradasOk:closed.filter(g=>g.seguimiento.cierreResultado==='ok').length,conRetrabajo:closed.filter(g=>g.seguimiento.cierreResultado==='retrabajo').length};}
function replanReport(groups,{desde='',hasta='',etapa='',motivo='',query=''}={}){
 if(desde&&!iso(desde)||hasta&&!iso(hasta)||desde&&hasta&&desde>hasta)throw Error('Revisá el período del informe.');
 const rows=[];
 for(const g of groups){
  if(query&&!norm(g.ot+' '+g.cliente+' '+g.desc).includes(norm(query)))continue;
  for(const e of g.seguimiento?.reprogramaciones||[]){
   const fecha=iso(e.fecha);if(!fecha||desde&&fecha<desde||hasta&&fecha>hasta||motivo&&e.motivo!==motivo)continue;
   const cambios=(e.cambios||[]).filter(c=>!etapa||c.etapa===etapa);if(!cambios.length)continue;
   const desplazamientos=cambios.filter(c=>c.nueva&&iso(c.anterior)&&iso(c.nueva)).map(c=>days(c.nueva,c.anterior));
   const dias=Math.max(0,...desplazamientos),tipo=dias>0?'postergacion':cambios.some(c=>!c.nueva)?'sin_fecha':'adelanto';
   rows.push({...e,obraId:g.id,ot:g.ot,cliente:g.cliente,desc:g.desc,fechaRegistro:fecha,cambios,dias,tipo});
  }
 }
 rows.sort((a,b)=>T(b.fecha).localeCompare(T(a.fecha))||T(a.ot).localeCompare(T(b.ot)));
 const aggregate=key=>{
  const map=new Map();for(const r of rows){const k=key(r),a=map.get(k)||{key:k,eventos:0,obras:new Set(),postergaciones:0,dias:0};a.eventos++;a.obras.add(r.obraId);if(r.tipo==='postergacion')a.postergaciones++;a.dias+=r.dias;map.set(k,a);}
  return [...map.values()].map(a=>({...a,obras:a.obras.size,promedio:Math.round(a.dias/a.eventos*10)/10,porcentaje:rows.length?Math.round(a.eventos/rows.length*100):0})).sort((a,b)=>b.eventos-a.eventos||b.dias-a.dias||a.key.localeCompare(b.key));
 };
 const counts=new Map();for(const r of rows)counts.set(r.obraId,(counts.get(r.obraId)||0)+1);
 const original={produccion:{evaluadas:0,enFecha:0},colocacion:{evaluadas:0,enFecha:0}};
 for(const g of groups)for(const phase of ['produccion','colocacion']){
  if(etapa&&phase!==etapa||query&&!norm(g.ot+' '+g.cliente+' '+g.desc).includes(norm(query)))continue;
  const real=iso(g.seguimiento?.[phase+'Real']),prevista=iso(g.seguimiento?.[phase+'PrevistaOriginal']);
  if(real&&prevista&&(!desde||real>=desde)&&(!hasta||real<=hasta)){original[phase].evaluadas++;if(real<=prevista)original[phase].enFecha++;}
 }
 return{rows,total:rows.length,obras:counts.size,reincidentes:[...counts.values()].filter(n=>n>1).length,postergaciones:rows.filter(r=>r.tipo==='postergacion').length,dias:rows.reduce((n,r)=>n+r.dias,0),porMotivo:aggregate(r=>r.motivo),porCliente:aggregate(r=>r.cliente),porMes:aggregate(r=>r.fechaRegistro.slice(0,7)).sort((a,b)=>a.key.localeCompare(b.key)),original};
}
return {STATES,REPLAN_REASONS,EDITABLE_STATES,T,norm,ot,base,day,iso,instant,approvalStamp,approvalTime,approvalWeek,compareApproved,state,canPlan,canProduction,canSync,canStatus,statusPatch,active,isBaja,canBaja,productionSignal,placementSignal,bajaPatch,aggregateStatus,references,grouped,linkReference,referencePlan,trackingPatch,deadlines,alerts,metrics,replanHistory,replanReport};
});

