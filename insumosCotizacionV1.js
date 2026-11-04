/* Materials start in Cotizaciones. Approval uses server-side prices and an immutable baseline. */
(function(){
'use strict';
const C=window.TIZInsumosCotizacionCoreV1;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>'ARS '+Number(v||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
const date=v=>C.day(v)?C.day(v).split('-').reverse().join('/'):String(v||'');
let rows=[],catalog=[],baseline=null,generation=0,session='',loaded=0,loading=false,error='',aiBusy=false,newQuoteId='';
const api=body=>window.insumosCotizacionApiV1(body);
const quote=()=>({desc:document.getElementById('pp-desc')?.value||'',items:window.ppItems||[]});
const sourceKey=()=>JSON.stringify(quote());
const host=()=>document.getElementById('pp-insumos-ventas');
const locked=()=>!!baseline;
function ensure(){
 if(host())return;
 const anchor=document.getElementById('pp-entrega-wrap');if(!anchor)return;
 const style=document.createElement('style');style.textContent=`#pp-insumos-ventas{border:1px solid var(--border);border-radius:10px;margin-top:14px;padding:12px;background:var(--surface2)}.iv-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.iv-table{overflow:auto;margin-top:12px}.iv-table table{min-width:980px;width:100%;border-collapse:collapse}.iv-table th,.iv-table td{text-align:left;padding:8px;vertical-align:top;border-bottom:1px solid var(--border)}.iv-table input:not([type=checkbox]),.iv-table select{width:100%;padding:7px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:5px}.iv-table small{display:block;margin-top:4px}.iv-table tr.iv-red{box-shadow:inset 3px 0 var(--red,#ee5165)}.iv-red-text{color:var(--red,#ee5165)}.iv-muted{color:var(--text3);font-size:11px}.iv-result{white-space:pre-line;margin-top:10px}.iv-equivalence{position:fixed;inset:0;z-index:19000;background:#000b;display:grid;place-items:center;padding:20px}.iv-equivalence>div{background:var(--surface);color:var(--text);border:1px solid var(--border);padding:22px;border-radius:12px;max-width:520px;width:100%}.iv-equivalence input{width:100%;padding:8px;margin:6px 0 12px}`;document.head.append(style);
 const box=document.createElement('section');box.id='pp-insumos-ventas';box.setAttribute('aria-label','Insumos previstos por Ventas');
 box.innerHTML=`<div class="iv-actions"><div style="flex:1"><b>Insumos previstos por Ventas</b><div class="iv-muted">Detalle para toda la cotización. Obligatorio para aprobar. Uso interno: no se incluye en el PDF del cliente.</div></div><button type="button" class="btn btn-ghost btn-sm" data-iv="reload">Actualizar stock y precios</button><button type="button" class="btn btn-primary btn-sm" data-iv="ai">Desglosar con IA</button><button type="button" class="btn btn-ghost btn-sm" data-iv="add">Agregar insumo</button></div><p class="iv-muted">Elegí materiales del catálogo de stock. Revisá color, espesor y presentación. Las cantidades son las necesarias para el trabajo completo.</p><div class="iv-table"><table><thead><tr><th style="min-width:240px">Insumo</th><th style="width:95px">Cantidad</th><th style="min-width:120px">Unidad de uso</th><th>Stock / equivalencia</th><th>Último costo de Compras</th><th style="min-width:130px">Revisión</th><th></th></tr></thead><tbody id="iv-rows"></tbody></table></div><datalist id="iv-catalog"></datalist><p id="iv-status" class="iv-result" role="status"></p><div id="iv-summary"></div>`;
 anchor.insertAdjacentElement('beforebegin',box);box.addEventListener('click',click);box.addEventListener('input',input);box.addEventListener('change',change);
}
const label=a=>a.codigo+' · '+a.descripcion;
function render(){
 ensure();if(!host())return;
 document.getElementById('iv-catalog').innerHTML=catalog.map(a=>`<option value="${esc(label(a))}">${esc(a.unidad)}</option>`).join('');
 document.getElementById('iv-rows').innerHTML=rows.map((r,i)=>{const a=catalog.find(a=>a.id===r.articuloId),display=a?label(a):r.descripcion;return `<tr data-iv-row="${i}"><td><input data-field="descripcion" list="iv-catalog" aria-label="Insumo ${i+1}" value="${esc(display)}" ${locked()?'disabled':''}><small class="iv-muted">${r.origen==='ia'?'Sugerido por IA · ':''}${esc(r.nota||'')}</small></td><td><input data-field="cantidad" inputmode="decimal" aria-label="Cantidad material ${i+1}" value="${esc(r.cantidad)}" ${locked()?'disabled':''}></td><td><select data-field="unidad" aria-label="Unidad material ${i+1}" ${locked()?'disabled':''}><option value="">Elegir…</option>${[...new Set([...C.units,r.unidad].filter(Boolean))].map(u=>`<option value="${esc(u)}" ${u===r.unidad?'selected':''}>${esc(u)}</option>`).join('')}</select></td><td data-stock><span></span>${!locked()?`<button type="button" class="btn btn-ghost btn-sm" data-equivalence="${i}">Definir equivalencia</button>`:''}</td><td data-price></td><td><label><input type="checkbox" data-field="revisado" ${r.revisado?'checked':''} ${locked()?'disabled':''}> Revisado</label><small><label><input type="checkbox" data-field="compraPendiente" ${r.compraPendiente?'checked':''} ${locked()?'disabled':''}> Compra / verificación pendiente</label></small></td><td>${!locked()?`<button type="button" class="btn btn-ghost btn-sm" data-remove="${i}" aria-label="Quitar material ${i+1}">×</button>`:''}</td></tr>`;}).join('')||'<tr><td colspan="7" class="iv-muted">Todavía no hay materiales. Pedí un desglose a la IA o agregá los insumos del catálogo.</td></tr>';
 host().querySelector('[data-iv="ai"]').disabled=locked()||aiBusy||loading;
 host().querySelector('[data-iv="ai"]').textContent=aiBusy?'Desglosando…':'Desglosar con IA';
 host().querySelector('[data-iv="add"]').disabled=locked();
 status();
}
function status(){
 if(!host())return;
 const result=locked()?{ok:true,total:baseline.totalCosto,items:baseline.items,errores:[]}:C.validate(rows,catalog);
 host().querySelectorAll('[data-iv-row]').forEach(tr=>{const i=Number(tr.dataset.ivRow),line=result.items[i],r=rows[i],a=catalog.find(a=>a.id===r.articuloId);if(!line)return;tr.classList.toggle('iv-red',!!line.errores?.length||!!line.avisos?.length);
  const stock=tr.querySelector('[data-stock] span'),price=tr.querySelector('[data-price]');
  stock.innerHTML=(Number.isFinite(line.cantidadStock)?`${line.cantidadStock.toLocaleString('es-AR',{maximumFractionDigits:6})} ${esc(line.unidadStock)} de stock`:'Unidad por resolver')+(a?`<small class="iv-muted">Disponible: ${a.stockDisponible===null?'sin conteo':a.stockDisponible.toLocaleString('es-AR')+' '+esc(a.unidad)}${a.fechaStock?' · conteo '+esc(date(a.fechaStock)):''}</small>`:'')+(line.errores||[]).concat(line.avisos||[]).map(s=>`<small class="iv-red-text">${esc(s)}</small>`).join('');
  const source=locked()?line:a;price.innerHTML=Number.isFinite(line.costoUnitarioStock)?`${money(line.costoUnitarioStock)} / ${esc(line.unidadStock)}<small>Total: ${money(line.costoTotal)}</small>`:'Sin precio válido';if(source)price.innerHTML+=`<small class="iv-muted">${esc(date(source.fechaCosto)||'Sin fecha')} · ${esc(source.proveedor||'Sin proveedor')}</small>`;
 });
 document.getElementById('iv-status').textContent=error||(loading?'Consultando stock y precios de Compras…':locked()?'Detalle aprobado el '+new Date(baseline.aprobadoEn).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})+'. Para cambiar materiales, creá una nueva revisión.':result.ok?'Materiales revisados. Se comprobarán nuevamente con los precios de Compras al aprobar.':'No se puede aprobar: '+result.errores.length+' pendiente(s). Podés guardar como Borrador o Enviado.');
 if(aiBusy)document.getElementById('iv-status').textContent='La IA está desglosando el trabajo. Esperando el resultado del servicio compartido…';
 document.getElementById('iv-summary').innerHTML=`<b>${result.ok?'Costo de insumos previsto':'Costo parcial de insumos'}: ${money(result.total)}</b><div class="iv-muted">${locked()?'Precios conservados desde la aprobación.':'Último precio neto registrado por Compras. El importe se guarda al aprobar.'} Otros costos del trabajo se compararán por separado.</div>`;
}
async function load(force=false){
 const user=window.currentUser?.email||'';if(session!==user){catalog=[];loaded=0;session=user;}
 if(!user||loading||(!force&&Date.now()-loaded<30000)){status();return;}loading=true;error='';status();const expected=user;
 try{const result=await api({mode:'catalog'});if(expected!==window.currentUser?.email)return;catalog=result.articulos||[];loaded=Date.now();}
 catch(e){error='No se pudo actualizar stock y precios: '+e.message;}
 finally{loading=false;render();}
}
function open(data={},newRevision=false){generation++;newQuoteId=crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');rows=C.draft(data.insumosVentas||[]);baseline=newRevision?null:data.insumosVentasAprobados||null;error='';ensure();render();load();}
function input(e){const tr=e.target.closest('[data-iv-row]'),key=e.target.dataset.field;if(!tr||!key||locked())return;const row=rows[Number(tr.dataset.ivRow)];if(['revisado','compraPendiente'].includes(key))return;row[key]=e.target.value;if(key==='descripcion'){row.articuloId='';}row.revisado=false;tr.querySelector('[data-field="revisado"]').checked=false;error='';status();}
function change(e){const tr=e.target.closest('[data-iv-row]'),key=e.target.dataset.field;if(!tr||!key||locked())return;const row=rows[Number(tr.dataset.ivRow)];if(['revisado','compraPendiente'].includes(key))row[key]=e.target.checked;else row[key]=e.target.value;
 if(key==='descripcion'){const a=catalog.find(a=>label(a)===e.target.value);row.articuloId=a?.id||'';if(a){row.descripcion=a.descripcion;if(!row.unidad){row.unidad=a.unidad;tr.querySelector('[data-field="unidad"]').value=a.unidad;}}row.revisado=false;}
 error='';status();
}
async function suggest(){
 if(locked()||aiBusy)return;const current=generation,source=sourceKey();aiBusy=true;error='';render();
 try{const prepared=await api({mode:'suggest',cotizacion:quote()}),result=prepared.servicioIA?await requestShared(prepared.servicioIA):prepared;if(current!==generation)return;if(source!==sourceKey())throw Error('Cambió la descripción del trabajo durante el desglose. Volvé a pedirlo para usar los datos actuales.');const existing=new Set(rows.map(r=>r.articuloId||C.norm(r.descripcion)));const proposed=(result.materiales||[]).map(r=>{const a=catalog.find(a=>a.id===r.articuloId);return {articuloId:a?.id||'',descripcion:a?.descripcion||String(r.descripcion||''),cantidad:'',unidad:C.unit(a?.unidad||r.unidad),revisado:false,compraPendiente:false,origen:'ia',nota:String(r.motivo||r.nota||'')};});const added=proposed.filter(r=>!existing.has(r.articuloId||C.norm(r.descripcion)));if(!proposed.length)throw Error('La IA no devolvió materiales. Ampliá la descripción o cargalos manualmente.');if(rows.length+added.length>200)throw Error('El detalle admite hasta 200 materiales.');rows.push(...C.draft(added));}
 catch(e){if(current===generation)error=e.message;}
 finally{aiBusy=false;render();}
}
function requestShared(service){
 return new Promise((resolve,reject)=>{
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec\/[A-Za-z0-9_-]+$/.test(service.url||''))return reject(Error('La conexión de IA no es válida.'));
  const requestId='cpia-'+Date.now()+'-'+Math.random().toString(36).slice(2),callback='__tizMaterials_'+requestId.replace(/[^a-zA-Z0-9_]/g,'_');let done=false,timer,pollTimer,frame,form,script;
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
function click(e){const action=e.target.closest('[data-iv]')?.dataset.iv;if(action==='reload')load(true);if(action==='ai')suggest();if(action==='add'&&!locked()){rows.push({articuloId:'',descripcion:'',cantidad:'',unidad:'',revisado:false,compraPendiente:false,origen:'manual',nota:''});render();}
 const remove=e.target.closest('[data-remove]');if(remove&&!locked()){rows.splice(Number(remove.dataset.remove),1);render();}const convert=e.target.closest('[data-equivalence]');if(convert&&!locked())equivalence(Number(convert.dataset.equivalence));
}
function canApprove(){if(locked())return true;const result=C.validate(rows,catalog);if(loading||aiBusy||error||!loaded||!result.ok){ensure();status();host()?.scrollIntoView({behavior:'smooth',block:'center'});window.showToast?.(error||(aiBusy?'Esperá que termine el desglose y revisá los materiales antes de aprobar.':'Completá y revisá los insumos de la cotización antes de aprobar.'));return false;}return true;}
window.TIZInsumosCotizacionV1={open,canApprove,saveFields:()=>({insumosVentas:C.draft(rows),insumosCotizacionId:newQuoteId}),getDraft:()=>C.draft(rows)};
function init(){ensure();render();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
