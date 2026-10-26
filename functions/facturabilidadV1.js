'use strict';
const text=v=>String(v??'').trim();
const isNA=v=>/^n\s*\/\s*a$/i.test(text(v));
function hasInvoices(o={}) {
  const all=[...(o.facturasBaseMadre||[]),...(o.facturasManual||[]),...(o.facturasArca||[]),...(o.comprobantesArca||[]),o.facturaArca,o.finanzas?.anticipo,o.finanzas?.saldo,o.gestionSectores?.facturacion,o.sectores?.facturacion].filter(Boolean);
  return (!!text(o.nrfc)&&!isNA(o.nrfc))||all.some(x=>x.cae||x.facturado||x.cbteNro||[x.numeroCompleto,x.nroFactura,x.numero].some(v=>text(v)&&!isNA(v)));
}
function assertNoInvoices(o) {
  if(hasInvoices(o))throw Object.assign(new Error('La obra ya tiene comprobantes registrados. No se puede marcar No facturable.'),{status:409});
}
// Only the invoice-number cell is changed. Dates, formulas and receipts survive.
function markerData(sheet,row,noFacturable,current=[]) {
  const cell=text(current[18]);
  if(noFacturable===true&&cell&&!isNA(cell))throw Object.assign(new Error('La celda Nro FC tiene una factura o fórmula. No se reemplazó por N/A.'),{status:409});
  if(noFacturable===true&&!isNA(cell))return [{range:`'${sheet}'!S${row}`,values:[['N/A']]}];
  if(noFacturable===false&&isNA(cell))return [{range:`'${sheet}'!S${row}`,values:[['']]}];
  return [];
}
module.exports={isNA,hasInvoices,assertNoInvoices,markerData};
