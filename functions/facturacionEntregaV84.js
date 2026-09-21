"use strict";

const admin = require("firebase-admin");
const { google } = require("googleapis");
const PDFDocument = require("pdfkit");
const { Readable } = require("stream");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { FACTURAS_2026_FOLDER_ID } = require("./facturaDrive2026");

if (!admin.apps.length) admin.initializeApp();

const allowedEmails = defineSecret("ARCA_ALLOWED_EMAILS");
const facturasWebhookSecret = defineSecret("TIZ_FACTURAS_SECRET");
const FACTURAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbx_Uy_ijUG38rht-m-Xp-y9Eou8WzoG4jepXi1GqJaHAknwQsQd-rQgYcQ1ucrAJPlK/exec";
const ORIGINS = new Set([
  "https://tiz-publicidad.github.io",
  "https://tiz---app.web.app",
  "https://tiz---app.firebaseapp.com",
  "https://tiz---app--facturacion-v83-pruebas-h6sjmm0g.web.app",
  "https://tiz---app--facturacion-cobranzas-v2-n8fm9m8n.web.app",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
]);

function cors(req, res) {
  const origin = req.get("origin");
  if (origin && ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}

async function requireAdmin(req) {
  const header = req.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw Object.assign(new Error("Falta iniciar sesión"), { status: 401 });
  const decoded = await admin.auth().verifyIdToken(header.slice(7));
  const email = String(decoded.email || "").toLowerCase();
  const allowed = new Set(allowedEmails.value().split(",").map(v => v.trim().toLowerCase()).filter(Boolean));
  if (!allowed.has(email)) throw Object.assign(new Error("Usuario sin permiso para facturación"), { status: 403 });
  return { email };
}

const money = value => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(Number(value) || 0);
const safe = value => String(value || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
const otBase = value => String(value || "").match(/\d{4,7}/)?.[0].replace(/^0+/, "") || "";
function invoiceList(obra){const out=[];for(const x of(Array.isArray(obra.comprobantesArca)?obra.comprobantesArca:[]))if(x?.cae)out.push(x);for(const x of(Array.isArray(obra.facturasArca)?obra.facturasArca:[]))if(x?.cae&&!out.some(y=>String(y.cae)===String(x.cae)))out.push(x);if(obra.facturaArca?.cae&&!out.some(y=>String(y.cae)===String(obra.facturaArca.cae)))out.push(obra.facturaArca);return out}
function selectInvoice(obra,body){const numero=String(body?.numeroCompleto||"").trim(),tipo=Number(body?.cbteTipo||0),nro=Number(body?.cbteNro||0),list=invoiceList(obra);return list.find(x=>numero&&String(x.numeroCompleto||"")===numero)||list.find(x=>tipo&&nro&&Number(x.cbteTipo)===tipo&&Number(x.cbteNro)===nro)||obra.facturaArca||null}
function markSent(arr,factura,data){return(Array.isArray(arr)?arr:[]).map(x=>String(x?.cae)===String(factura?.cae)?{...x,emailUltimoDestinatario:data.destinatario,emailUltimoDestinatarios:data.destinatarios,emailUltimoRemitente:"info@tizpublicidad.com",emailUltimoEnvioAt:data.iso,emailUltimoEnvioPor:data.por,emailPendiente:false}:x)}


function homologationPdf({ factura, obra }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 42 });
      const chunks = [];
      doc.on("data", c => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(22).text("TIZ Publicidad", { align: "left" });
      doc.fontSize(10).text("Razón social: SixSigma SRL");
      doc.text("Mosconi 1234, Los Polvorines, Buenos Aires");
      doc.text("Responsable Inscripto");
      doc.moveDown();
      doc.save();
      doc.rotate(-32, { origin: [300, 400] });
      doc.fillColor("#dddddd").fontSize(38).text("PRUEBA HOMOLOGACION\nSIN VALIDEZ FISCAL", 55, 325, { width: 500, align: "center" });
      doc.restore();
      doc.fillColor("#000000");
      doc.rect(42, 135, 510, 82).stroke();
      doc.fontSize(17).text(`PRUEBA · ${factura.tipo || "Comprobante"}`, 55, 150);
      doc.fontSize(11).text(`PV prueba ${String(factura.ptoVta || 0).padStart(5, "0")} · N° ${String(factura.cbteNro || 0).padStart(8, "0")}`, 55, 178);
      doc.text(`CAE de homologación: ${factura.cae || ""}`, 300, 178);
      doc.moveDown(3);
      doc.fontSize(10).text(`Cliente: ${factura.cliente || obra.cliente || ""}`);
      doc.text(`CUIT receptor: ${factura.cuit || ""}`);
      doc.text(`OT: ${otBase(obra.ot)} · ${obra.desc || obra.descripcion || ""}`);
      doc.moveDown();
      doc.fontSize(9).text("DETALLE");
      (Array.isArray(factura.items) ? factura.items : []).slice(0, 30).forEach((it, i) => {
        const cant = Number(it.cantidad || 1), unit = Number(it.unitario || 0);
        doc.text(`${i + 1}. ${safe(it.descripcion || it.desc || "Ítem")} · ${cant} × ${money(unit)} = ${money(cant * unit)}`);
      });
      doc.moveDown();
      doc.fontSize(11).text(`Neto: ${money(factura.neto)}`, { align: "right" });
      doc.text(`IVA: ${money(factura.iva)}`, { align: "right" });
      doc.fontSize(13).text(`TOTAL: ${money(factura.total)}`, { align: "right" });
      doc.moveDown(2);
      doc.fontSize(9).text("Documento generado exclusivamente para validar el circuito TIZ App → ARCA homologación → PDF → Drive → correo/WhatsApp. No constituye comprobante fiscal.", { align: "center" });
      doc.end();
    } catch (error) { reject(error); }
  });
}

