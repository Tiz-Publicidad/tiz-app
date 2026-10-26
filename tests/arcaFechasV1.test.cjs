'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const F=require('../functions/arcaFechasV1'),fiscal=require('../functions/arcaFiscalCoreV83');
const hoy='2026-10-23';
test('fechas argentinas, límite de 5/10 días y excepción FCE de 5 días',()=>{
 assert.equal(F.today(new Date('2026-10-24T01:30:00Z')),hoy);
 assert.equal(F.limits({hoy,concepto:1}).min,'2026-10-18');
 for(const concepto of [2,3])assert.equal(F.limits({hoy,concepto}).min,'2026-10-13');
 assert.equal(F.limits({hoy,concepto:3,fce:true}).min,'2026-10-18');
 assert.equal(F.limits({hoy:'2026-03-02',concepto:2}).min,'2026-02-20');
});
test('último comprobante acota el rango, permite fecha igual y nunca se cambia la elegida en silencio',()=>{
 const limits=F.limits({hoy,concepto:2,ultimaFecha:'2026-10-20',ultimoNumero:25});
 assert.equal(limits.min,'2026-10-20');assert.equal(F.validate('2026-10-20',limits),'2026-10-20');
 for(const date of ['2026-10-19','2026-10-24','2026-02-30','20261020'])assert.throws(()=>F.validate(date,limits));
 assert.equal(F.limits({hoy,ultimaFecha:'2026-10-24'}).min,'2026-10-24');
 assert.throws(()=>F.concept(4));
});
test('período de servicios y vencimiento usan la fecha elegida y conservan el plazo',()=>{
 assert.deepEqual(F.serviceDates({concepto:3,fecha:'2026-10-13',desde:'2026-10-01',hasta:'2026-10-13',diasPago:30}),{fecha:'2026-10-13',fechaServicioDesde:'2026-10-01',fechaServicioHasta:'2026-10-13',fechaVencimientoPago:'2026-11-12'});
 assert.equal(F.serviceDates({concepto:1,fecha:'2026-10-20',diasPago:0}).fechaVencimientoPago,'2026-10-20');
 assert.throws(()=>F.serviceDates({concepto:2,fecha:hoy,desde:hoy,hasta:'2026-10-01',diasPago:15}),/posterior/);
});
function server({last='20261020',lastNumber=25,malformed=false,oldAuthorized=null,obligado='N',montoDesde=121,consultaError=false,configReady=true,noFacturable=false}={}){
 const requests=[],writes=[],pdf=[],o={ot:'4800',cliente:'Cliente',neto:100,noFacturable},refs=new Map();
 function doc(col,id){const key=col+'/'+id;if(!refs.has(key))refs.set(key,{get:async()=>({exists:col==='obras'||(col==='arcaEmisiones'&&!!oldAuthorized),data:()=>col==='obras'?o:{status:'autorizada',comprobante:oldAuthorized}}),set:async data=>writes.push({col,id,data}),update:async data=>writes.push({col,id,data})});return refs.get(key);}
 const db={collection:col=>({doc:id=>doc(col,id)}),runTransaction:async fn=>fn({get:async r=>({exists:false,data:()=>({})}),set:(r,d)=>writes.push({lock:d})})};
 function firestore(){return db;}firestore.FieldValue={serverTimestamp:()=>({at:true})};
 const admin={apps:[{}],firestore,auth:()=>({verifyIdToken:async()=>({email:'info@tizpublicidad.com'})})};
 const FixedDate=class extends Date{constructor(...a){super(...(a.length?a:['2026-10-23T18:00:00Z']))}static now(){return +new Date('2026-10-23T18:00:00Z')}};
 const context={module:{exports:{}},Date:FixedDate,Intl,console:{error(){}},require:n=>n==='firebase-admin'?admin:n==='googleapis'?{google:{}}:n==='node-forge'?{}:n==='firebase-functions/v2/https'?{onRequest:(_,h)=>h}:n==='firebase-functions/params'?{defineSecret:name=>({value:()=>name==='ARCA_ALLOWED_EMAILS'?'info@tizpublicidad.com':'issuer'})}:n==='./arcaFiscalCoreV83'?fiscal:n==='./arcaFceV1'?{...require('../functions/arcaFceV1'),loadConfig:async()=>{if(!configReady)throw Error('Falta configuración privada');return {cbuFce:'9999999100000000000017',sistemaCirculacion:'SCA'}}}:n==='./arcaFechasV1'?{...F,today:()=>hoy,limits:x=>F.limits({hoy,...x})}:n==='./condicionesPagoV127'?require('../functions/condicionesPagoV127'):n==='./facturaDrive2026'?{archivarFacturaPdfEnDrive:async x=>{pdf.push(x);return {fileId:'pdf',webViewLink:'https://drive.google.com/file/d/pdf/view'}}}:null};
 vm.runInNewContext(fs.readFileSync(require.resolve('../functions/facturacionIntegralApiV83'),'utf8')+'\nsoap=async()=>testFce();credentials=async()=>({});call=async(method,inner)=>testCall(method,inner);',Object.assign(context,{testFce:async()=>{if(consultaError)throw Error('sin conexión');return `<consultarMontoObligadoRecepcionReturn><obligado>${obligado}</obligado>${montoDesde===null?'':`<montoDesde>${montoDesde}</montoDesde>`}</consultarMontoObligadoRecepcionReturn>`;},testCall:async(method,inner)=>{requests.push({method,inner});if(method==='FECompUltimoAutorizado')return malformed?'<Errors/>':`<CbteNro>${lastNumber}</CbteNro>`;if(method==='FECompConsultar')return `<ResultGet><CbteFch>${last}</CbteFch></ResultGet>`;if(method==='FECAESolicitar')return '<Resultado>A</Resultado><CAE>12345678901234</CAE><CAEFchVto>20261102</CAEFchVto>';throw Error(method);}}));
 async function run(extra={}){let status=200,body;await context.module.exports.facturacionIntegralEmitirV83({method:'POST',get:n=>n==='authorization'?'Bearer test':'',body:{confirmacion:'EMITIR COMPROBANTE REAL PV 00009',obraId:'o',idempotencyKey:'unique',cbteTipo:1,docNro:'30715740326',domicilioFiscal:'Domicilio',neto:100,diasPago:30,items:[{descripcion:'Cartel',cantidad:1,unitario:100}],...extra}},{set(){},status(s){status=s;return this},json(b){body=b},send(){}});return {status,body};}
 return {run,requests,writes,pdf};
}
test('consultar fecha mínima es una operación de sólo lectura con la última FC del tipo/PV solicitado',async()=>{
 const x=server(),r=await x.run({mode:'date-limits',concepto:3,cbteTipo:6});assert.equal(r.status,200);assert.equal(r.body.min,'2026-10-20');assert.equal(r.body.ptoVta,9);assert.equal(x.writes.length,0);assert.deepEqual(x.requests.map(r=>r.method),['FECompUltimoAutorizado','FECompConsultar']);assert.match(x.requests[0].inner,/<CbteTipo>6<\/CbteTipo>/);
});
test('emisión valida de nuevo la fecha de ARCA y rechaza sin pedir CAE si otra FC la vuelve inválida',async()=>{
 const x=server({last:'20261023'}),r=await x.run({concepto:2,fechaEmision:'2026-10-20'});assert.equal(r.status,400);assert.match(r.body.error,/2026-10-23/);assert.equal(x.requests.some(r=>r.method==='FECAESolicitar'),false);assert.equal(x.pdf.length,0);
});
test('fecha retroactiva viaja a WSFE, registro, PDF, período y vencimiento',async()=>{
 const x=server({last:'20261013'}),r=await x.run({concepto:3,fechaEmision:'2026-10-13',fechaServicioDesde:'2026-10-01',fechaServicioHasta:'2026-10-13'});assert.equal(r.status,200);const xml=x.requests.find(r=>r.method==='FECAESolicitar').inner;assert.match(xml,/<Concepto>3<\/Concepto>/);assert.match(xml,/<CbteFch>20261013<\/CbteFch>/);assert.match(xml,/<FchServDesde>20261001<\/FchServDesde>/);assert.match(xml,/<FchServHasta>20261013<\/FchServHasta>/);assert.match(xml,/<FchVtoPago>20261112<\/FchVtoPago>/);assert.equal(r.body.fecha,'2026-10-13');assert.equal(r.body.fechaPrevistaCobro,'2026-11-12');assert.equal(x.pdf[0].factura.fecha,r.body.fecha);assert.equal(x.pdf[0].factura.fechaServicioDesde,'2026-10-01');
});
test('productos conservan concepto 1 y cinco días; no se fuerza servicios para ampliar plazo',async()=>{
 const x=server(),r=await x.run({fechaEmision:'2026-10-13'});assert.equal(r.status,400);assert.match(r.body.error,/2026-10-18/);assert.equal(x.requests.length,0);
});
test('si ARCA no devuelve el último comprobante o su fecha, no se habilita ni se emite',async()=>{
 for(const opts of [{malformed:true},{last:'mal'},{last:'20260230'}]){const x=server(opts),r=await x.run({mode:'date-limits'});assert.notEqual(r.status,200);assert.equal(x.writes.length,0);assert.equal(x.requests.some(r=>r.method==='FECAESolicitar'),false);}
 const empty=server({lastNumber:0}),r=await empty.run({mode:'date-limits',concepto:2});assert.equal(r.body.min,'2026-10-13');assert.equal(empty.requests.length,1);
});
test('un reintento autorizado devuelve el mismo comprobante aunque su fecha haya salido del plazo',async()=>{
 const x=server({oldAuthorized:{numeroCompleto:'00009-00000025',fecha:'2026-09-01'}}),r=await x.run({fechaEmision:'2026-09-01'});assert.equal(r.body.repetida,true);assert.equal(r.body.fecha,'2026-09-01');assert.equal(x.requests.length,0);assert.equal(x.writes.length,0);
});

