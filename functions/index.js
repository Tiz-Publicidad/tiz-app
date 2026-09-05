"use strict";

const admin = require("firebase-admin");
const forge = require("node-forge");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const certificatePem = defineSecret("ARCA_CERTIFICATE_PEM");
const privateKeyPem = defineSecret("ARCA_PRIVATE_KEY_PEM");
const prodCertificatePem = defineSecret("ARCA_PROD_CERTIFICATE_PEM");
const prodPrivateKeyPem = defineSecret("ARCA_PROD_PRIVATE_KEY_PEM");
const issuerCuit = defineSecret("ARCA_ISSUER_CUIT");
const allowedEmails = defineSecret("ARCA_ALLOWED_EMAILS");
const facturasWebhookSecret = defineSecret("TIZ_FACTURAS_SECRET");
const facturasCbu = defineSecret("TIZ_FACTURAS_CBU");

const ALLOWED_ORIGINS = new Set(["https://tiz-publicidad.github.io", "http://localhost:5000", "http://127.0.0.1:5000"]);
const WSAA_URL = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";
const WSFE_URL = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
const WSAA_PROD_URL = "https://wsaa.afip.gov.ar/ws/services/LoginCms";
const WSFE_PROD_URL = "https://servicios1.afip.gov.ar/wsfev1/service.asmx";
const FACTURAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbx_Uy_ijUG38rht-m-Xp-y9Eou8WzoG4jepXi1GqJaHAknwQsQd-rQgYcQ1ucrAJPlK/exec";

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
function pointsOfSale(xml) {
  const nested = [...xml.matchAll(/<(?:\w+:)?PtoVenta(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?PtoVenta>/gi)]
    .map((match) => Number(tag(match[1], "Nro")))
    .filter(Number.isFinite)
    .filter((value) => value > 0);
  const direct = [...xml.matchAll(/<(?:\w+:)?PtoVta(?:\s[^>]*)?>(\d+)<\/(?:\w+:)?PtoVta>/gi)]
    .map((match) => Number(match[1]));
  return [...new Set([...nested, ...direct])].sort((a, b) => a-b);
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
  const fault = tag(text, "faultstring");
  if (fault) throw new Error(`ARCA: ${fault}`);
  if (!response.ok) {
    const safeDetail = tag(text,"Message") || tag(text,"Error") || tag(text,"description");
    throw new Error(`ARCA respondió HTTP ${response.status}${safeDetail?`: ${safeDetail}`:""}`);
  }
  return text;
}
async function loginWsaa(wsaaUrl = WSAA_URL, certSecret = certificatePem, keySecret = privateKeyPem) {
  const cms = signCms(createTra(), certSecret.value(), keySecret.value());
  const envelope = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><in0>${cms}</in0></loginCms></soapenv:Body></soapenv:Envelope>`;
  const response = await soap(wsaaUrl, "", envelope);
  const result = tag(response, "loginCmsReturn");
  const token = tag(result, "token"), sign = tag(result, "sign"), expirationTime = tag(result, "expirationTime");
  if (!token || !sign) throw new Error("WSAA no devolvió credenciales válidas");
  return {token, sign, expirationTime};
}
async function wsfeCall(method, innerXml, credentials, wsfeUrl = WSFE_URL) {
  const auth = `<Auth><Token>${escapeXml(credentials.token)}</Token><Sign>${escapeXml(credentials.sign)}</Sign><Cuit>${escapeXml(issuerCuit.value())}</Cuit></Auth>`;
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${method} xmlns="http://ar.gov.afip.dif.FEV1/">${auth}${innerXml || ""}</${method}></soap:Body></soap:Envelope>`;
  return soap(wsfeUrl, `http://ar.gov.afip.dif.FEV1/${method}`, envelope);
}

exports.arcaProduccionStatus = onRequest({region:"us-central1", invoker:"public", secrets:[prodCertificatePem, prodPrivateKeyPem, issuerCuit, allowedEmails], timeoutSeconds:60}, async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ok:false,error:"Método no permitido"});
  try {
    const user = await requireAdmin(req);
    const credentials = await loginWsaa(WSAA_PROD_URL, prodCertificatePem, prodPrivateKeyPem);
    const dummyXml = await wsfeCall("FEDummy", "", credentials, WSFE_PROD_URL);
    const pointsXml = await wsfeCall("FEParamGetPtosVenta", "", credentials, WSFE_PROD_URL);
    const points = pointsOfSale(pointsXml), ptoVta = 9;
    let lastAuthorized = null, pointError = "";
    try {
      const lastXml = await wsfeCall("FECompUltimoAutorizado", `<PtoVta>${ptoVta}</PtoVta><CbteTipo>1</CbteTipo>`, credentials, WSFE_PROD_URL);
      const errors = [...lastXml.matchAll(/<(?:Msg|Obs)>([\s\S]*?)<\/(?:Msg|Obs)>/gi)].map(m=>decodeXml(m[1].trim())).filter(Boolean);
      if (errors.length) pointError = errors.join(" · ");
      else lastAuthorized = Number(tag(lastXml,"CbteNro") || 0);
    } catch (error) { pointError = error.message || String(error); }
    const ready = points.includes(ptoVta) && !pointError;
    return res.json({ok:true,ready,environment:"produccion",issuerCuit:issuerCuit.value(),operator:user.email,ptoVta,pointsOfSale:points,lastAuthorized,
      services:{app:tag(dummyXml,"AppServer")||"OK",db:tag(dummyXml,"DbServer")||"OK",auth:tag(dummyXml,"AuthServer")||"OK"},
      message:ready?"Producción lista para emitir":(pointError||"ARCA no informó el punto de venta 00009 para web services"),emissionEnabled:false});
  } catch (error) {
    console.error("ARCA production diagnostic failed", error);
    return res.status(error.status||502).json({ok:false,ready:false,error:error.message||"No se pudo validar ARCA producción"});
  }
});

