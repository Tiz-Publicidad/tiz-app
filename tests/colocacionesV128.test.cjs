'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8');
const window={};vm.runInNewContext(source,{window,Date,Intl,TextEncoder,console});const C=window.TIZColocacionesCore;
const base=()=>({id:'obra1',ot:'4573',cliente:'Cliente',entregaLogistica:{contacto:'Ana',contactoTelefono:'111',domicilio:'Calle 123'},colocacionesGestion:{legacyCapturada:true,acciones:{primera:{id:'primera',titulo:'Enviar plano',fecha:'2026-10-07',responsable:'Juli',estado:'Pendiente',todoDia:true}}},sectores:{produccion:{estado:'Terminada'},colocaciones:{compromiso:'07/10/2026'}}});
test('agenda usa fecha argentina y cubre ayer, hoy y seis días siguientes, cruzando meses',()=>{
  assert.equal(C.today(new Date('2026-10-09T01:30:00Z')),'2026-10-08');
  const days=Array.from({length:8},(_,i)=>C.shift('2026-10-31',i-1));assert.equal(days[0],'2026-10-30');assert.equal(days[7],'2026-11-06');assert.equal(new Set(days).size,8);
  assert.equal(C.isoDate('31/02/2026'),'');assert.equal(C.isoDate('8/10/2026'),'2026-10-08');
});
test('toma contacto de cotización vinculada y permite completar cargo sin modificar fuente',()=>{
  const o=base(),q={id:'p1',entregaLogistica:{contacto:'Arquitecta',contactoTelefono:'222',contactoEmail:'obra@example.test',domicilio:'Obra 456'}};o.presupuestoId='p1';o.colocacionesGestion.contactos={cotizacion:{nombre:'Arquitecta',cargo:'Arquitecto',telefono:'333'}};
  const c=C.contacts(o,{presupuestos:[q]})[0];assert.equal(c.cargo,'Arquitecto');assert.equal(c.telefono,'333');assert.equal(c.email,'obra@example.test');assert.equal(q.entregaLogistica.contactoTelefono,'222');assert.equal(C.logistics(o,{presupuestos:[q]}).direccion,'Obra 456');
});
test('contactos guardados quedan aislados por obra del mismo cliente',()=>{
  const a=base(),b=base();b.id='obra2';a.colocacionesGestion.contactos={externo:{id:'externo',nombre:'Colocador',cargo:'Colocador'}};
  assert.equal(C.contacts(a,{}).length,2);assert.equal(C.contacts(b,{}).some(x=>x.nombre==='Colocador'),false);
});
test('no adivina la cotización cuando hay más de una revisión candidata',()=>{
  const o=base();const db={presupuestos:[{id:'x',nro:'004573'},{id:'y',nro:'4573'}]};assert.equal(Object.keys(C.quote(o,db)).length,0);
  o.presupuestoId='x';assert.equal(C.quote(o,db).id,'x');
});
test('reprogramación conserva compromiso original y resultado, crea próxima acción y no toca producción',()=>{
  const o=base(),next={id:'segunda',titulo:'Confirmar recepción',fecha:'2026-10-09',responsable:'Ariel',estado:'Pendiente',todoDia:true};
  const p=C.resultPatch(o,'primera',{detalle:'Enviado, falta respuesta',fechaReal:'2026-10-08'},next,'2026-10-08T15:00:00Z','user',{});C.applyPatch(o,p);
  assert.equal(o.colocacionesGestion.acciones.primera.fecha,'2026-10-07');assert.equal(o.colocacionesGestion.acciones.primera.estado,'Reprogramada');assert.equal(o.colocacionesGestion.acciones.primera.resultado,'Enviado, falta respuesta');assert.equal(o.colocacionesGestion.acciones.segunda.anteriorId,'primera');assert.equal(C.pending(o,{}).length,1);assert.equal(o.sectores.produccion.estado,'Terminada');
  assert.throws(()=>C.resultPatch(o,'primera',{detalle:'otra vez',fechaReal:'2026-10-08'},next,'','',{}),/ya fue gestionada/);
});
test('cerrar acción la quita de pendientes y no cierra automáticamente la colocación',()=>{
  const o=base();C.applyPatch(o,C.resultPatch(o,'primera',{detalle:'Confirmado',fechaReal:'2026-10-08'},null,'2026-10-08T15:00:00Z','user',{}));assert.equal(C.pending(o,{}).length,0);assert.equal(o.colocacionesGestion.acciones.primera.estado,'Cerrada');assert.equal(o.colocacionesGestion.cierre,undefined);
});
test('fecha heredada permanece visible y se captura una sola vez al gestionarla',()=>{
  const o=base();o.colocacionesGestion={};assert.equal(C.pending(o,{}).length,1);
  C.applyPatch(o,C.resultPatch(o,'legacy',{detalle:'Confirmado',fechaReal:'2026-10-08'},null,'','',{}));assert.equal(C.pending(o,{}).length,0);assert.equal(o.colocacionesGestion.legacyCapturada,true);
});
test('validación exige próximo responsable, fecha y hora válida para compromisos con horario',()=>{
  for(const a of [{titulo:'Tarea',fecha:'2026-10-09'}, {titulo:'Tarea',responsable:'Ariel',fecha:'2026-02-30'}, {titulo:'Tarea',responsable:'Ariel',fecha:'2026-10-09',todoDia:false,hora:'99:99',duracion:60}])assert.throws(()=>C.validateAction(a));
  assert.throws(()=>C.resultPatch(base(),'primera',{detalle:'',fechaReal:'2026-10-08'},null,'','',{}),/resultado/);
});
test('calendario respeta día completo y hora argentina, mantiene UID y omite acciones cerradas',()=>{
  const o=base(),whole=o.colocacionesGestion.acciones.primera,clock={id:'segunda',titulo:'Visita',fecha:'2026-10-09',responsable:'Ariel',todoDia:false,hora:'09:00',duracion:90,estado:'Pendiente',aviso:60};
  const output=C.calendar([{obra:o,accion:whole},{obra:o,accion:clock},{obra:o,accion:{...whole,id:'cerrada',estado:'Cerrada'}}],new Date('2026-10-08T12:00:00Z'),{});
  assert.match(output,/DTSTART;VALUE=DATE:20261007/);assert.match(output,/DTEND;VALUE=DATE:20261008/);assert.match(output,/DTSTART:20261009T120000Z/);assert.match(output,/DTEND:20261009T133000Z/);assert.match(output,/UID:obra1-segunda@tizpublicidad.com/);assert.equal((output.match(/BEGIN:VEVENT/g)||[]).length,2);assert.match(output,/TRIGGER:-PT60M/);assert.equal(output.includes('\n')&&!output.includes('\r\n'),false);
});
test('calendario escapa contenido, pliega UTF-8 y no incluye importes comerciales',()=>{
  const o=base();o.neto=987654;o.infoPresupuesto={importe:987654};const a={...o.colocacionesGestion.acciones.primera,titulo:'á'.repeat(100)+', plano; detalle\nextra'};const output=C.calendar([{obra:o,accion:a}],new Date(),{});
  assert.equal(output.includes('987654'),false);assert.equal(output.split('\r\n').every(line=>Buffer.byteLength(line)<=75),true);assert.match(output,/\\,/);assert.match(output,/\\;/);
});
test('Clemen recupera experiencias únicamente del mismo tipo y muestra la obra de origen',()=>{
  const o=base();o.colocacionesGestion.tipoTrabajo='Vinilos';const prev=base();prev.id='otra';prev.ot='4000';prev.colocacionesGestion.tipoTrabajo='Vinilos';prev.colocacionesGestion.notas={n:{tipo:'Experiencia',texto:'Revisar ingreso de escalera'}};
  const unrelated=base();unrelated.id='tercera';unrelated.colocacionesGestion.tipoTrabajo='Muebles';unrelated.colocacionesGestion.notas={n:{tipo:'Experiencia',texto:'No corresponde'}};
  const s=C.suggestions(o,{obras:[o,prev,unrelated]},'2026-10-08');assert.equal(s.some(x=>x.detalle==='No corresponde'),false);assert.equal(s.find(x=>x.detalle==='Revisar ingreso de escalera').origen,'OT 4000 · Cliente');
});
test('guardado transaccional verifica permisos y sólo permite campos de colocaciones',async()=>{
  const app=fs.readFileSync(path.join(root,'index.html'),'utf8'),start=app.indexOf('window.mutateColocacionesV128 ='),end=app.indexOf('\nwindow.deleteDoc_',start);const o=base();let reads=0,writes=0;
  const w={canViewPage:()=>true,canAnnotateSector:()=>true},tx={get:async()=>{reads++;return{exists:()=>true,data:()=>o}},update:(_r,p)=>{writes++;C.applyPatch(o,p)}};
  vm.runInNewContext(app.slice(start,end),{window:w,db:{},doc:()=>({}),runTransaction:async(_db,fn)=>fn(tx)});
  await w.mutateColocacionesV128('obra1',current=>C.resultPatch(current,'primera',{detalle:'Listo',fechaReal:'2026-10-08'},null,'','',{}));
  await assert.rejects(w.mutateColocacionesV128('obra1',current=>C.resultPatch(current,'primera',{detalle:'Listo',fechaReal:'2026-10-08'},null,'','',{})),/ya fue gestionada/);assert.equal(writes,1);assert.equal(reads,2);
  await assert.rejects(w.mutateColocacionesV128('obra1',()=>({neto:1})),/sólo/);w.canAnnotateSector=()=>false;await assert.rejects(w.mutateColocacionesV128('obra1',()=>({})),/permiso/);
});
test('importación sólo propone OT única, nunca adivina por cliente y conserva histórico',()=>{
  const headers=['Obra / OT','Cliente','Tarea / Operación','Responsable','Estado','Fecha compromiso','Fecha de finalización'];
  const sheets={Colocaciones:[['Planificación'],headers,['004573','Cliente','Enviar plano','J','Planificada','08/10/2026',''],['','Cliente','Llamar','', '', '', ''],['9999','Cliente','Relevar','A','','09/10/2026','']],Histórico:[headers,['4573','Cliente','Terminada','J','Terminada','07/10/2026','08/10/2026']]};
  const works=[{id:'uno',ot:4573},{id:'dos',ot:9999},{id:'tres',ot:'009999'}],rows=C.parseImportRows(sheets,works);
  assert.equal(rows.length,4);assert.equal(rows[0].obraId,'uno');assert.equal(rows[1].obraId,'');assert.equal(rows[1].fecha,'');assert.equal(rows[2].obraId,'');assert.equal(rows[3].estado,'Cerrada');assert.equal(rows[3].fechaReal,'2026-10-08');assert.equal(rows[0].responsable,'J');assert.equal(rows[0].estadoPlanilla,'Planificada');
});
test('identidad importada permanece estable al cambiar fecha; conserva acciones sin responsable',()=>{
  const headers=['Obra / OT','Tarea / Operación','Fecha compromiso'],sheets={Colocaciones:[headers,['4573','Revisar plano','08/10/2026']]};const first=C.parseImportRows(sheets,[])[0];sheets.Colocaciones[1][2]='09/10/2026';const next=C.parseImportRows(sheets,[])[0];assert.equal(first.id,next.id);assert.equal(next.fecha,'2026-10-09');assert.equal(next.responsable,'');
});

test('pantalla real envía acciones autenticadas al acceso de Colocaciones y propaga errores',async()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(html,/serverTimestamp, runTransaction.*firebase-firestore/);
  const start=html.indexOf('window.colocacionesApiV129 ='),end=html.indexOf('window.deleteDoc_',start);
  assert.ok(start>0 && end>start);
  let request,fail=false;
  const w={canViewPage:()=>true,canAnnotateSector:()=>true};
  const auth={currentUser:{getIdToken:async()=>'test-token'}};
  vm.runInNewContext(html.slice(start,end),{window:w,auth,fetch:async(url,opts)=>{request={url,opts};return{ok:!fail,json:async()=>fail?{error:'Sin permiso'}:{ok:true}}}});
  await w.colocacionesApiV129({mode:'save',sector:'otro'});
  assert.match(request.url,/facturacionIntegralEmitirV83$/);
  assert.equal(request.opts.headers.Authorization,'Bearer test-token');
  assert.equal(JSON.parse(request.opts.body).sector,'colocaciones');
  fail=true;await assert.rejects(w.colocacionesApiV129({mode:'list'}),/Sin permiso/);
  auth.currentUser=null;await assert.rejects(w.colocacionesApiV129({mode:'list'}),/permiso/);
});
