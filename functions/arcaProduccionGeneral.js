"use strict";

const admin = require("firebase-admin");
const forge = require("node-forge");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

if (!admin.apps.length) admin.initializeApp();

const prodCertificatePem = defineSecret("ARCA_PROD_CERTIFICATE_PEM");
const prodPrivateKeyPem = defineSecret("ARCA_PROD_PRIVATE_KEY_PEM");
const issuerCuit = defineSecret("ARCA_ISSUER_CUIT");
const allowedEmails = defineSecret("ARCA_ALLOWED_EMAILS");

const ALLOWED_ORIGINS = new Set([
  "https://tiz-publicidad.github.io",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
]);
const WSAA_PROD_URL = "https://wsaa.afip.gov.ar/ws/services/LoginCms";
const WSFE_PROD_URL = "https://servicios1.afip.gov.ar/wsfev1/service.asmx";
const PTO_VTA = 9;

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
  return String(value).replace(/[<>&'"]/g, c => ({
    "<":"&lt;", ">":"&gt;", "&":"&amp;", "'":"&apos;", '"':"&quot;"
  })[c]);
}
function decodeXml(value = "") {
  return value.replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");
}
function tag(xml, name) {
  const m = xml.match(new RegExp(
    `<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, "i"
  ));
  return m ? decodeXml(m[1].trim()) : "";
}
function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

async function requireAdmin(req) {
  const header = req.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    throw Object.assign(new Error("Falta iniciar sesión"), {status:401});
  }
  const decoded = await admin.auth().verifyIdToken(header.slice(7));
  const email = String(decoded.email || "").toLowerCase();
  const ok = new Set(
    allowedEmails.value().split(",").map(v=>v.trim().toLowerCase()).filter(Boolean)
  );
  if (!ok.has(email)) {
    throw Object.assign(new Error("Usuario sin permiso para ARCA"), {status:403});
  }
  return { email };
}
function createTra() {
  const now = new Date();
  const generation = new Date(now.getTime()-600000).toISOString().replace(/\.\d{3}Z$/,"Z");
  const expiration = new Date(now.getTime()+600000).toISOString().replace(/\.\d{3}Z$/,"Z");
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now.getTime()/1000)}</uniqueId><generationTime>${generation}</generationTime><expirationTime>${expiration}</expirationTime></header><service>wsfe</service></loginTicketRequest>`;
}
function signCms(xml) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(xml, "utf8");
  const cert = forge.pki.certificateFromPem(prodCertificatePem.value());
  const key = forge.pki.privateKeyFromPem(prodPrivateKeyPem.value());
  p7.addCertificate(cert);
  p7.addSigner({
    key, certificate:cert, digestAlgorithm:forge.pki.oids.sha256,
    authenticatedAttributes:[
      {type:forge.pki.oids.contentType, value:forge.pki.oids.data},
      {type:forge.pki.oids.messageDigest},
      {type:forge.pki.oids.signingTime, value:new Date()},
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}
async function soap(url, action, body) {
  const response = await fetch(url, {
    method:"POST",
    headers:{"Content-Type":"text/xml; charset=utf-8", SOAPAction:action},
    body,
  });
  const text = await response.text();
  const fault = tag(text, "faultstring");
  if (fault) throw new Error(`ARCA: ${fault}`);
  if (!response.ok) throw new Error(`ARCA respondió HTTP ${response.status}`);
  return text;
}
async function loginWsaa() {
  const cms = signCms(createTra());
  const envelope = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><in0>${cms}</in0></loginCms></soapenv:Body></soapenv:Envelope>`;
  const response = await soap(WSAA_PROD_URL, "", envelope);
  const result = tag(response, "loginCmsReturn");
  const token = tag(result, "token");
  const sign = tag(result, "sign");
  if (!token || !sign) throw new Error("WSAA no devolvió credenciales válidas");
  return {token, sign};
}
async function wsfeCall(method, innerXml, credentials) {
  const auth = `<Auth><Token>${escapeXml(credentials.token)}</Token><Sign>${escapeXml(credentials.sign)}</Sign><Cuit>${escapeXml(issuerCuit.value())}</Cuit></Auth>`;
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${method} xmlns="http://ar.gov.afip.dif.FEV1/">${auth}${innerXml || ""}</${method}></soap:Body></soap:Envelope>`;
  return soap(WSFE_PROD_URL, `http://ar.gov.afip.dif.FEV1/${method}`, envelope);
}
function ivaConfig(value) {
  const n = Number(value);
  const map = {
    "21": [5,21],
    "10.5": [4,10.5],
    "27": [6,27],
    "5": [8,5],
    "2.5": [9,2.5],
    "0": [3,0],
  };
  const row = map[String(n)];
  if (!row) throw Object.assign(new Error("Alícuota de IVA no soportada"), {status:400});
  return { id:row[0], pct:row[1] };
}

const arcaProduccionEmitirGeneral = onRequest({
  region:"us-central1",
  invoker:"public",
  secrets:[prodCertificatePem, prodPrivateKeyPem, issuerCuit, allowedEmails],
  timeoutSeconds:60,
}, async (req,res) => {
  cors(req,res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ok:false,error:"Método no permitido"});

  const db = admin.firestore();
  let opRef = null;
  let seqRef = null;

  try {
    const user = await requireAdmin(req);
    if (req.body?.confirmacion !== "EMITIR FACTURA REAL") {
      throw Object.assign(new Error("Falta la confirmación final de emisión"), {status:400});
    }

    const obraId = String(req.body?.obraId || "").trim();
    const idempotencyKey = String(req.body?.idempotencyKey || "")
      .replace(/[^A-Za-z0-9_-]/g,"").slice(0,80);
    if (!obraId || !idempotencyKey) {
      throw Object.assign(new Error("Falta identificar la obra o la operación"), {status:400});
    }

    const obraRef = db.collection("obras").doc(obraId);
    const snap = await obraRef.get();
    if (!snap.exists) throw Object.assign(new Error("No se encontró la OT"), {status:404});
    const obra = snap.data() || {};
    const ot = String(obra.ot || "").match(/\d{4,7}/)?.[0].replace(/^0+/,"") || "";

    const cuit = String(req.body?.docNro || obra.clienteCuit || obra.cuit || "").replace(/\D/g,"");
    if (!/^\d{11}$/.test(cuit)) {
      throw Object.assign(new Error("CUIT receptor inválido"), {status:400});
    }

    const cbteTipo = Number(req.body?.cbteTipo);
    const condicionIVAReceptorId = Number(req.body?.condicionIVAReceptorId || 1);
    if (![1,6,201,206].includes(cbteTipo)) {
      throw Object.assign(new Error("Tipo de comprobante no soportado"), {status:400});
    }
    if (![1,4,5,6].includes(condicionIVAReceptorId)) {
      throw Object.assign(new Error("Condición frente al IVA inválida"), {status:400});
    }

    const aprobado = round2(
      obra.finanzas?.total || obra.neto || obra.importe || obra.infoPresupuesto?.importe
    );
    const neto = round2(req.body?.neto);
    if (!(aprobado > 0) || !(neto > 0)) {
      throw Object.assign(new Error("La OT no tiene un importe aprobado válido"), {status:400});
    }

    const previas = Array.isArray(obra.facturasArca) ? [...obra.facturasArca] : [];
    if (obra.facturaArca?.cae && !previas.some(f=>f.cae===obra.facturaArca.cae)) {
      previas.push(obra.facturaArca);
    }
    const facturadoPrevio = round2(previas.reduce((a,f)=>a+Number(f.neto||0),0));
    const saldoPendiente = round2(aprobado - facturadoPrevio);
    if (neto - saldoPendiente > 0.01) {
      throw Object.assign(
        new Error(`El neto supera el saldo pendiente (${saldoPendiente.toFixed(2)})`),
        {status:400}
      );
    }

    const tratamientoIva = String(req.body?.tratamientoIva || "gravado");
    const exento = tratamientoIva === "exento";
    const cfg = exento ? null : ivaConfig(req.body?.alicuota);
    const iva = exento ? 0 : round2(neto * cfg.pct / 100);
    const total = round2(neto + iva);

    opRef = db.collection("arcaEmisiones").doc(`general-${obraId}-${idempotencyKey}`);
    const existing = await opRef.get();
    if (existing.exists && existing.data()?.status === "autorizada") {
      return res.json({ok:true, ...existing.data().facturaArca, repetida:true});
    }
    if (existing.exists && existing.data()?.status === "procesando") {
      throw Object.assign(new Error("La emisión ya está en proceso"), {status:409});
    }
    await opRef.set({
      status:"procesando", obraId, ot, cuit, cbteTipo, neto, iva, total,
      operador:user.email, iniciadoAt:admin.firestore.FieldValue.serverTimestamp(),
    });

    seqRef = db.collection("arcaLocks").doc(`pv9-tipo${cbteTipo}`);
    await db.runTransaction(async tx => {
      const current = await tx.get(seqRef);
      const data = current.exists ? current.data() : {};
      const ts = data.iniciadoAt?.toMillis?.() || 0;
      if (data.status === "procesando" && Date.now()-ts < 120000) {
        throw Object.assign(
          new Error("Hay otra factura del mismo tipo procesándose; reintentá en unos segundos"),
          {status:409}
        );
      }
      tx.set(seqRef, {
        status:"procesando", obraId, operador:user.email,
        iniciadoAt:admin.firestore.FieldValue.serverTimestamp(),
      }, {merge:true});
    });

    const credentials = await loginWsaa();
    const lastXml = await wsfeCall(
      "FECompUltimoAutorizado",
      `<PtoVta>${PTO_VTA}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo>`,
      credentials
    );
    const next = Number(tag(lastXml,"CbteNro") || 0) + 1;

    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone:"America/Argentina/Buenos_Aires",
        year:"numeric", month:"2-digit", day:"2-digit"
      }).formatToParts(new Date()).map(({type,value})=>[type,value])
    );
    const date = `${parts.year}${parts.month}${parts.day}`;

    const ivaXml = exento ? "" :
      `<Iva><AlicIva><Id>${cfg.id}</Id><BaseImp>${neto.toFixed(2)}</BaseImp><Importe>${iva.toFixed(2)}</Importe></AlicIva></Iva>`;
    const fceVto = (cbteTipo===201 || cbteTipo===206)
      ? `<FchVtoPago>${date}</FchVtoPago>` : "";

    const detail =
      `<FeCAEReq><FeCabReq><CantReg>1</CantReg><PtoVta>${PTO_VTA}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo></FeCabReq>`+
      `<FeDetReq><FECAEDetRequest><Concepto>1</Concepto><DocTipo>80</DocTipo><DocNro>${cuit}</DocNro>`+
      `<CbteDesde>${next}</CbteDesde><CbteHasta>${next}</CbteHasta><CbteFch>${date}</CbteFch>`+
      `<ImpTotal>${total.toFixed(2)}</ImpTotal><ImpTotConc>0.00</ImpTotConc>`+
      `<ImpNeto>${(exento?0:neto).toFixed(2)}</ImpNeto><ImpOpEx>${(exento?neto:0).toFixed(2)}</ImpOpEx>`+
      `<ImpTrib>0.00</ImpTrib><ImpIVA>${iva.toFixed(2)}</ImpIVA>${fceVto}`+
      `<MonId>PES</MonId><MonCotiz>1.000000</MonCotiz>`+
      `<CondicionIVAReceptorId>${condicionIVAReceptorId}</CondicionIVAReceptorId>${ivaXml}`+
      `</FECAEDetRequest></FeDetReq></FeCAEReq>`;

    const resultXml = await wsfeCall("FECAESolicitar", detail, credentials);
    const result = tag(resultXml,"Resultado");
    const cae = tag(resultXml,"CAE");
    const caeVto = tag(resultXml,"CAEFchVto");
    const messages = [...resultXml.matchAll(/<(?:Msg|Obs)>([\s\S]*?)<\/(?:Msg|Obs)>/gi)]
      .map(m=>decodeXml(m[1].trim())).filter(Boolean);

    if (result !== "A" || !cae) {
      await opRef.set({
        status:"rechazada", mensajes:messages,
        finalizadoAt:admin.firestore.FieldValue.serverTimestamp()
      }, {merge:true});
      throw Object.assign(new Error(messages.join(" · ") || "ARCA rechazó la factura"), {status:422});
    }

    const numeroCompleto =
      `${String(PTO_VTA).padStart(5,"0")}-${String(next).padStart(8,"0")}`;
    const fechaIso = `${parts.year}-${parts.month}-${parts.day}`;
    const nombres = {
      1:"Factura A", 6:"Factura B",
      201:"Factura de Crédito Electrónica A",
      206:"Factura de Crédito Electrónica B"
    };
    const porcentaje = round2(neto/aprobado*100);
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0,60) : [];

    const facturaArca = {
      ambiente:"produccion",
      tipo:nombres[cbteTipo],
      ptoVta:PTO_VTA, cbteTipo, cbteNro:next, numeroCompleto,
      fecha:fechaIso, cae, caeVto,
      cliente:String(obra.cliente || ""), cuit,
      neto, iva, total,
      alicuota:exento ? "exento" : cfg.pct,
      condicionIVAReceptorId,
      porcentaje, items,
      emitidaPor:user.email,
      drivePendiente:true,
    };

    const facturadoNeto = round2(facturadoPrevio + neto);
    const completo = facturadoNeto >= aprobado - 0.01;
    const finanzas = {...(obra.finanzas || {}), total:aprobado};

    if (previas.length === 0 && !completo) {
      finanzas.anticipo = {
        ...(finanzas.anticipo||{}),
        facturado:true, porcentaje,
        nroFactura:numeroCompleto,
        fechaFactura:fechaIso,
        monto:neto,
      };
    } else {
      finanzas.saldo = {
        ...(finanzas.saldo||{}),
        facturado:true,
        porcentaje:round2(facturadoNeto/aprobado*100),
        nroFactura:numeroCompleto,
        fechaFactura:fechaIso,
        monto:neto,
      };
    }

    const batch = db.batch();
    batch.set(opRef, {
      status:"autorizada", facturaArca,
      finalizadoAt:admin.firestore.FieldValue.serverTimestamp()
    }, {merge:true});
    batch.set(seqRef, {
      status:"libre", ultimoNumero:next,
      finalizadoAt:admin.firestore.FieldValue.serverTimestamp()
    }, {merge:true});
    batch.update(obraRef, {
      facturaArca,
      facturasArca:[...previas, facturaArca],
      finanzas,
      nrfc:numeroCompleto,
      ffc:fechaIso,
      facturado:completo,
      facturaDrivePendiente:true,
    });
    await batch.commit();

    return res.json({
      ok:true, ...facturaArca,
      aprobado, facturadoNeto,
      saldoNeto:round2(aprobado-facturadoNeto),
      completo,
    });

  } catch (error) {
    console.error("ARCA general production invoice failed", error);
    if (seqRef) {
      await seqRef.set({
        status:"libre",
        error:error.message || String(error),
        finalizadoAt:admin.firestore.FieldValue.serverTimestamp()
      }, {merge:true}).catch(()=>{});
    }
    if (opRef && error.status !== 409) {
      await opRef.set({
        status:"revision_requerida",
        error:error.message || String(error),
        finalizadoAt:admin.firestore.FieldValue.serverTimestamp()
      }, {merge:true}).catch(()=>{});
    }
    return res.status(error.status||502).json({
      ok:false, error:error.message || "No se pudo emitir la factura"
    });
  }
});

module.exports = { arcaProduccionEmitirGeneral };
