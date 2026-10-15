'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),G=require('../functions/colocacionesCoreV129');
const action=(fecha,estado='Pendiente')=>({id:'a',titulo:'Revisar anclajes',responsable:'Ariel',fecha,estado,todoDia:true});
test('por fecha enlaza la Sheet de OT al contacto y Maps usa el domicilio propio de la acción',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129;w.canViewPage=()=>true;w.canAnnotateSector=()=>true;
 w.DB.obras=[{id:'o',estado:'Pendiente',ot:'4700',cliente:'Cliente',otSheetUrl:'https://docs.google.com/spreadsheets/d/test_OT/edit#gid=42',colocacionesGestion:{direccion:'Domicilio general 100',acciones:{a:{...action('2026-10-09'),direccion:'Av. Córdoba 1234',zona:'CABA'},b:{...action('2026-10-09'),id:'b',direccion:'San Martín 200',zona:'San Isidro'}}}}];
 const html=g.entries().map(r=>g.dateDetails(r)).join('');assert.ok(html.includes('OT · contacto'));assert.ok(html.includes('gid=42'));assert.ok(html.includes('range=FICHA%21D9%3AH10'));assert.ok(html.includes(encodeURIComponent('Av. Córdoba 1234, CABA')));assert.ok(html.includes(encodeURIComponent('San Martín 200, San Isidro')));assert.ok(!html.includes(encodeURIComponent('Domicilio general 100')));
 assert.equal(g.sheetContactLink({otSheetUrl:'javascript:alert(1)'}),'');assert.equal(g.sheetContactLink({}),'');assert.equal(g.mapsLink(''),'');
});
test('histórico contiene las acciones resueltas por fecha real y conserva los indicadores como detalle',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129;w.DB.obras=[{id:'o',ot:'4700',cliente:'Cliente',colocacionesGestion:{acciones:{a:{...action('2026-10-09'),titulo:'Pendiente actual'},b:{...action('2026-10-07','Cerrada'),id:'b',titulo:'Terminada reciente',fechaReal:'2026-10-09',resultado:'Trabajo realizado'},c:{...action('2026-10-05','Reprogramada'),id:'c',titulo:'Reprogramación anterior',fechaReal:'2026-10-06'}}}}];
 const html=g.body('historico','2026-10-05'),list=html.split('<details style="margin-top:18px">')[0];assert.ok(list.includes('Terminada reciente'));assert.ok(list.includes('Reprogramación anterior'));assert.ok(list.indexOf('Terminada reciente')<list.indexOf('Reprogramación anterior'));assert.ok(!list.includes('Pendiente actual'));assert.ok(!html.includes('Cumplimiento actual'));assert.ok(g.body('dashboard','2026-10-05').includes('Cumplimiento actual'));
});
test('apertura queda separada de planificación y el vínculo usa la carpeta OT existente',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129;w.canViewPage=()=>true;w.canAnnotateSector=()=>true;
 const row={key:'o/a',obra:{id:'o',ot:'4700',driveFolderId:'Folder_4700'},cliente:'Cliente',accion:{...action('2026-10-15'),fechaApertura:'2026-10-09'}};
 const html=g.inlineRow(row);assert.ok(html.indexOf('name="fechaApertura"')<html.indexOf('name="titulo"'));assert.ok(html.indexOf('name="titulo"')<html.indexOf('name="fecha"'));assert.ok(html.includes('value="2026-10-09"'));assert.ok(html.includes('value="2026-10-15"'));assert.ok(html.includes('href="https://drive.google.com/drive/folders/Folder_4700"'));assert.ok(html.includes('ti-brand-google-drive'));assert.ok(!g.driveLink({driveFolderUrl:'javascript:alert(1)'}).includes('href='));assert.ok(!g.driveLink({}).includes('href='));
 assert.equal(g.openingDate({creadoEn:'2026-10-09T01:00:00Z'}),'2026-10-08');assert.equal(g.openingDate({datosPlanilla:[['Fecha','07/10/2026']]}),'2026-10-07');assert.equal(g.openingDate({}),'');
 const saved=G.cleanAction({...action('2026-10-15'),fechaApertura:'2026-10-09'});assert.equal(saved.fechaApertura,'2026-10-09');assert.equal(saved.fecha,'2026-10-15');assert.throws(()=>G.cleanAction({...action('2026-10-15'),fechaApertura:'2026-02-30'}),/apertura/);
});
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
function ui(doc,extras={}){const window={DB:{obras:[],clientes:[],presupuestos:[]},TIZColocacionesGeneralCore:G};const c={window,console,Date,Intl,URL,URLSearchParams,TextEncoder,setInterval:()=>{},setTimeout:()=>{},...extras};vm.runInNewContext(fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),c);if(doc)c.document=doc;vm.runInNewContext(fs.readFileSync(path.join(root,'colocacionesGeneralUIV129.js'),'utf8'),c);return window;}
test('base contiene obras pendientes sin acción ni fecha y mantiene acciones con y sin fecha',()=>{
 const w=ui();w.DB.obras=[{id:'1',ot:'4700',cliente:'A',estado:'Pendiente'},{id:'2',ot:'4701',cliente:'B',estado:'Pendiente',colocacionesGestion:{acciones:{a:action(''),b:{...action('2026-10-09'),id:'b'}}}},{id:'3',estado:'Rechazado'}];
 const rows=w.TIZColocacionesGeneralV129.baseRows();assert.equal(rows.length,3);assert.equal(rows.filter(r=>r.obra.id==='1'&&r.empty).length,1);assert.equal(rows.some(r=>r.obra.id==='3'),false);assert.equal(w.TIZColocacionesGeneralV129.entries().length,2);
 const html=w.TIZColocacionesGeneralV129.body('base');for(const text of ['Pendientes','4701','Sin acción cargada','data-g-detail='])assert.ok(html.includes(text));
});
test('calendario conserva la navegación semanal sin días vacíos y el bloqueo mantiene la navegación',()=>{
 const source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8');const w=ui();
 const c={window:w,Date,Intl,console,TextEncoder};
 // Execute the actual render helpers with lightweight DOM bindings.
 const start=source.indexOf('  function agendaHTML()'),end=source.indexOf('  function overlay()',start);
 const node={innerHTML:'',insertAdjacentHTML(position,html){assert.equal(position,'afterbegin');this.innerHTML=html+this.innerHTML;}};w.currentUser={};w.canViewPage=()=>true;w.TIZColocacionesGeneralV129.attach=()=>{};w.TIZColocacionesGeneralV129.load=()=>{};
 vm.runInNewContext(source.slice(start,end)+'\nwindow.testRender=render;window.testAgenda=agendaHTML;',{...c,today:()=> '2026-10-08',shift:G.shift,fmtDate:x=>x,open:G.open,esc:x=>String(x||''),bucket:a=>a.fecha<'2026-10-08'?'vencidas':'proximas',chip:x=>x,canWrite:()=>true,canRead:()=>true,allWorks:()=>[],pending:()=>[],db:()=>w.DB,style:()=>{},pageRoot:()=>node,btn:(text,attr)=>`<button ${attr}>${text}</button>`,state:{view:'agenda'},renderList:()=>{}});
 w.testRender();assert.equal((node.innerHTML.match(/<section class="c128-day /g)||[]).length,0);assert.ok(node.innerHTML.includes('05/10/2026 al 11/10/2026'));assert.ok(node.innerHTML.includes('data-view="historico"'));
 for(const fecha of ['1900-01-06','2026-03-01']){w.DB.obras=[{id:'old',ot:'4350',estado:'Pendiente',fcol_c:fecha}];w.testRender();assert.ok(node.innerHTML.includes('data-view=\"base\"'));assert.ok(!node.innerHTML.includes('data-overdue='));}
 w.DB.obras=[{id:'o',estado:'Pendiente',ot:'4700',colocacionesGestion:{acciones:{a:action('2026-10-06')}}}];w.testRender();assert.ok(node.innerHTML.includes('data-overdue="o/a"'));assert.ok(node.innerHTML.includes('data-view="agenda"'));assert.ok(node.innerHTML.includes('data-view="base"'));
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
 const w=ui();w.DB.obras=[{id:'o',estado:'Pendiente',ot:'123',cliente:'<img src=x>',estado:'Pendiente',colocacionesGestion:{acciones:{a:{...action('2026-10-09'),id:'a',todoDia:false,hora:'15:00',duracion:60},b:{...action('2026-10-09'),id:'b',todoDia:false,hora:'09:00',duracion:30},c:{...action(''),id:'c'},d:{...action('2026-10-09','Cerrada'),id:'d'}}}},{id:'empty',estado:'Pendiente'}];
 w.canViewPage=()=>true;w.canAnnotateSector=()=>true;const g=w.TIZColocacionesGeneralV129,before=JSON.stringify(w.DB);assert.equal(g.baseRows().length,5);assert.deepEqual(Array.from(g.calendarRows(),r=>r.accion.id),['b','a']);const html=g.body();assert.ok(html.includes('data-g-detail='));assert.ok(!html.includes('name="fecha"'));assert.ok(w.TIZColocacionesGeneralV129.inlineRow(w.TIZColocacionesGeneralV129.entries().find(r=>!r.accion.fecha)).includes('name="fecha" aria-label="Fecha planificada" value=""'));assert.equal((html.match(/data-g-detail="o\//g)||[]).length,3);assert.ok(html.includes('data-g-detail="empty/sinaccion"'));assert.ok(html.includes('data-g-detail="o/a"'));assert.ok(html.includes('&lt;img src=x&gt;'));assert.ok(!html.includes('<img src=x>'));g.conflicts();g.preparation(g.baseRows()[0]);assert.equal(JSON.stringify(w.DB),before);
});
test('buscar una acción filtra el listado sin ocultar los compromisos de otras obras por fecha',()=>{
 const nodes={'g129-style':{},'g134-actions':{innerHTML:''}},events={},w=ui({getElementById:id=>nodes[id]});w.DB.obras=[{id:'one',estado:'Pendiente',ot:'123',cliente:'Uno',estado:'Pendiente',colocacionesGestion:{acciones:{a:action('2026-10-09')}}},{id:'two',estado:'Pendiente',ot:'124',cliente:'Dos',estado:'Pendiente',colocacionesGestion:{acciones:{b:{...action('2026-10-09'),id:'b'}}}}];const g=w.TIZColocacionesGeneralV129;g.attach({addEventListener:(type,fn)=>{events[type]=fn}});events.input({target:{id:'g134-query',value:'Uno'}});assert.ok(nodes['g134-actions'].innerHTML.includes('data-g-action="one/a"'));assert.ok(!nodes['g134-actions'].innerHTML.includes('data-g-action="two/b"'));assert.equal(g.calendarRows().length,2);
});
test('la importación conserva todas las columnas operativas y no asocia por nombre del cliente',()=>{
 const w=ui(),headers=['Semana','Fecha','Día','Obra / OT','Cliente','Tarea / Operación','Responsable','Sector / Máquina','Prioridad','Estado','Fecha compromiso','Fecha Real','Cant. real','Cumplimiento','Control de colocación','Retrabajo','Próxima acción / observaciones'],row=['41','08/10/2026','Jue','123','Cliente','Relevar','','Colocaciones','Alta','Bloqueada','12/10/2026','','','No','Aprobado','Sí','Llevar fotos'];const matrices={Colocaciones:[headers,row]},works=[{id:'one',ot:'123'},{id:'two',ot:'123'}],a=w.TIZColocacionesCore.parseImportRows(matrices,works)[0];assert.equal(a.obraId,'');assert.equal(a.estado,'Bloqueada');assert.equal(a.observaciones,'Llevar fotos');assert.equal(a.control,'Aprobado');assert.equal(a.datosPlanilla.length,headers.length);assert.equal(G.cleanAction(a).datosPlanilla.length,headers.length);assert.equal(a.responsable,'');assert.equal(a.fecha,'2026-10-12');
});
test('el formulario sencillo tiene una sola tarea, fecha y responsable y conserva los campos avanzados',()=>{
 const source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),start=source.indexOf('  function actionFields('),end=source.indexOf('  function taskHTML(',start),w={};vm.runInNewContext(source.slice(start,end)+'\nwindow.form=newActionForm({id:"o"});',{window:w,state:{editor:null},today:()=> '2026-10-12',esc:x=>String(x||''),options:()=>'',contactOptions:()=>'',logistics:()=>({direccion:'Dirección heredada'}),db:()=>({}),data:()=>({}),btn:()=>'',allWorks:()=>[]});for(const name of ['titulo','fecha','responsable'])assert.equal((w.form.match(new RegExp('name="'+name+'"','g'))||[]).length,1);assert.ok(w.form.includes('Más detalles'));assert.ok(w.form.includes('name="todoDia"'));assert.ok(w.form.includes('name="fecha" value=""'));
});
test('importar una fila terminada sin OT conserva su estado y no inventa una fecha real',async()=>{
 const docs=new Map(),db={collection:()=>({doc:id=>({id})}),runTransaction:async fn=>{const writes=[];await fn({get:async ref=>({exists:docs.has(ref.id),data:()=>docs.get(ref.id)}),set:(ref,data)=>writes.push([ref.id,data])});for(const [id,data]of writes)docs.set(id,data)}},source=fs.readFileSync(path.join(root,'functions/colocacionesGeneralV129.js'),'utf8'),exports={};vm.runInNewContext(source+'\nexports.saveDraftTest=saveDraft;',{exports,Date,Intl,Buffer,Set,Map,require:n=>n==='firebase-admin'?{apps:[{}]}:n==='googleapis'?{google:{}}:n==='pdfkit'?class{}:n==='./colocacionesCoreV129'?G:require(n)});await exports.saveDraftTest(db,{action:{...action('2026-10-06','Cerrada'),origen:'Planilla',datosPlanilla:[['Estado','Terminada'],['Fecha Real','06/10']]}},'Operador');assert.equal(docs.get('a').estado,'Cerrada');assert.equal(docs.get('a').fechaReal,'');assert.equal(docs.get('a').datosPlanilla[1][1],'06/10');await assert.rejects(exports.saveDraftTest(db,{action:action('2026-10-09'),version:docs.get('a').actualizadoEn},'Operador'),/gestionada/);
});
test('cumplimiento distingue plan, terminación, puntualidad, control y retrabajos sin inventar fechas',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129;w.TIZColocacionesCore.today=()=> '2026-10-08';const row=(fecha,estado,extra={})=>({accion:{...action(fecha,estado),...extra}}),rows=[row('2026-10-08','Pendiente'),row('2026-10-05','Cerrada',{fechaReal:'2026-10-06'}),row('2026-10-08','Cerrada',{fechaReal:'2026-10-08'}),row('2026-10-07','Reprogramada'),row('2026-10-08','Cerrada'),row('2026-10-07','Cancelada'),row('2026-10-08','Cerrada',{tipo:'Colocación',control:'Sin revisar',fechaReal:'2026-10-08'}),row('2026-10-08','Cerrada',{tipo:'Colocación',control:'Conforme',fechaReal:'2026-10-08'}),row('2026-09-30','Cerrada',{fechaReal:'2026-10-08',retrabajo:'Sí'})],m=g.metrics(rows,'2026-10-05');assert.equal(m.plan,7);assert.equal(m.done,4);assert.equal(m.onTime,2);assert.equal(m.percent,57);assert.equal(m.onTimePercent,29);assert.equal(m.missingReal,1);assert.equal(m.unverified,1);assert.equal(m.reprogrammed,1);assert.equal(m.rework,1);assert.equal(g.metrics(rows,'2027-01-04').percent,null);
});
test('por fecha resume cada evento y el detalle conserva contactos y ubicación sin alterar origen',()=>{
 const w=ui();w.TIZColocacionesCore.today=()=> '2026-10-08';w.DB.obras=[{id:'o',estado:'Pendiente',ot:'123',cliente:'Cliente',entregaLogistica:{domicilio:'Dirección original',contacto:'Contacto OT',contactoTelefono:'111'},colocacionesGestion:{direccion:'Domicilio de colocación',indicacionesColocacion:'Ingreso por portón',acciones:{a:{...action('2026-10-09'),id:'a'},b:{...action('2026-10-09'),id:'b',titulo:'Confirmar acceso'},c:{...action(''),id:'c'}}}}];const before=JSON.stringify(w.DB),html=w.TIZColocacionesGeneralV129.datesBody('2026-10-05');assert.equal((html.match(/OT 123 · Cliente/g)||[]).length,3);assert.ok(!html.includes('Domicilio de colocación'));assert.ok(!html.includes('Contacto OT'));const detail=w.TIZColocacionesGeneralV129.dateDetails(w.TIZColocacionesGeneralV129.entries()[0]);assert.ok(detail.includes('Domicilio de colocación'));assert.ok(detail.includes('Contacto OT'));assert.ok(detail.includes('111'));assert.ok(detail.includes('Ingreso por portón'));assert.ok(detail.includes('data-g-detail-tab="contactos"'));assert.ok(detail.includes('data-g-detail-tab="ubicacion"'));assert.ok(html.includes('Sin fecha'));assert.equal(JSON.stringify(w.DB),before);
});
test('una colocación requiere control conforme para cerrar; reprogramar no exige declarar trabajo terminado',()=>{
 const a={...action('2026-10-08'),tipo:'Colocación'},result={detalle:'Montada',fechaReal:'2026-10-08'};assert.throws(()=>G.resolveDraftAction(a,result,null,'2026-10-08','at','Operador'),/control conforme/);const closed=G.resolveDraftAction(a,{...result,control:'Conforme',retrabajo:'Sí',cantidadReal:'2'},null,'2026-10-08','at','Operador').closed;assert.equal(closed.control,'Conforme');assert.equal(closed.retrabajo,'Sí');assert.equal(closed.cantidadReal,'2');const next={...a,id:'next',fecha:'2026-10-09'};assert.equal(G.resolveDraftAction(a,result,next,'2026-10-08','at','Operador').closed.estado,'Reprogramada');
});
test('el formulario del detalle conserva la edición y el cierre de la tarea',()=>{
 const w=ui();w.canViewPage=()=>true;w.canAnnotateSector=()=>true;w.DB.obras=[{id:'o',estado:'Pendiente',ot:'123',cliente:'Cliente',colocacionesGestion:{acciones:{a:{...action('2026-10-09'),tipo:'Colocación'}}}}];const r=w.TIZColocacionesGeneralV129.entries()[0],html=w.TIZColocacionesGeneralV129.inlineRow(r);for(const name of ['titulo','fecha','responsable','observaciones','detalle','fechaReal','control'])assert.ok(html.includes('name="'+name+'"'));assert.ok(html.includes('data-g-form="inline"'));assert.ok(html.includes('data-g-finish="o/a"'));assert.ok(html.includes('hidden disabled'));assert.ok(!html.includes('data-g-action='));const closed=w.TIZColocacionesGeneralV129.inlineRow({...r,accion:{...r.accion,estado:'Cerrada',control:'Conforme'}});assert.ok(!closed.includes('type="submit"'));assert.ok(closed.includes('readonly'));assert.ok(w.TIZColocacionesGeneralV129.body().includes('data-view="historico"'));
});
test('guardado del renglón verifica versión y conserva contactos, hora, prioridad e información previa',async()=>{
 const w=ui(),o={id:'o',colocacionesGestion:{acciones:{a:{...action('2026-10-09'),actualizadoEn:'v1',prioridad:'Media',todoDia:false,hora:'10:00',duracion:60,direccion:'Domicilio',datosPlanilla:[['Dato','Original']]}}}},source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),start=source.indexOf('  async function saveInline('),end=source.indexOf('  function actionFromForm(',start);let writes=0;vm.runInNewContext(source.slice(start,end)+'\nwindow.saveRowTest=saveInline;',{window:w,actions:w.TIZColocacionesCore.actions,db:()=>({}),open:G.open,blockers:()=>[],mutate:async(id,fn)=>{const patch=fn(o);writes++;w.TIZColocacionesCore.applyPatch(o,patch);return patch},isoDate:w.TIZColocacionesCore.isoDate,validateAction:w.TIZColocacionesCore.validateAction,resultPatch:w.TIZColocacionesCore.resultPatch,stamp:()=> 'v2',actor:()=> 'Operador'});const fields={titulo:'Confirmar anclajes',fechaApertura:'2026-10-08',fecha:'2026-10-10',responsable:'Ariel',observaciones:'Llevar fotos'};await assert.rejects(w.saveRowTest('o','a',fields,'old'),/modificó/);assert.equal(writes,0);await w.saveRowTest('o','a',fields,'v1');const a=o.colocacionesGestion.acciones.a;assert.equal(a.fechaApertura,'2026-10-08');assert.equal(a.fecha,'2026-10-10');assert.equal(a.titulo,'Confirmar anclajes');assert.equal(a.prioridad,'Media');assert.equal(a.hora,'10:00');assert.equal(a.direccion,'Domicilio');assert.equal(a.datosPlanilla[0][1],'Original');await w.saveRowTest('o','a',fields,'v2',{detalle:'Resuelto',fechaReal:'2026-10-10'});assert.equal(o.colocacionesGestion.acciones.a.estado,'Cerrada');await assert.rejects(w.saveRowTest('o','a',fields,'v2'),/gestionada/);
});
test('crear desde un renglón vincula a la OT elegida y conserva la fecha opcional',async()=>{
 const nodes={'g129-style':{}},events={},requests=[],w=ui({getElementById:id=>nodes[id]}, {FormData:class{constructor(f){this.fields=f.fields}[Symbol.iterator](){return Object.entries(this.fields)[Symbol.iterator]()}}});w.canViewPage=()=>true;w.canAnnotateSector=()=>true;w.DB.obras=[{id:'o',ot:'123',cliente:'Cliente'}];w.TIZColocacionesUIV128={blockers:()=>[],render:()=>{}};w.colocacionesApiV129=async p=>{requests.push(p);return p.mode==='list'?{rows:[]}:{id:p.action.id,obraId:p.obraId}};w.TIZColocacionesGeneralV129.attach({addEventListener:(type,fn)=>events[type]=fn});const error={textContent:''},button={disabled:false},f={dataset:{gForm:'inline',key:'__new__',version:''},fields:{obraId:'o',titulo:'Confirmar ingreso',fechaApertura:'2026-10-08',fecha:'',responsable:'Ariel',observaciones:'Hablar con encargado'},querySelector:s=>s==='.g135-error'?error:button};await events.submit({target:f,preventDefault:()=>{}});const saved=requests.find(p=>p.mode==='save');assert.equal(saved.obraId,'o');assert.equal(saved.action.fechaApertura,'2026-10-08');assert.equal(saved.action.fecha,'');assert.equal(saved.action.cliente,'Cliente');assert.equal(saved.action.observaciones,'Hablar con encargado');assert.equal(error.textContent,'');
});
test('una fecha heredada cambiada desde la OT invalida la edición y se captura una sola vez al guardar',async()=>{
 const w=ui(),o={id:'o',sectores:{colocaciones:{compromiso:'2026-10-09',responsable:'Ariel'}}},source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),start=source.indexOf('  async function saveInline('),end=source.indexOf('  function actionFromForm(',start);vm.runInNewContext(source.slice(start,end)+'\nwindow.saveRowTest=saveInline;',{window:w,actions:w.TIZColocacionesCore.actions,db:()=>({}),open:G.open,blockers:()=>[],mutate:async(id,fn)=>{const patch=fn(o);w.TIZColocacionesCore.applyPatch(o,patch);return patch},isoDate:w.TIZColocacionesCore.isoDate,validateAction:w.TIZColocacionesCore.validateAction,resultPatch:w.TIZColocacionesCore.resultPatch,stamp:()=> 'v2',actor:()=> 'Operador'});o.sectores.colocaciones.compromiso='2026-10-10';const fields={titulo:'Coordinar colocación',fecha:'2026-10-10',responsable:'Ariel',observaciones:''};await assert.rejects(w.saveRowTest('o','legacy',fields,'virtual:2026-10-09|Ariel'),/modificó/);assert.equal(o.colocacionesGestion,undefined);await w.saveRowTest('o','legacy',fields,'virtual:2026-10-10|Ariel');assert.equal(o.colocacionesGestion.legacyCapturada,true);assert.equal(w.TIZColocacionesCore.actions(o,{}).length,1);
});
test('teléfono abre llamadas y WhatsApp sólo con país explícito; rechaza texto o extensiones ambiguas',()=>{
 const c=ui().TIZColocacionesCore;assert.equal(c.phoneLinks('+54 9 (11) 1234-5678').whatsapp,'https://wa.me/5491112345678');assert.equal(c.phoneLinks('11 1234-5678').tel,'tel:1112345678');assert.equal(c.phoneLinks('11 1234-5678').whatsapp,'');for(const bad of ['javascript:123456789','123','1234567 ext 22'])assert.equal(c.phoneLinks(bad).tel,'');
});
test('visita conserva origen y acciones; exige confirmación válida y evita pisar una actualización ajena',()=>{
 const c=ui().TIZColocacionesCore,o={id:'o',entregaLogistica:{contacto:'Ana',contactoTelefono:'+54 9 11 12345678'},colocacionesGestion:{acciones:{a:action('2026-10-09')},preparacion:{fotos:{estado:'Pendiente'}},visita:{actualizadoEn:'v1'}}},before=JSON.stringify(o),fields={fechaVisita:'2026-10-09',horaVisita:'09:30',contactoId:'cotizacion',accesoConfirmado:true,materiales:true,vehiculo:true,planosURL:'https://drive.google.com/file/d/plan/view',fotosURL:'https://example.com/fotos'};
 assert.throws(()=>c.visitPatch(o,fields,'old','v2','Ariel'),/Otra persona/);assert.throws(()=>c.visitPatch(o,{...fields,horaVisita:''},'v1','v2','Ariel'),/horario/);assert.throws(()=>c.visitPatch(o,{...fields,fechaVisita:''},'v1','v2','Ariel'),/fecha/);assert.throws(()=>c.visitPatch(o,{...fields,fotosURL:'javascript:alert(1)'},'v1','v2','Ariel'),/http/);assert.equal(JSON.stringify(o),before);
 const p=c.visitPatch(o,fields,'v1','v2','Ariel');assert.deepEqual(Object.keys(p),['colocacionesGestion.visita']);c.applyPatch(o,p);assert.equal(o.colocacionesGestion.visita.checklist.herramientas,false);assert.equal(o.colocacionesGestion.preparacion.fotos.estado,'Pendiente');assert.equal(o.colocacionesGestion.acciones.a.estado,'Pendiente');
});
test('por fecha muestra preparación sólo para su visita y deja links y edición accesibles',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129,o={id:'o',colocacionesGestion:{visita:{fecha:'2026-10-09',hora:'09:30',accesoConfirmado:true,indicaciones:'<script>',fotosURL:'https://example.com/fotos',planosURL:'javascript:alert(1)',checklist:{materiales:true,vehiculo:true}}}};
 const html=g.visitSummary(o,'2026-10-09');for(const t of ['Acceso confirmado','09:30','Salida 2/4','Fotos','data-open-tab="salida"','&lt;script&gt;'])assert.ok(html.includes(t));assert.ok(!html.includes('javascript:'));const other=g.visitSummary(o,'2026-10-12');assert.ok(other.includes('Acceso pendiente'));assert.ok(other.includes('Salida 0/4'));assert.ok(!other.includes('Acceso confirmado'));assert.ok(g.contactQuickLinks({nombre:'Ana',telefono:'+5491112345678'}).includes('WhatsApp'));
});
test('el formulario de salida permite completar contactos y recursos y guardar casillas desmarcadas',async()=>{
 const w=ui(),source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),o={id:'o',colocacionesGestion:{visita:{actualizadoEn:'v1',checklist:{materiales:true}}}},state={id:'o',busy:false,editor:null,drafts:{},editors:{}},messages=[];let saved;
 const start=source.indexOf('  async function submit('),end=source.indexOf('  function downloadCalendar(',start);
 vm.runInNewContext(source.slice(start,end)+'\nwindow.submitVisit=submit;',{window:w,state,FormData:class{constructor(f){this.fields=f.fields}get(k){return this.fields[k]}[Symbol.iterator](){return Object.entries(this.fields)[Symbol.iterator]()}},blockers:()=>[],obra:()=>o,stamp:()=> 'v2',actor:()=> 'Ariel',db:()=>w.DB,visitPatch:w.TIZColocacionesCore.visitPatch,mutate:async(id,fn)=>{saved=fn(o);w.TIZColocacionesCore.applyPatch(o,saved)},drawModal:()=>{},toast:m=>messages.push(m),error:e=>{throw e}});
 const f={dataset:{form:'visit'},fields:{version:'v1',fechaVisita:'2026-10-09',horaVisita:'',fotosURL:'',planosURL:''},querySelectorAll:()=>[{name:'materiales',checked:false},{name:'herramientas',checked:true}]};await w.submitVisit({target:f,preventDefault:()=>{}});assert.equal(saved['colocacionesGestion.visita'].checklist.materiales,false);assert.equal(saved['colocacionesGestion.visita'].checklist.herramientas,true);assert.equal(messages.length,1);
 const formStart=source.indexOf('  function visitForm('),formEnd=source.indexOf('  window.TIZColocacionesCore',formStart);vm.runInNewContext(source.slice(formStart,formEnd)+'\nwindow.form=visitForm(obra);',{window:w,obra:o,data:x=>x.colocacionesGestion,esc:x=>String(x||''),contactOptions:()=>'<option>Contacto OT</option>',VISIT_CHECKS:{materiales:'Materiales',herramientas:'Herramientas',vehiculo:'Vehículo',responsable:'Responsable'},canWrite:()=>true});for(const name of ['fechaVisita','horaVisita','contactoId','fotosURL','planosURL','accesoConfirmado','materiales','herramientas','vehiculo','responsable'])assert.ok(w.form.includes('name="'+name+'"'));
});
test('cambiar fecha de visita limpia confirmaciones y los borradores conservan casillas desmarcadas',async()=>{
 const source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),w={},boxes=[{name:'accesoConfirmado',checked:true},{name:'materiales',checked:true}],f={querySelectorAll:()=>boxes},state={tab:'salida',drafts:{}};
 const start=source.indexOf('  async function change('),end=source.indexOf('  async function sheetJS(',start);vm.runInNewContext(source.slice(start,end)+'\nwindow.changeVisit=change;',{window:w});await w.changeVisit({target:{name:'fechaVisita',closest:()=>f}});assert.ok(boxes.every(x=>!x.checked));
 const draftStart=source.indexOf('  function captureDraft('),draftEnd=source.indexOf('  function restoreDraft(',draftStart);vm.runInNewContext(source.slice(draftStart,draftEnd)+'\nwindow.capture=captureDraft;',{window:w,state,document:{querySelector:()=>f},FormData:class{[Symbol.iterator](){return [][Symbol.iterator]()}}});w.capture();assert.equal(state.drafts.salida.materiales,false);assert.equal(state.drafts.salida.accesoConfirmado,false);
});
test('pendientes de colocación incluye aprobadas en Ventas y conserva exclusiones de Base Madre',()=>{
 const c=ui().TIZColocacionesCore;
 for(const estado of ['Pendiente',' Cobrado pendiente ','PENDIENTE','Aprobado'])assert.equal(c.pendingInstallation({estado}),true);
 for(const estado of ['Entregado','Entregada','Entregadas','Cobrado','Facturado','Enviado','Pendiente de aprobación',''])assert.equal(c.pendingInstallation({estado,presupuestoId:'p'}),false);
 assert.equal(c.pendingInstallation({estado:'Aprobado',estadoHistoricoExcel:'Cobrado pendiente'}),true);
 assert.equal(c.pendingInstallation({estado:'Aprobado',historicoExcel:{estado:'Pendiente'}}),true);
 assert.equal(c.pendingInstallation({estado:'Entregado',estadoHistoricoExcel:'Pendiente'}),false);
 assert.equal(c.pendingInstallation({estado:'Pendiente',estadoHistoricoExcel:'Entregadas'}),false);
 for(const extra of [{archivado:true},{revisionVigente:false},{revisionOperativa:false},{colocacionesGestion:{cierre:{cerrada:true}}}])assert.equal(c.pendingInstallation({estado:'Pendiente',...extra}),false);
});
test('entregadas salen de acciones abiertas, calendario, selección y bloqueos; sus resultados se conservan',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129;w.canViewPage=()=>true;w.canAnnotateSector=()=>true;
 const work=(id,estado)=>({id,ot:id,cliente:'Cliente '+id,estado,colocacionesGestion:{acciones:{a:{...action('2026-10-01'),titulo:'Abierta '+id},b:{...action('2026-10-01','Cerrada'),id:'b',titulo:'Resultado '+id,resultado:'Terminada',fechaReal:'2026-10-02'}}}});
 w.DB.obras=[work('4700','Pendiente'),work('4701','Cobrado pendiente'),work('4100','Entregado'),work('4101','Cobrado'),work('4102','Aprobado')];const before=JSON.stringify(w.DB);
 assert.deepEqual(Array.from(g.entries().filter(r=>G.open(r.accion)),r=>r.obra.id),['4102','4700','4701']);assert.equal(g.calendarRows().length,3);
 const source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),start=source.indexOf('  function blockers('),end=source.indexOf('  function render(',start);vm.runInNewContext(source.slice(start,end)+'\nwindow.testBlockers=blockers;',{window:w,today:()=> '2026-10-09'});assert.deepEqual(Array.from(w.testBlockers(),r=>r.obra.id),['4102','4700','4701']);
 const selected=g.inlineRow(null);assert.ok(selected.includes('value="4700"'));assert.ok(!selected.includes('value="4100"'));
 assert.ok(g.historyBody('2026-10-05').includes('Resultado 4100'));assert.equal(JSON.stringify(w.DB),before);
 w.DB.obras[0].estado='Entregado';assert.equal(g.calendarRows().length,2);assert.equal(w.testBlockers().length,2);
});
test('gestión compara cierre real contra plan, usando días corridos sin convertir reprogramaciones en éxito',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129;w.TIZColocacionesCore.today=()=> '2026-10-09';
 const a={...action('2026-10-06','Cerrada'),fechaReal:'2026-10-08'};assert.equal(g.performance(a).delay,2);assert.equal(g.performance({...a,fechaReal:'2026-10-06'}).onTime,true);assert.equal(g.performance({...a,fechaReal:'2026-10-05'}).onTime,true);
 assert.equal(g.performance({...a,estado:'Reprogramada'}).done,false);assert.equal(g.performance({...a,fechaReal:''}).missingReal,true);assert.equal(g.performance({...a,fechaReal:'2026-10-10'}).invalidReal,true);assert.equal(g.performance({...a,tipo:'Colocación',control:'Sin revisar'}).unverified,true);assert.equal(g.performance({...a,tipo:'Colocación',control:'Conforme'}).done,true);
 assert.equal(g.performance({...a,fecha:'2024-02-28',fechaReal:'2024-03-01'}).delay,2);assert.equal(g.performance({...a,fecha:''}).onTime,undefined);
});
test('indicadores separan futuras, fechas faltantes, control pendiente, canceladas y cierres fuera de semana',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129;w.TIZColocacionesCore.today=()=> '2026-10-09';const row=(fecha,estado,extra={})=>({obra:{},accion:{...action(fecha,estado),...extra}}),rows=[row('2026-10-05','Cerrada',{fechaReal:'2026-10-05'}),row('2026-10-06','Cerrada',{fechaReal:'2026-10-08'}),row('2026-10-07','Pendiente'),row('2026-10-10','Pendiente'),row('2026-10-08','Reprogramada',{fechaReal:'2026-10-08'}),row('2026-10-08','Cerrada'),row('2026-10-07','Cancelada'),row('2026-10-06','Cerrada',{tipo:'Colocación',control:'Sin revisar',fechaReal:'2026-10-06'}),row('2026-10-06','Cerrada',{fechaReal:'2026-10-10'}),row('2026-09-30','Cerrada',{fechaReal:'2026-10-08'}),row('2026-10-05','Pendiente',{virtual:true})];
 const m=g.managementMetrics(rows,'2026-10-05');assert.equal(m.plan,8);assert.equal(m.evaluated,7);assert.equal(m.done,2);assert.equal(m.percent,29);assert.equal(m.onTimePercent,50);assert.equal(m.closedLate,1);assert.equal(m.averageDelay,2);assert.equal(m.overdue,1);assert.equal(m.future,1);assert.equal(m.reprogrammed,1);assert.equal(m.canceled,1);assert.equal(m.missingReal,1);assert.equal(m.unverified,1);assert.equal(m.invalidReal,1);
 const empty=g.managementMetrics(rows,'2026-11-02');assert.equal(empty.percent,null);assert.equal(empty.onTimePercent,null);assert.equal(empty.averageDelay,null);const future=g.managementMetrics([row('2026-10-10','Pendiente')],'2026-10-05');assert.equal(future.percent,null);
});
test('cerrar desde resultados conserva el evento por fecha con el cierre real e indicadores; entregadas sólo conservan eventos resueltos',()=>{
 const w=ui(),c=w.TIZColocacionesCore,g=w.TIZColocacionesGeneralV129;c.today=()=> '2026-10-09';const o={id:'o',ot:'4700',cliente:'Farmacity',estado:'Pendiente',colocacionesGestion:{acciones:{a:{...action('2026-10-06'),titulo:'Confirmar acceso'}}}};w.DB.obras=[o];
 c.applyPatch(o,c.resultPatch(o,'a',{detalle:'Confirmado <portón>',fechaReal:'2026-10-08'},null,'2026-10-09T10:00:00Z','Ariel',w.DB));const before=JSON.stringify(w.DB),html=g.datesBody('2026-10-05')+g.dateDetails(g.entries()[0])+g.body('dashboard','2026-10-05');for(const text of ['Confirmar acceso','Planificada: 06/10/2026','Cierre real: 08/10/2026','Cerrada con retraso · 2 día(s)','Cumplimiento actual','Gestión por responsable','data-g-detail="o/a"'])assert.ok(html.includes(text),text);assert.ok(!html.includes('data-g-result="o/a"'));assert.equal(g.managementMetrics(g.entries(),'2026-10-05').closedLate,1);assert.equal(JSON.stringify(w.DB),before);
 o.estado='Entregado';assert.ok(g.dateDetails(g.entries()[0]).includes('Cierre real: 08/10/2026'));assert.equal(g.calendarRows().length,0);
});
test('un cierre en otra semana queda sólo en Histórico sin duplicar el indicador del plan',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129;w.TIZColocacionesCore.today=()=> '2026-10-09';w.DB.obras=[{id:'o',ot:'4700',estado:'Entregado',colocacionesGestion:{acciones:{a:{...action('2026-09-30','Cerrada'),titulo:'Terminada esta semana',fechaReal:'2026-10-08'}}}}];const html=g.datesBody('2026-10-05');assert.ok(!html.includes('Terminada esta semana'));assert.ok(g.body('historico').includes('Terminada esta semana'));assert.ok(html.includes('data-view="historico"'));assert.ok(g.dateDetails(g.entries()[0]).includes('Cierre real: 08/10/2026'));assert.equal(g.managementMetrics(g.entries(),'2026-10-05').done,0);assert.equal(g.managementMetrics(g.entries(),'2026-09-28').done,1);
});
function importHarness({rows,existing=[],works=[],fail=[],listFailure=false}={}){
 const source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),start=source.indexOf('  async function importSelected('),end=source.indexOf('  function install(',start),state={importRows:rows,importBusy:false},w={},status={textContent:''},error={textContent:''},controls=[{disabled:false}],requests=[],notices=[],stored=new Map(existing.map(a=>[a.id,a]));let renders=0;
 const nodes={'c128-import-status':status,'c128-error':error};rows.forEach((a,i)=>nodes['c128-import-'+i]={value:a.obraId||'__draft__'});
 w.colocacionesApiV129=async p=>{requests.push(p);if(p.mode==='list'){if(listFailure)throw Error('Sin conexión');return {rows:[...stored.values()]}}if(fail.includes(p.action.id))throw Error('No se pudo guardar esta fila');stored.set(p.action.id,p.action);return {id:p.action.id}};w.TIZColocacionesGeneralV129={load:async()=>{}};
 vm.runInNewContext(source.slice(start,end)+'\nwindow.importTest=importSelected;',{window:w,state,canWrite:()=>true,document:{getElementById:id=>nodes[id]},overlay:()=>({querySelectorAll:()=>controls}),db:()=>({obras:works}),data:o=>o.colocacionesGestion||{},values:o=>Object.values(o||{}),open:G.open,stamp:()=> 'at',actor:()=> 'Ariel',mutate:async(id,fn)=>{const o=works.find(o=>o.id===id),patch=fn(o);ui().TIZColocacionesCore.applyPatch(o,patch);return patch},render:()=>renders++,toast:t=>notices.push(t)});
 return {w,state,status,error,controls,requests,stored,notices,renderCount:()=>renders};
}
test('importar espera el guardado, indica avances y conserva las filas fallidas para reintentar sin duplicar',async()=>{
 const rows=[{...action('2026-10-09'),id:'a',fila:5,hoja:'Colocaciones'},{...action('2026-10-10'),id:'b',fila:6,hoja:'Colocaciones'},{...action('2026-10-06','Cerrada'),id:'c',fila:7,hoja:'Colocaciones',fechaReal:'2026-10-06',datosPlanilla:[['Estado','Terminada']]}],fails=['b'],h=importHarness({rows,fail:fails});
 const result=await h.w.importTest();assert.equal(result.saved,2);assert.equal(result.failed.length,1);assert.equal(result.pending,1);assert.equal(result.closed,1);assert.ok(h.status.textContent.includes('2 guardadas'));assert.ok(h.error.textContent.includes('fila 6'));assert.equal(h.stored.get('c').estado,'Cerrada');assert.equal(h.state.importBusy,false);assert.equal(h.controls[0].disabled,false);
 fails.length=0;const retry=await h.w.importTest();assert.equal(retry.saved,1);assert.equal(retry.skipped,2);assert.equal(retry.failed.length,0);assert.equal(h.requests.filter(p=>p.mode==='save'&&p.action.id==='a').length,1);assert.equal(h.requests.filter(p=>p.mode==='save'&&p.action.id==='b').length,2);
});
test('una falla al comprobar duplicados queda visible y no provoca escrituras',async()=>{
 const h=importHarness({rows:[{...action(''),fila:5}],listFailure:true});await assert.rejects(h.w.importTest(),/Sin conexión/);assert.ok(h.status.textContent.includes('0 filas guardadas'));assert.equal(h.requests.filter(p=>p.mode==='save').length,0);assert.equal(h.controls[0].disabled,false);assert.equal(h.state.importBusy,false);
});
test('importación vinculada conserva fecha de apertura y fuente, omite acciones existentes aunque estén fuera del listado',async()=>{
 const rows=[{...action('2026-10-07'),id:'a',obraId:'o',fechaApertura:'2026-10-06',datosPlanilla:[['Responsable','']]},{...action('2026-10-07'),id:'b',obraId:'o'}],works=[{id:'o',estado:'Pendiente',colocacionesGestion:{acciones:{b:{id:'b',estado:'Cerrada',titulo:'Ya gestionada'}}}}],h=importHarness({rows,works});const result=await h.w.importTest();assert.equal(result.saved,1);assert.equal(result.skipped,1);assert.equal(works[0].colocacionesGestion.acciones.a.fechaApertura,'2026-10-06');assert.equal(works[0].colocacionesGestion.acciones.b.titulo,'Ya gestionada');assert.equal(h.renderCount(),1);
});
test('el botón de importar espera el resultado y muestra la excepción en el modal',async()=>{
 const source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),start=source.indexOf('  async function click('),end=source.indexOf('  async function change(',start),w={},errors=[],state={busy:false,importBusy:false},button={hasAttribute:k=>k==='data-import-confirm'};
 vm.runInNewContext(source.slice(start,end)+'\nwindow.clickImport=click;',{window:w,state,importSelected:async()=>{throw Error('Error de guardado visible')},error:e=>errors.push(e.message)});await w.clickImport({target:{closest:()=>button}});assert.deepEqual(errors,['Error de guardado visible']);
});

