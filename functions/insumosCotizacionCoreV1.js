/* Shared material validation. Quantities describe the entire quotation, not one sold item. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZInsumosCotizacionCoreV1=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const text=v=>String(v??'').trim();
const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const number=v=>typeof v==='number'?v:Number(text(v).replace(',','.'));
const units=['UNID','PLACA','M²','MTS LINEALES','CM','MM','KG','G','LITRO','ML','ROLLO','TUBO','PAR','CAJA','PACK','HORA','JORNADA','SERVICIO'];
const articleIdentity=v=>norm(v).replace(/\s+/g,' ');
function argentinaDay(value=new Date()){
 const raw=text(value);if(/^\d{4}-\d{2}-\d{2}$/.test(raw)||/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)){const d=day(raw);if(d)return d;}
 const d=new Date(value);if(!Number.isFinite(d.getTime()))throw Error('Fecha de aprobación inválida.');
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d),v=k=>parts.find(p=>p.type===k).value;
 return v('year')+'-'+v('month')+'-'+v('day');
}
function approvalWorkDates(data={},existing={},now=new Date()){
 const stamp=existing.fechaAprobacion||data.fechaAprobacion||data.insumosVentasAprobados?.aprobadoEn||new Date(now).toISOString();
 const alta=day(existing.fechaAltaObra)||argentinaDay(stamp),d=new Date(alta+'T12:00:00Z'),dow=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-dow);d.setUTCHours(0,0,0,0);
 const week=Math.ceil(((d-new Date(Date.UTC(d.getUTCFullYear(),0,1)))/86400000+1)/7);
 return {fechaAprobacion:stamp,fechaAltaObra:alta,fecha:existing.fecha||alta,semanaVenta:existing.semanaVenta??week,semana:existing.semana??week,fechaAltaObraOrigen:existing.fechaAltaObraOrigen||(existing.fechaAltaObra?'':'aprobacion')};
}
function articleDraft(input={}){
 const out={};for(const [k,max] of [['descripcion',300],['familia',100],['subfamilia',100]]){if(typeof input[k]!=='string'||!text(input[k])||text(input[k]).length>max)throw Error('Completá '+k+' del insumo (máximo '+max+' caracteres).');out[k]=text(input[k]);}
 out.unidad=unit(input.unidad);if(!units.includes(out.unidad))throw Error('Elegí una unidad válida para el insumo.');
 if(!['estrategico','consumible','sin_stock'].includes(input.control))throw Error('Elegí el control de stock del insumo.');
 return {...out,control:input.control,stockMinimo:0};
}
function nextArticleCode(articles,last=0){
 // Los códigos 000001–000331 pertenecen a la base TIZ incluida en Compras.
 const next=Math.max(331,Number(last)||0,...articles.map(a=>/^\d+$/.test(text(a.codigo))?Number(a.codigo):0))+1;
 if(!Number.isSafeInteger(next))throw Error('La numeración de insumos está fuera de rango.');return String(next).padStart(6,'0');
}
function unit(v){const n=norm(v).replace(/\s/g,'');const aliases={u:'UNID',un:'UNID',und:'UNID',unid:'UNID',unidad:'UNID',unidades:'UNID',placa:'PLACA',placas:'PLACA',m2:'M²','m²':'M²',mts2:'M²',mt2:'M²',metroscuadrados:'M²',m:'MTS LINEALES',mt:'MTS LINEALES',mts:'MTS LINEALES',ml:'ML',metro:'MTS LINEALES',metros:'MTS LINEALES',mtslineales:'MTS LINEALES',metroslineales:'MTS LINEALES',litros:'LITRO',l:'LITRO',lt:'LITRO',lts:'LITRO',kilos:'KG',kilogramos:'KG',gr:'G',gramos:'G',hs:'HORA',horas:'HORA'};return aliases[n]||units.find(x=>norm(x).replace(/\s/g,'')===n)||text(v).toUpperCase();}
const measures={'MTS LINEALES':['length',1],CM:['length',.01],MM:['length',.001],KG:['mass',1],G:['mass',.001],LITRO:['volume',1],ML:['volume',.001]};
const finiteQuantity=q=>{if(!Number.isFinite(q)||q<=0)throw Error('La conversión debe dar una cantidad finita mayor que cero.');return q;};
function stockQuantity(quantity,from,article){
 const q=number(quantity),a=unit(from),b=unit(article?.unidad);if(!Number.isFinite(q)||q<=0)throw Error('Completá una cantidad mayor que cero.');
 if(!a||!b)throw Error('Completá la unidad de uso y la unidad de stock.');if(a===b)return q;
 if(measures[a]&&measures[b]&&measures[a][0]===measures[b][0])return finiteQuantity(q*measures[a][1]/measures[b][1]);
 const equivalences=article?.equivalenciasStock||{},keys=Object.keys(equivalences).filter(k=>unit(k)===a),key=keys[0],factor=number(equivalences[key]);
 if(keys.some(k=>Math.abs(number(equivalences[k])-factor)>Math.max(1e-9,Math.abs(factor)*1e-9)))throw Error('Hay equivalencias duplicadas e incompatibles para '+a+'. Revisá el criterio del insumo.');
 if(!Number.isFinite(factor)||factor<=0)throw Error('Unidad incompatible: '+a+' / stock '+b+'. Definí la equivalencia del insumo.');return finiteQuantity(q/factor);
}
// Keep the historic/purchase unit intact. A control unit is a converted view,
// so old counts in rolls and newer counts in m² can coexist without relabeling data.
function baseArticle(raw={}){
 const origin=unit(raw.unidad),base=unit(raw.unidadControl||origin);
 if(base===origin)return baseMinimum({...raw,unidad:origin,unidadOrigen:origin,factorControl:1},raw);
 let factor;try{factor=1/stockQuantity(1,base,raw);}catch{throw Error('Falta la equivalencia entre '+origin+' y la unidad de control '+base+'.');}
 finiteQuantity(factor);const equivalents={};for(const [key,value] of Object.entries(raw.equivalenciasStock||{}))if(unit(key)!==base&&Number.isFinite(number(value))&&number(value)>0)equivalents[unit(key)]=number(value)/factor;
 equivalents[origin]=1/factor;return baseMinimum({...raw,unidad:base,unidadOrigen:origin,factorControl:factor,equivalenciasStock:equivalents},raw);
}
function baseMinimum(a,raw){try{a.stockMinimo=measuredQuantity(raw.stockMinimo??0,raw.unidadStockMinimo||raw.unidad,a);}catch{a.stockMinimo=null;}return a;}
function measuredQuantity(value,from,article){if(value===null||value===undefined||text(value)==='')throw Error('Falta la cantidad del movimiento.');const q=number(value);if(!Number.isFinite(q))throw Error('Cantidad inválida.');if(q===0)return 0;return Math.sign(q)*stockQuantity(Math.abs(q),from,article);}
function movementQuantity(row,raw,field='cantidad'){
 const a=baseArticle(raw);if(field==='cantidad'&&Number.isFinite(row.cantidadStock)&&text(row.unidadStock))return measuredQuantity(row.cantidadStock,row.unidadStock,a);
 return measuredQuantity(row[field],row.unidad||raw.unidad,a);
}
function unitSetting(raw,input){
 const target=unit(input.unidadControl),purchase=unit(input.unidadCompra||raw.unidadCompraPreferida||raw.unidad),factor=number(input.factor),origin=unit(raw.unidad);if(!origin||!units.includes(target)||!units.includes(purchase)||!Number.isFinite(factor)||factor<=0)throw Error('Completá las unidades de compra y control y una equivalencia mayor que cero.');
 const fixed=purchase===target?1:measures[purchase]&&measures[target]&&measures[purchase][0]===measures[target][0]?measures[purchase][1]/measures[target][1]:null;
 if(fixed!==null&&Math.abs(factor-fixed)>Math.max(1e-9,fixed*1e-9))throw Error('Las unidades métricas seleccionadas tienen una relación fija: '+fixed+'.');
 const width=text(input.ancho)===''?null:number(input.ancho),length=text(input.largo)===''?null:number(input.largo);
 if(width!==null||length!==null){if(target!=='M²'||!Number.isFinite(width)||width<=0||!Number.isFinite(length)||length<=0)throw Error('Completá ancho y largo positivos en metros.');if(Math.abs(width*length-factor)>Math.max(1e-8,factor*1e-8))throw Error('La equivalencia no coincide con ancho × largo.');}
 const equivalents=Object.fromEntries(Object.entries(raw.equivalenciasStock||{}).filter(([key])=>unit(key)!==origin).map(([key,value])=>[unit(key),value]));
 let targetPerOrigin;if(target===origin)targetPerOrigin=1;else if(measures[origin]&&measures[target]&&measures[origin][0]===measures[target][0])targetPerOrigin=measures[origin][1]/measures[target][1];else if(purchase===origin)targetPerOrigin=factor;else if(text(input.contenidoOriginal)!==''){const relation=number(input.contenidoOriginal);if(!Number.isFinite(relation)||relation<=0)throw Error('La relación con la unidad original debe ser positiva.');targetPerOrigin=relation*factor;}else if(number(equivalents[target])>0)targetPerOrigin=number(equivalents[target]);else if(number(equivalents[purchase])>0)targetPerOrigin=number(equivalents[purchase])*factor;else throw Error('Falta definir cuántos '+purchase+' representa 1 '+origin+' de los registros anteriores.');
 finiteQuantity(targetPerOrigin);if(target!==origin)equivalents[target]=targetPerOrigin;if(purchase!==origin)equivalents[purchase]=targetPerOrigin/factor;
 return {unidadControl:target,unidadCompraPreferida:purchase,equivalenciasStock:equivalents,medidasPresentacion:width===null?raw.medidasPresentacion||{}:{anchoMetros:width,largoMetros:length,unidadPresentacion:purchase}};
}
function day(v){const s=text(v);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):'';}
function timestamp(v){return v?.toMillis?.()||v?.seconds*1000||Date.parse(v)||0;}
function catalog(articles,purchases,counts,plans){
 return articles.map(original=>{
  let article;try{article=baseArticle(original);}catch(e){return {id:original.id,codigo:text(original.codigo),descripcion:text(original.descripcion),familia:text(original.familia||original.rubro),subfamilia:text(original.subfamilia),unidad:unit(original.unidadControl||original.unidad),unidadOrigen:unit(original.unidad),control:original.control||'',equivalenciasStock:{},ultimoCosto:null,errorPrecio:e.message,stockDisponible:null,stockFisico:null,errorStock:e.message,fechaStock:'',fechaCosto:'',proveedor:'',compraId:''};}
  const matches=purchases.flatMap(p=>(p.items||[]).filter(i=>i.articuloId===article.id).map((i,index)=>({...i,compra:p,index}))).sort((a,b)=>day(b.compra.fecha).localeCompare(day(a.compra.fecha))||timestamp(b.compra._ts)-timestamp(a.compra._ts)||b.index-a.index);
  const last=matches[0];let price=null,priceError='',currency='ARS';
  if(last){try{if(!text(last.unidad))throw Error('La última compra no tiene unidad.');const quantity=number(last.cantidad),q=Number.isFinite(quantity)&&quantity>0?movementQuantity(last,original)/quantity:stockQuantity(1,last.unidad,article),raw=number(last.precioUnitarioNeto);if(!Number.isFinite(raw)||raw<=0||q<=0)throw Error('El último precio de compra debe ser mayor que cero.');currency=text(last.moneda||last.compra.moneda||'ARS').toUpperCase();if(currency!=='ARS')throw Error('El último precio de compra requiere conversión a ARS.');price=raw/q;}catch(e){priceError=e.message;}}
  else priceError='Sin precio de compra registrado.';
  const count=counts.flatMap(c=>(c.items||[]).filter(i=>i.articuloId===article.id).map(i=>({...i,conteo:c}))).sort((a,b)=>day(b.conteo.fecha).localeCompare(day(a.conteo.fecha))||timestamp(b.conteo._ts)-timestamp(a.conteo._ts))[0];
  // An undated or absent count is unknown stock, never assumed to be zero.
  let stock=null,stockError='';if(count&&day(count.conteo.fecha)){
   try{stock=movementQuantity(count,original);if(stock<0)throw Error('Conteo negativo.');}catch{stock=null;stockError='El conteo tiene una cantidad o unidad sin resolver.';}
   if(stock!==null){const incoming=purchases.filter(p=>day(p.fecha)>day(count.conteo.fecha)&&norm(p.destino)==='stock').flatMap(p=>(p.items||[]).filter(i=>i.articuloId===article.id));for(const i of incoming){try{stock+=movementQuantity(i,original);}catch{stock=null;stockError='Hay compras posteriores con unidades sin resolver.';break;}}}
  }
  let reserved=0,reserveError=false;for(const i of plans.filter(p=>p.estado!=='cerrado').flatMap(p=>p.items||[]).filter(i=>i.articuloId===article.id&&i.modoStock!=='generico')){try{const quantity=number(i.cantidadPlanificada??i.cantidadSugerida);if(quantity<0)throw Error('Reserva negativa.');reserved+=movementQuantity({...i,cantidad:quantity,cantidadStock:undefined},original);}catch{reserveError=true;stockError='Hay reservas con unidades sin resolver.';}}
  return {id:article.id,codigo:text(article.codigo),descripcion:text(article.descripcion),familia:text(article.familia||article.rubro),subfamilia:text(article.subfamilia),unidad:unit(article.unidad),unidadOrigen:unit(original.unidad),unidadControl:unit(original.unidadControl||original.unidad),control:article.control||'',stockMinimo:article.stockMinimo,equivalenciasStock:article.equivalenciasStock||{},ultimoCosto:price,errorPrecio:priceError,monedaCosto:currency,proveedor:text(last?.compra.proveedor),fechaCosto:text(last?.compra.fecha),compraId:text(last?.compra.id),stockFisico:stock,reservado:reserveError?null:reserved,stockDisponible:stock===null||reserveError?null:Math.max(0,stock-reserved),fechaStock:text(count?.conteo.fecha),errorStock:stockError};
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
return {text,norm,number,units,articleIdentity,articleDraft,nextArticleCode,argentinaDay,approvalWorkDates,unit,stockQuantity,baseArticle,measuredQuantity,movementQuantity,unitSetting,day,timestamp,catalog,validate,draft,snapshot};
});
