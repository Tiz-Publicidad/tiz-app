/* Quotation allocations. Purchase prices and stock equivalents remain in the shared catalog. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZInsumosMatrizV1=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const text=v=>String(v??'').trim(),number=v=>Number(text(v).replace(',','.'));
const identity=r=>[r.articuloId||'',r.articuloId?'':r.descripcion||'',r.unidad||''].join('|');
function create(materials,sales,savedItems=[],{defaultBasis='total'}={}){
 let serial=0;const ids=new Map(),allocations=new Map(),common={};
 const saved=savedItems.find(x=>[1,2].includes(x.insumosMatrizV1?.version))?.insumosMatrizV1;
 let basis=saved?(saved.version===2&&saved.baseNecesidad==='unidad'?'unidad':'total'):materials.some(r=>text(r.cantidad)!=='')?'total':defaultBasis==='unidad'?'unidad':'total';
 const saleQuantity=item=>number(item.cant??item.cantidad??1),roundQuantity=v=>Number(Number(v).toPrecision(12));
 function totalNeed(value,item){const raw=text(value);if(!raw||basis==='total')return raw;const q=number(raw),qty=saleQuantity(item);return Number.isFinite(q)&&q>=0&&Number.isFinite(qty)&&qty>0?String(roundQuantity(q*qty)):'Cantidad o consumo inválido';}
 if(saved?.columnas?.length)serial=Math.max(serial,...saved.columnas.slice(0,200).map(c=>/^m\d{1,8}$/.test(c.id)?Number(c.id.slice(1)):0));
 const columns=()=>materials.map((r,i)=>{if(!ids.has(r)){const prior=saved?.columnas?.[i];ids.set(r,prior&&/^m\d{1,8}$/.test(prior.id)&&prior.identidad===identity(r)&&![...ids.values()].includes(prior.id)?String(prior.id):'m'+(++serial));}return {id:ids.get(r),row:r};});
 const initial=columns();
 for(const [i,item] of sales.entries()){
  const prior=savedItems[i]?.insumosMatrizV1,values={},automatic={};
  if([1,2].includes(prior?.version))for(const col of initial){if(prior.columnas?.some(c=>c.id===col.id&&c.identidad===identity(col.row))){values[col.id]=text(prior.cantidades?.[col.id]);if(typeof prior.calculoCartel?.[col.id]==='string')automatic[col.id]=prior.calculoCartel[col.id];}}
  allocations.set(item,{values,automatic,indice:[1,2].includes(prior?.version)?text(prior.indice):''});
 }
 if(saved){for(const col of initial)common[col.id]=text(saved.comunes?.[col.id]);}
 else for(const col of initial){if(sales.length===1)allocations.get(sales[0]).values[col.id]=text(col.row.cantidad);else common[col.id]=text(col.row.cantidad);}
 function sync(current){
  for(const [item,state]of allocations)if(!current.includes(item)){
   for(const col of columns()){
    const v=totalNeed(state.values[col.id],item);if(!v||state.automatic[col.id]===identity(col.row))continue;
    const prior=text(common[col.id]);common[col.id]=Number.isFinite(number(v))&&(!prior||Number.isFinite(number(prior)))?String(number(v)+(prior?number(prior):0)):(prior?prior+' + ':'')+v;
   }allocations.delete(item);
  }
  for(const item of current)if(!allocations.has(item))allocations.set(item,{values:{},automatic:{},indice:''});
 }
 function totalValues(values){const entered=values.filter(v=>text(v)!=='');if(!entered.length)return '';if(entered.some(v=>!Number.isFinite(number(v))||number(v)<0))return '';return String(roundQuantity(entered.reduce((s,v)=>s+number(v),0)));}
 function totals(current){sync(current);for(const col of columns())col.row.cantidad=totalValues([common[col.id],...current.map(item=>totalNeed(allocations.get(item).values[col.id],item))]);return materials;}
 function set(item,index,value){if(item&&!allocations.has(item))sync([...allocations.keys(),item]);const col=columns()[index];if(!col)return;const state=allocations.get(item);if(state)delete state.automatic[col.id];(state?state.values:common)[col.id]=text(value);col.row.revisado=false;}
 function get(item,index){const col=columns()[index];return text(col&&(item?allocations.get(item)?.values:common)?.[col.id]);}
 function cost(item,articles,core){
  const state=allocations.get(item)||{values:{},indice:''};let total=0,used=false,complete=true;
  for(const col of columns()){
   const raw=text(state.values[col.id]);if(!raw)continue;const q=number(raw);
   if(!Number.isFinite(q)||q<0){complete=false;continue;}if(q===0)continue;used=true;
   const a=articles.find(a=>a.id===col.row.articuloId);
   try{if(text(col.row.precioPrevisto)!==''){const p=number(col.row.precioPrevisto);if(!Number.isFinite(p)||p<0||!core.units.includes(core.unit(col.row.unidad)))throw Error('Precio previsto inválido');total+=q*p;continue;}if(!a||!Number.isFinite(a.ultimoCosto)||a.ultimoCosto<=0||a.monedaCosto&&a.monedaCosto!=='ARS')throw Error('Costo pendiente');total+=core.stockQuantity(q,col.row.unidad,a)*a.ultimoCosto;}catch{complete=false;}
  }
  const saleQty=saleQuantity(item);if(basis==='unidad')total*=saleQty;
  if(!Number.isFinite(total)||basis==='unidad'&&!(saleQty>0))complete=false;
  const factor=number(state.indice),unitCost=used&&complete&&Number.isFinite(saleQty)&&saleQty>0?total/saleQty:null,ready=used&&complete&&text(state.indice)!==''&&Number.isFinite(factor)&&factor>0&&Number.isFinite(saleQty)&&saleQty>0&&!hasCommon();
  const unitPrice=ready?Math.round(((basis==='unidad'?unitCost*factor:Math.round((total*factor+Number.EPSILON)*100)/100/saleQty)+Number.EPSILON)*100)/100:null;
  const suggested=Number.isFinite(unitPrice)?Math.round((unitPrice*saleQty+Number.EPSILON)*100)/100:null;
  return {unitCost,total:used&&complete?total:null,saleQty,knownTotal:Number.isFinite(total)?total:0,complete:used&&complete,indice:state.indice,suggested,unitPrice};
 }
 function hasCommon(){return columns().some(col=>text(common[col.id])!==''&&number(common[col.id])!==0);}
 function merge(fromIndex,toIndex){
  const cols=columns(),from=cols[fromIndex],to=cols[toIndex];if(!from||!to||from===to)return false;
  if(!from.row.articuloId||from.row.articuloId!==to.row.articuloId||from.row.unidad!==to.row.unidad||text(from.row.precioPrevisto)!==text(to.row.precioPrevisto))return false;
  const combine=(a,b)=>{if(!text(a))return text(b);if(!text(b))return text(a);return Number.isFinite(number(a))&&number(a)>=0&&Number.isFinite(number(b))&&number(b)>=0?String(number(a)+number(b)):text(a)+' + '+text(b);};
  common[to.id]=combine(common[to.id],common[from.id]);delete common[from.id];
  for(const state of allocations.values()){state.values[to.id]=combine(state.values[to.id],state.values[from.id]);delete state.values[from.id];delete state.automatic[to.id];delete state.automatic[from.id];}
  to.row.revisado=false;to.row.compraPendiente=to.row.compraPendiente||from.row.compraPendiente;materials.splice(fromIndex,1);ids.delete(from.row);return true;
 }
 function applySignNeeds(item,needs){
  if(!allocations.has(item))sync([...allocations.keys(),item]);
  const state=allocations.get(item),multiplier=basis==='total'?saleQuantity(item):1;
  for(const [index,col] of columns().entries()){
   const need=needs.get(index),previous=state.automatic[col.id];
   const calculated=need?.quantity*multiplier;
   const value=Number.isFinite(calculated)&&multiplier>0?String(roundQuantity(calculated)):'';
   if(previous&&(!value||previous!==identity(col.row)))set(item,index,'');
   if(value&&(state.automatic[col.id]||!get(item,index))){
    if(value!==get(item,index))set(item,index,value);
    state.automatic[col.id]=identity(col.row);
   }
  }
 }
 function setBasis(value){
  if(!['unidad','total'].includes(value))throw Error('Base de consumo inválida.');
  if(value===basis)return;
  const cols=columns();
  for(const [item,state] of allocations){
   const qty=saleQuantity(item);
   for(const col of cols){
    if(state.automatic[col.id]!==identity(col.row))continue;
    const amount=number(state.values[col.id]);
    const converted=value==='total'?amount*qty:amount/qty;
    state.values[col.id]=qty>0&&Number.isFinite(converted)?String(roundQuantity(converted)):'';
   }
  }
  basis=value;for(const row of materials)row.revisado=false;
 }
 function exportItems(current){sync(current);totals(current);const cols=columns().map(col=>({id:col.id,identidad:identity(col.row)}));return current.map((item,i)=>{const state=allocations.get(item),calculoCartel=Object.fromEntries(cols.filter(col=>state.automatic[col.id]===col.identidad).map(col=>[col.id,col.identidad]));return {...item,insumosMatrizV1:{version:2,baseNecesidad:basis,columnas:cols,cantidades:{...state.values},indice:state.indice,...(Object.keys(calculoCartel).length?{calculoCartel}:{}),...(i===0?{comunes:{...common}}:{})}};});}
 return {columns,sync,totals,set,get,cost,hasCommon,merge,applySignNeeds,exportItems,basis:()=>basis,setBasis,setIndex(item,value){if(!allocations.has(item))sync([...allocations.keys(),item]);allocations.get(item).indice=text(value);},index:item=>allocations.get(item)?.indice||''};
}
function profit(sale,cost){if(!Number.isFinite(sale)||sale<0||!Number.isFinite(cost)||cost<0)return null;const difference=sale-cost;return {sale,cost,difference,margin:sale>0?difference/sale*100:null};}

function rectangleDimensions(description){
 const s=text(description).toLowerCase();
 const dimensions=[...s.matchAll(/(?<![\d.,+\-])(\d+(?:[.,]\d+)?)\s*(metros?|mts?|m|cm)?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(metros?|mts?|m|cm)\b(?!\s*[x×]\s*\d)/g)]
  .filter(match=>!/[\d]\s*(?:metros?|mts?|m|cm)?\s*[x×]\s*$/.test(s.slice(0,match.index)));
 if(dimensions.length!==1)return null;
 const [,widthText,widthUnit,heightText,heightUnit]=dimensions[0];
 const width=number(widthText)*((widthUnit||heightUnit)==='cm'?.01:1);
 const height=number(heightText)*(heightUnit==='cm'?.01:1);
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
 return {width,height};
}

function signMaterials(description,normalize){
 const s=normalize(description);
 if(!/\b(?:estructura|marco|bastidor)\b/.test(s)||!/\b(?:hierro|metalica|metalico|cano)\b/.test(s)||!/\blonas?\b/.test(s)||/\b(?:sin|no incluye|no lleva)\s+(?:la\s+)?lona\b/.test(s))return null;
 const dimensions=rectangleDimensions(s);
 if(!dimensions)return null;
 const {width,height}=dimensions;
 const profiles=[...s.matchAll(/\b(hierro|cano|refuerzos?)(?:\s+(?:de\s+)?cano)?\s*(?:de\s+)?(\d+)\s*(?:mm)?\s*[x×]\s*(\d+)(?:\s*mm\b|\b(?![.,\d]|\s*(?:m\b|mts?\b|metros?\b|cm\b)))/g)]
  .map(([,role,a,b])=>({role,profile:`${Number(a)}x${Number(b)}`}));
 const pipes=profiles.filter(({role})=>!role.startsWith('refuerzo'));
 const frame=pipes[0]?.profile||'20x20';
 const brace=profiles.find(({role})=>role.startsWith('refuerzo'))?.profile||pipes[1]?.profile||(frame==='20x20'?'15x15':'');
 const printed=/\blonas?\s+(?:front\s+)?impresas?\b/.test(s),black=/\blonas?\s+(?:front\s+)?negras?\b/.test(s);
 const materials=[{description:printed?'Lona impresa':black?'Lona front negra':'Lona',unit:'M²',quantity:width*height,matches:name=>{
  if(!/\blonas?\b/.test(name)||/\b(?:retiro|colocacion|desmontaje|sin lona)\b/.test(name))return false;
  if(printed)return /impres/.test(name);
  return !/impres/.test(name)&&(black?/\bnegras?\b/.test(name):!/\b(?:negras?|backlight|mesh|microperforada)\b/.test(name));
 }}];
 const pipe=(profile,quantity)=>({description:`Caño ${profile.replace('x',' × ')}`,unit:'MTS LINEALES',quantity,catalogCode:{'20x20':'000132','15x15':'000130'}[profile],matches:name=>{
  const [a,b]=profile.split('x');return new RegExp(`\\bcano\\s*(?:de\\s+)?${a}\\s*(?:mm)?\\s*[x×]\\s*${b}\\b`).test(name);
 }});
 materials.push(pipe(frame,2*(width+height)));
 const braces=(Math.ceil(width)-1)*height+(Math.ceil(height)-1)*width;
 if(braces&&brace===frame)materials[1].quantity+=braces;
 else if(braces&&brace)materials.push(pipe(brace,braces));
 return materials.every(material=>Number.isFinite(material.quantity))?{materials,missingBrace:braces>0&&!brace}:null;
}
const laborOptions={
 'production-internal':{description:'Mano de obra interna',unit:'HORA'},
 'production-external':{description:'Fabricación externa',unit:'SERVICIO',code:'000298'},
 'production-pending':{description:'Mano de obra de fabricación (interna o externa a definir)',unit:'HORA'},
 'installation':{description:'Mano de obra de colocación',unit:'HORA'},
 'installation-external':{description:'Colocaciones externas',unit:'SERVICIO',code:'000261'},
};
function laborRole(description,normalize){
 const s=normalize(description);
 if(/^(?:mano de obra (?:de |para )?)?(?:colocacion(?:es)?|instalacion(?:es)?|montaje)\b/.test(s))return /\b(?:extern[ao]s?|tercerizad[ao]s?)\b/.test(s)?'installation-external':'installation';
 if(!/^(?:mano de obra|fabricacion\s+(?:externa|interna)|produccion\s+(?:externa|interna))\b/.test(s))return '';
 if(/\ba definir\b/.test(s))return 'production-pending';
 if(/\b(?:extern[ao]s?|tercerizad[ao]s?)\b/.test(s))return 'production-external';
 if(/\b(?:intern[ao]s?|propi[ao]s?)\b/.test(s))return 'production-internal';
 return 'production-pending';
}
function laborSuggestions(quote,normalize){
 const needs=new Map();
 const add=(role,index)=>{if(!needs.has(role))needs.set(role,[]);if(index!==null)needs.get(role).push(index+1);};
 const installation='(?:colocacion(?:es)?|instalacion(?:es)?|montaje)';
 const production='(?:mano de obra (?:de )?(?:fabricacion |produccion )?|fabricacion |produccion )';
 const qualifier='(?:extern[ao]s?|tercerizad[ao]s?)';
 function roles(description,inferProduction){
  const s=normalize(description);
  const result=[];
  const omitsInstallation=new RegExp(`\\b(?:sin|no incluye|no lleva)\\s+(?:la\\s+)?${installation}\\b`).test(s);
  if(!omitsInstallation&&new RegExp(`\\b${installation}\\b`).test(s)){
   result.push(new RegExp(`\\b${installation}\\s+${qualifier}\\b`).test(s)?'installation-external':'installation');
  }
  if(/\b(?:sin|no incluye|no lleva)\s+(?:la\s+)?(?:mano de obra|fabricacion|produccion)\b/.test(s)||new RegExp(`\\bsolo ${installation}\\b`).test(s))return result;
  if(new RegExp(`\\b${production}${qualifier}\\b`).test(s))result.push('production-external');
  else if(new RegExp(`\\b${production}(?:intern[ao]s?|propi[ao]s?)\\b`).test(s)||/\b(?:fabricacion|produccion) en (?:el )?taller\b/.test(s))result.push('production-internal');
  else if(inferProduction&&/\b(?:fabricacion|fabricar|impresion|impres[oa]s?|troquel(?:ad[oa]s?)?|soldadura|estructura de hierro)\b/.test(s))result.push('production-pending');
  return result;
 }
 for(const [index,item] of (quote.items||[]).entries())for(const role of roles(item.desc||item.descripcion,true))add(role,index);
 for(const role of roles(quote.desc,false)){
  if(role.startsWith('installation')){
   if(!needs.has('installation')&&!needs.has('installation-external'))add(role,null);
  }else if(!needs.has('production-internal')&&!needs.has('production-external')){
   needs.set(role,needs.get('production-pending')||[]);needs.delete('production-pending');
  }
 }
 return [...needs].map(([role,items])=>({role,items,...laborOptions[role]}));
}
return {create,profit,rectangleDimensions,signMaterials,laborRole,laborSuggestions};
});