test('la lista muestra únicamente OT, descripción y tarea y el detalle conserva los campos',()=>{const w=ui(),g=w.TIZColocacionesGeneralV129;w.canViewPage=()=>true;w.canAnnotateSector=()=>true;const r={key:'o/a',obra:{id:'o',ot:'4702',desc:'Farmacity · sucursal Córdoba'},cliente:'Cliente privado',accion:{...action('2026-10-15'),fechaApertura:'2026-10-09',observaciones:'Dato privado',responsable:'Ariel'}};const list=g.compactRow(r);for(const text of ['OT 4702','Farmacity · sucursal Córdoba','Revisar anclajes','data-g-detail="o/a"'])assert.ok(list.includes(text));for(const text of ['<input','<form','2026-10-15','Ariel','Dato privado','drive.google.com'])assert.ok(!list.includes(text));const detail=g.inlineRow(r);for(const text of ['name="fechaApertura"','name="fecha"','name="responsable"','Dato privado'])assert.ok(detail.includes(text));const draft=g.compactRow({...r,obra:{id:'sinOT'},draft:true,accion:{...r.accion,referencia:'Farmacity · sucursal Rosario'}});assert.ok(draft.includes('Sin OT'));assert.ok(draft.includes('sucursal Rosario'));});

test('cada evento por fecha sólo muestra OT, cliente y descripción y abre su detalle propio',()=>{const w=ui(),g=w.TIZColocacionesGeneralV129,r={key:'o/a',obra:{id:'o',ot:'4702',desc:'Cartel Ganga Home'},cliente:'KPL Constructora',accion:{...action('2026-10-15'),observaciones:'Observación reservada'}};const html=g.dateRow(r);for(const text of ['OT 4702','KPL Constructora','Cartel Ganga Home','data-g-detail="o/a"'])assert.ok(html.includes(text));for(const text of ['<input','<form','Observación reservada','Fecha planificada','Drive','Resolver','Preparar visita'])assert.ok(!html.includes(text));assert.ok(!html.includes('>Revisar anclajes<'));const second=g.dateRow({...r,key:'o/b'});assert.ok(second.includes('data-g-detail="o/b"'));});

