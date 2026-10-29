'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fce=require('../functions/arcaFceV1');
test('distingue permisos, ticket activo, vencimiento y conexión sin atribuir todo a la habilitación',()=>{
 for(const [message,code] of [['coe.notAuthorized: Computador no autorizado','FCE_SERVICIO_NO_AUTORIZADO'],['coe.alreadyAuthenticated: El CEE ya posee un TA valido','FCE_TICKET_ACTIVO'],['cms.cert.expired','FCE_CERTIFICADO_VENCIDO'],['fetch failed','FCE_CONEXION'],['timeout','FCE_TIEMPO_AGOTADO']]){
  const error=fce.diagnostic(Error(message),'autenticacion');assert.equal(error.code,code);assert.equal(error.status,503);assert.match(error.message,/No se emitió/);
 }
 const error=fce.diagnostic(Error('unexpected <token>PRIVATE</token>'), 'consulta');assert.equal(error.code,'FCE_CONSULTA_FALLIDA');assert.doesNotMatch(error.message,/PRIVATE|habilitado|token/);
});
function credentialsFixture(){
 const source=fs.readFileSync(require.resolve('../functions/facturacionIntegralApiV83'),'utf8');
 const chunk=source.slice(source.indexOf('const credentialCache ='),source.indexOf('async function call('));
 let calls=0,release,reject;
 const ctx={Date,Map,Promise,WSAA:'wsaa',esc:x=>x,tra:x=>x,cms:x=>x,tag:(_,name)=>({loginCmsReturn:'ticket',token:'token',sign:'sign',expirationTime:new Date(Date.now()+3600000).toISOString()})[name],soap:async()=>{calls++;return new Promise((a,b)=>{release=a;reject=b})}};
 vm.createContext(ctx);vm.runInContext(chunk+'\nthis.getCredentials=credentials;',ctx);
 return {get:ctx.getCredentials,calls:()=>calls,release:()=>release('response'),reject:()=>reject(Error('temporary failure'))};
}
test('consultas simultáneas de FCE solicitan un solo ticket y reutilizan su autorización',async()=>{
 const x=credentialsFixture(),a=x.get('wsfecred'),b=x.get('wsfecred');assert.equal(x.calls(),1);x.release();const [left,right]=await Promise.all([a,b]);assert.equal(left,right);await x.get('wsfecred');assert.equal(x.calls(),1);
 const other=x.get('wsfe');assert.equal(x.calls(),2);x.release();await other;
});
test('una autenticación fallida libera la consulta pendiente y permite reintentar',async()=>{
 const x=credentialsFixture(),a=x.get('wsfecred'),b=x.get('wsfecred');x.reject();const result=await Promise.allSettled([a,b]);assert.equal(result.filter(r=>r.status==='rejected').length,2);const retry=x.get('wsfecred');assert.equal(x.calls(),2);x.release();await retry;
});

