(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZComprasControlCoreV1=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const distribution=()=>typeof module==='object'&&module.exports?require('./functions/comprasDistribucionCoreV1'):window.TIZComprasDistribucionV1;
const n=v=>v===null||v===undefined||String(v).trim()===''?null:Number(String(v).replace(',','.'));
const valid=v=>Number.isFinite(v)&&v>=0;
const day=v=>String(v||'').slice(0,10);
const active=p=>(typeof window!=='object'||!window.TIZVigenciaComercialV1||window.TIZVigenciaComercialV1.relatedVisible(p))&&!['cerrado','cancelado','baja'].includes(String(p.estado||'').toLowerCase());
const stamp=v=>v?.toMillis?.()||v?.seconds*1000||Date.parse(v)||0;
function after(date,time,cut){const d=day(date),c=day(cut.fecha);return d>c||(d===c&&!!cut.corteEn&&stamp(time)>stamp(cut.corteEn));}
function movements(plans){return plans.flatMap(p=>(p.movimientosMateriales||[]).map(m=>({...m,planId:p.id,ot:p.ot})));}
function amount(row,article,stock,field='cantidad'){
 const q=n(row[field]);if(!valid(q))throw Error('Cantidad pendiente');
 return stock.movementQuantity({...row,cantidad:q,cantidadStock:field==='cantidad'?row.cantidadStock:undefined},article);
}
function delivered(plan,article,stock,purchases=[],plans=[plan]){let total=0;for(const m of [...(plan.movimientosMateriales||[]),...distribution().directFor(plan,purchases,plans)])if(m.articuloId===article.id&&day(m.fecha)&&day(m.fecha)<=(stock.argentinaDay?.()||new Date().toISOString().slice(0,10)))total+=(m.tipo==='devolucion'?-1:1)*amount(m,article,stock);return total;}
function remaining(plan,article,stock,purchases=[],plans=[plan]){const items=(plan.items||[]).filter(i=>i.articuloId===article.id);let total=0;for(const i of items)total+=amount({...i,cantidad:i.cantidadPlanificada??i.cantidadSugerida},article,stock);return Math.max(0,total-delivered(plan,article,stock,purchases,plans));}
function requirements(articles,plans,metas,stock,purchases=[]){
 const originalPlans=plans,direct=distribution().directRows(purchases);plans=plans.map(p=>({...p,movimientosMateriales:[...(p.movimientosMateriales||[]),...distribution().directFor(p,purchases,originalPlans,direct)]}));
 const rows=[],pending=[];
 for(const p of plans.filter(active))for(const i of p.items||[])if(!articles.some(a=>a.id===i.articuloId))pending.push({ot:p.ot,descripcion:i.descripcion||'Insumo por vincular',motivo:'Catálogo pendiente'});
 for(const a of articles){
  const used=plans.filter(p=>active(p)&&(p.items||[]).some(i=>i.articuloId===a.id));if(!used.length)continue;
  let required=0,error='';const detalle=[];for(const p of used){try{const pendiente=remaining(p,a,stock);required+=pendiente;detalle.push({planId:p.id||'',ot:p.ot||'',cliente:p.cliente||'',pendiente});}catch(e){error=e.message;detalle.push({planId:p.id||'',ot:p.ot||'',cliente:p.cliente||'',pendiente:null,error:e.message});pending.push({ot:p.ot,descripcion:a.descripcion,motivo:e.message});}}
  const meta=metas.find(m=>m.id===a.id)||{},physical=a.control==='sin_stock'?0:Number.isFinite(meta.stockFisico)?meta.stockFisico:null;
  rows.push({articuloId:a.id,codigo:a.codigo,descripcion:a.descripcion,unidad:meta.unidad||a.unidadControl||a.unidad,necesario:required,stock:physical,comprar:error||physical===null?null:Math.max(0,required-physical),error,detalle,ots:used.map(p=>p.ot),sinRevisar:used.filter(p=>!p.revisionMateriales).length});
 }
 return {rows,pending};
}
function forecast(plans,articles,stock,from,to){
 const totals={},pending=[];
 for(const p of plans.filter(active))for(const i of p.items||[]){
  if(!i.fechaConsumo){pending.push({ot:p.ot,descripcion:i.descripcion,motivo:'Sin fecha prevista de consumo'});continue;}
  if(day(i.fechaConsumo)<=day(from)||day(i.fechaConsumo)>day(to))continue;
  const a=articles.find(a=>a.id===i.articuloId);if(!a||a.control==='sin_stock'){if(!a)pending.push({ot:p.ot,descripcion:i.descripcion,motivo:'Sin vínculo de catálogo'});continue;}
  try{const q=amount({...i,cantidad:i.cantidadPlanificada??i.cantidadSugerida},a,stock);totals[a.id]=(totals[a.id]||0)+q;}catch(e){pending.push({ot:p.ot,descripcion:i.descripcion,motivo:e.message});}
 }
 return {desde:day(from),hasta:day(to),totals,pending};
}
function reconcile(article,counts,purchases,plans,stock,to){
 const previous=counts.filter(c=>day(c.fecha)<=day(to)).flatMap(c=>(c.items||[]).filter(i=>i.articuloId===article.id).map(i=>({item:i,count:c}))).sort((a,b)=>day(b.count.fecha).localeCompare(day(a.count.fecha))||stamp(b.count.corteEn||b.count._ts)-stamp(a.count.corteEn||a.count._ts))[0];
 const result={articuloId:article.id,descripcion:article.descripcion,unidad:stock.baseArticle(article).unidad,desde:previous?.count.fecha||'',hasta:day(to),inicial:null,ingresos:0,salidas:0,previsto:null,pendientes:[],compraIds:[],movimientoIds:[]};
 if(!previous)return result;
 try{result.inicial=amount(previous.item,article,stock);}catch(e){result.pendientes.push(e.message);return result;}
 for(const p of purchases.filter(p=>day(p.fecha)<=day(to)&&after(p.fecha,p._ts,previous.count)))for(const i of p.items||[])if(i.articuloId===article.id){try{const fraction=distribution().stockFraction(i,p);if(fraction>0){result.ingresos+=amount(i,article,stock)*fraction;result.compraIds.push(p.id);}}catch(e){result.pendientes.push(e.message);}}
 for(const m of movements(plans).filter(m=>m.articuloId===article.id&&m.origen!=='directo_ot'&&day(m.fecha)<=day(to)&&after(m.fecha,m.registradoEn,previous.count))){try{result.salidas+=(m.tipo==='devolucion'?-1:1)*amount(m,article,stock);result.movimientoIds.push(m.id);}catch(e){result.pendientes.push(e.message);}}
 const frozen=previous.count.previsionSiguiente;
 if(frozen&&frozen.hasta===day(to)){result.previsto=n(frozen.totals?.[article.id]??0);if(frozen.pending?.length){result.previstoParcial=result.previsto;result.previsto=null;result.pendientes.push('La previsión congelada tiene materiales sin completar.');}result.previsionCongelada=true;}
 else{result.previsionCongelada=false;result.pendientes.push('Sin previsión cerrada para este período.');}
 return result;
}
function variance(period,final,cost){
 const q=n(final),known=valid(q)&&Number.isFinite(period.inicial)&&!(period.pendientes||[]).some(x=>x!=='Sin previsión cerrada para este período.'&&x!=='La previsión congelada tiene materiales sin completar.');
 const consumed=known?period.inicial+period.ingresos-q:null,difference=consumed!==null&&period.previsto!==null?consumed-period.previsto:null;
 return {consumoReal:consumed,desvio:difference,porcentaje:difference!==null&&period.previsto>0?difference/period.previsto*100:null,sinExplicar:consumed===null?null:consumed-period.salidas,costoExceso:difference!==null&&Number.isFinite(cost)?Math.max(0,difference)*cost:null};
}
return {n,active,after,movements,amount,delivered,remaining,requirements,forecast,reconcile,variance};
});
