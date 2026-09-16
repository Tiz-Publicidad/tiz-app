// TIZ V106.1 - Fuente unica: aprobadas -> Obras, facturas historicas y reconciliacion runtime.
(function(){
'use strict';
const num=v=>Number(v)||0;
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const base=v=>{const m=String(v??'').match(/\d{4,7}/);return m?String(Number(m[0])):''};
const approved=v=>norm(v).startsWith('aprob');
let running=false, rerenderPending=false;

function showBuild(){
  const old=document.getElementById('tiz-build-v20');
  if(old) old.style.display='none';
  let badge=document.getElementById('tiz-runtime-v106');
  if(!badge){badge=document.createElement('div');badge.id='tiz-runtime-v106';badge.style.cssText='position:fixed;right:10px;bottom:8px;z-index:99999;background:#1a1a1a;border:1px solid rgba(232,184,75,.45);color:#e8b84b;border-radius:6px;padding:4px 8px;font:10px DM Mono,monospace;pointer-events:none';document.body.appendChild(badge)}
  badge.textContent='TIZ V106.1 · FACTURACION/COBRANZAS · 16/09/2026';
}
function totalBudget(p){return num(p?.importe||p?.neto||p?.total||p?.totalItems||(Array.isArray(p?.items)?p.items.reduce((a,it)=>a+num(it?.subtotal||num(it?.precio)*num(it?.cant||it?.cantidad||1)),0):0))}
function obraForBudget(p){
  const obras=window.DB?.obras||[], n=base(p?.nro||p?.nroPresupuesto||p?.cotizacionBase);
  return (p?.obraId&&obras.find(o=>o.id===p.obraId)) || obras.find(o=>o?.presupuestoId===p?.id||o?.cotizacionId===p?.id) || obras.find(o=>base(o?.ot)===n&&n) || null;
}
function latestApproved(){
  const map=new Map();
  for(const p of (window.DB?.presupuestos||[])){
    if(!approved(p?.estado||p?.status||p?.estadoRevision))continue;
    const n=base(p?.nro||p?.nroPresupuesto||p?.cotizacionBase);if(!n)continue;
    const prev=map.get(n), a=String(p?.revision||''), b=String(prev?.revision||'');
    if(!prev||a.localeCompare(b,undefined,{numeric:true})>=0)map.set(n,p);
  }
  return [...map.values()];
}
function localObraFromBudget(p,id){
  const total=totalBudget(p),n=base(p?.nro||p?.nroPresupuesto||p?.cotizacionBase);
  return {id,ot:n,cliente:p?.cliente||'',desc:p?.desc||p?.descripcion||'',descripcion:p?.desc||p?.descripcion||'',estado:'Aprobado',neto:total,importe:total,origen:'presupuesto',presupuestoId:p?.id||'',cotizacionId:p?.id||'',nroCotizacion:p?.nro||n,revisionCotizacion:p?.revision||'1.1',infoPresupuesto:{presupuestoId:p?.id||'',nro:p?.nro||n,revision:p?.revision||'1.1',importe:total,cliente:p?.cliente||'',descripcion:p?.desc||p?.descripcion||'',estado:'Aprobado'},finanzas:{total,anticipo:{facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0},saldo:{facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0}}};
}
async function ensureApprovedWorks(){
  if(running)return 0;running=true;let changed=0;
  try{
    if(!Array.isArray(window.DB?.obras)||!Array.isArray(window.DB?.presupuestos))return 0;
    for(const p of latestApproved()){
      let o=obraForBudget(p);
      if(!o && typeof window.ensureObraFromPresupuestoV358==='function'){
        try{
          const id=await window.ensureObraFromPresupuestoV358(p.id,p);
          if(id){
            changed++;p.obraId=id;
            if(!window.DB.obras.some(x=>x.id===id||base(x?.ot)===base(p?.nro))) window.DB.obras.push(localObraFromBudget(p,id));
          }
        }catch(e){console.error('[TIZ V106.1] No se pudo promover aprobada '+base(p?.nro),e)}
        continue;
      }
      if(o){
        const total=totalBudget(p)||num(o?.neto||o?.importe||o?.finanzas?.total);
        const patch={};
        if(p?.id && o.presupuestoId!==p.id){patch.presupuestoId=p.id;patch.cotizacionId=p.id;}
        if(total>0 && num(o?.finanzas?.total)!==total)patch.finanzas={...(o.finanzas||{}),total};
        if(total>0 && num(o?.neto)!==total)patch.neto=total;
        if(total>0 && num(o?.importe)!==total)patch.importe=total;
        const info={...(o.infoPresupuesto||{})};
        if(!info.nro)info.nro=p?.nro||base(o?.ot);
        if(!info.presupuestoId)info.presupuestoId=p?.id||'';
        if(!num(info.importe)&&total>0)info.importe=total;
        if(!info.estado)info.estado=p?.estado||'Aprobado';
        patch.infoPresupuesto=info;
        const keys=Object.keys(patch).filter(k=>k!=='infoPresupuesto'||JSON.stringify(info)!==JSON.stringify(o.infoPresupuesto||{}));
        if(keys.length&&o.id&&typeof window.updateDoc_==='function'){
          try{await window.updateDoc_('obras',o.id,patch);Object.assign(o,patch);changed++;}catch(e){console.error('[TIZ V106.1] No se pudo reconciliar OT '+base(o.ot),e)}
        }
        if(p?.id&&p?.obraId!==o.id&&typeof window.updateDoc_==='function'){
          try{await window.updateDoc_('presupuestos',p.id,{obraId:o.id,promovidoAObra:true});p.obraId=o.id;}catch(e){console.warn('[TIZ V106.1] No se pudo reparar vinculo presupuesto/obra',e)}
        }
      }
    }
  } finally {running=false;}
  return changed;
}

const HIST={
  '4680':{numero:'00009-00000001',fecha:'2026-09-04',monto:329200,estado:'Factura enviada'},
  '4701':{numero:'00009-00000002',fecha:'2026-09-07',monto:1477118,estado:'Facturada - falta enviar'}
};
function hasInvoice(o){
  const f=o?.finanzas||{}, sf=o?.sectores?.facturacion||o?.gestionSectores?.facturacion||{};
  const arr=[...(Array.isArray(o?.comprobantesArca)?o.comprobantesArca:[]),...(Array.isArray(o?.facturasArca)?o.facturasArca:[])];
  return !!(o?.nrfc||o?.facturaArca?.cae||arr.some(x=>x?.cae||x?.numeroCompleto||x?.nroFactura)||sf?.nroFactura||f?.anticipo?.nroFactura||f?.saldo?.nroFactura);
}
async function migrateHistoricalInvoices(){
  let changed=0;
  for(const o of (window.DB?.obras||[])){
    const h=HIST[base(o?.ot)];if(!h||hasInvoice(o)||!o?.id)continue;
    const raw=o.finanzas||{}, total=num(raw.total||o.neto||o.importe||h.monto), saldo={facturado:true,nroFactura:h.numero,fechaFactura:h.fecha,porcentaje:100,monto:h.monto||total,fechaPrevistaCobro:raw?.saldo?.fechaPrevistaCobro||'',fechaCobro:raw?.saldo?.fechaCobro||'',montoCobrado:num(raw?.saldo?.montoCobrado),...(raw.saldo||{})};
    saldo.facturado=true;saldo.nroFactura=saldo.nroFactura||h.numero;saldo.fechaFactura=saldo.fechaFactura||h.fecha;if(!num(saldo.monto))saldo.monto=h.monto||total;
    const sf=o?.sectores?.facturacion||o?.gestionSectores?.facturacion||{};
    const patch={finanzas:{...raw,total:total||h.monto,saldo},nrfc:o.nrfc||h.numero,ffc:o.ffc||h.fecha,estadoGestionFactura:o.estadoGestionFactura||h.estado,sectores:{...(o.sectores||{}),facturacion:{...sf,estado:'Facturado',facturado:true,nroFactura:sf.nroFactura||h.numero,fechaFactura:sf.fechaFactura||h.fecha}}};
    try{await window.updateDoc_('obras',o.id,patch);Object.assign(o,patch);changed++;console.info('[TIZ V106.1] Factura historica migrada',base(o.ot),h.numero);}catch(e){console.error('[TIZ V106.1] No se pudo migrar '+h.numero,e)}
  }
  return changed;
}

async function reconcileAll(){
  showBuild();
  const a=await ensureApprovedWorks();
  const b=await migrateHistoricalInvoices();
  window.tizReconciliarCobranzasV105?.();
  if((a||b)&&!rerenderPending){rerenderPending=true;setTimeout(()=>{rerenderPending=false;window.renderCobranzas?.();},150);setTimeout(()=>window.renderCobranzas?.(),1000)}
  return {obras:a,facturas:b};
}
function installHooks(){
  const r=window.renderCobranzas;
  if(typeof r==='function'&&!r.__tizV106){const w=function(){reconcileAll().catch(e=>console.error('[TIZ V106.1]',e));return r.apply(this,arguments)};w.__tizV106=true;window.renderCobranzas=w;}
  const s=window.setCobTab;
  if(typeof s==='function'&&!s.__tizV106){const w=function(){const out=s.apply(this,arguments);reconcileAll().then(()=>setTimeout(()=>window.renderCobranzas?.(),100)).catch(e=>console.error('[TIZ V106.1]',e));return out};w.__tizV106=true;window.setCobTab=w;}
  const refresh=window.refreshCurrent;
  if(typeof refresh==='function'&&!refresh.__tizV106){const w=function(){const out=refresh.apply(this,arguments);setTimeout(()=>reconcileAll().catch(console.error),0);return out};w.__tizV106=true;window.refreshCurrent=w;}
}
async function init(){
  showBuild();installHooks();await reconcileAll();
  [800,2000,5000,10000,20000].forEach(ms=>setTimeout(()=>{installHooks();reconcileAll().catch(console.error)},ms));
}
window.tizReconciliarFuenteUnicaV106=reconcileAll;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