test('el formulario permite elegir la fecha mínima consultada y bloquea una anterior sin emitir',async()=>{
 const fields=new Map(),network=[];let root;
 const defaults={'fv83-type':'1','fv83-concept':'1','fv83-date':hoy,'fv83-term':'30','fv83-iva':'21','fv83-net':'100','fv83-pct':'100'};
 const document={getElementById:()=>null,head:{appendChild(){}},body:{appendChild(el){root=el}},createElement:()=>({style:{},remove(){},querySelector(selector){const id=selector.slice(1);assert.ok(this.innerHTML.includes('id="'+id+'"'),id+' debe existir en el formulario real');if(!fields.has(id))fields.set(id,{value:defaults[id]||'',style:{},textContent:'',innerHTML:'',checked:false,addEventListener(){},options:[1,6,201,206].map(value=>({value:String(value)}))});return fields.get(id);}})};
 const window={currentUser:{isAdmin:true},DB:{clientes:[],obras:[{id:'o',ot:'4800',neto:100,cliente:'Cliente'}]},TIZArcaFechasV1:{...F,today:()=>hoy},addEventListener(){}};
 let source=fs.readFileSync(require.resolve('../facturadorIntegralV83'),'utf8');const start=source.indexOf('  async function token()'),end=source.indexOf('  window.abrirFacturacionIntegralV83',start);source=source.slice(0,start)+"async function token(){return 'test';}\n"+source.slice(end);
 vm.runInNewContext(source,{window,document,Date,Intl,console,setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},fetch:async(url,opts)=>{const body=JSON.parse(opts.body);network.push(body);assert.ok(['date-limits','fce-check'].includes(body.mode),'abrir y cambiar fechas nunca emite');if(body.mode==='fce-check')return {ok:true,json:async()=>({ok:true,requiereFce:false})};const data={ok:true,ptoVta:9,...F.limits({hoy,concepto:body.concepto,ultimaFecha:'2026-10-20',ultimoNumero:25})};return {ok:true,json:async()=>data};}});
 window.abrirFacturacionIntegralV83('o');await new Promise(setImmediate);
 const get=id=>fields.get('fv83-'+id);assert.equal(get('date').min,'2026-10-20');assert.equal(get('emit').disabled,true);
 get('ok').checked=true;get('ok').onchange();assert.equal(get('emit').disabled,false);
 get('date-oldest').onclick();assert.equal(get('date').value,'2026-10-20');assert.equal(get('emit').disabled,true);await get('fce-refresh').onclick();get('ok').checked=true;get('ok').onchange();assert.equal(get('emit').disabled,false);
 get('date').value='2026-10-19';get('date').onchange();assert.equal(get('emit').disabled,true);assert.match(get('date-error').textContent,/2026-10-20/);
 get('concept').value='3';get('concept').onchange();await new Promise(setImmediate);assert.equal(get('service-from-wrap').style.display,'');assert.equal(network.filter(r=>r.mode==='date-limits').at(-1).concepto,3);assert.equal(network.every(r=>['date-limits','fce-check'].includes(r.mode)),true);
});