exports.arcaProduccionEmitirOT4680 = onRequest({region:"us-central1", invoker:"public", secrets:[prodCertificatePem, prodPrivateKeyPem, issuerCuit, allowedEmails], timeoutSeconds:60}, async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ok:false,error:"Método no permitido"});
  const db = admin.firestore();
  let lockRef = null;
  try {
    const user = await requireAdmin(req);
    if (req.body?.confirmacion !== "EMITIR FACTURA REAL OT 4680") throw Object.assign(new Error("Falta la confirmación final de emisión"), {status:400});
    const obraId = String(req.body?.obraId || "").trim();
    if (!obraId) throw Object.assign(new Error("Falta identificar la obra"), {status:400});
    const obraRef = db.collection("obras").doc(obraId), snap = await obraRef.get();
    if (!snap.exists) throw Object.assign(new Error("No se encontró la OT 4680"), {status:404});
    const obra = snap.data() || {};
    const ot = String(obra.ot || "").match(/\d{4,7}/)?.[0].replace(/^0+/, "") || "";
    const cuit = String(obra.clienteCuit || obra.cuit || "").replace(/\D/g, "");
    const cliente = String(obra.cliente || "").trim();
    if (ot !== "4680" || cuit !== "30710787588" || cliente.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase() !== "actitud argentina") {
      throw Object.assign(new Error("La obra no coincide con OT 4680 · Actitud Argentina · CUIT 30-71078758-8"), {status:400});
    }
    if (obra.facturaArca?.cae || obra.finanzas?.saldo?.nroFactura) throw Object.assign(new Error(`La OT 4680 ya tiene una factura registrada: ${obra.facturaArca?.numeroCompleto || obra.finanzas?.saldo?.nroFactura}`), {status:409});
    const items = (Array.isArray(obra.itemsCotizados) ? obra.itemsCotizados : []).map((item) => ({
      descripcion:String(item.descripcion || item.desc || "").trim(), cantidad:Number(item.cantidad || item.cant || 1), unitario:Number(item.unitario ?? item.precio),
    })).filter((item) => item.descripcion && Number.isFinite(item.cantidad) && item.cantidad > 0 && Number.isFinite(item.unitario) && item.unitario > 0);
    if (items.length !== 2) throw Object.assign(new Error("La OT 4680 debe conservar exactamente los dos ítems cotizados"), {status:400});
    const neto = Math.round(items.reduce((sum,item)=>sum+item.cantidad*item.unitario,0)*100)/100;
    if (Math.abs(neto-329200) > 0.01) throw Object.assign(new Error(`El neto de la OT cambió: ${neto}. Esperado: 329200`), {status:400});
    const iva = Math.round(neto*0.21*100)/100, total = Math.round((neto+iva)*100)/100;
    lockRef = db.collection("arcaEmisiones").doc("ot-4680-factura-a-total");
    await db.runTransaction(async (tx) => {
      const lock = await tx.get(lockRef), existing = lock.exists ? lock.data() : null;
      if (existing?.status === "autorizada") throw Object.assign(new Error(`La factura ya fue autorizada: ${existing.numeroCompleto}`), {status:409});
      if (existing && existing.status !== "rechazada") throw Object.assign(new Error("Existe una emisión pendiente de revisión. No vuelva a enviarla hasta verificar su estado en ARCA"), {status:409});
      tx.set(lockRef,{status:"procesando",ot:"4680",obraId,cliente,cuit,neto,iva,total,items,operador:user.email,iniciadoAt:admin.firestore.FieldValue.serverTimestamp()});
    });
    const credentials = await loginWsaa(WSAA_PROD_URL, prodCertificatePem, prodPrivateKeyPem);
    const ptoVta = 9, cbteTipo = 1;
    const lastXml = await wsfeCall("FECompUltimoAutorizado", `<PtoVta>${ptoVta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo>`, credentials, WSFE_PROD_URL);
    const next = Number(tag(lastXml,"CbteNro") || 0) + 1;
    await lockRef.update({ptoVta,cbteTipo,cbteNroPrevisto:next});
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(({type,value})=>[type,value]));
    const date = `${parts.year}${parts.month}${parts.day}`;
    const detail = `<FeCAEReq><FeCabReq><CantReg>1</CantReg><PtoVta>${ptoVta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo></FeCabReq><FeDetReq><FECAEDetRequest><Concepto>1</Concepto><DocTipo>80</DocTipo><DocNro>${cuit}</DocNro><CbteDesde>${next}</CbteDesde><CbteHasta>${next}</CbteHasta><CbteFch>${date}</CbteFch><ImpTotal>${total.toFixed(2)}</ImpTotal><ImpTotConc>0.00</ImpTotConc><ImpNeto>${neto.toFixed(2)}</ImpNeto><ImpOpEx>0.00</ImpOpEx><ImpTrib>0.00</ImpTrib><ImpIVA>${iva.toFixed(2)}</ImpIVA><MonId>PES</MonId><MonCotiz>1.000000</MonCotiz><CondicionIVAReceptorId>1</CondicionIVAReceptorId><Iva><AlicIva><Id>5</Id><BaseImp>${neto.toFixed(2)}</BaseImp><Importe>${iva.toFixed(2)}</Importe></AlicIva></Iva></FECAEDetRequest></FeDetReq></FeCAEReq>`;
    const resultXml = await wsfeCall("FECAESolicitar", detail, credentials, WSFE_PROD_URL);
    const result = tag(resultXml,"Resultado"), cae = tag(resultXml,"CAE"), caeVto = tag(resultXml,"CAEFchVto");
    const messages = [...resultXml.matchAll(/<(?:Msg|Obs)>([\s\S]*?)<\/(?:Msg|Obs)>/gi)].map(m=>decodeXml(m[1].trim())).filter(Boolean);
    if (result !== "A" || !cae) {
      await lockRef.set({status:"rechazada",mensajes:messages,finalizadoAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      return res.status(422).json({ok:false,error:messages.join(" · ")||"ARCA rechazó la factura",ptoVta,cbteNro:next});
    }
    const numeroCompleto = `${String(ptoVta).padStart(5,"0")}-${String(next).padStart(8,"0")}`;
    const fechaIso = `${parts.year}-${parts.month}-${parts.day}`;
    const facturaArca = {ambiente:"produccion",tipo:"Factura A",ptoVta,cbteTipo,cbteNro:next,numeroCompleto,fecha:fechaIso,cae,caeVto,cliente,cuit,neto,iva,total,items,condicionPago:"Contado",diasPago:0,fechaPrevistaCobro:fechaIso,emitidaPor:user.email,drivePendiente:true};
    const finanzas = {...(obra.finanzas||{}),total:neto,diasPago:0,saldo:{...(obra.finanzas?.saldo||{}),facturado:true,porcentaje:100,nroFactura:numeroCompleto,fechaFactura:fechaIso,monto:neto,fechaPrevistaCobro:fechaIso}};
    const batch = db.batch();
    batch.set(lockRef,{status:"autorizada",numeroCompleto,cae,caeVto,fecha:fechaIso,finalizadoAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    batch.update(obraRef,{facturaArca,finanzas,nrfc:numeroCompleto,ffc:fechaIso,facturado:true,facturaDrivePendiente:true});
    await batch.commit();
    console.info("ARCA production invoice approved",{operator:user.email,ot:"4680",numeroCompleto,neto,total});
    return res.json({ok:true,...facturaArca});
  } catch (error) {
    console.error("ARCA production invoice failed", error);
    if (lockRef && ![409].includes(error.status)) await lockRef.set({status:"revision_requerida",error:error.message||String(error),finalizadoAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true}).catch(()=>{});
    return res.status(error.status||502).json({ok:false,error:error.message||"No se pudo emitir la factura"});
  }
});


exports.arcaProduccionEmitirFactura = onRequest({region:"us-central1", invoker:"public", secrets:[prodCertificatePem, prodPrivateKeyPem, issuerCuit, allowedEmails, facturasCbu], timeoutSeconds:60}, async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ok:false,error:"Método no permitido"});
  const db=admin.firestore();
  let lockRef=null;
  try {
    const user=await requireAdmin(req);
    if(req.body?.confirmacion!=="EMITIR FACTURA REAL")throw Object.assign(new Error("Falta la confirmación final de emisión"),{status:400});
    const obraId=String(req.body?.obraId||"").trim();
    const tipoParte=String(req.body?.tipoParte||"total").trim();
    const porcentaje=tipoParte==="total"?100:Number(req.body?.porcentaje);
    const condicionIvaId=Number(req.body?.condicionIvaId);
    const tipoComprobante=String(req.body?.tipoComprobante||"A").toUpperCase();
    const fechaVtoPago=String(req.body?.fechaVtoPago||"").replace(/\D/g,"");
    const condiciones={1:"IVA Responsable Inscripto",4:"IVA Sujeto Exento",5:"Consumidor Final",6:"Responsable Monotributo",7:"Sujeto No Categorizado",13:"Monotributista Social",15:"IVA No Alcanzado"};
    if(!obraId)throw Object.assign(new Error("Falta identificar la obra"),{status:400});
    if(!["total","anticipo","saldo"].includes(tipoParte))throw Object.assign(new Error("Tipo de facturación inválido"),{status:400});
    if(!Number.isFinite(porcentaje)||porcentaje<=0||porcentaje>100)throw Object.assign(new Error("Porcentaje inválido"),{status:400});
    if(!condiciones[condicionIvaId])throw Object.assign(new Error("Falta definir la condición frente al IVA del cliente"),{status:400});
    if(!["A","B","FCEA"].includes(tipoComprobante))throw Object.assign(new Error("Tipo de comprobante no habilitado"),{status:400});
    if(tipoComprobante==="A"&&condicionIvaId!==1)throw Object.assign(new Error("Factura A requiere receptor Responsable Inscripto"),{status:400});
    if(tipoComprobante==="B"&&condicionIvaId===1)throw Object.assign(new Error("Para un Responsable Inscripto corresponde Factura A"),{status:400});
    if(tipoComprobante==="FCEA"&&!/^\d{8}$/.test(fechaVtoPago))throw Object.assign(new Error("La FCE requiere fecha de vencimiento de pago"),{status:400});
    const obraRef=db.collection("obras").doc(obraId),snap=await obraRef.get();
    if(!snap.exists)throw Object.assign(new Error("No se encontró la obra"),{status:404});
    const obra=snap.data()||{},ot=String(obra.ot||"").match(/\d{1,7}/)?.[0].replace(/^0+/,"")||"";
    const clienteId=String(obra.clienteId||req.body?.clienteId||"").trim();
    const clienteRef=clienteId?db.collection("clientes").doc(clienteId):null;
    const clienteSnap=clienteRef?await clienteRef.get():null,clienteData=clienteSnap?.exists?clienteSnap.data()||{}:{};
    const cliente=String(clienteData.razonSocial||clienteData.nombreFiscal||obra.cliente||"").trim();
    const cuit=String(clienteData.cuit||obra.clienteCuit||obra.cuit||req.body?.cuit||"").replace(/\D/g,"");
    if(!ot||!cliente)throw Object.assign(new Error("La obra no tiene OT o cliente válido"),{status:400});
    if(!/^\d{11}$/.test(cuit))throw Object.assign(new Error("El cliente debe tener un CUIT válido de 11 dígitos"),{status:400});
    const anteriores=Array.isArray(obra.facturasArca)?obra.facturasArca:[];
    if(anteriores.some(x=>x?.tipoParte===tipoParte&&x?.cae)||(!anteriores.length&&obra.facturaArca?.cae&&tipoParte==="total")){
      throw Object.assign(new Error("Esta parte de la obra ya tiene una factura ARCA autorizada"),{status:409});
    }
    if(tipoParte==="total"&&anteriores.some(x=>x?.cae))throw Object.assign(new Error("La obra ya tiene facturación parcial; corresponde emitir el saldo"),{status:409});
    const itemsBase=(Array.isArray(obra.itemsCotizados)?obra.itemsCotizados:[]).map(item=>({descripcion:String(item.descripcion||item.desc||"").trim(),cantidad:Number(item.cantidad||item.cant||1),unitario:Number(item.unitario??item.precio)})).filter(item=>item.descripcion&&Number.isFinite(item.cantidad)&&item.cantidad>0&&Number.isFinite(item.unitario)&&item.unitario>0);
    const netoObra=Math.round(Number(obra.finanzas?.total||obra.neto||itemsBase.reduce((s,i)=>s+i.cantidad*i.unitario,0))*100)/100;
    if(!Number.isFinite(netoObra)||netoObra<=0)throw Object.assign(new Error("La obra no tiene un importe neto válido"),{status:400});
    const yaFacturado=anteriores.filter(x=>x?.cae).reduce((s,x)=>s+Number(x.neto||0),0);
    let neto=tipoParte==="saldo"?Math.round(Math.max(0,netoObra-yaFacturado)*100)/100:Math.round(netoObra*porcentaje)/100;
    if(neto<=0||neto>netoObra+0.01)throw Object.assign(new Error("El importe a facturar no es válido"),{status:400});
    const factor=neto/netoObra;
    const items=(itemsBase.length?itemsBase:[{descripcion:String(obra.desc||`Trabajo correspondiente a OT ${ot}`),cantidad:1,unitario:netoObra}]).map(i=>({...i,unitario:Math.round(i.unitario*factor*100)/100}));
    const iva=Math.round(neto*.21*100)/100,total=Math.round((neto+iva)*100)/100;
    const cbteTipo=tipoComprobante==="FCEA"?201:(tipoComprobante==="A"?1:6),ptoVta=9;
    lockRef=db.collection("arcaEmisiones").doc(`ot-${ot}-${tipoParte}`);
    await db.runTransaction(async tx=>{
      const lock=await tx.get(lockRef),existing=lock.exists?lock.data():null;
      if(existing?.status==="autorizada")throw Object.assign(new Error(`La factura ya fue autorizada: ${existing.numeroCompleto}`),{status:409});
      if(existing&&existing.status!=="rechazada")throw Object.assign(new Error("Existe una emisión pendiente de revisión. Verificá ARCA antes de volver a intentar"),{status:409});
      tx.set(lockRef,{status:"procesando",ot,obraId,cliente,cuit,tipoParte,porcentaje,condicionIvaId,neto,iva,total,operador:user.email,iniciadoAt:admin.firestore.FieldValue.serverTimestamp()});
    });
    const credentials=await loginWsaa(WSAA_PROD_URL,prodCertificatePem,prodPrivateKeyPem);
    const lastXml=await wsfeCall("FECompUltimoAutorizado",`<PtoVta>${ptoVta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo>`,credentials,WSFE_PROD_URL);
    const next=Number(tag(lastXml,"CbteNro")||0)+1;
    await lockRef.update({ptoVta,cbteTipo,cbteNroPrevisto:next});
    const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(({type,value})=>[type,value]));
    const date=`${parts.year}${parts.month}${parts.day}`;
    const detail=`<FeCAEReq><FeCabReq><CantReg>1</CantReg><PtoVta>${ptoVta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo></FeCabReq><FeDetReq><FECAEDetRequest><Concepto>1</Concepto><DocTipo>80</DocTipo><DocNro>${cuit}</DocNro><CbteDesde>${next}</CbteDesde><CbteHasta>${next}</CbteHasta><CbteFch>${date}</CbteFch><ImpTotal>${total.toFixed(2)}</ImpTotal><ImpTotConc>0.00</ImpTotConc><ImpNeto>${neto.toFixed(2)}</ImpNeto><ImpOpEx>0.00</ImpOpEx><ImpTrib>0.00</ImpTrib><ImpIVA>${iva.toFixed(2)}</ImpIVA>${tipoComprobante==="FCEA"?`<FchVtoPago>${fechaVtoPago}</FchVtoPago>`:""}<MonId>PES</MonId><MonCotiz>1.000000</MonCotiz><CondicionIVAReceptorId>${condicionIvaId}</CondicionIVAReceptorId>${tipoComprobante==="FCEA"?`<Opcionales><Opcional><Id>2101</Id><Valor>${facturasCbu.value()}</Valor></Opcional></Opcionales>`:""}<Iva><AlicIva><Id>5</Id><BaseImp>${neto.toFixed(2)}</BaseImp><Importe>${iva.toFixed(2)}</Importe></AlicIva></Iva></FECAEDetRequest></FeDetReq></FeCAEReq>`;
    const resultXml=await wsfeCall("FECAESolicitar",detail,credentials,WSFE_PROD_URL);
    const result=tag(resultXml,"Resultado"),cae=tag(resultXml,"CAE"),caeVto=tag(resultXml,"CAEFchVto");
    const messages=[...resultXml.matchAll(/<(?:Msg|Obs)>([\s\S]*?)<\/(?:Msg|Obs)>/gi)].map(m=>decodeXml(m[1].trim())).filter(Boolean);
    if(result!=="A"||!cae){await lockRef.set({status:"rechazada",mensajes:messages,finalizadoAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});return res.status(422).json({ok:false,error:messages.join(" · ")||"ARCA rechazó la factura"});}
    const numeroCompleto=`${String(ptoVta).padStart(5,"0")}-${String(next).padStart(8,"0")}`,fechaIso=`${parts.year}-${parts.month}-${parts.day}`;
    const facturaArca={ambiente:"produccion",tipo:cbteTipo===201?"Factura de Crédito Electrónica MiPyME A":(cbteTipo===1?"Factura A":"Factura B"),tipoComprobante,fechaVtoPago:tipoComprobante==="FCEA"?fechaVtoPago:"",tipoParte,porcentaje:tipoParte==="saldo"?Math.round(neto/netoObra*10000)/100:porcentaje,ptoVta,cbteTipo,cbteNro:next,numeroCompleto,fecha:fechaIso,cae,caeVto,cliente,cuit,condicionIvaId,condicionIva:condiciones[condicionIvaId],neto,iva,total,items,ot,emitidaPor:user.email,drivePendiente:true};
    const parte=tipoParte==="anticipo"?"anticipo":"saldo";
    const finanzas={...(obra.finanzas||{}),total:netoObra,[parte]:{...(obra.finanzas?.[parte]||{}),facturado:true,porcentaje:facturaArca.porcentaje,nroFactura:numeroCompleto,fechaFactura:fechaIso,monto:neto,fechaPrevistaCobro:fechaIso}};
    const batch=db.batch();
    batch.set(lockRef,{status:"autorizada",numeroCompleto,cae,caeVto,fecha:fechaIso,finalizadoAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    batch.update(obraRef,{facturaArca,facturasArca:admin.firestore.FieldValue.arrayUnion(facturaArca),finanzas,nrfc:numeroCompleto,ffc:fechaIso,facturado:true,facturaDrivePendiente:true});
    if(clienteRef)batch.set(clienteRef,{condicionIvaId,condicionIva:condiciones[condicionIvaId],cuit},{merge:true});
    await batch.commit();
    return res.json({ok:true,...facturaArca});
  } catch(error) {
    console.error("Generic ARCA production invoice failed",error);
    if(lockRef&&![409].includes(error.status))await lockRef.set({status:"revision_requerida",error:error.message||String(error),finalizadoAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true}).catch(()=>{});
    return res.status(error.status||502).json({ok:false,error:error.message||"No se pudo emitir la factura"});
  }
});


