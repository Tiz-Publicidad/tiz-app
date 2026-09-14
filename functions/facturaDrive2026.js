"use strict";

const { google } = require("googleapis");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const { defineString } = require("firebase-functions/params");

// Carpeta fiscal general. Nunca usar la carpeta de una OT para comprobantes fiscales.
const FACTURAS_2026_FOLDER_ID = "1XYk0vAIsGZCAiJ4s7TGyQYJdVBYvYdGy";
const issuerRazonSocial = defineString("ARCA_ISSUER_RAZON_SOCIAL", {default:"SixSigma SRL"});
const issuerNombreFantasia = defineString("ARCA_ISSUER_NOMBRE_FANTASIA", {default:"TIZ Publicidad"});
const issuerDomicilio = defineString("ARCA_ISSUER_DOMICILIO", {default:""});
const issuerCondicionIva = defineString("ARCA_ISSUER_CONDICION_IVA", {default:"Responsable Inscripto"});

const safe = value => String(value || "").replace(/[\\/:*?"<>|]+/g," ").replace(/\s+/g," ").trim();
const money = value => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:2}).format(Number(value)||0);

function qrUrl(factura, issuerCuit) {
  const payload = {
    ver:1,
    fecha:factura.fecha,
    cuit:Number(String(issuerCuit||"").replace(/\D/g,"")),
    ptoVta:Number(factura.ptoVta),
    tipoCmp:Number(factura.cbteTipo),
    nroCmp:Number(factura.cbteNro),
    importe:Number(factura.total),
    moneda:"PES",
    ctz:1,
    tipoDocRec:80,
    nroDocRec:Number(String(factura.cuit||"").replace(/\D/g,"")),
    tipoCodAut:"E",
    codAut:Number(factura.cae)
  };
  return "https://www.arca.gob.ar/fe/qr/?p=" + Buffer.from(JSON.stringify(payload)).toString("base64");
}

