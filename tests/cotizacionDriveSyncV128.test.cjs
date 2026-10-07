const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(response) {
  const updates = [], requests = [];
  const saved = {id:'mazalosa',nro:'4767',revision:'1.1',cliente:'Mazalosa',desc:'Marquesina',items:[{desc:'Marquesina',precio:3000000,cant:1},{desc:'Colocación',precio:500000,cant:1}]};
  const window = {
    TIZ_DRIVE_OT_WEBHOOK:'https://example.test/exec',
    DB:{presupuestos:[{...saved,items:[{desc:'Precio viejo',precio:1,cant:1}]}]},
    guardarPresupuestoCompleto:async () => saved,
    updateDoc_:async (...args) => updates.push(args), addEventListener() {}, showToast() {}
  };
  const document = {
    createElement:() => ({remove(){}}),
    head:{appendChild(script){const url=new URL(script.src);requests.push(JSON.parse(url.searchParams.get('payload')));queueMicrotask(()=>window[url.searchParams.get('callback')](response));}}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../cotizacionDriveSyncV128.js'),'utf8'), {window,document,URLSearchParams,setTimeout,clearTimeout,setInterval:()=>0,clearInterval,console});
  return {window,updates,requests,saved};
}
const success = {ok:true,cotizacionPdfUrl:'https://drive.google.com/pdf',cotizacionExcelUrl:'https://drive.google.com/excel'};
test('exporta los precios recién guardados aunque el snapshot de Firebase conserve los anteriores', async () => {
  const c=setup(success);await c.window.guardarPresupuestoCompleto();
  assert.equal(c.requests[0].total,3500000);assert.equal(c.requests[0].items[0].unitario,3000000);
  assert.equal(c.updates[0][2].cotizacionDriveEstado,'actualizado');
});
test('una validación fallida no regenera el presupuesto anterior', async () => {
  const c=setup(success);c.window.guardarPresupuestoCompleto=async()=>undefined;c.window.tizCommercialDriveV128.install();
  await c.window.guardarPresupuestoCompleto();assert.equal(c.requests.length,0);
});
for (const response of [{ok:true,skipped:true,reason:'Omitido'},{ok:true,cotizacionPdfUrl:'pdf'},{ok:false,error:'Sin permiso'}]) {
  test('respuestas incompletas o rechazadas dejan Drive pendiente: '+JSON.stringify(response), async () => {
    const c=setup(response);await assert.rejects(c.window.generarArchivosCotizacionV65(c.saved));
    assert.equal(c.updates[0][2].cotizacionDriveEstado,'pendiente');assert.equal(c.updates[0][2].cotizacionPdfUrl,undefined);
  });
}
test('doble solicitud idéntica genera un solo par de archivos', async () => {
  const c=setup(success);await Promise.all([c.window.generarArchivosCotizacionV65(c.saved),c.window.generarArchivosCotizacionV65(c.saved)]);
  assert.equal(c.requests.length,1);
});
