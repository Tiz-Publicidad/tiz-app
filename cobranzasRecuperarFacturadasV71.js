// TIZ V71 — recupera en Por cobrar toda OT facturada con saldo, incluso flujos históricos
(function(){
  'use strict';
  const num=v=>Number(v)||0;
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const baseOt=v=>String(v??'').match(/\d{4,7}/)?.[0].replace(/^0+/,'')||'';
  const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(num(v));
  const fecha=v=>{const s=String(v||'');const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return `${m[3]}/${m[2]}/${m[1]}`;return s||'—'};
  function datosFactura(o){
    const f=o?.facturaArca||{};
    const fin=o?.finanzas||{};
    const parte=fin?.saldo?.nroFactura?fin.saldo:(fin?.anticipo?.nroFactura?fin.anticipo:{});
    return {
      numero:f.numeroCompleto||o?.nrfc||parte.nroFactura||'',
      fecha:f.fecha||o?.ffc||parte.fechaFactura||'',
      enviada:!!(f.emailUltimoEnvioAt||o?.facturaEmailEnviadaAt||o?.emailFacturaEnviadaAt),
      fileId:f.driveFileId||o?.facturaDriveFileId||'',
      tiene:!!(f.cae||o?.nrfc||parte.nroFactura)
    };
  }
  function saldo(o){
    const fin=o?.finanzas||{},total=num(fin.total||o?.neto||o?.importe||o?.infoPresupuesto?.importe||o?.facturaArca?.neto);
    const cob=num(fin?.anticipo?.montoCobrado)+num(fin?.saldo?.montoCobrado);
    const ret=Object.values(fin.retenciones||{}).reduce((a,v)=>a+num(v),0);
    if(total>0)return Math.max(0,total-cob-ret);
    return num(o?.facturaArca?.neto)||num(fin?.saldo?.monto)||num(fin?.anticipo?.monto);
  }
  function table(){
    return [...document.querySelectorAll('#cobr-modulo-v48 .card')].find(c=>/Seguimiento y compromisos|Cartera por cobrar/i.test(c.textContent||''))?.querySelector('tbody');
  }
  function insertar(){
    if(window.cobTab!=='cobrar'&&window.cobTab!=='gestiones')return;
    const tbody=table();if(!tbody)return;
    const actuales=new Set([...tbody.querySelectorAll('tr')].map(tr=>baseOt(tr.cells?.[0]?.textContent)));
    const obras=(window.DB?.obras||[]).filter(o=>{const d=datosFactura(o);return d.tiene&&saldo(o)>0&&!actuales.has(baseOt(o.ot))}).sort((a,b)=>num(baseOt(b.ot))-num(baseOt(a.ot)));
    for(const o of obras.reverse()){
      const d=datosFactura(o),p=saldo(o),fin=o.finanzas||{};
      const prevista=fin?.saldo?.fechaPrevistaCobro||fin?.anticipo?.fechaPrevistaCobro||'';
      const tr=document.createElement('tr');tr.dataset.tizV71='1';
      const estado=o.estadoGestionFactura||(d.enviada?'Factura enviada':'Facturada - falta enviar');
      const circle=d.enviada?'#22a06b':'#e8b84b';
      tr.innerHTML=`<td class="strong">${esc(baseOt(o.ot))}</td><td><b>${esc(o.cliente||'')}</b><br><span style="color:var(--text3)">${esc(o.desc||'')}</span></td><td>Saldo: FC ${esc(d.numero)} · ${esc(fecha(d.fecha))}</td><td>${money(p)}</td><td>${esc(fecha(prevista))}</td><td><select class="quick-estado" style="min-width:170px"><option>${esc(estado)}</option></select></td><td><div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap"><span title="${d.enviada?'Factura enviada por correo':'Factura pendiente de envío por correo'}" style="width:11px;height:11px;border-radius:50%;display:inline-block;background:${circle};box-shadow:0 0 0 3px ${d.enviada?'rgba(34,160,107,.14)':'rgba(232,184,75,.18)'}"></span><button class="btn btn-ghost btn-sm" onclick="editarCobranzaObraV41('${o.id}')">Gestionar</button>${d.fileId||o?.facturaArca?.cae?`<button class="btn btn-ghost btn-sm" onclick="abrirEnvioFacturaEmailV61('${o.id}')"><i class="ti ti-mail-forward"></i> ${d.enviada?'Reenviar FC':'Enviar FC'}</button>`:''}</div></td>`;
      tbody.prepend(tr);
    }
  }
  window.addEventListener('load',()=>{setTimeout(insertar,500);setTimeout(insertar,1500)});
  document.addEventListener('click',e=>{if(e.target?.closest?.('#page-cobranzas .page-tab'))setTimeout(insertar,120)});
  let n=0;const t=setInterval(()=>{insertar();if(++n>120)clearInterval(t)},250);
})();