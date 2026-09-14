"use strict";

const TYPES={
  1:{nombre:"Factura A",familia:"factura",letra:"A"},
  2:{nombre:"Nota de Débito A",familia:"debito",letra:"A",asociado:true},
  3:{nombre:"Nota de Crédito A",familia:"credito",letra:"A",asociado:true},
  6:{nombre:"Factura B",familia:"factura",letra:"B"},
  7:{nombre:"Nota de Débito B",familia:"debito",letra:"B",asociado:true},
  8:{nombre:"Nota de Crédito B",familia:"credito",letra:"B",asociado:true},
  201:{nombre:"Factura de Crédito Electrónica A",familia:"factura",letra:"A",fce:true},
  202:{nombre:"Nota de Débito FCE A",familia:"debito",letra:"A",fce:true,asociado:true},
  203:{nombre:"Nota de Crédito FCE A",familia:"credito",letra:"A",fce:true,asociado:true},
  206:{nombre:"Factura de Crédito Electrónica B",familia:"factura",letra:"B",fce:true},
  207:{nombre:"Nota de Débito FCE B",familia:"debito",letra:"B",fce:true,asociado:true},
  208:{nombre:"Nota de Crédito FCE B",familia:"credito",letra:"B",fce:true,asociado:true}
};
const IVA={"21":[5,21],"10.5":[4,10.5],"27":[6,27],"5":[8,5],"2.5":[9,2.5],"0":[3,0]};
const round2=v=>Math.round((Number(v)||0)*100)/100;
function validateType(cbteTipo){const cfg=TYPES[Number(cbteTipo)];if(!cfg)throw Object.assign(new Error("Tipo de comprobante no habilitado"),{status:400});return cfg;}
function validateAssociated(cbteTipo,asoc){const cfg=validateType(cbteTipo);if(!cfg.asociado)return null;if(!asoc||!Number(asoc.cbteTipo)||!Number(asoc.ptoVta)||!Number(asoc.cbteNro))throw Object.assign(new Error("Las notas de crédito/débito requieren comprobante asociado"),{status:400});const original=TYPES[Number(asoc.cbteTipo)];if(!original)throw Object.assign(new Error("Tipo de comprobante asociado inválido"),{status:400});if(cfg.letra!==original.letra)throw Object.assign(new Error("La nota debe mantener la letra del comprobante original"),{status:400});if(cfg.fce&&!original.fce)throw Object.assign(new Error("Una NC/ND FCE debe asociarse a un comprobante FCE"),{status:400});return {cbteTipo:Number(asoc.cbteTipo),ptoVta:Number(asoc.ptoVta),cbteNro:Number(asoc.cbteNro),numeroCompleto:String(asoc.numeroCompleto||"")};}
function ivaConfig(value,exento=false){if(exento)return null;const row=IVA[String(Number(value))];if(!row)throw Object.assign(new Error("Alícuota IVA no soportada"),{status:400});return {id:row[0],pct:row[1]};}
function saldoFiscal(presupuesto,comprobantes=[]){const emitido=round2(comprobantes.reduce((s,c)=>s+(c.familia==="credito"?-round2(c.neto):round2(c.neto)),0));return {presupuesto:round2(presupuesto),emitido,saldo:round2(presupuesto-emitido)};}
module.exports={TYPES,IVA,round2,validateType,validateAssociated,ivaConfig,saldoFiscal};
