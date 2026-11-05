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

test('colocación usa los mismos límites que producción y su propia fecha real',()=>{
 const signal=(planned,real='',today='2026-11-05')=>C.installationSignal({colocacionPrevista:planned,seguimiento:{colocacionReal:real}},today);
 assert.equal(signal('2026-11-04').color,'red');assert.equal(signal('2026-11-05').color,'yellow');assert.equal(signal('2026-11-06').color,'yellow');assert.equal(signal('2026-11-07').color,'');
 assert.equal(signal('2026-11-04','2026-11-03').color,'green');assert.equal(signal('2026-11-04','2026-11-04').color,'green');assert.equal(signal('2026-11-04','2026-11-05').color,'red');
 assert.equal(signal('').color,'');assert.equal(signal('31/02/2026').color,'');assert.equal(signal('2027-01-01','','2026-12-31').color,'yellow');assert.equal(signal('2028-02-29','','2028-03-01').color,'red');
 assert.match(signal('2026-11-04').label,/Colocación vencida/);
 const g={produccionPrevista:'2026-11-04',colocacionPrevista:'2026-11-04',seguimiento:{produccionReal:'2026-11-04'}};
 assert.equal(C.productionSignal(g,'2026-11-05').color,'green');assert.equal(C.installationSignal(g,'2026-11-05').color,'red');
});

test('registrar la colocación real actualiza el semáforo sin cambiar producción',()=>{
 const work={id:'w',estado:'Pendiente',ot:'4800',fprod_c:'2026-11-02',fprod_r:'2026-11-02',fcol_c:'2026-11-04'},user={email:'cristiantizpublicidad@gmail.com',sector:'Calidad'};
 assert.equal(C.installationSignal(C.grouped([work])[0],'2026-11-05').color,'red');
 const patch=C.trackingPatch(work,{colocacionReal:'2026-11-04'},user,'2026-11-05T15:00:00Z'),g=C.grouped([{...work,...patch}])[0];
 assert.equal(C.installationSignal(g,'2026-11-05').color,'green');assert.equal(C.productionSignal(g,'2026-11-05').color,'green');
});

test('las celdas de colocación muestran el color y la explicación de su propio estado',()=>{
 const ui=src('obrasSeguimientoV2.js'),ctx={C:{...C,installationSignal:g=>C.installationSignal(g,'2026-11-05')},E:String,date:v=>v||'—'};
 vm.runInNewContext(ui.slice(ui.indexOf('const installationDate='),ui.indexOf('function css(){'))+';globalThis.cell=installationDate;',ctx);
 for(const [planned,real,color]of [['2026-11-04','','red'],['2026-11-06','','yellow'],['2026-11-04','2026-11-04','green']]){
  const html=ctx.cell({colocacionPrevista:planned,seguimiento:{colocacionReal:real}});assert.match(html,new RegExp('o2-date-'+color));assert.match(html,/title="Colocación/);assert.match(html,/aria-label=/);
 }
 assert.match(ui,/installationDate\(g\)\+'<\/td><td>'\+statusCell\(g\)/);
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