function pdfBuffer(factura, obra, issuerCuit) {
  return new Promise(async (resolve,reject)=>{
    try {
      const doc = new PDFDocument({size:"A4",margin:42,bufferPages:true});
      const chunks=[];doc.on("data",c=>chunks.push(c));doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject);
      const razon=issuerRazonSocial.value()||"SixSigma SRL";
      const fantasia=issuerNombreFantasia.value()||"TIZ Publicidad";
      const domicilio=issuerDomicilio.value()||"";
      const condicion=issuerCondicionIva.value()||"Responsable Inscripto";
      const qr = await QRCode.toDataURL(qrUrl(factura,issuerCuit),{margin:0,width:180});
      const qrBytes=Buffer.from(qr.split(",")[1],"base64");
      doc.fontSize(18).text(fantasia);
      if(normName(razon)!==normName(fantasia)) doc.fontSize(10).text(`Razón social: ${razon}`);
      doc.fontSize(9).text(domicilio);
      doc.text(`CUIT: ${issuerCuit} · ${condicion}`);
      doc.moveDown(.7);
      doc.rect(40,116,515,74).stroke();
      doc.fontSize(16).text(factura.tipo||"Comprobante",52,130);
      doc.fontSize(11).text(`PV ${String(factura.ptoVta).padStart(5,"0")} · N° ${String(factura.cbteNro).padStart(8,"0")}`,52,156);
      doc.text(`Fecha: ${factura.fecha||""}`,360,130);
      doc.text(`CAE: ${factura.cae||""}`,360,150);
      doc.text(`Vto. CAE: ${factura.caeVto||""}`,360,168);
      doc.fontSize(10).text(`Cliente: ${factura.cliente||obra.cliente||""}`,42,208);
      doc.text(`CUIT receptor: ${factura.cuit||""}`);
      const ot=String(obra.ot||"").replace(/^0+/,"");
      if(ot||obra.desc||obra.descripcion) doc.text(`OT: ${ot} · ${obra.desc||obra.descripcion||""}`);
      if(factura.asociado?.numeroCompleto) doc.text(`Comprobante asociado: ${factura.asociado.tipo||""} ${factura.asociado.numeroCompleto}`);
      const items=Array.isArray(factura.items)?factura.items:[];
      doc.fontSize(9).text("DETALLE",42,270);let y=288;
      items.slice(0,30).forEach((it,i)=>{const desc=safe(it.descripcion||it.desc||`Ítem ${i+1}`),cant=Number(it.cantidad||1),unit=Number(it.unitario||0);doc.text(desc,42,y,{width:300});doc.text(String(cant),352,y,{width:45,align:"right"});doc.text(money(unit),405,y,{width:70,align:"right"});doc.text(money(cant*unit),480,y,{width:75,align:"right"});y+=Math.max(18,doc.heightOfString(desc,{width:300})+6);if(y>620){doc.addPage();y=70;}});
      y=Math.max(y+12,520);doc.fontSize(10).text(`Neto: ${money(factura.neto)}`,380,y,{width:175,align:"right"});y+=18;doc.text(`IVA: ${money(factura.iva)}`,380,y,{width:175,align:"right"});y+=18;doc.fontSize(12).text(`TOTAL: ${money(factura.total)}`,380,y,{width:175,align:"right"});doc.image(qrBytes,42,y-12,{width:105,height:105});doc.fontSize(7).text("Comprobante autorizado por ARCA. Código QR según especificación vigente.",42,y+98,{width:280});doc.end();
    } catch(e){reject(e);}
  });
}
function normName(v){return String(v||"").toLowerCase().replace(/[^a-z0-9]+/g,"");}
function qEscape(v){return String(v||"").replace(/\\/g,"\\\\").replace(/'/g,"\\'");}

async function archivarFacturaPdfEnDrive({factura,obra,issuerCuit}) {
  const auth=new google.auth.GoogleAuth({scopes:["https://www.googleapis.com/auth/drive"]});
  const drive=google.drive({version:"v3",auth});
  const ot=String(obra.ot||"").match(/\d{4,7}/)?.[0].replace(/^0+/,"")||"";
  const desc=safe(obra.desc||obra.descripcion||"").slice(0,70);
  const fileName=`${String(factura.ptoVta).padStart(5,"0")}_${String(factura.cbteNro).padStart(8,"0")} - ${safe(factura.cliente||obra.cliente||`CUIT ${factura.cuit||''}`)}${ot?` - OT ${ot}`:""}${desc?` - ${desc}`:""}.pdf`;
  // Evita duplicar PDFs cuando se reintenta el archivado luego de un error de red.
  const existing=await drive.files.list({q:`'${FACTURAS_2026_FOLDER_ID}' in parents and name='${qEscape(fileName)}' and trashed=false`,fields:"files(id,name,webViewLink,parents)",pageSize:5,supportsAllDrives:true,includeItemsFromAllDrives:true}).catch(()=>({data:{files:[]}}));
  const hit=existing.data?.files?.[0];
  if(hit) return {fileId:hit.id,fileName:hit.name,webViewLink:hit.webViewLink||`https://drive.google.com/file/d/${hit.id}/view`,folderId:FACTURAS_2026_FOLDER_ID,reused:true};
  const pdf=await pdfBuffer(factura,obra,issuerCuit);
  const {Readable}=require("stream");
  const response=await drive.files.create({requestBody:{name:fileName,parents:[FACTURAS_2026_FOLDER_ID],mimeType:"application/pdf"},media:{mimeType:"application/pdf",body:Readable.from(pdf)},fields:"id,name,webViewLink,parents",supportsAllDrives:true});
  return {fileId:response.data.id,fileName:response.data.name,webViewLink:response.data.webViewLink||`https://drive.google.com/file/d/${response.data.id}/view`,folderId:FACTURAS_2026_FOLDER_ID,reused:false};
}

module.exports={FACTURAS_2026_FOLDER_ID,issuerRazonSocial,issuerNombreFantasia,issuerDomicilio,issuerCondicionIva,archivarFacturaPdfEnDrive,qrUrl,pdfBuffer};
