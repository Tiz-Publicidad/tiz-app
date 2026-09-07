// TIZ V70 — estado de gestión editable por factura / cobranza
(function(){
  'use strict';
  const ESTADOS=[
    'Pendiente de facturar',
    'Facturada - falta enviar',
    'Factura enviada',
    'Cobro programado',
    'Reclamar pago',
    'Pago parcial',
    'Cobrado',
    'En revisión'
  ];
  const baseOt=v=>String(v??'').match(/\d{4,7}/)?.[0].replace(/^0+/,'')||'';
  const num=v=>Number(v)||0;
  function obraPorFila(tr){
    const ot=baseOt(tr?.cells?.[0]?.textContent||'');
    return (window.DB?.obras||[]).find(o=>baseOt(o.ot)===ot);
  }
  function sugerido(o){
    if(o?.estadoGestionFactura)return o.estadoGestionFactura;
    const f=o?.finanzas||{};
    const cob=num(f?.anticipo?.montoCobrado)+num(f?.saldo?.montoCobrado);
    const total=num(f?.total||o?.neto);
    if((String(o?.estado||'').toLowerCase()==='cobrado')||(total>0&&cob>=total-0.01))return 'Cobrado';
    if(cob>0)return 'Pago parcial';
    if(o?.facturaArca?.cae){
      if(o.facturaArca.emailUltimoEnvioAt)return 'Factura enviada';
      return 'Facturada - falta enviar';
    }
    if(o?.nrfc||f?.anticipo?.facturado||f?.saldo?.facturado)return 'Facturada - falta enviar';
    return 'Pendiente de facturar';
  }
  function color(v){
    if(v==='Cobrado')return '#22a06b';
    if(v==='Factura enviada'||v==='Cobro programado')return '#2f81f7';
    if(v==='Pago parcial')return '#e8b84b';
    if(v==='Reclamar pago'||v==='Facturada - falta enviar')return '#ef5b5b';
    if(v==='En revisión')return '#9b7cff';
    return '#8b949e';
  }
  async function guardar(o,value,select){
    const prev=o.estadoGestionFactura||'';
    o.estadoGestionFactura=value;
    select.style.borderColor=color(value);
    try{
      await window.updateDoc_('obras',o.id,{estadoGestionFactura:value,estadoGestionFacturaActualizadoAt:new Date().toISOString()});
      window.showToast?.('Estado de gestión actualizado');
    }catch(e){
      console.error(e);o.estadoGestionFactura=prev;select.value=sugerido(o);alert('No se pudo guardar el estado.');
    }
  }
  function convertir(){
    if(window.cobTab!=='cobrar'&&window.cobTab!=='gestiones')return;
    const rows=[...document.querySelectorAll('#cobr-modulo-v48 table tbody tr')];
    rows.forEach(tr=>{
      if(tr.querySelector('.estado-gestion-v70'))return;
      const o=obraPorFila(tr);if(!o)return;
      const cells=[...tr.cells];
      const estadoCell=cells.find(td=>td.querySelector('.badge'))||cells[cells.length-2];
      if(!estadoCell)return;
      const val=sugerido(o);
      const sel=document.createElement('select');
      sel.className='quick-estado estado-gestion-v70';
      sel.style.minWidth='170px';
      sel.style.borderColor=color(val);
      sel.title='Estado operativo de la factura/cobranza. Editable por el operador.';
      sel.innerHTML=ESTADOS.map(x=>`<option value="${x}">${x}</option>`).join('');
      sel.value=val;
      sel.onchange=()=>guardar(o,sel.value,sel);
      estadoCell.innerHTML='';estadoCell.appendChild(sel);
    });
  }
  function instalar(){
    if(typeof window.renderCobranzas==='function'&&!window.renderCobranzas.__estadoGestionV70){
      const old=window.renderCobranzas;
      const wrapped=function(){const r=old.apply(this,arguments);setTimeout(convertir,0);return r};
      wrapped.__estadoGestionV70=true;window.renderCobranzas=wrapped;
    }
    convertir();
  }
  instalar();
  document.addEventListener('click',e=>{if(e.target?.closest?.('#page-cobranzas .page-tab'))setTimeout(convertir,100)});
  window.addEventListener('load',()=>{instalar();setTimeout(convertir,500);setTimeout(convertir,1500)});
  let n=0;const t=setInterval(()=>{instalar();convertir();if(++n>120)clearInterval(t)},250);
})();