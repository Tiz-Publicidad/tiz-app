// ============================================================
// TIZ V35.2 — CARPETAS COTIZACIÓN + OT + FUENTE ÚNICA
// 17/08/2026
// Cada dato operativo tiene un único dueño. Obras sólo consolida.
// ============================================================
(function(){
  const SECTOR_DEF = {
    ventas:{label:'Ventas',icon:'💰',color:'var(--amber)'},
    diseno:{label:'Diseño',icon:'✏️',color:'var(--purple)'},
    compras:{label:'Compras',icon:'🛒',color:'var(--accent)'},
    produccion:{label:'Producción',icon:'📦',color:'var(--blue)'},
    colocaciones:{label:'Colocaciones',icon:'🚛',color:'var(--teal)'},
    facturacion:{label:'Facturación',icon:'🧾',color:'var(--amber)'},
    cobranzas:{label:'Cobranzas',icon:'💵',color:'var(--green)'}
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const val = id => document.getElementById(id)?.value ?? '';
  const checked = id => !!document.getElementById(id)?.checked;
  const fmt = n => (window.fmtM ? window.fmtM(+n||0) : '$'+(+n||0).toLocaleString('es-AR'));

  function normEstado(v){
    v=String(v||'').trim();
    if(!v) return 'Pendiente';
    return v;
  }
  function estadoClass(e){
    e=String(e||'').toLowerCase();
    if(/termin|aprob|complet|cobrado|facturado|instalad/.test(e)) return 'ok';
    if(/proceso|espera|coordin|parcial/.test(e)) return 'warn';
    if(/venc|atras|bloq|rechaz/.test(e)) return 'danger';
    return 'pending';
  }

  function legacySectores(o={}){
    const n=o.notas_sector||{}, c=o.checklist||{};
    return {
      ventas:{ estado: c.clienteConfirmado ? 'Confirmado' : (o.estado==='Aprobado'?'Aprobado':'Pendiente'), clienteConfirmado:!!c.clienteConfirmado, ocRecibida:!!c.ocCargada, senaRecibida:!!c.senaRecibida, notas:n.Ventas||'' },
      diseno:{ estado:c.disenoAprobado?'Aprobado':'Pendiente', aprobado:!!c.disenoAprobado, notas:n['Diseño']||'' },
      compras:{ estado:c.materialesCompletos?'Completo':'Pendiente', materialesCompletos:!!c.materialesCompletos, notas:n.Compras||'' },
      produccion:{ estado:(c.produccionTerminada||o.fprod_r)?'Terminada':(o.fprod_c?'En proceso':'Pendiente'), compromiso:o.fprod_c||'', real:o.fprod_r||'', terminada:!!c.produccionTerminada||!!o.fprod_r, notas:n['Producción']||'' },
      colocaciones:{ estado:o.fcol_r?'Instalada':(c.colocacionCoordinada?'Coordinada':'Pendiente'), compromiso:o.fcol_c||'', real:o.fcol_r||'', coordinada:!!c.colocacionCoordinada, instalada:!!o.fcol_r, fotosFinales:!!c.fotosFinales, notas:n.Colocaciones||'' },
      facturacion:{ estado:(c.facturado||o.nrfc)?'Facturado':'Pendiente', oc:o.oc||'', nroFactura:o.nrfc||'', fechaFactura:o.ffc||'', diasPago:+o.diasPago||0, facturado:!!c.facturado||!!o.nrfc, notas:'' },
      cobranzas:{ estado:(c.cobrado||o.cobr==='Cobrado')?'Cobrado':(c.senaRecibida?'Seña recibida':'Pendiente'), senaRecibida:!!c.senaRecibida, cobrado:!!c.cobrado||o.cobr==='Cobrado', notas:'' }
    };
  }
  // V35: el bloque sectores es la fuente de verdad. Los campos viejos sólo son fallback
  // para obras históricas que todavía no fueron tocadas por su sector.
  function getSectores(o={}){
    const legacy=legacySectores(o), canon=o.sectores||{}, out={};
    Object.keys(SECTOR_DEF).forEach(k=>{ out[k]={...(legacy[k]||{}), ...(canon[k]||{})}; });
    return out;
  }
  window.getSectoresV35=getSectores;

  // Proyecta datos canónicos sobre aliases históricos EN MEMORIA. De esta forma todas
  // las pantallas antiguas leen el mismo dato sin duplicar escrituras en Firestore.
  function projectCanonicalToLegacy(o){
    if(!o) return o;
    const s=getSectores(o);
    const p=s.produccion||{}, c=s.colocaciones||{}, f=s.facturacion||{}, co=s.cobranzas||{}, v=s.ventas||{}, d=s.diseno||{}, cp=s.compras||{};
    if(o.sectores?.produccion){ o.fprod_c=p.compromiso||''; o.fprod_r=p.real||''; }
    if(o.sectores?.colocaciones){ o.fcol_c=c.compromiso||''; o.fcol_r=c.real||''; }
    if(o.sectores?.facturacion){ o.oc=f.oc||''; o.nrfc=f.nroFactura||''; o.ffc=f.fechaFactura||''; o.diasPago=+f.diasPago||0; }
    if(o.sectores?.cobranzas){ o.cobr=co.cobrado?'Cobrado':(co.estado||o.cobr||''); }
    o.checklist={...(o.checklist||{})};
    if(o.sectores?.ventas){ o.checklist.clienteConfirmado=!!v.clienteConfirmado; o.checklist.ocCargada=!!v.ocRecibida || !!f.oc; o.checklist.senaRecibida=!!v.senaRecibida || !!co.senaRecibida; }
    if(o.sectores?.diseno) o.checklist.disenoAprobado=!!d.aprobado;
    if(o.sectores?.compras) o.checklist.materialesCompletos=!!cp.materialesCompletos;
    if(o.sectores?.produccion) o.checklist.produccionTerminada=!!p.terminada;
    if(o.sectores?.colocaciones){ o.checklist.colocacionCoordinada=!!c.coordinada; o.checklist.fotosFinales=!!c.fotosFinales; }
    if(o.sectores?.facturacion) o.checklist.facturado=!!f.facturado;
    if(o.sectores?.cobranzas) o.checklist.cobrado=!!co.cobrado;
    return o;
  }
  function normalizeDBV35(){ (window.DB?.obras||[]).forEach(projectCanonicalToLegacy); }
  window.normalizeDBV35=normalizeDBV35;

  // Protección de escrituras heredadas: si un sector ya existe, una pantalla vieja no
  // puede pisar sus datos. Para obras sin sector canónico, los valores viejos se migran
  // de forma perezosa al primer guardado.
  function installSingleSourceGuard(){
    if(window.__v35SingleSourceGuard || !window.updateDoc_ || !window.addDoc_) return;
    window.__v35SingleSourceGuard=true;
    const rawUpdate=window.updateDoc_, rawAdd=window.addDoc_;
    window.__updateDocV35Raw=rawUpdate; window.__addDocV35Raw=rawAdd;

    const hasOwn=(x,k)=>Object.prototype.hasOwnProperty.call(x||{},k);
    function prepareObraPatch(id,data={}){
      const out={...data}, current=(window.DB?.obras||[]).find(x=>x.id===id)||{};
      const canon=current.sectores||{};
      const map=[
        ['fprod_c','produccion','compromiso'],['fprod_r','produccion','real'],
        ['fcol_c','colocaciones','compromiso'],['fcol_r','colocaciones','real'],
        ['oc','facturacion','oc'],['nrfc','facturacion','nroFactura'],['ffc','facturacion','fechaFactura'],['diasPago','facturacion','diasPago']
      ];
      for(const [legacy,sector,field] of map){
        if(!hasOwn(out,legacy)) continue;
        if(canon[sector]) delete out[legacy];
        else if(out[legacy]!=='' && out[legacy]!==null && out[legacy]!==undefined){ out[`sectores.${sector}.${field}`]=out[legacy]; delete out[legacy]; }
      }
      if(hasOwn(out,'checklist')){
        const ch=out.checklist||{};
        const cm=[['clienteConfirmado','ventas','clienteConfirmado'],['ocCargada','ventas','ocRecibida'],['senaRecibida','cobranzas','senaRecibida'],['disenoAprobado','diseno','aprobado'],['materialesCompletos','compras','materialesCompletos'],['produccionTerminada','produccion','terminada'],['colocacionCoordinada','colocaciones','coordinada'],['fotosFinales','colocaciones','fotosFinales'],['facturado','facturacion','facturado'],['cobrado','cobranzas','cobrado']];
        for(const [legacy,sector,field] of cm){ if(!canon[sector] && ch[legacy]===true) out[`sectores.${sector}.${field}`]=true; }
        delete out.checklist; // nunca volver a escribir checklist general desde formularios antiguos
      }
      if(hasOwn(out,'notas_sector')) delete out.notas_sector;
      return out;
    }
    function seedNewObra(data={}){
      const out={...data}, legacy=legacySectores(data);
      out.sectores={...(data.sectores||{})};
      for(const k of Object.keys(SECTOR_DEF)){ if(!out.sectores[k]) out.sectores[k]=legacy[k]; }
      out.modeloDatos=35;
      return out;
    }
    window.updateDoc_=async function(col,id,data){
      if(col!=='obras') return rawUpdate(col,id,data);
      const hasCanonical=Object.keys(data||{}).some(k=>k==='sectores'||k.startsWith('sectores.'));
      const patch=hasCanonical ? data : prepareObraPatch(id,data);
      if(!Object.keys(patch||{}).length) return;
      return rawUpdate(col,id,patch);
    };
    window.addDoc_=async function(col,data){ return rawAdd(col, col==='obras'?seedNewObra(data):data); };
  }


  function injectCSS(){
    const st=document.createElement('style'); st.id='sectorizacion-v35-css';
    st.textContent=`
      .sector-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:8px}
      .sector-summary-card{background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;min-height:118px;cursor:pointer;transition:.15s}
      .sector-summary-card:hover{border-color:var(--border2);transform:translateY(-1px)}
      .sector-summary-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
      .sector-state{font-size:10px;font-weight:600;border-radius:99px;padding:3px 7px;border:1px solid var(--border2);white-space:nowrap}
      .sector-state.ok{color:var(--green);background:rgba(76,175,125,.08)} .sector-state.warn{color:var(--amber);background:rgba(232,160,32,.08)} .sector-state.danger{color:var(--red);background:rgba(220,70,70,.08)} .sector-state.pending{color:var(--text3)}
      .sector-meta{font-size:10.5px;color:var(--text3);line-height:1.55}.sector-meta strong{color:var(--text2);font-weight:500}
      .obra-sector-strip{display:flex;gap:5px;flex-wrap:wrap}.obra-sector-pill{font-size:9px;padding:3px 6px;border-radius:99px;border:1px solid var(--border);background:var(--surface2);white-space:nowrap}
      .obra-sector-pill.ok{color:var(--green)}.obra-sector-pill.warn{color:var(--amber)}.obra-sector-pill.danger{color:var(--red)}.obra-sector-pill.pending{color:var(--text3)}
      .commercial-note{background:rgba(232,184,75,.06);border:1px solid rgba(232,184,75,.22);border-radius:9px;padding:10px 12px;font-size:11px;color:var(--text2);margin-bottom:12px}
      #modal-sector .modal{max-width:860px;width:calc(100vw - 80px)} #modal-sector .form-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
      #obra-sector-summary-wrap{grid-column:1/-1}
      .v34-hidden{display:none!important}
      @media(max-width:1000px){.sector-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:700px){.sector-summary-grid{grid-template-columns:1fr}#modal-sector .modal{width:calc(100vw - 24px)}#modal-sector .form-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(st);
  }

  function injectSectorModal(){
    if(document.getElementById('modal-sector')) return;
    const d=document.createElement('div'); d.className='modal-overlay'; d.id='modal-sector';
    d.innerHTML=`<div class="modal"><div class="modal-title" id="sector-modal-title">Sector</div><input type="hidden" id="sector-obra-id"><input type="hidden" id="sector-key"><div id="sector-modal-body"></div><div class="modal-actions"><button class="btn btn-ghost" onclick="closeSectorModalV34()">Cancelar</button><button class="btn btn-primary" onclick="saveSectorV34()">Guardar sector</button></div></div>`;
    document.body.appendChild(d);
  }

  function upgradePresupuesto(){
    const grid=document.querySelector('#modal-prespdf .form-grid'); if(!grid || document.getElementById('pp-vendedor')) return;
    const note=document.createElement('div'); note.className='commercial-note'; note.style.gridColumn='1/-1';
    note.innerHTML='<b>Presupuesto comercial.</b> Acá se carga únicamente información de cotización y condiciones comerciales. Producción, Diseño, Compras, Colocaciones, Facturación y Cobranzas se actualizan desde sus sectores.';
    grid.prepend(note);
    const desc=document.getElementById('pp-desc')?.closest('.form-group');
    const wrap=document.createElement('div'); wrap.style.display='contents';
    wrap.innerHTML=`
      <div class="form-group"><label>Vendedor</label><select id="pp-vendedor"><option>G</option><option>J</option><option>G/J</option></select></div>
      <div class="form-group"><label>Fecha presupuesto</label><input id="pp-fecha" placeholder="DD/MM/AAAA"></div>
      <div class="form-group"><label>Estado comercial</label><select id="pp-estado"><option>Borrador</option><option selected>Enviado</option><option>En revisión</option><option>Aprobado</option><option>Rechazado</option><option>Vencido</option></select></div>
      <div class="form-group"><label>Moneda</label><select id="pp-moneda"><option value="ARS">ARS $</option><option value="USD">USD</option></select></div>
      <div class="form-group"><label>Plazo estimado</label><input id="pp-plazo" placeholder="Ej: 15 días hábiles"></div>
      <div class="form-group"><label>Anticipo %</label><input id="pp-anticipo" type="number" min="0" max="100" value="50"></div>
      <div class="form-group"><label>Días de pago</label><input id="pp-dias-pago" type="number" min="0" placeholder="Ej: 30"></div>
      <div class="form-group"><label>OC / OP (si ya existe)</label><input id="pp-oc" placeholder="Opcional"></div>
      <div class="form-group full"><label>Observaciones comerciales internas</label><textarea id="pp-obs-comercial" placeholder="Notas de negociación, alcance, exclusiones, condición especial..."></textarea></div>`;
    grid.insertBefore(wrap, desc || null);
  }

  function cleanObraModal(){
    const modal=document.getElementById('modal-obra'); if(!modal) return;
    // Presupuestos queda exclusivamente comercial. Los campos operativos permanecen en el DOM
    // sólo para compatibilidad con funciones históricas, pero nunca se muestran al usuario.
    const ids=['f-sector','f-estado','f-fprod-c','f-fprod-r','f-fcol-c','f-fcol-r','f-oc','f-nrfc','f-ffc','f-cobr','f-dias-pago','f-comentarios'];
    ids.forEach(id=>document.getElementById(id)?.closest('.form-group')?.classList.add('v34-hidden'));
    [...modal.querySelectorAll('.form-section')].forEach(sec=>{
      const t=sec.textContent.trim().toLowerCase();
      if(['producción','colocación','facturación','checklist de liberación / control','anotaciones por sector'].some(x=>t.includes(x))) sec.classList.add('v34-hidden');
    });
    document.getElementById('checklist-v58')?.closest('.form-group')?.classList.add('v34-hidden');
    ['nota-produccion','nota-colocaciones','nota-diseno','nota-ventas','nota-compras'].forEach(id=>document.getElementById(id)?.closest('.form-group')?.classList.add('v34-hidden'));
    const notes = document.getElementById('nota-produccion')?.closest('.form-group.full'); if(notes) notes.classList.add('v34-hidden');

    const actions=modal.querySelector('.modal-actions');
    actions?.querySelector('[onclick="abrirPresupuestoPDF()"]')?.classList.add('v34-hidden');
    actions?.querySelector('[onclick="exportarDatosFacturaActual()"]')?.classList.add('v34-hidden');

    // El resumen sectorial pertenece a OBRAS, no al cotizador. Se crea una sola vez y
    // luego se muestra/oculta según desde qué pantalla se abrió la ficha.
    if(!document.getElementById('obra-sector-summary-wrap')){
      const grid=modal.querySelector('.form-grid');
      const box=document.createElement('div'); box.id='obra-sector-summary-wrap';
      box.innerHTML='<div class="form-section" style="margin-top:6px">Estado general por sector</div><div style="font-size:11px;color:var(--text3);margin:4px 0 8px">Cada sector actualiza su propio avance. Esta ficha consolida el estado general de la obra.</div><div id="obra-sector-summary" class="sector-summary-grid"></div>';
      grid.appendChild(box);
    }
    updateObraSummaryVisibility();
  }

  function updateObraSummaryVisibility(){
    const box=document.getElementById('obra-sector-summary-wrap');
    if(!box) return;
    box.style.display = window.currentPage==='obras' ? '' : 'none';
  }

  function sectorCard(key,s){
    const d=SECTOR_DEF[key]; s=s||{};
    const state=normEstado(s.estado), cl=estadoClass(state);
    const meta=[];
    if(s.compromiso) meta.push(`<div>Compromiso: <strong>${esc(s.compromiso)}</strong></div>`);
    if(s.real) meta.push(`<div>Real: <strong>${esc(s.real)}</strong></div>`);
    if(key==='facturacion' && s.nroFactura) meta.push(`<div>FC: <strong>${esc(s.nroFactura)}</strong></div>`);
    if(key==='cobranzas' && s.montoCobrado) meta.push(`<div>Cobrado: <strong>${fmt(s.montoCobrado)}</strong></div>`);
    if(s.responsable) meta.push(`<div>Resp.: <strong>${esc(s.responsable)}</strong></div>`);
    return `<div class="sector-summary-card" onclick="openSectorV34('${key}')"><div class="sector-summary-top"><span style="font-size:11px;font-weight:600;color:${d.color}">${d.icon} ${d.label}</span><span class="sector-state ${cl}">${esc(state)}</span></div><div class="sector-meta">${meta.join('') || '<div>Sin datos cargados todavía</div>'}</div><div style="margin-top:9px;font-size:10px;color:var(--text3)">Abrir sector →</div></div>`;
  }
  function renderObraSectorSummary(o){
    const el=document.getElementById('obra-sector-summary'); if(!el) return;
    const sectores=getSectores(o||{});
    el.innerHTML=Object.keys(SECTOR_DEF).map(k=>sectorCard(k,sectores[k])).join('');
  }

  function field(label,id,type='text',value='',extra=''){
    if(type==='checkbox') return `<label class="check-item"><input id="${id}" type="checkbox" ${value?'checked':''}> ${label}</label>`;
    if(type==='textarea') return `<div class="form-group full"><label>${label}</label><textarea id="${id}" ${extra}>${esc(value)}</textarea></div>`;
    return `<div class="form-group"><label>${label}</label><input id="${id}" type="${type}" value="${esc(value)}" ${extra}></div>`;
  }
  function select(label,id,options,value){return `<div class="form-group"><label>${label}</label><select id="${id}">${options.map(x=>`<option ${x===value?'selected':''}>${x}</option>`).join('')}</select></div>`;}

  function sectorForm(key,s,o){
    s=s||{}; const common=['Pendiente','En proceso','Esperando','Bloqueado','Terminado'];
    let html='<div class="form-grid">';
    if(key==='ventas') html += select('Estado','sv-estado',['Pendiente','En gestión','Confirmado','Aprobado','Rechazado'],normEstado(s.estado)) + field('Responsable','sv-responsable','text',s.responsable||o.vendedor||'') + field('Fecha compromiso','sv-compromiso','text',s.compromiso||'') + `<div class="form-group full"><div class="checklist-grid">${field('Cliente confirmado','sv-cliente-confirmado','checkbox',s.clienteConfirmado)}${field('OC / OP recibida','sv-oc-recibida','checkbox',s.ocRecibida)}${field('Seña recibida','sv-sena','checkbox',s.senaRecibida)}</div></div>` + field('Notas de Ventas','sv-notas','textarea',s.notas||'');
    if(key==='diseno') html += select('Estado','sv-estado',['Pendiente','Diseñando','Esperando cliente','Correcciones','Aprobado'],normEstado(s.estado)) + field('Diseñador','sv-responsable','text',s.responsable||'') + field('Fecha compromiso','sv-compromiso','text',s.compromiso||'') + field('Fecha real','sv-real','text',s.real||'') + `<div class="form-group full"><div class="checklist-grid">${field('Diseño aprobado','sv-aprobado','checkbox',s.aprobado)}${field('Archivo final listo','sv-archivo-final','checkbox',s.archivoFinal)}${field('Enviado a Producción','sv-enviado-prod','checkbox',s.enviadoProduccion)}</div></div>` + field('Notas de Diseño','sv-notas','textarea',s.notas||'');
    if(key==='compras') html += select('Estado','sv-estado',['Pendiente','Cotizando','Pedido','Entrega parcial','Completo','Bloqueado'],normEstado(s.estado)) + field('Responsable','sv-responsable','text',s.responsable||'') + field('Fecha compromiso','sv-compromiso','text',s.compromiso||'') + field('Fecha real','sv-real','text',s.real||'') + `<div class="form-group full"><div class="checklist-grid">${field('Pedido realizado','sv-pedido','checkbox',s.pedidoRealizado)}${field('Materiales completos','sv-materiales','checkbox',s.materialesCompletos)}${field('Sin faltantes','sv-sin-faltantes','checkbox',s.sinFaltantes)}</div></div>` + field('Faltantes / notas de Compras','sv-notas','textarea',s.notas||'');
    if(key==='produccion') html += select('Estado','sv-estado',['Pendiente','En producción','Control de calidad','Embalando','Terminada','Bloqueada'],normEstado(s.estado)) + field('Responsable','sv-responsable','text',s.responsable||'') + field('Fecha compromiso','sv-compromiso','text',s.compromiso||o.fprod_c||'') + field('Fecha real','sv-real','text',s.real||o.fprod_r||'') + `<div class="form-group full"><div class="checklist-grid">${field('Material recibido','sv-material','checkbox',s.materialRecibido)}${field('Control calidad OK','sv-calidad','checkbox',s.calidadOK)}${field('Producción terminada','sv-terminada','checkbox',s.terminada)}${field('Embalado','sv-embalado','checkbox',s.embalado)}</div></div>` + field('Notas de Producción','sv-notas','textarea',s.notas||'');
    if(key==='colocaciones') html += select('Estado','sv-estado',['Pendiente','A coordinar','Coordinada','En instalación','Instalada','Reprogramada'],normEstado(s.estado)) + field('Responsable','sv-responsable','text',s.responsable||'') + field('Fecha compromiso','sv-compromiso','text',s.compromiso||o.fcol_c||'') + field('Fecha real','sv-real','text',s.real||o.fcol_r||'') + field('Dirección de obra','sv-direccion','text',s.direccion||'') + field('Contacto en obra','sv-contacto','text',s.contacto||'') + `<div class="form-group full"><div class="checklist-grid">${field('Colocación coordinada','sv-coordinada','checkbox',s.coordinada)}${field('Instalación realizada','sv-instalada','checkbox',s.instalada)}${field('Fotos finales cargadas','sv-fotos','checkbox',s.fotosFinales)}</div></div>` + field('Logística / permisos / equipos / notas','sv-notas','textarea',s.notas||'');
    if(key==='facturacion') html += select('Estado','sv-estado',['Pendiente','Lista para facturar','Facturado','Observada'],normEstado(s.estado)) + field('OC / OP','sv-oc','text',s.oc||o.oc||'') + field('Nro factura','sv-nrfc','text',s.nroFactura||o.nrfc||'') + field('Fecha factura','sv-fecha-factura','text',s.fechaFactura||o.ffc||'') + field('Días de pago','sv-dias-pago','number',s.diasPago||o.diasPago||'') + field('Fecha vencimiento','sv-vencimiento','text',s.vencimiento||'') + `<div class="form-group full"><div class="checklist-grid">${field('Facturado','sv-facturado','checkbox',s.facturado)}</div></div>` + field('Notas de Facturación','sv-notas','textarea',s.notas||'');
    if(key==='cobranzas') html += select('Estado','sv-estado',['Pendiente','Seña recibida','Parcial','Cobrado','Vencido'],normEstado(s.estado)) + field('Monto cobrado','sv-monto-cobrado','number',s.montoCobrado||'') + field('Saldo pendiente','sv-saldo','number',s.saldoPendiente||'') + field('Fecha vencimiento','sv-vencimiento','text',s.vencimiento||'') + `<div class="form-group full"><div class="checklist-grid">${field('Seña recibida','sv-sena','checkbox',s.senaRecibida)}${field('Cobrado total','sv-cobrado','checkbox',s.cobrado)}</div></div>` + field('Notas de Cobranzas','sv-notas','textarea',s.notas||'');
    return html+'</div>';
  }

  window.openSectorV34=function(key, obraId){
    const id=obraId || window.editingId?.obra; const o=(window.DB?.obras||[]).find(x=>x.id===id); if(!o){window.showToast?.('Primero guardá o abrí una obra');return;}
    const sectores=getSectores(o), s=sectores[key]||{};
    document.getElementById('sector-obra-id').value=id; document.getElementById('sector-key').value=key;
    document.getElementById('sector-modal-title').textContent=`${SECTOR_DEF[key].icon} ${SECTOR_DEF[key].label} — OT ${o.ot||'—'} · ${o.cliente||''}`;
    document.getElementById('sector-modal-body').innerHTML=sectorForm(key,s,o);
    document.getElementById('modal-sector').classList.add('open');
  };
  window.closeSectorModalV34=()=>document.getElementById('modal-sector')?.classList.remove('open');

  function sectorPayload(key){
    const base={estado:val('sv-estado'),responsable:val('sv-responsable'),compromiso:val('sv-compromiso'),real:val('sv-real'),notas:val('sv-notas'),actualizadoAt:new Date().toISOString(),actualizadoPor:window.currentUser?.email||''};
    if(key==='ventas') Object.assign(base,{clienteConfirmado:checked('sv-cliente-confirmado'),ocRecibida:checked('sv-oc-recibida'),senaRecibida:checked('sv-sena')});
    if(key==='diseno') Object.assign(base,{aprobado:checked('sv-aprobado'),archivoFinal:checked('sv-archivo-final'),enviadoProduccion:checked('sv-enviado-prod')});
    if(key==='compras') Object.assign(base,{pedidoRealizado:checked('sv-pedido'),materialesCompletos:checked('sv-materiales'),sinFaltantes:checked('sv-sin-faltantes')});
    if(key==='produccion') Object.assign(base,{materialRecibido:checked('sv-material'),calidadOK:checked('sv-calidad'),terminada:checked('sv-terminada'),embalado:checked('sv-embalado')});
    if(key==='colocaciones') Object.assign(base,{direccion:val('sv-direccion'),contacto:val('sv-contacto'),coordinada:checked('sv-coordinada'),instalada:checked('sv-instalada'),fotosFinales:checked('sv-fotos')});
    if(key==='facturacion') Object.assign(base,{oc:val('sv-oc'),nroFactura:val('sv-nrfc'),fechaFactura:val('sv-fecha-factura'),diasPago:+val('sv-dias-pago')||0,vencimiento:val('sv-vencimiento'),facturado:checked('sv-facturado')});
    if(key==='cobranzas') Object.assign(base,{montoCobrado:+val('sv-monto-cobrado')||0,saldoPendiente:+val('sv-saldo')||0,vencimiento:val('sv-vencimiento'),senaRecibida:checked('sv-sena'),cobrado:checked('sv-cobrado')});
    return base;
  }

  window.saveSectorV34=async function(){
    const id=val('sector-obra-id'), key=val('sector-key'); const o=(window.DB?.obras||[]).find(x=>x.id===id); if(!o)return;
    const payload=sectorPayload(key);
    // V35: guardar ÚNICAMENTE el mapa del sector editado. No se reescribe el mapa
    // completo y no se copian aliases legacy: evita que dos sectores se pisen entre sí.
    const patch={ [`sectores.${key}`]: payload, modeloDatos:35, ultimaActualizacionSector:key, ultimaActualizacionAt:new Date().toISOString() };
    try{
      await window.updateDoc_('obras',id,patch);
      o.sectores={...(o.sectores||{}),[key]:payload};
      projectCanonicalToLegacy(o);
      closeSectorModalV34(); renderObraSectorSummary(o);
      window.renderObras?.(); if(key==='produccion')window.renderProduccion?.(); if(key==='colocaciones')window.renderColocaciones?.(); if(key==='diseno')window.renderDiseno?.();
      window.showToast?.(`${SECTOR_DEF[key].label} actualizado · Obras se sincroniza automáticamente`);
    } catch(e){console.error(e);window.showToast?.('No se pudo guardar el sector');}
  };

  function strip(o){
    const s=getSectores(o); return Object.keys(SECTOR_DEF).map(k=>`<span class="obra-sector-pill ${estadoClass(s[k]?.estado)}" title="${SECTOR_DEF[k].label}: ${esc(normEstado(s[k]?.estado))}">${SECTOR_DEF[k].icon} ${esc(normEstado(s[k]?.estado))}</span>`).join('');
  }

  function upgradeObrasTable(){
    const th=document.querySelector('#page-obras thead tr'); if(!th)return;
    th.innerHTML='<th>Sem</th><th>OT</th><th>Descripción</th><th>Cliente</th><th>Vendedor</th><th>Estado por sectores</th><th>Precio venta</th><th></th>';
  }

  const oldRenderObras=window.renderObras;
  window.renderObras=function(){
    const tbody=document.getElementById('obras-tbody'); if(!tbody) return oldRenderObras?.();
    // conservar filtros existentes salvo filtro de sector, porque ahora una obra atraviesa todos los sectores
    const tabs=document.getElementById('obras-sectors'); if(tabs) tabs.innerHTML='<span style="font-size:11px;color:var(--text3)">Vista consolidada: cada obra muestra el avance de todos los sectores.</span>';
    let obras=[...(window.DB?.obras||[])];
    const estado=document.getElementById('filter-estado')?.value, cli=document.getElementById('filter-cliente')?.value.toLowerCase(), otQ=document.getElementById('filter-ot')?.value.toLowerCase();
    const semDesde=+document.getElementById('filter-semana-desde')?.value||0, semHasta=+document.getElementById('filter-semana-hasta')?.value||0;
    if(estado) obras=obras.filter(o=>o.estado===estado); if(cli) obras=obras.filter(o=>(o.cliente||'').toLowerCase().includes(cli)); if(otQ) obras=obras.filter(o=>(o.ot||'').toLowerCase().includes(otQ)||(o.desc||'').toLowerCase().includes(otQ)); if(semDesde)obras=obras.filter(o=>(+o.semana||0)>=semDesde); if(semHasta)obras=obras.filter(o=>(+o.semana||0)<=semHasta);
    obras.sort((a,b)=>(+b.ot||0)-(+a.ot||0));
    const count=document.getElementById('obras-count'); if(count)count.textContent=obras.length+' obras';
    tbody.innerHTML=obras.map(o=>`<tr><td>${o.semana||'—'}</td><td class="strong">${esc(o.ot||'—')}</td><td class="strong" style="max-width:230px">${esc(o.desc||'')}</td><td>${esc(o.cliente||'')}</td><td>${esc(o.vendedor||'')}</td><td><div class="obra-sector-strip">${strip(o)}</div></td><td>${fmt(o.neto)}</td><td style="white-space:nowrap"><button class="btn-icon" title="Resumen de obra" onclick="editObra('${o.id}')"><i class="ti ti-eye"></i></button><button class="btn-icon" title="Eliminar" onclick="delObra('${o.id}')"><i class="ti ti-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3)">No hay obras.</td></tr>';
  };

  function overrideSectorTable(pageKey, tbodyId, sectorKey, dateMode=true){
    const page=document.getElementById('page-'+pageKey); if(!page)return;
    const th=page.querySelector('thead tr'); if(th) th.innerHTML='<th>OT</th><th>Descripción</th><th>Cliente</th><th>Estado</th><th>Responsable</th><th>Compromiso</th><th>Real</th><th></th>';
    const fnName='render'+(pageKey==='diseno'?'Diseno':pageKey.charAt(0).toUpperCase()+pageKey.slice(1));
    window[fnName]=function(){
      const tb=document.getElementById(tbodyId); if(!tb)return;
      const obras=[...(window.DB?.obras||[])].filter(o=>!['Rechazado','Vencido'].includes(o.estado));
      tb.innerHTML=obras.map(o=>{const s=getSectores(o)[sectorKey]||{};return `<tr><td class="strong">${esc(o.ot||'—')}</td><td>${esc(o.desc||'')}</td><td>${esc(o.cliente||'')}</td><td><span class="sector-state ${estadoClass(s.estado)}">${esc(normEstado(s.estado))}</span></td><td>${esc(s.responsable||'—')}</td><td>${esc(s.compromiso||'—')}</td><td>${esc(s.real||'—')}</td><td><button class="btn btn-ghost btn-sm" onclick="openSectorV34('${sectorKey}','${o.id}')">Abrir ${SECTOR_DEF[sectorKey].label}</button></td></tr>`}).join('') || '<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text3)">Sin obras.</td></tr>';
    };
  }

  function patchEditObra(){
    const old=window.editObra; window.editObra=function(id){
      old?.(id);
      setTimeout(()=>{
        updateObraSummaryVisibility();
        const o=(window.DB?.obras||[]).find(x=>x.id===id);
        if(window.currentPage==='obras'){
          renderObraSectorSummary(o);
          const t=document.getElementById('modal-obra-title'); if(t)t.textContent='Resumen de obra — OT '+(o?.ot||'');
        }
      },0);
    };
    const oldOpen=window.openModal; window.openModal=function(type){
      const r=oldOpen?.apply(this,arguments);
      if(type==='obra') setTimeout(()=>{updateObraSummaryVisibility(); if(window.currentPage==='obras')renderObraSectorSummary({});},0);
      return r;
    };
  }

  function patchPresupuestoFunctions(){
    const oldNew=window.abrirNuevoPresupuestoCompleto;
    window.abrirNuevoPresupuestoCompleto=function(){const r=oldNew?.apply(this,arguments); setTimeout(()=>{document.getElementById('pp-fecha').value=new Date().toLocaleDateString('es-AR'); document.getElementById('pp-estado').value='Enviado'; document.getElementById('pp-moneda').value='ARS'; document.getElementById('pp-vendedor').value='G'; document.getElementById('pp-plazo').value=''; document.getElementById('pp-anticipo').value='50'; document.getElementById('pp-dias-pago').value=''; document.getElementById('pp-oc').value=''; document.getElementById('pp-obs-comercial').value='';},0);return r;};
    const oldSave=window.guardarPresupuestoCompleto;
    window.guardarPresupuestoCompleto=async function(){
      const nro=val('pp-nro').trim()||'0000', cliente=val('pp-cliente').trim(), desc=val('pp-desc').trim(), items=(window.ppItems||[]).filter(i=>(i.desc||'').trim()||(+i.precio||0)>0); if(!cliente||!items.length)return oldSave?.apply(this,arguments);
      const total=items.reduce((a,it)=>a+(+it.precio||0)*(+it.cant||1),0);
      const revision=window.normalizarRevisionV354?.(val('pp-revision')||'1.1')||'1.1';
      const numero=String(nro).replace(/\D/g,'');
      const existente=(window.DB?.presupuestos||[]).find(p=>String(p.nro||'').replace(/\D/g,'')===numero&&(window.normalizarRevisionV354?.(p.revision||'1.1')||'1.1')===revision);
      const id=window.editingId?.presupuesto||existente?.id||'';
      const data={nro,revision,cliente,desc:desc||items.map(i=>i.desc).join(' / '),importe:total,fecha:val('pp-fecha')||new Date().toLocaleDateString('es-AR'),estado:val('pp-estado')||'Enviado',nota:val('pp-nota'),cond:val('pp-condicion'),validez:+val('pp-validez')||7,items,vendedor:val('pp-vendedor'),moneda:val('pp-moneda')||'ARS',plazoEstimado:val('pp-plazo'),anticipoPct:+val('pp-anticipo')||0,diasPago:+val('pp-dias-pago')||0,oc:val('pp-oc'),observacionesComerciales:val('pp-obs-comercial'),creadoPor:window.currentUser?.email||'',obraId:'',cotizacionBase:numero};
      try{let ref;if(id){await window.updateDoc_('presupuestos',id,data);ref={id};}else ref=await window.addDoc_('presupuestos',data);if(window.editingId)window.editingId.presupuesto=ref?.id||id;window._cotizacionBaseId=ref?.id||id;document.getElementById('modal-prespdf').classList.remove('open');window.showToast?.(id?'Presupuesto actualizado':'Presupuesto comercial guardado');}catch(e){console.error(e);window.showToast?.('No se pudo guardar el presupuesto');}
    };
  }

  function init(){
    installSingleSourceGuard();
    normalizeDBV35();
    // Firestore ya trabaja con onSnapshot. Antes de cada render consolidamos los aliases
    // en memoria para que Obras y las vistas históricas reflejen el sector al instante.
    if(!window.__v35RefreshPatched && window.refreshCurrent){
      window.__v35RefreshPatched=true; const oldRefresh=window.refreshCurrent;
      window.refreshCurrent=function(){ normalizeDBV35(); return oldRefresh.apply(this,arguments); };
    }
    injectCSS(); injectSectorModal(); upgradePresupuesto(); cleanObraModal(); upgradeObrasTable();
    overrideSectorTable('produccion','prod-tbody','produccion'); overrideSectorTable('colocaciones','col-tbody','colocaciones'); overrideSectorTable('diseno','dis-tbody','diseno');
    patchEditObra(); patchPresupuestoFunctions();
    const VERSION_LABEL='TIZ V35.6 · AUTOCOMPLETE CLIENTES CORREGIDO · 17/08/2026';
    const forceVersionBadge=()=>{const badge=document.getElementById('tiz-build-v20'); if(badge)badge.textContent=VERSION_LABEL;};
    forceVersionBadge();
    // expedientesV33 actualiza el pie con retraso; lo reponemos después y además observamos
    // cambios para que el nombre visible siempre corresponda a la versión publicada.
    setTimeout(forceVersionBadge,1400); setTimeout(forceVersionBadge,2200);
    const badge=document.getElementById('tiz-build-v20');
    if(badge && !window.__v351BadgeObserver){
      window.__v351BadgeObserver=new MutationObserver(()=>{if(badge.textContent!==VERSION_LABEL)badge.textContent=VERSION_LABEL;});
      window.__v351BadgeObserver.observe(badge,{childList:true,characterData:true,subtree:true});
    }
    console.info('[TIZ V35.7] Clientes + cálculos auxiliares, revisiones, carpetas y fuente única activos');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init); else init();
})();
