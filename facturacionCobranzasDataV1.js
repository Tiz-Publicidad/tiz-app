// TIZ Facturacion y Cobranzas Redesign V1.1 - canonical data adapter
(function(){
'use strict';

const num=v=>Number(v)||0;
const text=v=>String(v??'').trim();
const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const baseOt=v=>{const m=text(v).match(/\d{4,7}/);return m?String(Number(m[0])):''};
const approved=v=>norm(v).startsWith('aprob');
const round=v=>Math.round((num(v)+Number.EPSILON)*100)/100;
const iso=v=>{
  const s=text(v);if(!s)return'';
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return `${m[1]}-${m[2]}-${m[3]}`;
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return s.slice(0,10);
};
function addDays(date,days){if(!date||!days)return'';const d=new Date(date+'T12:00:00');if(Number.isNaN(d.getTime()))return'';d.setDate(d.getDate()+Number(days));return d.toISOString().slice(0,10)}

function clientIndex(){
  const map=new Map();
  for(const c of (window.DB?.clientes||[]))for(const k of [c.id,c.nombre,c.razonSocial,c.razon_social,c.nombreFiscal].map(norm).filter(Boolean))map.set(k,c);
  return map;
}
function findClient(o,p,map){for(const k of [o?.clienteId,p?.clienteId,o?.cliente,p?.cliente].map(norm).filter(Boolean))if(map.has(k))return map.get(k);return null}
function itemTotal(p){
  const raw=Array.isArray(p?.items)?p.items:Array.isArray(p?.itemsCotizados)?p.itemsCotizados:[];
  return round(raw.reduce((a,it)=>a+num(it?.subtotal||it?.total||num(it?.precio||it?.unitario||it?.precioUnitario)*num(it?.cant||it?.cantidad||it?.unidades||1)),0));
}
function approvedTotal(p,o){return round(num(p?.importe||p?.neto||p?.total||p?.totalItems)||itemTotal(p)||num(o?.finanzas?.total||o?.infoPresupuesto?.importe||o?.neto||o?.importe))}
function latestApprovedBudgets(){
  const map=new Map();
  for(const p of (window.DB?.presupuestos||[])){
    if(!approved(p?.estado||p?.status||p?.estadoRevision))continue;
    const ot=baseOt(p?.nro||p?.nroPresupuesto||p?.cotizacionBase);if(!ot)continue;
    const prev=map.get(ot),rev=text(p?.revision||p?.rev||'1.0'),prevRev=text(prev?.revision||prev?.rev||'0');
    if(!prev||rev.localeCompare(prevRev,undefined,{numeric:true})>=0)map.set(ot,p);
  }
  return map;
}
function obraIndex(){
  const byId=new Map(),byOt=new Map(),byPres=new Map();
  for(const o of (window.DB?.obras||[])){
    if(o?.id)byId.set(o.id,o);
    const ot=baseOt(o?.ot||o?.nroPresupuesto||o?.infoPresupuesto?.nro);if(ot&&!byOt.has(ot))byOt.set(ot,o);
    for(const k of [o?.presupuestoId,o?.cotizacionId,o?.infoPresupuesto?.presupuestoId].filter(Boolean))byPres.set(k,o);
  }
  return {byId,byOt,byPres};
}
function matchObra(p,ot,idx){return (p?.obraId&&idx.byId.get(p.obraId))||(p?.id&&idx.byPres.get(p.id))||idx.byOt.get(ot)||null}

function parsedNumber(raw){
  const full=text(raw?.numeroCompleto||raw?.nroFactura||raw?.numero||raw?.nrfc);
  const pto=num(raw?.ptoVta||raw?.puntoVenta),cbte=num(raw?.cbteNro||raw?.numeroComprobante);
  if(pto&&cbte)return {pto,cbte,full:full||`${String(pto).padStart(5,'0')}-${String(cbte).padStart(8,'0')}`};
  const m=full.match(/(\d{1,5})\D+(\d{1,8})$/);if(m)return {pto:Number(m[1]),cbte:Number(m[2]),full};
  const n=full.match(/(\d{1,8})$/);return n?{pto:0,cbte:Number(n[1]),full}: {pto:0,cbte:0,full};
}
function candidateKeys(raw){
  const keys=[];const n=parsedNumber(raw),cae=text(raw?.cae),id=text(raw?.id);
  if(cae)keys.push('cae:'+cae);
  if(n.pto&&n.cbte)keys.push(`pv:${n.pto}:${n.cbte}`);
  if(n.cbte)keys.push('n:'+n.cbte);
  if(n.full)keys.push('f:'+n.full.replace(/\D/g,''));
  if(id)keys.push('id:'+id);
  return [...new Set(keys)];
}
function invoiceFrom(raw,ctx={}){
  if(!raw)return null;const n=parsedNumber(raw),cae=text(raw?.cae);if(!n.full&&!n.cbte&&!cae)return null;
  const neto=round(num(raw?.neto||raw?.montoNeto||raw?.monto||ctx.neto));
  const iva=round(num(raw?.iva||raw?.importeIva));
  const total=round(num(raw?.total||raw?.importeTotal)||(neto+iva)||neto);
  const sentAt=text(raw?.emailUltimoEnvioAt||raw?.enviadaAt||ctx.emailUltimoEnvioAt);
  const driveUrl=text(raw?.driveWebViewLink||raw?.driveUrl||raw?.webViewLink||raw?.pdfUrl||raw?.pdfDriveUrl||ctx.driveUrl);
  const driveFileId=text(raw?.driveFileId||raw?.fileId||ctx.driveFileId);
  return {
    id:candidateKeys(raw)[0]||('tmp-'+Math.random()),obraId:ctx.obraId||'',presupuestoId:ctx.presupuestoId||'',ot:ctx.ot||'',
    origen:cae?'arca':(ctx.origen||raw?.origen||'historica'),tipoParte:text(raw?.tipoParte||ctx.tipoParte||'otro'),
    porcentaje:round(num(raw?.porcentaje||ctx.porcentaje)),neto,iva,total,
    numeroCompleto:n.full||text(raw?.numeroCompleto||raw?.nroFactura||raw?.numero||raw?.nrfc),ptoVta:n.pto,cbteNro:n.cbte,
    cbteTipo:num(raw?.cbteTipo),tipo:text(raw?.tipo),cae,
    fechaEmision:iso(raw?.fecha||raw?.fechaEmision||raw?.fechaFactura||ctx.fecha),
    fechaVencimientoPago:iso(raw?.fechaVencimientoPago||raw?.vencimiento||ctx.vencimiento),
    driveFileId,driveUrl,drivePendiente:raw?.drivePendiente===true||(!driveUrl&&!driveFileId),
    estadoEnvio:sentAt?'enviado':(norm(ctx.estadoGestionFactura)==='factura enviada'?'enviado':text(raw?.estadoEnvio||'pendiente')),
    emailUltimoEnvioAt:sentAt,raw
  };
}
function mergeInvoice(a,b){
  if(!a)return b;if(!b)return a;
  const prefer=(x,y)=>x||y;
  return {
    ...a,...b,
    id:a.id||b.id,
    origen:(a.cae||b.cae)?'arca':prefer(a.origen,b.origen),
    numeroCompleto:prefer(a.numeroCompleto,b.numeroCompleto),ptoVta:a.ptoVta||b.ptoVta,cbteNro:a.cbteNro||b.cbteNro,
    cbteTipo:a.cbteTipo||b.cbteTipo,tipo:prefer(a.tipo,b.tipo),cae:prefer(a.cae,b.cae),
    neto:Math.max(num(a.neto),num(b.neto)),iva:Math.max(num(a.iva),num(b.iva)),total:Math.max(num(a.total),num(b.total)),
    porcentaje:Math.max(num(a.porcentaje),num(b.porcentaje)),tipoParte:a.tipoParte!=='otro'?a.tipoParte:b.tipoParte,
    fechaEmision:prefer(a.fechaEmision,b.fechaEmision),fechaVencimientoPago:prefer(a.fechaVencimientoPago,b.fechaVencimientoPago),
    driveFileId:prefer(a.driveFileId,b.driveFileId),driveUrl:prefer(a.driveUrl,b.driveUrl),
    drivePendiente:!(prefer(a.driveFileId,b.driveFileId)||prefer(a.driveUrl,b.driveUrl)),
    estadoEnvio:(a.estadoEnvio==='enviado'||b.estadoEnvio==='enviado')?'enviado':prefer(a.estadoEnvio,b.estadoEnvio),
    emailUltimoEnvioAt:prefer(a.emailUltimoEnvioAt,b.emailUltimoEnvioAt),
    raw:a.raw||b.raw
  };
}
function invoicesFor(o,work){
  if(!o)return[];
  const ctx={obraId:o?.id||'',presupuestoId:work.presupuestoId,ot:work.ot,estadoGestionFactura:o?.estadoGestionFactura};
  const sources=[];
  const add=(raw,extra={})=>{if(raw)sources.push({raw,ctx:{...ctx,...extra}})};
  for(const x of (Array.isArray(o?.facturasArca)?o.facturasArca:[]))add(x,{origen:'arca'});
  for(const x of (Array.isArray(o?.comprobantesArca)?o.comprobantesArca:[]))add(x,{origen:x?.cae?'arca':'historica'});
  for(const x of (Array.isArray(o?.facturasManual)?o.facturasManual:[]))add(x,{origen:'manual'});
  add(o?.facturaArca,{origen:'arca'});
  const f=o?.finanzas||{},a=f?.anticipo||{},s=f?.saldo||{};
  if(a?.nroFactura||a?.facturado)add({numeroCompleto:a.nroFactura,fechaFactura:a.fechaFactura,neto:a.monto,porcentaje:a.porcentaje},{tipoParte:'anticipo',origen:'manual',vencimiento:a.fechaPrevistaCobro});
  if(s?.nroFactura||s?.facturado)add({numeroCompleto:s.nroFactura,fechaFactura:s.fechaFactura,neto:s.monto,porcentaje:s.porcentaje},{tipoParte:'saldo',origen:'manual',vencimiento:s.fechaPrevistaCobro});
  const sf=o?.sectores?.facturacion||o?.gestionSectores?.facturacion||{};
  add({numeroCompleto:o?.nrfc,fecha:o?.ffc||o?.fechaFactura},{origen:'historica',neto:work.importeAprobado,driveUrl:o?.facturaDriveWebViewLink||o?.facturaDriveUrl,driveFileId:o?.facturaDriveFileId});
  add({numeroCompleto:sf?.nroFactura,fecha:sf?.fechaFactura},{origen:'historica',neto:num(sf?.importeFacturado),driveUrl:sf?.driveWebViewLink||sf?.driveUrl,driveFileId:sf?.driveFileId});

  const merged=[];const keyToIndex=new Map();
  for(const src of sources){
    const inv=invoiceFrom(src.raw,src.ctx);if(!inv)continue;
    const keys=candidateKeys(src.raw);let idx=-1;
    for(const k of keys)if(keyToIndex.has(k)){idx=keyToIndex.get(k);break}
    if(idx<0){idx=merged.length;merged.push(inv)}else merged[idx]=mergeInvoice(merged[idx],inv);
    for(const k of keys)keyToIndex.set(k,idx);
  }
  return merged.sort((a,b)=>(a.fechaEmision||'').localeCompare(b.fechaEmision||''));
}
function paymentsFor(o,work){
  if(!o)return[];const out=[],seen=new Set(),f=o?.finanzas||{};
  const push=p=>{const imp=round(p?.importe),ret=round(p?.retenciones);if(!(imp>0||ret>0))return;const key=text(p?.id)||[iso(p?.fecha),imp,ret,text(p?.referencia)].join('|');if(seen.has(key))return;seen.add(key);out.push({...p,importe:imp,retenciones:ret})};
  for(const c of (Array.isArray(o?.cobros)?o.cobros:[]))push({id:c?.id,obraId:o?.id||'',invoiceId:text(c?.invoiceId),fecha:iso(c?.fecha||c?.fechaCobro),importe:num(c?.importe||c?.monto),medio:text(c?.medio),referencia:text(c?.referencia),retenciones:num(c?.retenciones),observaciones:text(c?.observaciones)});
  for(const [tipo,part] of [['anticipo',f?.anticipo||{}],['saldo',f?.saldo||{}]])if(num(part?.montoCobrado)>0)push({id:`fin-${tipo}-${o?.id||work.ot}`,obraId:o?.id||'',fecha:iso(part?.fechaCobro),importe:num(part?.montoCobrado),medio:'',referencia:'',retenciones:0,observaciones:`Cobro ${tipo} (historico)`});
  for(const c of (window.DB?.cobranzas||[])){
    if(baseOt(c?.ot||c?.obra||c?.nroOt)!==work.ot)continue;
    if(norm(c?.estado)!=='cobrado'&&num(c?.cobrado||c?.importeCobrado)<=0)continue;
    push({id:c?.id,obraId:o?.id||'',fecha:iso(c?.fechaCobro||c?.fecha||c?.vencimiento),importe:num(c?.importeCobrado||c?.cobrado||c?.importe),medio:text(c?.medio),referencia:text(c?.referencia),retenciones:num(c?.retenciones),observaciones:text(c?.observaciones||c?.comentarios)});
  }
  const ret=f?.retenciones||{},retTotal=round(Object.values(ret).reduce((a,v)=>a+num(v),0));
  if(retTotal>0)push({id:`ret-${o?.id||work.ot}`,obraId:o?.id||'',fecha:'',importe:0,medio:'retencion',referencia:'',retenciones:retTotal,observaciones:'Retenciones registradas'});
  return out;
}
function followupFor(o){
  const g=o?.seguimientoCobranzas||o?.gestionCobranza||{};
  return {accion:text(g?.accion||g?.proximaAccion),fecha:iso(g?.fecha||g?.proximaFecha),nota:text(g?.nota||g?.observacion||g?.comentario),actualizadoAt:text(g?.actualizadoAt)};
}
function build(){
  const budgets=latestApprovedBudgets(),idx=obraIndex(),clients=clientIndex(),workItems=[],usedObras=new Set();
  const makeWork=(o,p,ot)=>{
    const c=findClient(o,p,clients),importe=approvedTotal(p,o);
    const w={id:o?.id||`pres-${p?.id||ot}`,obraId:o?.id||'',presupuestoId:p?.id||o?.presupuestoId||o?.cotizacionId||'',ot,
      clienteId:o?.clienteId||p?.clienteId||c?.id||'',clienteNombre:text(o?.cliente||p?.cliente||c?.nombre||c?.razonSocial),descripcion:text(o?.desc||o?.descripcion||p?.desc||p?.descripcion),
      importeAprobado:importe,estadoObra:text(o?.estado||p?.estado||'Aprobado'),diasPago:num(o?.finanzas?.diasPago||o?.diasPago||c?.diasPago||c?.dias_de_pago),
      requiereOC:!!(o?.requiereOC||c?.requiereOC||c?.requiereOc),oc:text(o?.oc||o?.ordenCompra||o?.sectores?.facturacion?.oc||o?.gestionSectores?.facturacion?.oc),
      cuit:text(o?.clienteCuit||o?.cuit||c?.cuit),condicionIVA:text(o?.condicionIVA||c?.condicionIVA||c?.condicionIva),fechaAprobacion:iso(p?.fechaAprobacion||p?.actualizadoAt||p?.fecha),
      obra:o||null,presupuesto:p||null,seguimiento:followupFor(o)};
    w.invoices=invoicesFor(o,w);w.payments=paymentsFor(o,w);return w;
  };
  for(const [ot,p] of budgets){const o=matchObra(p,ot,idx);if(o?.id)usedObras.add(o.id);workItems.push(makeWork(o,p,ot))}
  for(const o of (window.DB?.obras||[])){
    if(o?.id&&usedObras.has(o.id))continue;
    const ot=baseOt(o?.ot||o?.nroPresupuesto||o?.infoPresupuesto?.nro);if(!ot)continue;
    const w=makeWork(o,null,ot);if(!w.invoices.length)continue;workItems.push(w);
  }
  const today=new Date().toISOString().slice(0,10);
  for(const w of workItems){
    w.facturadoNeto=round(w.invoices.reduce((a,x)=>a+num(x.neto),0));
    w.facturadoTotal=round(w.invoices.reduce((a,x)=>a+num(x.total||x.neto),0));
    w.porFacturar=round(Math.max(0,w.importeAprobado-w.facturadoNeto));
    w.cobrado=round(w.payments.reduce((a,x)=>a+num(x.importe),0));
    w.retenciones=round(w.payments.reduce((a,x)=>a+num(x.retenciones),0));
    w.porCobrar=round(Math.max(0,w.facturadoTotal-w.cobrado-w.retenciones));
    w.pctFacturado=w.importeAprobado>0?Math.min(100,round(w.facturadoNeto/w.importeAprobado*100)):0;
    w.pctPorFacturar=Math.max(0,round(100-w.pctFacturado));
    w.pctCobrado=w.facturadoTotal>0?Math.min(100,round((w.cobrado+w.retenciones)/w.facturadoTotal*100)):0;
    w.facturacionEstado=w.facturadoNeto<=0?'sin_facturar':w.porFacturar<=0.01?'completa':'parcial';
    for(const i of w.invoices)if(!i.fechaVencimientoPago&&i.fechaEmision&&w.diasPago>0)i.fechaVencimientoPago=addDays(i.fechaEmision,w.diasPago);
    const due=w.invoices.filter(i=>num(i.total||i.neto)>0).map(i=>i.fechaVencimientoPago).filter(Boolean).sort()[0]||'';
    w.proximoVencimiento=due;
    w.cobranzaEstado=w.porCobrar<=0.01&&w.facturadoTotal>0?'cobrado':w.cobrado>0||w.retenciones>0?'parcial':(due&&due<today?'vencido':'no_cobrado');
    w.estadoEnvio=w.invoices.length&&w.invoices.every(x=>x.estadoEnvio==='enviado')?'enviado':w.invoices.length?'pendiente':'sin_factura';
    w.tienePdf=w.invoices.some(i=>i.driveUrl||i.driveFileId);
    w.pendienteFacturar=w.porFacturar>0.01;
    w.pendienteCobrar=w.facturadoTotal>0.01&&w.porCobrar>0.01;
  }
  workItems.sort((a,b)=>num(b.ot)-num(a.ot));
  const invoices=workItems.flatMap(w=>w.invoices.map(i=>({...i,clienteNombre:w.clienteNombre,descripcion:w.descripcion})));
  const payments=workItems.flatMap(w=>w.payments.map(p=>({...p,ot:w.ot,clienteNombre:w.clienteNombre})));
  return {workItems,invoices,payments,generatedAt:new Date().toISOString()};
}

window.TIZFacturacionCobranzasDataV1={build,baseOt,norm,approved};
console.info('[TIZ] Facturacion/Cobranzas Data V1.1 listo');
})();
