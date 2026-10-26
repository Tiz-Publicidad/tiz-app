'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const core=require('../functions/facturabilidadV1');
function app(flag){
 const o={id:'o',ot:'4800',cliente:'Cliente',neto:1000,...(flag===undefined?{}:{noFacturable:flag})};
 const p={id:'p',obraId:'o',nro:'4800',cliente:'Cliente',estado:'Aprobado',importe:1000,...(flag===undefined?{}:{noFacturable:flag})};
 const window={DB:{obras:[o],presupuestos:[p],clientes:[]},currentUser:{isAdmin:true},TIZCobranzaSemanalV127:require('../cobranzasSemanalV127'),updateDoc_:async()=>{}};
 const ctx={window,console,Date,Intl};
 for(const f of ['facturacionCobranzasDataV2.js','facturacionCobranzasActionsV2.js','facturacionBaseMadreReconcileV2.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),ctx);
 return {window,o,p,work:()=>window.TIZFacturacionCobranzasDataV2.build().workItems[0],actions:window.TIZFactCobActionsV2};
}
test('los registros sin campo siguen facturables y cobrar efectivo no los reclasifica',async()=>{
 const x=app();await x.actions.registrarCobro('o',{fecha:'2026-10-01',base:'cotizacion',importe:100,medio:'Efectivo'});
 assert.equal(x.work().noFacturable,false);assert.equal(x.work().porFacturar,1000);assert.equal(x.work().facturadoNeto,0);
});
test('No facturable sale de pendientes de factura y conserva deuda hasta registrar el pago real',async()=>{
 const x=app(true);assert.equal(x.work().porFacturar,0);assert.equal(x.work().porCobrar,1000);assert.equal(x.work().invoices.length,0);
 await x.actions.registrarCobro('o',{fecha:'2026-10-01',importe:250,medio:'Efectivo'});
 assert.equal(x.work().porCobrar,750);assert.equal(x.work().estadoOperativo,'cobrado_pendiente');assert.equal(x.work().facturadoTotal,0);
 await x.actions.cambiarEstadoGestion('o','cobrado',{fechaPago:'2026-10-02',importeEsperado:750});
 assert.equal(x.work().porCobrar,0);assert.equal(x.work().cobrado,1000);assert.equal(x.work().facturadoNeto,0);assert.equal(x.o.cobros[1].base,'cotizacion');
});
test('no permite emitir ni cargar FC manual mientras está marcada No facturable',async()=>{
 const x=app(true);assert.throws(()=>x.actions.emitirArca('o'),/No facturable/);await assert.rejects(x.actions.registrarFacturaManual('o',{}),/No facturable/);
});
test('un marcador contradictorio nunca oculta facturas ya registradas',()=>{
 const x=app(true);x.o.facturasBaseMadre=[{numeroCompleto:'1234',neto:100,total:121}];assert.equal(x.work().noFacturable,false);assert.equal(x.work().invoices.length,1);assert.equal(x.work().porCobrar,121);assert.throws(()=>core.assertNoInvoices(x.o),/comprobantes/);
});
test('N/A se concilia como condición y no como factura o cobro automático',async()=>{
 const x=app(true),row=Array(26).fill('');Object.assign(row,{2:'4800',3:'Cartel',5:'Cliente',6:1000,18:'N/A',24:'Pendiente'});
 x.window.leerFacturacionBaseMadreTIZV123=async()=>({rows:[row],firstRow:3});
 const report=await x.window.TIZFactBaseMadreV2.audit();assert.equal(report.items[0].tipo,'ok');assert.equal(report.items[0].safeImport,false);assert.equal(x.work().invoices.length,0);assert.equal(x.work().cobrado,0);
 x.o.noFacturable=false;x.p.noFacturable=false;const conflict=await x.window.TIZFactBaseMadreV2.audit();assert.equal(conflict.items[0].tipo,'ambiguo');assert.equal(conflict.items[0].safeImport,false);
});
test('no borrar N/A histórico sin decisión explícita y no pisar ninguna fórmula',()=>{
 const row=Array(25).fill('');row[18]='N/A';assert.deepEqual(core.markerData('Base de datos',3,undefined,row),[]);assert.equal(core.markerData('Base de datos',3,false,row)[0].values[0][0],'');row[18]='=A1';assert.throws(()=>core.markerData('Base de datos',3,true,row),/fórmula/);
});
test('la pantalla de cobros incluye la obra sin alertas de envío o PDF; Por facturar la excluye',()=>{
 const x=app(true),source=fs.readFileSync(path.join(__dirname,'../facturacionCobranzasUIV2.js'),'utf8').replace('window.TIZFactCobUIV2={render,','window.testViews={cobrar,facturar};window.TIZFactCobUIV2={render,');
 vm.runInNewContext(source,{window:x.window,console,Date,Intl,setTimeout(){},document:{readyState:'loading',addEventListener(){}}});
 const d=x.window.TIZFacturacionCobranzasDataV2.build(),html=x.window.testViews.cobrar(d);
 assert.match(html,/4800/);assert.match(html,/No facturable/);assert.doesNotMatch(html,/Falta enviar|Sin PDF/);assert.doesNotMatch(x.window.testViews.facturar(d),/<b>4800<\/b>/);
});
