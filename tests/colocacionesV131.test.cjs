'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),G=require('../functions/colocacionesCoreV129');
const action=(fecha,estado='Pendiente')=>({id:'a',titulo:'Revisar anclajes',responsable:'Ariel',fecha,estado,todoDia:true});
test('bloquea anteayer y fechas anteriores, incluidos bloqueados; ayer, sin fecha y cerrados no bloquean',()=>{
 for(const day of ['2026-10-06','2026-09-30'])for(const status of ['Pendiente','Bloqueada'])assert.equal(G.overdue(action(day,status),'2026-10-08'),true);
 for(const a of [action('2026-10-07'),action('2026-10-08'),action(''),action('2026-10-05','Cerrada'),action('2026-10-05','Reprogramada')])assert.equal(G.overdue(a,'2026-10-08'),false);
 assert.equal(G.overdue(action('2026-12-30'),'2027-01-01'),true);
});
test('resolver conserva fecha original y exige motivo, fecha real y nueva fecha vigente',()=>{
 const old=action('2026-10-05'),result={detalle:'Faltó permiso de acceso',fechaReal:'2026-10-08'},next={...old,id:'next',fecha:'2026-10-09'};
 const r=G.resolveDraftAction(old,result,next,'2026-10-08','at','Ariel');assert.equal(r.closed.fecha,'2026-10-05');assert.equal(r.closed.estado,'Reprogramada');assert.equal(r.next.anteriorId,'a');assert.equal(G.overdue(r.next,'2026-10-08'),false);
 assert.throws(()=>G.resolveDraftAction(old,{...result,detalle:''},next,'2026-10-08','at','u'),/resultado/);
 for(const fecha of ['','2026-10-07'])assert.throws(()=>G.resolveDraftAction(old,result,{...next,fecha},'2026-10-08','at','u'));
 assert.throws(()=>G.resolveDraftAction({...old,estado:'Cerrada'},result,null,'2026-10-08','at','u'),/gestionada/);
 assert.equal(G.resolveDraftAction(old,result,null,'2026-10-08','at','u').closed.estado,'Cerrada');
});
function ui(doc){const window={DB:{obras:[],clientes:[],presupuestos:[]},TIZColocacionesGeneralCore:G};const c={window,console,Date,Intl,TextEncoder,setInterval:()=>{},setTimeout:()=>{}};vm.runInNewContext(fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),c);if(doc)c.document=doc;vm.runInNewContext(fs.readFileSync(path.join(root,'colocacionesGeneralUIV129.js'),'utf8'),c);return window;}
test('base contiene obras aprobadas sin acción ni fecha y mantiene acciones con y sin fecha',()=>{
 const w=ui();w.DB.obras=[{id:'1',ot:'4700',cliente:'A',estado:'Aprobado'},{id:'2',ot:'4701',cliente:'B',estado:'Aprobado',colocacionesGestion:{acciones:{a:action(''),b:{...action('2026-10-09'),id:'b'}}}},{id:'3',estado:'Rechazado'}];
 const rows=w.TIZColocacionesGeneralV129.baseRows();assert.equal(rows.length,3);assert.equal(rows.filter(r=>r.obra.id==='1'&&r.empty).length,1);assert.equal(rows.some(r=>r.obra.id==='3'),false);assert.equal(w.TIZColocacionesGeneralV129.entries().length,2);
 const html=w.TIZColocacionesGeneralV129.body('base');for(const text of ['Cotización / OT','Cliente','Fecha compromiso','4701','Tarea / operación'])assert.ok(html.includes(text));
});
test('calendario renderiza una semana de lunes a domingo y el bloqueo reemplaza la navegación',()=>{
 const source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8');const w=ui();
 const c={window:w,Date,Intl,console,TextEncoder};
 // Execute the actual render helpers with lightweight DOM bindings.
 const start=source.indexOf('  function agendaHTML()'),end=source.indexOf('  function overlay()',start);
 const node={innerHTML:''};w.currentUser={};w.canViewPage=()=>true;w.TIZColocacionesGeneralV129.attach=()=>{};w.TIZColocacionesGeneralV129.load=()=>{};
 vm.runInNewContext(source.slice(start,end)+'\nwindow.testRender=render;window.testAgenda=agendaHTML;',{...c,today:()=> '2026-10-08',shift:G.shift,fmtDate:x=>x,open:G.open,esc:x=>String(x||''),bucket:a=>a.fecha<'2026-10-08'?'vencidas':'proximas',chip:x=>x,canWrite:()=>true,canRead:()=>true,allWorks:()=>[],pending:()=>[],db:()=>w.DB,style:()=>{},pageRoot:()=>node,btn:(text,attr)=>`<button ${attr}>${text}</button>`,state:{view:'agenda'},renderList:()=>{}});
 w.testRender();assert.equal((node.innerHTML.match(/<section class="c128-day /g)||[]).length,8);assert.ok(node.innerHTML.includes('05/10/2026 al 11/10/2026'));assert.ok(node.innerHTML.includes('data-view="cumplimiento"'));
 w.DB.obras=[{id:'o',ot:'4700',estado:'Aprobado',colocacionesGestion:{acciones:{a:action('2026-10-06')}}}];w.testRender();assert.ok(node.innerHTML.includes('data-overdue="o/a"'));assert.ok(!node.innerHTML.includes('data-view='));
 w.DB.obras[0].colocacionesGestion.acciones.a.estado='Cerrada';w.testRender();assert.ok(node.innerHTML.includes('data-view="agenda"'));
});
test('resolver sin OT es transaccional y rechaza versiones viejas o identidad repetida',async()=>{
 const docs=new Map([['a',{...action('2026-10-05'),actualizadoEn:'v1'}]]),writes=[];
 const db={collection:()=>({doc:id=>({id})}),runTransaction:async fn=>{const pending=[];await fn({get:async ref=>({exists:docs.has(ref.id),data:()=>docs.get(ref.id)}),set:(ref,data)=>pending.push([ref.id,data])});for(const [id,data]of pending){docs.set(id,data);writes.push(id)}}};
 const source=fs.readFileSync(path.join(root,'functions/colocacionesGeneralV129.js'),'utf8'),exports={};
 vm.runInNewContext(source+'\nexports.resolveDraft=resolveDraft;',{exports,Date,Intl,Buffer,Set,Map,require:n=>n==='firebase-admin'?{apps:[{}]}:n==='googleapis'?{google:{}}:n==='pdfkit'?class{}:n==='./colocacionesCoreV129'?G:require(n)});
 const body={id:'a',version:'v1',result:{detalle:'Resuelto',fechaReal:'2026-10-08'}};
 await assert.rejects(exports.resolveDraft(db,{...body,version:'old'},'u'),/cambió/);assert.equal(writes.length,0);
 await assert.rejects(exports.resolveDraft(db,{...body,next:{...action('2099-01-01'),id:'a'}},'u'),/identidad/);assert.equal(writes.length,0);
 await exports.resolveDraft(db,body,'u');assert.equal(docs.get('a').estado,'Cerrada');assert.equal(docs.get('a').fecha,'2026-10-05');
 await assert.rejects(exports.resolveDraft(db,{...body,version:docs.get('a').actualizadoEn},'u'),/gestionada/);
});

test('preparación exige datos y controles previos según modalidad, sin exigir fotos finales antes de salir',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129,r={key:'o/a',obra:{id:'o',colocacionesGestion:{modalidad:'Propia',zona:'CABA',contactos:{c:{id:'c',nombre:'Ana',telefono:'123'}}}},accion:{...action('2026-10-09'),tipo:'Colocación',direccion:'Córdoba 1000, CABA'}};
 assert.ok(g.preparation(r).includes('Producción liberada'));assert.ok(g.preparation(r).includes('Cuadrilla / recursos'));assert.ok(!g.preparation(r).includes('Fotos finales'));
 r.obra.colocacionesGestion.preparacion=Object.fromEntries(['relevamiento','planos','acceso','produccion','kit','cuadrilla'].map(k=>[k,{estado:'Listo'}]));assert.equal(g.preparation(r).length,0);
 r.obra.colocacionesGestion.modalidad='Externa';assert.ok(g.preparation(r).includes('Recepción de planos'));assert.ok(!g.preparation(r).includes('Cuadrilla / recursos'));
 r.obra.colocacionesGestion.preparacion.recibido={estado:'No corresponde',detalle:''};assert.ok(g.preparation(r).includes('Recepción de planos'));r.obra.colocacionesGestion.preparacion.recibido.detalle='No requiere planos';assert.ok(!g.preparation(r).includes('Recepción de planos'));
 r.accion.estado='Cerrada';assert.equal(g.preparation(r).length,0);
});
test('cruces comparan el responsable en toda la base, incluyen medianoche y omiten días completos y tareas cerradas',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129,row=(id,fecha,hora,duracion,responsable='Ariel',extra={})=>({key:id,obra:{},accion:{...action(fecha),todoDia:false,hora,duracion,responsable,...extra}}),rows=[row('a','2026-10-09','09:00',60),row('b','2026-10-09','09:30',60,' ariel '),row('c','2026-10-09','10:30',30),row('d','2026-10-09','09:30',60,'Otro'),row('e','2026-10-09','09:30',60,'Ariel',{estado:'Cerrada'}),row('f','2026-10-09','09:30',60,'Ariel',{todoDia:true})];
 const clashes=g.conflicts(rows);assert.deepEqual([...clashes.keys()],['a','b']);assert.deepEqual(Array.from(clashes.get('a')),['b']);
 assert.equal(g.conflicts([row('x','2026-10-09','23:30',90),row('y','2026-10-10','00:15',30)]).size,2);
 assert.equal(g.conflicts([row('x','2026-10-09','09:00',60),row('y','2026-10-10','09:00',30)]).size,0);
});
test('base y calendario comparten acciones, separan sin fecha y ordenan los horarios; render escapa datos',()=>{
 const w=ui();w.DB.obras=[{id:'o',ot:'123',cliente:'<img src=x>',estado:'Aprobado',colocacionesGestion:{acciones:{a:{...action('2026-10-09'),id:'a',todoDia:false,hora:'15:00',duracion:60},b:{...action('2026-10-09'),id:'b',todoDia:false,hora:'09:00',duracion:30},c:{...action(''),id:'c'},d:{...action('2026-10-09','Cerrada'),id:'d'}}}},{id:'empty',estado:'Aprobado'}];
 w.canViewPage=()=>true;w.canAnnotateSector=()=>true;const g=w.TIZColocacionesGeneralV129,before=JSON.stringify(w.DB);assert.equal(g.baseRows().length,5);assert.deepEqual(Array.from(g.calendarRows(),r=>r.accion.id),['b','a']);const html=g.body();assert.ok(html.includes('Sin fecha'));assert.equal((html.match(/data-open="o"/g)||[]).length,1);assert.ok(!html.includes('data-open="empty"'));assert.ok(html.includes('data-g-action="o/a"'));assert.ok(html.includes('&lt;img src=x&gt;'));assert.ok(!html.includes('<img src=x>'));g.conflicts();g.preparation(g.baseRows()[0]);assert.equal(JSON.stringify(w.DB),before);
});
test('buscar una acción filtra el listado sin ocultar los compromisos de otras obras por fecha',()=>{
 const nodes={'g129-style':{},'g134-actions':{innerHTML:''}},events={},w=ui({getElementById:id=>nodes[id]});w.DB.obras=[{id:'one',ot:'123',cliente:'Uno',estado:'Aprobado',colocacionesGestion:{acciones:{a:action('2026-10-09')}}},{id:'two',ot:'124',cliente:'Dos',estado:'Aprobado',colocacionesGestion:{acciones:{b:{...action('2026-10-09'),id:'b'}}}}];const g=w.TIZColocacionesGeneralV129;g.attach({addEventListener:(type,fn)=>{events[type]=fn}});events.input({target:{id:'g134-query',value:'Uno'}});assert.ok(nodes['g134-actions'].innerHTML.includes('data-g-action="one/a"'));assert.ok(!nodes['g134-actions'].innerHTML.includes('data-g-action="two/b"'));assert.equal(g.calendarRows().length,2);
});
test('la importación conserva todas las columnas operativas y no asocia por nombre del cliente',()=>{
 const w=ui(),headers=['Semana','Fecha','Día','Obra / OT','Cliente','Tarea / Operación','Responsable','Sector / Máquina','Prioridad','Estado','Fecha compromiso','Fecha Real','Cant. real','Cumplimiento','Control de colocación','Retrabajo','Próxima acción / observaciones'],row=['41','08/10/2026','Jue','123','Cliente','Relevar','','Colocaciones','Alta','Bloqueada','12/10/2026','','','No','Aprobado','Sí','Llevar fotos'];const matrices={Colocaciones:[headers,row]},works=[{id:'one',ot:'123'},{id:'two',ot:'123'}],a=w.TIZColocacionesCore.parseImportRows(matrices,works)[0];assert.equal(a.obraId,'');assert.equal(a.estado,'Bloqueada');assert.equal(a.observaciones,'Llevar fotos');assert.equal(a.control,'Aprobado');assert.equal(a.datosPlanilla.length,headers.length);assert.equal(G.cleanAction(a).datosPlanilla.length,headers.length);assert.equal(a.responsable,'');assert.equal(a.fecha,'2026-10-12');
});
test('el formulario sencillo tiene una sola tarea, fecha y responsable y conserva los campos avanzados',()=>{
 const source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),start=source.indexOf('  function actionFields('),end=source.indexOf('  function taskHTML(',start),w={};vm.runInNewContext(source.slice(start,end)+'\nwindow.form=newActionForm({id:"o"});',{window:w,state:{editor:null},esc:x=>String(x||''),options:()=>'',contactOptions:()=>'',logistics:()=>({direccion:'Dirección heredada'}),db:()=>({}),data:()=>({}),btn:()=>'',allWorks:()=>[]});for(const name of ['titulo','fecha','responsable'])assert.equal((w.form.match(new RegExp('name="'+name+'"','g'))||[]).length,1);assert.ok(w.form.includes('Más detalles'));assert.ok(w.form.includes('name="todoDia"'));assert.ok(w.form.includes('name="fecha" value=""'));
});
test('importar una fila terminada sin OT conserva su estado y no inventa una fecha real',async()=>{
 const docs=new Map(),db={collection:()=>({doc:id=>({id})}),runTransaction:async fn=>{const writes=[];await fn({get:async ref=>({exists:docs.has(ref.id),data:()=>docs.get(ref.id)}),set:(ref,data)=>writes.push([ref.id,data])});for(const [id,data]of writes)docs.set(id,data)}},source=fs.readFileSync(path.join(root,'functions/colocacionesGeneralV129.js'),'utf8'),exports={};vm.runInNewContext(source+'\nexports.saveDraftTest=saveDraft;',{exports,Date,Intl,Buffer,Set,Map,require:n=>n==='firebase-admin'?{apps:[{}]}:n==='googleapis'?{google:{}}:n==='pdfkit'?class{}:n==='./colocacionesCoreV129'?G:require(n)});await exports.saveDraftTest(db,{action:{...action('2026-10-06','Cerrada'),origen:'Planilla',datosPlanilla:[['Estado','Terminada'],['Fecha Real','06/10']]}},'Operador');assert.equal(docs.get('a').estado,'Cerrada');assert.equal(docs.get('a').fechaReal,'');assert.equal(docs.get('a').datosPlanilla[1][1],'06/10');await assert.rejects(exports.saveDraftTest(db,{action:action('2026-10-09'),version:docs.get('a').actualizadoEn},'Operador'),/gestionada/);
});
test('cumplimiento distingue plan, terminación, puntualidad, control y retrabajos sin inventar fechas',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129;w.TIZColocacionesCore.today=()=> '2026-10-08';const row=(fecha,estado,extra={})=>({accion:{...action(fecha,estado),...extra}}),rows=[row('2026-10-08','Pendiente'),row('2026-10-05','Cerrada',{fechaReal:'2026-10-06'}),row('2026-10-08','Cerrada',{fechaReal:'2026-10-08'}),row('2026-10-07','Reprogramada'),row('2026-10-08','Cerrada'),row('2026-10-07','Cancelada'),row('2026-10-08','Cerrada',{tipo:'Colocación',control:'Sin revisar',fechaReal:'2026-10-08'}),row('2026-10-08','Cerrada',{tipo:'Colocación',control:'Conforme',fechaReal:'2026-10-08'}),row('2026-09-30','Cerrada',{fechaReal:'2026-10-08',retrabajo:'Sí'})],m=g.metrics(rows,'2026-10-05');assert.equal(m.plan,7);assert.equal(m.done,4);assert.equal(m.onTime,2);assert.equal(m.percent,57);assert.equal(m.onTimePercent,29);assert.equal(m.missingReal,1);assert.equal(m.unverified,1);assert.equal(m.reprogrammed,1);assert.equal(m.rework,1);assert.equal(g.metrics(rows,'2027-01-04').percent,null);
});
test('por fecha agrupa las acciones por obra, expone contactos heredados y permite completar ubicación sin alterar origen',()=>{
 const w=ui();w.TIZColocacionesCore.today=()=> '2026-10-08';w.DB.obras=[{id:'o',ot:'123',cliente:'Cliente',entregaLogistica:{domicilio:'Dirección original',contacto:'Contacto OT',contactoTelefono:'111'},colocacionesGestion:{direccion:'Domicilio de colocación',indicacionesColocacion:'Ingreso por portón',acciones:{a:{...action('2026-10-09'),id:'a'},b:{...action('2026-10-09'),id:'b',titulo:'Confirmar acceso'},c:{...action(''),id:'c'}}}}];const before=JSON.stringify(w.DB),html=w.TIZColocacionesGeneralV129.datesBody('2026-10-05');assert.equal((html.match(/123 · Cliente/g)||[]).length,2);assert.ok(html.includes('Domicilio de colocación'));assert.ok(html.includes('Contacto OT'));assert.ok(html.includes('111'));assert.ok(html.includes('Ingreso por portón'));assert.ok(html.includes('data-open-tab="contactos"'));assert.ok(html.includes('data-open-tab="ubicacion"'));assert.ok(html.includes('Sin fecha'));assert.equal(JSON.stringify(w.DB),before);
});
test('una colocación requiere control conforme para cerrar; reprogramar no exige declarar trabajo terminado',()=>{
 const a={...action('2026-10-08'),tipo:'Colocación'},result={detalle:'Montada',fechaReal:'2026-10-08'};assert.throws(()=>G.resolveDraftAction(a,result,null,'2026-10-08','at','Operador'),/control conforme/);const closed=G.resolveDraftAction(a,{...result,control:'Conforme',retrabajo:'Sí',cantidadReal:'2'},null,'2026-10-08','at','Operador').closed;assert.equal(closed.control,'Conforme');assert.equal(closed.retrabajo,'Sí');assert.equal(closed.cantidadReal,'2');const next={...a,id:'next',fecha:'2026-10-09'};assert.equal(G.resolveDraftAction(a,result,next,'2026-10-08','at','Operador').closed.estado,'Reprogramada');
});