test('la aprobación en Ventas incorpora una sola OT nueva hasta guardar su primera acción, sin programar ni cambiar datos',()=>{const w=ui(),c=w.TIZColocacionesCore,g=w.TIZColocacionesGeneralV129;const o={id:'new',ot:'4800',estado:'Enviado',cliente:'Cliente',desc:'Nueva obra',gestionSectores:{ventas:{estado:'Aprobado'},colocaciones:{compromiso:'2026-10-20'}}};w.DB.obras=[o,{...o,id:'delivered',estadoHistoricoExcel:'Entregado'}];const before=JSON.stringify(w.DB);assert.equal(c.newInstallation(o),true);assert.equal(g.baseRows().length,1);assert.equal(g.entries().length,0);const html=g.body();assert.ok(html.includes('Obra nueva · revisar y planificar'));assert.ok(html.includes('Obras nuevas (1)'));assert.ok(html.includes('data-g-detail="new/sinaccion"'));assert.ok(!g.datesBody('2026-10-19').includes('OT 4800'));assert.equal(JSON.stringify(w.DB),before);o.colocacionesGestion={acciones:{a:{...action(''),id:'a'}}};assert.equal(c.newInstallation(o),false);assert.equal(g.baseRows().length,1);assert.ok(!g.body().includes('Obra nueva · revisar y planificar'));assert.equal(g.entries().length,1);o.estado='Entregado';assert.equal(c.pendingInstallation(o),false);});

