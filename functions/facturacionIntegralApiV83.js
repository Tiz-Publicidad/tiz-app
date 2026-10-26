"use strict";
const admin = require("firebase-admin");
const { google } = require("googleapis");
const forge = require("node-forge");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const {
  validateType,
  validateAssociated,
  ivaConfig,
  round2,
  saldoFiscal,
} = require("./arcaFiscalCoreV83");
const { archivarFacturaPdfEnDrive } = require("./facturaDrive2026");
const { validarDiasPago } = require("./condicionesPagoV127");
const fechas = require("./arcaFechasV1");
const fce = require("./arcaFceV1");
const fceMinimum = require("./arcaFceMinimoV1");
if (!admin.apps.length) admin.initializeApp();
const cert = defineSecret("ARCA_PROD_CERTIFICATE_PEM"),
  key = defineSecret("ARCA_PROD_PRIVATE_KEY_PEM"),
  issuer = defineSecret("ARCA_ISSUER_CUIT"),
  allowed = defineSecret("ARCA_ALLOWED_EMAILS");
const PTO = 9,
  WSAA = "https://wsaa.afip.gov.ar/ws/services/LoginCms",
  WSFE = "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
  ORIGINS = new Set([
    "https://tiz-publicidad.github.io",
    "https://tiz---app.web.app",
    "https://tiz---app.firebaseapp.com",
    "https://tiz---app--facturacion-v83-pruebas-h6sjmm0g.web.app",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
  ]);