exports.facturaEnviarEmail = onRequest({region:"us-central1", invoker:"public", secrets:[allowedEmails, facturasWebhookSecret], timeoutSeconds:60}, async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ok:false,error:"Método no permitido"});
  try {
    const user = await requireAdmin(req);
    if (req.body?.confirmacion !== "ENVIAR FACTURA POR EMAIL") {
      throw Object.assign(new Error("Falta la confirmación final del envío"), {status:400});
    }
    const obraId = String(req.body?.obraId || "").trim();
    const destinatarios = String(req.body?.destinatario || "").split(/[;,\n]+/).map((value)=>value.trim().toLowerCase()).filter(Boolean);
    const fileId = String(req.body?.fileId || "").trim();
    if (!obraId) throw Object.assign(new Error("Falta identificar la OT"), {status:400});
    if (!destinatarios.length || destinatarios.length > 10 || destinatarios.some((email)=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw Object.assign(new Error("Revisá los correos destinatarios (máximo 10)"), {status:400});
    }
    const destinatario = [...new Set(destinatarios)].join(",");

    const obraRef = admin.firestore().collection("obras").doc(obraId);
    const snap = await obraRef.get();
    if (!snap.exists) throw Object.assign(new Error("No se encontró la OT"), {status:404});
    const obra = snap.data() || {};
    const factura = obra.facturaArca || {};
    if (!factura.cae || !factura.numeroCompleto) {
      throw Object.assign(new Error("La OT no tiene una factura ARCA autorizada"), {status:400});
    }
    const ot = String(obra.ot || "").match(/\d{4,7}/)?.[0].replace(/^0+/, "") || "";
    const payload = {
      action:"enviarFacturaEmail",
      secret:facturasWebhookSecret.value(),
      destinatario,
      fileId,
      factura,
      numero:factura.numeroCompleto,
      cliente:String(obra.cliente || factura.cliente || "").trim(),
      ot,
      asunto:String(req.body?.asunto || "").trim(),
    };
    const form = new URLSearchParams({payload:JSON.stringify(payload)});
    const response = await fetch(FACTURAS_WEBHOOK_URL, {method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"}, body:form});
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch (_) { throw new Error("El servicio de correo devolvió una respuesta inválida"); }
    if (!response.ok || !result?.ok) throw new Error(result?.error || "No se pudo enviar la factura");

    await obraRef.update({
      "facturaArca.driveFileId":result.fileId||fileId,
      "facturaArca.drivePendiente":false,
      "facturaArca.emailUltimoDestinatario":destinatario,
      "facturaArca.emailUltimoDestinatarios":destinatario.split(","),
      "facturaArca.emailUltimoRemitente":"info@tizpublicidad.com",
      "facturaArca.emailUltimoEnvioAt":admin.firestore.FieldValue.serverTimestamp(),
      "facturaArca.emailUltimoEnvioPor":user.email,
      facturaDrivePendiente:false,
    });
    return res.json({ok:true,destinatario,remitente:"info@tizpublicidad.com",fileId:result.fileId||fileId,fileName:result.fileName||"",numero:factura.numeroCompleto});
  } catch (error) {
    console.error("Invoice email failed", error);
    return res.status(error.status||502).json({ok:false,error:error.message||"No se pudo enviar la factura"});
  }
});

exports.arcaHomologacionStatus = onRequest({region:"us-central1", invoker:"public", secrets:[certificatePem, privateKeyPem, issuerCuit, allowedEmails], timeoutSeconds:60}, async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ok:false,error:"Método no permitido"});
  try {
    const user = await requireAdmin(req);
    const credentials = await loginWsaa();
    const dummyXml = await wsfeCall("FEDummy", "", credentials);
    const pointsXml = await wsfeCall("FEParamGetPtosVenta", "", credentials);
    const points = pointsOfSale(pointsXml);
    return res.json({ok:true, environment:"homologacion", issuerCuit:issuerCuit.value(), operator:user.email,
      wsaaExpiresAt:credentials.expirationTime,
      services:{app:tag(dummyXml,"AppServer")||"OK", db:tag(dummyXml,"DbServer")||"OK", auth:tag(dummyXml,"AuthServer")||"OK"},
      pointsOfSale:points, emissionEnabled:false});
  } catch (error) {
    console.error("ARCA homologation diagnostic failed", error);
    return res.status(error.status||502).json({ok:false,error:error.message||"No se pudo consultar ARCA"});
  }
});