test('Dashboard mide los cierres de la misma base y Por fecha muestra sólo la planificación',()=>{const w=ui(),g=w.TIZColocacionesGeneralV129;w.TIZColocacionesCore.today=()=> '2026-10-12';w.DB.obras=[{id:'o',estado:'Pendiente',ot:'4800',cliente:'Cliente',desc:'Cartel',colocacionesGestion:{acciones:{a:{...action('2026-10-12'),fechaReal:'2026-10-12',estado:'Cerrada',resultado:'Listo'}}}}];const calendar=g.datesBody('2026-10-12'),dashboard=g.body('dashboard','2026-10-12');assert.ok(!calendar.includes('Cumplimiento actual'));assert.ok(!calendar.includes('Gestión por responsable'));for(const t of ['Dashboard · gestión de Colocaciones','Cumplimiento actual','Gestión por responsable','Obras nuevas (0)','1 / 1'])assert.ok(dashboard.includes(t),t);assert.equal(g.managementMetrics(g.entries(),'2026-10-12').done,1);});

test('Acciones incluye el cliente y conserva las secciones abiertas del Dashboard al actualizar',()=>{const g=ui().TIZColocacionesGeneralV129,r={key:'o/a',obra:{ot:'4800',desc:'Cartel'},cliente:'Farmacity',accion:action('2026-10-12')};assert.ok(g.compactRow(r).includes('OT 4800 · Farmacity · Cartel'));g.captureUI({querySelectorAll:()=>[{dataset:{gDisclosure:'compliance-actions'},open:true}]});assert.ok(g.body('dashboard','2026-10-12').includes('data-g-disclosure="compliance-actions" open'));g.captureUI({querySelectorAll:()=>[{dataset:{gDisclosure:'compliance-actions'},open:false}]});assert.ok(!g.body('dashboard','2026-10-12').includes('data-g-disclosure="compliance-actions" open'));});

