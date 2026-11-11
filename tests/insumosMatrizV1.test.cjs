'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../insumosMatrizV1'),C=require('../functions/insumosCotizacionCoreV1');
const material=()=>({articuloId:'acrilico',descripcion:'Acrílico cristal 3 mm',cantidad:'',unidad:'M²',revisado:true});
const catalog=[{id:'acrilico',unidad:'PLACA',equivalenciasStock:{'M²':2.9768},ultimoCosto:137280,monedaCosto:'ARS'}];
test('suma insumos compartidos y aplica la equivalencia una sola vez por renglón',()=>{
 const materials=[material()],sales=[{desc:'Corpóreo Grupo GAG',cant:1},{desc:'Otra placa',cant:2}],m=M.create(materials,sales);
 m.set(sales[0],0,'0,09');m.set(sales[1],0,'0,18');m.totals(sales);assert.equal(materials[0].cantidad,'0.27');assert.equal(materials[0].revisado,false);
 assert.ok(Math.abs(m.cost(sales[0],catalog,C).total-4150.497178177909)<1e-8);assert.ok(Math.abs(m.cost(sales[1],catalog,C).total-8300.994356355818)<1e-8);
 m.setIndex(sales[1],'2,7');const p=m.cost(sales[1],catalog,C);assert.equal(p.suggested,22412.68);assert.equal(p.unitPrice,11206.34);assert.equal(sales[1].precio,undefined);
});
test('preserva los totales anteriores sin atribuirlos a un trabajo arbitrario',()=>{
 const materials=[{...material(),cantidad:'3'}],sales=[{desc:'A',cant:1},{desc:'B',cant:1}],m=M.create(materials,sales);
 assert.equal(m.hasCommon(),true);assert.equal(m.get(null,0),'3');assert.equal(m.get(sales[0],0),'');m.setIndex(sales[0],'2');m.set(sales[0],0,'1');assert.equal(m.cost(sales[0],catalog,C).suggested,null);
 m.set(null,0,'');m.totals(sales);assert.equal(materials[0].cantidad,'1');assert.equal(m.hasCommon(),false);
});
test('una cotización anterior de un solo renglón conserva sus consumos',()=>{
 const materials=[{...material(),cantidad:'0.09'}],sales=[{desc:'A',cant:1}],m=M.create(materials,sales);assert.equal(m.get(sales[0],0),'0.09');assert.equal(m.hasCommon(),false);
});
test('guardar y reabrir conserva distribución, índices, consumos comunes y total plano',()=>{
 const materials=[material()],sales=[{desc:'A',cant:1},{desc:'B',cant:2}],m=M.create(materials,sales);m.set(sales[0],0,'1');m.set(sales[1],0,'2');m.set(null,0,'0.5');m.setIndex(sales[0],'2.7');
 const saved=m.exportItems(sales),flat=C.draft(materials),reopened=sales.map(s=>({...s})),restored=M.create(flat,reopened,saved);restored.totals(reopened);
 assert.equal(flat[0].cantidad,'3.5');assert.equal(restored.get(reopened[0],0),'1');assert.equal(restored.get(reopened[1],0),'2');assert.equal(restored.get(null,0),'0.5');assert.equal(restored.index(reopened[0]),'2.7');
 assert.equal(saved[0].precio,undefined);assert.equal(saved[0].cant,1);
});
test('agregar, reordenar y quitar trabajos o columnas no mezcla cantidades',()=>{
 const a={desc:'A',cant:1},b={desc:'B',cant:1},materials=[material()],m=M.create(materials,[a,b]);m.set(a,0,'1');m.set(b,0,'2');m.totals([b,a]);assert.equal(m.get(b,0),'2');
 const fresh=material();materials.unshift(fresh);m.totals([b,a]);assert.equal(m.get(b,0),'');assert.equal(m.get(b,1),'2');m.set(b,0,'4');materials.splice(1,1);m.totals([b,a]);assert.equal(materials[0].cantidad,'4');
 m.sync([a]);assert.equal(m.get(null,0),'4');assert.equal(m.hasCommon(),true);
});
test('cantidades e índices inválidos o precios sin resolver no producen un precio sugerido',()=>{
 for(const value of ['-1','abc','Infinity']){const rows=[material()],sale={desc:'A',cant:1},m=M.create(rows,[sale]);m.set(sale,0,value);m.setIndex(sale,'2');m.totals([sale]);assert.equal(rows[0].cantidad,'');assert.equal(m.cost(sale,catalog,C).unitPrice,null);}
 const rows=[material()],sale={desc:'A',cant:0},m=M.create(rows,[sale]);m.set(sale,0,'1');m.setIndex(sale,'2');assert.equal(m.cost(sale,catalog,C).unitPrice,null);sale.cant=1;
 for(const factor of ['','0','-1','abc']){m.setIndex(sale,factor);assert.equal(m.cost(sale,catalog,C).unitPrice,null);}m.setIndex(sale,'2');assert.equal(m.cost(sale,[],C).unitPrice,null);
});
test('cambiar de material no recupera asignaciones de otro insumo por el índice',()=>{
 const sale={desc:'A',cant:1},rows=[material()],m=M.create(rows,[sale]);m.set(sale,0,'2');const saved=m.exportItems([sale]),fresh={...material(),articuloId:'otro'},reopen=M.create([fresh],[sale],saved);assert.equal(reopen.get(sale,0),'');
});
test('vincular el mismo insumo con la misma unidad une columnas sin perder consumos',()=>{
 const sale={desc:'Trabajo',cant:1},rows=[material(),material()],m=M.create(rows,[sale]);m.set(sale,0,'1.5');m.set(sale,1,'2');m.set(null,1,'0.5');assert.equal(m.merge(1,0),true);m.totals([sale]);assert.equal(rows.length,1);assert.equal(m.get(sale,0),'3.5');assert.equal(m.get(null,0),'0.5');assert.equal(rows[0].cantidad,'4');
});
test('el total sugerido coincide con el precio unitario redondeado que se aplica a la venta',()=>{
 const sale={desc:'Tres piezas',cant:3},rows=[material()],m=M.create(rows,[sale]);m.set(sale,0,'0.09');m.setIndex(sale,'2.7');const price=m.cost(sale,catalog,C);assert.equal(price.suggested,Math.round(price.unitPrice*3*100)/100);
});
