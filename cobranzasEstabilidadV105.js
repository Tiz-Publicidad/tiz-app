// TIZ V105 - Estabilidad de Cobranzas: estados editables, facturas historicas y obras nuevas.
(function(){
'use strict';
const num=v=>Number(v)||0;
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const base=v=>{const m=String(v??'').match(/\d{4,7}/);return m?String(Number(m[0])):''};
const estados=['Pendiente de facturar','Facturada - falta enviar','Factura enviada','Esperando fecha de pago','Cobro programado','Vencida - reclamar','Pago parcial','Cobrado','En revisión'];
const approved=v=>norm(v).startsWith('aprob');
function totalOf(o){return num(o?.finanzas?.total||o?.infoPresupuesto?.importe||o?.sectores?.cobranzas?.montoTotal||o?.gestionSectores?.cobranzas?.montoTotal||o?.sectores?.facturacion?.importePresupuestado||o?.gestionSectores?.facturacion?.importePresupuestado||o?.neto||o?.importe)}
function invoiceRefs(o){
  const out=[];const add=(n,d,m,s)=>{n=String(n||'').trim();if(!n)return;const k=norm(n);if(out.some(x=>norm(x.n)===k))return;out.push({n,d:d||'',m:num(m),sent:!!s})};
  const arr=[...(Array.isArray(o?.comprobantesArca)?o.comprobantesArca:[]),...(Array.isArray(o?.facturasArca)?o.facturasArca:[])];
  if(o?.facturaArca)arr.push(o.facturaArca);
  arr.forEach(x=>add(x?.numeroCompleto||x?.nroFactura||x?.numero||x?.cbteNro,x?.fecha||x?.fechaFactura,x?.neto||x?.importeNeto||x?.importe,x?.emailUltimoEnvioAt));
  const sf=o?.sectores?.facturacion||o?.gestionSectores?.facturacion||{};
  add(o?.nrfc,o?.ffc||o?.fechaFactura,o?.montoFactura,o?.emailUltimoEnvioAt);
  add(o?.nroFactura||o?.numeroFactura||o?.facturaNumero,o?.fechaFactura,o?.importeFactura,o?.emailUltimoEnvioAt);
  add(sf?.nroFactura||sf?.numeroFactura||sf?.factura,sf?.fechaFactura,sf?.importeFacturado||sf?.montoFactura,sf?.emailUltimoEnvioAt);
  const f=o?.finanzas||{};add(f?.anticipo?.nroFactura,f?.anticipo?.fechaFactura,f?.anticipo?.monto,f?.anticipo?.emailUltimoEnvioAt);add(f?.saldo?.nroFactura,f?.saldo?.fechaFactura,f?.saldo?.monto,f?.saldo?.emailUltimoEnvioAt);
  return out;
}
function approvedMap(){const map=new Map();for(const p of (window.DB?.presupuestos||[])){if(!approved(p?.estado||p?.status||p?.estadoRevision))continue;const n=base(p?.nro||p?.nroPresupuesto||p?.cotizacionBase);if(!n)continue;const prev=map.get(n);if(!prev||String(p?.revision||'')>=String(prev?.revision||''))map.set(n,p)}return map}
function reconcile(){
  const pmap=approvedMap();
  for(const o of (window.DB?.obras||[])){
    if(!o)continue;
    const n=base(o?.ot||o?.nroPresupuesto||o?.infoPresupuesto?.nro),p=pmap.get(n);
    let total=totalOf(o);
    if(!total&&p) total=num(p?.importe||p?.neto||p?.total||p?.totalItems);
    if(total>0){const raw=o.finanzas||{};if(!num(raw.total))o.finanzas={...raw,total};if(!num(o.neto))o.neto=total;if(!num(o.importe))o.importe=total}
    if(p){o.infoPresupuesto={...(o.infoPresupuesto||{}),nro:o?.infoPresupuesto?.nro||p?.nro||n,presupuestoId:o?.infoPresupuesto?.presupuestoId||p?.id||'',estado:o?.infoPresupuesto?.estado||p?.estado||'Aprobado',importe:num(o?.infoPresupuesto?.importe)||total,cliente:o?.infoPresupuesto?.cliente||p?.cliente||o?.cliente||'',descripcion:o?.infoPresupuesto?.descripcion||p?.desc||p?.descripcion||o?.desc||o?.descripcion||''};if(!o.presupuestoId&&p?.id)o.presupuestoId=p.id;if(!o.origen)o.origen='presupuesto'}
    const refs=invoiceRefs(o),raw=o.finanzas||{},ant={facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0,...(raw.anticipo||{})},sal={facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0,...(raw.saldo||{})};
    if(refs.length&&!ant.nroFactura&&!sal.nroFactura){const r=refs[refs.length-1];sal.nroFactura=r.n;sal.fechaFactura=r.d;sal.facturado=true;if(r.m>0)sal.monto=r.m;o.finanzas={...raw,total:num(raw.total)||total,anticipo:ant,saldo:sal}}
  }
}
function currentState(o){if(o?.estadoGestionFactura)return o.estadoGestionFactura;const refs=invoiceRefs(o);if(refs.some(x=>x.sent))return 'Factura enviada';if(refs.length)return 'Facturada - falta enviar';return 'Pendiente de facturar'}
async function saveState(o,v,sel){const prev=o.estadoGestionFactura||'';sel.disabled=true;try{const patch={estadoGestionFactura:v,estadoGestionFacturaActualizadoAt:new Date().toISOString()};if(v==='Cobrado')patch.estado='Cobrado';await window.updateDoc_('obras',o.id,patch);Object.assign(o,patch);window.tizSyncGestionUnificadaV104?.();window.renderCobranzas?.();window.showToast?.('Estado de factura actualizado ✓')}catch(e){console.error('[TIZ V105] estado',e);sel.value=prev||currentState(o);window.showToast?.('No se pudo actualizar el estado')}finally{sel.disabled=false}}
function enhanceModal(id){
  const root=document.getElementById('modal-cobranza-v41'),o=(window.DB?.obras||[]).find(x=>x.id===id);if(!root||!o||root.querySelector('#v105-estado-factura'))return;
  const grid=root.querySelector('.form-grid');if(!grid)return;
  const box=document.createElement('div');box.className='form-group full';box.innerHTML=`<div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px"><label style="display:block;margin-bottom:6px">Estado de la factura</label><select id="v105-estado-factura" style="width:100%">${estados.map(s=>`<option ${s===currentState(o)?'selected':''}>${s}</option>`).join('')}</select><small style="color:var(--text3)">Este estado controla el punto amarillo/verde de Por cobrar.</small></div>`;
  grid.insertBefore(box,grid.firstChild);const sel=box.querySelector('select');sel.onchange=()=>saveState(o,sel.value,sel);
}
function installModalHook(){const old=window.editarCobranzaObraV41;if(typeof old!=='function'||old.__tizV105)return false;const wrapped=function(id){reconcile();const r=old.apply(this,arguments);setTimeout(()=>enhanceModal(id),0);return r};wrapped.__tizV105=true;window.editarCobranzaObraV41=wrapped;return true}
function installRenderHook(){const old=window.renderCobranzas;if(typeof old!=='function'||old.__tizV105)return false;const wrapped=function(){reconcile();return old.apply(this,arguments)};wrapped.__tizV105=true;window.renderCobranzas=wrapped;return true}
function init(){reconcile();installModalHook();installRenderHook();let tries=0;const t=setInterval(()=>{tries++;installModalHook();installRenderHook();if(tries>30)clearInterval(t)},250);setTimeout(()=>window.renderCobranzas?.(),0)}
window.tizReconciliarCobranzasV105=reconcile;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
