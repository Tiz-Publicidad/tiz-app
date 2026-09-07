// TIZ V74.2 - asegura FC reales emitidas y estabiliza columnas
(function(){
'use strict';
const F={
 '4680':{numero:'00009-00000001',fecha:'04/09/2026',cliente:'Actitud Argentina',desc:'Roots - Francella',saldo:329200,enviada:true},
 '4701':{numero:'00009-00000002',fecha:'07/09/2026',cliente:'River Plate',desc:'River Plate Señalética en PVC',saldo:1477118,enviada:false}
};
const estados=['Pendiente de facturar','Facturada - falta enviar','Factura enviada','Esperando fecha de pago','Cobro programado','Vencida - reclamar','Pago parcial','Cobrado','En revisión'];
const base=v=>String(v||'').match(/\d{4,7}/)?.[0].replace(/^0+/,'')||'';
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(v)||0);
function obra(ot,d){const a=window.DB?.obras||[];return a.find(x=>base(x.ot)===ot)||a.find(x=>String(x?.facturaArca?.numeroCompleto||x?.nrfc||'')===d.numero)||null;}
function body(){const m=document.getElementById('cobr-modulo-v48');if(!m)return null;const card=[...m.querySelectorAll('.card')].find(x=>/Seguimiento y compromisos|Cartera por cobrar/i.test(x.querySelector('.card-title')?.textContent||x.textContent||''));return card?.querySelector('tbody')||null;}
function select(d){const cur=d.enviada?'Factura enviada':'Facturada - falta enviar';return `<select class="quick-estado estado-watchdog-v74" style="width:190px;min-width:190px;max-width:190px;box-sizing:border-box">${estados.map(x=>`<option ${x===cur?'selected':''}>${x}</option>`).join('')}</select>`;}
function row(ot,d){const o=obra(ot,d);const tr=document.createElement('tr');tr.dataset.fcReal=ot;tr.innerHTML=`<td class="strong">${ot}</td><td><b>${esc(o?.cliente||d.cliente)}</b><br><span style="color:var(--text3)">${esc(o?.desc||d.desc)}</span></td><td>Saldo: FC ${d.numero} · ${d.fecha}</td><td>${money(d.saldo)}</td><td>—</td><td>${select(d)}</td><td><div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;white-space:nowrap"><span title="${d.enviada?'Factura enviada por correo':'Factura pendiente de envío por correo'}" style="width:11px;height:11px;border-radius:50%;display:inline-block;flex:0 0 11px;background:${d.enviada?'#22a06b':'#e8b84b'}"></span>${o?`<button class="btn btn-ghost btn-sm" onclick="editarCobranzaObraV41('${o.id}')">Gestionar</button><button class="btn btn-ghost btn-sm" onclick="abrirEnvioFacturaEmailV61('${o.id}')">${d.enviada?'Reenviar FC':'Enviar FC'}</button>`:'<span style="font-size:11px;color:var(--text3)">FC real registrada</span>'}</div></td>`;return tr;}
function ensure(){
 const b=body();if(!b)return;
 // Quita solamente duplicados creados por este parche; nunca toca filas normales.
 b.querySelectorAll('tr[data-fc-real]').forEach(x=>x.remove());
 // Si la fila normal ya muestra exactamente esa FC, se conserva. Si no, se agrega arriba.
 for(const ot of ['4701','4680']){const d=F[ot];const exact=[...b.querySelectorAll('tr')].some(r=>(r.textContent||'').includes(d.numero));if(!exact)b.prepend(row(ot,d));}
}
function css(){if(document.getElementById('tiz-cob-fixed-v742'))return;const s=document.createElement('style');s.id='tiz-cob-fixed-v742';s.textContent=`#cobr-modulo-v48 .table-wrap{overflow-x:auto}#cobr-modulo-v48 table{width:100%;table-layout:fixed}#cobr-modulo-v48 th:nth-child(1),#cobr-modulo-v48 td:nth-child(1){width:64px}#cobr-modulo-v48 th:nth-child(2),#cobr-modulo-v48 td:nth-child(2){width:30%}#cobr-modulo-v48 th:nth-child(3),#cobr-modulo-v48 td:nth-child(3){width:25%}#cobr-modulo-v48 th:nth-child(4),#cobr-modulo-v48 td:nth-child(4){width:120px}#cobr-modulo-v48 th:nth-child(5),#cobr-modulo-v48 td:nth-child(5){width:145px}#cobr-modulo-v48 th:nth-child(6),#cobr-modulo-v48 td:nth-child(6){width:205px}#cobr-modulo-v48 th:nth-child(7),#cobr-modulo-v48 td:nth-child(7){width:245px}#cobr-modulo-v48 select.quick-estado{width:190px!important;min-width:190px!important;max-width:190px!important;box-sizing:border-box}#cobr-modulo-v48 td{overflow:hidden;text-overflow:ellipsis}`;document.head.appendChild(s);}
function run(){css();ensure();}
window.addEventListener('load',()=>{run();setTimeout(run,300);setTimeout(run,1000);setTimeout(run,2500)});
document.addEventListener('click',e=>{if(e.target.closest?.('#page-cobranzas .page-tab'))setTimeout(run,80)});
const obs=new MutationObserver(()=>{clearTimeout(window.__v742);window.__v742=setTimeout(run,50)});setTimeout(()=>{const m=document.getElementById('cobr-modulo-v48');if(m)obs.observe(m,{childList:true,subtree:true});run();},100);
setInterval(run,1500);
})();
