"use strict";
const test=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), vm=require("node:vm"), path=require("node:path");
function harness({token="TOKEN",response={ok:true,fileId:"pdf-id",webViewLink:"https://drive.google.com/file/d/pdf-id/view"},fetcher}={}){
 let source=fs.readFileSync(path.join(__dirname,"../facturacionDriveRetryUIV83.js"),"utf8");
 const start=source.indexOf("  async function preloadAuth()"),end=source.indexOf("  function cachedDriveToken()",start);
 source=source.slice(0,start)+'  async function preloadAuth(){return {auth:{currentUser:{getIdToken:async()=>"ID_TOKEN"}}};}\n'+source.slice(end);
 const c={cae:"12345678901234",cbteTipo:1,ptoVta:9,cbteNro:14,numeroCompleto:"00009-00000014",drivePendiente:true};
 const o={id:"obra-4754",facturaArca:c,comprobantesArca:[{...c}],facturasArca:[{...c}],facturaDrivePendiente:true};
 const calls=[],notes=[],timers=[],storage=new Map(token?[["tiz-drive-oauth-v97",JSON.stringify({token,ts:Date.now()})]]:[]);
 const store={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const window={DB:{obras:[o]},showToast:s=>notes.push(s),TIZFactCobUIV2:{render(){}}};
 const context={window,sessionStorage:store,localStorage:store,Date,Map,Set,Number,String,JSON,Promise,console:{error(){},warn(){}},alert(){},setInterval:f=>timers.push(f),fetch:async(url,options)=>{
 calls.push({url,body:JSON.parse(options.body)});return fetcher?fetcher(url,options):{ok:true,json:async()=>response};
 }};
 vm.runInNewContext(source,context);
 return {window,o,c,calls,notes,timers};
}
test("archivo automático usa OAuth y actualiza todas las copias del comprobante",async()=>{
 const h=harness();await h.window.archivarPdfAutomaticoTizV126(h.o);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.driveAccessToken,"TOKEN");
 assert.match(h.calls[0].url,/facturacionReintentarDriveV83$/);
 assert.equal(h.o.facturaArca.driveFileId,"pdf-id");assert.equal(h.o.comprobantesArca[0].driveFileId,"pdf-id");
 assert.equal(h.o.facturasArca[0].drivePendiente,false);assert.equal(h.o.facturaDrivePendiente,false);assert.match(h.notes[0],/En Drive/);
});
test("sin autorización no hace peticiones ni anuncia un guardado",async()=>{
 const h=harness({token:""});assert.equal(await h.window.archivarPdfAutomaticoTizV126(h.o),null);
 assert.equal(h.calls.length,0);assert.equal(h.notes.length,0);
});
test("respuestas sin archivo confirmado no muestran En Drive",async()=>{
 const h=harness({response:{ok:true}});await assert.rejects(h.window.archivarPdfAutomaticoTizV126(h.o),/no confirmó/);
 assert.equal(h.c.drivePendiente,true);assert.equal(h.notes.length,0);
});
test("solicitudes simultáneas para la misma factura comparten el guardado",async()=>{
 let resolve;const waiting=new Promise(r=>resolve=r);
 const h=harness({fetcher:async()=>{await waiting;return{ok:true,json:async()=>({ok:true,fileId:"pdf-id"})}}});
 const a=h.window.archivarPdfAutomaticoTizV126(h.o),b=h.window.archivarPdfAutomaticoTizV126(h.o);
 resolve();await Promise.all([a,b]);assert.equal(h.calls.length,1);
});
test("una factura que falla no bloquea los otros PDF pendientes",async()=>{
 const h=harness({fetcher:async(_u,opt)=>JSON.parse(opt.body).obraId==="obra-4754"?{ok:false,json:async()=>({ok:false,error:"Drive temporalmente caído"})}:{ok:true,json:async()=>({ok:true,fileId:"otro-pdf"})}});
 const second={...h.o,id:"otra-obra",facturaArca:{...h.c,cbteNro:15},comprobantesArca:[],facturasArca:[]};h.window.DB.obras.push(second);
 await h.timers[0]();assert.equal(h.calls.length,2);assert.equal(second.facturaArca.driveFileId,"otro-pdf");assert.equal(h.c.drivePendiente,true);
 await h.timers[0]();assert.equal(h.calls.length,2);
});
