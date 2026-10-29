'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../colocacionesV128'),'utf8'),window={},FixedDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-29T15:00:00Z']))}};
vm.runInNewContext(source,{window,Date:FixedDate,Intl,TextEncoder,console});const C=window.TIZColocacionesCore;
const base=()=>({id:'obra',ot:'4572',estado:'Aprobado',finanzas:{total:100},sectores:{produccion:{estado:'Terminada'},colocaciones:{compromiso:'20/10/2026'}},colocacionesGestion:{actualizadoEn:'v1',legacyCapturada:true,acciones:{a:{id:'a',titulo:'Preparar piezas',tipo:'Insumos',estado:'Pendiente',responsable:'Ariel',fecha:'2026-10-20',todoDia:true},b:{id:'b',titulo:'Retirar sobrantes',tipo:'Entrega',estado:'Bloqueada',responsable:'Ariel',fecha:'2026-10-21',todoDia:true}}}});
const fields={version:'v1',modo:'parcial',fecha:'2026-10-28',resultado:'Se instalaron las lonas'};
function patch(o,extra={}){return C.performedWorkPatch(o,{...fields,...extra},'2026-10-29T15:00:00Z','operador@example.test','registro1')}
test('cierre completo registra fecha real y excepción sin aprobar fotos, controles ni tareas anteriores',()=>{
 const o=base(),before=JSON.stringify(o),p=patch(o,{modo:'completo',confirmarCompleto:true});
 assert.equal(p['colocacionesGestion.cierre'].cerrada,true);assert.equal(p['colocacionesGestion.cierre'].registroPosterior,true);
 assert.deepEqual(Array.from(p['colocacionesGestion.cierre'].pendientesAlCerrar),['a','b']);
 assert.equal(p['colocacionesGestion.cierre'].fotosVerificadas,false);assert.equal(p['colocacionesGestion.cierre'].controlFinalVerificado,false);
 assert.equal(p['sectores.colocaciones.real'],'28/10/2026');assert.equal(p['colocacionesGestion.acciones.registro1'].fecha,'');assert.equal(p['colocacionesGestion.acciones.registro1'].gestionadaPor,'operador@example.test');
 assert.equal(p['colocacionesGestion.acciones.a'],undefined);assert.equal(p['colocacionesGestion.preparacion.final'],undefined);
 assert.equal(JSON.stringify(o),before);assert.ok(Object.keys(p).every(k=>k.startsWith('colocacionesGestion.')||k.startsWith('sectores.colocaciones.')));
});
test('avance parcial termina sólo tareas elegidas y agrega lo que falta con responsable, sin cerrar la OT',()=>{
 const o=base(),p=patch(o,{terminadas:['a'],pendiente:'Retocar una tapa',responsable:'Cristian',fechaPendiente:'2026-10-30'});
 assert.equal(p['colocacionesGestion.acciones.a'].estado,'Cerrada');assert.equal(p['colocacionesGestion.acciones.a'].fecha,'2026-10-20');
 assert.equal(p['colocacionesGestion.acciones.b'],undefined);assert.equal(p['colocacionesGestion.acciones.registro1pendiente'].estado,'Pendiente');
 assert.equal(p['colocacionesGestion.acciones.registro1'],undefined);assert.equal(p['colocacionesGestion.notas.registro1'].fechaReal,'2026-10-28');
 assert.equal(p['colocacionesGestion.acciones.registro1pendiente'].responsable,'Cristian');assert.equal(p['colocacionesGestion.cierre'],undefined);assert.equal(p['sectores.colocaciones.instalada'],undefined);
 C.applyPatch(o,p);assert.deepEqual(Array.from(C.pending(o).map(a=>a.id)),['b','registro1pendiente']);
});
test('permite registrar algo hecho sin planificación y dejar nueva tarea sin fecha',()=>{
 const o=base();o.colocacionesGestion.acciones={};const p=patch(o,{pendiente:'Retirar herramientas',responsable:'Ariel'});
 assert.equal(p['colocacionesGestion.acciones.registro1'].fechaReal,'2026-10-28');assert.equal(p['colocacionesGestion.acciones.registro1pendiente'].fecha,'');
 assert.throws(()=>patch(o),/qué queda/);assert.throws(()=>patch(o,{pendiente:'Algo'}),/responsable/);
});
test('rechaza fechas futuras, pendientes vencidos, falta de confirmación, duplicados y edición concurrente',()=>{
 const o=base();for(const extra of [{fecha:'2026-10-30'},{fecha:'31/02/2026'},{resultado:''},{modo:''},{version:'old'},{modo:'completo'},{terminadas:['a','a']},{terminadas:['inexistente']},{pendiente:'Pendiente',responsable:'Ariel',fechaPendiente:'2026-10-01'}])assert.throws(()=>patch(o,extra));
 o.colocacionesGestion.acciones.registro1={estado:'Cerrada'};assert.throws(()=>patch(o),/ya se guardó/);delete o.colocacionesGestion.acciones.registro1;o.colocacionesGestion.cierre={cerrada:true};assert.throws(()=>patch(o),/ya está cerrada/);
});
test('el cierre parcial conserva el requisito de control conforme para una tarea Colocación',()=>{
 const o=base();o.colocacionesGestion.acciones.a.tipo='Colocación';
 assert.throws(()=>patch(o,{terminadas:['a']}),/control conforme/);
 assert.equal(patch(o,{terminadas:['a'],control:'Conforme'})['colocacionesGestion.acciones.a'].control,'Conforme');
});

