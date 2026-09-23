"use strict";

const { google } = require("googleapis");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const { defineString } = require("firebase-functions/params");

const FACTURAS_2026_FOLDER_ID = "1XYk0vAIsGZCAiJ4s7TGyQYJdVBYvYdGy";
const issuerRazonSocial = defineString("ARCA_ISSUER_RAZON_SOCIAL", {
  default: "SixSigma SRL",
});
const issuerNombreFantasia = defineString("ARCA_ISSUER_NOMBRE_FANTASIA", {
  default: "TIZ Publicidad",
});
const issuerDomicilio = defineString("ARCA_ISSUER_DOMICILIO", { default: "" });
const issuerCondicionIva = defineString("ARCA_ISSUER_CONDICION_IVA", {
  default: "Responsable Inscripto",
});
const TIZ_LOGO_PATH = path.join(__dirname, "assets", "tiz-logo-factura.png");

const safe = (value) =>
  String(value || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const n = (value) => Number(value) || 0;
const money = (value) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n(value));
const fmtDate = (value) => {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value || "");
};

function qrUrl(factura, issuerCuit) {
  const payload = {
    ver: 1,
    fecha: factura.fecha,
    cuit: Number(String(issuerCuit || "").replace(/\D/g, "")),
    ptoVta: Number(factura.ptoVta),
    tipoCmp: Number(factura.cbteTipo),
    nroCmp: Number(factura.cbteNro),
    importe: Number(factura.total),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: 80,
    nroDocRec: Number(String(factura.cuit || "").replace(/\D/g, "")),
    tipoCodAut: "E",
    codAut: Number(factura.cae),
  };
  return (
    "https://www.arca.gob.ar/fe/qr/?p=" +
    Buffer.from(JSON.stringify(payload)).toString("base64")
  );
}

function line(doc, x1, y1, x2, y2, w = 0.7) {
  doc.lineWidth(w).moveTo(x1, y1).lineTo(x2, y2).stroke();
}
function labelValue(doc, label, value, x, y, width = 230) {
  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text(label, x, y, { continued: true });
  doc.font("Helvetica").text(` ${value || ""}`, { width });
}
function tipoInfo(factura) {
  const letra = String(
    factura.letra || (/\bB\b/i.test(factura.tipo || "") ? "B" : "A"),
  ).toUpperCase();
  const cod = String(Number(factura.cbteTipo) || 1).padStart(2, "0");
  const titulo = String(factura.tipo || "Factura")
    .replace(/\s+[AB]$/i, "")
    .toUpperCase();
  return { letra, cod, titulo };
}
function condicionIvaReceptor(id) {
  return (
    {
      1: "IVA Responsable Inscripto",
      4: "IVA Exento",
      5: "Consumidor Final",
      6: "Responsable Monotributo",
    }[Number(id)] || "IVA Responsable Inscripto"
  );
}

