// TIZ V68 — puente entre facturación ARCA y cartera por cobrar
(function(){
  'use strict';
  const num=v=>Number(v)||0;
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const baseOt=v=>String(v??'').match(/\d{4,7}/)?.[0].replace(/^0+/,'')||'';
  const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(num(v));
  const fecha=v=>{const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:(v||'—')};
  function totalAprobado(o){return num(o?.finanzas?.total||o?.neto||o?.importe||o?.infoPresupuesto?.importe)}
  function facturas(o){
    const list=Array.isArray(o?.facturasArca)?[...o.facturasArca]:[];
    if(o?.facturaArca?.cae&&!list.some(f=>f?.cae===o.facturaArca.cae))list.push(o.facturaArca);
    return list.filter(f=>f?.cae);
  }
  function syncObra(o){
    const fs=facturas(o);if(!fs.length)return false;
    const total=totalAprobado(o)||fs.reduce((a,f)=>a+num(f.neto),0);if(!total)return false;
    const fin={...(o.finanzas||{}),total};
    fin.anticipo={facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0,...(fin.anticipo||{})};
    fin.saldo={facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0,...(fin.saldo||{})};
    const ultimo=fs[fs.length-1];
    const facturado=fs.reduce((a,f)=>a+num(f.neto),0);
    const completo=facturado>=total-0.01 || o.facturado===true;
    if(!fin.anticipo.facturado&&!fin.saldo.facturado&&!fin.anticipo.nroFactura&&!fin.saldo.nroFactura){
      const dest=(!completo&&fs.length===1)?fin.anticipo:fin.saldo;
      dest.facturado=true;dest.nroFactura=ultimo.numeroCompleto||o.nrfc||'';dest.fechaFactura=ultimo.fecha||o.ffc||'';dest.monto=num(ultimo.neto)||facturado;dest.porcentaje=total?Math.round(dest.monto/total*10000)/100:100;
    }
    o.finanzas=fin;
    if(!o.nrfc)o.nrfc=ultimo.numeroCompleto||'';
    if(!o.ffc)o.ffc=ultimo.fecha||'';
    return true;
  }
  function syncTodas(){(window.DB?.obras||[]).forEach(syncObra)}
  function pendiente(o){
    const total=totalAprobado(o),f=o.finanzas||{};
    const cob=num(f.anticipo?.montoCobrado)+num(f.saldo?.montoCobrado);
    const ret=Object.values(f.retenciones||{}).reduce((a,v)=>a+num(v),0);
    return Math.max(0,total-cob-ret);
  }
  function asegurarFilasPorCobrar(){
    // Desde V69 la pestaña visible "Por cobrar" reutiliza internamente la vista
    // 'gestiones'. En ambos casos deben verse TODAS las facturas con saldo pendiente,
    // incluso las ya enviadas por email (ej. OT 4680).
    if(window.cobTab!=='cobrar'&&window.cobTab!=='gestiones')return;
    const cards=[...document.querySelectorAll('#cobr-modulo-v48 .card')];
    const card=cards.find(x=>/Cartera por cobrar|Seguimiento y compromisos/i.test(x.textContent||''));
    const tbody=card?.querySelector('tbody');if(!tbody)return;
    const actuales=new Set([...tbody.querySelectorAll('tr')].map(tr=>baseOt(tr.cells?.[0]?.textContent)));
    const faltantes=(window.DB?.obras||[]).filter(o=>o?.facturaArca?.cae&&pendiente(o)>0&&!actuales.has(baseOt(o.ot))).sort((a,b)=>num(baseOt(b.ot))-num(baseOt(a.ot)));
    if(!faltantes.length)return;
    const vacio=tbody.querySelector('tr td[colspan]');if(vacio)vacio.parentElement.remove();
    for(const o of faltantes.reverse()){
      const f=o.facturaArca||{},p=pendiente(o),enviada=!!f.emailUltimoEnvioAt;
      const tr=document.createElement('tr');
      tr.dataset.arcaBridge='1';
      tr.innerHTML=`<td class="strong">${esc(baseOt(o.ot))}</td><td><b>${esc(o.cliente||'')}</b><br><span style="color:var(--text3)">${esc(o.desc||'')}</span></td><td>Saldo: FC ${esc(f.numeroCompleto||o.nrfc||'')} · ${esc(fecha(f.fecha||o.ffc))}</td><td>${money(p)}</td><td>${esc(fecha(o?.finanzas?.saldo?.fechaPrevistaCobro||o?.finanzas?.anticipo?.fechaPrevistaCobro||''))}</td><td><span class="badge badge-red">Facturado pendiente</span></td><td><div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap"><span title="${enviada?'Factura enviada por correo':'Factura pendiente de envío por correo'}" style="width:11px;height:11px;border-radius:50%;display:inline-block;background:${enviada?'#22a06b':'#e8b84b'};box-shadow:0 0 0 3px ${enviada?'rgba(34,160,107,.14)':'rgba(232,184,75,.18)'}"></span><button class="btn btn-ghost btn-sm" onclick="editarCobranzaObraV41('${o.id}')">Gestionar</button><button class="btn btn-ghost btn-sm" onclick="abrirEnvioFacturaEmailV61('${o.id}')"><i class="ti ti-mail-forward"></i> ${enviada?'Reenviar FC':'Enviar FC'}</button></div></td>`;
      tbody.prepend(tr);
    }
  }
  function postRender(){syncTodas();setTimeout(asegurarFilasPorCobrar,0)}
  function instalar(){
    syncTodas();
    if(typeof window.renderCobranzas==='function'&&!window.renderCobranzas._arcaBridgeV68){
      const old=window.renderCobranzas;
      const wrapped=function(){syncTodas();const r=old.apply(this,arguments);setTimeout(asegurarFilasPorCobrar,0);return r};
      wrapped._arcaBridgeV68=true;window.renderCobranzas=wrapped;
    }
  }
  instalar();
  window.addEventListener('load',()=>{instalar();setTimeout(postRender,300);setTimeout(postRender,1200);setTimeout(()=>window.renderCobranzas?.(),1500)});
  document.addEventListener('click',e=>{if(e.target?.closest?.('#page-cobranzas .page-tab'))setTimeout(asegurarFilasPorCobrar,80)});
  let n=0;const t=setInterval(()=>{instalar();asegurarFilasPorCobrar();if(++n>120)clearInterval(t)},250);
})();