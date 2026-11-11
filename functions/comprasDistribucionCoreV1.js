(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZComprasDistribucionV1=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const text=v=>String(v??'').trim(),norm=v=>text(v).toLowerCase(),number=v=>typeof v==='number'?v:Number(text(v).replace(',','.')),round=v=>Math.round((v+Number.EPSILON)*1e8)/1e8;
const ot=v=>text(v).replace(/^(?:OT|CT)\s*[-:#]?\s*/i,'').replace(/^0+(?=\d)/,'');
function build(rows){
 if(!Array.isArray(rows))throw Error('La distribución debe contener asignaciones por OT.');
 let sum=0;const seen=new Set(),result=[];
 for(const row of rows){
  const key=ot(row.ot),pct=number(row.porcentaje),type=text(row.tipoCosto).toUpperCase();
  if(!key)throw Error('Elegí una OT para cada asignación.');
  if(!Number.isFinite(pct)||pct<=0||pct>100)throw Error('Cada porcentaje de OT debe ser mayor que 0 y hasta 100.');
  if(!['CD','EX'].includes(type))throw Error('Indicá CD (costo directo) o EX (extracosto).');
  if(seen.has(key))throw Error('La OT '+key+' está repetida en el mismo ítem.');
  seen.add(key);sum=round(sum+pct);result.push({destino:'OT',ot:key,obraId:text(row.obraId),cliente:text(row.cliente),porcentaje:pct,tipoCosto:type});
 }
 if(sum>100)throw Error('Los porcentajes de las OT superan el 100%.');
 if(sum<100)result.push({destino:'Stock',porcentaje:round(100-sum)});
 return {version:1,asignaciones:result};
}
function read(item,purchase={}){
 if(item.distribucion!=null){
  const d=item.distribucion;
  if(d.version!==1||!Array.isArray(d.asignaciones)||d.asignaciones.some(x=>!['OT','Stock'].includes(x.destino)))throw Error('Distribución de compra inválida.');
  const built=build(d.asignaciones.filter(x=>x.destino==='OT')),stocks=d.asignaciones.filter(x=>x.destino==='Stock'),expected=built.asignaciones.find(x=>x.destino==='Stock')?.porcentaje||0;
  if(stocks.length>1||Math.abs(stocks.reduce((s,x)=>s+number(x.porcentaje),0)-expected)>1e-7||stocks.some(x=>!Number.isFinite(number(x.porcentaje))||number(x.porcentaje)<=0))throw Error('La distribución debe sumar 100% entre OT y stock.');
  return built.asignaciones;
 }
 const destino=text(item.destino||purchase.destino)||'Sin destino',key=ot(item.ot||purchase.ot);
 return [{destino,porcentaje:100,...(norm(destino)==='ot'?{ot:key,obraId:text(item.obraId),cliente:text(item.cliente),tipoCosto:text(item.tipoCosto||purchase.tipoCosto).toUpperCase()||'Sin clasificar'}:{})}];
}
function stockFraction(item,purchase){return read(item,purchase).filter(x=>norm(x.destino)==='stock').reduce((s,x)=>s+x.porcentaje/100,0);}
function portion(item,fraction){const result={...item};for(const key of ['cantidad','cantidadStock','totalNeto','ivaImporte','totalBruto'])if(item[key]!=null&&text(item[key])!=='')result[key]=number(item[key])*fraction;return result;}
function split(item,purchase={}){
 const rows=read(item,purchase);const fields=['totalNeto','ivaImporte','totalBruto'],totals={};
 for(const key of fields)totals[key]=Math.round(number(item[key]||0)*100);
 const used=Object.fromEntries(fields.map(k=>[k,0]));
 return rows.map((r,index)=>{const part={...portion(item,r.porcentaje/100),...r};for(const key of fields){const cents=index===rows.length-1?totals[key]-used[key]:Math.round(totals[key]*r.porcentaje/100);used[key]+=cents;part[key]=cents/100;}return part;});
}
function rows(purchases){return purchases.flatMap(p=>(p.items||[]).flatMap((item,index)=>split(item,p).map(part=>({...part,compraId:p.id||'',itemIndex:index,fecha:p.fecha||'',proveedor:p.proveedor||'',numeroComprobante:p.numeroComprobante||'',medioPago:p.medioPago||''}))));}
function directRows(purchases){return purchases.flatMap(p=>(p.items||[]).flatMap((i,index)=>!i.distribucion?[]:split(i,p).filter(r=>r.destino==='OT').map(r=>({...r,id:'compra:'+p.id+':'+index+':'+r.ot,fecha:p.fecha,registradoEn:p._ts,tipo:'entrega',origen:'directo_ot',origenCompra:true}))));}
function directFor(plan,purchases,plans=[plan],direct=directRows(purchases)){
 const matches=(r,p)=>r.obraId&&p.obraId?r.obraId===p.obraId:ot(r.ot)===ot(p.ot);
 return direct.filter(r=>matches(r,plan)&&plans.filter(x=>matches(r,x)).length===1);
}
function paymentMethod(value){const s=norm(value);if(/visa/.test(s)&&!/cabal/.test(s))return 'Tarjeta Visa';if(/cabal/.test(s)&&!/visa/.test(s))return 'Tarjeta Cabal';return /tarjet|credito|debito|master/.test(s)?'Tarjeta':text(value);}
return {build,read,stockFraction,portion,split,rows,directRows,directFor,paymentMethod,ot};
});
