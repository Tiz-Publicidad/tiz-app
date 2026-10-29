/* Identidad por OT y seguimiento operativo. Compartido por servidor e interfaz. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZObrasSeguimientoCoreV2=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const STATES=['Cobrado','Cobrado pendiente','Pendiente','Entregado'];
const T=v=>String(v??'').trim(),norm=v=>T(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const ot=v=>T(v).replace(/^0+(?=\d)/,'').replace(/\s+/g,'').replace(/,/g,'.').toLowerCase();
const base=v=>{const m=ot(v).match(/^\d{4,7}/);return m?String(Number(m[0])):'';};
const day=(now=new Date())=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),get=k=>p.find(x=>x.type===k).value;return get('year')+'-'+get('month')+'-'+get('day');};
function iso(v){let s=T(v),y,m,d;if(!s)return'';if(v?.toDate)return day(v.toDate());if(/^\d{4}-\d{2}-\d{2}T/.test(s))s=s.slice(0,10);let a=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(a)[,y,m,d]=a;else{a=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!a)return'';[,d,m,y]=a;if(Number(y)<100)y=2000+Number(y);}const z=new Date(Date.UTC(+y,+m-1,+d));return z.getUTCFullYear()===+y&&z.getUTCMonth()===+m-1&&z.getUTCDate()===+d?z.toISOString().slice(0,10):'';}
const state=v=>STATES.includes(T(v))?T(v):'Pendiente';
const canPlan=u=>!!u&&(u.isAdmin||u.sector==='Calidad'||['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com'].includes(T(u.email).toLowerCase()));
const canProduction=u=>canPlan(u)||T(u?.email).toLowerCase()==='pablo.aciar@tizpublicidad.com';
const canSync=u=>['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com','pablo.aciar@tizpublicidad.com'].includes(T(u?.email).toLowerCase());
const active=o=>!o.archivado&&o.revisionVigente!==false&&o.revisionOperativa!==false;
function family(v){const n=norm(v);if(n==='gtl'||n==='getthelook')return'getthelook';if(n==='kpl'||n==='kplconstructora'||n==='kplminiso')return'kpl';if(n==='yale'||n==='yalehid')return'yale';if(n==='fernahnossaxtiro'||n==='xtirofernahnos')return'fernahnos';if(n==='jumbaly'||n==='jumbalay')return'jumbalay';return n;}
function aggregateStatus(rows){const states=rows.map(r=>T(r.estado));if(states.length&&states.every(s=>s==='Cobrado'))return'Cobrado';const saldo=rows.filter(r=>/\bsaldo\b/i.test(r.desc));if(saldo.length&&new Set(saldo.map(r=>r.estado)).size===1)return state(saldo[0].estado);for(const s of ['Pendiente','Cobrado pendiente','Entregado'])if(states.includes(s))return s;return'Pendiente';}
function references(data){
 if(!Array.isArray(data?.rows)||data.firstRow!==2)throw Error('La referencia de obras no tiene encabezados válidos.');
 const h=data.rows[0]||[],find=(names,required=true)=>{const hits=h.flatMap((v,i)=>names.includes(norm(v))?[i]:[]);if(required&&hits.length!==1)throw Error('Revisar la columna '+names[0]+' en la referencia.');return hits.length===1?hits[0]:-1;};
 const col={ot:find(['otct','ot']),desc:find(['descripciondelaobra','descripcion']),cliente:find(['cliente']),alta:find(['fecha']),semana:find(['sem','semana']),prod:find(['fdeprod']),col:find(['fcol']),estado:find(['status','estado'])};
 return data.rows.slice(1).map((r,i)=>({row:i+3,ot:T(r[col.ot]),desc:T(r[col.desc]),cliente:T(r[col.cliente]),fechaAlta:iso(r[col.alta]),semana:Number(r[col.semana])||0,produccionPrevista:iso(r[col.prod]),colocacionPrevista:iso(r[col.col]),estado:T(r[col.estado])})).filter(r=>r.ot||r.desc||r.cliente);
}
function grouped(works=[]){
 const map=new Map();for(const o of works.filter(active)){const key=ot(o.ot)?ot(o.ot)+'|'+family(o.cliente):'sin-ot:'+o.id;const a=map.get(key)||[];a.push(o);map.set(key,a);}
 return [...map.entries()].map(([key,members])=>{
   members.sort((a,b)=>T(b.obraSeguimientoV2?.actualizadoEn).localeCompare(T(a.obraSeguimientoV2?.actualizadoEn))||Number(/\b(anticipo|saldo)\b/i.test(a.desc||''))-Number(/\b(anticipo|saldo)\b/i.test(b.desc||''))||T(a.id).localeCompare(T(b.id)));
   const o=members[0],s=o.obraSeguimientoV2||{},alta=iso(o.fechaAltaObra||o.fecha||o.fechaAprobacion)||iso(o._ts),prod=iso(s.produccionPrevista??o.fprod_c??o.gestionSectores?.produccion?.compromiso),col=iso(s.colocacionPrevista??o.fcol_c??o.gestionSectores?.colocaciones?.compromiso);
   const estados=members.map(m=>({estado:state(m.estado),desc:m.desc||m.descripcion||''}));
   return {key,id:o.id,ids:members.map(m=>m.id),versions:Object.fromEntries(members.map(m=>[m.id,Number(m.obraSeguimientoV2?.version)||0])),ot:T(o.ot),desc:T(o.desc||o.descripcion),cliente:T(o.cliente),estado:aggregateStatus(estados),fechaAlta:alta,semana:Number(o.semanaVenta??o.semana)||0,produccionPrevista:prod,colocacionPrevista:col,seguimiento:{...s,produccionPrevista:prod,colocacionPrevista:col,produccionReal:iso(s.produccionReal??o.fprod_r),colocacionReal:iso(s.colocacionReal??o.fcol_r)},members};
 }).sort((a,b)=>(Number(base(b.ot))||-1)-(Number(base(a.ot))||-1)||a.cliente.localeCompare(b.cliente,'es'));
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
 for(const {group:g,rows} of links){if(!rows.length){unmatched.push({ot:g.ot,cliente:g.cliente,id:g.id});continue;}
   const first=[...rows].filter(r=>r.fechaAlta).sort((a,b)=>a.fechaAlta.localeCompare(b.fechaAlta))[0]||rows[0],validStates=rows.filter(r=>STATES.includes(r.estado)),status=validStates.length?aggregateStatus(validStates):null;
   const uniqueDate=field=>{const d=[...new Set(rows.map(r=>r[field]).filter(Boolean))];return d.length===1?d[0]:null;};
   for(const o of g.members){const p={...(status?{estado:status,cobr:status}:{}),referenciaGoogle2026:{filas:rows.map(r=>r.row),leidaEn:at,estado:status||T(o.estado),ot:rows[0].ot}};
     if(first.fechaAlta)p.fechaAltaObra=first.fechaAlta;if(first.semana){p.semanaVenta=first.semana;p.semana=first.semana;}
     for(const [field,root] of [['produccionPrevista','fprod_c'],['colocacionPrevista','fcol_c']]){const value=uniqueDate(field);if(value!==null&&!o.obraSeguimientoV2?.planificadoPorCalidad){p[root]=value;p['obraSeguimientoV2.'+field]=value;p['gestionSectores.'+(field==='produccionPrevista'?'produccion':'colocaciones')+'.compromiso']=value;}}
     if(['fprod_c','fcol_c'].some(k=>k in p&&p[k]!==iso(o[k]))){p['obraSeguimientoV2.version']=(Number(o.obraSeguimientoV2?.version)||0)+1;p['obraSeguimientoV2.calidadAprobada']=false;p['obraSeguimientoV2.produccionPlanificada']=false;}
     updates.push({id:o.id,patch:p,sourceRows:rows.map(r=>r.row)});
   }
 }
 return {groups:groups.length,linked:links.filter(x=>x.rows.length).length,updates,unmatched};
}
function trackingPatch(work,input,user,at=new Date().toISOString(),today=day()){
 if(!canProduction(user))throw Error('Calidad administra las fechas y el cierre; Producción confirma su planificación y fecha real.');
 const old=work.obraSeguimientoV2||{},s={...old},allowed=['produccionPrevista','colocacionPrevista','avisoDias','calidadAprobada','produccionPlanificada','produccionReal','colocacionReal','cierreResultado','cierreFecha','retrabajoDetalle','retrabajoResuelto','retrabajoResueltoFecha'];
 for(const k of Object.keys(input))if(!allowed.includes(k))throw Error('Campo de seguimiento inválido: '+k);
 if(!canPlan(user)&&Object.keys(input).some(k=>!['produccionPlanificada','produccionReal'].includes(k)))throw Error('Las fechas previstas, la aprobación y el cierre los registra Calidad.');
 for(const [k,v] of Object.entries(input)){
   if(['calidadAprobada','produccionPlanificada','retrabajoResuelto'].includes(k)){if(typeof v!=='boolean')throw Error('Confirmación inválida.');s[k]=v;}
   else if(k==='avisoDias'){if(![1,2].includes(Number(v)))throw Error('Elegí aviso con 1 o 2 días.');s[k]=Number(v);}
   else if(k.endsWith('Prevista')||k.endsWith('Real')||k.endsWith('Fecha')){if(T(v)&&!iso(v))throw Error('Fecha inválida.');s[k]=iso(v);}
   else{s[k]=T(v);if(s[k].length>3000)throw Error('El detalle es demasiado largo.');}
 }
 const prod=s.produccionPrevista??iso(work.fprod_c),col=s.colocacionPrevista??iso(work.fcol_c);
 if(prod&&col&&prod>col)throw Error('La producción prevista no puede quedar después de la colocación prevista.');
 for(const k of ['produccionReal','colocacionReal','cierreFecha','retrabajoResueltoFecha'])if(s[k]&&s[k]>today)throw Error('Las fechas reales y de cierre no pueden ser futuras.');
 const changed=prod!==(old.produccionPrevista??iso(work.fprod_c))||col!==(old.colocacionPrevista??iso(work.fcol_c));
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
function alerts(g,today=day()){
 const s=g.seguimiento||{},lead=Number(s.avisoDias)||2,result=[];if(s.cierreResultado==='ok'||s.cierreResultado==='retrabajo'&&s.retrabajoResuelto)return result;
 if(s.cierreResultado==='retrabajo')return [{kind:'retrabajo',date:s.cierreFecha,text:'Retrabajo pendiente de resolver',days:days(s.cierreFecha,today)}];
 if(g.estado==='Cobrado'&&!s.planificadoPorCalidad&&!s.version)return result;
 if(g.produccionPrevista&&!s.produccionReal&&!s.produccionPlanificada&&days(g.produccionPrevista,today)<=lead)result.push({kind:'produccion',date:g.produccionPrevista,text:'Confirmar planificación de Producción',days:days(g.produccionPrevista,today)});
 if(g.produccionPrevista&&!s.produccionReal&&!s.calidadAprobada&&days(g.produccionPrevista,today)<=lead)result.push({kind:'calidad-produccion',date:g.produccionPrevista,text:'Confirmar aprobación de Calidad antes de producir',days:days(g.produccionPrevista,today)});
 if(g.colocacionPrevista&&!s.calidadAprobada&&days(g.colocacionPrevista,today)<=lead)result.push({kind:'calidad',date:g.colocacionPrevista,text:'Confirmar aprobación de Calidad antes de colocar',days:days(g.colocacionPrevista,today)});
 if(g.colocacionPrevista&&days(g.colocacionPrevista,today)<0&&!s.cierreResultado)result.push({kind:'cierre',date:g.colocacionPrevista,text:'Registrar cierre OK o retrabajo',days:days(g.colocacionPrevista,today)});
 return result;
}
function metrics(groups){const prod=groups.filter(g=>g.produccionPrevista&&g.seguimiento.produccionReal),col=groups.filter(g=>g.colocacionPrevista&&g.seguimiento.colocacionReal),closed=groups.filter(g=>g.seguimiento.cierreResultado);return {produccionesConFechaReal:prod.length,produccionesEnFecha:prod.filter(g=>g.seguimiento.produccionReal<=g.produccionPrevista).length,colocacionesConFechaReal:col.length,colocacionesEnFecha:col.filter(g=>g.seguimiento.colocacionReal<=g.colocacionPrevista).length,cerradas:closed.length,cerradasOk:closed.filter(g=>g.seguimiento.cierreResultado==='ok').length,conRetrabajo:closed.filter(g=>g.seguimiento.cierreResultado==='retrabajo').length};}
return {STATES,T,norm,ot,base,day,iso,state,canPlan,canProduction,canSync,active,aggregateStatus,references,grouped,linkReference,referencePlan,trackingPatch,alerts,metrics};
});