test('corregir un cierre conserva el plan y estado; rechaza fechas futuras y no rebaja el control final',()=>{const old={...action('2026-10-08','Cerrada'),tipo:'Colocación',control:'Conforme',fechaReal:'2026-10-09',resultado:'Terminada'},fields={titulo:'Montar cartel',responsable:'Gian',observaciones:'Recepción confirmada',fechaReal:'2026-10-10'};const next=G.correctClosedAction(old,fields,'2026-10-12','2026-10-12T14:00:00Z','Ariel');assert.equal(next.estado,'Cerrada');assert.equal(next.fecha,'2026-10-08');assert.equal(next.fechaReal,'2026-10-10');assert.equal(next.control,'Conforme');assert.equal(Object.values(next.correcciones)[0].antes.responsable,'Ariel');for(const invalid of [{...fields,fecha:'2026-10-09'},{...fields,fechaReal:'2026-10-13'},{...fields,control:'Con observaciones'}])assert.throws(()=>G.correctClosedAction(old,invalid,'2026-10-12','at','Ariel'));assert.equal(old.fechaReal,'2026-10-09');});
test('Editar datos habilita la corrección de un cierre pero la fecha planificada continúa sólo de lectura',async()=>{let dialog;const events={},doc={getElementById:()=>({}),createElement:()=>dialog={innerHTML:'',setAttribute(){},addEventListener(){},querySelector:()=>null,remove(){}},body:{append(){}}};const w=ui(doc),g=w.TIZColocacionesGeneralV129;w.canViewPage=()=>true;w.canAnnotateSector=()=>true;w.TIZColocacionesUIV128={blockers:()=>[],render(){}};w.DB.obras=[{id:'o',ot:'4728',estado:'Entregado',colocacionesGestion:{acciones:{a:{...action('2026-10-13','Cerrada'),fechaReal:'2026-10-12',resultado:'Entregado'}}}}];assert.ok(g.inlineRow(g.entries()[0]).includes('data-g-correct="o/a"'));g.attach({addEventListener:(name,fn)=>events[name]=fn});const b={dataset:{gCorrect:'o/a'},hasAttribute:name=>name==='data-g-correct'};await events.click({target:{closest:()=>b}});assert.ok(dialog.innerHTML.includes('Guardar corrección'));assert.ok(dialog.innerHTML.includes('name="fecha" aria-label="Fecha planificada" value="2026-10-13" readonly'));assert.ok(dialog.innerHTML.includes('name="fechaReal"'));assert.ok(dialog.innerHTML.includes('value="Entregado"'));});
test('la corrección de una tarea con OT valida la versión y actualiza los indicadores desde el mismo registro',async()=>{const w=ui(),source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),start=source.indexOf('  async function correctClosed('),end=source.indexOf('  function actionFromForm(',start),o={id:'o',neto:1000,colocacionesGestion:{acciones:{a:{...action('2026-10-08','Cerrada'),fechaReal:'2026-10-09',resultado:'Entregada',actualizadoEn:'v1'}}}};let writes=0;vm.runInNewContext(source.slice(start,end)+'\nwindow.testCorrection=correctClosed;',{window:w,data:x=>x.colocacionesGestion,today:()=> '2026-10-12',stamp:()=> '2026-10-12T14:00:00Z',actor:()=> 'Ariel',mutate:async(id,fn)=>{const patch=fn(o);writes++;assert.ok(Object.keys(patch).every(k=>k.startsWith('colocacionesGestion.acciones.')));w.TIZColocacionesCore.applyPatch(o,patch);return patch}});await assert.rejects(w.testCorrection('o','a',{fechaReal:'2026-10-10'},'old'),/modificó/);assert.equal(writes,0);await w.testCorrection('o','a',{fechaReal:'2026-10-10'},'v1');assert.equal(o.colocacionesGestion.acciones.a.fecha,'2026-10-08');assert.equal(w.TIZColocacionesGeneralV129.performance(o.colocacionesGestion.acciones.a,'2026-10-12').delay,2);assert.equal(o.neto,1000);});