exports.arcaHomologacionEmitirPrueba = onRequest({region:"us-central1", invoker:"public", secrets:[certificatePem, privateKeyPem, issuerCuit, allowedEmails], timeoutSeconds:60}, async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ok:false,error:"Método no permitido"});
  try {
    const user = await requireAdmin(req);
    const docNro = String(req.body?.docNro || "").replace(/\D/g, "");
    const neto = Number(req.body?.neto);
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 20) : [];
    if (!/^\d{11}$/.test(docNro)) throw Object.assign(new Error("CUIT del cliente inválido"), {status:400});
    if (!Number.isFinite(neto) || neto <= 0) throw Object.assign(new Error("Importe neto inválido"), {status:400});
    if (items.length !== 2) throw Object.assign(new Error("La prueba debe conservar los dos ítems de la OT 4680"), {status:400});
    const itemTotal = items.reduce((sum, item)=>sum + Number(item.unitario||0)*Number(item.cantidad||0), 0);
    if (Math.abs(itemTotal-neto) > 0.01) throw Object.assign(new Error("La suma de los ítems no coincide con el neto"), {status:400});

    const credentials = await loginWsaa();
    const pointsXml = await wsfeCall("FEParamGetPtosVenta", "", credentials);
    const points = pointsOfSale(pointsXml);
    // Homologación puede responder sin padrón de puntos aunque acepte solicitudes.
    // En ese caso usamos el punto indicado por TIZ sólo para la prueba; ARCA hará
    // la validación definitiva al consultar el último comprobante/autorización.
    const ptoVta = points[0] || 3;
    const pointSource = points.length ? "arca" : "respaldo-tiz";
    const cbteTipo = 1;
    const lastXml = await wsfeCall("FECompUltimoAutorizado", `<PtoVta>${ptoVta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo>`, credentials);
    const last = Number(tag(lastXml, "CbteNro") || 0), next = last + 1;
    const iva = Math.round(neto*0.21*100)/100, total = Math.round((neto+iva)*100)/100;
    const dateParts = Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(({type,value})=>[type,value]));
    const date = `${dateParts.year}${dateParts.month}${dateParts.day}`;
    const detail = `<FeCAEReq><FeCabReq><CantReg>1</CantReg><PtoVta>${ptoVta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo></FeCabReq><FeDetReq><FECAEDetRequest><Concepto>1</Concepto><DocTipo>80</DocTipo><DocNro>${docNro}</DocNro><CbteDesde>${next}</CbteDesde><CbteHasta>${next}</CbteHasta><CbteFch>${date}</CbteFch><ImpTotal>${total.toFixed(2)}</ImpTotal><ImpTotConc>0.00</ImpTotConc><ImpNeto>${neto.toFixed(2)}</ImpNeto><ImpOpEx>0.00</ImpOpEx><ImpTrib>0.00</ImpTrib><ImpIVA>${iva.toFixed(2)}</ImpIVA><MonId>PES</MonId><MonCotiz>1.000000</MonCotiz><CondicionIVAReceptorId>1</CondicionIVAReceptorId><Iva><AlicIva><Id>5</Id><BaseImp>${neto.toFixed(2)}</BaseImp><Importe>${iva.toFixed(2)}</Importe></AlicIva></Iva></FECAEDetRequest></FeDetReq></FeCAEReq>`;
    const resultXml = await wsfeCall("FECAESolicitar", detail, credentials);
    const result = tag(resultXml,"Resultado"), cae = tag(resultXml,"CAE"), caeVto = tag(resultXml,"CAEFchVto");
    const messages = [...resultXml.matchAll(/<(?:Msg|Obs)>([\s\S]*?)<\/(?:Msg|Obs)>/gi)].map(m=>decodeXml(m[1].trim())).filter(Boolean);
    if (result !== "A" || !cae) return res.status(422).json({ok:false,error:messages.join(" · ")||"ARCA rechazó el comprobante de prueba",environment:"homologacion",ptoVta,cbteNro:next});
    console.info("ARCA homologation invoice approved", {operator:user.email,ptoVta,cbteNro:next,neto,total});
    return res.json({ok:true,environment:"homologacion",ptoVta,pointSource,cbteTipo,cbteNro:next,cae,caeVto,issuerCuit:issuerCuit.value(),receiverCuit:docNro,neto,iva,total,items});
  } catch (error) {
    console.error("ARCA homologation invoice failed", error);
    return res.status(error.status||502).json({ok:false,error:error.message||"No se pudo emitir la prueba"});
  }
});
