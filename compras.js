import { getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const db = getFirestore(getApp());
const C = {
  compras: [], articulos: [], conteos: [], planes: []
};
let compraEditId = null;
let selectedFile = null;
let currentTab = 'inicio';

const money = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(n)||0);
const num = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let s = String(value ?? '').trim().replace(/\s/g,'').replace(/\$/g,'');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) {
    // Formato argentino: 1.234,56
    s = s.replace(/\./g,'').replace(',','.');
  } else if (s.includes(',')) {
    s = s.replace(',','.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const todayISO = () => new Date().toISOString().slice(0,10);
const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR') : '—';
const weekKey = (d=new Date()) => {
  const x = new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate()+4-day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(),0,1));
  return `${x.getUTCFullYear()}-S${String(Math.ceil((((x-yearStart)/86400000)+1)/7)).padStart(2,'0')}`;
};
const toast = msg => window.showToast ? window.showToast(msg) : alert(msg);

function injectStyles(){
  if(document.getElementById('tiz-compras-v21-styles')) return;
  const st=document.createElement('style');
  st.id='tiz-compras-v21-styles';
  st.textContent=`
  #page-compras{padding:18px 20px 70px;overflow:auto}
  .cp-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap}
  .cp-title{font-size:22px;font-weight:800}.cp-sub{font-size:12px;color:var(--text3);margin-top:3px}
  .cp-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 16px}.cp-tab{border:1px solid var(--border);background:var(--surface);color:var(--text2);border-radius:8px;padding:7px 11px;cursor:pointer;font-size:12px}.cp-tab.active{background:var(--accent);color:#17120a;border-color:var(--accent);font-weight:800}
  .cp-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px}.cp-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px}.cp-kpi{font:700 24px 'DM Mono',monospace;margin-top:5px}.cp-lbl{font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em}
  .cp-alert{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--border);background:var(--surface);padding:11px;border-radius:10px;margin-bottom:7px}.cp-alert.red{border-left:4px solid var(--red)}.cp-alert.amber{border-left:4px solid var(--amber)}.cp-alert.green{border-left:4px solid var(--green)}
  .cp-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:11px;background:var(--surface)}.cp-table{width:100%;border-collapse:collapse;min-width:980px}.cp-table th,.cp-table td{padding:8px 9px;border-bottom:1px solid var(--border);font-size:11px;text-align:left}.cp-table th{position:sticky;top:0;background:var(--surface2);color:var(--text3);text-transform:uppercase}.cp-table tr:hover td{background:rgba(255,255,255,.018)}
  .cp-pill{display:inline-flex;border-radius:99px;padding:3px 7px;font-size:10px;font-weight:700}.cp-pill.yes{background:rgba(61,191,160,.14);color:var(--green)}.cp-pill.no{background:rgba(239,91,91,.14);color:var(--red)}.cp-pill.warn{background:rgba(232,160,32,.14);color:var(--amber)}
  .cp-panel{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px}.cp-row{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.cp-field label{display:block;font-size:10px;color:var(--text3);margin-bottom:4px;text-transform:uppercase}.cp-field input,.cp-field select,.cp-field textarea{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:8px;font-size:12px}.cp-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
  .cp-btn{border:0;border-radius:8px;padding:8px 11px;cursor:pointer;font-weight:700;font-size:11px;background:var(--surface3);color:var(--text)}.cp-btn.primary{background:var(--accent);color:#17120a}.cp-btn.danger{background:rgba(239,91,91,.15);color:var(--red)}
  .cp-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:12000;display:none;align-items:flex-start;justify-content:center;padding:22px;overflow:auto}.cp-modal-bg.open{display:flex}.cp-modal{width:min(1100px,100%);background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:16px;box-shadow:0 25px 80px #000}.cp-modal h2{margin:0 0 12px}.cp-items{width:100%;border-collapse:collapse;min-width:900px}.cp-items th,.cp-items td{padding:5px}.cp-items input,.cp-items select{width:100%;padding:7px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:6px}
  .cp-confidence{height:6px;background:var(--surface3);border-radius:99px;overflow:hidden}.cp-confidence>span{display:block;height:100%;background:var(--green)}
  @media(max-width:1000px){.cp-grid{grid-template-columns:repeat(2,1fr)}.cp-row{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:650px){#page-compras{padding:12px}.cp-grid,.cp-row{grid-template-columns:1fr}.cp-modal-bg{padding:7px}.cp-title{font-size:19px}}
  `;
  document.head.appendChild(st);
}

