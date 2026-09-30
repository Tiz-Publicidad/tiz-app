"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const root=path.join(__dirname,".."),api=require(path.join(root,"cobranzasSemanalV127.js")),terms=require(path.join(root,"functions/condicionesPagoV127.js"));
function app({payments=[],write}={}){
 const inv={cbteTipo:1,ptoVta:9,cbteNro:14,numeroCompleto:"00009-00000014",familia:"factura",cae:"12345678901234",fecha:"2026-09-28",fechaPrevistaCobro:"2026-10-05",neto:100,iva:21,total:121};
 const o={id:"obra-1",ot:"4754",cliente:"Cliente",finanzas:{total:100,diasPago:7},comprobantesArca:[inv],facturaArca:inv,cobros:payments};
 const writes=[],window={DB:{obras:[o],clientes:[],presupuestos:[]},currentUser:{isAdmin:true},TIZCobranzaSemanalV127:api,updateDoc_:async(...args)=>{writes.push(args);if(write)await write();}};
 const ctx=vm.createContext({window,Date,Intl,console});
 for(const p of ["facturacionCobranzasDataV2.js","facturacionCobranzasActionsV2.js"])vm.runInContext(fs.readFileSync(path.join(root,p),"utf8"),ctx);
 return{window,o,writes};
}
test("lunes a domingo y número ISO correcto al cruzar año",()=>{
 assert.equal(api.semana("2026-09-30").inicio,"2026-09-28");assert.equal(api.semana("2026-10-04").fin,"2026-10-04");
 assert.equal(api.semana("2021-01-07").iso,"2021-W01");assert.equal(api.semana("2021-01-01").iso,"2020-W53");assert.equal(api.fechaValida("2026-02-30"),false);
});
test("Contado es explícitamente válido; plazo vacío, decimal o negativo se bloquea",()=>{
 for(const x of [0,7,15,30,45,90])assert.equal(terms.validarDiasPago(x),x);
 for(const x of [undefined,null,"", " ",-1,7.5,true,[],{},Infinity])assert.throws(()=>terms.validarDiasPago(x),/plazo/);
});
test("marcar Cobrado crea un único pago con fecha, sin retenciones, y estado auditado",async()=>{
 const h=app();await h.window.TIZFactCobActionsV2.cambiarEstadoGestion(h.o.id,"cobrado",{fechaPago:"2026-09-30",importeEsperado:121});
 assert.equal(h.writes.length,1);assert.equal(h.o.cobros[0].importe,121);assert.equal(h.o.cobros[0].retenciones,0);
 assert.equal(h.o.cobros[0].semanaCobroInicio,"2026-09-28");assert.equal(h.o.fechaCobro,"2026-09-30");
 const w=h.window.TIZFacturacionCobranzasDataV2.build().workItems[0];assert.equal(w.porCobrar,0);assert.equal(w.estadoOperativo,"cobrado");
 await h.window.TIZFactCobActionsV2.cambiarEstadoGestion(h.o.id,"cobrado",{fechaPago:"2026-09-30"});assert.equal(h.o.cobros.length,1);
});
test("pago completo sólo registra saldo restante después de un cobro parcial",async()=>{
 const h=app({payments:[{id:"cob-parcial",fecha:"2026-09-29",importe:50,retenciones:0}]});
 await h.window.TIZFactCobActionsV2.cambiarEstadoGestion(h.o.id,"cobrado",{fechaPago:"2026-09-30",importeEsperado:71});
 assert.equal(h.o.cobros[1].importe,71);assert.equal(h.window.TIZFacturacionCobranzasDataV2.build().workItems[0].cobrado,121);
});
test("fecha ausente, imposible, futura o importe cambiado no guardan pagos",async()=>{
 for(const fecha of ["","2026-02-30","2099-01-01"]){const h=app();await assert.rejects(h.window.TIZFactCobActionsV2.cambiarEstadoGestion(h.o.id,"cobrado",{fechaPago:fecha}));assert.equal(h.writes.length,0);}
 const h=app();await assert.rejects(h.window.TIZFactCobActionsV2.cambiarEstadoGestion(h.o.id,"cobrado",{fechaPago:"2026-09-30",importeEsperado:100}),/saldo cambió/);assert.equal(h.writes.length,0);
});
test("doble guardado simultáneo se bloquea y no duplica el pago",async()=>{
 let release;const wait=new Promise(r=>release=r),h=app({write:()=>wait});
 const first=h.window.TIZFactCobActionsV2.cambiarEstadoGestion(h.o.id,"cobrado",{fechaPago:"2026-09-30"});
 await assert.rejects(h.window.TIZFactCobActionsV2.cambiarEstadoGestion(h.o.id,"cobrado",{fechaPago:"2026-09-30"}),/guardando/);
 release();await first;assert.equal(h.o.cobros.length,1);assert.equal(h.writes.length,1);
});
test("informe mantiene proyección después del cobro y asigna efectivo a fecha real",async()=>{
 const h=app();await h.window.TIZFactCobActionsV2.cambiarEstadoGestion(h.o.id,"cobrado",{fechaPago:"2026-09-30"});
 const data=h.window.TIZFacturacionCobranzasDataV2.build(),sep=api.informe(data,"2026-09"),oct=api.informe(data,"2026-10");
 assert.equal(sep.semanas.reduce((s,w)=>s+w.ingresado,0),121);assert.equal(oct.semanas.reduce((s,w)=>s+w.proyectado,0),121);
 assert.equal(oct.semanas.reduce((s,w)=>s+w.ingresado,0),0);assert.equal(oct.semanas[0].inicio,"2026-09-28");
});

test("el servidor rechaza plazo omitido antes de consultar o emitir en ARCA",async()=>{
 let queries=0,requests=0,status=200,result;
 const db={collection:()=>{queries++;throw new Error("No debe leer la OT sin plazo válido");}};
 const admin={apps:[{}],firestore:()=>db,auth:()=>({verifyIdToken:async()=>({email:"admin@test.local"})})};
 const ctx={module:{exports:{}},console:{error(){}},Date,fetch:async()=>{requests++;throw new Error("No debe llamar ARCA");},require:n=>n==="firebase-admin"?admin:n==="node-forge"?{}:n==="firebase-functions/v2/https"?{onRequest:(_o,fn)=>fn}:n==="firebase-functions/params"?{defineSecret:name=>({value:()=>name==="ARCA_ALLOWED_EMAILS"?"admin@test.local":""})}:n==="./condicionesPagoV127"?terms:n==="./arcaFiscalCoreV83"?{validateType:()=>({familia:"factura"})}:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,"functions/facturacionIntegralApiV83.js"),"utf8"),ctx);
 const req={method:"POST",get:n=>n==="authorization"?"Bearer TEST":"",body:{confirmacion:"EMITIR COMPROBANTE REAL PV 00009",obraId:"ot",idempotencyKey:"test",cbteTipo:1}};
 const res={set(){},status:n=>{status=n;return res},json:x=>{result=x},send(){}};
 const fn=ctx.module.exports.facturacionIntegralEmitirV83||ctx.exports?.facturacionIntegralEmitirV83;
 await fn(req,res);assert.equal(status,400);assert.match(result.error,/plazo de pago/);assert.equal(queries,0);assert.equal(requests,0);
});
