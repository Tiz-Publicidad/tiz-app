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
    const points = [...pointsXml.matchAll(/<PtoVenta>(\d+)<\/PtoVenta>/gi)].map((m)=>Number(m[1]));
    return res.json({ok:true, environment:"homologacion", issuerCuit:issuerCuit.value(), operator:user.email,
      wsaaExpiresAt:credentials.expirationTime,
      services:{app:tag(dummyXml,"AppServer")||"OK", db:tag(dummyXml,"DbServer")||"OK", auth:tag(dummyXml,"AuthServer")||"OK"},
      pointsOfSale:[...new Set(points)], emissionEnabled:false});
  } catch (error) {
    console.error("ARCA homologation diagnostic failed", error);
    return res.status(error.status||502).json({ok:false,error:error.message||"No se pudo consultar ARCA"});
  }
});