// The same handler fixture exercises production checks, not a UI-only shortcut.
test('ARCA exige FCE: bloquea A y B comunes incluso con flags del cliente para omitir consulta',async()=>{
 for(const cbteTipo of [1,6]){const x=server({obligado:'S'}),r=await x.run({cbteTipo,requiereFce:false,omitirFce:true});assert.equal(r.status,422);assert.match(r.body.error,/bloqueada/);assert.equal(x.requests.some(r=>r.method==='FECAESolicitar'),false);assert.equal(x.pdf.length,0);}
});
test('FCE válida manda CBU y SCA a WSFE y los conserva en el comprobante y PDF',async()=>{
 const x=server({obligado:'S'}),r=await x.run({cbteTipo:201});assert.equal(r.status,200,r.body.error);const xml=x.requests.find(r=>r.method==='FECAESolicitar').inner;assert.match(xml,/<Id>2101<\/Id><Valor>9999999100000000000017<\/Valor>/);assert.match(xml,/<Id>27<\/Id><Valor>SCA<\/Valor>/);assert.match(xml,/<FchVtoPago>20261122<\/FchVtoPago>/);assert.equal(r.body.sistemaCirculacion,'SCA');assert.equal(r.body.verificacionFce.requiereFce,true);assert.equal(x.pdf[0].factura.cbuFce,r.body.cbuFce);
});
test('falla cerrada si ARCA está fuera de servicio, devuelve respuesta inválida o falta CBU',async()=>{
 for(const config of [{consultaError:true},{obligado:'S',montoDesde:null},{obligado:'S',configReady:false}]){const x=server(config),r=await x.run({cbteTipo:config.configReady===false?201:1});assert.notEqual(r.status,200);assert.equal(x.requests.some(r=>r.method==='FECAESolicitar'),false);assert.equal(x.pdf.length,0);}
});
test('consulta de obligación es sólo lectura y usa total con IVA, fecha y CUIT seleccionados',async()=>{
 const x=server({obligado:'S'}),r=await x.run({mode:'fce-check',cbteTipo:1,neto:100,fechaEmision:'2026-10-20'});assert.equal(r.status,200);assert.equal(r.body.total,121);assert.equal(r.body.requiereFce,true);assert.equal(r.body.fecha,'2026-10-20');assert.equal(r.body.cuit,'30715740326');assert.equal(r.body.cbuFinal,'0017');assert.equal(x.writes.length,0);assert.equal(x.requests.length,0);
});
test('factura común por debajo del umbral no agrega opcionales FCE; FCE con vencimiento pasado se rechaza',async()=>{
 const x=server({obligado:'S',montoDesde:122}),r=await x.run();assert.equal(r.status,200);assert.doesNotMatch(x.requests.find(r=>r.method==='FECAESolicitar').inner,/<Opcionales>/);
 const y=server({obligado:'S'}),a=await y.run({cbteTipo:201,fechaEmision:'2026-10-20',diasPago:0});assert.equal(a.status,400);assert.match(a.body.error,/vencimiento/);assert.equal(y.requests.some(r=>r.method==='FECAESolicitar'),false);
});

