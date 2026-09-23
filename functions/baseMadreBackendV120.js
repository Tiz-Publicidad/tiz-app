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
async function findObra(db, requestedOt, obraId) {
  if (obraId) {
    const direct = await db.collection("obras").doc(text(obraId)).get();
    if (direct.exists) return {id:direct.id, ...direct.data()};
  }
  const snap = await db.collection("obras").limit(2500).get();
  return snap.docs.map((doc) => ({id:doc.id, ...doc.data()}))
    .find((o) => otBase(o.ot || o.nroCotizacion || o.infoPresupuesto?.nro) === requestedOt) || null;
}
function dateIso(value) {
  const raw = text(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0,10);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return "";
  let year = Number(match[3]); if (year < 100) year += 2000;
  return `${year}-${String(match[2]).padStart(2,"0")}-${String(match[1]).padStart(2,"0")}`;
}
function sheetDate(value) {
  const iso = dateIso(value); if (!iso) return "";
  const [year,month,day] = iso.split("-"); return `${day}/${month}/${year}`;
}
function weekFromDate(value) {
  const iso = dateIso(value); if (!iso) return "";
  const [year,month,day] = iso.split("-").map(Number);
  return isoWeek(new Date(year, month - 1, day));
}
function invoiceNumber(invoice = {}) { return text(invoice.numeroCompleto || invoice.nroFactura || invoice.numero || invoice.cbteNro); }
function invoicesFrom(obra = {}) {
  const all = [
    ...(Array.isArray(obra.comprobantesArca) ? obra.comprobantesArca : []),
    ...(Array.isArray(obra.facturasArca) ? obra.facturasArca : []),
    ...(Array.isArray(obra.facturasManual) ? obra.facturasManual : []),
  ];
  if (obra.facturaArca) all.push(obra.facturaArca);
  const seen = new Set();
  return all.filter((invoice) => {
    const key = invoiceNumber(invoice).replace(/\D/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a,b) => dateIso(a.fecha).localeCompare(dateIso(b.fecha)));
}
async function syncBilling({db, sheets, requestedOt, obraId, email}) {
  const obra = await findObra(db, requestedOt, obraId);
  if (!obra) throw Object.assign(new Error(`No se encontró la obra ${requestedOt}`), {status:404});
  const lookup = await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID, range:`'${SHEET}'!C3:C1954`});
  const found = (lookup.data.values || []).findIndex((row) => otBase(row?.[0]) === requestedOt);
  if (found < 0) throw Object.assign(new Error(`La OT ${requestedOt} todavía no existe en Base de datos`), {status:409});
  const rowNumber = found + 3;
  const invoices = invoicesFrom(obra);
  const payments = Array.isArray(obra.cobros) ? obra.cobros : [];
  const lastInvoice = invoices[invoices.length - 1] || {};
  const lastPayment = [...payments].sort((a,b) => dateIso(a.fecha).localeCompare(dateIso(b.fecha))).pop() || {};
  const due = invoices.map((x) => dateIso(x.fechaPrevistaCobro || x.fechaVencimientoPago)).filter(Boolean).sort()[0]
    || dateIso(obra.fechaPrevistaCobro || obra.finanzas?.fechaPrevistaCobro);
  const numbers = invoices.map(invoiceNumber).filter(Boolean).join(" / ") || text(obra.nrfc);
  const paid = payments.reduce((sum,p) => sum + num(p.importe) + num(p.retenciones), 0);
  const invoiced = invoices.reduce((sum,invoice) => sum + num(invoice.total || invoice.neto), 0);
  const data = [];
  if (numbers) data.push({range:`'${SHEET}'!T${rowNumber}:U${rowNumber}`, values:[[sheetDate(lastInvoice.fecha || obra.ffc), numbers]]});
  if (due) data.push({range:`'${SHEET}'!V${rowNumber}:W${rowNumber}`, values:[[sheetDate(due), weekFromDate(due)]]});
  if (lastPayment.fecha) data.push({range:`'${SHEET}'!X${rowNumber}`, values:[[weekFromDate(lastPayment.fecha)]]});
  if (invoiced > 0 && paid >= invoiced - 0.01) data.push({range:`'${SHEET}'!AA${rowNumber}`, values:[["Cobrado"]]});
  else if (paid > 0) data.push({range:`'${SHEET}'!AA${rowNumber}`, values:[["Cobrado pendiente"]]});
  if (data.length) await sheets.spreadsheets.values.batchUpdate({spreadsheetId:SPREADSHEET_ID, requestBody:{valueInputOption:"USER_ENTERED", data}});
  const signature = [numbers, lastInvoice.fecha || obra.ffc || "", due, payments.length, paid, obra.cobranzaEstadoManual || "", obra.estadoGestionFactCob || ""].join("|");
  const mark = {baseMadreFactCobSyncAt:new Date().toISOString(), baseMadreFactCobSignature:signature, baseMadreRow:rowNumber, baseMadreFactCobSyncVersion:"BACKEND-V121", baseMadreFactCobSyncBy:email};
  await db.collection("obras").doc(obra.id).set(mark, {merge:true});
  return {ok:true, row:rowNumber, mode:"billing", updated:data.length > 0, numeroFactura:numbers};
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
    const auth = new google.auth.GoogleAuth({scopes:["https://www.googleapis.com/auth/spreadsheets"]});
    const sheets = google.sheets({version:"v4", auth});
    if (text(req.body?.mode).toLowerCase() === "billing") {
      return res.json(await syncBilling({db, sheets, requestedOt, obraId:req.body?.obraId, email}));
    }
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
