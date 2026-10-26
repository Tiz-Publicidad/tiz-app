'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('../functions/calidadChecklistCoreV2');
const user={email:'pablo.aciar@tizpublicidad.com',sector:'Producción'},at='2026-10-14T20:00:00Z';
const form=(etapa='produccion')=>({etapa,fecha:C.today(),obraId:'o',ot:'4773',cliente:'Cliente',descripcion:'Cartel particular',alcance:'Dos piezas según plano R2',preparadoPor:'Pablo',seguimiento:'Cristian',referenciaPlano:'Plano R2',items:C.template(etapa).map(r=>({...r,criterio:'Según especificación de esta obra',estado:'Conforme'})),evidencia:'https://drive.google.com/file/d/foto/view',conformidad:'Cliente conforme',validar:true,revisionEsperada:0});
function backend(){
 const data=new Map([['obras/o',{ot:'4773',sectores:{produccion:{estado:'En proceso'}},calidadGestion:{registros:{}}}]]),writes=[];
 const ref=path=>({path,collection:name=>({doc:id=>ref(path+'/'+name+'/'+id)}),get:async()=>snap(path)}),snap=path=>({exists:data.has(path),data:()=>structuredClone(data.get(path))});
 const db={collection:name=>({doc:id=>ref(name+'/'+id)}),runTransaction:async fn=>{const queued=[];const result=await fn({get:async r=>snap(r.path),set:(r,d)=>queued.push([r.path,structuredClone(d)])});for(const [path,d]of queued){data.set(path,d);writes.push(path);}return result;}};
 const admin={auth:()=>({verifyIdToken:async()=>({email:user.email})}),firestore:()=>db};
 const source=fs.readFileSync(require.resolve('../functions/calidadChecklistApiV2'),'utf8'),exports={};vm.runInNewContext(source+'\nexports.test={save,pdf,keyFor,operator,read};',{exports,Buffer,URL,console,require:n=>n==='firebase-admin'?admin:n==='firebase-functions/v2/https'?{onRequest:(_,fn)=>fn}:n==='pdfkit'?require('../functions/node_modules/pdfkit'):n==='./calidadChecklistCoreV2'?C:n==='./calidadPortalV1'?require('../functions/calidadPortalV1'):require(n)});
 return{...exports.test,handler:exports.handle,db,data,writes,admin};
}
test('plantillas específicas por etapa y aprobación exige criterios, alcance y controles completos',()=>{
 assert.equal(Object.keys(C.STAGES).length,3);assert.notDeepEqual(C.template('produccion'),C.template('resultado'));
 assert.equal(C.clean(form(),user,at).estado,'Validado');
 for(const overrides of [{alcance:''},{seguimiento:''},{items:[{titulo:'Medidas',estado:'Pendiente',criterio:'Plano'}]},{items:[{titulo:'Medidas',estado:'Conforme',criterio:''}]},{items:[{titulo:'Prueba',estado:'No aplica',nota:''}]}])assert.throws(()=>C.clean({...form(),...overrides},user,at));
 assert.equal(C.clean({...form(),items:[{titulo:'Iluminación',estado:'No aplica',nota:'Cartel sin iluminación'}]},user,at).estado,'Validado');
 assert.equal(C.clean({...form(),validar:false,alcance:'',items:C.template('produccion')},user,at).estado,'Borrador');
});
test('Juli y Pablo preparan/aprueban; cuenta restringida no entra y no se agrega ninguna cuenta',()=>{
 assert.equal(C.canValidate('produccion',{email:'julieta.aguirre@tizpublicidad.com'}),true);assert.equal(C.canValidate('produccion',user),true);
 assert.equal(C.canValidate('produccion',{email:'carolina.flores@tizpublicidad.com',sector:'Compras'}),false);
 assert.equal(C.canWrite({restrictedColocaciones:true}),false);assert.throws(()=>C.clean(form(),{restrictedColocaciones:true},at),/cuenta/);
});
test('no libera siguiente etapa sin aprobación anterior y detecta revisiones desactualizadas',()=>{
 assert.throws(()=>C.clean(form('colocacion'),user,at),/etapa anterior/);
 const p=C.clean(form(),user,at),c=C.clean(form('colocacion'),user,at,{},p);assert.equal(c.anteriorRevision,1);
 assert.equal(C.fresh(c,{produccion:p}),true);assert.match(C.status(c,{produccion:{...p,revision:2}}),/cambió/);
 const r=C.clean(form('resultado'),user,at,{},c);assert.equal(C.fresh(r,{produccion:p,colocacion:c}),true);assert.equal(C.fresh(r,{produccion:{...p,revision:2},colocacion:c}),false);
 assert.throws(()=>C.clean({...form('resultado'),evidencia:''},user,at,{},c),/fotos finales/);assert.throws(()=>C.clean({...form('resultado'),conformidad:''},user,at,{},c),/conformidad/);
 assert.throws(()=>C.clean({...form(),revisionEsperada:1},user,at),/cambió/);assert.throws(()=>C.clean({...form(),evidencia:'javascript:alert(1)'},user,at),/HTTPS/);
});
test('guardado transaccional conserva versiones y los datos de producción, facturación y calidad',async()=>{
 const b=backend(),before=JSON.stringify(b.data.get('obras/o')),first=await b.save(b.db,{formulario:form()},user,at);
 assert.equal(first.record.revision,1);assert.equal(JSON.stringify(b.data.get('obras/o')),before);
 await assert.rejects(b.save(b.db,{key:first.key,formulario:form()},user,at),/cambió/);assert.equal(b.writes.length,2);
 const second=await b.save(b.db,{key:first.key,formulario:{...form(),revisionEsperada:1,observaciones:'Nueva nota'}},user,at);assert.equal(second.record.revision,2);assert.ok(b.data.has('calidadChecklists/'+first.id+'/versiones/1'));assert.ok(b.writes.every(p=>p.startsWith('calidadChecklists/')));
 await assert.rejects(b.save(b.db,{key:first.key,formulario:{...form('colocacion'),cliente:'Otra empresa'}},user,at),/misma obra/);
 const work=b.data.get('obras/o');work.calidadGestion.registros.q={estado:'Pendiente'};
 await assert.rejects(b.save(b.db,{key:first.key,formulario:form('colocacion')},user,at),/observaciones/);
});
test('resultado no puede aprobarse si la aprobación de Producción cambió después de Colocación',async()=>{
 const b=backend(),p=await b.save(b.db,{formulario:form()},user,at);await b.save(b.db,{key:p.key,formulario:form('colocacion')},user,at);
 await b.save(b.db,{key:p.key,formulario:{...form(),revisionEsperada:1}},user,at);
 await assert.rejects(b.save(b.db,{key:p.key,formulario:form('resultado')},user,at),/Cambió la aprobación/);
});
test('referencias sin OT tienen identidad estable y no crean una obra ni carpeta',async()=>{
 const b=backend(),r={...form(),obraId:'',ot:'',descripcion:'Auditoría 5S'};assert.equal(b.keyFor(r),b.keyFor({...r,descripcion:' Auditoría 5S '}));const saved=await b.save(b.db,{formulario:r},user,at);assert.equal(saved.record.ot,'');assert.equal(b.data.size,3);assert.equal(b.writes.some(p=>p.startsWith('obras/')),false);
});
test('PDF corresponde a la revisión guardada y conserva borrador como no liberado',async()=>{
 const b=backend(),r=C.clean({...form(),validar:false},user,at),buffer=await b.pdf(r);assert.equal(buffer.subarray(0,4).toString(),'%PDF');assert.ok(buffer.length>1000);
 const first=await b.save(b.db,{formulario:{...form(),validar:false}},user,at);await b.save(b.db,{key:first.key,formulario:{...form(),revisionEsperada:1,alcance:'Alcance cambiado'}},user,at);
 const historic=await b.read(b.db,{key:first.key,etapa:'produccion',revision:1});assert.equal(historic.alcance,'Dos piezas según plano R2');assert.equal(historic.estado,'Borrador');
});
test('endpoint rechaza usuarios ajenos y solicitudes sin token antes de consultar documentos',async()=>{
 const b=backend();await assert.rejects(b.operator({get:()=>''}),/Iniciá sesión/);b.admin.auth=()=>({verifyIdToken:async()=>({email:'intruso@example.com'})});await assert.rejects(b.operator({get:()=> 'Bearer token'}),/no tiene acceso/);assert.equal(b.writes.length,0);
});
test('recorrido por servidor existente guarda y descarga PDF sin crear una función ni ampliar cuentas',async()=>{
 const b=backend(),exports={},source=fs.readFileSync(require.resolve('../functions/baseMadreBackendV120'),'utf8');
 vm.runInNewContext(source,{exports,console,require:n=>n==='./facturabilidadV1'?require('../functions/facturabilidadV1'):n==='./baseMadreLayoutV1'?require('../functions/baseMadreLayoutV1'):n==='firebase-admin'?b.admin:n==='googleapis'?{google:{}}:n==='firebase-functions/v2/https'?{onRequest:(_,fn)=>fn}:n==='./calidadChecklistApiV2.js'?{handle:b.handler}:require(n)});
 const output=[],headers={},res={set:(k,v)=>headers[k]=v,status(){return this;},json:r=>output.push(r),send:r=>output.push(r)},req={method:'POST',get:k=>k==='authorization'?'Bearer token':'',body:{mode:'quality-checklist-save',formulario:form()}};
 await exports.sincronizarBaseMadreV120(req,res);assert.equal(output[0].ok,true);const saved=output[0];req.body={mode:'quality-checklist-pdf',key:saved.key,etapa:'produccion',revision:1};await exports.sincronizarBaseMadreV120(req,res);
 assert.equal(output[1].subarray(0,4).toString(),'%PDF');assert.equal(headers['Content-Type'],'application/pdf');assert.match(headers['Content-Disposition'],/OT-4773-produccion-R1/);
 assert.ok(!fs.readFileSync(require.resolve('../functions/allFunctionsV86'),'utf8').includes('Object.assign(exports, require("./calidadChecklistApiV2.js"))'));
});
test('formulario cliente usa el servidor habilitado con token y modo exclusivo de checklist',async()=>{
 const source=fs.readFileSync(require.resolve('../index.html'),'utf8'),start=source.indexOf('window.calidadChecklistApiV2 ='),end=source.indexOf('window.saveCalidadV1 =',start),calls=[];
 const window={TIZChecklistCoreV2:C,currentUser:user},auth={currentUser:{getIdToken:async()=> 'token'}};
 vm.runInNewContext(source.slice(start,end),{window,auth,fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body),headers:options.headers});return{ok:true,json:async()=>({ok:true}),blob:async()=> 'pdf-data'};}});
 await window.calidadChecklistApiV2({mode:'save',formulario:form()});assert.match(calls[0].url,/sincronizarBaseMadreV120$/);assert.equal(calls[0].body.mode,'quality-checklist-save');assert.equal(calls[0].headers.Authorization,'Bearer token');assert.equal(await window.calidadChecklistApiV2({mode:'pdf'},true),'pdf-data');
 await assert.rejects(window.calidadChecklistApiV2({mode:'billing'}),/inválida/);window.currentUser={restrictedColocaciones:true};await assert.rejects(window.calidadChecklistApiV2({mode:'save'}),/cuenta/);assert.equal(calls.length,2);
});
test('formulario genera enlaces por etapa y escapa datos de obras sin precios',()=>{
 const w={TIZChecklistCoreV2:C,DB:{obras:[{id:'o',ot:'4773',cliente:'Cliente',desc:'<Cartel>'}],checklists:[]},location:{href:'https://tiz-publicidad.github.io/tiz-app/',search:''}},document={head:{append(){}},createElement:()=>({}),addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../calidadChecklistsV2'),'utf8'),{window:w,document,URL,URLSearchParams});const html=w.TIZChecklistsV2.html();assert.ok(html.includes('&lt;Cartel&gt;'));assert.ok(!html.includes('<Cartel>'));assert.match(w.TIZChecklistsV2.link('colocacion'),/formularioCalidad=colocacion/);assert.ok(!html.includes('Neto'));
});
test('Cristian consulta sólo el portal operativo y completa Colocación/Resultado sin cambiar el plan de Producción',async()=>{
 const b=backend();b.admin.auth=()=>({verifyIdToken:async()=>({email:'cristiantizpublicidad@gmail.com'})});const cristian=await b.operator({get:()=> 'Bearer token'});assert.equal(cristian.restrictedChecklists,true);assert.equal(cristian.isAdmin,false);assert.equal(C.canEdit('produccion',cristian),false);assert.equal(C.canValidate('colocacion',cristian),true);
 await assert.rejects(b.save(b.db,{formulario:form()},cristian),/Pablo o Juli/);assert.equal(b.writes.length,0);
 const p=await b.save(b.db,{formulario:form()},user);const c=await b.save(b.db,{key:p.key,formulario:form('colocacion')},cristian);assert.equal(c.record.creadoPor,'cristiantizpublicidad@gmail.com');
 const db={collection:name=>({limit(){return this;},get:async()=>({docs:[{id:'o',data:()=>name==='obras'?{ot:'4773',cliente:'Cliente',desc:'Trabajo',importe:900,cuit:'privado',facturas:[{total:900}]}:{...c.record,neto:900,cuit:'privado'}}]})})};b.admin.firestore=()=>db;const out=[],res={set(){},status(){return this;},json:r=>out.push(r)},req={method:'POST',get:k=>k==='authorization'?'Bearer token':'',body:{mode:'quality-checklist-list'}};await b.handler(req,res);assert.equal(out[0].ok,true);assert.equal(out[0].obras[0].ot,'4773');for(const r of [...out[0].obras,...out[0].checklists,...out[0].calidad]){assert.equal(r.importe,undefined);assert.equal(r.neto,undefined);assert.equal(r.cuit,undefined);assert.equal(r.facturas,undefined);}
});
test('Cristian no inicia listeners comerciales y no recibe permisos directos en Firestore',()=>{
 const source=fs.readFileSync(require.resolve('../index.html'),'utf8'),block=source.slice(source.indexOf('function initListeners()'),source.indexOf('// CRUD helpers'));
 const flags={email:'cristiantizpublicidad@gmail.com',restrictedChecklists:true};let loaded=0;const window={currentUser:flags,DB:{obras:[],clientes:[],cobranzas:[],checklists:[]},loadChecklistsPortalV2:()=>loaded++};
 vm.runInNewContext(block+'\ninitListeners();',{window,dataGeneration:1,stopDataSubscriptions(){},setInterval:()=>1,portalTimer:null,onSnapshot(){throw Error('No deben iniciarse listeners Firestore.');}});assert.equal(loaded,1);
 assert.ok(source.includes("'cristiantizpublicidad@gmail.com':     'Calidad'"));assert.ok(!fs.readFileSync(require.resolve('../firestore.rules'),'utf8').includes('cristiantizpublicidad@gmail.com'));
});
