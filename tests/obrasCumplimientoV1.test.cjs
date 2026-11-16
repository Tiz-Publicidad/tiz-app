'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../functions/obrasSeguimientoCoreV2'),R=require('../obrasCumplimientoV1');
const today='2026-11-16';
const group=(id,plan,real='',extra={})=>({id,ot:id,cliente:'Cliente '+id,desc:'Obra '+id,estado:'Pendiente',produccionPrevista:plan,colocacionPrevista:'',seguimiento:{produccionReal:real},...extra});
test('tortas y detalle solo incluyen etapas con fecha prevista y real válidas',()=>{
 const works=[group('1','2026-11-10','2026-11-10'),group('2','2026-11-10','2026-11-12'),group('3','2026-11-10'),group('4','2026-11-10','',{estado:'Entregado'}),group('5','2026-11-20'),group('6','','2026-11-10'),group('7','2026-11-10','2026-11-20')];
 const r=R.completedReport(works,{},today),p=R.pieData(r.porEtapa.produccion);
 assert.deepEqual(r.rows.map(x=>x.id),['2','1']);assert.equal(r.total.total,2);assert.equal(r.total.vencidas,0);assert.equal(r.total.sinEvaluar,0);assert.equal(r.total.futuras,0);
 assert.deepEqual(p,{enFecha:1,atrasadas:1,total:2,enFechaPct:50,atrasadasPct:50});assert.equal(r.meses.length,1);assert.equal(r.meses[0].produccion.total,2);
 const html=R.distribution(r);assert.match(html,/conic-gradient/);assert.match(html,/Producción · 2 etapas con fechas cargadas/);assert.doesNotMatch(html,/oc-stack|oc-pending|Vencida sin fecha real/);
 assert.equal(R.csv(R.visibleRows(r.rows,'todas')).split('\r\n').length,3);
});
test('cada torta usa sus propias fechas: una etapa sin fecha real no afecta a la otra',()=>{
 const g=group('1','2026-11-10','2026-11-10',{colocacionPrevista:'2026-11-12'}),r=R.completedReport([g],{},today);
 assert.equal(r.porEtapa.produccion.cumplimiento,100);assert.equal(r.porEtapa.colocacion.evaluadas,0);assert.equal(r.porEtapa.colocacion.cumplimiento,null);
 assert.match(R.distribution(r),/Sin etapas con fecha prevista y fecha real/);
 assert.equal(R.completedReport([g],{etapa:'colocacion'},today).rows.length,0);
});
test('tortas muestran 100% en un solo resultado, porcentajes redondeados suman 100 y sin datos no inventan cumplimiento',()=>{
 for(const real of ['2026-11-10','2026-11-12']){
  const p=R.pieData(R.completedReport([group('1','2026-11-10',real)],{},today).porEtapa.produccion);
  assert.equal(p.enFechaPct+p.atrasadasPct,100);assert.ok([p.enFechaPct,p.atrasadasPct].includes(100));
 }
 const works=[group('1','2026-11-10','2026-11-10'),group('2','2026-11-10','2026-11-12'),group('3','2026-11-10','2026-11-12')],r=R.completedReport(works,{},today),p=R.pieData(r.total);
 assert.equal(p.enFechaPct,33.3);assert.equal(p.atrasadasPct,66.7);assert.equal(p.enFechaPct+p.atrasadasPct,100);
 assert.equal(R.completedReport([],{},today).total.cumplimiento,null);assert.doesNotMatch(R.distribution(R.completedReport([],{},today)),/conic-gradient/);
});
test('cumplimiento compara fechas reales; vencidas, cerradas sin fecha y futuras no se acreditan como terminadas',()=>{
 const works=[group('1','2026-11-10','2026-11-10'),group('2','2026-11-10','2026-11-13'),group('3','2026-11-10'),group('4','2026-11-10','',{estado:'Entregado'}),group('5','2026-11-18'),group('6',today),group('7','2026-11-10','2026-11-20')];
 const r=R.report(works,{},today),s=r.porEtapa.produccion;
 assert.equal(s.cumplimiento,50);assert.equal(s.evaluadas,2);assert.equal(s.vencidas,1);assert.equal(s.sinEvaluar,2);assert.equal(s.futuras,1);assert.equal(s.hoy,1);assert.equal(s.demoraMedia,3);
 assert.equal(r.rows.find(x=>x.id==='7').status,'invalida');assert.equal(r.rows.find(x=>x.id==='3').dias,6);
});
test('conserva el incumplimiento original después de reprogramar y permite comparar la fecha vigente',()=>{
 const g=group('1','2026-11-15','2026-11-14',{seguimiento:{produccionPrevistaOriginal:'2026-11-10',produccionReal:'2026-11-14'}});
 assert.equal(R.report([g],{},today).total.cumplimiento,0);assert.equal(R.report([g],{},today).rows[0].dias,4);
 assert.equal(R.report([g],{referencia:'vigente'},today).total.cumplimiento,100);
});
test('separa producción y colocación de una misma OT y no duplica anticipos o saldos',()=>{
 const works=[{id:'a',ot:'4800',cliente:'Cliente',desc:'Anticipo',estado:'Pendiente',fprod_c:'2026-11-10',fprod_r:'2026-11-10',fcol_c:'2026-11-12',fcol_r:'2026-11-15'},{id:'b',ot:'4800',cliente:'Cliente',desc:'Saldo',estado:'Pendiente'}];
 const r=R.report(C.grouped(works),{},today);
 assert.equal(r.total.total,2);assert.equal(r.porEtapa.produccion.cumplimiento,100);assert.equal(r.porEtapa.colocacion.cumplimiento,0);assert.equal(r.total.cumplimiento,50);
});
test('cohortes mensuales y filtros usan fecha prevista, etapa y búsqueda de obra',()=>{
 const a=group('4800','2026-10-31','2026-11-01'),b=group('4801','2026-11-01','2026-11-01'),c=group('4802','2026-11-02');
 const r=R.report([a,b,c],{},today);assert.deepEqual(r.meses.map(m=>m.mes),['2026-10','2026-11']);assert.equal(r.meses[0].produccion.cumplimiento,0);assert.equal(r.meses[1].produccion.cumplimiento,100);
 assert.deepEqual(R.report([a,b,c],{desde:'2026-11-01',hasta:'2026-11-01',etapa:'produccion',query:'4801'},today).rows.map(x=>x.id),['4801']);
 assert.equal(R.report([a,b],{etapa:'colocacion'},today).total.cumplimiento,null);
 assert.throws(()=>R.report([a],{desde:'2026-11-15',hasta:'2026-11-01'},today),/período/);
 assert.throws(()=>R.report([a],{desde:'2026-02-30'},today),/período/);
});
test('excluye bajas, detecta fechas ausentes y no inventa cumplimiento histórico',()=>{
 const r=R.report([group('1','2026-11-10','2026-11-10',{estado:'Baja'}),group('2','2026-11-10','',{estado:'Cobrado'}),group('3','')],{},today);
 assert.equal(r.rows.length,1);assert.equal(r.total.cumplimiento,null);assert.equal(r.total.sinEvaluar,1);assert.equal(r.sinPrevista,3);
 assert.equal(R.report([],{},today).total.cumplimiento,null);
});
test('cuenta días corridos en cambios de mes y año sin errores de huso horario',()=>{
 const r=R.report([group('1','2025-12-31','2026-01-02'),group('2','2024-02-28','2024-03-01')],{},today);
 assert.ok(r.rows.every(x=>x.dias===2));
});
test('situación filtra solo detalle y CSV exporta exactamente las filas seleccionadas',()=>{
 const r=R.report([group('1','2026-11-10','2026-11-10'),group('2','2026-11-10','2026-11-12'),group('3','2026-11-10')],{},today);
 assert.equal(R.visibleRows(r.rows).length,2);assert.equal(R.visibleRows(r.rows,'todas').length,3);
 const rows=R.visibleRows(r.rows,'atrasada'),csv=R.csv(rows);assert.equal(rows.length,1);assert.match(csv,/10\/11\/2026/);assert.match(csv,/12\/11\/2026/);assert.equal(csv.split('\r\n').length,2);assert.equal(r.total.cumplimiento,50);
 rows[0].cliente='=SUM(1;2)';rows[0].desc='Texto "citado"';assert.match(R.csv(rows),/"'=SUM/);assert.match(R.csv(rows),/"Texto ""citado"""/);
});
test('no reasigna causas al cambiar la base de comparación y reconoce las archivadas',()=>{
 const g=group('1','2026-11-12','2026-11-14',{members:[{_archivadaEstadistica:true}],seguimiento:{produccionPrevistaOriginal:'2026-11-10',produccionReal:'2026-11-14',produccionDemora:{prevista:'2026-11-10',real:'2026-11-14',motivo:'proveedor',responsabilidad:'externa',detalle:'Demora de proveedor'}}});
 const original=R.report([g],{},today).rows[0],vigente=R.report([g],{referencia:'vigente'},today).rows[0];assert.equal(original.archivada,true);assert.equal(original.responsabilidad,'externa');assert.equal(vigente.responsabilidad,'');
});




