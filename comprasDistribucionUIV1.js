import './functions/comprasDistribucionCoreV1.js?v=20261111-distribucion';
export function createPurchaseDistribution(api){
 const D=window.TIZComprasDistribucionV1,states=new WeakMap(),e=api.esc;
 function checked(s,r){const candidates=api.works().filter(w=>D.ot(w.ot||w.nro)===D.ot(r.ot)),old=s.original.find(x=>D.ot(x.ot)===D.ot(r.ot));if(candidates.length>1)throw Error('La OT '+r.ot+' tiene más de una obra. Revisá la referencia.');const w=candidates[0];if(!w&&!old)throw Error('La OT '+(r.ot||'del artículo')+' no está disponible. Elegí una obra de la lista.');return {...r,obraId:w?.id||old?.obraId||'',cliente:w?.cliente||old?.cliente||''};}
 function capture(tr){const s=states.get(tr);if(!s)return null;
  // An unchanged historical allocation keeps its ledger semantics when editing an old receipt.
  if(s.legacy&&s.mode===s.initialMode&&(s.mode!=='OT'||D.ot(s.single.ot)===s.initialOt))return null;
  if(s.mode==='Stock')return D.build([]);
  if(s.mode==='OT')return D.build([checked(s,{...s.single,porcentaje:100})]);
  if(s.mode==='Distribuir')return D.build(s.rows.map(r=>checked(s,r)));
  return null;
 }
 function fields(tr){const s=states.get(tr);return s?{destino:s.mode==='Distribuir'?'Distribuido':s.mode,ot:s.mode==='OT'?D.ot(s.single.ot):'',tipoCosto:s.mode==='Distribuir'?'':s.single.tipoCosto}:{};}
 function refresh(tr){
  const s=states.get(tr);if(!s)return;let message='',error='';
  try{const d=capture(tr),item={...api.item(tr),...fields(tr),...(d?{distribucion:d}:{})};message=D.read(item).map(r=>(r.destino==='OT'?'OT '+r.ot+' · '+r.tipoCosto:r.destino)+': '+r.porcentaje+'%').join(' / ');}catch(err){error=err.message;}
  s.box.querySelector('[data-dist-summary]').textContent=error||message;s.box.querySelector('[data-dist-summary]').style.color=error?'var(--red)':'';
  s.box.querySelectorAll('[data-dist-row]').forEach((line,index)=>{const r=s.rows[index],u=line.querySelector('[data-dist-unit]'),q=line.querySelector('[data-dist-qty]'),hint=line.querySelector('[data-dist-hint]');try{const item=api.item(tr),a=api.article(item.articuloId);if(!a)throw Error('Vinculá el insumo para distribuir por cantidad.');const S=api.stockCore(),whole=S.movementQuantity(item,a),one=S.stockQuantity(1,u.value,S.baseArticle(a));if(!(whole>0&&one>0))throw Error('Revisá la cantidad del comprobante.');line.dataset.total=whole/one;hint.textContent='Total de este artículo: '+api.qty(whole/one)+' '+u.value;if(document.activeElement!==q)q.value=r.porcentaje?api.qty(whole/one*Number(String(r.porcentaje).replace(',','.'))/100):'';q.disabled=false;}catch(err){line.dataset.total='';hint.textContent=err.message;q.disabled=true;q.value='';}});
 }
 const costOptions=type=>`<option value="CD" ${type==='CD'?'selected':''}>CD · Costo directo</option><option value="EX" ${type==='EX'?'selected':''}>EX · Extracosto</option>${!type?'<option value="" selected>Sin clasificar (histórico)</option>':''}`;
 function render(tr){
  const s=states.get(tr),works=api.works(),modes=['Stock','OT','Distribuir','Gasto general','Vehículo'];if(!modes.includes(s.mode))modes.push(s.mode);
  s.box.innerHTML=`<div class="cp-field"><label>Destino de este artículo</label><select data-item-destino>${modes.map(v=>`<option value="${e(v)}" ${v===s.mode?'selected':''}>${v==='Distribuir'?'Repartir entre OT y stock':e(v)}</option>`).join('')}</select></div><datalist id="${s.id}">${works.map(w=>`<option value="${e(D.ot(w.ot||w.nro))}">${e(w.cliente)} · ${e(w.desc||w.descripcion)}</option>`).join('')}</datalist><div data-single-fields ${s.mode==='Distribuir'?'hidden':''}><div class="cp-field" style="margin-top:6px"><label>OT de este artículo</label><input data-item-ot list="${s.id}" value="${e(s.single.ot)}" placeholder="Elegí la OT del artículo" ${s.mode==='OT'?'':'disabled'}></div><div class="cp-field" style="margin-top:6px"><label>CD / EX de este artículo</label><select data-item-cost>${costOptions(s.single.tipoCosto)}</select></div></div><div data-split-fields ${s.mode==='Distribuir'?'':'hidden'}><p class="cp-sub">Reparto de este artículo. El remanente queda en stock.</p>${s.rows.map(r=>`<div data-dist-row style="border:1px solid var(--border);padding:8px;margin:6px 0;border-radius:6px"><label>OT <input data-dist-ot list="${s.id}" value="${e(r.ot)}" placeholder="Número de OT"></label><div style="display:flex;gap:6px;margin-top:6px"><label style="flex:1">Porcentaje %<input data-dist-pct type="number" min="0" max="100" step="any" value="${e(r.porcentaje)}"></label><label style="flex:1">CD / EX<select data-dist-type>${costOptions(r.tipoCosto)}</select></label></div><div style="display:flex;gap:6px;margin-top:6px"><label style="flex:1">O cargar cantidad<input data-dist-qty type="number" min="0" step="any"></label><label style="flex:1">Unidad<select data-dist-unit>${[...new Set([api.item(tr).unidad,'M²','PLACA','UNID','MTS LINEALES','KG','LITRO'])].filter(Boolean).map(u=>`<option ${u===r.unidadCarga?'selected':''}>${e(u)}</option>`).join('')}</select></label></div><div data-dist-hint class="cp-sub"></div><button class="cp-btn" type="button" data-dist-remove>Quitar OT</button></div>`).join('')}<button class="cp-btn" type="button" data-dist-add>＋ Otra OT para este artículo</button></div><p data-dist-summary role="status" class="cp-sub" style="white-space:normal"></p>`;
  s.box.querySelector('[data-item-destino]').onchange=ev=>{s.mode=ev.target.value;if(s.mode==='Distribuir'&&!s.rows.length&&s.single.ot)s.rows.push({...s.single,porcentaje:100});render(tr);api.changed();};
  s.box.querySelector('[data-item-ot]').oninput=ev=>{s.single.ot=ev.target.value;refresh(tr);api.changed();};
  s.box.querySelector('[data-item-cost]').onchange=ev=>{s.single.tipoCosto=ev.target.value;refresh(tr);api.changed();};
  s.box.querySelector('[data-dist-add]').onclick=()=>{s.rows.push({ot:'',porcentaje:'',tipoCosto:s.single.tipoCosto||'CD'});render(tr);api.changed();};
  s.box.querySelectorAll('[data-dist-row]').forEach((line,index)=>{const r=s.rows[index];for(const [selector,key] of [['[data-dist-ot]','ot'],['[data-dist-pct]','porcentaje'],['[data-dist-type]','tipoCosto']])line.querySelector(selector).oninput=ev=>{r[key]=ev.target.value;refresh(tr);api.changed();};line.querySelector('[data-dist-unit]').onchange=ev=>{r.unidadCarga=ev.target.value;refresh(tr);};line.querySelector('[data-dist-qty]').oninput=ev=>{const total=Number(line.dataset.total);if(total>0){r.porcentaje=Math.round(Number(ev.target.value)/total*100*1e8)/1e8;line.querySelector('[data-dist-pct]').value=r.porcentaje;refresh(tr);api.changed();}};line.querySelector('[data-dist-remove]').onclick=()=>{s.rows.splice(index,1);render(tr);api.changed();};});refresh(tr);
 }
 let counter=0;
 function attach(tr,data={}){
  const d=data.distribucion,original=d?.asignaciones?.filter(r=>r.destino==='OT')||[],legacy=!!data.preserveLegacyAllocation;
  const source=original[0]||{ot:data.ot||'',tipoCosto:data.tipoCosto??(legacy?'':'CD'),obraId:data.obraId||'',cliente:data.cliente||''};
  let mode=d?(original.length===1&&original[0].porcentaje===100?'OT':original.length?'Distribuir':'Stock'):(data.destino||(legacy?'Sin destino':'Stock'));
  const normalized=String(mode).toLowerCase();if(normalized==='ot')mode='OT';if(normalized==='stock')mode='Stock';
  const box=document.createElement('td');box.className='cp-item-destination';box.style.cssText='min-width:280px;width:280px;white-space:normal';tr.insertBefore(box,tr.children[2]||null);
  states.set(tr,{box,id:'cp-dist-works-'+(++counter),mode,initialMode:mode,initialOt:D.ot(source.ot),legacy,rows:original.map(r=>({...r})),single:{...source},original:original.length?original.map(r=>({...r})):legacy&&source.ot?[{...source}]:[]});render(tr);
 }
 return {attach,capture,fields,refreshAll:()=>document.querySelectorAll('#cp-items-body tr').forEach(refresh)};
}
