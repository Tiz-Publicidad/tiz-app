"use strict";

const admin = require("firebase-admin");
const forge = require("node-forge");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const certificatePem = defineSecret("ARCA_CERTIFICATE_PEM");
const privateKeyPem = defineSecret("ARCA_PRIVATE_KEY_PEM");
const issuerCuit = defineSecret("ARCA_ISSUER_CUIT");
const allowedEmails = defineSecret("ARCA_ALLOWED_EMAILS");

const ALLOWED_ORIGINS = new Set(["https://tiz-publicidad.github.io", "http://localhost:5000", "http://127.0.0.1:5000"]);
const WSAA_URL = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";
const WSFE_URL = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";

function cors(req, res) {
  const origin = req.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function escapeXml(value) {
  return String(value).replace(/[<>&'\"]/g, (char) => ({"<":"&lt;", ">":"&gt;", "&":"&amp;", "'":"&apos;", "\"":"&quot;"})[char]);
}
function decodeXml(value = "") {
  return value.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,"\"").replace(/&apos;/g,"'").replace(/&amp;/g,"&");
}
function tag(xml, name) {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}
function pointsOfSale(xml) {
  const nested = [...xml.matchAll(/<(?:\w+:)?PtoVenta(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?PtoVenta>/gi)]
    .map((match) => Number(tag(match[1], "Nro")))
    .filter(Number.isFinite)
    .filter((value) => value > 0);
  const direct = [...xml.matchAll(/<(?:\w+:)?PtoVta(?:\s[^>]*)?>(\d+)<\/(?:\w+:)?PtoVta>/gi)]
    .map((match) => Number(match[1]));
  return [...new Set([...nested, ...direct])].sort((a, b) => a-b);
}
async function requireAdmin(req) {
  const header = req.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw Object.assign(new Error("Falta iniciar sesión"), {status:401});
  const decoded = await admin.auth().verifyIdToken(header.slice(7));
  const email = String(decoded.email || "").toLowerCase();
  const ALLOWED_EMAILS = new Set(allowedEmails.value().split(",").map((value)=>value.trim().toLowerCase()).filter(Boolean));
  if (!ALLOWED_EMAILS.has(email)) throw Object.assign(new Error("Usuario sin permiso para ARCA"), {status:403});
  return {email};
}
function createTra() {
  const now = new Date();
  const generation = new Date(now.getTime()-600000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const expiration = new Date(now.getTime()+600000).toISOString().replace(/\.\d{3}Z$/, "Z");
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now.getTime()/1000)}</uniqueId><generationTime>${generation}</generationTime><expirationTime>${expiration}</expirationTime></header><service>wsfe</service></loginTicketRequest>`;
}
function signCms(xml, certPem, keyPem) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(xml, "utf8");
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);
  p7.addCertificate(cert);
  p7.addSigner({key, certificate:cert, digestAlgorithm:forge.pki.oids.sha256, authenticatedAttributes:[
    {type:forge.pki.oids.contentType, value:forge.pki.oids.data},
    {type:forge.pki.oids.messageDigest},
    {type:forge.pki.oids.signingTime, value:new Date()},
  ]});
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}
async function soap(url, action, body) {
  const response = await fetch(url, {method:"POST", headers:{"Content-Type":"text/xml; charset=utf-8", SOAPAction:action}, body});
  const text = await response.text();
  if (!response.ok) throw new Error(`ARCA respondió HTTP ${response.status}`);
  const fault = tag(text, "faultstring");
  if (fault) throw new Error(fault);
  return text;
}
async function loginWsaa() {
  const cms = signCms(createTra(), certificatePem.value(), privateKeyPem.value());
  const envelope = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><in0>${cms}</in0></loginCms></soapenv:Body></soapenv:Envelope>`;
  const response = await soap(WSAA_URL, "", envelope);
  const result = tag(response, "loginCmsReturn");
  const token = tag(result, "token"), sign = tag(result, "sign"), expirationTime = tag(result, "expirationTime");
  if (!token || !sign) throw new Error("WSAA no devolvió credenciales válidas");
  return {token, sign, expirationTime};
}
async function wsfeCall(method, innerXml, credentials) {
  const auth = `<Auth><Token>${escapeXml(credentials.token)}</Token><Sign>${escapeXml(credentials.sign)}</Sign><Cuit>${escapeXml(issuerCuit.value())}</Cuit></Auth>`;
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${method} xmlns="http://ar.gov.afip.dif.FEV1/">${auth}${innerXml || ""}</${method}></soap:Body></soap:Envelope>`;
  return soap(WSFE_URL, `http://ar.gov.afip.dif.FEV1/${method}`, envelope);
}

