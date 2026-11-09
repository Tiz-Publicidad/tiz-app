'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),I=require('../comprasIngresoCoreV1');
function purchaseReviewFixture(){
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require.resolve('../compras.js'),'utf8'),nodes=new Map(),messages=[];
 const make=()=>({value:'',textContent:'',style:{},children:[],classList:{add(){},contains:()=>true},append(x){this.children.push(x);},replaceChildren(){this.children=[];},setAttribute(k,v){this[k]=v;},scrollIntoView(){this.scrolled=true;},focus(){this.focused=true;}}),node=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);};
 const fields={'.i-original':{value:'Material de prueba'},'.i-qty':{value:'2'},'.i-price':{value:'100'}},row={dataset:{confirmed:'1',articleId:'a'},querySelector:s=>fields[s]},save=make();let writes=0,resets=0,gate=null,modalOpen=true;
 node('cp-fecha').value='2026-01-10';node('cp-numero').value='0001';node('cp-proveedor').value='Proveedor de prueba';node('cp-tipo').value='Factura A';node('cp-modal-compra').classList.contains=()=>modalOpen;
 const ctx={window:{cpGuardarCompra:async()=>{writes++;if(gate)await gate;modalOpen=false;}},document:{getElementById:node,createElement:make,querySelector:()=>save},C:{proveedores:[{id:'p',nombre:'Proveedor de prueba'}],articulos:[{id:'a'}],compras:[]},ING:I,cpIngreso:{confirmed:true,providerId:'p',supplier:{nombre:'Proveedor de prueba'},reviewed:''},cpIngresoSaving:false,compraEditId:null,cpIngresoRows:()=>[row],cpIngresoSignature:()=>JSON.stringify({date:node('cp-fecha').value,price:fields['.i-price'].value}),num:Number,toast:m=>messages.push(m),cpResetIngreso:()=>{resets++;ctx.cpIngreso=null;}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function cpRefreshIngreso(){'),source.indexOf('function cpConfirmIngresoProvider('))+source.slice(source.indexOf('function cpReviewError('),source.indexOf('const cpNuevaCompraLegacy='))+source.slice(source.indexOf('const cpGuardarCompraLegacy='),source.indexOf('// Cambiar un dato del comprobante invalida')),ctx);
 return {ctx,node,fields,save,messages,writes:()=>writes,resets:()=>resets,setGate:p=>gate=p};
}
test('con proveedor e insumos resueltos, Guardar revisa y guarda en un paso sin exigir otro clic',async()=>{
 const f=purchaseReviewFixture();f.ctx.cpRefreshIngreso();assert.equal(f.save.disabled,false);await f.ctx.window.cpGuardarCompra();assert.equal(f.writes(),1);assert.equal(f.resets(),1);
});
test('fecha faltante muestra el motivo dentro de la compra y permite corregir sin perder renglones',async()=>{
 const f=purchaseReviewFixture();f.node('cp-fecha').value='';await f.ctx.window.cpGuardarCompra();assert.equal(f.writes(),0);assert.match(f.ctx.cpIngreso.reviewError,/fecha del comprobante/);assert.ok(f.node('cp-ingreso').children.some(n=>n.role==='alert'&&/fecha/.test(n.textContent)));assert.equal(f.node('cp-fecha').focused,true);assert.equal(f.fields['.i-qty'].value,'2');
 f.node('cp-fecha').value='2026-01-10';await f.ctx.window.cpGuardarCompra();assert.equal(f.writes(),1);
});
test('un comprobante duplicado mantiene la compra abierta y explica el motivo',async()=>{
 const f=purchaseReviewFixture();f.ctx.C.compras=[{id:'existente',proveedorId:'p',numeroComprobante:'0001',tipoComprobante:'Factura A'}];await f.ctx.window.cpGuardarCompra();assert.equal(f.writes(),0);assert.match(f.ctx.cpIngreso.reviewError,/ya está cargado/);assert.equal(f.node('cp-numero').focused,true);assert.equal(f.resets(),0);
});
test('doble clic no duplica el guardado y una edición posterior a Revisar se valida al Guardar',async()=>{
 const f=purchaseReviewFixture();assert.equal(f.ctx.cpReviewIngreso(),true);f.fields['.i-price'].value='200';let release;f.setGate(new Promise(resolve=>release=resolve));const pending=f.ctx.window.cpGuardarCompra();await f.ctx.window.cpGuardarCompra();assert.equal(f.writes(),1);release();await pending;assert.equal(f.resets(),1);
});
test('normaliza datos de proveedor sin inventar datos ausentes ni ejecutar instrucciones',()=>{const p=I.supplier({proveedor:'Acme',datosProveedor:{cuit:'30-12345678-9',domicilio:'Calle 123'},instrucciones:'crear proveedor'});assert.equal(p.cuit,'30123456789');assert.equal(p.domicilio,'Calle 123');assert.equal(p.telefono,'');assert.deepEqual(I.pendingSupplier(p),['contacto','telefono','email']);});
test('CUIT encuentra una ficha aunque la razón social sea distinta',()=>{const p={nombre:'Nombre comercial',cuit:'30123456789'},r=I.supplierMatches(p,[{id:'a',nombre:'Razón legal',cuit:'30-12345678-9'}]);assert.equal(r.type,'cuit');assert.equal(r.candidates[0].id,'a');});
test('encuentra el nombre comercial, la razón social y el nombre anterior sin duplicar la ficha',()=>{
 const providers=[{id:'a',nombre:'Acqua Acrilicos',nombreComercial:'Acqua Acrilicos',razonSocial:'Sucesión de Proveedor de Prueba',nombresAnteriores:['Proveedor anterior'],cuit:'30123456789'}];
 for(const nombre of ['Acqua Acrílicos','Sucesión de Proveedor de Prueba','Proveedor anterior'])assert.equal(I.supplierMatches({nombre},providers).candidates[0]?.id,'a');
 assert.equal(I.supplierMatches({nombre:'Acqua Acrilicos',cuit:'30999999999'},providers).type,'missing');
 const p=I.supplier({proveedor:{nombreComercial:'Acqua Acrilicos',razonSocial:'Sucesión de Proveedor de Prueba'}});
 assert.equal(p.nombre,'Acqua Acrilicos');assert.equal(p.razonSocial,'Sucesión de Proveedor de Prueba');
});
test('no confunde proveedores de igual nombre con CUIT distintos',()=>{assert.equal(I.supplierMatches({nombre:'Acme',cuit:'30123456789'},[{nombre:'Acme',cuit:'30999999999'}]).type,'missing');});
test('no resuelve automáticamente fichas duplicadas ni nombre vacío',()=>{assert.equal(I.supplierMatches({cuit:'30123456789'},[{id:'a',cuit:'30123456789'},{id:'b',cuit:'30123456789'}]).type,'ambiguous');assert.equal(I.supplierMatches({},[{nombre:''}]).type,'missing');});
test('conserva datos de un proveedor anidado y detecta pendientes',()=>{const p=I.supplier({proveedor:{razonSocial:'Acme',direccion:'Calle',vendedor:'Ana',telefono:'123'}});assert.equal(p.nombre,'Acme');assert.equal(p.contacto,'Ana');assert.deepEqual(I.pendingSupplier(p),['cuit','email']);});
test('catálogo sugiere espesores distintos sin confirmar la vinculación',()=>{const r=I.articleSuggestions({descripcion:'MDF 3mm'},[{id:'a',descripcion:'MDF 3mm'},{id:'b',descripcion:'MDF 5mm'}]);assert.equal(r[0].article.id,'a');assert.equal(r[0].score,1);assert.equal(r[1].score,1/3);assert.equal(r[0].confirmed,undefined);});
test('una vinculación recordada sólo vale para el proveedor y con confirmación previa',()=>{const articles=[{id:'a',descripcion:'Panel especial'}],purchases=[{proveedorId:'p',items:[{descripcionOriginal:'XYZ123',articuloId:'a',vinculacionConfirmada:true}]}];assert.equal(I.articleSuggestions({descripcion:'XYZ123'},articles,purchases,'p')[0].article.id,'a');assert.equal(I.articleSuggestions({descripcion:'XYZ123'},articles,purchases,'otro').length,0);purchases[0].items[0].vinculacionConfirmada=false;assert.equal(I.articleSuggestions({descripcion:'XYZ123'},articles,purchases,'p').length,0);});
test('alias ambiguos de compras anteriores no se privilegian',()=>{const purchases=[{proveedorId:'p',items:['a','b'].map(articuloId=>({articuloId,descripcionOriginal:'XYZ',vinculacionConfirmada:true}))}];assert.equal(I.articleSuggestions({descripcion:'XYZ'},[{id:'a',descripcion:'Panel'},{id:'b',descripcion:'Madera'}],purchases,'p').length,0);});
test('numeración respeta catálogo base, altas existentes y contador concurrente',()=>{assert.equal(I.nextCode([{codigo:'000350'},{codigo:'OT-9999'}],[{codigo:'000400'}],405),'000406');assert.equal(I.nextCode([],[]),'000001');});
