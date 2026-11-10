const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../functions/obrasSeguimientoCoreV2');

test('Darssa y Miniso: las altas del 2, 3 y 4 de noviembre completan semana 45 si falta',()=>{
 for(const fecha of ['2026-11-02','2026-11-03','2026-11-04']){const w={id:fecha,ot:'4798',cliente:'Cliente',fechaAltaObra:fecha,semanaVenta:0};assert.equal(C.approvalWeek(w),45);assert.equal(C.grouped([w])[0].semana,45);assert.equal(w.semanaVenta,0);}
 assert.equal(C.approvalWeek({fechaAltaObra:'inválida'}),0);assert.equal(C.approvalWeek({semanaVenta:0,semana:44}),44);
});
test('semana de aprobación usa Buenos Aires, incluso el domingo de noche y el cambio de año ISO',()=>{
 assert.equal(C.approvalWeek({fechaAprobacion:'2026-11-09T02:59:59Z',semanaVenta:40}),45);assert.equal(C.approvalWeek({fechaAprobacion:'2026-11-09T03:00:00Z'}),46);
 assert.equal(C.approvalWeek({fechaAltaObra:'2021-01-01'}),53);assert.equal(C.approvalWeek({fechaAltaObra:'2021-01-04'}),1);
});
test('OT 4756 recién aprobada se ubica antes de 4811, 4810 y 4804',()=>{
 const obras=['4811','4810','4804'].map((ot,i)=>({id:ot,ot,fechaAprobacion:'2026-11-06T'+(12+i)+':00:00Z'}));obras.push({id:'4756',ot:'4756',fecha:'2026-10-01',fechaAprobacion:'2026-11-06T18:35:00Z'});assert.equal(C.grouped(obras)[0].ot,'4756');
});

