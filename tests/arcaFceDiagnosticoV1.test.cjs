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
