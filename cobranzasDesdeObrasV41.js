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
  const emptyPart=()=>({facturado:false,nroFactura:'',fechaFactura:'',monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0});
  const emptyFin=o=>({total:num(o?.neto),anticipo:emptyPart(),saldo:emptyPart(),retenciones:{suss:0,iibb:0,ganancias:0,iva:0,otras:0},notas:''});

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
    const cob=num(f.anticipo.montoCobrado)+num(f.saldo.montoCobrado);
    const pendiente=Math.max(0,num(f.total)-cob-ret);
    let status='Sin cobrar';
    if(pendiente<=0&&f.total>0)status='Cobrado';
    else if(cob>0&&(num(f.saldo.montoCobrado)>0||cob>=num(f.total)*.5))status='Cobro parcial';
    else if(num(f.anticipo.montoCobrado)>0)status='Anticipo cobrado';
    else if(f.anticipo.facturado||f.saldo.facturado)status='Facturado pendiente';
    return {f,ret,cob,pendiente,status};
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
    const title=page.querySelector('.page-title');if(title)title.textContent='Cobranzas por obra';
    const actions=page.querySelector('.header-actions');if(actions)actions.innerHTML='<button class="btn btn-ghost btn-sm" onclick="revisarUnificacionFinancieraV41()"><i class="ti ti-git-merge"></i> Revisar anticipos y saldos</button>';
    const tabs=page.querySelector('.page-tabs');if(tabs)tabs.innerHTML='<button class="page-tab active" onclick="setCobTab(\'pendientes\',this)">Pendientes</button><button class="page-tab" onclick="setCobTab(\'cobradas\',this)">Cobradas</button><button class="page-tab" onclick="setCobTab(\'todas\',this)">Todas</button>';
    const filter=page.querySelector('#cobr-filter-estado');if(filter)filter.innerHTML='<option value="">Todos los estados</option><option>Sin cobrar</option><option>Facturado pendiente</option><option>Anticipo cobrado</option><option>Cobro parcial</option><option>Cobrado</option>';
    const th=page.querySelector('thead tr');if(th)th.innerHTML='<th>OT</th><th>Cliente / obra</th><th>Estado obra</th><th>Facturación</th><th>Total</th><th>Cobrado</th><th>Retenciones</th><th>Saldo</th><th>Cobro previsto</th><th>Estado financiero</th><th></th>';
    const kpis=document.getElementById('cobr-kpis');
    if(kpis&&!document.getElementById('cobr-prevision-v42')){
      const forecast=document.createElement('div');forecast.id='cobr-prevision-v42';
      kpis.insertAdjacentElement('afterend',forecast);
    }
  }

  function parseIsoDate(value){
    const s=dateValue(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
    const d=new Date(s+'T12:00:00');return isNaN(d)?null:d;
  }
  function startOfWeek(date){const d=new Date(date);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);d.setHours(12,0,0,0);return d}
  function weekKey(date){const monday=startOfWeek(date);return monday.toISOString().slice(0,10)}
  function shortDate(date){return date.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'})}
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
    box.innerHTML=`<div class="card" style="margin-top:0"><div class="card-header"><span class="card-title">Previsión semanal de cobranzas · próximas 8 semanas</span><span style="font-size:11px;color:var(--text3)">Importes pendientes según fecha prevista</span></div><div class="card-body"><div style="display:grid;grid-template-columns:repeat(8,minmax(95px,1fr));gap:8px;overflow-x:auto;padding-bottom:4px">${list.map((w,i)=>`<div style="min-width:95px;background:var(--surface2);border:1px solid ${i===0?'rgba(232,184,75,.5)':'var(--border)'};border-radius:9px;padding:10px"><div style="font-size:10px;color:${i===0?'var(--accent)':'var(--text3)'}">${i===0?'ESTA SEMANA':shortDate(w.start)}</div><div style="font-weight:600;margin:7px 0 5px">${MONEY.format(w.total)}</div><div style="height:4px;background:var(--border);border-radius:4px"><div style="height:100%;width:${Math.round(w.total/max*100)}%;background:var(--green);border-radius:4px"></div></div><div style="font-size:10px;color:var(--text3);margin-top:5px">${w.count} cobro${w.count===1?'':'s'}</div></div>`).join('')}</div></div></div>`+
      `<div class="card"><div class="card-header"><span class="card-title">Próximos vencimientos de facturas</span><span style="font-size:11px;color:var(--text3)">${overdue.length} vencidas · ${undated.length} sin fecha prevista</span></div><div class="table-wrap"><table><thead><tr><th>Fecha prevista</th><th>OT</th><th>Cliente</th><th>Concepto</th><th>Factura</th><th>Importe esperado</th><th>Situación</th><th></th></tr></thead><tbody>${[...overdue.sort((a,b)=>a.fecha-b.fecha),...upcoming].slice(0,12).map(x=>{const late=x.fecha<today;return `<tr class="${late?'alerta-row':''}"><td style="color:${late?'var(--red)':'var(--text2)'}">${esc(displayDate(x.fecha.toISOString().slice(0,10)))}</td><td class="strong">${esc(baseOt(x.obra.ot))}</td><td>${esc(x.obra.cliente)}</td><td>${x.tipo==='anticipo'?'Anticipo':'Saldo'}</td><td>${x.nroFactura?esc(x.nroFactura):'<span style="color:var(--text3)">Sin número</span>'}</td><td style="font-weight:600">${MONEY.format(x.monto)}</td><td>${late?'<span class="badge badge-red">Vencida</span>':x.facturado?'<span class="badge badge-amber">Próxima</span>':'<span class="badge badge-gray">Sin facturar</span>'}</td><td><button class="btn btn-ghost btn-sm" onclick="editarCobranzaObraV41(\'${x.obra.id}\')">Gestionar</button></td></tr>`}).join('')||'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Todavía no hay fechas previstas cargadas.</td></tr>'}</tbody></table></div></div>`;
  }

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
    renderForecast((window.DB?.obras||[]).filter(o=>baseOt(o.ot)));
    const count=document.getElementById('cobr-count');if(count)count.textContent=rows.length+' obras';
    document.getElementById('cobr-tbody').innerHTML=rows.map(o=>{const x=totals(o);return `<tr><td class="strong">${esc(baseOt(o.ot))}</td><td><b style="color:var(--text)">${esc(o.cliente||'')}</b><br><span style="color:var(--text3)">${esc(o.desc||'')}</span></td><td>${esc(o.estado||'—')}</td><td style="font-size:11px">${invoiceSummary(x.f)}</td><td>${MONEY.format(x.f.total)}</td><td style="color:var(--green)">${MONEY.format(x.cob)}</td><td>${MONEY.format(x.ret)}</td><td style="color:${x.pendiente?'var(--amber)':'var(--green)'}">${MONEY.format(x.pendiente)}</td><td>${esc(displayDate(due(o)))}</td><td>${badge(x.status)}</td><td><button class="btn btn-ghost btn-sm" onclick="editarCobranzaObraV41('${o.id}')">Gestionar</button></td></tr>`}).join('')||'<tr><td colspan="11" style="text-align:center;padding:32px;color:var(--text3)">Sin obras para mostrar.</td></tr>';
  };

  function moneyInput(id,label,value){return `<div class="form-group"><label>${label}</label><input id="${id}" type="number" min="0" step="0.01" value="${num(value)}"></div>`}
  function partFields(prefix,title,p){return `<div class="form-section">${title}</div><div class="form-group"><label><input id="${prefix}-fact" type="checkbox" ${p.facturado?'checked':''}> Facturado</label></div><div class="form-group"><label>Número de factura</label><input id="${prefix}-fc" value="${esc(p.nroFactura)}"></div><div class="form-group"><label>Fecha factura</label><input id="${prefix}-ff" type="date" value="${esc(dateValue(p.fechaFactura))}"></div>${moneyInput(prefix+'-monto','Importe facturado',p.monto)}<div class="form-group"><label>Fecha prevista de cobro</label><input id="${prefix}-prev" type="date" value="${esc(dateValue(p.fechaPrevistaCobro))}"></div><div class="form-group"><label>Fecha de cobro</label><input id="${prefix}-real" type="date" value="${esc(dateValue(p.fechaCobro))}"></div>${moneyInput(prefix+'-cob','Importe cobrado',p.montoCobrado)}`}
  window.editarCobranzaObraV41=function(id){
    const o=(window.DB?.obras||[]).find(x=>x.id===id);if(!o)return;const f=finances(o);
    document.getElementById('modal-cobranza-v41')?.remove();const root=document.createElement('div');root.id='modal-cobranza-v41';root.className='modal-overlay open';
    root.innerHTML=`<div class="modal" style="max-width:900px"><div class="modal-title">Cobranza · OT ${esc(baseOt(o.ot))} · ${esc(o.cliente)}</div><div class="form-grid"><div class="form-group"><label>Total de la obra</label><input id="fin-total" type="number" min="0" value="${num(f.total)}"></div><div class="form-group"><label>Estado operativo</label><input value="${esc(o.estado||'')}" disabled></div>${partFields('fin-ant','Anticipo',f.anticipo)}${partFields('fin-sal','Saldo',f.saldo)}<div class="form-section">Retenciones</div>${moneyInput('fin-suss','SUSS',f.retenciones.suss)}${moneyInput('fin-iibb','Ingresos Brutos',f.retenciones.iibb)}${moneyInput('fin-gan','Ganancias',f.retenciones.ganancias)}${moneyInput('fin-iva','IVA',f.retenciones.iva)}${moneyInput('fin-otras','Otras',f.retenciones.otras)}<div class="form-group full"><label>Notas privadas de cobranzas</label><textarea id="fin-notas">${esc(f.notas)}</textarea></div></div><div class="modal-actions"><button class="btn btn-ghost" id="fin-cancel">Cancelar</button><button class="btn btn-primary" id="fin-save">Guardar cobranza</button></div></div>`;
    document.body.appendChild(root);root.querySelector('#fin-cancel').onclick=()=>root.remove();root.querySelector('#fin-save').onclick=()=>guardarFinanzas(id,root);
  };
  const val=id=>document.getElementById(id)?.value||'';const checked=id=>!!document.getElementById(id)?.checked;
  function readPart(p){return {facturado:checked(p+'-fact'),nroFactura:val(p+'-fc').trim(),fechaFactura:val(p+'-ff'),monto:num(val(p+'-monto')),fechaPrevistaCobro:val(p+'-prev'),fechaCobro:val(p+'-real'),montoCobrado:num(val(p+'-cob'))}}
  async function guardarFinanzas(id,root){
    const finanzas={total:num(val('fin-total')),anticipo:readPart('fin-ant'),saldo:readPart('fin-sal'),retenciones:{suss:num(val('fin-suss')),iibb:num(val('fin-iibb')),ganancias:num(val('fin-gan')),iva:num(val('fin-iva')),otras:num(val('fin-otras'))},notas:val('fin-notas').trim(),actualizadoAt:new Date().toISOString(),actualizadoPor:window.currentUser?.email||''};
    try{await window.updateDoc_('obras',id,{finanzas});const o=window.DB.obras.find(x=>x.id===id);if(o)o.finanzas=finanzas;root.remove();window.renderCobranzas();window.showToast?.('Cobranza actualizada ✓');}catch(e){console.error(e);window.showToast?.('No se pudo guardar la cobranza');}
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
