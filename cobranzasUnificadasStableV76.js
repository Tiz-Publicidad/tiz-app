// TIZ V77 logic inside V76 filename - approved quotes are authoritative for billing queue
(function(){
'use strict';
const MONEY=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
const estados=['Pendiente de facturar','Facturada - falta enviar','Factura enviada','Esperando fecha de pago','Cobro programado','Vencida - reclamar','Pago parcial','Cobrado','En revisión'];
const num=v=>Number(v)||0;
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const base=v=>{const m=String(v??'').match(/\d{4,7}/);return m?String(Number(m[0])):''};
const approved=v=>norm(v).startsWith('aprob');
const date=v=>{if(!v)return '—';const s=String(v);const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:s};
const today=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`};
function approvedBudgetMap(){
 const m=new Map();
 (window.DB?.presupuestos||[]).forEach(p=>{if(!approved(p?.estado||p?.status||p?.estadoRevision))return;const n=base(p?.nro||p?.nroPresupuesto||p?.cotizacionBase);if(!n)return;const prev=m.get(n);if(!prev||String(p?.revision||'')>=String(prev?.revision||''))m.set(n,p);});
 return m;
}
function budgetFor(o,map){return map.get(base(o?.ot||o?.nroCotizacion||o?.nroPresupuesto||o?.infoPresupuesto?.nro))||null;}
function totalOf(o,p){return num(p?.importe||p?.neto||p?.total||o?.finanzas?.total||o?.sectores?.cobranzas?.montoTotal||o?.gestionSectores?.cobranzas?.montoTotal||o?.sectores?.facturacion?.importePresupuestado||o?.gestionSectores?.facturacion?.importePresupuestado||o?.infoPresupuesto?.importe||o?.neto||o?.importe);}
function fin(o,p){
 const raw=o?.finanzas||{};
 const empty=()=>({facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0});
 const total=totalOf(o,p);
 const f={total,anticipo:{...empty(),...(raw.anticipo||{})},saldo:{...empty(),...(raw.saldo||{})},retenciones:{suss:0,iibb:0,ganancias:0,iva:0,otras:0,...(raw.retenciones||{})}};
 if(!f.saldo.monto&&total>0)f.saldo.monto=total;
 const sf=o?.sectores?.facturacion||o?.gestionSectores?.facturacion||{};
 if(o?.nrfc&&!f.anticipo.nroFactura&&!f.saldo.nroFactura){f.saldo.nroFactura=o.nrfc;f.saldo.fechaFactura=o.ffc||o.fechaFactura||'';f.saldo.facturado=true;}
 if(sf?.nroFactura&&!f.anticipo.nroFactura&&!f.saldo.nroFactura){f.saldo.nroFactura=sf.nroFactura;f.saldo.fechaFactura=sf.fechaFactura||'';f.saldo.facturado=!!sf.facturado||true;}
 if(o?.facturaArca?.cae&&!f.anticipo.nroFactura&&!f.saldo.nroFactura){f.saldo.nroFactura=o.facturaArca.numeroCompleto||o.nrfc||'';f.saldo.fechaFactura=o.facturaArca.fecha||o.ffc||'';f.saldo.facturado=true;f.saldo.monto=num(o.facturaArca.neto)||total;}
 return f;
}
function calc(o,p){const f=fin(o,p),ret=Object.values(f.retenciones).reduce((a,v)=>a+num(v),0),cob=num(f.anticipo.montoCobrado)+num(f.saldo.montoCobrado),pend=Math.max(0,num(f.total)-cob-ret);return {f,pend,cob,ret};}
function hasInvoice(o,x){return !!(o?.facturaArca?.cae||x.f.anticipo.facturado||x.f.saldo.facturado||x.f.anticipo.nroFactura||x.f.saldo.nroFactura);}
function invoice(o,x){const f=x.f,parts=[];if(f.anticipo.facturado||f.anticipo.nroFactura)parts.push(`Anticipo: ${f.anticipo.nroFactura?'FC '+esc(f.anticipo.nroFactura):'facturado'} · ${esc(date(f.anticipo.fechaFactura))}`);if(f.saldo.facturado||f.saldo.nroFactura)parts.push(`Saldo: ${f.saldo.nroFactura?'FC '+esc(f.saldo.nroFactura):'facturado'} · ${esc(date(f.saldo.fechaFactura))}`);return parts.length?parts.join('<br>'):'<span style="color:var(--text3)">Sin facturar</span>';}
function status(o,x){if(o?.estadoGestionFactura)return o.estadoGestionFactura;if(x.pend<=0)return 'Cobrado';if(x.cob>0)return 'Pago parcial';if(o?.facturaArca?.emailUltimoEnvioAt)return 'Factura enviada';if(hasInvoice(o,x))return 'Facturada - falta enviar';return 'Pendiente de facturar';}
function selectEstado(o,x){const cur=status(o,x);return `<select class="quick-estado estado-integral-v73" style="width:190px;min-width:190px;max-width:190px;box-sizing:border-box">${estados.map(s=>`<option value="${s}" ${s===cur?'selected':''}>${s}</option>`).join('')}</select>`;}
function actions(o,x){const fact=hasInvoice(o,x),sent=!!o?.facturaArca?.emailUltimoEnvioAt;const dot=fact?`<span title="${sent?'Factura enviada por correo':'Factura pendiente de envío por correo'}" style="width:11px;height:11px;border-radius:50%;display:inline-block;flex:0 0 11px;background:${sent?'#22a06b':'#e8b84b'}"></span>`:'';const send=o?.facturaArca?.cae?`<button class="btn btn-ghost btn-sm" onclick="abrirEnvioFacturaEmailV61('${o.id}')">${sent?'Reenviar FC':'Enviar FC'}</button>`:'';const factBtn=!fact?`<button class="btn btn-primary btn-sm" onclick="abrirFacturacionGeneralV63('${o.id}')"><i class="ti ti-receipt"></i> Facturar</button>`:'';return `<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;white-space:nowrap">${dot}<button class="btn btn-ghost btn-sm" onclick="editarCobranzaObraV41('${o.id}')">Gestionar</button>${factBtn}${send}</div>`;}
async function repairApproved(){
 if(typeof window.updateDoc_!=='function')return 0;
 const map=approvedBudgetMap();let changed=0;
 for(const o of (window.DB?.obras||[])){
  const p=budgetFor(o,map),n=base(o?.ot);if(!p||!o?.id)continue;
  const total=totalOf(o,p);if(total<=0)continue;
  const needs=num(o?.finanzas?.total)!==total||num(o?.sectores?.facturacion?.importePresupuestado)!==total||num(o?.sectores?.cobranzas?.montoTotal)!==total;
  if(!needs)continue;
  const info={...(o.infoPresupuesto||{}),importe:total,nro:p.nro||n,presupuestoId:p.id||o.presupuestoId||'',revision:p.revision||o.revisionCotizacion||'',cliente:p.cliente||o.cliente||'',descripcion:p.desc||o.desc||'',condicionPago:p.cond||o.cond||'',anticipoPct:num(p.anticipoPct||o.anticipoPct),diasPago:num(p.diasPago||o.diasPago),oc:p.oc||o.oc||''};
  const sf={...(o.sectores?.facturacion||o.gestionSectores?.facturacion||{}),estado:(o.sectores?.facturacion||{}).estado||'Pendiente',infoPresupuesto:info,importePresupuestado:total,condicionPago:info.condicionPago,anticipoPct:info.anticipoPct,diasPago:info.diasPago};
  const sc={...(o.sectores?.cobranzas||o.gestionSectores?.cobranzas||{}),estado:(o.sectores?.cobranzas||{}).estado||'Pendiente',infoPresupuesto:info,montoTotal:total,saldoPendiente:num((o.sectores?.cobranzas||{}).saldoPendiente||total),condicionPago:info.condicionPago,anticipoPct:info.anticipoPct,diasPago:info.diasPago};
  const raw=o.finanzas||{};const patch={neto:total,importe:total,infoPresupuesto:info,'sectores.facturacion':sf,'sectores.cobranzas':sc,finanzas:{...raw,total,anticipo:{facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0,...(raw.anticipo||{})},saldo:{facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:total,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0,...(raw.saldo||{})},retenciones:{suss:0,iibb:0,ganancias:0,iva:0,otras:0,...(raw.retenciones||{})}}};
  try{await window.updateDoc_('obras',o.id,patch);o.finanzas=patch.finanzas;o.infoPresupuesto=info;o.neto=total;o.importe=total;o.sectores={...(o.sectores||{}),facturacion:sf,cobranzas:sc};changed++;}catch(e){console.error('[TIZ V77] reparar OT '+n,e);}
 }
 return changed;
}
async function saveEstado(o,sel){const map=approvedBudgetMap(),p=budgetFor(o,map),v=sel.value,prev=o.estadoGestionFactura||'',x=calc(o,p);o.estadoGestionFactura=v;sel.disabled=true;try{const patch={estadoGestionFactura:v,estadoGestionFacturaActualizadoAt:new Date().toISOString()};if(v==='Cobrado'){patch.estado='Cobrado';if(x.pend>0){const raw=o.finanzas||{};patch.finanzas={...raw,total:x.f.total,anticipo:{...x.f.anticipo},saldo:{...x.f.saldo,montoCobrado:num(x.f.saldo.montoCobrado)+x.pend,fechaCobro:x.f.saldo.fechaCobro||today()},retenciones:{...x.f.retenciones}};}}await window.updateDoc_('obras',o.id,patch);Object.assign(o,patch);window.showToast?.(v==='Cobrado'?'Cobro registrado y movido a Histórico':'Estado actualizado');render();}catch(e){console.error(e);o.estadoGestionFactura=prev;sel.value=prev||status(o,x);sel.disabled=false;alert('No se pudo guardar el estado.');}}
function allEligible(){const map=approvedBudgetMap();return (window.DB?.obras||[]).map(o=>({o,p:budgetFor(o,map)})).filter(({o,p})=>o?.id&&(p||approved(o?.estado)||approved(o?.infoPresupuesto?.estado)||o?.origen==='presupuesto')).map(({o,p})=>({o,p,x:calc(o,p)}));}
function render(){
 if(!['facturar','cobrar','gestiones'].includes(window.cobTab))return;
 const mod=document.getElementById('cobr-modulo-v48');if(!mod)return;
 const eligible=allEligible().filter(z=>z.o?.estadoGestionFactura!=='Cobrado'&&z.x.pend>0).sort((a,b)=>num(base(b.o.ot))-num(base(a.o.ot)));
 if(window.cobTab==='facturar'){
  const pendientes=eligible.filter(z=>!hasInvoice(z.o,z.x));
  const rows=pendientes.map(({o,x})=>`<tr><td class="strong">${esc(base(o.ot))}</td><td><b>${esc(o.cliente||'')}</b><br><span style="color:var(--text3)">${esc(o.desc||'')}</span></td><td><span style="color:var(--text3)">Sin facturar</span></td><td>${MONEY.format(x.pend)}</td><td>${esc(date(x.f.saldo.fechaPrevistaCobro||x.f.anticipo.fechaPrevistaCobro||''))}</td><td><span class="badge">Sin cobrar</span></td><td>${actions(o,x)}</td></tr>`).join('');
  mod.innerHTML=`<div class="card"><div class="card-header"><span class="card-title">Cola de facturación</span></div><div class="table-wrap"><table><thead><tr><th>OT</th><th>Cliente / obra</th><th>Facturación actual</th><th>Saldo</th><th>Cobro previsto</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows||'<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3)">No hay obras pendientes de facturar.</td></tr>'}</tbody></table></div></div>`;return;
 }
 const rows=eligible.map(({o,x})=>`<tr data-v76="${esc(o.id)}"><td class="strong">${esc(base(o.ot))}</td><td><b>${esc(o.cliente||'')}</b><br><span style="color:var(--text3)">${esc(o.desc||'')}</span></td><td>${invoice(o,x)}</td><td>${MONEY.format(x.pend)}</td><td>${esc(date(x.f.saldo.fechaPrevistaCobro||x.f.anticipo.fechaPrevistaCobro||''))}</td><td>${selectEstado(o,x)}</td><td>${actions(o,x)}</td></tr>`).join('');
 mod.innerHTML=`<div class="card"><div class="card-header"><span class="card-title">Seguimiento y compromisos</span></div><div class="table-wrap"><table><thead><tr><th>OT</th><th>Cliente / obra</th><th>Facturación</th><th>Saldo</th><th>Fecha comprometida</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows||'<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3)">No hay saldos pendientes.</td></tr>'}</tbody></table></div></div>`;
 mod.querySelectorAll('tbody tr[data-v76]').forEach(tr=>{const o=(window.DB?.obras||[]).find(x=>x.id===tr.dataset.v76),sel=tr.querySelector('select');if(o&&sel)sel.onchange=()=>saveEstado(o,sel);});
}
function install(){if(typeof window.renderCobranzas==='function'&&!window.renderCobranzas.__v77){const old=window.renderCobranzas;window.renderCobranzas=function(){const r=old.apply(this,arguments);setTimeout(render,0);return r};window.renderCobranzas.__v77=true;}repairApproved().then(()=>render()).catch(console.error);}
install();window.addEventListener('load',()=>{install();[700,1800,3500].forEach(ms=>setTimeout(()=>repairApproved().then(render).catch(console.error),ms));});document.addEventListener('click',e=>{if(e.target?.closest?.('#page-cobranzas .page-tab'))setTimeout(()=>repairApproved().then(render).catch(console.error),100)});
})();