test('nota FCE usa el régimen original, opcional de anulación y no manda CBU ni vencimiento de factura',async()=>{
 const x=server({consultaError:true}),r=await x.run({cbteTipo:202,concepto:3,asociado:{cbteTipo:201,ptoVta:9,cbteNro:1},anulacionFce:'N'});assert.equal(r.status,200,r.body.error);const xml=x.requests.find(r=>r.method==='FECAESolicitar').inner;assert.match(xml,/<Id>22<\/Id><Valor>N<\/Valor>/);assert.doesNotMatch(xml,/<Id>2101<\/Id>|<Id>27<\/Id>|<FchVtoPago>/);assert.match(xml,/<FchServDesde>/);
});

test('servidor bloquea emisión nueva para No facturable antes de consultar ARCA',async()=>{
 const x=server({noFacturable:true}),r=await x.run();assert.equal(r.status,409);assert.match(r.body.error,/No facturable/);assert.equal(x.requests.length,0);assert.equal(x.pdf.length,0);
});
test('reintento de factura autorizada nunca vuelve a emitir aunque cambie la condición',async()=>{
 const x=server({noFacturable:true,oldAuthorized:{numeroCompleto:'00009-00000025'}}),r=await x.run();assert.equal(r.body.repetida,true);assert.equal(x.requests.length,0);
});
