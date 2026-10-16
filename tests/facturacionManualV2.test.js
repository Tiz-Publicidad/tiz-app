const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
function app(obra) {
  const writes = [];
  const window = { DB: { obras: [obra], clientes: [], presupuestos: [] }, currentUser: { isAdmin: true, email: 'admin@test.local' }, updateDoc_: async (...args) => writes.push(args) };
  const ctx = vm.createContext({ window, console, Date, Intl, setTimeout });
  for (const file of ['facturacionCobranzasDataV2.js', 'facturacionCobranzasActionsV2.js'])
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx);
  return { window, writes };
}
const obra = () => ({ id: 'ot-1', ot: '4731', cliente: 'Cliente', finanzas: { total: 1000 } });
const fc = { cbteTipo: 1, numeroCompleto: '00003-00000007', fecha: '2026-09-28', cae: '12345678901234', neto: 100, iva: 21, total: 121 };
test('FC PV 0003 guarda identidad fiscal y alimenta saldo y cobranza', async () => {
  const o = obra(), { window, writes } = app(o);
  await window.TIZFactCobActionsV2.registrarFacturaManual(o.id, fc);
  assert.equal(writes.length, 1);
  assert.equal(o.facturasManual[0].ptoVta, 3);
  assert.equal(o.facturasManual[0].cbteNro, 7);
  const w = window.TIZFacturacionCobranzasDataV2.build().workItems[0];
  assert.equal(w.invoices.length, 1);
  assert.equal(w.invoices[0].origen, 'manual');
  assert.equal(w.facturadoNeto, 100);
  assert.equal(w.porFacturar, 900);
  assert.equal(w.porCobrar, 121);
});
test('mismo número en otro punto de venta no se confunde', async () => {
  const o = obra(); o.comprobantesArca = [{ cbteTipo: 1, ptoVta: 9, cbteNro: 7, numeroCompleto: '00009-00000007', cae: '98765432109876', familia:'factura', neto:100, iva:21, total:121 }];
  const { window } = app(o);
  await window.TIZFactCobActionsV2.registrarFacturaManual(o.id, fc);
  assert.equal(window.TIZFacturacionCobranzasDataV2.build().workItems[0].invoices.length, 2);
  await assert.rejects(window.TIZFactCobActionsV2.registrarFacturaManual(o.id, fc), /registrado/);
});
test('bloquea discrepancia de total y exceso de saldo', async () => {
  const o = obra(), { window } = app(o);
  await assert.rejects(window.TIZFactCobActionsV2.registrarFacturaManual(o.id, {...fc,total:122}), /neto \+ IVA/);
  await assert.rejects(window.TIZFactCobActionsV2.registrarFacturaManual(o.id, {...fc,neto:1200,iva:252,total:1452}), /saldo por facturar/);
  assert.equal(o.facturasManual, undefined);
});
test('la NC A puede asociar una factura A del PV 0003', () => {
  const { validateAssociated } = require('../functions/arcaFiscalCoreV83');
  const original = validateAssociated(3, { cbteTipo: 1, ptoVta: 3, cbteNro: 7 });
  assert.equal(original.ptoVta, 3);
  assert.equal(original.cbteNro, 7);
  assert.throws(() => validateAssociated(8, original), /letra/);
});
test('una NC pendiente de PDF no hereda el enlace de la factura original', () => {
  const o = obra();
  const factura = { cbteTipo: 1, ptoVta: 9, cbteNro: 3, numeroCompleto: '00009-00000003', cae: '86372908357849', familia: 'factura', neto: 2365500, iva: 496755, total: 2862255, driveWebViewLink: 'https://drive.google.com/file/d/factura/view' };
  const nc = { cbteTipo: 3, ptoVta: 9, cbteNro: 1, numeroCompleto: '00009-00000001', cae: '12345678901234', familia: 'credito', neto: 2365500, iva: 496755, total: 2862255, drivePendiente: true, asociado: { cbteTipo: 1, ptoVta: 9, cbteNro: 3 } };
  Object.assign(o, { comprobantesArca: [factura, nc], facturaArca: nc, nrfc: nc.numeroCompleto, facturaDriveWebViewLink: factura.driveWebViewLink });
  const { window } = app(o);
  const invoices = window.TIZFacturacionCobranzasDataV2.build().workItems[0].invoices;
  assert.equal(invoices.length, 2);
  assert.equal(invoices.find(x => x.cbteTipo === 3).driveUrl, '');
  assert.equal(invoices.find(x => x.cbteTipo === 3).drivePendiente, true);
  assert.equal(invoices.find(x => x.cbteTipo === 1).driveUrl, factura.driveWebViewLink);
});
test('NC total conserva comprobantes y devuelve la OT a Por facturar sin deuda', () => {
  const o = obra(); o.finanzas.total = 2365500;
  const factura = { cbteTipo: 1, ptoVta: 9, cbteNro: 3, numeroCompleto: '00009-00000003', cae: '86372908357849', familia: 'factura', neto: 2365500, iva: 496755, total: 2862255 };
  const nc = { cbteTipo: 3, ptoVta: 9, cbteNro: 1, numeroCompleto: '00009-00000001', cae: '86395270445997', familia: 'credito', neto: 2365500, iva: 496755, total: 2862255, asociado: { cbteTipo: 1, ptoVta: 9, cbteNro: 3 } };
  Object.assign(o, { comprobantesArca: [factura, nc], facturaArca: nc, facturasManual: [{ numeroCompleto: '3.0', neto: 2365500, iva: 0 }], nrfc: nc.numeroCompleto });
  const { window } = app(o);
  const w = window.TIZFacturacionCobranzasDataV2.build().workItems[0];
  assert.equal(w.invoices.length, 2);
  assert.equal(w.anuladaConNC, true);
  assert.equal(w.invoices.find(i => i.cbteTipo === 1).anuladaPor, nc.numeroCompleto);
  assert.equal(w.invoices.find(i => i.cbteTipo === 3).anulaFactura, factura.numeroCompleto);
  assert.equal(w.porCobrar, 0);
  assert.equal(w.porFacturar, 2365500);
  assert.equal(w.facturadoNeto, 0);
  assert.equal(w.facturadoPct, 0);
  assert.equal(w.tramos.length, 0);
  assert.equal(w.estadoOperativo, 'pendiente_facturacion');
  assert.equal(w.cobranzaEstado, 'anulado');
});
test('NC parcial conserva el saldo abierto', () => {
  const o = obra();
  o.comprobantesArca = [
    { cbteTipo: 1, ptoVta: 9, cbteNro: 3, numeroCompleto: '00009-00000003', cae: '12345678901234', familia: 'factura', neto: 1000, iva: 210, total: 1210 },
    { cbteTipo: 3, ptoVta: 9, cbteNro: 1, numeroCompleto: '00009-00000001', cae: '98765432109876', familia: 'credito', neto: 500, iva: 105, total: 605, asociado: { cbteTipo: 1, ptoVta: 9, cbteNro: 3 } },
  ];
  const w = app(o).window.TIZFacturacionCobranzasDataV2.build().workItems[0];
  assert.equal(w.anuladaConNC, false);
  assert.equal(w.porCobrar, 605);
  assert.equal(w.porFacturar, 500);
  assert.notEqual(w.estadoOperativo, 'historico');
});

