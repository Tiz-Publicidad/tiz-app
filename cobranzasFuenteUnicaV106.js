// TIZ V106 - Fuente unica: aprobadas -> Obras y migracion canonica de facturas historicas.
(function(){
'use strict';
const num=v=>Number(v)||0;
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const base=v=>{const m=String(v??'').match(/\d{4,7}/);return m?String(Number(m[0])):''};
const approved=v=>norm(v).startsWith('aprob');
let running=false, rerenderPending=false;

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
async function ensureApprovedWorks(){
  if(running)return 0;running=true;let changed=0;
  try{
    for(const p of latestApproved()){
      let o=obraForBudget(p);
      if(!o && typeof window.ensureObraFromPresupuestoV358==='function'){
        try{
          const id=await window.ensureObraFromPresupuestoV358(p.id,p);
          if(id){changed++; if(!p.obraId)p.obraId=id;}
        }catch(e){console.error('[TIZ V106] No se pudo promover aprobada '+base(p?.nro),e)}
        continue;
      }
      if(o){
        const total=num(p?.importe||p?.neto||p?.total||p?.totalItems||o?.neto||o?.importe||o?.finanzas?.total);
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
          try{await window.updateDoc_('obras',o.id,patch);Object.assign(o,patch);changed++;}catch(e){console.error('[TIZ V106] No se pudo reconciliar OT '+base(o.ot),e)}
        }
        if(p?.id&&p?.obraId!==o.id&&typeof window.updateDoc_==='function'){
          try{await window.updateDoc_('presupuestos',p.id,{obraId:o.id,promovidoAObra:true});p.obraId=o.id;}catch(e){console.warn('[TIZ V106] No se pudo reparar vinculo presupuesto/obra',e)}
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
    const patch={finanzas:{...raw,total:total||h.monto,saldo},estadoGestionFactura:o.estadoGestionFactura||h.estado,sectores:{...(o.sectores||{}),facturacion:{...sf,estado:'Facturado',facturado:true,nroFactura:sf.nroFactura||h.numero,fechaFactura:sf.fechaFactura||h.fecha}}};
    try{await window.updateDoc_('obras',o.id,patch);Object.assign(o,patch);changed++;console.info('[TIZ V106] Factura historica migrada',base(o.ot),h.numero);}catch(e){console.error('[TIZ V106] No se pudo migrar '+h.numero,e)}
  }
  return changed;
}

async function reconcileAll(){
  const a=await ensureApprovedWorks();
  const b=await migrateHistoricalInvoices();
  window.tizReconciliarCobranzasV105?.();
  if((a||b)&&!rerenderPending){rerenderPending=true;setTimeout(()=>{rerenderPending=false;window.renderCobranzas?.();},50)}
  return {obras:a,facturas:b};
}
function installHooks(){
  const r=window.renderCobranzas;
  if(typeof r==='function'&&!r.__tizV106){const w=function(){reconcileAll().catch(e=>console.error('[TIZ V106]',e));return r.apply(this,arguments)};w.__tizV106=true;window.renderCobranzas=w;}
  const s=window.setCobTab;
  if(typeof s==='function'&&!s.__tizV106){const w=function(){const out=s.apply(this,arguments);reconcileAll().catch(e=>console.error('[TIZ V106]',e));return out};w.__tizV106=true;window.setCobTab=w;}
}
async function init(){installHooks();await reconcileAll();setTimeout(()=>reconcileAll().catch(console.error),1200);setTimeout(()=>reconcileAll().catch(console.error),4000);}
window.tizReconciliarFuenteUnicaV106=reconcileAll;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
