/* Una cotización no aprobada no habilita trabajo operativo. Sin eliminar historial. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZVigenciaComercialV1=api;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const text=v=>String(v??'').trim(),norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''),number=v=>{const m=text(v).match(/\d+/);return m?m[0].replace(/^0+(?=\d)/,''):'';},revision=v=>text(v).split('.').map(x=>Number(x)||0).join('.');
 function approved(q){const state=norm(q?.estado);return state?['aprobado','aprobada','entregado','entregada','cobrado','cobradopendiente'].includes(state):norm(q?.revisionEstado)==='aprobada';}
 function family(w,q){return !!number(w.ot||w.nroCotizacion)&&number(w.ot||w.nroCotizacion)===number(q.nro||q.ct)&&(!text(w.cliente)||!text(q.cliente)||norm(w.cliente)===norm(q.cliente));}
 function quoteFor(w,quotes=[]){
  const id=text(w.presupuestoId||w.cotizacionId);if(id){const direct=quotes.find(q=>q.id===id);return direct||null;}
  const declaredRevision=w.revisionCotizacion||w.revisionAprobada;const reverse=quotes.filter(q=>q.obraId&&q.obraId===w.id&&(!declaredRevision||revision(q.revision||'1.0')===revision(declaredRevision)));if(reverse.length===1)return reverse[0];
  let candidates=quotes.filter(q=>family(w,q));const rev=w.revisionCotizacion||w.revisionAprobada;if(rev)candidates=candidates.filter(q=>revision(q.revision||'1.0')===revision(rev));
  if(candidates.length===1)return candidates[0];const active=candidates.filter(q=>approved(q)&&q.revisionVigente!==false&&!q.archivado);return active.length===1?active[0]:null;
 }
 function state(w,quotes){if(quotes===undefined&&typeof window==='object'&&window.TIZPresupuestosCargados===false&&(w.presupuestoId||w.cotizacionId))return {presupuestoId:w.presupuestoId||w.cotizacionId,estado:'Pendiente de verificar',habilitada:false};const list=Array.isArray(quotes)?quotes:typeof window==='object'?window.DB?.presupuestos:undefined,q=Array.isArray(list)?quoteFor(w,list):null;return q&&(text(q.estado)||text(q.revisionEstado))?{presupuestoId:q.id,estado:text(q.estado)||text(q.revisionEstado),habilitada:approved(q),revision:text(q.revision)}:w.vigenciaComercial||null;}
 const visible=(w,quotes)=>!!w&&state(w,quotes)?.habilitada!==false;
 function mark(w,quotes){const gate=state(w,quotes);return gate?{...w,vigenciaComercial:gate,...(!gate.habilitada?{revisionOperativa:false,revisionVigente:false}:{})}:w;}
 async function quoteRows(db){const ref=db.collection('presupuestos'),snap=await (typeof ref.get==='function'?ref.get():ref.limit(4001).get());return (snap.docs||[]).map(d=>({id:d.id,...d.data()}));}
 async function read(db,works){const quotes=await quoteRows(db);if(!works){const snap=await db.collection('obras').get();works=snap.docs.map(d=>({id:d.id,...d.data()}));}return works.map(w=>mark(w,quotes));}
 async function requireVisible(db,w){if(!visible(w,await quoteRows(db)))throw Object.assign(Error('La cotización está en Borrador o sin aprobar. Volvé a aprobarla desde Presupuestos para habilitar la obra.'),{status:409});return w;}
 function filterSource(source,works=[],quotes){const list=Array.isArray(quotes)?quotes:typeof window==='object'?window.DB?.presupuestos||[]:[],blocked=works.filter(w=>!visible(w,list));return source.filter(r=>{if(blocked.some(w=>family(w,{nro:r.ot,cliente:r.cliente})&&!works.some(other=>family(other,{nro:r.ot,cliente:r.cliente})&&visible(other,list)&&other.revisionOperativa!==false&&other.revisionVigente!==false)))return false;const candidates=list.filter(q=>family({ot:r.ot,cliente:r.cliente},q));const explicit=candidates.filter(q=>text(q.estado)||text(q.revisionEstado));return !explicit.length||explicit.some(approved);});}
 function relatedVisible(record,works=typeof window==='object'?window.DB?.obras||[]:[],quotes){const w=works.find(w=>w.id===record.obraId);return visible(w||{id:record.obraId,ot:record.ot,cliente:record.cliente,presupuestoId:record.presupuestoId},quotes);}
 return {relatedVisible,approved,family,quoteFor,state,visible,mark,quoteRows,read,requireVisible,filterSource};
});
