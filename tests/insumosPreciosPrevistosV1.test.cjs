'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../functions/materialesProduccionCoreV1');
test('la OT conserva el importe numérico y muestra manual con la unidad en la nota, sin tocar otros sectores',()=>{
 const quote={insumosVentasAprobados:{items:[{codigo:'000112',descripcion:'Acrílico',cantidad:0.09,unidad:'M²',precioPrevisto:'50000',costoOrigen:'manual',costoUnitarioPrevisto:50000,unidadCostoPrevisto:'M²',costoTotal:4500}]}},rows=C.salesRows(quote),requests=C.updateSales(42,rows,{salesHash:C.hash(rows)});
 const write=requests[0].updateCells,price=write.rows[0].values[4];assert.equal(price.userEnteredValue.numberValue,4500);assert.match(price.note,/manual/);assert.match(price.note,/50.000 \/ M²/);assert.match(price.userEnteredFormat.numberFormat.pattern,/manual/);assert.equal(write.range.endColumnIndex,5);
 assert.equal(write.rows[1].values[4].note,'');assert.doesNotMatch(write.rows[1].values[4].userEnteredFormat.numberFormat.pattern,/manual/);
 const other=C.salesRows({insumosVentasAprobados:{items:[{...quote.insumosVentasAprobados.items[0],precioPrevisto:'',costoOrigen:'compras'}]}});assert.notEqual(C.hash(rows),C.hash(other));
});
