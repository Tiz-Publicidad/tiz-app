'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const service=fs.readFileSync(path.join(__dirname,'../services/tizComprasIA.gs'),'utf8');
const valid={descripcionOriginal:'Imanes Neodimio 20x2mm X 10 Unid',cantidad:4,precioUnitarioNeto:15033.06,ivaPorcentaje:21};
function read(items){
 const context={PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test'})},UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({proveedor:{nombre:'ALL BIJOU SRL'},fecha:'2026-11-10',numeroComprobante:'0025-00001363',items,totalComprobante:72760})}]}}]})})}};
 vm.createContext(context);vm.runInContext(service,context);return context.tizLeerComprobante_({filename:'factura.pdf',dataBase64:'dGVzdA=='});
}
test('el envío de cero con guiones no descarta el producto ni los datos de cabecera',()=>{
 const data=read([valid,{descripcionOriginal:'Costo Envio',cantidad:null,precioUnitarioNeto:null,ivaPorcentaje:0}]);
 assert.equal(data.items.length,1);assert.equal(data.items[0].cantidad,4);assert.equal(data.items[0].descripcion,valid.descripcionOriginal);assert.equal(data.proveedor.nombre,'ALL BIJOU SRL');assert.equal(data.fecha,'2026-11-10');assert.equal(data.totalComprobante,72760);
 assert.equal(data.itemsNoLeidos[0].renglon,2);assert.equal(data.itemsNoLeidos[0].descripcionOriginal,'Costo Envio');
});
test('valida todos los renglones y conserva sus índices originales',()=>{
 const data=read([{...valid,cantidad:0},valid,{...valid,precioUnitarioNeto:-1},{...valid,ivaPorcentaje:null},null]);
 assert.equal(data.items.length,1);assert.deepEqual(Array.from(data.itemsNoLeidos,x=>x.renglon),[1,3,4,5]);
});
test('sin renglones completos no ofrece una carga vacía ni inventa importes',()=>{
 assert.throws(()=>read([{...valid,cantidad:null}]),/ningún renglón completo/);
});
test('una factura completamente legible conserva todos sus ítems',()=>{
 const data=read([valid,{...valid,precioUnitarioNeto:0}]);assert.equal(data.items.length,2);assert.equal(data.itemsNoLeidos.length,0);
});
const src=fs.readFileSync(path.join(__dirname,'../compras.js'),'utf8');
function review(total,expected){
 let message='';const row={querySelector:selector=>({value:selector==='.i-original'?'Imanes':selector==='.i-qty'?'4':'15033.06'}),dataset:{confirmed:'1',articleId:'a'}};
 const context={cpIngreso:{confirmed:true,providerId:'p',renglonesOmitidos:[{renglon:2}],totalComprobante:expected},cpIngresoRows:()=>[row],C:{articulos:[{id:'a'}],compras:[]},rowToItem:()=>({totalBruto:total}),num:Number,money:String,cpReviewError:m=>{message=m;return false;},cpIngresoSignature:()=> 'ok',cpRefreshIngreso(){},document:{getElementById:id=>({value:id==='cp-fecha'?'2026-11-10':''})}};
 vm.createContext(context);vm.runInContext(src.slice(src.indexOf('function cpReviewIngreso(){'),src.indexOf('const cpNuevaCompraLegacy=')),context);return {ok:context.cpReviewIngreso(),get message(){return message;}};
}
test('permite envío sin cargo con la tolerancia de redondeo, bloquea importes faltantes',()=>{
 assert.equal(review(72760.01,72760).ok,true);const bad=review(72760,73760);assert.equal(bad.ok,false);assert.match(bad.message,/no coincide/);
 assert.equal(review(72760,null).ok,false);
});
