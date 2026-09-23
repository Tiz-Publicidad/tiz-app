"use strict";
const admin = require("firebase-admin");
const { google } = require("googleapis");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const {
  archivarFacturaPdfEnDrive,
  FACTURAS_2026_FOLDER_ID,
} = require("./facturaDrive2026");
if (!admin.apps.length) admin.initializeApp();
const issuer = defineSecret("ARCA_ISSUER_CUIT"),
  allowed = defineSecret("ARCA_ALLOWED_EMAILS");
const ORIGINS = new Set([
  "https://tiz-publicidad.github.io",
  "https://tiz---app.web.app",
  "https://tiz---app.firebaseapp.com",
  "https://tiz---app--facturacion-v83-pruebas-h6sjmm0g.web.app",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
]);
function cors(req, res) {
  const o = req.get("origin");
  if (o && ORIGINS.has(o)) {
    res.set("Access-Control-Allow-Origin", o);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}
async function operator(req) {
  const h = req.get("authorization") || "";
  if (!h.startsWith("Bearer "))
    throw Object.assign(new Error("Falta iniciar sesión"), { status: 401 });
  const d = await admin.auth().verifyIdToken(h.slice(7)),
    email = String(d.email || "").toLowerCase(),
    set = new Set(
      allowed
        .value()
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    );
  if (!set.has(email))
    throw Object.assign(new Error("Usuario sin permiso"), { status: 403 });
  return email;
}
async function driveActorEmail() {
  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    const c = await auth.getCredentials();
    return c.client_email || "";
  } catch (_) {
    return "";
  }
}
const facturacionReintentarDriveV83 = onRequest(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [issuer, allowed],
    timeoutSeconds: 60,
  },
  async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST")
      return res.status(405).json({ ok: false, error: "Método no permitido" });
    let ref = null;
    const requestedObraId = String(req.body?.obraId || "").trim();
    try {
      const email = await operator(req),
        obraId = requestedObraId,
        driveAccessToken = String(req.body?.driveAccessToken || "").trim();
      if (!obraId)
        throw Object.assign(new Error("Falta identificar la OT"), {
          status: 400,
        });
      ref = admin.firestore().collection("obras").doc(obraId);
      const snap = await ref.get();
      if (!snap.exists)
        throw Object.assign(new Error("No se encontró la OT"), { status: 404 });
      const obra = snap.data() || {},
        factura = obra.facturaArca || {};
      if (!factura.cae)
        throw Object.assign(
          new Error("La OT no tiene un comprobante ARCA autorizado"),
          { status: 400 },
        );
      if (factura.driveFileId)
        return res.json({
          ok: true,
          repetida: true,
          fileId: factura.driveFileId,
          webViewLink: factura.driveWebViewLink || "",
          folderId: FACTURAS_2026_FOLDER_ID,
        });
      const drive = await archivarFacturaPdfEnDrive({
        factura,
        obra,
        issuerCuit: issuer.value(),
        accessToken: driveAccessToken,
      });
      await ref.update({
        "facturaArca.driveFileId": drive.fileId,
        "facturaArca.driveFileName": drive.fileName,
        "facturaArca.driveWebViewLink": drive.webViewLink,
        "facturaArca.drivePendiente": false,
        facturaDrivePendiente: false,
        ultimoPdfFacturaId: drive.fileId,
        ultimoPdfFacturaUrl: drive.webViewLink,
        facturaDriveReintentadaAt: new Date().toISOString(),
        facturaDriveReintentadaPor: email,
      });
      return res.json({ ok: true, ...drive });
    } catch (e) {
      const actor = await driveActorEmail();
      const error = e.message || "No se pudo archivar el PDF";
      console.error("Reintento PDF Drive falló", {
        obraId: requestedObraId,
        error,
        actor,
        folderId: FACTURAS_2026_FOLDER_ID,
      });
      if (ref)
        await ref
          .set(
            {
              facturaDriveUltimoError: error,
              facturaDriveUltimoIntentoAt: new Date().toISOString(),
              facturaDriveServiceAccount: actor,
            },
            { merge: true },
          )
          .catch(() => {});
      return res
        .status(e.status || 502)
        .json({
          ok: false,
          error,
          serviceAccountEmail: actor,
          folderId: FACTURAS_2026_FOLDER_ID,
        });
    }
  },
);
module.exports = { facturacionReintentarDriveV83 };