test('terminar una acción la quita de Acciones y conserva el cierre en Histórico',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129;
 w.canViewPage=()=>true;w.canAnnotateSector=()=>true;
 const finished={...action('2026-10-13'),titulo:'Coordinar colocación / entrega',fechaApertura:'2026-10-01'};
 w.DB.obras=[{id:'ot4728',ot:'4728',cliente:'Produccionart S.A.',desc:'Señalética en PVC 3 mm',estado:'Pendiente',colocacionesGestion:{legacyCapturada:true,acciones:{a:finished}}}];
 assert.ok(g.body('base').includes('data-g-detail="ot4728/a"'));
 Object.assign(finished,{estado:'Cerrada',fechaReal:'2026-10-12',resultado:'Entregado'});
 const saved=JSON.stringify(w.DB);
 assert.equal(g.filtered().length,0);
 assert.ok(!g.body('base').includes('data-g-detail="ot4728/a"'));
 assert.ok(g.body('base').includes('Ver histórico (1)'));
 assert.ok(!g.body('base').includes('data-g-list="historico"'));
 const history=g.body('historico');
 for(const value of ['4728','Entregado','12/10/2026','13/10/2026','data-g-detail="ot4728/a"'])assert.ok(history.includes(value));
 assert.equal(g.managementMetrics(g.entries(),'2026-10-12').onTime,1);
 assert.equal(JSON.stringify(w.DB),saved);
});
test('Acciones permite pendientes sin fecha y no mezcla cerradas al cambiar filtros',()=>{
 const nodes={'g129-style':{}},events={},w=ui({getElementById:id=>nodes[id]});
 w.DB.obras=[{id:'o',ot:'4728',estado:'Pendiente',colocacionesGestion:{acciones:{a:action(''),b:{...action('2026-10-13','Cerrada'),id:'b',fechaReal:'2026-10-12'}}}}];
 const g=w.TIZColocacionesGeneralV129;
 g.attach({addEventListener:(type,fn)=>{events[type]=fn}});
 for(const status of ['todas','sinfecha','pendientes']){
  events.click({target:{closest:()=>({hasAttribute:n=>n==='data-g-list',dataset:{gList:status}})}});
  assert.deepEqual(Array.from(g.filtered(),r=>r.accion.id),['a']);
 }
});


