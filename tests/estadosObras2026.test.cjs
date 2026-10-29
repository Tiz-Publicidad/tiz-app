'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../scripts/syncEstadosObras2026.cjs');
const r=(row,ot,cliente,desc,status)=>({row,ot,cliente,desc,status});
test('cruza OT y cliente; diferencia anticipos y saldos con estados distintos usando descripción exacta',()=>{
 const rows=[r(3,'0004627','Cliente','Anticipo','Cobrado'),r(4,'4627','Cliente','Saldo','Entregado')];
 const p=C.plan(rows,[{id:'a',ot:'4627',cliente:'Cliente',desc:'Saldo',estado:'Pendiente'},{id:'b',ot:'4627',cliente:'Cliente',desc:'Sin identificar',estado:'Pendiente'},{id:'c',ot:'4627',cliente:'Otro',desc:'Saldo',estado:'Pendiente'}]);
 assert.equal(p.updates.length,1);assert.equal(p.updates[0].after,'Entregado');assert.equal(p.ambiguous.length,1);assert.equal(p.unmatched.length,1);
});
test('no confunde revisiones, estados vacíos o registros archivados y conserva las filas sin correspondencia',()=>{
 const rows=[r(3,'4781','ASM','Trabajo','Pendiente'),r(4,'4782','Otro','Trabajo',''),r(5,'4783','Otro','Trabajo','Cobrado')];
 const p=C.plan(rows,[{id:'a',ot:'4781.2',cliente:'ASM',estado:'Aprobado'},{id:'b',ot:'4783',cliente:'Otro',archivado:true,estado:'Pendiente'}]);
 assert.equal(p.updates.length,0);assert.deepEqual(p.unmatchedRows,[3,5]);assert.deepEqual(p.invalidRows,[4]);
});
test('varias filas con igual estado no inventan un conflicto; los estados iguales no se reescriben',()=>{
 const p=C.plan([r(3,'4781','ASM','Parte 1','Cobrado'),r(4,'4781','ASM','Parte 2','Cobrado')],[{id:'a',ot:'4781',cliente:'ASM',desc:'General',estado:'Cobrado'}]);
 assert.equal(p.updates.length,0);assert.equal(p.unchanged.length,1);assert.deepEqual(p.unmatchedRows,[]);
});
test('la transacción deja respaldo y cambia sólo estado y procedencia; no pisa modificaciones concurrentes',async()=>{
 const w={id:'a',ot:'4781',cliente:'ASM',desc:'Trabajo',estado:'Aprobado',finanzas:{total:100},sectores:{produccion:{estado:'En proceso'}}},writes=[];
 const db={collection:name=>({doc:id=>({name,id})}),runTransaction:fn=>fn({get:async()=>({exists:true,data:()=>w}),create:(ref,data)=>writes.push({ref,data}),update:(ref,data)=>writes.push({ref,data})})};
 const p=C.plan([r(3,'4781','ASM','Trabajo','Pendiente')],[w]);
 assert.deepEqual(await C.apply(db,p,'hash','user','run'),{updated:1,conflicts:0});assert.deepEqual(Object.keys(writes[1].data),['estado','estadoPlanilla2026']);assert.equal(writes[0].data.antes,'Aprobado');assert.equal(w.finanzas.total,100);
 w.estado='Entregado';writes.length=0;assert.deepEqual(await C.apply(db,p,'hash','user','run2'),{updated:0,conflicts:1});assert.equal(writes.length,0);
});