{
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const diagnostic=require('../functions/arcaSoapDiagnosticV1'),fce=require('../functions/arcaFceV1');
function soapFixture(status,xml){
 const source=fs.readFileSync(require.resolve('../functions/facturacionIntegralApiV83'),'utf8');
 const chunk=source.slice(source.indexOf('async function soap('),source.indexOf('const credentialCache ='));
 const context={AbortSignal,fce,fetch:async()=>({ok:status>=200&&status<300,status,text:async()=>xml}),tag:(x,n)=>{const match=x.match(new RegExp('<'+n+'>([\\s\\S]*?)</'+n+'>'));return match?match[1]:'';}};
 vm.createContext(context);vm.runInContext(chunk+'\nthis.run=soap;',context);return context.run;
}
test('HTTP fallido conserva estado sin registrar el cuerpo HTML ni credenciales',async()=>{
 const soap=soapFixture(502,'<html>PRIVATE_BODY</html>');
 await assert.rejects(soap('url','action','<token>PRIVATE_TOKEN</token>'),error=>{
  assert.deepEqual(diagnostic.details(error),{httpStatus:502});
  assert.equal(fce.diagnostic(error,'consulta').code,'FCE_HTTP_ERROR');
  assert.doesNotMatch(JSON.stringify(diagnostic.details(error)),/PRIVATE/);return true;
 });
});
test('rechazo SOAP conserva motivo útil y elimina credenciales y CUIT del detalle',async()=>{
 const xml='<Fault><faultcode>soap:Server</faultcode><faultstring>Rechazo de operación. token=SHORT_TOKEN sign=SHORT_SIGN &lt;token&gt;ECHO&lt;/token&gt; CUIT 30700000001</faultstring></Fault>';
 const soap=soapFixture(500,xml);
 await assert.rejects(soap('url','action','<token>SHORT_TOKEN</token><sign>SHORT_SIGN</sign>'),error=>{
  const detail=diagnostic.details(error);assert.equal(detail.httpStatus,500);assert.equal(detail.faultCode,'soap:Server');
  assert.match(detail.detail,/Rechazo de operación/);assert.doesNotMatch(detail.detail,/SHORT_TOKEN|SHORT_SIGN|ECHO|30700000001/);
  const publicError=fce.diagnostic(error,'consulta');assert.equal(publicError.code,'FCE_RECHAZO_ARCA');assert.doesNotMatch(publicError.message,/soap:Server|SHORT|CUIT/);return true;
 });
});
test('SOAP exitoso conserva la respuesta y un rechazo no autorizado sigue distinguiéndose',async()=>{
 const xml='<consultarMontoObligadoRecepcionReturn><obligado>N</obligado></consultarMontoObligadoRecepcionReturn>';
 assert.equal(await soapFixture(200,xml)('url','action',''),xml);
 const error=diagnostic.failure(500,'<faultcode>soap:Server</faultcode><faultstring>coe.notAuthorized: Computador no autorizado</faultstring>','');
 assert.equal(fce.diagnostic(error,'consulta').code,'FCE_SERVICIO_NO_AUTORIZADO');
});
test('FCE registra campos saneados del error y no registra el objeto ni la solicitud',async()=>{
 const source=fs.readFileSync(require.resolve('../functions/facturacionIntegralApiV83'),'utf8');
 const chunk=source.slice(source.indexOf('async function consultarObligacionFce('),source.indexOf('function importeConsultaFce('));
 const logs=[],error=diagnostic.failure(503,'','');
 const context={fceMinimum:{check:async()=>null},credentials:async()=>({token:'PRIVATE',sign:'PRIVATE'}),soap:async()=>{throw error},fce,issuer:{value:()=> '30700000001'},soapDiagnostic:diagnostic,console:{error:(...args)=>logs.push(args)}};
 vm.createContext(context);vm.runInContext(chunk+'\nthis.run=consultarObligacionFce;',context);
 await assert.rejects(context.run({cuit:'33708800959',fecha:'2026-10-29',total:7461818.32}),/FCE_HTTP_ERROR/);
 assert.equal(logs.length,1);assert.equal(logs[0][1].etapa,'consulta');assert.equal(logs[0][1].httpStatus,503);assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|30700000001|33708800959/);
});


}

test('normaliza el CUIT emisor antes de construir la consulta FCE',()=>{
 for(const issuer of ['30700000001',' 30700000001\r\n','30-70000000-1',' 30-70000000-1 \n']){
  const xml=fce.request({issuer,token:'private',sign:'private',cuit:'33708800959',fecha:'2026-10-29'});
  assert.match(xml,/<cuitRepresentada>30700000001<\/cuitRepresentada>/);
  assert.match(xml,/<cuitConsultada>33708800959<\/cuitConsultada>/);
 }
});
test('configuración inválida se bloquea localmente sin inventar ni revelar una CUIT',()=>{
 for(const issuer of ['',undefined,'3070000000','CUIT=30700000001','30700000001X','<token>PRIVATE</token>']){
  assert.throws(()=>fce.request({issuer,token:'private',sign:'private',cuit:'33708800959',fecha:'2026-10-29'}),error=>{
   assert.equal(error.code,'ARCA_CUIT_EMISOR_INVALIDO');
   const failure=fce.diagnostic(error,'consulta');
   assert.equal(failure.code,'FCE_CUIT_EMISOR_INVALIDO');
   assert.doesNotMatch(failure.message,/PRIVATE|30700000001|CUIT=/);
   return true;
  });
 }
});