const esc = (v) =>
  String(v ?? "").replace(
    /[<>&'\"]/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[c],
  );
const dec = (v) =>
  String(v || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
function tag(xml, n) {
  const m = String(xml || "").match(
    new RegExp(
      `<(?:\\w+:)?${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${n}>`,
      "i",
    ),
  );
  return m ? dec(m[1].trim()) : "";
}
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
  if (!set.has(email) && !(email === 'giancarlo.pareja@tizpublicidad.com' && set.has('info@tizpublicidad.com')))
    throw Object.assign(new Error("Usuario sin permiso para facturar"), {
      status: 403,
    });
  return email;
}
function tra(service = "wsfe") {
  const n = new Date(),
    g = new Date(n - 600000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    e = new Date(n.getTime() + 600000).toISOString().replace(/\.\d{3}Z$/, "Z");
  return `<?xml version="1.0"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(n.getTime() / 1000)}</uniqueId><generationTime>${g}</generationTime><expirationTime>${e}</expirationTime></header><service>${esc(service)}</service></loginTicketRequest>`;
}
function cms(x) {
  const p = forge.pkcs7.createSignedData();
  p.content = forge.util.createBuffer(x, "utf8");
  const c = forge.pki.certificateFromPem(cert.value()),
    k = forge.pki.privateKeyFromPem(key.value());
  p.addCertificate(c);
  p.addSigner({
    key: k,
    certificate: c,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p.sign();
  return forge.util.encode64(forge.asn1.toDer(p.toAsn1()).getBytes());
}
async function soap(url, action, body) {
  const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: action,
      },
      body,
      signal: AbortSignal.timeout(15000),
    }),
    t = await r.text(),
    f = tag(t, "faultstring");
  if (f) throw new Error(`ARCA: ${f}`);
  if (!r.ok) throw new Error(`ARCA respondió HTTP ${r.status}`);
  return t;
}
const credentialCache = new Map();
const credentialPending = new Map();
async function credentials(service = "wsfe") {
  if (!["wsfe", "wsfecred"].includes(service)) throw new Error("Servicio ARCA inválido");
  const cached=credentialCache.get(service);
  if(cached && cached.expires>Date.now()+60000)return cached.value;
  if(credentialPending.has(service))return credentialPending.get(service);
  const pending=(async()=>{
  const e = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><in0>${cms(tra(service))}</in0></loginCms></soapenv:Body></soapenv:Envelope>`,
    x = await soap(WSAA, "", e),
    r = tag(x, "loginCmsReturn"),
    token = tag(r, "token"),
    sign = tag(r, "sign");
  if (!token || !sign) throw new Error("WSAA no devolvió credenciales válidas");
  const value={token,sign},expires=Date.parse(tag(r,"expirationTime"));
  if(Number.isFinite(expires))credentialCache.set(service,{value,expires});
  return value;
  })();
  credentialPending.set(service,pending);
  try{return await pending}finally{credentialPending.delete(service)}
}
async function call(method, inner, cr) {
  const a = `<Auth><Token>${esc(cr.token)}</Token><Sign>${esc(cr.sign)}</Sign><Cuit>${esc(issuer.value())}</Cuit></Auth>`,
    e = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${method} xmlns="http://ar.gov.afip.dif.FEV1/">${a}${inner || ""}</${method}></soap:Body></soap:Envelope>`;
  return soap(WSFE, `http://ar.gov.afip.dif.FEV1/${method}`, e);
}
async function consultarObligacionFce({cuit,fecha,total}) {
  // The floor comes from ARCA's public page, not a client flag or a fixed amount.
  try{const minimum=await fceMinimum.check({fecha,total});if(minimum)return {...minimum,cuit,fecha};}catch(_){/* Keep the recipient query as the fallback; never infer a result on failure. */}
  let stage='autenticacion';
  try {
    const cr=await credentials('wsfecred');
    stage='consulta';
    const xml=await soap(fce.URL,fce.NS+'consultarMontoObligadoRecepcion',fce.request({...cr,issuer:issuer.value(),cuit,fecha}));
    stage='respuesta';
    return {...fce.parse(xml,total),cuit,fecha};
  } catch(error) {
    const failure=fce.diagnostic(error,stage);
    console.error('FCE verification failed',{code:failure.code,etapa:failure.etapa});
    throw failure;
  }
}
function importeConsultaFce(body){
  const neto=round2(body.neto),exento=body.tratamientoIva==='exento',cfg=ivaConfig(body.alicuota??21,exento);
  if(!Number.isFinite(Number(body.neto))||neto<=0)throw Object.assign(new Error('Importe neto inválido'),{status:400});
  return round2(neto+(exento?0:round2(neto*cfg.pct/100)));
}
function day(add = 0) {
  const d = new Date(Date.now() + Number(add || 0) * 86400000),
    p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Argentina/Buenos_Aires",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(d)
        .map(({ type, value }) => [type, value]),
    );
  return {
    arca: `${p.year}${p.month}${p.day}`,
    iso: `${p.year}-${p.month}-${p.day}`,
  };
}
async function lastAuthorized(tipo,cr){
  const xml=await call('FECompUltimoAutorizado',`<PtoVta>${PTO}</PtoVta><CbteTipo>${tipo}</CbteTipo>`,cr);
  const raw=tag(xml,'CbteNro');
  if(!/^\d+$/.test(raw)||tag(xml,'Errors'))throw new Error('No se pudo consultar el último comprobante de ARCA. '+tag(xml,'Msg'));
  const numero=Number(raw);if(!numero)return {ultimoNumero:0,ultimaFecha:''};
  const detail=await call('FECompConsultar',`<FeCompConsReq><CbteTipo>${tipo}</CbteTipo><CbteNro>${numero}</CbteNro><PtoVta>${PTO}</PtoVta></FeCompConsReq>`,cr);
  const result=tag(detail,'ResultGet'),date=tag(result,'CbteFch');
  if(!result||tag(detail,'Errors')||!/^\d{8}$/.test(date))throw new Error('No se pudo verificar la fecha del último comprobante en ARCA. '+tag(detail,'Msg'));
  const ultimaFecha=fechas.iso(date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8));
  return {ultimoNumero:numero,ultimaFecha};
}

function list(o) {
  const a = Array.isArray(o.comprobantesArca)
    ? [...o.comprobantesArca]
    : Array.isArray(o.facturasArca)
      ? [...o.facturasArca]
      : [];
  if (o.facturaArca?.cae && !a.some((x) => x.cae === o.facturaArca.cae))
    a.push(o.facturaArca);
  return a.filter((x) => x?.cae);
}
function fiscalList(o) {
  const issued=list(o),seen=new Set(issued.map(x=>`${x.cbteTipo}:${x.ptoVta}:${x.cbteNro}`));
  const manual=(Array.isArray(o.facturasManual)?o.facturasManual:[]).filter(x=>{
    const k=`${x.cbteTipo}:${x.ptoVta}:${x.cbteNro}`;
    if(!/^\d{14}$/.test(String(x.cae||''))||Number(x.ptoVta)!==3||!Number(x.cbteNro)||![1,6,201,206].includes(Number(x.cbteTipo))||seen.has(k))return false;
    seen.add(k);return true;
  });
  return [...issued,...manual];
}
const BASE_MADRE_ID = "1mOhuPKcMG8PO3QsY3g84WL4p3o43t4ilK8Jx1DHjF5M",
  BASE_MADRE_SHEET = "Base de datos";
const otBase = (v) =>
  String(v || "")
    .match(/\d{4,7}/)?.[0]
    .replace(/^0+/, "") || "";
function weekOf(v) {
  const [y, m, d] = String(v || "")
    .slice(0, 10)
    .split("-")
    .map(Number);
  if (!y || !m || !d) return "";
  const x = new Date(Date.UTC(y, m - 1, d)),
    day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x - start) / 86400000 + 1) / 7);
}
function sheetDate(v) {
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
async function syncBaseMadreFactura(obra, comprobantes, db, obraId, email) {
  const ot = otBase(obra.ot || obra.nroCotizacion || obra.infoPresupuesto?.nro);
  if (!ot) return { ok: false, skipped: true, reason: "sin OT" };
  const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    }),
    sheets = google.sheets({ version: "v4", auth });
  const layoutCore = require('./baseMadreLayoutV1');
  const layout = await layoutCore.read(sheets, BASE_MADRE_ID, BASE_MADRE_SHEET);
  const col = layoutCore.column(layout.ot);
  const lookup = await sheets.spreadsheets.values.get({spreadsheetId:BASE_MADRE_ID,range:`'${BASE_MADRE_SHEET}'!${col}3:${col}`});
  const matches=(lookup.data.values||[]).map((r,i)=>otBase(r?.[0])===ot?i+3:0).filter(Boolean);
  if(matches.length!==1)throw new Error(`La OT ${ot} debe tener una única fila en Base de datos`);
  const row=matches[0];
  const current=await sheets.spreadsheets.values.get({spreadsheetId:BASE_MADRE_ID,range:`'${BASE_MADRE_SHEET}'!A${row}:AL${row}`});
  const clientNorm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  if(!obra.cliente||clientNorm(current.data.values?.[0]?.[layout.cliente])!==clientNorm(obra.cliente))throw new Error('El cliente de Base Madre no coincide con la obra');
  const seen = new Set(),
    invoices = (comprobantes || [])
      .filter((x) => {
        const k = `${x.cbteTipo || ""}-${x.ptoVta || ""}-${x.cbteNro || x.numeroCompleto || ""}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return !!(x.cae || x.numeroCompleto);
      })
      .sort((a, b) =>
        String(a.fecha || "").localeCompare(String(b.fecha || "")),
      );
  const last = invoices[invoices.length - 1] || {},
    numbers = invoices
      .map((x) => String(x.numeroCompleto || x.cbteNro || "").trim())
      .filter(Boolean)
      .join(" / ");
  const due =
    invoices
      .map((x) =>
        String(x.fechaPrevistaCobro || x.fechaVencimientoPago || "").slice(
          0,
          10,
        ),
      )
      .filter(Boolean)
      .sort()[0] || String(last.fechaPrevistaCobro || "").slice(0, 10);
  const data = [];
  if (numbers)
    data.push({
      range: `'${BASE_MADRE_SHEET}'!R${row}:S${row}`,
      values: [[sheetDate(last.fecha), numbers]],
    });
  if (due)
    data.push({
      range: `'${BASE_MADRE_SHEET}'!T${row}:U${row}`,
      values: [[sheetDate(due), weekOf(due)]],
    });
  if (data.length)
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: BASE_MADRE_ID,
      requestBody: { valueInputOption: "USER_ENTERED", data },
    });
  await db
    .collection("obras")
    .doc(obraId)
    .set(
      {
        baseMadreFactCobSyncAt: new Date().toISOString(),
        baseMadreFactCobSignature: [numbers, last.fecha || "", due].join("|"),
        baseMadreRow: row,
        baseMadreFactCobSyncVersion: "EMISION-V123",
        baseMadreFactCobSyncBy: email,
      },
      { merge: true },
    );
  return {
    ok: true,
    row,
    fechaFactura: sheetDate(last.fecha),
    numerosFactura: numbers,
    fechaProyectada: sheetDate(due),
    semanaProyectada: weekOf(due),
  };
}
const secrets = [cert, key, issuer, allowed];
const facturacionIntegralEmitirV83 = onRequest(
  { region: "us-central1", invoker: "public", secrets, timeoutSeconds: 120 },
  async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST")
      return res.status(405).json({ ok: false, error: "Método no permitido" });
    // Colocaciones uses its own token allowlist and operation whitelist.
    // It returns before any fiscal authorization, secrets or ARCA operation.
    if (req.body?.sector === "colocaciones") {
      return require("./colocacionesGeneralV129").handleColocaciones(req, res);
    }
    const db = admin.firestore();
    let lock = null,
      op = null,
      authorized = false;
    try {
      const email = await operator(req);
      if(req.body?.mode==='fce-check'){
        const cfg=validateType(Number(req.body.cbteTipo));
        if(cfg.familia!=='factura')return res.json({ok:true,nota:true,requiereFce:false});
        const cuit=String(req.body.docNro||'').replace(/\D/g,''),fecha=fechas.iso(req.body.fechaEmision),total=importeConsultaFce(req.body);
        if(!/^\d{11}$/.test(cuit))throw Object.assign(new Error('CUIT receptor inválido'),{status:400});
        const check=await consultarObligacionFce({cuit,fecha,total});
        let configurada=false,configError='',cbuFinal='';
        if(check.requiereFce){try{const settings=await fce.loadConfig(google);configurada=true;cbuFinal=settings.cbuFce.slice(-4);}catch(e){configError=e.message;}}
        return res.json({ok:true,...check,fceConfigurada:configurada,configError,cbuFinal,sistemaCirculacion:'SCA'});
      }
      if(req.body?.mode==='date-limits'){
        const tipo=Number(req.body.cbteTipo),cfg=validateType(tipo),concepto=fechas.concept(req.body.concepto??1),cr=await credentials();
        const last=await lastAuthorized(tipo,cr);
        return res.json({ok:true,ptoVta:PTO,cbteTipo:tipo,concepto,...fechas.limits({concepto,fce:!!cfg.fce,...last})});
      }
      if (req.body?.confirmacion !== "EMITIR COMPROBANTE REAL PV 00009")
        throw Object.assign(new Error("Falta confirmación final"), {
          status: 400,
        });
      const obraId = String(req.body?.obraId || "").trim(),
        idKey = String(req.body?.idempotencyKey || "")
          .replace(/[^A-Za-z0-9_-]/g, "")
          .slice(0, 80),
        tipo = Number(req.body?.cbteTipo),
        cfg = validateType(tipo);
      const diasPagoElegidos = validarDiasPago(req.body?.diasPago);
      if (!obraId || !idKey)
        throw Object.assign(new Error("Falta identificar operación"), {
          status: 400,
        });
      op = db.collection("arcaEmisiones").doc(`v83-${obraId}-${idKey}`);
      const old = await op.get();
      if(old.exists&&old.data()?.status==='autorizada')return res.json({ok:true,...old.data().comprobante,repetida:true});
      const concepto=fechas.concept(req.body?.concepto??1),fecha=fechas.validate(req.body?.fechaEmision||fechas.today(),fechas.limits({concepto,fce:!!cfg.fce}));
      const periodo=fechas.serviceDates({concepto,fecha,desde:req.body?.fechaServicioDesde,hasta:req.body?.fechaServicioHasta,diasPago:diasPagoElegidos});
      const ref = db.collection("obras").doc(obraId),
        snap = await ref.get();
      if (!snap.exists)
        throw Object.assign(new Error("No se encontró la OT"), { status: 404 });
      const obra = snap.data() || {},
        cuit = String(
          req.body?.docNro || obra.clienteCuit || obra.cuit || "",
        ).replace(/\D/g, "");
      if (!/^\d{11}$/.test(cuit))
        throw Object.assign(new Error("CUIT receptor inválido"), {
          status: 400,
        });
      const cond = Number(req.body?.condicionIVAReceptorId || 1),
        domicilioFiscal = String(
          req.body?.domicilioFiscal ||
            obra.clienteDomicilioFiscal ||
            obra.domicilioFiscal ||
            "",
        ).trim(),
        exento = String(req.body?.tratamientoIva || "gravado") === "exento",
        ivaCfg = ivaConfig(req.body?.alicuota ?? 21, exento),
        neto = round2(req.body?.neto);
      if (!(neto > 0))
        throw Object.assign(new Error("Importe neto inválido"), {
          status: 400,
        });
      if (!domicilioFiscal)
        throw Object.assign(
          new Error("Falta el domicilio fiscal del receptor"),
          { status: 400 },
        );
      const items = (Array.isArray(req.body?.items) ? req.body.items : [])
        .slice(0, 60)
        .map((x) => ({
          descripcion: String(x.descripcion || x.desc || "").trim(),
          cantidad: Number(x.cantidad || 1),
          unitario: Number(x.unitario || 0),
        }))
        .filter((x) => x.descripcion && x.cantidad > 0);
      if (!items.length)
        throw Object.assign(new Error("Debe haber al menos un ítem"), {
          status: 400,
        });
      const prev = list(obra),
        fiscalPrev = fiscalList(obra),
        pres = round2(
          obra.finanzas?.total ||
            obra.neto ||
            obra.importe ||
            obra.infoPresupuesto?.importe,
        ),
        fiscal = saldoFiscal(pres, fiscalPrev),
        asoc = validateAssociated(tipo, req.body?.asociado || null);
      if (cfg.familia === "factura" && neto - fiscal.saldo > 0.01)
        throw Object.assign(
          new Error(
            `El neto supera el saldo por facturar (${fiscal.saldo.toFixed(2)})`,
          ),
          { status: 400 },
        );
      if (cfg.familia === "credito" && asoc) {
        const orig = fiscalPrev.find(
          (x) =>
            Number(x.cbteTipo) === asoc.cbteTipo &&
            Number(x.ptoVta) === asoc.ptoVta &&
            Number(x.cbteNro) === asoc.cbteNro,
        );
        if (!orig || ![1,6,201,206].includes(Number(orig.cbteTipo))) throw Object.assign(new Error("La factura original no está registrada en la OT"),{status:400});
        const acreditado=fiscalPrev.filter(x=>x.familia==='credito'&&Number(x.asociado?.cbteTipo)===asoc.cbteTipo&&Number(x.asociado?.ptoVta)===asoc.ptoVta&&Number(x.asociado?.cbteNro)===asoc.cbteNro).reduce((s,x)=>s+round2(x.neto),0);
        if (neto - (round2(orig.neto)-acreditado) > 0.01)
          throw Object.assign(new Error("La NC supera el saldo del comprobante asociado"),{status:400});
      }
      const iva = exento ? 0 : round2((neto * ivaCfg.pct) / 100),
        total = round2(neto + iva),
        dias = diasPagoElegidos,
        hoy = {iso:fecha,arca:fecha.replace(/-/g,'')},
        vto = {iso:periodo.fechaVencimientoPago,arca:periodo.fechaVencimientoPago.replace(/-/g,'')};
      lock = db.collection("arcaLocks").doc(`pv9-tipo${tipo}`);
      await db.runTransaction(async (tx) => {
        const s = await tx.get(lock),
          d = s.exists ? s.data() : {},
          ts = d.iniciadoAt?.toMillis?.() || 0;
        if (d.status === "procesando" && Date.now() - ts < 120000)
          throw Object.assign(
            new Error("Hay otro comprobante del mismo tipo procesándose"),
            { status: 409 },
          );
        tx.set(
          lock,
          {
            status: "procesando",
            obraId,
            operador: email,
            iniciadoAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
      await op.set({
        status: "procesando",
        obraId,
        tipo,
        neto,
        total,
        operador: email,
        iniciadoAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const cr = await credentials(),last=await lastAuthorized(tipo,cr);
      // Mandatory server-side check: caller flags or an old preview cannot bypass it.
      const verificacionFce=cfg.familia==='factura'?await consultarObligacionFce({cuit,fecha,total}):null;
      fce.enforce(cfg,verificacionFce);
      const settingsFce=cfg.fce&&cfg.familia==='factura'?await fce.loadConfig(google):null;
      const anulacionFce=cfg.fce&&cfg.familia!=='factura'?String(req.body?.anulacionFce||'N'):null;
      fce.validateDue(cfg,vto.iso,fecha,fechas.today());
      const opcionales=fce.optionalXml(cfg,settingsFce,anulacionFce||'N');
      // Recheck under the same type/PV lock; another operator may have emitted meanwhile.
      fechas.validate(fecha,fechas.limits({concepto,fce:!!cfg.fce,...last}));
      const next=last.ultimoNumero+1,
        asocXml = asoc
          ? `<CbtesAsoc><CbteAsoc><Tipo>${asoc.cbteTipo}</Tipo><PtoVta>${asoc.ptoVta}</PtoVta><Nro>${asoc.cbteNro}</Nro>${cfg.fce ? `<Cuit>${cuit}</Cuit>` : ""}</CbteAsoc></CbtesAsoc>`
          : "",
        ivaXml = exento
          ? ""
          : `<Iva><AlicIva><Id>${ivaCfg.id}</Id><BaseImp>${neto.toFixed(2)}</BaseImp><Importe>${iva.toFixed(2)}</Importe></AlicIva></Iva>`,
        fceVto = (concepto!==1?`<FchServDesde>${periodo.fechaServicioDesde.replace(/-/g,'')}</FchServDesde><FchServHasta>${periodo.fechaServicioHasta.replace(/-/g,'')}</FchServHasta>`:'')+
          ((cfg.fce?(cfg.familia==='factura'||anulacionFce==='S'):concepto!==1)?`<FchVtoPago>${vto.arca}</FchVtoPago>`:'');
      const detail = `<FeCAEReq><FeCabReq><CantReg>1</CantReg><PtoVta>${PTO}</PtoVta><CbteTipo>${tipo}</CbteTipo></FeCabReq><FeDetReq><FECAEDetRequest><Concepto>${concepto}</Concepto><DocTipo>80</DocTipo><DocNro>${cuit}</DocNro><CbteDesde>${next}</CbteDesde><CbteHasta>${next}</CbteHasta><CbteFch>${hoy.arca}</CbteFch><ImpTotal>${total.toFixed(2)}</ImpTotal><ImpTotConc>0.00</ImpTotConc><ImpNeto>${(exento ? 0 : neto).toFixed(2)}</ImpNeto><ImpOpEx>${(exento ? neto : 0).toFixed(2)}</ImpOpEx><ImpTrib>0.00</ImpTrib><ImpIVA>${iva.toFixed(2)}</ImpIVA>${fceVto}<MonId>PES</MonId><MonCotiz>1.000000</MonCotiz><CondicionIVAReceptorId>${cond}</CondicionIVAReceptorId>${asocXml}${ivaXml}${opcionales}</FECAEDetRequest></FeDetReq></FeCAEReq>`,
        xml = await call("FECAESolicitar", detail, cr),
        result = tag(xml, "Resultado"),
        cae = tag(xml, "CAE"),
        caeVto = tag(xml, "CAEFchVto"),
        msgs = [...xml.matchAll(/<(?:Msg|Obs)>([\s\S]*?)<\/(?:Msg|Obs)>/gi)]
          .map((m) => dec(m[1].trim()))
          .filter(Boolean);
      if (result !== "A" || !cae)
        throw Object.assign(
          new Error(msgs.join(" · ") || "ARCA rechazó el comprobante"),
          { status: 422 },
        );
      authorized = true;
      const numero = `${String(PTO).padStart(5, "0")}-${String(next).padStart(8, "0")}`,
        comp = {
          ambiente: "produccion",
          tipo: cfg.nombre,
          familia: cfg.familia,
          letra: cfg.letra,
          fce: !!cfg.fce,
          ...(settingsFce||{}),
          ...(anulacionFce?{anulacionFce}:{}),
          ...(verificacionFce?{verificacionFce}:{}),
          ptoVta: PTO,
          cbteTipo: tipo,
          cbteNro: next,
          numeroCompleto: numero,
          fecha: hoy.iso,
          concepto,
          ...(concepto!==1?{fechaServicioDesde:periodo.fechaServicioDesde,fechaServicioHasta:periodo.fechaServicioHasta}:{}),
          cae,
          caeVto,
          cliente: String(obra.cliente || ""),
          cuit,
          domicilioFiscal,
          neto,
          iva,
          total,
          alicuota: exento ? "exento" : ivaCfg.pct,
          condicionIVAReceptorId: cond,
          items,
          asociado: asoc || null,
          diasPago: dias,
          fechaPrevistaCobro: vto.iso,
          emitidaPor: email,
          drivePendiente: true,
          emailPendiente: true,
        },
        all = [...prev, comp],
        nextFiscal = saldoFiscal(pres, [...fiscalPrev, comp]),
        fin = {
          ...(obra.finanzas || {}),
          total: pres,
          diasPago: dias,
          facturadoNeto: nextFiscal.emitido,
          saldoFacturacionNeto: nextFiscal.saldo,
        };
      await op.set(
        {
          status: "autorizada",
          comprobante: comp,
          finalizadoAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await ref.update({
        facturaArca: comp,
        comprobantesArca: all,
        facturasArca: all,
        finanzas: fin,
        nrfc: numero,
        ffc: hoy.iso,
        facturado: nextFiscal.saldo <= 0.01,
        facturaDrivePendiente: true,
        clienteDomicilioFiscal: domicilioFiscal,
        domicilioFiscal,
        estadoGestionFactura: "Facturada - falta enviar",
        facturacionActualizadaAt: new Date().toISOString(),
      });
      await lock.set(
        {
          status: "libre",
          ultimoNumero: next,
          finalizadoAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      let drive = null,
        driveError = "";
      try {
        drive = await archivarFacturaPdfEnDrive({
          factura: comp,
          obra,
          issuerCuit: issuer.value(),
          accessToken: String(req.body?.driveAccessToken || "").trim(),
        });
        await ref.update({
          "facturaArca.driveFileId": drive.fileId,
          "facturaArca.driveFileName": drive.fileName,
          "facturaArca.driveWebViewLink": drive.webViewLink,
          "facturaArca.drivePendiente": false,
          facturaDrivePendiente: false,
          ultimoPdfFacturaId: drive.fileId,
          ultimoPdfFacturaUrl: drive.webViewLink,
        });
        comp.driveFileId = drive.fileId;
        comp.driveFileName = drive.fileName;
        comp.driveWebViewLink = drive.webViewLink;
        comp.drivePendiente = false;
        const archived = all.map(x => x.cae === comp.cae && Number(x.cbteTipo) === tipo && Number(x.cbteNro) === next
          ? { ...x, driveFileId: drive.fileId, driveFileName: drive.fileName, driveWebViewLink: drive.webViewLink, drivePendiente: false }
          : x);
        await ref.update({ comprobantesArca: archived, facturasArca: archived });
        await op.set({ comprobante: comp }, { merge: true });
      } catch (e) {
        driveError = e.message || String(e);
        console.error("PDF Drive pendiente", {
          obraId,
          numero,
          error: driveError,
        });
        await ref
          .set(
            {
              facturaDriveUltimoError: driveError,
              facturaDriveUltimoIntentoAt: new Date().toISOString(),
            },
            { merge: true },
          )
          .catch(() => {});
      }
      let baseMadre = null,
        baseMadreError = "";
      try {
        baseMadre = await syncBaseMadreFactura(obra, [...fiscalPrev, comp], db, obraId, email);
      } catch (e) {
        baseMadreError = e.message || String(e);
        console.error("Base Madre factura pendiente", {
          obraId,
          numero,
          error: baseMadreError,
        });
        await ref
          .set({ baseMadreFactCobUltimoError: baseMadreError }, { merge: true })
          .catch(() => {});
      }
      return res.json({
        ok: true,
        ...comp,
        drive,
        driveError,
        drivePendiente: !drive,
        baseMadre,
        baseMadreError,
        saldoNeto: nextFiscal.saldo,
      });
    } catch (e) {
      if (lock)
        await lock
          .set(
            {
              status: "libre",
              error: e.message || String(e),
              finalizadoAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          )
          .catch(() => {});
      if (op && !authorized && e.status !== 409)
        await op
          .set(
            {
              status: "revision_requerida",
              error: e.message || String(e),
              finalizadoAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          )
          .catch(() => {});
      return res
        .status(e.status || 502)
        .json({ ok: false, error: e.message || "No se pudo emitir",...(e.code?.startsWith('FCE_')?{code:e.code,etapa:e.etapa}:{}) });
    }
  },
);
module.exports = { facturacionIntegralEmitirV83 };

