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
function ui(){const window={DB:{obras:[],clientes:[],presupuestos:[]},TIZColocacionesGeneralCore:G};const c={window,console,Date,Intl,TextEncoder,setInterval:()=>{},setTimeout:()=>{}};vm.runInNewContext(fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),c);vm.runInNewContext(fs.readFileSync(path.join(root,'colocacionesGeneralUIV129.js'),'utf8'),c);return window;}
test('base contiene obras aprobadas sin acción ni fecha y mantiene acciones con y sin fecha',()=>{
 const w=ui();w.DB.obras=[{id:'1',ot:'4700',cliente:'A',estado:'Aprobado'},{id:'2',ot:'4701',cliente:'B',estado:'Aprobado',colocacionesGestion:{acciones:{a:action(''),b:{...action('2026-10-09'),id:'b'}}}},{id:'3',estado:'Rechazado'}];
 const rows=w.TIZColocacionesGeneralV129.baseRows();assert.equal(rows.length,3);assert.equal(rows.filter(r=>r.obra.id==='1'&&r.empty).length,1);assert.equal(rows.some(r=>r.obra.id==='3'),false);assert.equal(w.TIZColocacionesGeneralV129.entries().length,2);
 const html=w.TIZColocacionesGeneralV129.body('base');for(const text of ['Domicilio / zona','Contactos','Modalidad','4700','Sin acción cargada'])assert.ok(html.includes(text));
});
test('calendario renderiza doce días consecutivos y el bloqueo reemplaza la navegación',()=>{
 const source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8');const w=ui();
 const c={window:w,Date,Intl,console,TextEncoder};
 // Execute the actual render helpers with lightweight DOM bindings.
 const start=source.indexOf('  function agendaHTML()'),end=source.indexOf('  function overlay()',start);
 const node={innerHTML:''};w.currentUser={};w.canViewPage=()=>true;w.TIZColocacionesGeneralV129.attach=()=>{};w.TIZColocacionesGeneralV129.load=()=>{};
 vm.runInNewContext(source.slice(start,end)+'\nwindow.testRender=render;window.testAgenda=agendaHTML;',{...c,today:()=> '2026-10-08',shift:G.shift,fmtDate:x=>x,open:G.open,esc:x=>String(x||''),bucket:a=>a.fecha<'2026-10-08'?'vencidas':'proximas',chip:x=>x,canWrite:()=>true,canRead:()=>true,allWorks:()=>[],pending:()=>[],db:()=>w.DB,style:()=>{},pageRoot:()=>node,btn:(text,attr)=>`<button ${attr}>${text}</button>`,state:{view:'agenda'},renderList:()=>{}});
 w.testRender();assert.equal((node.innerHTML.match(/<section class="c128-day /g)||[]).length,12);assert.ok(node.innerHTML.includes('2026-10-07 al 2026-10-18'));
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
