'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),sector=fs.readFileSync(require.resolve('../sectorizacionV35.js'),'utf8');
function fixture(){
 const fields=new Map(),writes=[],syncs=[],timers=[];
 function field(id){if(!fields.has(id))fields.set(id,{value:'',style:{},classList:{add(){},remove(){}}});return fields.get(id);}
 const approved={id:'approved',nro:'4800',revision:'1.1',estado:'Aprobado',cliente:'A',desc:'Cartel A',fecha:'01/10/2026',vendedor:'J',moneda:'USD',anticipoPct:0,diasPago:30,plazoEstimado:'10 días',oc:'OC A',observacionesComerciales:'Nota A',items:[{desc:'Cartel',precio:100,cant:1}]};
 const window={TIZInsumosCotizacionCoreV1:require('../functions/insumosCotizacionCoreV1'),TIZInsumosCotizacionV1:{open(){},canApprove:()=>true,saveFields:()=>({})},TIZPresupuestoEmisorV1:require('../presupuestoEmisorV1'),DB:{presupuestos:[approved],obras:[]},editingId:{},currentUser:{email:'info@tizpublicidad.com'},normalizarRevisionV354:r=>r,siguienteRevisionV354:r=>r.split('.')[0]+'.'+(Number(r.split('.')[1])+1),tizNumeroBase:v=>String(Number(v)),tizCotizacionNombreBaseV354:()=>'',showToast(){},collectCalculosAuxPP:()=>[],sincronizarBaseMadreBackendV120:async p=>syncs.push(p),addDoc_:async(col,data)=>{const id='new-'+writes.length;writes.push({col,id,data});window.DB[col].push({id,...data});return {id}},updateDoc_:async(col,id,data)=>{writes.push({col,id,data});Object.assign(window.DB[col].find(x=>x.id===id)||{},data)}};
 let logistics={};const context={window,document:{getElementById:field},console,Date,Math,setTimeout:f=>timers.push(f),normalizarRevisionV354:r=>r,renderPPItems(){},renderCalculosAuxPP(){},actualizarIdentificacionCotizacionV354(){},showToast(){},val:id=>field(id).value,normEstado:v=>v||'Pendiente',validarLogisticaCotizacion:()=>true,cargarEntregaLogisticaPP:data=>{logistics=data.entregaLogistica||{}},entregaLogisticaActual:()=>logistics,recordarContactoEntregaCliente:async()=>{},alert(){}};
 vm.runInNewContext(html.slice(html.indexOf('window.abrirNuevoPresupuestoCompleto ='),html.indexOf('window.guardarPresupuestoCompleto ='))+html.slice(html.indexOf('window.abrirRevisionCotizacionV354 ='),html.indexOf('window.crearNuevaRevisionV354 =')),context);
 window.guardarPresupuestoCompleto=async()=>{throw Error('No debería usarse el guardado antiguo con datos válidos')};
 const start=sector.indexOf('  function patchPresupuestoFunctions(){'),end=sector.indexOf('\n  function bloquearGeneracionDuplicada()',start);
 vm.runInNewContext(sector.slice(start,end)+'\npatchPresupuestoFunctions();',context);
 return {window,fields,field,writes,syncs,timers,approved,context};
}
test('aprobar una cotización antigua crea la obra con alta y semana de aprobación, conservando fecha de cotización',async()=>{
 const f=fixture(),add=f.window.addDoc_;f.window.addDoc_=async(col,data)=>{if(col==='presupuestos'&&data.estado==='Aprobado')data.fechaAprobacion='2026-11-07T01:30:00Z';return add(col,data);};
 f.window.abrirNuevoPresupuestoCompleto();f.field('pp-nro').value='4810';f.field('pp-cliente').value='Cliente';f.field('pp-desc').value='Solo impresión';f.field('pp-fecha').value='01/10/2026';f.field('pp-estado').value='Aprobado';f.window.ppItems=[{desc:'Impresión',precio:4000,cant:3.2}];
 await f.window.guardarPresupuestoCompleto();const obra=f.window.DB.obras[0];assert.ok(obra);assert.equal(obra.fechaAltaObra,'2026-11-06');assert.equal(obra.fecha,'2026-11-06');assert.equal(obra.semanaVenta,45);assert.equal(obra.infoPresupuesto.fechaCotizacion,'01/10/2026');
});
test('abrir una cotización pendiente después de una aprobada restaura el estado y los datos comerciales antes de guardar',async()=>{
 for(const estado of ['Borrador','Enviado']){
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
test('Estado comercial tiene sólo Borrador, Enviado, Aprobado y Baja; Obras mantiene sus estados',()=>{
 const f=fixture();f.window.abrirRevisionCotizacionV354('approved');assert.equal(f.field('pp-estado').value,'Aprobado');const select=sector.match(/<select id="pp-estado">([\s\S]*?)<\/select>/)[1];assert.deepEqual([...select.matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map(m=>m[1]),['Borrador','Enviado','Aprobado','Baja']);const C=require('../functions/obrasSeguimientoCoreV2');assert.deepEqual(C.EDITABLE_STATES,['Pendiente','Entregado','Cobrado pendiente','Cobrado']);
});

test('Cotizaciones bloquea aprobar sin revisión de materiales o si el módulo no está disponible',async()=>{
 for(const missing of [false,true]){const f=fixture();f.window.abrirRevisionCotizacionV354('approved');if(missing)delete f.window.TIZInsumosCotizacionV1;else f.window.TIZInsumosCotizacionV1.canApprove=()=>false;await f.window.guardarPresupuestoCompleto();assert.equal(f.writes.length,0);assert.equal(f.syncs.length,0);assert.equal(f.window.DB.obras.length,0);}
});

test('los guardados nuevos y las revisiones nuevas reciben Favaloro; editar uno anterior conserva Perón',async()=>{
 const f=fixture();f.window.abrirNuevoPresupuestoCompleto();f.field('pp-cliente').value='Nuevo';f.window.ppItems=[{desc:'Cartel',precio:100,cant:1}];await f.window.guardarPresupuestoCompleto();assert.match(f.writes.at(-1).data.emisorComercial.direccion,/Favaloro/);
 f.window.abrirRevisionCotizacionV354('approved');await f.window.guardarPresupuestoCompleto();assert.match(f.approved.emisorComercial.direccion,/Perón/);
 f.window.abrirRevisionCotizacionV354('approved',true);await f.window.guardarPresupuestoCompleto();const newer=f.window.DB.presupuestos.find(p=>p.nro==='4800'&&p.revision==='1.2');assert.match(newer.emisorComercial.direccion,/Favaloro/);assert.match(f.approved.emisorComercial.direccion,/Perón/);
});
test('nueva cotización propone A; guardar B y reabrir conserva la elección por trabajo',async()=>{
 const f=fixture();f.window.abrirNuevoPresupuestoCompleto();assert.equal(f.field('pp-tipo-factura').value,'A');f.field('pp-tipo-factura').value='B';f.field('pp-cliente').value='Cliente B';f.window.ppItems=[{desc:'Trabajo B',precio:100,cant:1}];await f.window.guardarPresupuestoCompleto();const p=f.window.DB.presupuestos.at(-1);assert.equal(p.tipoFacturaSolicitada,'B');f.window.abrirRevisionCotizacionV354(p.id);assert.equal(f.field('pp-tipo-factura').value,'B');f.window.abrirNuevoPresupuestoCompleto();assert.equal(f.field('pp-tipo-factura').value,'A');
});
test('revisión hereda la factura solicitada; cambiarla no altera la revisión de origen',async()=>{
 const f=fixture();f.approved.tipoFacturaSolicitada='A';f.window.abrirRevisionCotizacionV354('approved',true);assert.equal(f.field('pp-tipo-factura').value,'A');f.field('pp-tipo-factura').value='B';await f.window.guardarPresupuestoCompleto();assert.equal(f.approved.tipoFacturaSolicitada,'A');const next=f.window.DB.presupuestos.find(p=>p.revision==='1.2');assert.equal(next.tipoFacturaSolicitada,'B');f.window.abrirRevisionCotizacionV354(next.id,true);assert.equal(f.field('pp-tipo-factura').value,'B');
});
test('aprobación transmite B a la OT y Facturación sin cambiar importes ni registros fiscales',async()=>{
 const f=fixture();f.approved.tipoFacturaSolicitada='B';f.window.abrirRevisionCotizacionV354('approved');await f.window.guardarPresupuestoCompleto();const o=f.window.DB.obras[0];assert.equal(o.tipoFacturaSolicitada,'B');assert.equal(o.infoPresupuesto.tipoFacturaSolicitada,'B');assert.equal(o.gestionSectores.facturacion.tipoFacturaSolicitada,'B');assert.equal(o.neto,100);assert.equal(f.approved.importe,100);assert.equal(o.comprobantesArca,undefined);
});
test('presupuesto anterior sin elección queda A definir y no hereda B del abierto previamente',async()=>{
 const f=fixture();f.window.DB.presupuestos.push({...f.approved,id:'b',nro:'4801',tipoFacturaSolicitada:'B'});f.window.abrirRevisionCotizacionV354('b');assert.equal(f.field('pp-tipo-factura').value,'B');f.window.abrirRevisionCotizacionV354('approved');assert.equal(f.field('pp-tipo-factura').value,'');await f.window.guardarPresupuestoCompleto();assert.equal(f.approved.tipoFacturaSolicitada,'');
});
test('guardado y pase a producción numeran renglones válidos sin cambiar los precios',async()=>{
 const f=fixture();f.window.abrirNuevoPresupuestoCompleto();f.field('pp-cliente').value='Cliente';f.field('pp-estado').value='Aprobado';const items=[{desc:'Cartel',precio:100,cant:2},{desc:'',precio:0,cant:1},{desc:'Instalación',precio:50,cant:1}];f.window.ppItems=items;await f.window.guardarPresupuestoCompleto();const p=f.window.DB.presupuestos.at(-1),o=f.window.DB.obras[0];assert.deepEqual(Array.from(p.items,i=>i.orden),[1,2]);assert.equal(p.importe,250);assert.deepEqual(Array.from(o.itemsTecnicos,i=>i.orden),[1,2]);assert.equal(items[0].orden,undefined);assert.equal(items[0].precio,100);
});

test('los estados comerciales anteriores se presentan en las cuatro opciones sin agregar estados operativos',()=>{
 for(const [old,current] of [['Pendiente','Borrador'],['En revisión','Enviado'],['Rechazado','Baja'],['Vencido','Baja'],['Entregado','Aprobado'],['Cobrado pendiente','Aprobado'],['Cobrado','Aprobado']]){const f=fixture();f.approved.estado=old;f.window.abrirRevisionCotizacionV354('approved');assert.equal(f.field('pp-estado').value,current);assert.equal(f.approved.estado,old);}
});

function cancellationFixture({user={email:'giancarlo.pareja@tizpublicidad.com',isAdmin:true},fail=false,missing=false}={}){
 const core=require('../functions/obrasSeguimientoCoreV2'),p={id:'p',nro:'4800',cliente:'Cliente',estado:'Aprobado',obraId:missing?'missing':'a',importe:100},a={id:'a',ot:'4800',cliente:'Cliente',estado:'Pendiente',presupuestoId:'p',cobros:[{importe:50}]},b={id:'b',ot:'4800.2',cliente:'Cliente',estado:'Entregado'},other={id:'other',ot:'4800',cliente:'Otro',estado:'Pendiente'},rows=new Map([['presupuestos/p',p],...([a,b,other].map(w=>['obras/'+w.id,w]))].map(([k,v])=>[k,structuredClone(v)])),writes=[];
 const window={currentUser:user,TIZObrasSeguimientoCoreV2:core,DB:{presupuestos:[structuredClone(p)],obras:[]}},doc=(_,col,id)=>({id,col,path:col+'/'+id}),collection=(_,col)=>({col}),getDocs=async()=>({docs:[a,b,other].map(w=>({id:w.id,data:()=>structuredClone(w)}))});
 const runTransaction=async(_,fn)=>{const pending=[];let writing=false;const result=await fn({get:async ref=>{assert.equal(writing,false);return{exists:()=>rows.has(ref.path),data:()=>structuredClone(rows.get(ref.path))};},update:(ref,patch)=>{writing=true;pending.push({ref,patch});}});if(fail)throw Error('Sin conexión');for(const w of pending){Object.assign(rows.get(w.ref.path),w.patch);writes.push(w);}return result;};
 const start=html.indexOf('window.darBajaCotizacionV1 ='),end=html.indexOf('// Gestiones de Colocaciones:',start);vm.runInNewContext(html.slice(start,end),{window,doc,collection,getDocs,runTransaction,db:{},Set,Promise,Date});return{window,rows,writes};
}
test('Baja comercial cancela la cotización y todas sus obras en una transacción y conserva cobros',async()=>{
 const f=cancellationFixture();const r=await f.window.darBajaCotizacionV1('p','Cliente canceló el trabajo');assert.equal(f.writes.length,3);assert.equal(f.rows.get('presupuestos/p').estado,'Baja');assert.equal(f.rows.get('presupuestos/p').importe,100);assert.equal(f.rows.get('obras/a').estado,'Baja');assert.equal(f.rows.get('obras/b').archivado,true);assert.equal(f.rows.get('obras/other').estado,'Pendiente');assert.equal(f.rows.get('obras/a').cobros[0].importe,50);assert.equal(r.patches.length,2);assert.equal(f.window.DB.presupuestos[0].estado,'Baja');
});
test('fallo, vínculo faltante, motivo inválido o usuario sin permiso no dejan una baja parcial',async()=>{
 for(const options of [{fail:true},{missing:true},{user:{email:'pablo.aciar@tizpublicidad.com'}}]){const f=cancellationFixture(options);await assert.rejects(f.window.darBajaCotizacionV1('p','Cancelado por el cliente'));assert.equal(f.writes.length,0);assert.equal(f.rows.get('presupuestos/p').estado,'Aprobado');assert.equal(f.rows.get('obras/a').estado,'Pendiente');}
 const f=cancellationFixture();await assert.rejects(f.window.darBajaCotizacionV1('p','x'),/motivo/);assert.equal(f.writes.length,0);
});

test('guardar Baja pide motivo y usa la operación conjunta sin validar logística ni crear otra obra',async()=>{
 const f=fixture();f.window.abrirRevisionCotizacionV354('approved');f.field('pp-estado').value='Baja';f.context.prompt=()=> 'Cliente canceló';f.context.validarLogisticaCotizacion=()=>{throw Error('La baja no necesita logística');};let saved;f.window.darBajaCotizacionV1=async(id,motivo)=>{saved={id,motivo};};await f.window.guardarPresupuestoCompleto();assert.equal(saved.id,'approved');assert.equal(saved.motivo,'Cliente canceló');assert.equal(f.writes.length,0);assert.equal(f.syncs.length,0);assert.equal(f.window.__tizPresupuestoGuardando,false);
});
test('cerrar el motivo sin confirmar no modifica la cotización ni sus obras',async()=>{
 const f=fixture();f.window.abrirRevisionCotizacionV354('approved');f.field('pp-estado').value='Baja';f.context.prompt=()=>null;f.window.darBajaCotizacionV1=async()=>{throw Error('No debe guardar');};await f.window.guardarPresupuestoCompleto();assert.equal(f.approved.estado,'Aprobado');assert.equal(f.writes.length,0);
});
