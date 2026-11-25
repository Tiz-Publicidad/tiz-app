/* Materials start in Cotizaciones. Approval uses server-side prices and an immutable baseline. */
(function(){
'use strict';
const C=window.TIZInsumosCotizacionCoreV1;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>'ARS '+Number(v||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
const date=v=>C.day(v)?C.day(v).split('-').reverse().join('/'):String(v||'');
let rows=[],catalog=[],baseline=null,generation=0,session='',loaded=0,loading=false,error='',aiBusy=false,newQuoteId='';
let catalogDialog=null,catalogRequest=0,approving=false,matrix=null,showCommon=false,costEditOrigin=null;
let autoTimer,autoEnabled=true,autoEdited=false,autoAttempt='';
let signNeedsDirty=false,signMessage='';
const api=body=>window.insumosCotizacionApiV1(body);
const quote=()=>({desc:document.getElementById('pp-desc')?.value||'',items:window.ppItems||[]});
const sourceKey=()=>{const q=quote();return JSON.stringify({desc:C.text(q.desc),items:q.items.filter(i=>C.text(i.desc||i.descripcion)).map(i=>({desc:C.text(i.desc||i.descripcion),cantidad:i.cant??i.cantidad??1}))});};
const approvedQuote=()=>locked()||(window.DB?.presupuestos||[]).some(p=>p.id===window.editingId?.presupuesto&&p.estado==='Aprobado');
const automaticReady=()=>autoEnabled&&!approvedQuote()&&!approving&&!window.__tizPresupuestoGuardando&&document.getElementById('modal-prespdf')?.classList.contains('open')&&C.text([quote().desc,...quote().items.map(i=>i.desc||i.descripcion||'')].join(' ')).length>=12;
function scheduleAutomatic(){
 autoEdited=true;clearTimeout(autoTimer);if(!automaticReady()||sourceKey()===autoAttempt)return;
 autoTimer=setTimeout(()=>{if(!automaticReady()||sourceKey()===autoAttempt)return;if(aiBusy||loading)return;void suggest({automatic:true});},1800);
}
const host=()=>document.getElementById('pp-insumos-ventas');
const locked=()=>!!baseline;
function ensure(){
 if(host())return;
 const anchor=document.getElementById('pp-entrega-wrap');if(!anchor)return;
 const style=document.createElement('style');style.textContent=`
#pp-insumos-ventas{border:1px solid var(--border);border-radius:10px;margin-top:14px;padding:12px;background:var(--surface2)}
.iv-actions [hidden]{display:none!important}.iv-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.iv-actions input{max-width:90px}
.iv-table{margin-top:12px;overflow:auto;max-height:65vh;border:1px solid var(--border);border-radius:8px;position:relative}.iv-table table{width:calc(280px + var(--iv-columns)*148px);min-width:0;border-collapse:separate;border-spacing:0;table-layout:fixed}
.iv-table th,.iv-table td{box-sizing:border-box;width:148px;min-width:148px;padding:9px;overflow-wrap:anywhere;overflow:hidden;vertical-align:top;border-right:1px solid var(--border);border-bottom:1px solid var(--border);text-align:left;background:var(--surface2)}
.iv-table thead th{position:relative;z-index:1;background:var(--surface,#202124)}.iv-table .iv-work{position:sticky;left:0;width:280px;min-width:280px;max-width:280px;z-index:2;background:var(--surface,#202124);overflow-wrap:anywhere}.iv-table thead .iv-work{z-index:4}
.iv-table input:not([type=checkbox]),.iv-table select{box-sizing:border-box;width:100%;min-width:0;padding:7px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:5px}
.iv-table th{white-space:normal}.iv-table th>label{display:grid;gap:4px;white-space:normal}.iv-table th>button{white-space:normal;max-width:100%}
.iv-table [data-field="descripcion"]{display:block;width:100%;min-width:0;text-transform:none;font-weight:400}.iv-table th>[data-link]{display:block;width:100%;margin:4px 0}.iv-needs{margin:8px 0;padding:8px 0;border-top:1px solid var(--border,#444);border-bottom:1px solid var(--border,#444);color:var(--accent,#e8bd4c)}.iv-needs .iv-quantity-label{margin-top:7px;text-transform:none;font-weight:400}.iv-quantity-label{display:grid;font-size:11px;gap:4px;color:var(--text3)}.iv-table .iv-unit-price{padding:7px 0;color:var(--accent,#e8bd4c);font-weight:700}.iv-cost-breakdown{margin-top:14px;overflow:auto}.iv-cost-breakdown table{width:100%;font-size:12px;margin:8px 0;border-collapse:collapse}.iv-cost-breakdown th,.iv-cost-breakdown td{padding:7px;text-align:left;border-bottom:1px solid var(--border,#444)}.iv-material-name{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.3;min-height:2.6em;font-size:11px;margin:5px 0}.iv-table small{display:block;margin-top:4px}.iv-table details{font-weight:400;margin-top:8px;font-size:11px}.iv-table summary{cursor:pointer;color:var(--accent,#e8bd4c)}.iv-table details .iv-actions{margin:8px 0}.iv-table details button{white-space:normal;font-size:10px}.iv-table [data-price]{font-weight:400;font-size:10px}.iv-table [data-price]>small{font-size:10px}.iv-table .iv-red{box-shadow:inset 3px 0 var(--accent,#e8bd4c)}.iv-cell-invalid{border-color:var(--red,#ff758b)!important}.iv-row-cost{font-weight:700}.iv-common td{background:var(--surface,#262626)}.iv-table tfoot td{background:var(--surface,#202124);font-weight:700}.iv-red-text{color:var(--accent,#e8bd4c)}.iv-muted{color:var(--text3);font-size:11px}.iv-result{white-space:pre-line;margin-top:10px}
.iv-equivalence{position:fixed;inset:0;z-index:19000;background:#000b;display:grid;place-items:center;padding:20px}.iv-equivalence>div{background:var(--surface);color:var(--text);border:1px solid var(--border);padding:22px;border-radius:12px;max-width:520px;width:100%}.iv-equivalence input,.iv-equivalence select{box-sizing:border-box;width:100%;padding:8px;margin:6px 0 12px;background:var(--surface2,#292b30);color:var(--text,#eee);border:1px solid var(--border,#555)}.iv-equivalence label{display:grid;gap:4px}.iv-equivalence small{display:block;margin-top:4px}.iv-catalog td,.iv-catalog th{padding:8px;text-align:left;border-bottom:1px solid var(--border,#444)}@media(max-width:600px){.iv-table table{width:calc(200px + var(--iv-columns)*148px)}.iv-table .iv-work{width:200px;min-width:200px;max-width:200px}.iv-actions button{white-space:normal}}
`;document.head.append(style);
 const box=document.createElement('section');box.id='pp-insumos-ventas';box.setAttribute('aria-label','Insumos previstos por Ventas');
 box.innerHTML=`<div class="iv-actions"><div style="flex:1"><b>Costos por renglón · insumos compartidos</b><div class="iv-muted">Uso interno: no se incluye en el PDF del cliente.</div></div><button type="button" class="btn btn-ghost btn-sm" data-iv="reload">Actualizar stock y precios</button><button type="button" class="btn btn-primary btn-sm" data-iv="ai">Desglosar con IA</button><button type="button" class="btn btn-ghost btn-sm" data-iv="add">+ Agregar insumo</button></div><p class="iv-muted">Cargá la necesidad de cada ítem y el precio unitario de cada insumo. Si cargás por unidad cotizada, el total para la OT multiplica la necesidad por la cantidad cotizada. Si cargás por renglón completo, el total suma las cantidades ingresadas.</p><div class="iv-actions"><label class="iv-muted">Necesidades cargadas<select data-matrix-basis aria-label="Base de las necesidades de insumos"><option value="unidad">Por unidad cotizada</option><option value="total">Por renglón completo</option></select></label><label class="iv-muted">Índice para todos <input data-matrix-index-all inputmode="decimal" placeholder="Ej.: 2,7" aria-label="Índice multiplicador para todos los renglones"></label><button type="button" class="btn btn-ghost btn-sm" data-iv="index-all">Aplicar índice</button><button type="button" class="btn btn-ghost btn-sm" data-iv="add-sale">+ Ítem a cotizar</button><button type="button" class="btn btn-ghost btn-sm" data-iv="common">Consumos por repartir</button><small class="iv-muted">Venta unitaria sugerida = costo estimado unitario × índice. Ej.: 2,7 multiplica el costo por 2,7; no representa un margen del 270%.</small></div><div class="iv-table" tabindex="0" role="region" aria-label="Necesidades y precios de insumos"><table id="iv-matrix"></table></div><div class="iv-table" tabindex="0" role="region" aria-label="Costos y precios por ítem"><table id="iv-matrix-prices" style="--iv-columns:5"></table></div><datalist id="iv-catalog"></datalist><div class="iv-actions" style="margin-top:12px"><button type="button" class="btn btn-primary" data-iv="pending-costs" hidden>Aprobar presupuesto</button><small class="iv-muted" data-pending-cost-note></small></div><p id="iv-status" class="iv-result" role="status"></p><div id="iv-summary"></div>`;
 const auto=document.createElement('label');auto.className='iv-muted';auto.style.display='block';auto.style.marginTop='9px';auto.innerHTML='<input type="checkbox" data-iv-auto checked> Detectar insumos automáticamente al escribir. Revisá las cantidades y precios propuestos.';box.querySelector('.iv-actions').insertAdjacentElement('afterend',auto);
 const calculate=document.createElement('button');calculate.type='button';calculate.className='btn btn-ghost btn-sm';calculate.dataset.iv='sign';calculate.textContent='Calcular lona y caños';
 box.querySelector('[data-iv="ai"]').after(calculate);
 const signStatus=document.createElement('div');signStatus.className='iv-muted iv-result';signStatus.dataset.signStatus='';signStatus.setAttribute('role','status');signStatus.hidden=true;auto.after(signStatus);
 anchor.insertAdjacentElement('beforebegin',box);box.addEventListener('click',click);box.addEventListener('input',input);box.addEventListener('change',change);
}
const label=a=>a.codigo+' · '+a.descripcion;
const validItemArea=value=>Number.isFinite(value)&&value>=0;
function itemAreaText(item){
 const dimensions=window.TIZInsumosMatrizV1?.rectangleDimensions?.(item.desc||item.descripcion);
 const computed=dimensions?dimensions.width*dimensions.height:NaN;
 const area=validItemArea(item.areaM2Manual)?item.areaM2Manual:Number(computed.toPrecision(12));
 return validItemArea(area)?area.toLocaleString('es-AR',{useGrouping:false,maximumFractionDigits:20}):'';
}
function editItemArea(item,value){
 const raw=C.text(value),area=C.number(raw);
 if(!raw)delete item.areaM2Manual;
 else if(/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(raw)&&validItemArea(area))item.areaM2Manual=area;
 else window.showToast?.('Ingresá el área en m² con un número mayor o igual a cero.');
 return itemAreaText(item);
}
function restoreItemAreas(data,sales){
 sales.forEach((item,index)=>{
  const saved=data.items?.[index]?.areaM2Manual;
  if(validItemArea(saved))item.areaM2Manual=saved;
 });
}
function renderItemAreas(quoteItems){
 const header=quoteItems.previousElementSibling;
 if(header?.children[2]&&!header.querySelector('[data-pp-area-heading]')){
  const title=document.createElement('span');title.dataset.ppAreaHeading='';title.textContent='Área (m²)';
  title.style.cssText='flex:0 0 88px;font-size:10px;color:var(--text3);text-transform:uppercase';
  header.children[2].before(title);
 }
 quoteItems.querySelectorAll('.pp-item-row').forEach((row,index)=>{
  const item=matrixSales()[index];
  const price=row.querySelector('[oninput*="\'precio\'"]');
  if(!item||!price)return;
  let area=row.querySelector('[data-pp-item-area]');
  if(!area){
   area=document.createElement('input');area.dataset.ppItemArea='';area.inputMode='decimal';area.placeholder='m²';
   area.style.cssText='width:88px;min-width:0;flex-shrink:0;box-sizing:border-box';
   area.title='Podés editar el área. Borrá el valor para volver al cálculo automático.';
   area.setAttribute('aria-label',`Área en metros cuadrados del ítem ${index+1}`);
   area.addEventListener('change',()=>{area.value=editItemArea(item,area.value);});
   price.before(area);
  }
  if(area!==document.activeElement)area.value=itemAreaText(item);
 });
}
const selectedArticle=value=>{const matches=catalog.filter(a=>label(a)===value);return matches.length===1?matches[0]:null;};
function editApprovedCosts(){
 if(!locked())return true;
 const id=window.editingId?.presupuesto,original=(window.DB?.presupuestos||[]).find(p=>p.id===id);
 if(!original||typeof window.siguienteRevisionV354!=='function'){window.showToast?.('Reabrí la cotización desde Presupuestos para editar los costos.');return false;}
 const revision=document.getElementById('pp-revision'),state=document.getElementById('pp-estado');
 if(!revision||!state)return false;
 let next=window.siguienteRevisionV354(revision.value||original.revision||'1.1');
 const norm=window.normalizarRevisionV354||String,nro=String(original.nro||'').replace(/\D/g,'');
 for(let count=0;(window.DB.presupuestos||[]).some(p=>String(p.nro||'').replace(/\D/g,'')===nro&&norm(p.revision||'1.1')===norm(next));count++){if(count>=200){window.showToast?.('No se pudo asignar una revisión libre.');return false;}next=window.siguienteRevisionV354(next);}
 costEditOrigin=original;window.editingId.presupuesto=null;window._cotizacionBaseId=original.cotizacionBaseId||original.id;window._cotizacionRevisionAnteriorId=original.id;window._cotizacionEsRevisionNueva=true;
 revision.value=next;state.value='Borrador';baseline=null;newQuoteId=crypto.randomUUID();
 window.actualizarIdentificacionCotizacionV354?.();const revisionButton=document.getElementById('pp-btn-nueva-revision');if(revisionButton)revisionButton.style.display='none';
 error='';render();window.showToast?.('Revisión '+next+' editable. Se conserva la aprobada. Guardá y aprobá esta revisión para actualizar la OT.');return true;
}
function render(){
 ensure();if(!host())return;
 document.getElementById('iv-catalog').innerHTML=catalog.map(a=>`<option value="${esc(label(a))}">${esc(a.unidad)}</option>`).join('');
 renderMatrix();
 const auto=host().querySelector('[data-iv-auto]');if(auto){auto.checked=autoEnabled;auto.disabled=locked();}
 host().querySelector('[data-iv="ai"]').disabled=aiBusy||loading;
 host().querySelector('[data-iv="ai"]').textContent=aiBusy?'Desglosando…':locked()&&!rows.length?'Completar desglose con IA':'Desglosar con IA';
 host().querySelector('[data-iv="add"]').disabled=false;
 host().querySelector('[data-iv="sign"]').disabled=approvedQuote()||loading;
 const signStatus=host().querySelector('[data-sign-status]');signStatus.textContent=signMessage;signStatus.hidden=!signMessage;
 let note=host().querySelector('[data-approved-edit]');if(!note){note=document.createElement('div');note.dataset.approvedEdit='';host().prepend(note);}note.hidden=!locked();note.innerHTML=locked()?'<p><b>Esta cotización está aprobada.</b> Podés completar el desglose con IA o editar los insumos y precios. Se abre una revisión editable y se conserva la aprobada. Revisá los materiales y aprobá la nueva revisión para actualizar la OT.</p><button type="button" class="btn btn-primary" data-edit-approved>Editar insumos y precios</button>':'';
 status();
}
function mergeDuplicateColumn(index){
 const row=rows[index];if(!matrix||!row?.articuloId)return false;const other=rows.findIndex((r,i)=>i!==index&&r.articuloId===row.articuloId&&r.unidad===row.unidad);
 if(other<0)return false;return matrix.merge(index,other);
}
function matrixSales(){return Array.isArray(window.ppItems)?window.ppItems:[];}
function ensureMatrix(){if(!matrix)matrix=window.TIZInsumosMatrizV1.create(rows,matrixSales(),[],{defaultBasis:'unidad'});matrix.sync(matrixSales());matrix.totals(matrixSales());}
function calculateSignNeeds({manual=false}={}){
 if(approvedQuote()||!matrix||(!manual&&!signNeedsDirty))return;
 signNeedsDirty=false;
 let found=0,missingBrace=false,checkExisting=false;
 const sales=matrixSales();matrix.sync(sales);
 for(const item of sales){
  const sign=window.TIZInsumosMatrizV1.signMaterials(item.desc||item.descripcion,C.norm),needs=new Map();
  if(sign){found++;missingBrace||=sign.missingBrace;}
  for(const material of sign?.materials||[]){
   const isMatch=row=>material.matches(C.norm(row.descripcion));
   const compatible=rows.map((row,index)=>({row,index})).filter(({row})=>isMatch(row)&&C.unit(row.unidad)===material.unit);
   const conflicting=rows.some((row,index)=>isMatch(row)&&(matrix.get(null,index)||C.unit(row.unidad)!==material.unit&&matrix.get(item,index)));
   if(compatible.length>1||conflicting){checkExisting=true;continue;}
   let index=compatible[0]?.index;
   if(index===undefined&&rows.length<200){
    const matches=catalog.filter(article=>isMatch(article));
    const article=matches.find(candidate=>candidate.codigo===material.catalogCode)||(matches.length===1?matches[0]:null);
    rows.push(C.draft([{articuloId:article?.id,descripcion:article?.descripcion||material.description,unidad:material.unit}])[0]);
    index=rows.length-1;
   }
   if(index!==undefined)needs.set(index,material);
  }
  matrix.applySignNeeds(item,needs);
 }
 signMessage=[
  manual&&!found?'Indicá una estructura de hierro con lona y sus medidas, por ejemplo 2 m × 2 m.':'',
  missingBrace?'Para un marco distinto de 20 × 20, indicá también la medida del caño de refuerzo.':'',
  checkExisting?'Revisá los insumos repetidos, con consumos por repartir o cargados en otra unidad.':'',
 ].filter(Boolean).join('\n');
}
function renderMatrix(){
 ensureMatrix();const sales=matrixSales(),off=locked()?'disabled':'';
 const needs=(r,j)=>'<div class="iv-needs"><b>Necesidad</b>'+[...sales.map((item,i)=>({item,i})),...(showCommon||matrix.hasCommon()?[{item:null,i:-1}]:[])].map(({item,i})=>`<label class="iv-quantity-label" title="${esc(item?.desc||item?.descripcion||'Consumos por repartir')}"><span>${i<0?'Por repartir':'Ítem '+(i+1)} · <span data-need-unit>${esc(r.unidad||'unidad')}</span></span><input placeholder="Cantidad necesaria" data-matrix-sale="${i}" data-matrix-material="${j}" inputmode="decimal" aria-label="Cantidad de ${esc(r.descripcion||'insumo '+(j+1))} para ${esc(item?.desc||'consumos por repartir')}" value="${esc(matrix.get(item,j))}" ${off}></label>`).join('')+'</div>';
 const headers=rows.map((r,i)=>{const a=catalog.find(a=>a.id===r.articuloId),display=a?label(a):r.descripcion;return `<th data-iv-row="${i}"><div class="iv-actions" style="justify-content:space-between"><b>${esc(a?.codigo||'Sin código')}</b><button type="button" class="btn btn-ghost btn-sm" data-remove="${i}" aria-label="Quitar insumo ${i+1}" title="Quitar este insumo de todo el presupuesto">×</button></div><span class="iv-material-name" title="${esc(display)}">${esc(a?.descripcion||r.descripcion||'Elegir insumo')}</span><label class="iv-muted">Nombre o código<input data-field="descripcion" list="iv-catalog" aria-label="Insumo ${i+1}" placeholder="Nombre o código" title="${esc(display)}" value="${esc(display)}" ${off}></label>${!locked()?`<button type="button" class="btn btn-ghost btn-sm" data-link="${i}">Buscar catálogo</button>`:''}<select data-field="unidad" aria-label="Unidad material ${i+1}" ${off}><option value="">Unidad…</option>${[...new Set([...C.units,r.unidad].filter(Boolean))].map(u=>`<option value="${esc(u)}" ${u===r.unidad?'selected':''}>${esc(u)}</option>`).join('')}</select>${needs(r,i)}<div data-stock-price class="iv-muted"></div><label class="iv-muted iv-unit-price">Precio neto por 1 <span data-price-unit>${esc(r.unidad||'unidad')}</span><input data-field="precioPrevisto" inputmode="decimal" title="Precio por UNA unidad de medida. Podés incluir tu previsión de desperdicio. Vacío: usa Compras." aria-label="Precio previsto neto del insumo ${i+1}" value="${esc(r.precioPrevisto||'')}" ${locked()?'readonly':''}></label><button type="button" class="btn btn-ghost btn-sm" data-reset-price="${i}">Usar precio de Compras</button><small class="iv-muted">Editable · podés incluir desperdicio</small><div data-price></div><details><summary>Datos del insumo</summary><div class="iv-actions">${!locked()?`<button type="button" class="btn btn-ghost btn-sm" data-create="${i}">+ Nuevo insumo</button><button type="button" class="btn btn-ghost btn-sm" data-remove="${i}">Quitar columna</button>`:''}</div><small class="iv-muted">${r.origen==='ia'?'Sugerido por IA · ':''}${esc(r.nota||'')}</small><div data-stock><span></span>${!locked()?`<button type="button" class="btn btn-ghost btn-sm" data-equivalence="${i}">Definir equivalencia</button>`:''}</div><label><input type="checkbox" data-field="revisado" ${r.revisado?'checked':''} ${off}> Revisado</label><small><label><input type="checkbox" data-field="compraPendiente" ${r.compraPendiente?'checked':''} ${off}> Compra / verificación pendiente</label></small></details></th>`;}).join('');
 const materials=document.getElementById('iv-matrix');
 materials.closest('.iv-table').hidden=rows.length===0;
 materials.style.setProperty('--iv-columns',String(rows.length));
 materials.innerHTML=`<thead><tr><th class="iv-work">Insumos<small class="iv-muted">${matrix.basis()==='unidad'?'Consumos por unidad cotizada':'Consumos para el renglón completo'}</small></th>${headers}</tr></thead><tfoot><tr><td class="iv-work">Total de insumos para la OT</td>${rows.map((r,i)=>`<td data-matrix-total="${i}"></td>`).join('')}</tr></tfoot>`;
 document.getElementById('iv-matrix-prices').innerHTML=`<thead><tr><th class="iv-work">Ítem a cotizar</th><th>Costo estimado unitario<small class="iv-muted">ARS neto</small></th><th>Venta unitaria actual<small class="iv-muted">Sin IVA</small></th><th>Diferencia y margen previstos<small class="iv-muted">Sobre venta · sin IVA</small></th><th>Índice ×</th><th>Venta unitaria sugerida<small class="iv-muted">Sin IVA</small></th></tr></thead><tbody>${sales.map((item,i)=>`<tr><td class="iv-work">${!locked()?`<button type="button" class="btn btn-ghost btn-sm" data-remove-sale="${i}" aria-label="Quitar ítem a cotizar ${i+1}" title="Quitar el ítem y sus consumos">×</button>`:''}<b>${i+1}. ${esc(item.desc||item.descripcion||'Completá la descripción del ítem')}</b><small class="iv-muted">Cantidad cotizada: ${esc(item.cant??item.cantidad??1)}</small></td><td data-matrix-cost="${i}"></td><td data-matrix-sale-price="${i}"></td><td data-matrix-profit="${i}"></td><td><input data-matrix-index="${i}" inputmode="decimal" placeholder="Ej.: 2,7" aria-label="Índice multiplicador del renglón ${i+1}" value="${esc(matrix.index(item))}" ${off}></td><td><b data-matrix-price="${i}"></b>${!locked()?`<button type="button" class="btn btn-primary btn-sm" data-matrix-apply="${i}" style="margin-top:7px">Usar precio</button>`:''}</td></tr>`).join('')||'<tr><td class="iv-work">Agregá un ítem a cotizar arriba para empezar.</td></tr>'}${showCommon||matrix.hasCommon()?`<tr class="iv-common"><td class="iv-work"><b>Consumos por repartir</b><small class="iv-muted">Se conservan los consumos anteriores sin asignarlos a un ítem arbitrariamente. Repartilos en «Necesidad» de cada ítem y vaciá «Por repartir» para calcular precios por renglón.</small></td><td colspan="5" class="iv-muted">Estos consumos forman parte del total de materiales. Falta repartirlos para calcular los precios por renglón.</td></tr>`:''}</tbody>`;
 refreshMatrix();
}
function matrixCostCatalog(){
 if(!locked())return catalog;
 return (baseline.items||[]).map(line=>({id:line.articuloId,unidad:line.unidadStock,equivalenciasStock:line.equivalenciasStock||{},ultimoCosto:line.costoUnitarioStock,monedaCosto:baseline.monedaCosto||'ARS'}));
}
function marginText(value){return value===null?'Sin porcentaje · venta cero':value.toLocaleString('es-AR',{maximumFractionDigits:1})+'%';}
function refreshMatrix(){
 if(!matrix||!host())return;const basisSelect=host().querySelector('[data-matrix-basis]');if(basisSelect){basisSelect.value=matrix.basis();basisSelect.disabled=locked();}matrix.totals(matrixSales());const currency=document.getElementById('pp-moneda')?.value||'ARS';
 rows.forEach((r,i)=>{const el=host().querySelector('[data-matrix-total="'+i+'"]');if(el)el.textContent=(C.text(r.cantidad)===''?'Pendiente':C.number(r.cantidad).toLocaleString('es-AR',{maximumFractionDigits:6}))+' '+(r.unidad||'');});
 matrixSales().forEach((item,i)=>{const cost=matrix.cost(item,matrixCostCatalog(),C),el=host().querySelector('[data-matrix-cost="'+i+'"]'),price=host().querySelector('[data-matrix-price="'+i+'"]'),apply=host().querySelector('[data-matrix-apply="'+i+'"]');if(!el)return;
 el.innerHTML=matrix.hasCommon()?'Repartir consumos':cost.unitCost===null?'Costo pendiente':money(cost.unitCost)+'<small class="iv-muted">Total renglón: '+money(cost.total)+'</small>';const currentPrice=host().querySelector('[data-matrix-sale-price="'+i+'"]');if(currentPrice)currentPrice.textContent=new Intl.NumberFormat('es-AR',{style:'currency',currency:/^[A-Z]{3}$/.test(currency)?currency:'ARS'}).format(C.number(item.precio??item.unitario??0));if(price)price.innerHTML=currency!=='ARS'?'Requiere conversión de moneda':matrix.hasCommon()?'Repartir consumos':cost.unitPrice===null?'Completá costo e índice':money(cost.unitPrice)+'<small class="iv-muted">Total renglón: '+money(cost.suggested)+'</small>';if(apply)apply.disabled=locked()||currency!=='ARS'||!Number.isFinite(cost.unitPrice);const gain=host().querySelector('[data-matrix-profit="'+i+'"]'),comparison=window.TIZInsumosMatrizV1.profit(C.number(item.precio??item.unitario??0),cost.unitCost);if(gain)gain.innerHTML=currency!=='ARS'?'Requiere conversión de moneda':matrix.hasCommon()?'Repartir consumos':!comparison?'Costo o venta pendiente':'<b>'+money(comparison.difference)+'</b><small class="iv-muted">Diferencia por unidad</small><b>'+marginText(comparison.margin)+'</b><small class="iv-muted">Margen sobre venta · Total ítem: '+money(comparison.difference*cost.saleQty)+'</small>';
 });
 host().querySelectorAll('[data-matrix-material]').forEach(el=>{
 const row=rows[Number(el.dataset.matrixMaterial)],unitLabel=el.closest('label')?.querySelector('[data-need-unit]');
 if(unitLabel)unitLabel.textContent=row?.unidad||'unidad';
 const value=C.text(el.value),quantity=C.number(value),invalid=value!==''&&(!Number.isFinite(quantity)||quantity<0);
 el.classList.toggle('iv-cell-invalid',invalid);el.setAttribute('aria-invalid',String(invalid));
 });
 host().querySelectorAll('[data-matrix-index]').forEach(el=>{const value=C.text(el.value);el.setAttribute('aria-invalid',String(value!==''&&(!Number.isFinite(C.number(value))||C.number(value)<=0)));});
 host().querySelector('[data-iv="index-all"]').disabled=locked();host().querySelector('[data-matrix-index-all]').disabled=locked();host().querySelector('[data-iv="common"]').disabled=locked();
}
function matrixInput(e){
 if(locked()||!matrix)return false;const el=e.target;
 if(el.dataset.matrixBasis!==undefined){matrix.setBasis(el.value);if(autoEnabled)calculateSignNeeds();error='';render();return true;}
 if(el.dataset.matrixMaterial!==undefined){const i=Number(el.dataset.matrixSale),item=i<0?null:matrixSales()[i];if(i>=0&&!item)return true;matrix.set(item,Number(el.dataset.matrixMaterial),el.value);error='';matrix.totals(matrixSales());status();return true;}
 if(el.dataset.matrixIndex!==undefined){const item=matrixSales()[Number(el.dataset.matrixIndex)];if(item)matrix.setIndex(item,el.value);error='';refreshMatrix();return true;}
 return false;
}
function matrixFields(){
 ensureMatrix();if(autoEnabled)calculateSignNeeds();const active=matrixSales().filter(item=>C.text(item.desc)||C.number(item.precio)>0),items=matrix.exportItems(active).map((item,i)=>({...item,orden:i+1}));
 return {items,insumosVentas:C.draft(rows),insumosCotizacionId:newQuoteId,aprobarConInsumosPendientes:true,...(costEditOrigin?{cotizacionBaseId:costEditOrigin.cotizacionBaseId||costEditOrigin.id,revisionAnteriorId:costEditOrigin.id,obraId:costEditOrigin.obraId||''}:{})};
}
function status(){
 if(!host())return;
 if(matrix)matrix.totals(matrixSales());
 const result=locked()?{ok:true,total:baseline.subtotalCostoConocido??baseline.totalCosto,items:baseline.items,errores:[],costosPendientes:baseline.costosPendientes||[]}:C.validate(rows,catalog);
 const pending=locked()?(baseline.costosPendientes||[]):C.implementationValidation(rows,catalog).costosPendientes,button=host().querySelector('[data-iv="pending-costs"]');
 button.hidden=locked()||(!result.errores.length&&!result.avisos?.length);button.disabled=approving;button.textContent=approving?'Aprobando…':'Aprobar presupuesto';
 host().querySelector('[data-pending-cost-note]').textContent=locked()?'':'Podés aprobar normalmente. Los insumos, unidades, stock y costos por completar quedan registrados como alertas.';
 host().querySelectorAll('[data-iv-row]').forEach(tr=>{const i=Number(tr.dataset.ivRow),line=result.items[i],r=rows[i],a=catalog.find(a=>a.id===r.articuloId);const fullName=a?label(a):r.descripcion||'Elegir insumo';const nameInput=tr.querySelector('[data-field="descripcion"]'),nameLabel=tr.querySelector('.iv-material-name');if(nameInput)nameInput.title=fullName;if(nameLabel){nameLabel.title=fullName;nameLabel.textContent=a?.descripcion||r.descripcion||'Elegir insumo';}if(!line)return;tr.classList.toggle('iv-red',!!line.errores?.length||!!line.avisos?.length);
  const stock=tr.querySelector('[data-stock] span'),price=tr.querySelector('[data-price]');
  stock.innerHTML=(a?.control==='sin_stock'?'Servicio · sin movimiento físico de stock':(Number.isFinite(line.cantidadStock)?`${line.cantidadStock.toLocaleString('es-AR',{maximumFractionDigits:6})} ${esc(line.unidadStock)} de stock`:'Unidad por resolver'))+(a&&a.control!=='sin_stock'?`<small class="iv-muted">Disponible: ${a.stockDisponible===null?'sin conteo':a.stockDisponible.toLocaleString('es-AR')+' '+esc(a.unidad)}${a.fechaStock?' · conteo '+esc(date(a.fechaStock)):''}</small>`:'')+(line.errores||[]).concat(line.avisos||[]).map(s=>`<small class="iv-red-text">${esc(s)}</small>`).join('');
  const manual=line.costoOrigen==='manual'||C.text(r.precioPrevisto)!=='',estimate=locked()?line:C.materialCost(r,a);
  let suggestion=null;try{if(Number.isFinite(a?.ultimoCosto)&&a.ultimoCosto>0&&(!a.monedaCosto||a.monedaCosto==='ARS'))suggestion=C.stockQuantity(1,r.unidad,a)*a.ultimoCosto;}catch{}
  const suggested=tr.querySelector('[data-stock-price]'),editor=tr.querySelector('[data-field="precioPrevisto"]');
  if(suggested)suggested.textContent=Number.isFinite(suggestion)?'Compras: '+money(suggestion)+' / '+r.unidad:'Sin precio sugerido de Compras';
  if(editor)editor.placeholder=Number.isFinite(suggestion)?String(Math.round(suggestion*100)/100):'Cargar precio';
  const unitLabel=tr.querySelector('[data-price-unit]');if(unitLabel)unitLabel.textContent=r.unidad||'unidad';
  price.innerHTML=(manual?'<b>Precio manual aplicado</b>':'Precio de Compras')+(Number.isFinite(estimate.costoUnitarioPrevisto)?'<small>'+money(estimate.costoUnitarioPrevisto)+' / '+esc(r.unidad)+'</small>':'')+'<small>Total: '+(Number.isFinite(line.costoTotal)?money(line.costoTotal):'pendiente')+'</small>';
  const source=locked()?line:a;if(source&&!manual)price.innerHTML+='<small class="iv-muted">'+esc(date(source.fechaCosto)||'Sin fecha')+' · '+esc(source.proveedor||'Sin proveedor')+'</small>';

 });
 document.getElementById('iv-status').textContent=error||(loading?'Consultando stock y precios de Compras…':locked()?'Detalle aprobado el '+new Date(baseline.aprobadoEn).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})+'. Para cambiar materiales, creá una nueva revisión.':result.ok?'Materiales revisados. Se conservarán los precios manuales y se actualizarán los sugeridos de Compras al aprobar.':'Hay '+result.errores.length+' pendiente(s) en los insumos. Son alertas: podés aprobar y completarlos después.');
 if(locked()&&pending.length)document.getElementById('iv-status').textContent='Aprobada con '+pending.length+' costo(s) pendiente(s). El total de costos todavía no está definido.';
 if(baseline?.pendientesInsumos?.length)document.getElementById('iv-status').textContent='Aprobada con insumos pendientes:\n'+baseline.pendientesInsumos.join('\n');
 if(aiBusy)document.getElementById('iv-status').textContent='La IA está desglosando el trabajo. Esperando el resultado del servicio compartido…';
 refreshMatrix();
 document.getElementById('iv-summary').innerHTML=(pending.length||locked()&&baseline.totalCosto===null)?`<b>Costo total: pendiente de insumos / Compras</b><div class="iv-muted">Subtotal con costo conocido: ${money(result.total)}. ${pending.length} insumo(s) sin costo; no se consideran de costo cero.</div>`:`<b>${result.ok?'Costo de insumos previsto':'Costo parcial de insumos'}: ${money(result.total)}</b><div class="iv-muted">${locked()?'Precios conservados desde la aprobación.':'Precios previstos manuales o sugeridos de Compras. El importe y su origen se guardan al aprobar.'} Otros costos del trabajo se compararán por separado.</div>`;
 const currency=document.getElementById('pp-moneda')?.value||'ARS',saleRows=matrixSales(),saleValid=saleRows.length&&saleRows.every(item=>Number.isFinite(C.number(item.precio??item.unitario??0))&&C.number(item.precio??item.unitario??0)>=0&&Number.isFinite(C.number(item.cant??item.cantidad??1))&&C.number(item.cant??item.cantidad??1)>0),saleTotal=saleValid?saleRows.reduce((sum,item)=>sum+C.number(item.precio??item.unitario??0)*C.number(item.cant??item.cantidad??1),0):null,comparison=currency==='ARS'&&rows.length&&!pending.length&&!(locked()&&baseline.totalCosto===null)?window.TIZInsumosMatrizV1.profit(saleTotal,result.total):null;
 document.getElementById('iv-summary').innerHTML+='<div class="iv-profit-summary" style="margin:12px 0;padding:12px;border:1px solid var(--border,#555);border-radius:8px"><b>Resultado previsto del presupuesto</b>'+(comparison?'<div>Venta total neta: '+money(comparison.sale)+' · Costo total de insumos: '+money(comparison.cost)+'</div><div><b>Diferencia prevista: '+money(comparison.difference)+' · Margen total sobre venta: '+marginText(comparison.margin)+'</b></div>':'<div>'+ (currency!=='ARS'?'Requiere conversión a ARS para comparar costos y venta.':'Completá cantidades, precios de venta y costos para calcular el resultado total.')+'</div>')+'<small class="iv-muted">Margen = (venta − costo de insumos) ÷ venta × 100. El total usa los importes de todos los ítems; no promedia porcentajes. Otros costos del trabajo se comparan por separado.</small></div>';
 if(rows.length)document.getElementById('iv-summary').innerHTML+='<div class="iv-cost-breakdown"><b>Detalle del costo de insumos</b><table><thead><tr><th>Insumo</th><th>Cantidad total</th><th>Precio por unidad</th><th>Origen</th><th>Subtotal neto</th></tr></thead><tbody>'+rows.map((r,i)=>{const line=result.items[i]||{},a=catalog.find(a=>a.id===r.articuloId),estimate=locked()?line:C.materialCost(r,a),p=estimate.costoUnitarioPrevisto,q=C.number(r.cantidad),valid=C.text(r.cantidad)!==''&&Number.isFinite(q)&&q>=0,subtotal=valid&&Number.isFinite(p)?q*p:null;return '<tr><td>'+esc([a?.codigo,a?.descripcion||r.descripcion||'Insumo sin nombre'].filter(Boolean).join(' · '))+'</td><td>'+(valid?q.toLocaleString('es-AR',{maximumFractionDigits:6}):'Pendiente')+' '+esc(r.unidad||'')+'</td><td>'+(Number.isFinite(p)?money(p)+' / '+esc(r.unidad):'Pendiente')+'</td><td>'+(estimate.costoOrigen==='manual'?'Manual':'Compras')+'</td><td>'+(Number.isFinite(subtotal)?money(subtotal):'Pendiente')+'</td></tr>';}).join('')+'</tbody></table><small>Las cantidades son el consumo total del trabajo. El precio manual reemplaza al de Compras en este presupuesto y se conserva al aprobar.</small></div>';
}
async function load(force=false){
 const user=window.currentUser?.email||'';if(session!==user){catalog=[];loaded=0;session=user;}
 if(!user||loading&&!force||(!force&&Date.now()-loaded<30000)){status();return;}loading=true;error='';status();const expected=user,request=++catalogRequest;
 try{const result=await api({mode:'catalog'});if(expected!==window.currentUser?.email||request!==catalogRequest)return;catalog=result.articulos||[];loaded=Date.now();}
 catch(e){if(request===catalogRequest)error='No se pudo actualizar stock y precios: '+e.message;}
 finally{if(request===catalogRequest){loading=false;if(autoEnabled)calculateSignNeeds();render();if(autoEdited)scheduleAutomatic();}}
}
function open(data={},newRevision=false){clearTimeout(autoTimer);autoEdited=false;autoAttempt='';signNeedsDirty=false;signMessage='';costEditOrigin=null;catalogDialog?.remove();catalogDialog=null;generation++;newQuoteId=crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');rows=C.draft(data.insumosVentas||[]);restoreItemAreas(data,matrixSales());matrix=window.TIZInsumosMatrizV1.create(rows,matrixSales(),data.items||[],{defaultBasis:'unidad'});showCommon=false;baseline=newRevision?null:data.insumosVentasAprobados||null;error='';ensure();render();load();}
function input(e){if(matrixInput(e))return;const tr=e.target.closest('[data-iv-row]'),key=e.target.dataset.field;if(!tr||!key||locked())return;const row=rows[Number(tr.dataset.ivRow)];if(['revisado','compraPendiente','unidad'].includes(key))return;row[key]=e.target.value;if(key==='descripcion'){const a=selectedArticle(e.target.value);row.articuloId=a?.id||'';if(a){row.descripcion=a.descripcion;if(!row.unidad){row.unidad=a.unidad;tr.querySelector('[data-field="unidad"]').value=a.unidad;}}}row.revisado=false;tr.querySelector('[data-field="revisado"]').checked=false;error='';status();}
function change(e){if(e.target.matches('[data-iv-auto]')){autoEnabled=e.target.checked;clearTimeout(autoTimer);if(autoEnabled){if(!loading&&signNeedsDirty){calculateSignNeeds();render();}autoAttempt='';scheduleAutomatic();}return;}if(matrixInput(e))return;const tr=e.target.closest('[data-iv-row]'),key=e.target.dataset.field;if(!tr||!key||locked())return;const row=rows[Number(tr.dataset.ivRow)];if(key==='unidad'&&row.unidad&&row.unidad!==e.target.value){delete row.precioPrevisto;const editor=tr.querySelector('[data-field="precioPrevisto"]');if(editor)editor.value='';window.showToast?.('Cambió la unidad: revisá el precio previsto por la nueva unidad.');}if(['revisado','compraPendiente'].includes(key))row[key]=e.target.checked;else row[key]=e.target.value;
 if(key==='descripcion'){const a=selectedArticle(e.target.value);row.articuloId=a?.id||'';if(a){row.descripcion=a.descripcion;if(!row.unidad){row.unidad=a.unidad;tr.querySelector('[data-field="unidad"]').value=a.unidad;}}row.revisado=false;}
 if(['descripcion','unidad'].includes(key)&&mergeDuplicateColumn(Number(tr.dataset.ivRow))){error='';render();return;}
 error='';status();
}
function addSuggestions(work,suggestions){
 const helpers=window.TIZInsumosMatrizV1;
 const existing=new Set(rows.map(r=>r.articuloId||C.norm(r.descripcion)));
 const occupied=new Set(rows.map(r=>helpers?.laborRole?.(r.descripcion,C.norm)).filter(Boolean));
 const added=[];
 const append=(r,a)=>{
  const description=a?.descripcion||C.text(r.descripcion),identity=a?.id||C.norm(description);
  if(!identity||existing.has(identity))return;
  existing.add(identity);
  added.push({articuloId:a?.id||'',descripcion:description,unidad:C.unit(a?.unidad||r.unidad),origen:'ia',nota:r.motivo||r.nota||''});
 };
 for(const r of suggestions){
  const article=catalog.find(a=>a.id===r.articuloId);
  const role=helpers?.laborRole?.(article?.descripcion||r.descripcion,C.norm);
  if(role)continue;
  append(r,article);
 }
 for(const need of helpers?.laborSuggestions?.(work,C.norm)||[]){
  if(occupied.has(need.role))continue;
  const options=catalog.filter(a=>a.control==='sin_stock'&&helpers.laborRole(a.descripcion,C.norm)===need.role);
  const article=options.find(a=>a.codigo===need.code)||(options.length===1?options[0]:null);
  const target=need.items.length?'Ítems '+need.items.join(', ')+'. ':'';
  append({descripcion:need.description,unidad:need.unit,nota:target+'Completá la necesidad y revisá el precio unitario.'},article);
  occupied.add(need.role);
 }
 if(rows.length+added.length>200)throw Error('El detalle admite hasta 200 insumos.');
 rows.push(...C.draft(added));
 return added.length;
}
async function suggest({automatic=false}={}){
 if(aiBusy||loading)return;if(automatic&&!automaticReady())return;if(locked()&&!editApprovedCosts())return;
 clearTimeout(autoTimer);autoAttempt=sourceKey();const current=generation,source=sourceKey(),work=quote();aiBusy=true;error='';render();
 try{
  let prepared,result,aiError;
  try{prepared=await api({mode:'suggest',cotizacion:work});result=prepared.servicioIA?await requestShared(prepared.servicioIA):prepared;}
  catch(e){aiError=e;}
  if(current!==generation||automatic&&!automaticReady())return;
  if(source!==sourceKey()){if(automatic)return;throw Error('Cambió la descripción del trabajo durante el desglose. Volvé a pedirlo para usar los datos actuales.');}
  const proposed=aiError?[]:C.printingMaterials(work,catalog,[...rows,...(result?.materiales||[])],prepared?.memoriaInsumos||[]).filter(r=>!rows.includes(r));
  const added=addSuggestions(work,proposed);
  if(aiError)throw Error(added?'Se agregó la mano de obra detectada. El desglose de materiales falló: '+aiError.message:aiError.message);
  if(!proposed.length&&!added)throw Error('El desglose no encontró insumos adicionales. Revisá la descripción o cargalos manualmente.');
 }catch(e){if(current===generation)error=e.message;}
 finally{aiBusy=false;if(current===generation)render();if(autoEdited&&sourceKey()!==autoAttempt)scheduleAutomatic();}
}
function requestShared(service){
 return new Promise((resolve,reject)=>{
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec\/[A-Za-z0-9_-]+$/.test(service.url||''))return reject(Error('La conexión de IA no es válida.'));
  const requestId='cpia-'+Date.now()+'-'+Math.random().toString(36).slice(2),callback='__tizIaCb_materials_'+requestId.replace(/[^a-zA-Z0-9_]/g,'_');let done=false,timer,pollTimer,frame,form,script;
  const finish=(err,data)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(pollTimer);script?.remove();frame?.remove();form?.remove();window[callback]=()=>{};setTimeout(()=>{delete window[callback];},10000);if(err)reject(err);else resolve(data);};
  const poll=()=>{if(done)return;clearTimeout(pollTimer);script?.remove();script=document.createElement('script');script.onerror=()=>{script.remove();if(!done){clearTimeout(pollTimer);pollTimer=setTimeout(poll,3000);}};script.src=service.url+'?action=status&requestId='+encodeURIComponent(requestId)+'&callback='+encodeURIComponent(callback)+'&_='+Date.now();document.body.append(script);pollTimer=setTimeout(poll,10000);};
  window[callback]=payload=>{if(done)return;clearTimeout(pollTimer);script?.remove();if(payload?.pending){pollTimer=setTimeout(poll,3000);return;}if(!payload?.ok)return finish(Error(payload?.error||'No se pudo desglosar el trabajo.'));finish(null,payload.data||{});};
  timer=setTimeout(()=>finish(Error('La IA tardó más de dos minutos. El borrador se conserva; podés reintentar.')),120000);
  try{frame=document.createElement('iframe');frame.name='tiz-materials-'+requestId;frame.style.display='none';document.body.append(frame);form=document.createElement('form');form.method='POST';form.action=service.url;form.target=frame.name;form.style.display='none';for(const [name,value] of Object.entries({action:'analyzeMaterials',requestId,datos:JSON.stringify(service.datos)})){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);}document.body.append(form);form.submit();pollTimer=setTimeout(poll,1500);}catch(e){finish(e);}
 });
}
function equivalence(index){
 const r=rows[index],a=catalog.find(a=>a.id===r.articuloId);if(!a||!r.unidad){error='Elegí primero el insumo del catálogo y la unidad de uso.';status();return;}if(C.unit(r.unidad)===C.unit(a.unidad)){error='La unidad de uso ya coincide con stock.';status();return;}
 const current=generation,layer=document.createElement('div');layer.className='iv-equivalence';layer.setAttribute('role','dialog');layer.setAttribute('aria-label','Equivalencia de unidades');layer.innerHTML=`<div><h3>Equivalencia del insumo</h3><p>${esc(a.descripcion)}</p><p>Una unidad de stock (${esc(a.unidad)}) equivale a cuántos ${esc(r.unidad)}:</p><input id="iv-factor" inputmode="decimal" aria-label="Equivalencia por unidad de stock" value="${esc(a.equivalenciasStock?.[r.unidad]||'')}"><p class="iv-muted">Ejemplo: una placa de 1,22 × 2,44 m equivale a 2,9768 m². Esta equivalencia queda disponible para Ventas y Compras.</p><p data-error role="alert"></p><div class="iv-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancelar</button><button type="button" class="btn btn-primary" data-save>Guardar equivalencia</button></div></div>`;document.body.append(layer);layer.querySelector('[data-cancel]').onclick=()=>layer.remove();layer.querySelector('[data-save]').onclick=async e=>{e.target.disabled=true;try{const result=await api({mode:'equivalence',articuloId:a.id,unidad:r.unidad,unidadStock:a.unidad,factor:layer.querySelector('#iv-factor').value});a.equivalenciasStock=result.equivalenciasStock;layer.remove();if(current===generation){r.revisado=false;await load(true);render();}}catch(err){layer.querySelector('[data-error]').textContent=err.message;e.target.disabled=false;}};
}
function linkArticle(index,article,target=rows[index],expected=generation,owner=window.currentUser?.email){
 if(locked()||expected!==generation||rows[index]!==target||owner!==window.currentUser?.email)return false;
 target.articuloId=article.id;target.descripcion=article.descripcion;target.unidad=target.unidad||article.unidad;target.revisado=false;target.compraPendiente=false;
 mergeDuplicateColumn(index);error='';catalogDialog?.remove();catalogDialog=null;render();return true;
}
function openCatalog(index,initial={}){
 if(locked()||!rows[index])return;catalogDialog?.remove();
 const target=rows[index],expected=generation,owner=window.currentUser?.email,layer=document.createElement('div');catalogDialog=layer;layer.className='iv-equivalence iv-catalog';layer.setAttribute('role','dialog');layer.setAttribute('aria-label','Vincular o crear insumo');
 layer.innerHTML=`<div style="max-width:900px;max-height:90vh;overflow:auto"><div class="iv-actions" style="justify-content:space-between"><h3>Vincular con un insumo del catálogo</h3><button type="button" class="btn btn-ghost" data-catalog-close>Cerrar</button></div><p class="iv-muted">Fila actual: ${esc(target.descripcion||'Sin vínculo')}. Buscá por código, descripción o familia. Se conserva la cantidad y la unidad de uso; si no coinciden con el insumo elegido, revisá la equivalencia antes de aprobar.</p><div class="iv-actions"><input data-catalog-search aria-label="Buscar insumos" placeholder="Ej.: tinta UV, lona o código" style="flex:1;min-width:180px"><select data-catalog-family aria-label="Familia"><option value="">Todas las familias</option>${[...new Set(catalog.map(a=>a.familia).filter(Boolean))].sort().map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select></div><p data-catalog-count class="iv-muted" role="status"></p><div style="overflow:auto;max-height:45vh"><table style="width:100%;min-width:600px"><thead><tr><th>Código</th><th>Insumo / familia</th><th>Unidad / control</th><th></th></tr></thead><tbody data-catalog-results></tbody></table></div><p class="iv-muted">Impresión propia sin lona: vinculá la tinta que se va a consumir. No se calcula su consumo a partir de los m² vendidos. Un servicio contratado se identifica como «Servicio / sin stock».</p><div class="iv-actions"><button type="button" class="btn btn-ghost" data-catalog-cancel>Cerrar sin vincular</button><button type="button" class="btn btn-primary" data-catalog-create>No existe: crear nuevo insumo</button></div></div>`;
 document.body.append(layer);const search=layer.querySelector('[data-catalog-search]'),family=layer.querySelector('[data-catalog-family]');
 const show=()=>{const tokens=C.norm(search.value).split(/\s+/).filter(Boolean),matches=catalog.filter(a=>(!family.value||a.familia===family.value)&&tokens.every(t=>C.norm([a.codigo,a.descripcion,a.familia,a.subfamilia].join(' ')).includes(t))).sort((a,b)=>a.descripcion.localeCompare(b.descripcion,'es'));
 layer.querySelector('[data-catalog-count]').textContent=matches.length+' insumo(s) · '+(matches.length>80?'se muestran los primeros 80; afiná la búsqueda':'catálogo compartido con Compras');
 layer.querySelector('[data-catalog-results]').innerHTML=matches.slice(0,80).map(a=>`<tr><td>${esc(a.codigo)}</td><td><b>${esc(a.descripcion)}</b><small class="iv-muted">${esc([a.familia,a.subfamilia].filter(Boolean).join(' / '))}</small></td><td>${esc(a.unidad)}<small class="iv-muted">${a.control==='sin_stock'?'Servicio / sin stock':'Material con stock'}</small></td><td><button type="button" class="btn btn-primary btn-sm" data-catalog-link="${esc(a.id)}">Vincular</button> <button type="button" class="btn btn-ghost btn-sm" data-catalog-edit="${esc(a.id)}">Editar</button></td></tr>`).join('')||'<tr><td colspan="4">Sin coincidencias. Probá otro término o creá un insumo.</td></tr>';
 layer.querySelectorAll('[data-catalog-link]').forEach(b=>b.onclick=()=>{const a=catalog.find(a=>a.id===b.dataset.catalogLink);if(a)linkArticle(index,a,target,expected,owner);});layer.querySelectorAll('[data-catalog-edit]').forEach(b=>b.onclick=()=>editCatalogArticle(index,b.dataset.catalogEdit,{query:search.value,family:family.value}));};
 search.value=initial.query||'';family.value=initial.family||'';search.addEventListener('input',show);family.addEventListener('change',show);const dismiss=()=>{layer.remove();if(catalogDialog===layer)catalogDialog=null;};layer.querySelector('[data-catalog-close]').onclick=dismiss;layer.querySelector('[data-catalog-cancel]').onclick=dismiss;layer.querySelector('[data-catalog-create]').onclick=()=>createArticle(index,target,expected,owner,search.value||target.descripcion);show();search.focus();
}
async function editCatalogArticle(index,id,initial={}){
 if(locked()||!rows[index])return;const target=rows[index],expected=generation,owner=window.currentUser?.email;
 catalogDialog?.remove();const layer=document.createElement('div');catalogDialog=layer;layer.className='iv-equivalence';layer.setAttribute('role','dialog');layer.setAttribute('aria-label','Editar insumo');
 let cancelled=false;const current=()=>!cancelled&&expected===generation&&rows[index]===target&&owner===window.currentUser?.email&&!locked();
 const close=()=>{cancelled=true;layer.remove();if(catalogDialog===layer)catalogDialog=null;};
 layer.innerHTML='<div><div class="iv-actions" style="justify-content:space-between"><h3>Editar insumo</h3><button type="button" class="btn btn-ghost" data-edit-close>Cerrar</button></div><p>Consultando la ficha actual…</p><p data-edit-error role="alert"></p></div>';document.body.append(layer);layer.querySelector('[data-edit-close]').onclick=close;
 try{
  const read=await api({mode:'article-read',articuloId:id});if(!current())return;const a=read.articulo;
  layer.innerHTML=`<div style="max-height:90vh;overflow:auto"><div class="iv-actions" style="justify-content:space-between"><h3>Editar insumo ${esc(a.codigo||'')}</h3><button type="button" class="btn btn-ghost" data-edit-close>Cerrar</button></div><p class="iv-muted">Se actualiza la ficha compartida con Compras. La unidad se puede corregir directamente si todavía no tiene compras, conteos, reservas o cotizaciones aprobadas.</p><label>Descripción<input data-edit="descripcion" maxlength="300" value="${esc(a.descripcion||'')}"></label><label>Unidad de registro<select data-edit="unidad">${C.units.map(u=>`<option value="${esc(u)}" ${u===C.unit(a.unidad)?'selected':''}>${esc(u)}</option>`).join('')}</select></label><label>Familia<input data-edit="familia" maxlength="100" value="${esc(a.familia||a.rubro||'')}"></label><label>Subfamilia<input data-edit="subfamilia" maxlength="100" value="${esc(a.subfamilia||'')}"></label><label>Control<select data-edit="control">${[['consumible','Consumible por conteo'],['estrategico','Material estratégico por OT'],['sin_stock','Servicio / sin stock']].map(([v,l])=>`<option value="${v}" ${v===(a.control||'consumible')?'selected':''}>${l}</option>`).join('')}</select></label><p class="iv-muted">Si existen registros anteriores, usá Unidades y equivalencias. Por ejemplo, para controlar tinta en m² conservando compras en litros hay que indicar cuántos m² rinde un litro. Una corrección de unidad sin registros reinicia sus equivalencias anteriores.</p><button type="button" class="btn btn-ghost" data-edit-units>Unidades y equivalencias</button><p data-edit-error role="alert"></p><div class="iv-actions" style="margin-top:12px"><button type="button" class="btn btn-ghost" data-edit-back>Volver al catálogo</button><button type="button" class="btn btn-primary" data-edit-save>Guardar cambios del insumo</button></div></div>`;
  layer.querySelector('[data-edit-close]').onclick=close;layer.querySelector('[data-edit-back]').onclick=()=>{close();if(expected===generation)openCatalog(index,initial);};
  const refresh=async saved=>{
   window.cpAfterStockUnitsChanged?.(saved);if(!current())return;
   rows.filter(r=>r.articuloId===id).forEach(r=>{r.descripcion=saved.descripcion;r.revisado=false;if(!C.text(r.cantidad))r.unidad=C.unit(saved.unidadControl||saved.unidad);});
   catalog=catalog.map(a=>a.id===id?C.catalog([saved],[],[],[])[0]:a);loaded=0;await load(true);if(current()){close();openCatalog(index,initial);window.showToast?.('Insumo actualizado. Revisá la cantidad y la unidad de uso antes de aprobar.');}
  };
  layer.querySelector('[data-edit-units]').onclick=()=>{
   if(!window.TIZUnidadesStockV1?.open){layer.querySelector('[data-edit-error]').textContent='Actualizá TIZ para abrir las unidades y equivalencias.';return;}
   window.TIZUnidadesStockV1.open(id,{onSaved:refresh});
  };
  layer.querySelector('[data-edit-save]').onclick=async()=>{
   const button=layer.querySelector('[data-edit-save]');if(button.disabled||!current())return;const controls=layer.querySelectorAll('button,input,select');
   try{const data=C.articleDraft(Object.fromEntries(['descripcion','unidad','familia','subfamilia','control'].map(k=>[k,layer.querySelector('[data-edit="'+k+'"]').value])),true);controls.forEach(el=>el.disabled=true);
    const result=await api({mode:'article-update',articuloId:id,version:read.version,articulo:data});await refresh(result.articulo);
   }catch(e){if(current())layer.querySelector('[data-edit-error]').textContent=e.message;}finally{controls.forEach(el=>el.disabled=false);}
  };
 }catch(e){if(current())layer.querySelector('[data-edit-error]').textContent=e.message;}
}
function createArticle(index,target=rows[index],expected=generation,owner=window.currentUser?.email,description=target?.descripcion||''){
 if(locked()||!target||rows[index]!==target||generation!==expected)return;catalogDialog?.remove();
 const layer=document.createElement('div');catalogDialog=layer;layer.className='iv-equivalence';layer.setAttribute('role','dialog');layer.setAttribute('aria-label','Crear insumo y vincular');
 const request=crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
 const families=[...new Set(catalog.map(a=>a.familia).filter(Boolean))].sort();
 layer.innerHTML=`<div style="max-height:90vh;overflow:auto"><h3>Crear insumo y vincular</h3><p class="iv-muted">Se crea en el catálogo compartido de Compras, con número único. No registra compras, precios ni ingresos de stock.</p><label>Descripción<input data-new="descripcion" maxlength="300" value="${esc(description)}"></label><label>Unidad de stock o del servicio<select data-new="unidad"><option value="">Elegir…</option>${C.units.map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join('')}</select></label><label>Familia<input data-new="familia" list="iv-new-families" maxlength="100"></label><datalist id="iv-new-families">${families.map(f=>`<option value="${esc(f)}">`).join('')}</datalist><label>Subfamilia<input data-new="subfamilia" list="iv-new-subfamilies" maxlength="100"></label><datalist id="iv-new-subfamilies"></datalist><label>Control<select data-new="control"><option value="consumible">Consumible por conteo (ej.: tinta)</option><option value="estrategico">Material estratégico por OT</option><option value="sin_stock">Servicio contratado / sin stock</option></select></label><p class="iv-muted">Para tinta propia, elegí su unidad real de consumo (por ejemplo ML o LITRO). Si falta un costo de Compras, podrás guardar el borrador; el costo seguirá pendiente antes de aprobar.</p><p data-new-error role="alert"></p><div class="iv-actions"><button type="button" class="btn btn-ghost" data-new-cancel>Volver al catálogo</button><button type="button" class="btn btn-primary" data-new-save>Crear insumo y vincular</button></div></div>`;
 document.body.append(layer);const field=k=>layer.querySelector('[data-new="'+k+'"]');
 field('familia').addEventListener('input',()=>{const values=[...new Set(catalog.filter(a=>a.familia===field('familia').value).map(a=>a.subfamilia).filter(Boolean))];layer.querySelector('#iv-new-subfamilies').innerHTML=values.map(v=>`<option value="${esc(v)}">`).join('');});
 layer.querySelector('[data-new-cancel]').onclick=()=>openCatalog(index);
 layer.querySelector('[data-new-save]').onclick=async()=>{const btn=layer.querySelector('[data-new-save]'),cancel=layer.querySelector('[data-new-cancel]');if(btn.disabled)return;try{
 const data=C.articleDraft(Object.fromEntries(['descripcion','unidad','familia','subfamilia','control'].map(k=>[k,field(k).value])));btn.disabled=true;cancel.disabled=true;
 const result=await api({mode:'article-create',solicitudId:request,articulo:data});
 if(owner!==window.currentUser?.email)return;if(expected!==generation||rows[index]!==target||locked()){layer.remove();window.showToast?.('El insumo fue creado en el catálogo; la cotización actual no se modificó.');return;}
 const article=C.catalog([result.articulo],[],[],[])[0];catalog=[...catalog.filter(a=>a.id!==article.id),article];linkArticle(index,article,target,expected,owner);window.showToast?.('Insumo '+article.codigo+' creado y vinculado. Revisá cantidad, unidad y costo.');
 }catch(e){layer.querySelector('[data-new-error]').textContent=e.message;}finally{btn.disabled=false;cancel.disabled=false;}};
 field('descripcion').focus();
}
function click(e){
 const editTrigger=e.target.closest('[data-edit-approved],[data-iv="add"],[data-remove],[data-reset-price],[data-field="precioPrevisto"],[data-iv="add-sale"]');
 if(locked()&&editTrigger){const priceColumn=editTrigger.closest('[data-iv-row]')?.dataset.ivRow;if(!editApprovedCosts())return;if(editTrigger.dataset.field==='precioPrevisto'){host().querySelector('[data-iv-row="'+priceColumn+'"] [data-field="precioPrevisto"]')?.focus();return;}if(editTrigger.hasAttribute('data-edit-approved'))return;}

 const reset=e.target.closest('[data-reset-price]');if(reset&&!locked()){delete rows[Number(reset.dataset.resetPrice)].precioPrevisto;error='';render();return;}
 const removeSale=e.target.closest('[data-remove-sale]');if(removeSale&&!locked()){const i=Number(removeSale.dataset.removeSale),item=matrixSales()[i];if(item){rows.forEach((_,j)=>matrix.set(item,j,''));window.removeItemPP?.(i);render();}return;}
 if(e.target.closest('[data-iv="add-sale"]')&&!locked()){window.addItemPP?.();render();return;}
 if(e.target.closest('[data-iv="sign"]')&&!locked()&&!loading){calculateSignNeeds({manual:true});render();return;}
 const apply=e.target.closest('[data-matrix-apply]');if(apply&&!locked()){
  const i=Number(apply.dataset.matrixApply),item=matrixSales()[i],cost=item&&matrix.cost(item,matrixCostCatalog(),C),currency=document.getElementById('pp-moneda')?.value||'ARS';
  if(item&&currency==='ARS'&&Number.isFinite(cost?.unitPrice)){if(typeof window.updateItemPP==='function')window.updateItemPP(i,'precio',cost.unitPrice);else item.precio=cost.unitPrice;window.renderPPItems?.();window.updatePPTotal?.();refreshMatrix();window.showToast?.('Precio unitario aplicado desde el costo estimado unitario y el índice.');}
 }
 const action=e.target.closest('[data-iv]')?.dataset.iv;if(action==='index-all'&&!locked()){const value=host().querySelector('[data-matrix-index-all]').value;if(C.text(value)===''||!Number.isFinite(C.number(value))||C.number(value)<=0){error='Ingresá un índice mayor que cero. Ejemplo: 2,7.';status();}else{matrixSales().forEach(item=>matrix.setIndex(item,value));render();}}if(action==='common'&&!locked()){showCommon=!showCommon;render();}if(action==='reload')load(true);if(action==='ai')suggest();if(action==='pending-costs')approvePending();if(action==='add'&&!locked()){if(rows.length>=200){error='El detalle admite hasta 200 insumos.';status();return;}rows.push({articuloId:'',descripcion:'',cantidad:'',unidad:'',revisado:false,compraPendiente:false,origen:'manual',nota:''});render();host().querySelector('[data-iv-row="'+(rows.length-1)+'"] [data-field="descripcion"]')?.focus();}
 const link=e.target.closest('[data-link]');if(link&&!locked())openCatalog(Number(link.dataset.link),{query:rows[Number(link.dataset.link)]?.articuloId?'':rows[Number(link.dataset.link)]?.descripcion||''});const create=e.target.closest('[data-create]');if(create&&!locked())createArticle(Number(create.dataset.create));
 const remove=e.target.closest('[data-remove]');if(remove&&!locked()){rows.splice(Number(remove.dataset.remove),1);render();}const convert=e.target.closest('[data-equivalence]');if(convert&&!locked())equivalence(Number(convert.dataset.equivalence));
}
async function approvePending(){
 if(locked()||approving)return;
 const state=document.getElementById('pp-estado');if(!state||typeof window.guardarPresupuestoCompleto!=='function'){error='Reabrí la cotización para aprobarla.';status();return;}
 state.value='Aprobado';error='';approving=true;status();
 try{await window.guardarPresupuestoCompleto();}catch(e){error=e.message||'No se pudo aprobar la cotización.';}finally{approving=false;status();}
}
function canApprove(){
 if(locked())return true;
 const pending=C.implementationValidation(rows,catalog).pendientesInsumos;
 if(pending.length||loading||aiBusy||error||!loaded)window.showToast?.('Se aprobará el presupuesto. Los insumos, unidades, stock y costos por completar quedan como alertas.');
 return true;
}
window.TIZInsumosCotizacionV1={open,canApprove,requestShared,saveFields:matrixFields,getDraft:()=>C.draft(rows)};
let matrixRefreshTimer;
function scheduleMatrixRefresh(event){
 if(event?.type==='input'&&event.target.matches('[oninput*="\'desc\'"], [oninput*="\'cant\'"]'))signNeedsDirty=true;
 scheduleAutomatic();clearTimeout(matrixRefreshTimer);
 matrixRefreshTimer=setTimeout(()=>{if(host()&&matrix&&document.getElementById('modal-prespdf')?.classList.contains('open')){if(autoEnabled&&!loading)calculateSignNeeds();render();}},150);
}
function init(){
 ensure();render();
 const quoteItems=document.getElementById('pp-items');
 if(quoteItems){
  quoteItems.addEventListener('input',event=>{
   if(event.target.matches('[data-pp-item-area]'))return;
   if(event.target.matches('[oninput*="\'desc\'"]'))renderItemAreas(quoteItems);
   scheduleMatrixRefresh(event);
  });
  new MutationObserver(()=>renderItemAreas(quoteItems)).observe(quoteItems,{childList:true});
  new MutationObserver(scheduleMatrixRefresh).observe(quoteItems,{childList:true,subtree:true});
  renderItemAreas(quoteItems);
 }
 document.getElementById('pp-desc')?.addEventListener('input',scheduleAutomatic);document.getElementById('pp-desc')?.addEventListener('change',scheduleAutomatic);document.getElementById('pp-moneda')?.addEventListener('change',status);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
