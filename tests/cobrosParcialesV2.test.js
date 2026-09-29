const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function app(invoice = false) {
  const obra = { id: 'ot-1', ot: '4731', cliente: 'Cliente', finanzas: { total: 1000 } };
  if (invoice) obra.facturasManual = [{ cbteTipo: 1, ptoVta: 3, cbteNro: 7, numeroCompleto: '00003-00000007', neto: 1000, iva: 210, total: 1210 }];
  const window = { DB: { obras: [obra], clientes: [], presupuestos: [{ id: 'pres-1', nro: '4731', estado: 'Aprobado', importe: 1000 }] }, currentUser: { isAdmin: true, email: 'admin@test.local' }, updateDoc_: async () => {} };
  const ctx = vm.createContext({ window, console, Date, Intl, setTimeout });
  for (const file of ['facturacionCobranzasDataV2.js', 'facturacionCobranzasActionsV2.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx);
  return { obra, actions: window.TIZFactCobActionsV2, data: window.TIZFacturacionCobranzasDataV2 };
}

test('permite anticipo parcial antes de facturar y descuenta cuatro retenciones', async () => {
  const { obra, actions, data } = app();
  await actions.registrarCobro(obra.id, { base: 'cotizacion', modo: 'porcentaje', porcentaje: 25, importe: 200,
    retencionesDetalle: { iva: 10, ingresosBrutos: 15, ganancias: 20, suss: 5 } });
  const w = data.build().workItems[0];
  assert.equal(w.cobrado, 200);
  assert.equal(w.retenciones, 50);
  assert.equal(w.payments[0].retencionesDetalle.ingresosBrutos, 15);
  assert.equal(w.importeAprobado - w.cobrado - w.retenciones, 750);
  await assert.rejects(actions.registrarCobro(obra.id, { base: 'cotizacion', importe: 751 }), /supera el saldo/);
});

test('aplica pago y retenciones a saldo facturado y evita duplicados legítimos', async () => {
  const { obra, actions, data } = app(true);
  const payment = { base: 'facturado', importe: 200, retencionesDetalle: { iva: 10, ingresosBrutos: 5, ganancias: 3, suss: 2 } };
  await actions.registrarCobro(obra.id, payment);
  await actions.registrarCobro(obra.id, payment);
  const w = data.build().workItems[0];
  assert.equal(w.payments.length, 2);
  assert.equal(w.porCobrar, 770);
  await assert.rejects(actions.registrarCobro(obra.id, { base: 'facturado', importe: 771 }), /supera el saldo/);
  await assert.rejects(actions.registrarCobro(obra.id, { base: 'facturado', importe: 1, retencionesDetalle: { iva: -1 } }), /retención de IVA/);
});
