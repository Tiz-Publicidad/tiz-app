'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../functions/insumosCotizacionCoreV1'),API=require('../functions/insumosCotizacionApiV1');
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
 for(const variant of ['version','origin','role']){const f=fixture(),input={...body(),mode:'quote-materials-units-save',version:API.unitVersion(raw())};if(variant==='version')input.version='vieja';if(variant==='origin')input.unidadOrigen='UNID';await assert.rejects(API.stockUnits(f.db,input,variant==='role'?{email:'pablo.aciar@tizpublicidad.com'}:user));assert.equal(f.writes.length,0);assert.equal(f.docs.get('articulosCompra/vinilo').unidadControl,undefined);}
});
test('vincular una factura no convierte 1 rollo en 1 m² ni altera sus importes',()=>{
 const source=fs.readFileSync(require.resolve('../compras.js'),'utf8'),fields=Object.fromEntries(['.i-desc','.i-code','.i-family','.i-subfamily','.i-unit','.cp-item-match'].map(k=>[k,{value:k==='.i-unit'?'ROLLO':''}])),tr={dataset:{},querySelector:k=>fields[k]};
 const context={window:{},C:{articulos:[]},num:Number,document:{},esc:String};vm.createContext(context);const start=source.indexOf('function cpRefreshItemText('),end=source.indexOf('function matchRowArticle(',start);vm.runInContext(source.slice(start,end),context);context.applyArticleToRow(tr,{id:'vinilo',descripcion:'Vinilo',unidad:'M²'});assert.equal(fields['.i-unit'].value,'ROLLO');assert.equal(tr.dataset.articleId,'vinilo');
});
