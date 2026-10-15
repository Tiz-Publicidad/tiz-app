(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TIZComprasObrasCoreV1=factory();})(typeof window==='object'?window:globalThis,()=>{
'use strict';
const text=v=>String(v??'').trim(),norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_\s]+/g,' ');
function ot(v){const m=text(v).match(/\d+/);return m?m[0].replace(/^0+(?=\d)/,'').slice(0,4):'';}
const valid=w=>w&&!w.archivado&&w.revisionVigente!==false&&w.revisionOperativa!==false;
const pending=s=>['pendiente','cobrado pendiente'].includes(norm(s));
const active=w=>valid(w)&&!['cobrado','rechazado','vencido','cancelado','entregado','cerrado'].includes(norm(w.estado));
function merge(source=[],works=[]){const groups=new Map(),live=new Map();for(const w of works){if(!valid(w))continue;const n=ot(w.ot||w.nroCotizacion||w.nro);const key=n?'ot:'+n:'app:'+w.id;const old=live.get(key);if(!old||(!old.analisisPreliminarAprobadoEn&&w.analisisPreliminarAprobadoEn))live.set(key,w);}
for(const r of source){if(!pending(r.status))continue;const n=ot(r.ot),key=n?'ot:'+n:'fila:'+r.row;let g=groups.get(key);if(!g){g={key,ot:n,rows:[],descs:[],clients:[],states:[]};groups.set(key,g);}for(const [field,val] of [['rows',r.row],['descs',text(r.desc)],['clients',text(r.cliente)],['states',text(r.status)]])if(val!==undefined&&val!==''&&!g[field].includes(val))g[field].push(val);}
const result=[];for(const [key,g]of groups){const w=live.get(key);result.push({...w,id:w?.id||(g.ot?'tiz2026-ot-'+g.ot:'tiz2026-fila-'+g.rows[0]),ot:g.ot,cliente:g.clients.join(' / ')||w?.cliente||'',desc:[...new Set([...g.descs,text(w?.desc||w?.descripcion)].filter(Boolean))].join(' / '),estado:g.states.join(' / '),comprasFuenteMadre:true,comprasFilasMadre:g.rows,comprasReferencia:!w});live.delete(key);}for(const w of live.values())if(active(w))result.push({...w,ot:ot(w.ot||w.nroCotizacion||w.nro),comprasFuenteMadre:false});return result.sort((a,b)=>Number(b.ot||0)-Number(a.ot||0)||text(a.id).localeCompare(text(b.id)));}
const same=(a,b)=>!!ot(a)&&ot(a)===ot(b);
return {ot,norm,pending,merge,same};
});
