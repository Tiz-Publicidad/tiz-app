// TIZ V82 — sincronización bidireccional de precios Cotizaciones <-> Obras <-> Cobranzas
(function(){
'use strict';
const num=v=>Number(v)||0;
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const base=v=>{const m=String(v??'').match(/\d{4,7}/);return m?String(Number(m[0])):''};
const rev=v=>String(v||'1.1').split('.').map(x=>parseInt(x,10)||0);
const newer=(a,b)=>{const ra=rev(a?.revision),rb=rev(b?.revision);return ra[0]!==rb[0]?ra[0]>rb[0]:ra[1]>rb[1]};
function budgetByBase(n){
  let best=null;
  (window.DB?.presupuestos||[]).forEach(p=>{if(base(p?.nro||p?.cotizacionBase)!==base(n))return;if(!best||newer(p,best))best=p;});
  return best;
}
function obraByBase(n){return (window.DB?.obras||[]).find(o=>base(o?.ot||o?.nroCotizacion||o?.infoPresupuesto?.nro)===base(n))||null;}
function currentCobrado(o){const f=o?.finanzas||{};return num(f?.anticipo?.montoCobrado)+num(f?.saldo?.montoCobrado);}
function currentRet(o){const r=o?.finanzas?.retenciones||{};return Object.values(r).reduce((a,v)=>a+num(v),0);}
function pricePatch(o,total,p){
  const oldFin=o?.finanzas||{},cob=currentCobrado(o),ret=currentRet(o),pend=Math.max(0,total-cob-ret);
  const info={...(o?.infoPresupuesto||{}),importe:total,nro:p?.nro||o?.infoPresupuesto?.nro||base(o?.ot),presupuestoId:p?.id||o?.presupuestoId||o?.infoPresupuesto?.presupuestoId||'',revision:p?.revision||o?.revisionCotizacion||o?.infoPresupuesto?.revision||'',cliente:p?.cliente||o?.cliente||'',descripcion:p?.desc||o?.desc||''};
  const sf={...(o?.sectores?.facturacion||o?.gestionSectores?.facturacion||{}),infoPresupuesto:info,importePresupuestado:total};
  const sc={...(o?.sectores?.cobranzas||o?.gestionSectores?.cobranzas||{}),infoPresupuesto:info,montoTotal:total,saldoPendiente:pend};
  const fin={...oldFin,total,anticipo:{facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0,...(oldFin.anticipo||{})},saldo:{facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:total,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0,...(oldFin.saldo||{})},retenciones:{suss:0,iibb:0,ganancias:0,iva:0,otras:0,...(oldFin.retenciones||{})}};
  if(!fin.saldo.facturado&&!fin.saldo.nroFactura)fin.saldo.monto=Math.max(0,total-num(fin.anticipo.monto));
  return {neto:total,importe:total,infoPresupuesto:info,finanzas:fin,'sectores.facturacion':sf,'sectores.cobranzas':sc,precioSincronizadoAt:new Date().toISOString()};
}
async function syncFromBudget(p,{preserveApproved=false}={}){
  if(!p?.id||typeof window.updateDoc_!=='function')return false;
  const total=num(p.importe||p.neto||p.total);if(total<=0)return false;
  const o=obraByBase(p.nro||p.cotizacionBase);if(!o?.id)return false;
  if(preserveApproved&&norm(p.estado)!=='aprobado'){
    await window.updateDoc_('presupuestos',p.id,{estado:'Aprobado',precioSincronizadoAt:new Date().toISOString()});p.estado='Aprobado';
  }
  const patch=pricePatch(o,total,p);await window.updateDoc_('obras',o.id,patch);Object.assign(o,{neto:total,importe:total,infoPresupuesto:patch.infoPresupuesto,finanzas:patch.finanzas});
  window.showToast?.(`Precio sincronizado en OT ${base(o.ot)} y Cobranzas`);setTimeout(()=>window.renderCobranzas?.(),0);return true;
}
async function syncFromCobranza(o,total){
  total=num(total);if(!o?.id||total<=0||typeof window.updateDoc_!=='function')return false;
  const p=budgetByBase(o.ot||o.infoPresupuesto?.nro);
  const patch=pricePatch(o,total,p);await window.updateDoc_('obras',o.id,patch);Object.assign(o,{neto:total,importe:total,infoPresupuesto:patch.infoPresupuesto,finanzas:patch.finanzas});
  if(p?.id){await window.updateDoc_('presupuestos',p.id,{importe:total,total,precioSincronizadoAt:new Date().toISOString()});p.importe=total;p.total=total;}
  window.showToast?.(`Precio actualizado en Cobranzas${p?.id?' y Cotización':''}`);setTimeout(()=>window.renderCobranzas?.(),0);return true;
}
function wrapBudgetSave(name){
  const old=window[name];if(typeof old!=='function'||old.__priceSyncV82)return;
  const wrapped=async function(){
    const editId=window.editingId?.presupuesto||null,prev=editId?(window.DB?.presupuestos||[]).find(p=>p.id===editId):null,wasApproved=norm(prev?.estado)==='aprobado';
    const result=await old.apply(this,arguments);
    const nro=document.getElementById('pp-nro')?.value||prev?.nro||'',p=(editId?(window.DB?.presupuestos||[]).find(x=>x.id===editId):null)||budgetByBase(nro);
    if(p)await syncFromBudget(p,{preserveApproved:wasApproved});
    return result;
  };wrapped.__priceSyncV82=true;window[name]=wrapped;
}
function hookCobranzaModal(){
  const root=document.getElementById('modal-cobranza-v41');if(!root||root.dataset.priceSyncV82)return;root.dataset.priceSyncV82='1';
  const total=root.querySelector('#fin-total'),save=root.querySelector('#fin-save');if(!total||!save)return;
  const title=document.createElement('div');title.style.cssText='font-size:10px;color:var(--text3);margin-top:4px';title.textContent='El total es bidireccional: al guardarlo también se actualiza la cotización vinculada.';total.insertAdjacentElement('afterend',title);
  save.addEventListener('click',()=>{const id=root.dataset.obraId||window.editingId?.obra||'',o=(window.DB?.obras||[]).find(x=>x.id===id)||obraByBase(root.querySelector('[data-ot]')?.textContent||'');setTimeout(()=>{const obra=o||((window.DB?.obras||[]).find(x=>x.id===id));if(obra)syncFromCobranza(obra,total.value).catch(e=>console.error('[TIZ V82]',e));},0);},{capture:true});
}
function wrapGestion(){const old=window.editarCobranzaObraV41;if(typeof old!=='function'||old.__priceSyncV82)return;const wrapped=function(id){const r=old.apply(this,arguments);setTimeout(()=>{const root=document.getElementById('modal-cobranza-v41');if(root)root.dataset.obraId=id;hookCobranzaModal();},0);return r};wrapped.__priceSyncV82=true;window.editarCobranzaObraV41=wrapped;}
async function repairMismatch(){
  if(typeof window.updateDoc_!=='function')return;
  for(const p of (window.DB?.presupuestos||[])){
    const o=obraByBase(p?.nro);if(!o?.id)continue;const latest=budgetByBase(p.nro);if(latest?.id!==p.id)continue;const total=num(p.importe||p.neto||p.total);if(total<=0)continue;
    const current=num(o?.finanzas?.total||o?.neto||o?.importe);if(Math.abs(current-total)>.01)try{await syncFromBudget(p,{preserveApproved:false});}catch(e){console.error('[TIZ V82] reparación',e);}
  }
}
function install(){wrapBudgetSave('guardarPresupuestoCompleto');wrapBudgetSave('generarPDF');wrapGestion();hookCobranzaModal();}
install();window.addEventListener('load',()=>{install();setTimeout(install,700);setTimeout(()=>repairMismatch().catch(console.error),1800);});let n=0;const t=setInterval(()=>{install();if(++n>40)clearInterval(t)},250);
window.tizSyncPriceV82={fromBudget:syncFromBudget,fromCobranza:syncFromCobranza,repair:repairMismatch};
})();
