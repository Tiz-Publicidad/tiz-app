'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../functions/otLogisticaCoreV1');
const log={tipo:'colocacion',domicilio:'San Martín 655 Paraná, Entre Ríos',fecha:'2026-12-07',contacto:'Eliana Culot',contactoTelefono:'1157187031',contactoCargo:'Arquitecta',contactoEmail:'eliana.culot@farmacity.com.ar',detalle:'Entrar por atrás\nSolicitar permiso'};
const cell=v=>({formattedValue:v,userEnteredValue:{stringValue:v}});
const sheet=()=>({properties:{sheetId:0,title:'FICHA'},data:[{rowData:[{values:[cell('DATOS DE OBRA / COLOCACIÓN')]},{values:[cell('Dirección'),cell(''),{},cell('Contacto'),cell('')]},{values:[cell('Fecha prevista'),cell(''),{},cell('Modalidad'),cell('A definir')]},{values:[cell('INFORMACIÓN Y PLANEAMIENTO')]},{values:[cell('Inicio previsto'),cell(''),{},cell('Finalización'),{userEnteredValue:{numberValue:46363}}]},{values:[cell('OBSERVACIONES OPERATIVAS')]},{values:[cell('Tipo de factura: Factura A\nENTREGA / LOGÍSTICA: A definir\nNo apilar')]},{values:[cell('Ayudamemoria: llamar')]}]}]});
test('datos posteriores reemplazan la logística inicial y conservan notas manuales',()=>{
 const q={entregaLogistica:log},r=C.requests(sheet(),{entregaLogistica:{tipo:'a_definir'}},q),writes=r.filter(x=>x.updateCells).map(x=>x.updateCells);
 assert.equal(writes.find(x=>x.range.startRowIndex===1&&x.range.startColumnIndex===1).rows[0].values[0].userEnteredValue.stringValue,log.domicilio);
 assert.equal(writes.find(x=>x.range.startRowIndex===1&&x.range.startColumnIndex===4).rows[0].values[0].userEnteredValue.stringValue,log.contacto);
 assert.equal(writes.find(x=>x.range.startRowIndex===2&&x.range.startColumnIndex===1).rows[0].values[0].userEnteredValue.numberValue,46363);
 const n=writes.find(x=>x.range.startRowIndex===6).rows[0].values[0];assert.match(n.userEnteredValue.stringValue,/Arquitecta/);assert.match(n.userEnteredValue.stringValue,/07\/12\/2026/);assert.match(n.userEnteredValue.stringValue,/No apilar/);assert.match(n.userEnteredValue.stringValue,/Factura A/);assert.doesNotMatch(n.userEnteredValue.stringValue,/A definir|ENTREGA ACTUALIZADA/);
 const highlighted=r.filter(x=>x.repeatCell?.cell.userEnteredFormat.backgroundColor);assert.equal(highlighted.length,1);assert.equal(highlighted[0].repeatCell.range.startRowIndex,2);assert.equal(highlighted[0].repeatCell.range.startColumnIndex,1);
 assert.ok(!writes.some(x=>x.range.startRowIndex===7));
 const second=sheet();second.data[0].rowData[6].values[0]=n;const changed={...log,contacto:'Nuevo contacto',domicilio:'Nuevo domicilio',detalle:'Nueva indicación'};const n2=C.requests(second,{}, {entregaLogistica:changed}).find(x=>x.updateCells?.range.startRowIndex===6).updateCells.rows[0].values[0].userEnteredValue.stringValue;assert.match(n2,/Nuevo contacto/);assert.match(n2,/No apilar/);assert.doesNotMatch(n2,/Eliana|San Martín|Solicitar permiso|Entrar por atrás/);
});
test('fechas válidas, sin ambigüedad ni cambio de día; datos ausentes no se inventan',()=>{
 assert.equal(C.date('2026-12-07'),'07/12/2026');assert.equal(C.iso('07/12/2026'),'2026-12-07');assert.equal(C.iso('31/02/2026'),'');assert.equal(C.date(''),'');assert.equal(C.iso('2026-02-29'),'');assert.equal(C.iso('2024-02-29'),'2024-02-29');
 const r=C.requests(sheet(),{},{}),date=r.find(x=>x.updateCells?.range.startRowIndex===2&&x.updateCells.range.startColumnIndex===1);assert.equal(date.updateCells.rows[0].values[0].userEnteredValue.stringValue,'');
});
