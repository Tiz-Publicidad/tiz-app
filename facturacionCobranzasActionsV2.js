// TIZ Facturacion y Cobranzas V2.0 - acciones operativas con guardrails
(function(){
'use strict';
const obra=id=>(window.DB?.obras||[]).find(o=>o.id===id)||null;
const now=()=>new Date().toISOString();
const n=v=>Number(v)||0;
const norm=v=>String(v??'').replace(/\D/g,'');
function work(obraId){return window.TIZFacturacionCobranzasDataV2?.build?.().workItems?.find(w=>w.obraId===obraId)||null}
async function save(o,patch){if(!o)throw new Error('No se encontro la OT');if(typeof window.updateDoc_!=='function')throw new Error('Firestore no disponible');await window.updateDoc_('obras',o.id,patch);Object.assign(o,patch);window.TIZFactCobUIV2?.render?.();if(typeof window.sincronizarFacturacionBaseMadreTIZV117==='function')window.sincronizarFacturacionBaseMadreTIZV117(o,{silent:true}).catch(e=>{console.warn('[TIZ FactCob] Planilla pendiente',e);window.showToast?.('Dato guardado en TIZ; la planilla se reintentará automáticamente')});return patch}
async function registrarCobro(obraId,payload){
 const o=obra(obraId),w=work(obraId);if(!o||!w)throw new Error('No se encontro la OT');
 const amount=(v,label)=>{const x=Number(v??0);if(!Number.isFinite(x)||x<0)throw new Error('Revisá el importe de '+label);return Math.round((x+Number.EPSILON)*100)/100};
 const detalle=payload?.retencionesDetalle;
 const retencionesDetalle=detalle?{
   iva:amount(detalle.iva,'retención de IVA'),
   ingresosBrutos:amount(detalle.ingresosBrutos,'retención de Ingresos Brutos'),
   ganancias:amount(detalle.ganancias,'retención de Ganancias'),
   suss:amount(detalle.suss,'retención de SUSS')
 }:null;
 const retenciones=retencionesDetalle?Math.round(Object.values(retencionesDetalle).reduce((a,b)=>a+b,0)*100)/100:amount(payload?.retenciones,'retenciones');
 if(retencionesDetalle&&payload?.retenciones!=null&&Math.abs(retenciones-Number(payload.retenciones))>.01)throw new Error('El total de retenciones no coincide con el detalle');
 const base=payload?.base==='cotizacion'?'cotizacion':'facturado';
 const saldoCotizacion=Math.max(0,Math.round((w.importeAprobado-w.cobrado-w.retenciones)*100)/100);
 const saldo=base==='cotizacion'?saldoCotizacion:w.porCobrar;
 const row={id:'cob-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),invoiceKey:String(payload?.invoiceKey||''),facturaNumero:String(payload?.facturaNumero||''),fecha:String(payload?.fecha||new Date().toISOString().slice(0,10)),importe:amount(payload?.importe,'cobro'),medio:String(payload?.medio||''),referencia:String(payload?.referencia||''),retenciones,retencionesDetalle:retencionesDetalle||{},base,modo:String(payload?.modo||'importe'),porcentaje:amount(payload?.porcentaje,'porcentaje'),observaciones:String(payload?.observaciones||''),creadoAt:now()};
 if(row.porcentaje>100)throw new Error('El porcentaje no puede superar el 100%');
 if(!(row.importe>0||row.retenciones>0))throw new Error('El cobro o la retención debe ser mayor a cero');
 const aplicado=Math.round((row.importe+row.retenciones)*100)/100;
 if(aplicado-saldo>.01&&!payload?.permitirExceso)throw new Error(`El cobro + retenciones supera el saldo ${base==='cotizacion'?'de la cotización':'facturado'} (${saldo.toLocaleString('es-AR',{style:'currency',currency:'ARS'})}). Revisalo antes de guardar.`);
 const cobros=Array.isArray(o.cobros)?[...o.cobros]:[];cobros.push(row);await save(o,{cobros});return row;
}
async function registrarFacturaManual(obraId,payload){
 if(!window.currentUser?.isAdmin)throw new Error('Solo administración puede registrar facturas');
 const o=obra(obraId),w=work(obraId);if(!o)throw new Error('No se encontró la OT');
 const m=String(payload?.numeroCompleto||'').trim().match(/^(\d{1,5})-(\d{1,8})$/);
 if(!m||Number(m[1])!==3||!Number(m[2]))throw new Error('Ingresá un número del punto de venta 0003 (00003-00000001)');
 const cbteTipo=Number(payload?.cbteTipo),tipo={1:'Factura A',6:'Factura B',201:'Factura de Crédito Electrónica A',206:'Factura de Crédito Electrónica B'}[cbteTipo];
 if(!tipo)throw new Error('Seleccioná el tipo de factura emitida en ARCA');
 const numeroCompleto=`00003-${m[2].padStart(8,'0')}`,cbteNro=Number(m[2]),cae=String(payload?.cae||'').trim();
 if(!/^\d{14}$/.test(cae))throw new Error('Ingresá el CAE de 14 dígitos que figura en ARCA');
 const fecha=String(payload?.fecha||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||Number.isNaN(Date.parse(fecha)))throw new Error('Ingresá la fecha de emisión');
 const neto=Number(payload?.neto),iva=Number(payload?.iva),total=Number(payload?.total);
 if(!Number.isFinite(neto)||neto<=0||!Number.isFinite(iva)||iva<0||!Number.isFinite(total)||Math.abs(total-neto-iva)>.02)throw new Error('Revisá neto, IVA y total: el total debe ser neto + IVA');
 const existentes=(window.DB?.obras||[]).flatMap(x=>[...(x.facturasManual||[]),...(x.comprobantesArca||[]),...(x.facturasArca||[]),x.facturaArca].filter(Boolean));
 if(existentes.some(x=>Number(x.cbteTipo)===cbteTipo&&Number(x.ptoVta||String(x.numeroCompleto||'').split('-')[0])===3&&Number(x.cbteNro||String(x.numeroCompleto||'').split('-')[1])===cbteNro))throw new Error('Este comprobante ya está registrado');
 if(existentes.some(x=>String(x.cae||'')===cae))throw new Error('Este CAE ya está registrado');
 const aprobado=n(o.finanzas?.total||o.neto||o.importe||o.infoPresupuesto?.importe);const yaEmitido=(o.comprobantesArca||o.facturasArca||[]).reduce((sum,x)=>sum+(x.familia==='credito'?-n(x.neto):n(x.neto)),0)+(o.facturasManual||[]).reduce((sum,x)=>sum+n(x.neto),0);const saldo=w?.importeAprobado? w.porFacturar:Math.max(0,aprobado-yaEmitido);if(aprobado>0&&neto-saldo>.02)throw new Error(`El neto supera el saldo por facturar (${saldo.toLocaleString('es-AR',{style:'currency',currency:'ARS'})}). Revisá la OT antes de cargarla.`);
 const url=String(payload?.driveUrl||'').trim();if(url&&!/^https:\/\/drive\.google\.com\//i.test(url))throw new Error('El enlace del PDF debe ser de Google Drive');
 const row={id:'manual-'+Date.now(),origen:'manual',fuente:'ARCA web',familia:'factura',letra:[1,201].includes(cbteTipo)?'A':'B',tipo,cbteTipo,ptoVta:3,cbteNro,numeroCompleto,cae,caeVto:String(payload?.caeVto||''),fecha,neto,iva,total,porcentaje:w?.importeAprobado?Math.round(neto/w.importeAprobado*10000)/100:0,tipoParte:'otro',estadoEnvio:'pendiente',driveWebViewLink:url,creadoAt:now(),creadoPor:String(window.currentUser?.email||'')};
 await save(o,{facturasManual:[...(o.facturasManual||[]),row]});return row;
}
async function guardarSeguimiento(obraId,payload){const o=obra(obraId);const seguimientoCobranzas={accion:String(payload?.accion||''),fecha:String(payload?.fecha||''),nota:String(payload?.nota||''),actualizadoAt:now()};const historial=Array.isArray(o?.seguimientoCobranzasHistorial)?[...o.seguimientoCobranzasHistorial]:[];historial.push({...seguimientoCobranzas,id:'seg-'+Date.now()});await save(o,{seguimientoCobranzas,seguimientoCobranzasHistorial:historial.slice(-100)});return seguimientoCobranzas}
async function guardarGestionFactura(obraId,invoiceKey,payload){const o=obra(obraId);if(!o)throw new Error('No se encontro la OT');const facturacionGestion={...(o.facturacionGestion||{})},key=String(invoiceKey||'').trim();if(!key)throw new Error('No se pudo identificar la factura');facturacionGestion[key]={...(facturacionGestion[key]||{}),estadoEnvio:String(payload?.estadoEnvio||facturacionGestion[key]?.estadoEnvio||''),fechaVencimientoPago:String(payload?.fechaVencimientoPago||facturacionGestion[key]?.fechaVencimientoPago||''),nota:String(payload?.nota||''),driveUrl:String(payload?.driveUrl||facturacionGestion[key]?.driveUrl||''),driveFileId:String(payload?.driveFileId||facturacionGestion[key]?.driveFileId||''),actualizadoAt:now()};await save(o,{facturacionGestion});return facturacionGestion[key]}
async function guardarCondicionPago(obraId,dias){const o=obra(obraId);if(!o)throw new Error('No se encontro la OT');const value=Math.max(0,n(dias)),finanzas={...(o.finanzas||{}),diasPago:value};await save(o,{finanzas,diasPago:value});return finanzas}
async function guardarEstadoCobranza(obraId,estado){const o=obra(obraId);if(!o)throw new Error('No se encontro la OT');const v=String(estado||'').toLowerCase().trim();if(!['pendiente','cobrado pendiente','cobrado'].includes(v))throw new Error('Estado de cobranza invalido');const patch={cobranzaEstadoManual:v,historicoCerrado:v==='cobrado',cobranzaEstadoManualAt:now()};await save(o,patch);return patch}
async function cambiarEstadoGestion(obraId,estado,opts={}){const o=obra(obraId),w=work(obraId);if(!o||!w)throw new Error('No se encontro la OT');const v=String(estado||'').toLowerCase().trim(),validos=['pendiente_facturacion','facturado_parcial','facturado','cobrado_pendiente','cobrado','historico'];if(!validos.includes(v))throw new Error('Estado de gestion invalido');if(v==='pendiente_facturacion'&&w.invoices.length)throw new Error('La OT ya tiene facturas registradas. No se pueden ocultar ni borrar para volver a Pendiente de facturacion.');if((v==='facturado'||v==='facturado_parcial')&&!w.invoices.length)throw new Error('No se puede marcar Facturado sin una factura registrada. Emiti por ARCA o registra la factura historica.');if(v==='facturado'&&w.porFacturar>.01)throw new Error('Todavia queda saldo por facturar. El estado correcto es Facturado parcial.');if(v==='cobrado_pendiente'&&!(w.cobrado>0||w.retenciones>0))throw new Error('No hay cobros ni retenciones registrados para marcar Cobrado pendiente.');if((v==='cobrado'||v==='historico')&&w.porCobrar>.01&&!opts.cierreExcepcional)throw new Error('Todavia queda saldo por cobrar. Registra el cobro/retenciones antes de cerrar, o usa un cierre excepcional auditado.');const historial=Array.isArray(o.historialGestionFactCob)?[...o.historialGestionFactCob]:[];historial.push({id:'gest-'+Date.now(),estadoAnterior:w.estadoOperativo,estadoNuevo:v,nota:String(opts.nota||''),cierreExcepcional:!!opts.cierreExcepcional,creadoAt:now(),creadoPor:String(window.currentUser?.email||'')});const patch={estadoGestionFactCob:v,estadoGestionFactCobAt:now(),historialGestionFactCob:historial.slice(-200)};if(v==='cobrado'||v==='historico'){patch.cobranzaEstadoManual='cobrado';patch.historicoCerrado=true}else if(v==='cobrado_pendiente'){patch.cobranzaEstadoManual='cobrado pendiente';patch.historicoCerrado=false}else{patch.historicoCerrado=false}await save(o,patch);return patch}
function emitirArca(obraId){if(typeof window.abrirFacturacionGeneralV63!=='function')throw new Error('El facturador ARCA no esta disponible');return window.abrirFacturacionGeneralV63(obraId)}
window.TIZFactCobActionsV2={registrarCobro,registrarFacturaManual,guardarSeguimiento,guardarGestionFactura,guardarCondicionPago,guardarEstadoCobranza,cambiarEstadoGestion,emitirArca};
})();
