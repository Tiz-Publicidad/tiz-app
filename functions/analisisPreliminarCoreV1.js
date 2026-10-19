(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TIZAnalisisPreliminarCoreV1=factory();})(typeof window==='object'?window:globalThis,()=>{
'use strict';
const SECTORS={ventas:'Ventas',diseno:'Diseño',compras:'Compras',produccion:'Producción',operaciones:'Operaciones',calidad:'Calidad',colocaciones:'Colocaciones',facturacion:'Facturación y Cobranzas'};
const USERS={'contrerasfedericograbriel365@gmail.com':'operaciones','info@tizpublicidad.com':'ventas','pablo.aciar@tizpublicidad.com':'produccion','julieta.aguirre@tizpublicidad.com':'diseno','carolina.flores@tizpublicidad.com':'compras','cristiantizpublicidad@gmail.com':'calidad','arielbenitezpublicidad@gmail.com':'colocaciones'};
const text=x=>String(x??'').trim();
const norm=x=>text(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const LIMIT_MS=48*60*60*1000;
function operator(email){email=norm(email);if(!USERS[email])throw Error('Tu cuenta no tiene acceso al análisis preliminar.');return {email,sector:USERS[email],isAdmin:email==='info@tizpublicidad.com'};}
function reportFor(reports,sector){if(sector!=='facturacion')return reports?.[sector];const a=reports?.facturacion,b=reports?.cobranzas;if(!a)return b;if(!b)return a;if(b.presentadoEn&&(!a.presentadoEn||b.presentadoEn<a.presentadoEn))return {...b,revision:Math.max(Number(a.revision)||0,Number(b.revision)||0)};return {...a,revision:Math.max(Number(a.revision)||0,Number(b.revision)||0)};}
function canWrite(user,sector){return !!SECTORS[sector]&&!!user&&(user.isAdmin||user.sector===sector||user.email==='pablo.aciar@tizpublicidad.com'&&['calidad','colocaciones','operaciones'].includes(sector)||user.sector==='compras'&&sector==='colocaciones');}
function isApproval(before,after){return !!after&&norm(after.estado)==='aprobado'&&(!before||norm(before.estado)!=='aprobado');}
function active(work){return !!work&&!work.archivado&&work.revisionVigente!==false&&work.revisionOperativa!==false;}
function baseOt(v){const m=text(v).match(/\d+/);return m?m[0].replace(/^0+(?=\d)/,'').slice(0,4):'';}
function refId(v){let h=2166136261;for(const c of v){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
function pendingState(v){return ['pendiente','cobrado pendiente'].includes(norm(v).replace(/[_\s]+/g,' '));}
function driveFolder(work={}){try{const u=new URL(text(work.driveFolderUrl));if(u.protocol==='https:'&&u.hostname==='drive.google.com'&&!u.username&&!u.password&&/^\/(?:drive\/(?:u\/\d+\/)?folders|folders)\/[\w-]+/.test(u.pathname))return u.href;}catch(_){}const id=text(work.driveFolderId);return /^[\w-]{10,200}$/.test(id)?'https://drive.google.com/drive/folders/'+id:'';}
function workList(source=[],works=[]){
 const live=new Map(),groups=new Map();
 for(const w of works){if(!active(w))continue;const ot=baseOt(w.ot||w.nroCotizacion),key=ot?'ot:'+ot:'obra:'+w.id;if(!live.has(key))live.set(key,w);}
 for(const r of source){if(!pendingState(r.status)||![r.ot,r.desc,r.cliente].some(v=>text(v)))continue;const ot=baseOt(r.ot),key=ot?'ot:'+ot:'fila:'+r.row;let g=groups.get(key);if(!g){g={ot,rows:[],descs:[],clients:[]};groups.set(key,g);}g.rows.push(r.row);for(const[k,val]of [['descs',r.desc],['clients',r.cliente]])if(text(val)&&!g[k].includes(text(val)))g[k].push(text(val));}
 const out=[];
 function project(w={},g){const n=g?.ot||baseOt(w.ot||w.nroCotizacion);return {id:w.id||(n?'tiz2026-ot-'+n:'tiz2026-ref-'+refId(g.clients.join('|')+'|'+g.descs.join('|')+'|'+g.rows.join(','))),obraOperativaId:w.id||'',ot:n,cliente:g?.clients.join(' / ')||text(w.cliente),descripcion:g?.descs.join(' / ')||text(w.desc||w.descripcion),sourceRows:g?.rows||[],driveFolderUrl:driveFolder(w),activa:true,aprobacion:w.analisisPreliminarAprobadoEn?.toDate?.().toISOString()||''};}
 for(const[key,g]of groups){out.push(project(live.get(key),g));live.delete(key);}
 for(const w of live.values())if(!['cobrado','entregado','rechazado','vencido','cerrado','cancelado'].includes(norm(w.estado))&&['pendiente','cobrado pendiente','aprobado','en produccion'].includes(norm(w.estado)))out.push(project(w));
 return out.sort((a,b)=>Number(b.ot||0)-Number(a.ot||0));
}
function cleanRows(rows,submit){if(!Array.isArray(rows)||rows.length>100)throw Error('Cargá hasta 100 renglones.');const clean=rows.map(r=>Object.fromEntries(['tarea','si','no','responsable'].map(k=>{const v=text(r?.[k]);if(v.length>3000)throw Error('Cada campo admite hasta 3000 caracteres.');return [k,v]}))).filter(r=>Object.values(r).some(Boolean));if(submit&&(!clean.length||clean.some(r=>!r.tarea||!r.si||!r.no||(!/^(sin pendientes|ninguno|no aplica)[.!]?$/i.test(r.no)&&!r.responsable))))throw Error('Completá tarea, qué sí, qué no y responsable del pendiente. Podés indicar “Nada por ahora” o “Sin pendientes”.');return clean;}
function nextReport(current,input,user,sector,approval,at){if(!canWrite(user,sector))throw Error('Sólo podés completar el análisis de tu puesto.');if(Number(input.revision||0)!==Number(current?.revision||0))throw Error('El reporte cambió. Volvé a abrirlo antes de guardar.');const submit=input.presentar===true;if(current?.presentadoEn&&!submit)throw Error('Usá Guardar actualización para modificar un análisis presentado.');const rows=cleanRows(input.filas,submit);const first=current?.presentadoEn||(submit?at:'');const out={filas:rows,revision:Number(current?.revision||0)+1,actualizadoEn:at,actualizadoPor:user.email};if(first){out.presentadoEn=first;out.presentadoPor=current?.presentadoPor||user.email;out.enTermino=current?.presentadoEn?current.enTermino:Date.parse(first)<=Date.parse(approval.venceEn);out.horasRespuesta=current?.presentadoEn?current.horasRespuesta:Math.max(0,(Date.parse(first)-Date.parse(approval.aprobadoEn))/3600000);}return out;}
function status(report,approval,now=Date.now()){if(report?.presentadoEn)return report.enTermino?'En término':'Fuera de término';return now>Date.parse(approval.venceEn)?'Vencido':'Sin presentar';}
return {SECTORS,USERS,LIMIT_MS,operator,canWrite,isApproval,active,cleanRows,nextReport,status,norm,baseOt,pendingState,workList,driveFolder,reportFor};

});

