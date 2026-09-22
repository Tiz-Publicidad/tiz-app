"use strict";

const admin = require("firebase-admin");
const {google} = require("googleapis");
const {onRequest} = require("firebase-functions/v2/https");

const SPREADSHEET_ID = "1mOhuPKcMG8PO3QsY3g84WL4p3o43t4ilK8Jx1DHjF5M";
const SHEET = "Base de datos";
const ALLOWED_ORIGINS = new Set([
  "https://tiz-publicidad.github.io",
  "https://tiz---app.web.app",
  "https://tiz---app.firebaseapp.com",
]);

function cors(req, res) {
  const origin = req.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}
const text = (v) => String(v ?? "").trim();
const norm = (v) => text(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const otBase = (v) => { const m = text(v).match(/\d{4,7}/); return m ? String(Number(m[0])) : ""; };
const num = (v) => Number(v) || 0;
const approved = (v) => norm(v).startsWith("aprob");

function totalBudget(p) {
  if (Array.isArray(p.items) && p.items.length) {
    const total = p.items.reduce((sum, item) => sum + num(item.precio || item.unitario) * num(item.cant || item.cantidad || 1), 0);
    if (total > 0) return total;
  }
  return num(p.importe || p.neto || p.total);
}
function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - start) / 86400000) + 1) / 7);
}
function shortDate(value) {
  const raw = text(value);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) return `${String(match[1]).padStart(2,"0")}/${String(match[2]).padStart(2,"0")}/${String(match[3]).slice(-2)}`;
  return new Intl.DateTimeFormat("es-AR", {day:"2-digit", month:"2-digit", year:"2-digit"}).format(new Date());
}
async function operator(req) {
  const header = req.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw Object.assign(new Error("Falta iniciar sesión"), {status:401});
  const decoded = await admin.auth().verifyIdToken(header.slice(7));
  const email = text(decoded.email).toLowerCase();
  if (!email.endsWith("@tizpublicidad.com")) throw Object.assign(new Error("Usuario sin permiso"), {status:403});
  return email;
}
async function findBudget(db, requestedOt) {
  const snap = await db.collection("presupuestos").limit(2000).get();
  return snap.docs.map((doc) => ({id:doc.id, ...doc.data()}))
    .filter((p) => otBase(p.nro || p.nroPresupuesto || p.cotizacionBase) === requestedOt && approved(p.estado || p.status || p.estadoRevision))
    .sort((a,b) => text(b.revision || "").localeCompare(text(a.revision || ""), undefined, {numeric:true}))[0] || null;
}

exports.sincronizarBaseMadreV120 = onRequest({region:"us-central1", invoker:"public", timeoutSeconds:60}, async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ok:false, error:"Método no permitido"});
  try {
    const email = await operator(req);
    const requestedOt = otBase(req.body?.ot);
    if (!requestedOt) throw Object.assign(new Error("Falta una OT válida"), {status:400});
    const db = admin.firestore();
    const p = await findBudget(db, requestedOt);
    if (!p) throw Object.assign(new Error(`No se encontró la OT aprobada ${requestedOt}`), {status:404});
    const logistics = p.entregaLogistica || p.logistica || {};
    const net = totalBudget(p);
    if (!text(p.cliente) || net <= 0) throw Object.assign(new Error("La OT no tiene cliente o importe válido"), {status:422});
    const payload = {
      ot:requestedOt,
      descripcion:text(p.desc || p.descripcion),
      contacto:text(logistics.contacto || logistics.retira || p.contacto),
      cliente:text(p.cliente),
      neto:net,
      bruto:Math.round(net * (1 + (num(p.ivaPct || p.iva || 21) || 21) / 100) * 100) / 100,
    };
    const auth = new google.auth.GoogleAuth({scopes:["https://www.googleapis.com/auth/spreadsheets"]});
    const sheets = google.sheets({version:"v4", auth});
    const lookup = await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID, range:`'${SHEET}'!C3:C1954`});
    const values = lookup.data.values || [];
    const found = values.findIndex((row) => otBase(row?.[0]) === requestedOt);
    let rowNumber = found >= 0 ? found + 3 : 0;
    const date = shortDate(p.fecha || p.fechaAprobacion);
    const [dd,mm,yy] = date.split("/").map(Number);
    const week = isoWeek(new Date(2000 + yy, mm - 1, dd));
    if (rowNumber) {
      await sheets.spreadsheets.values.update({spreadsheetId:SPREADSHEET_ID, range:`'${SHEET}'!A${rowNumber}:H${rowNumber}`, valueInputOption:"USER_ENTERED", requestBody:{values:[[date, week, payload.ot, payload.descripcion, payload.contacto, payload.cliente, payload.neto, payload.bruto]]}});
    } else {
      const row = new Array(30).fill("");
      Object.assign(row, {0:date, 1:week, 2:payload.ot, 3:payload.descripcion, 4:payload.contacto, 5:payload.cliente, 6:payload.neto, 7:payload.bruto, 26:"Pendiente"});
      const appended = await sheets.spreadsheets.values.append({spreadsheetId:SPREADSHEET_ID, range:`'${SHEET}'!A:AD`, valueInputOption:"USER_ENTERED", insertDataOption:"INSERT_ROWS", requestBody:{values:[row]}});
      rowNumber = Number((appended.data.updates?.updatedRange || "").match(/![A-Z]+(\d+):/)?.[1] || 0);
    }
    const verify = await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID, range:`'${SHEET}'!A${rowNumber}:AD${rowNumber}`});
    const actual = verify.data.values?.[0] || [];
    if (otBase(actual[2]) !== requestedOt || norm(actual[5]) !== norm(payload.cliente)) throw new Error("La verificación final de la fila falló");
    const mark = {baseMadreSyncAt:new Date().toISOString(), baseMadreRow:rowNumber, baseMadreSpreadsheetId:SPREADSHEET_ID, baseMadreSyncVersion:"BACKEND-V120", baseMadreSyncBy:email};
    await db.collection("presupuestos").doc(p.id).set(mark, {merge:true});
    if (p.obraId) await db.collection("obras").doc(p.obraId).set(mark, {merge:true});
    return res.json({ok:true, row:rowNumber, updated:found >= 0, payload, actual:{fecha:actual[0], semana:actual[1], ot:actual[2], descripcion:actual[3], contacto:actual[4], cliente:actual[5], neto:actual[6], bruto:actual[7], estado:actual[26]}});
  } catch (error) {
    console.error("Base Madre V120", error);
    return res.status(error.status || 502).json({ok:false, error:error.message || "No se pudo sincronizar la Base Madre"});
  }
});