function injectUI(){
  if(document.getElementById('page-compras')) return;
  const nav=document.querySelector('.nav');
  if(nav && !document.querySelector('[data-cp-nav]')){
    const b=document.createElement('button'); b.className='nav-item'; b.dataset.cpNav='1';
    b.innerHTML='<i>🛒</i><span>Compras</span>'; b.onclick=()=>window.goTo('compras');
    const ref=[...nav.children].find(x=>x.textContent.includes('Cobranzas'));
    nav.insertBefore(b,ref||null);
  }
  const page=document.createElement('section'); page.id='page-compras'; page.className='page';
  page.innerHTML=`
    <div class="cp-head"><div><div class="cp-title">Compras y Stock Inteligente</div><div class="cp-sub">Carga por ítem, comprobantes, conteo semanal, planificación y alertas.</div></div><div class="cp-actions"><button class="cp-btn" onclick="cpOpenConfigIA()">⚙ IA</button><button class="cp-btn primary" onclick="cpNuevaCompra()">＋ Nueva compra</button></div></div>
    <div class="cp-tabs">
      <button class="cp-tab active" data-tab="inicio">Inicio</button><button class="cp-tab" data-tab="compras">Compras</button><button class="cp-tab" data-tab="conteo">Conteo semanal</button><button class="cp-tab" data-tab="articulos">Artículos</button><button class="cp-tab" data-tab="planes">Materiales por OT</button><button class="cp-tab" data-tab="alertas">Alertas</button>
    </div><div id="cp-content"></div>`;
  document.querySelector('.main, main, .content')?.appendChild(page) || document.body.appendChild(page);
  page.querySelectorAll('.cp-tab').forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;page.querySelectorAll('.cp-tab').forEach(x=>x.classList.toggle('active',x===b));render();});

  const modal=document.createElement('div'); modal.id='cp-modal-compra'; modal.className='cp-modal-bg';
  modal.innerHTML=`<div class="cp-modal"><div style="display:flex;justify-content:space-between"><h2>Nueva compra detallada</h2><button class="cp-btn" onclick="cpCloseCompra()">✕</button></div>
    <div class="cp-panel"><div class="cp-row">
      <div class="cp-field"><label>Foto/PDF del comprobante</label><input id="cp-file" type="file" accept="image/*,application/pdf" capture="environment"></div>
      <div class="cp-field"><label>Lectura IA</label><button class="cp-btn primary" style="width:100%;margin-top:16px" onclick="cpAnalizarIA()">✨ Analizar comprobante</button></div>
      <div class="cp-field"><label>Fecha</label><input id="cp-fecha" type="date"></div>
      <div class="cp-field"><label>Proveedor</label><input id="cp-proveedor" placeholder="Ej. Indartubo"></div>
      <div class="cp-field"><label>¿FC?</label><select id="cp-fc"><option value="si">Sí</option><option value="no">No</option></select></div>
      <div class="cp-field"><label>Tipo comprobante</label><select id="cp-tipo"><option>Factura A</option><option>Factura B</option><option>Factura C</option><option>Ticket fiscal</option><option>Remito</option><option>Otro</option><option>Sin comprobante</option></select></div>
      <div class="cp-field"><label>Número</label><input id="cp-numero" placeholder="0001-00001234"></div>
      <div class="cp-field"><label>Medio de pago</label><select id="cp-medio"><option>Transferencia</option><option>Efectivo</option><option>Tarjeta</option><option>Cheque</option><option>Cuenta corriente</option><option>Otro</option></select></div>
      <div class="cp-field"><label>Vencimiento</label><input id="cp-vencimiento" type="date"></div>
      <div class="cp-field"><label>Destino</label><select id="cp-destino"><option>Stock</option><option>OT</option><option>Gasto general</option><option>Vehículo</option></select></div>
      <div class="cp-field"><label>OT asociada</label><input id="cp-ot" placeholder="Ej. 1568"></div>
      <div class="cp-field"><label>Observación</label><input id="cp-obs"></div>
    </div></div>
    <div class="cp-panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>Ítems del comprobante</b><button class="cp-btn" onclick="cpAddItem()">＋ Ítem</button></div><div style="overflow:auto"><table class="cp-items"><thead><tr><th>Descripción</th><th>Código</th><th>Rubro</th><th>Cant.</th><th>Unidad</th><th>P. unit. neto</th><th>IVA %</th><th>Total bruto</th><th></th></tr></thead><tbody id="cp-items-body"></tbody></table></div></div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div id="cp-totales" style="font:700 13px 'DM Mono',monospace"></div><div class="cp-actions"><button class="cp-btn" onclick="cpCloseCompra()">Cancelar</button><button class="cp-btn primary" onclick="cpGuardarCompra()">Guardar compra</button></div></div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#cp-file').addEventListener('change',e=>selectedFile=e.target.files?.[0]||null);
  modal.querySelector('#cp-fc').addEventListener('change',syncFC);

  const cfg=document.createElement('div'); cfg.id='cp-modal-ia'; cfg.className='cp-modal-bg';
  cfg.innerHTML=`<div class="cp-modal" style="max-width:650px"><div style="display:flex;justify-content:space-between"><h2>Configuración IA de comprobantes</h2><button class="cp-btn" onclick="cpCloseConfigIA()">✕</button></div><p style="font-size:12px;color:var(--text2)">Pegá la URL /exec del Apps Script incluido en la entrega. La clave de Gemini queda guardada en Apps Script, nunca en GitHub.</p><div class="cp-field"><label>URL Apps Script IA</label><input id="cp-ia-url" placeholder="https://script.google.com/macros/s/.../exec"></div><div style="margin-top:12px;text-align:right"><button class="cp-btn primary" onclick="cpSaveConfigIA()">Guardar</button></div></div>`;
  document.body.appendChild(cfg);
}

function syncFC(){
  const yes=document.getElementById('cp-fc').value==='si';
  const tipo=document.getElementById('cp-tipo');
  if(!yes) tipo.value='Sin comprobante';
  tipo.disabled=!yes;
}

function startListeners(){
  const listen=(name,key)=>onSnapshot(query(collection(db,name),orderBy('_ts','desc'),limit(1000)),s=>{C[key]=s.docs.map(d=>({id:d.id,...d.data()}));render();},()=>{
    onSnapshot(collection(db,name),s=>{C[key]=s.docs.map(d=>({id:d.id,...d.data()}));render();});
  });
  listen('compras','compras'); listen('articulosCompra','articulos'); listen('conteosStock','conteos'); listen('planesMateriales','planes');
}

function render(){
  if(window.currentPage!=='compras') return;
  const el=document.getElementById('cp-content'); if(!el)return;
  ({inicio:renderInicio,compras:renderCompras,conteo:renderConteo,articulos:renderArticulos,planes:renderPlanes,alertas:renderAlertas}[currentTab]||renderInicio)(el);
}

function purchaseItems(){ return C.compras.flatMap(c=>(c.items||[]).map(i=>({...i,compra:c}))); }
function latestCounts(){
  const map={}; [...C.conteos].sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))).forEach(c=>{(c.items||[]).forEach(i=>{if(!map[i.articuloId||i.descripcion])map[i.articuloId||i.descripcion]={...i,conteo:c};});}); return map;
}
function alerts(){
  const out=[]; const now=new Date();
  C.compras.forEach(c=>{
    if(c.fc==='no') out.push({level:'amber',title:`Compra sin factura: ${c.proveedor||'Sin proveedor'}`,text:`${fmtDate(c.fecha)} · ${money(c.totalBruto)} · solicitar comprobante.`});
    if(c.vencimiento){const dd=Math.ceil((new Date(c.vencimiento+'T12:00:00')-now)/86400000);if(dd<0)out.push({level:'red',title:`Pago vencido: ${c.proveedor}`,text:`Venció hace ${Math.abs(dd)} días · ${money(c.totalBruto)}`});else if(dd<=7)out.push({level:'amber',title:`Pago próximo: ${c.proveedor}`,text:`Vence en ${dd} días · ${money(c.totalBruto)}`});}
  });
  const counts=latestCounts(); C.articulos.forEach(a=>{const ct=counts[a.id]||counts[a.descripcion];const stock=num(ct?.cantidad);if(a.stockMinimo!=null&&stock<num(a.stockMinimo))out.push({level:'red',title:`Stock bajo: ${a.descripcion}`,text:`Quedan ${stock} ${a.unidad||''}; mínimo ${a.stockMinimo}.`});});
  priceAlerts().forEach(x=>out.push({level:'amber',title:`Cambio de precio: ${x.descripcion}`,text:`Último ${money(x.actual)} vs anterior ${money(x.anterior)} (${x.pct>0?'+':''}${x.pct.toFixed(1)}%).`}));
  return out;
}
function priceAlerts(){
  const groups={}; purchaseItems().forEach(x=>{const k=(x.articuloId||x.descripcion||'').toLowerCase();(groups[k]??=[]).push(x);}); const out=[];
  Object.values(groups).forEach(g=>{g.sort((a,b)=>String(b.compra.fecha||'').localeCompare(String(a.compra.fecha||'')));if(g.length>1){const a=num(g[0].precioUnitarioNeto),b=num(g[1].precioUnitarioNeto);if(a&&b){const pct=(a-b)/b*100;if(Math.abs(pct)>=12)out.push({descripcion:g[0].descripcion,actual:a,anterior:b,pct});}}}); return out;
}

function renderInicio(el){
  const month=todayISO().slice(0,7); const cm=C.compras.filter(x=>String(x.fecha||'').startsWith(month)); const total=cm.reduce((s,x)=>s+num(x.totalBruto),0); const nofc=cm.filter(x=>x.fc==='no'); const al=alerts();
  const factA=cm.filter(x=>x.fc==='si'&&x.tipoComprobante==='Factura A');const ivaA=factA.reduce((s,x)=>s+num(x.ivaTotal),0);
  el.innerHTML=`<div class="cp-grid"><div class="cp-card"><div class="cp-lbl">Compras del mes</div><div class="cp-kpi">${cm.length}</div><div class="cp-sub">${money(total)}</div></div><div class="cp-card"><div class="cp-lbl">Factura A</div><div class="cp-kpi" style="color:var(--green)">${factA.length}</div><div class="cp-sub">IVA informado ${money(ivaA)}</div></div><div class="cp-card"><div class="cp-lbl">Sin factura</div><div class="cp-kpi" style="color:var(--amber)">${nofc.length}</div><div class="cp-sub">${money(nofc.reduce((s,x)=>s+num(x.totalBruto),0))}</div></div><div class="cp-card"><div class="cp-lbl">Alertas activas</div><div class="cp-kpi" style="color:${al.length?'var(--red)':'var(--green)'}">${al.length}</div></div></div>
  <div class="cp-panel" style="margin-top:12px"><div style="display:flex;justify-content:space-between"><b>Prioridades de Caro</b><button class="cp-btn" onclick="cpTab('alertas')">Ver todas</button></div><div style="margin-top:10px">${al.slice(0,6).map(alertHTML).join('')||'<div class="cp-alert green">✅ No hay alertas críticas.</div>'}</div></div>
  <div class="cp-panel"><b>Clemen IA · lectura del período</b><div style="margin-top:10px;font-size:12px;color:var(--text2);line-height:1.8">${iaSummary(cm,al)}</div></div>`;
}
function iaSummary(cm,al){
  const total=cm.reduce((s,x)=>s+num(x.totalBruto),0), fa=cm.filter(x=>x.tipoComprobante==='Factura A'); const no=cm.filter(x=>x.fc==='no'); const pa=priceAlerts();
  const lines=[]; lines.push(`Este mes se registraron <b>${cm.length}</b> compras por <b>${money(total)}</b>.`); lines.push(`<b>${fa.length}</b> operaciones tienen Factura A y <b>${no.length}</b> no tienen comprobante asociado.`); if(pa.length)lines.push(`Detecté <b>${pa.length}</b> variaciones de precio superiores al 12%; conviene revisar antes de repetir la compra.`); if(al.some(a=>a.title.includes('Stock bajo')))lines.push('Hay materiales por debajo del mínimo. Revisá el conteo y las OT de la próxima semana.'); return lines.join('<br>');
}
function alertHTML(a){return `<div class="cp-alert ${a.level}"><div>${a.level==='red'?'🔴':'🟠'}</div><div><b>${esc(a.title)}</b><div class="cp-sub">${esc(a.text)}</div></div></div>`}

function renderCompras(el){
  const rows=C.compras.map(c=>`<tr><td>${fmtDate(c.fecha)}</td><td><b>${esc(c.proveedor)}</b></td><td><span class="cp-pill ${c.fc==='si'?'yes':'no'}">${c.fc==='si'?'Sí':'No'}</span></td><td>${esc(c.tipoComprobante||'')}</td><td>${esc(c.numeroComprobante||'')}</td><td>${(c.items||[]).length}</td><td>${money(c.totalNeto)}</td><td>${money(c.ivaTotal)}</td><td><b>${money(c.totalBruto)}</b></td><td>${esc(c.ot||'—')}</td><td><button class="cp-btn" onclick="cpEditCompra('${c.id}')">Editar</button> <button class="cp-btn danger" onclick="cpDeleteCompra('${c.id}')">Borrar</button></td></tr>`).join('');
  el.innerHTML=`<div class="cp-panel"><div class="cp-actions"><button class="cp-btn primary" onclick="cpNuevaCompra()">＋ Nueva compra</button><button class="cp-btn" onclick="cpExportCSV()">⬇ Exportar CSV</button></div></div><div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Fecha</th><th>Proveedor</th><th>FC</th><th>Tipo</th><th>Número</th><th>Ítems</th><th>Neto</th><th>IVA</th><th>Total</th><th>OT</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="11">Todavía no hay compras cargadas.</td></tr>'}</tbody></table></div>`;
}
function renderConteo(el){
  const arts=C.articulos.filter(a=>a.control!=='sin_stock'); const last=latestCounts();
  el.innerHTML=`<div class="cp-panel"><b>Conteo físico semanal</b><p class="cp-sub">Solo se informa lo que queda. El ERP calcula consumo real: stock inicial + compras − stock final.</p><div class="cp-row"><div class="cp-field"><label>Semana</label><input id="cp-count-week" value="${weekKey()}"></div><div class="cp-field"><label>Fecha de cierre</label><input id="cp-count-date" type="date" value="${todayISO()}"></div></div></div>
  <div class="cp-table-wrap"><table class="cp-table" style="min-width:720px"><thead><tr><th>Artículo</th><th>Tipo</th><th>Último conteo</th><th>Compras desde conteo</th><th>Planificado OT</th><th>Conteo actual</th><th>Consumo calculado</th></tr></thead><tbody>${arts.map(a=>countRow(a,last[a.id]||last[a.descripcion])).join('')||'<tr><td colspan="7">Primero cargá artículos controlados.</td></tr>'}</tbody></table></div><div style="margin-top:12px;text-align:right"><button class="cp-btn primary" onclick="cpSaveConteo()">Confirmar conteo semanal</button></div>`;
}
function countRow(a,prev){
  const ini=num(prev?.cantidad); const since=prev?.conteo?.fecha||'0000-00-00'; const compras=purchaseItems().filter(x=>(x.articuloId===a.id||x.descripcion===a.descripcion)&&String(x.compra.fecha||'')>since).reduce((s,x)=>s+num(x.cantidad),0); const plan=C.planes.filter(p=>p.estado!=='cerrado').flatMap(p=>p.items||[]).filter(i=>i.articuloId===a.id||i.descripcion===a.descripcion).reduce((s,i)=>s+num(i.cantidadPlanificada??i.cantidadSugerida),0);
  return `<tr data-count-row data-id="${a.id}" data-desc="${esc(a.descripcion)}" data-inicial="${ini}" data-compras="${compras}" data-plan="${plan}"><td><b>${esc(a.descripcion)}</b><div class="cp-sub">${esc(a.unidad||'')}</div></td><td>${esc(a.control||'estratégico')}</td><td>${ini}</td><td>+${compras}</td><td>${plan}</td><td><input class="cp-count-input" type="number" step="0.01" style="width:95px" oninput="cpCalcCountRow(this)"></td><td class="cp-consumo">—</td></tr>`;
}
function renderArticulos(el){
  el.innerHTML=`<div class="cp-panel"><div class="cp-row"><div class="cp-field"><label>Descripción</label><input id="cp-a-desc"></div><div class="cp-field"><label>Unidad</label><input id="cp-a-unit" placeholder="placa, tira, m², caja"></div><div class="cp-field"><label>Control</label><select id="cp-a-control"><option value="estrategico">Estratégico por OT</option><option value="consumible">Consumible por conteo</option><option value="sin_stock">Servicio / sin stock</option></select></div><div class="cp-field"><label>Stock mínimo</label><input id="cp-a-min" type="number" step="0.01"></div></div><div style="margin-top:9px"><button class="cp-btn primary" onclick="cpAddArticulo()">Agregar artículo</button></div></div><div class="cp-table-wrap"><table class="cp-table" style="min-width:760px"><thead><tr><th>Artículo</th><th>Unidad</th><th>Control</th><th>Mínimo</th><th>Último precio</th><th>Último stock</th><th></th></tr></thead><tbody>${C.articulos.map(a=>{const its=purchaseItems().filter(x=>x.articuloId===a.id||x.descripcion===a.descripcion).sort((x,y)=>String(y.compra.fecha).localeCompare(String(x.compra.fecha)));const ct=latestCounts()[a.id]||latestCounts()[a.descripcion];return `<tr><td><b>${esc(a.descripcion)}</b></td><td>${esc(a.unidad)}</td><td>${esc(a.control)}</td><td>${a.stockMinimo??0}</td><td>${its[0]?money(its[0].precioUnitarioNeto):'—'}</td><td>${ct?num(ct.cantidad):'—'}</td><td><button class="cp-btn danger" onclick="cpDeleteArticulo('${a.id}')">Borrar</button></td></tr>`}).join('')}</tbody></table></div>`;
}
function renderPlanes(el){
  const obraOpts=(window.DB?.obras||[]).map(o=>`<option value="${esc(o.ot||o.nro||'')}">${esc(o.ot||o.nro||'—')} · ${esc(o.cliente||'')} · ${esc(o.desc||o.descripcion||'')}</option>`).join('');
  el.innerHTML=`<div class="cp-panel"><b>Plan de materiales sugerido y corregido</b><p class="cp-sub">La IA propone desde la cotización y los históricos. Producción puede corregir antes de fabricar. El consumo real se obtiene del conteo semanal.</p><div class="cp-row"><div class="cp-field"><label>OT</label><select id="cp-plan-ot"><option value="">Seleccionar…</option>${obraOpts}</select></div><div class="cp-field"><label>Descripción/familia</label><input id="cp-plan-desc" placeholder="Marquesina, letras, tótem…"></div><div class="cp-field"><label>Estado</label><select id="cp-plan-status"><option>planificado</option><option>en producción</option><option>cerrado</option></select></div><div class="cp-field"><label>Origen</label><select id="cp-plan-source"><option>manual</option><option>IA</option><option>plantilla</option></select></div></div><div style="margin-top:9px"><button class="cp-btn primary" onclick="cpCreatePlan()">Crear plan</button></div></div>${C.planes.map(planCard).join('')||'<div class="cp-panel">Todavía no hay planes de materiales.</div>'}`;
}
function planCard(p){return `<div class="cp-panel"><div style="display:flex;justify-content:space-between"><div><b>OT ${esc(p.ot)} · ${esc(p.descripcion||'')}</b><div class="cp-sub">${esc(p.estado||'')} · origen ${esc(p.origen||'manual')}</div></div><button class="cp-btn" onclick="cpAddPlanItem('${p.id}')">＋ Material</button></div><div class="cp-table-wrap" style="margin-top:10px"><table class="cp-table" style="min-width:760px"><thead><tr><th>Material</th><th>Sugerido IA</th><th>Planificado</th><th>Unidad</th><th>Confianza</th><th></th></tr></thead><tbody>${(p.items||[]).map((i,ix)=>`<tr><td>${esc(i.descripcion)}</td><td>${i.cantidadSugerida??0}</td><td><input type="number" step="0.01" value="${i.cantidadPlanificada??i.cantidadSugerida??0}" style="width:90px" onchange="cpUpdatePlanQty('${p.id}',${ix},this.value)"></td><td>${esc(i.unidad||'')}</td><td>${i.confianza??0}%</td><td><button class="cp-btn danger" onclick="cpRemovePlanItem('${p.id}',${ix})">✕</button></td></tr>`).join('')||'<tr><td colspan="6">Sin materiales.</td></tr>'}</tbody></table></div></div>`}
function renderAlertas(el){const al=alerts();el.innerHTML=`<div class="cp-panel"><b>Alertas visuales y avisos</b><p class="cp-sub">Se generan desde comprobantes, vencimientos, stock mínimo, planes de OT e historial de precios.</p></div>${al.map(alertHTML).join('')||'<div class="cp-alert green">✅ Sin alertas activas.</div>'}`}

