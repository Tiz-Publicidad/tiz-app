// TIZ V103 - Compatibilidad de presupuestos aprobados e historico para Cobranzas V101.
(function(){
'use strict';
const num=v=>Number(v)||0;
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const base=v=>{const m=String(v??'').match(/\d{4,7}/);return m?String(Number(m[0])):''};
const approved=v=>norm(v).startsWith('aprob');
function budgetMap(){
  const map=new Map();
  for(const p of (window.DB?.presupuestos||[])){
    if(!approved(p?.estado||p?.status||p?.estadoRevision)) continue;
    const n=base(p?.nro||p?.nroPresupuesto||p?.cotizacionBase);
    if(!n) continue;
    const prev=map.get(n);
    if(!prev||String(p?.revision||'')>=String(prev?.revision||'')) map.set(n,p);
  }
  return map;
}
function reconcile(){
  const obras=window.DB?.obras||[], map=budgetMap();
  for(const o of obras){
    if(!o) continue;
    const n=base(o?.ot||o?.nroCotizacion||o?.nroPresupuesto||o?.infoPresupuesto?.nro);
    const p=map.get(n);
    if(!p) continue;
    const total=num(p?.importe||p?.neto||p?.total||o?.finanzas?.total||o?.neto||o?.importe);
    if(!o.infoPresupuesto) o.infoPresupuesto={};
    o.infoPresupuesto={...o.infoPresupuesto,nro:o.infoPresupuesto.nro||p.nro||n,presupuestoId:o.infoPresupuesto.presupuestoId||p.id||o.presupuestoId||'',importe:num(o.infoPresupuesto.importe)||total,estado:o.infoPresupuesto.estado||p.estado||'Aprobado',cliente:o.infoPresupuesto.cliente||p.cliente||o.cliente||'',descripcion:o.infoPresupuesto.descripcion||p.desc||p.descripcion||o.desc||o.descripcion||''};
    if(!num(o.neto)&&total>0)o.neto=total;
    if(!num(o.importe)&&total>0)o.importe=total;
    if(!o.presupuestoId&&p.id)o.presupuestoId=p.id;
    if(!o.origen)o.origen='presupuesto';
    const raw=o.finanzas||{};
    if(total>0&&!num(raw.total))o.finanzas={...raw,total};
  }
  window.tizNormalizarFacturasHistoricasV102?.();
}
const priorRender=window.renderCobranzas;
if(typeof priorRender==='function')window.renderCobranzas=function(){reconcile();return priorRender.apply(this,arguments)};
const priorSet=window.setCobTab;
if(typeof priorSet==='function')window.setCobTab=function(tab,button){reconcile();return priorSet.apply(this,arguments)};
window.tizReconciliarCobranzasV103=reconcile;
setTimeout(()=>{reconcile();if(window.cobTab==='cobrar')window.renderCobranzas?.()},0);
window.addEventListener('load',()=>{reconcile();if(window.cobTab==='cobrar')window.renderCobranzas?.()},{once:true});
})();
