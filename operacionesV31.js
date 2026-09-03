
/**
 * CLEMEN ERP V31 — Base operativa por sector
 * Fuente principal: Firebase/ERP.
 * Al guardar una ficha, actualiza Firebase y luego la Google Sheet/PDF del sector.
 */
(() => {
  'use strict';

  const VERSION = 'V31.2-DRIVE-20260801';
  const WEBHOOK = 'https://script.google.com/macros/s/AKfycbx_Uy_ijUG38rht-m-Xp-y9Eou8WzoG4jepXi1GqJaHAknwQsQd-rQgYcQ1ucrAJPlK/exec';
  const SECTOR_KEYS = { 'Producción':'produccion', 'Colocaciones':'colocaciones', 'Calidad':'calidad' };
  const CHECKS = {
    produccion: [
      ['plano','Plano o montaje disponible'],
      ['materiales','Materiales variables calculados'],
      ['stock','Stock revisado'],
      ['procesos','Procesos definidos'],
      ['responsable','Responsable asignado'],
      ['fechas','Fechas planificadas'],
      ['compras','Análisis enviado a Compras'],
      ['calidad','Lista para Calidad']
    ],
    colocaciones: [
      ['direccion','Dirección y contacto confirmados'],
      ['fotos','Fotos o relevamiento disponibles'],
      ['medidas','Medidas y altura verificadas'],
      ['plano','Plano o montaje disponible'],
      ['calidad','Calidad liberó la obra'],
      ['materiales','Kit de colocación completo'],
      ['personal','Personal y vehículo asignados'],
      ['fecha','Cliente confirmó fecha y horario']
    ],
    calidad: [
      ['medidas','Medidas verificadas'],
      ['terminacion','Terminaciones correctas'],
      ['pintura','Pintura aprobada'],
      ['electricidad','Iluminación probada'],
      ['limpieza','Limpieza final'],
      ['embalaje','Embalaje aprobado'],
      ['fotos','Fotos cargadas'],
      ['liberado','Obra liberada']
    ]
  };

  const MATERIAL_OPTIONS = [
    'Caño 60x40 x1,24 mm',
    'Caño 30x30 x1,24 mm',
    'Caño 20x20 x1,24 mm',
    'Chapa galvanizada C25',
    'Chapa galvanizada C22',
    'Acrílico opalino 2 mm',
    'Acrílico transparente 2 mm',
    'Acrílico naranja',
    'Acrílico verde',
    'Lona backlight',
    'Módulos LED',
    'Fuente 12 V',
    'Tarugos',
    'Tirafondos',
    'Bulones',
    'Cable',
    'Silicona / sellador'
  ];

  const esc = value => String(value ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const today = () => new Date().toISOString().slice(0,10);
  const sectorKey = sector => SECTOR_KEYS[sector] || norm(sector);
  const getGestion = (obra, sector) => ((obra.gestionSectores || {})[sectorKey(sector)] || {});
  const pct = (sector, data) => {
    const checks = data.checks || {};
    const list = CHECKS[sectorKey(sector)] || [];
    return list.length ? Math.round(list.filter(([k]) => !!checks[k]).length / list.length * 100) : 0;
  };
  const toast = msg => window.showToast ? window.showToast(msg) : alert(msg);

  const otNumber = value => {
    const digits = String(value || '').replace(/\D/g,'');
    return digits ? Number(digits) : -1;
  };

  function approvedWorks() {
    return [...(window.DB?.obras || [])]
      .filter(o => ['aprobado','en producción','entregado','facturado'].includes(norm(o.estado)))
      .sort((a,b) => otNumber(b.ot) - otNumber(a.ot));
  }

  function driveButtons(o, sector) {
    const data = getGestion(o, sector);
    const folder = o.driveFolderUrl ? `<button class="v31-icon green" title="Abrir carpeta OT" onclick="event.stopPropagation();window.open('${esc(o.driveFolderUrl)}','_blank')">📁</button>` : `<button class="v31-icon amber" title="Crear o recuperar carpeta OT" onclick="event.stopPropagation();requestDriveSyncForObra('${o.id}',event)">📁</button>`;
    const sheet = data.sheetUrl ? `<button class="v31-icon blue" title="Abrir hoja de ${sector}" onclick="event.stopPropagation();window.open('${esc(data.sheetUrl)}','_blank')">📄</button>` : '';
    return `<div class="v31-actions">${folder}${sheet}<button class="v31-icon" title="Editar ficha" onclick="event.stopPropagation();openSectorFichaV31('${o.id}','${sector}')">✎</button></div>`;
  }

  function alertsFor(o, sector) {
    const d = getGestion(o, sector), alerts = [];
    if (sector === 'Producción') {
      if (!d.fechaInicioPlan) alerts.push('Falta fecha prevista de inicio.');
      if (!(d.materiales || []).length) alerts.push('No se calcularon materiales variables.');
      if (!d.responsable) alerts.push('No hay responsable asignado.');
      if (d.fechaInicioPlan && d.fechaInicioPlan < today() && !d.fechaInicioReal) alerts.push('El inicio planificado ya venció.');
      if (d.horasPlan && d.horasReal && Number(d.horasReal) > Number(d.horasPlan) * 1.15) alerts.push('Las horas reales superan más de 15% lo planificado.');
    }
    if (sector === 'Colocaciones') {
      if (!d.direccion && !o.direccion) alerts.push('Falta dirección completa.');
      if (!d.altura) alerts.push('Falta cargar la altura.');
      if (Number(d.altura || 0) >= 4 && !((d.recursos || []).includes('Hidrogrúa') || (d.recursos || []).includes('Elevador'))) alerts.push('La altura requiere revisar equipo de elevación.');
      if (!d.fechaPlan) alerts.push('No hay fecha tentativa de colocación.');
      if (!d.responsable) alerts.push('No hay responsable de cuadrilla.');
    }
    return alerts;
  }

  function style() {
    if (document.getElementById('v31-style')) return;
    const s = document.createElement('style');
    s.id = 'v31-style';
    s.textContent = `
      .v31-wrap{padding:2px 0 30px}.v31-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:15px}
      .v31-head h2{margin:0;font-size:22px}.v31-sub{font-size:11px;color:var(--text3);margin-top:4px}
      .v31-kpis{display:grid;grid-template-columns:repeat(5,minmax(145px,1fr));gap:10px;margin-bottom:12px}
      .v31-kpi{border:1px solid var(--border);background:var(--surface);border-radius:10px;padding:12px;border-left:3px solid var(--c,var(--blue))}
      .v31-kpi label{display:block;color:var(--text3);font-size:9px;text-transform:uppercase}.v31-kpi b{display:block;font:700 22px 'DM Mono',monospace;margin:6px 0}.v31-kpi small{font-size:9px;color:var(--text3)}
      .v31-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(320px,.65fr);gap:10px}.v31-panel{border:1px solid var(--border);background:var(--surface);border-radius:10px;padding:12px}
      .v31-toolbar{display:flex;gap:7px;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}.v31-toolbar input,.v31-toolbar select{background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:7px;font-size:10px}
      .v31-list{display:grid;grid-template-columns:repeat(2,minmax(300px,1fr));gap:9px}.v31-card{border:1px solid var(--border);background:var(--surface2);border-radius:9px;padding:11px;cursor:pointer}.v31-card:hover{border-color:rgba(79,156,255,.55)}
      .v31-card-head{display:flex;justify-content:space-between;gap:8px}.v31-title{font-size:12px;font-weight:700}.v31-meta{font-size:9px;color:var(--text3);margin-top:3px}.v31-pill{font-size:8px;padding:4px 7px;border-radius:99px;background:rgba(79,156,255,.12);color:#70aaff;white-space:nowrap}.v31-pill.red{background:rgba(224,92,92,.14);color:#ff6f6f}.v31-pill.green{background:rgba(76,175,125,.14);color:#61d79a}
      .v31-progress{height:6px;background:#090909;border-radius:99px;overflow:hidden;margin:9px 0}.v31-progress span{display:block;height:100%;background:linear-gradient(90deg,var(--blue),var(--teal));border-radius:99px}
      .v31-actions{display:flex;gap:5px;justify-content:flex-end;margin-top:7px}.v31-icon{width:30px;height:28px;border:1px solid var(--border);background:var(--surface);color:var(--text2);border-radius:7px;cursor:pointer}.v31-icon.green{color:var(--green)}.v31-icon.amber{color:var(--amber)}.v31-icon.blue{color:var(--blue)}
      .v31-alert{border:1px solid var(--border);border-left:3px solid var(--amber);background:var(--surface2);border-radius:8px;padding:9px;margin:7px 0;font-size:10px}.v31-alert.red{border-left-color:var(--red)}
      .v31-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.78);display:none;align-items:flex-start;justify-content:center;padding:24px;z-index:10050;overflow:auto}.v31-modal-bg.show{display:flex}.v31-modal{width:min(1180px,98vw);background:var(--bg);border:1px solid var(--border);border-radius:13px;padding:15px;box-shadow:0 25px 100px #000}
      .v31-modal-head{display:flex;justify-content:space-between;align-items:flex-start}.v31-tabs{display:flex;gap:15px;border-bottom:1px solid var(--border);margin:12px 0}.v31-tab{border:0;background:transparent;color:var(--text3);padding:9px 1px;border-bottom:2px solid transparent;cursor:pointer}.v31-tab.active{color:var(--blue);border-bottom-color:var(--blue)}
      .v31-form{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.v31-field label{display:block;font-size:8px;color:var(--text3);text-transform:uppercase;margin-bottom:4px}.v31-field input,.v31-field select,.v31-field textarea{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:7px;font-size:10px}.v31-field.full{grid-column:1/-1}
      .v31-checks{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.v31-check{border:1px solid var(--border);background:var(--surface2);border-radius:7px;padding:9px;font-size:10px}.v31-check.done{opacity:.6;text-decoration:line-through}.v31-check input{accent-color:var(--green);margin-right:6px}
      .v31-material{display:grid;grid-template-columns:2fr .65fr .65fr auto;gap:6px;margin-bottom:6px}.v31-material input,.v31-material select{background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:7px;font-size:10px}
      .v31-docs{display:flex;flex-wrap:wrap;gap:7px}.v31-doc{border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:8px;padding:10px;cursor:pointer}
      @media(max-width:1200px){.v31-kpis{grid-template-columns:repeat(2,1fr)}.v31-grid{grid-template-columns:1fr}.v31-list{grid-template-columns:1fr}}@media(max-width:700px){.v31-form,.v31-checks{grid-template-columns:1fr}.v31-field.full{grid-column:auto}}
    `;
    document.head.appendChild(s);
  }

  function renderSector(sector) {
    const pageId = sector === 'Producción' ? 'page-produccion' : 'page-colocaciones';
    const page = document.getElementById(pageId);
    if (!page) return;
    const works = approvedWorks().filter(o => {
      if (sector === 'Colocaciones') return o.fcol_c || getGestion(o, sector).fechaPlan || ['aprobado','en producción','entregado'].includes(norm(o.estado));
      return ['aprobado','en producción'].includes(norm(o.estado));
    }).sort((a,b) => otNumber(b.ot) - otNumber(a.ot));
    const query = norm(window[`v31Search${sector}`] || '');
    const status = window[`v31Status${sector}`] || 'todas';
    let filtered = works.filter(o => !query || norm([o.ot,o.cliente,o.desc].join(' ')).includes(query));
    if (status === 'pendientes') filtered = filtered.filter(o => pct(sector,getGestion(o,sector)) < 100);
    if (status === 'listas') filtered = filtered.filter(o => pct(sector,getGestion(o,sector)) === 100);
    if (status === 'alertas') filtered = filtered.filter(o => alertsFor(o,sector).length);

    const pending = works.filter(o => pct(sector,getGestion(o,sector)) < 100).length;
    const ready = works.filter(o => pct(sector,getGestion(o,sector)) === 100).length;
    const alerts = works.reduce((n,o)=>n+alertsFor(o,sector).length,0);
    const avg = works.length ? Math.round(works.reduce((s,o)=>s+pct(sector,getGestion(o,sector)),0)/works.length) : 0;
    const withSheet = works.filter(o => getGestion(o,sector).sheetUrl).length;

    const cards = filtered.map(o => {
      const d=getGestion(o,sector), p=pct(sector,d), a=alertsFor(o,sector);
      return `<div class="v31-card" onclick="openSectorFichaV31('${o.id}','${sector}')">
        <div class="v31-card-head"><div><div class="v31-title">OT ${esc(o.ot||'—')} · ${esc(o.cliente||'')}</div><div class="v31-meta">${esc(o.desc||'')}</div></div><span class="v31-pill ${a.length?'red':p===100?'green':''}">${a.length?a.length+' alertas':p===100?'Lista':p+'%'}</span></div>
        <div class="v31-progress"><span style="width:${p}%"></span></div>
        <div class="v31-meta">${sector==='Producción'?'Inicio: '+esc(d.fechaInicioPlan||'sin fecha'):'Colocación: '+esc(d.fechaPlan||o.fcol_c||'sin fecha')}</div>
        ${driveButtons(o,sector)}
      </div>`;
    }).join('');

    const alertList = works.flatMap(o => alertsFor(o,sector).slice(0,2).map(a=>({o,a}))).slice(0,8)
      .map(x=>`<div class="v31-alert ${x.a.includes('venció')||x.a.includes('requiere')?'red':''}"><b>OT ${esc(x.o.ot||'—')}</b><br>${esc(x.a)}</div>`).join('');

    page.innerHTML = `<div class="v31-wrap">
      <div class="v31-head"><div><h2>${sector}</h2><div class="v31-sub">Gestión por OT, documentos y sincronización con Drive.</div></div><button class="btn btn-primary" onclick="openSectorFichaV31('${filtered[0]?.id||''}','${sector}')">Abrir primera OT</button></div>
      <div class="v31-kpis">
        <div class="v31-kpi" style="--c:var(--amber)"><label>Pendientes</label><b>${pending}</b><small>Requieren gestión</small></div>
        <div class="v31-kpi" style="--c:var(--green)"><label>Listas</label><b>${ready}</b><small>Checklist completo</small></div>
        <div class="v31-kpi" style="--c:var(--red)"><label>Alertas</label><b>${alerts}</b><small>Datos o desvíos</small></div>
        <div class="v31-kpi" style="--c:var(--blue)"><label>Preparación promedio</label><b>${avg}%</b><small>Obras visibles</small></div>
        <div class="v31-kpi" style="--c:var(--purple)"><label>Hojas sincronizadas</label><b>${withSheet}</b><small>Google Sheets del sector</small></div>
      </div>
      <div class="v31-grid">
        <section class="v31-panel">
          <div class="v31-toolbar"><div><input placeholder="Buscar OT, cliente o trabajo" value="${esc(window[`v31Search${sector}`]||'')}" oninput="window['v31Search${sector}']=this.value;renderSectorV31('${sector}')"> <select onchange="window['v31Status${sector}']=this.value;renderSectorV31('${sector}')"><option value="todas" ${status==='todas'?'selected':''}>Todas</option><option value="pendientes" ${status==='pendientes'?'selected':''}>Pendientes</option><option value="listas" ${status==='listas'?'selected':''}>Listas</option><option value="alertas" ${status==='alertas'?'selected':''}>Con alertas</option></select></div><span class="v31-sub">${filtered.length} obras</span></div>
          <div class="v31-list">${cards||'<div class="empty">No hay obras para este filtro.</div>'}</div>
        </section>
        <aside class="v31-panel"><div class="v31-head" style="margin:0"><div><b>🧠 Clemen ${sector}</b><div class="v31-sub">Ayudamemorias automáticos</div></div></div>${alertList||'<div class="v31-alert">No hay alertas abiertas.</div>'}</aside>
      </div>
    </div>`;
  }
  window.renderSectorV31 = renderSector;

  function modal() {
    let root = document.getElementById('v31-modal-root');
    if (root) return root;
    root = document.createElement('div');
    root.id='v31-modal-root';root.className='v31-modal-bg';
    root.innerHTML=`<div class="v31-modal"><div class="v31-modal-head"><div><h2 id="v31-modal-title" style="margin:0"></h2><div id="v31-modal-sub" class="v31-sub"></div></div><button class="v31-icon" onclick="closeSectorFichaV31()">✕</button></div>
      <div class="v31-tabs"><button class="v31-tab active" data-v31tab="general">Información</button><button class="v31-tab" data-v31tab="plan">Planeamiento</button><button class="v31-tab" data-v31tab="checks">Checklist</button><button class="v31-tab" data-v31tab="materials">Materiales</button><button class="v31-tab" data-v31tab="notes">🧠 Clemen</button><button class="v31-tab" data-v31tab="docs">Documentación</button></div>
      <div id="v31-content"></div><div style="display:flex;justify-content:flex-end;gap:7px;margin-top:13px"><button class="btn btn-ghost" onclick="closeSectorFichaV31()">Cancelar</button><button class="btn btn-primary" onclick="saveSectorFichaV31()">Guardar y sincronizar</button></div></div>`;
    document.body.appendChild(root);
    root.querySelectorAll('.v31-tab').forEach(b=>b.addEventListener('click',()=>{
      root.querySelectorAll('.v31-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');
      root.dataset.tab=b.dataset.v31tab;drawTab();
    }));
    return root;
  }

  function val(id){return document.getElementById(id)?.value || ''}
  function current() {
    const root=modal(), o=(window.DB?.obras||[]).find(x=>x.id===root.dataset.obraId);
    return {root,o,sector:root.dataset.sector,key:sectorKey(root.dataset.sector),data:getGestion(o,root.dataset.sector)};
  }

  window.openSectorFichaV31 = (id,sector) => {
    if (!id) return toast('No hay una OT disponible.');
    const root=modal(),o=(window.DB?.obras||[]).find(x=>x.id===id);if(!o)return;
    root.dataset.obraId=id;root.dataset.sector=sector;root.dataset.tab='general';
    root.querySelectorAll('.v31-tab').forEach((b,i)=>b.classList.toggle('active',i===0));
    document.getElementById('v31-modal-title').textContent=`OT ${o.ot||'—'} · ${o.cliente||''}`;
    document.getElementById('v31-modal-sub').textContent=`Ficha de ${sector} · Los datos se guardan en ERP y Drive`;
    root.classList.add('show');drawTab();
  };
  window.closeSectorFichaV31=()=>modal().classList.remove('show');

  function drawTab() {
    const {root,o,sector,key,data}=current();if(!o)return;
    const tab=root.dataset.tab||'general', c=document.getElementById('v31-content');
    const log=o.entregaLogistica||{}, modalidades={a_definir:'A definir',retiro_fabrica:'Retira en fábrica',envio:'Envío a domicilio',colocacion:'Con colocación'};
    const compartida=`<div class="v31-panel" style="margin-bottom:10px;border-left:3px solid ${sector==='Colocaciones'?'var(--teal)':'var(--blue)'}"><b>Información compartida de la OT</b><div class="v31-form" style="margin-top:8px"><div><span class="v31-sub">Modalidad</span><br><b>${esc(modalidades[log.tipo]||'A definir')}</b></div><div><span class="v31-sub">Fecha prevista</span><br><b>${esc(log.fecha||'Sin definir')}</b></div>${log.domicilio?`<div><span class="v31-sub">Domicilio</span><br><b>${esc(log.domicilio)}</b></div>`:''}${log.contacto?`<div><span class="v31-sub">Contacto</span><br><b>${esc(log.contacto)}</b></div>`:''}${log.retira?`<div><span class="v31-sub">Retira</span><br><b>${esc(log.retira)}</b></div>`:''}${log.detalle?`<div class="v31-field full"><span class="v31-sub">Indicaciones</span><div>${esc(log.detalle)}</div></div>`:''}</div></div>`;
    if(tab==='general') c.innerHTML=compartida+`<div class="v31-form">
      <div class="v31-field"><label>OT</label><input value="${esc(o.ot||'')}" disabled></div><div class="v31-field"><label>Cliente</label><input value="${esc(o.cliente||'')}" disabled></div><div class="v31-field"><label>Trabajo</label><input value="${esc(o.desc||'')}" disabled></div>
      <div class="v31-field"><label>Responsable</label><input id="v31-responsable" value="${esc(data.responsable||'')}"></div><div class="v31-field"><label>Prioridad</label><select id="v31-prioridad"><option ${data.prioridad==='Normal'?'selected':''}>Normal</option><option ${data.prioridad==='Alta'?'selected':''}>Alta</option><option ${data.prioridad==='Crítica'?'selected':''}>Crítica</option></select></div><div class="v31-field"><label>Estado interno</label><select id="v31-estado"><option ${data.estadoInterno==='Pendiente'?'selected':''}>Pendiente</option><option ${data.estadoInterno==='En preparación'?'selected':''}>En preparación</option><option ${data.estadoInterno==='Lista'?'selected':''}>Lista</option><option ${data.estadoInterno==='Finalizada'?'selected':''}>Finalizada</option></select></div>
      ${sector==='Colocaciones'?`<div class="v31-field"><label>Dirección</label><input id="v31-direccion" value="${esc(data.direccion||o.direccion||'')}"></div><div class="v31-field"><label>Contacto</label><input id="v31-contacto" value="${esc(data.contacto||o.contacto||'')}"></div><div class="v31-field"><label>Teléfono</label><input id="v31-telefono" value="${esc(data.telefono||'')}"></div><div class="v31-field"><label>Altura (m)</label><input id="v31-altura" type="number" step=".1" value="${esc(data.altura||'')}"></div><div class="v31-field"><label>Tipo de superficie</label><input id="v31-superficie" value="${esc(data.superficie||'')}"></div><div class="v31-field"><label>Interior / exterior</label><select id="v31-ambiente"><option ${data.ambiente==='Exterior'?'selected':''}>Exterior</option><option ${data.ambiente==='Interior'?'selected':''}>Interior</option></select></div>`:''}
      <div class="v31-field full"><label>Observaciones operativas</label><textarea id="v31-observaciones" rows="4">${esc(data.observaciones||'')}</textarea></div></div>`;
    if(tab==='plan') c.innerHTML=`<div class="v31-form">
      <div class="v31-field"><label>${sector==='Producción'?'Inicio previsto':'Fecha de colocación'}</label><input id="v31-fecha-inicio" type="date" value="${esc(sector==='Producción'?data.fechaInicioPlan:data.fechaPlan||'')}"></div>
      <div class="v31-field"><label>${sector==='Producción'?'Finalización prevista':'Hora prevista'}</label><input id="v31-fecha-fin" ${sector==='Producción'?'type="date"':'type="time"'} value="${esc(sector==='Producción'?data.fechaFinPlan:data.horaPlan||'')}"></div>
      <div class="v31-field"><label>Personal previsto</label><input id="v31-personal" type="number" value="${esc(data.personal||'')}"></div>
      <div class="v31-field"><label>Horas planificadas</label><input id="v31-horas-plan" type="number" step=".5" value="${esc(data.horasPlan||'')}"></div>
      <div class="v31-field"><label>Horas reales</label><input id="v31-horas-real" type="number" step=".5" value="${esc(data.horasReal||'')}"></div>
      <div class="v31-field"><label>Motivo de desvío</label><select id="v31-desvio"><option></option><option ${data.motivoDesvio==='Compras'?'selected':''}>Compras</option><option ${data.motivoDesvio==='Diseño'?'selected':''}>Diseño</option><option ${data.motivoDesvio==='Producción'?'selected':''}>Producción</option><option ${data.motivoDesvio==='Cliente'?'selected':''}>Cliente</option><option ${data.motivoDesvio==='Proveedor'?'selected':''}>Proveedor</option><option ${data.motivoDesvio==='Otro'?'selected':''}>Otro</option></select></div>
      ${sector==='Colocaciones'?`<div class="v31-field full"><label>Recursos</label><div class="v31-checks">${['Escalera','Andamio','Hidrogrúa','Elevador','Generador','Taladro','Soldadora','Extensiones','Elementos de seguridad'].map(r=>`<label class="v31-check"><input class="v31-resource" type="checkbox" value="${r}" ${(data.recursos||[]).includes(r)?'checked':''}>${r}</label>`).join('')}</div></div>`:''}
    </div>`;
    if(tab==='checks') c.innerHTML=`<div class="v31-checks">${(CHECKS[key]||[]).map(([k,l])=>`<label class="v31-check ${(data.checks||{})[k]?'done':''}"><input class="v31-check-input" type="checkbox" data-key="${k}" ${(data.checks||{})[k]?'checked':''}>${l}</label>`).join('')}</div>`;
    if(tab==='materials') {
      const rows=(data.materiales||[]).length?data.materiales:[{articulo:'',cantidad:1,unidad:'UNID'}];
      c.innerHTML=`<div id="v31-material-list">${rows.map(materialHTML).join('')}</div><button class="btn btn-ghost" onclick="addMaterialV31()">＋ Agregar material</button><div class="v31-sub" style="margin-top:8px">Seleccionar materiales específicos de la OT. No cargar consumibles generales.</div>`;
    }
    if(tab==='notes') c.innerHTML=`<div class="v31-panel"><div id="v31-generated-alerts">${alertsFor(o,sector).map(a=>`<div class="v31-alert">${esc(a)}</div>`).join('')||'<div class="v31-alert">No hay ayudamemorias automáticos pendientes.</div>'}</div><div class="v31-field full" style="margin-top:9px"><label>Ayudamemoria / nota natural</label><textarea id="v31-ayudamemoria" rows="4">${esc(data.ayudamemoria||'')}</textarea></div><div class="v31-sub">Ejemplo: “Confirmar color con Pablo antes de pintar”.</div></div>`;
    if(tab==='docs') c.innerHTML=`<div class="v31-docs">${o.driveFolderUrl?`<button class="v31-doc" onclick="window.open('${esc(o.driveFolderUrl)}','_blank')">📁 Abrir carpeta OT</button>`:''}${data.sheetUrl?`<button class="v31-doc" onclick="window.open('${esc(data.sheetUrl)}','_blank')">📄 Abrir Google Sheet</button>`:'<button class="v31-doc" onclick="saveSectorFichaV31()">📄 Generar Google Sheet</button>'}</div><div class="v31-sub" style="margin-top:9px">La OT mantiene una única hoja operativa en la carpeta del sector. No se genera PDF.</div>`;
    c.querySelectorAll('.v31-check-input,.v31-resource').forEach(x=>x.addEventListener('change',()=>x.closest('.v31-check')?.classList.toggle('done',x.checked)));
  }

  function materialHTML(m={}) {
    return `<div class="v31-material"><select class="v31-mat-art"><option value="">Seleccionar material…</option>${MATERIAL_OPTIONS.map(x=>`<option ${m.articulo===x?'selected':''}>${x}</option>`).join('')}</select><input class="v31-mat-qty" type="number" step=".01" value="${esc(m.cantidad||1)}"><select class="v31-mat-unit"><option ${m.unidad==='UNID'?'selected':''}>UNID</option><option ${m.unidad==='MTS'?'selected':''}>MTS</option><option ${m.unidad==='M2'?'selected':''}>M2</option><option ${m.unidad==='PLACA'?'selected':''}>PLACA</option><option ${m.unidad==='TUBO'?'selected':''}>TUBO</option></select><button class="v31-icon" onclick="this.parentElement.remove()">×</button></div>`;
  }
  window.addMaterialV31=()=>document.getElementById('v31-material-list')?.insertAdjacentHTML('beforeend',materialHTML());

  function collectVisible(data, sector) {
    const q=(sel)=>document.querySelector(sel);
    if(q('#v31-responsable')) data.responsable=val('v31-responsable');
    if(q('#v31-prioridad')) data.prioridad=val('v31-prioridad');
    if(q('#v31-estado')) data.estadoInterno=val('v31-estado');
    if(q('#v31-observaciones')) data.observaciones=val('v31-observaciones');
    if(q('#v31-direccion')) data.direccion=val('v31-direccion');
    if(q('#v31-contacto')) data.contacto=val('v31-contacto');
    if(q('#v31-telefono')) data.telefono=val('v31-telefono');
    if(q('#v31-altura')) data.altura=val('v31-altura');
    if(q('#v31-superficie')) data.superficie=val('v31-superficie');
    if(q('#v31-ambiente')) data.ambiente=val('v31-ambiente');
    if(q('#v31-fecha-inicio')) sector==='Producción'?data.fechaInicioPlan=val('v31-fecha-inicio'):data.fechaPlan=val('v31-fecha-inicio');
    if(q('#v31-fecha-fin')) sector==='Producción'?data.fechaFinPlan=val('v31-fecha-fin'):data.horaPlan=val('v31-fecha-fin');
    if(q('#v31-personal')) data.personal=val('v31-personal');
    if(q('#v31-horas-plan')) data.horasPlan=val('v31-horas-plan');
    if(q('#v31-horas-real')) data.horasReal=val('v31-horas-real');
    if(q('#v31-desvio')) data.motivoDesvio=val('v31-desvio');
    if(q('#v31-ayudamemoria')) data.ayudamemoria=val('v31-ayudamemoria');
    if(document.querySelectorAll('.v31-check-input').length) {
      data.checks={};document.querySelectorAll('.v31-check-input').forEach(x=>data.checks[x.dataset.key]=x.checked);
    }
    if(document.querySelectorAll('.v31-resource').length) data.recursos=[...document.querySelectorAll('.v31-resource:checked')].map(x=>x.value);
    if(document.querySelectorAll('.v31-material').length) data.materiales=[...document.querySelectorAll('.v31-material')].map(r=>({articulo:r.querySelector('.v31-mat-art')?.value||'',cantidad:Number(r.querySelector('.v31-mat-qty')?.value||0),unidad:r.querySelector('.v31-mat-unit')?.value||'UNID'})).filter(x=>x.articulo);
    return data;
  }

  async function callWebhook(payload) {
    return new Promise((resolve,reject)=>{
      const callback='__tizSectorV31_'+Date.now()+'_'+Math.random().toString(36).slice(2),script=document.createElement('script');
      let done=false;const finish=(err,val)=>{if(done)return;done=true;clearTimeout(timer);window[callback]=()=>{};setTimeout(()=>{try{delete window[callback]}catch(_){}},300000);script.remove();err?reject(err):resolve(val)};
      const timer=setTimeout(()=>finish(new Error('Apps Script no respondió en 120 segundos')),120000);
      window[callback]=result=>result?.ok?finish(null,result):finish(new Error(result?.error||'Apps Script devolvió un error'));
      script.onerror=()=>finish(new Error('No se pudo conectar con Apps Script'));
      script.src=WEBHOOK+'?'+new URLSearchParams({callback,payload:JSON.stringify(payload),_t:String(Date.now())});document.head.appendChild(script);
    });
  }

  window.syncProductionOtDocumentV315=async function(o){
    if(!o?.id&&!o?.firestoreId)throw new Error('Falta identificar la OT');
    const old=getGestion(o,'Producción'), data={...productionDataWithQuote(o,old),estadoInterno:old.estadoInterno||'Pendiente',checks:old.checks||{},porcentaje:pct('Producción',old),actualizadoPor:old.actualizadoPor||'Sincronización automática',actualizadoEn:new Date().toISOString()};
    const result=await callWebhook({action:'syncSectorDocument',obra:{firestoreId:o.id||o.firestoreId,ot:o.ot,cliente:o.cliente,desc:o.desc,estado:o.estado,driveFolderId:o.driveFolderId||'',driveFolderUrl:o.driveFolderUrl||'',sector:'Producción',data:{...productionSheetPayload(data),entregaLogistica:o.entregaLogistica||{}}}});
    data.sheetUrl=result.sheetUrl||data.sheetUrl||'';data.sheetId=result.sheetId||data.sheetId||'';data.cotizacionTecnicaSincronizada=true;
    const patch={gestionSectores:{...(o.gestionSectores||{}),produccion:data}};
    if(result.driveFolderUrl){patch.driveFolderUrl=result.driveFolderUrl;patch.driveFolderId=result.driveFolderId||result.folderId||'';}
    await window.updateDoc_('obras',o.id||o.firestoreId,patch);Object.assign(o,patch);return result;
  };

  window.saveSectorFichaV31 = async () => {
    const {root,o,sector,key,data:old}=current();if(!o)return;
    const data=collectVisible(JSON.parse(JSON.stringify(old||{})),sector);
    data.actualizadoPor=window.currentUser?.email||'';data.actualizadoEn=new Date().toISOString();data.porcentaje=pct(sector,data);
    const gestion={...(o.gestionSectores||{}),[key]:data};
    try {
      await window.updateDoc_('obras',o.id,{gestionSectores:gestion});
      Object.assign(o,{gestionSectores:gestion});
      toast('Guardado en ERP ✓ Sincronizando Google Sheet…');
      const result=await callWebhook({action:'syncSectorDocument',obra:{firestoreId:o.id,ot:o.ot,cliente:o.cliente,desc:o.desc,estado:o.estado,driveFolderId:o.driveFolderId||'',driveFolderUrl:o.driveFolderUrl||'',sector,data}});
      data.sheetUrl=result.sheetUrl||data.sheetUrl||'';data.sheetId=result.sheetId||data.sheetId||'';delete data.pdfUrl;delete data.pdfId;
      const gestion2={...(o.gestionSectores||{}),[key]:data};
      const links={gestionSectores:gestion2};
      if(result.driveFolderUrl&&!o.driveFolderUrl){links.driveFolderUrl=result.driveFolderUrl;links.driveFolderId=result.driveFolderId||result.folderId||''}
      await window.updateDoc_('obras',o.id,links);Object.assign(o,links);
      toast('Guardado en ERP ✓ Google Sheet actualizada ✓');
      root.classList.remove('show');renderSector(sector);
    } catch(err) {
      console.error('[V31 sector save]',err);
      toast('La ficha se guardó o intentó guardar, pero hubo un error: '+(err.message||err));
    }
  };

  const autoSyncState = { running:false, attempted:new Set(), timer:null };

  function productionDataWithQuote(o,old={}) {
    const source=(Array.isArray(o.itemsTecnicos)&&o.itemsTecnicos.length?o.itemsTecnicos:(o.itemsCotizados||[]));
    const materiales=source.map(item=>({
      articulo:String(item?.articulo||item?.desc||item?.descripcion||'').trim(),
      cantidad:Number(item?.cantidad||item?.cant||1)||1,
      unidad:String(item?.unidad||'UNID').trim()||'UNID',
      observaciones:String(item?.observaciones||item?.detalle||'').trim()
    })).filter(item=>item.articulo);
    const quoteNotes=materiales.map((item,i)=>`${i+1}. ${item.articulo} — Cantidad: ${item.cantidad} ${item.unidad}${item.observaciones?' — '+item.observaciones:''}`).join('\n');
    return {
      ...old,
      materiales: materiales.length?materiales:(old.materiales||[]),
      observaciones: old.observaciones || quoteNotes,
      detalleCotizacion: materiales,
      datosCotizacionSinPrecios: true
    };
  }
  window.productionDataWithQuoteV311=productionDataWithQuote;

  function productionSheetPayload(data={}) {
    return {
      estadoInterno:String(data.estadoInterno||'Pendiente'),
      prioridad:String(data.prioridad||'Normal'),
      responsable:String(data.responsable||''),
      observaciones:String(data.observaciones||''),
      fechaInicioPlan:String(data.fechaInicioPlan||''),
      fechaFinPlan:String(data.fechaFinPlan||''),
      personal:String(data.personal||''),
      horasPlan:String(data.horasPlan||''),
      horasReal:String(data.horasReal||''),
      motivoDesvio:String(data.motivoDesvio||''),
      checks:{...(data.checks||{})},
      ayudamemoria:String(data.ayudamemoria||''),
      materiales:(data.materiales||[]).map(item=>({
        articulo:String(item?.articulo||''),
        cantidad:Number(item?.cantidad||0),
        unidad:String(item?.unidad||'UNID'),
        observaciones:String(item?.observaciones||'')
      })).filter(item=>item.articulo),
      porcentaje:Number(data.porcentaje||0),
      actualizadoPor:String(data.actualizadoPor||'Sincronización automática'),
      actualizadoEn:String(data.actualizadoEn||new Date().toISOString())
    };
  }

  async function autoSyncProductionDocuments() {
    if (autoSyncState.running || !window.DB?.obras?.length || typeof window.updateDoc_ !== 'function') return;
    const candidates = approvedWorks()
      .filter(o => ['aprobado','en producción'].includes(norm(o.estado)))
      .filter(o => !getGestion(o,'Producción').sheetUrl || !getGestion(o,'Producción').cotizacionTecnicaSincronizada)
      .filter(o => !autoSyncState.attempted.has(o.id))
      .slice(0,1);
    if (!candidates.length) return;

    autoSyncState.running = true;
    try {
      for (const o of candidates) {
        autoSyncState.attempted.add(o.id);
        const old = getGestion(o,'Producción');
        const data = {
          ...productionDataWithQuote(o,old),
          estadoInterno: old.estadoInterno || 'Pendiente',
          checks: old.checks || {},
          materiales: old.materiales || [],
          porcentaje: pct('Producción', old),
          actualizadoPor: old.actualizadoPor || 'Sincronización automática',
          actualizadoEn: new Date().toISOString()
        };
        try {
          const result = await callWebhook({action:'syncSectorDocument',obra:{
            firestoreId:o.id, ot:o.ot, cliente:o.cliente, desc:o.desc, estado:o.estado,
            driveFolderId:o.driveFolderId||'', driveFolderUrl:o.driveFolderUrl||'',
            sector:'Producción', data:productionSheetPayload(data)
          }});
          data.sheetUrl=result.sheetUrl||''; data.sheetId=result.sheetId||'';
          delete data.pdfUrl; delete data.pdfId;
          data.cotizacionTecnicaSincronizada=true;
          const gestionSectores={...(o.gestionSectores||{}),produccion:data};
          const patch={gestionSectores};
          if(result.driveFolderUrl){patch.driveFolderUrl=result.driveFolderUrl;patch.driveFolderId=result.driveFolderId||result.folderId||'';}
          await window.updateDoc_('obras',o.id,patch);
          Object.assign(o,patch);
          console.info('[V31.1] Producción sincronizada automáticamente',o.ot);
        } catch(err) {
          autoSyncState.attempted.delete(o.id);
          console.warn('[V31.1] No se pudo sincronizar automáticamente OT '+(o.ot||''),err);
        }
      }
    } finally {
      autoSyncState.running=false;
      if(window.currentPage==='produccion') renderSector('Producción');
    }
  }

  function scheduleAutoSync() {
    clearTimeout(autoSyncState.timer);
    autoSyncState.timer=setTimeout(autoSyncProductionDocuments,1800);
  }

  function install() {
    style();modal();
    const previous=window.refreshCurrent;
    window.refreshCurrent=function(){
      if(typeof previous==='function')previous.apply(this,arguments);
      setTimeout(()=>{
        if(window.currentPage==='produccion' && !window.__TIZ_PRODUCCION_V34__)renderSector('Producción');
        if(window.currentPage==='colocaciones')renderSector('Colocaciones');
        scheduleAutoSync();
      },0);
    };
    if(window.currentPage==='produccion' && !window.__TIZ_PRODUCCION_V34__)renderSector('Producción');
    if(window.currentPage==='colocaciones')renderSector('Colocaciones');
    scheduleAutoSync();
    window.requestDriveSyncForObra=async function(id,event){if(event)event.stopPropagation();const o=(window.DB?.obras||[]).find(x=>x.id===id);if(!o)return toast('No se encontró la obra');try{toast('Creando o recuperando la hoja de Producción…');const r=await window.syncProductionOtDocumentV315(o);toast('Carpeta OT y hoja de Producción listas ✓');return r}catch(e){console.error(e);toast('No se pudo sincronizar la OT: '+(e.message||e));return null}};
    setInterval(()=>{
      autoSyncProductionDocuments();
      if(window.currentPage==='produccion'){
        if(!window.__TIZ_PRODUCCION_V34__) renderSector('Producción');
      }
      if(window.currentPage==='colocaciones')renderSector('Colocaciones');
    },45000);
    console.info('[CLEMEN ERP V31.2] Hotfix sincronización Drive cargado',VERSION);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,500));
  else setTimeout(install,500);
})();
