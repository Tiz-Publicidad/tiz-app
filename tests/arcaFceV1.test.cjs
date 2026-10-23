'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const F=require('../functions/arcaFceV1'),dates=require('../functions/arcaFechasV1'),fiscal=require('../functions/arcaFiscalCoreV83');
const cbu='9999999100000000000017';
const response=(obligado,monto)=>`<s:Envelope><s:Body><f:consultarMontoObligadoRecepcionResponse><consultarMontoObligadoRecepcionReturn><obligado>${obligado}</obligado>${monto===undefined?'':`<montoDesde>${monto}</montoDesde>`}</consultarMontoObligadoRecepcionReturn></f:consultarMontoObligadoRecepcionResponse></s:Body></s:Envelope>`;
test('umbral inclusivo por importe bruto: un centavo abajo permite común y en el límite exige FCE',()=>{
 assert.equal(F.parse(response('S','121.00'),120.99).requiereFce,false);
 assert.equal(F.parse(response('S','121.00'),121).requiereFce,true);
 assert.equal(F.parse(response('N'),100000000).requiereFce,false);
 for(const t of [1,6])assert.throws(()=>F.enforce(fiscal.validateType(t),F.parse(response('S',121),121)),/bloqueada/);
 assert.throws(()=>F.enforce(fiscal.validateType(201),F.parse(response('N'),121)),/común/);
});
test('SOAP usa contrato de producción: request calificado, hijos sin namespace, CUIT y fecha elegidos',()=>{
 const xml=F.request({token:'a&b',sign:'sig',issuer:'30111111111',cuit:'30222222222',fecha:'2026-10-20'});
 assert.match(xml,/<fec:consultarMontoObligadoRecepcionRequest xmlns:fec="http:\/\/ar.gob.afip.wsfecred\/FECredService\/">/);
 assert.match(xml,/<authRequest><token>a&amp;b<\/token>/);assert.match(xml,/<cuitConsultada>30222222222<\/cuitConsultada><fechaEmision>2026-10-20<\/fechaEmision>/);
});
test('errores y respuestas parciales nunca se interpretan como receptor no obligado',()=>{
 for(const xml of ['',response('S'),response('S','NaN'),response('S',0),response('X',121),'<faultstring>No autorizado</faultstring>',response('N').replace('</consultarMontoObligadoRecepcionReturn>','<arrayErrores><codigoDescripcion><codigo>1</codigo><descripcion>Error</descripcion></codigoDescripcion></arrayErrores></consultarMontoObligadoRecepcionReturn>')])assert.throws(()=>F.parse(xml,121));
});
test('CBU valida ambos dígitos verificadores y sólo admite SCA; notas no llevan CBU ni transferencia',()=>{
 assert.equal(F.validCbu(cbu),true);assert.equal(F.validCbu(cbu.slice(0,-1)+'8'),false);assert.equal(F.validCbu('0'.repeat(22)),false);
 assert.throws(()=>F.config({cbu,sistemaCirculacion:'ADC'}));
 assert.match(F.optionalXml(fiscal.validateType(201),{cbuFce:cbu,sistemaCirculacion:'SCA'}),/<Id>27<\/Id><Valor>SCA<\/Valor>/);
 for(const t of [202,203,207,208]){const xml=F.optionalXml(fiscal.validateType(t),null,'N');assert.match(xml,/<Id>22<\/Id><Valor>N<\/Valor>/);assert.doesNotMatch(xml,/2101|SCA/);}
 assert.equal(F.optionalXml(fiscal.validateType(1),null),'');
});
test('config privada: rechaza ausencia, duplicados, formato inválido y nunca toma CBU del navegador',async()=>{
 for(const files of [[],[{id:'a',mimeType:'application/json'},{id:'b',mimeType:'application/json'}],[{id:'a',mimeType:'text/plain'}]]){
  const google={auth:{GoogleAuth:class{}},drive:()=>({files:{list:async()=>({data:{files}})}})};await assert.rejects(()=>F.loadConfig(google));
 }
 const google={auth:{GoogleAuth:class{}},drive:()=>({files:{list:async()=>({data:{files:[{id:'a',mimeType:'application/json'}]}}),get:async()=>({data:{cbu,sistemaCirculacion:'SCA'}})}})};
 assert.equal((await F.loadConfig(google)).cbuFce,cbu);
});
test('formulario bloquea común, ofrece FCE, invalida chequeo al editar y no permite emitir con CBU pendiente',async()=>{
 const fields=new Map(),requests=[],listeners=new Map(),timers=[];let required=true,configured=true;
 const defaults={'fv83-cuit':'30222222222','fv83-type':'1','fv83-concept':'1','fv83-date':'2026-10-23','fv83-term':'30','fv83-net':'100','fv83-pct':'100','fv83-iva':'21'};
 const document={getElementById:()=>null,head:{appendChild(){}},body:{appendChild(){}},createElement:()=>({style:{},remove(){},querySelector(selector){const id=selector.slice(1);assert.ok(this.innerHTML.includes('id="'+id+'"'));if(!fields.has(id))fields.set(id,{value:defaults[id]||'',checked:false,style:{},textContent:'',innerHTML:'',options:[1,6,201,206].map(value=>({value:String(value)})),addEventListener(event,fn){listeners.set(id+':'+event,fn)}});return fields.get(id);}})};
 const window={currentUser:{isAdmin:true},DB:{clientes:[],obras:[{id:'o',ot:'4800',cliente:'Prueba',neto:100}]},TIZArcaFechasV1:{...dates,today:()=> '2026-10-23'},addEventListener(){}};
 let source=fs.readFileSync(require.resolve('../facturadorIntegralV83'),'utf8'),start=source.indexOf('  async function token()'),end=source.indexOf('  window.abrirFacturacionIntegralV83',start);source=source.slice(0,start)+"async function token(){return 'test';}\n"+source.slice(end);
 vm.runInNewContext(source,{window,document,Date,Intl,console,setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){},setInterval(){},clearInterval(){},fetch:async(url,opts)=>{const body=JSON.parse(opts.body);requests.push(body);assert.ok(['date-limits','fce-check'].includes(body.mode)||url.includes('arcaPadronConsultarV125'));const data=body.mode==='date-limits'?{ok:true,...dates.limits({hoy:'2026-10-23'})}:body.mode==='fce-check'?{ok:true,requiereFce:required,obligado:true,montoDesde:121,fceConfigurada:configured,cbuFinal:'0017',configError:configured?'':'Falta configuración privada'}:{ok:false,error:'Padrón de prueba'};return {ok:true,json:async()=>data};}});
 window.abrirFacturacionIntegralV83('o');await new Promise(setImmediate);
 const get=id=>fields.get('fv83-'+id);get('ok').checked=true;get('ok').onchange();assert.equal(get('emit').disabled,true);assert.match(get('fce-status').textContent,/bloqueada/);assert.equal(get('type').options.find(x=>x.value==='1').disabled,true);
 get('fce-switch').onclick();await new Promise(setImmediate);assert.equal(get('type').value,'201');get('ok').checked=true;get('ok').onchange();assert.equal(get('emit').disabled,false);
 get('net').value='90';get('net').oninput();assert.equal(get('emit').disabled,true);required=false;await get('fce-refresh').onclick();assert.match(get('fce-status').textContent,/común/);get('ok').checked=true;get('ok').onchange();assert.equal(get('emit').disabled,true);
 required=true;configured=false;await get('fce-refresh').onclick();get('ok').checked=true;get('ok').onchange();assert.equal(get('emit').disabled,true);assert.match(get('fce-status').textContent,/Falta configuración/);
 assert.equal(requests.some(r=>r.confirmacion),false,'abrir, verificar y cambiar tipo no emiten');
});
