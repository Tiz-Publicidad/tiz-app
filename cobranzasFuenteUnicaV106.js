// TIZ V106.2 - Fuente unica: aprobadas -> Obras, facturas historicas genericas y cola canonica.
(function(){
'use strict';
const num=v=>Number(v)||0;
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const base=v=>{const m=String(v??'').match(/\d{4,7}/);return m?String(Number(m[0])):''};
const approved=v=>norm(v).startsWith('aprob');
const money=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
let running=false,rerenderPending=false;

function showBuild(){
  const old=document.getElementById('tiz-build-v20');if(old)old.style.display='none';
  let badge=document.getElementById('tiz-runtime-v106');
  if(!badge){badge=document.createElement('div');badge.id='tiz-runtime-v106';badge.style.cssText='position:fixed;right:10px;bottom:8px;z-index:99999;background:#1a1a1a;border:1px solid rgba(232,184,75,.45);color:#e8b84b;border-radius:6px;padding:4px 8px;font:10px DM Mono,monospace;pointer-events:none';document.body.appendChild(badge)}
  badge.textContent='TIZ V106.2 · FACTURACION/COBRANZAS · 16/09/2026';
}
function totalBudget(p){return num(p?.importe||p?.neto||p?.total||p?.totalItems||(Array.isArray(p?.items)?p.items.reduce((a,it)=>a+num(it?.subtotal||num(it?.precio)*num(it?.cant||it?.cantidad||1)),0):0))}
function latestApproved(){
  const map=new Map();
  for(const p of (window.DB?.presupuestos||[])){
    if(!approved(p?.estado||p?.status||p?.estadoRevision))continue;
    const n=base(p?.nro||p?.nroPresupuesto||p?.cotizacionBase);if(!n)continue;
    const prev=map.get(n),a=String(p?.revision||''),b=String(prev?.revision||'');
    if(!prev||a.localeCompare(b,undefined,{numeric:true})>=0)map.set(n,p);
  }
  return [...map.values()];
}
function obraForBudget(p){
  const obras=window.DB?.obras||[],n=base(p?.nro||p?.nroPresupuesto||p?.cotizacionBase);
  return (p?.obraId&&obras.find(o=>o.id===p.obraId))||obras.find(o=>o?.presupuestoId===p?.id||o?.cotizacionId===p?.id)||obras.find(o=>base(o?.ot)===n&&n)||null;
}
function localObraFromBudget(p,id){
  const total=totalBudget(p),n=base(p?.nro||p?.nroPresupuesto||p?.cotizacionBase),part={facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0};
  return {id,ot:n,cliente:p?.cliente||'',desc:p?.desc||p?.descripcion||'',descripcion:p?.desc||p?.descripcion||'',estado:'Aprobado',neto:total,importe:total,origen:'presupuesto',presupuestoId:p?.id||'',cotizacionId:p?.id||'',nroCotizacion:p?.nro||n,revisionCotizacion:p?.revision||'1.1',infoPresupuesto:{presupuestoId:p?.id||'',nro:p?.nro||n,revision:p?.revision||'1.1',importe:total,cliente:p?.cliente||'',descripcion:p?.desc||p?.descripcion||'',estado:'Aprobado'},finanzas:{total,anticipo:{...part},saldo:{...part}}};
}
async function ensureApprovedWorks(){
  if(running)return 0;running=true;let changed=0;
  try{
    if(!Array.isArray(window.DB?.obras)||!Array.isArray(window.DB?.presupuestos))return 0;
    for(const p of latestApproved()){
      let o=obraForBudget(p);
      if(!o){
        try{
          let id='';
          if(typeof window.ensureObraFromPresupuestoV358==='function') id=await window.ensureObraFromPresupuestoV358(p.id,p)||'';
          else if(typeof window.addDoc_==='function'){const ref=await window.addDoc_('obras',localObraFromBudget(p,''));id=ref?.id||'';}
          if(id){p.obraId=id;o=localObraFromBudget(p,id);if(!window.DB.obras.some(x=>x.id===id||base(x?.ot)===base(p?.nro)))window.DB.obras.push(o);changed++;}
        }catch(e){console.error('[TIZ V106.2] No se pudo promover aprobada '+base(p?.nro),e)}
      }
      if(!o)continue;
      const total=totalBudget(p)||num(o?.neto||o?.importe||o?.finanzas?.total),patch={};
      if(p?.id&&o.presupuestoId!==p.id){patch.presupuestoId=p.id;patch.cotizacionId=p.id;}
      if(total>0){patch.finanzas={...(o.finanzas||{}),total};patch.neto=total;patch.importe=total;}
      patch.infoPresupuesto={...(o.infoPresupuesto||{}),presupuestoId:p?.id||o?.presupuestoId||'',nro:p?.nro||base(o?.ot),revision:p?.revision||o?.revisionCotizacion||'1.1',importe:total,cliente:p?.cliente||o?.cliente||'',descripcion:p?.desc||p?.descripcion||o?.desc||'',estado:'Aprobado'};
      Object.assign(o,patch);
      if(o.id&&typeof window.updateDoc_==='function')try{await window.updateDoc_('obras',o.id,patch);}catch(e){console.error('[TIZ V106.2] No se pudo reconciliar OT '+base(o.ot),e)}
      if(p?.id&&p?.obraId!==o.id&&typeof window.updateDoc_==='function')try{await window.updateDoc_('presupuestos',p.id,{obraId:o.id,promovidoAObra:true});p.obraId=o.id;}catch(e){console.warn('[TIZ V106.2] No se pudo reparar vínculo presupuesto/obra',e)}
    }
  }finally{running=false}
  return changed;
}

function invoiceCandidates(o){
  const f=o?.finanzas||{},sf=o?.sectores?.facturacion||o?.gestionSectores?.facturacion||{},arr=[];
  if(o?.facturaArca)arr.push(o.facturaArca);
  if(Array.isArray(o?.comprobantesArca))arr.push(...o.comprobantesArca);
  if(Array.isArray(o?.facturasArca))arr.push(...o.facturasArca);
  arr.push({numeroCompleto:o?.nrfc,fecha:o?.ffc},{numeroCompleto:sf?.nroFactura,fecha:sf?.fechaFactura},{numeroCompleto:f?.anticipo?.nroFactura,fecha:f?.anticipo?.fechaFactura,neto:f?.anticipo?.monto},{numeroCompleto:f?.saldo?.nroFactura,fecha:f?.saldo?.fechaFactura,neto:f?.saldo?.monto});
  return arr.filter(Boolean);
}
function invoiceNumber(o){
  for(const x of invoiceCandidates(o)){const n=String(x?.numeroCompleto||x?.nroFactura||x?.numero||'').trim();if(n)return n;}
  return '';
}
function invoiceAmount(o){
  for(const x of invoiceCandidates(o)){const v=num(x?.neto||x?.importeNeto||x?.monto||x?.importe||x?.total||x?.importeTotal||x?.totalComprobante);if(v>0)return v;}
  return 0;
}
function budgetForObra(o){const n=base(o?.ot||o?.infoPresupuesto?.nro);return latestApproved().find(p=>base(p?.nro||p?.cotizacionBase)===n)||null}
function normalizeGenericInvoices(){
  let changed=0;
  for(const o of (window.DB?.obras||[])){
    const n=invoiceNumber(o);if(!n)continue;
    if(!o.nrfc){o.nrfc=n;changed++;}
    const raw=o.finanzas||{},b=budgetForObra(o),total=num(raw.total||o.neto||o.importe||o.infoPresupuesto?.importe||totalBudget(b)||invoiceAmount(o));
    if(total>0&&num(raw.total)!==total){o.finanzas={...raw,total};changed++;}
    const sf=o?.sectores?.facturacion||o?.gestionSectores?.facturacion||{};
    if(!sf.nroFactura&&o.sectores){o.sectores={...o.sectores,facturacion:{...sf,nroFactura:n,facturado:true,estado:'Facturado'}};changed++;}
  }
  return changed;
}

const HIST={
  '4680':{numero:'00009-00000001',fecha:'2026-09-04',monto:329200,estado:'Factura enviada'},
  '4701':{numero:'00009-00000002',fecha:'2026-09-07',monto:1477118,estado:'Facturada - falta enviar'}
};
async function migrateKnownHistorical(){
  let changed=0;
  for(const o of (window.DB?.obras||[])){
    const h=HIST[base(o?.ot)];if(!h||invoiceNumber(o)||!o?.id)continue;
    const raw=o.finanzas||{},total=num(raw.total||o.neto||o.importe||h.monto),saldo={...(raw.saldo||{}),facturado:true,nroFactura:h.numero,fechaFactura:h.fecha,porcentaje:100,monto:num(raw?.saldo?.monto)||h.monto||total};
    const sf=o?.sectores?.facturacion||o?.gestionSectores?.facturacion||{},patch={finanzas:{...raw,total:total||h.monto,saldo},nrfc:h.numero,ffc:h.fecha,estadoGestionFactura:o.estadoGestionFactura||h.estado,sectores:{...(o.sectores||{}),facturacion:{...sf,estado:'Facturado',facturado:true,nroFactura:h.numero,fechaFactura:h.fecha}}};
    try{await window.updateDoc_('obras',o.id,patch);Object.assign(o,patch);changed++;}catch(e){console.error('[TIZ V106.2] No se pudo migrar '+h.numero,e)}
  }
  return changed;
}
function emitted(o){
  const total=num(o?.finanzas?.total||o?.neto||o?.importe||o?.infoPresupuesto?.importe),f=o?.finanzas||{};
  let v=0;if(f?.anticipo?.facturado||f?.anticipo?.nroFactura)v+=num(f?.anticipo?.monto);if(f?.saldo?.facturado||f?.saldo?.nroFactura)v+=num(f?.saldo?.monto);
  if(v>0)return Math.min(total||v,v);
  const a=invoiceAmount(o);if(a>0)return Math.min(total||a,a);
  return invoiceNumber(o)?total:0;
}
function renderFacturarCanonical(){
  if(window.cobTab!=='facturar')return;
  const mod=document.getElementById('cobr-modulo-v48');if(!mod)return;
  const rows=latestApproved().map(p=>{const o=obraForBudget(p),total=totalBudget(p)||num(o?.finanzas?.total||o?.neto||o?.importe),fact=o?emitted(o):0,saldo=Math.max(0,total-fact);return {p,o,total,fact,saldo}}).filter(x=>x.total>0&&x.saldo>.01).sort((a,b)=>num(base(b.p?.nro))-num(base(a.p?.nro)));
  mod.innerHTML=`<div class="card"><div class="card-header"><span class="card-title">Cola de facturación</span><span style="font-size:10px;color:var(--text3)">${rows.length} aprobadas pendientes</span></div><div class="table-wrap"><table><thead><tr><th>OT</th><th>Cliente / obra</th><th>Facturación actual</th><th>Saldo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows.map(x=>{const id=x.o?.id||'',nr=invoiceNumber(x.o||{}),estado=x.o?'Lista para facturar':'Sincronizando obra';const acciones=id?`<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="editarCobranzaObraV41('${esc(id)}')">Gestionar</button><button class="btn btn-primary btn-sm" onclick="abrirFacturacionGeneralV63('${esc(id)}')"><i class="ti ti-receipt"></i> ${x.fact>0?'Facturar saldo':'Facturar'}</button></div>`:'<span style="color:var(--amber)">Sincronizando…</span>';return `<tr><td class="strong">${esc(base(x.p?.nro||x.o?.ot))}</td><td><b>${esc(x.p?.cliente||x.o?.cliente||'')}</b><br><span style="color:var(--text3)">${esc(x.p?.desc||x.p?.descripcion||x.o?.desc||'')}</span></td><td>${x.fact>0?`${nr?`FC ${esc(nr)} · `:''}${money.format(x.fact)}`:'<span style="color:var(--text3)">Sin facturar</span>'}</td><td>${money.format(x.saldo)}</td><td><span class="badge badge-${x.o?'amber':'gray'}">${estado}</span></td><td>${acciones}</td></tr>`}).join('')||'<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text3)">No hay presupuestos aprobados pendientes de facturar.</td></tr>'}</tbody></table></div></div>`;
}
async function reconcileAll(){
  showBuild();normalizeGenericInvoices();
  const a=await ensureApprovedWorks();const b=await migrateKnownHistorical();normalizeGenericInvoices();window.tizReconciliarCobranzasV105?.();
  if(window.cobTab==='facturar')setTimeout(renderFacturarCanonical,0);
  if((a||b)&&!rerenderPending){rerenderPending=true;setTimeout(()=>{rerenderPending=false;window.renderCobranzas?.();renderFacturarCanonical();},180);setTimeout(()=>{window.renderCobranzas?.();renderFacturarCanonical();},1000)}
  return {obras:a,facturas:b};
}
function installHooks(){
  const r=window.renderCobranzas;
  if(typeof r==='function'&&!r.__tizV106){const w=function(){normalizeGenericInvoices();const out=r.apply(this,arguments);if(window.cobTab==='facturar')queueMicrotask(renderFacturarCanonical);reconcileAll().catch(e=>console.error('[TIZ V106.2]',e));return out};w.__tizV106=true;window.renderCobranzas=w;}
  const s=window.setCobTab;
  if(typeof s==='function'&&!s.__tizV106){const w=function(){const out=s.apply(this,arguments);normalizeGenericInvoices();if(window.cobTab==='facturar')queueMicrotask(renderFacturarCanonical);reconcileAll().then(()=>setTimeout(renderFacturarCanonical,120)).catch(e=>console.error('[TIZ V106.2]',e));return out};w.__tizV106=true;window.setCobTab=w;}
  const refresh=window.refreshCurrent;
  if(typeof refresh==='function'&&!refresh.__tizV106){const w=function(){const out=refresh.apply(this,arguments);setTimeout(()=>reconcileAll().catch(console.error),0);return out};w.__tizV106=true;window.refreshCurrent=w;}
}
async function init(){showBuild();installHooks();await reconcileAll();[700,1800,4500,9000,18000].forEach(ms=>setTimeout(()=>{installHooks();normalizeGenericInvoices();reconcileAll().catch(console.error);if(window.cobTab==='facturar')renderFacturarCanonical()},ms));}
window.tizReconciliarFuenteUnicaV106=reconcileAll;
window.tizRenderParaFacturarCanonicoV106=renderFacturarCanonical;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
