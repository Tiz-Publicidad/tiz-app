/* Shared material validation. Quantities describe the entire quotation, not one sold item. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZInsumosCotizacionCoreV1=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const text=v=>String(v??'').trim();
const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const number=v=>typeof v==='number'?v:Number(text(v).replace(',','.'));
const units=['UNID','PLACA','M²','MTS LINEALES','CM','MM','KG','G','LITRO','ML','ROLLO','TUBO','PAR','CAJA','PACK','HORA','JORNADA','SERVICIO'];
function unit(v){const n=norm(v).replace(/\s/g,'');const aliases={u:'UNID',un:'UNID',und:'UNID',unid:'UNID',unidad:'UNID',unidades:'UNID',placa:'PLACA',placas:'PLACA',m2:'M²','m²':'M²',mts2:'M²',mt2:'M²',metroscuadrados:'M²',m:'MTS LINEALES',mt:'MTS LINEALES',mts:'MTS LINEALES',ml:'ML',metro:'MTS LINEALES',metros:'MTS LINEALES',mtslineales:'MTS LINEALES',metroslineales:'MTS LINEALES',litros:'LITRO',l:'LITRO',lt:'LITRO',lts:'LITRO',kilos:'KG',kilogramos:'KG',gr:'G',gramos:'G',hs:'HORA',horas:'HORA'};return aliases[n]||units.find(x=>norm(x).replace(/\s/g,'')===n)||text(v).toUpperCase();}
const measures={'MTS LINEALES':['length',1],CM:['length',.01],MM:['length',.001],KG:['mass',1],G:['mass',.001],LITRO:['volume',1],ML:['volume',.001]};
const finiteQuantity=q=>{if(!Number.isFinite(q)||q<=0)throw Error('La conversión debe dar una cantidad finita mayor que cero.');return q;};
function stockQuantity(quantity,from,article){
 const q=number(quantity),a=unit(from),b=unit(article?.unidad);if(!Number.isFinite(q)||q<=0)throw Error('Completá una cantidad mayor que cero.');
 if(!a||!b)throw Error('Completá la unidad de uso y la unidad de stock.');if(a===b)return q;
 if(measures[a]&&measures[b]&&measures[a][0]===measures[b][0])return finiteQuantity(q*measures[a][1]/measures[b][1]);
 const equivalences=article?.equivalenciasStock||{};const key=Object.keys(equivalences).find(k=>unit(k)===a),factor=number(equivalences[key]);
 if(!Number.isFinite(factor)||factor<=0)throw Error('Unidad incompatible: '+a+' / stock '+b+'. Definí la equivalencia del insumo.');return finiteQuantity(q/factor);
}
function day(v){const s=text(v);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):'';}
function timestamp(v){return v?.toMillis?.()||v?.seconds*1000||Date.parse(v)||0;}
function catalog(articles,purchases,counts,plans){
 return articles.map(article=>{
  const matches=purchases.flatMap(p=>(p.items||[]).filter(i=>i.articuloId===article.id).map((i,index)=>({...i,compra:p,index}))).sort((a,b)=>day(b.compra.fecha).localeCompare(day(a.compra.fecha))||timestamp(b.compra._ts)-timestamp(a.compra._ts)||b.index-a.index);
  const last=matches[0];let price=null,priceError='',currency='ARS';
  if(last){try{if(!text(last.unidad))throw Error('La última compra no tiene unidad.');const q=stockQuantity(1,last.unidad,article),raw=number(last.precioUnitarioNeto);if(!Number.isFinite(raw)||raw<=0)throw Error('El último precio de compra debe ser mayor que cero.');currency=text(last.moneda||last.compra.moneda||'ARS').toUpperCase();if(currency!=='ARS')throw Error('El último precio de compra requiere conversión a ARS.');price=raw/q;}catch(e){priceError=e.message;}}
  else priceError='Sin precio de compra registrado.';
  const count=counts.flatMap(c=>(c.items||[]).filter(i=>i.articuloId===article.id).map(i=>({...i,conteo:c}))).sort((a,b)=>day(b.conteo.fecha).localeCompare(day(a.conteo.fecha))||timestamp(b.conteo._ts)-timestamp(a.conteo._ts))[0];
  // An undated or absent count is unknown stock, never assumed to be zero.
  let stock=null,stockError='';if(count&&day(count.conteo.fecha)){
   stock=number(count.cantidad);if(!Number.isFinite(stock)||stock<0){stock=null;stockError='Conteo de stock inválido.';}
   if(stock!==null){const incoming=purchases.filter(p=>day(p.fecha)>day(count.conteo.fecha)&&norm(p.destino)==='stock').flatMap(p=>(p.items||[]).filter(i=>i.articuloId===article.id));for(const i of incoming){try{stock+=stockQuantity(i.cantidad,i.unidad,article);}catch{stock=null;stockError='Hay compras posteriores con unidades sin resolver.';break;}}}
  }
  const reserved=plans.filter(p=>p.estado!=='cerrado').flatMap(p=>p.items||[]).filter(i=>i.articuloId===article.id&&i.modoStock!=='generico').reduce((s,i)=>s+(number(i.cantidadPlanificada??i.cantidadSugerida)||0),0);
  return {id:article.id,codigo:text(article.codigo),descripcion:text(article.descripcion),unidad:unit(article.unidad),control:article.control||'',equivalenciasStock:article.equivalenciasStock||{},ultimoCosto:price,errorPrecio:priceError,monedaCosto:currency,proveedor:text(last?.compra.proveedor),fechaCosto:text(last?.compra.fecha),compraId:text(last?.compra.id),stockDisponible:stock===null?null:Math.max(0,stock-reserved),fechaStock:text(count?.conteo.fecha),errorStock:stockError};
 });
}
function validate(rows,articles){
 const errors=[],warnings=[],totals=new Map(),lines=[];
 if(!Array.isArray(rows)||!rows.length)errors.push('Cargá el detalle de materiales antes de aprobar.');
 if(rows?.length>200)errors.push('El detalle admite hasta 200 materiales.');
 for(const [index,row] of (Array.isArray(rows)?rows:[]).entries()){
  const prefix='Material '+(index+1)+': ',a=articles.find(a=>a.id===row.articuloId),line={...row,errores:[],avisos:[]};
  const fail=s=>{line.errores.push(s);errors.push(prefix+s);};
  if(!a)fail('Elegí un insumo del catálogo de stock.');
  if(row.revisado!==true)fail('Revisá y confirmá el material.');
  if(a){try{line.cantidadStock=stockQuantity(row.cantidad,row.unidad,a);totals.set(a.id,(totals.get(a.id)||0)+line.cantidadStock);}catch(e){fail(e.message);}
   if(!Number.isFinite(a.ultimoCosto)||a.ultimoCosto<=0)fail(a.errorPrecio||'Falta el último precio de Compras.');
   line.unidadStock=a.unidad;line.costoUnitarioStock=a.ultimoCosto;line.costoTotal=Number.isFinite(line.cantidadStock)&&Number.isFinite(a.ultimoCosto)?line.cantidadStock*a.ultimoCosto:0;
   if(!Number.isFinite(line.costoTotal)){fail('El costo calculado está fuera de rango.');line.costoTotal=0;}
  }lines.push(line);
 }
 lines.forEach((line,index)=>{const a=articles.find(a=>a.id===line.articuloId);if(!a||a.control==='sin_stock')return;let message='';if(a.stockDisponible===null)message=a.errorStock||'Sin conteo de stock disponible.';else if(totals.get(a.id)>a.stockDisponible+1e-9)message='Stock insuficiente: se necesitan '+totals.get(a.id).toLocaleString('es-AR')+' '+a.unidad+' y hay '+a.stockDisponible.toLocaleString('es-AR')+'.';
  if(message){line.avisos.push(message);warnings.push('Material '+(index+1)+': '+message);if(line.compraPendiente!==true){const s='Registrá compra / verificación pendiente para resolver el stock.';line.errores.push(s);errors.push('Material '+(index+1)+': '+s);}}
 });let total=lines.reduce((s,l)=>s+l.costoTotal,0);if(!Number.isFinite(total)){errors.push('El costo total está fuera de rango.');total=0;}return {ok:errors.length===0,errores:errors,avisos:warnings,items:lines,total};
}
function draft(rows){return (Array.isArray(rows)?rows:[]).slice(0,200).map(r=>({articuloId:text(r.articuloId),descripcion:text(r.descripcion).slice(0,300),cantidad:text(r.cantidad),unidad:unit(r.unidad),revisado:r.revisado===true,compraPendiente:r.compraPendiente===true,origen:r.origen==='ia'?'ia':'manual',nota:text(r.nota).slice(0,500)}));}
function snapshot(rows,articles,quote,user,at){const result=validate(rows,articles);if(!result.ok)throw Error(result.errores.join('\n'));return {version:1,aprobadoEn:at,aprobadoPor:user.email,monedaCosto:'ARS',importeVenta:number(quote.importe)||0,monedaVenta:text(quote.moneda||'ARS'),totalCosto:result.total,items:result.items.map(r=>{const a=articles.find(a=>a.id===r.articuloId);return {...draft([r])[0],codigo:a.codigo,descripcion:a.descripcion,cantidadStock:r.cantidadStock,unidadStock:a.unidad,costoUnitarioStock:a.ultimoCosto,costoTotal:r.costoTotal,compraId:a.compraId,fechaCosto:a.fechaCosto,proveedor:a.proveedor,equivalenciasStock:a.equivalenciasStock,stockDisponible:a.stockDisponible,fechaStock:a.fechaStock,avisos:r.avisos};})};}
return {text,norm,number,units,unit,stockQuantity,day,timestamp,catalog,validate,draft,snapshot};
});
