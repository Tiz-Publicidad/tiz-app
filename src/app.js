import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBkTVxyE0Qd6SBTw5jf-hdn1aCP5Y9g42E",
  authDomain: "tiz---app.firebaseapp.com",
  projectId: "tiz---app",
  storageBucket: "tiz---app.firebasestorage.app",
  messagingSenderId: "52620104053",
  appId: "1:52620104053:web:d62bf8b7ca296581f1833c",
  measurementId: "G-EXPT46ZFJT"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ hd: 'tizpublicidad.com' });

// ============================================================
// ROLES / PUESTOS OPERATIVOS
// ============================================================
// La app valida por email, pero en pantalla y permisos trabaja por puesto.
// Para sumar/quitar usuarios, modificar solo este mapa.
const USER_ROLE_MAP = {
  'info@tizpublicidad.com':              'Admin',
  'giancarlo.pareja@gmail.com':          'Admin',
  'pablo.aciar@tizpublicidad.com':       'Producción',
  'julieta.aguirre@tizpublicidad.com':   'Diseño',
  'carolina.flores@tizpublicidad.com':   'Compras',
  'arielbenitezpublicidad@gmail.com':    'Colocaciones',
  // Agregar aquí el email real de cobranzas:
  // 'cobranzas@tizpublicidad.com':      'Cobranzas',
};

const ROLE_LABELS = {
  'Admin':'Admin','Ventas':'Ventas','Compras':'Compras','Producción':'Producción',
  'Diseño':'Diseño','Colocaciones':'Colocaciones','Cobranzas':'Cobranzas'
};

const ROLE_HOME = {
  'Admin':'dashboard',
  'Ventas':'obras',
  'Compras':'obras',
  'Producción':'produccion',
  'Diseño':'diseno',
  'Colocaciones':'colocaciones',
  'Cobranzas':'cobranzas'
};

const ROLE_PAGES = {
  'Admin':['dashboard','obras','semana','produccion','colocaciones','diseno','cobranzas','presupuestos','clientes','tareas','retenciones','vendedores','estadistica'],
  'Ventas':['dashboard','obras','semana','presupuestos','clientes','tareas','vendedores'],
  'Compras':['dashboard','obras','semana','produccion','colocaciones','tareas'],
  'Producción':['dashboard','obras','semana','produccion','diseno','tareas'],
  'Diseño':['dashboard','obras','semana','diseno','tareas'],
  'Colocaciones':['dashboard','obras','semana','colocaciones','tareas'],
  'Cobranzas':['dashboard','obras','cobranzas','clientes','retenciones','tareas']
};

const ROLE_ACTIONS = {
  'Admin':['obra:create','obra:edit','obra:delete','cliente:edit','presupuesto:edit','cobranza:edit','retencion:edit','tarea:edit','exportar'],
  'Ventas':['obra:create','cliente:edit','presupuesto:edit','tarea:edit','exportar'],
  'Compras':['obra:note','tarea:edit'],
  'Producción':['obra:status','obra:note','tarea:edit'],
  'Diseño':['obra:status','obra:note','tarea:edit'],
  'Colocaciones':['obra:status','obra:note','tarea:edit'],
  'Cobranzas':['cobranza:edit','retencion:edit','tarea:edit','exportar']
};

const SECTOR_COLORS = {
  'Admin':'var(--accent)','Ventas':'var(--amber)','Producción':'var(--blue)',
  'Colocaciones':'var(--teal)','Diseño':'var(--purple)','Compras':'var(--accent)',
  'Cobranzas':'var(--green)'
};
const SECTOR_EMOJI = {
  'Admin':'🛡️','Ventas':'💰','Producción':'📦','Colocaciones':'🚛','Diseño':'✏️','Compras':'🛒','Cobranzas':'💵'
};

window.currentUser = null;
window.USER_ROLE_MAP = USER_ROLE_MAP;
window.ROLE_PAGES = ROLE_PAGES;
window.ROLE_ACTIONS = ROLE_ACTIONS;

function getUserRole(email) {
  if (USER_ROLE_MAP[email]) return USER_ROLE_MAP[email];
  const local = (email||'').split('@')[0].toLowerCase();
  if (local.includes('admin') || local.includes('info')) return 'Admin';
  if (local.includes('cob')) return 'Cobranzas';
  if (local.includes('prod')) return 'Producción';
  if (local.includes('col')) return 'Colocaciones';
  if (local.includes('dis') || local.includes('design')) return 'Diseño';
  if (local.includes('comp')) return 'Compras';
  if (local.includes('vent') || local.includes('comercial')) return 'Ventas';
  return 'Ventas';
}

function roleHasAction(action) {
  const role = window.currentUser?.role || window.currentUser?.sector;
  return !!role && (ROLE_ACTIONS[role] || []).includes(action);
}

window.canViewPage = page => {
  const role = window.currentUser?.role || window.currentUser?.sector;
  if (!role) return false;
  return (ROLE_PAGES[role] || []).includes(page);
};
window.canAction = roleHasAction;
window.canEditFechasCompromiso = () => roleHasAction('obra:edit') || roleHasAction('obra:status');
window.canAnnotateSector = s => {
  if (!window.currentUser) return false;
  const role = window.currentUser.role || window.currentUser.sector;
  if (role === 'Admin') return true;
  if (role === s) return true;
  if (role === 'Compras' && (s === 'Compras' || s === 'Colocaciones' || s === 'Producción')) return true;
  if (role === 'Ventas' && s === 'Ventas') return true;
  if (role === 'Cobranzas' && s === 'Ventas') return true;
  return false;
};
window.canEditObra = () => roleHasAction('obra:edit') || roleHasAction('obra:create') || roleHasAction('obra:status') || roleHasAction('obra:note');
window.isAdmin = () => (window.currentUser?.role || window.currentUser?.sector) === 'Admin';

function getHomeForCurrentRole() {
  const role = window.currentUser?.role || window.currentUser?.sector || 'Ventas';
  return ROLE_HOME[role] || 'dashboard';
}

function applyRoleUI() {
  const role = window.currentUser?.role || window.currentUser?.sector;
  if (!role) return;
  document.querySelectorAll('.nav-item[onclick^="goTo"]').forEach(btn => {
    const m = btn.getAttribute('onclick')?.match(/goTo\('([^']+)'\)/);
    if (!m) return;
    btn.style.display = window.canViewPage(m[1]) ? 'flex' : 'none';
  });
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = role === 'Admin' ? '' : 'none';
  });
  // Botones de creación por rol
  document.querySelectorAll('[onclick*="openModal(\'obra\')"]').forEach(el => el.style.display = roleHasAction('obra:create') || roleHasAction('obra:edit') ? '' : 'none');
  document.querySelectorAll('[onclick*="openModal(\'presupuesto\')"]').forEach(el => el.style.display = roleHasAction('presupuesto:edit') ? '' : 'none');
  document.querySelectorAll('[onclick*="openModal(\'cliente\')"]').forEach(el => el.style.display = roleHasAction('cliente:edit') ? '' : 'none');
  document.querySelectorAll('[onclick*="openModal(\'cobranza\')"]').forEach(el => el.style.display = roleHasAction('cobranza:edit') ? '' : 'none');
  document.querySelectorAll('[onclick*="openModal(\'retencion\')"]').forEach(el => el.style.display = roleHasAction('retencion:edit') ? '' : 'none');
}

