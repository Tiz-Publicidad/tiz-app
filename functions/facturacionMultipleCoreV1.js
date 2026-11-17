(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZFacturaMultipleCoreV1=api;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const text=v=>String(v??'').trim(),digits=v=>text(v).replace(/\D/g,''),round=v=>Math.round((Number(v)||0)*100)/100,cents=v=>Math.round(Number(v)*100);
 const key=c=>[Number(c.cbteTipo),Number(c.ptoVta||text(c.numeroCompleto).split('-')[0]),Number(c.cbteNro||text(c.numeroCompleto).split('-')[1])].join(':');
 function records(o){const seen=new Set();return [...(o.comprobantesArca||[]),...(o.facturasArca||[]),...(o.facturasManual||[]),...(o.facturasBaseMadre||[]),o.facturaArca].filter(c=>{if(!c||!(c.cae||c.numeroCompleto))return false;const k=key(c);if(seen.has(k))return false;seen.add(k);return true;});}
 const approved=o=>round(o.finanzas?.total||o.neto||o.importe||o.infoPresupuesto?.importe);
 const balance=o=>round(approved(o)-records(o).reduce((s,c)=>s+(c.familia==='credito'?-round(c.neto):round(c.neto)),0));
 function recipient(o,clients=[]){const c=clients.find(c=>c.id===o.clienteId)||clients.find(c=>text(c.nombre||c.razonSocial).toLowerCase()===text(o.cliente).toLowerCase())||{};return digits(o.clienteCuit||o.cuit||c.cuit);}
 function plan(works,selections,{cuit='',oc=''}={},clients=[]){
  if(!Array.isArray(selections)||selections.length<2||selections.length>30)throw Error('Seleccioná entre 2 y 30 OT para la factura.');
  const seen=new Set(),rows=selections.map(s=>{const id=text(s.obraId);if(!/^[\w-]{1,150}$/.test(id)||seen.has(id))throw Error('Hay una OT inválida o repetida.');seen.add(id);const o=works.find(w=>w.id===id);if(!o||o.archivado||o.revisionVigente===false||o.revisionOperativa===false||o.bajaObra?.activa||text(o.estado).toLowerCase()==='baja'||o.vigenciaComercial?.habilitada===false)throw Error('Una de las OT no está disponible para facturar.');const neto=Number(s.neto);if(!Number.isFinite(neto)||neto<=0||Math.abs(neto-round(neto))>.00001)throw Error('Indicá un importe neto positivo, con hasta dos decimales, por OT.');if(neto-balance(o)>.01)throw Error('El importe supera el saldo por facturar de la OT '+o.ot+'.');return {obraId:id,ot:text(o.ot),descripcion:text(o.desc||o.descripcion),neto:round(neto),cuit:recipient(o,clients)};});
  const expected=digits(cuit)||rows[0].cuit;if(!/^\d{11}$/.test(expected)||rows.some(r=>r.cuit!==expected))throw Error('Las OT deben tener el mismo CUIT receptor verificado. Completá los datos del cliente.');
  if(!text(oc)&&(works.some(w=>seen.has(w.id)&&w.requiereOC)||clients.some(c=>digits(c.cuit)===expected&&(c.requiereOC||c.requiereOc))))throw Error('Indicá la orden de compra común para estas OT.');
  if(text(oc).length>200)throw Error('La orden de compra supera los 200 caracteres.');
  return {cuit:expected,oc:text(oc),obraIds:rows.map(r=>r.obraId),ots:rows.map(r=>r.ot),distribucion:rows.map(({cuit,...r})=>r),neto:round(rows.reduce((s,r)=>s+r.neto,0)),presupuesto:round(works.filter(w=>seen.has(w.id)).reduce((s,w)=>s+approved(w),0)),emitido:round(works.filter(w=>seen.has(w.id)).reduce((s,w)=>s+approved(w)-balance(w),0)),saldoTotal:round(works.filter(w=>seen.has(w.id)).reduce((s,w)=>s+balance(w),0))};
 }
 function attach(comp,plan){if(cents(comp.neto)!==cents(plan.neto))throw Error('El neto de la factura debe coincidir con la suma de las OT.');return {...comp,oc:plan.oc,grupoFactura:{...plan,iva:round(comp.iva),total:round(comp.total)}};}
 function portion(comp,obraId){const g=comp.grupoFactura;if(!g)return comp;let allocated=0;const totalIva=cents(g.iva),net=cents(g.neto);for(let i=0;i<g.distribucion.length;i++){const r=g.distribucion[i],iva=i===g.distribucion.length-1?totalIva-allocated:Math.round(totalIva*cents(r.neto)/net);allocated+=iva;if(r.obraId===obraId)return {...comp,neto:r.neto,iva:iva/100,total:round(r.neto+iva/100),porcentaje:0};}throw Error('La OT no pertenece a esta factura.');}
 function whole(comp){const g=comp?.grupoFactura;return g?{...comp,neto:g.neto,iva:g.iva,total:g.total}:comp;}
 return {text,digits,round,key,records,approved,balance,recipient,plan,attach,portion,whole};
});
