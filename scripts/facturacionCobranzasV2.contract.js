'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('facturacionCobranzasDataV2.js','utf8');

function build(db){
  const context={window:{DB:db},console};
  vm.createContext(context);
  vm.runInContext(src,context,{filename:'facturacionCobranzasDataV2.js'});
  return context.window.TIZFacturacionCobranzasDataV2.build();
}
function budget(ot,total,cliente='Cliente'){return{id:'p'+ot,nro:String(ot),revision:'1.1',estado:'Aprobado',cliente,desc:'Trabajo '+ot,importe:total,items:[{desc:'Item',cant:1,precio:total}]}}
function obra(ot,total,extra={}){return{id:'o'+ot,ot:String(ot),cliente:'Cliente',desc:'Trabajo '+ot,neto:total,importe:total,finanzas:{total,...(extra.finanzas||{})},...extra}}

const clients=[{id:'c1',nombre:'Cliente',cuit:'30700000001',diasPago:30,condicionIvaId:1}];

// 100% sin facturar
let d=build({clientes:clients,presupuestos:[budget(5001,1000)],obras:[obra(5001,1000)],cobranzas:[]});
let w=d.workItems[0];
assert.equal(w.porFacturar,1000);
assert.equal(w.facturadoNeto,0);
assert.equal(w.porCobrar,0);
assert.equal(w.cobranzaEstado,'sin_factura');

// 50% emitido => 50% pendiente; Por cobrar sólo lo emitido.
d=build({clientes:clients,presupuestos:[budget(5002,1000)],obras:[obra(5002,1000,{facturasArca:[{cae:'1',ptoVta:9,cbteNro:10,numeroCompleto:'00009-00000010',fecha:'2026-09-20',neto:500,iva:105,total:605,porcentaje:50}]})],cobranzas:[]});
w=d.workItems[0];
assert.equal(w.facturadoNeto,500);
assert.equal(w.porFacturar,500);
assert.equal(w.facturadoPct,50);
assert.equal(w.porCobrar,605);

// 30 + 20 + 50 = completo sin duplicar OT.
d=build({clientes:clients,presupuestos:[budget(5003,1000)],obras:[obra(5003,1000,{facturasArca:[
 {cae:'a',ptoVta:9,cbteNro:11,numeroCompleto:'00009-00000011',neto:300,iva:63,total:363,porcentaje:30},
 {cae:'b',ptoVta:9,cbteNro:12,numeroCompleto:'00009-00000012',neto:200,iva:42,total:242,porcentaje:20},
 {cae:'c',ptoVta:9,cbteNro:13,numeroCompleto:'00009-00000013',neto:500,iva:105,total:605,porcentaje:50}
]})],cobranzas:[]});
assert.equal(d.workItems.length,1);
w=d.workItems[0];
assert.equal(w.facturadoNeto,1000);
assert.equal(w.porFacturar,0);
assert.equal(w.invoices.length,3);

// Cobro parcial + retención reduce por cobrar, no facturado.
d=build({clientes:clients,presupuestos:[budget(5004,1000)],obras:[obra(5004,1000,{facturasArca:[{cae:'z',ptoVta:9,cbteNro:14,numeroCompleto:'00009-00000014',neto:1000,iva:210,total:1210}],cobros:[{fecha:'2026-09-21',importe:500,retenciones:110}]})],cobranzas:[]});
w=d.workItems[0];
assert.equal(w.facturadoNeto,1000);
assert.equal(w.porFacturar,0);
assert.equal(w.cobrado,500);
assert.equal(w.retenciones,110);
assert.equal(w.porCobrar,600);
assert.equal(w.cobranzaEstado,'parcial');

// Dedupe: misma FC presente en facturaArca/facturasArca no se duplica.
d=build({clientes:clients,presupuestos:[budget(5005,1000)],obras:[obra(5005,1000,{facturaArca:{cae:'same',ptoVta:9,cbteNro:15,numeroCompleto:'00009-00000015',neto:500,total:605},facturasArca:[{cae:'same',ptoVta:9,cbteNro:15,numeroCompleto:'00009-00000015',neto:500,total:605}]})],cobranzas:[]});
assert.equal(d.workItems[0].invoices.length,1);
assert.equal(d.workItems[0].porFacturar,500);

