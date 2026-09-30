"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
function harness(){
  const calls=[],writes=[];
  const env={ARCA_ALLOWED_EMAILS:"operador@example.com",ARCA_ISSUER_CUIT:"30700000001"};
  const signed={addCertificate(){},addSigner(){},sign(){},toAsn1(){}};
  const forge={pkcs7:{createSignedData:()=>signed},util:{createBuffer:x=>x,encode64:()=>"CMS"},pki:{certificateFromPem:()=>({}),privateKeyFromPem:()=>({}),oids:{}},asn1:{toDer:()=>({getBytes:()=>"CMS"})}};
  const ref={get:async()=>({exists:true,data:()=>({clienteId:"cliente-1"})}),set:async(d)=>writes.push(d)};
  const admin={apps:[{}],auth:()=>({verifyIdToken:async t=>({email:t==="permitido"?"operador@example.com":"intruso@example.com"})}),firestore:()=>({collection:()=>({doc:()=>ref})})};
  const sandbox={require:n=>({"firebase-admin":admin,"node-forge":forge,"firebase-functions/v2/https":{onRequest:(_o,h)=>h},"firebase-functions/params":{defineSecret:n=>({value:()=>env[n]||"PEM"})}}[n]),module:{exports:{}},console:{error(){}},Date,fetch:async(url,options)=>{
    calls.push({url,body:options.body});
    const xml=url.includes("LoginCms")?'&lt;loginTicketResponse&gt;&lt;token&gt;TOKEN&lt;/token&gt;&lt;sign&gt;SIGN&lt;/sign&gt;&lt;/loginTicketResponse&gt;':'';
    return {ok:true,text:async()=>url.includes("LoginCms")?"<loginCmsReturn>"+xml+"</loginCmsReturn>":"<datosGenerales><razonSocial>Cliente SA</razonSocial><domicilioFiscal><direccion>Calle 123</direccion><localidad>Ciudad</localidad><codPostal>1234</codPostal><descripcionProvincia>Buenos Aires</descripcionProvincia></domicilioFiscal></datosGenerales>"};
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../functions/arcaPadronA5V125.js"),"utf8"),sandbox);
  const invoke=async(auth,body)=>{let status=200,payload;const req={method:"POST",get:n=>n==="authorization"?"Bearer "+auth:"https://tiz-publicidad.github.io",body};const res={set(){},status:s=>{status=s;return res;},json:d=>{payload=d;},send(){}};await sandbox.module.exports.arcaPadronConsultarV125(req,res);return {status,payload};};
  return {calls,writes,invoke};
}
test("rechaza operadores sin permiso antes de consultar ARCA",async()=>{
  const h=harness(),r=await h.invoke("intruso",{cuit:"30692138747"});
  assert.equal(r.status,403);assert.equal(h.calls.length,0);assert.equal(h.writes.length,0);
});
test("rechaza CUIT incompleto antes de consultar ARCA",async()=>{
  const h=harness(),r=await h.invoke("permitido",{cuit:"123"});
  assert.equal(r.status,400);assert.equal(h.calls.length,0);
});
test("consulta Constancia de Inscripción y guarda domicilio, sin emisión",async()=>{
  const h=harness(),r=await h.invoke("permitido",{cuit:"30692138747",obraId:"ot-4755"});
  assert.equal(r.status,200);assert.equal(r.payload.domicilioFiscal,"Calle 123, Ciudad, CP 1234, Buenos Aires");
  assert.equal(h.calls.length,2);assert.match(h.calls[0].body,/<in0>CMS<\/in0>/);
  assert.match(h.calls[1].body,/<a5:getPersona_v2>/);
  assert.ok(h.calls.every(c=>!c.url.includes("wsfe")&&!c.body.includes("FECAESolicitar")));
  assert.equal(h.writes.length,2);
});
