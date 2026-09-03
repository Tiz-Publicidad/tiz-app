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
    return Math.max(4695,...ps,...os)+1;
  };
  const tokens=v=>new Set(norm(v).split(' ').filter(w=>w.length>1));
  const dice=(a,b)=>{const A=tokens(a),B=tokens(b);if(!A.size&&!B.size)return 1;let hit=0;A.forEach(x=>{if(B.has(x))hit++});return (2*hit)/(A.size+B.size||1)};
  const patch=(x,existing)=>({
    ot:text(x.ot), desc:text(x.descripcion), cliente:text(x.cliente), vendedor:text(x.vendedor)||text(existing?.vendedor)||'G',
    estado:ALLOWED.has(text(x.estado))?text(x.estado):'Pendiente', sector:text(x.sector)||text(existing?.sector)||'Producción',
    semana:Number(x.semana)||Number(existing?.semana)||0, neto:Number(x.precioVentaNeto)||0, bruto:Number(x.precioVentaBruto)||0,
    gastos:Number(x.gastos)||0, fprod_c:text(x.produccion?.fechaCompromiso)||text(existing?.fprod_c),
    fprod_r:text(x.produccion?.fechaReal)||text(existing?.fprod_r), fcol_c:text(x.colocacion?.fechaCompromiso)||text(existing?.fcol_c),
    fcol_r:text(x.colocacion?.fechaReal)||text(existing?.fcol_r),
    oc:text(x.oc)||text(existing?.oc), op:text(x.op)||text(existing?.op),
    nrfc:text(x.nroFactura)||text(existing?.nrfc)||text(existing?.nroFactura)||text(existing?.numeroFactura),
    ffc:text(x.fechaFactura)||text(existing?.ffc)||text(existing?.fFactura)||text(existing?.fechaFactura),
    comentarios:text(x.comentarios)||text(existing?.comentarios), sourceKey:text(x.sourceKey),
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
    const used=new Set(), matched=new Map(), pending=[];
    const take=list=>(list||[]).find(o=>!used.has(o.id));
    source.forEach(x=>{const found=take(bySource.get(text(x.sourceKey)))||take(byFp.get(fp(x)));if(found){used.add(found.id);matched.set(x,found)}else pending.push(x)});
    const pairs=[];
    pending.forEach(x=>(byBase.get(baseOT(x.ot))||[]).forEach(o=>{if(used.has(o.id)||norm(x.cliente)!==norm(o.cliente))return;pairs.push({x,o,score:dice(x.descripcion,o.desc||o.descripcion)})}));
    pairs.sort((a,b)=>b.score-a.score);
    const assignedSource=new Set();
    pairs.forEach(p=>{if(p.score<0.36||assignedSource.has(p.x)||used.has(p.o.id))return;assignedSource.add(p.x);used.add(p.o.id);matched.set(p.x,p.o)});
    const updates=[],creates=[],ambiguous=[];
    source.forEach(x=>{const found=matched.get(x);if(found){updates.push({id:found.id,source:x,data:patch(x,found),similaridad:dice(x.descripcion,found.desc||found.descripcion)});return}const sameOT=byBase.get(baseOT(x.ot))||[];if(sameOT.length){ambiguous.push({source:x,candidates:sameOT.map(o=>({id:o.id,ot:o.ot,cliente:o.cliente,desc:o.desc||o.descripcion,estado:o.estado}))});return}creates.push({source:x,data:patch(x,null)})});
    const counts={};source.forEach(x=>{const st=text(x.estado);counts[st]=(counts[st]||0)+1});
    return {version:VERSION,createdAt:new Date().toISOString(),sourceCount:source.length,currentCount:current.length,updates,creates,ambiguous,untouched:current.filter(o=>!used.has(o.id)),statusCounts:counts,nextQuote:nextQuote(),expectedNextQuote:4696,safeToApply:ambiguous.length===0&&nextQuote()===4696,token:crypto.randomUUID?crypto.randomUUID():String(Date.now())};
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

  function mostrarResumenMigracionV40(){
    let x;
    try{x=window.simularMigracionObrasV40()}catch(e){alert('No se pudo revisar la importación: '+e.message);return}
    document.getElementById('modal-migracion-v40')?.remove();
    const root=document.createElement('div');root.id='modal-migracion-v40';
    root.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
    const ambiguas=(lastPlan?.ambiguous||[]).slice(0,20);
    root.innerHTML='<div style="width:min(720px,96vw);max-height:88vh;overflow:auto;background:#171717;border:1px solid #3a3a3a;border-radius:12px;padding:22px;color:#eee;font:14px Arial">'+
      '<h2 style="margin:0 0 16px">Revisión de importación</h2>'+
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 18px;line-height:1.7">'+
      '<div>Base Excel: <b>'+x.origen+'</b></div><div>Obras actuales: <b>'+x.existentes+'</b></div>'+
      '<div>Actualizaría: <b>'+x.actualizar+'</b></div><div>Crearía: <b>'+x.crear+'</b></div>'+
      '<div>Ambiguas: <b style="color:'+(x.ambiguas?'#ffb020':'#35c46a')+'">'+x.ambiguas+'</b></div><div>Sin tocar: <b>'+x.sinTocar+'</b></div>'+
      '<div>Siguiente cotización: <b>'+x.siguienteCotizacion+'</b></div><div>Esperada: <b>4696</b></div></div>'+
      '<p style="margin:16px 0 8px;color:'+(x.listaParaAplicar?'#35c46a':'#ffb020')+'"><b>'+(x.listaParaAplicar?'La simulación pasó todos los controles.':'La carga permanece bloqueada hasta resolver las diferencias.')+'</b></p>'+
      (ambiguas.length?'<div style="margin-top:12px"><b>Primeras coincidencias ambiguas</b><div style="margin-top:8px;font-size:12px;color:#bbb">'+ambiguas.map(a=>'Fila '+a.source.filaExcel+' · OT '+a.source.ot+' · '+a.source.cliente+' · '+a.source.descripcion).join('<br>')+'</div></div>':'')+
      '<div style="display:flex;justify-content:flex-end;margin-top:18px"><button id="cerrar-migracion-v40" class="btn btn-primary">Cerrar</button></div></div>';
    document.body.appendChild(root);
    root.querySelector('#cerrar-migracion-v40').onclick=()=>root.remove();
  }

  function instalarBotonRevisionV40(){
    if(document.getElementById('btn-revisar-migracion-v40'))return true;
    const excel=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Excel');
    if(!excel)return false;
    const b=document.createElement('button');b.id='btn-revisar-migracion-v40';b.className='btn btn-ghost';
    b.innerHTML='<i class="ti ti-database-search"></i> Revisar importación';
    b.onclick=mostrarResumenMigracionV40;excel.parentElement.insertBefore(b,excel);return true;
  }
  if(!instalarBotonRevisionV40()){
    let intentos=0;const reloj=setInterval(()=>{if(instalarBotonRevisionV40()||++intentos>40)clearInterval(reloj)},250);
  }
})();
