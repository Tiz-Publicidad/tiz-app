'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../compras.js'),'utf8');
const block=source.slice(source.indexOf('// El enlace privado se comparte'),source.indexOf('window.cpAnalizarIA=async()=>'));
const url='https://script.google.com/macros/s/implementacion-prueba/exec/token-privado-prueba';
function fixture(local='',stored=null){
 let callback,fail=false,record=stored,writes=0;const input={value:''},window={};
 const context={window,URL,db:{},doc:(_db,collection,id)=>({collection,id}),serverTimestamp:()=>null,localStorage:{getItem:()=>local,setItem:(_key,value)=>{local=value;}},document:{getElementById:id=>id==='cp-ia-url'?input:{classList:{add(){},remove(){}}}},toast:s=>{context.lastToast=s;},onSnapshot:(_ref,cb)=>{callback=cb;return()=>{};},runTransaction:async(_db,fn)=>{if(fail)throw Error('Sin permisos');return fn({get:async()=>({exists:()=>!!record,data:()=>record}),set:(ref,data)=>{assert.equal(ref.collection,'configuracionCompras');assert.equal(ref.id,'iaComprobantes');record=data;writes++;}});}};
 vm.createContext(context);vm.runInContext(block+'\nwindow.state=()=>({url:cpIaUrlShared,user:cpIaUser,loading:cpIaLoading,error:cpIaConfigError});',context);
 return {context,window,input,start:user=>context.cpStartSharedIA(user),emit:async data=>callback({exists:()=>!!data,data:()=>data}),get record(){return record;},get writes(){return writes;},set fail(x){fail=x;}};
}
test('migra el enlace del navegador a una configuración compartida sin guardar la clave API',async()=>{
 const f=fixture(url);f.start({uid:'propietario'});await f.emit(null);assert.equal(f.writes,1);assert.equal(f.record.url,url);assert.equal(f.record.GEMINI_API_KEY,undefined);
 await f.emit(f.record);assert.equal(f.window.state().url,url);
});
test('Caro recibe la misma conexión aunque su navegador no tenga configuración local',async()=>{
 const f=fixture('',{url});f.start({uid:'caro'});await f.emit({url});f.window.cpOpenConfigIA();assert.equal(f.input.value,url);assert.equal(f.writes,0);
 f.start(null);assert.equal(f.window.state().url,'');assert.equal(f.window.state().user,'');
});
test('una conexión local antigua no reemplaza la compartida',async()=>{
 const f=fixture(url.replace('token-privado-prueba','token-antiguo'),{url});f.start({uid:'usuario'});await f.emit({url});assert.equal(f.window.state().url,url);assert.equal(f.writes,0);
});
test('rechaza una API key pegada en lugar del enlace y conserva el error si falla el guardado',async()=>{
 const f=fixture();f.start({uid:'usuario'});f.input.value='AIza-ejemplo';await f.window.cpSaveConfigIA();assert.equal(f.writes,0);assert.match(f.context.lastToast,/no la clave API/);
 f.input.value=url;f.fail=true;await f.window.cpSaveConfigIA();assert.equal(f.writes,0);assert.match(f.context.lastToast,/No se pudo guardar/);assert.equal(f.window.state().url,'');
 f.fail=false;await f.window.cpSaveConfigIA();assert.equal(f.writes,1);assert.equal(f.window.state().url,url);
});
