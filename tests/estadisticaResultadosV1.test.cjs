'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),R=require('../estadisticaResultadosCoreV1'),O=require('../functions/obrasSeguimientoCoreV2');
const group=(extra={})=>({id:'a',key:'4800|cliente',ot:'4800',cliente:'Cliente',estado:'Pendiente',quote:{importe:100,moneda:'ARS',fechaAprobacion:'2026-10-15T15:00:00Z'},seguimiento:{},members:[{id:'a'}],...extra});
const user={email:'giancarlo.pareja@tizpublicidad.com'};
test('ventas, producción, entregas y cobros se imputan a sus propias fechas y no se suman entre sí',()=>{
 const g=group({seguimiento:{produccionReal:'2026-11-02'},members:[{id:'a',fechaEntregaReal:'2026-11-09'}]}),p=[{id:'cob-1',obraId:'a',ot:'4800',fecha:'2026-11-10',importe:60,retenciones:10},{id:'cob-2',obraId:'a',ot:'4800',fecha:'2026-12-02',importe:30}];
 const r=R.build([g,g],p,2026,'2026-12-31');assert.equal(r.totals.ventas.importe,100);assert.equal(r.totals.produccion.cantidad,1);assert.equal(r.monthly[9].ventas.importe,100);assert.equal(r.monthly[10].produccion.importe,100);assert.equal(r.monthly[10].entregas.importe,100);assert.equal(r.monthly[10].cobranzas.importe,60);assert.equal(r.monthly[10].cobranzas.retenciones,10);assert.equal(r.monthly[11].cobranzas.importe,30);assert.equal(r.weekly.find(w=>w.key==='2026-W45').produccion.importe,100);assert.equal(r.weekly.find(w=>w.key==='2026-W46').entregas.importe,100);
});
test('pasar desde Obras a Producida o Entregado conserva la fecha real y no inventa cobros',()=>{
 const p=O.statusPatch({estado:'Pendiente'},'Producida',user,'2026-11-12T01:00:00Z');assert.equal(p.fprod_r,'2026-11-11');assert.equal(p['obraSeguimientoV2.produccionReal'],'2026-11-11');
 const d=O.statusPatch({estado:'Pendiente'},'Entregado',user,'2026-11-12T01:00:00Z');assert.equal(d.fechaEntregaReal,'2026-11-11');assert.equal(d['estadisticaResultadosV1.entrega'].activa,true);assert.equal(d.cobros,undefined);
 const old={estado:'Entregado',fechaEntregaReal:d.fechaEntregaReal,estadisticaResultadosV1:{entrega:d['estadisticaResultadosV1.entrega']}};
 assert.equal(O.statusPatch(old,'Cobrado',user,'2026-11-13T12:00:00Z').fechaEntregaReal,undefined);
 const undo=O.statusPatch(old,'Pendiente',user,'2026-11-13T12:00:00Z');assert.equal(undo['estadisticaResultadosV1.entrega'].activa,false);
 const r=R.build([group({members:[{...old,estadisticaResultadosV1:{entrega:undo['estadisticaResultadosV1.entrega']}}]})],[],2026,'2026-12-31');assert.equal(r.totals.entregas.cantidad,0);
});
test('históricos sin fecha, fechas futuras e importes sin convertir quedan pendientes y no crean resultados falsos',()=>{
 const groups=[group({estado:'Entregado',seguimiento:{produccionReal:'2027-01-01'},quote:{moneda:'USD',importe:100,fechaAprobacion:'2026-11-01'}})];
 const r=R.build(groups,[{obraId:'a',id:'1',importe:100,fecha:''}],2026,'2026-11-11');assert.equal(r.totals.ventas.sinImporte,1);assert.equal(r.totals.produccion.cantidad,0);assert.equal(r.totals.entregas.cantidad,0);assert.equal(r.totals.cobranzas.cantidad,0);assert.equal(r.warnings.length,3);
});
test('pagos repetidos se deduplican y vencimiento de una cobranza nunca reemplaza fecha de cobro',()=>{
 const db={cobranzas:[{id:'legacy',vencimiento:'2026-11-01',importe:99}],obras:[]},p={id:'legacy',obraId:'a',fecha:'2026-11-01',importe:99};
 const fixed=R.paymentDates([p],db);assert.equal(fixed[0].fecha,'');assert.equal(R.build([],fixed,2026,'2026-12-31').totals.cobranzas.cantidad,0);
 const real={...p,fecha:'2026-11-10'};assert.equal(R.build([],[real,real],2026,'2026-12-31').totals.cobranzas.importe,99);
});
test('semana ISO y cambio de año respetan la fecha argentina y el mes real',()=>{
 assert.equal(R.date('2026-11-12T01:30:00Z'),'2026-11-11');assert.equal(R.date('31/02/2026'),'');assert.equal(R.week('2027-01-01').key,'2026-W53');
 const r=R.build([],[{id:'1',fecha:'2027-01-01',importe:20}],2027,'2027-01-02');assert.equal(r.monthly[0].cobranzas.importe,20);assert.equal(r.weekly[0].key,'2026-W53');assert.equal(r.totals.cobranzas.importe,20);
});
