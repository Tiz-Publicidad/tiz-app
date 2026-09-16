// TIZ Facturacion y Cobranzas V1 - UI unica
(function(){
'use strict';
const M=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let tab='dashboard',search='';
const dot=c=>`<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};margin-right:6px"></span>`;
function data(){return window.TIZFactCobDataV1?.build?.()||{workItems:[],invoices:[],payments:[]}}
function page(){return document.getElementById('page-cobranzas')}
function shell(){
  const p=page();if(!p)return null;
  const title=p.querySelector('.page-title');if(title)title.textContent='Facturacion y Cobranzas';
  let root=document.getElementById('fcv1-root');
  if(!root){
    root=document.createElement('div');root.id='fcv1-root';
    const old=p.querySelector('.page-header')?.nextElementSibling;
    if(old) old.replaceWith(root); else p.appendChild(root);
  }
  return root;
}
function statusDotFact(s){return s==='completa'?dot('#22a06b'):s==='parcial'?dot('#e8b84b'):dot('#777')}
function statusDotCob(s){return s==='cobrado'?dot('#22a06b'):s==='parcial'?dot('#e8b84b'):s==='vencido'?dot('#e05c5c'):dot('#777')}
function tabs(){return `<div class="page-tabs" style="position:sticky;top:0;z-index:20;background:var(--bg);padding-top:10px">${[['dashboard','Dashboard'],['facturar','Para facturar'],['cobrar','Por cobrar'],['historico','Historico']].map(([k,l])=>`<button class="page-tab ${tab===k?'active':''}" data-fcv1-tab="${k}">${l}</button>`).join('')}</div>`}
function kpi(label,value,sub=''){return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-val">${value}</div>${sub?`<div class="kpi-sub">${sub}</div>`:''}</div>`}
function dashboard(d){
  const items=d.workItems,porFact=items.reduce((a,w)=>a+w.porFacturar,0),porCob=items.reduce((a,w)=>a+w.porCobrar,0),venc=items.filter(w=>w.cobranzaEstado==='vencido').reduce((a,w)=>a+w.porCobrar,0);
  const pendientesEnvio=d.invoices.filter(i=>i.estadoEnvio==='pendiente').length;
  const tasks=[['Para facturar',items.filter(w=>w.porFacturar>.01).length,'facturar'],['Pendientes de envio',pendientesEnvio,'cobrar'],['Vencidas / reclamar',items.filter(w=>w.cobranzaEstado==='vencido').length,'cobrar'],['Cobros abiertos',items.filter(w=>w.porCobrar>.01).length,'cobrar']];
  return `<div class="kpi-grid" style="margin-top:16px">${kpi('Por facturar',M.format(porFact))}${kpi('Por cobrar',M.format(porCob))}${kpi('Vencido',M.format(venc))}${kpi('Facturas pendientes de envio',pendientesEnvio)}</div><div class="card" style="margin-top:16px"><div class="card-header"><span class="card-title">Trabajo del operador</span></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;padding:14px">${tasks.map(([l,n,t])=>`<button class="btn btn-ghost" data-fcv1-tab="${t}" style="justify-content:space-between"><span>${l}</span><b>${n}</b></button>`).join('')}</div></div>`;
}
function facturar(d){
  const list=d.workItems.filter(w=>w.porFacturar>.01).filter(match).sort((a,b)=>Number(b.ot)-Number(a.ot));
  const rows=list.map(w=>`<tr><td class="strong">${esc(w.ot)}</td><td><b>${esc(w.clienteNombre)}</b><br><span style="color:var(--text3)">${esc(w.descripcion)}</span></td><td>${M.format(w.importeAprobado)}</td><td>${statusDotFact(w.facturacionEstado)}${M.format(w.facturado)}</td><td><b>${M.format(w.porFacturar)}</b></td><td>${w.facturado>.01?'Saldo':'Total'}</td><td>${w.oc?esc(w.oc):(w.requiereOC?'<span class="badge badge-red">Falta OC</span>':'—')}</td><td>${esc(w.cuit||'—')}<br><span style="font-size:11px;color:var(--text3)">${esc(w.condicionIVA||'')}</span></td><td>${w.diasPago||0} dias</td><td>${w.obraId?`<button class="btn btn-primary btn-sm" onclick="abrirFacturacionGeneralV63('${esc(w.obraId)}')">${w.facturado>.01?'Facturar saldo':'Facturar'}</button> <button class="btn btn-ghost btn-sm" onclick="TIZFactCobUIV1.open('${esc(w.obraId)}')">Detalle</button>`:'<span class="badge badge-red">Obra pendiente de crear</span>'}</td></tr>`).join('');
  return table('Para facturar',['OT','Cliente / obra','Presupuesto','Facturado','Por facturar','Tipo','OC','CUIT / IVA','Pago','Accion'],rows,'No hay trabajos pendientes de facturar.');
}
function cobrar(d){
  const list=d.workItems.filter(w=>w.totalFacturado>.01).filter(match).sort((a,b)=>Number(b.ot)-Number(a.ot));
  const rows=list.map(w=>`<tr><td class="strong">${esc(w.ot)}</td><td><b>${esc(w.clienteNombre)}</b><br><span style="color:var(--text3)">${esc(w.descripcion)}</span></td><td>${M.format(w.importeAprobado)}</td><td>${statusDotFact(w.facturacionEstado)}${M.format(w.facturado)}</td><td>${statusDotCob(w.cobranzaEstado)}${M.format(w.cobrado)}</td><td><b>${M.format(w.porCobrar)}</b></td><td>${esc(w.proximoVencimiento||'—')}</td><td>${esc(w.cobranzaEstado.replace('_',' '))}</td><td>${w.facturas.some(i=>i.driveUrl)?'PDF':'—'}</td><td><button class="btn btn-ghost btn-sm" onclick="TIZFactCobUIV1.open('${esc(w.obraId)}')">Gestionar</button></td></tr>`).join('');
  return table('Por cobrar',['OT','Cliente / obra','Presupuesto','Facturacion','Cobranza','Saldo a cobrar','Proximo venc.','Estado','PDF','Accion'],rows,'No hay facturas registradas.');
}
function historico(d){
  const rows=d.invoices.filter(i=>{const w=d.workItems.find(x=>x.obraId===i.obraId||x.ot===i.ot);return match(w||{ot:i.ot,clienteNombre:'',descripcion:''})}).sort((a,b)=>(b.fechaEmision||'').localeCompare(a.fechaEmision||'')).map(i=>`<tr><td>${esc(i.fechaEmision||'—')}</td><td class="strong">${esc(i.ot)}</td><td>${esc(i.numeroCompleto||'—')}</td><td>${esc(i.origen)}</td><td>${M.format(i.neto)}</td><td>${M.format(i.total)}</td><td>${esc(i.estadoEnvio)}</td><td>${i.cae?'Si':'No'}</td></tr>`).join('');
  return table('Historico de facturas',['Fecha','OT','Factura','Origen','Neto','Total','Envio','CAE'],rows,'No hay facturas.');
}
function table(title,heads,rows,empty){return `<div class="card" style="margin-top:16px"><div class="card-header"><span class="card-title">${title}</span><span style="color:var(--text3);font-size:11px">Fuente canonica V1</span></div><div class="table-wrap"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${heads.length}" style="text-align:center;padding:30px;color:var(--text3)">${empty}</td></tr>`}</tbody></table></div></div>`}
function match(w){const q=search.trim().toLowerCase();if(!q)return true;return [w.ot,w.clienteNombre,w.descripcion].join(' ').toLowerCase().includes(q)}
function render(){
  const r=shell();if(!r)return;const d=data();
  r.innerHTML=`${tabs()}<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:14px"><div><div style="font-size:18px;font-weight:650">Facturacion y Cobranzas V1</div><div style="font-size:11px;color:var(--text3)">Modulo reconstruido · una sola fuente de datos</div></div><input id="fcv1-search" value="${esc(search)}" placeholder="Buscar OT, cliente u obra..." style="max-width:320px"></div>${tab==='dashboard'?dashboard(d):tab==='facturar'?facturar(d):tab==='cobrar'?cobrar(d):historico(d)}`;
  r.querySelectorAll('[data-fcv1-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.fcv1Tab;render()});
  const s=r.querySelector('#fcv1-search');if(s)s.oninput=()=>{search=s.value;render()};
}
function open(obraId){
  const d=data(),w=d.workItems.find(x=>x.obraId===obraId);if(!w)return;
  document.getElementById('fcv1-drawer')?.remove();
  const root=document.createElement('div');root.id='fcv1-drawer';root.className='modal-overlay open';
  const inv=w.facturas.map(i=>`<tr><td>${esc(i.numeroCompleto||'—')}</td><td>${esc(i.fechaEmision||'—')}</td><td>${M.format(i.neto)}</td><td>${M.format(i.total)}</td><td>${esc(i.estadoEnvio)}</td></tr>`).join('');
  const pay=w.cobros.map(p=>`<tr><td>${esc(p.fecha||'—')}</td><td>${M.format(p.importe)}</td><td>${esc(p.medio||'—')}</td><td>${esc(p.referencia||'')}</td></tr>`).join('');
  root.innerHTML=`<div class="modal" style="max-width:900px"><div class="modal-title">OT ${esc(w.ot)} · ${esc(w.clienteNombre)}</div><div style="color:var(--text3);margin-bottom:12px">${esc(w.descripcion)}</div><div class="kpi-grid">${kpi('Presupuesto',M.format(w.importeAprobado))}${kpi('Facturado',M.format(w.facturado))}${kpi('Por facturar',M.format(w.porFacturar))}${kpi('Por cobrar',M.format(w.porCobrar))}</div>${table('Facturas',['Factura','Fecha','Neto','Total','Envio'],inv,'Sin facturas')}${table('Cobros',['Fecha','Importe','Medio','Referencia'],pay,'Sin cobros')}<div class="modal-actions"><button class="btn btn-ghost" id="fcv1-close">Cerrar</button>${w.obraId?`<button class="btn btn-primary" onclick="abrirFacturacionGeneralV63('${esc(w.obraId)}')">${w.facturado>.01?'Facturar saldo':'Facturar'}</button>`:''}</div></div>`;
  document.body.appendChild(root);root.querySelector('#fcv1-close').onclick=()=>root.remove();
}
window.TIZFactCobUIV1={render,open};
window.renderCobranzas=render;
window.setCobTab=function(k){const map={dashboard:'dashboard',facturar:'facturar',cobrar:'cobrar',historico:'historico'};tab=map[k]||'dashboard';render()};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(render,0),{once:true});else setTimeout(render,0);
})();