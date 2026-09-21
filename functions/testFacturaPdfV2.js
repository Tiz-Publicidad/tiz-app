"use strict";
const assert=require("assert");
const {pdfBuffer}=require("./facturaDrive2026");
(async()=>{
 const obra={ot:"9999",cliente:"Cliente Prueba",desc:"Prueba PDF TIZ"};
 const base={tipo:"Factura A",letra:"A",cbteTipo:1,ptoVta:9,cbteNro:999,numeroCompleto:"00009-00000999",fecha:"2026-09-21",cae:"12345678901234",caeVto:"20260930",cliente:"Cliente Prueba",cuit:"30700000001",neto:1000,iva:210,total:1210,alicuota:21,items:[{descripcion:"Servicio de prueba",cantidad:1,unitario:1000}],fechaPrevistaCobro:"2026-10-21"};
 for(const id of [1,4,5,6]){
   const b=await pdfBuffer({...base,condicionIVAReceptorId:id},obra,"30710787588");
   assert.ok(Buffer.isBuffer(b));
   assert.ok(b.length>5000);
   assert.equal(b.slice(0,4).toString(),"%PDF");
 }
 console.log("Fiscal PDF V2: OK");
})().catch(e=>{console.error(e);process.exit(1)});
