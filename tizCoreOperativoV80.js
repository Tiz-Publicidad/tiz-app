// TIZ V80 - Nucleo unico para aprobacion -> Obras -> Facturacion/Cobranzas
// Objetivo: una sola fuente operativa. No parchea filas: deriva y persiste el estado canonico de cada OT.
(function(){
'use strict';
const MONEY=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
const num=v=>Number(v)||0;
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const base=v=>{const m=String(v??'').match(/\d{4,7}/);return m?String(Number(m[0])):''};
const approved=v=>norm(v).startsWith('aprob');
const collected=v=>norm(v)==='cobrado';
const invoiceNumberValid=v=>{const s=norm(v);return !!s&&!['sin factura','sin facturar','-','—','n/a','na'].includes(s)};
const emptyPart=()=>({facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0});
function parseDate(v){
 if(!v)return null;if(v instanceof Date&&!isNaN(v))return new Date(v);
 if(typeof v==='object'&&typeof v?.toDate==='function')return v.toDate();
 const s=String(v).trim();let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return new Date(+m[1],+m[2]-1,+m[3]);
 m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m)return new Date(+m[3],+m[2]-1,+m[1]);
 const d=new Date(s);return isNaN(d)?null:d;
}
function isoWeek(d){d=parseDate(d)||new Date();const x=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=x.getUTCDay()||7;x.setUTCDate(x.getUTCDate()+4-day);const ys=new Date(Date.UTC(x.getUTCFullYear(),0,1));return Math.ceil((((x-ys)/86400000)+1)/7);}
function weekFor(o,p){
 const explicit=num(o?.semana||p?.semana);if(explicit)return explicit;
 const d=parseDate(o?.fechaAprobacion)||parseDate(p?.promovidoEn)||parseDate(p?.updatedAt)||parseDate(p?.fecha)||parseDate(o?.createdAt)||parseDate(o?.fecha);
 if(d)return isoWeek(d);
 if(p||o?.origen==='presupuesto'||approved(o?.estado))return isoWeek(new Date());
 return 0;
}
function approvedBudgets(){
 const map=new Map();
 (window.DB?.presupuestos||[]).forEach(p=>{if(!approved(p?.estado||p?.status||p?.estadoRevision))return;const n=base(p?.nro||p?.nroPresupuesto||p?.cotizacionBase);if(!n)return;const old=map.get(n);if(!old||String(p?.revision||'')>=String(old?.revision||''))map.set(n,p);});
 return map;
}
function findWorkForBudget(p){
 const n=base(p?.nro||p?.nroPresupuesto||p?.cotizacionBase);
 return (window.DB?.obras||[]).find(o=>o?.presupuestoId===p?.id||o?.cotizacionId===p?.id||(n&&base(o?.ot||o?.nroCotizacion)===n));
}
function budgetForWork(o,map){return map.get(base(o?.ot||o?.nroCotizacion||o?.nroPresupuesto||o?.infoPresupuesto?.nro))||null;}
function itemsFrom(p,o){
 const raw=Array.isArray(p?.items)?p.items:(Array.isArray(o?.itemsCotizados)?o.itemsCotizados:[]);
 return raw.map(it=>{const cantidad=num(it?.cant??it?.cantidad??it?.unidades??1)||1;const unitario=num(it?.precio??it?.unitario??it?.precioUnitario);return {descripcion:String(it?.descripcion??it?.desc??it?.detalle??'').trim(),desc:String(it?.desc??it?.descripcion??it?.detalle??'').trim(),cantidad,cant:cantidad,unidades:cantidad,unitario,precio:unitario,subtotal:num(it?.subtotal??it?.total)||cantidad*unitario,observaciones:String(it?.observaciones??'').trim()};}).filter(x=>x.descripcion||x.subtotal||x.unitario);
}
function totalFor(o,p){return num(p?.importe||p?.neto||p?.total||p?.totalItems||o?.finanzas?.total||o?.sectores?.cobranzas?.montoTotal||o?.gestionSectores?.cobranzas?.montoTotal||o?.sectores?.facturacion?.importePresupuestado||o?.gestionSectores?.facturacion?.importePresupuestado||o?.infoPresupuesto?.importe||o?.neto||o?.importe)||itemsFrom(p,o).reduce((a,x)=>a+num(x.subtotal),0);}
function invoiceList(o){const a=Array.isArray(o?.facturasArca)?o.facturasArca.filter(x=>x?.cae||invoiceNumberValid(x?.numeroCompleto)):[];if(o?.facturaArca&&(o.facturaArca.cae||invoiceNumberValid(o.facturaArca.numeroCompleto))&&!a.some(x=>x?.cae&&x.cae===o.facturaArca.cae))a.push(o.facturaArca);return a;}
function finance(o,p){
 const total=totalFor(o,p),raw=o?.finanzas||{},f={...raw,total,anticipo:{...emptyPart(),...(raw.anticipo||{})},saldo:{...emptyPart(),...(raw.saldo||{})},retenciones:{suss:0,iibb:0,ganancias:0,iva:0,otras:0,...(raw.retenciones||{})}};
 if(!f.saldo.monto&&total>0)f.saldo.monto=total;
 const sf=o?.sectores?.facturacion||o?.gestionSectores?.facturacion||{};
 if(!f.anticipo.nroFactura&&!f.saldo.nroFactura){const nro=o?.nrfc||sf?.nroFactura||'';if(invoiceNumberValid(nro)){f.saldo.facturado=true;f.saldo.nroFactura=nro;f.saldo.fechaFactura=o?.ffc||sf?.fechaFactura||'';}}
 const fs=invoiceList(o);if(fs.length){const last=fs[fs.length-1];if(!f.anticipo.nroFactura&&!f.saldo.nroFactura){f.saldo.facturado=true;f.saldo.nroFactura=last.numeroCompleto||o?.nrfc||'';f.saldo.fechaFactura=last.fecha||o?.ffc||'';f.saldo.monto=num(last.neto)||total;}}
 return f;
}
function invoicedAmount(o,p){
 const total=totalFor(o,p),fs=invoiceList(o);if(fs.length){const amount=fs.reduce((a,f)=>a+num(f?.neto||f?.importeTotal||f?.total),0);return amount>0?Math.min(total,amount):total;}
 const f=finance(o,p),parts=[f.anticipo,f.saldo].filter(x=>x.facturado||invoiceNumberValid(x.nroFactura));if(!parts.length)return 0;const amount=parts.reduce((a,x)=>a+num(x.monto),0);return amount>0?Math.min(total,amount):total;
}
function metrics(o,p){
 const f=finance(o,p),ret=Object.values(f.retenciones||{}).reduce((a,v)=>a+num(v),0),total=num(f.total);let cob=num(f.anticipo?.montoCobrado)+num(f.saldo?.montoCobrado);if(collected(o?.estado)&&cob<=0)cob=Math.max(0,total-ret);const saldoCobro=Math.max(0,total-cob-ret),facturado=invoicedAmount(o,p),saldoFacturar=Math.max(0,total-facturado);return {f,total,ret,cob,saldoCobro,facturado,saldoFacturar};
}
function canonicalSector(name,o,p,info,total){
 const old={...(o?.gestionSectores?.[name]||{}),...(o?.sectores?.[name]||{})};
 const baseData={...old,infoPresupuesto:info};
 if(name==='ventas')return {estado:old.estado||'Aprobado',...baseData};
 if(name==='facturacion')return {...baseData,estado:old.estado||'Pendiente',importePresupuestado:total,oc:old.oc||info.oc||'',condicionPago:old.condicionPago||info.condicionPago||'',anticipoPct:num(old.anticipoPct||info.anticipoPct),diasPago:num(old.diasPago||info.diasPago)};
 if(name==='cobranzas')return {...baseData,estado:old.estado||'Pendiente',montoTotal:total,saldoPendiente:num(old.saldoPendiente||total),condicionPago:old.condicionPago||info.condicionPago||'',anticipoPct:num(old.anticipoPct||info.anticipoPct),diasPago:num(old.diasPago||info.diasPago)};
 if(name==='colocaciones'){const req=(p?.entregaLogistica||o?.entregaLogistica||{}).tipo==='colocacion';return {...baseData,estado:old.estado||(req?'A coordinar':'No requerida')};}
 return {...baseData,estado:old.estado||'Pendiente'};
}
function canonicalPatch(o,p){
 const n=base(p?.nro||o?.ot),total=totalFor(o,p),items=itemsFrom(p,o),week=weekFor(o,p),info={...(o?.infoPresupuesto||{}),importe:total,nro:p?.nro||o?.infoPresupuesto?.nro||n,presupuestoId:p?.id||o?.presupuestoId||'',revision:p?.revision||o?.revisionCotizacion||'',cliente:p?.cliente||o?.cliente||'',descripcion:p?.desc||p?.descripcion||o?.desc||'',condicionPago:p?.cond||o?.cond||o?.infoPresupuesto?.condicionPago||'',anticipoPct:num(p?.anticipoPct||o?.anticipoPct||o?.infoPresupuesto?.anticipoPct),diasPago:num(p?.diasPago||o?.diasPago||o?.infoPresupuesto?.diasPago),oc:p?.oc||o?.oc||o?.infoPresupuesto?.oc||''};
 const sectores={};['ventas','diseno','compras','produccion','colocaciones','facturacion','cobranzas'].forEach(k=>sectores[k]=canonicalSector(k,o,p,info,total));
 const f=finance({...o,finanzas:o?.finanzas||{}},p);f.total=total;if(!f.saldo.monto)f.saldo.monto=total;
 return {ot:n||o?.ot,cliente:p?.cliente||o?.cliente||'',desc:p?.desc||p?.descripcion||o?.desc||'',estado:collected(o?.estado)?'Cobrado':'Aprobado',neto:total,importe:total,semana:week||num(o?.semana),infoPresupuesto:info,itemsCotizados:items.length?items:(o?.itemsCotizados||[]),sectores,finanzas:f,presupuestoId:p?.id||o?.presupuestoId||'',cotizacionId:p?.id||o?.cotizacionId||'',nroCotizacion:p?.nro||o?.nroCotizacion||n,revisionCotizacion:p?.revision||o?.revisionCotizacion||'',origen:o?.origen||'presupuesto'};
}
async function createMissingWork(p){
 if(typeof window.ensureObraFromPresupuestoV358==='function'){
  try{const id=await window.ensureObraFromPresupuestoV358(p.id,p);if(id)return (window.DB?.obras||[]).find(x=>x.id===id)||{id,ot:base(p.nro)};}catch(e){console.warn('[V80] ensureObraFromPresupuesto fallo, uso alta canonica',e);}
 }
 const n=base(p?.nro),total=totalFor({},p),week=weekFor({},p);if(!n||!p?.id||typeof window.addDoc_!=='function')return null;
 const seed={id:'',ot:n,cliente:p.cliente||'',desc:p.desc||p.descripcion||'',estado:'Aprobado',semana:week,neto:total,importe:total,presupuestoId:p.id,cotizacionId:p.id,nroCotizacion:p.nro||n,revisionCotizacion:p.revision||'',fechaAprobacion:new Date().toLocaleDateString('es-AR'),origen:'presupuesto'};const patch=canonicalPatch(seed,p);const ref=await window.addDoc_('obras',patch);return {...patch,id:ref?.id||''};
}
let reconciling=false;
async function reconcile(){
 if(reconciling||typeof window.updateDoc_!=='function')return 0;reconciling=true;let changed=0;
 try{
  const map=approvedBudgets();
  for(const p of map.values())if(!findWorkForBudget(p)){const made=await createMissingWork(p);if(made){window.DB?.obras?.push?.(made);changed++;}}
  for(const o of (window.DB?.obras||[])){
   const p=budgetForWork(o,map);if(!p&&!approved(o?.estado)&&o?.origen!=='presupuesto')continue;
   const fakeP=p||{id:o.presupuestoId,nro:o.nroCotizacion||o.ot,cliente:o.cliente,desc:o.desc,importe:totalFor(o,null),estado:'Aprobado',fecha:o.fechaAprobacion};const patch=canonicalPatch(o,fakeP);
   const m=metrics(o,fakeP),needs=num(o?.semana)!==num(patch.semana)||num(o?.finanzas?.total)!==num(patch.finanzas.total)||num(o?.sectores?.facturacion?.importePresupuestado)!==num(patch.sectores.facturacion.importePresupuestado)||num(o?.sectores?.cobranzas?.montoTotal)!==num(patch.sectores.cobranzas.montoTotal)||!o?.sectores?.produccion||!o?.sectores?.diseno||!o?.sectores?.compras||(!collected(o?.estado)&&m.total>0&&!approved(o?.estado));
   if(!needs)continue;
   try{await window.updateDoc_('obras',o.id,patch);Object.assign(o,patch);changed++;}catch(e){console.error('[V80] No se pudo normalizar OT '+base(o.ot),e);}
  }
  if(changed){window.normalizeDBV35?.();window.renderObras?.();}
  return changed;
 }finally{reconciling=false;}
}
function due(f){return f?.saldo?.fechaPrevistaCobro||f?.anticipo?.fechaPrevistaCobro||'';}
function showDate(v){const d=parseDate(v);return d?d.toLocaleDateString('es-AR'):'—';}
function invoiceText(o,m){const f=m.f,a=[];if(f.anticipo.facturado||invoiceNumberValid(f.anticipo.nroFactura))a.push(`Anticipo: ${f.anticipo.nroFactura?'FC '+esc(f.anticipo.nroFactura):'facturado'} · ${esc(showDate(f.anticipo.fechaFactura))}`);if(f.saldo.facturado||invoiceNumberValid(f.saldo.nroFactura))a.push(`Saldo: ${f.saldo.nroFactura?'FC '+esc(f.saldo.nroFactura):'facturado'} · ${esc(showDate(f.saldo.fechaFactura))}`);return a.length?a.join('<br>'):'<span style="color:var(--text3)">Sin facturar</span>';}
function actions(o,m,forBilling){const sent=!!o?.facturaArca?.emailUltimoEnvioAt,has=m.facturado>0;const factBtn=m.saldoFacturar>0?`<button class="btn btn-primary btn-sm" onclick="abrirFacturacionGeneralV63('${o.id}')"><i class="ti ti-receipt"></i> ${has?'Facturar saldo':'Facturar'}</button>`:'';const send=has&&o?.facturaArca?.cae?`<button class="btn btn-ghost btn-sm" onclick="abrirEnvioFacturaEmailV61('${o.id}')">${sent?'Reenviar FC':'Enviar FC'}</button>`:'';const dot=has?`<span title="${sent?'Factura enviada':'Factura pendiente de envio'}" style="width:10px;height:10px;border-radius:50%;display:inline-block;background:${sent?'#22a06b':'#e8b84b'}"></span>`:'';return `<div style="display:flex;gap:7px;align-items:center;justify-content:flex-end;white-space:nowrap">${dot}<button class="btn btn-ghost btn-sm" onclick="editarCobranzaObraV41('${o.id}')">Gestionar</button>${factBtn}${send}</div>`;}
const estadosGestion=['Pendiente de facturar','Facturada - falta enviar','Factura enviada','Esperando fecha de pago','Cobro programado','Vencida - reclamar','Pago parcial','Cobrado','En revisión'];
function suggested(o,m){if(o?.estadoGestionFactura)return o.estadoGestionFactura;if(collected(o?.estado)||m.saldoCobro<=0)return 'Cobrado';if(m.cob>0)return 'Pago parcial';if(o?.facturaArca?.emailUltimoEnvioAt)return 'Factura enviada';if(m.facturado>0)return 'Facturada - falta enviar';return 'Pendiente de facturar';}
async function saveStatus(o,v,sel){const old=o.estadoGestionFactura||'',map=approvedBudgets(),p=budgetForWork(o,map),m=metrics(o,p);o.estadoGestionFactura=v;if(sel)sel.disabled=true;try{const patch={estadoGestionFactura:v,estadoGestionFacturaActualizadoAt:new Date().toISOString()};if(v==='Cobrado'){patch.estado='Cobrado';const f=finance(o,p);if(m.saldoCobro>0){f.saldo={...f.saldo,montoCobrado:num(f.saldo.montoCobrado)+m.saldoCobro,fechaCobro:f.saldo.fechaCobro||new Date().toISOString().slice(0,10)};patch.finanzas=f;}}await window.updateDoc_('obras',o.id,patch);Object.assign(o,patch);window.showToast?.(v==='Cobrado'?'Cobro registrado · pasa a Historico':'Estado actualizado');renderCore();}catch(e){console.error(e);o.estadoGestionFactura=old;if(sel){sel.value=old||suggested(o,m);sel.disabled=false;}window.showToast?.('No se pudo guardar el estado');}}
function eligibleRows(){const map=approvedBudgets();return (window.DB?.obras||[]).map(o=>({o,p:budgetForWork(o,map)})).filter(z=>z.o?.id&&(z.p||approved(z.o?.estado)||z.o?.origen==='presupuesto'||collected(z.o?.estado))).map(z=>({...z,m:metrics(z.o,z.p)})).sort((a,b)=>num(base(b.o.ot))-num(base(a.o.ot)));}
function renderBilling(mod,rows){const items=rows.filter(x=>!collected(x.o?.estado)&&x.m.saldoFacturar>0);mod.innerHTML=`<div class="card"><div class="card-header"><span class="card-title">Cola de facturacion</span><span style="font-size:11px;color:var(--text3)">${items.length} OT pendientes</span></div><div class="table-wrap"><table><thead><tr><th>OT</th><th>Cliente / obra</th><th>Facturacion actual</th><th>Por facturar</th><th>Saldo a cobrar</th><th>Accion</th></tr></thead><tbody>${items.map(({o,m})=>`<tr><td class="strong">${esc(base(o.ot))}</td><td><b>${esc(o.cliente||'')}</b><br><span style="color:var(--text3)">${esc(o.desc||'')}</span></td><td>${invoiceText(o,m)}</td><td>${MONEY.format(m.saldoFacturar)}</td><td>${MONEY.format(m.saldoCobro)}</td><td>${actions(o,m,true)}</td></tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text3)">No hay obras pendientes de facturar.</td></tr>'}</tbody></table></div></div>`;}
function renderCollect(mod,rows){const items=rows.filter(x=>!collected(x.o?.estado)&&x.m.saldoCobro>0);mod.innerHTML=`<div class="card"><div class="card-header"><span class="card-title">Seguimiento y compromisos</span><span style="font-size:11px;color:var(--text3)">${items.length} OT abiertas</span></div><div class="table-wrap"><table><thead><tr><th>OT</th><th>Cliente / obra</th><th>Facturacion</th><th>Saldo</th><th>Fecha comprometida</th><th>Estado</th><th>Accion</th></tr></thead><tbody>${items.map(({o,m})=>{const st=suggested(o,m);return `<tr data-v80="${esc(o.id)}"><td class="strong">${esc(base(o.ot))}</td><td><b>${esc(o.cliente||'')}</b><br><span style="color:var(--text3)">${esc(o.desc||'')}</span></td><td>${invoiceText(o,m)}</td><td>${MONEY.format(m.saldoCobro)}</td><td>${esc(showDate(due(m.f)))}</td><td><select class="quick-estado estado-v80" style="width:190px">${estadosGestion.map(s=>`<option value="${s}" ${s===st?'selected':''}>${s}</option>`).join('')}</select></td><td>${actions(o,m,false)}</td></tr>`;}).join('')||'<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3)">No hay saldos pendientes.</td></tr>'}</tbody></table></div></div>`;mod.querySelectorAll('tr[data-v80]').forEach(tr=>{const o=(window.DB?.obras||[]).find(x=>x.id===tr.dataset.v80),sel=tr.querySelector('select.estado-v80');if(o&&sel)sel.onchange=()=>saveStatus(o,sel.value,sel);});}
let legacyRender=null;
function renderCore(){
 const tab=window.cobTab||'dashboard';if(!['facturar','cobrar','gestiones'].includes(tab)){if(legacyRender)return legacyRender.apply(window,arguments);return;}
 const mod=document.getElementById('cobr-modulo-v48');if(!mod){legacyRender?.();return;}
 const rows=eligibleRows();if(tab==='facturar')renderBilling(mod,rows);else renderCollect(mod,rows);
}
function wrapApprovalCreation(){if(typeof window.ensureObraFromPresupuestoV358!=='function'||window.ensureObraFromPresupuestoV358.__v80)return;const old=window.ensureObraFromPresupuestoV358;const wrapped=async function(id,data){const r=await old.apply(this,arguments);setTimeout(()=>reconcile().then(()=>{window.renderObras?.();renderCore();}),0);return r};wrapped.__v80=true;window.ensureObraFromPresupuestoV358=wrapped;}
function install(){
 if(window.__tizCoreV80Installed)return;window.__tizCoreV80Installed=true;
 legacyRender=window.renderCobranzas;try{legacyRender?.();}catch(e){console.warn('[V80] render inicial legacy',e);}window.renderCobranzas=renderCore;window.renderCobranzas.__tizCoreV80=true;
 wrapApprovalCreation();reconcile().then(()=>{window.renderObras?.();renderCore();}).catch(console.error);
 console.info('[TIZ] V80 nucleo operativo unico activo');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0));else setTimeout(install,0);
window.addEventListener('load',()=>{setTimeout(()=>{wrapApprovalCreation();reconcile().then(renderCore).catch(console.error);},500);setTimeout(()=>reconcile().then(renderCore).catch(console.error),1800);});
document.addEventListener('click',e=>{if(e.target?.closest?.('#page-cobranzas .page-tab'))setTimeout(renderCore,50);});
window.reconciliarOperacionV80=reconcile;
})();
