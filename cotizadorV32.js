
/**
 * CLEMEN ERP V32 — Cotizador técnico y comercial
 * Cada ítem cotizado contiene múltiples insumos y un coeficiente propio.
 */
(() => {
'use strict';

const V='V32-COTIZADOR-20260801';
let items=[];
let selected=0;
let currentTab='costos';
let catalog=[];

const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const num=v=>{
  if(typeof v==='number') return Number.isFinite(v)?v:0;
  const s=String(v??'').trim().replace(/\$/g,'').replace(/\s/g,'');
  if(!s)return 0;
  if(s.includes(',') && s.includes('.')) return Number(s.replace(/\./g,'').replace(',','.'))||0;
  if(s.includes(',')) return Number(s.replace(',','.'))||0;
  return Number(s)||0;
};
const money=v=>'$ '+Math.round(num(v)).toLocaleString('es-AR');
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);

function formulaValue(raw){
  let s=String(raw??'').trim().toLowerCase();
  if(!s)return 0;
  s=s.replace(/,/g,'.').replace(/[×x]/g,'*').replace(/÷/g,'/').replace(/\s+/g,'');
  if(!/^[0-9+\-*/().]+$/.test(s)) return NaN;
  if(/\/0(?:\D|$)/.test(s)) return NaN;
  try {
    const value=Function('"use strict";return ('+s+')')();
    return Number.isFinite(value)?value:NaN;
  } catch(_){return NaN}
}

function blankItem(){
  return {
    _v32id:uid(), descripcion:'', cantidad:1, unidad:'u',
    insumos:[], coeficiente:2.2, costoTotal:0, precioSugerido:0,
    unitario:0, subtotal:0, observaciones:'', notasInternas:''
  };
}
function normalizeItem(raw={}){
  const cantidad=num(raw.cantidad||raw.cant||1)||1;
  const insumos=Array.isArray(raw.insumos)?raw.insumos.map(normalizeSupply):[];
  const costo=insumos.reduce((s,x)=>s+x.costoTotal,0) || num(raw.costoTotal);
  const coef=num(raw.coeficiente||raw.coef||2.2)||2.2;
  const suggested=costo*coef;
  const final=num(raw.unitario||raw.precioFinal||raw.precio||raw.precioSugerido||0);
  return {
    ...raw,_v32id:raw._v32id||uid(),
    descripcion:raw.descripcion||raw.desc||'',
    cantidad,unidad:raw.unidad||'u',insumos,coeficiente:coef,
    costoTotal:costo,precioSugerido:suggested,
    unitario:final,subtotal:num(raw.subtotal)||(cantidad*final),
    observaciones:raw.observaciones||'',notasInternas:raw.notasInternas||''
  };
}
function normalizeSupply(raw={}){
  const formula=String(raw.formula??raw.calculo??raw.cantidad??'1');
  const calculated=Number.isFinite(formulaValue(formula))?formulaValue(formula):num(raw.cantidadCalculada||raw.cantidad);
  const cost=num(raw.costoUnitario||raw.ultimoCosto);
  return {
    _id:raw._id||uid(),articuloId:raw.articuloId||'',codigo:raw.codigo||'',
    descripcion:raw.descripcion||raw.insumo||'',unidad:raw.unidad||'UNID',
    formula,cantidadCalculada:calculated,costoUnitario:cost,
    costoTotal:calculated*cost,proveedor:raw.proveedor||'',fechaCosto:raw.fechaCosto||''
  };
}
function recalcItem(it){
  it.insumos=(it.insumos||[]).map(normalizeSupply);
  it.costoTotal=it.insumos.reduce((s,x)=>s+num(x.costoTotal),0);
  it.coeficiente=num(it.coeficiente)||1;
  it.precioSugerido=it.costoTotal*it.coeficiente;
  it.cantidad=num(it.cantidad)||1;
  it.unitario=num(it.unitario);
  it.subtotal=it.cantidad*it.unitario;
  return it;
}
function totals(){
  items.forEach(recalcItem);
  const cost=items.reduce((s,i)=>s+i.costoTotal,0);
  const sale=items.reduce((s,i)=>s+i.subtotal,0);
  const margin=sale-cost;
  return {cost,sale,margin,pct:sale?margin/sale*100:0,weighted:cost?sale/cost:0};
}
function getSourceItems(){
  const current=Array.isArray(window.obraItems)?window.obraItems:[];
  return current.length?current.map(normalizeItem):[blankItem()];
}

function ensureStyle(){
 if(document.getElementById('v32-style'))return;
 const s=document.createElement('style');s.id='v32-style';s.textContent=`
 .v32-bg{position:fixed;inset:0;background:rgba(0,0,0,.84);z-index:12000;display:none;padding:18px;overflow:auto}.v32-bg.show{display:block}
 .v32-modal{max-width:1510px;margin:auto;background:var(--bg);border:1px solid var(--border);border-radius:13px;min-height:calc(100vh - 36px);box-shadow:0 30px 120px #000;padding:15px;color:var(--text)}
 .v32-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid var(--border);padding-bottom:11px}.v32-title{font-size:20px;font-weight:800}.v32-sub{font-size:10px;color:var(--text3);margin-top:4px}.v32-actions{display:flex;gap:7px;flex-wrap:wrap}
 .v32-summary-head{display:grid;grid-template-columns:1fr 90px 115px 90px 115px 115px 95px 84px;gap:7px;padding:8px 10px;font-size:8px;text-transform:uppercase;color:var(--text3);background:var(--surface2);border-radius:7px 7px 0 0}
 .v32-item{border:1px solid var(--border);background:var(--surface);border-radius:8px;margin-top:7px;overflow:hidden}.v32-item-row{display:grid;grid-template-columns:1fr 90px 115px 90px 115px 115px 95px 84px;gap:7px;align-items:center;padding:9px;cursor:pointer}.v32-item-row.selected{background:rgba(238,46,122,.06);border-left:3px solid var(--accent)}
 .v32-item-row input{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:7px;border-radius:6px;font-size:10px}.v32-number{text-align:right;font:600 10px 'DM Mono',monospace}.v32-green{color:var(--green)}.v32-red{color:var(--red)}
 .v32-work{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:10px;margin-top:12px}.v32-panel{border:1px solid var(--border);background:var(--surface);border-radius:9px;padding:11px}.v32-tabs{display:flex;gap:18px;border-bottom:1px solid var(--border);margin-bottom:10px}.v32-tab{border:0;background:transparent;color:var(--text3);padding:8px 1px;border-bottom:2px solid transparent;cursor:pointer}.v32-tab.active{color:var(--accent);border-bottom-color:var(--accent)}
 .v32-supply-head,.v32-supply{display:grid;grid-template-columns:minmax(220px,1.4fr) 75px 120px 85px 110px 110px 130px 80px 31px;gap:6px;align-items:center}.v32-supply-head{font-size:8px;text-transform:uppercase;color:var(--text3);padding:5px}.v32-supply{margin-bottom:6px}.v32-supply input,.v32-supply select{min-width:0;width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:7px;border-radius:6px;font-size:9px}.v32-supply small{font-size:8px;color:var(--text3)}
 .v32-kpi{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:10px}.v32-kpi b{font-family:'DM Mono',monospace}.v32-alert{border:1px solid var(--border);border-left:3px solid var(--amber);background:var(--surface2);border-radius:7px;padding:8px;margin-top:7px;font-size:9px}.v32-alert.red{border-left-color:var(--red)}
 .v32-fields{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.v32-field label{display:block;font-size:8px;text-transform:uppercase;color:var(--text3);margin-bottom:4px}.v32-field input,.v32-field textarea{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:7px}.v32-field.full{grid-column:1/-1}
 .v32-pill{font-size:8px;border-radius:99px;padding:4px 7px;background:rgba(76,175,125,.14);color:#61d79a}.v32-footer{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:13px;padding-top:10px;border-top:1px solid var(--border)}
 @media(max-width:1150px){.v32-work{grid-template-columns:1fr}.v32-summary-head{display:none}.v32-item-row{grid-template-columns:1fr 80px 100px}.v32-item-row>*:nth-child(n+4){display:none}.v32-supply-head{display:none}.v32-supply{grid-template-columns:1fr 70px 100px}.v32-supply>*:nth-child(n+4){display:none}}
 `;document.head.appendChild(s);
}
function ensureModal(){
 ensureStyle();let root=document.getElementById('v32-root');if(root)return root;
 root=document.createElement('div');root.id='v32-root';root.className='v32-bg';
 root.innerHTML=`<div class="v32-modal">
 <div class="v32-head"><div><div class="v32-title">Cotizador técnico y comercial</div><div class="v32-sub">Cada ítem tiene sus propios insumos, costos y coeficiente. El cliente solo verá descripción, cantidad y precio.</div></div><div class="v32-actions"><button class="btn btn-ghost" onclick="v32DuplicateItem()">Duplicar ítem</button><button class="btn btn-primary" onclick="v32AddItem()">＋ Agregar ítem</button><button class="btn btn-ghost" onclick="v32Close()">✕</button></div></div>
 <div id="v32-items"></div>
 <div class="v32-work"><div class="v32-panel"><div id="v32-editor"></div></div><aside class="v32-panel" id="v32-general"></aside></div>
 <div class="v32-footer"><span class="v32-sub">Los costos, coeficientes y márgenes son internos y no se exportan al PDF del cliente.</span><div><button class="btn btn-ghost" onclick="v32Close()">Cancelar</button> <button class="btn btn-primary" onclick="v32Apply()">Aplicar al presupuesto</button></div></div>
 </div>`;
 document.body.appendChild(root);return root;
}
function refreshCatalog(){
 catalog=typeof window.tizComprasCatalogoV32==='function'?window.tizComprasCatalogoV32():[];
}
function render(){
 items.forEach(recalcItem);
 const host=document.getElementById('v32-items');
 host.innerHTML=`<div class="v32-summary-head"><span>Descripción del ítem</span><span>Cantidad</span><span>Costo total</span><span>Coef.</span><span>Precio sugerido</span><span>Precio de venta</span><span>Margen</span><span>Estado</span></div>`+
 items.map((it,i)=>{
   const margin=it.subtotal-it.costoTotal,pct=it.subtotal?margin/it.subtotal*100:0;
   const complete=!!it.descripcion && it.insumos.length>0 && it.unitario>0;
   return `<div class="v32-item"><div class="v32-item-row ${i===selected?'selected':''}" onclick="v32Select(${i})">
    <input value="${esc(it.descripcion)}" placeholder="Descripción comercial del ítem" onclick="event.stopPropagation()" oninput="v32Set(${i},'descripcion',this.value)">
    <input type="number" step=".01" value="${it.cantidad}" onclick="event.stopPropagation()" oninput="v32Set(${i},'cantidad',this.value)">
    <span class="v32-number">${money(it.costoTotal)}</span>
    <input type="number" step=".01" value="${it.coeficiente}" onclick="event.stopPropagation()" oninput="v32Set(${i},'coeficiente',this.value)">
    <span class="v32-number v32-green">${money(it.precioSugerido)}</span>
    <input type="number" step=".01" value="${it.unitario}" onclick="event.stopPropagation()" oninput="v32Set(${i},'unitario',this.value)">
    <span class="v32-number ${margin<0?'v32-red':'v32-green'}">${pct.toFixed(1)}%</span>
    <span class="v32-pill">${complete?'Completo':'Revisar'}</span>
   </div></div>`;
 }).join('');
 renderEditor();renderGeneral();
}
function renderEditor(){
 const it=items[selected];if(!it)return;
 const editor=document.getElementById('v32-editor');
 editor.innerHTML=`<div style="font-weight:800;font-size:13px">Ítem ${selected+1} — ${esc(it.descripcion||'Sin descripción')}</div>
 <div class="v32-tabs"><button class="v32-tab ${currentTab==='comercial'?'active':''}" onclick="v32Tab('comercial')">Comercial</button><button class="v32-tab ${currentTab==='costos'?'active':''}" onclick="v32Tab('costos')">Costos</button><button class="v32-tab ${currentTab==='ia'?'active':''}" onclick="v32Tab('ia')">IA</button><button class="v32-tab ${currentTab==='docs'?'active':''}" onclick="v32Tab('docs')">Documentación</button></div>
 <div id="v32-tab-body"></div>`;
 const body=document.getElementById('v32-tab-body');
 if(currentTab==='comercial') body.innerHTML=`<div class="v32-fields"><div class="v32-field full"><label>Descripción que verá el cliente</label><textarea rows="5" oninput="v32Set(${selected},'descripcion',this.value)">${esc(it.descripcion)}</textarea></div><div class="v32-field"><label>Cantidad comercial</label><input type="number" step=".01" value="${it.cantidad}" oninput="v32Set(${selected},'cantidad',this.value)"></div><div class="v32-field"><label>Unidad</label><input value="${esc(it.unidad)}" oninput="v32Set(${selected},'unidad',this.value)"></div><div class="v32-field full"><label>Observaciones del ítem</label><textarea rows="3" oninput="v32Set(${selected},'observaciones',this.value)">${esc(it.observaciones)}</textarea></div></div>`;
 if(currentTab==='costos') {
   body.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>Insumos y materiales</b><div><button class="btn btn-ghost btn-sm" onclick="v32AddSupply()">＋ Agregar insumo</button></div></div>
   <div class="v32-supply-head"><span>Insumo</span><span>Unidad</span><span>Cálculo / fórmula</span><span>Cantidad</span><span>Último costo</span><span>Costo total</span><span>Proveedor</span><span>Fecha</span><span></span></div>
   <div id="v32-supplies">${it.insumos.map((x,j)=>supplyHTML(x,j)).join('')||'<div class="v32-alert">Todavía no cargaste insumos para este ítem.</div>'}</div>
   <datalist id="v32-catalog-list">${catalog.map(x=>`<option value="${esc(x.descripcion)}">${esc(x.codigo+' · '+x.unidad+' · '+money(x.ultimoCosto))}</option>`).join('')}</datalist>
   <div class="v32-fields" style="margin-top:12px"><div class="v32-field"><label>Coeficiente de este ítem</label><input type="number" step=".01" value="${it.coeficiente}" oninput="v32Set(${selected},'coeficiente',this.value)"></div><div class="v32-field"><label>Precio final definido</label><input type="number" step=".01" value="${it.unitario}" oninput="v32Set(${selected},'unitario',this.value)"></div></div>`;
 }
 if(currentTab==='ia'){
   const alerts=[];
   if(!it.insumos.length)alerts.push('No se cargaron insumos.');
   if(it.insumos.some(x=>!x.costoUnitario))alerts.push('Hay insumos sin costo.');
   if(it.coeficiente<1.8)alerts.push('El coeficiente está por debajo de 1,80.');
   if(it.unitario<it.costoTotal)alerts.push('El precio de venta es menor al costo.');
   if(!it.unitario)alerts.push('Falta definir el precio final.');
   body.innerHTML=(alerts.length?alerts.map((a,i)=>`<div class="v32-alert ${i===0?'red':''}">${esc(a)}</div>`).join(''):'<div class="v32-alert">✓ Ítem listo para cotizar.</div>')+`<div class="v32-field full" style="margin-top:10px"><label>Notas internas</label><textarea rows="4" oninput="v32Set(${selected},'notasInternas',this.value)">${esc(it.notasInternas)}</textarea></div>`;
 }
 if(currentTab==='docs') body.innerHTML=`<div class="v32-alert">En esta etapa, la documentación continúa gestionándose desde la OT y su carpeta de Drive. Los costos internos no aparecerán en el PDF comercial.</div>`;
}
function supplyHTML(x,j){
 return `<div class="v32-supply">
 <input list="v32-catalog-list" value="${esc(x.descripcion)}" placeholder="Buscar en Compras…" onchange="v32ChooseSupply(${j},this.value)">
 <input value="${esc(x.unidad)}" oninput="v32SupplySet(${j},'unidad',this.value)">
 <input value="${esc(x.formula)}" placeholder="1,20 × 2,40 × 2" oninput="v32SupplySet(${j},'formula',this.value)">
 <input value="${Number.isFinite(x.cantidadCalculada)?x.cantidadCalculada:''}" disabled>
 <input type="number" step=".01" value="${x.costoUnitario}" oninput="v32SupplySet(${j},'costoUnitario',this.value)">
 <span class="v32-number">${money(x.costoTotal)}</span>
 <small>${esc(x.proveedor||'—')}</small><small>${esc(x.fechaCosto||'—')}</small>
 <button class="btn-icon" onclick="v32RemoveSupply(${j})">×</button></div>`;
}
function renderGeneral(){
 const t=totals(),g=document.getElementById('v32-general');
 const low=items.filter(x=>x.coeficiente<1.8).length,noCost=items.filter(x=>!x.insumos.length||x.insumos.some(s=>!s.costoUnitario)).length;
 g.innerHTML=`<b>Resumen general del presupuesto</b>
 <div class="v32-kpi"><span>Costo total</span><b>${money(t.cost)}</b></div><div class="v32-kpi"><span>Venta total</span><b>${money(t.sale)}</b></div><div class="v32-kpi"><span>Margen bruto</span><b class="${t.margin<0?'v32-red':'v32-green'}">${money(t.margin)}</b></div><div class="v32-kpi"><span>Margen total</span><b class="${t.margin<0?'v32-red':'v32-green'}">${t.pct.toFixed(1)}%</b></div><div class="v32-kpi"><span>Coef. promedio ponderado</span><b>${t.weighted.toFixed(2)}</b></div>
 <div style="margin-top:12px"><b>Alertas generales</b>${low?`<div class="v32-alert">Hay ${low} ítems con coeficiente menor a 1,80.</div>`:''}${noCost?`<div class="v32-alert">Hay ${noCost} ítems con costos incompletos.</div>`:''}${!low&&!noCost?'<div class="v32-alert">✓ Costos y coeficientes completos.</div>':''}</div>
 <button class="btn btn-primary" style="width:100%;margin-top:12px" onclick="v32UseSuggestedAll()">Usar sugeridos donde falte precio</button>`;
}
window.v32Select=i=>{selected=i;render()};
window.v32Tab=t=>{currentTab=t;renderEditor()};
window.v32Set=(i,k,v)=>{if(['cantidad','coeficiente','unitario'].includes(k))v=num(v);items[i][k]=v;recalcItem(items[i]);render()};
window.v32AddItem=()=>{items.push(blankItem());selected=items.length-1;currentTab='costos';render()};
window.v32DuplicateItem=()=>{const copy=JSON.parse(JSON.stringify(items[selected]||blankItem()));copy._v32id=uid();copy.descripcion=(copy.descripcion||'')+' (copia)';copy.insumos=(copy.insumos||[]).map(x=>({...x,_id:uid()}));items.splice(selected+1,0,copy);selected++;render()};
window.v32AddSupply=()=>{items[selected].insumos.push(normalizeSupply({formula:'1'}));renderEditor();renderGeneral()};
window.v32RemoveSupply=j=>{items[selected].insumos.splice(j,1);render()};
window.v32SupplySet=(j,k,v)=>{const x=items[selected].insumos[j];x[k]=k==='costoUnitario'?num(v):v;const q=formulaValue(x.formula);x.cantidadCalculada=Number.isFinite(q)?q:0;x.costoTotal=x.cantidadCalculada*num(x.costoUnitario);recalcItem(items[selected]);renderEditor();renderGeneral()};
window.v32ChooseSupply=(j,description)=>{
 const found=catalog.find(x=>String(x.descripcion).toLowerCase()===String(description).toLowerCase());
 const s=items[selected].insumos[j];s.descripcion=description;
 if(found){Object.assign(s,{articuloId:found.id,codigo:found.codigo,unidad:found.unidad||s.unidad,costoUnitario:found.ultimoCosto||s.costoUnitario,proveedor:found.proveedor,fechaCosto:found.fechaCosto})}
 recalcItem(items[selected]);render();
};
window.v32UseSuggestedAll=()=>{items.forEach(x=>{if(!num(x.unitario))x.unitario=x.precioSugerido;recalcItem(x)});render()};
window.v32Close=()=>document.getElementById('v32-root')?.classList.remove('show');
window.v32Apply=()=>{
 items.forEach(recalcItem);
 window.obraItems=items.map(x=>({...x,precioFinal:x.unitario,subtotal:x.cantidad*x.unitario}));
 const net=document.getElementById('f-neto');if(net)net.value=Math.round(totals().sale);
 if(typeof window.renderObraItems==='function')window.renderObraItems();
 window.v32Close();
 if(window.showToast)window.showToast('Cotizador aplicado al presupuesto ✓');
};
window.abrirCotizadorV32=()=>{
 refreshCatalog();items=getSourceItems();selected=0;currentTab='costos';ensureModal().classList.add('show');render();
};

// Replace the legacy item grid with a compact summary and preserve V32 fields.
function install(){
 ensureModal();
 const oldRender=window.renderObraItems;
 window.renderObraItems=function(){
   const wrap=document.getElementById('obra-items-list');if(!wrap)return oldRender?.();
   const list=Array.isArray(window.obraItems)?window.obraItems.map(normalizeItem):[blankItem()];
   window.obraItems=list;
   const t=list.reduce((s,x)=>s+num(x.subtotal),0);
   wrap.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border);background:var(--surface2);border-radius:8px;padding:11px"><div><b>${list.length} ítem${list.length===1?'':'s'} cotizado${list.length===1?'':'s'}</b><div style="font-size:9px;color:var(--text3);margin-top:3px">Costo interno, coeficiente y precio por cada línea.</div></div><div style="display:flex;gap:12px;align-items:center"><b style="color:var(--accent)">${money(t)}</b><button type="button" class="btn btn-primary btn-sm" onclick="abrirCotizadorV32()">Abrir cotizador completo</button></div></div>`;
   const totalEl=document.getElementById('obra-items-total');if(totalEl)totalEl.textContent=money(t);
 };
 window.collectObraItems=function(){return (window.obraItems||[]).map(normalizeItem).filter(x=>x.descripcion||x.unitario||x.insumos.length)};

 const oldOpen=window.abrirPresupuestoPDF;
 window.abrirPresupuestoPDF=function(){window.abrirCotizadorV32()};

 const oldEdit=window.editObra;
 if(oldEdit)window.editObra=function(id){const raw=(window.DB?.obras||[]).find(x=>x.id===id);const r=oldEdit(id);setTimeout(()=>{if(raw?.itemsCotizados?.length){window.obraItems=raw.itemsCotizados.map(normalizeItem);window.renderObraItems()}},0);return r};
 const oldEditP=window.editPres;
 if(oldEditP)window.editPres=function(id){const p=(window.DB?.presupuestos||[]).find(x=>x.id===id);const o=p?.obraId?(window.DB?.obras||[]).find(x=>x.id===p.obraId):null;const r=oldEditP(id);setTimeout(()=>{const source=o?.itemsCotizados||p?.itemsCotizados||p?.items;if(source?.length){window.obraItems=source.map(normalizeItem);window.renderObraItems()}},0);return r};

 console.info('[CLEMEN ERP V32] Cotizador completo cargado',V);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,800));else setTimeout(install,800);
})();
