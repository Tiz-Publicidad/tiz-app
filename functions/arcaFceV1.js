'use strict';
// Contract verified against the production WSFECRED WSDL, 2026-10-23.
const URL='https://serviciosjava.afip.gob.ar/wsfecred/FECredService';
const NS='http://ar.gob.afip.wsfecred/FECredService/';
const CONFIG_FOLDER='1XYk0vAIsGZCAiJ4s7TGyQYJdVBYvYdGy';
const CONFIG_NAME='TIZ-configuracion-FCE.json';
const fail=(message,status=422)=>Object.assign(new Error(message),{status});
function diagnostic(error,stage='consulta'){
 const text=[error?.code,error?.name,error?.message,error?.cause?.code].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 let code='FCE_CONSULTA_FALLIDA',message='No se pudo completar la consulta de FCE en ARCA.';
 if(/alreadyauthenticated|ya posee un ta valido|ticket de acceso.*valido/.test(text)){code='FCE_TICKET_ACTIVO';message='ARCA informa que ya existe una autorización vigente para WSFECRED. Hay que revisar la reutilización de esa autorización en el servidor.';}
 else if(/notauthorized|not authorized|no autorizado|no se encuentra autorizado|servicio.*no.*habilitado|no.*servicio.*habilitado/.test(text)){code='FCE_SERVICIO_NO_AUTORIZADO';message='ARCA rechazó la autorización de WSFECRED. Revisá la relación del certificado con «Web Service Registro de Facturas de Crédito Electrónica MiPyMEs» para el CUIT emisor.';}
 else if(/cms\.cert\.expired|certificado.*vencido|signing certificate.*expired/.test(text)){code='FCE_CERTIFICADO_VENCIDO';message='ARCA informó que el certificado de autenticación está vencido. Hay que actualizarlo en el servidor.';}
 else if(/timeouterror|aborterror|etimedout|timeout/.test(text)){code='FCE_TIEMPO_AGOTADO';message='La consulta de FCE a ARCA agotó el tiempo de espera. Reintentá «Verificar FCE».';}
 else if(/fetch failed|enotfound|econnreset|econnrefused|sin conexion|cert_has_expired|unable_to_verify/.test(text)){code='FCE_CONEXION';message='El servidor no pudo conectarse con ARCA para verificar FCE. Reintentá «Verificar FCE»; si persiste, hay que revisar la conexión del servidor.';}
 else if(stage==='respuesta'){code='FCE_RESPUESTA_INVALIDA';message='ARCA devolvió una respuesta incompleta o rechazada al consultar FCE. Hay que revisar la respuesta del servicio.';}
 else if(stage==='autenticacion'){code='FCE_AUTENTICACION';message='Falló la autenticación del servidor ante ARCA para consultar WSFECRED. Hay que revisar su autorización y certificado.';}
 return Object.assign(new Error(`${message} No se emitió ningún comprobante. [${code}]`),{status:503,code,etapa:stage});
}
const esc=v=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function tag(xml,name){const m=String(xml||'').match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`,'i'));return m?m[1].trim().replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'):'';}
function request({token,sign,issuer,cuit,fecha}){
 if(!/^\d{11}$/.test(String(cuit))||!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha)))throw fail('CUIT o fecha inválidos para consultar FCE.',400);
 return `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><fec:consultarMontoObligadoRecepcionRequest xmlns:fec="${NS}"><authRequest><token>${esc(token)}</token><sign>${esc(sign)}</sign><cuitRepresentada>${esc(issuer)}</cuitRepresentada></authRequest><cuitConsultada>${cuit}</cuitConsultada><fechaEmision>${fecha}</fechaEmision></fec:consultarMontoObligadoRecepcionRequest></soap:Body></soap:Envelope>`;
}
function parse(xml,total){
 const result=tag(xml,'consultarMontoObligadoRecepcionReturn');
 const error=tag(xml,'faultstring')||tag(result,'arrayErrores')||tag(result,'arrayErroresFormato');
 if(error||!result)throw fail('ARCA no pudo verificar si corresponde FCE. No se emitió ningún comprobante. Revisá la consulta WSFECRED.',503);
 // Production schema uses "obligado" (the PDF manual still calls it "respuesta").
 const obligado=tag(result,'obligado'),raw=tag(result,'montoDesde'),montoDesde=raw===''?null:Number(raw);
 if(!['S','N'].includes(obligado)||(obligado==='S'&&(!Number.isFinite(montoDesde)||montoDesde<=0))||!Number.isFinite(total)||total<=0)
  throw fail('Respuesta incompleta de ARCA para FCE. No se permite emitir sin verificar la obligación.',503);
 return {obligado:obligado==='S',montoDesde,requiereFce:obligado==='S'&&Math.round(total*100)>=Math.round(montoDesde*100),total,verificadoAt:new Date().toISOString(),fuente:'WSFECRED.consultarMontoObligadoRecepcion'};
}
function enforce(cfg,check){
 if(cfg.familia!=='factura')return;
 if(!check||typeof check.requiereFce!=='boolean')throw fail('Falta verificar la obligación de FCE en ARCA.',503);
 if(check.requiereFce&&!cfg.fce)throw fail(`Este cliente y este importe requieren Factura de Crédito Electrónica ${cfg.letra}. La factura ${cfg.letra} común está bloqueada. Seleccioná FCE ${cfg.letra}.`);
 if(!check.requiereFce&&cfg.fce)throw fail(`ARCA no informa obligación de FCE para este cliente, fecha e importe. Seleccioná Factura ${cfg.letra} común.`);
}
function validCbu(value){
 const s=String(value||'');if(!/^\d{22}$/.test(s)||/^0+$/.test(s))return false;
 const digit=(part,weights)=>String((10-part.split('').reduce((sum,c,i)=>sum+Number(c)*weights[i],0)%10)%10);
 return digit(s.slice(0,7),[7,1,3,9,7,1,3])===s[7]&&digit(s.slice(8,21),[3,9,7,1,3,9,7,1,3,9,7,1,3])===s[21];
}
function config(value){
 if(!validCbu(value?.cbu)||value?.sistemaCirculacion!=='SCA')throw fail('Falta configurar un CBU válido para FCE con Sistema de Circulación Abierta. No se emitió el comprobante.',503);
 return {cbuFce:value.cbu,sistemaCirculacion:'SCA'};
}
async function loadConfig(google){
 const drive=google.drive({version:'v3',auth:new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/drive.readonly']})});
 try{
  const found=await drive.files.list({q:`'${CONFIG_FOLDER}' in parents and name = '${CONFIG_NAME}' and trashed = false`,fields:'files(id,mimeType)',pageSize:2},{timeout:15000});
  const files=found.data.files||[];
  if(files.length!==1||files[0].mimeType!=='application/json')throw Error('config');
  const response=await drive.files.get({fileId:files[0].id,alt:'media'},{timeout:15000});
  return config(typeof response.data==='string'?JSON.parse(response.data):response.data);
 }catch(e){if(e.status===503)throw e;throw fail('Falta la configuración privada de FCE o no se pudo leer. No se emitió ningún comprobante.',503);}
}
function optionalXml(cfg,settings,anulacion='N'){
 if(!cfg.fce)return '';
 if(cfg.familia==='factura'){
  const checked=config({cbu:settings?.cbuFce,sistemaCirculacion:settings?.sistemaCirculacion});
  return `<Opcionales><Opcional><Id>2101</Id><Valor>${checked.cbuFce}</Valor></Opcional><Opcional><Id>27</Id><Valor>SCA</Valor></Opcional></Opcionales>`;
 }
 if(!['S','N'].includes(anulacion))throw fail('Indicá si la nota FCE es de anulación.',400);
 return `<Opcionales><Opcional><Id>22</Id><Valor>${anulacion}</Valor></Opcional></Opcionales>`;
}
function validateDue(cfg,due,fecha,hoy){if(cfg.fce&&cfg.familia==='factura'&&due<(fecha>hoy?fecha:hoy))throw fail('El vencimiento de pago de la FCE debe ser igual o posterior a hoy y a la fecha de emisión. Aumentá el plazo de pago.',400);}
module.exports={URL,NS,request,parse,enforce,validCbu,config,loadConfig,optionalXml,validateDue,diagnostic};
