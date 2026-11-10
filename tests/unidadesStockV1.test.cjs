'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../functions/insumosCotizacionCoreV1'),API=require('../functions/insumosCotizacionApiV1');
test('vinilos de distintos anchos se comparan por m² con el precio propio de cada rollo',()=>{
 const row={cantidad:2,unidad:'UNID',ivaPorcentaje:21},a={id:'angosto',descripcion:'Vinilo angosto',familia:'Lonas y Vinilos',unidad:'UNID',unidadControl:'M²',equivalenciasStock:{'M²':20}},b={...a,id:'ancho',descripcion:'Vinilo ancho',equivalenciasStock:{'M²':30}};
 const small=C.comparablePurchaseCost({...row,precioUnitarioNeto:200},a),large=C.comparablePurchaseCost({...row,precioUnitarioNeto:300},b);
 assert.equal(small.unidadCosto,'M²');assert.equal(small.cantidadCosto,40);assert.equal(large.cantidadCosto,60);assert.equal(small.precioUnitarioCostoNeto,10);assert.equal(large.precioUnitarioCostoNeto,10);assert.equal(small.precioUnitarioCostoConIVA,12.1);assert.equal(large.precioUnitarioCostoConIVA,12.1);
 assert.equal(C.comparablePurchaseCost({...row,precioUnitarioNeto:330},b).precioUnitarioCostoNeto,11);
});
test('una placa conserva costo por unidad de compra aunque el stock se controle por m²',()=>{
 const a={id:'placa',descripcion:'Placa de prueba',unidad:'PLACA',unidadControl:'M²',equivalenciasStock:{'M²':5}},row={articuloId:'placa',cantidad:2,unidad:'PLACA',precioUnitarioNeto:100,ivaPorcentaje:21,cantidadStock:10,unidadStock:'M²'};
 const p=C.comparablePurchaseCost(row,a);assert.equal(p.unidadCosto,'PLACA');assert.equal(p.cantidadCosto,2);assert.equal(p.precioUnitarioCostoNeto,100);assert.equal(p.precioUnitarioCostoConIVA,121);
 const meta=C.catalog([a],[{id:'ultima',fecha:'2026-01-10',proveedor:'Proveedor de prueba',items:[row]}],[],[])[0];assert.equal(meta.ultimoCosto,20);assert.equal(meta.ultimoCostoCompraConIVA,121);assert.equal(meta.unidadCosto,'PLACA');assert.equal(meta.fechaCosto,'2026-01-10');
});
test('última compra usa el costo normalizado y no inventa IVA ausente ni dimensiones',()=>{
 const a={id:'v',descripcion:'Vinilo',unidad:'ROLLO',unidadControl:'M²',equivalenciasStock:{'M²':10}},row={articuloId:'v',cantidad:1,unidad:'ROLLO',precioUnitarioNeto:100};
 const old={id:'old',fecha:'2026-01-01',items:[{...row,precioUnitarioNeto:50,ivaPorcentaje:21}]},last={id:'new',fecha:'2026-01-02',items:[row]},meta=C.catalog([a],[old,last],[],[])[0];assert.equal(meta.ultimoCostoCompraNeto,10);assert.equal(meta.ultimoCostoCompraConIVA,null);assert.match(meta.errorCostoCompra,/IVA/);assert.equal(meta.compraId,'new');
 assert.equal(C.comparablePurchaseCost({...row,totalNeto:100,totalBruto:121},a).precioUnitarioCostoConIVA,12.1);
 assert.throws(()=>C.comparablePurchaseCost(row,{...a,unidadControl:'ROLLO',equivalenciasStock:{}}),/equivalencia/);assert.throws(()=>C.comparablePurchaseCost({...row,moneda:'USD'},a),/ARS/);
});
test('el costo normalizado guardado conserva el área de esa compra al cambiar la configuración',()=>{
 const p=C.comparablePurchaseCost({cantidad:1,unidad:'ROLLO',precioUnitarioNeto:100,ivaPorcentaje:0,unidadCosto:'M²',cantidadCosto:20,cantidadCompraCosto:1,unidadCompraCosto:'ROLLO'},{descripcion:'Vinilo',unidad:'ROLLO',unidadControl:'M²',equivalenciasStock:{'M²':30}});assert.equal(p.cantidadCosto,20);assert.equal(p.precioUnitarioCostoNeto,5);
});
test('placa de madera de 1,83 por 2,75 registra 5,0325 m² y permite comprar por placa',()=>{
 const a={id:'mdf',descripcion:'MDF',unidad:'UNID'},setting=C.unitSetting(a,{unidadCompra:'PLACA',unidadControl:'M²',factor:5.0325,ancho:1.83,largo:2.75,contenidoOriginal:1}),view=C.baseArticle({...a,...setting});assert.equal(C.stockQuantity(1,'PLACA',view),5.0325);assert.equal(C.stockQuantity(2,'PLACA',view),10.065);
 const p=C.comparablePurchaseCost({cantidad:2,unidad:'UNID',precioUnitarioNeto:100,ivaPorcentaje:21},{...a,...setting});assert.equal(p.unidadCosto,'PLACA');assert.equal(p.precioUnitarioCostoConIVA,121);
 const source=fs.readFileSync(require.resolve('../compras.js'),'utf8');assert.match(source,/data-tab="equivalencias"/);assert.match(source,/equivalencias:renderEquivalencias/);assert.match(fs.readFileSync(require.resolve('../unidadesStockV1.js'),'utf8'),/data-preset-wood/);
});

