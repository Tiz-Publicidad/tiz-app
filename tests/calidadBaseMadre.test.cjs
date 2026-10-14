'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../calidadV1.js');
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
test('backend consulta estados actuales sin leer importes ni escribir datos',async()=>{
 let handler,readArgs;const output=[];
 const source=fs.readFileSync(require.resolve('../functions/baseMadreBackendV120.js'),'utf8');
 const sheets={spreadsheets:{values:{batchGet:async args=>{readArgs=args;return{data:{valueRanges:[{values:[['4773','Placas','Contacto','Cliente'],['','5S','','TIZ'],['4700','Entregada','','Cliente']]},{values:[['Pendiente'],['Cobrado pendiente'],['Entregado']]}]}};}}}};
 const admin={auth:()=>({verifyIdToken:async()=>({email:'info@tizpublicidad.com'})}),firestore:()=>({})};
 vm.runInNewContext(source,{exports:{},console,require:n=>n==='firebase-admin'?admin:n==='googleapis'?{google:{auth:{GoogleAuth:class{}},sheets:()=>sheets}}:{onRequest:(_,fn)=>{handler=fn;return fn;}}});
 const req={method:'POST',get:k=>k==='authorization'?'Bearer token':'',body:{mode:'read-quality'}},res={set(){},status(){return this;},json:r=>output.push(r)};
 await handler(req,res);assert.equal(output[0].ok,true);assert.equal(output[0].rows.length,2);assert.equal(output[0].rows[1].ot,'');assert.deepEqual(JSON.parse(JSON.stringify(readArgs.ranges)),["'Base de datos'!C3:F","'Base de datos'!Y3:Y"]);assert.equal(output[0].rows[0].neto,undefined);
 admin.auth=()=>({verifyIdToken:async()=>({email:'outsider@example.com'})});await handler(req,res);assert.equal(output[1].ok,false);
});
