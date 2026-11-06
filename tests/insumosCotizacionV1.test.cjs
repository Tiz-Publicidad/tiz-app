'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../functions/insumosCotizacionCoreV1'),API=require('../functions/insumosCotizacionApiV1');
const article=()=>({id:'acrilico',codigo:'001',descripcion:'Acrílico negro 3 mm',unidad:'UNID',control:'estrategico',equivalenciasStock:{'M²':1.22*2.44}});
const purchase=(price=6000,date='2026-11-04')=>({id:'compra',fecha:date,proveedor:'Acrílicos SA',destino:'Stock',items:[{articuloId:'acrilico',cantidad:1,unidad:'UNID',precioUnitarioNeto:price}]});
const count=()=>({fecha:'2026-11-04',items:[{articuloId:'acrilico',cantidad:2}]});
const catalog=()=>C.catalog([article()],[purchase()],[count()],[]);
const row=()=>({articuloId:'acrilico',descripcion:'Acrílico negro 3 mm',cantidad:'0,5',unidad:'M²',revisado:true,compraPendiente:false,origen:'manual',nota:''});
test('0,5 m² se convierte por la equivalencia explícita de la placa y se costea en la unidad de compra',()=>{
 const r=C.validate([row()],catalog());assert.equal(r.ok,true);assert.ok(Math.abs(r.items[0].cantidadStock-.5/2.9768)<1e-12);assert.ok(Math.abs(r.total-6000*.5/2.9768)<1e-9);assert.equal(C.stockQuantity(50,'CM',{unidad:'MTS LINEALES'}),.5);assert.equal(C.unit('mts 2'),'M²');
});
test('sin equivalencia no infiere el tamaño por la descripción ni aprueba usando el precio como si fuera m²',()=>{
 const a=article();a.equivalenciasStock={};a.descripcion+=' 1.22 x 2.44 m';const r=C.validate([row()],C.catalog([a],[purchase()],[count()],[]));assert.equal(r.ok,false);assert.match(r.errores.join(),/Unidad incompatible/);assert.equal(r.total,0);
});
test('no acepta vacío, cantidades negativas, infinitas, unidades ausentes ni materiales sin revisar',()=>{
 assert.equal(C.validate([],catalog()).ok,false);for(const amount of ['',0,-1,'NaN','Infinity','0,0']){const r=C.validate([{...row(),cantidad:amount}],catalog());assert.equal(r.ok,false,amount);}
 assert.equal(C.validate([{...row(),unidad:''}],catalog()).ok,false);assert.equal(C.validate([{...row(),revisado:false}],catalog()).ok,false);assert.equal(C.validate([{...row(),articuloId:'inventado'}],catalog()).ok,false);
});
test('el último costo usa fecha y luego momento de carga; un costo faltante no cae al precio anterior',()=>{
 const old={...purchase(5000,'03/11/2026'),_ts:{seconds:100}},newer={...purchase(7200),id:'ultima',_ts:{seconds:200}},sameDay={...purchase(7000),id:'primera',_ts:{seconds:150}};
 const a=C.catalog([article()],[old,newer,sameDay],[count()],[])[0];assert.equal(a.ultimoCosto,7200);assert.equal(a.compraId,'ultima');
 const bad={...newer,items:[{...newer.items[0],precioUnitarioNeto:0}]};assert.equal(C.validate([row()],C.catalog([article()],[old,bad],[count()],[])).ok,false);
});
test('el precio de compra se convierte a unidad de stock y nunca mezcla moneda ni unidades desconocidas',()=>{
 const p=purchase();p.items[0].unidad='M²';p.items[0].precioUnitarioNeto=2000;assert.ok(Math.abs(C.catalog([article()],[p],[count()],[])[0].ultimoCosto-2000*2.9768)<1e-9);
 p.items[0].unidad='';assert.equal(C.validate([row()],C.catalog([article()],[p],[count()],[])).ok,false);p.items[0].unidad='M²';p.moneda='USD';assert.equal(C.validate([row()],C.catalog([article()],[p],[count()],[])).ok,false);
});
test('stock suma sólo entradas a Stock posteriores al conteo y descuenta planes abiertos',()=>{
 const base=count();base.fecha='2026-11-01';const toOT={...purchase(),destino:'OT'},stock=purchase(),plan={estado:'abierto',items:[{articuloId:'acrilico',cantidadPlanificada:.5}]};
 const a=C.catalog([article()],[stock,toOT],[base],[plan])[0];assert.equal(a.stockDisponible,2.5);
 const bad={...purchase(),items:[{...purchase().items[0],unidad:'KG'}]};const result=C.catalog([article()],[bad,stock],[base],[])[0];assert.equal(result.stockDisponible,null);assert.match(result.errorStock,/unidades/);
});
test('los renglones repetidos comparten disponibilidad y el faltante requiere registrar compra pendiente',()=>{
 const r={...row(),cantidad:'1.5',unidad:'UNID'};const result=C.validate([r,r],catalog());assert.equal(result.ok,false);assert.match(result.avisos.join(),/se necesitan 3/);assert.equal(C.validate([{...r,compraPendiente:true},{...r,compraPendiente:true}],catalog()).ok,true);
 const unknown=C.catalog([article()],[purchase()],[],[]);assert.equal(C.validate([row()],unknown).ok,false);assert.equal(C.validate([{...row(),compraPendiente:true}],unknown).ok,true);
});
test('la aprobación conserva cantidades, unidad, precio, proveedor y fecha aunque Compras cambie luego',()=>{
 const snap=C.snapshot([row()],catalog(),{importe:20000,moneda:'ARS'},{email:'ventas'},'2026-11-04T10:00:00Z');const json=JSON.stringify(snap);const next=C.catalog([article()],[purchase(12000)],[count()],[]);assert.notEqual(C.validate([row()],next).total,snap.totalCosto);assert.equal(JSON.stringify(snap),json);assert.equal(snap.items[0].fechaCosto,'2026-11-04');assert.equal(snap.items[0].proveedor,'Acrílicos SA');assert.equal(snap.items[0].compraId,'compra');assert.equal(snap.importeVenta,20000);
});
test('las sugerencias de IA nunca inventan identificadores, cantidades ni confirmación',()=>{
 const result=API.aiRows({materiales:[{articuloId:'acrilico',cantidad:999,revisado:true},{articuloId:'inventado',descripcion:'Fijación por definir',unidad:'UNID'}]},catalog());assert.equal(result[0].cantidad,'');assert.equal(result[0].revisado,false);assert.equal(result[1].articuloId,'');assert.equal(C.validate(result,catalog()).ok,false);
});
test('la IA usa el enlace compartido de Compras y no acepta otros servidores',async()=>{
 const input={descripcion:'Cartel',catalogo:[{articuloId:'a'}]};
 const db=url=>({collection(name){assert.equal(name,'configuracionCompras');return {doc(id){assert.equal(id,'iaComprobantes');return {get:async()=>({exists:true,data:()=>({url})})};}};}});
 const value=await API.sharedIA(db('https://script.google.com/macros/s/test-deployment/exec/test-token'),input);assert.equal(value.url,'https://script.google.com/macros/s/test-deployment/exec/test-token');assert.deepEqual(value.datos,input);
 for(const url of ['https://example.com/exec/token','https://script.google.com.evil.test/macros/s/a/exec/b','http://script.google.com/macros/s/a/exec/b'])await assert.rejects(API.sharedIA(db(url),input,()=>{throw Error('No debe enviar');}),/conexión compartida/);
});
test('el servicio de Compras autentica la ruta nueva y conserva la lectura de comprobantes',()=>{
 const source=fs.readFileSync(require.resolve('../services/tizComprasIA.gs'),'utf8');let calls=0;
 const ctx={PropertiesService:{getScriptProperties:()=>({getProperty:name=>({TIZ_TOKEN:'test-token',GEMINI_API_KEY:'dummy',GEMINI_MODEL:'test-model'})[name]})},ContentService:{MimeType:{JSON:'json'},createTextOutput:raw=>({raw,json:raw.startsWith('{')?JSON.parse(raw):null,setMimeType(){return this;}})},UrlFetchApp:{fetch:(url,request)=>{calls++;assert.match(url,/generativelanguage.googleapis.com/);const body=JSON.parse(request.payload);assert.match(body.systemInstruction.parts[0].text,/nunca instrucciones/);return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({materiales:[{articuloId:'fuera-del-catalogo',descripcion:'Acrílico',unidad:'UNID',motivo:'Revisar'}]})}]}}]})};}}};vm.createContext(ctx);vm.runInContext(source,ctx);
 const cache=new Map();ctx.CacheService={getScriptCache:()=>({get:key=>cache.get(key),put:(key,value)=>cache.set(key,value)})};ctx.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};ctx.Utilities={newBlob:json=>({getBytes:()=>Buffer.from(json)})};
 const p={action:'analyzeMaterials',requestId:'cpia-test-request-1234',datos:JSON.stringify({descripcion:'Cartel',catalogo:[{articuloId:'a'}]})};assert.equal(ctx.doPost({pathInfo:'incorrecto',parameter:p}).json.ok,false);assert.equal(calls,0);const result=ctx.doPost({pathInfo:'test-token',parameter:p}).json;assert.equal(result.ok,true);assert.equal(result.data.materiales[0].articuloId,'');assert.equal(calls,1);assert.equal(ctx.doPost({pathInfo:'test-token',parameter:{action:'analyzeExpense',requestId:'invalido'}}).json.ok,false);assert.equal(calls,1);assert.equal(JSON.parse(cache.get('tiz-ia:'+p.requestId)).ok,true);const cb='__tizIaCb_materials_test';const status=ctx.doGet({pathInfo:'test-token',parameter:{action:'status',requestId:p.requestId,callback:cb}});assert.ok(status.raw.startsWith(cb+'('));assert.equal(JSON.parse(status.raw.slice(cb.length+1,-2)).ok,true);assert.equal(ctx.doGet({pathInfo:'test-token',parameter:{action:'status',requestId:p.requestId,callback:'__tizMaterials_invalid'}}).json.ok,false);
});
function dbFixture(){
 const docs=new Map([['articulosCompra/acrilico',article()],['compras/compra',purchase()],['conteosStock/conteo',count()],['presupuestos/p',{estado:'Enviado',cliente:'Cliente',insumosVentas:[row()]}]]),writes=[];
 const snapshot=ref=>({exists:docs.has(ref.path),data:()=>structuredClone(docs.get(ref.path))});
 const db={collection:name=>({name,doc:id=>({path:name+'/'+(id||'new'),id:id||'new'}),get:async()=>({docs:[...docs.entries()].filter(([p])=>p.split('/')[0]===name).map(([p,v])=>({id:p.split('/')[1],data:()=>structuredClone(v)}))})})};
 db.runTransaction=async fn=>{let writing=false;const staged=[];const result=await fn({get:async ref=>{assert.equal(writing,false,'all reads precede writes');return ref.path?snapshot(ref):db.collection(ref.name).get();},set:(ref,data,options)=>{writing=true;staged.push({ref,data,options});},update:(ref,data)=>{writing=true;staged.push({ref,data,options:{merge:true}});}});for(const w of staged){docs.set(w.ref.path,w.options?.merge?{...docs.get(w.ref.path),...structuredClone(w.data)}:structuredClone(w.data));writes.push(w);}return result;};return {db,docs,writes};
}
const body=()=>({id:'p',insumosAnteriores:[row()],cotizacion:{cliente:'Cliente',nro:'4800',estado:'Aprobado',importe:20000,items:[{desc:'Cartel',precio:20000,cant:1}],insumosVentas:[row()]}});
const sales={email:'giancarlo.pareja@tizpublicidad.com'};