test('guardar una compra agrega el costo comparable sin reemplazar cantidad, precio ni importes de factura',()=>{
 const source=fs.readFileSync(require.resolve('../compras.js'),'utf8'),article={id:'v',descripcion:'Vinilo',unidad:'UNID',unidadControl:'M²',equivalenciasStock:{'M²':20}},invoice={articuloId:'v',cantidad:2,unidad:'UNID',precioUnitarioNeto:200,ivaPorcentaje:21,totalNeto:400,totalBruto:484,cantidadStock:40,unidadStock:'M²'},before=JSON.stringify(invoice),ctx={window:{TIZInsumosCotizacionCoreV1:C},C:{articulos:[article]},cpIngreso:null,rowToItem:()=>invoice};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function cpPurchaseCostFields('),source.indexOf('function cpRefreshPurchaseCost('))+source.slice(source.indexOf('const cpRowToItemLegacy='),source.indexOf('const cpApplyAILegacy=')),ctx);
 const saved=ctx.rowToItem({dataset:{}});assert.equal(saved.precioUnitarioNeto,200);assert.equal(saved.cantidad,2);assert.equal(saved.totalBruto,484);assert.equal(saved.unidadCosto,'M²');assert.equal(saved.precioUnitarioCostoConIVA,12.1);assert.equal(saved.cantidadCosto,40);assert.equal(JSON.stringify(invoice),before);
});
test('esta compra divide el total por el área total y distingue costo neto y con IVA',()=>{
 const article={id:'material',unidad:'ROLLO',unidadControl:'M²',equivalenciasStock:{'M²':50}},row={articuloId:'material',cantidad:2,unidad:'ROLLO',precioUnitarioNeto:100,ivaPorcentaje:21};
 const before=JSON.stringify({article,row}),r=C.purchaseCostPreview(row,article);
 assert.equal(r.cantidadStock,100);assert.equal(r.totalNeto,200);assert.equal(r.totalConIVA,242);assert.equal(r.costoNetoStock,2);assert.equal(r.costoConIVAStock,2.42);assert.equal(JSON.stringify({article,row}),before);
 assert.equal(C.purchaseCostPreview({...row,cantidad:5},article).costoConIVAStock,2.42);
});
test('no toma el precio de otra compra ni inventa IVA o conversiones para el renglón actual',()=>{
 const article={id:'material',unidad:'ROLLO',unidadControl:'M²',equivalenciasStock:{'M²':50}},row={cantidad:1,unidad:'ROLLO',precioUnitarioNeto:100,ivaPorcentaje:0};
 assert.equal(C.purchaseCostPreview(row,article).costoConIVAStock,2);assert.equal(C.purchaseCostPreview({...row,precioUnitarioNeto:0},article).costoConIVAStock,0);
 for(const change of [{cantidad:''},{cantidad:-1},{precioUnitarioNeto:''},{ivaPorcentaje:undefined},{ivaPorcentaje:-1},{unidad:'KG'},{articuloId:'otro'},{cantidad:1e308,precioUnitarioNeto:1e308}])assert.throws(()=>C.purchaseCostPreview({...row,...change},article));
});
test('una compra guardada sin cambios conserva el área registrada al corregir otra equivalencia',()=>{
 const r=C.purchaseCostPreview({cantidad:2,unidad:'ROLLO',precioUnitarioNeto:100,ivaPorcentaje:20,cantidadStock:80,unidadStock:'M²'},{unidad:'ROLLO',unidadControl:'M²',equivalenciasStock:{'M²':100}});
 assert.equal(r.cantidadStock,80);assert.equal(r.costoNetoStock,2.5);assert.equal(r.costoConIVAStock,3);
});
test('Compras envía cantidad, precio neto e IVA del renglón y sólo conserva una conversión anterior si no cambió',()=>{
 const source=fs.readFileSync(require.resolve('../compras.js'),'utf8'),fields={'.i-qty':{value:'2'},'.i-unit':{value:'ROLLO'},'.i-price':{value:'100'},'.i-iva':{value:'21'}},tr={dataset:{articleId:'material'},querySelector:k=>fields[k]},ctx={window:{TIZInsumosCotizacionCoreV1:C},num:Number};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function cpUnitPreviewPurchase('),source.indexOf('function cpRefreshUnitNotices(')),ctx);
 const r=ctx.cpUnitPreviewPurchase(tr);assert.equal(r.precioUnitarioNeto,'100');assert.equal(r.ivaPorcentaje,'21');assert.equal(r.cantidadStock,undefined);
 tr.dataset.stockMovementOriginal=JSON.stringify({articuloId:'material',cantidad:2,unidad:'ROLLO',precio:100,cantidadStock:80,unidadStock:'M²'});assert.equal(ctx.cpUnitPreviewPurchase(tr).cantidadStock,80);
 fields['.i-qty'].value='3';assert.equal(ctx.cpUnitPreviewPurchase(tr).cantidadStock,undefined);
});
test('la aplicación carga el editor de unidades después del núcleo y antes de la interfaz de insumos',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(m=>m[1].split('?')[0]);
 assert.equal(scripts.filter(s=>s==='unidadesStockV1.js').length,1);assert.ok(scripts.indexOf('unidadesStockV1.js')>scripts.indexOf('functions/insumosCotizacionCoreV1.js'));assert.ok(scripts.indexOf('unidadesStockV1.js')<scripts.indexOf('insumosCotizacionV1.js'));
});

test('el editor monta una ventana al abrir desde Compras y muestra un error de conexión sin cerrar la compra',async()=>{
 const source=fs.readFileSync(require.resolve('../unidadesStockV1.js'),'utf8'),mounted=[],loading=[];
 const element=()=>({innerHTML:'',setAttribute(k,v){this[k]=v;},querySelector(){return {};},remove(){this.removed=true;}}),window={TIZInsumosCotizacionCoreV1:C,insumosCotizacionApiV1:async request=>{loading.push(request);throw Error('Conexión de prueba no disponible');}},document={createElement:element,head:{append(){}},body:{append:el=>mounted.push(el)}};
 vm.runInNewContext(source,{window,document});assert.equal(typeof window.TIZUnidadesStockV1.open,'function');
 await window.TIZUnidadesStockV1.open('vinilo',{unidadCompra:'ROLLO'});assert.equal(mounted.length,1);assert.equal(mounted[0].role,'dialog');assert.equal(loading[0].mode,'units-read');assert.equal(loading[0].articuloId,'vinilo');assert.match(mounted[0].innerHTML,/Conexión de prueba no disponible/);assert.equal(mounted[0].removed,undefined);
 window.TIZUnidadesStockV1.close();assert.equal(mounted[0].removed,true);
});
const raw=()=>({id:'vinilo',codigo:'v1',descripcion:'Vinilo 1,37 x 50 m',unidad:'ROLLO',stockMinimo:1,control:'estrategico',equivalenciasStock:{'M²':68.5}});
const controlled=()=>({...raw(),unidadControl:'M²'});
const purchases=()=>[{id:'p',fecha:'2026-11-03',destino:'Stock',proveedor:'Proveedor',items:[{articuloId:'vinilo',cantidad:2,unidad:'ROLLO',precioUnitarioNeto:68500}]}];
const counts=()=>[{fecha:'2026-11-01',items:[{articuloId:'vinilo',cantidad:1}]}];
const plan=()=>[{estado:'abierto',items:[{articuloId:'vinilo',cantidadPlanificada:5,unidad:'M²'}]}];
test('compra por rollo, saldo y consumo en m²: 1 rollo=68,5; 2 rollos ingresan 137; se reservan 5 m²',()=>{
 const a=controlled(),m=C.catalog([a],purchases(),counts(),plan())[0];assert.equal(m.unidad,'M²');assert.equal(m.unidadOrigen,'ROLLO');assert.equal(m.stockFisico,205.5);assert.equal(m.stockDisponible,200.5);assert.equal(m.ultimoCosto,1000);assert.equal(m.stockMinimo,68.5);
 const r=C.validate([{articuloId:'vinilo',cantidad:5,unidad:'M²',revisado:true}], [m]);assert.equal(r.ok,true);assert.equal(r.items[0].cantidadStock,5);assert.equal(r.total,5000);assert.equal(C.movementQuantity({cantidad:2,unidad:'ROLLO'},a),137);
});
test('los conteos anteriores en rollos y los nuevos en m² no se multiplican dos veces',()=>{
 const list=counts().concat({fecha:'2026-11-04',items:[{articuloId:'vinilo',cantidad:63.5,unidad:'M²'}]});const m=C.catalog([controlled()],purchases(),list,[])[0];assert.equal(m.stockFisico,63.5);assert.equal(m.stockDisponible,63.5);assert.equal(C.movementQuantity(counts()[0].items[0],controlled()),68.5);
});
test('planes antiguos en rollos y nuevos en m² se comparan en la misma unidad',()=>{
 const plans=plan().concat({estado:'abierto',items:[{articuloId:'vinilo',cantidadPlanificada:1,unidad:'ROLLO'}]});const m=C.catalog([controlled()],purchases(),counts(),plans)[0];assert.equal(m.reservado,73.5);assert.equal(m.stockDisponible,132);
});
test('la conversión guardada en una compra conserva su ingreso real aunque luego se corrija el criterio',()=>{
 const a={...controlled(),equivalenciasStock:{'M²':76}},p=purchases();p[0].items[0]={...p[0].items[0],cantidadStock:137,unidadStock:'M²',factorStock:68.5};const m=C.catalog([a],p,counts(),[])[0];assert.equal(m.ultimoCosto,1000);assert.equal(m.stockFisico,213);assert.equal(p[0].items[0].cantidad,2);assert.equal(p[0].items[0].precioUnitarioNeto,68500);
});
test('cada presentación requiere criterio confirmado y medidas coherentes',()=>{
 const setting=C.unitSetting(raw(),{unidadControl:'M²',factor:'68,5',ancho:'1,37',largo:'50'});assert.equal(setting.unidadControl,'M²');assert.equal(setting.equivalenciasStock['M²'],68.5);assert.equal(setting.medidasPresentacion.anchoMetros,1.37);assert.equal(C.baseArticle({...raw(),...setting}).unidad,'M²');
 for(const input of [{unidadControl:'M²',factor:685,ancho:1.37,largo:50},{unidadControl:'M²',factor:0},{unidadControl:'M²',factor:68.5,ancho:1.37},{unidadControl:'ROLLO',factor:68.5}])assert.throws(()=>C.unitSetting(raw(),input));
 const invalid={...raw(),unidadControl:'M²',equivalenciasStock:{}};const m=C.catalog([invalid],purchases(),counts(),[])[0];assert.equal(m.stockDisponible,null);assert.match(m.errorStock,/equivalencia/);assert.equal(C.validate([{articuloId:'vinilo',cantidad:5,unidad:'M²',revisado:true,compraPendiente:true}],[m]).ok,false);
});
test('otras presentaciones usan la misma regla: placas a m² y cajas a unidades',()=>{
 const plate={unidad:'PLACA',unidadControl:'M²',equivalenciasStock:{'M²':2.9768}};assert.equal(C.movementQuantity({cantidad:1,unidad:'PLACA'},plate),2.9768);assert.equal(C.stockQuantity(.5,'M²',C.baseArticle(plate)),.5);
 const box={unidad:'CAJA',unidadControl:'UNID',equivalenciasStock:{UNID:100}};assert.equal(C.movementQuantity({cantidad:2,unidad:'CAJA'},box),200);assert.equal(C.stockQuantity(5,'UNID',C.baseArticle(box)),5);
});
test('también se compra en rollos cuando el catálogo ya está cargado directamente en m²',()=>{
 const a={id:'vinilo',unidad:'M²',control:'estrategico',equivalenciasStock:{}},setting=C.unitSetting(a,{unidadCompra:'ROLLO',unidadControl:'M²',factor:68.5,ancho:1.37,largo:50}),configured={...a,...setting};assert.equal(configured.unidad,'M²');assert.equal(configured.unidadCompraPreferida,'ROLLO');assert.equal(C.movementQuantity({cantidad:1,unidad:'ROLLO'},configured),68.5);assert.equal(C.movementQuantity({cantidad:5,unidad:'M²'},configured),5);
 const m=C.catalog([configured],purchases(),[{fecha:'2026-11-01',items:[{articuloId:'vinilo',cantidad:10,unidad:'M²'}]}],[])[0];assert.equal(m.stockFisico,147);assert.equal(m.ultimoCosto,1000);
});
test('una unidad original desconocida requiere confirmar su relación, y las unidades métricas tienen escala fija',()=>{
 const a={unidad:'UNID'};assert.throws(()=>C.unitSetting(a,{unidadCompra:'ROLLO',unidadControl:'M²',factor:68.5}),/registros anteriores/);const setting=C.unitSetting(a,{unidadCompra:'ROLLO',unidadControl:'M²',factor:68.5,contenidoOriginal:1});assert.equal(C.movementQuantity({cantidad:1,unidad:'UNID'},{...a,...setting}),68.5);assert.equal(C.movementQuantity({cantidad:1,unidad:'ROLLO'},{...a,...setting}),68.5);assert.throws(()=>C.unitSetting({unidad:'KG'},{unidadCompra:'KG',unidadControl:'G',factor:500}),/relación fija/);
});
test('criterios duplicados M2 / m² no se eligen silenciosamente; confirmar normaliza el criterio',()=>{
 const a={...raw(),equivalenciasStock:{M2:60,'M²':68.5}};assert.throws(()=>C.stockQuantity(5,'M²',a),/duplicadas/);const setting=C.unitSetting(a,{unidadControl:'M²',factor:68.5});assert.deepEqual(setting.equivalenciasStock,{'M²':68.5});assert.equal(C.movementQuantity({cantidad:1,unidad:'ROLLO'},{...a,...setting}),68.5);
});
function fixture(){
 const docs=new Map([['articulosCompra/vinilo',raw()],...purchases().map(p=>['compras/'+p.id,p]),['conteosStock/c',counts()[0]],['planesMateriales/pl',plan()[0]]]),writes=[];let serial=0;
 const snap=ref=>({exists:docs.has(ref.path),data:()=>structuredClone(docs.get(ref.path))});
 const ref=path=>({path,id:path.split('/').at(-1),get:async()=>snap({path}),collection:name=>collection(path+'/'+name)});
 const collection=name=>({doc:id=>ref(name+'/'+(id||'auto'+(++serial))),get:async()=>({docs:[...docs].filter(([p])=>p.startsWith(name+'/')&&p.slice(name.length+1).indexOf('/')<0).map(([p,v])=>({id:p.split('/').at(-1),data:()=>structuredClone(v)}))})});
 const db={collection,runTransaction:async action=>{let written=false;const staged=[];const result=await action({get:async ref=>{assert.equal(written,false);return snap(ref);},update:(ref,data)=>{written=true;staged.push({ref,data,merge:true});},set:(ref,data)=>{written=true;staged.push({ref,data});}});for(const w of staged){docs.set(w.ref.path,w.merge?{...docs.get(w.ref.path),...structuredClone(w.data)}:structuredClone(w.data));writes.push(w);}return result;}};return {db,docs,writes};
}
const user={email:'carolina.flores@tizpublicidad.com'},body=()=>({articuloId:'vinilo',unidadOrigen:'ROLLO',unidadControl:'M²',factor:68.5,ancho:1.37,largo:50});
test('el cálculo previo no escribe y guardar sólo cambia el criterio y su auditoría',async()=>{
 const f=fixture(),before=JSON.stringify([...f.docs]);const preview=await API.stockUnits(f.db,{...body(),mode:'quote-materials-units-preview'},user);assert.equal(f.writes.length,0);assert.equal(JSON.stringify([...f.docs]),before);assert.equal(preview.resumen.unidad,'M²');assert.equal(preview.resumen.stockFisico,205.5);
 const result=await API.stockUnits(f.db,{...body(),mode:'quote-materials-units-save',version:preview.version},user);assert.equal(result.articulo.unidad,'ROLLO');assert.equal(result.articulo.unidadControl,'M²');assert.equal(f.writes.length,2);assert.ok(f.writes.every(w=>w.ref.path.startsWith('articulosCompra/vinilo')));assert.equal(f.docs.get('compras/p').items[0].cantidad,2);assert.equal(f.docs.get('conteosStock/c').items[0].cantidad,1);
});
test('conflictos, unidades originales distintas y usuarios sin permiso no cambian el criterio',async()=>{
 for(const variant of ['version','origin','role']){const f=fixture(),input={...body(),mode:'quote-materials-units-save',version:API.unitVersion(raw())};if(variant==='version')input.version='vieja';if(variant==='origin')input.unidadOrigen='UNID';await assert.rejects(API.stockUnits(f.db,input,variant==='role'?{email:'arielbenitezpublicidad@gmail.com'}:user));assert.equal(f.writes.length,0);assert.equal(f.docs.get('articulosCompra/vinilo').unidadControl,undefined);}
});
test('vincular una factura no convierte 1 rollo en 1 m² ni altera sus importes',()=>{
 const source=fs.readFileSync(require.resolve('../compras.js'),'utf8'),fields=Object.fromEntries(['.i-desc','.i-code','.i-family','.i-subfamily','.i-unit','.cp-item-match'].map(k=>[k,{value:k==='.i-unit'?'ROLLO':''}])),tr={dataset:{},querySelector:k=>fields[k]};
 const context={window:{},C:{articulos:[]},num:Number,document:{},esc:String};vm.createContext(context);const start=source.indexOf('function cpRefreshItemText('),end=source.indexOf('function matchRowArticle(',start);vm.runInContext(source.slice(start,end),context);context.applyArticleToRow(tr,{id:'vinilo',descripcion:'Vinilo',unidad:'M²'});assert.equal(fields['.i-unit'].value,'ROLLO');assert.equal(tr.dataset.articleId,'vinilo');
});
