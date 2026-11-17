'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../calidadV1.js');
function bindingFixture(works,selected){
 const source=fs.readFileSync(require.resolve('../calidadV1.js'),'utf8'),select={value:'',innerHTML:'',setCustomValidity(){},focus(){this.focused=true;}},note={},fields={'[name=obraId]':select,'#q1-binding-note':note,'[name=tipo]':{value:'Liberación'}};
 const form={__qualitySource:selected,querySelector:s=>fields[s]},window={DB:{obras:works}},context={C,window,form,busy:false,document:{activeElement:null},E:String};vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf(' function qualityBinding('),source.indexOf(' function newForm('))+'\nglobalThis.resolve=qualityBinding;globalThis.refresh=refreshFormWorks;globalThis.changed=bindingChanged;',context);
 return {context,window,form,select,note};
}
test('Revisar recupera la OT exacta y cliente cuando hay variantes de anticipo/saldo',()=>{
 const source={ot:'4773',cliente:'Cliente S.A.',referencia:'OT 4773 · Cliente'},works=[{id:'real',ot:'4773',cliente:'Cliente S.A.'},{id:'saldo',ot:'4773.1',cliente:'Cliente S.A.'},{id:'otro',ot:'4773',cliente:'Otro'}],f=bindingFixture(works,source),r=f.context.resolve(source,works);
 assert.equal(r.id,'real');assert.equal(r.candidates.length,1);
 f.context.refresh();assert.equal(f.select.value,'real');assert.equal(f.select.required,true);assert.match(f.note.textContent,/4773/);
 const user={email:'cristiantizpublicidad@gmail.com',sector:'Calidad'},record=C.clean({id:'release',obraId:f.select.value,tipo:'Liberación',etapa:'Entrega',area:'Calidad',categoria:'Medidas',fecha:C.day(),responsable:'Cristian Campo',detalle:'ok',criterio:'aspecto ok',resultado:'Liberado'},user,new Date().toISOString());
 assert.equal(record.obraId,'real');assert.equal(record.creadoPor,user.email);assert.ok(C.registerPatch({...works[0],id:'real'},record)['calidadGestion.registros.release']);
});
test('si las OT llegan después de abrir el formulario se actualiza la vinculación sin borrar lo completado',()=>{
 const selected={ot:'4773',cliente:'Cliente'},f=bindingFixture([],selected);f.form.detalle='Texto que ya completó Cristian';f.context.refresh();assert.equal(f.select.value,'');assert.match(f.note.textContent,/Registro asociado a OT/);assert.equal(f.select.required,false);
 f.window.DB.obras=[{id:'w',ot:'4773',cliente:'Cliente'}];f.context.refresh();assert.equal(f.select.value,'w');assert.equal(f.form.detalle,'Texto que ya completó Cristian');assert.match(f.note.textContent,/Registro vinculado/);
});
test('no elige automáticamente entre duplicados, otra obra o una baja y conserva una selección explícita',()=>{
 const selected={ot:'4773',cliente:'Cliente'},works=[{id:'a',ot:'4773',cliente:'Cliente'},{id:'b',ot:'4773',cliente:'Cliente'},{id:'baja',ot:'4773',cliente:'Cliente',bajaObra:{activa:true}},{id:'arch',ot:'4773',cliente:'Cliente',archivado:true}],f=bindingFixture(works,selected);
 assert.equal(f.context.resolve(selected,works).id,'');f.select.value='b';f.context.refresh();assert.equal(f.select.value,'b');assert.doesNotMatch(f.select.innerHTML,/value="baja"|value="arch"/);
 assert.equal(f.context.resolve(selected,[{id:'other',ot:'4773',cliente:'Otro'}]).id,'');
});
test('la liberación exige la OT desde el inicio y el error conserva el formulario',()=>{
 const source=fs.readFileSync(require.resolve('../calidadV1.js'),'utf8'),f=bindingFixture([],null);f.context.changed();assert.equal(f.select.required,true);assert.match(f.note.textContent,/Seleccioná la OT/);
 assert.match(source,/Los datos que completaste se conservan/);assert.match(source,/id="q1-work" aria-describedby="q1-binding-note"/);
});
test('consulta Calidad con los permisos del módulo y no con el helper exclusivo de Colocaciones',async()=>{
 const source=fs.readFileSync(require.resolve('../index.html'),'utf8'),start=source.indexOf('window.leerCalidadBaseMadreV1 ='),end=source.indexOf('window.saveCalidadV1 =',start);
 let requests=0;const auth={currentUser:{getIdToken:async()=> 'test-token'}},window={TIZCalidadCore:C,canViewPage:page=>page==='colocaciones'};
 const fetch=async(url,options)=>{requests++;assert.match(url,/sincronizarBaseMadreV120$/);assert.equal(options.headers.Authorization,'Bearer test-token');assert.equal(JSON.parse(options.body).mode,'read-quality');return{ok:true,json:async()=>({ok:true,rows:[{ot:'4773',status:'Pendiente'}]})};};
 vm.runInNewContext(source.slice(start,end),{window,auth,fetch});
 for(const sector of ['Ventas','Calidad','Producción','Compras']){window.currentUser={email:'operador@tizpublicidad.com',sector};const result=await window.leerCalidadBaseMadreV1();assert.equal(result.rows[0].ot,'4773');}
 assert.equal(requests,4);
 window.currentUser={email:'arielbenitezpublicidad@gmail.com',restrictedColocaciones:true};await assert.rejects(window.leerCalidadBaseMadreV1(),/no puede consultar Calidad/);
 window.currentUser=null;await assert.rejects(window.leerCalidadBaseMadreV1(),/no puede consultar Calidad/);
 window.currentUser={email:'operador@tizpublicidad.com',sector:'Ventas'};auth.currentUser=null;await assert.rejects(window.leerCalidadBaseMadreV1(),/no puede consultar Calidad/);assert.equal(requests,4);
});
test('incluye pendientes antiguos, agrupa anticipo/saldo y conserva trabajos sin OT',()=>{
 const rows=[{row:3,ot:'0004527',desc:'Anticipo Cartel',cliente:'Cliente',status:'Pendiente'},{row:4,ot:'4527',desc:'Saldo Cartel',cliente:'Cliente',status:'Cobrado pendiente'},{row:5,ot:'4773',desc:'Placas',cliente:'Otro',status:'Pendiente'},{row:6,ot:'',desc:'Auditoría 5S',cliente:'TIZ',status:'Pendiente'},{row:7,ot:'4700',status:'Entregado'},{row:8,ot:'4701',status:'Cobrado'}];
 const work={id:'obra',ot:'4527',fecha:'2020-01-01',calidadGestion:{registros:{q:{decision:'Rechazado',creadoEn:'2026-10-14'}}}};
 const before=JSON.stringify(work),out=C.motherWorks(rows,[work]);assert.equal(out.length,3);assert.equal(out[0].ot,'4773');
 const grouped=out.find(o=>o.ot==='4527');assert.deepEqual(grouped.sourceRows,[3,4]);assert.match(grouped.desc,/Anticipo.*Saldo/);assert.equal(grouped.id,'obra');assert.equal(grouped.calidadEstado,'Rechazado');assert.equal(out.find(o=>!o.ot).desc,'Auditoría 5S');assert.equal(JSON.stringify(work),before);
});
test('no vincula controles a una obra ambigua ni a una revisión archivada',()=>{
 const source=[{row:3,ot:'4773',desc:'Trabajo',cliente:'Cliente',status:'Pendiente'}];
 assert.equal(C.motherWorks(source,[{id:'a',ot:'4773'},{id:'b',ot:'4773'}])[0].id,'');
 assert.equal(C.motherWorks(source,[{id:'a',ot:'4773',archivado:true},{id:'b',ot:'4773'}])[0].id,'b');
 assert.equal(C.motherWorks(source,[])[0].referencia,'OT 4773 · Cliente · Trabajo');
 const prior=[{referencia:'OT 4773 · Cliente · Trabajo',decision:'Aprobado con desvío',creadoEn:'2026-10-14'}];assert.equal(C.motherWorks(source,[],prior)[0].calidadEstado,'Aprobado con desvío');
});
test('la lista muestra fuente vigente, búsqueda y error de actualización sin perder registros',async()=>{
 const host={innerHTML:''},list={innerHTML:''},works={innerHTML:''},listeners={};let fail=false;
 const window={currentUser:{email:'info@tizpublicidad.com',isAdmin:true},TIZCalidadCore:C,DB:{obras:[{id:'o',ot:'4773',calidadGestion:{registros:{q:{id:'q',estado:'Pendiente',tipo:'Anomalía',detalle:'Conservar'}}}}]},leerCalidadBaseMadreV1:async()=>{if(fail)throw Error('Sin conexión');return{rows:[{row:426,ot:'4773',desc:'<Placas>',cliente:'Cliente',status:'Pendiente'}]};}};
 const document={head:{append(){}},activeElement:null,createElement:()=>({}),getElementById:id=>({'calidad-root':host,'q1-list':list,'q1-works':works}[id]),addEventListener:(type,fn)=>listeners[type]=fn};
 const source=fs.readFileSync(require.resolve('../calidadV1.js'),'utf8');vm.runInNewContext(source.slice(source.indexOf('(() => {')),{window,document});
 await window.TIZCalidadV1.refreshMother(true);assert.match(works.innerHTML,/4773/);assert.match(works.innerHTML,/&lt;Placas&gt;/);assert.match(works.innerHTML,/data-q-review/);assert.match(works.innerHTML,/data-q-work="o"/);
 listeners.input({target:{id:'q1-query',value:'inexistente'}});assert.ok(!works.innerHTML.includes('<b>4773</b>'));listeners.input({target:{id:'q1-query',value:''}});
 fail=true;await window.TIZCalidadV1.refreshMother(true);assert.match(works.innerHTML,/Sin conexión/);assert.match(works.innerHTML,/última lectura/);assert.match(works.innerHTML,/4773/);assert.equal(window.DB.obras[0].calidadGestion.registros.q.detalle,'Conservar');
});
test('backend consulta las columnas por encabezado sin leer importes ni escribir datos',async()=>{
 let handler,readArgs;const output=[];
 const source=fs.readFileSync(require.resolve('../functions/baseMadreBackendV120.js'),'utf8');
 const headers=['Fecha','F de Prod','Sem','OT/CT','Descripcion de la obra','Arquitecto','Cliente','Neto','Bruto',...Array(15).fill(''),'Status'];
 const sheets={spreadsheets:{values:{get:async()=>({data:{values:[headers]}}),batchGet:async args=>{readArgs=args;return{data:{valueRanges:[{values:[['4773'],[''],['4700']]},{values:[['Placas'],['5S'],['Entregada']]},{values:[['Cliente'],['TIZ'],['Cliente']]},{values:[['Pendiente'],['Cobrado pendiente'],['Entregado']]},{values:[headers]}]}};}}}};
 const admin={auth:()=>({verifyIdToken:async()=>({email:'info@tizpublicidad.com'})}),firestore:()=>({})};
 vm.runInNewContext(source,{exports:{},console,require:n=>n==='./baseMadreLayoutV1'?require('../functions/baseMadreLayoutV1'):n==='firebase-admin'?admin:n==='googleapis'?{google:{auth:{GoogleAuth:class{}},sheets:()=>sheets}}:{onRequest:(_,fn)=>{handler=fn;return fn;}}});
 const req={method:'POST',get:k=>k==='authorization'?'Bearer token':'',body:{mode:'read-quality'}},res={set(){},status(){return this;},json:r=>output.push(r)};
 await handler(req,res);assert.equal(output[0].ok,true);assert.equal(output[0].rows.length,2);assert.equal(output[0].rows[1].ot,'');assert.deepEqual(JSON.parse(JSON.stringify(readArgs.ranges)),["'Base de datos'!D3:D","'Base de datos'!E3:E","'Base de datos'!G3:G","'Base de datos'!Y3:Y","'Base de datos'!A2:AL2"]);assert.equal(output[0].rows[0].neto,undefined);
 admin.auth=()=>({verifyIdToken:async()=>({email:'outsider@example.com'})});await handler(req,res);assert.equal(output[1].ok,false);
});





