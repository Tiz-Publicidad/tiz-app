// TIZ V73 — gestión integral de Facturación y Cobranzas
(function(){
  'use strict';
  const ESTADOS=[
    'Pendiente de facturar','Facturada - falta enviar','Factura enviada',
    'Esperando fecha de pago','Cobro programado','Vencida - reclamar',
    'Pago parcial','Cobrado','En revisión'
  ];
  const num=v=>Number(v)||0;
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const baseOt=v=>String(v??'').match(/\d{4,7}/)?.[0].replace(/^0+/,'')||'';
  const hoy=()=>new Date().toISOString().slice(0,10);
  const facturaValida=v=>{const s=norm(v);return !!s&&!['sin factura','sin facturar','-','—','n/a','na'].includes(s)};
  function obraPorOt(ot){return (window.DB?.obras||[]).find(o=>baseOt(o.ot)===baseOt(ot));}
  function facturaReal(o){
    const f=o?.facturaArca||{},fin=o?.finanzas||{};
    const nro=f.numeroCompleto||o?.nrfc||fin?.saldo?.nroFactura||fin?.anticipo?.nroFactura||'';
    return {tiene:!!f.cae||facturaValida(nro),enviada:!!f.emailUltimoEnvioAt,nro};
  }
  function sugerido(o){
    if(o?.estadoGestionFactura)return o.estadoGestionFactura;
    const f=o?.finanzas||{},fac=facturaReal(o),total=num(f.total||o?.neto);
    const cob=num(f?.anticipo?.montoCobrado)+num(f?.saldo?.montoCobrado);
    if(norm(o?.estado)==='cobrado'||(total>0&&cob>=total-0.01))return 'Cobrado';
    if(cob>0)return 'Pago parcial';
    const prevista=f?.saldo?.fechaPrevistaCobro||f?.anticipo?.fechaPrevistaCobro||'';
    if(fac.enviada&&prevista)return 'Cobro programado';
    if(fac.enviada)return 'Factura enviada';
    if(fac.tiene)return 'Facturada - falta enviar';
    return 'Pendiente de facturar';
  }
  function color(v){
    if(v==='Cobrado')return '#22a06b';
    if(v==='Factura enviada'||v==='Cobro programado')return '#2f81f7';
    if(v==='Pago parcial'||v==='Esperando fecha de pago')return '#e8b84b';
    if(v==='Vencida - reclamar'||v==='Facturada - falta enviar')return '#ef5b5b';
    if(v==='En revisión')return '#9b7cff';
    return '#8b949e';
  }
  async function guardarEstado(o,val,sel){
    const previo=o.estadoGestionFactura||'';o.estadoGestionFactura=val;
    if(sel)sel.style.borderColor=color(val);
    try{
      const patch={estadoGestionFactura:val,estadoGestionFacturaActualizadoAt:new Date().toISOString()};
      if(val==='Cobrado')patch.estado='Cobrado';
      else if(norm(o.estado)==='cobrado')patch.estado='Cobrado pendiente';
      await window.updateDoc_('obras',o.id,patch);
      Object.assign(o,patch);window.showToast?.('Estado de gestión actualizado');
      setTimeout(()=>window.renderCobranzas?.(),0);
    }catch(e){console.error(e);o.estadoGestionFactura=previo;if(sel)sel.value=sugerido(o);alert('No se pudo guardar el estado de gestión.');}
  }
  function convertirEstados(){
    if(window.cobTab!=='cobrar'&&window.cobTab!=='gestiones')return;
    document.querySelectorAll('#cobr-modulo-v48 table tbody tr').forEach(tr=>{
      const ot=baseOt(tr.cells?.[0]?.textContent),o=obraPorOt(ot);if(!o)return;
      const cells=[...tr.cells],estadoCell=cells.find(td=>td.querySelector('.badge,.estado-gestion-v70,select.quick-estado'))||cells[cells.length-2];
      if(!estadoCell)return;
      let sel=estadoCell.querySelector('select.estado-integral-v73');
      if(!sel){sel=document.createElement('select');sel.className='quick-estado estado-integral-v73';sel.style.minWidth='178px';estadoCell.innerHTML='';estadoCell.appendChild(sel);}
      const val=sugerido(o);sel.innerHTML=ESTADOS.map(x=>`<option value="${x}">${x}</option>`).join('');sel.value=ESTADOS.includes(val)?val:'En revisión';sel.style.borderColor=color(sel.value);sel.title='Estado operativo editable. El círculo de email sigue mostrando el envío real.';sel.onchange=()=>guardarEstado(o,sel.value,sel);
    });
  }
  function parteActiva(root){
    const antFact=root.querySelector('#fin-ant-fact')?.checked||facturaValida(root.querySelector('#fin-ant-fc')?.value);
    const salFact=root.querySelector('#fin-sal-fact')?.checked||facturaValida(root.querySelector('#fin-sal-fc')?.value);
    if(salFact)return 'fin-sal';if(antFact)return 'fin-ant';
    return (root.querySelector('[name="fin-tipo-factura"]:checked')?.value==='anticipo')?'fin-ant':'fin-sal';
  }
  function inyectarGestion(id){
    const root=document.getElementById('modal-cobranza-v41');if(!root||root.dataset.integralV73)return;root.dataset.integralV73='1';
    const o=(window.DB?.obras||[]).find(x=>x.id===id);if(!o)return;
    const grid=root.querySelector('.form-grid');if(!grid)return;
    const box=document.createElement('div');box.className='form-group full';box.style.cssText='border:1px solid var(--border2);border-radius:10px;padding:12px;margin-bottom:4px;background:rgba(255,255,255,.015)';
    const val=sugerido(o);
    box.innerHTML=`<div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap"><div style="min-width:220px;flex:1"><label style="display:block;margin-bottom:5px">Estado de gestión</label><select id="fin-estado-gestion" class="quick-estado" style="width:100%;border-color:${color(val)}">${ESTADOS.map(x=>`<option value="${x}" ${x===val?'selected':''}>${x}</option>`).join('')}</select></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button type="button" class="btn btn-ghost btn-sm" id="fin-programar">Programar cobro</button><button type="button" class="btn btn-ghost btn-sm" id="fin-parcial">Registrar pago parcial</button><button type="button" class="btn btn-primary btn-sm" id="fin-total-cobrado">Marcar cobrado total</button></div></div><div style="font-size:11px;color:var(--text3);margin-top:8px">Los cobros registrados acá alimentan automáticamente el Dashboard, Histórico y previsiones. El círculo amarillo/verde indica el envío real del correo y no se modifica manualmente.</div>`;
    grid.prepend(box);
    const estadoSel=box.querySelector('#fin-estado-gestion');estadoSel.onchange=()=>guardarEstado(o,estadoSel.value,estadoSel);
    box.querySelector('#fin-programar').onclick=()=>{const p=parteActiva(root);const el=root.querySelector('#'+p+'-prev');if(el){el.focus();if(!el.value)el.value=hoy();}estadoSel.value='Cobro programado';};
    box.querySelector('#fin-parcial').onclick=()=>{const p=parteActiva(root);const det=root.querySelector('#'+p+'-real')?.closest('details');if(det)det.open=true;root.querySelector('#'+p+'-real')?.focus();if(root.querySelector('#'+p+'-real')&&!root.querySelector('#'+p+'-real').value)root.querySelector('#'+p+'-real').value=hoy();root.querySelector('#'+p+'-cob')?.focus();estadoSel.value='Pago parcial';};
    box.querySelector('#fin-total-cobrado').onclick=()=>{
      const p=parteActiva(root),date=root.querySelector('#'+p+'-real'),cob=root.querySelector('#'+p+'-cob'),monto=root.querySelector('#'+p+'-monto'),total=root.querySelector('#fin-total');
      const det=date?.closest('details');if(det)det.open=true;if(date)date.value=hoy();if(cob)cob.value=num(monto?.value)||num(total?.value);estadoSel.value='Cobrado';
      alert('Se completaron fecha e importe del cobro. Revisalos y presioná “Guardar gestión” para confirmar.');
    };
    const save=root.querySelector('#fin-save');if(save){save.addEventListener('click',()=>{const v=estadoSel.value;o.estadoGestionFactura=v;window.updateDoc_?.('obras',o.id,{estadoGestionFactura:v,estadoGestionFacturaActualizadoAt:new Date().toISOString(),...(v==='Cobrado'?{estado:'Cobrado'}:{})}).catch(console.error);},{capture:true});}
  }
  function instalar(){
    if(typeof window.editarCobranzaObraV41==='function'&&!window.editarCobranzaObraV41.__integralV73){const old=window.editarCobranzaObraV41;const wrapped=function(id){const r=old.apply(this,arguments);setTimeout(()=>inyectarGestion(id),0);return r};wrapped.__integralV73=true;window.editarCobranzaObraV41=wrapped;}
    if(typeof window.renderCobranzas==='function'&&!window.renderCobranzas.__integralV73){const old=window.renderCobranzas;const wrapped=function(){const r=old.apply(this,arguments);setTimeout(convertirEstados,0);return r};wrapped.__integralV73=true;window.renderCobranzas=wrapped;}
    convertirEstados();
  }
  instalar();window.addEventListener('load',()=>{instalar();setTimeout(instalar,500);setTimeout(instalar,1500)});document.addEventListener('click',e=>{if(e.target?.closest?.('#page-cobranzas .page-tab'))setTimeout(convertirEstados,100)});let n=0;const t=setInterval(()=>{instalar();if(++n>120)clearInterval(t)},250);
})();