async function uploadPdf(buffer, fileName) {
  const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/drive"] });
  const drive = google.drive({ version: "v3", auth });
  const response = await drive.files.create({
    requestBody: { name: fileName, parents: [FACTURAS_2026_FOLDER_ID], mimeType: "application/pdf" },
    media: { mimeType: "application/pdf", body: Readable.from(buffer) },
    fields: "id,name,webViewLink,parents",
    supportsAllDrives: true,
  });
  return {
    fileId: response.data.id,
    fileName: response.data.name,
    webViewLink: response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`,
    folderId: FACTURAS_2026_FOLDER_ID,
  };
}

const facturacionHomologacionArchivarV84 = onRequest({ region: "us-central1", invoker: "public", secrets: [allowedEmails], timeoutSeconds: 60 }, async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Método no permitido" });
  try {
    const user = await requireAdmin(req);
    const obraId = String(req.body?.obraId || "").trim();
    const factura = req.body?.factura || {};
    if (!obraId || !factura?.cae) throw Object.assign(new Error("Falta la OT o el resultado de homologación"), { status: 400 });
    const obraRef = admin.firestore().collection("obras").doc(obraId);
    const snap = await obraRef.get();
    if (!snap.exists) throw Object.assign(new Error("No se encontró la OT"), { status: 404 });
    const obra = snap.data() || {};
    const normalized = {
      ambiente: "homologacion",
      tipo: String(factura.tipo || "Factura A"),
      ptoVta: Number(factura.ptoVta || 0),
      cbteNro: Number(factura.cbteNro || 0),
      cae: String(factura.cae || ""),
      cliente: String(obra.cliente || factura.cliente || ""),
      cuit: String(factura.cuit || req.body?.cuit || "").replace(/\D/g, ""),
      neto: Number(factura.neto || 0),
      iva: Number(factura.iva || 0),
      total: Number(factura.total || 0),
      items: Array.isArray(factura.items) ? factura.items : [],
    };
    const pdf = await homologationPdf({ factura: normalized, obra });
    const fileName = `PRUEBA HOMOLOGACION - OT ${otBase(obra.ot)} - ${safe(obra.cliente)} - ${Date.now()}.pdf`;
    const drive = await uploadPdf(pdf, fileName);
    await obraRef.set({
      ultimaPruebaFacturacionV84: {
        ...normalized,
        ...drive,
        creadoPor: user.email,
        creadoAt: admin.firestore.FieldValue.serverTimestamp(),
      }
    }, { merge: true });
    return res.json({ ok: true, prueba: true, ...drive, factura: normalized });
  } catch (error) {
    console.error("Homologation archive failed", error);
    return res.status(error.status || 502).json({ ok: false, error: error.message || "No se pudo archivar la prueba" });
  }
});

const facturacionEnviarEmailV84 = onRequest({ region: "us-central1", invoker: "public", secrets: [allowedEmails, facturasWebhookSecret], timeoutSeconds: 60 }, async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Método no permitido" });
  try {
    const user = await requireAdmin(req);
    if (req.body?.confirmacion !== "ENVIAR FACTURA POR EMAIL") throw Object.assign(new Error("Falta confirmación final del envío"), { status: 400 });
    const obraId = String(req.body?.obraId || "").trim();
    const fileId = String(req.body?.fileId || "").trim();
    const prueba = !!req.body?.prueba;
    const destinatarios = String(req.body?.destinatario || "").split(/[;,\n]+/).map(v => v.trim().toLowerCase()).filter(Boolean);
    if (!obraId || !fileId) throw Object.assign(new Error("Falta identificar la OT o el PDF"), { status: 400 });
    if (!destinatarios.length || destinatarios.length > 10 || destinatarios.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw Object.assign(new Error("Revisá los correos destinatarios (máximo 10)"), { status: 400 });
    const destinatario = [...new Set(destinatarios)].join(",");
    const obraRef = admin.firestore().collection("obras").doc(obraId);
    const snap = await obraRef.get();
    if (!snap.exists) throw Object.assign(new Error("No se encontró la OT"), { status: 404 });
    const obra = snap.data() || {};
    const factura = prueba ? (obra.ultimaPruebaFacturacionV84 || {}) : selectInvoice(obra,req.body||{});
    if (!prueba && (!factura?.cae || !factura?.numeroCompleto)) throw Object.assign(new Error("La OT no tiene una factura ARCA autorizada"), { status: 400 });
    if (prueba && factura.fileId && factura.fileId !== fileId) throw Object.assign(new Error("El PDF no coincide con la última prueba homologada"), { status: 409 });
    if (!prueba && factura.driveFileId && factura.driveFileId !== fileId) throw Object.assign(new Error("El PDF no coincide con la factura autorizada"), { status: 409 });
    const numero = prueba ? `PRUEBA HOMOLOGACION OT ${otBase(obra.ot)}` : factura.numeroCompleto;
    const asuntoBase = String(req.body?.asunto || "").trim();
    const payload = {
      action: "enviarFacturaEmail",
      secret: facturasWebhookSecret.value(),
      destinatario,
      fileId,
      numero,
      cliente: String(obra.cliente || factura.cliente || "").trim(),
      ot: otBase(obra.ot),
      asunto: prueba ? (`[PRUEBA SIN VALIDEZ FISCAL] ${asuntoBase || numero}`) : asuntoBase,
    };
    const form = new URLSearchParams({ payload: JSON.stringify(payload) });
    const response = await fetch(FACTURAS_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: form });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch (_) { throw new Error("El servicio de correo devolvió una respuesta inválida"); }
    if (!response.ok || !result?.ok) throw new Error(result?.error || "No se pudo enviar la factura");

    const emailData = { destinatarios: destinatario.split(","), ultimoEnvioPor: user.email, ultimoEnvioAt: admin.firestore.FieldValue.serverTimestamp() };
    const sentIso = new Date().toISOString();
    if (prueba) {
      await obraRef.set({ ultimaPruebaFacturacionV84: { ...factura, email: emailData } }, { merge: true });
    } else {
      const sent={destinatario,destinatarios:destinatario.split(","),por:user.email,iso:sentIso};
      const patch={
        comprobantesArca:markSent(obra.comprobantesArca,factura,sent),
        facturasArca:markSent(obra.facturasArca,factura,sent),
        estadoGestionFactura:"Factura enviada",
      };
      if(String(obra.facturaArca?.cae||"")===String(factura.cae)) patch.facturaArca={...obra.facturaArca,emailUltimoDestinatario:destinatario,emailUltimoDestinatarios:sent.destinatarios,emailUltimoRemitente:"info@tizpublicidad.com",emailUltimoEnvioAt:sentIso,emailUltimoEnvioPor:user.email,emailPendiente:false};
      await obraRef.update(patch);
    }
    if (req.body?.guardarEnCliente && obra.clienteId) {
      await admin.firestore().collection("clientes").doc(String(obra.clienteId)).set({ emailsFacturacion: destinatario.split(",") }, { merge: true }).catch(() => {});
    }
    return res.json({ ok: true, prueba, destinatario, remitente: "info@tizpublicidad.com", fileId, fileName: result.fileName || "", numero });
  } catch (error) {
    console.error("Invoice email V84 failed", error);
    return res.status(error.status || 502).json({ ok: false, error: error.message || "No se pudo enviar la factura" });
  }
});

module.exports = { facturacionHomologacionArchivarV84, facturacionEnviarEmailV84 };