test('el formulario de la OT 4819 guarda la liberación de origen y conserva los datos si falla el servidor',async()=>{
 const source=fs.readFileSync(require.resolve('../calidadV1.js'),'utf8'),selected={ot:'4819',cliente:'Ases y Reinas',desc:'Siemens Healthineers',referencia:'OT 4819 · Ases y Reinas · Siemens Healthineers'},fixture=bindingFixture([],selected),calls=[];
 const button={disabled:false},error={},f={dataset:{qForm:'new'},setAttribute(){},removeAttribute(){},querySelector:s=>s==='[type=submit]'?button:error},form=fixture.form;let removed=0,fail=true;
 form.remove=()=>removed++;const fields={obraId:'',tipo:'Liberación',area:'Producción',categoria:'Medidas',fecha:C.day(),responsable:'Cristian Campo',etapa:'Entrega',resultado:'Liberado',detalle:'Revisado según plano',criterio:'Medidas aprobadas',decision:'Aprobado'};
 let submit;Object.assign(fixture.context,{form,crypto:{randomUUID:()=> 'test4819'},Date,user:()=>({email:'cristiantizpublicidad@gmail.com',sector:'Calidad'}),render:()=>{},FormData:class{[Symbol.iterator](){return Object.entries(fields)[Symbol.iterator]();}},document:{addEventListener:(_event,handler)=>submit=handler}});
 fixture.window.saveCalidadV1=async payload=>{calls.push(payload);if(fail)throw Error('Sin conexión');};
 const start=source.indexOf(" document.addEventListener('submit'"),end=source.indexOf(' window.TIZCalidadV1=',start);vm.runInContext(source.slice(start,end),fixture.context);
 await submit({target:f,preventDefault(){}});assert.equal(removed,0);assert.equal(error.textContent,'Sin conexión');assert.equal(button.disabled,false);assert.equal(fields.detalle,'Revisado según plano');assert.equal(calls[0].record.sourceOt,'4819');assert.equal(calls[0].record.sourceCliente,'Ases y Reinas');assert.equal(calls[0].record.obraId,'');
 fail=false;await submit({target:f,preventDefault(){}});assert.equal(removed,1);
});


test('al vincular una ficha se conserva la decisión más reciente del registro de origen',()=>{
 const source=fs.readFileSync(require.resolve('../calidadV1.js'),'utf8'),selected={ot:'4819',cliente:'Ases y Reinas'},work={id:'w',ot:'4819',cliente:'Ases y Reinas',calidadGestion:{registros:{old:{decision:'Aprobado',creadoEn:'2026-11-10'}}}},f=bindingFixture([work],selected);
 f.window.DB.calidad=[{sourceOt:'4819',decision:'Rechazado',creadoEn:'2026-11-17'}];f.context.motherRows=[{row:34,...selected,desc:'Siemens Healthineers',status:'Pendiente'}];const start=source.indexOf(' function sourceWorks()'),end=source.indexOf('\n function ',start+1);vm.runInContext(source.slice(start,end)+'globalThis.items=sourceWorks();',f.context);assert.equal(f.context.items[0].id,'w');assert.equal(f.context.items[0].calidadEstado,'Rechazado');
});
