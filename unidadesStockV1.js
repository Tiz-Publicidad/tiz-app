/* Purchase presentation and stock/consumption unit are configured independently. */
(function(){
'use strict';
const C=window.TIZInsumosCotizacionCoreV1,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('es-AR',{maximumFractionDigits:8}),money=n=>'ARS '+Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
let layer=null,article=null,preview=null,options={},busy=false,generation=0;
const api=body=>window.insumosCotizacionApiV1(body);
function close(){if(busy)return;layer?.remove();layer=null;generation++;}
function field(name){return layer.querySelector('[name="'+name+'"]');}
function values(){const dimensions=layer.querySelector('[data-dimensions]'),relation=layer.querySelector('[data-origin-relation]');return {articuloId:article.id,unidadOrigen:article.unidad,unidadCompra:field('unidadCompra').value,unidadControl:field('unidadControl').value,factor:field('factor').value,ancho:dimensions.hidden?'':field('ancho').value,largo:dimensions.hidden?'':field('largo').value,contenidoOriginal:relation.hidden?'':field('contenidoOriginal').value};}

function status(message){layer.querySelector('[data-error]').textContent=message||'';}
function setBusy(value){busy=value;layer.querySelectorAll('input,select,button').forEach(el=>el.disabled=value);if(!value)layer.querySelector('[data-save]').disabled=!preview;}
function changed(e){
 preview=null;layer.querySelector('[data-save]').disabled=true;layer.querySelector('[data-preview]').innerHTML='';status('');const purchase=field('unidadCompra').value,target=field('unidadControl').value,origin=C.unit(article.unidad),area=target==='M²'&&purchase!==target;
 layer.querySelector('[data-dimensions]').hidden=!area;layer.querySelector('[data-origin-relation]').hidden=purchase===origin||target===origin;
 if(['unidadControl','unidadCompra'].includes(e?.target?.name)){try{field('factor').value=String(C.stockQuantity(1,purchase,C.baseArticle({...article,unidadControl:target})));}catch{field('factor').value='';}if(e.target.name==='unidadCompra'){const m=article.medidasPresentacion||{},same=C.unit(m.unidadPresentacion||article.unidad)===purchase;field('ancho').value=same?m.anchoMetros||'':'';field('largo').value=same?m.largoMetros||'':'';}}
 if(area&&['ancho','largo'].includes(e?.target?.name)){const w=C.number(field('ancho').value),l=C.number(field('largo').value);if(w>0&&l>0&&Number.isFinite(w*l))field('factor').value=String(Number((w*l).toPrecision(12)));}
 layer.querySelector('[data-origin]').textContent=purchase;layer.querySelector('[data-target]').textContent=target;layer.querySelector('[data-relation-purchase]').textContent=purchase;
}


function currentPurchaseCost(config){
 if(!options.compraActual)return '';
 try{
 const row=typeof options.compraActual==='function'?options.compraActual():options.compraActual,p=C.purchaseCostPreview(row,{...article,...config}),cost=C.comparablePurchaseCost(row,{...article,...config});
 return `<div class="us-current-cost"><b>Esta compra · costo con IVA: ${money(cost.precioUnitarioCostoConIVA)} / ${esc(cost.unidadCosto)}</b><p>Costo neto, sin IVA: <b>${money(cost.precioUnitarioCostoNeto)} / ${esc(cost.unidadCosto)}</b></p><p>${fmt(p.cantidad)} ${esc(p.unidadCompra)} × ${money(p.precioUnitarioNeto)} netos = ${money(p.totalNeto)} netos.<br>IVA ${fmt(p.ivaPorcentaje)}%: ${money(p.ivaImporte)}.<br>Total con IVA: <b>${money(p.totalConIVA)}</b> ÷ <b>${fmt(cost.cantidadCosto)} ${esc(cost.unidadCosto)}</b> = <b>${money(cost.precioUnitarioCostoConIVA)} / ${esc(cost.unidadCosto)} con IVA</b>.</p><small>Usa el renglón que estás cargando. Guardar el criterio de unidades no guarda esta compra.</small></div>`;
 }catch(e){return '<div class="us-current-cost"><b>Esta compra: costo por completar</b><p class="us-alert">'+esc(e.message)+'</p></div>';}
}


function presetWoodPlate(){
 const origin=C.unit(article.unidad);field('unidadCompra').value='PLACA';field('unidadControl').value='M²';changed({target:field('unidadCompra')});
 field('ancho').value='1.83';field('largo').value='2.75';if(origin==='UNID')field('contenidoOriginal').value='1';changed({target:field('largo')});
 status('Revisá la equivalencia propuesta: 1 placa = 5,0325 m² antes de guardar.');
}


function historicalPurchaseCost(meta,fallbackUnit){
 const unit=meta.unidadCosto||fallbackUnit,net=meta.ultimoCostoCompraNeto??meta.ultimoCosto;
 return '<p><b>Última compra guardada · referencia histórica</b><br>'+(Number.isFinite(meta.ultimoCostoCompraConIVA)?money(meta.ultimoCostoCompraConIVA)+' / '+esc(unit)+' con IVA':'Con IVA: pendiente')+'<br><small>'+(Number.isFinite(net)?money(net)+' / '+esc(unit)+' netos':'Neto: pendiente')+(meta.fechaCosto?' · '+esc(meta.fechaCosto)+' · '+esc(meta.proveedor||'Sin proveedor'):'')+'</small></p>';
}

async function calculate(){setBusy(true);status('');try{const response=await api({mode:'units-preview',...values()});preview=response;const m=response.resumen,f=C.number(field('factor').value),u=field('unidadControl').value;
 layer.querySelector('[data-preview]').innerHTML=currentPurchaseCost(response.configuracion)+`<b>1 ${esc(field('unidadCompra').value)} ingresa ${fmt(f)} ${esc(u)} al stock.</b><p>Stock y consumo se controlan en <b>${esc(u)}</b>.</p><p>Saldo físico: <b>${m.stockFisico===null?'Sin conteo registrado':fmt(m.stockFisico)+' '+esc(u)}</b></p>${historicalPurchaseCost(m,u)}${m.errorPrecio?`<p class="us-alert">${esc(m.errorPrecio)}</p>`:''}${m.errorStock?`<p class="us-alert">${esc(m.errorStock)}</p>`:''}<small>Las compras conservan la unidad y los importes del comprobante. Los nuevos conteos se registrarán en ${esc(u)}; los anteriores se convertirán respetando su unidad original.</small>`;
 }catch(e){preview=null;status(e.message);}finally{setBusy(false);}}
async function save(){if(!preview||busy)return;setBusy(true);status('');try{const result=await api({mode:'units-save',...values(),version:preview.version});const saved=result.articulo;busy=false;layer.remove();layer=null;window.cpAfterStockUnitsChanged?.(saved);options.onSaved?.(saved);window.showToast?.('Criterio guardado: stock y consumo en '+C.unit(saved.unidadControl));}catch(e){preview=null;status(e.message);setBusy(false);}}
async function open(id,opts={}){
 if(busy)return;close();const token=++generation;options=opts;preview=null;
 layer=document.createElement('div');layer.className='us-modal';layer.setAttribute('role','dialog');layer.setAttribute('aria-label','Unidades de compra y stock');layer.innerHTML='<div><p>Consultando el criterio del insumo…</p></div>';document.body.append(layer);
 try{const response=await api({mode:'units-read',articuloId:id});if(token!==generation)return;article=response.articulo;const target=C.unit(opts.unidad||article.unidadControl||article.unidad),purchase=C.unit(opts.unidadCompra||article.unidadCompraPreferida||article.unidad),dimensions=article.medidasPresentacion||{},sameDimensions=C.unit(dimensions.unidadPresentacion||article.unidad)===purchase;
 layer.innerHTML=`<div><div class="us-head"><h3>Unidades de compra y stock</h3><button type="button" class="btn btn-ghost" data-close aria-label="Cerrar unidades">×</button></div><p><b>${esc(article.codigo||'')} · ${esc(article.descripcion)}</b></p><p>Los registros anteriores usan <b>${esc(C.unit(article.unidad))}</b>. Se conservará su unidad original.</p>${/madera|mdf|melamin|aglomer|fenol|terciad/.test(C.norm(article.familia+' '+article.descripcion))?'<p><button type="button" class="btn btn-ghost" data-preset-wood>Usar placa de madera 1,83 × 2,75 m · 5,0325 m²</button></p>':''}<div class="us-grid"><label>Unidad de compra<select name="unidadCompra">${C.units.map(u=>`<option ${u===purchase?'selected':''}>${esc(u)}</option>`).join('')}</select></label><label>Controlar stock y consumo en<select name="unidadControl">${C.units.map(u=>`<option ${u===target?'selected':''}>${esc(u)}</option>`).join('')}</select></label></div><div class="us-grid"><label>1 <span data-origin></span> contiene<input name="factor" inputmode="decimal" aria-label="Cantidad por presentación de compra"><small data-target></small></label><label data-origin-relation hidden>Relación anterior (si falta equivalencia): 1 ${esc(C.unit(article.unidad))} equivale a<input name="contenidoOriginal" inputmode="decimal" aria-label="Relación con la unidad original"><small data-relation-purchase></small></label></div><div class="us-grid" data-dimensions><label>Ancho en metros<input name="ancho" inputmode="decimal" value="${esc(sameDimensions?dimensions.anchoMetros||'':'')}" placeholder="1,37"></label><label>Largo en metros<input name="largo" inputmode="decimal" value="${esc(sameDimensions?dimensions.largoMetros||'':'')}" placeholder="50"></label></div><p class="us-muted">Para superficies podés cargar ancho × largo y calcular la equivalencia. Ejemplo: 1,37 × 50 = 68,5 m² por rollo. Cada medida o presentación distinta debe tener su propio insumo.</p><div data-preview class="us-preview"></div><p data-error class="us-alert" role="alert"></p><div class="us-actions"><button type="button" class="btn btn-ghost" data-cancel>Volver sin cambiar</button><button type="button" class="btn btn-ghost" data-calculate>Ver cálculo</button><button type="button" class="btn btn-primary" data-save disabled>Guardar criterio</button></div></div>`;
 const wood=layer.querySelector('[data-preset-wood]');if(wood)wood.onclick=presetWoodPlate;layer.querySelector('[data-close]').onclick=close;layer.querySelector('[data-cancel]').onclick=close;layer.querySelector('[data-calculate]').onclick=calculate;layer.querySelector('[data-save]').onclick=save;layer.addEventListener('input',changed);layer.addEventListener('change',e=>{if(['unidadControl','unidadCompra'].includes(e.target.name))changed(e);});changed({target:field('unidadControl')});
 }catch(e){if(token!==generation)return;layer.innerHTML=`<div><p role="alert">${esc(e.message)}</p><button class="btn btn-ghost" data-close>Cerrar</button></div>`;layer.querySelector('[data-close]').onclick=close;}
}
const style=document.createElement('style');style.textContent='.us-modal{position:fixed;inset:0;z-index:27000;display:grid;place-items:center;background:#000b;padding:16px}.us-modal>div{width:min(760px,100%);max-height:90vh;overflow:auto;box-sizing:border-box;background:var(--surface,#202124);color:var(--text,#eee);border:1px solid var(--border,#555);border-radius:12px;padding:22px}.us-head,.us-actions{display:flex;gap:10px;align-items:center;justify-content:space-between}.us-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:14px 0}.us-grid[hidden]{display:none}.us-grid input,.us-grid select{display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:9px;background:var(--surface2,#292b30);color:var(--text,#eee);border:1px solid var(--border,#555);border-radius:5px}.us-muted,.us-preview small{font-size:12px;color:var(--text3,#aaa)}.us-preview:not(:empty){border:1px solid var(--accent,#e8b84b);padding:12px;border-radius:8px}.us-current-cost{border:1px solid var(--accent,#e8b84b);border-radius:8px;padding:12px;margin-bottom:14px}.us-current-cost p{line-height:1.5}.us-alert{color:var(--red,#ff758b)}@media(max-width:600px){.us-grid{grid-template-columns:1fr}.us-actions{flex-wrap:wrap}}';document.head.append(style);
window.TIZUnidadesStockV1={open,close};
})();
