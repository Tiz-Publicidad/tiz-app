// TIZ Facturacion y Cobranzas Redesign V1 - canonical data adapter
(function(){
'use strict';

const num=v=>Number(v)||0;
const text=v=>String(v??'').trim();
const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const baseOt=v=>{const m=text(v).match(/\d{4,7}/);return m?String(Number(m[0])):''};
const approved=v=>norm(v).startsWith('aprob');
const iso=v=>{
  const s=text(v); if(!s)return '';
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m)return `${m[1]}-${m[2]}-${m[3]}`;
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return s.slice(0,10);
};
const round=v=>Math.round((num(v)+Number.EPSILON)*100)/100;

function clientIndex(){
  const map=new Map();
  for(const c of (window.DB?.clientes||[])){
    const keys=[c.id,c.nombre,c.razonSocial,c.razon_social,c.nombreFiscal].map(norm).filter(Boolean);
    for(const k of keys)map.set(k,c);
  }
  return map;
}
function findClient(o,p,map){
  const ids=[o?.clienteId,p?.clienteId,o?.cliente,p?.cliente].map(norm).filter(Boolean);
  for(const k of ids)if(map.has(k))return map.get(k);
  return null;
}
function itemTotal(p){
  const raw=Array.isArray(p?.items)?p.items:Array.isArray(p?.itemsCotizados)?p.itemsCotizados:[];
  return round(raw.reduce((a,it)=>a+num(it?.subtotal||it?.total||num(it?.precio||it?.unitario||it?.precioUnitario)*num(it?.cant||it?.cantidad||it?.unidades||1)),0));
}
function approvedTotal(p,o){
  return round(num(p?.importe||p?.neto||p?.total||p?.totalItems)||itemTotal(p)||num(o?.finanzas?.total||o?.infoPresupuesto?.importe||o?.neto||o?.importe));
}
function latestApprovedBudgets(){
  const map=new Map();
  for(const p of (window.DB?.presupuestos||[])){
    if(!approved(p?.estado||p?.status||p?.estadoRevision))continue;
    const ot=baseOt(p?.nro||p?.nroPresupuesto||p?.cotizacionBase); if(!ot)continue;
    const prev=map.get(ot);
    const rev=text(p?.revision||p?.rev||'1.0'), prevRev=text(prev?.revision||prev?.rev||'0');
    if(!prev||rev.localeCompare(prevRev,undefined,{numeric:true})>=0)map.set(ot,p);
  }
  return map;
}
function obraIndex(){
  const byId=new Map(),byOt=new Map(),byPres=new Map();
  for(const o of (window.DB?.obras||[])){
    if(o?.id)byId.set(o.id,o);
    const ot=baseOt(o?.ot||o?.nroPresupuesto||o?.infoPresupuesto?.nro); if(ot&&!byOt.has(ot))byOt.set(ot,o);
    for(const k of [o?.presupuestoId,o?.cotizacionId,o?.infoPresupuesto?.presupuestoId].filter(Boolean))byPres.set(k,o);
  }
  return {byId,byOt,byPres};
}
function matchObra(p,ot,idx){
  return (p?.obraId&&idx.byId.get(p.obraId)) || (p?.id&&idx.byPres.get(p.id)) || idx.byOt.get(ot) || null;
}
function invoiceKey(x){return text(x?.cae)||norm(x?.numeroCompleto||x?.nroFactura||x?.numero||x?.nrfc)||text(x?.id)}
function invoiceNumber(x){return text(x?.numeroCompleto||x?.nroFactura||x?.numero||x?.nrfc)}
function addInvoice(out,seen,raw,ctx={}){
  if(!raw)return;
  const number=invoiceNumber(raw); const cae=text(raw?.cae);
  if(!number&&!cae)return;
  const key=invoiceKey(raw); if(!key||seen.has(key))return; seen.add(key);
  const neto=round(num(raw?.neto||raw?.montoNeto||raw?.monto||ctx.neto));
  const iva=round(num(raw?.iva||raw?.importeIva));
  const total=round(num(raw?.total||raw?.importeTotal)||(neto+iva)||neto);
  const sentAt=text(raw?.emailUltimoEnvioAt||raw?.enviadaAt||ctx.emailUltimoEnvioAt);
  out.push({
    id:key,obraId:ctx.obraId||'',presupuestoId:ctx.presupuestoId||'',ot:ctx.ot||'',
    origen:cae?'arca':(ctx.origen||'historica'),tipoParte:ctx.tipoParte||raw?.tipoParte||'otro',
    porcentaje:round(num(raw?.porcentaje||ctx.porcentaje)),neto,iva,total,
    numeroCompleto:number,cbteTipo:num(raw?.cbteTipo),tipo:text(raw?.tipo),cae,
    fechaEmision:iso(raw?.fecha||raw?.fechaEmision||raw?.fechaFactura||ctx.fecha),
    fechaVencimientoPago:iso(raw?.fechaVencimientoPago||raw?.vencimiento||ctx.vencimiento),
    driveFileId:text(raw?.driveFileId||raw?.fileId),driveUrl:text(raw?.driveWebViewLink||raw?.driveUrl||raw?.webViewLink),
    estadoEnvio:sentAt?'enviado':(norm(ctx.estadoGestionFactura)==='factura enviada'?'enviado':(raw?.estadoEnvio||'pendiente')),
    emailUltimoEnvioAt:sentAt,
    raw
  });
}
function invoicesFor(o,work){
  const out=[],seen=new Set(),ctx={obraId:o?.id||'',presupuestoId:work.presupuestoId,ot:work.ot,estadoGestionFactura:o?.estadoGestionFactura};
  for(const x of (Array.isArray(o?.facturasArca)?o.facturasArca:[]))addInvoice(out,seen,x,{...ctx,origen:'arca'});
  for(const x of (Array.isArray(o?.comprobantesArca)?o.comprobantesArca:[]))addInvoice(out,seen,x,{...ctx,origen:x?.cae?'arca':'historica'});
  for(const x of (Array.isArray(o?.facturasManual)?o.facturasManual:[]))addInvoice(out,seen,x,{...ctx,origen:'manual'});
  addInvoice(out,seen,o?.facturaArca,{...ctx,origen:'arca'});
  const f=o?.finanzas||{};
  const a=f?.anticipo||{},s=f?.saldo||{};
  if(a?.nroFactura||a?.facturado)addInvoice(out,seen,{numeroCompleto:a.nroFactura,fechaFactura:a.fechaFactura,neto:a.monto,porcentaje:a.porcentaje},{...ctx,tipoParte:'anticipo',origen:'manual',vencimiento:a.fechaPrevistaCobro});
  if(s?.nroFactura||s?.facturado)addInvoice(out,seen,{numeroCompleto:s.nroFactura,fechaFactura:s.fechaFactura,neto:s.monto,porcentaje:s.porcentaje},{...ctx,tipoParte:'saldo',origen:'manual',vencimiento:s.fechaPrevistaCobro});
  const sf=o?.sectores?.facturacion||o?.gestionSectores?.facturacion||{};
  addInvoice(out,seen,{numeroCompleto:o?.nrfc,fecha:o?.ffc||o?.fechaFactura},{...ctx,origen:'historica',neto:work.importeAprobado});
  addInvoice(out,seen,{numeroCompleto:sf?.nroFactura,fecha:sf?.fechaFactura},{...ctx,origen:'historica',neto:num(sf?.importeFacturado)});
  return out.sort((a,b)=>(a.fechaEmision||'').localeCompare(b.fechaEmision||''));
}
function paymentsFor(o,work,invoices){
  const out=[]; const f=o?.finanzas||{};
  const push=(p)=>{if(num(p?.importe)>0||num(p?.retenciones)>0)out.push({...p,importe:round(p.importe),retenciones:round(p.retenciones)});};
  for(const c of (Array.isArray(o?.cobros)?o.cobros:[])){
    push({id:c?.id||`obra-cob-${work.ot}-${out.length}`,obraId:o?.id||'',invoiceId:text(c?.invoiceId),fecha:iso(c?.fecha||c?.fechaCobro),importe:num(c?.importe||c?.monto),medio:text(c?.medio),referencia:text(c?.referencia),retenciones:num(c?.retenciones),observaciones:text(c?.observaciones)});
  }
  for(const [tipo,part] of [['anticipo',f?.anticipo||{}],['saldo',f?.saldo||{}]]){
    if(num(part?.montoCobrado)>0)push({id:`fin-${tipo}-${o?.id||work.ot}`,obraId:o?.id||'',invoiceId:'',fecha:iso(part?.fechaCobro),importe:num(part?.montoCobrado),medio:'',referencia:'',retenciones:0,observaciones:`Cobro ${tipo} (histórico)`});
  }
  for(const c of (window.DB?.cobranzas||[])){
    const cot=baseOt(c?.ot||c?.obra||c?.nroOt); if(cot!==work.ot)continue;
    if(norm(c?.estado)!=='cobrado'&&num(c?.cobrado||c?.importeCobrado)<=0)continue;
    push({id:c?.id||`cobr-${work.ot}-${out.length}`,obraId:o?.id||'',invoiceId:'',fecha:iso(c?.fechaCobro||c?.fecha||c?.vencimiento),importe:num(c?.importeCobrado||c?.cobrado||c?.importe),medio:text(c?.medio),referencia:text(c?.referencia),retenciones:num(c?.retenciones),observaciones:text(c?.observaciones||c?.comentarios)});
  }
  const ret=f?.retenciones||{}; const retTotal=round(Object.values(ret).reduce((a,v)=>a+num(v),0));
  if(retTotal>0)push({id:`ret-${o?.id||work.ot}`,obraId:o?.id||'',invoiceId:'',fecha:'',importe:0,medio:'retencion',referencia:'',retenciones:retTotal,observaciones:'Retenciones registradas'});
  return out;
}
function build(){
  const budgets=latestApprovedBudgets(),idx=obraIndex(),clients=clientIndex(),workItems=[];
  const usedObras=new Set();
  for(const [ot,p] of budgets){
    const o=matchObra(p,ot,idx); if(o?.id)usedObras.add(o.id);
    const c=findClient(o,p,clients),importe=approvedTotal(p,o);
    const work={
      id:o?.id||`pres-${p?.id||ot}`,obraId:o?.id||'',presupuestoId:p?.id||'',ot,
      clienteId:o?.clienteId||p?.clienteId||c?.id||'',clienteNombre:text(o?.cliente||p?.cliente||c?.nombre||c?.razonSocial),
      descripcion:text(o?.desc||o?.descripcion||p?.desc||p?.descripcion),importeAprobado:importe,
      estadoObra:text(o?.estado||p?.estado||'Aprobado'),diasPago:num(o?.finanzas?.diasPago||o?.diasPago||c?.diasPago||c?.dias_de_pago),
      requiereOC:!!(o?.requiereOC||c?.requiereOC||c?.requiereOc),oc:text(o?.oc||o?.ordenCompra||o?.sectores?.facturacion?.oc||o?.gestionSectores?.facturacion?.oc),
      cuit:text(o?.clienteCuit||o?.cuit||c?.cuit),condicionIVA:text(o?.condicionIVA||c?.condicionIVA||c?.condicionIva),
      fechaAprobacion:iso(p?.fechaAprobacion||p?.actualizadoAt||p?.fecha),obra:o||null,presupuesto:p||null
    };
    work.invoices=invoicesFor(o,work); work.payments=paymentsFor(o,work,work.invoices); workItems.push(work);
  }
  // Keep orphan works that already have invoices, so historical/manual invoices never disappear.
  for(const o of (window.DB?.obras||[])){
    if(o?.id&&usedObras.has(o.id))continue;
    const ot=baseOt(o?.ot||o?.nroPresupuesto||o?.infoPresupuesto?.nro); if(!ot)continue;
    const dummy={obraId:o?.id||'',presupuestoId:o?.presupuestoId||o?.cotizacionId||'',ot,importeAprobado:approvedTotal(null,o)};
    const inv=invoicesFor(o,dummy); if(!inv.length)continue;
    const c=findClient(o,null,clients);
    const work={id:o?.id||`obra-${ot}`,obraId:o?.id||'',presupuestoId:dummy.presupuestoId,ot,clienteId:o?.clienteId||c?.id||'',clienteNombre:text(o?.cliente||c?.nombre||c?.razonSocial),descripcion:text(o?.desc||o?.descripcion),importeAprobado:dummy.importeAprobado,estadoObra:text(o?.estado),diasPago:num(o?.finanzas?.diasPago||o?.diasPago||c?.diasPago),requiereOC:!!(o?.requiereOC||c?.requiereOC),oc:text(o?.oc||o?.ordenCompra),cuit:text(o?.clienteCuit||o?.cuit||c?.cuit),condicionIVA:text(o?.condicionIVA||c?.condicionIVA),fechaAprobacion:'',obra:o,presupuesto:null,invoices:inv};
    work.payments=paymentsFor(o,work,inv); workItems.push(work);
  }
  for(const w of workItems){
    w.facturadoNeto=round(w.invoices.reduce((a,x)=>a+num(x.neto),0));
    w.facturadoTotal=round(w.invoices.reduce((a,x)=>a+num(x.total||x.neto),0));
    w.porFacturar=round(Math.max(0,w.importeAprobado-w.facturadoNeto));
    w.cobrado=round(w.payments.reduce((a,x)=>a+num(x.importe),0));
    w.retenciones=round(w.payments.reduce((a,x)=>a+num(x.retenciones),0));
    w.porCobrar=round(Math.max(0,w.facturadoTotal-w.cobrado-w.retenciones));
    w.facturacionEstado=w.facturadoNeto<=0?'sin_facturar':w.porFacturar<=0.01?'completa':'parcial';
    const today=new Date().toISOString().slice(0,10);
    const due=w.invoices.map(x=>x.fechaVencimientoPago).filter(Boolean).sort()[0]||'';
    w.proximoVencimiento=due;
    w.cobranzaEstado=w.porCobrar<=0.01&&w.facturadoTotal>0?'cobrado':w.cobrado>0||w.retenciones>0?'parcial':(due&&due<today?'vencido':'no_cobrado');
    w.estadoEnvio=w.invoices.length&&w.invoices.every(x=>x.estadoEnvio==='enviado')?'enviado':w.invoices.length?'pendiente':'sin_factura';
  }
  workItems.sort((a,b)=>num(b.ot)-num(a.ot));
  const invoices=workItems.flatMap(w=>w.invoices.map(i=>({...i,clienteNombre:w.clienteNombre,descripcion:w.descripcion})));
  const payments=workItems.flatMap(w=>w.payments.map(p=>({...p,ot:w.ot,clienteNombre:w.clienteNombre})));
  return {workItems,invoices,payments,generatedAt:new Date().toISOString()};
}

window.TIZFacturacionCobranzasDataV1={build,baseOt,norm,approved};
console.info('[TIZ] Facturacion/Cobranzas Data V1 listo');
})();