exports.arcaHomologacionStatus = onRequest({region:"us-central1", invoker:"public", secrets:[certificatePem, privateKeyPem, issuerCuit, allowedEmails], timeoutSeconds:60}, async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ok:false,error:"Método no permitido"});
  try {
    const user = await requireAdmin(req);
    const credentials = await loginWsaa();
    const dummyXml = await wsfeCall("FEDummy", "", credentials);
    const pointsXml = await wsfeCall("FEParamGetPtosVenta", "", credentials);
    const points = pointsOfSale(pointsXml);
    return res.json({ok:true, environment:"homologacion", issuerCuit:issuerCuit.value(), operator:user.email,
      wsaaExpiresAt:credentials.expirationTime,
      services:{app:tag(dummyXml,"AppServer")||"OK", db:tag(dummyXml,"DbServer")||"OK", auth:tag(dummyXml,"AuthServer")||"OK"},
      pointsOfSale:points, emissionEnabled:false});
  } catch (error) {
    console.error("ARCA homologation diagnostic failed", error);
    return res.status(error.status||502).json({ok:false,error:error.message||"No se pudo consultar ARCA"});
  }
});

exports.arcaHomologacionEmitirPrueba = onRequest({region:"us-central1", invoker:"public", secrets:[certificatePem, privateKeyPem, issuerCuit, allowedEmails], timeoutSeconds:60}, async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ok:false,error:"Método no permitido"});
  try {
    const user = await requireAdmin(req);
    const docNro = String(req.body?.docNro || "").replace(/\D/g, "");
    const neto = Number(req.body?.neto);
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 20) : [];
    if (!/^\d{11}$/.test(docNro)) throw Object.assign(new Error("CUIT del cliente inválido"), {status:400});
    if (!Number.isFinite(neto) || neto <= 0) throw Object.assign(new Error("Importe neto inválido"), {status:400});
    if (items.length !== 2) throw Object.assign(new Error("La prueba debe conservar los dos ítems de la OT 4680"), {status:400});
    const itemTotal = items.reduce((sum, item)=>sum + Number(item.unitario||0)*Number(item.cantidad||0), 0);
    if (Math.abs(itemTotal-neto) > 0.01) throw Object.assign(new Error("La suma de los ítems no coincide con el neto"), {status:400});

    const credentials = await loginWsaa();
    const pointsXml = await wsfeCall("FEParamGetPtosVenta", "", credentials);
    const points = pointsOfSale(pointsXml);
    const ptoVta = points[0];
    if (!ptoVta) throw Object.assign(new Error("ARCA no informó un punto de venta de homologación"), {status:409});
    const cbteTipo = 1;
    const lastXml = await wsfeCall("FECompUltimoAutorizado", `<PtoVta>${ptoVta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo>`, credentials);
    const last = Number(tag(lastXml, "CbteNro") || 0), next = last + 1;
    const iva = Math.round(neto*0.21*100)/100, total = Math.round((neto+iva)*100)/100;
    const dateParts = Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(({type,value})=>[type,value]));
    const date = `${dateParts.year}${dateParts.month}${dateParts.day}`;
    const detail = `<FeCAEReq><FeCabReq><CantReg>1</CantReg><PtoVta>${ptoVta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo></FeCabReq><FeDetReq><FECAEDetRequest><Concepto>1</Concepto><DocTipo>80</DocTipo><DocNro>${docNro}</DocNro><CbteDesde>${next}</CbteDesde><CbteHasta>${next}</CbteHasta><CbteFch>${date}</CbteFch><ImpTotal>${total.toFixed(2)}</ImpTotal><ImpTotConc>0.00</ImpTotConc><ImpNeto>${neto.toFixed(2)}</ImpNeto><ImpOpEx>0.00</ImpOpEx><ImpTrib>0.00</ImpTrib><ImpIVA>${iva.toFixed(2)}</ImpIVA><MonId>PES</MonId><MonCotiz>1.000000</MonCotiz><CondicionIVAReceptorId>1</CondicionIVAReceptorId><Iva><AlicIva><Id>5</Id><BaseImp>${neto.toFixed(2)}</BaseImp><Importe>${iva.toFixed(2)}</Importe></AlicIva></Iva></FECAEDetRequest></FeDetReq></FeCAEReq>`;
    const resultXml = await wsfeCall("FECAESolicitar", detail, credentials);
    const result = tag(resultXml,"Resultado"), cae = tag(resultXml,"CAE"), caeVto = tag(resultXml,"CAEFchVto");
    const messages = [...resultXml.matchAll(/<(?:Msg|Obs)>([\s\S]*?)<\/(?:Msg|Obs)>/gi)].map(m=>decodeXml(m[1].trim())).filter(Boolean);
    if (result !== "A" || !cae) return res.status(422).json({ok:false,error:messages.join(" · ")||"ARCA rechazó el comprobante de prueba",environment:"homologacion",ptoVta,cbteNro:next});
    console.info("ARCA homologation invoice approved", {operator:user.email,ptoVta,cbteNro:next,neto,total});
    return res.json({ok:true,environment:"homologacion",ptoVta,cbteTipo,cbteNro:next,cae,caeVto,issuerCuit:issuerCuit.value(),receiverCuit:docNro,neto,iva,total,items});
  } catch (error) {
    console.error("ARCA homologation invoice failed", error);
    return res.status(error.status||502).json({ok:false,error:error.message||"No se pudo emitir la prueba"});
  }
});