test('una acción intermedia pide sólo fecha real, permite resultado opcional y no pide fotos ni retrabajo',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129;w.canViewPage=()=>true;w.canAnnotateSector=()=>true;
 const html=g.inlineRow({key:'o/a',obra:{id:'o',ot:'4700'},accion:{...action('2026-10-13'),tipo:'Coordinación'}});
 assert.ok(html.includes('Terminar acción'));
 assert.ok(html.includes('La obra continúa abierta'));
 assert.ok(html.includes('Resultado (opcional)'));
 assert.ok(!html.includes('name="control"'));
 assert.ok(!html.includes('name="retrabajo"'));
 assert.ok(!html.includes('photo'));
});


test('retiro sin OT muestra su dirección a Ariel y genera navegación Google Maps con localidad',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129;
 const row={key:'sinOT/a',draft:true,obra:{id:'sinOT'},accion:{...action('2026-10-16'),direccion:'Calle Prueba 123',zona:'San Miguel, Buenos Aires'}};
 const detail=g.dateDetails(row),form=g.inlineRow(row);
 assert.ok(detail.includes('Calle Prueba 123'));
 for(const html of [detail,form]){assert.ok(html.includes('Google Maps'));assert.ok(html.includes('/maps/dir/?api=1'));assert.ok(html.includes('dir_action=navigate'));assert.ok(html.includes(encodeURIComponent('Calle Prueba 123, San Miguel, Buenos Aires')));}
 assert.ok(form.includes('name="direccion"'));
 assert.ok(form.includes('name="zona"'));
 assert.equal(g.mapsLink('','San Miguel'),'');
 assert.ok(!g.mapsLink('Prueba <img src=x>','').includes('<img'));
});
test('editar una acción vinculada guarda su destino propio y conserva el domicilio de la obra',async()=>{
 const w=ui(),C=w.TIZColocacionesCore,source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),start=source.indexOf('  async function saveInline('),end=source.indexOf('  async function correctClosed',start);
 const o={id:'o',entregaLogistica:{domicilio:'Domicilio de la obra'},colocacionesGestion:{acciones:{a:{...action('2026-10-16'),direccion:'Retiro anterior',zona:'Zona anterior',actualizadoEn:'v1'}}}},win={};let patch;
 vm.runInNewContext(source.slice(start,end)+'\nwindow.save=saveInline;',{window:win,blockers:()=>[],mutate:async(id,fn)=>{patch=fn(o);return patch},actions:C.actions,db:()=>({}),open:G.open,validateAction:C.validateAction,isoDate:C.isoDate,stamp:()=> 'v2',actor:()=> 'Compras'});
 await win.save('o','a',{titulo:'Buscar materiales',fecha:'2026-10-16',responsable:'Ariel',observaciones:'Coordinar retiro',direccion:'Calle Prueba 456',zona:'San Miguel'},'v1');
 assert.equal(patch['colocacionesGestion.acciones.a'].direccion,'Calle Prueba 456');
 assert.equal(patch['colocacionesGestion.acciones.a'].zona,'San Miguel');
 assert.equal(o.entregaLogistica.domicilio,'Domicilio de la obra');
 assert.equal(G.cleanAction({...action('2026-10-16'),direccion:'Calle Prueba 123',zona:'San Miguel'}).direccion,'Calle Prueba 123');
});

