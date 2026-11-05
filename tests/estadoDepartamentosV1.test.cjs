const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const C=require('../functions/obrasSeguimientoCoreV2'),Compras=require('../comprasObrasCoreV1'),Calidad=require('../calidadV1'),AP=require('../functions/analisisPreliminarCoreV1'),P=require('../obrasListadoV1');
const window={};vm.runInNewContext(fs.readFileSync(require.resolve('../colocacionesV128'),'utf8'),{window,Date,Intl,TextEncoder,console});const Col=window.TIZColocacionesCore;
const actor={email:'giancarlo.pareja@tizpublicidad.com'},src=status=>[{row:3,ot:'4806',cliente:'Iona',desc:'Portabanner',status,estado:status}],work={id:'o',ot:'4806',cliente:'Iona',desc:'Portabanner',estado:'Pendiente',estadoHistoricoExcel:'Cobrado',cobros:[{importe:5}],gestionSectores:{produccion:{estadoInterno:'En preparación'}}};
test('Cobrado o Entregado desde Obras no reaparece como pendiente por una fuente vieja',()=>{
 for(const estado of ['Cobrado','Entregado']){const w={...work,...C.statusPatch(work,estado,actor)},rows=src('Pendiente');assert.equal(Compras.merge(rows,[w]).length,0);assert.equal(Calidad.motherWorks(rows,[w]).length,0);assert.equal(AP.workList(rows,[w]).length,0);assert.equal(P.production([w],[{id:'o',ot:'4806'}]).length,0);assert.equal(Col.pendingInstallation(w),false);assert.equal(w.gestionSectores.produccion.estadoInterno,'En preparación');assert.deepEqual(w.cobros,work.cobros);}
});
test('reabrir Pendiente o Cobrado pendiente aparece en los departamentos aun con fuente Cobrado',()=>{
 for(const estado of ['Pendiente','Cobrado pendiente']){const w={...work,...C.statusPatch(work,estado,actor)},rows=src('Cobrado');assert.equal(Compras.merge(rows,[w])[0].estado,estado);assert.equal(Calidad.motherWorks(rows,[w])[0].status,estado);assert.equal(AP.workList(rows,[w]).length,1);assert.equal(P.production([w],[]).length,1);assert.equal(Col.pendingInstallation(w),true);}
});
test('actualizar referencia conserva el estado elegido en Obras y registra la fuente por separado',()=>{
 const w={...work,...C.statusPatch(work,'Entregado',actor)},r=C.referencePlan([w],src('Pendiente'));assert.equal(r.updates.length,1);assert.equal(r.updates[0].patch.estado,undefined);assert.equal(r.updates[0].patch.cobr,undefined);assert.equal(r.updates[0].patch.referenciaGoogle2026.estado,'Pendiente');
});
test('las filas de anticipo y saldo con el mismo estado vigente no reviven en Calidad',()=>{
 const a={...work,...C.statusPatch(work,'Entregado',actor)},b={...a,id:'saldo',desc:'Saldo'};
 assert.equal(Calidad.motherWorks(src('Pendiente'),[a,b]).length,0);
});
test('el portal restringido recibe el estado vigente sin exponer auditoría ni datos fiscales',()=>{
 const portal=require('../functions/colocacionesPortalV153'),w={...work,...C.statusPatch(work,'Pendiente',actor),neto:65000,cuit:'12345678901'},p=portal.projectWork(w);assert.equal(p.estadoDesdeObras,'Pendiente');assert.equal(p.neto,undefined);assert.equal(p.cuit,undefined);assert.equal(p.estadoGestionV1,undefined);assert.equal(Col.pendingInstallation(p),true);
});
