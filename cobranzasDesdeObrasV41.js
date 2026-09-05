// TIZ V41 — Cobranzas administradas desde cada obra.
(function(){
  'use strict';
  const MONEY = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const num=v=>Number(v)||0;
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const baseOt=v=>{const m=String(v??'').match(/\d{4,7}/);return m?String(Number(m[0])):''};
  const dateValue=v=>{if(!v)return '';const s=String(v);const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:s.slice(0,10)};
  const displayDate=v=>{if(!v)return '—';const s=String(v);const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:s};
  const emptyPart=()=>({facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0});
  const emptyFin=o=>({total:num(o?.neto),diasPago:0,anticipo:emptyPart(),saldo:emptyPart(),retenciones:{suss:0,iibb:0,ganancias:0,iva:0,otras:0},notas:''});

  function finances(o){
    const raw=o?.finanzas||o?.sectores?.cobranzas||{};
    const f={...emptyFin(o),...raw};
    f.total=num(raw.total||o?.neto);
    f.anticipo={...emptyPart(),...(raw.anticipo||{})};
    f.saldo={...emptyPart(),...(raw.saldo||{})};
    f.retenciones={suss:0,iibb:0,ganancias:0,iva:0,otras:0,...(raw.retenciones||{})};
    if(o?.nrfc&&!f.anticipo.nroFactura&&!f.saldo.nroFactura){f.saldo.nroFactura=o.nrfc;f.saldo.fechaFactura=o.ffc||o.fechaFactura||'';f.saldo.facturado=true;}
    return f;
  }
  function totals(o){
    const f=finances(o), ret=Object.values(f.retenciones).reduce((a,v)=>a+num(v),0);
    const registrado=num(f.anticipo.montoCobrado)+num(f.saldo.montoCobrado);
    const cobradoHistorico=norm(o?.estado)==='cobrado'&&registrado<=0&&num(f.total)>0;
    const cob=cobradoHistorico?Math.max(0,num(f.total)-ret):registrado;
    const pendiente=Math.max(0,num(f.total)-cob-ret);
    let status='Sin cobrar';
    if(pendiente<=0&&f.total>0)status='Cobrado';
    else if(cob>0&&(num(f.saldo.montoCobrado)>0||cob>=num(f.total)*.5))status='Cobro parcial';
    else if(num(f.anticipo.montoCobrado)>0)status='Anticipo cobrado';
    else if(f.anticipo.facturado||f.saldo.facturado)status='Facturado pendiente';
    return {f,ret,cob,pendiente,status,cobradoHistorico};
  }
  function due(o){const {f}=totals(o);return f.saldo.fechaPrevistaCobro||f.anticipo.fechaPrevistaCobro||''}
  function badge(status){const c=status==='Cobrado'?'green':status==='Sin cobrar'?'gray':status==='Facturado pendiente'?'red':'amber';return `<span class="badge badge-${c}">${esc(status)}</span>`}
  function invoiceSummary(f){
    const parts=[];
    if(f.anticipo.facturado||f.anticipo.nroFactura)parts.push(`Anticipo: ${f.anticipo.nroFactura?'FC '+esc(f.anticipo.nroFactura):'facturado'} · ${esc(displayDate(f.anticipo.fechaFactura))}`);
    if(f.saldo.facturado||f.saldo.nroFactura)parts.push(`Saldo: ${f.saldo.nroFactura?'FC '+esc(f.saldo.nroFactura):'facturado'} · ${esc(displayDate(f.saldo.fechaFactura))}`);
    return parts.length?parts.join('<br>'):'<span style="color:var(--text3)">Sin facturar</span>';
  }

  function setupPage(){
    const page=document.getElementById('page-cobranzas');if(!page)return;
    const title=page.querySelector('.page-title');if(title)title.textContent='Facturación y Cobranzas';
    const actions=page.querySelector('.header-actions');if(actions)actions.innerHTML='<button class="btn btn-primary btn-sm" onclick="prepararFacturaRealOT4680V60(this)"><i class="ti ti-file-invoice"></i> Preparar FC real OT 4680</button><button class="btn btn-ghost btn-sm" onclick="abrirEnvioFacturaEmailV61()"><i class="ti ti-mail-forward"></i> Enviar FC OT 4680</button><button class="btn btn-ghost btn-sm" onclick="validarArcaProduccionV59(this)"><i class="ti ti-shield-check"></i> Validar producción</button><button class="btn btn-ghost btn-sm" onclick="emitirPruebaArcaOT4680V57(this)"><i class="ti ti-flask"></i> Prueba OT 4680</button><button class="btn btn-ghost btn-sm" onclick="probarArcaHomologacionV46(this)"><i class="ti ti-plug-connected"></i> Probar ARCA</button>';
    const tabs=page.querySelector('.page-tabs');if(tabs&&!tabs.dataset.facV48){tabs.dataset.facV48='1';tabs.innerHTML=[['dashboard','Dashboard'],['facturar','Para facturar'],['cobrar','Por cobrar'],['gestiones','Gestiones'],['retenciones','Retenciones'],['historico','Histórico'],['alertas','Alertas'],['configuracion','Configuración']].map(([k,l])=>`<button class="page-tab ${k==='dashboard'?'active':''}" onclick="setCobTab('${k}',this)">${l}</button>`).join('');}
    const filter=page.querySelector('#cobr-filter-estado');if(filter)filter.innerHTML='<option value="">Todos los estados</option><option>Sin cobrar</option><option>Facturado pendiente</option><option>Anticipo cobrado</option><option>Cobro parcial</option><option>Cobrado</option>';
    const th=page.querySelector('thead tr');if(th)th.innerHTML='<th>OT</th><th>Cliente / obra</th><th>Estado obra</th><th>Facturación</th><th>Total</th><th>Cobrado</th><th>Retenciones</th><th>Saldo</th><th>Cobro previsto</th><th>Estado financiero</th><th></th>';
    const kpis=document.getElementById('cobr-kpis');
    if(kpis)kpis.dataset.facOriginal='1';
    const filters=page.querySelector('.filters');if(filters)filters.id='cobr-filters-v48';
    const legacyCard=page.querySelector('#cobr-tbody')?.closest('.card');if(legacyCard)legacyCard.id='cobr-historico-v48';
    if(kpis&&!document.getElementById('cobr-modulo-v48')){const module=document.createElement('div');module.id='cobr-modulo-v48';kpis.insertAdjacentElement('beforebegin',module)}
    if(kpis&&!document.getElementById('cobr-gestion-v47')){
      const management=document.createElement('div');management.id='cobr-gestion-v47';
      kpis.insertAdjacentElement('afterend',management);
    }
    if(kpis&&!document.getElementById('cobr-prevision-v42')){
      const forecast=document.createElement('div');forecast.id='cobr-prevision-v42';
      (document.getElementById('cobr-gestion-v47')||kpis).insertAdjacentElement('afterend',forecast);
    }
  }

  function partPending(o,tipo){const f=finances(o),p=f[tipo];return Math.max(0,num(p.monto)-num(p.montoCobrado))}
  function invoiceMovements(obras){const out=[];obras.forEach(o=>['anticipo','saldo'].forEach(tipo=>{const p=finances(o)[tipo],date=parseIsoDate(p.fechaFactura);if(p.facturado||p.nroFactura||num(p.monto))out.push({obra:o,tipo,date,amount:num(p.monto),part:p})}));return out}
  function monthOptions(selected){const now=new Date(),a=[];for(let i=-6;i<=3;i++){const d=new Date(now.getFullYear(),now.getMonth()+i,1),k=monthKey(d);a.push(`<option value="${k}" ${selected===k?'selected':''}>${esc(monthLabel(k))}</option>`)}return a.join('')}
  function weekOptionsV48(selected){const now=startOfWeek(new Date()),a=[];for(let i=-5;i<=6;i++){const d=new Date(now);d.setDate(d.getDate()+i*7);const k=weekKey(d),l=weekLabel(d);a.push(`<option value="${k}" ${selected===k?'selected':''}>${l.title} · ${l.range}</option>`)}return a.join('')}
  function tableCard(title,headers,rows,empty){return `<div class="card"><div class="card-header"><span class="card-title">${title}</span></div><div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}" style="text-align:center;padding:30px;color:var(--text3)">${empty||'No hay registros para mostrar.'}</td></tr>`}</tbody></table></div></div>`}
  function manageButton(o){const enviar=o?.facturaArca?.cae?`<button class="btn btn-ghost btn-sm" onclick="abrirEnvioFacturaEmailV61('${o.id}')"><i class="ti ti-mail-forward"></i> Enviar FC</button>`:'';return `<div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" onclick="editarCobranzaObraV41('${o.id}')">Gestionar</button>${enviar}</div>`}
  function operationalRows(items){return items.map(x=>{const o=x.obra||x,t=totals(o);return `<tr><td class="strong">${esc(baseOt(o.ot))}</td><td><b>${esc(o.cliente||'')}</b><br><span style="color:var(--text3)">${esc(o.desc||'')}</span></td><td>${invoiceSummary(t.f)}</td><td>${MONEY.format(t.pendiente)}</td><td>${esc(displayDate(due(o)))}</td><td>${badge(t.status)}</td><td>${manageButton(o)}</td></tr>`}).join('')}
  function renderModule(obras){
    const module=document.getElementById('cobr-modulo-v48'),tab=window.cobTab||'dashboard';if(!module)return;
    const legacy=['cobr-kpis','cobr-gestion-v47','cobr-prevision-v42','cobr-filters-v48','cobr-historico-v48'];legacy.forEach(id=>{const el=document.getElementById(id);if(el)el.style.display=tab==='historico'?(id==='cobr-filters-v48'||id==='cobr-historico-v48'?'':'none'):'none'});
    module.style.display=tab==='historico'?'none':'';if(tab==='historico')return;
    const now=new Date(),selectedMonth=window.facMonthV48||monthKey(now),selectedWeek=window.facWeekV48||weekKey(now),moves=collectionMovements(obras),invoices=invoiceMovements(obras),expected=expectedPayments(obras),today=new Date();today.setHours(0,0,0,0);
    const monthCollected=moves.dated.filter(x=>monthKey(x.date)===selectedMonth).reduce((a,x)=>a+x.amount,0),monthInvoiced=invoices.filter(x=>x.date&&monthKey(x.date)===selectedMonth).reduce((a,x)=>a+x.amount,0),monthRet=obras.filter(o=>['anticipo','saldo'].some(k=>{const d=parseIsoDate(finances(o)[k].fechaCobro);return d&&monthKey(d)===selectedMonth})).reduce((a,o)=>a+totals(o).ret,0);
    const all=obras.map(totals),portfolio=all.reduce((a,x)=>a+x.pendiente,0),overdueItems=expected.filter(x=>x.fecha&&x.fecha<today),overdue=overdueItems.reduce((a,x)=>a+x.monto,0),weekExpected=expected.filter(x=>x.fecha&&weekKey(x.fecha)===selectedWeek).reduce((a,x)=>a+x.monto,0),weekCollected=moves.dated.filter(x=>weekKey(x.date)===selectedWeek).reduce((a,x)=>a+x.amount,0);
    const selector=`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px"><div><div style="font-size:16px;font-weight:650">Tablero integral de gestión</div><div style="font-size:11px;color:var(--text3);margin-top:3px">Prioridades, facturación y cobranzas en una sola vista</div></div><div style="display:flex;gap:8px"><select class="quick-estado" onchange="facCambiarMesV48(this.value)">${monthOptions(selectedMonth)}</select><select class="quick-estado" onchange="facCambiarSemanaV48(this.value)">${weekOptionsV48(selectedWeek)}</select></div></div>`;
    if(tab==='dashboard'){
      const dueSoon=expected.filter(x=>x.fecha&&x.fecha>=today&&weekKey(x.fecha)===selectedWeek).length,missingInvoice=obras.filter(o=>{const f=finances(o);return totals(o).pendiente>0&&!f.anticipo.facturado&&!f.saldo.facturado&&!f.anticipo.nroFactura&&!f.saldo.nroFactura}).length,missingDate=expected.filter(x=>!x.fecha).length;
      const tasks=[{n:overdueItems.length,t:'cobros vencidos por reclamar',tab:'cobrar',c:'var(--red)'},{n:missingInvoice,t:'obras pendientes de facturar',tab:'facturar',c:'var(--amber)'},{n:dueSoon,t:'cobros previstos esta semana',tab:'cobrar',c:'var(--green)'},{n:missingDate,t:'saldos sin fecha comprometida',tab:'gestiones',c:'var(--text2)'}];
      module.innerHTML=selector+`<div class="kpi-grid"><div class="kpi"><div class="kpi-label">Facturado en el mes</div><div class="kpi-val">${MONEY.format(monthInvoiced)}</div></div><div class="kpi"><div class="kpi-label">Cobrado en el mes</div><div class="kpi-val green">${MONEY.format(monthCollected)}</div></div><div class="kpi"><div class="kpi-label">Cartera pendiente</div><div class="kpi-val amber">${MONEY.format(portfolio)}</div></div><div class="kpi"><div class="kpi-label">Vencido total</div><div class="kpi-val red">${MONEY.format(overdue)}</div></div><div class="kpi"><div class="kpi-label">Retenciones del mes</div><div class="kpi-val">${MONEY.format(monthRet)}</div></div></div><div style="display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.9fr);gap:12px"><div class="card"><div class="card-header"><span class="card-title">Resultado de la semana</span></div><div class="card-body"><div style="display:flex;justify-content:space-between;gap:20px"><div><div class="kpi-label">Previsto</div><div style="font-size:22px;font-weight:650">${MONEY.format(weekExpected)}</div></div><div><div class="kpi-label">Cobrado</div><div style="font-size:22px;font-weight:650;color:var(--green)">${MONEY.format(weekCollected)}</div></div><div><div class="kpi-label">Cumplimiento</div><div style="font-size:22px;font-weight:650">${weekExpected?Math.round(weekCollected/weekExpected*100):0}%</div></div></div><div style="height:7px;background:var(--border);border-radius:5px;margin-top:18px"><div style="height:100%;width:${Math.min(100,weekExpected?weekCollected/weekExpected*100:0)}%;background:var(--green);border-radius:5px"></div></div></div></div><div class="card"><div class="card-header"><span class="card-title">Ayudamemoria semanal</span></div><div class="card-body">${tasks.map(x=>`<div onclick="abrirFacTabV48('${x.tab}')" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer"><b style="min-width:28px;font-size:18px;color:${x.c}">${x.n}</b><span style="font-size:12px">${x.t}</span><i class="ti ti-chevron-right" style="margin-left:auto;color:var(--text3)"></i></div>`).join('')}</div></div></div>${tableCard('Atención inmediata',['Prioridad','OT','Cliente','Motivo','Importe','Acción'],overdueItems.sort((a,b)=>a.fecha-b.fecha).slice(0,6).map(x=>`<tr><td><span class="badge badge-red">Vencido</span></td><td class="strong">${esc(baseOt(x.obra.ot))}</td><td>${esc(x.obra.cliente)}</td><td>${esc(x.tipo==='anticipo'?'Anticipo':'Saldo')} · ${displayDate(x.fecha.toISOString().slice(0,10))}</td><td>${MONEY.format(x.monto)}</td><td>${manageButton(x.obra)}</td></tr>`).join(''),'No hay cobros vencidos: la cartera está al día.')}`;
    }else if(tab==='facturar'){const items=obras.filter(o=>{const x=totals(o),f=x.f;return x.pendiente>0&&((num(f.anticipo.monto)>num(f.anticipo.montoCobrado)&&!f.anticipo.facturado&&!f.anticipo.nroFactura)||(num(f.saldo.monto)>num(f.saldo.montoCobrado)&&!f.saldo.facturado&&!f.saldo.nroFactura)||(!num(f.anticipo.monto)&&!num(f.saldo.monto)&&!f.anticipo.facturado&&!f.saldo.facturado))});module.innerHTML=tableCard('Cola de facturación',['OT','Cliente / obra','Facturación actual','Saldo','Cobro previsto','Estado','Acción'],operationalRows(items),'No hay obras pendientes de facturar.');
    }else if(tab==='cobrar'){const items=obras.filter(o=>totals(o).pendiente>0&&(finances(o).anticipo.facturado||finances(o).saldo.facturado||finances(o).anticipo.nroFactura||finances(o).saldo.nroFactura)).sort((a,b)=>num(baseOt(b.ot))-num(baseOt(a.ot)));module.innerHTML=tableCard('Cartera por cobrar',['OT','Cliente / obra','Facturación','Saldo','Cobro previsto','Estado','Acción'],operationalRows(items),'No hay facturas pendientes de cobro.');
    }else if(tab==='gestiones'){const items=obras.filter(o=>totals(o).pendiente>0&&(!due(o)||finances(o).notas)).sort((a,b)=>num(baseOt(b.ot))-num(baseOt(a.ot)));module.innerHTML=tableCard('Seguimiento y compromisos',['OT','Cliente / obra','Facturación','Saldo','Fecha comprometida','Estado','Acción'],operationalRows(items),'No hay gestiones abiertas.');
    }else if(tab==='retenciones'){const items=obras.filter(o=>totals(o).ret>0),rows=items.map(o=>{const x=totals(o),r=x.f.retenciones;return `<tr><td class="strong">${esc(baseOt(o.ot))}</td><td>${esc(o.cliente)}</td><td>${MONEY.format(num(r.suss))}</td><td>${MONEY.format(num(r.iibb))}</td><td>${MONEY.format(num(r.ganancias))}</td><td>${MONEY.format(num(r.iva))}</td><td>${MONEY.format(num(r.otras))}</td><td><b>${MONEY.format(x.ret)}</b></td><td>${manageButton(o)}</td></tr>`}).join('');module.innerHTML=tableCard('Retenciones registradas',['OT','Cliente','SUSS','IIBB','Ganancias','IVA','Otras','Total','Acción'],rows,'Todavía no hay retenciones registradas.');
    }else if(tab==='alertas'){const items=obras.filter(o=>totals(o).pendiente>0&&(!due(o)||overdueItems.some(x=>x.obra.id===o.id)||!invoiceSummary(finances(o)).includes('FC ')));module.innerHTML=tableCard('Alertas que requieren resolución',['OT','Cliente / obra','Facturación','Saldo','Cobro previsto','Estado','Acción'],operationalRows(items),'No hay alertas financieras activas.');
    }else if(tab==='configuracion'){module.innerHTML=`<div class="card"><div class="card-header"><span class="card-title">Configuración operativa</span></div><div class="card-body"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px"><div class="kpi"><div class="kpi-label">Punto de venta productivo</div><div class="kpi-val">0009</div><div class="kpi-sub">RECE para aplicativo y web services</div></div><div class="kpi"><div class="kpi-label">Integración ARCA</div><div class="kpi-val green">Conectada</div><div class="kpi-sub">Emisión productiva permanece protegida</div></div><div class="kpi"><div class="kpi-label">Plazos de clientes</div><div class="kpi-val">${(window.DB?.clientes||[]).filter(c=>num(c.diasPagoHabitual)>0).length}</div><div class="kpi-sub">clientes con plazo habitual definido</div></div></div><p style="color:var(--text2);font-size:12px">La IA puede priorizar tareas y detectar riesgos, pero nunca emitirá facturas ni modificará importes automáticamente.</p></div></div>`}
  }
  window.facCambiarMesV48=v=>{window.facMonthV48=v;window.renderCobranzas?.()};window.facCambiarSemanaV48=v=>{window.facWeekV48=v;window.renderCobranzas?.()};
  window.abrirFacTabV48=function(tab){window.cobTab=tab;const btn=[...document.querySelectorAll('#page-cobranzas .page-tab')].find(x=>x.getAttribute('onclick')?.includes(`'${tab}'`));document.querySelectorAll('#page-cobranzas .page-tab').forEach(x=>x.classList.remove('active'));btn?.classList.add('active');window.renderCobranzas?.()};


  window.abrirEnvioFacturaEmailV61=function(obraId){
    if(!window.currentUser?.isAdmin)return window.showToast?.('Sólo administración puede enviar facturas');
    const obra=obraId?(window.DB?.obras||[]).find(x=>x.id===obraId):(window.DB?.obras||[]).find(x=>baseOt(x.ot)==='4680');
    if(!obra?.facturaArca?.cae)return alert('La OT seleccionada no tiene una factura ARCA autorizada.');
    const factura=obra.facturaArca;
    const cliente=(window.DB?.clientes||[]).find(c=>norm(c.nombre)===norm(obra.cliente));
    const destinatario=String(cliente?.email||factura.emailDestinatario||((baseOt(obra.ot)==='4680')?'facturacion@rootsagencia.com':'')).trim();
    const fileId=String(factura.driveFileId||((baseOt(obra.ot)==='4680')?'1OW0DBW9pH-QslFHdVJ--LHE2_q81s2jn':'')).trim();
    if(!fileId)return alert('La factura está autorizada, pero todavía no tiene un PDF asociado en Drive.');
    document.getElementById('modal-envio-factura-v61')?.remove();
    const root=document.createElement('div');root.id='modal-envio-factura-v61';root.className='modal-overlay open';
    const numero=String(factura.numeroCompleto||obra.nrfc||'').trim();
    root.innerHTML=`<div class="modal" style="max-width:720px"><div class="modal-title">Enviar factura · OT ${esc(baseOt(obra.ot))}</div><div style="padding:11px;border:1px solid rgba(232,184,75,.55);background:rgba(232,184,75,.08);border-radius:8px;margin-bottom:14px;font-size:12px"><b>Confirmación obligatoria.</b> Revisá el correo antes de enviar. La operación quedará registrada en la OT.</div><div class="form-grid"><div class="form-group"><label>Remitente</label><input value="TIZ Publicidad &lt;info@tizpublicidad.com&gt;" disabled></div><div class="form-group"><label>Factura</label><input value="${esc(numero)}" disabled></div><div class="form-group full"><label>Destinatario</label><input id="fc-email-dest-v61" type="email" value="${esc(destinatario)}" placeholder="facturacion@cliente.com"></div><div class="form-group full"><label>Asunto</label><input id="fc-email-asunto-v61" value="${esc('Factura '+numero+' - '+(obra.cliente||''))}"></div><div class="form-group full"><label>Archivo adjunto</label><input value="${esc(numero+' - '+(obra.cliente||'Cliente')+' - OT '+baseOt(obra.ot)+'.pdf')}" disabled></div>${cliente?`<label class="full" style="display:flex;gap:9px;align-items:flex-start;font-size:12px"><input id="fc-email-guardar-v61" type="checkbox"> Guardar este correo como email habitual de ${esc(cliente.nombre||obra.cliente)}.</label>`:''}</div><label style="display:flex;gap:9px;align-items:flex-start;font-size:12px;margin-top:16px"><input id="fc-email-check-v61" type="checkbox" style="margin-top:2px"> Confirmo el destinatario y deseo enviar ahora esta factura real por correo.</label><div class="modal-actions"><button class="btn btn-ghost" id="fc-email-cancel-v61">Cancelar</button><button class="btn btn-primary" id="fc-email-send-v61" disabled>ENVIAR FACTURA</button></div></div>`;
    document.body.appendChild(root);
    const confirm=root.querySelector('#fc-email-check-v61'),send=root.querySelector('#fc-email-send-v61');
    root.querySelector('#fc-email-cancel-v61').onclick=()=>root.remove();
    confirm.onchange=()=>{send.disabled=!confirm.checked};
    send.onclick=async()=>{
      const email=root.querySelector('#fc-email-dest-v61').value.trim().toLowerCase();
      const asunto=root.querySelector('#fc-email-asunto-v61').value.trim();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return alert('Revisá el correo del destinatario.');
      if(!asunto)return alert('El asunto no puede quedar vacío.');
      send.disabled=true;send.textContent='Enviando…';
      try{
        const [{getApp},{getAuth}]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')]);
        const user=getAuth(getApp()).currentUser;if(!user)throw new Error('Sesión no iniciada');
        const token=await user.getIdToken();
        const response=await fetch('https://us-central1-tiz---app.cloudfunctions.net/facturaEnviarEmail',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({obraId:obra.id,destinatario:email,fileId,asunto,confirmacion:'ENVIAR FACTURA POR EMAIL'})});
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!data.ok)throw new Error(data.error||'No se pudo enviar la factura');
        if(cliente&&root.querySelector('#fc-email-guardar-v61')?.checked){await window.updateDoc_('clientes',cliente.id,{email});cliente.email=email}
        factura.driveFileId=fileId;factura.drivePendiente=false;factura.emailUltimoDestinatario=email;factura.emailUltimoRemitente='info@tizpublicidad.com';factura.emailUltimoEnvioAt=new Date().toISOString();factura.emailUltimoEnvioPor=window.currentUser.email;
        root.remove();window.renderCobranzas?.();
        alert('FACTURA ENVIADA\n\nFactura '+numero+'\nDe: info@tizpublicidad.com\nPara: '+email+'\n\nEl envío quedó registrado en la OT '+baseOt(obra.ot)+'.');
      }catch(error){console.error(error);alert('No se pudo enviar la factura.\n\n'+(error.message||error));send.disabled=false;send.textContent='ENVIAR FACTURA'}
    };
  };

  window.probarArcaHomologacionV46=async function(button){
    if(!window.currentUser?.isAdmin){window.showToast?.('Sólo administración puede probar ARCA');return}
    const original=button?.innerHTML;if(button){button.disabled=true;button.textContent='Consultando ARCA…'}
    try{
      const [{getApp},{getAuth}]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')]);
      const user=getAuth(getApp()).currentUser;if(!user)throw new Error('Sesión no iniciada');
      const token=await user.getIdToken();
      const response=await fetch('https://arcahomologacionstatus-rqutcbncdq-uc.a.run.app',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'La conexión no respondió correctamente');
      const puntos=(data.pointsOfSale||[]).length?data.pointsOfSale.join(', '):'ninguno informado';
      alert('Conexión de homologación correcta.\n\nWSAA: autorizado\nWSFE: disponible\nCUIT emisor: '+data.issuerCuit+'\nPuntos de venta de prueba: '+puntos+'\n\nLa emisión continúa deshabilitada.');
    }catch(error){console.error(error);alert('No se pudo validar ARCA.\n\n'+(error.message||error)+'\n\nVerificá que el backend esté desplegado y sus secretos configurados.')}
    finally{if(button){button.disabled=false;button.innerHTML=original}}
  };

  window.validarArcaProduccionV59=async function(button){
    if(!window.currentUser?.isAdmin)return window.showToast?.('Sólo administración puede validar ARCA');
    const original=button?.innerHTML;if(button){button.disabled=true;button.textContent='Validando producción…'}
    try{
      const [{getApp},{getAuth}]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')]);
      const user=getAuth(getApp()).currentUser;if(!user)throw new Error('Sesión no iniciada');const token=await user.getIdToken();
      const response=await fetch('https://us-central1-tiz---app.cloudfunctions.net/arcaProduccionStatus',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
      const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw new Error(data.error||'Producción no respondió correctamente');
      const puntos=(data.pointsOfSale||[]).map(n=>String(n).padStart(5,'0')).join(', ')||'ninguno';
      alert(`${data.ready?'PRODUCCIÓN LISTA':'PRODUCCIÓN TODAVÍA NO LISTA'}\n\nWSAA: autorizado\nWSFE: disponible\nCUIT emisor: ${data.issuerCuit}\nPuntos web services: ${puntos}\nPunto requerido: 00009\nÚltima Factura A autorizada: ${data.lastAuthorized??'no disponible'}\n\n${data.message}\n\nEsta validación no emitió ninguna factura.`);
    }catch(error){console.error(error);alert('No se pudo validar ARCA producción.\n\n'+(error.message||error)+'\n\nNo se emitió ninguna factura.');}
    finally{if(button){button.disabled=false;button.innerHTML=original}}
  };

  window.prepararFacturaRealOT4680V60=function(){
    if(!window.currentUser?.isAdmin)return window.showToast?.('Sólo administración puede preparar facturas');
    const obra=(window.DB?.obras||[]).find(o=>baseOt(o.ot)==='4680');if(!obra)return window.showToast?.('No se encontró la OT 4680');
    const cliente=(window.DB?.clientes||[]).find(c=>norm(c.nombre)===norm(obra.cliente)||c.id===obra.clienteId),cuit=String(obra.clienteCuit||cliente?.cuit||'').replace(/\D/g,'');
    const nombre=String(cliente?.razonSocial||cliente?.razon_social||cliente?.nombreFiscal||obra.cliente||'').trim();
    const items=(obra.itemsCotizados||[]).map(i=>({descripcion:String(i.descripcion||i.desc||'').trim(),cantidad:num(i.cantidad||i.cant||1),unitario:num(i.unitario??i.precio)})).filter(i=>i.descripcion&&i.cantidad&&i.unitario);
    if(norm(nombre)!==norm('Actitud Argentina')||cuit!=='30710787588')return alert('Emisión bloqueada: la OT debe estar vinculada a Actitud Argentina · CUIT 30-71078758-8.');
    if(items.length!==2)return alert('Emisión bloqueada: deben conservarse exactamente los dos ítems cotizados.');
    if(obra.facturaArca?.cae||obra.finanzas?.saldo?.nroFactura)return alert('Esta OT ya tiene una factura registrada: '+(obra.facturaArca?.numeroCompleto||obra.finanzas.saldo.nroFactura));
    const neto=Math.round(items.reduce((a,i)=>a+i.cantidad*i.unitario,0)*100)/100,iva=Math.round(neto*.21*100)/100,total=neto+iva;
    if(Math.abs(neto-329200)>.01)return alert('Emisión bloqueada: el neto actual no coincide con $329.200. Revisá la cotización antes de continuar.');
    document.getElementById('modal-fc-real-4680')?.remove();const root=document.createElement('div');root.id='modal-fc-real-4680';root.className='modal-overlay open';
    root.innerHTML=`<div class="modal" style="max-width:850px"><div class="modal-title">Revisión final · Factura A real · OT 4680</div><div style="padding:11px;border:1px solid rgba(232,184,75,.55);background:rgba(232,184,75,.08);border-radius:8px;margin-bottom:14px;font-size:12px"><b>Comprobante fiscal real.</b> El botón final solicita el CAE a ARCA y no se puede deshacer.</div><div class="form-grid"><div class="form-group"><label>Emisor</label><input value="SIXSIGMA SRL · CUIT 30-71474230-9" disabled></div><div class="form-group"><label>Comprobante</label><input value="Factura A · Punto de venta 00009" disabled></div><div class="form-group"><label>Cliente</label><input value="${esc(nombre)}" disabled></div><div class="form-group"><label>CUIT receptor</label><input value="30-71078758-8" disabled></div><div class="form-group"><label>Condición de pago</label><input value="Contado" disabled></div><div class="form-group"><label>Fecha prevista de cobro</label><input value="Misma fecha de emisión" disabled></div></div><div class="form-section">Ítems incluidos</div><div class="table-wrap"><table><thead><tr><th>Descripción</th><th>Cantidad</th><th>Unitario neto</th><th>Subtotal</th></tr></thead><tbody>${items.map(i=>`<tr><td>${esc(i.descripcion)}</td><td>${i.cantidad}</td><td>${MONEY.format(i.unitario)}</td><td>${MONEY.format(i.cantidad*i.unitario)}</td></tr>`).join('')}</tbody></table></div><div style="margin:16px 0 8px auto;max-width:310px;line-height:1.8;font-size:13px">Neto: <b style="float:right">${MONEY.format(neto)}</b><br>IVA 21%: <b style="float:right">${MONEY.format(iva)}</b><br>Total final: <b style="float:right;font-size:16px;color:var(--accent)">${MONEY.format(total)}</b></div><label style="display:flex;gap:9px;align-items:flex-start;font-size:12px;margin-top:15px"><input id="fc-real-check" type="checkbox" style="margin-top:2px"> Revisé cliente, CUIT, los dos ítems, importes y confirmo que deseo emitir una factura fiscal real.</label><div class="modal-actions"><button class="btn btn-ghost" id="fc-real-cancel">Cancelar</button><button class="btn btn-primary" id="fc-real-emit" disabled>EMITIR FACTURA REAL</button></div></div>`;
    document.body.appendChild(root);const check=root.querySelector('#fc-real-check'),emit=root.querySelector('#fc-real-emit');check.onchange=()=>emit.disabled=!check.checked;root.querySelector('#fc-real-cancel').onclick=()=>root.remove();emit.onclick=()=>emitirFacturaRealOT4680V60(obra,root,emit);
  };

  async function emitirFacturaRealOT4680V60(obra,root,button){
    if(!confirm('ÚLTIMA CONFIRMACIÓN\n\nSe enviará a ARCA una Factura A REAL por $398.332 para Actitud Argentina. Esta acción no se puede anular.\n\n¿Confirmás la emisión?'))return;
    const original=button.textContent;button.disabled=true;button.textContent='Solicitando CAE a ARCA…';
    try{
      const [{getApp},{getAuth}]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')]);const user=getAuth(getApp()).currentUser;if(!user)throw new Error('Sesión no iniciada');const token=await user.getIdToken();
      const response=await fetch('https://us-central1-tiz---app.cloudfunctions.net/arcaProduccionEmitirOT4680',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({obraId:obra.id,confirmacion:'EMITIR FACTURA REAL OT 4680'})});const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw new Error(data.error||'ARCA no autorizó la factura');
      obra.facturaArca=data;obra.facturado=true;obra.nrfc=data.numeroCompleto;obra.ffc=data.fecha;obra.finanzas={...(obra.finanzas||{}),total:data.neto,diasPago:0,saldo:{...(obra.finanzas?.saldo||{}),facturado:true,porcentaje:100,nroFactura:data.numeroCompleto,fechaFactura:data.fecha,monto:data.neto,fechaPrevistaCobro:data.fecha}};root.remove();window.renderCobranzas?.();
      const win=window.open('','_blank','width=920,height=780');if(win){const rows=data.items.map(i=>`<tr><td>${esc(i.descripcion)}</td><td>${i.cantidad}</td><td>${MONEY.format(i.unitario)}</td><td>${MONEY.format(i.cantidad*i.unitario)}</td></tr>`).join('');win.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(data.numeroCompleto)} - Actitud Argentina - OT 4680</title><style>body{font:13px Arial;margin:32px;color:#222}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin:22px 0}th,td{padding:9px;border-bottom:1px solid #ddd;text-align:left}.tot{max-width:330px;margin-left:auto;line-height:1.8}.ok{padding:10px;background:#e7f6ec;border:1px solid #8bc59d}</style><div class="ok">COMPROBANTE AUTORIZADO POR ARCA</div><h1>Factura A ${esc(data.numeroCompleto)}</h1><p><b>Emisor:</b> SIXSIGMA SRL · CUIT 30-71474230-9<br><b>Cliente:</b> Actitud Argentina · CUIT 30-71078758-8<br><b>OT:</b> 4680 · <b>Condición:</b> Contado</p><table><thead><tr><th>Descripción</th><th>Cantidad</th><th>Unitario neto</th><th>Subtotal</th></tr></thead><tbody>${rows}</tbody></table><div class="tot">Neto: <b>${MONEY.format(data.neto)}</b><br>IVA 21%: <b>${MONEY.format(data.iva)}</b><br>Total: <b>${MONEY.format(data.total)}</b><br>CAE: <b>${esc(data.cae)}</b><br>Vencimiento CAE: <b>${esc(data.caeVto)}</b></div>`);win.document.close()}
      alert(`FACTURA AUTORIZADA\n\nFactura A ${data.numeroCompleto}\nCAE: ${data.cae}\nTotal: ${MONEY.format(data.total)}\n\nQuedó registrada en la OT 4680. La copia para Drive figura pendiente hasta completar la integración automática.`);
    }catch(e){console.error(e);alert('No se pudo completar la emisión.\n\n'+(e.message||e)+'\n\nNo vuelvas a presionar emitir si el mensaje indica que la operación quedó en proceso; primero verificaremos ARCA.');button.disabled=false;button.textContent=original}
  }

  window.emitirPruebaArcaOT4680V57=async function(button){
    if(!window.currentUser?.isAdmin)return window.showToast?.('Sólo administración puede emitir pruebas ARCA');
    const obra=(window.DB?.obras||[]).find(o=>baseOt(o.ot)==='4680');if(!obra)return window.showToast?.('No se encontró la OT 4680');
    const cliente=(window.DB?.clientes||[]).find(c=>norm(c.nombre)===norm(obra.cliente)||c.id===obra.clienteId),cuit=String(obra.clienteCuit||cliente?.cuit||'').replace(/\D/g,'');
    const nombre=String(cliente?.razonSocial||cliente?.razon_social||cliente?.nombreFiscal||obra.cliente||'').trim();
    const items=(obra.itemsCotizados||[]).map(i=>({descripcion:String(i.descripcion||i.desc||'').trim(),cantidad:num(i.cantidad||i.cant||1),unitario:num(i.unitario??i.precio)})).filter(i=>i.descripcion&&i.cantidad&&i.unitario);
    if(norm(nombre)!==norm('Actitud Argentina')||cuit!=='30710787588')return alert('La OT 4680 todavía no está vinculada correctamente.\n\nEsperado: Actitud Argentina · CUIT 30-71078758-8\nActual: '+nombre+' · '+(cuit||'sin CUIT'));
    if(items.length!==2)return alert('La prueba se detuvo porque la OT 4680 no tiene exactamente dos ítems cotizados.');
    const neto=Math.round(items.reduce((a,i)=>a+i.cantidad*i.unitario,0)*100)/100,iva=Math.round(neto*.21*100)/100,total=neto+iva;
    const detalle=items.map((i,n)=>`${n+1}. ${i.descripcion}\n   ${i.cantidad} × ${MONEY.format(i.unitario)}`).join('\n');
    if(!confirm(`PRUEBA SIN VALOR FISCAL\n\nOT 4680 · Factura A\nCliente: ${nombre}\nCUIT: 30-71078758-8\n\n${detalle}\n\nNeto: ${MONEY.format(neto)}\nIVA 21%: ${MONEY.format(iva)}\nTotal: ${MONEY.format(total)}\n\n¿Enviar a homologación de ARCA?`))return;
    const preview=window.open('','_blank','width=900,height=760'),original=button?.innerHTML;if(button){button.disabled=true;button.textContent='Emitiendo prueba…'}
    try{
      const [{getApp},{getAuth}]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')]);const user=getAuth(getApp()).currentUser;if(!user)throw new Error('Sesión no iniciada');const token=await user.getIdToken();
      const response=await fetch('https://us-central1-tiz---app.cloudfunctions.net/arcaHomologacionEmitirPrueba',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({docNro:cuit,neto,items})});const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw new Error(data.error||'ARCA rechazó la prueba');
      await window.updateDoc_('obras',obra.id,{ultimaPruebaArca:{...data,cliente:nombre,ot:'4680',fecha:new Date().toISOString()}});
      const filas=items.map(i=>`<tr><td>${esc(i.descripcion)}</td><td>${i.cantidad}</td><td>${MONEY.format(i.unitario)}</td><td>${MONEY.format(i.cantidad*i.unitario)}</td></tr>`).join('');
      preview.document.write(`<!doctype html><meta charset="utf-8"><title>Prueba ARCA OT 4680</title><style>body{font:14px Arial;margin:35px;color:#222}h1{font-size:22px}.test{padding:12px;background:#fff3cd;border:1px solid #e3c56b;font-weight:bold}table{width:100%;border-collapse:collapse;margin:22px 0}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}.tot{max-width:330px;margin-left:auto;line-height:1.8}.meta{line-height:1.6}</style><div class="test">COMPROBANTE DE HOMOLOGACIÓN · SIN VALOR FISCAL</div><h1>Factura A · OT 4680</h1><div class="meta"><b>Cliente:</b> ${esc(nombre)}<br><b>CUIT:</b> 30-71078758-8<br><b>Punto de venta de prueba:</b> ${data.ptoVta}<br><b>Comprobante:</b> ${data.cbteNro}</div><table><thead><tr><th>Descripción</th><th>Cantidad</th><th>Unitario neto</th><th>Subtotal</th></tr></thead><tbody>${filas}</tbody></table><div class="tot">Neto: <b>${MONEY.format(data.neto)}</b><br>IVA 21%: <b>${MONEY.format(data.iva)}</b><br>Total: <b>${MONEY.format(data.total)}</b><br>CAE prueba: <b>${esc(data.cae)}</b><br>Vencimiento CAE: <b>${esc(data.caeVto)}</b></div>`);preview.document.close();window.showToast?.('Factura de homologación aprobada por ARCA ✓');
    }catch(e){preview?.close();console.error(e);alert('No se pudo emitir la prueba.\n\n'+(e.message||e));}finally{if(button){button.disabled=false;button.innerHTML=original}}
  };

  function parseIsoDate(value){
    const s=dateValue(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
    const d=new Date(s+'T12:00:00');return isNaN(d)?null:d;
  }
  function startOfWeek(date){const d=new Date(date);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);d.setHours(12,0,0,0);return d}
  function weekKey(date){const monday=startOfWeek(date);return monday.toISOString().slice(0,10)}
  function shortDate(date){return date.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'})}
  function isoWeek(date){const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));return Math.ceil((((d-yearStart)/86400000)+1)/7)}
  function weekLabel(date){const end=new Date(date);end.setDate(end.getDate()+6);return {title:'SEM '+isoWeek(date),range:shortDate(date)+' al '+shortDate(end)}}
  function monthKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`}
  function monthLabel(key){const [y,m]=key.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('es-AR',{month:'long',year:'numeric'})}
  function collectionMovements(obras){
    const dated=[],undated=[];
    obras.forEach(o=>{const x=totals(o);let found=false;['anticipo','saldo'].forEach(tipo=>{const p=x.f[tipo],amount=num(p.montoCobrado);if(!amount)return;found=true;const date=parseIsoDate(p.fechaCobro);(date?dated:undated).push({obra:o,tipo,date,amount,ret:0})});if(x.cobradoHistorico&&!found)undated.push({obra:o,tipo:'histórico',date:null,amount:x.cob,ret:x.ret})});
    return {dated,undated};
  }
  function renderManagement(obras){
    const box=document.getElementById('cobr-gestion-v47');if(!box)return;
    const now=new Date(),week=weekKey(now),month=monthKey(now),moves=collectionMovements(obras);
    const weekCollected=moves.dated.filter(x=>weekKey(x.date)===week).reduce((a,x)=>a+x.amount,0);
    const monthCollected=moves.dated.filter(x=>monthKey(x.date)===month).reduce((a,x)=>a+x.amount,0);
    const monthRet=obras.filter(o=>{const x=totals(o);return ['anticipo','saldo'].some(k=>{const d=parseIsoDate(x.f[k].fechaCobro);return d&&monthKey(d)===month})}).reduce((a,o)=>a+totals(o).ret,0);
    const overdue=expectedPayments(obras).filter(x=>x.fecha&&x.fecha<new Date().setHours(0,0,0,0)).reduce((a,x)=>a+x.monto,0);
    const months=[];for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1),key=monthKey(d);months.push({key,collected:moves.dated.filter(x=>monthKey(x.date)===key).reduce((a,x)=>a+x.amount,0)})}
    const weeks=[];for(let i=7;i>=0;i--){const d=startOfWeek(now);d.setDate(d.getDate()-i*7);const key=weekKey(d);weeks.push({date:d,key,collected:moves.dated.filter(x=>weekKey(x.date)===key).reduce((a,x)=>a+x.amount,0)})}
    box.innerHTML=`<div class="kpi-grid" style="margin-top:12px"><div class="kpi"><div class="kpi-label">Cobrado esta semana</div><div class="kpi-val green">${MONEY.format(weekCollected)}</div><div class="kpi-sub">Según fecha real de cobro</div></div><div class="kpi"><div class="kpi-label">Cobrado este mes</div><div class="kpi-val green">${MONEY.format(monthCollected)}</div><div class="kpi-sub">${monthLabel(month)}</div></div><div class="kpi"><div class="kpi-label">Retenciones del mes</div><div class="kpi-val">${MONEY.format(monthRet)}</div><div class="kpi-sub">SUSS, IIBB, Ganancias, IVA y otras</div></div><div class="kpi"><div class="kpi-label">Vencido por gestionar</div><div class="kpi-val ${overdue?'red':''}">${MONEY.format(overdue)}</div><div class="kpi-sub">${moves.undated.length} cobros históricos sin fecha</div></div></div><div class="card"><div class="card-header"><span class="card-title">Cobranzas reales por semana</span><span style="font-size:11px;color:var(--text3)">Últimas 8 semanas</span></div><div class="card-body"><div style="display:grid;grid-template-columns:repeat(8,minmax(105px,1fr));gap:8px;overflow-x:auto">${weeks.map(w=>{const l=weekLabel(w.date);return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px"><div style="font-size:10px;color:var(--text2)">${l.title}</div><div style="font-size:9px;color:var(--text3)">${l.range}</div><div style="font-weight:600;margin-top:6px;color:var(--green)">${MONEY.format(w.collected)}</div></div>`}).join('')}</div></div></div><div class="card"><div class="card-header"><span class="card-title">Cobranzas reales por mes</span><span style="font-size:11px;color:var(--text3)">Últimos 6 meses · sólo movimientos con fecha real</span></div><div class="card-body"><div style="display:grid;grid-template-columns:repeat(6,minmax(110px,1fr));gap:8px;overflow-x:auto">${months.map(m=>`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px"><div style="font-size:10px;color:var(--text3);text-transform:capitalize">${esc(monthLabel(m.key))}</div><div style="font-weight:600;margin-top:6px;color:var(--green)">${MONEY.format(m.collected)}</div></div>`).join('')}</div></div></div>`;
  }
  function expectedPayments(obras){
    const rows=[];
    obras.forEach(o=>{const f=finances(o);['anticipo','saldo'].forEach(tipo=>{const p=f[tipo],pendiente=Math.max(0,num(p.monto)-num(p.montoCobrado));if(!pendiente)return;const fecha=parseIsoDate(p.fechaPrevistaCobro);rows.push({obra:o,tipo,fecha,monto:pendiente,facturado:!!p.facturado||!!p.nroFactura,nroFactura:p.nroFactura||''})})});
    return rows;
  }
  function renderForecast(obras){
    const box=document.getElementById('cobr-prevision-v42');if(!box)return;
    const today=new Date();today.setHours(0,0,0,0);const monday=startOfWeek(today),limit=new Date(monday);limit.setDate(limit.getDate()+7*8);
    const payments=expectedPayments(obras),overdue=payments.filter(x=>x.fecha&&x.fecha<today),upcoming=payments.filter(x=>x.fecha&&x.fecha>=today).sort((a,b)=>a.fecha-b.fecha);
    const undated=payments.filter(x=>!x.fecha),weeks=new Map();
    for(let i=0;i<8;i++){const d=new Date(monday);d.setDate(d.getDate()+i*7);weeks.set(weekKey(d),{start:d,total:0,count:0})}
    upcoming.filter(x=>x.fecha<limit).forEach(x=>{const w=weeks.get(weekKey(x.fecha));if(w){w.total+=x.monto;w.count++}});
    const list=[...weeks.values()],max=Math.max(1,...list.map(w=>w.total));
    const selected=window.cobrForecastWeekV43||'all';
    const visibleDue=selected==='all'?[...overdue.sort((a,b)=>a.fecha-b.fecha),...upcoming]:payments.filter(x=>x.fecha&&weekKey(x.fecha)===selected).sort((a,b)=>a.fecha-b.fecha);
    const weekOptions='<option value="all">Todas las semanas</option>'+list.map(w=>{const l=weekLabel(w.start);return `<option value="${weekKey(w.start)}" ${selected===weekKey(w.start)?'selected':''}>${l.title} · ${l.range}</option>`}).join('');
    box.innerHTML=`<div class="card" style="margin-top:0"><div class="card-header"><span class="card-title">Previsión de cobranzas por semana</span><select class="quick-estado" onchange="cambiarSemanaCobranzasV43(this.value)">${weekOptions}</select></div><div class="card-body"><div style="display:grid;grid-template-columns:repeat(8,minmax(105px,1fr));gap:8px;overflow-x:auto;padding-bottom:4px">${list.map((w,i)=>{const l=weekLabel(w.start);return `<div onclick="cambiarSemanaCobranzasV43('${weekKey(w.start)}')" style="cursor:pointer;min-width:105px;background:var(--surface2);border:1px solid ${selected===weekKey(w.start)||selected==='all'&&i===0?'rgba(232,184,75,.5)':'var(--border)'};border-radius:9px;padding:10px"><div style="font-size:10px;font-weight:600;color:${i===0?'var(--accent)':'var(--text2)'}">${l.title}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${l.range}</div><div style="font-weight:600;margin:7px 0 5px">${MONEY.format(w.total)}</div><div style="height:4px;background:var(--border);border-radius:4px"><div style="height:100%;width:${Math.round(w.total/max*100)}%;background:var(--green);border-radius:4px"></div></div><div style="font-size:10px;color:var(--text3);margin-top:5px">${w.count} cobro${w.count===1?'':'s'}</div></div>`}).join('')}</div></div></div>`+
      `<div class="card"><div class="card-header"><span class="card-title">Vencimientos ${selected==='all'?'de todas las semanas':'de la semana seleccionada'}</span><span style="font-size:11px;color:var(--text3)">${overdue.length} vencidas · ${undated.length} sin fecha prevista</span></div><div class="table-wrap"><table><thead><tr><th>Fecha prevista</th><th>OT</th><th>Cliente</th><th>Concepto</th><th>Factura</th><th>Importe esperado</th><th>Situación</th><th></th></tr></thead><tbody>${visibleDue.slice(0,20).map(x=>{const late=x.fecha<today;return `<tr class="${late?'alerta-row':''}"><td style="color:${late?'var(--red)':'var(--text2)'}">${esc(displayDate(x.fecha.toISOString().slice(0,10)))}</td><td class="strong">${esc(baseOt(x.obra.ot))}</td><td>${esc(x.obra.cliente)}</td><td>${x.tipo==='anticipo'?'Anticipo':'Saldo'}</td><td>${x.nroFactura?esc(x.nroFactura):'<span style="color:var(--text3)">Sin número</span>'}</td><td style="font-weight:600">${MONEY.format(x.monto)}</td><td>${late?'<span class="badge badge-red">Vencida</span>':x.facturado?'<span class="badge badge-amber">Próxima</span>':'<span class="badge badge-gray">Sin facturar</span>'}</td><td><button class="btn btn-ghost btn-sm" onclick="editarCobranzaObraV41(\'${x.obra.id}\')">Gestionar</button></td></tr>`}).join('')||'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">No hay vencimientos para esta semana.</td></tr>'}</tbody></table></div></div>`;
  }
  window.cambiarSemanaCobranzasV43=function(value){window.cobrForecastWeekV43=value;window.renderCobranzas?.()};
  window.actualizarEstadoCobranzaV43=async function(id,value){
    if(!['Cobrado pendiente','Cobrado'].includes(value))return;
    try{const o=(window.DB?.obras||[]).find(x=>x.id===id),patch={estado:value,estadoCobranzaActualizadoAt:new Date().toISOString()};if(value==='Cobrado'&&o){const f=finances(o),x=totals(o);if(!num(f.anticipo.montoCobrado)&&!num(f.saldo.montoCobrado)){f.saldo.montoCobrado=Math.max(0,num(f.total)-x.ret);f.saldo.fechaCobro=new Date().toISOString().slice(0,10);patch.finanzas=f}}await window.updateDoc_('obras',id,patch);if(o)Object.assign(o,patch);window.renderCobranzas?.();window.showToast?.('Estado y cobranza actualizados también en Obras ✓')}catch(e){console.error(e);window.showToast?.('No se pudo actualizar el estado')}
  };

  window.renderCobranzas=function(){
    setupPage();
    let rows=(window.DB?.obras||[]).filter(o=>o.id&&baseOt(o.ot));
    const q=(document.getElementById('cobr-filter-cliente')?.value||'').toLowerCase();
    const st=document.getElementById('cobr-filter-estado')?.value||'';
    if(q)rows=rows.filter(o=>`${o.ot} ${o.cliente} ${o.desc}`.toLowerCase().includes(q));
    if(st)rows=rows.filter(o=>totals(o).status===st);
    if(window.cobTab==='pendientes')rows=rows.filter(o=>totals(o).status!=='Cobrado');
    if(window.cobTab==='cobradas')rows=rows.filter(o=>totals(o).status==='Cobrado');
    rows.sort((a,b)=>num(baseOt(b.ot))-num(baseOt(a.ot)));
    const all=(window.DB?.obras||[]).filter(o=>baseOt(o.ot)).map(totals);
    const total=all.reduce((a,x)=>a+num(x.f.total),0),cob=all.reduce((a,x)=>a+x.cob,0),ret=all.reduce((a,x)=>a+x.ret,0),pend=all.reduce((a,x)=>a+x.pendiente,0);
    document.getElementById('cobr-kpis').innerHTML=`<div class="kpi"><div class="kpi-label">Total vendido</div><div class="kpi-val">${MONEY.format(total)}</div></div><div class="kpi"><div class="kpi-label">Cobrado</div><div class="kpi-val green">${MONEY.format(cob)}</div></div><div class="kpi"><div class="kpi-label">Retenciones</div><div class="kpi-val">${MONEY.format(ret)}</div></div><div class="kpi"><div class="kpi-label">Pendiente</div><div class="kpi-val amber">${MONEY.format(pend)}</div></div>`;
    const obrasFin=(window.DB?.obras||[]).filter(o=>baseOt(o.ot));renderModule(obrasFin);
    const count=document.getElementById('cobr-count');if(count)count.textContent=rows.length+' obras';
    document.getElementById('cobr-tbody').innerHTML=rows.map(o=>{const x=totals(o),current=o.estado||'';return `<tr><td class="strong">${esc(baseOt(o.ot))}</td><td><b style="color:var(--text)">${esc(o.cliente||'')}</b><br><span style="color:var(--text3)">${esc(o.desc||'')}</span></td><td><select class="quick-estado" onchange="actualizarEstadoCobranzaV43('${o.id}',this.value)">${!['Cobrado pendiente','Cobrado'].includes(current)?`<option value="" selected disabled>${esc(current||'Seleccionar')}</option>`:''}<option value="Cobrado pendiente" ${current==='Cobrado pendiente'?'selected':''}>Cobrado pendiente</option><option value="Cobrado" ${current==='Cobrado'?'selected':''}>Cobrado</option></select></td><td style="font-size:11px">${invoiceSummary(x.f)}</td><td>${MONEY.format(x.f.total)}</td><td style="color:var(--green)">${MONEY.format(x.cob)}</td><td>${MONEY.format(x.ret)}</td><td style="color:${x.pendiente?'var(--amber)':'var(--green)'}">${MONEY.format(x.pendiente)}</td><td>${esc(displayDate(due(o)))}</td><td>${badge(x.status)}</td><td><button class="btn btn-ghost btn-sm" onclick="editarCobranzaObraV41('${o.id}')">Gestionar</button></td></tr>`}).join('')||'<tr><td colspan="11" style="text-align:center;padding:32px;color:var(--text3)">Sin obras para mostrar.</td></tr>';
  };

  function moneyInput(id,label,value){return `<div class="form-group"><label>${label}</label><input id="${id}" type="number" min="0" step="0.01" value="${num(value)}"></div>`}
  function partFields(prefix,title,p,total){const pct=num(p.porcentaje)||(total?num(p.monto)/total*100:0);return `<div class="form-section">${title} · preparación de factura</div><div class="form-group"><label><input id="${prefix}-fact" type="checkbox" ${p.facturado?'checked':''}> Facturado</label></div><div class="form-group"><label>Porcentaje a facturar</label><input id="${prefix}-pct" type="number" min="0" max="100" step="0.01" value="${Math.round(pct*100)/100}"><small style="color:var(--text3)">% sobre el total de la obra</small></div><div class="form-group"><label>Número de factura</label><input id="${prefix}-fc" value="${esc(p.nroFactura)}"></div><div class="form-group"><label>Fecha factura</label><input id="${prefix}-ff" type="date" value="${esc(dateValue(p.fechaFactura))}"></div>${moneyInput(prefix+'-monto','Importe facturado',p.monto)}<div class="form-group"><label>Fecha prevista de cobro</label><input id="${prefix}-prev" type="date" value="${esc(dateValue(p.fechaPrevistaCobro))}"></div><div class="form-group"><label>Fecha de cobro</label><input id="${prefix}-real" type="date" value="${esc(dateValue(p.fechaCobro))}"></div>${moneyInput(prefix+'-cob','Importe cobrado',p.montoCobrado)}`}
  window.editarCobranzaObraV41=function(id){
    const o=(window.DB?.obras||[]).find(x=>x.id===id);if(!o)return;const f=finances(o);const cliente=(window.DB?.clientes||[]).find(c=>norm(c.nombre)===norm(o.cliente));const dias=num(f.diasPago||cliente?.diasPagoHabitual);
    document.getElementById('modal-cobranza-v41')?.remove();const root=document.createElement('div');root.id='modal-cobranza-v41';root.className='modal-overlay open';
    root.innerHTML=`<div class="modal" style="max-width:900px"><div class="modal-title">Cobranza · OT ${esc(baseOt(o.ot))} · ${esc(o.cliente)}</div><div class="form-grid"><div class="form-group"><label>Total de la obra</label><input id="fin-total" type="number" min="0" value="${num(f.total)}"></div><div class="form-group"><label>Estado operativo</label><input value="${esc(o.estado||'')}" disabled></div><div class="form-group"><label>Plazo habitual de pago</label><select id="fin-dias-pago"><option value="0">Sin plazo definido</option>${[7,15,30,45,60,90].map(d=>`<option value="${d}" ${dias===d?'selected':''}>${d} días</option>`).join('')}</select></div><div class="form-group"><label>Preferencia del cliente</label><input value="${cliente?.diasPagoHabitual?esc(cliente.diasPagoHabitual+' días guardados'):'Se guardará al confirmar'}" disabled></div>${partFields('fin-ant','Anticipo',f.anticipo,f.total)}${partFields('fin-sal','Saldo',f.saldo,f.total)}<div class="form-section">Retenciones</div>${moneyInput('fin-suss','SUSS',f.retenciones.suss)}${moneyInput('fin-iibb','Ingresos Brutos',f.retenciones.iibb)}${moneyInput('fin-gan','Ganancias',f.retenciones.ganancias)}${moneyInput('fin-iva','IVA',f.retenciones.iva)}${moneyInput('fin-otras','Otras',f.retenciones.otras)}<div class="form-group full"><label>Notas privadas de cobranzas</label><textarea id="fin-notas">${esc(f.notas)}</textarea></div></div><div class="modal-actions"><button class="btn btn-ghost" id="fin-cancel">Cancelar</button><button class="btn btn-primary" id="fin-save">Guardar cobranza</button></div></div>`;
    document.body.appendChild(root);root.querySelector('#fin-cancel').onclick=()=>root.remove();root.querySelector('#fin-save').onclick=()=>guardarFinanzas(id,root);root.querySelector('#fin-dias-pago').onchange=()=>calcularFechasPrevistasV44(true);['fin-ant','fin-sal'].forEach(p=>{const pct=document.getElementById(p+'-pct'),amount=document.getElementById(p+'-monto');pct.oninput=()=>{amount.value=Math.round(num(val('fin-total'))*num(pct.value))/100};amount.oninput=()=>{pct.value=num(val('fin-total'))?Math.round(num(amount.value)/num(val('fin-total'))*10000)/100:0};document.getElementById(p+'-ff').onchange=()=>calcularFechasPrevistasV44(false)});
  };
  function calcularFechasPrevistasV44(force){const dias=num(val('fin-dias-pago'));if(!dias)return;['fin-ant','fin-sal'].forEach(p=>{const invoice=parseIsoDate(val(p+'-ff')),target=document.getElementById(p+'-prev');if(invoice&&target&&(force||!target.value)){invoice.setDate(invoice.getDate()+dias);target.value=invoice.toISOString().slice(0,10)}})}
  const val=id=>document.getElementById(id)?.value||'';const checked=id=>!!document.getElementById(id)?.checked;
  function readPart(p){return {facturado:checked(p+'-fact'),porcentaje:num(val(p+'-pct')),nroFactura:val(p+'-fc').trim(),fechaFactura:val(p+'-ff'),monto:num(val(p+'-monto')),fechaPrevistaCobro:val(p+'-prev'),fechaCobro:val(p+'-real'),montoCobrado:num(val(p+'-cob'))}}
  async function guardarFinanzas(id,root){
    const finanzas={total:num(val('fin-total')),diasPago:num(val('fin-dias-pago')),anticipo:readPart('fin-ant'),saldo:readPart('fin-sal'),retenciones:{suss:num(val('fin-suss')),iibb:num(val('fin-iibb')),ganancias:num(val('fin-gan')),iva:num(val('fin-iva')),otras:num(val('fin-otras'))},notas:val('fin-notas').trim(),actualizadoAt:new Date().toISOString(),actualizadoPor:window.currentUser?.email||''};
    try{await window.updateDoc_('obras',id,{finanzas});const o=window.DB.obras.find(x=>x.id===id);if(o)o.finanzas=finanzas;const cliente=(window.DB?.clientes||[]).find(c=>norm(c.nombre)===norm(o?.cliente));if(cliente&&finanzas.diasPago!==num(cliente.diasPagoHabitual)){await window.updateDoc_('clientes',cliente.id,{diasPagoHabitual:finanzas.diasPago});cliente.diasPagoHabitual=finanzas.diasPago}root.remove();window.renderCobranzas();window.showToast?.('Cobranza y plazo del cliente actualizados ✓');}catch(e){console.error(e);window.showToast?.('No se pudo guardar la cobranza');}
  }

  function splitGroups(){
    const map=new Map();(window.DB?.obras||[]).forEach(o=>{const b=baseOt(o.ot),k=b+'|'+norm(o.cliente);if(!b)return;const a=map.get(k)||[];a.push(o);map.set(k,a)});
    return [...map.values()].filter(g=>g.length>1&&g.some(o=>/\b(anticipo|saldo)\b/i.test(o.desc||'')));
  }
  function backup(groups){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({fecha:new Date().toISOString(),grupos},null,2)],{type:'application/json'}));a.download='respaldo-unificacion-cobranzas-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  window.revisarUnificacionFinancieraV41=function(){
    const groups=splitGroups();document.getElementById('modal-unificar-v41')?.remove();const root=document.createElement('div');root.id='modal-unificar-v41';root.className='modal-overlay open';
    root.innerHTML=`<div class="modal" style="max-width:780px"><div class="modal-title">Revisión de anticipos y saldos</div><p style="color:var(--text2);margin-bottom:14px">Se encontraron <b>${groups.length}</b> OT candidatas. Sólo se incluyen grupos del mismo cliente cuya descripción menciona “anticipo” o “saldo”.</p><div style="max-height:420px;overflow:auto">${groups.map(g=>`<div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin:7px 0"><b>OT ${esc(baseOt(g[0].ot))} · ${esc(g[0].cliente)}</b>${g.map(o=>`<div style="font-size:12px;color:var(--text2);margin-top:4px">${esc(o.ot)} · ${esc(o.desc)} · ${MONEY.format(num(o.neto))}</div>`).join('')}</div>`).join('')||'<p style="color:var(--text3)">No hay divisiones seguras para unificar.</p>'}</div><p style="color:var(--amber);font-size:12px;margin-top:14px">Al confirmar se descargará un respaldo, se conservará una obra principal y se eliminarán únicamente las líneas de anticipo/saldo incluidas arriba.</p><div class="modal-actions"><button class="btn btn-ghost" id="uni-cancel">Cancelar</button><button class="btn btn-primary" id="uni-go" ${groups.length?'':'disabled'}>Unificar ${groups.length} OT</button></div></div>`;
    document.body.appendChild(root);root.querySelector('#uni-cancel').onclick=()=>root.remove();root.querySelector('#uni-go').onclick=()=>unificar(groups,root);
  };
  async function unificar(groups,root){
    if(!confirm('Esta acción unificará '+groups.length+' OT y eliminará las líneas separadas mostradas. Se descargará un respaldo antes de continuar. ¿Confirmás?'))return;
    backup(groups);const btn=root.querySelector('#uni-go');btn.disabled=true;let done=0;
    try{for(const g of groups){const ant=g.find(o=>/anticipo/i.test(o.desc||'')),sal=g.find(o=>/saldo/i.test(o.desc||''));const main=sal||g.find(o=>!/anticipo/i.test(o.desc||''))||ant||g[0];const total=g.reduce((a,o)=>a+num(o.neto),0);const f=finances(main);f.total=total;if(ant){f.anticipo={...f.anticipo,facturado:!!ant.nrfc,nroFactura:ant.nrfc||'',fechaFactura:ant.ffc||ant.fechaFactura||'',monto:num(ant.neto),montoCobrado:ant.estado==='Cobrado'?num(ant.neto):0}}if(sal){f.saldo={...f.saldo,facturado:!!sal.nrfc,nroFactura:sal.nrfc||'',fechaFactura:sal.ffc||sal.fechaFactura||'',monto:num(sal.neto),montoCobrado:sal.estado==='Cobrado'?num(sal.neto):0}}f.migradoDesde=g.map(o=>({id:o.id,ot:o.ot,desc:o.desc,neto:num(o.neto),estado:o.estado,nrfc:o.nrfc||''}));f.actualizadoAt=new Date().toISOString();const cleanDesc=String(main.desc||'').replace(/^\s*(anticipo|saldo)\s*[-–—:]?\s*/i,'').trim()||main.desc||'';await window.updateDoc_('obras',main.id,{ot:baseOt(main.ot),desc:cleanDesc,neto:total,finanzas:f,unificacionFinancieraV41:true});for(const o of g){if(o.id!==main.id)await window.deleteDoc_('obras',o.id)}done++;btn.textContent='Unificando '+done+' de '+groups.length+'…'}root.remove();window.showToast?.('Se unificaron '+done+' OT ✓');}catch(e){console.error(e);alert('La unificación se detuvo después de '+done+' OT: '+(e.message||e)+'. Conservá el respaldo descargado.');btn.disabled=false;}
  }

  const renderCobranzasV41=window.renderCobranzas;
  const setCobTabV41=(tab,el)=>{window.cobTab=tab;document.querySelectorAll('#page-cobranzas .page-tab').forEach(t=>t.classList.remove('active'));el?.classList.add('active');renderCobranzasV41()};
  function instalar(){
    if(typeof window.updateDoc_!=='function'||typeof window.goTo!=='function')return false;
    window.renderCobranzas=renderCobranzasV41;window.setCobTab=setCobTabV41;
    if(!window.goTo.__cobranzasV41){const baseGo=window.goTo;const secured=function(page){if(page==='cobranzas'&&!window.currentUser?.isAdmin){window.showToast?.('Cobranzas es un módulo privado de administración');return}return baseGo.apply(this,arguments)};secured.__cobranzasV41=true;window.goTo=secured;}
    setupPage();
    // La autenticación termina después de cargar este archivo. El acceso permanece
    // visible y la autorización se valida al entrar, con el usuario ya identificado.
    const nav=[...document.querySelectorAll('.nav-item')].find(x=>x.textContent.trim().startsWith('Cobranzas'));
    if(nav)nav.style.display='';
    if(window.currentPage==='cobranzas')renderCobranzasV41();return true;
  }
  if(!instalar()){let intentos=0;const timer=setInterval(()=>{if(instalar()||++intentos>80)clearInterval(timer)},250)}
})();
