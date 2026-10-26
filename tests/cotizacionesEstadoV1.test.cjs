'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),sector=fs.readFileSync(require.resolve('../sectorizacionV35.js'),'utf8');
function fixture(){
 const fields=new Map(),writes=[],syncs=[],timers=[];
 function field(id){if(!fields.has(id))fields.set(id,{value:'',style:{},classList:{add(){},remove(){}}});return fields.get(id);}
 const approved={id:'approved',nro:'4800',revision:'1.1',estado:'Aprobado',cliente:'A',desc:'Cartel A',fecha:'01/10/2026',vendedor:'J',moneda:'USD',anticipoPct:0,diasPago:30,plazoEstimado:'10 días',oc:'OC A',observacionesComerciales:'Nota A',items:[{desc:'Cartel',precio:100,cant:1}]};
 const window={DB:{presupuestos:[approved],obras:[]},editingId:{},currentUser:{email:'info@tizpublicidad.com'},normalizarRevisionV354:r=>r,siguienteRevisionV354:r=>r.split('.')[0]+'.'+(Number(r.split('.')[1])+1),tizNumeroBase:v=>String(Number(v)),tizCotizacionNombreBaseV354:()=>'',showToast(){},collectCalculosAuxPP:()=>[],sincronizarBaseMadreBackendV120:async p=>syncs.push(p),addDoc_:async(col,data)=>{const id='new-'+writes.length;writes.push({col,id,data});window.DB[col].push({id,...data});return {id}},updateDoc_:async(col,id,data)=>{writes.push({col,id,data});Object.assign(window.DB[col].find(x=>x.id===id)||{},data)}};
 let logistics={};const context={window,document:{getElementById:field},console,Date,Math,setTimeout:f=>timers.push(f),normalizarRevisionV354:r=>r,renderPPItems(){},renderCalculosAuxPP(){},actualizarIdentificacionCotizacionV354(){},showToast(){},val:id=>field(id).value,normEstado:v=>v||'Pendiente',validarLogisticaCotizacion:()=>true,cargarEntregaLogisticaPP:data=>{logistics=data.entregaLogistica||{}},entregaLogisticaActual:()=>logistics,recordarContactoEntregaCliente:async()=>{},alert(){}};
 vm.runInNewContext(html.slice(html.indexOf('window.abrirNuevoPresupuestoCompleto ='),html.indexOf('window.guardarPresupuestoCompleto ='))+html.slice(html.indexOf('window.abrirRevisionCotizacionV354 ='),html.indexOf('window.crearNuevaRevisionV354 =')),context);
 window.guardarPresupuestoCompleto=async()=>{throw Error('No debería usarse el guardado antiguo con datos válidos')};
 const start=sector.indexOf('  function patchPresupuestoFunctions(){'),end=sector.indexOf('\n  function bloquearGeneracionDuplicada()',start);
 vm.runInNewContext(sector.slice(start,end)+'\npatchPresupuestoFunctions();',context);
 return {window,fields,field,writes,syncs,timers,approved};
}
test('abrir una cotización pendiente después de una aprobada restaura el estado y los datos comerciales antes de guardar',async()=>{
 for(const estado of ['Borrador','Pendiente','Enviado','En revisión','Rechazado','Vencido']){
  const f=fixture(),p={id:'pending',nro:'4801',revision:'1.1',estado,cliente:'B',desc:'Cartel B',fecha:'02/10/2026',items:[{desc:'Cartel B',precio:200,cant:1}],anticipoPct:0,diasPago:0};f.window.DB.presupuestos.push(p);
  f.window.abrirRevisionCotizacionV354('approved');assert.equal(f.field('pp-estado').value,'Aprobado');
  f.window.abrirRevisionCotizacionV354('pending');assert.equal(f.field('pp-estado').value,estado);assert.equal(f.field('pp-fecha').value,p.fecha);assert.equal(f.field('pp-anticipo').value,'0');assert.equal(f.field('pp-dias-pago').value,'0');assert.equal(f.field('pp-oc').value,'');assert.equal(f.field('pp-obs-comercial').value,'');
  f.field('pp-desc').value='Cartel modificado';await f.window.guardarPresupuestoCompleto();assert.equal(p.estado,estado);assert.equal(p.desc,'Cartel modificado');assert.equal(f.writes.length,1);assert.equal(f.writes[0].col,'presupuestos');assert.equal(f.syncs.length,0);assert.equal(f.window.DB.obras.length,0);assert.equal(f.timers.length,0);
 }
});
test('una nueva revisión de una aprobada empieza como borrador y conserva la revisión original',async()=>{
 const f=fixture();f.window.abrirRevisionCotizacionV354('approved',true);assert.equal(f.field('pp-estado').value,'Borrador');assert.equal(f.field('pp-revision').value,'1.2');assert.equal(f.field('pp-vendedor').value,'J');assert.equal(f.field('pp-moneda').value,'USD');assert.equal(f.field('pp-oc').value,'OC A');
 await f.window.guardarPresupuestoCompleto();assert.equal(f.approved.estado,'Aprobado');assert.equal(f.window.DB.presupuestos.length,2);assert.equal(f.window.DB.presupuestos[1].estado,'Borrador');assert.equal(f.window.DB.presupuestos[1].revision,'1.2');assert.equal(f.syncs.length,0);assert.equal(f.window.DB.obras.length,0);
});
test('una cotización nueva limpia el aprobado anterior y no programa reinicios tardíos del formulario',()=>{
 const f=fixture();f.window.abrirRevisionCotizacionV354('approved');f.window.abrirNuevoPresupuestoCompleto();assert.equal(f.field('pp-estado').value,'Borrador');assert.equal(f.field('pp-oc').value,'');assert.equal(f.field('pp-moneda').value,'ARS');assert.equal(f.timers.length,0);
});
test('elegir Aprobado explícitamente sigue creando la obra y sincronizando Base Madre',async()=>{
 const f=fixture(),p={...f.approved,id:'pending',nro:'4801',estado:'Enviado'};f.window.DB.presupuestos.push(p);f.window.abrirRevisionCotizacionV354('pending');f.field('pp-estado').value='Aprobado';await f.window.guardarPresupuestoCompleto();assert.equal(p.estado,'Aprobado');assert.equal(f.window.DB.obras.length,1);assert.equal(f.window.DB.obras[0].ot,'4801');assert.equal(f.syncs.length,1);
});
test('editar una aprobada mantiene su estado y la opción Pendiente existe para cotizaciones anteriores',()=>{
 const f=fixture();f.window.abrirRevisionCotizacionV354('approved');assert.equal(f.field('pp-estado').value,'Aprobado');assert.match(sector,/<option>Pendiente<\/option>/);
});

