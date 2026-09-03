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

  function entregaLogisticaActual(){
    return {tipo:val('pp-entrega-tipo')||'a_definir',domicilio:val('pp-entrega-domicilio').trim(),fecha:val('pp-entrega-fecha'),contacto:val('pp-entrega-contacto').trim(),retira:val('pp-entrega-retira').trim(),detalle:val('pp-entrega-detalle').trim()};
  }
  window.collectEntregaLogisticaPP=entregaLogisticaActual;
  window.actualizarEntregaLogisticaPP=function(){
    const tipo=val('pp-entrega-tipo')||'a_definir', envio=tipo==='envio', colocacion=tipo==='colocacion', retiro=tipo==='retiro_fabrica';
    document.querySelectorAll('.pp-entrega-domicilio').forEach(e=>e.style.display=(envio||colocacion)?'':'none');
    document.querySelectorAll('.pp-entrega-fecha').forEach(e=>e.style.display=tipo==='a_definir'?'none':'');
    document.querySelectorAll('.pp-entrega-contacto').forEach(e=>e.style.display=(envio||colocacion)?'':'none');
    document.querySelectorAll('.pp-entrega-retira').forEach(e=>e.style.display=retiro?'':'none');
    document.querySelectorAll('.pp-entrega-detalle').forEach(e=>e.style.display=(envio||colocacion)?'':'none');
    const etiquetas={a_definir:'A definir',retiro_fabrica:'Retira en fábrica',envio:'Envío a domicilio',colocacion:'Con colocación'};
    const resumen=document.getElementById('pp-entrega-resumen');if(resumen)resumen.textContent='— '+etiquetas[tipo];
    const fecha=document.getElementById('pp-entrega-fecha-label');if(fecha)fecha.textContent=retiro?'Fecha prevista de retiro':envio?'Fecha prevista de entrega':'Fecha prevista de colocación';
    const detalle=document.getElementById('pp-entrega-detalle-label');if(detalle)detalle.textContent=colocacion?'Acceso, horarios, permisos y equipos':'Indicaciones para la entrega';
  };
  function cargarEntregaLogisticaPP(data={}){
    const e=data.entregaLogistica||data.logistica||{}, set=(id,value)=>{const el=document.getElementById(id);if(el)el.value=value||'';};
    set('pp-entrega-tipo',e.tipo||'a_definir');set('pp-entrega-domicilio',e.domicilio);set('pp-entrega-fecha',e.fecha);set('pp-entrega-contacto',e.contacto);set('pp-entrega-retira',e.retira);set('pp-entrega-detalle',e.detalle);
    window.actualizarEntregaLogisticaPP();
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
    const log=o.entregaLogistica||{}, info=o.infoPresupuesto||s.infoPresupuesto||{}, modalidades={a_definir:'A definir',retiro_fabrica:'Retira en fábrica',envio:'Envío a domicilio',colocacion:'Con colocación'};
    const items=(info.items||o.itemsTecnicos||[]).map(i=>i.articulo||i.descripcion||i.desc).filter(Boolean).slice(0,8), aclaraciones=(info.aclaraciones||[]).filter(Boolean);
    const sectores=getSectores(o), relevantes={ventas:['Entrega: '+(modalidades[log.tipo||info.modalidadEntrega]||'A definir'),'Revisión CT: '+(o.revisionCotizacion||'—'),'Fecha: '+(info.fechaEntrega||'—')],diseno:['Trabajo: '+(o.desc||'—'),'Plazo: '+(info.plazoEstimado||'—'),'Producción: '+normEstado(sectores.produccion?.estado)],compras:['Producción: '+normEstado(sectores.produccion?.estado),'Fecha necesaria: '+(sectores.produccion?.compromiso||info.fechaEntrega||'—'),'Plazo: '+(info.plazoEstimado||'—')],produccion:['Diseño: '+normEstado(sectores.diseno?.estado),'Compras: '+normEstado(sectores.compras?.estado),'Entrega: '+(modalidades[log.tipo||info.modalidadEntrega]||'A definir'),'Fecha necesaria: '+(info.fechaEntrega||'—')],colocaciones:['Modalidad: '+(modalidades[log.tipo||info.modalidadEntrega]||'A definir'),'Fecha: '+(info.fechaEntrega||s.compromiso||'—'),'Domicilio: '+(info.domicilio||s.direccion||'—'),'Contacto: '+(info.contacto||s.contacto||'—')],facturacion:['CT: '+(o.nroCotizacion||o.ot||'—'),'OC / OP: '+(sectores.facturacion?.oc||info.oc||'—'),'Condición: '+(info.condicionPago||o.cond||'—'),'Importe: '+fmt(info.importe||o.neto)],cobranzas:['Factura: '+(sectores.facturacion?.nroFactura||'—'),'Condición: '+(info.condicionPago||'—'),'Anticipo: '+(info.anticipoPct||0)+'%','Vencimiento: '+(sectores.facturacion?.vencimiento||sectores.cobranzas?.vencimiento||'—')]}[key]||[];
    let html=`<div class="commercial-note" style="border-left:3px solid ${SECTOR_DEF[key].color}"><b>Información recibida desde Presupuestos</b><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 14px;margin-top:7px">${relevantes.map(x=>`<div>${esc(x)}</div>`).join('')}</div>${items.length&&['diseno','compras','produccion','colocaciones'].includes(key)?`<div style="margin-top:7px"><b>Ítems / materiales:</b> ${items.map(esc).join(' · ')}</div>`:''}${aclaraciones.length?`<div style="margin-top:7px"><b>Aclaraciones:</b> ${aclaraciones.map(esc).join(' · ')}</div>`:''}${(log.detalle||info.indicacionesEntrega)&&['produccion','colocaciones'].includes(key)?`<div style="margin-top:7px"><b>Indicaciones:</b> ${esc(log.detalle||info.indicacionesEntrega)}</div>`:''}</div><div class="form-grid">`;
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
    th.innerHTML='<th>Sem</th><th>OT</th><th>Descripción</th><th>Cliente</th><th>Vendedor</th><th>Estado</th><th></th>';
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
    tbody.innerHTML=obras.map(o=>`<tr><td>${o.semana||'—'}</td><td class="strong">${esc(String(o.ot||'—').replace(/^0+(?=\\d)/,''))}</td><td class="strong" style="max-width:230px">${esc(o.desc||'')}</td><td>${esc(o.cliente||'')}</td><td>${esc(o.vendedor||'')}</td><td onclick="event.stopPropagation()"><select class="quick-estado" onchange="quickChangeEstado('${o.id}',this.value)">${['Pendiente','Enviado','Aprobado','Entregado','Cobrado pendiente','Cobrado'].map(v=>`<option value="${v}" ${o.estado===v?'selected':''}>${v}</option>`).join('')}</select></td><td style="white-space:nowrap">${o.nrfc?`<span title="Facturado: FC ${esc(o.nrfc)}" style="color:var(--amber);margin-right:4px;font-size:13px">●</span>`:''}${renderDriveButtonsV9(o)}<button class="btn-icon" title="Resumen de obra" onclick="editObra('${o.id}')"><i class="ti ti-eye"></i></button><button class="btn-icon" title="Eliminar" onclick="delObra('${o.id}')"><i class="ti ti-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">No hay obras.</td></tr>';
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
    function datosTecnicosPresupuesto(data){
      const items=(Array.isArray(data?.items)?data.items:[]).map(item=>({
        articulo:String(item?.desc||item?.descripcion||'').trim(),
        cantidad:Number(item?.cant||item?.cantidad||1)||1,
        unidad:String(item?.unidad||'UNID').trim()||'UNID',
        observaciones:String(item?.observaciones||item?.detalle||'').trim()
      })).filter(item=>item.articulo);
      const notas=[];
      if(data?.desc)notas.push('Descripción general: '+data.desc);
      if(data?.nota)notas.push('Notas de cotización: '+data.nota);
      if(data?.cond)notas.push('Condiciones: '+data.cond);
      if(data?.plazoEstimado)notas.push('Plazo estimado: '+data.plazoEstimado);
      if(data?.oc)notas.push('OC / OP: '+data.oc);
      const entrega=data?.entregaLogistica||{};
      const modalidades={a_definir:'A definir',retiro_fabrica:'Retira en fábrica',envio:'Envío a domicilio',colocacion:'Con colocación'};
      notas.push('ENTREGA / LOGÍSTICA: '+(modalidades[entrega.tipo]||'A definir'));
      if(entrega.domicilio)notas.push('Domicilio: '+entrega.domicilio);
      if(entrega.fecha)notas.push('Fecha prevista: '+entrega.fecha);
      if(entrega.contacto)notas.push('Contacto: '+entrega.contacto);
      if(entrega.retira)notas.push('Retira: '+entrega.retira);
      if(entrega.detalle)notas.push('Indicaciones logísticas: '+entrega.detalle);
      items.forEach((item,i)=>{if(item.observaciones)notas.push('Ítem '+(i+1)+': '+item.observaciones);});
      const auxiliares=(Array.isArray(data?.calculosAuxiliares)?data.calculosAuxiliares:[]).map(x=>({
        concepto:String(x?.concepto||'').trim(),detalle:String(x?.detalle||'').trim(),cantidad:Number(x?.cantidad||0),unidad:String(x?.unidad||'').trim(),observaciones:String(x?.observaciones||'').trim()
      })).filter(x=>x.concepto||x.detalle);
      const aclaraciones=[data?.desc,data?.nota,data?.observacionesComerciales].map(x=>String(x||'').trim()).filter(Boolean);
      const infoPresupuesto={
        fechaCotizacion:data?.fecha||'',plazoEstimado:data?.plazoEstimado||'',fechaEntrega:entrega.fecha||'',
        modalidadEntrega:entrega.tipo||'a_definir',domicilio:entrega.domicilio||'',contacto:entrega.contacto||'',retira:entrega.retira||'',indicacionesEntrega:entrega.detalle||'',
        items,materialesAuxiliares:auxiliares,aclaraciones,condicionPago:data?.cond||'',anticipoPct:Number(data?.anticipoPct||0),diasPago:Number(data?.diasPago||0),oc:data?.oc||'',importe:Number(data?.importe||0)
      };
      return {items,auxiliares,aclaraciones,observaciones:notas.join('\n'),entregaLogistica:entrega,infoPresupuesto};
    }
    window.datosTecnicosPresupuestoV3511=datosTecnicosPresupuesto;
    window.ensureObraFromPresupuestoV358=async function(presupuestoId,data){
      if(normEstado(data?.estado)!=='Aprobado'||!presupuestoId)return null;
      const numero=String(data.nro||'').replace(/\D/g,'');
      const existente=(window.DB?.obras||[]).find(o=>o.presupuestoId===presupuestoId||o.cotizacionId===presupuestoId||(String(o.ot||'').replace(/\D/g,'')===numero&&numero));
      const tecnico=datosTecnicosPresupuesto(data);
      const anteriores=existente?.gestionSectores||{}, info=tecnico.infoPresupuesto, aclaraciones=tecnico.aclaraciones.join('\n');
      const ventas={...(anteriores.ventas||{}),infoPresupuesto:info,responsable:anteriores.ventas?.responsable||data.vendedor||'',compromiso:anteriores.ventas?.compromiso||info.fechaEntrega||'',notasPresupuesto:aclaraciones};
      const diseno={...(anteriores.diseno||{}),infoPresupuesto:info,itemsCotizados:tecnico.items,aclaracionesPresupuesto:aclaraciones,compromiso:anteriores.diseno?.compromiso||info.plazoEstimado||''};
      const compras={...(anteriores.compras||{}),infoPresupuesto:info,requerimientosPresupuesto:tecnico.auxiliares.length?tecnico.auxiliares:tecnico.items,aclaracionesPresupuesto:aclaraciones,compromiso:anteriores.compras?.compromiso||info.fechaEntrega||info.plazoEstimado||''};
      const produccionAnterior=anteriores.produccion||{};
      const produccion={...produccionAnterior,infoPresupuesto:info,materiales:produccionAnterior.materiales?.length?produccionAnterior.materiales:tecnico.items,materialesCotizados:tecnico.items,requerimientosPresupuesto:tecnico.auxiliares,observaciones:produccionAnterior.observaciones||tecnico.observaciones,aclaracionesPresupuesto:aclaraciones,detalleCotizacion:tecnico.items,datosCotizacionSinPrecios:true,entregaLogistica:tecnico.entregaLogistica,fechaFinPlan:produccionAnterior.fechaFinPlan||info.fechaEntrega||''};
      const colocacionesAnterior=anteriores.colocaciones||{}, esColocacion=tecnico.entregaLogistica?.tipo==='colocacion';
      const colocaciones={...colocacionesAnterior,infoPresupuesto:info,itemsCotizados:tecnico.items,aclaracionesPresupuesto:aclaraciones,modalidadEntrega:info.modalidadEntrega,...(esColocacion?{estado:colocacionesAnterior.estado||'A coordinar',compromiso:colocacionesAnterior.compromiso||info.fechaEntrega||'',fechaPlan:colocacionesAnterior.fechaPlan||info.fechaEntrega||'',direccion:colocacionesAnterior.direccion||info.domicilio||'',contacto:colocacionesAnterior.contacto||info.contacto||'',notas:colocacionesAnterior.notas||info.indicacionesEntrega||aclaraciones}:{estado:colocacionesAnterior.estado||'No requerida'})};
      const facturacion={...(anteriores.facturacion||{}),infoPresupuesto:info,oc:anteriores.facturacion?.oc||info.oc||'',condicionPago:info.condicionPago,anticipoPct:info.anticipoPct,diasPago:info.diasPago,importePresupuestado:info.importe,aclaracionesPresupuesto:aclaraciones};
      const cobranzas={...(anteriores.cobranzas||{}),infoPresupuesto:info,condicionPago:info.condicionPago,anticipoPct:info.anticipoPct,diasPago:info.diasPago,montoTotal:info.importe,saldoPendiente:anteriores.cobranzas?.saldoPendiente||info.importe,aclaracionesPresupuesto:aclaraciones};
      const obra={ot:numero,cliente:data.cliente||'',desc:data.desc||'',estado:'Aprobado',sector:'Producción',vendedor:data.vendedor||'',neto:+data.importe||0,bruto:+data.importe||0,itemsCotizados:Array.isArray(data.items)?data.items:[],itemsTecnicos:tecnico.items,infoPresupuesto:info,entregaLogistica:tecnico.entregaLogistica,cond:data.cond||'',plazoEstimado:data.plazoEstimado||'',oc:data.oc||'',diasPago:Number(data.diasPago||0),anticipoPct:Number(data.anticipoPct||0),gestionSectores:{...anteriores,ventas,diseno,compras,produccion,colocaciones,facturacion,cobranzas},presupuestoId,cotizacionId:presupuestoId,nroCotizacion:data.nro||numero,revisionCotizacion:data.revision||'1.1',fechaAprobacion:new Date().toLocaleDateString('es-AR'),origen:'presupuesto'};
      let obraId=existente?.id||'';
      if(obraId)await window.updateDoc_('obras',obraId,obra);
      else{const ref=await window.addDoc_('obras',obra);obraId=ref?.id||'';}
      // La obra y el vínculo con el presupuesto son la operación principal. Drive es
      // complementario: una demora o error allí nunca debe dejar una CT aprobada fuera
      // de Obras.
      await window.updateDoc_('presupuestos',presupuestoId,{obraId,promovidoAObra:true,promovidoEn:new Date().toISOString()});
      if(typeof window.syncProductionOtDocumentV315==='function'){
        try{const drive=await window.syncProductionOtDocumentV315({...(existente||{}),...obra,id:obraId,firestoreId:obraId});if(drive?.driveFolderUrl)await window.updateDoc_('presupuestos',presupuestoId,{driveFolderUrl:drive.driveFolderUrl,driveFolderId:drive.driveFolderId||drive.folderId||''});}
        catch(e){console.warn('[TIZ] La obra fue creada; la hoja de Producción se reintentará automáticamente',e);}
      }
      return obraId;
    };
    const oldNew=window.abrirNuevoPresupuestoCompleto;
    window.abrirNuevoPresupuestoCompleto=function(){const r=oldNew?.apply(this,arguments); setTimeout(()=>{document.getElementById('pp-fecha').value=new Date().toLocaleDateString('es-AR'); document.getElementById('pp-estado').value='Enviado'; document.getElementById('pp-moneda').value='ARS'; document.getElementById('pp-vendedor').value='G'; document.getElementById('pp-plazo').value=''; document.getElementById('pp-anticipo').value='50'; document.getElementById('pp-dias-pago').value=''; document.getElementById('pp-oc').value=''; document.getElementById('pp-obs-comercial').value='';cargarEntregaLogisticaPP({});},0);return r;};
    const oldOpenRevision=window.abrirRevisionCotizacionV354;
    if(oldOpenRevision)window.abrirRevisionCotizacionV354=function(id){const data=(window.DB?.presupuestos||[]).find(p=>p.id===id)||{};const r=oldOpenRevision.apply(this,arguments);setTimeout(()=>cargarEntregaLogisticaPP(data),0);return r;};
    const oldSave=window.guardarPresupuestoCompleto;
    window.guardarPresupuestoCompleto=async function(){
      if(window.__tizPresupuestoGuardando){window.showToast?.('El presupuesto ya se está guardando. Esperá un momento.');return;}
      window.__tizPresupuestoGuardando=true;
      const nro=val('pp-nro').trim()||'0000', cliente=val('pp-cliente').trim(), desc=val('pp-desc').trim(), items=(window.ppItems||[]).filter(i=>(i.desc||'').trim()||(+i.precio||0)>0); if(!cliente||!items.length){window.__tizPresupuestoGuardando=false;return oldSave?.apply(this,arguments);}
      const total=items.reduce((a,it)=>a+(+it.precio||0)*(+it.cant||1),0);
      const revision=window.normalizarRevisionV354?.(val('pp-revision')||'1.1')||'1.1';
      const numero=String(nro).replace(/\D/g,'');
      const existente=(window.DB?.presupuestos||[]).find(p=>String(p.nro||'').replace(/\D/g,'')===numero&&(window.normalizarRevisionV354?.(p.revision||'1.1')||'1.1')===revision);
      const id=window.editingId?.presupuesto||existente?.id||'';
      const actual=(window.DB?.presupuestos||[]).find(p=>p.id===id)||existente||{};
      const data={nro,revision,cliente,desc:desc||items.map(i=>i.desc).join(' / '),importe:total,fecha:val('pp-fecha')||new Date().toLocaleDateString('es-AR'),estado:val('pp-estado')||'Enviado',nota:val('pp-nota'),cond:val('pp-condicion'),validez:+val('pp-validez')||7,items,calculosAuxiliares:window.collectCalculosAuxPP?.()||window.ppCalculosAux||[],vendedor:val('pp-vendedor'),moneda:val('pp-moneda')||'ARS',plazoEstimado:val('pp-plazo'),anticipoPct:+val('pp-anticipo')||0,diasPago:+val('pp-dias-pago')||0,oc:val('pp-oc'),observacionesComerciales:val('pp-obs-comercial'),entregaLogistica:entregaLogisticaActual(),creadoPor:window.currentUser?.email||'',obraId:actual.obraId||'',cotizacionBase:numero};
      try{let ref;if(id){await window.updateDoc_('presupuestos',id,data);ref={id};}else ref=await window.addDoc_('presupuestos',data);const presupuestoId=ref?.id||id;if(window.editingId)window.editingId.presupuesto=presupuestoId;window._cotizacionBaseId=presupuestoId;if(normEstado(data.estado)==='Aprobado')await window.ensureObraFromPresupuestoV358(presupuestoId,data);document.getElementById('modal-prespdf').classList.remove('open');window.showToast?.(normEstado(data.estado)==='Aprobado'?'Presupuesto aprobado y enviado a Obras':id?'Presupuesto actualizado':'Presupuesto comercial guardado');}catch(e){console.error(e);window.showToast?.('No se pudo guardar el presupuesto');}finally{window.__tizPresupuestoGuardando=false;}
    };
  }

  function bloquearGeneracionDuplicada(){
    const original=window.generarPDF;
    if(typeof original!=='function'||original.__tizBloqueado)return;
    const wrapped=async function(){
      if(window.__tizPresupuestoGuardando){window.showToast?.('El presupuesto ya se está procesando. Esperá un momento.');return;}
      window.__tizPresupuestoGuardando=true;
      try{return await original.apply(this,arguments);}finally{window.__tizPresupuestoGuardando=false;}
    };
    wrapped.__tizBloqueado=true;
    window.generarPDF=wrapped;
  }

  function integrarFichaProduccionV8(){
    if(window.__tizProduccionIntegralV3515||typeof window.p8Open!=='function')return;
    const abrir=window.p8Open;
    window.p8Open=function(id){
      const resultado=abrir.apply(this,arguments),o=(window.DB?.obras||[]).find(x=>x.id===id),panel=document.querySelector('#p8-workspace .p8-panel[data-panel="resumen"]');
      if(o&&panel&&!panel.querySelector('.tiz-integral-produccion')){
        const log=o.entregaLogistica||{},m={a_definir:'A definir',retiro_fabrica:'Retira en fábrica',envio:'Envío a domicilio',colocacion:'Con colocación'},s=getSectores(o);
        const items=(o.itemsTecnicos||[]).map(x=>x.articulo||x.descripcion||x.desc).filter(Boolean);
        panel.insertAdjacentHTML('afterbegin',`<section class="p8-card tiz-integral-produccion" style="margin-bottom:10px;border-left:3px solid var(--accent)"><div class="p8-title"><b>Información integral de la OT</b><span>Ventas · Diseño · Compras · Entrega</span></div><div class="p8-form"><div><span class="p8-muted">DISEÑO</span><br><b>${esc(normEstado(s.diseno?.estado))}</b></div><div><span class="p8-muted">COMPRAS</span><br><b>${esc(normEstado(s.compras?.estado))}</b></div><div><span class="p8-muted">ENTREGA</span><br><b>${esc(m[log.tipo]||'A definir')}</b></div><div><span class="p8-muted">FECHA PREVISTA</span><br><b>${esc(log.fecha||'Sin definir')}</b></div>${log.domicilio?`<div class="p8-full"><span class="p8-muted">DOMICILIO</span><br><b>${esc(log.domicilio)}</b></div>`:''}${items.length?`<div class="p8-full"><span class="p8-muted">ÍTEMS COTIZADOS</span><br>${items.map(esc).join(' · ')}</div>`:''}${log.detalle?`<div class="p8-full"><span class="p8-muted">INDICACIONES</span><br>${esc(log.detalle)}</div>`:''}</div></section>`);
      }
      return resultado;
    };
    window.__tizProduccionIntegralV3515=true;
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
    patchEditObra(); patchPresupuestoFunctions(); bloquearGeneracionDuplicada();
    const VERSION_LABEL='TIZ V35.16 · DATOS DE PRESUPUESTO POR SECTOR · 03/09/2026';
    const forceVersionBadge=()=>{const badge=document.getElementById('tiz-build-v20'); if(badge)badge.textContent=VERSION_LABEL;};
    forceVersionBadge();
    // expedientesV33 actualiza el pie con retraso; lo reponemos después y además observamos
    // cambios para que el nombre visible siempre corresponda a la versión publicada.
    setTimeout(forceVersionBadge,1400); setTimeout(forceVersionBadge,2200); setTimeout(integrarFichaProduccionV8,1700);
    const badge=document.getElementById('tiz-build-v20');
    if(badge && !window.__v351BadgeObserver){
      window.__v351BadgeObserver=new MutationObserver(()=>{if(badge.textContent!==VERSION_LABEL)badge.textContent=VERSION_LABEL;});
      window.__v351BadgeObserver.observe(badge,{childList:true,characterData:true,subtree:true});
    }
    console.info('[TIZ V35.7] Clientes + cálculos auxiliares, revisiones, carpetas y fuente única activos');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init); else init();
})();
