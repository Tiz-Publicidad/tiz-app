/* Obras: copia de Google Sheets como vista principal, con gestión por OT aparte. */
(function(){
'use strict';
const C=window.TIZObrasPlanillaCoreV1;
const state={copy:null,email:'',view:'sheet',query:'',cliente:'',estado:'',loading:false,copying:false,error:'',request:0,loaded:false,key:''};
const writers=['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com','pablo.aciar@tizpublicidad.com'];
const canCopy=()=>writers.includes(String(window.currentUser?.email||'').toLowerCase());
const time=v=>new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',dateStyle:'short',timeStyle:'short',hourCycle:'h23'}).format(new Date(v));
function reset(email){state.request++;Object.assign(state,{copy:null,email,query:'',cliente:'',estado:'',loading:false,copying:false,error:'',loaded:false,key:''});}
function layout(){
  const page=document.getElementById('page-obras');if(!page)return null;
  if(!document.getElementById('obras-planilla-panel')){
    const legacy=document.createElement('div');legacy.id='obras-gestion-panel';
    while(page.firstChild)legacy.appendChild(page.firstChild);
    page.appendChild(legacy);
    const nav=document.createElement('div');nav.id='obras-planilla-nav';nav.style.cssText='display:flex;gap:8px;padding:18px 28px 0;flex-wrap:wrap';
    nav.innerHTML='<button class="btn btn-ghost" data-obras-view="sheet">Planilla 2026</button><button class="btn btn-ghost" data-obras-view="gestion">Gestión por OT</button>';
    page.insertBefore(nav,legacy);
    const panel=document.createElement('section');panel.id='obras-planilla-panel';page.appendChild(panel);
    const style=document.createElement('style');style.textContent='#obras-planilla-panel{padding:22px 28px}#obras-planilla-panel .sheet-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}#obras-planilla-panel .sheet-filters{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:16px 0}#obras-planilla-panel label{display:grid;gap:5px;font-size:12px;color:var(--text2)}#obras-planilla-panel input,#obras-planilla-panel select{max-width:100%;min-height:36px}#obras-planilla-panel .sheet-table{overflow:auto;max-height:70vh;border:1px solid var(--border);border-radius:10px}#obras-planilla-panel table{min-width:1100px;width:max-content;border-collapse:separate;border-spacing:0;font-size:12px}#obras-planilla-panel th,#obras-planilla-panel td{min-width:100px;max-width:320px;white-space:pre-wrap;vertical-align:top;padding:10px;border-bottom:1px solid var(--border)}#obras-planilla-panel th{position:sticky;top:0;background:var(--bg2,#1b1b1b);z-index:1;white-space:nowrap}#obras-planilla-panel td[data-field="desc"],#obras-planilla-panel td[data-field="comentarios"]{min-width:260px}#obras-planilla-panel td:first-child,#obras-planilla-panel th:first-child{min-width:48px;width:48px}#obras-planilla-panel tr:nth-child(even){background:rgba(128,128,128,.04)}#obras-planilla-panel .sheet-state{font-weight:600}#obras-planilla-panel [role="alert"]{color:var(--red,#f88);margin:14px 0}@media(max-width:700px){#obras-planilla-panel{padding:18px 14px}#obras-planilla-nav{padding-left:14px!important}}';document.head.appendChild(style);
    nav.addEventListener('click',e=>{const b=e.target.closest('[data-obras-view]');if(b){state.view=b.dataset.obrasView;render();}});
    panel.addEventListener('click',e=>{if(e.target.closest('[data-copy-sheet]'))copyFromGoogle();if(e.target.closest('[data-sheet-csv]'))exportCSV();});
    panel.addEventListener('input',e=>{const key=e.target.dataset.sheetFilter;if(key){state[key]=e.target.value;renderTable();}});
    panel.addEventListener('change',e=>{const key=e.target.dataset.sheetFilter;if(key){state[key]=e.target.value;renderTable();}});
  }
  return page;
}
function renderTable(){
  const target=document.getElementById('obras-planilla-table');if(!target||!state.copy)return;
  const copy=state.copy,rows=C.filter(copy,state),map=C.columns(copy.headers);
  document.getElementById('obras-planilla-count').textContent=rows.length+' de '+copy.entries.length+' filas';
  target.innerHTML='<table aria-label="Obras copiadas de Google Sheets"><thead><tr><th>Fila</th>'+copy.headers.map(h=>'<th>'+C.esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(e=>'<tr><td>'+e.row+'</td>'+e.cells.map((v,i)=>{const field=i===map.desc?'desc':C.norm(copy.headers[i])==='comentarios'?'comentarios':i===map.estado?'estado':'';return '<td data-field="'+field+'"'+(field==='estado'?' class="sheet-state"':'')+'>'+C.esc(v)+'</td>';}).join('')+'</tr>').join('')+'</tbody></table>';
}
function render(){
  const email=String(window.currentUser?.email||'').toLowerCase();if(email!==state.email)reset(email);
  if(window.currentPage!=='obras'||!email)return;
  if(!layout())return;
  document.getElementById('obras-gestion-panel').hidden=state.view!=='gestion';
  const panel=document.getElementById('obras-planilla-panel');panel.hidden=state.view!=='sheet';
  document.querySelectorAll('[data-obras-view]').forEach(b=>b.classList.toggle('btn-primary',b.dataset.obrasView===state.view));
  const key=[state.copy?.copiedAt,state.copy?.sourceReadAt,state.loading,state.copying,state.error,state.email,state.view].join('|');
  if(key!==state.key){
    state.key=key;const copy=state.copy;
    panel.innerHTML='<div class="sheet-toolbar"><div><h2 style="margin:0 0 5px">Obras · Planilla 2026</h2><div style="font-size:12px;color:var(--text3)">Fuente principal: TIZ 2026 Base de Datos · Base de datos</div></div><div style="display:flex;gap:8px;flex-wrap:wrap">'+(copy?'<button class="btn btn-ghost btn-sm" data-sheet-csv>Descargar copia</button>':'')+(canCopy()?'<button class="btn btn-primary btn-sm" data-copy-sheet '+(state.loading||state.copying?'disabled':'')+'>'+(state.copying?'Copiando…':'Copiar datos de Google Sheets')+'</button>':'')+'</div></div>'+ (copy?'<p style="font-size:12px;color:var(--text2)">Datos leídos de Google Sheets: '+C.esc(time(copy.sourceReadAt))+' · Copia guardada en TIZ. Para traer cambios posteriores, volvé a copiar.</p><p style="font-size:12px;color:var(--text3)">Cada anticipo y saldo conserva su propia fila, importes, fechas y comentarios.</p>':'')+(state.error?'<div role="alert">'+C.esc(state.error)+(copy?' Se conserva la última copia guardada.':'')+'</div>':'')+(copy?'<div class="sheet-filters"><label>OT o descripción<input data-sheet-filter="query" placeholder="Buscar OT o descripción" value="'+C.esc(state.query)+'"></label><label>Cliente<input data-sheet-filter="cliente" placeholder="Buscar cliente" value="'+C.esc(state.cliente)+'"></label><label>Estado<select data-sheet-filter="estado"><option value="">Todos los estados</option>'+[...new Set(copy.entries.map(e=>C.text(e.cells[C.columns(copy.headers).estado])))].filter(Boolean).sort().map(s=>'<option'+(state.estado===s?' selected':'')+'>'+C.esc(s)+'</option>').join('')+'</select></label><span id="obras-planilla-count" style="font-size:12px;color:var(--text3)"></span></div><div class="sheet-table" id="obras-planilla-table" tabindex="0" aria-label="Planilla de obras; desplazar para ver todas las columnas"></div>':state.loading?'<p>Cargando la copia de obras…</p>':'<p>Todavía no hay una copia guardada de la planilla en TIZ.</p>');
    renderTable();
  }
  if(!state.loaded&&!state.loading&&!state.copying)loadSaved();
}
async function loadSaved(){
  state.loading=true;state.error='';state.loaded=true;const request=++state.request,email=state.email;render();
  try{const saved=await window.obrasPlanillaLeerCopiaV1();if(request!==state.request||email!==String(window.currentUser?.email||'').toLowerCase())return;state.copy=saved?C.validateCopy(saved):null;}
  catch(e){if(request===state.request)state.error=e.message||'No se pudo cargar la copia de obras.';}
  finally{if(request===state.request){state.loading=false;render();}}
}
async function copyFromGoogle(){
  if(state.copying||state.loading||!canCopy())return;
  state.copying=true;state.error='';const request=++state.request,email=state.email;render();
  try{
    const source=await window.obrasPlanillaLeerGoogleV1(),copy=C.fromResponse(source);
    if(request!==state.request||email!==String(window.currentUser?.email||'').toLowerCase())return;
    const saved=await window.obrasPlanillaGuardarCopiaV1(copy);
    if(request!==state.request||email!==String(window.currentUser?.email||'').toLowerCase())return;
    state.copy=C.validateCopy(saved);state.loaded=true;window.showToast?.(copy.entries.length+' filas copiadas de Google Sheets y guardadas en TIZ.');
  }catch(e){if(request===state.request)state.error=e.message||'No se pudo copiar la planilla.';}
  finally{if(request===state.request){state.copying=false;render();}}
}
function exportCSV(){if(!state.copy)return;const url=URL.createObjectURL(new Blob([C.csv(state.copy,C.filter(state.copy,state))],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='TIZ-obras-planilla-2026.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function install(){
  if(typeof window.renderObras!=='function'||window.renderObras.__obrasPlanillaV1)return;
  const original=window.renderObras;const wrapped=function(){const r=original.apply(this,arguments);render();return r;};wrapped.__obrasPlanillaV1=true;window.renderObras=wrapped;
  render();
}
window.TIZObrasPlanillaV1={render,copyFromGoogle,loadSaved};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
