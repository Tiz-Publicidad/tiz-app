'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../functions/obrasSeguimientoCoreV2'),Consulta=require('../functions/obrasConsultaV1'),Cache=require('../obrasConsultaCacheV1');
const user={email:'calidad@test.local',sector:'Calidad'},at='2026-11-06T13:00:00Z',today='2026-11-06';
const work=(extra={})=>({id:'w',ot:'4767',cliente:'Cliente',estado:'Pendiente',fprod_c:'2026-11-03',fcol_c:'2026-11-05',...extra});
const reason={reprogramacionMotivo:'materiales',reprogramacionDetalle:'El acrílico llegó después de la fecha acordada.'};
const apply=(w,input,time=at)=>({...w,...C.trackingPatch(w,input,user,time,today)});
test('primera fecha nueva no exige motivo ni inventa una reprogramación',()=>{
 const w=apply(work({fprod_c:'',fcol_c:''}),{produccionPrevista:'2026-11-09',colocacionPrevista:'2026-11-10'});
 assert.equal(w.obraSeguimientoV2.produccionPrevistaOriginal,'2026-11-09');assert.equal(w.obraSeguimientoV2.colocacionPrevistaOriginal,'2026-11-10');assert.equal(w.obraSeguimientoV2.reprogramaciones,undefined);
});
test('cambiar o quitar una fecha previa exige causa válida y detalle suficiente',()=>{
 for(const input of [{produccionPrevista:'2026-11-04'},{produccionPrevista:''},{produccionPrevista:'2026-11-04',...reason,reprogramacionMotivo:'inventado'},{produccionPrevista:'2026-11-04',...reason,reprogramacionDetalle:'abc'},{produccionPrevista:'2026-11-04',...reason,reprogramacionDetalle:'x'.repeat(2001)}])assert.throws(()=>apply(work(),input),/motivo|Describí/);
 assert.equal(work().obraSeguimientoV2,undefined);
});
test('cada cambio conserva original, fechas, causa, detalle y usuario sin modificar historial anterior',()=>{
 const first=apply(work(),{produccionPrevista:'2026-11-04',...reason}),snapshot=JSON.stringify(first.obraSeguimientoV2.reprogramaciones);
 const second=apply(first,{produccionPrevista:'2026-11-05',...reason},'2026-11-06T14:00:00Z');
 assert.equal(second.obraSeguimientoV2.produccionPrevistaOriginal,'2026-11-03');assert.equal(second.obraSeguimientoV2.reprogramaciones.length,2);assert.equal(JSON.stringify(first.obraSeguimientoV2.reprogramaciones),snapshot);
 const e=second.obraSeguimientoV2.reprogramaciones[1];assert.equal(e.usuario,user.email);assert.equal(e.cambios[0].anterior,'2026-11-04');assert.equal(e.cambios[0].nueva,'2026-11-05');assert.equal(e.cambios[0].desplazamientoDias,1);
 const unchanged=apply(second,{produccionPrevista:'2026-11-05'});assert.equal(unchanged.obraSeguimientoV2.reprogramaciones.length,2);
});
test('guardar fecha real y verificaciones conserva el historial sin exigir otra causa',()=>{
 const w=apply(work(),{produccionPrevista:'2026-11-04',...reason}),v=apply(w,{produccionReal:'2026-11-05',produccionPlanificada:true});
 assert.equal(v.obraSeguimientoV2.reprogramaciones.length,1);assert.equal(v.obraSeguimientoV2.produccionPrevistaOriginal,'2026-11-03');assert.equal(C.metrics(C.grouped([v])).produccionesEnFecha,0);
});
test('Producción no cambia motivos ni fechas previstas; el historial y original no se aceptan del cliente',()=>{
 assert.throws(()=>C.trackingPatch(work(),{...reason},{email:'pablo.aciar@tizpublicidad.com'},at,today),/Calidad/);
 for(const k of ['reprogramaciones','produccionPrevistaOriginal'])assert.throws(()=>apply(work(),{[k]:[]}),/Campo de seguimiento inválido/);
});
test('historial agrupado no duplica anticipo y saldo ni cuenta dos etapas como dos cambios',()=>{
 const a=work({id:'a'}),b=work({id:'b'}),input={produccionPrevista:'2026-11-05',colocacionPrevista:'2026-11-09',...reason};
 const rows=[a,b].map(w=>({...w,...C.trackingPatch(w,input,user,at,today,'evento-compartido')})),groups=C.grouped(rows),r=C.replanReport(groups);
 assert.equal(groups.length,1);assert.equal(groups[0].seguimiento.reprogramaciones.length,1);assert.equal(r.total,1);assert.equal(r.obras,1);assert.equal(r.dias,4);assert.equal(r.porMotivo[0].eventos,1);
});
test('informe agrupa motivos, clientes y meses; filtros por período, etapa y cliente coinciden con el detalle',()=>{
 let w=apply(work(),{produccionPrevista:'2026-11-04',...reason},'2026-10-30T12:00:00Z');w=apply(w,{colocacionPrevista:'2026-11-09',...reason,reprogramacionMotivo:'cliente'},at);
 const other=apply(work({id:'other',ot:'4800',cliente:'Otro cliente'}),{produccionPrevista:'2026-11-04',...reason});const gs=C.grouped([w,other]),r=C.replanReport(gs);
 assert.equal(r.total,3);assert.equal(r.obras,2);assert.equal(r.reincidentes,1);assert.equal(r.porMotivo[0].key,'materiales');assert.equal(r.porMotivo[0].eventos,2);assert.deepEqual(r.porMes.map(x=>x.key),['2026-10','2026-11']);
 const filtered=C.replanReport(gs,{desde:'2026-11-01',hasta:'2026-11-06',etapa:'colocacion',motivo:'cliente',query:'4767'});assert.equal(filtered.total,1);assert.equal(filtered.dias,4);assert.equal(filtered.porCliente[0].key,'Cliente');
 assert.throws(()=>C.replanReport(gs,{desde:'2026-02-30'}),/período/);assert.throws(()=>C.replanReport(gs,{desde:'2026-11-07',hasta:'2026-11-06'}),/período/);
});
test('adelantos y fechas retiradas se registran sin contarlos como días de atraso',()=>{
 let w=apply(work(),{produccionPrevista:'2026-11-02',...reason});w=apply(w,{produccionPrevista:'',...reason},'2026-11-06T14:00:00Z');const r=C.replanReport(C.grouped([w]));assert.equal(r.total,2);assert.equal(r.postergaciones,0);assert.equal(r.dias,0);assert.deepEqual(r.rows.map(x=>x.tipo),['sin_fecha','adelanto']);
});
test('reprogramar no convierte un incumplimiento de la primera fecha en cumplimiento original',()=>{
 let w=apply(work(),{produccionPrevista:'2026-11-05',...reason});w=apply(w,{produccionReal:'2026-11-05'});const groups=C.grouped([w]);assert.equal(C.metrics(groups).produccionesEnFecha,1);
 const r=C.replanReport(groups);assert.equal(r.original.produccion.evaluadas,1);assert.equal(r.original.produccion.enFecha,0);
});
test('API de consulta y caché conservan motivos, originales e historial operativo',()=>{
 const w=apply(work(),{produccionPrevista:'2026-11-04',...reason});w.secretos='No proyectar';
 const a=Consulta.projectWork({id:w.id,data:()=>w}),b=Cache.project(w,C);for(const p of [a,b]){assert.equal(p.obraSeguimientoV2.reprogramaciones.length,1);assert.equal(p.obraSeguimientoV2.produccionPrevistaOriginal,'2026-11-03');assert.equal(p.secretos,undefined);}
 assert.deepEqual(a.obraSeguimientoV2,b.obraSeguimientoV2);
});
test('días de postergación son corridos y respetan meses y años bisiestos',()=>{
 const w=apply(work({fprod_c:'2024-02-28',fcol_c:'2024-03-05'}),{produccionPrevista:'2024-03-01',...reason});assert.equal(w.obraSeguimientoV2.reprogramaciones[0].cambios[0].desplazamientoDias,2);
});
