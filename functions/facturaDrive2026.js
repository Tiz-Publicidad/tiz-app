"use strict";

const { google } = require("googleapis");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const { defineString } = require("firebase-functions/params");

const FACTURAS_2026_FOLDER_ID = "1XYk0vAIsGZCAiJ4s7TGyQYJdVBYvYdGy";
const issuerRazonSocial = defineString("ARCA_ISSUER_RAZON_SOCIAL", {default:"SixSigma SRL"});
const issuerNombreFantasia = defineString("ARCA_ISSUER_NOMBRE_FANTASIA", {default:"TIZ Publicidad"});
const issuerDomicilio = defineString("ARCA_ISSUER_DOMICILIO", {default:""});
const issuerCondicionIva = defineString("ARCA_ISSUER_CONDICION_IVA", {default:"Responsable Inscripto"});
const TIZ_LOGO_PATH = path.join(__dirname,"assets","tiz-logo-factura.png");

const safe = value => String(value || "").replace(/[\\/:*?"<>|]+/g," ").replace(/\s+/g," ").trim();
const n = value => Number(value) || 0;
const money = value => new Intl.NumberFormat("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n(value));
const fmtDate = value => { const m=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}/${m[2]}/${m[1]}`:String(value||""); };

function qrUrl(factura, issuerCuit) {
  const payload = {
    ver:1, fecha:factura.fecha,
    cuit:Number(String(issuerCuit||"").replace(/\D/g,"")),
    ptoVta:Number(factura.ptoVta), tipoCmp:Number(factura.cbteTipo), nroCmp:Number(factura.cbteNro),
    importe:Number(factura.total), moneda:"PES", ctz:1, tipoDocRec:80,
    nroDocRec:Number(String(factura.cuit||"").replace(/\D/g,"")), tipoCodAut:"E", codAut:Number(factura.cae)
  };
  return "https://www.arca.gob.ar/fe/qr/?p=" + Buffer.from(JSON.stringify(payload)).toString("base64");
}

function line(doc,x1,y1,x2,y2,w=.7){doc.lineWidth(w).moveTo(x1,y1).lineTo(x2,y2).stroke();}
function labelValue(doc,label,value,x,y,width=230){doc.font("Helvetica-Bold").fontSize(7.5).text(label,x,y,{continued:true});doc.font("Helvetica").text(` ${value||""}`,{width});}
function tipoInfo(factura){
  const letra=String(factura.letra||(/\bB\b/i.test(factura.tipo||"")?"B":"A")).toUpperCase();
  const cod=String(Number(factura.cbteTipo)||1).padStart(2,"0");
  const titulo=String(factura.tipo||"Factura").replace(/\s+[AB]$/i,"").toUpperCase();
  return {letra,cod,titulo};
}
function condicionIvaReceptor(id){
  return ({1:"IVA Responsable Inscripto",4:"IVA Exento",5:"Consumidor Final",6:"Responsable Monotributo"})[Number(id)]||"IVA Responsable Inscripto";
}

function pdfBuffer(factura, obra, issuerCuit) {
  return new Promise(async (resolve,reject)=>{
    try {
      const doc = new PDFDocument({size:"A4",margin:0,bufferPages:true,info:{Title:`${factura.tipo||"Factura"} ${factura.numeroCompleto||""}`,Author:"SixSigma SRL"}});
      const chunks=[]; doc.on("data",c=>chunks.push(c)); doc.on("end",()=>resolve(Buffer.concat(chunks))); doc.on("error",reject);
      const razon=issuerRazonSocial.value()||"SixSigma SRL";
      const domicilio=issuerDomicilio.value()||"";
      const condicion=issuerCondicionIva.value()||"Responsable Inscripto";
      const {letra,cod,titulo}=tipoInfo(factura);
      const qr = await QRCode.toDataURL(qrUrl(factura,issuerCuit),{margin:0,width:220});
      const qrBytes=Buffer.from(qr.split(",")[1],"base64");
      const left=28,right=567,width=right-left,mid=296;

      doc.font("Helvetica-Bold").fontSize(factura.preview?10:14).fillColor(factura.preview?"#df2074":"#111").text(factura.preview?"PREVIEW - SIN VALIDEZ FISCAL":"ORIGINAL",left,24,{width,align:"center"});
      doc.fillColor("#111");
      line(doc,left,42,right,42); line(doc,left,20,right,20); line(doc,left,20,left,262); line(doc,right,20,right,262);
      line(doc,left,172,right,172); line(doc,left,202,right,202); line(doc,left,262,right,262);

      if(fs.existsSync(TIZ_LOGO_PATH))doc.image(TIZ_LOGO_PATH,left+18,51,{fit:[78,54],align:"center",valign:"center"});
      doc.font("Helvetica-Bold").fontSize(8).text(razon,left+116,78,{width:mid-left-126,align:"left"});
      labelValue(doc,"Razón Social:",razon,left+8,112,245);
      labelValue(doc,"Domicilio Comercial:",domicilio,left+8,134,245);
      labelValue(doc,"Condición frente al IVA:",`IVA ${condicion}`,left+8,153,245);

      doc.rect(mid-28,48,56,57).stroke();
      doc.font("Helvetica-Bold").fontSize(24).text(letra,mid-28,54,{width:56,align:"center"});
      doc.font("Helvetica-Bold").fontSize(6.5).text(`COD. ${cod}`,mid-28,85,{width:56,align:"center"});
      doc.font("Helvetica-Bold").fontSize(19).text(titulo,mid+42,59,{width:220});
      labelValue(doc,"Punto de Venta:",String(factura.ptoVta||0).padStart(5,"0"),mid+42,102,210);
      labelValue(doc,"Comp. Nro:",String(factura.cbteNro||0).padStart(8,"0"),mid+155,102,95);
      labelValue(doc,"Fecha de Emisión:",fmtDate(factura.fecha),mid+42,122,210);
      labelValue(doc,"CUIT:",issuerCuit,mid+42,145,210);

      const fDesde=fmtDate(factura.fecha),fHasta=fmtDate(factura.fecha),fPago=fmtDate(factura.fechaPrevistaCobro||factura.fecha);
      doc.font("Helvetica-Bold").fontSize(7.5).text("Período Facturado Desde:",left+8,181); doc.font("Helvetica").text(fDesde,left+132,181);
      doc.font("Helvetica-Bold").text("Hasta:",left+240,181); doc.font("Helvetica").text(fHasta,left+276,181);
      doc.font("Helvetica-Bold").text("Fecha de Vto. para el pago:",left+372,181); doc.font("Helvetica").text(fPago,left+500,181);

      const cliente=factura.cliente||obra.cliente||"";
      doc.save().fillColor("#eeeeee").rect(left+.5,202.5,width-1,16).fill().restore();
      doc.font("Helvetica-Bold").fillColor("#111").fontSize(7).text("DATOS DEL RECEPTOR",left+8,207,{width:width-16});
      labelValue(doc,"CUIT:",factura.cuit,left+8,226,185);
      labelValue(doc,"Apellido y Nombre / Razón Social:",cliente,left+195,226,350);
      labelValue(doc,"Condición frente al IVA:",condicionIvaReceptor(factura.condicionIVAReceptorId),left+8,246,275);
      const ot=String(obra.ot||"").replace(/^0+/,"");
      const ref=[ot?`OT ${ot}`:"",obra.desc||obra.descripcion||""].filter(Boolean).join(" - ");
      if(ref) doc.font("Helvetica").fontSize(6.5).text(ref,left+290,246,{width:260,height:13,ellipsis:true});

      let y=290;
      const cols=[left,left+34,left+214,left+252,left+292,left+347,left+382,left+427,left+467,right];
      const headers=["Código","Producto / Servicio","Cantidad","U. medida","Precio Unit.","% Bonif","Subtotal","Alícuota IVA","Subtotal c/IVA"];
      doc.save().fillColor("#d9d9d9").rect(left,y,width,20).fill().restore();
      doc.strokeColor("#555").rect(left,y,width,20).stroke();
      for(let i=1;i<cols.length-1;i++) line(doc,cols[i],y,cols[i],y+20,.4);
      headers.forEach((h,i)=>doc.font("Helvetica-Bold").fontSize(6).fillColor("#111").text(h,cols[i]+2,y+5,{width:cols[i+1]-cols[i]-4,align:i>1?"center":"left"}));
      y+=25;

      const items=Array.isArray(factura.items)?factura.items:[];
      const ivaPct=String(factura.alicuota)==="exento"?0:n(factura.alicuota);
      items.slice(0,40).forEach((it,i)=>{
        const desc=safe(it.descripcion||it.desc||`Ítem ${i+1}`),cant=n(it.cantidad)||1,unit=n(it.unitario),sub=cant*unit,totalItem=sub*(1+ivaPct/100);
        const h=Math.max(18,doc.heightOfString(desc,{width:194})+6);
        if(y+h>560){doc.addPage();y=55;}
        doc.font("Helvetica").fontSize(6.2).fillColor("#111");
        doc.text(String(i+1).padStart(4,"0"),cols[0]+2,y+3,{width:34});
        doc.text(desc,cols[1]+2,y+3,{width:cols[2]-cols[1]-4});
        doc.text(cant.toFixed(2).replace(".",","),cols[2]+2,y+3,{width:cols[3]-cols[2]-4,align:"right"});
        doc.text("unidades",cols[3]+2,y+3,{width:cols[4]-cols[3]-4,align:"center"});
        doc.text(money(unit),cols[4]+2,y+3,{width:cols[5]-cols[4]-4,align:"right"});
        doc.text("0,00",cols[5]+2,y+3,{width:cols[6]-cols[5]-4,align:"right"});
        doc.text(money(sub),cols[6]+2,y+3,{width:cols[7]-cols[6]-4,align:"right"});
        doc.text(String(factura.alicuota)==="exento"?"Exento":`${ivaPct}%`,cols[7]+2,y+3,{width:cols[8]-cols[7]-4,align:"center"});
        doc.text(money(totalItem),cols[8]+2,y+3,{width:cols[9]-cols[8]-4,align:"right"});
        y+=h;
      });

      let totalsTop=Math.max(y+18,570);
      if(totalsTop>590){doc.addPage();totalsTop=55;}
      doc.rect(left,totalsTop,width,128).stroke();
      const tx=385, valx=478;
      const rows=[
        ["Importe Otros Tributos:",0],
        ["Importe Neto Gravado:",factura.neto],
        ["IVA 27%:",ivaPct===27?factura.iva:0],
        ["IVA 21%:",ivaPct===21?factura.iva:0],
        ["IVA 10.5%:",ivaPct===10.5?factura.iva:0],
        ["IVA 5%:",ivaPct===5?factura.iva:0],
        ["IVA 2.5%:",ivaPct===2.5?factura.iva:0],
        ["IVA 0%:",ivaPct===0?factura.iva:0],
        ["Importe Total:",factura.total]
      ];
      rows.forEach((r,i)=>{const yy=totalsTop+12+i*12;doc.font(i===rows.length-1?"Helvetica-Bold":"Helvetica-Bold").fontSize(i===rows.length-1?8:7.2).text(r[0],tx,yy,{width:90,align:"right"});doc.font("Helvetica-Bold").text(`$ ${money(r[1])}`,valx,yy,{width:72,align:"right"});});

      const foot=totalsTop+145;
      doc.image(qrBytes,left+10,foot,{width:82,height:82});
      doc.font("Helvetica-Bold").fontSize(16).text("ARCA",left+105,foot+12);
      doc.font("Helvetica").fontSize(5.5).text("AGENCIA DE RECAUDACIÓN Y CONTROL ADUANERO",left+105,foot+31,{width:150});
      doc.font("Helvetica-BoldOblique").fontSize(7).text("Comprobante Autorizado",left+105,foot+52,{width:170});
      doc.font("Helvetica").fontSize(5.5).text("Este comprobante fue autorizado electrónicamente por ARCA.",left+105,foot+66,{width:210});
      doc.font("Helvetica-Bold").fontSize(8).text("CAE N°:",390,foot+18,{width:70,align:"right"});doc.font("Helvetica").text(String(factura.cae||""),465,foot+18,{width:90});
      doc.font("Helvetica-Bold").text("Fecha de Vto. de CAE:",350,foot+38,{width:110,align:"right"});doc.font("Helvetica").text(fmtDate(factura.caeVto),465,foot+38,{width:90});
      doc.font("Helvetica-Bold").fontSize(7.5).text("Pág. 1/1",270,foot+20,{width:70,align:"center"});
      if(factura.asociado?.numeroCompleto) doc.font("Helvetica").fontSize(6).text(`Comprobante asociado: ${factura.asociado.tipo||""} ${factura.asociado.numeroCompleto}`,350,foot+62,{width:205,align:"right"});
      doc.end();
    } catch(e){reject(e);}
  });
}
function normName(v){return String(v||"").toLowerCase().replace(/[^a-z0-9]+/g,"");}
function qEscape(v){return String(v||"").replace(/\\/g,"\\\\").replace(/'/g,"\\'");}

function driveClient(accessToken) {
  const token=String(accessToken||"").trim();
  if(token){const auth=new google.auth.OAuth2();auth.setCredentials({access_token:token});return google.drive({version:"v3",auth});}
  const auth=new google.auth.GoogleAuth({scopes:["https://www.googleapis.com/auth/drive"]});
  return google.drive({version:"v3",auth});
}

async function archivarFacturaPdfEnDrive({factura,obra,issuerCuit,accessToken}) {
  const drive=driveClient(accessToken);
  const ot=String(obra.ot||"").match(/\d{4,7}/)?.[0].replace(/^0+/,"")||"";
  const desc=safe(obra.desc||obra.descripcion||"").slice(0,70);
  const fileName=`${String(factura.ptoVta).padStart(5,"0")}_${String(factura.cbteNro).padStart(8,"0")} - ${safe(factura.cliente||obra.cliente||`CUIT ${factura.cuit||''}`)}${ot?` - OT ${ot}`:""}${desc?` - ${desc}`:""}.pdf`;
  const existing=await drive.files.list({q:`'${FACTURAS_2026_FOLDER_ID}' in parents and name='${qEscape(fileName)}' and trashed=false`,fields:"files(id,name,webViewLink,parents)",pageSize:5,supportsAllDrives:true,includeItemsFromAllDrives:true}).catch(()=>({data:{files:[]}}));
  const hit=existing.data?.files?.[0];
  if(hit) return {fileId:hit.id,fileName:hit.name,webViewLink:hit.webViewLink||`https://drive.google.com/file/d/${hit.id}/view`,folderId:FACTURAS_2026_FOLDER_ID,reused:true,authMode:accessToken?"usuario":"service-account"};
  const pdf=await pdfBuffer(factura,obra,issuerCuit);
  const {Readable}=require("stream");
  const response=await drive.files.create({requestBody:{name:fileName,parents:[FACTURAS_2026_FOLDER_ID],mimeType:"application/pdf"},media:{mimeType:"application/pdf",body:Readable.from(pdf)},fields:"id,name,webViewLink,parents",supportsAllDrives:true});
  return {fileId:response.data.id,fileName:response.data.name,webViewLink:response.data.webViewLink||`https://drive.google.com/file/d/${response.data.id}/view`,folderId:FACTURAS_2026_FOLDER_ID,reused:false,authMode:accessToken?"usuario":"service-account"};
}

module.exports={FACTURAS_2026_FOLDER_ID,issuerRazonSocial,issuerNombreFantasia,issuerDomicilio,issuerCondicionIva,archivarFacturaPdfEnDrive,qrUrl,pdfBuffer};
