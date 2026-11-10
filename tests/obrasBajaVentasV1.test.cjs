'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const O=require('../functions/obrasSeguimientoCoreV2'),A=require('../functions/analisisPreliminarCoreV1'),P=require('../comprasObrasCoreV1'),Q=require('../calidadV1'),L=require('../obrasListadoV1'),Cache=require('../obrasConsultaCacheV1'),Consulta=require('../functions/obrasConsultaV1');
const read=p=>fs.readFileSync(require.resolve('../'+p),'utf8'),admin={email:'giancarlo.pareja@tizpublicidad.com',isAdmin:true,sector:'Ventas'},work=()=>({id:'cancelada',ot:'4800',cliente:'Cliente',desc:'Cartel cancelado',estado:'Pendiente',sector:'Diseño'}),cancel=()=>({...work(),...O.bajaPatch(work(),'Cliente canceló la apertura',admin,false,'2026-11-03T12:00:00Z')}),source=[{row:3,ot:'0004800.1',cliente:'Cliente',desc:'Anticipo',status:'Pendiente'},{row:4,ot:'4800.2',cliente:'Cliente',desc:'Saldo',status:'Cobrado pendiente'}];
test('Obras no permite la baja, incluso para Ventas; una selección antigua no guarda',async()=>{
 const src=read('obrasSeguimientoV2.js'),w=work(),g=O.grouped([w])[0];let actor=admin,opened='',writes=0;
 const ctx={C:O,E:String,badge:String,user:()=>actor,groups:()=>[g],window:{TIZObraBajaV1:{open:id=>opened=id},cambiarEstadoObraV1:()=>writes++},consulta:{},S:{},render(){},renderQuality(){}};
 vm.runInNewContext(src.slice(src.indexOf('const statusSaving='),src.indexOf('const oldEditButton='))+'\nglobalThis.cell=statusCell;globalThis.save=saveStatus;',ctx);
 assert.doesNotMatch(ctx.cell(g),/value="Baja"/);const select={dataset:{o2Status:w.id},value:'Baja'};await ctx.save(select);assert.equal(opened,'');assert.match(ctx.S.error,/Presupuestos/);assert.equal(select.value,'Pendiente');assert.equal(writes,0);
 for(const email of ['julieta.aguirre@tizpublicidad.com','carolina.flores@tizpublicidad.com']){actor={email};assert.doesNotMatch(ctx.cell(g),/value="Baja"/);assert.throws(()=>O.bajaPatch(w,'Cancelada por cliente',actor),/Ventas/);}
});
test('la baja impide que la planilla recree pendientes en Compras, Calidad, Operaciones y análisis preliminar',()=>{
 const w=cancel();for(const works of [[w],[w,{...work(),id:'saldo',ot:'4800.2'}]]){assert.deepEqual(P.merge(source,works),[]);assert.deepEqual(Q.motherWorks(source,works),[]);assert.deepEqual(A.workList(source,works),[]);}
 const other={...work(),id:'otra',ot:'4801'};assert.equal(P.merge(source,[w,other])[0].id,'otra');assert.equal(A.workList(source,[w,other])[0].id,'otra');
});
test('reactivar devuelve el trabajo y una revisión antigua cancelada no oculta la revisión vigente',()=>{
 const w=cancel(),restored={...w,...O.bajaPatch(w,'El cliente volvió a confirmar',admin,true)};
 for(const works of [[restored],[{...w,revisionVigente:false},{...work(),id:'actual'}]]){assert.equal(P.merge(source,works).length,1);assert.equal(Q.motherWorks(source,works).length,1);assert.equal(A.workList(source,works).length,1);}
});
test('Producción, alertas y seguimiento excluyen la baja conservando el historial en Obras',()=>{
 const w=cancel(),g=O.grouped([w])[0];assert.equal(g.estado,'Baja');assert.equal(g.bajaObra.motivo,'Cliente canceló la apertura');assert.deepEqual(L.production([w],[{id:w.id,obraOperativaId:w.id,ot:w.ot,cliente:w.cliente,descripcion:w.desc}]),[]);assert.deepEqual(O.alerts(g),[]);assert.deepEqual(O.deadlines([g]),[]);
});
test('la consulta y caché conservan motivo y reactivación sin exponer campos comerciales anidados',()=>{
 const w=cancel();w.bajaObra.neto=123456;for(const p of [Cache.project(w,O),Consulta.projectWork({id:w.id,data:()=>w})]){assert.equal(p.bajaObra.motivo,w.bajaObra.motivo);assert.equal(O.grouped([p])[0].estado,'Baja');assert.equal(p.bajaObra.neto,undefined);}
 const projected=Cache.project({...w,estado:'Pendiente',bajaObra:{activa:false,motivo:'Anterior'}},O);assert.equal(projected.bajaObra.activa,false);
});
test('las observaciones y checklists de la obra cancelada salen de las listas de Calidad',()=>{
 const w={...cancel(),calidadGestion:{registros:{q:{id:'q',estado:'Pendiente'}}}},db={obras:[w],calidad:[{id:'externo',obraId:w.id,estado:'Pendiente'},{id:'interno',estado:'Pendiente'}],checklists:[{key:'q1',obraId:w.id,ot:'4800'},{key:'q2',ot:'0004800.2'},{key:'q3',ot:'4801'}]};assert.deepEqual(Q.rows(db).map(r=>r.id),['interno']);
 const src=read('calidadChecklistsV2.js'),start=src.indexOf(' const records='),end=src.indexOf(' function sources()',start),ctx={window:{DB:db}};vm.runInNewContext(src.slice(start,end)+'\nglobalThis.list=records;',ctx);assert.deepEqual(Array.from(ctx.list(),r=>r.key),['q3']);assert.equal(db.checklists.length,3);
});
test('Diseño excluye la obra cancelada de la lista y de sus totales',()=>{
 const src=read('index.html'),start=src.indexOf('function renderDiseno()'),end=src.indexOf('// COBRANZAS',start),nodes={},window={DB:{obras:[{...cancel(),neto:987654},{id:'activa',sector:'Diseño',desc:'Trabajo vigente',neto:100}]},TIZObrasSeguimientoCoreV2:O},ctx={window,document:{getElementById:id=>nodes[id]??=( {innerHTML:''} )},fmtM:String,estadoBadge:String};vm.runInNewContext(src.slice(start,end)+'\nrenderDiseno();',ctx);assert.doesNotMatch(nodes['dis-tbody'].innerHTML,/Cartel cancelado/);assert.match(nodes['dis-tbody'].innerHTML,/Trabajo vigente/);assert.doesNotMatch(nodes['dis-kpis'].innerHTML,/987654/);
});
test('la respuesta de guardado actualiza la consulta común aunque la obra no esté en la base parcial del puesto',()=>{
 const src=read('obrasSeguimientoV2.js'),start=src.indexOf('function applyWorkPatches('),end=src.indexOf('async function saveStatus',start),w=work(),consulta={generation:5,busy:true,works:[w]},ctx={consulta,window:{DB:{obras:[]}},S:{qualityKey:'anterior'},render(){},renderQuality(){}};vm.runInNewContext(src.slice(start,end)+'\nglobalThis.apply=applyWorkPatches;',ctx);ctx.apply([{id:w.id,patch:cancel()}]);assert.equal(consulta.works[0].estado,'Baja');assert.equal(consulta.works[0].bajaObra.motivo,'Cliente canceló la apertura');assert.equal(consulta.busy,false);assert.equal(consulta.generation,6);
});
