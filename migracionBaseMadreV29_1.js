// TIZ ERP V40 — Migración controlada de obras al 03/09/2026
// Nunca se ejecuta automáticamente. Primero simularMigracionObrasV40().
(function(){
  'use strict';
  const VERSION='V40-2026-09-03';
  const ALLOWED=new Set(['Cobrado','Entregado','Pendiente','Cobrado pendiente','Enviado','Aprobado']);
  let lastPlan=null;

  const text=v=>String(v??'').trim();
  const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const baseOT=v=>{const m=text(v).match(/\d{4,}/);return m?String(Number(m[0])):''};
  const fp=o=>[baseOT(o.ot),norm(o.cliente),norm(o.desc||o.descripcion)].join('|');
  const nextQuote=()=>{
    const ps=(window.DB?.presupuestos||[]).map(p=>parseInt(p.nro,10)||0);
    const os=(window.DB?.obras||[]).map(o=>parseInt(o.ot,10)||0);
    return Math.max(0,...ps,...os)+1;
  };
  const patch=x=>({
    ot:text(x.ot), desc:text(x.descripcion), cliente:text(x.cliente), vendedor:text(x.vendedor)||'G',
    estado:ALLOWED.has(text(x.estado))?text(x.estado):'Pendiente', sector:text(x.sector)||'Producción',
    semana:Number(x.semana)||0, neto:Number(x.precioVentaNeto)||0, bruto:Number(x.precioVentaBruto)||0,
    gastos:Number(x.gastos)||0, fprod_c:text(x.produccion?.fechaCompromiso),
    fprod_r:text(x.produccion?.fechaReal), fcol_c:text(x.colocacion?.fechaCompromiso),
    fcol_r:text(x.colocacion?.fechaReal), oc:text(x.oc), op:text(x.op), nrfc:text(x.nroFactura),
    ffc:text(x.fechaFactura), comentarios:text(x.comentarios), sourceKey:text(x.sourceKey),
    importacionVersion:VERSION, importacionFilaExcel:Number(x.filaExcel)||0
  });

  function makePlan(){
    const source=Array.isArray(window.OBRAS_MADRE_V40)?window.OBRAS_MADRE_V40:[];
    const current=Array.isArray(window.DB?.obras)?window.DB.obras:[];
    if(!source.length) throw new Error('No se cargó OBRAS_MADRE_V40.');
    const bySource=new Map(), byFp=new Map(), byBase=new Map();
    current.forEach(o=>{
      if(text(o.sourceKey)){const a=bySource.get(text(o.sourceKey))||[];a.push(o);bySource.set(text(o.sourceKey),a)}
      const f=fp(o);if(baseOT(o.ot)){const a=byFp.get(f)||[];a.push(o);byFp.set(f,a)}
      const b=baseOT(o.ot);if(b){const a=byBase.get(b)||[];a.push(o);byBase.set(b,a)}
    });
    const used=new Set(), updates=[], creates=[], ambiguous=[];
    const take=list=>(list||[]).find(o=>!used.has(o.id));
    source.forEach(x=>{
      let found=take(bySource.get(text(x.sourceKey)))||take(byFp.get(fp(x)));
      if(found){used.add(found.id);updates.push({id:found.id,source:x,data:patch(x)});return}
      const sameOT=(byBase.get(baseOT(x.ot))||[]).filter(o=>!used.has(o.id));
      if(sameOT.length){ambiguous.push({source:x,candidates:sameOT.map(o=>({id:o.id,ot:o.ot,cliente:o.cliente,desc:o.desc||o.descripcion,estado:o.estado}))});return}
      creates.push({source:x,data:patch(x)});
    });
    const counts={};source.forEach(x=>{const s=text(x.estado);counts[s]=(counts[s]||0)+1});
    return {version:VERSION,createdAt:new Date().toISOString(),sourceCount:source.length,currentCount:current.length,
      updates,creates,ambiguous,untouched:current.filter(o=>!used.has(o.id)),statusCounts:counts,
      nextQuote:nextQuote(),expectedNextQuote:4696,
      safeToApply:ambiguous.length===0&&nextQuote()===4696,
      token:crypto.randomUUID?crypto.randomUUID():String(Date.now())};
  }

  window.simularMigracionObrasV40=function(){
    lastPlan=makePlan();
    const summary={version:lastPlan.version,origen:lastPlan.sourceCount,existentes:lastPlan.currentCount,
      actualizar:lastPlan.updates.length,crear:lastPlan.creates.length,
      ambiguas:lastPlan.ambiguous.length,sinTocar:lastPlan.untouched.length,
      estados:lastPlan.statusCounts,siguienteCotizacion:lastPlan.nextQuote,
      esperado:4696,listaParaAplicar:lastPlan.safeToApply,token:lastPlan.token};
    console.table(summary);
    if(lastPlan.ambiguous.length) console.table(lastPlan.ambiguous.map(x=>({fila:x.source.filaExcel,ot:x.source.ot,cliente:x.source.cliente,descripcion:x.source.descripcion,candidatos:x.candidates.length})));
    return summary;
  };

  window.detalleMigracionObrasV40=function(){return lastPlan};

  window.descargarRespaldoObrasV40=function(){
    const data=JSON.stringify({fecha:new Date().toISOString(),obras:window.DB?.obras||[],presupuestos:window.DB?.presupuestos||[]},null,2);
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));
    a.download='respaldo-tiz-antes-migracion-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };

  window.aplicarMigracionObrasV40=async function(token){
    if(!lastPlan) throw new Error('Primero ejecutá simularMigracionObrasV40().');
    if(token!==lastPlan.token) throw new Error('Token inválido: repetí la simulación.');
    if(lastPlan.ambiguous.length) throw new Error('Hay coincidencias ambiguas. No se aplicó ningún cambio.');
    if(lastPlan.nextQuote!==4696) throw new Error('La siguiente cotización no es 4696. No se aplicó ningún cambio.');
    if(typeof window.updateDoc_!=='function'||typeof window.addDoc_!=='function') throw new Error('Firestore todavía no está listo.');
    if(!confirm('Se actualizarán '+lastPlan.updates.length+' obras y se crearán '+lastPlan.creates.length+'. No se eliminará ninguna. ¿Continuar?')) return {cancelado:true};
    window.descargarRespaldoObrasV40();
    const result={actualizadas:0,creadas:0,errores:[]};
    for(const it of lastPlan.updates){try{await window.updateDoc_('obras',it.id,it.data);result.actualizadas++}catch(e){result.errores.push({tipo:'actualizar',id:it.id,error:String(e)})}}
    for(const it of lastPlan.creates){try{await window.addDoc_('obras',it.data);result.creadas++}catch(e){result.errores.push({tipo:'crear',ot:it.data.ot,error:String(e)})}}
    lastPlan=null;console.table(result);return result;
  };
})();
