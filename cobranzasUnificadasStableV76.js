// TIZ V76 - Por cobrar unificado, general y estable para todas las OT
(function(){
'use strict';
const MONEY=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
const estados=['Pendiente de facturar','Facturada - falta enviar','Factura enviada','Esperando fecha de pago','Cobro programado','Vencida - reclamar','Pago parcial','Cobrado','En revisión'];
const num=v=>Number(v)||0;
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const base=v=>{const m=String(v??'').match(/\d{4,7}/);return m?String(Number(m[0])):''};
const date=v=>{if(!v)return '—';const s=String(v);const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:s};
const today=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`};
const approved=v=>norm(v).startsWith('aprob');
function fin(o){
 const raw=o?.finanzas||o?.sectores?.cobranzas||{};
 const empty=()=>({facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0});
 const f={total:num(raw.total||o?.neto||o?.importe||o?.infoPresupuesto?.importe),anticipo:{...empty(),...(raw.anticipo||{})},saldo:{...empty(),...(raw.saldo||{})},retenciones:{suss:0,iibb:0,ganancias:0,iva:0,otras:0,...(raw.retenciones||{})}};
 if(o?.nrfc&&!f.anticipo.nroFactura&&!f.saldo.nroFactura){f.saldo.nroFactura=o.nrfc;f.saldo.fechaFactura=o.ffc||o.fechaFactura||'';f.saldo.facturado=true;}
 if(o?.facturaArca?.cae&&!f.anticipo.nroFactura&&!f.saldo.nroFactura){f.saldo.nroFactura=o.facturaArca.numeroCompleto||o.nrfc||'';f.saldo.fechaFactura=o.facturaArca.fecha||o.ffc||'';f.saldo.facturado=true;f.saldo.monto=num(o.facturaArca.neto)||f.total;}
 return f;
}
function calc(o){const f=fin(o),ret=Object.values(f.retenciones).reduce((a,v)=>a+num(v),0),cob=num(f.anticipo.montoCobrado)+num(f.saldo.montoCobrado),pend=Math.max(0,num(f.total)-cob-ret);return {f,pend,cob,ret};}
function invoice(o,x){const f=x.f,parts=[];if(f.anticipo.facturado||f.anticipo.nroFactura)parts.push(`Anticipo: ${f.anticipo.nroFactura?'FC '+esc(f.anticipo.nroFactura):'facturado'} · ${esc(date(f.anticipo.fechaFactura))}`);if(f.saldo.facturado||f.saldo.nroFactura)parts.push(`Saldo: ${f.saldo.nroFactura?'FC '+esc(f.saldo.nroFactura):'facturado'} · ${esc(date(f.saldo.fechaFactura))}`);return parts.length?parts.join('<br>'):'<span style="color:var(--text3)">Sin facturar</span>';}
function status(o,x){if(o?.estadoGestionFactura)return o.estadoGestionFactura;const fac=!!(o?.facturaArca?.cae||x.f.anticipo.facturado||x.f.saldo.facturado||x.f.anticipo.nroFactura||x.f.saldo.nroFactura),sent=!!o?.facturaArca?.emailUltimoEnvioAt;if(x.pend<=0)return 'Cobrado';if(x.cob>0)return 'Pago parcial';if(sent)return 'Factura enviada';if(fac)return 'Facturada - falta enviar';return 'Pendiente de facturar';}
function selectEstado(o,x){const cur=status(o,x);return `<select class="quick-estado estado-integral-v73" style="width:190px;min-width:190px;max-width:190px;box-sizing:border-box">${estados.map(s=>`<option value="${s}" ${s===cur?'selected':''}>${s}</option>`).join('')}</select>`;}
function actions(o,x){const fact=!!(o?.facturaArca?.cae||x.f.anticipo.facturado||x.f.saldo.facturado||x.f.anticipo.nroFactura||x.f.saldo.nroFactura),sent=!!o?.facturaArca?.emailUltimoEnvioAt;const dot=fact?`<span title="${sent?'Factura enviada por correo':'Factura pendiente de envío por correo'}" style="width:11px;height:11px;border-radius:50%;display:inline-block;flex:0 0 11px;background:${sent?'#22a06b':'#e8b84b'}"></span>`:'';const send=o?.facturaArca?.cae?`<button class="btn btn-ghost btn-sm" onclick="abrirEnvioFacturaEmailV61('${o.id}')">${sent?'Reenviar FC':'Enviar FC'}</button>`:'';const factBtn=!fact?`<button class="btn btn-primary btn-sm" onclick="abrirFacturacionGeneralV63('${o.id}')"><i class="ti ti-receipt"></i> Facturar</button>`:'';return `<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;white-space:nowrap">${dot}<button class="btn btn-ghost btn-sm" onclick="editarCobranzaObraV41('${o.id}')">Gestionar</button>${factBtn}${send}</div>`;}
function row(o){const x=calc(o),prev=x.f.saldo.fechaPrevistaCobro||x.f.anticipo.fechaPrevistaCobro||'';return `<tr data-v76="${esc(o.id)}"><td class="strong">${esc(base(o.ot))}</td><td><b>${esc(o.cliente||'')}</b><br><span style="color:var(--text3)">${esc(o.desc||'')}</span></td><td>${invoice(o,x)}</td><td>${MONEY.format(x.pend)}</td><td>${esc(date(prev))}</td><td>${selectEstado(o,x)}</td><td>${actions(o,x)}</td></tr>`;}
async function syncApprovedToAllSectors(){
 if(!window.DB?.obras?.length||typeof window.updateDoc_!=='function')return 0;
 const presupByN=new Map();
 (window.DB?.presupuestos||[]).forEach(p=>{const n=base(p.nro||p.nroPresupuesto||p.cotizacionBase);if(n&&approved(p.estado||p.status||p.estadoRevision))presupByN.set(n,p);});
 let changed=0;
 for(const o of window.DB.obras){
   const n=base(o.ot||o.nroCotizacion||o.nroPresupuesto||o.infoPresupuesto?.nro),p=presupByN.get(n);
   if(!n||(!p&&!approved(o.estado)&&!approved(o.infoPresupuesto?.estado)))continue;
   const total=num(p?.importe||o.infoPresupuesto?.importe||o.neto||o.importe||o.finanzas?.total||o.gestionSectores?.cobranzas?.montoTotal||o.gestionSectores?.facturacion?.importePresupuestado);
   if(total<=0)continue;
   const info={...(o.infoPresupuesto||{}),importe:total,nro:p?.nro||o.infoPresupuesto?.nro||n,presupuestoId:p?.id||o.presupuestoId||o.infoPresupuesto?.presupuestoId||'',revision:p?.revision||o.revisionCotizacion||o.infoPresupuesto?.revision||'',cliente:p?.cliente||o.cliente||'',descripcion:p?.desc||p?.descripcion||o.desc||'',condicionPago:p?.cond||o.infoPresupuesto?.condicionPago||o.cond||'',anticipoPct:num(p?.anticipoPct||o.anticipoPct||o.infoPresupuesto?.anticipoPct),diasPago:num(p?.diasPago||o.diasPago||o.infoPresupuesto?.diasPago),oc:p?.oc||o.oc||o.infoPresupuesto?.oc||''};
   const gs=o.gestionSectores||{},s=o.sectores||{};
   const canonical={
     ventas:{estado:'Aprobado',...(gs.ventas||{}),...(s.ventas||{}),infoPresupuesto:info},
     diseno:{estado:'Pendiente',...(gs.diseno||{}),...(s.diseno||{}),infoPresupuesto:info},
     compras:{estado:'Pendiente',...(gs.compras||{}),...(s.compras||{}),infoPresupuesto:info},
     produccion:{estado:'Pendiente',...(gs.produccion||{}),...(s.produccion||{}),infoPresupuesto:info},
     colocaciones:{estado:'Pendiente',...(gs.colocaciones||{}),...(s.colocaciones||{}),infoPresupuesto:info},
     facturacion:{estado:'Pendiente',...(gs.facturacion||{}),...(s.facturacion||{}),infoPresupuesto:info,importePresupuestado:total,oc:(s.facturacion||{}).oc||(gs.facturacion||{}).oc||info.oc||'',condicionPago:(s.facturacion||{}).condicionPago||(gs.facturacion||{}).condicionPago||info.condicionPago||'',anticipoPct:num((s.facturacion||{}).anticipoPct||(gs.facturacion||{}).anticipoPct||info.anticipoPct),diasPago:num((s.facturacion||{}).diasPago||(gs.facturacion||{}).diasPago||info.diasPago)},
     cobranzas:{estado:'Pendiente',...(gs.cobranzas||{}),...(s.cobranzas||{}),infoPresupuesto:info,montoTotal:total,saldoPendiente:num((s.cobranzas||{}).saldoPendiente||(gs.cobranzas||{}).saldoPendiente||total),condicionPago:(s.cobranzas||{}).condicionPago||(gs.cobranzas||{}).condicionPago||info.condicionPago||'',anticipoPct:num((s.cobranzas||{}).anticipoPct||(gs.cobranzas||{}).anticipoPct||info.anticipoPct),diasPago:num((s.cobranzas||{}).diasPago||(gs.cobranzas||{}).diasPago||info.diasPago)}
   };
   const currentFin=o.finanzas||{};
   const patch={neto:total,importe:total,infoPresupuesto:info,sectores:canonical,finanzas:{...currentFin,total,anticipo:{facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0,...(currentFin.anticipo||{})},saldo:{facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:total,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0,...(currentFin.saldo||{})},retenciones:{suss:0,iibb:0,ganancias:0,iva:0,otras:0,...(currentFin.retenciones||{})}}};
   const needs=num(o.finanzas?.total)!==total||num(o.sectores?.cobranzas?.montoTotal)!==total||num(o.sectores?.facturacion?.importePresupuestado)!==total||!o.sectores?.produccion||!o.sectores?.diseno||!o.sectores?.compras;
   if(!needs)continue;
   try{await window.updateDoc_('obras',o.id,patch);Object.assign(o,patch);changed++;}catch(e){console.error('[TIZ V76] No se pudo sincronizar OT '+n,e);}
 }
 if(changed){console.info('[TIZ V76] OTs aprobadas sincronizadas a todos los sectores:',changed);setTimeout(()=>{window.renderObras?.();window.renderProduccion?.();window.renderColocaciones?.();window.renderDiseno?.();render();},0);}
 return changed;
}
window.sincronizarAprobadasTodosSectoresV76=syncApprovedToAllSectors;
async function saveEstado(o,sel){
 const v=sel.value,oPrev=o.estadoGestionFactura||'',x=calc(o);
 o.estadoGestionFactura=v;sel.disabled=true;
 try{
   const patch={estadoGestionFactura:v,estadoGestionFacturaActualizadoAt:new Date().toISOString()};
   if(v==='Cobrado'){
     patch.estado='Cobrado';
     if(x.pend>0){
       const raw=o?.finanzas||o?.sectores?.cobranzas||{};
       const finanzas={...raw,total:num(raw.total||x.f.total),anticipo:{...(raw.anticipo||x.f.anticipo)},saldo:{...(raw.saldo||x.f.saldo)},retenciones:{...(raw.retenciones||x.f.retenciones)}};
       finanzas.saldo={...finanzas.saldo,montoCobrado:num(finanzas.saldo?.montoCobrado)+x.pend,fechaCobro:finanzas.saldo?.fechaCobro||today()};
       patch.finanzas=finanzas;
     }
   }else if(String(o.estado||'').toLowerCase()==='cobrado')patch.estado='Cobrado pendiente';
   await window.updateDoc_('obras',o.id,patch);
   Object.assign(o,patch);
   window.showToast?.(v==='Cobrado'?'Cobro registrado y movido a Histórico':'Estado de gestión actualizado');
   render();
   setTimeout(()=>window.renderCobranzas?.(),0);
 }catch(e){console.error(e);o.estadoGestionFactura=oPrev;sel.value=oPrev||status(o,calc(o));sel.disabled=false;alert('No se pudo guardar el estado.');}
}
function render(){
 if(window.cobTab!=='gestiones'&&window.cobTab!=='cobrar'&&window.cobTab!=='facturar')return;
 const mod=document.getElementById('cobr-modulo-v48');if(!mod)return;
 const obras=(window.DB?.obras||[]).filter(o=>o?.id&&o?.estadoGestionFactura!=='Cobrado'&&calc(o).pend>0).sort((a,b)=>num(base(b.ot))-num(base(a.ot)));
 if(window.cobTab==='facturar'){
   const pendientes=obras.filter(o=>{const x=calc(o);return !(o?.facturaArca?.cae||x.f.anticipo.facturado||x.f.saldo.facturado||x.f.anticipo.nroFactura||x.f.saldo.nroFactura)});
   const rows=pendientes.map(o=>{const x=calc(o);return `<tr><td class="strong">${esc(base(o.ot))}</td><td><b>${esc(o.cliente||'')}</b><br><span style="color:var(--text3)">${esc(o.desc||'')}</span></td><td><span style="color:var(--text3)">Sin facturar</span></td><td>${MONEY.format(x.pend)}</td><td>${esc(date(x.f.saldo.fechaPrevistaCobro||x.f.anticipo.fechaPrevistaCobro||''))}</td><td><span class="badge">Sin cobrar</span></td><td>${actions(o,x)}</td></tr>`}).join('');
   mod.innerHTML=`<div class="card"><div class="card-header"><span class="card-title">Cola de facturación</span></div><div class="table-wrap"><table><thead><tr><th>OT</th><th>Cliente / obra</th><th>Facturación actual</th><th>Saldo</th><th>Cobro previsto</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows||'<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3)">No hay obras pendientes de facturar.</td></tr>'}</tbody></table></div></div>`;
   return;
 }
 const rows=obras.map(row).join('');
 mod.innerHTML=`<div class="card"><div class="card-header"><span class="card-title">Seguimiento y compromisos</span></div><div class="table-wrap"><table><thead><tr><th>OT</th><th>Cliente / obra</th><th>Facturación</th><th>Saldo</th><th>Fecha comprometida</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows||'<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3)">No hay saldos pendientes.</td></tr>'}</tbody></table></div></div>`;
 mod.querySelectorAll('tbody tr[data-v76]').forEach(tr=>{const o=obras.find(x=>x.id===tr.dataset.v76),sel=tr.querySelector('select');if(o&&sel)sel.onchange=()=>saveEstado(o,sel);});
}
function css(){if(document.getElementById('tiz-v76-css'))return;const s=document.createElement('style');s.id='tiz-v76-css';s.textContent=`#cobr-modulo-v48 table{width:100%;table-layout:fixed}#cobr-modulo-v48 th:nth-child(1),#cobr-modulo-v48 td:nth-child(1){width:64px}#cobr-modulo-v48 th:nth-child(2),#cobr-modulo-v48 td:nth-child(2){width:29%}#cobr-modulo-v48 th:nth-child(3),#cobr-modulo-v48 td:nth-child(3){width:25%}#cobr-modulo-v48 th:nth-child(4),#cobr-modulo-v48 td:nth-child(4){width:120px}#cobr-modulo-v48 th:nth-child(5),#cobr-modulo-v48 td:nth-child(5){width:145px}#cobr-modulo-v48 th:nth-child(6),#cobr-modulo-v48 td:nth-child(6){width:205px}#cobr-modulo-v48 th:nth-child(7),#cobr-modulo-v48 td:nth-child(7){width:245px}#cobr-modulo-v48 select.quick-estado{width:190px!important;min-width:190px!important;max-width:190px!important;box-sizing:border-box}`;document.head.appendChild(s);}
function install(){css();if(typeof window.renderCobranzas==='function'&&!window.renderCobranzas.__v76){const old=window.renderCobranzas;const wrapped=function(){syncApprovedToAllSectors().catch(console.error);const r=old.apply(this,arguments);setTimeout(render,0);return r};wrapped.__v76=true;window.renderCobranzas=wrapped;}syncApprovedToAllSectors().catch(console.error);render();}
install();window.addEventListener('load',()=>{install();[600,1800,4000].forEach(ms=>setTimeout(()=>syncApprovedToAllSectors().catch(console.error),ms));setTimeout(render,2200)});document.addEventListener('click',e=>{if(e.target?.closest?.('#page-cobranzas .page-tab'))setTimeout(()=>{syncApprovedToAllSectors().catch(console.error);render();},80)});
})();