test('Por fecha excludes every resolved action and keeps all results in Histórico without deleting data',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129;
 w.DB.obras=[{id:'o',ot:'4776',cliente:'Cliente',estado:'Pendiente',colocacionesGestion:{acciones:{a:{...action('2026-10-13'),titulo:'Pendiente visible'},b:{...action('2026-10-13','Cerrada'),id:'b',titulo:'Terminada con fecha pasada',fechaReal:'2026-10-14'},c:{...action('2026-10-13','Reprogramada'),id:'c',titulo:'Reprogramación anterior',fechaReal:'2026-10-14'},d:{...action('2026-10-13','Cancelada'),id:'d',titulo:'Cancelada anterior'},e:{...action('2026-10-14','Bloqueada'),id:'e',titulo:'Bloqueada visible'}}}}];
 const before=JSON.stringify(w.DB),calendar=g.datesBody('2026-10-12'),history=g.body('historico');
 for(const t of ['Pendiente visible','Bloqueada visible']){assert.ok(calendar.includes(t));assert.ok(!history.includes(t));}
 for(const t of ['Terminada con fecha pasada','Reprogramación anterior','Cancelada anterior']){assert.ok(!calendar.includes(t));assert.ok(history.includes(t));}
 assert.equal(JSON.stringify(w.DB),before);
});

test('Por fecha hides empty days and undated groups while preserving overdue and future pending actions',()=>{
 const w=ui(),g=w.TIZColocacionesGeneralV129;w.TIZColocacionesCore.today=()=> '2026-10-15';
 w.DB.obras=[{id:'o',ot:'4776',estado:'Pendiente',cliente:'Cliente',colocacionesGestion:{acciones:{a:{...action('2026-10-13'),titulo:'Pendiente vencida'},b:{...action('2026-10-17'),id:'b',titulo:'Pendiente futura'},c:{...action('2026-10-12','Cerrada'),id:'c',titulo:'Terminada',fechaReal:'2026-10-12'}}}}];
 const before=JSON.stringify(w.DB),html=g.datesBody('2026-10-12');assert.equal((html.match(/<section class="c128-day /g)||[]).length,2);assert.ok(html.includes('13/10/2026'));assert.ok(html.includes('17/10/2026'));assert.ok(html.includes('Pendiente vencida'));assert.ok(html.includes('Pendiente futura'));assert.ok(html.includes('data-g-detail="o/a"'));assert.ok(!html.includes('Sin acciones'));assert.ok(!html.includes('Acciones abiertas sin fecha'));assert.equal(JSON.stringify(w.DB),before);
 w.DB.obras[0].colocacionesGestion.acciones.a.estado='Cerrada';w.DB.obras[0].colocacionesGestion.acciones.b.estado='Cerrada';const empty=g.datesBody('2026-10-12');assert.ok(!empty.includes('c128-day'));assert.ok(!empty.includes('Sin acciones'));assert.ok(!empty.includes('Acciones abiertas sin fecha'));assert.ok(empty.includes('data-week-step'));
 w.DB.obras[0].colocacionesGestion.acciones.d={...action(''),id:'d',titulo:'Pendiente sin fecha'};assert.ok(g.datesBody('2026-10-12').includes('Acciones abiertas sin fecha (1)'));
});
