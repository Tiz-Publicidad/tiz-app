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
