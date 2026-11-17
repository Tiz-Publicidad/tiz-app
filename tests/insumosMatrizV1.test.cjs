'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../insumosMatrizV1'),C=require('../functions/insumosCotizacionCoreV1');
const material=()=>({articuloId:'acrilico',descripcion:'Acrílico cristal 3 mm',cantidad:'',unidad:'M²',revisado:true});
const catalog=[{id:'acrilico',unidad:'PLACA',equivalenciasStock:{'M²':2.9768},ultimoCosto:137280,monedaCosto:'ARS'}];

test('precio manual por m² reemplaza al sugerido y no vuelve a dividir por el área de la placa',()=>{
 const materials=[{...material(),precioPrevisto:'50000'}],sales=[{desc:'Cartel',cant:2}],m=M.create(materials,sales);
 m.set(sales[0],0,'0,09');m.setIndex(sales[0],'2');assert.equal(m.cost(sales[0],catalog,C).total,4500);assert.equal(m.cost(sales[0],catalog,C).suggested,9000);assert.equal(m.cost(sales[0],[],C).unitPrice,4500);
 materials[0].precioPrevisto='no';assert.equal(m.cost(sales[0],catalog,C).total,null);
 delete materials[0].precioPrevisto;assert.ok(Math.abs(m.cost(sales[0],catalog,C).total-4150.497178177909)<1e-8);
});

test('no fusiona insumos compartidos con distintos precios previstos',()=>{
 const materials=[{...material(),precioPrevisto:'100'},{...material(),precioPrevisto:'200'}],sales=[{cant:1}],m=M.create(materials,sales);
 m.set(sales[0],0,'1');m.set(sales[0],1,'2');assert.equal(m.merge(1,0),false);assert.equal(m.cost(sales[0],[],C).total,500);
});
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


test('consumos por unidad de 10, 23 y 20 piezas suman 17,65 m² y conservan el costo y la venta unitarios',()=>{
 const sales=[{desc:'90x60',cant:10,precio:45760},{desc:'60x60',cant:23,precio:25420},{desc:'20x10',cant:20,precio:2500}],rows=[{...material(),precioPrevisto:'10000'}],m=M.create(rows,sales,[],{defaultBasis:'unidad'});[.65,.45,.04].forEach((q,i)=>{m.set(sales[i],0,q);m.setIndex(sales[i],'2,7');});m.totals(sales);assert.equal(rows[0].cantidad,'17.65');assert.deepEqual(sales.map(s=>m.cost(s,[],C).unitCost),[6500,4500,400]);assert.deepEqual(sales.map(s=>m.cost(s,[],C).total),[65000,103500,8000]);assert.deepEqual(sales.map(s=>m.cost(s,[],C).unitPrice),[17550,12150,1080]);assert.deepEqual(sales.map(s=>s.precio),[45760,25420,2500]);
 m.totals(sales);assert.equal(rows[0].cantidad,'17.65');sales[0].cant=20;m.totals(sales);assert.equal(rows[0].cantidad,'24.15');assert.equal(m.cost(sales[0],[],C).unitCost,6500);
});

test('guardar y reabrir modo unitario no vuelve a multiplicar los totales ya guardados',()=>{
 const item={desc:'Diez piezas',cant:10,precio:45760},rows=[{...material(),precioPrevisto:'10000'}],m=M.create(rows,[item],[],{defaultBasis:'unidad'});m.set(item,0,'.65');m.setIndex(item,'2.7');const saved=m.exportItems([item]),flat=C.draft(rows),reopened=[{...item}],restored=M.create(flat,reopened,saved,{defaultBasis:'unidad'});assert.equal(saved[0].insumosMatrizV1.version,2);assert.equal(restored.basis(),'unidad');assert.equal(restored.get(reopened[0],0),'.65');restored.totals(reopened);assert.equal(flat[0].cantidad,'6.5');assert.equal(restored.cost(reopened[0],[],C).unitCost,6500);assert.equal(restored.index(reopened[0]),'2.7');restored.exportItems(reopened);assert.equal(flat[0].cantidad,'6.5');
});

test('matrices anteriores conservan totales; cambiar explícitamente a unidad interpreta las necesidades como unitarias',()=>{
 const item={desc:'A',cant:10},rows=[{...material(),precioPrevisto:'10000'}],old=M.create(rows,[item]);old.set(item,0,'.65');const saved=old.exportItems([item]);for(const it of saved){it.insumosMatrizV1.version=1;delete it.insumosMatrizV1.baseNecesidad;}const flat=C.draft(rows),m=M.create(flat,[item],saved,{defaultBasis:'unidad'});assert.equal(m.basis(),'total');m.totals([item]);assert.equal(flat[0].cantidad,'0.65');assert.equal(m.cost(item,[],C).unitCost,650);m.setBasis('unidad');m.totals([item]);assert.equal(flat[0].cantidad,'6.5');assert.equal(m.cost(item,[],C).unitCost,6500);
});

test('los consumos comunes siguen siendo totales y quitar un renglón conserva todo su consumo',()=>{
 const item={desc:'A',cant:10},rows=[{...material(),precioPrevisto:'100'}],m=M.create(rows,[item],[],{defaultBasis:'unidad'});m.set(item,0,'.65');m.set(null,0,'2');m.setIndex(item,'2');m.totals([item]);assert.equal(rows[0].cantidad,'8.5');assert.equal(m.cost(item,[],C).unitPrice,null);m.totals([]);assert.equal(rows[0].cantidad,'8.5');assert.equal(m.get(null,0),'8.5');
});

test('la aprobación y el Excel de OT reciben el total de insumos con equivalencia aplicada una sola vez',()=>{
 const OT=require('../functions/materialesProduccionCoreV1'),sale={desc:'Diez placas impresas',cant:10,precio:45760},rows=[material()],cat=[{...catalog[0],codigo:'000107',stockDisponible:100}],m=M.create(rows,[sale],[],{defaultBasis:'unidad'});m.set(sale,0,'.65');m.totals([sale]);rows[0].revisado=true;const snapshot=C.snapshot(C.draft(rows),cat,{importe:457600,moneda:'ARS'},{email:'info@tizpublicidad.com'},'2026-11-17T15:00:00Z');assert.equal(snapshot.items[0].cantidad,'6.5');assert.ok(Math.abs(snapshot.items[0].cantidadStock-6.5/2.9768)<1e-12);const exported=OT.salesRows({insumosVentasAprobados:snapshot});assert.equal(exported[0][2],6.5);assert.equal(exported[0][3],'M²');assert.ok(Math.abs(exported[0][4]-6.5/2.9768*137280)<1e-8);assert.ok(Math.abs(m.cost(sale,cat,C).unitCost-exported[0][4]/10)<1e-8);
});

test('modo unitario con cantidad cotizada inválida no inventa totales ni costos',()=>{
 for(const qty of [0,-1,'no',Infinity]){const sale={cant:qty},rows=[{...material(),precioPrevisto:'100'}],m=M.create(rows,[sale],[],{defaultBasis:'unidad'});m.set(sale,0,'1');m.totals([sale]);assert.equal(rows[0].cantidad,'');assert.equal(m.cost(sale,[],C).unitCost,null);}
});
