'use strict';
// Offline contract tests: synthetic credentials, no network, no real certificate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../functions/arcaPadronA5V125.js'), 'utf8');
function load(responseXml, httpStatus = 200) {
  const calls = [];
  const context = {
    module: { exports: {} },
    console: { error() {} },
    require(name) {
      if (name === 'firebase-admin') return { apps: [{}] };
      if (name === 'node-forge') return {};
      if (name === 'firebase-functions/v2/https') return { onRequest: (options, handler) => handler };
      if (name === 'firebase-functions/params') return { defineSecret: name => ({ value() {
        assert.equal(name, 'ARCA_ISSUER_CUIT');
        return '30000000007'; // Synthetic test identifier, never submitted.
      } }) };
      throw new Error('Unexpected dependency: ' + name);
    },
    async fetch(url, options) {
      calls.push({ url, ...options });
      return { ok: httpStatus === 200, status: httpStatus, text: async () => responseXml };
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, calls };
}
const success = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
<ns2:getPersona_v2Response xmlns:ns2="http://a5.soap.ws.server.puc.sr/"><personaReturn>
<datosGenerales><razonSocial>CLIENTE &amp; PRUEBA</razonSocial><estadoClave>ACTIVO</estadoClave>
<domicilioFiscal><direccion>CALLE 123</direccion><localidad>LOCALIDAD</localidad><codPostal>1000</codPostal><descripcionProvincia>PROVINCIA</descripcionProvincia></domicilioFiscal>
<caracterizacion><fechaSolicitud>20260220</fechaSolicitud></caracterizacion></datosGenerales>
</personaReturn></ns2:getPersona_v2Response></soap:Body></soap:Envelope>`;
test('WSAA requests the new service; SOAP request matches WSCI v4.1', async () => {
  const { context, calls } = load(success);
  assert.match(context.tra(), /<service>ws_sr_constancia_inscripcion<\/service>/);
  const out = await context.getPersona('30000000007', { token: 'synthetic<&', sign: 'synthetic-sign' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://aws.arca.gob.ar/sr-padron/webservices/personaServiceA5');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.SOAPAction, '');
  assert.match(calls[0].body, /xmlns:a5="http:\/\/a5.soap.ws.server.puc.sr\/"/);
  assert.match(calls[0].body, /<a5:getPersona_v2><token>synthetic&lt;&amp;<\/token><sign>synthetic-sign<\/sign><cuitRepresentada>30000000007<\/cuitRepresentada><idPersona>30000000007<\/idPersona><\/a5:getPersona_v2>/);
  assert.equal(out.razonSocial, 'CLIENTE & PRUEBA');
  assert.equal(out.domicilioFiscal, 'CALLE 123, LOCALIDAD, CP 1000, PROVINCIA');
});
test('ARCA business error is preserved as 422', async () => {
  const { context } = load('<personaReturn><errorConstancia><error>CUIT inexistente</error></errorConstancia></personaReturn>');
  await assert.rejects(context.getPersona('30000000007', {}), e => e.status === 422 && /CUIT inexistente/.test(e.message));
});
test('SOAP faults are not reported as successful lookups', async () => {
  const { context } = load('<soap:Fault><faultstring>Computador no autorizado</faultstring></soap:Fault>', 500);
  await assert.rejects(context.getPersona('30000000007', {}), /Computador no autorizado/);
});
test('missing fiscal address cannot be persisted as a successful result', async () => {
  const { context } = load('<personaReturn><datosGenerales><razonSocial>PRUEBA</razonSocial></datosGenerales></personaReturn>');
  await assert.rejects(context.getPersona('30000000007', {}), e => e.status === 422);
});
test('unauthenticated request stops before network or database access', async () => {
  const { context, calls } = load(success);
  let status, payload;
  const res = { set() {}, status(value) { status = value; return this; }, json(value) { payload = value; } };
  await context.module.exports.arcaPadronConsultarV125({ method: 'POST', get: () => '', body: { cuit: '30000000007' } }, res);
  assert.equal(status, 401);
  assert.equal(payload.ok, false);
  assert.equal(calls.length, 0);
});
