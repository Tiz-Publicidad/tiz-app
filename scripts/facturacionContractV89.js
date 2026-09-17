"use strict";
const fs=require('fs');
const path=require('path');
const assert=require('assert');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function must(file,needle,msg){assert(read(file).includes(needle),msg||`${file} debe contener ${needle}`)}
function mustNot(file,needle,msg){assert(!read(file).includes(needle),msg||`${file} no debe contener ${needle}`)}

// Contratos estáticos: evitamos que frontend/backend vuelvan a divergir.
must('facturadorIntegralV83.js',"const PTO=3, PTO_LABEL='00003'",'El facturador debe usar PV 00003');
must('facturadorIntegralV83.js','initializeApp(FIREBASE_CONFIG)','El preview debe inicializar Firebase de forma segura');
must('facturadorIntegralV83.js','driveAccessToken','La emisión debe llevar autorización Drive');
must('facturadorIntegralV83.js','Responsable Monotributo','Debe contemplar condición IVA del receptor');
must('facturadorIntegralV83.js','Saldo completo','El operador debe tener acceso rápido al saldo pendiente');
mustNot('facturadorIntegralV83.js','PV 00009','No debe quedar activo PV 00009 en el facturador');

must('functions/facturacionIntegralApiV83.js','const PTO=3;','El backend debe usar PV 00003');
must('functions/facturacionIntegralApiV83.js','facturasArca:allDrive','El link Drive debe persistirse también en el historial de facturas');
must('functions/facturacionIntegralApiV83.js','porcentajePendiente','Debe persistirse el porcentaje pendiente');
must('functions/facturacionIntegralApiV83.js','authorized:true','Debe distinguir ARCA autorizada de fallos posteriores');
must('functions/facturacionIntegralApiV83.js','condicionIVAReceptorId','Debe enviar la condición IVA del receptor a ARCA');
mustNot('functions/facturacionIntegralApiV83.js','const PTO=9','El backend activo no debe usar PV 00009');

must('functions/facturaDrive2026.js','LOGO_URL','El PDF debe incluir logo TIZ');
must('functions/facturaDrive2026.js','receptorIva','El PDF debe imprimir condición IVA del cliente');
must('functions/facturaDrive2026.js','Facturación parcial','El PDF debe informar facturación parcial/saldo');
must('functions/facturacionRecuperarV86.js','PTO_DEFAULT=3','Recuperación debe usar PV 00003 por defecto');
must('functions/facturacionDriveRetryV83.js','facturasArca:all','Retry Drive debe actualizar historial de facturas');

// Contratos de cálculo fiscal.
const core=require(path.join(root,'functions/arcaFiscalCoreV83.js'));
let s=core.saldoFiscal(1137499,[]);assert.strictEqual(s.saldo,1137499);
s=core.saldoFiscal(1137499,[{familia:'factura',neto:568749.5}]);assert.strictEqual(s.emitido,568749.5);assert.strictEqual(s.saldo,568749.5);
s=core.saldoFiscal(1137499,[{familia:'factura',neto:568749.5},{familia:'factura',neto:568749.5}]);assert.strictEqual(s.saldo,0);
s=core.saldoFiscal(1000,[{familia:'factura',neto:500},{familia:'credito',neto:100}]);assert.strictEqual(s.emitido,400);assert.strictEqual(s.saldo,600);

// Contrato de fuente canónica: una misma FC repetida en varias estructuras no se duplica
// y conserva el vínculo de Drive más completo.
global.window={DB:{
  clientes:[{id:'c1',nombre:'Ferna Hnos',cuit:'30715027573',diasPago:30}],
  presupuestos:[
    {id:'p1',nro:'4711',estado:'Aprobado',importe:1000,clienteId:'c1',cliente:'Ferna Hnos'},
    {id:'p2',nro:'4712',estado:'Aprobado',importe:500,clienteId:'c1',cliente:'Ferna Hnos'}
  ],
  obras:[{
    id:'o1',ot:'4711',clienteId:'c1',cliente:'Ferna Hnos',finanzas:{total:1000,diasPago:30},
    facturasArca:[{ptoVta:3,cbteTipo:1,cbteNro:150,numeroCompleto:'00003-00000150',cae:'CAE150',neto:500,iva:105,total:605,fecha:'2026-09-17'}],
    comprobantesArca:[{ptoVta:3,cbteTipo:1,cbteNro:150,numeroCompleto:'00003-00000150',cae:'CAE150',neto:500,iva:105,total:605,fecha:'2026-09-17'}],
    facturaArca:{ptoVta:3,cbteTipo:1,cbteNro:150,numeroCompleto:'00003-00000150',cae:'CAE150',neto:500,iva:105,total:605,fecha:'2026-09-17',driveWebViewLink:'https://drive.example/fc150'},
    cobros:[{id:'cob1',fecha:'2026-09-18',importe:100,retenciones:5}]
  }],cobranzas:[]
}};
require(path.join(root,'facturacionCobranzasDataV1.js'));
let built=global.window.TIZFacturacionCobranzasDataV1.build();
let w=built.workItems.find(x=>x.ot==='4711');
assert(w,'Debe existir OT 4711');
assert.strictEqual(w.invoices.length,1,'Una factura representada varias veces debe fusionarse');
assert.strictEqual(w.invoices[0].driveUrl,'https://drive.example/fc150','La fusión debe conservar el link de Drive');
assert.strictEqual(w.facturadoNeto,500);assert.strictEqual(w.porFacturar,500);
assert.strictEqual(w.porCobrar,500,'605 total - 100 cobrado - 5 retención = 500');
const sinFactura=built.workItems.find(x=>x.ot==='4712');assert(sinFactura&&sinFactura.cobranzaEstado==='sin_factura','Una OT sin factura no debe considerarse cuenta a cobrar');

console.log('Facturacion Contract V89: OK');