window.cpTab=t=>{currentTab=t;document.querySelectorAll('.cp-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));render();};
window.cpNuevaCompra=()=>{compraEditId=null;selectedFile=null;document.getElementById('cp-modal-compra').classList.add('open');const file=document.getElementById('cp-file');if(file)file.value='';['cp-proveedor','cp-numero','cp-ot','cp-obs','cp-vencimiento'].forEach(id=>document.getElementById(id).value='');document.getElementById('cp-fecha').value=todayISO();document.getElementById('cp-fc').value='si';document.getElementById('cp-tipo').value='Factura A';document.getElementById('cp-items-body').innerHTML='';cpAddItem();syncFC();calcTotals();};
window.cpCloseCompra=()=>document.getElementById('cp-modal-compra').classList.remove('open');
window.cpAddItem=(data={})=>{
  const tr=document.createElement('tr'); tr.innerHTML=`<td><input class="i-desc" value="${esc(data.descripcion||'')}"></td><td><input class="i-code" value="${esc(data.codigo||'')}"></td><td><input class="i-rubro" value="${esc(data.rubro||'')}"></td><td><input class="i-qty" type="number" step="0.01" value="${data.cantidad??1}"></td><td><input class="i-unit" value="${esc(data.unidad||'unidad')}"></td><td><input class="i-price" type="number" step="0.01" value="${data.precioUnitarioNeto??0}"></td><td><input class="i-iva" type="number" step="0.01" value="${data.ivaPorcentaje??21}"></td><td class="i-total">${money(0)}</td><td><button class="cp-btn danger" onclick="this.closest('tr').remove();cpCalcTotals()">✕</button></td>`;
  tr.querySelectorAll('input').forEach(i=>i.addEventListener('input',calcTotals)); document.getElementById('cp-items-body').appendChild(tr); calcTotals();
};
window.cpCalcTotals=()=>calcTotals();
function rowToItem(tr){
  const q=num(tr.querySelector('.i-qty').value), p=num(tr.querySelector('.i-price').value), iva=num(tr.querySelector('.i-iva').value), net=q*p;
  return {descripcion:tr.querySelector('.i-desc').value.trim(),codigo:tr.querySelector('.i-code').value.trim(),rubro:tr.querySelector('.i-rubro').value.trim(),cantidad:q,unidad:tr.querySelector('.i-unit').value.trim(),precioUnitarioNeto:p,ivaPorcentaje:iva,totalNeto:net,ivaImporte:net*iva/100,totalBruto:net*(1+iva/100)};
}
function getItems(){return [...document.querySelectorAll('#cp-items-body tr')].map(rowToItem).filter(i=>i.descripcion);}
function calcTotals(){
  const rows=[...document.querySelectorAll('#cp-items-body tr')];
  rows.forEach(tr=>{const i=rowToItem(tr);tr.querySelector('.i-total').textContent=money(i.totalBruto);});
  const items=rows.map(rowToItem).filter(i=>i.descripcion),net=items.reduce((s,i)=>s+i.totalNeto,0),iva=items.reduce((s,i)=>s+i.ivaImporte,0);
  const el=document.getElementById('cp-totales');if(el)el.textContent=`Neto ${money(net)} · IVA ${money(iva)} · TOTAL ${money(net+iva)}`;
}
window.cpGuardarCompra=async()=>{
  const items=getItems(); if(!items.length)return toast('Agregá al menos un ítem.'); const fc=document.getElementById('cp-fc').value; const data={fecha:document.getElementById('cp-fecha').value,semana:weekKey(new Date(document.getElementById('cp-fecha').value+'T12:00:00')),proveedor:document.getElementById('cp-proveedor').value.trim(),fc,tipoComprobante:fc==='si'?document.getElementById('cp-tipo').value:'Sin comprobante',numeroComprobante:document.getElementById('cp-numero').value.trim(),medioPago:document.getElementById('cp-medio').value,vencimiento:document.getElementById('cp-vencimiento').value,destino:document.getElementById('cp-destino').value,ot:document.getElementById('cp-ot').value.trim(),observacion:document.getElementById('cp-obs').value.trim(),items,totalNeto:items.reduce((s,i)=>s+i.totalNeto,0),ivaTotal:items.reduce((s,i)=>s+i.ivaImporte,0),totalBruto:items.reduce((s,i)=>s+i.totalBruto,0),usuario:window.currentUser?.email||'',_ts:serverTimestamp()};
  if(!data.proveedor)return toast('Ingresá el proveedor.');
  if(compraEditId)await updateDoc(doc(db,'compras',compraEditId),data);else await addDoc(collection(db,'compras'),data);
  cpCloseCompra();toast('Compra guardada por ítem.');
};
window.cpEditCompra=id=>{const c=C.compras.find(x=>x.id===id);if(!c)return;cpNuevaCompra();compraEditId=id;document.getElementById('cp-fecha').value=c.fecha||todayISO();document.getElementById('cp-proveedor').value=c.proveedor||'';document.getElementById('cp-fc').value=c.fc||'si';document.getElementById('cp-tipo').value=c.tipoComprobante||'Factura A';document.getElementById('cp-numero').value=c.numeroComprobante||'';document.getElementById('cp-medio').value=c.medioPago||'Transferencia';document.getElementById('cp-vencimiento').value=c.vencimiento||'';document.getElementById('cp-destino').value=c.destino||'Stock';document.getElementById('cp-ot').value=c.ot||'';document.getElementById('cp-obs').value=c.observacion||'';document.getElementById('cp-items-body').innerHTML='';(c.items||[]).forEach(cpAddItem);syncFC();calcTotals();};
window.cpDeleteCompra=async id=>{if(confirm('¿Borrar esta compra?'))await deleteDoc(doc(db,'compras',id));};
window.cpAddArticulo=async()=>{const descripcion=document.getElementById('cp-a-desc').value.trim();if(!descripcion)return toast('Ingresá una descripción.');await addDoc(collection(db,'articulosCompra'),{descripcion,unidad:document.getElementById('cp-a-unit').value.trim(),control:document.getElementById('cp-a-control').value,stockMinimo:num(document.getElementById('cp-a-min').value),_ts:serverTimestamp()});toast('Artículo agregado.');};
window.cpDeleteArticulo=async id=>{if(confirm('¿Borrar artículo?'))await deleteDoc(doc(db,'articulosCompra',id));};
window.cpCalcCountRow=input=>{const tr=input.closest('tr'),final=num(input.value),cons=num(tr.dataset.inicial)+num(tr.dataset.compras)-final;tr.querySelector('.cp-consumo').textContent=isNaN(cons)?'—':cons;};
window.cpSaveConteo=async()=>{const items=[...document.querySelectorAll('[data-count-row]')].map(tr=>{const raw=tr.querySelector('.cp-count-input').value;if(raw==='')return null;const cantidad=num(raw);return {articuloId:tr.dataset.id,descripcion:tr.dataset.desc,cantidad,stockInicial:num(tr.dataset.inicial),comprasPeriodo:num(tr.dataset.compras),planificadoOT:num(tr.dataset.plan),consumoReal:num(tr.dataset.inicial)+num(tr.dataset.compras)-cantidad};}).filter(Boolean);if(!items.length)return toast('Ingresá al menos un conteo.');await addDoc(collection(db,'conteosStock'),{semana:document.getElementById('cp-count-week').value,fecha:document.getElementById('cp-count-date').value,items,usuario:window.currentUser?.email||'',_ts:serverTimestamp()});toast('Conteo guardado. Consumos calculados automáticamente.');};
window.cpCreatePlan=async()=>{const ot=document.getElementById('cp-plan-ot').value;if(!ot)return toast('Seleccioná una OT.');await addDoc(collection(db,'planesMateriales'),{ot,descripcion:document.getElementById('cp-plan-desc').value.trim(),estado:document.getElementById('cp-plan-status').value,origen:document.getElementById('cp-plan-source').value,items:[],_ts:serverTimestamp()});toast('Plan creado.');};
window.cpAddPlanItem=async id=>{const p=C.planes.find(x=>x.id===id);const desc=prompt('Material:');if(!desc)return;const art=C.articulos.find(a=>a.descripcion.toLowerCase()===desc.toLowerCase());const q=num(prompt('Cantidad sugerida:',1));const items=[...(p.items||[]),{articuloId:art?.id||'',descripcion:desc,unidad:art?.unidad||'',cantidadSugerida:q,cantidadPlanificada:q,confianza:art?80:50}];await updateDoc(doc(db,'planesMateriales',id),{items});};
window.cpUpdatePlanQty=async(id,ix,val)=>{const p=C.planes.find(x=>x.id===id),items=[...(p.items||[])];items[ix]={...items[ix],cantidadPlanificada:num(val),modificadoManualmente:true};await updateDoc(doc(db,'planesMateriales',id),{items});};
window.cpRemovePlanItem=async(id,ix)=>{const p=C.planes.find(x=>x.id===id),items=(p.items||[]).filter((_,i)=>i!==ix);await updateDoc(doc(db,'planesMateriales',id),{items});};
window.cpOpenConfigIA=()=>{document.getElementById('cp-ia-url').value=localStorage.getItem('tizComprasIaUrl')||'';document.getElementById('cp-modal-ia').classList.add('open');};
window.cpCloseConfigIA=()=>document.getElementById('cp-modal-ia').classList.remove('open');
window.cpSaveConfigIA=()=>{localStorage.setItem('tizComprasIaUrl',document.getElementById('cp-ia-url').value.trim());cpCloseConfigIA();toast('Configuración IA guardada.');};
window.cpAnalizarIA=async()=>{
  if(!selectedFile)return toast('Seleccioná una foto o PDF.');
  const url=(localStorage.getItem('tizComprasIaUrl')||'').trim();
  if(!url){cpOpenConfigIA();return toast('Primero configurá la URL del Apps Script IA.');}

  const button=document.querySelector('[onclick="cpAnalizarIA()"]');
  const originalText=button?.textContent||'✨ Analizar comprobante';
  if(button){button.disabled=true;button.textContent='⏳ Analizando…';}

  let iframe,form,timer;
  const requestId='cpia-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const cleanup=()=>{
    clearTimeout(timer);
    window.removeEventListener('message',onMessage);
    setTimeout(()=>{iframe?.remove();form?.remove();},250);
    if(button){button.disabled=false;button.textContent=originalText;}
  };
  const onMessage=event=>{
    const allowed=event.origin==='https://script.google.com'||event.origin==='https://script.googleusercontent.com';
    if(!allowed)return;
    let payload=event.data;
    if(typeof payload==='string'){try{payload=JSON.parse(payload);}catch{return;}}
    if(!payload||payload.source!=='TIZ_IA_COMPRAS'||payload.requestId!==requestId)return;
    cleanup();
    if(!payload.ok){console.error('[TIZ IA]',payload);return toast('Error IA: '+(payload.error||'No se pudo analizar'));}
    applyAI(payload.data||{});
    toast('Lectura IA completa. Revisá y confirmá.');
  };

  try{
    toast('Analizando comprobante…');
    const base64=await fileToBase64(selectedFile);
    iframe=document.createElement('iframe');
    iframe.name='cp-ia-frame-'+requestId;
    iframe.style.display='none';
    document.body.appendChild(iframe);

    form=document.createElement('form');
    form.method='POST';
    form.action=url;
    form.target=iframe.name;
    form.style.display='none';
    const fields={action:'analyzeExpense',requestId,filename:selectedFile.name,mimeType:selectedFile.type||'application/octet-stream',dataBase64:base64};
    Object.entries(fields).forEach(([name,value])=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);});
    document.body.appendChild(form);
    window.addEventListener('message',onMessage);
    timer=setTimeout(()=>{cleanup();toast('La IA tardó demasiado. Probá con una foto JPG o un PDF más liviano.');},90000);
    form.submit();
  }catch(e){
    cleanup();
    console.error('[TIZ IA]',e);
    toast('Error IA: '+(e?.message||e));
  }
};
function fileToBase64(f){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=no;r.readAsDataURL(f);});}
function applyAI(d){document.getElementById('cp-proveedor').value=d.proveedor||'';document.getElementById('cp-fecha').value=d.fecha||todayISO();document.getElementById('cp-fc').value=d.fc===false?'no':'si';document.getElementById('cp-tipo').value=d.tipoComprobante||'Factura A';document.getElementById('cp-numero').value=d.numeroComprobante||'';document.getElementById('cp-items-body').innerHTML='';(d.items||[]).forEach(cpAddItem);if(!(d.items||[]).length)cpAddItem();syncFC();calcTotals();}
window.cpExportCSV=()=>{const h=['Fecha','Semana','Proveedor','FC','Tipo FC','Nro FC','Código','Descripción','Rubro','Cantidad','Unidad','P.Unit.Neto','Total Neto','IVA','Total Bruto','Medio Pago','Vencimiento','Destino','OT'];const rows=C.compras.flatMap(c=>(c.items||[]).map(i=>[c.fecha,c.semana,c.proveedor,c.fc,c.tipoComprobante,c.numeroComprobante,i.codigo,i.descripcion,i.rubro,i.cantidad,i.unidad,i.precioUnitarioNeto,i.totalNeto,i.ivaImporte,i.totalBruto,c.medioPago,c.vencimiento,c.destino,c.ot]));const csv=[h,...rows].map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv'}));a.download='compras_detalladas.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};

// Integración con navegación existente
const oldGoTo=window.goTo;
window.goTo=function(page){if(oldGoTo)oldGoTo(page);if(page==='compras'){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById('page-compras')?.classList.add('active');document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.cpNav==='1'));window.currentPage='compras';render();}};

injectStyles();injectUI();startListeners();
console.info('[TIZ Compras V21 FINAL] módulo cargado y verificado');
