'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../compras.js'),'utf8');
const block=src.slice(src.indexOf('function cpSetIaStatus('),src.indexOf('function fileToBase64('));
function fixture(read=()=>Promise.resolve('cHJ1ZWJh')){
 let serial=0,submitted=0;const timers=new Map(),status={hidden:true,textContent:'',style:{},setAttribute(k,v){this[k]=v;}},button={};
 const context={window:{},selectedFile:{name:'prueba.pdf',type:'application/pdf'},aiCleanupActive:null,cpIaConfigReady:Promise.resolve(),cpIaLoading:false,cpIaConfigError:'',cpIaUrlShared:'https://example.test/exec/token',cpLocalIaUrl:()=>'',cpValidIaUrl:()=>true,cpOpenConfigIA:()=>assert.fail('No debe pedir otra clave'),fileToBase64:read,cpIngreso:{},applyAI:()=>{},toast:()=>{},console:{info(){},log(){},error(){}},Date,Math,encodeURIComponent,setTimeout:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id),document:{getElementById:()=>status,querySelector:()=>button,querySelectorAll:()=>[],body:{appendChild(){}},createElement:tag=>({tagName:tag,dataset:{},style:{},appendChild(){},remove(){},submit(){submitted++;}})}};
 vm.createContext(context);vm.runInContext(block,context);
 return {context,status,button,timers,get submitted(){return submitted;},respond:p=>context.window[Object.keys(context.window).find(k=>k.startsWith('__tizIaCb_'))](p)};
}
test('un error del lector queda visible y permite volver a analizar sin otra clave',async()=>{
 const f=fixture();await f.context.window.cpAnalizarIA();assert.equal(f.submitted,1);f.respond({ok:false,error:'Servicio temporalmente no disponible'});
 assert.equal(f.button.disabled,false);assert.equal(f.status.role,'alert');assert.match(f.status.textContent,/Servicio temporalmente no disponible/);assert.equal(f.status.hidden,false);
});
test('la espera máxima incluye la lectura local; no envía el archivo si ya venció',async()=>{
 let release;const f=fixture(()=>new Promise(resolve=>{release=resolve;}));const pending=f.context.window.cpAnalizarIA();await new Promise(setImmediate);
 const deadline=[...f.timers.values()].find(t=>t.ms===120000);assert.ok(deadline);deadline.fn();
 assert.equal(f.button.disabled,false);assert.match(f.status.textContent,/2 minutos/);release('cHJ1ZWJh');await pending;assert.equal(f.submitted,0);
});
test('muestra espera y finalización como estados distintos, sin procesar dos veces una respuesta',async()=>{
 let calls=0;const f=fixture();f.context.applyAI=()=>calls++;await f.context.window.cpAnalizarIA();f.respond({pending:true});assert.match(f.status.textContent,/Esperando el resultado/);
 f.respond({ok:true,data:{items:[{},{}]}});assert.equal(calls,1);assert.match(f.status.textContent,/Lectura terminada: 2 renglones/);f.respond({pending:true});assert.equal(calls,1);assert.match(f.status.textContent,/Lectura terminada/);
});
