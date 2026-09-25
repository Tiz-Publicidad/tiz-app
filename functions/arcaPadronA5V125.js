"use strict";

const admin = require("firebase-admin");
const forge = require("node-forge");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

if (!admin.apps.length) admin.initializeApp();

const cert = defineSecret("ARCA_PROD_CERTIFICATE_PEM");
const key = defineSecret("ARCA_PROD_PRIVATE_KEY_PEM");
const issuer = defineSecret("ARCA_ISSUER_CUIT");
const allowed = defineSecret("ARCA_ALLOWED_EMAILS");

const WSAA = "https://wsaa.afip.gov.ar/ws/services/LoginCms";
// ARCA WSCI v4.1: conserva personaServiceA5 y el namespace a5.
const PADRON = "https://aws.arca.gob.ar/sr-padron/webservices/personaServiceA5";
const SERVICE = "ws_sr_constancia_inscripcion";
// ARCA 2026: reemplaza al servicio historico ws_sr_padron_a5.
const ORIGINS = new Set([
  "https://tiz-publicidad.github.io",
  "https://tiz---app.web.app",
  "https://tiz---app.firebaseapp.com",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
]);

const decodeXml = (value = "") =>
  String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
const escapeXml = (value = "") =>
  String(value).replace(
    /[<>&'\"]/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[char],
  );
function tag(xml, name) {
  const match = String(xml || "").match(
    new RegExp(
      `<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`,
      "i",
    ),
  );
  return match ? decodeXml(match[1].trim()) : "";
}
function cors(req, res) {
  const origin = req.get("origin");
  if (origin && ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}
async function operator(req) {
  const header = req.get("authorization") || "";
  if (!header.startsWith("Bearer "))
    throw Object.assign(new Error("Falta iniciar sesión"), { status: 401 });
  const decoded = await admin.auth().verifyIdToken(header.slice(7));
  const email = String(decoded.email || "").toLowerCase();
  const emails = new Set(
    allowed
      .value()
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!emails.has(email))
    throw Object.assign(new Error("Usuario sin permiso para consultar ARCA"), {
      status: 403,
    });
  return email;
}
function tra() {
  const now = new Date();
  const generation = new Date(now.getTime() - 600000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  const expiration = new Date(now.getTime() + 600000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId><generationTime>${generation}</generationTime><expirationTime>${expiration}</expirationTime></header><service>${SERVICE}</service></loginTicketRequest>`;
}
function cms(xml) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(xml, "utf8");
  const certificate = forge.pki.certificateFromPem(cert.value());
  const privateKey = forge.pki.privateKeyFromPem(key.value());
  p7.addCertificate(certificate);
  p7.addSigner({
    key: privateKey,
    certificate,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}
async function postSoap(url, body, soapAction = "") {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: soapAction,
    },
    body,
  });
  const text = await response.text();
  const fault = tag(text, "faultstring");
  if (fault) throw new Error(`ARCA: ${fault}`);
  if (!response.ok) throw new Error(`ARCA respondió HTTP ${response.status}`);
  return text;
}
async function credentials() {
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><in0>${cms(tra())}</in0></loginCms></soapenv:Body></soapenv:Envelope>`;
  const xml = await postSoap(WSAA, envelope);
  const result = tag(xml, "loginCmsReturn");
  const token = tag(result, "token");
  const sign = tag(result, "sign");
  if (!token || !sign)
    throw new Error("WSAA no devolvió autorización para Constancia de Inscripción");
  return { token, sign };
}
async function getPersona(cuit, cr) {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/"><soapenv:Header/><soapenv:Body><a5:getPersona_v2><token>${escapeXml(cr.token)}</token><sign>${escapeXml(cr.sign)}</sign><cuitRepresentada>${escapeXml(issuer.value())}</cuitRepresentada><idPersona>${escapeXml(cuit)}</idPersona></a5:getPersona_v2></soapenv:Body></soapenv:Envelope>`;
  const xml = await postSoap(PADRON, envelope);
  const error = tag(tag(xml, "errorConstancia"), "error");
  if (error)
    throw Object.assign(new Error(`ARCA Padrón: ${error}`), { status: 422 });
  const generales = tag(xml, "datosGenerales");
  const domicilio = tag(generales, "domicilioFiscal");
  const razonSocial =
    tag(generales, "razonSocial") ||
    [tag(generales, "apellido"), tag(generales, "nombre")]
      .filter(Boolean)
      .join(" ");
  const out = {
    cuit,
    razonSocial,
    estadoClave: tag(generales, "estadoClave"),
    direccion: tag(domicilio, "direccion"),
    localidad: tag(domicilio, "localidad"),
    codigoPostal: tag(domicilio, "codPostal"),
    provincia: tag(domicilio, "descripcionProvincia"),
    tipoDomicilio: tag(domicilio, "tipoDomicilio") || "FISCAL",
  };
  out.domicilioFiscal = [
    out.direccion,
    out.localidad,
    out.codigoPostal ? `CP ${out.codigoPostal}` : "",
    out.provincia,
  ]
    .filter(Boolean)
    .join(", ");
  if (!out.domicilioFiscal)
    throw Object.assign(new Error("ARCA no informó un domicilio fiscal"), {
      status: 422,
    });
  return out;
}

const arcaPadronConsultarV125 = onRequest(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [cert, key, issuer, allowed],
    timeoutSeconds: 60,
  },
  async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST")
      return res.status(405).json({ ok: false, error: "Método no permitido" });
    try {
      const email = await operator(req);
      const cuit = String(req.body?.cuit || "").replace(/\D/g, "");
      if (!/^\d{11}$/.test(cuit))
        throw Object.assign(new Error("CUIT inválido"), { status: 400 });
      const data = await getPersona(cuit, await credentials());
      const db = admin.firestore();
      const obraId = String(req.body?.obraId || "").trim();
      let clientId = "";
      if (obraId) {
        const obraRef = db.collection("obras").doc(obraId);
        const snap = await obraRef.get();
        if (snap.exists) {
          const obra = snap.data() || {};
          clientId = String(obra.clienteId || "").trim();
          await obraRef.set(
            {
              clienteCuit: cuit,
              clienteDomicilioFiscal: data.domicilioFiscal,
              domicilioFiscal: data.domicilioFiscal,
              clientePadronArca: data,
              clientePadronArcaConsultadoAt: new Date().toISOString(),
              clientePadronArcaConsultadoPor: email,
            },
            { merge: true },
          );
        }
      }
      if (!clientId) {
        const clients = await db.collection("clientes").limit(2500).get();
        const hit = clients.docs.find(
          (doc) =>
            String(doc.data()?.cuit || doc.data()?.CUIT || "").replace(
              /\D/g,
              "",
            ) === cuit,
        );
        clientId = hit?.id || "";
      }
      if (clientId) {
        await db.collection("clientes").doc(clientId).set(
          {
            cuit,
            razonSocial: data.razonSocial,
            domicilioFiscal: data.domicilioFiscal,
            direccionFiscal: data.direccion,
            localidadFiscal: data.localidad,
            codigoPostalFiscal: data.codigoPostal,
            provinciaFiscal: data.provincia,
            padronArca: data,
            padronArcaConsultadoAt: new Date().toISOString(),
          },
          { merge: true },
        );
      }
      return res.json({ ok: true, ...data, obraId, clientId });
    } catch (error) {
      console.error("Consulta Constancia de Inscripción ARCA", error);
      const message = error.message || "No se pudo consultar el Padrón de ARCA";
      const missingPermission =
        /not authorized|no autorizado|computador no autorizado|servicio/i.test(
          message,
        );
      return res.status(error.status || 502).json({
        ok: false,
        error: missingPermission
          ? `${message}. Asociá el servicio ws_sr_constancia_inscripcion al certificado de facturación en ARCA.`
          : message,
      });
    }
  },
);

module.exports = { arcaPadronConsultarV125 };