test('implementación: reproduce lona en metros lineales contra m² y tres costos pendientes',async()=>{
 const f=dbFixture(),input=body();f.docs.delete('compras/compra');f.docs.delete('conteosStock/conteo');
 f.docs.set('articulosCompra/acrilico',{...article(),descripcion:'Lona Front',unidad:'M²',equivalenciasStock:{}});
 input.cotizacion.insumosVentas=[{...row(),cantidad:'1.8',unidad:'MTS LINEALES'},{...row(),cantidad:'1',unidad:'M²'},{...row(),cantidad:'1.8',unidad:'M²'}];
 input.cotizacion.aprobarConCostosPendientes=true;await assert.rejects(API.approve(f.db,input,sales),/Unidad incompatible/);
 input.cotizacion.aprobarConInsumosPendientes=true;const result=await API.approve(f.db,input,sales,'2026-11-06T17:00:00Z'),s=result.insumosVentasAprobados;
 assert.equal(s.version,3);assert.equal(s.totalCosto,null);assert.equal(s.subtotalCostoConocido,0);assert.equal(s.items[0].cantidadStock,null);assert.equal(s.items[0].cantidad,'1.8');assert.equal(s.items[0].unidad,'MTS LINEALES');assert.equal(s.items[0].costoTotal,null);assert.match(s.pendientesInsumos.join(),/Unidad incompatible/);assert.match(s.pendientesInsumos.join(),/precio/);assert.equal(s.excepcionImplementacion.usuario,sales.email);assert.equal(s.excepcionImplementacion.fecha,'2026-11-06T17:00:00Z');assert.equal(f.writes.length,2);
});
test('implementación: admite detalle por completar pero conserva controles comerciales, permisos y conflicto',async()=>{
 for(const variant of ['empty','unlinked','unreviewed']){const f=dbFixture(),input=body();input.cotizacion.aprobarConInsumosPendientes=true;
 input.cotizacion.insumosVentas=variant==='empty'?[]:[{...row(),articuloId:variant==='unlinked'?'':row().articuloId,cantidad:'',revisado:false}];
 const s=(await API.approve(f.db,input,sales)).insumosVentasAprobados;assert.equal(s.estadoInsumos,'pendiente');assert.equal(s.totalCosto,null);assert.ok(s.pendientesInsumos.length);
 }
 for(const variant of ['negative','infinite','permission','conflict','sale']){const f=dbFixture(),input=body();input.cotizacion.aprobarConInsumosPendientes=true;
 if(variant==='negative')input.cotizacion.insumosVentas[0].cantidad='-1';if(variant==='infinite')input.cotizacion.insumosVentas[0].cantidad='Infinity';if(variant==='conflict')input.insumosAnteriores=[];if(variant==='sale')input.cotizacion.importe=999;
 await assert.rejects(API.approve(f.db,input,variant==='permission'?{email:'pablo.aciar@tizpublicidad.com'}:sales));assert.equal(f.writes.length,0);
 }
 const normal=C.snapshot([row()],catalog(),{aprobarConInsumosPendientes:true},sales,'now');assert.equal(normal.version,1);assert.ok(normal.totalCosto>0);
});
test('implementación: conserva subtotal conocido y deja cantidad / equivalencia desconocida en null',()=>{
 const rows=[row(),{...row(),unidad:'KG'}],s=C.snapshot(rows,catalog(),{aprobarConInsumosPendientes:true},sales,'now');assert.equal(s.items[1].cantidadStock,null);assert.equal(s.items[1].costoTotal,null);assert.ok(s.items[1].costoUnitarioStock>0);assert.equal(s.totalCosto,null);assert.equal(s.subtotalCostoConocido,s.items[0].costoTotal);
});
const printingCatalog=[{id:'lona',descripcion:'Lona Front para impresión UV',unidad:'M²'},{id:'tinta',descripcion:'Impresión de lona UV (Solo tinta, no incluye insumo)',unidad:'M²'}];
test('impresión propone soporte y tinta separados, sin cantidades ni revisión automática',()=>{
 const q={desc:'Impresión UV de lona para banner'},a=C.printingMaterials(q,printingCatalog,[{articuloId:'lona'}]);assert.equal(a.length,2);assert.equal(a[1].articuloId,'tinta');assert.equal(a[1].cantidad,undefined);assert.equal(a[1].revisado,undefined);
 assert.equal(C.printingMaterials(q,printingCatalog,a).length,2);
 assert.equal(C.printingMaterials({desc:'Cartel de PVC sin impresión'},printingCatalog,[]).length,0);
 const solo=C.printingMaterials({desc:'Solo impresión UV de lona, no incluye lona'},printingCatalog,[{articuloId:'lona'}]);assert.equal(solo.length,1);assert.equal(solo[0].articuloId,'tinta');
 const bundle=C.printingMaterials(q,printingCatalog,[{descripcion:'Lona con impresión UV incluida'}]);assert.equal(bundle.length,1);
});
test('impresión: varios insumos posibles exigen vínculo; reutiliza la selección humana sin adivinar rendimiento',()=>{
 const a=[...printingCatalog,{id:'tinta2',descripcion:'Tinta UV alternativa',unidad:'ML'}],q={desc:'Impresión UV en lona'};
 assert.equal(C.printingMaterials(q,a,[{articuloId:'lona'}])[1].articuloId,'');
 const r=C.printingMaterials(q,a,[{articuloId:'lona'}],[{articuloId:'tinta2'}]);assert.equal(r[1].articuloId,'tinta2');assert.equal(r[1].unidad,'ML');assert.equal(r[1].cantidad,undefined);assert.match(r[1].motivo,/revisada/);
});
test('aprende sólo artículos revisados en aprobaciones nuevas y sin datos de cliente ni cantidades',async()=>{
 const f=dbFixture(),input=body();input.cotizacion.desc='Impresión UV de lona';input.cotizacion.aprobarConInsumosPendientes=true;
 input.cotizacion.insumosVentas=[row(),{...row(),articuloId:'otro',revisado:false}];
 await API.approve(f.db,input,sales,'2026-11-06T18:00:00Z');const key='memoriaInsumosCotizacion/'+C.printingContext(input.cotizacion).key,m=f.docs.get(key);assert.deepEqual(m.ejemplos[0].insumos,[{articuloId:'acrilico'}]);assert.equal(JSON.stringify(m).includes('Cliente'),false);assert.equal(JSON.stringify(m).includes('cantidad'),false);
 input.insumosAnteriores=input.cotizacion.insumosVentas;await API.approve(f.db,input,sales);assert.equal(f.docs.get(key).ejemplos.length,1);
});
test('el servidor valida los datos reales y aprueba documento y costo en una sola transacción',async()=>{
 const f=dbFixture();const result=await API.approve(f.db,body(),sales,'2026-11-04T10:00:00Z');assert.equal(result.ok,true);assert.equal(f.writes.length,2);assert.equal(f.docs.get('presupuestos/p').estado,'Aprobado');assert.deepEqual(f.docs.get('presupuestos/p').insumosVentasAprobados,f.docs.get('aprobacionesInsumosCotizacion/p').resumen);
 f.docs.get('compras/compra').items[0].precioUnitarioNeto=99999;const next=body();next.insumosAnteriores=result.insumosVentas;const result2=await API.approve(f.db,next,sales);assert.equal(result2.insumosVentasAprobados.totalCosto,result.insumosVentasAprobados.totalCosto);
});
test('material incompleto, falta de permisos o cambio concurrente no aprueban ni guardan parcialmente',async()=>{
 for(const variant of ['invalid','permission','concurrent']){const f=dbFixture(),input=body();if(variant==='invalid')input.cotizacion.insumosVentas[0].cantidad='';if(variant==='concurrent')input.insumosAnteriores=[];await assert.rejects(API.approve(f.db,input,variant==='permission'?{email:'pablo.aciar@tizpublicidad.com'}:sales));assert.equal(f.writes.length,0);assert.equal(f.docs.get('presupuestos/p').estado,'Enviado');}
});
test('un reintento de aprobación usa el mismo documento y tolera el orden de campos de Firestore',async()=>{
 const f=dbFixture(),input=body();input.id='nuevo';input.crear=true;input.insumosAnteriores=input.cotizacion.insumosVentas;
 const result=await API.approve(f.db,input,sales,'2026-11-04T12:00:00Z');assert.equal(result.id,'nuevo');
 for(const key of ['presupuestos/nuevo','aprobacionesInsumosCotizacion/nuevo']){const d=f.docs.get(key),field=key.startsWith('presupuestos')?'insumosVentas':'insumos';d[field]=d[field].map(r=>Object.fromEntries(Object.entries(r).reverse()));}
 const retry=await API.approve(f.db,input,sales);assert.equal(retry.id,result.id);assert.equal(f.docs.get('aprobacionesInsumosCotizacion/nuevo').resumen.aprobadoEn,'2026-11-04T12:00:00Z');assert.equal([...f.docs.keys()].filter(k=>k.startsWith('presupuestos/')).length,2);
});
test('cantidades y costos que desbordan el rango numérico no permiten aprobar',()=>{
 const a=catalog();a[0].equivalenciasStock['M²']=1e-300;assert.equal(C.validate([{...row(),cantidad:'1e308'}],a).ok,false);a[0].ultimoCosto=1e308;assert.equal(C.validate([{...row(),cantidad:'1e308',unidad:'UNID',compraPendiente:true}],a).ok,false);
});
test('cambiar materiales aprobados requiere una revisión y conserva el costo original',async()=>{
 const f=dbFixture(),result=await API.approve(f.db,body(),sales);const input=body();input.insumosAnteriores=result.insumosVentas;input.cotizacion.insumosVentas[0].cantidad='1';await assert.rejects(API.approve(f.db,input,sales),/nueva revisión/);assert.equal(f.writes.length,2);
});
test('la aprobación guarda fecha del servidor y los reintentos conservan la primera aprobación',async()=>{
 const f=dbFixture(),input=body(),first=await API.approve(f.db,input,sales,'2026-11-07T01:30:00Z');
 assert.equal(first.fechaAprobacion,'2026-11-07T01:30:00Z');assert.equal(f.docs.get('presupuestos/p').fechaAprobacion,first.fechaAprobacion);
 input.insumosAnteriores=first.insumosVentas;input.cotizacion.fechaAprobacion='2000-01-01';
 const retry=await API.approve(f.db,input,sales,'2026-11-10T15:00:00Z');assert.equal(retry.fechaAprobacion,first.fechaAprobacion);
});
test('sin precio exige habilitación explícita; la excepción se guarda sin fingir un costo cero',async()=>{
 const f=dbFixture(),input=body();f.docs.delete('compras/compra');await assert.rejects(API.approve(f.db,input,sales),/precio de compra/);assert.equal(f.writes.length,0);
 input.cotizacion.aprobarConCostosPendientes=true;const result=await API.approve(f.db,input,sales,'2026-11-06T15:00:00Z'),s=result.insumosVentasAprobados;
 assert.equal(s.totalCosto,null);assert.equal(s.estadoCosto,'pendiente');assert.equal(s.subtotalCostoConocido,0);assert.equal(s.costosPendientes[0].articuloId,'acrilico');assert.equal(s.items[0].costoTotal,null);assert.equal(s.items[0].costoUnitarioStock,null);assert.equal(s.excepcionCostos.usuario,sales.email);assert.equal(s.excepcionCostos.fecha,'2026-11-06T15:00:00Z');assert.equal(f.writes.length,2);
 assert.equal(f.docs.get('presupuestos/p').insumosVentasAprobados.estadoCosto,'pendiente');assert.equal(f.docs.has('compras/compra'),false);
});
test('la excepción no omite revisión, cantidades, unidades, vínculos ni verificación de stock',async()=>{
 for(const variant of ['review','amount','unit','link','stock','permission']){
  const f=dbFixture(),input=body();f.docs.delete('compras/compra');input.cotizacion.aprobarConCostosPendientes=true;
  const r=input.cotizacion.insumosVentas[0];if(variant==='review')r.revisado=false;if(variant==='amount')r.cantidad='';if(variant==='unit')r.unidad='KG';if(variant==='link')r.articuloId='inexistente';if(variant==='stock')f.docs.delete('conteosStock/conteo');
  await assert.rejects(API.approve(f.db,input,variant==='permission'?{email:'pablo.aciar@tizpublicidad.com'}:sales));assert.equal(f.writes.length,0,variant);
 }
 const f=dbFixture(),input=body();f.docs.delete('compras/compra');f.docs.delete('conteosStock/conteo');input.cotizacion.aprobarConCostosPendientes=true;input.cotizacion.insumosVentas[0].compraPendiente=true;assert.equal((await API.approve(f.db,input,sales)).insumosVentasAprobados.estadoCosto,'pendiente');
});
test('precios inválidos, moneda sin convertir y costos fuera de rango siguen bloqueados',async()=>{
 for(const variant of ['zero','currency','unit']){const f=dbFixture(),input=body(),p=f.docs.get('compras/compra');input.cotizacion.aprobarConCostosPendientes=true;if(variant==='zero')p.items[0].precioUnitarioNeto=0;if(variant==='currency')p.moneda='USD';if(variant==='unit')p.items[0].unidad='KG';await assert.rejects(API.approve(f.db,input,sales));assert.equal(f.writes.length,0);}
});
test('costos mixtos conservan subtotal conocido y al completar Compras las nuevas aprobaciones ya no usan excepción',()=>{
 const rows=[row(),{...row(),articuloId:'sin-costo',descripcion:'Tinta',unidad:'UNID',cantidad:'1'}],a={...article(),id:'sin-costo',descripcion:'Tinta'},cat=C.catalog([article(),a],[purchase()],[count(),{...count(),items:[{articuloId:'sin-costo',cantidad:2}]}],[]);
 const snap=C.snapshot(rows,cat,{importe:20000,aprobarConCostosPendientes:true},sales,'2026-11-06T15:00:00Z');assert.equal(snap.totalCosto,null);assert.ok(snap.subtotalCostoConocido>0);assert.equal(snap.costosPendientes.length,1);assert.ok(snap.items[0].costoTotal>0);assert.equal(snap.items[1].costoTotal,null);
 const p={...purchase(100),items:[{articuloId:'sin-costo',cantidad:1,unidad:'UNID',precioUnitarioNeto:100}]},complete=C.catalog([article(),a],[purchase(),p],[count(),{...count(),items:[{articuloId:'sin-costo',cantidad:2}]}],[]),next=C.snapshot(rows,complete,{importe:20000,aprobarConCostosPendientes:true},sales,'2026-11-07T15:00:00Z');assert.ok(next.totalCosto>0);assert.equal(next.excepcionCostos,undefined);assert.equal(snap.totalCosto,null);
});
test('el flujo nace en Cotizaciones, se guarda en la OT y no aparece en el generador de PDF',()=>{
 const sector=fs.readFileSync(require.resolve('../sectorizacionV35.js'),'utf8'),html=fs.readFileSync(require.resolve('../index.html'),'utf8');assert.match(sector,/TIZInsumosCotizacionV1\?\.open\(data,crearNueva\)/);assert.match(sector,/TIZInsumosCotizacionV1\?\.canApprove\(\)/);assert.match(sector,/obra.insumosVentasAprobados=data.insumosVentasAprobados/);assert.match(html,/quote-materials-/);const pdf=html.slice(html.indexOf('window.generarPDF ='),html.indexOf('window.estTab ='));assert.doesNotMatch(pdf,/insumosVentasAprobados|pp-insumos-ventas/);
});