test('No facturable se conserva en edición/revisión y se limpia en un presupuesto nuevo',()=>{
 const f=fixture();f.approved.noFacturable=true;f.window.abrirRevisionCotizacionV354('approved');assert.equal(f.field('pp-no-facturable').checked,true);f.window.abrirRevisionCotizacionV354('approved',true);assert.equal(f.field('pp-no-facturable').checked,true);f.window.abrirNuevoPresupuestoCompleto();assert.equal(f.field('pp-no-facturable').checked,false);
});
test('aprobar No facturable propaga la condición a obra y deja auditoría; destildar la revierte',async()=>{
 const f=fixture();f.window.abrirRevisionCotizacionV354('approved');f.field('pp-no-facturable').checked=true;await f.window.guardarPresupuestoCompleto();assert.equal(f.approved.noFacturable,true);assert.equal(f.window.DB.obras[0].noFacturable,true);assert.equal(f.approved.historialFacturabilidad[0].nuevo,true);assert.equal(f.syncs[0].noFacturable,true);
 f.field('pp-no-facturable').checked=false;await f.window.guardarPresupuestoCompleto();assert.equal(f.approved.noFacturable,false);assert.equal(f.window.DB.obras[0].noFacturable,false);assert.equal(f.approved.historialFacturabilidad.length,2);
});

test('una obra con comprobantes no cambia de condición ni guarda el presupuesto',async()=>{
 const f=fixture();f.window.DB.obras.push({id:'o',ot:'4800',presupuestoId:'approved'});f.window.TIZFacturacionCobranzasDataV2={build:()=>({workItems:[{obraId:'o',invoices:[{numeroCompleto:'1234'}]}]})};f.window.abrirRevisionCotizacionV354('approved');f.field('pp-no-facturable').checked=true;await f.window.guardarPresupuestoCompleto();assert.equal(f.writes.length,0);assert.equal(f.approved.noFacturable,undefined);assert.equal(f.window.__tizPresupuestoGuardando,false);
});