test('el último trabajo aprobado va primero aunque su CT sea menor o se haya cotizado antes',()=>{
 const works=[{id:'alta',ot:'9999',cliente:'Cliente',fecha:'2026-11-06',fechaAprobacion:'2026-11-06T12:00:00Z'},{id:'nueva',ot:'4200',cliente:'Cliente',fecha:'2026-09-01',fechaAltaObra:'2026-11-06',fechaAprobacion:'2026-11-06T18:30:00Z'}];
 assert.deepEqual([...works].sort(C.compareApproved).map(w=>w.id),['nueva','alta']);assert.deepEqual(C.grouped(works).map(w=>w.id),['nueva','alta']);assert.equal(works[1].fecha,'2026-09-01');
});
test('misma fecha: conserva la hora de aprobación aunque se edite el seguimiento del otro trabajo',()=>{
 const rows=[{id:'anterior',ot:'9999',cliente:'Cliente',fechaAprobacion:'2026-11-06T10:00:00-03:00',obraSeguimientoV2:{actualizadoEn:'2026-11-08T19:00:00Z'}},{id:'ultima',ot:'4000',cliente:'Cliente',fechaAprobacion:'2026-11-06T13:00:01Z'}];
 assert.equal(C.grouped(rows)[0].id,'ultima');assert.equal(C.grouped(rows)[0].fechaAprobacion,'2026-11-06T13:00:01.000Z');
});
test('históricos usan su fecha de alta; fechas ausentes o inválidas quedan detrás sin ordenar por CT',()=>{
 const rows=[{id:'sin',ot:'9999',fechaAprobacion:'inválida'},{id:'antes',ot:'8888',fechaAltaObra:'05/11/2026'},{id:'hoy',ot:'4000',fechaAltaObra:'2026-11-06'}];
 assert.deepEqual(rows.sort(C.compareApproved).map(w=>w.id),['hoy','antes','sin']);assert.equal(C.approvalTime({fechaAltaObra:'2026-11-06'}),Date.parse('2026-11-06T03:00:00Z'));
 const ms=Date.parse('2026-11-06T18:00:00Z');assert.equal(C.approvalTime({fechaAprobacion:{seconds:ms/1000,nanoseconds:12000000}}),ms+12);assert.equal(C.approvalTime({_ts:{toMillis:()=>ms}}),ms);
});
test('el grupo conserva la aprobación aunque el miembro elegido por seguimiento no tenga la marca',()=>{
 const g=C.grouped([{id:'original',ot:'4000',cliente:'Cliente',fechaAprobacion:'2026-11-06T18:00:00Z'},{id:'saldo',ot:'4000',cliente:'Cliente',desc:'Saldo',obraSeguimientoV2:{actualizadoEn:'2026-11-07T18:00:00Z'}}])[0];
 assert.equal(g.fechaAprobacion,'2026-11-06T18:00:00.000Z');
});
const quality={email:'cristiantizpublicidad@gmail.com',sector:'Calidad'},admin={email:'info@tizpublicidad.com',isAdmin:true},production={email:'pablo.aciar@tizpublicidad.com',sector:'Producción'},other={email:'carolina.flores@tizpublicidad.com',sector:'Compras'};
const at='2026-10-29T20:00:00.000Z',today='2026-10-29';
const work=(id='w',extra={})=>({id,ot:'4781',cliente:'ASM SA',desc:'Miniso Mar del Plata',estado:'Pendiente',fprod_c:'2026-10-30',fcol_c:'2026-11-01',...extra});
test('normaliza fechas argentinas sin inventar días inválidos y usa Buenos Aires',()=>{assert.equal(C.iso('29/10/26'),'2026-10-29');assert.equal(C.iso('31/02/2026'),'');assert.equal(C.day(new Date('2026-10-30T01:00:00Z')),'2026-10-29');});
test('agrupa anticipo y saldo por CT/OT y cliente, sin mezclar otros clientes o revisiones',()=>{const all=C.grouped([work('a',{desc:'Anticipo obra',estado:'Cobrado'}),work('b',{desc:'Saldo obra',estado:'Entregado'}),work('c',{cliente:'Otro'}),work('d',{ot:'4781 1,3'})]);assert.equal(all.length,3);assert.equal(all.find(g=>g.ids.includes('a')).estado,'Entregado');assert.deepEqual(all.find(g=>g.ids.includes('a')).ids.sort(),['a','b']);});
test('todas las filas cobradas se replican como Cobrado y no se da por cobrado un saldo pendiente',()=>{assert.equal(C.aggregateStatus([{desc:'Anticipo',estado:'Cobrado'},{desc:'Saldo',estado:'Cobrado'}]),'Cobrado');assert.equal(C.aggregateStatus([{desc:'Anticipo',estado:'Cobrado'},{desc:'Saldo',estado:'Pendiente'}]),'Pendiente');});
const reference=(extra={})=>({row:3,ot:'4781',cliente:'ASM S.A.',desc:'Miniso',fechaAlta:'2026-10-19',semana:43,produccionPrevista:'2026-10-30',colocacionPrevista:'2026-11-01',estado:'Cobrado',...extra});
test('el cruce copia alta A, semana C, fechas B/I y estado; conserva registros fiscales y tareas',()=>{const w=work('w',{facturasArca:[{id:'fiscal'}],colocacionesGestion:{acciones:[]}}),p=C.referencePlan([w],[reference()],[],at).updates[0].patch;assert.equal(p.estado,'Cobrado');assert.equal(p.fechaAltaObra,'2026-10-19');assert.equal(p.semanaVenta,43);assert.equal(p.fprod_c,'2026-10-30');assert.equal(p.fcol_c,'2026-11-01');assert.equal(p.facturasArca,undefined);assert.equal(p.colocacionesGestion,undefined);});
test('la referencia no pisa fechas asumidas por Calidad',()=>{const p=C.referencePlan([work('w',{obraSeguimientoV2:{version:3,planificadoPorCalidad:true,produccionPrevista:'2026-11-02'}})],[reference()],[],at).updates[0].patch;assert.equal(p.fprod_c,undefined);assert.equal(p['obraSeguimientoV2.produccionPrevista'],undefined);assert.equal(p.estado,'Cobrado');});
test('CT repetida en otro cliente queda sin vincular, sin cruzar montos o datos',()=>{const p=C.referencePlan([work()],[reference({cliente:'Desconocido'})],[],at);assert.equal(p.updates.length,0);assert.equal(p.unmatched.length,1);});
test('resuelve nombres comerciales observados y alias fiscales de Clientes',()=>{const p=C.referencePlan([work('a',{cliente:'Kpl Constructora'})],[reference({cliente:'KPL'})],[],at);assert.equal(p.updates.length,1);const q=C.referencePlan([work('b',{cliente:'Nombre fiscal',clienteId:'cl'})],[reference({cliente:'Nombre comercial'})],[{id:'cl',nombre:'Nombre comercial',razonSocial:'Nombre fiscal'}],at);assert.equal(q.updates.length,1);});
test('lee columnas por encabezado y conserva el número de fila; fechas previstas no usan columnas reales',()=>{const h=['Status','Cliente','F Col','F Real de Prod','OT/CT','Descripcion de la obra','Fecha','Sem','F de Prod'],r=['Cobrado','ASM SA','01/11/26','25/10/26','4781','Miniso','19/10/26',43,'30/10/26'];const [x]=C.references({rows:[h,r],firstRow:2});assert.equal(x.row,3);assert.equal(x.produccionPrevista,'2026-10-30');assert.equal(x.colocacionPrevista,'2026-11-01');assert.equal(x.fechaAlta,'2026-10-19');assert.throws(()=>C.references({rows:[['OT/CT','OT']],firstRow:2}));});
test('Calidad puede reprogramar; reprogramar invalida aprobaciones anteriores',()=>{const old=work('w',{obraSeguimientoV2:{version:1,produccionPrevista:'2026-10-30',colocacionPrevista:'2026-11-01',calidadAprobada:true,produccionPlanificada:true}}),p=C.trackingPatch(old,{produccionPrevista:'2026-10-31',avisoDias:1,reprogramacionMotivo:'materiales',reprogramacionDetalle:'Entrega de acrílico demorada'},quality,at,today);assert.equal(p.obraSeguimientoV2.calidadAprobada,false);assert.equal(p.obraSeguimientoV2.produccionPlanificada,false);assert.equal(p.obraSeguimientoV2.version,2);assert.equal(p.obraSeguimientoV2.planificadoPorCalidad,true);assert.equal(p.fprod_c,'2026-10-31');assert.equal(p['gestionSectores.produccion.compromiso'],'2026-10-31');});
test('Pablo confirma el plan y la fecha real; Compras no cambia fechas previstas ni aprobación',()=>{const p=C.trackingPatch(work(),{produccionPlanificada:true,produccionReal:'2026-10-29'},production,at,today);assert.equal(p.fprod_r,'2026-10-29');assert.equal(p.obraSeguimientoV2.produccionPlanificadaPor,production.email);assert.throws(()=>C.trackingPatch(work(),{produccionPrevista:'2026-10-31'},other,at,today),/Calidad/);assert.throws(()=>C.trackingPatch(work(),{calidadAprobada:true},other,at,today),/Calidad/);});
test('no admite fechas reales futuras ni producción prevista posterior a colocación',()=>{assert.throws(()=>C.trackingPatch(work(),{produccionReal:'2026-10-30'},quality,at,today),/futuras/);assert.throws(()=>C.trackingPatch(work(),{produccionPrevista:'2026-11-02'},quality,at,today),/después/);});
test('los avisos respetan el día de anticipación y se apagan al confirmar las verificaciones',()=>{const g=C.grouped([work('w',{fprod_c:'2026-10-31',fcol_c:'2026-11-01',obraSeguimientoV2:{avisoDias:1}})])[0];assert.equal(C.alerts(g,today).length,0);g.seguimiento.avisoDias=2;assert.ok(C.alerts(g,today).some(a=>a.kind==='produccion'));g.seguimiento.produccionPlanificada=true;g.seguimiento.calidadAprobada=true;assert.equal(C.alerts(g,today).length,0);});
test('después de la colocación pide cierre; conserva retrabajo aun después de resolverlo',()=>{const g=C.grouped([work('w',{fprod_c:'2026-10-25',fcol_c:'2026-10-27'})])[0];assert.ok(C.alerts(g,today).some(a=>a.kind==='cierre'));const p=C.trackingPatch(g.members[0],{cierreResultado:'retrabajo',cierreFecha:'2026-10-28',retrabajoDetalle:'Rehacer fijación',retrabajoResuelto:true,retrabajoResueltoFecha:'2026-10-29'},quality,at,today);assert.equal(p.obraSeguimientoV2.cierreResultado,'retrabajo');assert.throws(()=>C.trackingPatch({...g.members[0],obraSeguimientoV2:p.obraSeguimientoV2},{cierreResultado:'ok'},quality,at,today),/Conservá/);});
test('cierre exige fecha, evidencia escrita del retrabajo y cronología consistente',()=>{assert.throws(()=>C.trackingPatch(work(),{cierreResultado:'ok',cierreFecha:'2026-10-29'},quality,at,today),/anterior/);assert.throws(()=>C.trackingPatch(work('w',{fprod_c:'2026-10-26',fcol_c:'2026-10-28'}),{cierreResultado:'retrabajo',cierreFecha:'2026-10-29'},quality,at,today),/Describí/);});
test('no presume aprobación ni cumplimiento en históricos cobrados; indicadores sólo con registros reales',()=>{const all=C.grouped([work('w',{estado:'Cobrado',fprod_c:'2026-01-01',fcol_c:'2026-01-02'}),work('v',{ot:'4782',obraSeguimientoV2:{produccionReal:'2026-10-29'}})]);assert.equal(C.alerts(all.find(g=>g.id==='w'),today).length,0);const m=C.metrics(all);assert.equal(m.produccionesConFechaReal,1);assert.equal(m.produccionesEnFecha,1);assert.equal(m.cerradasOk,0);});
test('un estado vacío en la referencia no transforma una obra existente en pendiente',()=>{const p=C.referencePlan([work('w',{estado:'Cobrado'})],[reference({estado:''})],[],at).updates[0].patch;assert.equal(p.estado,undefined);});
test('Calidad no puede confirmar aprobación mientras existan anomalías pendientes',()=>{assert.throws(()=>C.trackingPatch(work('w',{calidadGestion:{registros:{q1:{estado:'Pendiente'}}}}),{calidadAprobada:true},quality,at,today),/observaciones pendientes/);});
test('retrabajo conserva sólo el aviso de resolución y no repite controles ya superados',()=>{const g=C.grouped([work('w',{fprod_c:'2026-10-25',fcol_c:'2026-10-27',obraSeguimientoV2:{cierreResultado:'retrabajo',cierreFecha:'2026-10-28',retrabajoDetalle:'Fijación'}})])[0];assert.deepEqual(C.alerts(g,today).map(a=>a.kind),['retrabajo']);});

