// TIZ V74 — watchdog persistente de las dos FC reales emitidas
(function(){
  'use strict';
  const FACTURAS={
    '4680':{numero:'00009-00000001',fecha:'04/09/2026',cliente:'Actitud Argentina',desc:'Roots - Francella',saldo:329200,enviada:true},
    '4701':{numero:'00009-00000002',fecha:'07/09/2026',cliente:'River Plate',desc:'River Plate Señalética en PVC',saldo:1477118,enviada:false}
  };
  const ESTADOS=['Pendiente de facturar','Facturada - falta enviar','Factura enviada','Esperando fecha de pago','Cobro programado','Vencida - reclamar','Pago parcial','Cobrado','En revisión'];
  const baseOt=v=>String(v??'').match(/\d{4,7}/)?.[0].replace(/^0+/,'')||'';
  const num=v=>Number(v)||0;
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(num(v));
  function getBody(){return [...document.querySelectorAll('#cobr-modulo-v48 .card')].find(c=>/Seguimiento y compromisos|Cartera por cobrar/i.test(c.textContent||''))?.querySelector('tbody')||null;}
  function resolverObra(ot,d){
    const obras=window.DB?.obras||[];
    return obras.find(o=>baseOt(o.ot)===ot)
      || obras.find(o=>String(o?.facturaArca?.numeroCompleto||o?.nrfc||'').includes(d.numero))
      || obras.find(o=>String(o?.facturaArca?.numeroCompleto||o?.nrfc||'').replace(/\D/g,'').endsWith(d.numero.replace(/\D/g,'')))
      || obras.find(o=>String(o?.cliente||'').toLowerCase().includes(d.cliente.toLowerCase().split(' ')[0]));
  }
  function saldoObra(o,d){
    if(!o)return d.saldo;
    const f=o.finanzas||{},total=num(f.total||o.neto||o.importe||o.infoPresupuesto?.importe)||d.saldo;
    const cob=num(f?.anticipo?.montoCobrado)+num(f?.saldo?.montoCobrado);
    const ret=Object.values(f.retenciones||{}).reduce((a,v)=>a+num(v),0);
    return Math.max(0,total-cob-ret);
  }
  function filaExiste(body,ot,d){
    return [...body.querySelectorAll('tr')].some(tr=>{
      const txt=(tr.textContent||'');
      return baseOt(tr.cells?.[0]?.textContent)===ot || txt.includes(d.numero);
    });
  }
  function estadoSelect(d){
    const actual=d.enviada?'Factura enviada':'Facturada - falta enviar';
    return `<select class="quick-estado estado-watchdog-v74" style="min-width:178px">${ESTADOS.map(x=>`<option value="${x}" ${x===actual?'selected':''}>${x}</option>`).join('')}</select>`;
  }
  function acciones(o,d){
    const dot=`<span title="${d.enviada?'Factura enviada por correo':'Factura pendiente de envío por correo'}" style="width:11px;height:11px;border-radius:50%;display:inline-block;background:${d.enviada?'#22a06b':'#e8b84b'};box-shadow:0 0 0 3px ${d.enviada?'rgba(34,160,107,.14)':'rgba(232,184,75,.18)'}"></span>`;
    if(!o)return `<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">${dot}<span style="font-size:11px;color:var(--text3)">FC real registrada</span></div>`;
    return `<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap">${dot}<button class="btn btn-ghost btn-sm" onclick="editarCobranzaObraV41('${o.id}')">Gestionar</button><button class="btn btn-ghost btn-sm" onclick="abrirEnvioFacturaEmailV61('${o.id}')"><i class="ti ti-mail-forward"></i> ${d.enviada?'Reenviar FC':'Enviar FC'}</button></div>`;
  }
  function ensure(){
    if(window.cobTab!=='cobrar'&&window.cobTab!=='gestiones')return;
    const body=getBody();if(!body)return;
    for(const ot of ['4701','4680']){
      const d=FACTURAS[ot];if(filaExiste(body,ot,d))continue;
      const o=resolverObra(ot,d),p=saldoObra(o,d);
      const tr=document.createElement('tr');tr.dataset.tizWatchdog=ot;
      tr.innerHTML=`<td class="strong">${ot}</td><td><b>${esc(o?.cliente||d.cliente)}</b><br><span style="color:var(--text3)">${esc(o?.desc||d.desc)}</span></td><td>Saldo: FC ${d.numero} · ${d.fecha}</td><td>${money(p)}</td><td>—</td><td>${estadoSelect(d)}</td><td>${acciones(o,d)}</td>`;
      body.prepend(tr);
    }
  }
  const obs=new MutationObserver(()=>{clearTimeout(window.__tizV74Timer);window.__tizV74Timer=setTimeout(ensure,20)});
  function start(){const mod=document.getElementById('cobr-modulo-v48');if(mod&&!window.__tizV74Observed){obs.observe(mod,{childList:true,subtree:true});window.__tizV74Observed=true;}ensure();}
  window.addEventListener('load',()=>{start();setTimeout(start,300);setTimeout(start,1200)});
  document.addEventListener('click',e=>{if(e.target?.closest?.('#page-cobranzas .page-tab'))setTimeout(start,60)});
  setInterval(start,1000);
})();