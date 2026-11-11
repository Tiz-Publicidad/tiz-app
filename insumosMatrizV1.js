/* Quotation allocations. Purchase prices and stock equivalents remain in the shared catalog. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZInsumosMatrizV1=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const text=v=>String(v??'').trim(),number=v=>Number(text(v).replace(',','.'));
const identity=r=>[r.articuloId||'',r.articuloId?'':r.descripcion||'',r.unidad||''].join('|');
function create(materials,sales,savedItems=[]){
 let serial=0;const ids=new Map(),allocations=new Map(),common={};
 const saved=savedItems.find(x=>x.insumosMatrizV1?.version===1)?.insumosMatrizV1;
 if(saved?.columnas?.length)serial=Math.max(serial,...saved.columnas.slice(0,200).map(c=>/^m\d{1,8}$/.test(c.id)?Number(c.id.slice(1)):0));
 const columns=()=>materials.map((r,i)=>{if(!ids.has(r)){const prior=saved?.columnas?.[i];ids.set(r,prior&&/^m\d{1,8}$/.test(prior.id)&&prior.identidad===identity(r)&&![...ids.values()].includes(prior.id)?String(prior.id):'m'+(++serial));}return {id:ids.get(r),row:r};});
 const initial=columns();
 for(const [i,item] of sales.entries()){
  const prior=savedItems[i]?.insumosMatrizV1,values={};
  if(prior?.version===1)for(const col of initial){if(prior.columnas?.some(c=>c.id===col.id&&c.identidad===identity(col.row)))values[col.id]=text(prior.cantidades?.[col.id]);}
  allocations.set(item,{values,indice:prior?.version===1?text(prior.indice):''});
 }
 if(saved){for(const col of initial)common[col.id]=text(saved.comunes?.[col.id]);}
 else for(const col of initial){if(sales.length===1)allocations.get(sales[0]).values[col.id]=text(col.row.cantidad);else common[col.id]=text(col.row.cantidad);}
 function sync(current){
  for(const [item,state]of allocations)if(!current.includes(item)){
   for(const col of columns()){
    const v=text(state.values[col.id]);if(!v)continue;
    const prior=text(common[col.id]);common[col.id]=Number.isFinite(number(v))&&(!prior||Number.isFinite(number(prior)))?String(number(v)+(prior?number(prior):0)):(prior?prior+' + ':'')+v;
   }allocations.delete(item);
  }
  for(const item of current)if(!allocations.has(item))allocations.set(item,{values:{},indice:''});
 }
 function totalValues(values){const entered=values.filter(v=>text(v)!=='');if(!entered.length)return '';if(entered.some(v=>!Number.isFinite(number(v))||number(v)<0))return '';return String(entered.reduce((s,v)=>s+number(v),0));}
 function totals(current){sync(current);for(const col of columns())col.row.cantidad=totalValues([common[col.id],...current.map(item=>allocations.get(item).values[col.id])]);return materials;}
 function set(item,index,value){if(item&&!allocations.has(item))allocations.set(item,{values:{},indice:''});const col=columns()[index];if(!col)return;(item?allocations.get(item).values:common)[col.id]=text(value);col.row.revisado=false;}
 function get(item,index){const col=columns()[index];return text(col&&(item?allocations.get(item)?.values:common)?.[col.id]);}
 function cost(item,articles,core){
  const state=allocations.get(item)||{values:{},indice:''};let total=0,used=false,complete=true;
  for(const col of columns()){
   const raw=text(state.values[col.id]);if(!raw)continue;const q=number(raw);
   if(!Number.isFinite(q)||q<0){complete=false;continue;}if(q===0)continue;used=true;
   const a=articles.find(a=>a.id===col.row.articuloId);
   try{if(!a||!Number.isFinite(a.ultimoCosto)||a.ultimoCosto<=0||a.monedaCosto&&a.monedaCosto!=='ARS')throw Error('Costo pendiente');total+=core.stockQuantity(q,col.row.unidad,a)*a.ultimoCosto;}catch{complete=false;}
  }
  if(!Number.isFinite(total))complete=false;
  const factor=number(state.indice),saleQty=number(item.cant??item.cantidad??1),ready=used&&complete&&text(state.indice)!==''&&Number.isFinite(factor)&&factor>0&&Number.isFinite(saleQty)&&saleQty>0&&!hasCommon();
  const target=ready?Math.round((total*factor+Number.EPSILON)*100)/100:null;
  const unitPrice=ready&&Number.isFinite(target)?Math.round((target/saleQty+Number.EPSILON)*100)/100:null;
  const suggested=Number.isFinite(unitPrice)?Math.round((unitPrice*saleQty+Number.EPSILON)*100)/100:null;
  return {total:used&&complete?total:null,knownTotal:Number.isFinite(total)?total:0,complete:used&&complete,indice:state.indice,suggested,unitPrice};
 }
 function hasCommon(){return columns().some(col=>text(common[col.id])!==''&&number(common[col.id])!==0);}
 function merge(fromIndex,toIndex){
  const cols=columns(),from=cols[fromIndex],to=cols[toIndex];if(!from||!to||from===to)return false;
  if(!from.row.articuloId||from.row.articuloId!==to.row.articuloId||from.row.unidad!==to.row.unidad)return false;
  const combine=(a,b)=>{if(!text(a))return text(b);if(!text(b))return text(a);return Number.isFinite(number(a))&&number(a)>=0&&Number.isFinite(number(b))&&number(b)>=0?String(number(a)+number(b)):text(a)+' + '+text(b);};
  common[to.id]=combine(common[to.id],common[from.id]);delete common[from.id];
  for(const state of allocations.values()){state.values[to.id]=combine(state.values[to.id],state.values[from.id]);delete state.values[from.id];}
  to.row.revisado=false;to.row.compraPendiente=to.row.compraPendiente||from.row.compraPendiente;materials.splice(fromIndex,1);ids.delete(from.row);return true;
 }
 function exportItems(current){sync(current);totals(current);const cols=columns().map(col=>({id:col.id,identidad:identity(col.row)}));return current.map((item,i)=>({...item,insumosMatrizV1:{version:1,columnas:cols,cantidades:{...allocations.get(item).values},indice:allocations.get(item).indice,...(i===0?{comunes:{...common}}:{})}}));}
 return {columns,sync,totals,set,get,cost,hasCommon,merge,exportItems,setIndex(item,value){if(!allocations.has(item))allocations.set(item,{values:{},indice:''});allocations.get(item).indice=text(value);},index:item=>allocations.get(item)?.indice||''};
}
return {create};
});
