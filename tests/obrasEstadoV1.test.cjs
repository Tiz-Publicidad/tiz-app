'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../functions/obrasSeguimientoCoreV2'),html=fs.readFileSync(require.resolve('../index.html'),'utf8'),ui=fs.readFileSync(require.resolve('../obrasSeguimientoV2'),'utf8');
const user={email:'giancarlo.pareja@tizpublicidad.com'},work=(id='a',extra={})=>({id,ot:'4800',cliente:'Cliente',desc:'Cartel',estado:'Pendiente',cobros:[{importe:50}],neto:100,fcol_r:'2026-11-01',...extra});
function transactionFixture(initial,actor=user,failCommit=false){
 const rows=new Map(initial.map(w=>[w.id,structuredClone(w)])),writes=[],audits=[],window={currentUser:actor,TIZObrasSeguimientoCoreV2:C};
 const runTransaction=async(_,fn)=>{const pending=[],events=[];let writing=false;const r=await fn({get:async ref=>{assert.equal(writing,false);return{exists:()=>rows.has(ref.id),data:()=>structuredClone(rows.get(ref.id))};},update:(ref,patch)=>{writing=true;pending.push({id:ref.id,patch});},set:(ref,event)=>{writing=true;events.push({ref,event});}});if(failCommit)throw Error('Sin conexión');for(const p of pending){Object.assign(rows.get(p.id),p.patch);writes.push(p);}audits.push(...events);return r;};
 vm.runInNewContext(html.slice(html.indexOf('window.cambiarEstadoObraV1 ='),html.indexOf('// Compatibilidad: la baja directa')),{window,db:{},doc:(...args)=>args.length===3?{id:args[2]}:{parent:args[0],id:'audit'},collection:(ref,name)=>({ref,name}),runTransaction,Date,Set,Promise});
 return{window,rows,writes,audits,save:(ids,state,old=Object.fromEntries(initial.map(w=>[w.id,w.estado])))=>window.cambiarEstadoObraV1(ids,state,old)};
}
test('Giancarlo, Pablo, Caro y la cuenta administrativa editan; los otros puestos conservan consulta',()=>{
 for(const email of ['giancarlo.pareja@tizpublicidad.com','pablo.aciar@tizpublicidad.com','carolina.flores@tizpublicidad.com','info@tizpublicidad.com'])assert.equal(C.canStatus({email}),true);
 for(const email of ['julieta.aguirre@tizpublicidad.com','cristiantizpublicidad@gmail.com','arielbenitezpublicidad@gmail.com','externo@example.com'])assert.equal(C.canStatus({email,isAdmin:true}),false);
 assert.equal(C.canStatus(null),false);
});
test('actualiza todas las filas de una OT y audita sin alterar cobros, importes ni fechas',async()=>{
 for(const state of C.EDITABLE_STATES){const a=work(),b=work('b',{desc:'Saldo'}),other=work('c',{ot:'4801'}),f=transactionFixture([a,b,other]);await f.save(['a','b'],state);assert.equal(f.writes.length,2);assert.equal(f.audits.length,2);for(const id of ['a','b']){const w=f.rows.get(id);assert.equal(w.estado,state);assert.equal(w.cobr,state);assert.deepEqual(w.cobros,a.cobros);assert.equal(w.neto,100);assert.equal(w.fcol_r,a.fcol_r);assert.equal(w.estadoGestionV1.usuario,user.email);}assert.equal(f.rows.get('c').estado,'Pendiente');assert.equal(f.audits[0].event.estadoNuevo,state);}
});
test('rechaza estados ajenos, bajas, archivados, revisiones antiguas y cuentas sin permiso sin escritura parcial',async()=>{
 for(const [works,actor,state] of [[[work()],{},'Cobrado'],[[work()],user,'Baja'],[[work()],user,'Aprobado'],[[work('a',{estado:'Baja'})],user,'Pendiente'],[[work('a',{archivado:true})],user,'Cobrado'],[[work('a',{revisionVigente:false})],user,'Cobrado'],[[work(),work('b',{bajaObra:{activa:true}})],user,'Cobrado']]){const f=transactionFixture(works,actor);await assert.rejects(f.save(works.map(w=>w.id),state));assert.equal(f.writes.length,0);assert.equal(f.audits.length,0);}
});
test('conflicto, documento faltante, OT o cliente distinto y fallo de conexión no producen cambios parciales',async()=>{
 const cases=[{works:[work()],ids:['a'],old:{a:'Entregado'}},{works:[work()],ids:['a','missing']},{works:[work(),work('b',{ot:'4801'})],ids:['a','b']},{works:[work(),work('b',{cliente:'Otro'})],ids:['a','b']},{works:[work()],ids:['a'],fail:true}];
 for(const c of cases){const f=transactionFixture(c.works,user,c.fail);await assert.rejects(f.save(c.ids,'Cobrado',c.old));assert.equal(f.writes.length,0);assert.equal(f.audits.length,0);assert.equal(f.rows.get('a').estado,'Pendiente');}
});
test('valida IDs vacíos, duplicados, rutas y selecciones excesivas',async()=>{
 const f=transactionFixture([work()]);for(const ids of [[],['a','a'],['a/b'],[''],Array(101).fill('a')])await assert.rejects(f.save(ids,'Cobrado'));assert.equal(f.writes.length,0);
});
function uiFixture(actor=user){
 const a=work(),window={currentUser:actor,DB:{obras:[a]},showToast(){}},consulta={generation:0,busy:true,works:[structuredClone(a)]},S={error:'',message:'',qualityKey:'old'},ctx={C,window,consulta,S,Set,Object,user:()=>window.currentUser,groups:()=>C.grouped(consulta.works),E:v=>String(v).replaceAll('"','&quot;'),badge:s=>'<span>'+s+'</span>',render(){},renderQuality(){}};
 vm.runInNewContext(ui.slice(ui.indexOf('const statusSaving='),ui.indexOf('const oldEditButton='))+'\nglobalThis.cell=statusCell;globalThis.save=saveStatus;',ctx);
 return{...ctx,ctx,select:state=>({dataset:{o2Status:'a'},value:state,setAttribute(){}})};
}
test('la columna muestra un desplegable accesible sólo a los habilitados y conserva Baja como etiqueta',()=>{
 const f=uiFixture();assert.match(f.ctx.cell(C.grouped([work()])[0]),/<select.*aria-label="Estado de CT\/OT 4800"/);assert.match(f.ctx.cell(C.grouped([work()])[0]),/value="Pendiente" selected/);assert.doesNotMatch(f.ctx.cell(C.grouped([work('a',{estado:'Baja'})])[0]),/<select/);f.window.currentUser={email:'julieta.aguirre@tizpublicidad.com'};assert.doesNotMatch(f.ctx.cell(C.grouped([work()])[0]),/<select/);
});
test('guardado confirma en la consulta y base local, invalida una lectura anterior y bloquea doble envío',async()=>{
 const f=uiFixture();let done,calls=0;f.window.cambiarEstadoObraV1=()=>{calls++;return new Promise(r=>done=r);};const select=f.select('Entregado'),saving=f.ctx.save(select);assert.equal(select.disabled,true);await f.ctx.save(f.select('Cobrado'));assert.equal(calls,1);done([{id:'a',patch:{estado:'Entregado',cobr:'Entregado'}}]);await saving;assert.equal(f.consulta.works[0].estado,'Entregado');assert.equal(f.window.DB.obras[0].estado,'Entregado');assert.equal(f.consulta.generation,1);assert.equal(f.consulta.busy,false);assert.match(f.S.message,/Entregado/);
});
test('fallo conserva estado anterior y muestra error; una respuesta de otra sesión no modifica la nueva',async()=>{
 const f=uiFixture();f.window.cambiarEstadoObraV1=async()=>{throw Error('Sin conexión');};await f.ctx.save(f.select('Cobrado'));assert.equal(f.consulta.works[0].estado,'Pendiente');assert.equal(f.window.DB.obras[0].estado,'Pendiente');assert.equal(f.S.error,'Sin conexión');let done;f.window.cambiarEstadoObraV1=()=>new Promise(r=>done=r);const saving=f.ctx.save(f.select('Cobrado'));f.window.currentUser={email:'otro'};done([{id:'a',patch:{estado:'Cobrado'}}]);await saving;assert.equal(f.consulta.works[0].estado,'Pendiente');
});
