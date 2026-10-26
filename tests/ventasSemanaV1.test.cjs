'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),core=require('../functions/baseMadreLayoutV1');
test('una cotización del viernes aprobada el lunes cuenta como venta de semana 44',()=>{
 const p=core.salesPeriod({fecha:'23/10/2026',fechaVenta:'2026-10-26'});assert.equal(p.fecha,'26/10/26');assert.equal(p.semana,44);
 const approved=core.salesPeriod({fecha:'23/10/2026',fechaAprobacion:'26/10/2026'});assert.equal(approved.iso,'2026-10-26');assert.equal(approved.semana,44);
});
test('la fecha actual de respaldo usa Argentina aunque el servidor ya esté en lunes UTC',()=>{
 const sunday=core.salesPeriod({fecha:'01/10/2026'},[],{},new Date('2026-10-26T01:30:00Z'));assert.equal(sunday.iso,'2026-10-25');assert.equal(sunday.semana,43);
 const monday=core.salesPeriod({},[],{},new Date('2026-10-26T03:30:00Z'));assert.equal(monday.iso,'2026-10-26');assert.equal(monday.semana,44);
});
test('una aprobación registrada conserva su período aunque se sincronice la semana siguiente',()=>{
 const p=core.salesPeriod({promovidoEn:'2026-10-26T15:30:00Z'},[],{},new Date('2026-11-02T15:00:00Z'));assert.equal(p.iso,'2026-10-26');assert.equal(p.semana,44);
});
test('la fila existente conserva el período corregido manualmente y admite columnas movidas',()=>{
 const l={fecha:0,semana:2},row=['26/10/26','fecha de producción',44];
 const p=core.salesPeriod({fecha:'23/10/26',fechaAprobacion:'23/10/26'},row,l,new Date('2026-11-02T15:00:00Z'));assert.equal(p.iso,'2026-10-26');assert.equal(p.semana,44);
 const ranges=core.approvalData('Base de datos',447,{ot:'4790'},undefined,undefined,{ot:3});assert.equal(ranges.length,1);assert.equal(ranges[0].range,"'Base de datos'!D447:D447");
});
test('fechas reales, seriales Sheets e ISO de cambio de año no dependen de la zona del servidor',()=>{
 assert.equal(core.salesDate(46321),'2026-10-26');assert.equal(core.salesDate('26/10/26'),'2026-10-26');assert.equal(core.salesPeriod({fechaVenta:'2027-01-01'}).semana,53);
 assert.equal(core.salesDate({seconds:Date.parse('2026-10-26T01:00:00Z')/1000}),'2026-10-25');
 for(const fechaVenta of ['31/02/2026','2026-13-01','incorrecta'])assert.throws(()=>core.salesPeriod({fechaVenta}),/inválida/);
});