// ============================================================
// AUTH SCREEN
// ============================================================
function showLoginScreen() {
  document.querySelector('.app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}
function hideLoginScreen() {
  document.querySelector('.app').style.display = 'flex';
  document.getElementById('login-screen').style.display = 'none';
}

window.doLogin = async () => {
  try {
    // Ariel usa Gmail personal, no forzamos dominio corporativo
    const providerFlex = new GoogleAuthProvider();
    await signInWithPopup(auth, providerFlex);
  } catch(e) {
    document.getElementById('login-err').textContent = 'Error al iniciar sesión: ' + e.message;
  }
};
window.doLogout = async () => { await signOut(auth); };

onAuthStateChanged(auth, async user => {
  if (user) {
    // Validar que el email esté en la lista autorizada
    const allowed = Object.keys(USER_ROLE_MAP);
    if (!allowed.includes(user.email)) {
      await signOut(auth);
      document.getElementById('login-err').textContent =
        `La cuenta ${user.email} no tiene acceso a esta app. Contactá a info@tizpublicidad.com`;
      showLoginScreen();
      return;
    }
    const role = getUserRole(user.email);
    window.currentUser = {
      email: user.email,
      name: user.displayName,
      photo: user.photoURL,
      role,
      // sector se mantiene por compatibilidad con funciones existentes
      sector: role,
      isAdmin: role === 'Admin',
    };
    hideLoginScreen();
    updateUserUI();
    initListeners();
  } else {
    window.currentUser = null;
    showLoginScreen();
  }
});

function updateUserUI() {
  const u = window.currentUser;
  if (!u) return;
  const role = u.role || u.sector;
  const color = SECTOR_COLORS[role] || 'var(--accent)';
  const nameEl = document.getElementById('user-name');
  const sectorEl = document.getElementById('user-sector');
  if (nameEl) nameEl.textContent = `${SECTOR_EMOJI[role] || ''} ${ROLE_LABELS[role] || role}`;
  if (sectorEl) {
    sectorEl.textContent = 'Puesto operativo';
    sectorEl.style.color = color;
  }
  const avatar = document.getElementById('user-avatar');
  if (avatar) avatar.style.display = 'none';
  applyRoleUI();
  const home = getHomeForCurrentRole();
  if (window.currentPage === 'dashboard' && home !== 'dashboard') {
    setTimeout(() => window.goTo(home), 100);
  }
}

// ============================================================
// ESTADO GLOBAL
// ============================================================
function getSemanaActual() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = date.getUTCDay() || 7; // lunes=1, domingo=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

window.DB = { obras:[], clientes:[], presupuestos:[], retenciones:[], cobranzas:[], tareas:[] };
window.currentSem = getSemanaActual();
window.currentPage = 'dashboard';
window.obrasSemana = new Set();
window.cobTab = 'pendientes';
window.obrasSectorFilter = 'Todos';
window.editingId = { obra:null, cliente:null, presupuesto:null, retencion:null, cobranza:null, tarea:null };

function initListeners() {
  function listen(col, key) {
    onSnapshot(collection(db, col), snap => {
      window.DB[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      refreshCurrent();
    });
  }
  listen('obras', 'obras');
  listen('clientes', 'clientes');
  listen('presupuestos', 'presupuestos');
  listen('retenciones', 'retenciones');
  listen('cobranzas', 'cobranzas');
  listen('tareas', 'tareas');
  document.getElementById('sync-text').textContent = 'En línea';
}

// CRUD helpers
window.addDoc_    = async (col_, data) => { const ref = await addDoc(collection(db, col_), { ...data, _ts: serverTimestamp() }); return ref; };
window.updateDoc_ = async (col_, id, data) => { await updateDoc(doc(db, col_, id), data); };
window.deleteDoc_ = async (col_, id)   => { await deleteDoc(doc(db, col_, id)); };

// Helpers
function parseDate(s) { if (!s) return null; const [d,m,y] = s.split('/'); return new Date(+y,+m-1,+d); }
function diasEntre(a, b) { const da=parseDate(a), db_=parseDate(b); if(!da||!db_) return null; return Math.round((db_-da)/(864e5)); }
function diasDesdeHoy(s) { const d=parseDate(s); if(!d) return null; return Math.round((new Date()-d)/(864e5)); }
function semaforo(fc, fr) {
  if (fr) { const d=diasEntre(fc,fr); return d===null?'n':d<=0?'g':'r'; }
  const d=diasDesdeHoy(fc); if(d===null) return 'n';
  return d<-3?'g':d<0?'a':'r';
}
function fmtM(n) { if(!n&&n!==0) return '-'; n=+n; if(n>=1e6) return '$'+Math.round(n/1e5)/10+'M'; if(n>=1000) return '$'+Math.round(n/1000)+'K'; return '$'+Math.round(n); }
function hasNotas(o) {
  const n = o.notas_sector || {};
  return ['Producción','Colocaciones','Diseño','Ventas','Compras'].some(s => n[s] && n[s].trim());
}
function notasPreview(o) {
  const n = o.notas_sector || {};
  return ['Producción','Colocaciones','Diseño','Ventas','Compras']
    .filter(s => n[s] && n[s].trim())
    .map(s => `<div style="margin-bottom:4px"><span style="font-size:10px;font-weight:500;color:${SECTOR_COLORS[s]}">${SECTOR_EMOJI[s]} ${s}:</span> <span style="font-size:11px;color:var(--text2)">${n[s]}</span> <span style="font-size:10px;color:var(--text3)">${n[s+'_ts']||''}</span></div>`)
    .join('');
}
function semBadge(fc, fr) {
  const s=semaforo(fc,fr);
  const map={g:'green',a:'amber',r:'red',n:'gray'};
  const lbl={g:'En fecha',a:'Riesgo',r:'Vencido',n:'Sin fecha'};
  return `<span class="badge badge-${map[s]}">${lbl[s]}</span>`;
}
function estadoBadge(e) {
  const map={'Presupuestado':'gray','Aprobado':'blue','En producción':'amber','Entregado':'teal','Facturado':'purple','Cobrado':'green'};
  return `<span class="badge badge-${map[e]||'gray'}">${e}</span>`;
}
function pct(works, tipo) {
  const cf = works.filter(w => tipo==='prod'?w.fprod_c:w.fcol_c);
  if (!cf.length) return null;
  const ok = cf.filter(w => semaforo(tipo==='prod'?w.fprod_c:w.fcol_c, tipo==='prod'?w.fprod_r:w.fcol_r)==='g');
  return Math.round(ok.length/cf.length*100);
}

// Navigation
window.goTo = function(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.querySelector(`[onclick="goTo('${page}')"]`).classList.add('active');
  window.currentPage = page;
  refreshCurrent();
};

window.refreshCurrent = function() {
  const p = window.currentPage;
  if (p==='dashboard') renderDashboard();
  else if (p==='obras') renderObras();
  else if (p==='semana') renderSemana();
  else if (p==='produccion') renderProduccion();
  else if (p==='colocaciones') renderColocaciones();
  else if (p==='diseno') renderDiseno();
  else if (p==='cobranzas') renderCobranzas();
  else if (p==='presupuestos') renderPresupuestos();
  else if (p==='clientes') renderClientes();
  else if (p==='retenciones') renderRetenciones();
  else if (p==='vendedores') renderVendedores();
  updateBadges();
};

window.moveSem = function(d) {
  window.currentSem = Math.max(1, Math.min(52, window.currentSem + d));
  ['dash-sem','sem-label','prod-sem','col-sem'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent='Sem '+window.currentSem; });
  refreshCurrent();
};

// Inicializar labels de semana con la semana actual
setTimeout(() => {
  ['dash-sem','sem-label','prod-sem','col-sem'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.textContent = 'Sem ' + window.currentSem;
  });
}, 100);

function updateBadges() {
  const venc = window.DB.cobranzas.filter(c => c.estado==='Pendiente' && diasDesdeHoy(c.vencimiento) >= 0).length;
  document.getElementById('badge-cobr').textContent = venc || '';
  document.getElementById('badge-cobr').style.display = venc ? '' : 'none';
}

// DASHBOARD
function renderDashboard() {
  const obras = window.DB.obras;
  const sem = window.currentSem;
  const semObras = obras.filter(o => +o.semana === sem);
  const activas = obras.filter(o => o.estado==='En producción'||o.estado==='Aprobado');
  const termSem = semObras.filter(o => o.fprod_r || o.estado==='Entregado'||o.estado==='Facturado'||o.estado==='Cobrado');
  const pctP = pct(obras.filter(o=>o.fprod_c), 'prod');
  const pctC = pct(obras.filter(o=>o.fcol_c), 'col');
  const venc = obras.filter(o => semaforo(o.fprod_c,o.fprod_r)==='r').length;
  const totalVentaSem = semObras.reduce((a,o)=>a+(+o.neto||0),0);

  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('es-AR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  document.getElementById('dash-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Ventas sem. ${sem}</div><div class="kpi-val">${fmtM(totalVentaSem)}</div><div class="kpi-sub">${semObras.length} obras</div></div>
    <div class="kpi"><div class="kpi-label">Activas total</div><div class="kpi-val">${activas.length}</div><div class="kpi-sub">en producción o aprobadas</div></div>
    <div class="kpi"><div class="kpi-label">Cumpl. producción</div><div class="kpi-val ${pctP===null?'':pctP>=80?'green':pctP>=60?'amber':'red'}">${pctP===null?'—':pctP+'%'}</div><div class="kpi-sub">acumulado global</div></div>
    <div class="kpi"><div class="kpi-label">Cumpl. colocación</div><div class="kpi-val ${pctC===null?'':pctC>=80?'green':pctC>=60?'amber':'red'}">${pctC===null?'—':pctC+'%'}</div><div class="kpi-sub">acumulado global</div></div>
    <div class="kpi"><div class="kpi-label">Alertas prod.</div><div class="kpi-val ${venc>0?'red':''}">${venc}</div><div class="kpi-sub">vencidas o en riesgo</div></div>
  `;

  const SECTORS = ['Producción','Colocaciones','Diseño','Ventas','Compras'];
  const COLORS = {'Producción':'var(--blue)','Colocaciones':'var(--teal)','Diseño':'var(--purple)','Ventas':'var(--amber)','Compras':'var(--accent)'};
  document.getElementById('dash-sectors').innerHTML = SECTORS.map(sec => {
    const sw = semObras.filter(o=>o.sector===sec);
    const term = sw.filter(o=>o.fprod_r||['Entregado','Facturado','Cobrado'].includes(o.estado));
    const neto = term.reduce((a,o)=>a+(+o.neto||0),0);
    const p = sw.length ? Math.round(term.length/sw.length*100) : 0;
    return `<div class="sector-card">
      <div class="sector-card-name" style="color:${COLORS[sec]}">${sec}</div>
      <div class="sector-card-num" style="color:${COLORS[sec]}">${term.length}<span style="font-size:15px;color:var(--text3)">/${sw.length}</span></div>
      <div class="sector-card-money">${fmtM(neto)}</div>
      <div class="progress" style="margin-top:8px"><div class="progress-fill" style="width:${p}%;background:${COLORS[sec]}"></div></div>
    </div>`;
  }).join('');

  const alertas = obras.filter(o => {
    const sp=semaforo(o.fprod_c,o.fprod_r); const sc=semaforo(o.fcol_c,o.fcol_r);
    return sp==='r'||sp==='a'||sc==='r'||sc==='a';
  }).slice(0,10);
  document.getElementById('dash-alertas').innerHTML = alertas.length ? alertas.map(o => {
    const sp=semaforo(o.fprod_c,o.fprod_r); const sc=semaforo(o.fcol_c,o.fcol_r);
    const dias = diasEntre(o.fprod_c, o.fprod_r||new Date().toLocaleDateString('es-AR'));
    return `<tr>
      <td class="strong">${o.ot||'—'}</td><td class="strong">${o.desc||''}</td><td>${o.cliente||''}</td>
      <td><span style="color:var(--blue)">${o.sector||''}</span></td>
      <td>${sp!=='g'&&sp!=='n'?`<span>Prod: ${semBadge(o.fprod_c,o.fprod_r)}</span>`:''}${sc!=='g'&&sc!=='n'?`<span>Col: ${semBadge(o.fcol_c,o.fcol_r)}</span>`:''}</td>
      <td>${dias!==null?Math.abs(dias)+'d':'—'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin alertas activas</td></tr>';
}

// OBRAS
window.renderObras = function() {
  const SECTORS = ['Todos','Producción','Colocaciones','Diseño','Ventas','Compras'];
  document.getElementById('obras-sectors').innerHTML = SECTORS.map(s =>
    `<button class="sector-tab ${window.obrasSectorFilter===s?'active':''}" onclick="setObrasSector('${s}')">${s}</button>`
  ).join('');

  let obras = window.DB.obras;
  if (window.obrasSectorFilter!=='Todos') obras = obras.filter(o=>o.sector===window.obrasSectorFilter);
  const estado = document.getElementById('filter-estado')?.value;
  const cli = document.getElementById('filter-cliente')?.value.toLowerCase();
  const otQ = document.getElementById('filter-ot')?.value.toLowerCase();
  const semDesde = +document.getElementById('filter-semana-desde')?.value||0;
  const semHasta = +document.getElementById('filter-semana-hasta')?.value||0;
  if (estado) obras = obras.filter(o=>o.estado===estado);
  if (cli) obras = obras.filter(o=>(o.cliente||'').toLowerCase().includes(cli));
  if (otQ) obras = obras.filter(o=>(o.ot||'').toLowerCase().includes(otQ)||(o.desc||'').toLowerCase().includes(otQ));
  if (semDesde) obras = obras.filter(o=>(+o.semana||0)>=semDesde);
  if (semHasta) obras = obras.filter(o=>(+o.semana||0)<=semHasta);
  obras = obras.sort((a,b)=>(+b.semana||0)-(+a.semana||0));

  document.getElementById('obras-count').textContent = obras.length + ' obras';
  document.getElementById('obras-tbody').innerHTML = obras.length ? obras.map(o => {
    const dt = diasEntre(o.fprod_r||o.fprod_c, o.fcol_r||o.fcol_c);
    const tieneNotas = hasNotas(o);
    return `<tr onclick="toggleNotasRow('${o.id}')" style="cursor:pointer">
      <td>${o.semana||'—'}</td>
      <td class="strong">${o.ot||'—'}</td>
      <td class="strong" style="max-width:150px;overflow:hidden;text-overflow:ellipsis" title="${o.desc||''}">${o.desc||''}</td>
      <td>${o.cliente||''}</td>
      <td><span style="font-size:11px;font-weight:500;color:var(--blue)">${o.sector||''}</span></td>
      <td onclick="event.stopPropagation()">
        <select class="quick-estado" onchange="quickChangeEstado('${o.id}',this.value)">
          ${['Presupuestado','Aprobado','En producción','Entregado','Facturado','Cobrado'].map(s=>`<option value="${s}" ${o.estado===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><span class="dot dot-${semaforo(o.fprod_c,o.fprod_r)==='g'?'green':semaforo(o.fprod_c,o.fprod_r)==='a'?'amber':semaforo(o.fprod_c,o.fprod_r)==='r'?'red':'gray'}"></span>${o.fprod_c||'—'}</td>
      <td style="color:${o.fprod_r?'var(--green)':'var(--text3)'}">${o.fprod_r||'Pendiente'}</td>
      <td><span class="dot dot-${semaforo(o.fcol_c,o.fcol_r)==='g'?'green':semaforo(o.fcol_c,o.fcol_r)==='a'?'amber':semaforo(o.fcol_c,o.fcol_r)==='r'?'red':'gray'}"></span>${o.fcol_c||'—'}</td>
      <td style="color:${o.fcol_r?'var(--green)':'var(--text3)'}">${o.fcol_r||'Pendiente'}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${dt!==null?dt+'d':'—'}</td>
      <td>${fmtM(o.neto)}</td>
      <td style="white-space:nowrap" onclick="event.stopPropagation()">
        ${tieneNotas?`<span title="Tiene anotaciones" style="color:var(--accent);margin-right:4px"><i class="ti ti-message-dots" style="font-size:13px;vertical-align:middle"></i></span>`:''}
        <button class="btn-icon" onclick="editObra('${o.id}')"><i class="ti ti-edit" style="font-size:13px"></i></button>
        <button class="btn-icon" onclick="delObra('${o.id}')" style="margin-left:4px"><i class="ti ti-trash" style="font-size:13px"></i></button>
      </td>
    </tr>
    <tr id="notas-row-${o.id}" style="display:none">
      <td colspan="13" style="background:var(--surface2);padding:10px 14px;border-bottom:0.5px solid var(--border)">
        ${tieneNotas ? notasPreview(o) : '<span style="font-size:12px;color:var(--text3)">Sin anotaciones. Hacé clic en el lápiz para agregar.</span>'}
        <button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="editObra('${o.id}')"><i class="ti ti-edit" style="font-size:11px"></i> Editar / Agregar nota</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="13" style="text-align:center;padding:32px;color:var(--text3)">No hay obras. Hacé clic en "Nueva obra" para agregar.</td></tr>';
};

window.setObrasSector = s => { window.obrasSectorFilter=s; renderObras(); };
window.toggleNotasRow = id => {
  const row = document.getElementById('notas-row-'+id);
  if(row) row.style.display = row.style.display==='none' ? '' : 'none';
};

// SEMANA
window.renderSemana = function() {
  const activas = window.DB.obras.filter(o => o.estado==='Aprobado'||o.estado==='En producción');
  const sel = activas.filter(o => window.obrasSemana.has(o.id));

  document.getElementById('semana-body').innerHTML = sel.length ? `
    <table style="width:100%;font-size:12px"><thead><tr><th>OT</th><th>Descripción</th><th>Cliente</th><th>Sector</th><th>F.Prod</th><th>F.Col</th></tr></thead>
    <tbody>${sel.map(o=>`<tr><td class="strong">${o.ot||'—'}</td><td>${o.desc||''}</td><td>${o.cliente||''}</td><td>${o.sector||''}</td><td>${o.fprod_c||'—'}</td><td>${o.fcol_c||'—'}</td></tr>`).join('')}</tbody>
    </table>` : '<p style="color:var(--text3);font-size:13px">Ninguna obra seleccionada todavía. Tildá las obras abajo.</p>';

  document.getElementById('semana-picker').innerHTML = activas.length ? activas.map(o => `
    <label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer">
      <input type="checkbox" ${window.obrasSemana.has(o.id)?'checked':''} onchange="toggleSemana('${o.id}',this.checked)" style="accent-color:var(--accent);width:16px;height:16px">
      <div>
        <span style="font-weight:500;color:var(--text)">${o.ot||'—'} — ${o.desc||''}</span>
        <span style="color:var(--text3);font-size:11px;margin-left:8px">${o.cliente||''} · ${o.sector||''}</span>
      </div>
      <span style="margin-left:auto;color:var(--text3);font-size:11px">${estadoBadge(o.estado)}</span>
    </label>
  `).join('') : '<p style="color:var(--text3);font-size:13px">No hay obras activas.</p>';
};

window.toggleSemana = (id, on) => { on ? window.obrasSemana.add(id) : window.obrasSemana.delete(id); renderSemana(); };

window.exportCalendar = function() {
  const sel = window.DB.obras.filter(o => window.obrasSemana.has(o.id));
  if (!sel.length) { showToast('Seleccioná al menos una obra'); return; }
  sel.forEach(o => {
    const title = encodeURIComponent(`[TIZ] ${o.ot||''} - ${o.desc||''}`);
    const details = encodeURIComponent(`Cliente: ${o.cliente||''}\nSector: ${o.sector||''}\nEstado: ${o.estado||''}`);
    const date = (o.fprod_c||'').split('/').reverse().join('');
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}${date?`&dates=${date}/${date}`:''}`;
    window.open(url, '_blank');
  });
  showToast(`${sel.length} obra(s) enviadas a Google Calendar`);
};

// PRODUCCION
function renderProduccion() {
  const obras = window.DB.obras;
  const sem = window.currentSem;
  const semObras = obras.filter(o=>+o.semana===sem);
  const pctP = pct(obras.filter(o=>o.fprod_c),'prod');
  const term = obras.filter(o=>o.fprod_r);
  const venc = obras.filter(o=>semaforo(o.fprod_c,o.fprod_r)==='r').length;

  document.getElementById('prod-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Cumpl. producción</div><div class="kpi-val ${pctP===null?'':pctP>=80?'green':pctP>=60?'amber':'red'}">${pctP===null?'—':pctP+'%'}</div><div class="kpi-sub">global</div></div>
    <div class="kpi"><div class="kpi-label">Terminadas total</div><div class="kpi-val green">${term.length}</div><div class="kpi-sub">con fecha real</div></div>
    <div class="kpi"><div class="kpi-label">En producción</div><div class="kpi-val">${obras.filter(o=>o.estado==='En producción').length}</div></div>
    <div class="kpi"><div class="kpi-label">Vencidas</div><div class="kpi-val ${venc>0?'red':''}">${venc}</div></div>
  `;

  const show = obras.filter(o=>o.fprod_c||o.estado==='En producción').sort((a,b)=>(+b.semana||0)-(+a.semana||0));
  document.getElementById('prod-tbody').innerHTML = show.map(o => {
    const dias = diasEntre(o.fprod_r||o.fprod_c, o.fcol_r||o.fcol_c);
    return `<tr>
      <td class="strong">${o.ot||'—'}</td>
      <td class="strong">${o.desc||''}</td>
      <td>${o.cliente||''}</td>
      <td><span class="dot dot-${semaforo(o.fprod_c,o.fprod_r)==='g'?'green':semaforo(o.fprod_c,o.fprod_r)==='a'?'amber':'red'}"></span>${o.fprod_c||'—'}</td>
      <td style="color:${o.fprod_r?'var(--green)':'var(--text3)'}">${o.fprod_r||'Pendiente'}</td>
      <td>${semBadge(o.fprod_c,o.fprod_r)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${dias!==null?dias+'d':'—'}</td>
      <td><button class="btn-icon" onclick="editObra('${o.id}')"><i class="ti ti-edit" style="font-size:13px"></i></button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3)">No hay obras con fechas de producción cargadas.</td></tr>';
}

// COLOCACIONES
function renderColocaciones() {
  const obras = window.DB.obras;
  const pctC = pct(obras.filter(o=>o.fcol_c),'col');
  const term = obras.filter(o=>o.fcol_r).length;
  const venc = obras.filter(o=>semaforo(o.fcol_c,o.fcol_r)==='r').length;

  document.getElementById('col-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Cumpl. colocación</div><div class="kpi-val ${pctC===null?'':pctC>=80?'green':pctC>=60?'amber':'red'}">${pctC===null?'—':pctC+'%'}</div></div>
    <div class="kpi"><div class="kpi-label">Colocadas</div><div class="kpi-val green">${term}</div></div>
    <div class="kpi"><div class="kpi-label">Vencidas</div><div class="kpi-val ${venc>0?'red':''}">${venc}</div></div>
  `;

  const show = obras.filter(o=>o.fcol_c).sort((a,b)=>(+b.semana||0)-(+a.semana||0));
  document.getElementById('col-tbody').innerHTML = show.map(o => {
    const dias = diasEntre(o.fcol_c, o.fcol_r||new Date().toLocaleDateString('es-AR'));
    return `<tr>
      <td class="strong">${o.ot||'—'}</td><td class="strong">${o.desc||''}</td><td>${o.cliente||''}</td>
      <td><span class="dot dot-${semaforo(o.fcol_c,o.fcol_r)==='g'?'green':semaforo(o.fcol_c,o.fcol_r)==='a'?'amber':'red'}"></span>${o.fcol_c||'—'}</td>
      <td style="color:${o.fcol_r?'var(--green)':'var(--text3)'}">${o.fcol_r||'Pendiente'}</td>
      <td>${semBadge(o.fcol_c,o.fcol_r)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${o.fcol_r?diasEntre(o.fcol_c,o.fcol_r)+'d':'—'}</td>
      <td><button class="btn-icon" onclick="editObra('${o.id}')"><i class="ti ti-edit" style="font-size:13px"></i></button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3)">No hay obras con fechas de colocación.</td></tr>';
}

// DISEÑO
function renderDiseno() {
  const obras = window.DB.obras.filter(o=>o.sector==='Diseño');
  const total = obras.length;
  const term = obras.filter(o=>['Entregado','Facturado','Cobrado'].includes(o.estado)).length;
  const totalNeto = obras.reduce((a,o)=>a+(+o.neto||0),0);

  document.getElementById('dis-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Obras diseño</div><div class="kpi-val">${total}</div></div>
    <div class="kpi"><div class="kpi-label">Terminadas</div><div class="kpi-val green">${term}</div></div>
    <div class="kpi"><div class="kpi-label">Total en cartera</div><div class="kpi-val">${fmtM(totalNeto)}</div></div>
  `;

  document.getElementById('dis-tbody').innerHTML = obras.map(o => `<tr>
    <td class="strong">${o.ot||'—'}</td><td class="strong">${o.desc||''}</td><td>${o.cliente||''}</td>
    <td>${o.vendedor||'—'}</td><td>${estadoBadge(o.estado)}</td><td>${fmtM(o.neto)}</td>
    <td><button class="btn-icon" onclick="editObra('${o.id}')"><i class="ti ti-edit" style="font-size:13px"></i></button></td>
  </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">No hay obras de diseño.</td></tr>';
}

// COBRANZAS
window.renderCobranzas = function() {
  const cobr = window.DB.cobranzas;
  const pend = cobr.filter(c=>c.estado==='Pendiente');
  const cobradas = cobr.filter(c=>c.estado==='Cobrado');
  const totalPend = pend.reduce((a,c)=>a+(+c.importe||0),0);
  const totalCobr = cobradas.reduce((a,c)=>a+(+c.importe||0),0);
  const venc = pend.filter(c=>diasDesdeHoy(c.vencimiento)>=0).length;

  document.getElementById('cobr-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Pendiente de cobro</div><div class="kpi-val amber">${fmtM(totalPend)}</div><div class="kpi-sub">${pend.length} facturas</div></div>
    <div class="kpi"><div class="kpi-label">Cobrado total</div><div class="kpi-val green">${fmtM(totalCobr)}</div></div>
    <div class="kpi"><div class="kpi-label">Vencidas</div><div class="kpi-val ${venc>0?'red':''}">${venc}</div></div>
  `;

  let show = cobr;
  if (window.cobTab==='pendientes') show = pend;
  else if (window.cobTab==='cobradas') show = cobradas;
  const cobrQ = document.getElementById('cobr-filter-cliente')?.value.toLowerCase();
  const cobrE = document.getElementById('cobr-filter-estado')?.value;
  if (cobrQ) show = show.filter(c=>(c.cliente||'').toLowerCase().includes(cobrQ)||(c.ot||'').toLowerCase().includes(cobrQ));
  if (cobrE) show = show.filter(c=>c.estado===cobrE);
  const cntEl = document.getElementById('cobr-count');
  if (cntEl) cntEl.textContent = show.length + ' registros';

  document.getElementById('cobr-tbody').innerHTML = show.map(c => {
    const dias = diasDesdeHoy(c.vencimiento);
    const isAlert = c.estado==='Pendiente' && dias >= 0;
    return `<tr class="${isAlert?'alerta-row':''}">
      <td class="strong">${c.ot||'—'}</td><td>${c.cliente||''}</td><td>${c.desc||''}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${c.nrfc||'—'}</td>
      <td style="font-weight:500">${fmtM(c.importe)}</td>
      <td style="color:${isAlert?'var(--red)':'var(--text2)'}">${c.vencimiento||'—'}</td>
      <td>${c.estado==='Cobrado'?'<span class="badge badge-green">Cobrado</span>':isAlert?'<span class="badge badge-red">Vencida</span>':'<span class="badge badge-amber">Pendiente</span>'}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:${isAlert?'var(--red)':''}">${dias!==null?Math.abs(dias)+'d':'—'}</td>
      <td>
        ${c.estado!=='Cobrado'?`<button class="btn btn-ghost btn-sm" onclick="marcarCobrado('${c.id}')">Cobrar</button>`:''}
        <button class="btn-icon" onclick="delCobranza('${c.id}')" style="margin-left:4px"><i class="ti ti-trash" style="font-size:12px"></i></button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text3)">Sin registros.</td></tr>';
};

window.setCobTab = (tab, el) => {
  window.cobTab = tab;
  document.querySelectorAll('.page-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  renderCobranzas();
};

window.marcarCobrado = async id => { await updateDoc_('cobranzas', id, { estado: 'Cobrado' }); showToast('Marcada como cobrada'); };
window.delCobranza = async id => { if(confirm('¿Eliminar?')) await deleteDoc_('cobranzas', id); };

// PRESUPUESTOS
function renderPresupuestos() {
  const pres = window.DB.presupuestos;
  const aprobados = pres.filter(p=>p.estado==='Aprobado').reduce((a,p)=>a+(+p.importe||0),0);
  const enviados = pres.filter(p=>p.estado==='Enviado'||p.estado==='En revisión').length;

  document.getElementById('pres-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Total presupuestos</div><div class="kpi-val">${pres.length}</div></div>
    <div class="kpi"><div class="kpi-label">Aprobados</div><div class="kpi-val green">${fmtM(aprobados)}</div></div>
    <div class="kpi"><div class="kpi-label">En revisión</div><div class="kpi-val amber">${enviados}</div></div>
  `;

  const map={'Enviado':'blue','En revisión':'amber','Aprobado':'green','Rechazado':'red','Vencido':'gray'};
  document.getElementById('pres-tbody').innerHTML = pres.map(p => `<tr>
    <td class="strong">${p.nro||'—'}</td><td>${p.cliente||''}</td><td>${p.desc||''}</td>
    <td>${p.vendedor||''}</td><td style="font-weight:500">${fmtM(p.importe)}</td>
    <td>${p.fecha||'—'}</td><td><span class="badge badge-${map[p.estado]||'gray'}">${p.estado||''}</span></td>
    <td>
      <button class="btn-icon" onclick="editPres('${p.id}')"><i class="ti ti-edit" style="font-size:13px"></i></button>
      <button class="btn-icon" onclick="delPres('${p.id}')" style="margin-left:4px"><i class="ti ti-trash" style="font-size:13px"></i></button>
    </td>
  </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3)">Sin presupuestos.</td></tr>';
}

window.delPres = async id => { if(confirm('¿Eliminar?')) await deleteDoc_('presupuestos', id); };
window.editPres = id => {
  const p = window.DB.presupuestos.find(x=>x.id===id);
  if (!p) return;
  window.editingId.presupuesto = id;
  document.getElementById('fp-nro').value=p.nro||'';
  document.getElementById('fp-vend').value=p.vendedor||'G';
  document.getElementById('fp-cliente').value=p.cliente||'';
  document.getElementById('fp-desc').value=p.desc||'';
  document.getElementById('fp-importe').value=p.importe||'';
  document.getElementById('fp-fecha').value=p.fecha||'';
  document.getElementById('fp-estado').value=p.estado||'Enviado';
  document.getElementById('fp-comentarios').value=p.comentarios||'';
  openModal('presupuesto');
};

// CLIENTES
window.renderClientes = function() {
  let clis = window.DB.clientes;
  const q = document.getElementById('filter-cliente2')?.value.toLowerCase();
  if (q) clis = clis.filter(c=>(c.nombre||'').toLowerCase().includes(q)||(c.cuit||'').includes(q));
  document.getElementById('clientes-count').textContent = clis.length + ' clientes';
  document.getElementById('clientes-tbody').innerHTML = clis.map(c => {
    const obras = window.DB.obras.filter(o=>(o.cliente||'').toLowerCase()===(c.nombre||'').toLowerCase()).length;
    return `<tr>
      <td class="strong">${c.nombre||''}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${c.cuit||'—'}</td>
      <td>${c.contacto||'—'}</td><td>${c.cel||'—'}</td>
      <td style="color:var(--blue)">${c.email||'—'}</td>
      <td><span class="badge badge-blue">${obras}</span></td>
      <td>
        <button class="btn-icon" onclick="editCliente('${c.id}')"><i class="ti ti-edit" style="font-size:13px"></i></button>
        <button class="btn-icon" onclick="delCliente('${c.id}')" style="margin-left:4px"><i class="ti ti-trash" style="font-size:13px"></i></button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">Sin clientes.</td></tr>';
};

window.editCliente = id => {
  const c = window.DB.clientes.find(x=>x.id===id);
  if(!c) return;
  window.editingId.cliente = id;
  document.getElementById('fc-numero').value=c.numeroCliente||c.numero||'';
  document.getElementById('fc-nombre').value=c.nombre||'';
  document.getElementById('fc-cuit').value=c.cuit||'';
  document.getElementById('fc-contacto').value=c.contacto||'';
  document.getElementById('fc-cel').value=c.cel||'';
  document.getElementById('fc-email').value=c.email||'';
  document.getElementById('fc-notas').value=c.notas||'';
  openModal('cliente');
};
window.delCliente = async id => { if(confirm('¿Eliminar?')) await deleteDoc_('clientes',id); };

window.saveCliente = async () => {
  const nombre = document.getElementById('fc-nombre').value.trim();
  if (!nombre) { showToast('Ingresá el nombre del cliente'); return; }
  const data = {
    nombre,
    cuit: document.getElementById('fc-cuit').value.trim(),
    contacto: document.getElementById('fc-contacto').value.trim(),
    cel: document.getElementById('fc-cel').value.trim(),
    email: document.getElementById('fc-email').value.trim(),
    notas: document.getElementById('fc-notas')?.value.trim() || '',
  };
  const id = window.editingId.cliente;
  if (id) await updateDoc_('clientes', id, data);
  else await addDoc_('clientes', data);
  // Si vino desde presupuesto, actualizar campo cliente del presupuesto
  const fCliente = document.getElementById('f-cliente');
  if (fCliente && !id) fCliente.value = nombre;
  if (window._volvioDePresupuesto && !id) {
    document.getElementById('pp-cliente').value = nombre;
    window._volvioDePresupuesto = false;
  }
  closeModal('cliente');
  showToast(id ? 'Cliente actualizado' : 'Cliente guardado ✓');
};

// RETENCIONES
function renderRetenciones() {
  const rets = window.DB.retenciones;
  const totalBruto = rets.reduce((a,r)=>a+(+r.bruto||0),0);
  const totalRet = rets.reduce((a,r)=>a+(+r.suss||0)+(+r.iibb||0)+(+r.gan||0)+(+r.iva||0),0);

  document.getElementById('ret-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Total bruto</div><div class="kpi-val">${fmtM(totalBruto)}</div></div>
    <div class="kpi"><div class="kpi-label">Total retenido</div><div class="kpi-val red">${fmtM(totalRet)}</div></div>
    <div class="kpi"><div class="kpi-label">Neto recibido</div><div class="kpi-val green">${fmtM(totalBruto-totalRet)}</div></div>
  `;

  document.getElementById('ret-tbody').innerHTML = rets.map(r => {
    const neto = (+r.bruto||0)-(+r.suss||0)-(+r.iibb||0)-(+r.gan||0)-(+r.iva||0);
    return `<tr>
      <td>${r.mes||'—'}</td><td class="strong">${r.cliente||''}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${r.nrfc||'—'}</td>
      <td>${fmtM(r.bruto)}</td>
      <td style="color:${r.suss?'var(--red)':'var(--text3)'}">${r.suss?fmtM(r.suss):'—'}</td>
      <td style="color:${r.iibb?'var(--red)':'var(--text3)'}">${r.iibb?fmtM(r.iibb):'—'}</td>
      <td style="color:${r.gan?'var(--red)':'var(--text3)'}">${r.gan?fmtM(r.gan):'—'}</td>
      <td style="color:${r.iva?'var(--red)':'var(--text3)'}">${r.iva?fmtM(r.iva):'—'}</td>
      <td style="color:var(--green);font-weight:500">${fmtM(neto)}</td>
      <td><button class="btn-icon" onclick="delRet('${r.id}')"><i class="ti ti-trash" style="font-size:12px"></i></button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text3)">Sin retenciones.</td></tr>';
}
window.delRet = async id => { if(confirm('¿Eliminar?')) await deleteDoc_('retenciones',id); };

// VENDEDORES
function renderVendedores() {
  const obras = window.DB.obras;
  const vends = [...new Set(obras.map(o=>o.vendedor).filter(Boolean))];

  document.getElementById('vend-cards').innerHTML = vends.map(v => {
    const wo = obras.filter(o=>o.vendedor===v||o.vendedor===v);
    const neto = wo.reduce((a,o)=>a+(+o.neto||0),0);
    const cobr = wo.filter(o=>o.estado==='Cobrado').reduce((a,o)=>a+(+o.neto||0),0);
    return `<div class="sector-card">
      <div class="sector-card-name" style="color:var(--accent)">${v}</div>
      <div class="sector-card-num">${wo.length}</div>
      <div class="sector-card-money">${fmtM(neto)}</div>
      <div class="sector-card-sub">Cobrado: ${fmtM(cobr)}</div>
    </div>`;
  }).join('');

  document.getElementById('vend-tbody').innerHTML = vends.map(v => {
    const wo = obras.filter(o=>o.vendedor===v);
    const neto = wo.reduce((a,o)=>a+(+o.neto||0),0);
    const cobr = wo.filter(o=>o.estado==='Cobrado').reduce((a,o)=>a+(+o.neto||0),0);
    const pctCobr = neto ? Math.round(cobr/neto*100) : 0;
    const pp = pct(wo.filter(o=>o.fprod_c),'prod');
    const pc = pct(wo.filter(o=>o.fcol_c),'col');
    return `<tr>
      <td class="strong" style="color:var(--accent)">${v}</td>
      <td>${wo.length}</td><td>${fmtM(neto)}</td><td>${fmtM(cobr)}</td>
      <td><span class="badge badge-${pctCobr>=80?'green':pctCobr>=50?'amber':'red'}">${pctCobr}%</span></td>
      <td>${pp!==null?`<span class="badge badge-${pp>=80?'green':pp>=60?'amber':'red'}">${pp}%</span>`:'—'}</td>
      <td>${pc!==null?`<span class="badge badge-${pc>=80?'green':pc>=60?'amber':'red'}">${pc}%</span>`:'—'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">Sin datos de vendedores.</td></tr>';
}

// MODALES
window.openModal = (type) => {
  if (type==='cliente' && !window.editingId.cliente) {
    const n = document.getElementById('fc-numero'); if(n) n.value = nextClienteNumero();
    ['fc-nombre','fc-cuit','fc-contacto','fc-cel','fc-email','fc-notas'].forEach(i=>{ const el=document.getElementById(i); if(el) el.value=''; });
  }
  if (type==='obra') {
    if (!window.editingId.obra) {
      ['f-desc','f-cliente','f-neto','f-bruto','f-gastos','f-fprod-c','f-fprod-r','f-fcol-c','f-fcol-r','f-oc','f-nrfc','f-ffc','f-comentarios'].forEach(i=>{ const el=document.getElementById(i); if(el) el.value=''; });
      // Sugerir siguiente número de OT
      const otNros = window.DB.obras.map(o=>parseInt(o.ot)||0).filter(n=>n>0);
      const maxOT = otNros.length ? Math.max(...otNros) : 4400;
      document.getElementById('f-ot').value = maxOT + 1;
      document.getElementById('f-semana').value = getSemanaActual();
      document.getElementById('f-sector').value = 'Producción';
      document.getElementById('f-vendedor').value = 'G';
      document.getElementById('f-estado').value = 'Aprobado';
      document.getElementById('modal-obra-title').textContent = 'Nueva obra';
      window.obraItems = [{descripcion:'', cantidad:1, unitario:0, subtotal:0, observaciones:''}];
      window.calculosAuxiliares = [];
      renderObraItems(); renderCalculosAux();
      ['Producción','Colocaciones','Diseño','Ventas','Compras'].forEach(s => {
        const el = document.getElementById('nota-'+s.toLowerCase().replace(/ó/g,'o').replace(/é/g,'e'));
        if(el) el.value = '';
      });
    }
  }
  document.getElementById('modal-'+type).classList.add('open');
};

window.closeModal = type => {
  document.getElementById('modal-'+type).classList.remove('open');
  if(type==='obra') window.editingId.obra = null;
};

window.editObra = id => {
  const o = window.DB.obras.find(x=>x.id===id); if(!o) return;
  window.editingId.obra = id;
  document.getElementById('obra-id').value = id;
  document.getElementById('f-ot').value = o.ot||'';
  document.getElementById('f-sector').value = o.sector||'Producción';
  document.getElementById('f-desc').value = o.desc||'';
  document.getElementById('f-cliente').value = o.cliente||'';
  document.getElementById('f-vendedor').value = o.vendedor||'G';
  document.getElementById('f-estado').value = o.estado||'Aprobado';
  document.getElementById('f-semana').value = o.semana||'';
  document.getElementById('f-neto').value = o.neto||'';
  document.getElementById('f-bruto').value = o.bruto||'';
  document.getElementById('f-gastos').value = o.gastos||'';
  document.getElementById('f-fprod-c').value = o.fprod_c||'';
  document.getElementById('f-fprod-r').value = o.fprod_r||'';
  document.getElementById('f-fcol-c').value = o.fcol_c||'';
  document.getElementById('f-fcol-r').value = o.fcol_r||'';
  document.getElementById('f-oc').value = o.oc||'';
  document.getElementById('f-nrfc').value = o.nrfc||'';
  document.getElementById('f-ffc').value = o.ffc||'';
  document.getElementById('f-cobr').value = o.cobr||'Pendiente';
  document.getElementById('f-comentarios').value = o.comentarios||'';
  document.getElementById('modal-obra-title').textContent = 'Editar obra — ' + (o.ot||o.desc||'');
  window.obraItems = Array.isArray(o.itemsCotizados) && o.itemsCotizados.length ? o.itemsCotizados : [{descripcion:o.desc||'', cantidad:1, unitario:+o.neto||0, subtotal:+o.neto||0, observaciones:''}];
  window.calculosAuxiliares = Array.isArray(o.calculosAuxiliares) ? o.calculosAuxiliares : [];
  renderObraItems(); renderCalculosAux();

  // Cargar anotaciones por sector
  const notas = o.notas_sector || {};
  const sectorKeys = {
    'Producción':'produccion','Colocaciones':'colocaciones','Diseño':'diseno','Ventas':'ventas','Compras':'compras'
  };
  Object.entries(sectorKeys).forEach(([sec, key]) => {
    const el = document.getElementById('nota-'+key);
    if(el) {
      el.value = notas[sec] || '';
      // Mostrar timestamp si existe
      const ts = document.getElementById('nota-ts-'+key);
      if(ts) ts.textContent = notas[sec+'_ts'] ? '— ' + notas[sec+'_ts'] : '';
    }
  });

  document.getElementById('modal-obra').classList.add('open');
};

window.delObra = async id => { if(confirm('¿Eliminar esta obra?')) await deleteDoc_('obras',id); };
window.quickChangeEstado = async (id, val) => {
  await updateDoc_('obras', id, { estado: val, cobr: val });
  showToast('Estado actualizado: ' + val);
};

window.limpiarFiltros = () => {
  ['filter-ot','filter-cliente','filter-semana-desde','filter-semana-hasta'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  const fe = document.getElementById('filter-estado'); if(fe) fe.value = '';
  window.obrasSectorFilter = 'Todos';
  renderObras();
};

// EXPORTAR EXCEL
window.exportarExcel = () => {
  const obras = [...window.DB.obras].sort((a,b)=>(+b.semana||0)-(+a.semana||0));
  if (!obras.length) { showToast('No hay obras para exportar'); return; }
  const headers = ['Fecha','Semana','OT','Descripción','Arquitecto','Cliente','Sector','Vendedor',
    'Estado','Neto','Bruto','Gastos','F.Prod.Comp','F.Prod.Real','F.Col.Comp','F.Col.Real',
    'OC/OP','Nro Factura','F.Factura','Estado Cobranza','Comentarios',
    'Nota Producción','Nota Colocaciones','Nota Diseño','Nota Ventas','Nota Compras'];
  const rows = obras.map(o => {
    const n = o.notas_sector||{};
    return [o.fecha||'',o.semana||'',o.ot||'',o.desc||'',o.arquitecto||'',o.cliente||'',
      o.sector||'',o.vendedor||'',o.estado||'',+o.neto||0,+o.bruto||0,+o.gastos||0,
      o.fprod_c||'',o.fprod_r||'',o.fcol_c||'',o.fcol_r||'',o.oc||'',o.nrfc||'',o.ffc||'',
      o.cobr||'',o.comentarios||'',n['Producción']||'',n['Colocaciones']||'',n['Diseño']||'',n['Ventas']||'',n['Compras']||''];
  });
  const doExport = () => {
    const ws = window.XLSX.utils.aoa_to_sheet([headers,...rows]);
    ws['!cols'] = headers.map((_,i)=>({wch:i<=2?8:i<=4?30:i<=7?15:25}));
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb,ws,'Obras 2026');
    const fecha = new Date().toLocaleDateString('es-AR').replace(/\//g,'-');
    window.XLSX.writeFile(wb,`TIZ_Obras_${fecha}.xlsx`);
    showToast(`${obras.length} obras exportadas a Excel`);
  };
  if (!window.XLSX) {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = doExport;
    document.head.appendChild(s);
  } else { doExport(); }
};

// CARGAR COBRANZAS DESDE OTs
window.cargarDesdeOTs = async () => {
  const obrasOK = window.DB.obras.filter(o=>['Entregado','Facturado'].includes(o.estado)&&+o.neto>0);
  if (!obrasOK.length) { showToast('No hay obras entregadas/facturadas'); return; }
  const otsCargadas = new Set(window.DB.cobranzas.map(c=>c.ot).filter(Boolean));
  const nuevas = obrasOK.filter(o=>!o.ot||!otsCargadas.has(o.ot));
  if (!nuevas.length) { showToast('Todas las OTs ya están en cobranzas'); return; }
  if (!confirm(`¿Agregar ${nuevas.length} obra(s) a cobranzas?`)) return;
  for (const o of nuevas) {
    await addDoc_('cobranzas',{ot:o.ot||'',cliente:o.cliente||'',desc:o.desc||'',
      nrfc:o.nrfc||'',importe:+o.neto||0,vencimiento:'',fechaCobro:'',estado:'Pendiente',comentarios:''});
  }
  showToast(`${nuevas.length} obras cargadas en cobranzas`);
};

// NÚMERO AUTOMÁTICO DE PRESUPUESTO
window.abrirPresupuestoPDF = () => {
  const obraId = window.editingId.obra;
  const obra = obraId ? window.DB.obras.find(x=>x.id===obraId) : null;
  const presNros = window.DB.presupuestos.map(p=>parseInt(p.nro)||0);
  const otNros = window.DB.obras.map(o=>parseInt(o.ot)||0);
  const maxNro = Math.max(0,...presNros,...otNros);
  document.getElementById('pp-nro').value = (maxNro+1).toString().padStart(4,'0');
  document.getElementById('pp-cliente').value = obra?.cliente||'';
  document.getElementById('pp-desc').value = obra?.desc||'';
  document.getElementById('pp-nota').value = 'Los precios cotizados se encuentran a valores netos';
  document.getElementById('pp-condicion').value = 'Anticipo 50% Saldo a contraentrega';
  document.getElementById('pp-validez').value = '7';
  window.ppItems = obra?[{desc:obra.desc||'',precio:+obra.neto||0,cant:1}]:[{desc:'',precio:0,cant:1}];
  renderPPItems();
  document.getElementById('modal-prespdf').classList.add('open');
};

// Autocomplete cliente para presupuesto
window.sugerirClientesPP = (q) => {
  const dd = document.getElementById('pp-clientes-dropdown');
  if (!q || q.length < 1) { dd.style.display='none'; return; }
  const clientesDB = window.DB.clientes.map(c=>({nombre:c.nombre,cuit:c.cuit}));
  const clientesObras = [...new Set(window.DB.obras.map(o=>o.cliente).filter(Boolean))]
    .filter(n=>!clientesDB.find(c=>c.nombre?.toLowerCase()===n.toLowerCase()))
    .map(n=>({nombre:n,cuit:''}));
  const todos = [...clientesDB,...clientesObras];
  const matches = todos.filter(c=>c.nombre&&c.nombre.toLowerCase().includes(q.toLowerCase())).slice(0,8);
  let html = matches.map(c=>`
    <div class="cli-option" onmousedown="elegirClientePP('${c.nombre.replace(/'/g,"\\'")}')">
      <span>${resaltar(c.nombre,q)}</span>
      ${c.cuit?`<span class="cli-option-sub">CUIT: ${c.cuit}</span>`:`<span class="cli-option-sub">de obras anteriores</span>`}
    </div>`).join('');
  html += `<div class="cli-option" onmousedown="nuevoClienteDesdePresupuesto('${q.replace(/'/g,"\\'")}'')" style="border-top:1px solid var(--border);color:var(--accent)">
    <span>➕ Crear cliente "<strong>${q}</strong>"</span>
    <span class="cli-option-sub" style="color:var(--accent)">Abre el formulario de nuevo cliente</span>
  </div>`;
  dd.innerHTML = html;
  dd.style.display = 'block';
};
window.elegirClientePP = nombre => {
  document.getElementById('pp-cliente').value = nombre;
  document.getElementById('pp-clientes-dropdown').style.display = 'none';
};
window.cerrarSugerenciasPP = () => {
  const dd = document.getElementById('pp-clientes-dropdown');
  if(dd) dd.style.display = 'none';
};
window.nuevoClienteDesdePresupuesto = nombre => {
  cerrarSugerenciasPP();
  document.getElementById('pp-cliente').value = nombre;
  window.editingId.cliente = null;
  document.getElementById('fc-numero').value = nextClienteNumero();
  document.getElementById('fc-nombre').value = nombre;
  ['fc-cuit','fc-contacto','fc-cel','fc-email','fc-notas'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  // Al guardar el cliente, volver al presupuesto
  window._volvioDePresupuesto = true;
  document.getElementById('modal-cliente').classList.add('open');
};


// ============================================================
// ÍTEMS DE OBRA + CÁLCULOS AUXILIARES
// ============================================================
window.obraItems = window.obraItems || [{descripcion:'', cantidad:1, unitario:0, subtotal:0, observaciones:''}];
window.calculosAuxiliares = window.calculosAuxiliares || [];

function moneyInput(v){ return Number.isFinite(+v) ? +v : 0; }
function fmtPesoObra(n){ return '$' + Math.round(+n || 0).toLocaleString('es-AR'); }

window.addObraItem = () => {
  window.obraItems = collectObraItems();
  window.obraItems.push({descripcion:'', cantidad:1, unitario:0, subtotal:0, observaciones:''});
  renderObraItems();
};
window.removeObraItem = idx => {
  window.obraItems = collectObraItems();
  window.obraItems.splice(idx,1);
  if (!window.obraItems.length) window.obraItems.push({descripcion:'', cantidad:1, unitario:0, subtotal:0, observaciones:''});
  renderObraItems();
};
window.renderObraItems = () => {
  const wrap = document.getElementById('obra-items-list');
  if (!wrap) return;
  const items = window.obraItems || [];
  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 80px 115px 115px 34px;gap:6px;margin-bottom:5px;font-size:10px;color:var(--text3);text-transform:uppercase">
      <span>Descripción</span><span>Cant.</span><span>$ Unit.</span><span>Subtotal</span><span></span>
    </div>
    ${items.map((it,i)=>`
      <div class="obra-item-row" data-idx="${i}" style="display:grid;grid-template-columns:1fr 80px 115px 115px 34px;gap:6px;margin-bottom:6px;align-items:center">
        <input class="oi-desc" value="${(it.descripcion||'').replace(/"/g,'&quot;')}" placeholder="Ej: letras, lona, vinilo, estructura..." oninput="updateObraTotals()">
        <input class="oi-cant" type="number" step="0.01" value="${it.cantidad ?? 1}" oninput="updateObraTotals()">
        <input class="oi-unit" type="number" step="0.01" value="${it.unitario ?? 0}" oninput="updateObraTotals()">
        <input class="oi-sub" type="number" step="0.01" value="${it.subtotal ?? ((+it.cantidad||0)*(+it.unitario||0))}" oninput="updateObraTotals(true)">
        <button type="button" class="btn-icon" onclick="removeObraItem(${i})" title="Quitar"><i class="ti ti-x" style="font-size:13px"></i></button>
        <input class="oi-obs" value="${(it.observaciones||'').replace(/"/g,'&quot;')}" placeholder="Observaciones internas del ítem" style="grid-column:1 / -1">
      </div>`).join('')}`;
  updateObraTotals();
};
window.collectObraItems = () => {
  return [...document.querySelectorAll('.obra-item-row')].map(row => {
    const cantidad = moneyInput(row.querySelector('.oi-cant')?.value);
    const unitario = moneyInput(row.querySelector('.oi-unit')?.value);
    const subtotalManual = moneyInput(row.querySelector('.oi-sub')?.value);
    const subtotal = subtotalManual || cantidad * unitario;
    return { descripcion: row.querySelector('.oi-desc')?.value.trim() || '', cantidad, unitario, subtotal, observaciones: row.querySelector('.oi-obs')?.value.trim() || '' };
  }).filter(it => it.descripcion || it.subtotal || it.unitario);
};
window.updateObraTotals = (manual=false) => {
  document.querySelectorAll('.obra-item-row').forEach(row => {
    const cant = moneyInput(row.querySelector('.oi-cant')?.value);
    const unit = moneyInput(row.querySelector('.oi-unit')?.value);
    const sub = row.querySelector('.oi-sub');
    if (sub && !manual && document.activeElement !== sub) sub.value = Math.round(cant * unit * 100) / 100;
  });
  const total = collectObraItems().reduce((a,it)=>a+(+it.subtotal||0),0);
  const totalEl = document.getElementById('obra-items-total');
  if (totalEl) totalEl.textContent = fmtPesoObra(total);
  const neto = document.getElementById('f-neto');
  if (neto && total > 0 && (!neto.value || +neto.value===0)) neto.value = Math.round(total);
};

window.addCalculoAux = () => {
  window.calculosAuxiliares = collectCalculosAux();
  window.calculosAuxiliares.push({concepto:'', detalle:'', cantidad:1, unidad:'', precioUnitario:0, total:0, observaciones:''});
  renderCalculosAux();
};
window.removeCalculoAux = idx => {
  window.calculosAuxiliares = collectCalculosAux();
  window.calculosAuxiliares.splice(idx,1);
  renderCalculosAux();
};
window.renderCalculosAux = () => {
  const wrap = document.getElementById('obra-calculos-list');
  if (!wrap) return;
  const items = window.calculosAuxiliares || [];
  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:150px 1fr 70px 75px 105px 105px 34px;gap:6px;margin-bottom:5px;font-size:10px;color:var(--text3);text-transform:uppercase">
      <span>Concepto</span><span>Detalle</span><span>Cant.</span><span>Unidad</span><span>$ Unit.</span><span>Total</span><span></span>
    </div>
    ${items.map((it,i)=>`
      <div class="calc-aux-row" data-idx="${i}" style="display:grid;grid-template-columns:150px 1fr 70px 75px 105px 105px 34px;gap:6px;margin-bottom:6px;align-items:center">
        <input class="ca-concepto" value="${(it.concepto||'').replace(/"/g,'&quot;')}" placeholder="Material/horas/etc" oninput="updateCalculosTotals()">
        <input class="ca-detalle" value="${(it.detalle||'').replace(/"/g,'&quot;')}" placeholder="Detalle del cálculo" oninput="updateCalculosTotals()">
        <input class="ca-cant" type="number" step="0.01" value="${it.cantidad ?? 1}" oninput="updateCalculosTotals()">
        <input class="ca-unidad" value="${(it.unidad||'').replace(/"/g,'&quot;')}" placeholder="m2/hs/u">
        <input class="ca-unit" type="number" step="0.01" value="${it.precioUnitario ?? 0}" oninput="updateCalculosTotals()">
        <input class="ca-total" type="number" step="0.01" value="${it.total ?? ((+it.cantidad||0)*(+it.precioUnitario||0))}" oninput="updateCalculosTotals(true)">
        <button type="button" class="btn-icon" onclick="removeCalculoAux(${i})" title="Quitar"><i class="ti ti-x" style="font-size:13px"></i></button>
        <input class="ca-obs" value="${(it.observaciones||'').replace(/"/g,'&quot;')}" placeholder="Observaciones internas" style="grid-column:1 / -1">
      </div>`).join('') || `<div style="font-size:12px;color:var(--text3);padding:8px 0">Sin cálculos auxiliares cargados todavía.</div>`}`;
  updateCalculosTotals();
};
window.collectCalculosAux = () => {
  return [...document.querySelectorAll('.calc-aux-row')].map(row => {
    const cantidad = moneyInput(row.querySelector('.ca-cant')?.value);
    const precioUnitario = moneyInput(row.querySelector('.ca-unit')?.value);
    const totalManual = moneyInput(row.querySelector('.ca-total')?.value);
    const total = totalManual || cantidad * precioUnitario;
    return { concepto: row.querySelector('.ca-concepto')?.value.trim() || '', detalle: row.querySelector('.ca-detalle')?.value.trim() || '', cantidad, unidad: row.querySelector('.ca-unidad')?.value.trim() || '', precioUnitario, total, observaciones: row.querySelector('.ca-obs')?.value.trim() || '' };
  }).filter(it => it.concepto || it.detalle || it.total || it.precioUnitario);
};
window.updateCalculosTotals = (manual=false) => {
  document.querySelectorAll('.calc-aux-row').forEach(row => {
    const cant = moneyInput(row.querySelector('.ca-cant')?.value);
    const unit = moneyInput(row.querySelector('.ca-unit')?.value);
    const total = row.querySelector('.ca-total');
    if (total && !manual && document.activeElement !== total) total.value = Math.round(cant * unit * 100) / 100;
  });
  const total = collectCalculosAux().reduce((a,it)=>a+(+it.total||0),0);
  const el = document.getElementById('obra-calculos-total');
  if (el) el.textContent = fmtPesoObra(total);
};

function nextClienteNumero() {
  const nums = window.DB.clientes.map(c => parseInt(String(c.numeroCliente || c.numero || '').replace(/\D/g,''),10)).filter(n => n>0);
  return 'CLI-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4,'0');
}

window.saveObra = async () => {
  const sectorKeys = { 'Producción':'produccion','Colocaciones':'colocaciones','Diseño':'diseno','Ventas':'ventas','Compras':'compras' };
  const notas_sector = {};
  const existingId = window.editingId.obra;
  const existing = existingId ? window.DB.obras.find(x=>x.id===existingId) : null;
  const existingNotas = existing?.notas_sector || {};
  Object.entries(sectorKeys).forEach(([sec, key]) => {
    const el = document.getElementById('nota-'+key);
    const newVal = el ? el.value.trim() : '';
    const oldVal = existingNotas[sec] || '';
    notas_sector[sec] = newVal;
    notas_sector[sec+'_ts'] = (newVal !== oldVal && newVal) ? new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : (existingNotas[sec+'_ts'] || '');
  });
  const itemsCotizados = collectObraItems();
  const calculosAuxiliares = collectCalculosAux();
  const totalItems = itemsCotizados.reduce((a,it)=>a+(+it.subtotal||0),0);
  const data = {
    ot: document.getElementById('f-ot').value.trim(), sector: document.getElementById('f-sector').value,
    desc: document.getElementById('f-desc').value.trim(), cliente: document.getElementById('f-cliente').value.trim(),
    vendedor: document.getElementById('f-vendedor').value, estado: document.getElementById('f-estado').value,
    semana: +document.getElementById('f-semana').value||0, neto: +document.getElementById('f-neto').value||totalItems||0,
    bruto: +document.getElementById('f-bruto').value||0, gastos: +document.getElementById('f-gastos').value||0,
    fprod_c: document.getElementById('f-fprod-c').value.trim(), fprod_r: document.getElementById('f-fprod-r').value.trim(),
    fcol_c: document.getElementById('f-fcol-c').value.trim(), fcol_r: document.getElementById('f-fcol-r').value.trim(),
    oc: document.getElementById('f-oc').value.trim(), nrfc: document.getElementById('f-nrfc').value.trim(), ffc: document.getElementById('f-ffc').value.trim(),
    cobr: document.getElementById('f-cobr').value, diasPago: +document.getElementById('f-dias-pago').value||0,
    comentarios: document.getElementById('f-comentarios').value.trim(), notas_sector,
    itemsCotizados, calculosAuxiliares, totalItems,
    totalCalculosAuxiliares: calculosAuxiliares.reduce((a,it)=>a+(+it.total||0),0),
    driveFolderUrl: existing?.driveFolderUrl || '', otSheetUrl: existing?.otSheetUrl || '',
  };
  if (!data.desc) { showToast('Ingresá una descripción'); return; }
  let docRefId = existingId;
  if (existingId) await updateDoc_('obras', existingId, data);
  else { const ref = await addDoc_('obras', data); docRefId = ref?.id || null; }
  try {
    const syncResult = await syncToSheets({...data, firestoreId: docRefId});
    if (syncResult?.driveFolderUrl || syncResult?.otSheetUrl) {
      const links = { driveFolderUrl: syncResult.driveFolderUrl || data.driveFolderUrl || '', otSheetUrl: syncResult.otSheetUrl || data.otSheetUrl || '', driveSyncedAt: new Date().toISOString() };
      if (docRefId) await updateDoc_('obras', docRefId, links);
    }
  } catch(e) { console.warn('No se pudo sincronizar Drive/Sheets:', e); }
  closeModal('obra'); showToast(existingId ? 'Obra actualizada' : 'Obra guardada');
};

window.saveCliente = async () => {
  const numeroCliente = document.getElementById('fc-numero')?.value || nextClienteNumero();
  const data = {
    numeroCliente,
    nombre: document.getElementById('fc-nombre').value.trim(),
    cuit: document.getElementById('fc-cuit').value.trim(),
    contacto: document.getElementById('fc-contacto').value.trim(),
    cel: document.getElementById('fc-cel').value.trim(),
    email: document.getElementById('fc-email').value.trim(),
    notas: document.getElementById('fc-notas').value.trim(),
  };
  if(!data.nombre){showToast('Ingresá un nombre');return;}
  const id = window.editingId.cliente;
  if(id) await updateDoc_('clientes',id,data); else await addDoc_('clientes',data);
  const fCliente = document.getElementById('f-cliente');
  if (fCliente && document.getElementById('modal-obra')?.classList.contains('open')) fCliente.value = data.nombre;
  const ppCliente = document.getElementById('pp-cliente');
  if (ppCliente && document.getElementById('modal-prespdf')?.classList.contains('open')) ppCliente.value = data.nombre;
  window.editingId.cliente=null;
  closeModal('cliente'); showToast(`Cliente ${numeroCliente} guardado`);
};

window.savePresupuesto = async () => {
  const data = {
    nro: document.getElementById('fp-nro').value.trim(),
    vendedor: document.getElementById('fp-vend').value,
    cliente: document.getElementById('fp-cliente').value.trim(),
    desc: document.getElementById('fp-desc').value.trim(),
    importe: +document.getElementById('fp-importe').value||0,
    fecha: document.getElementById('fp-fecha').value.trim(),
    estado: document.getElementById('fp-estado').value,
    comentarios: document.getElementById('fp-comentarios').value.trim(),
  };
  const id = window.editingId.presupuesto;
  if(id) await updateDoc_('presupuestos',id,data); else await addDoc_('presupuestos',data);
  window.editingId.presupuesto=null;
  closeModal('presupuesto'); showToast('Presupuesto guardado');
};

window.saveRetencion = async () => {
  const data = {
    mes: document.getElementById('fr-mes').value.trim(),
    cliente: document.getElementById('fr-cliente').value.trim(),
    nrfc: document.getElementById('fr-nrfc').value.trim(),
    bruto: +document.getElementById('fr-bruto').value||0,
    suss: +document.getElementById('fr-suss').value||0,
    iibb: +document.getElementById('fr-iibb').value||0,
    gan: +document.getElementById('fr-gan').value||0,
    iva: +document.getElementById('fr-iva').value||0,
  };
  await addDoc_('retenciones',data);
  closeModal('retencion'); showToast('Retención guardada');
};

window.saveCobranza = async () => {
  const data = {
    ot: document.getElementById('fcob-ot').value.trim(),
    cliente: document.getElementById('fcob-cliente').value.trim(),
    desc: document.getElementById('fcob-desc').value.trim(),
    nrfc: document.getElementById('fcob-nrfc').value.trim(),
    importe: +document.getElementById('fcob-importe').value||0,
    vencimiento: document.getElementById('fcob-venc').value.trim(),
    fechaCobro: document.getElementById('fcob-real').value.trim(),
    estado: document.getElementById('fcob-estado').value,
    comentarios: document.getElementById('fcob-comentarios').value.trim(),
  };
  await addDoc_('cobranzas',data);
  closeModal('cobranza'); showToast('Cobranza registrada');
};

// Toast
window.showToast = msg => {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2800);
};

// ============================================================
// TAREAS
// ============================================================
window.tareaTab = 'pendientes';

window.setTareaTab = (tab, el) => {
  window.tareaTab = tab;
  document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderTareas();
};

// ============================================================
// PRESUPUESTO PDF
// ============================================================
window.ppItems = [];

window.abrirPresupuesto = () => {
  // Tomar datos de la obra actual
  const obraId = window.editingId.obra;
  const obra = obraId ? window.DB.obras.find(x => x.id === obraId) : null;

  // Número de presupuesto
  const nro = obra?.ot ? obra.ot.toString().padStart(7,'0') : '0000000';
  document.getElementById('pp-nro').value = nro;
  document.getElementById('pp-cliente').value = obra?.cliente || '';

  // Item inicial con descripción de la obra
  window.ppItems = obra ? [{
    desc: obra.desc || '',
    precio: obra.neto || 0,
    cant: 1,
  }] : [{ desc:'', precio:0, cant:1 }];

  renderPPItems();
  document.getElementById('modal-prespdf').classList.add('open');
};

window.addItemPP = () => {
  window.ppItems.push({ desc:'', precio:0, cant:1 });
  renderPPItems();
};

window.removeItemPP = (i) => {
  window.ppItems.splice(i, 1);
  renderPPItems();
};

window.updateItemPP = (i, field, val) => {
  window.ppItems[i][field] = field === 'desc' ? val : +val || 0;
  // Actualizar subtotal mostrado
  const row = document.querySelectorAll('.pp-item-row')[i];
  if (row) {
    const sub = (window.ppItems[i].precio || 0) * (window.ppItems[i].cant || 0);
    const subEl = row.querySelector('.pp-subtotal');
    if (subEl) subEl.textContent = fmtPeso(sub);
  }
  updatePPTotal();
};

function fmtPeso(n) {
  return '$ ' + Math.round(+n || 0).toLocaleString('es-AR');
}

function updatePPTotal() {
  const total = window.ppItems.reduce((a,it) => a + (it.precio||0)*(it.cant||0), 0);
  const el = document.getElementById('pp-total');
  if (el) el.textContent = fmtPeso(total);
}

function renderPPItems() {
  const wrap = document.getElementById('pp-items');
  if (!wrap) return;
  wrap.innerHTML = window.ppItems.map((it, i) => `
    <div class="pp-item-row">
      <input value="${(it.desc||'').replace(/"/g,'&quot;')}" placeholder="Descripción del ítem ${i+1}" oninput="updateItemPP(${i},'desc',this.value)" style="flex:1">
      <input type="number" value="${it.precio||''}" placeholder="$ Unit" oninput="updateItemPP(${i},'precio',this.value)" style="width:110px">
      <input type="number" value="${it.cant||1}" placeholder="Cant" oninput="updateItemPP(${i},'cant',this.value)" style="width:70px">
      <span class="pp-subtotal" style="font-size:12px;color:var(--text2);width:110px;text-align:right;padding:0 4px;white-space:nowrap">${fmtPeso((it.precio||0)*(it.cant||1))}</span>
      <button class="btn-icon" onclick="removeItemPP(${i})" title="Eliminar ítem" style="padding:4px;color:var(--red)"><i class="ti ti-trash" style="font-size:13px"></i></button>
    </div>
  `).join('');
  updatePPTotal();
}


window.generarPDF = async () => {
  const nro      = document.getElementById('pp-nro').value || '0000';
  const cliente  = document.getElementById('pp-cliente').value || '';
  const nota     = document.getElementById('pp-nota').value || '';
  const cond     = document.getElementById('pp-condicion').value || '';
  const validezDias = +document.getElementById('pp-validez').value || 7;
  const hoy = new Date();
  const fmtFecha = d => d.toLocaleDateString('es-AR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const validez = new Date(hoy); validez.setDate(validez.getDate() + validezDias);
  const total = window.ppItems.reduce((a,it)=>a+(it.precio||0)*(it.cant||1),0);

  // Guardar en Firebase como respaldo
  await addDoc_('presupuestos', {
    nro, cliente, nota, cond,
    fecha: hoy.toLocaleDateString('es-AR'),
    validez: validez.toLocaleDateString('es-AR'),
    items: window.ppItems,
    importe: total,
    obraId: window.editingId.obra || '',
    creadoPor: window.currentUser?.email || '',
    estado: 'Pendiente',
    desc: window.ppItems.map(i=>i.desc).join(' / '),
  });

  const rows = window.ppItems.map(it => {
    const sub = (it.precio||0)*(it.cant||1);
    return `<tr>
      <td style="padding:14px 12px;border-bottom:1px solid #eee;font-size:13px;vertical-align:top">${it.desc||''}</td>
      <td style="padding:14px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right;white-space:nowrap">${fmtPeso(it.precio)}</td>
      <td style="padding:14px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:center">${it.cant}</td>
      <td style="padding:14px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right;white-space:nowrap;font-weight:500">${fmtPeso(sub)}</td>
    </tr>`;
  }).join('');

  const html = `<div style="font-family:'Arial',sans-serif;max-width:800px;margin:0 auto;color:#222">
    <table style="width:100%;margin-bottom:20px"><tr>
      <td style="width:200px;vertical-align:top">
        <div style="background:#1a1a1a;padding:14px 16px;border-radius:8px;display:inline-block">
          <div style="font-size:28px;font-weight:900;color:#e8b84b;letter-spacing:-1px;line-height:1">TIZ</div>
          <div style="font-size:9px;color:#888;letter-spacing:.15em;margin-top:2px">PUBLICIDAD</div>
        </div>
        <div style="margin-top:10px;font-size:10px;color:#555;line-height:1.7">
          <div>📞 11-3479-9737</div><div>✉️ info@tizpublicidad.com</div>
          <div>🌐 www.tizpublicidad.com</div><div>📍 Av Pte Perón 3779, J C Paz</div>
        </div>
      </td>
      <td style="vertical-align:top;text-align:right">
        <div style="font-size:22px;font-weight:700;color:#222;margin-bottom:12px">
          Presupuesto Nro: &nbsp;<span style="color:#e8b84b">${String(nro).padStart(7,'0')}</span>
        </div>
        <table style="margin-left:auto;font-size:12px;color:#555">
          <tr><td style="padding:2px 8px 2px 0;font-weight:600;color:#333">Fecha:</td><td>${fmtFecha(hoy)}</td></tr>
          <tr><td style="padding:2px 8px 2px 0;font-weight:600;color:#333">Validez hasta:</td><td>${fmtFecha(validez)}</td></tr>
          <tr><td style="padding:2px 8px 2px 0;font-weight:600;color:#333">Cliente:</td><td>${cliente}</td></tr>
        </table>
      </td>
    </tr></table>
    <table style="width:100%;border-collapse:collapse;border:1px solid #ddd;border-radius:6px;overflow:hidden">
      <thead><tr style="background:#f5f5f5">
        <th style="padding:10px 12px;text-align:left;font-size:13px;font-weight:600;border-bottom:2px solid #ddd">Descripción</th>
        <th style="padding:10px 12px;text-align:right;font-size:13px;font-weight:600;border-bottom:2px solid #ddd;white-space:nowrap">$ Unit</th>
        <th style="padding:10px 12px;text-align:center;font-size:13px;font-weight:600;border-bottom:2px solid #ddd">Unidades</th>
        <th style="padding:10px 12px;text-align:right;font-size:13px;font-weight:600;border-bottom:2px solid #ddd">Subtotal</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:16px;font-size:11px;color:#666">
      <div><em>Nota: ${nota}</em></div>
      <div><em>Condición de compra: ${cond}</em></div>
    </div>
    <table style="width:100%;margin-top:12px"><tr><td></td>
      <td style="text-align:right">
        <div style="background:#1a1a1a;color:#e8b84b;padding:10px 20px;border-radius:6px;display:inline-block;font-size:14px;font-weight:700">
          Total Cotizado &nbsp;&nbsp; ${fmtPeso(total)}
        </div>
      </td>
    </tr></table>
    <div style="margin-top:32px;padding:12px 16px;background:#1a1a1a;border-radius:8px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#aaa;flex-wrap:wrap;gap:8px">
      <span>📞 11-34798737</span><span>✉️ INFO@TIZPUBLICIDAD.COM</span>
      <span>🌐 WWW.TIZPUBLICIDAD.COM</span><span>📍 AV PTE PERÓN 3779, J C PAZ</span>
    </div>
  </div>`;

  const nombreArchivo = `Presupuesto_${String(nro).padStart(4,'0')}_${cliente.replace(/[^a-zA-Z0-9]/g,'_')}`;

  // Descargar Excel directamente
  const doExcelDownload = () => {
    if (!window.XLSX) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => _descargarExcelPres(nombreArchivo, nro, cliente, nota, cond, hoy, validez, total);
      document.head.appendChild(s);
    } else {
      _descargarExcelPres(nombreArchivo, nro, cliente, nota, cond, hoy, validez, total);
    }
  };

  const printWin = window.open('', '_blank', 'width=920,height=750');
  printWin.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>Presupuesto ${nro} — ${cliente}</title>
    <style>
      body{margin:20px;font-family:Arial,sans-serif}
      .toolbar{margin-top:20px;padding:14px 16px;background:#1a1a1a;border-radius:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .btn{padding:10px 20px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px}
      .hint{font-size:11px;color:#888;margin-left:auto}
      @media print{.toolbar{display:none}body{margin:0;padding:20px}@page{margin:1cm}}
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"><\/script>
    </head><body>
    ${html}
    <div class="toolbar">
      <button class="btn" style="background:#e8b84b;color:#000" onclick="window.print()">📄 Descargar PDF</button>
      <button class="btn" style="background:#1d6f42;color:#fff" onclick="descargarExcel()">📊 Descargar Excel</button>
      <span class="hint">PDF: en el diálogo elegí "Guardar como PDF" · Excel: se descarga directo</span>
    </div>
    <script>
    const ITEMS = ${JSON.stringify(window.ppItems)};
    const NRO = '${nro}';
    const CLIENTE = '${cliente.replace(/'/g,"\\'")}';
    const TOTAL = ${total};
    const FECHA = '${hoy.toLocaleDateString('es-AR')}';
    const VALIDEZ = '${validez.toLocaleDateString('es-AR')}';
    const NOTA = '${nota.replace(/'/g,"\\'")}';
    const COND = '${cond.replace(/'/g,"\\'")}';

    function descargarExcel() {
      const wb = XLSX.utils.book_new();
      const data = [
        ['PRESUPUESTO TIZ PUBLICIDAD'],
        [''],
        ['Nro Presupuesto', 'PRES-' + String(NRO).padStart(4,'0')],
        ['Cliente', CLIENTE],
        ['Fecha', FECHA],
        ['Válido hasta', VALIDEZ],
        [''],
        ['Descripción', 'Precio Unitario', 'Unidades', 'Subtotal'],
        ...ITEMS.map(i => [i.desc, +i.precio||0, +i.cant||1, (+i.precio||0)*(+i.cant||1)]),
        [''],
        ['', '', 'TOTAL COTIZADO', TOTAL],
        [''],
        ['Nota:', NOTA],
        ['Condición:', COND],
        [''],
        ['TIZ Publicidad · info@tizpublicidad.com · 11-3479-9737 · Av Pte Perón 3779, J C Paz'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      // Estilos de ancho
      ws['!cols'] = [{wch:45},{wch:18},{wch:12},{wch:18}];
      // Merge título
      ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:3}}];
      XLSX.utils.book_append_sheet(wb, ws, 'Presupuesto');
      XLSX.writeFile(wb, 'Presupuesto_' + String(NRO).padStart(4,'0') + '_' + CLIENTE.replace(/[^a-zA-Z0-9]/g,'_') + '.xlsx');
    }
    <\/script>
    </body></html>`);
  printWin.document.close();
  showToast('Presupuesto guardado en Firebase ✓ — abrí la ventana para descargar PDF o Excel');
};
window.estTab = 'tabla';
window.setEstTab = (tab, el) => {
  window.estTab = tab;
  document.querySelectorAll('#page-estadistica .page-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderEstadistica();
};

// Metas mensuales de la planilla (neto)
const METAS_MES = {
  'Ene': 65000000, 'Feb': 67600000, 'Mar': 70304000,
  'Abr': 73116160, 'May': 76040806, 'Jun': 79082439,
  'Jul': 0, 'Ago': 0, 'Sept': 0, 'Oct': 0, 'Nov': 0, 'Dic': 0
};
const SEMANAS_MES = {
  1:'Ene',2:'Ene',3:'Ene',4:'Ene',5:'Ene',
  6:'Feb',7:'Feb',8:'Feb',9:'Feb',
  10:'Mar',11:'Mar',12:'Mar',13:'Mar',
  14:'Abr',15:'Abr',16:'Abr',17:'Abr',18:'Abr',
  19:'May',20:'May',21:'May',22:'May',
  23:'Jun',24:'Jun',25:'Jun',26:'Jun',
  27:'Jul',28:'Jul',29:'Jul',30:'Jul',31:'Jul',
  32:'Ago',33:'Ago',34:'Ago',35:'Ago',
  36:'Sept',37:'Sept',38:'Sept',39:'Sept',
  40:'Oct',41:'Oct',42:'Oct',43:'Oct',44:'Oct',
  45:'Nov',46:'Nov',47:'Nov',48:'Nov',
  49:'Dic',50:'Dic',51:'Dic',52:'Dic'
};

function getEstData() {
  const obras = window.DB.obras;
  // Agrupar por semana
  const bySem = {};
  obras.forEach(o => {
    const sem = +o.semana || 0;
    if (!sem) return;
    if (!bySem[sem]) bySem[sem] = { ventas:0, produccion:0, colocaciones:0, cobranzas:0, obras:[] };
    bySem[sem].obras.push(o);
    // Ventas: precio de venta neto de la semana en que se cargó
    bySem[sem].ventas += (+o.neto || 0);
    // Producción: semana en que se terminó (fprod_r) o semana de la obra
    if (o.fprod_r) {
      const sem_prod = +o.semana || sem;
      if (!bySem[sem_prod]) bySem[sem_prod] = { ventas:0, produccion:0, colocaciones:0, cobranzas:0, obras:[] };
      bySem[sem_prod].produccion += (+o.neto || 0);
    }
    // Colocaciones: semana en que se colocó (fcol_r)
    if (o.fcol_r) {
      if (!bySem[sem]) bySem[sem] = { ventas:0, produccion:0, colocaciones:0, cobranzas:0, obras:[] };
      bySem[sem].colocaciones += (+o.neto || 0);
    }
    // Cobranzas: obras cobradas
    if (o.estado === 'Cobrado') {
      bySem[sem].cobranzas += (+o.neto || 0);
    }
  });
  return bySem;
}

function renderEstadistica() {
  const obras = window.DB.obras;
  const bySem = getEstData();
  const sems = Object.keys(bySem).map(Number).sort((a,b)=>a-b);

  // KPIs acumulados
  const totalVentas = obras.reduce((a,o)=>a+(+o.neto||0),0);
  const totalProd = obras.filter(o=>o.fprod_r).reduce((a,o)=>a+(+o.neto||0),0);
  const totalCol = obras.filter(o=>o.fcol_r).reduce((a,o)=>a+(+o.neto||0),0);
  const totalCobr = obras.filter(o=>o.estado==='Cobrado').reduce((a,o)=>a+(+o.neto||0),0);
  const metaAnual = Object.values(METAS_MES).reduce((a,v)=>a+v,0);
  const pctV = metaAnual ? Math.round(totalVentas/metaAnual*100) : 0;
  const pctP = metaAnual ? Math.round(totalProd/metaAnual*100) : 0;
  const pctC = metaAnual ? Math.round(totalCol/metaAnual*100) : 0;
  const pctCobr = metaAnual ? Math.round(totalCobr/metaAnual*100) : 0;

  document.getElementById('est-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Ventas acum.</div><div class="kpi-val ${pctV>=80?'green':pctV>=60?'amber':'red'}">${fmtM(totalVentas)}</div><div class="kpi-sub">${pctV}% de meta anual</div></div>
    <div class="kpi"><div class="kpi-label">Producción acum.</div><div class="kpi-val ${pctP>=80?'green':pctP>=60?'amber':'red'}">${fmtM(totalProd)}</div><div class="kpi-sub">${pctP}% de meta anual</div></div>
    <div class="kpi"><div class="kpi-label">Colocaciones acum.</div><div class="kpi-val ${pctC>=80?'green':pctC>=60?'amber':'red'}">${fmtM(totalCol)}</div><div class="kpi-sub">${pctC}% de meta anual</div></div>
    <div class="kpi"><div class="kpi-label">Cobranzas acum.</div><div class="kpi-val ${pctCobr>=80?'green':pctCobr>=60?'amber':'red'}">${fmtM(totalCobr)}</div><div class="kpi-sub">${pctCobr}% de meta anual</div></div>
  `;

  if (window.estTab === 'tabla') renderEstTabla(bySem, sems);
  else if (window.estTab === 'mensual') renderEstMensual(bySem, sems);
  else if (window.estTab === 'metas') renderEstMetas();
  else if (window.estTab === 'cumplimiento') renderEstCumplimiento();
}

function pctBar(val, meta) {
  if (!meta) return '';
  const p = Math.min(Math.round(val/meta*100), 100);
  const color = p>=80?'var(--green)':p>=60?'var(--amber)':'var(--red)';
  return `<div style="height:3px;background:var(--border);border-radius:2px;margin-top:3px"><div style="width:${p}%;height:3px;background:${color};border-radius:2px"></div></div>`;
}

function renderEstTabla(bySem, sems) {
  if (!sems.length) {
    document.getElementById('est-content').innerHTML = '<div style="text-align:center;padding:48px;color:var(--text3)">No hay datos cargados</div>';
    return;
  }

  let prevMes = '';
  const rows = sems.map(sem => {
    const d = bySem[sem];
    const mes = SEMANAS_MES[sem] || '';
    const meta = METAS_MES[mes] || 0;
    const pctV = meta ? Math.round(d.ventas/meta*100) : 0;
    const pctP = meta ? Math.round(d.produccion/meta*100) : 0;
    const pctC = meta ? Math.round(d.colocaciones/meta*100) : 0;
    const pctCobr = meta ? Math.round(d.cobranzas/meta*100) : 0;
    const showMes = mes !== prevMes;
    prevMes = mes;
    return `<tr>
      <td style="font-weight:500;color:var(--accent)">${showMes?mes:''}</td>
      <td style="font-weight:500">${sem}</td>
      <td>
        <span style="font-weight:500">${fmtM(d.ventas)}</span>
        ${pctBar(d.ventas, meta)}
        <span style="font-size:10px;color:${pctV>=80?'var(--green)':pctV>=60?'var(--amber)':'var(--red)'}">${pctV}%</span>
      </td>
      <td>
        <span style="font-weight:500">${fmtM(d.produccion)}</span>
        ${pctBar(d.produccion, meta)}
        <span style="font-size:10px;color:${pctP>=80?'var(--green)':pctP>=60?'var(--amber)':'var(--red)'}">${pctP}%</span>
      </td>
      <td>
        <span style="font-weight:500">${fmtM(d.colocaciones)}</span>
        ${pctBar(d.colocaciones, meta)}
        <span style="font-size:10px;color:${pctC>=80?'var(--green)':pctC>=60?'var(--amber)':'var(--red)'}">${pctC}%</span>
      </td>
      <td>
        <span style="font-weight:500">${fmtM(d.cobranzas)}</span>
        ${pctBar(d.cobranzas, meta)}
        <span style="font-size:10px;color:${pctCobr>=80?'var(--green)':pctCobr>=60?'var(--amber)':'var(--red)'}">${pctCobr}%</span>
      </td>
      <td style="color:var(--text3);font-size:11px">${fmtM(meta)}</td>
    </tr>`;
  }).join('');

  document.getElementById('est-content').innerHTML = `
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Mes</th><th>Sem</th>
          <th>Ventas</th><th>Producción</th><th>Colocaciones</th><th>Cobranzas</th>
          <th>Meta mes</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
}

function renderEstMensual(bySem, sems) {
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sept','Oct','Nov','Dic'];
  const byMes = {};
  sems.forEach(sem => {
    const mes = SEMANAS_MES[sem];
    if (!mes) return;
    if (!byMes[mes]) byMes[mes] = {ventas:0,produccion:0,colocaciones:0,cobranzas:0};
    byMes[mes].ventas += bySem[sem].ventas;
    byMes[mes].produccion += bySem[sem].produccion;
    byMes[mes].colocaciones += bySem[sem].colocaciones;
    byMes[mes].cobranzas += bySem[sem].cobranzas;
  });

  const rows = meses.filter(m => byMes[m]).map(mes => {
    const d = byMes[mes];
    const meta = METAS_MES[mes] || 0;
    const pV = meta?Math.round(d.ventas/meta*100):0;
    const pP = meta?Math.round(d.produccion/meta*100):0;
    const pC = meta?Math.round(d.colocaciones/meta*100):0;
    const pCo = meta?Math.round(d.cobranzas/meta*100):0;
    const badge = p => `<span class="badge badge-${p>=80?'green':p>=60?'amber':'red'}">${p}%</span>`;
    return `<tr>
      <td style="font-weight:500;color:var(--accent)">${mes}</td>
      <td>${fmtM(d.ventas)} ${badge(pV)}</td>
      <td>${fmtM(d.produccion)} ${badge(pP)}</td>
      <td>${fmtM(d.colocaciones)} ${badge(pC)}</td>
      <td>${fmtM(d.cobranzas)} ${badge(pCo)}</td>
      <td style="color:var(--text3)">${fmtM(meta)}</td>
    </tr>`;
  }).join('');

  document.getElementById('est-content').innerHTML = `
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>Mes</th><th>Ventas</th><th>Producción</th><th>Colocaciones</th><th>Cobranzas</th><th>Meta</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
}

function renderEstMetas() {
  const obras = window.DB.obras;
  const bySem = getEstData();
  const meses = ['Ene','Feb','Mar','Abr','May','Jun'];

  const cards = meses.map(mes => {
    const meta = METAS_MES[mes] || 0;
    const sems = Object.keys(SEMANAS_MES).filter(s => SEMANAS_MES[s]===mes).map(Number);
    const ventas = sems.reduce((a,s)=>a+(bySem[s]?.ventas||0),0);
    const prod = sems.reduce((a,s)=>a+(bySem[s]?.produccion||0),0);
    const col = sems.reduce((a,s)=>a+(bySem[s]?.colocaciones||0),0);
    const cobr = sems.reduce((a,s)=>a+(bySem[s]?.cobranzas||0),0);
    const pV = meta?Math.round(ventas/meta*100):0;
    const pP = meta?Math.round(prod/meta*100):0;
    const pC = meta?Math.round(col/meta*100):0;
    const pCo = meta?Math.round(cobr/meta*100):0;
    const bar = (v,p) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="font-size:11px;color:var(--text3);width:90px">${v}</span>
      <div style="flex:1;height:6px;background:var(--border);border-radius:3px">
        <div style="width:${Math.min(p,100)}%;height:6px;background:${p>=80?'var(--green)':p>=60?'var(--amber)':'var(--red)'};border-radius:3px"></div>
      </div>
      <span style="font-size:11px;font-weight:500;color:${p>=80?'var(--green)':p>=60?'var(--amber)':'var(--red)'};width:35px;text-align:right">${p}%</span>
    </div>`;
    return `<div class="card" style="margin-bottom:12px">
      <div class="card-header"><span class="card-title">${mes} — Meta: ${fmtM(meta)}</span></div>
      <div class="card-body">
        ${bar('Ventas',pV)}
        ${bar('Producción',pP)}
        ${bar('Colocaciones',pC)}
        ${bar('Cobranzas',pCo)}
      </div>
    </div>`;
  }).join('');

  document.getElementById('est-content').innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:0">${cards}</div>`;
}

function renderEstCumplimiento() {
  const obras = window.DB.obras;
  const conFProd = obras.filter(o => o.fprod_c);
  const prodEnFecha  = conFProd.filter(o => semaforo(o.fprod_c,o.fprod_r)==='g').length;
  const prodVencida  = conFProd.filter(o => semaforo(o.fprod_c,o.fprod_r)==='r').length;
  const prodEnRiesgo = conFProd.filter(o => semaforo(o.fprod_c,o.fprod_r)==='a').length;
  const prodSinFecha = obras.filter(o => !o.fprod_c).length;
  const conFCol = obras.filter(o => o.fcol_c);
  const colEnFecha   = conFCol.filter(o => semaforo(o.fcol_c,o.fcol_r)==='g').length;
  const colVencida   = conFCol.filter(o => semaforo(o.fcol_c,o.fcol_r)==='r').length;
  const colEnRiesgo  = conFCol.filter(o => semaforo(o.fcol_c,o.fcol_r)==='a').length;
  const colSinFecha  = obras.filter(o => !o.fcol_c).length;

  // --- Cobranzas ---
  const cobr = window.DB.cobranzas;
  const cobrCobradas  = cobr.filter(c => c.estado==='Cobrado').length;
  const cobrPendiente = cobr.filter(c => c.estado==='Pendiente' && diasDesdeHoy(c.vencimiento)<0).length;
  const cobrVencidas  = cobr.filter(c => c.estado==='Pendiente' && diasDesdeHoy(c.vencimiento)>=0).length;
  const cobrTotalMonto = cobr.reduce((a,c)=>a+(+c.importe||0),0);
  const cobrCobradoMonto = cobr.filter(c=>c.estado==='Cobrado').reduce((a,c)=>a+(+c.importe||0),0);
  const cobrPendMonto = cobr.filter(c=>c.estado!=='Cobrado').reduce((a,c)=>a+(+c.importe||0),0);
  const SECTORS = ['Producción','Colocaciones','Diseño','Ventas','Compras'];
  const COLORS_SEC = {'Producción':'#5b9cf6','Colocaciones':'#3dbfa0','Diseño':'#9b7ff4','Ventas':'#e8a020','Compras':'#e8b84b'};
  const sectorData = SECTORS.map(sec => {
    const ws = obras.filter(o=>o.sector===sec&&o.fprod_c);
    const ok = ws.filter(o=>semaforo(o.fprod_c,o.fprod_r)==='g').length;
    const mal = ws.filter(o=>semaforo(o.fprod_c,o.fprod_r)==='r').length;
    const riesgo = ws.filter(o=>semaforo(o.fprod_c,o.fprod_r)==='a').length;
    const pct = ws.length?Math.round(ok/ws.length*100):0;
    return {sec,ok,mal,riesgo,total:ws.length,pct};
  });

  document.getElementById('est-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div class="card">
        <div class="card-header"><span class="card-title">📦 Cumplimiento producción</span></div>
        <div class="card-body" style="display:flex;flex-direction:column;align-items:center;gap:14px">
          <div style="position:relative;width:200px;height:200px">
            <canvas id="chart-prod" width="200" height="200"></canvas>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
              <div style="font-size:26px;font-weight:700;color:var(--green)">${conFProd.length?Math.round(prodEnFecha/conFProd.length*100):0}%</div>
              <div style="font-size:10px;color:var(--text3)">en fecha</div>
            </div>
          </div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center;font-size:12px;color:var(--text2)">
            <span><span style="display:inline-block;width:10px;height:10px;background:#4caf7d;border-radius:2px;margin-right:4px"></span>En fecha: <b>${prodEnFecha}</b></span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#e8a020;border-radius:2px;margin-right:4px"></span>En riesgo: <b>${prodEnRiesgo}</b></span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#e05c5c;border-radius:2px;margin-right:4px"></span>Vencida: <b>${prodVencida}</b></span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#444;border-radius:2px;margin-right:4px"></span>Sin fecha: <b>${prodSinFecha}</b></span>
          </div>
          <div style="font-size:11px;color:var(--text3)">Total con fecha: ${conFProd.length} obras</div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">🚛 Cumplimiento colocaciones</span></div>
        <div class="card-body" style="display:flex;flex-direction:column;align-items:center;gap:14px">
          <div style="position:relative;width:200px;height:200px">
            <canvas id="chart-col" width="200" height="200"></canvas>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
              <div style="font-size:26px;font-weight:700;color:var(--green)">${conFCol.length?Math.round(colEnFecha/conFCol.length*100):0}%</div>
              <div style="font-size:10px;color:var(--text3)">en fecha</div>
            </div>
          </div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center;font-size:12px;color:var(--text2)">
            <span><span style="display:inline-block;width:10px;height:10px;background:#4caf7d;border-radius:2px;margin-right:4px"></span>En fecha: <b>${colEnFecha}</b></span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#e8a020;border-radius:2px;margin-right:4px"></span>En riesgo: <b>${colEnRiesgo}</b></span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#e05c5c;border-radius:2px;margin-right:4px"></span>Vencida: <b>${colVencida}</b></span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#444;border-radius:2px;margin-right:4px"></span>Sin fecha: <b>${colSinFecha}</b></span>
          </div>
          <div style="font-size:11px;color:var(--text3)">Total con fecha: ${conFCol.length} obras</div>
        </div>
      </div>
    </div>

    <!-- Cobranzas torta -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span class="card-title">💰 Estado de cobranzas</span></div>
      <div class="card-body" style="display:grid;grid-template-columns:200px 1fr;gap:24px;align-items:center">
        <div style="position:relative;width:200px;height:200px">
          <canvas id="chart-cobr" width="200" height="200"></canvas>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
            <div style="font-size:22px;font-weight:700;color:var(--green)">${cobr.length?Math.round(cobrCobradas/cobr.length*100):0}%</div>
            <div style="font-size:10px;color:var(--text3)">cobrado</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:12px;color:var(--text2)"><span style="display:inline-block;width:10px;height:10px;background:#4caf7d;border-radius:2px;margin-right:6px"></span>Cobrado</span>
              <span style="font-size:12px;font-weight:500;color:var(--green)">${cobrCobradas} facturas · ${fmtM(cobrCobradoMonto)}</span>
            </div>
            <div style="height:6px;background:var(--border);border-radius:3px">
              <div style="width:${cobr.length?Math.round(cobrCobradas/cobr.length*100):0}%;height:6px;background:#4caf7d;border-radius:3px"></div>
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:12px;color:var(--text2)"><span style="display:inline-block;width:10px;height:10px;background:#e8a020;border-radius:2px;margin-right:6px"></span>Pendiente</span>
              <span style="font-size:12px;font-weight:500;color:var(--amber)">${cobrPendiente} facturas</span>
            </div>
            <div style="height:6px;background:var(--border);border-radius:3px">
              <div style="width:${cobr.length?Math.round(cobrPendiente/cobr.length*100):0}%;height:6px;background:#e8a020;border-radius:3px"></div>
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:12px;color:var(--text2)"><span style="display:inline-block;width:10px;height:10px;background:#e05c5c;border-radius:2px;margin-right:6px"></span>Vencida</span>
              <span style="font-size:12px;font-weight:500;color:var(--red)">${cobrVencidas} facturas</span>
            </div>
            <div style="height:6px;background:var(--border);border-radius:3px">
              <div style="width:${cobr.length?Math.round(cobrVencidas/cobr.length*100):0}%;height:6px;background:#e05c5c;border-radius:3px"></div>
            </div>
          </div>
          <div style="padding-top:8px;border-top:1px solid var(--border);display:flex;justify-content:space-between">
            <span style="font-size:12px;color:var(--text3)">Total cobrado: <b style="color:var(--green)">${fmtM(cobrCobradoMonto)}</b></span>
            <span style="font-size:12px;color:var(--text3)">Pendiente: <b style="color:var(--amber)">${fmtM(cobrPendMonto)}</b></span>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Cumplimiento de producción por sector</span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:center">
          <div style="position:relative;height:220px"><canvas id="chart-sector"></canvas></div>
          <div style="display:flex;flex-direction:column;gap:12px">
            ${sectorData.map(d=>`
              <div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                  <span style="font-size:12px;font-weight:500;color:${COLORS_SEC[d.sec]}">${d.sec}</span>
                  <span style="font-size:12px;color:var(--text2)">${d.ok}/${d.total} · <b style="color:${d.pct>=80?'var(--green)':d.pct>=60?'var(--amber)':'var(--red)'}">${d.pct}%</b></span>
                </div>
                <div style="height:6px;background:var(--border);border-radius:3px">
                  <div style="width:${d.pct}%;height:6px;background:${COLORS_SEC[d.sec]};border-radius:3px"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>`;

  const drawCharts = () => {
    if (window._chartProd) { try{window._chartProd.destroy();}catch(e){} }
    if (window._chartCol)  { try{window._chartCol.destroy();}catch(e){} }
    if (window._chartSec)  { try{window._chartSec.destroy();}catch(e){} }
    if (window._chartCobr) { try{window._chartCobr.destroy();}catch(e){} }
    const donutOpts = {
      cutout:'65%',
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${ctx.raw}`}}},
      animation:{animateRotate:true,duration:700}
    };
    window._chartProd = new Chart(document.getElementById('chart-prod'),{
      type:'doughnut',
      data:{labels:['En fecha','En riesgo','Vencida','Sin fecha'],
        datasets:[{data:[prodEnFecha,prodEnRiesgo,prodVencida,prodSinFecha],
          backgroundColor:['#4caf7d','#e8a020','#e05c5c','#2a2a2a'],borderWidth:0,hoverOffset:4}]},
      options:donutOpts
    });
    window._chartCol = new Chart(document.getElementById('chart-col'),{
      type:'doughnut',
      data:{labels:['En fecha','En riesgo','Vencida','Sin fecha'],
        datasets:[{data:[colEnFecha,colEnRiesgo,colVencida,colSinFecha],
          backgroundColor:['#4caf7d','#e8a020','#e05c5c','#2a2a2a'],borderWidth:0,hoverOffset:4}]},
      options:donutOpts
    });
    window._chartCobr = new Chart(document.getElementById('chart-cobr'),{
      type:'doughnut',
      data:{labels:['Cobrado','Pendiente','Vencida'],
        datasets:[{data:[cobrCobradas,cobrPendiente,cobrVencidas],
          backgroundColor:['#4caf7d','#e8a020','#e05c5c'],borderWidth:0,hoverOffset:4}]},
      options:donutOpts
    });
    window._chartSec = new Chart(document.getElementById('chart-sector'),{
      type:'bar',
      data:{
        labels:sectorData.map(d=>d.sec),
        datasets:[
          {label:'En fecha',data:sectorData.map(d=>d.ok),backgroundColor:'#4caf7d',borderRadius:4},
          {label:'Vencida',data:sectorData.map(d=>d.mal),backgroundColor:'#e05c5c',borderRadius:4},
          {label:'En riesgo',data:sectorData.map(d=>d.riesgo),backgroundColor:'#e8a020',borderRadius:4},
        ]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#a09e9a',font:{size:11}}}},
        scales:{
          x:{stacked:true,ticks:{color:'#888780',font:{size:11}},grid:{display:false}},
          y:{stacked:true,ticks:{color:'#888780',font:{size:11}},grid:{color:'rgba(255,255,255,0.05)'}}
        }
      }
    });
  };
  if (typeof Chart==='undefined') {
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    s.onload=drawCharts; document.head.appendChild(s);
  } else { setTimeout(drawCharts,50); }
}

// ============================================================
// SYNC CON GOOGLE SHEETS
// ============================================================
const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycby9vhkFbz6Jt0IA9RtkCXQ1jb_tEyOPTorckPIYylHIHzBzFXXSfSKpgrJQTbdGDYy8U/exec';
const DRIVE_SHEETS_WEBHOOK = SHEETS_WEBHOOK;

async function syncToSheets(data) {
  if (!DRIVE_SHEETS_WEBHOOK) return null;
  const payload = { action: data.estado === 'Aprobado' ? 'obra_aprobada' : 'obra_guardada', obra: data, itemsCotizados: data.itemsCotizados || [], calculosAuxiliares: data.calculosAuxiliares || [] };
  try {
    const res = await fetch(DRIVE_SHEETS_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    const txt = await res.text();
    try { return JSON.parse(txt); } catch(_) { return { ok: true, raw: txt }; }
  } catch(e) { console.log('Sheets/Drive sync error (no crítico):', e.message); return null; }
}

window.exportarCSV = () => {
  const obras = [...window.DB.obras].sort((a,b) => (+b.semana||0) - (+a.semana||0));
  if (!obras.length) { showToast('No hay obras para exportar'); return; }

  const cols = [
    'Fecha','Semana','OT','Descripción','Arquitecto/Contacto','Cliente','Sector','Vendedor',
    'Estado','Neto','Bruto','Gastos',
    'F.Prod.Compromiso','F.Prod.Real',
    'F.Col.Compromiso','F.Col.Real',
    'OC/OP','Nro Factura','F.Factura','Estado Cobranza',
    'Comentarios',
    'Nota Producción','Nota Colocaciones','Nota Diseño','Nota Ventas','Nota Compras'
  ];

  const esc = v => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return s.includes(',') || s.includes('\n') || s.includes('"') ? `"${s}"` : s;
  };

  const rows = obras.map(o => {
    const n = o.notas_sector || {};
    return [
      esc(o.fecha||''), esc(o.semana||''), esc(o.ot||''), esc(o.desc||''),
      esc(o.arquitecto||''), esc(o.cliente||''), esc(o.sector||''), esc(o.vendedor||''),
      esc(o.estado||''), esc(o.neto||0), esc(o.bruto||0), esc(o.gastos||0),
      esc(o.fprod_c||''), esc(o.fprod_r||''),
      esc(o.fcol_c||''), esc(o.fcol_r||''),
      esc(o.oc||''), esc(o.nrfc||''), esc(o.ffc||''), esc(o.cobr||''),
      esc(o.comentarios||''),
      esc(n['Producción']||''), esc(n['Colocaciones']||''),
      esc(n['Diseño']||''), esc(n['Ventas']||''), esc(n['Compras']||'')
    ].join(',');
  });

  const csv = '\uFEFF' + cols.join(',') + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fecha = new Date().toLocaleDateString('es-AR').replace(/\//g,'-');
  a.href = url;
  a.download = `TIZ_Obras_${fecha}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${obras.length} obras exportadas`);
};
window.sugerirClientes = (q) => {
  const dd = document.getElementById('clientes-dropdown');
  if (!q || q.length < 1) { dd.style.display = 'none'; return; }

  const clientesDB = window.DB.clientes.map(c => ({ nombre: c.nombre, cuit: c.cuit, fuente: 'db' }));
  const clientesObras = [...new Set(window.DB.obras.map(o => o.cliente).filter(Boolean))]
    .filter(n => !clientesDB.find(c => c.nombre?.toLowerCase() === n.toLowerCase()))
    .map(n => ({ nombre: n, cuit: '', fuente: 'obras' }));

  const todos = [...clientesDB, ...clientesObras];
  const ql = q.toLowerCase();
  const matches = todos.filter(c => c.nombre && c.nombre.toLowerCase().includes(ql)).slice(0, 8);

  let html = matches.map(c => `
    <div class="cli-option" onmousedown="elegirCliente('${c.nombre.replace(/'/g,"\\'")}')">
      <span>${resaltar(c.nombre, q)}</span>
      ${c.cuit ? `<span class="cli-option-sub">CUIT: ${c.cuit}</span>` : `<span class="cli-option-sub" style="color:var(--text3)">de obras anteriores</span>`}
    </div>
  `).join('');

  // Botón para crear cliente nuevo
  html += `<div class="cli-option" onmousedown="nuevoClienteDesdeObra('${q.replace(/'/g,"\\'")}'')" style="border-top:1px solid var(--border);color:var(--accent)">
    <span>➕ Crear cliente "<strong>${q}</strong>"</span>
    <span class="cli-option-sub" style="color:var(--accent)">Abre el formulario de nuevo cliente</span>
  </div>`;

  dd.innerHTML = html;
  dd.style.display = 'block';
};

window.nuevoClienteDesdeObra = (nombre) => {
  // Cerrar dropdown
  cerrarSugerencias();
  // Guardar el nombre en el campo de la obra por si vuelve
  document.getElementById('f-cliente').value = nombre;
  // Abrir modal de cliente con nombre precargado
  window.editingId.cliente = null;
  document.getElementById('fc-nombre').value = nombre;
  document.getElementById('fc-cuit').value = '';
  document.getElementById('fc-contacto').value = '';
  document.getElementById('fc-cel').value = '';
  document.getElementById('fc-email').value = '';
  // Abrir modal cliente encima del modal obra
  document.getElementById('modal-cliente').classList.add('open');
};

window.resaltar = (texto, q) => {
  if (!q) return texto;
  const idx = texto.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return texto;
  return texto.substring(0, idx) +
    `<strong style="color:var(--accent)">${texto.substring(idx, idx + q.length)}</strong>` +
    texto.substring(idx + q.length);
};

window.elegirCliente = (nombre) => {
  document.getElementById('f-cliente').value = nombre;
  document.getElementById('clientes-dropdown').style.display = 'none';
};

window.cerrarSugerencias = () => {
  const dd = document.getElementById('clientes-dropdown');
  if (dd) dd.style.display = 'none';
};

window.crearTareaDesdeNota = (sector) => {
  const sectorKeys = {'Producción':'produccion','Colocaciones':'colocaciones','Diseño':'diseno','Ventas':'ventas','Compras':'compras'};
  const nota = document.getElementById('nota-'+sectorKeys[sector])?.value.trim();
  const obraId = window.editingId.obra;
  const obra = obraId ? window.DB.obras.find(x => x.id === obraId) : null;

  // Cerrar modal de obra y abrir modal de tarea precargado
  closeModal('obra');

  setTimeout(() => {
    window.editingId.tarea = null;
    // Limpiar filtros y cargar todas las obras
    const buscarEl = document.getElementById('ft-buscar-ot');
    if (buscarEl) buscarEl.value = '';
    const estadoEl = document.getElementById('ft-filtro-estado');
    if (estadoEl) estadoEl.value = '';
    filtrarObrasModal();
    // Seleccionar la obra actual
    const sel = document.getElementById('ft-obra-id');
    if (sel && obraId) sel.value = obraId;

    // Precargar campos
    document.getElementById('ft-desc').value = nota || (obra ? `${obra.desc||''} — ${obra.cliente||''}` : '');
    document.getElementById('ft-sector').value = sector;
    document.getElementById('ft-notas').value = nota || '';
    const fecha = document.getElementById('ft-fecha');
    if (obra?.fprod_c) fecha.value = obra.fprod_c;
    else fecha.value = '';
    document.getElementById('ft-hora-ini').value = '09:00';
    document.getElementById('ft-hora-fin').value = '11:00';

    document.getElementById('modal-tarea').classList.add('open');
  }, 150);
};
window.filtrarObrasModal = () => {
  const q = (document.getElementById('ft-buscar-ot')?.value || '').toLowerCase();
  const estado = document.getElementById('ft-filtro-estado')?.value || '';
  const sel = document.getElementById('ft-obra-id');
  const current = sel?.value;
  let obras = window.DB.obras;
  if (estado) obras = obras.filter(o => o.estado === estado);
  if (q) obras = obras.filter(o =>
    (o.ot||'').toLowerCase().includes(q) ||
    (o.desc||'').toLowerCase().includes(q) ||
    (o.cliente||'').toLowerCase().includes(q)
  );
  obras = obras.sort((a,b) => (b.semana||0)-(a.semana||0));
  if (sel) {
    sel.innerHTML = '<option value="">— Seleccionar obra —</option>' +
      obras.map(o => `<option value="${o.id}" ${o.id===current?'selected':''}>[Sem ${o.semana||'—'}] ${o.ot||'S/N'} — ${o.desc||''} · ${o.cliente||''} · ${o.estado||''}</option>`).join('');
  }
  const cnt = document.getElementById('ft-obras-count');
  if (cnt) cnt.textContent = obras.length + ' obra' + (obras.length !== 1 ? 's' : '');
};

window.openNuevaTarea = () => {
  window.editingId.tarea = null;
  ['ft-desc','ft-fecha','ft-hora-ini','ft-hora-fin','ft-notas','ft-buscar-ot'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  const estadoEl = document.getElementById('ft-filtro-estado');
  if (estadoEl) estadoEl.value = 'En producción';
  filtrarObrasModal();
  const sectorSel = document.getElementById('ft-sector');
  if (window.currentUser && sectorSel) sectorSel.value = window.currentUser.sector;
  document.getElementById('ft-hora-ini').value = '09:00';
  document.getElementById('ft-hora-fin').value = '11:00';
  openModal('tarea');
};

window.fillTareaObra = obraId => {
  const o = window.DB.obras.find(x => x.id === obraId);
  if (!o) return;
  // Autocompletar descripción si está vacía
  const desc = document.getElementById('ft-desc');
  if (!desc.value) desc.value = `${o.desc||''} — ${o.cliente||''}`;
  // Autocompletar fecha con fecha de producción compromiso si existe
  const fecha = document.getElementById('ft-fecha');
  if (!fecha.value && o.fprod_c) fecha.value = o.fprod_c;
};

window.saveTarea = async () => {
  const obraId   = document.getElementById('ft-obra-id').value;
  const desc     = document.getElementById('ft-desc').value.trim();
  const fecha    = document.getElementById('ft-fecha').value.trim();
  const horaIni  = document.getElementById('ft-hora-ini').value;
  const horaFin  = document.getElementById('ft-hora-fin').value;
  const sector   = document.getElementById('ft-sector').value;
  const notas    = document.getElementById('ft-notas').value.trim();

  if (!desc)  { showToast('Ingresá una descripción'); return; }
  if (!fecha) { showToast('Ingresá una fecha'); return; }
  if (!horaIni) { showToast('Ingresá la hora de inicio'); return; }

  const obra = window.DB.obras.find(x => x.id === obraId);
  const data = {
    obraId, desc, fecha, horaIni, horaFin: horaFin||horaIni,
    sector, notas,
    obraDesc: obra?.desc || '',
    obraOt:   obra?.ot   || '',
    cliente:  obra?.cliente || '',
    creadoPor: window.currentUser?.email || '',
    creadoPorNombre: window.currentUser?.name || '',
    completada: false,
  };

  await addDoc_('tareas', data);
  closeModal('tarea');

  // Enviar a Google Calendar
  enviarACalendar(data);
  showToast('Tarea guardada y enviada a Google Calendar');
};

function enviarACalendar(t) {
  // Construir fecha en formato YYYYMMDDTHHMMSS
  const [d, m, y] = t.fecha.split('/');
  const ini = `${y}${m.padStart(2,'0')}${d.padStart(2,'0')}T${t.horaIni.replace(':','')}00`;
  const fin = `${y}${m.padStart(2,'0')}${d.padStart(2,'0')}T${t.horaFin.replace(':','')}00`;
  const title = encodeURIComponent(`[TIZ ${t.sector}] ${t.obraOt ? t.obraOt+' — ' : ''}${t.desc}`);
  const details = encodeURIComponent(
    `Sector: ${t.sector}\nObra: ${t.obraDesc||t.desc}\nCliente: ${t.cliente}\n${t.notas ? 'Notas: '+t.notas : ''}\nCargado por: ${t.creadoPorNombre}`
  );
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${ini}/${fin}&details=${details}`;
  window.open(url, '_blank');
}

window.completarTarea = async id => {
  await updateDoc_('tareas', id, { completada: true, completadaFecha: new Date().toLocaleDateString('es-AR') });
  showToast('Tarea completada');
};
window.delTarea = async id => {
  if (confirm('¿Eliminar esta tarea?')) await deleteDoc_('tareas', id);
};
window.reenviarCalendar = id => {
  const t = window.DB.tareas.find(x => x.id === id);
  if (t) { enviarACalendar(t); showToast('Reenviando a Google Calendar...'); }
};

function renderTareas() {
  const u = window.currentUser;
  if (!u) return;

  document.getElementById('tareas-subtitle').textContent =
    u.isAdmin ? 'Todas las tareas' : `Sector: ${u.sector}`;

  let tareas = window.DB.tareas;
  // Filtrar por sector si no es admin
  if (!u.isAdmin) tareas = tareas.filter(t => t.sector === u.sector);
  // Filtrar por tab
  if (window.tareaTab === 'pendientes')  tareas = tareas.filter(t => !t.completada);
  if (window.tareaTab === 'completadas') tareas = tareas.filter(t => t.completada);
  // Ordenar por fecha
  tareas = tareas.sort((a,b) => {
    const pa = parseDate(a.fecha), pb = parseDate(b.fecha);
    return (pa||0) - (pb||0);
  });

  const pend  = window.DB.tareas.filter(t => !t.completada && (u.isAdmin || t.sector===u.sector)).length;
  const hoy   = window.DB.tareas.filter(t => !t.completada && t.fecha === new Date().toLocaleDateString('es-AR') && (u.isAdmin || t.sector===u.sector)).length;
  const comp  = window.DB.tareas.filter(t => t.completada && (u.isAdmin || t.sector===u.sector)).length;

  document.getElementById('tareas-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Pendientes</div><div class="kpi-val ${pend>0?'amber':''}">${pend}</div></div>
    <div class="kpi"><div class="kpi-label">Para hoy</div><div class="kpi-val ${hoy>0?'red':''}">${hoy}</div></div>
    <div class="kpi"><div class="kpi-label">Completadas</div><div class="kpi-val green">${comp}</div></div>
  `;

  if (!tareas.length) {
    document.getElementById('tareas-list').innerHTML =
      `<div style="text-align:center;padding:48px;color:var(--text3)"><i class="ti ti-checkbox" style="font-size:36px;display:block;margin-bottom:10px"></i>No hay tareas ${window.tareaTab === 'pendientes' ? 'pendientes' : ''}</div>`;
    return;
  }

  document.getElementById('tareas-list').innerHTML = tareas.map(t => {
    const color = SECTOR_COLORS[t.sector] || 'var(--accent)';
    const emoji = SECTOR_EMOJI[t.sector] || '📋';
    const esHoy = t.fecha === new Date().toLocaleDateString('es-AR');
    const vencida = !t.completada && parseDate(t.fecha) < new Date() && !esHoy;
    return `
    <div style="background:var(--surface);border:1px solid ${vencida?'rgba(224,92,92,.3)':esHoy?'rgba(232,184,75,.3)':'var(--border)'};border-radius:var(--radius-lg);padding:14px 16px;margin-bottom:10px;display:flex;align-items:flex-start;gap:12px">
      <input type="checkbox" ${t.completada?'checked':''} onchange="completarTarea('${t.id}')"
        style="accent-color:var(--accent);width:16px;height:16px;margin-top:2px;flex-shrink:0;cursor:pointer"
        ${t.completada?'disabled':''}>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-size:11px;font-weight:600;color:${color}">${emoji} ${t.sector}</span>
          ${t.obraOt ? `<span style="font-size:11px;color:var(--text3)">OT ${t.obraOt}</span>` : ''}
          ${esHoy ? `<span class="badge badge-amber">Hoy</span>` : ''}
          ${vencida ? `<span class="badge badge-red">Vencida</span>` : ''}
          ${t.completada ? `<span class="badge badge-green">Completada</span>` : ''}
        </div>
        <div style="font-size:13px;font-weight:500;color:var(--text);margin-bottom:4px;${t.completada?'text-decoration:line-through;color:var(--text3)':''}">${t.desc}</div>
        ${t.cliente ? `<div style="font-size:11px;color:var(--text3);margin-bottom:2px">Cliente: ${t.cliente}</div>` : ''}
        <div style="font-size:11px;color:var(--text2)">📅 ${t.fecha} &nbsp; 🕐 ${t.horaIni}${t.horaFin && t.horaFin!==t.horaIni ? ' — '+t.horaFin : ''}</div>
        ${t.notas ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;font-style:italic">${t.notas}</div>` : ''}
        ${u.isAdmin && t.creadoPorNombre ? `<div style="font-size:10px;color:var(--text3);margin-top:4px">Cargado por ${t.creadoPorNombre}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
        <button class="btn-icon" title="Reenviar a Calendar" onclick="reenviarCalendar('${t.id}')"><i class="ti ti-calendar-plus" style="font-size:13px"></i></button>
        <button class="btn-icon" title="Eliminar" onclick="delTarea('${t.id}')"><i class="ti ti-trash" style="font-size:13px"></i></button>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// PERMISOS EN MODAL DE OBRA — mostrar/ocultar fechas compromiso
// ============================================================
function applyObraPermissions() {
  const isAdmin = window.currentUser?.isAdmin;
  // Fechas de compromiso: solo admin puede editarlas
  ['f-fprod-c','f-fcol-c'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.readOnly = !isAdmin;
  });
  // Campos financieros: solo admin
  ['f-neto','f-bruto','f-gastos','f-oc','f-nrfc','f-ffc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.readOnly = !isAdmin; if (!isAdmin) el.style.opacity = '0.5'; }
  });
  // Anotaciones: mostrar solo las del sector propio (o todas si admin)
  const sectors = ['Producción','Colocaciones','Diseño','Ventas','Compras'];
  const sectorKeys = {'Producción':'produccion','Colocaciones':'colocaciones','Diseño':'diseno','Ventas':'ventas','Compras':'compras'};
  sectors.forEach(sec => {
    const key = sectorKeys[sec];
    const wrapper = document.getElementById('nota-wrapper-'+key);
    if (wrapper) {
      const canEdit = canAnnotateSector(sec);
      wrapper.style.opacity = canEdit ? '1' : '0.4';
      const textarea = document.getElementById('nota-'+key);
      if (textarea) textarea.readOnly = !canEdit;
    }
  });
}

// Llamar applyObraPermissions al abrir el modal de obra
const _origOpenModal = window.openModal;
window.openModal = type => {
  _origOpenModal(type);
  if (type === 'obra') setTimeout(applyObraPermissions, 50);
};

// ============================================================
// NAVIGATION — agregar tareas
// ============================================================
const _origGoTo = window.goTo;
window.goTo = function(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-'+page);
  if (pageEl) pageEl.classList.add('active');
  const navEl = document.querySelector(`[onclick="goTo('${page}')"]`);
  if (navEl) navEl.classList.add('active');
  window.currentPage = page;
  refreshCurrent();
};

const _origRefresh = window.refreshCurrent;
window.refreshCurrent = function() {
  _origRefresh();
  if (window.currentPage === 'tareas') renderTareas();
  if (window.currentPage === 'estadistica') renderEstadistica();
};

// Init — la app arranca en el listener de auth
// renderDashboard se llama cuando Firebase carga datos

// ============================================================
// V3 — ROLES POR PUESTO: navegación, permisos y acciones
// ============================================================
function showNoAccess(page) {
  const home = getHomeForCurrentRole();
  showToast(`Tu puesto no tiene acceso a ${page}. Redirigiendo a ${home}.`);
  setTimeout(() => window.goTo(home), 50);
}

// Reforzar navegación por puesto
const _v3GoTo = window.goTo;
window.goTo = function(page) {
  if (window.currentUser && !window.canViewPage(page)) {
    showNoAccess(page);
    return;
  }
  _v3GoTo(page);
  applyRoleUI();
};

// Permisos de campos dentro de obra por puesto
applyObraPermissions = function() {
  const role = window.currentUser?.role || window.currentUser?.sector;
  const isAdmin = role === 'Admin';
  const isVentas = role === 'Ventas';
  const canStatus = roleHasAction('obra:status');
  const canCreateOrEdit = roleHasAction('obra:create') || roleHasAction('obra:edit');

  // Campos base: ventas/admin pueden crear y completar datos comerciales.
  ['f-ot','f-desc','f-cliente','f-sector','f-vendedor','f-estado','f-semana','f-comentarios'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = !(isAdmin || isVentas || canStatus);
  });

  // Fechas compromiso: admin y ventas definen; producción/colocaciones/diseño completan reales.
  ['f-fprod-c','f-fcol-c'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.readOnly = !(isAdmin || isVentas); el.style.opacity = (isAdmin || isVentas) ? '1' : '0.55'; }
  });
  ['f-fprod-r','f-fcol-r'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.readOnly = !(isAdmin || canStatus); el.style.opacity = (isAdmin || canStatus) ? '1' : '0.55'; }
  });

  // Datos económicos/facturación: admin, ventas y cobranzas.
  const canMoney = isAdmin || isVentas || role === 'Cobranzas';
  ['f-neto','f-bruto','f-gastos','f-oc','f-nrfc','f-ffc','f-cobr'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = !canMoney;
    el.readOnly = !canMoney;
    el.style.opacity = canMoney ? '1' : '0.55';
  });

  // Notas por sector: cada puesto escribe su parte. Admin ve todo.
  const sectors = ['Producción','Colocaciones','Diseño','Ventas','Compras'];
  const sectorKeys = {'Producción':'produccion','Colocaciones':'colocaciones','Diseño':'diseno','Ventas':'ventas','Compras':'compras'};
  sectors.forEach(sec => {
    const key = sectorKeys[sec];
    const textarea = document.getElementById('nota-'+key);
    if (!textarea) return;
    const canEdit = canAnnotateSector(sec);
    textarea.readOnly = !canEdit;
    textarea.style.opacity = canEdit ? '1' : '0.45';
    textarea.title = canEdit ? `Puede editar notas de ${sec}` : `Solo lectura para puesto ${role}`;
  });
};

// Reforzar apertura de modales por puesto
const _v3OpenModal = window.openModal;
window.openModal = function(type) {
  const required = {
    obra: 'obra:create',
    cliente: 'cliente:edit',
    presupuesto: 'presupuesto:edit',
    cobranza: 'cobranza:edit',
    retencion: 'retencion:edit',
    tarea: 'tarea:edit'
  }[type];
  if (required && !roleHasAction(required) && !(type === 'obra' && (roleHasAction('obra:status') || roleHasAction('obra:note')))) {
    showToast('Tu puesto no tiene permiso para crear/editar este módulo.');
    return;
  }
  _v3OpenModal(type);
  if (type === 'obra') setTimeout(applyObraPermissions, 50);
};

// Reforzar guardado por puesto
const _v3SaveObra = window.saveObra;
window.saveObra = async function() {
  if (!window.canEditObra()) { showToast('Tu puesto no puede guardar obras.'); return; }
  await _v3SaveObra();
};
const _v3SaveCliente = window.saveCliente;
window.saveCliente = async function() {
  if (!roleHasAction('cliente:edit')) { showToast('Tu puesto no puede guardar clientes.'); return; }
  await _v3SaveCliente();
};
const _v3SavePresupuesto = window.savePresupuesto;
window.savePresupuesto = async function() {
  if (!roleHasAction('presupuesto:edit')) { showToast('Tu puesto no puede guardar presupuestos.'); return; }
  await _v3SavePresupuesto();
};
const _v3SaveCobranza = window.saveCobranza;
window.saveCobranza = async function() {
  if (!roleHasAction('cobranza:edit')) { showToast('Tu puesto no puede guardar cobranzas.'); return; }
  await _v3SaveCobranza();
};
const _v3SaveRetencion = window.saveRetencion;
window.saveRetencion = async function() {
  if (!roleHasAction('retencion:edit')) { showToast('Tu puesto no puede guardar retenciones.'); return; }
  await _v3SaveRetencion();
};

// Refresco final: aplicar permisos después de cada render
const _v3Refresh = window.refreshCurrent;
window.refreshCurrent = function() {
  _v3Refresh();
  applyRoleUI();
};