function acreditada() {
  const o = obra(); o.ot = '4775'; o.finanzas.total = 30000;
  const factura = { cbteTipo: 1, ptoVta: 9, cbteNro: 19, numeroCompleto: '00009-00000019', cae: '11111111111111', familia: 'factura', neto: 30000, iva: 6300, total: 36300 };
  const nc = { cbteTipo: 3, ptoVta: 9, cbteNro: 8, numeroCompleto: '00009-00000008', cae: '22222222222222', familia: 'credito', neto: 30000, iva: 6300, total: 36300, asociado: { cbteTipo: 1, ptoVta: 9, cbteNro: 19 } };
  return Object.assign(o, { comprobantesArca: [factura, nc], facturaArca: nc, nrfc: nc.numeroCompleto });
}
test('refacturación después de NC conserva la pareja original sin duplicar la OT', () => {
  const o = acreditada();
  o.comprobantesArca.push({ cbteTipo: 1, ptoVta: 9, cbteNro: 20, numeroCompleto: '00009-00000020', cae: '33333333333333', familia: 'factura', neto: 30000, iva: 6300, total: 36300 });
  const d = app(o).window.TIZFacturacionCobranzasDataV2.build(), w = d.workItems[0];
  assert.equal(d.workItems.length, 1);
  assert.equal(w.invoices.length, 3);
  assert.equal(w.anuladaConNC, false);
  assert.equal(w.facturadoNeto, 30000);
  assert.equal(w.facturadoPct, 100);
  assert.equal(w.porFacturar, 0);
  assert.equal(w.porCobrar, 36300);
  assert.equal(w.tramos.length, 1);
  assert.equal(w.tramos[0].numero, '00009-00000020');
});
test('NC no reabre una OT cerrada explícitamente por el operador', () => {
  const o = acreditada(); o.historicoCerrado = true; o.cobranzaEstadoManual = 'cobrado';
  const w = app(o).window.TIZFacturacionCobranzasDataV2.build().workItems[0];
  assert.equal(w.porFacturar, 0);
  assert.equal(w.estadoOperativo, 'historico');
  assert.equal(o.historicoCerrado, true);
});
test('es posible registrar una factura de reemplazo tras NC total', async () => {
  const o = acreditada(), { window, writes } = app(o);
  await window.TIZFactCobActionsV2.registrarFacturaManual(o.id, { ...fc, neto: 30000, iva: 6300, total: 36300 });
  const w = window.TIZFacturacionCobranzasDataV2.build().workItems[0];
  assert.equal(writes.length, 1);
  assert.equal(w.invoices.length, 3);
  assert.equal(w.porFacturar, 0);
  assert.equal(w.porCobrar, 36300);
});
