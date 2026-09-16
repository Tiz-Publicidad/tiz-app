// TIZ V104 - Gestion unificada en Por cobrar: punto amarillo/verde + Gestionar con estado editable.
(function(){
'use strict';
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function sent(o){
  const estado=norm(o?.estadoGestionFactura);
  if(estado==='factura enviada') return true;
  const latest=(Array.isArray(o?.comprobantesArca)?o.comprobantesArca:Array.isArray(o?.facturasArca)?o.facturasArca:[])
    .slice().sort((a,b)=>Number(b?.cbteNro||0)-Number(a?.cbteNro||0))[0]||o?.facturaArca||null;
  return !!(latest?.emailUltimoEnvioAt||o?.facturaArca?.emailUltimoEnvioAt);
}
function hasInvoice(o){
  const f=o?.finanzas||{};
  const sf=o?.sectores?.facturacion||o?.gestionSectores?.facturacion||{};
  const comps=Array.isArray(o?.comprobantesArca)?o.comprobantesArca:Array.isArray(o?.facturasArca)?o.facturasArca:[];
  return !!(
    o?.nrfc||o?.facturaArca?.cae||comps.some(x=>x?.cae||x?.numeroCompleto)||sf?.nroFactura||
    f?.anticipo?.facturado||f?.anticipo?.nroFactura||f?.saldo?.facturado||f?.saldo?.nroFactura
  );
}
function findObraFromRow(tr){
  const ot=(tr?.querySelector('td')?.textContent||'').trim().match(/\d{4,7}/)?.[0];
  if(!ot) return null;
  const base=s=>String(s??'').match(/\d{4,7}/)?.[0]?.replace(/^0+/,'')||'';
  return (window.DB?.obras||[]).find(o=>base(o?.ot)===base(ot))||null;
}
function syncRow(tr){
  const o=findObraFromRow(tr); if(!o) return;
  const actionCell=tr.lastElementChild; if(!actionCell) return;
  let wrap=actionCell.querySelector('.v104-unified-wrap');
  if(!wrap){
    wrap=document.createElement('div');
    wrap.className='v104-unified-wrap';
    wrap.style.cssText='display:flex;align-items:center;gap:8px;justify-content:flex-end;white-space:nowrap';
    while(actionCell.firstChild) wrap.appendChild(actionCell.firstChild);
    actionCell.appendChild(wrap);
  }
  let dot=wrap.querySelector('.v104-status-dot');
  if(!dot){dot=document.createElement('span');dot.className='v104-status-dot';dot.style.cssText='width:11px;height:11px;border-radius:50%;display:inline-block;flex:0 0 11px';wrap.insertBefore(dot,wrap.firstChild);}
  if(hasInvoice(o)){
    const ok=sent(o);
    dot.style.display='inline-block';
    dot.style.background=ok?'#22a06b':'#e8b84b';
    dot.title=ok?'Factura enviada':'Factura pendiente de envío';
  } else dot.style.display='none';
  const btn=[...wrap.querySelectorAll('button')].find(b=>/gestionar/i.test(b.textContent||''));
  if(btn&&!btn.dataset.v104){
    btn.dataset.v104='1';
    btn.onclick=(ev)=>{
      ev.preventDefault();ev.stopPropagation();
      if(typeof window.editarCobranzaObraV41==='function') return window.editarCobranzaObraV41(o.id);
      if(typeof window.tizV101Open==='function') return window.tizV101Open(o.id);
    };
  }
}
function syncAll(){document.querySelectorAll('#cobr-modulo-v48 tbody tr').forEach(syncRow);}
const priorRender=window.renderCobranzas;
if(typeof priorRender==='function') window.renderCobranzas=function(){const r=priorRender.apply(this,arguments);queueMicrotask(syncAll);setTimeout(syncAll,40);return r;};
const priorSet=window.setCobTab;
if(typeof priorSet==='function') window.setCobTab=function(){const r=priorSet.apply(this,arguments);queueMicrotask(syncAll);setTimeout(syncAll,40);return r;};
window.tizSyncGestionUnificadaV104=syncAll;
setTimeout(syncAll,0);
window.addEventListener('load',()=>setTimeout(syncAll,0),{once:true});
})();