test('distingue vencida sin registro de ejecución y completada con atraso; el atraso cerrado no sigue creciendo',()=>{
 const g=C.grouped([work('w',{fprod_c:'2026-10-25',fcol_c:'2026-10-27',obraSeguimientoV2:{produccionReal:'2026-10-28'}})])[0];
 const rows=C.deadlines([g],today);assert.deepEqual(rows.map(r=>[r.phase,r.status,r.atrasoDias]),[['produccion','atrasada',3],['colocacion','vencida',2]]);
 assert.equal(C.deadlines([g],'2026-11-10')[0].atrasoDias,3);assert.equal(C.deadlines([g],'2026-11-10')[1].atrasoDias,14);
});
test('fecha de hoy no está vencida y una ejecución anticipada cuenta en fecha',()=>{
 const g=C.grouped([work('w',{fprod_c:today,fcol_c:'2026-10-30'})])[0];assert.deepEqual(C.deadlines([g],today).map(r=>r.status),['hoy','prevista']);
 g.seguimiento.produccionReal='2026-10-28';g.seguimiento.colocacionReal='2026-10-30';assert.ok(C.deadlines([g],today).every(r=>r.status==='en-fecha'&&r.atrasoDias===0));
});
test('aprobar Calidad y planificar Producción no apaga un vencimiento sin fecha real',()=>{
 const g=C.grouped([work('w',{fprod_c:'2026-10-25',fcol_c:'2026-10-27',obraSeguimientoV2:{produccionPlanificada:true,calidadAprobada:true,planificadoPorCalidad:true}})])[0];
 assert.ok(C.alerts(g,today).some(a=>a.kind==='produccion-vencida'));assert.ok(C.alerts(g,today).some(a=>a.kind==='colocacion-vencida'));
 g.seguimiento.produccionReal='2026-10-29';assert.equal(C.alerts(g,today).some(a=>a.kind==='produccion-vencida'),false);assert.equal(C.deadlines([g],today)[0].status,'atrasada');
});
test('históricos cobrados o cerrados sin fecha real quedan sin evaluar; no se presume atraso ni cumplimiento',()=>{
 for(const extra of [{estado:'Cobrado',obraSeguimientoV2:{version:4}},{obraSeguimientoV2:{cierreResultado:'ok'}}]){
  const g=C.grouped([work('w',{fprod_c:'2026-01-01',fcol_c:'2026-01-02',...extra})])[0];assert.ok(C.deadlines([g],today).every(r=>r.status==='sin-fecha-real'));assert.equal(C.alerts(g,today).length,0);
  g.seguimiento.produccionReal='2026-01-03';assert.equal(C.deadlines([g],today)[0].status,'atrasada');
 }
});
test('fechas asumidas por Calidad se controlan aun si la obra está cobrada',()=>{
 const g=C.grouped([work('w',{estado:'Cobrado',fprod_c:'2026-10-25',obraSeguimientoV2:{planificadoPorCalidad:true}})])[0];assert.equal(C.deadlines([g],today)[0].status,'vencida');assert.ok(C.alerts(g,today).some(a=>a.kind==='produccion-vencida'));
});
test('atraso usa días corridos al cruzar mes y año bisiesto; no inventa una previsión ausente',()=>{
 const g={id:'x',seguimiento:{},produccionPrevista:'2024-02-28',colocacionPrevista:''};assert.equal(C.deadlines([g],'2024-03-01')[0].atrasoDias,2);assert.equal(C.deadlines([g],today).length,1);
});
test('una obra nueva aparece en el mismo listado agrupado sin mantener otra lista',()=>{
 const works=[work()];assert.equal(C.grouped(works).length,1);works.push(work('new',{ot:'4800',fechaAltaObra:today,semanaVenta:44}));const g=C.grouped(works).find(g=>g.id==='new');assert.equal(g.ot,'4800');assert.equal(g.fechaAlta,today);assert.equal(g.semana,44);
});

