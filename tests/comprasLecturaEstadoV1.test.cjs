'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../compras.js'),'utf8');
const block=src.slice(src.indexOf('function cpSetIaStatus('),src.indexOf('function fileToBase64('));
function fixture(read=()=>Promise.resolve('cHJ1ZWJh')){
 let serial=0,submitted=0;const sent=[];const timers=new Map(),status={hidden:true,textContent:'',style:{},setAttribute(k,v){this[k]=v;}},button={},partial={hidden:true,children:[],replaceChildren(){this.children=[];},appendChild(el){this.children.push(el);}};
 const context={window:{},selectedFile:{name:'prueba.pdf',type:'application/pdf'},aiCleanupActive:null,cpIaConfigReady:Promise.resolve(),cpIaLoading:false,cpIaConfigError:'',cpIaUrlShared:'https://example.test/exec/token',cpLocalIaUrl:()=>'',cpValidIaUrl:()=>true,cpOpenConfigIA:()=>assert.fail('No debe pedir otra clave'),fileToBase64:read,cpIngreso:{},applyAI:()=>{},toast:()=>{},console:{info(){},log(){},error(){}},Date,Math,encodeURIComponent,setTimeout:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id),document:{getElementById:id=>id==='cp-ia-partial'?partial:status,querySelector:()=>button,querySelectorAll:()=>[],body:{appendChild(){}},createElement:tag=>({tagName:tag,dataset:{},style:{},children:[],appendChild(el){this.children.push(el);},remove(){},submit(){submitted++;sent.push(Object.fromEntries(this.children.map(el=>[el.name,el.value])));}})}};
 vm.createContext(context);vm.runInContext(block,context);
 return {context,status,button,partial,timers,sent,get submitted(){return submitted;},respond:p=>context.window[Object.keys(context.window).filter(k=>k.startsWith('__tizIaCb_')).at(-1)](p)};
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

const unavailable={ok:false,error:'Gemini no está disponible temporalmente. Volvé a intentar.'};
function nextRetry(f){const entry=[...f.timers.entries()].find(([,t])=>t.ms>=4000&&t.ms<9000);assert.ok(entry,'debe programar una pausa entre intentos');f.timers.delete(entry[0]);entry[1].fn();}
test('recupera una falla temporal con un intento nuevo y procesa una sola lectura sin releer el archivo',async()=>{
 let reads=0,applied=0;const f=fixture(()=>{reads++;return Promise.resolve('cHJ1ZWJh');});f.context.applyAI=()=>applied++;
 await f.context.window.cpAnalizarIA();const previous=Object.values(f.context.window)[0];f.respond(unavailable);
 assert.equal(f.button.disabled,true);assert.match(f.status.textContent,/Reintentando/);assert.equal(f.submitted,1);nextRetry(f);assert.equal(f.submitted,2);assert.equal(reads,1);
 assert.notEqual(f.sent[0].requestId,f.sent[1].requestId);assert.equal(f.sent[0].dataBase64,f.sent[1].dataBase64);previous({ok:true,data:{items:[{}]}});assert.equal(applied,0);
 f.respond({ok:true,data:{items:[{},{}]}});assert.equal(applied,1);assert.equal(f.button.disabled,false);assert.match(f.status.textContent,/Lectura terminada: 2/);f.respond(unavailable);assert.equal(applied,1);
});
test('se detiene después de tres fallas temporales y conserva el archivo seleccionado',async()=>{
 const f=fixture(),file=f.context.selectedFile;await f.context.window.cpAnalizarIA();
 f.respond(unavailable);nextRetry(f);f.respond(unavailable);nextRetry(f);f.respond(unavailable);
 assert.equal(f.submitted,3);assert.equal(f.context.selectedFile,file);assert.equal(f.button.disabled,false);assert.equal(f.status.role,'alert');assert.match(f.status.textContent,/3 intento/);assert.equal([...f.timers.values()].filter(t=>t.ms>=4000&&t.ms<9000).length,0);
});
test('cancelar o vencer el plazo total elimina los reintentos pendientes',async()=>{
 for(const cancel of [f=>f.context.aiCleanupActive('cancelled'),f=>[...f.timers.values()].find(t=>t.ms===120000).fn()]){
  const f=fixture();await f.context.window.cpAnalizarIA();f.respond(unavailable);
  const scheduled=[...f.timers.values()].find(t=>t.ms>=4000&&t.ms<9000);cancel(f);scheduled.fn();assert.equal(f.submitted,1);assert.equal(f.button.disabled,false);
 }
});
test('no reintenta cuotas agotadas, permisos, archivos ilegibles ni lecturas inválidas',async()=>{
 for(const error of ['Gemini alcanzó su límite de uso o cuota.','Gemini rechazó la clave o los permisos.','El archivo está vacío o dañado.','Gemini devolvió una lectura inválida.']){
  const f=fixture();await f.context.window.cpAnalizarIA();f.respond({ok:false,error});assert.equal(f.submitted,1);assert.equal(f.button.disabled,false);assert.match(f.status.textContent,new RegExp(error.replace(/[.]/g,'\\.')));assert.equal([...f.timers.values()].filter(t=>t.ms>=4000&&t.ms<9000).length,0);
 }
});
test('no inicia otra lectura si queda poco tiempo del plazo total',async()=>{
 const f=fixture();let now=0;f.context.Date={now:()=>now};await f.context.window.cpAnalizarIA();now=92000;f.respond(unavailable);assert.equal(f.submitted,1);assert.equal(f.button.disabled,false);
});


test('conserva una lectura parcial hasta elegir cargar sin el ítem ilegible',async()=>{
 const f=fixture();let applied=null;f.context.applyAI=data=>{applied=data;};await f.context.window.cpAnalizarIA();
 f.respond({ok:true,data:{proveedor:{nombre:'ALL BIJOU SRL'},items:[{cantidad:4,precioUnitarioNeto:15033.06,ivaPorcentaje:21}],itemsNoLeidos:[{renglon:2,descripcionOriginal:'Costo Envio',motivo:'Cantidad ilegible'}],totalComprobante:72760}});
 assert.equal(applied,null);assert.equal(f.button.disabled,false);assert.equal(f.partial.hidden,false);assert.equal(f.partial.children[0].textContent,'Cargar sin el ítem 2');assert.match(f.status.textContent,/Costo Envio/);
 f.partial.children[0].onclick();assert.equal(applied.items.length,1);assert.equal(applied.proveedor.nombre,'ALL BIJOU SRL');assert.equal(applied.renglonesOmitidos[0].renglon,2);assert.equal(applied.totalComprobante,72760);assert.equal(f.partial.hidden,true);
 applied=null;f.context.window.cpCargarLecturaParcial();assert.equal(applied,null);
});
test('no aplica una lectura parcial anterior al cambiar el archivo o volver a analizar',async()=>{
 for(const change of [f=>{f.context.selectedFile={name:'otro.pdf'};},f=>f.context.window.cpAnalizarIA()]){
  const f=fixture();let applied=0;f.context.applyAI=()=>applied++;await f.context.window.cpAnalizarIA();
  f.respond({ok:true,data:{items:[{}],itemsNoLeidos:[{renglon:2,descripcionOriginal:'Envío'}]}});await change(f);f.context.window.cpCargarLecturaParcial();assert.equal(applied,0);assert.equal(f.partial.hidden,true);
 }
});
