const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),C=require('../functions/obrasSeguimientoCoreV2'),L=require('../obrasListadoV1');
const admin={isAdmin:true,email:'admin@test.local'},original=()=>({id:'traffic',ot:'4780',cliente:'Cliente',desc:'Traffic Fest',estado:'Aprobado',fprod_c:'2026-10-31',fcol_c:'2026-11-01',finanzas:{total:1000},presupuestoId:'p1',comprobantesArca:[{cbteTipo:1,ptoVta:9,cbteNro:1,numeroCompleto:'00009-00000001',neto:500,iva:105,total:605,cae:'12345678901234'}],cobros:[{id:'cob-1',importe:100,retenciones:20}],obraSeguimientoV2:{produccionReal:'2026-10-30'}});
test('baja auditada conserva documentos, importes y fechas; reactivar recupera estado y conserva auditorías',()=>{
 const o=original(),patch=C.bajaPatch(o,'Cliente canceló el evento',admin,false,'2026-10-30T15:00:00Z'),cancelled={...o,...patch};
 assert.equal(patch.estado,'Baja');assert.equal(patch.archivado,true);assert.equal(patch.bajaObra.usuario,admin.email);assert.equal(patch.bajaObra.estadoAnterior,'Aprobado');assert.equal(patch.historialBajaObra.length,1);
 assert.equal(cancelled.comprobantesArca,o.comprobantesArca);assert.equal(cancelled.cobros,o.cobros);assert.equal(cancelled.finanzas,o.finanzas);assert.equal(cancelled.fprod_c,o.fprod_c);
 const restored=C.bajaPatch(cancelled,'Cliente confirmó el evento nuevamente',admin,true);assert.equal(restored.estado,'Aprobado');assert.equal(restored.archivado,false);assert.equal(restored.bajaObra.activa,false);assert.equal(restored.historialBajaObra.length,2);assert.equal(C.isBaja({...cancelled,...restored}),false);
});
test('permisos, motivo y estado actual se validan antes de generar cambios',()=>{
 assert.throws(()=>C.bajaPatch(original(),'Cancelada',{email:'calidad@test.local'}),/administración/);
 for(const reason of ['','xx','x'.repeat(1001)])assert.throws(()=>C.bajaPatch(original(),reason,admin),/motivo/);
 assert.throws(()=>C.bajaPatch(original(),'Reactivar',admin,true),/ya está activa/);
 const o={...original(),...C.bajaPatch(original(),'Cancelada',admin)};assert.throws(()=>C.bajaPatch(o,'Cancelada',admin),/ya está dada/);assert.throws(()=>C.trackingPatch(o,{},admin),/dada de baja/);
});
test('Baja visible en Obras, fuera de producción, alertas, vencimientos e indicadores; una referencia no la reactiva',()=>{
 const o={...original(),...C.bajaPatch(original(),'Cancelada',admin)},groups=C.grouped([o]);assert.equal(groups.length,1);assert.equal(groups[0].estado,'Baja');assert.equal(C.alerts(groups[0]).length,0);assert.equal(C.deadlines(groups).length,0);assert.equal(C.metrics(groups).produccionesConFechaReal,0);
 const source=[{id:o.id,obraOperativaId:o.id,ot:o.ot,cliente:o.cliente,descripcion:o.desc}];assert.equal(L.production([o],source).length,0);
 const stale={...o,estado:'Aprobado'};assert.equal(C.grouped([stale])[0].estado,'Baja');assert.equal(L.production([stale],source).length,0);
 assert.equal(C.referencePlan([o],[{ot:o.ot,cliente:o.cliente,estado:'Pendiente',row:3}]).updates.length,0);
});
test('baja quita pendiente de facturar y mantiene saldo facturado, cobros y retenciones',()=>{
 const o={...original(),...C.bajaPatch(original(),'Cancelada',admin)},window={DB:{obras:[o],presupuestos:[{id:'p1',nro:o.ot,estado:'Aprobado',importe:1000}],clientes:[]}};vm.runInNewContext(fs.readFileSync(require.resolve('../facturacionCobranzasDataV2'),'utf8'),{window,Intl,Date});const w=window.TIZFacturacionCobranzasDataV2.build().workItems[0];assert.equal(w.porFacturar,0);assert.equal(w.porCobrar,485);assert.equal(w.facturadoTotal,605);assert.equal(w.cobrado,100);assert.equal(w.retenciones,20);assert.equal(w.estadoOperativo,'baja');
});
function transactionFixture(works,user=admin,failCommit=false){
 const rows=new Map(works.map(w=>[w.id,structuredClone(w)])),writes=[];const window={currentUser:user,TIZObrasSeguimientoCoreV2:C};
 const runTransaction=async(_db,fn)=>{const pending=[];const result=await fn({get:async ref=>({exists:()=>rows.has(ref.id),data:()=>structuredClone(rows.get(ref.id))}),update:(ref,patch)=>pending.push({id:ref.id,patch})});if(failCommit)throw Error('Sin conexión');for(const p of pending){Object.assign(rows.get(p.id),p.patch);writes.push(p)}return result};
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),start=html.indexOf('window.cambiarBajaObraV1 ='),end=html.indexOf('// Gestiones de Colocaciones:',start);vm.runInNewContext(html.slice(start,end),{window,db:{},doc:(_db,_c,id)=>({id}),runTransaction,Date,Set});return{window,rows,writes};
}
test('guarda filas agrupadas de la OT de forma atómica; no modifica otra obra',async()=>{
 const a=original(),b={...original(),id:'traffic-saldo',desc:'Saldo Traffic Fest'},other={...original(),id:'otra',ot:'4781'},h=transactionFixture([a,b,other]);await h.window.cambiarBajaObraV1([a.id,b.id],'Evento cancelado',false);assert.equal(h.writes.length,2);assert.equal(h.rows.get(a.id).estado,'Baja');assert.equal(h.rows.get(b.id).estado,'Baja');assert.equal(h.rows.get(other.id).estado,'Aprobado');assert.equal(h.rows.get(a.id).bajaObra.fecha,h.rows.get(b.id).bajaObra.fecha);
});
test('error al guardar o documento faltante no deja una baja parcial; usuario sin permiso no escribe',async()=>{
 const a=original();for(const [h,ids] of [[transactionFixture([a],admin,true),[a.id]],[transactionFixture([a],{}),[a.id]],[transactionFixture([a]),[a.id,'faltante']]]){await assert.rejects(h.window.cambiarBajaObraV1(ids,'Evento cancelado'));assert.equal(h.writes.length,0);assert.equal(h.rows.get(a.id).estado,'Aprobado');}
});