function pdfBuffer(factura, obra, issuerCuit) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 0,
        bufferPages: true,
        info: {
          Title: `${factura.tipo || "Factura"} ${factura.numeroCompleto || ""}`,
          Author: "SixSigma SRL",
        },
      });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      const razon = issuerRazonSocial.value() || "SixSigma SRL";
      const domicilio = issuerDomicilio.value() || "";
      const condicion = issuerCondicionIva.value() || "Responsable Inscripto";
      const { letra, cod, titulo } = tipoInfo(factura);
      const qr = await QRCode.toDataURL(qrUrl(factura, issuerCuit), {
        margin: 0,
        width: 220,
      });
      const qrBytes = Buffer.from(qr.split(",")[1], "base64");
      const left = 28,
        right = 567,
        width = right - left,
        mid = 296;

      doc
        .font("Helvetica-Bold")
        .fontSize(factura.preview ? 10 : 14)
        .fillColor(factura.preview ? "#df2074" : "#111")
        .text(
          factura.preview ? "PREVIEW - SIN VALIDEZ FISCAL" : "ORIGINAL",
          left,
          24,
          { width, align: "center" },
        );
      doc.fillColor("#111");
      line(doc, left, 42, right, 42);
      line(doc, left, 20, right, 20);
      line(doc, left, 20, left, 282);
      line(doc, right, 20, right, 282);
      line(doc, left, 172, right, 172);
      line(doc, left, 202, right, 202);
      line(doc, left, 282, right, 282);

      if (fs.existsSync(TIZ_LOGO_PATH))
        doc.image(TIZ_LOGO_PATH, left + 18, 51, {
          fit: [78, 54],
          align: "center",
          valign: "center",
        });
      labelValue(doc, "Razón Social:", razon, left + 8, 112, 245);
      labelValue(doc, "Domicilio Comercial:", domicilio, left + 8, 134, 245);
      labelValue(
        doc,
        "Condición frente al IVA:",
        `IVA ${condicion}`,
        left + 8,
        153,
        245,
      );

      doc.rect(mid - 28, 48, 56, 57).stroke();
      doc
        .font("Helvetica-Bold")
        .fontSize(24)
        .text(letra, mid - 28, 54, { width: 56, align: "center" });
      doc
        .font("Helvetica-Bold")
        .fontSize(6.5)
        .text(`COD. ${cod}`, mid - 28, 85, { width: 56, align: "center" });
      doc
        .font("Helvetica-Bold")
        .fontSize(19)
        .text(titulo, mid + 42, 59, { width: 220 });
      labelValue(
        doc,
        "Punto de Venta:",
        String(factura.ptoVta || 0).padStart(5, "0"),
        mid + 42,
        102,
        210,
      );
      labelValue(
        doc,
        "Comp. Nro:",
        String(factura.cbteNro || 0).padStart(8, "0"),
        mid + 155,
        102,
        95,
      );
      labelValue(
        doc,
        "Fecha de Emisión:",
        fmtDate(factura.fecha),
        mid + 42,
        122,
        210,
      );
      labelValue(doc, "CUIT:", issuerCuit, mid + 42, 145, 210);

      const fDesde = fmtDate(factura.fecha),
        fHasta = fmtDate(factura.fecha),
        fPago = fmtDate(factura.fechaPrevistaCobro || factura.fecha);
      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .text("Período Facturado Desde:", left + 8, 181);
      doc.font("Helvetica").text(fDesde, left + 132, 181);
      doc.font("Helvetica-Bold").text("Hasta:", left + 240, 181);
      doc.font("Helvetica").text(fHasta, left + 276, 181);
      doc
        .font("Helvetica-Bold")
        .text("Fecha de Vto. para el pago:", left + 372, 181);
      doc.font("Helvetica").text(fPago, left + 500, 181);

      const cliente = factura.cliente || obra.cliente || "";
      doc
        .save()
        .fillColor("#eeeeee")
        .rect(left + 0.5, 202.5, width - 1, 16)
        .fill()
        .restore();
      doc
        .font("Helvetica-Bold")
        .fillColor("#111")
        .fontSize(7)
        .text("DATOS DEL RECEPTOR", left + 8, 207, { width: width - 16 });
      labelValue(doc, "CUIT:", factura.cuit, left + 8, 226, 185);
      labelValue(
        doc,
        "Apellido y Nombre / Razón Social:",
        cliente,
        left + 195,
        226,
        350,
      );
      labelValue(
        doc,
        "Domicilio:",
        factura.domicilioFiscal ||
          obra.clienteDomicilioFiscal ||
          obra.domicilioFiscal ||
          "",
        left + 8,
        246,
        520,
      );
      labelValue(
        doc,
        "Condición frente al IVA:",
        condicionIvaReceptor(factura.condicionIVAReceptorId),
        left + 8,
        266,
        275,
      );
      const ot = String(obra.ot || "").replace(/^0+/, "");
      const ref = [ot ? `OT ${ot}` : "", obra.desc || obra.descripcion || ""]
        .filter(Boolean)
        .join(" - ");
      if (ref)
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(ref, left + 290, 266, {
