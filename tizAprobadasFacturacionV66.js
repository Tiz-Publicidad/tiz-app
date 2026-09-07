// TIZ V66 — Toda CT aprobada debe quedar disponible en Facturación > Para facturar.
(function(){
  'use strict';
  const num=v=>Number(v)||0;
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const digits=v=>String(v??'').replace(/\D/g,'');
  const approved=v=>{const n=norm(v);return n==='aprobado'||n==='aprobada'||n.startsWith('aprob');};
  const itemsFrom=p=>{
    const raw=Array.isArray(p?.items)?p.items:(Array.isArray(p?.itemsCotizados)?p.itemsCotizados:[]);
    return raw.map(it=>{const cantidad=num(it.cant??it.cantidad??it.unidades??1)||1;const unitario=num(it.precio??it.unitario??it.precioUnitario);return {descripcion:String(it.descripcion??it.desc??it.detalle??'').trim(),desc:String(it.desc??it.descripcion??it.detalle??'').trim(),cantidad,cant:cantidad,unidades:cantidad,unitario,precio:unitario,subtotal:num(it.subtotal??it.total)||cantidad*unitario,observaciones:String(it.observaciones??'').trim()};}).filter(it=>it.descripcion||it.subtotal||it.unitario);
  };
  const totalFrom=p=>num(p?.importe||p?.neto||p?.total||p?.totalItems)||itemsFrom(p).reduce((a,it)=>a+num(it.subtotal),0);

  function latestApprovedByNumber(){
    const map=new Map();
    (window.DB?.presupuestos||[]).forEach(p=>{
      if(!approved(p?.estado||p?.status||p?.estadoRevision))return;
      const n=digits(p.nro||p.nroPresupuesto||p.cotizacionBase);if(!n)return;
      const prev=map.get(n);const r=String(p.revision||'').split('.').map(Number);const pr=String(prev?.revision||'').split('.').map(Number);
      if(!prev || (r[0]||0)>(pr[0]||0) || ((r[0]||0)===(pr[0]||0)&&(r[1]||0)>=(pr[1]||0))) map.set(n,p);
    });
    return map;
  }

  async function reconcileApproved(){
    const presup=latestApprovedByNumber();
    const obras=window.DB?.obras||[];
    let changed=0;
    for(const o of obras){
      const n=digits(o.ot||o.nroPresupuesto||o.infoPresupuesto?.nro);if(!n)continue;
      const p=presup.get(n);
      const obraApproved=approved(o.estado)||approved(o.estadoRevision)||approved(o.infoPresupuesto?.estado);
      if(!p&&!obraApproved)continue;
      const total=totalFrom(p)||num(o.infoPresupuesto?.importe||o.importe||o.neto||o.finanzas?.total||o.gestionSectores?.facturacion?.importePresupuestado||o.gestionSectores?.cobranzas?.montoTotal||o.sectores?.facturacion?.importePresupuestado||o.sectores?.cobranzas?.montoTotal);
      if(total<=0)continue;
      const f={...(o.finanzas||{})};
      const patch={neto:total,importe:total,finanzas:{...f,total},infoPresupuesto:{...(o.infoPresupuesto||{}),importe:total,nro:p?.nro||o.infoPresupuesto?.nro||n,presupuestoId:p?.id||o.infoPresupuesto?.presupuestoId||'',revision:p?.revision||o.infoPresupuesto?.revision||'',cliente:p?.cliente||o.cliente||'',descripcion:p?.desc||p?.descripcion||o.desc||''}};
      const its=itemsFrom(p); if(its.length){patch.itemsCotizados=its;if(!Array.isArray(o.itemsTecnicos)||!o.itemsTecnicos.length)patch.itemsTecnicos=its.map(it=>({descripcion:it.descripcion,articulo:it.descripcion,cantidad:it.cantidad,unidad:it.unidad||'u',observaciones:it.observaciones||''}));}
      const alreadyCorrect=num(o.neto)===total&&num(o.importe)===total&&num(f.total)===total;
      if(!alreadyCorrect){Object.assign(o,patch);changed++;try{if(o.id&&typeof window.updateDoc_==='function')await window.updateDoc_('obras',o.id,patch);}catch(e){console.error('[TIZ V66] No se pudo persistir OT '+n,e);}}
    }
    if(changed){console.info('[TIZ V66] Obras aprobadas reconciliadas para facturación:',changed);window.renderCobranzas?.();}
    return changed;
  }
  window.reconciliarAprobadasParaFacturarV66=reconcileApproved;

  let installed=false;
  function installRenderHook(){
    if(installed||typeof window.renderCobranzas!=='function')return false;
    const old=window.renderCobranzas;
    const wrapped=function(){reconcileApproved().catch(e=>console.error('[TIZ V66] reconcile',e));return old.apply(this,arguments);};
    wrapped.__tizV66=true;window.renderCobranzas=wrapped;installed=true;return true;
  }
  function init(){
    let tries=0;const t=setInterval(()=>{tries++;if(installRenderHook()||tries>40)clearInterval(t);},250);
    [1200,3000,6000,10000].forEach(ms=>setTimeout(()=>reconcileApproved().catch(e=>console.error('[TIZ V66]',e)),ms));
    console.info('[TIZ] V66 Aprobadas -> Para facturar cargado');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
