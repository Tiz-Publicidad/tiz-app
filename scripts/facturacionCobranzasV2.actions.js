'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('facturacionCobranzasActionsV2.js','utf8');

async function boot(workOverride){
  const obra={id:'o1',ot:'5001',cobros:[],facturasManual:[],finanzas:{total:1000}};
  const writes=[];
  const window={
    DB:{obras:[obra]},
    currentUser:{email:'operador@tizpublicidad.com'},
    TIZFacturacionCobranzasDataV2:{build:()=>({workItems:[workOverride||{obraId:'o1',porCobrar:500,porFacturar:400,invoices:[],cobrado:0,retenciones:0,estadoOperativo:'pendiente_facturacion'}]})},
    updateDoc_:async(col,id,patch)=>writes.push({col,id,patch}),
    TIZFactCobUIV2:{render(){}},
    abrirFacturacionGeneralV63:id=>({opened:id})
  };
  const context={window,console,Date,Intl};
  vm.createContext(context);vm.runInContext(src,context,{filename:'facturacionCobranzasActionsV2.js'});
  return{window,obra,writes};
}

(async()=>{
  let x=await boot();
  await x.window.TIZFactCobActionsV2.registrarCobro('o1',{importe:300,retenciones:50,fecha:'2026-09-21'});
  assert.equal(x.obra.cobros.length,1);
  assert.equal(x.obra.cobros[0].importe,300);
  assert.equal(x.obra.cobros[0].retenciones,50);
  assert.equal(x.writes.length,1);

  x=await boot();
  await assert.rejects(()=>x.window.TIZFactCobActionsV2.registrarCobro('o1',{importe:600}),/supera el saldo abierto/);

  x=await boot();
  await x.window.TIZFactCobActionsV2.registrarFacturaManual('o1',{numeroCompleto:'00009-00000100',neto:300,iva:63,total:363});
  assert.equal(x.obra.facturasManual.length,1);
  assert.equal(x.obra.facturasManual[0].neto,300);

  x=await boot();
  await assert.rejects(()=>x.window.TIZFactCobActionsV2.registrarFacturaManual('o1',{numeroCompleto:'00009-00000101',neto:500}),/supera el saldo por facturar/);

  x=await boot();
  await x.window.TIZFactCobActionsV2.guardarEstadoCobranza('o1','cobrado');
  assert.equal(x.obra.historicoCerrado,true);

  x=await boot({obraId:'o1',porCobrar:605,porFacturar:500,invoices:[{numeroCompleto:'00009-00000001'}],cobrado:0,retenciones:0,estadoOperativo:'facturado_parcial'});
  await assert.rejects(()=>x.window.TIZFactCobActionsV2.cambiarEstadoGestion('o1','pendiente_facturacion'),/ya tiene facturas/);

  x=await boot({obraId:'o1',porCobrar:605,porFacturar:0,invoices:[{numeroCompleto:'00009-00000001'}],cobrado:0,retenciones:0,estadoOperativo:'facturado'});
  await assert.rejects(()=>x.window.TIZFactCobActionsV2.cambiarEstadoGestion('o1','cobrado'),/queda saldo por cobrar/);

  x=await boot({obraId:'o1',porCobrar:0,porFacturar:0,invoices:[{numeroCompleto:'00009-00000001'}],cobrado:605,retenciones:0,estadoOperativo:'cobrado'});
  await x.window.TIZFactCobActionsV2.cambiarEstadoGestion('o1','historico',{nota:'Cierre mensual'});
  assert.equal(x.obra.historicoCerrado,true);
  assert.equal(x.obra.historialGestionFactCob.length,1);

  x=await boot();
  const opened=x.window.TIZFactCobActionsV2.emitirArca('o1');
  assert.equal(opened.opened,'o1');

  console.log('Facturacion/Cobranzas V2 actions: OK');
})().catch(e=>{console.error(e);process.exit(1)});