// Histórico cerrado desaparece de colas calculadas pero conserva trazabilidad.
d=build({clientes:clients,presupuestos:[budget(5006,1000)],obras:[obra(5006,1000,{historicoCerrado:true,cobranzaEstadoManual:'cobrado',historicoExcel:{estado:'Cobrado'}})],cobranzas:[]});
w=d.workItems[0];
assert.equal(w.porFacturar,0);
assert.equal(w.porCobrar,0);
assert.equal(w.cobranzaEstado,'cobrado');


// Mismo PV/número en tipos distintos no debe colisionar.
d=build({clientes:clients,presupuestos:[budget(5007,1000)],obras:[obra(5007,1000,{facturasArca:[
 {cae:'fa',ptoVta:9,cbteTipo:1,cbteNro:20,numeroCompleto:'00009-00000020',familia:'factura',neto:1000,iva:210,total:1210},
 {cae:'nc',ptoVta:9,cbteTipo:3,cbteNro:20,numeroCompleto:'00009-00000020',familia:'credito',neto:200,iva:42,total:242}
]})],cobranzas:[]});
w=d.workItems[0];
assert.equal(w.invoices.length,2);
assert.equal(w.facturadoNeto,800);
assert.equal(w.facturadoTotal,968);
assert.equal(w.porFacturar,200);
assert.equal(w.porCobrar,968);

// Referencia legacy nrfc sin tipo se fusiona con la única factura tipada compatible.
d=build({clientes:clients,presupuestos:[budget(5008,1000)],obras:[obra(5008,1000,{nrfc:'00009-00000021',ffc:'2026-09-21',facturasArca:[{cae:'typed',ptoVta:9,cbteTipo:1,cbteNro:21,numeroCompleto:'00009-00000021',familia:'factura',neto:1000,iva:210,total:1210}]})],cobranzas:[]});
assert.equal(d.workItems[0].invoices.length,1);
assert.equal(d.workItems[0].facturadoNeto,1000);


// Estados operativos derivados no deben hacer desaparecer comprobantes.
d=build({clientes:clients,presupuestos:[budget(5009,1000)],obras:[obra(5009,1000,{facturasArca:[{cae:'s1',ptoVta:9,cbteTipo:1,cbteNro:30,numeroCompleto:'00009-00000030',familia:'factura',neto:500,iva:105,total:605}]})],cobranzas:[]});
w=d.workItems[0];
assert.equal(w.estadoOperativo,'facturado_parcial');
assert.equal(w.invoices.length,1);

d=build({clientes:clients,presupuestos:[budget(5010,1000)],obras:[obra(5010,1000,{facturasArca:[{cae:'s2',ptoVta:9,cbteTipo:1,cbteNro:31,numeroCompleto:'00009-00000031',familia:'factura',neto:1000,iva:210,total:1210}],cobros:[{importe:400,retenciones:10,fecha:'2026-09-21'}]})],cobranzas:[]});
w=d.workItems[0];
assert.equal(w.estadoOperativo,'cobrado_pendiente');
assert.equal(w.invoices.length,1);

d=build({clientes:clients,presupuestos:[budget(5011,1000)],obras:[obra(5011,1000,{facturasArca:[{cae:'s3',ptoVta:9,cbteTipo:1,cbteNro:32,numeroCompleto:'00009-00000032',familia:'factura',neto:1000,iva:210,total:1210}],cobros:[{importe:1210,fecha:'2026-09-21'}]})],cobranzas:[]});
w=d.workItems[0];
assert.equal(w.estadoOperativo,'cobrado');
assert.equal(w.invoices.length,1);

console.log('Facturacion/Cobranzas V2 contract: OK');
