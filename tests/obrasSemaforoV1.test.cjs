const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const C=require('../functions/obrasSeguimientoCoreV2'),Cache=require('../obrasConsultaCacheV1'),Consulta=require('../functions/obrasConsultaV1');
const src=p=>fs.readFileSync(require.resolve('../'+p),'utf8');
test('semáforo compara fecha real y compromiso; amarillo sólo a menos de dos días y nunca tapa un vencimiento',()=>{
 const signal=(planned,real='',today='2026-11-04')=>C.productionSignal({produccionPrevista:planned,seguimiento:{produccionReal:real}},today).color;
 assert.equal(signal('2026-11-03'),'red');assert.equal(signal('2026-11-04'),'yellow');assert.equal(signal('2026-11-05'),'yellow');assert.equal(signal('2026-11-06'),'');
 assert.equal(signal('2026-11-03','2026-11-02'),'green');assert.equal(signal('2026-11-03','2026-11-03'),'green');assert.equal(signal('2026-11-03','2026-11-04'),'red');assert.equal(signal(''),'');
 assert.equal(signal('2027-01-01','','2026-12-31'),'yellow');assert.equal(signal('2028-02-29','','2028-03-01'),'red');
});
test('registrar la fecha real por Cristian cambia la producción de vencida a cumplida cuando se realizó a tiempo',()=>{
 const work={id:'w',estado:'Pendiente',ot:'4800',fprod_c:'2026-11-03'},user={email:'cristiantizpublicidad@gmail.com',sector:'Calidad'};
 assert.equal(C.productionSignal(C.grouped([work])[0],'2026-11-04').color,'red');
 const patch=C.trackingPatch(work,{produccionReal:'2026-11-03'},user,'2026-11-04T15:00:00Z');
 assert.equal(C.productionSignal(C.grouped([{...work,...patch}])[0],'2026-11-04').color,'green');
});
test('Obras oculta bajas aun al seleccionar todos; el historial de datos sigue disponible',()=>{
 const ui=src('obrasSeguimientoV2.js'),works=[{id:'active',estado:'Pendiente',ot:'4800'},{id:'off',estado:'Baja',ot:'4801',bajaObra:{activa:true}}],window={currentPage:'obras',DB:{obras:works}},ctx={C,window,usesConsulta:()=>false,order:Number};
 vm.runInNewContext(ui.slice(ui.indexOf('const groups=()=>'),ui.indexOf('function resetConsulta()'))+'\nglobalThis.list=groups;',ctx);
 assert.deepEqual(Array.from(ctx.list(),g=>g.id),['active']);assert.equal(window.DB.obras.length,2);
});
test('Drive válido llega a todos los puestos y se muestra verde; enlaces ausentes o ambiguos no se marcan disponibles',()=>{
 const D=require('../functions/analisisPreliminarCoreV1'),work={id:'w',ot:'4800',driveFolderId:'abcdefghijk'},projected=Consulta.projectWork({id:'w',data:()=>work});
 assert.equal(projected.driveFolderUrl,'https://drive.google.com/drive/folders/abcdefghijk');assert.equal(Cache.project(work,C).driveFolderUrl,projected.driveFolderUrl);
 for(const bad of ['javascript:alert(1)','https://evil.test/drive/folders/abcdefghijk'])assert.equal(Consulta.projectWork({id:'w',data:()=>({...work,driveFolderId:'',driveFolderUrl:bad})}).driveFolderUrl,'');
 const ui=src('analisisPreliminarV1.js'),window={TIZAnalisisPreliminarCoreV1:D,TIZObrasSeguimientoV2:{getGroup:()=>({members:[projected]})}},ctx={window,data:[],esc:String};
 vm.runInNewContext(ui.slice(ui.indexOf('function driveButton('),ui.indexOf('function decorate('))+'\nglobalThis.button=driveButton;',ctx);
 assert.match(ctx.button({id:'w',ot:'4800'}),/apv1-drive-ready/);assert.match(ctx.button({id:'w',ot:'4800'}),/Drive disponible/);
 window.TIZObrasSeguimientoV2.getGroup=()=>({members:[]});assert.doesNotMatch(ctx.button({id:'w'}),/apv1-drive-ready/);
 window.TIZObrasSeguimientoV2.getGroup=()=>({members:[projected,{driveFolderId:'anotherfolder123'}]});assert.doesNotMatch(ctx.button({id:'w'}),/apv1-drive-ready/);
});
test('un administrador ajeno a Ventas no puede dar de baja',()=>{
 assert.throws(()=>C.bajaPatch({estado:'Pendiente'},'Cliente canceló',{isAdmin:true,sector:'Producción',email:'pablo.aciar@tizpublicidad.com'}),/Solo Ventas/);
});

test('OT 4778: colocación del 30/10 vencida se marca roja aunque producción se haya cumplido',()=>{
 const g=C.grouped([{id:'4778',ot:'4778',estado:'Pendiente',fprod_c:'2026-10-29',fprod_r:'2026-10-29',fcol_c:'2026-10-30'}])[0];
 assert.equal(C.productionSignal(g,'2026-11-10').color,'green');
 assert.equal(C.placementSignal(g,'2026-11-10').color,'red');
 assert.match(C.placementSignal(g,'2026-11-10').label,/Colocación vencida/);
});
test('colocación compara su propia fecha real: en fecha, atraso, hoy, mañana, futura y sin fecha',()=>{
 const signal=(planned,real='',today='2026-11-10')=>C.placementSignal({colocacionPrevista:planned,seguimiento:{colocacionReal:real}},today).color;
 assert.equal(signal('2026-10-30','2026-10-29'),'green');assert.equal(signal('2026-10-30','2026-10-30'),'green');assert.equal(signal('2026-10-30','2026-11-02'),'red');
 assert.equal(signal('2026-11-10'),'yellow');assert.equal(signal('2026-11-11'),'yellow');assert.equal(signal('2026-11-12'),'');assert.equal(signal(''),'');
 assert.equal(signal('2027-01-01','','2026-12-31'),'yellow');
});
test('listado de Obras aplica el semáforo a las dos columnas y expone el motivo accesible',()=>{
 const ui=src('obrasSeguimientoV2.js'),code=ui.split('\n').filter(l=>l.startsWith('const productionDate=')||l.startsWith('const placementDate=')).join('\n'),fixed={...C,productionSignal:g=>C.productionSignal(g,'2026-11-10'),placementSignal:g=>C.placementSignal(g,'2026-11-10')},ctx={C:fixed,E:String,date:s=>s||'—'};
 vm.runInNewContext(code+'\nglobalThis.production=productionDate;globalThis.placement=placementDate;',ctx);
 const g={produccionPrevista:'2026-10-29',colocacionPrevista:'2026-10-30',seguimiento:{produccionReal:'2026-10-29'}};
 assert.match(ctx.production(g),/o2-date-green/);assert.match(ctx.placement(g),/o2-date-red/);assert.match(ctx.placement(g),/aria-label="[^"]*Colocación vencida/);
 assert.match(ui,/placementDate\(g\)\+'<\/td><td>'\+statusCell/);
});
