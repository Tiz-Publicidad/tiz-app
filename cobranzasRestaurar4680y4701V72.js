// TIZ V72 — restauración puntual y no destructiva de las dos FC reales ya emitidas
(function(){
  'use strict';
  const baseOt=v=>String(v??'').match(/\d{4,7}/)?.[0].replace(/^0+/,'')||'';
  const num=v=>Number(v)||0;
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(num(v));
  const FACTURAS={
    '4680':{numero:'00009-00000001',fecha:'04/09/2026',enviada:true,cliente:'Actitud Argentina',desc:'Roots - Francella',saldo:329200},
    '4701':{numero:'00009-00000002',fecha:'07/09/2026',enviada:false,cliente:'River Plate',desc:'River Plate Señalética en PVC',saldo:1477118}
  };
  function saldo(o,fallback){
    const f=o?.finanzas||{},total=num(f.total||o?.neto||o?.importe||o?.infoPresupuesto?.importe);
    const cob=num(f?.anticipo?.montoCobrado)+num(f?.saldo?.montoCobrado);
    const ret=Object.values(f.retenciones||{}).reduce((a,v)=>a+num(v),0);
    return total>0?Math.max(0,total-cob-ret):fallback;
  }
  function tbody(){return [...document.querySelectorAll('#cobr-modulo-v48 .card')].find(c=>/Seguimiento y compromisos|Cartera por cobrar/i.test(c.textContent||''))?.querySelector('tbody');}
  function acciones(o,d){
    const dot=`<span title="${d.enviada?'Factura enviada por correo':'Factura pendiente de envío por correo'}" style="width:11px;height:11px;border-radius:50%;display:inline-block;background:${d.enviada?'#22a06b':'#e8b84b'}"></span>`;
    if(!o)return `<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">${dot}<span style="font-size:11px;color:var(--text3)">Registro histórico</span></div>`;
    return `<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap">${dot}<button class="btn btn-ghost btn-sm" onclick="editarCobranzaObraV41('${o.id}')">Gestionar</button><button class="btn btn-ghost btn-sm" onclick="abrirEnvioFacturaEmailV61('${o.id}')"><i class="ti ti-mail-forward"></i> ${d.enviada?'Reenviar FC':'Enviar FC'}</button></div>`;
  }
  function insertar(){
    if(window.cobTab!=='cobrar'&&window.cobTab!=='gestiones')return;
    const body=tbody();if(!body)return;
    const actuales=new Set([...body.querySelectorAll('tr')].map(tr=>baseOt(tr.cells?.[0]?.textContent)));
    for(const ot of ['4701','4680']){
      if(actuales.has(ot))continue;
      const d=FACTURAS[ot];
      const o=(window.DB?.obras||[]).find(x=>baseOt(x.ot)===ot)||null;
      const p=saldo(o,d.saldo);
      const tr=document.createElement('tr');tr.dataset.tizV72=ot;
      tr.innerHTML=`<td class="strong">${ot}</td><td><b>${esc(o?.cliente||d.cliente)}</b><br><span style="color:var(--text3)">${esc(o?.desc||d.desc)}</span></td><td>Saldo: FC ${d.numero} · ${d.fecha}</td><td>${money(p)}</td><td>—</td><td><select class="quick-estado" style="min-width:178px"><option>${d.enviada?'Factura enviada':'Facturada - falta enviar'}</option></select></td><td>${acciones(o,d)}</td>`;
      body.prepend(tr);
    }
  }
  window.addEventListener('load',()=>{setTimeout(insertar,500);setTimeout(insertar,1500)});
  document.addEventListener('click',e=>{if(e.target?.closest?.('#page-cobranzas .page-tab'))setTimeout(insertar,120)});
  let n=0;const t=setInterval(()=>{insertar();if(++n>120)clearInterval(t)},250);
})();