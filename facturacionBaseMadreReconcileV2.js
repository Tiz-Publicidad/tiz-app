// Conciliación de facturas y estados históricos entre Base Madre y TIZ.
(function(){
'use strict';
const SPREADSHEET_ID='1mOhuPKcMG8PO3QsY3g84WL4p3o43t4ilK8Jx1DHjF5M',SHEET='Base de datos';
const T=v=>String(v??'').trim(),norm=v=>T(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const N=v=>{if(typeof v==='number')return v;let s=T(v).replace(/[$\s]/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');return Number(s)||0};
const otBase=v=>{const m=T(v).match(/\d{4,7}/);return m?String(Number(m[0])):''};
function invoice(v){const s=T(v).replace(/^(\d+)\.0+$/,'$1'),m=s.match(/^(?:(\d{1,5})-)?(\d{1,8})$/);return m&&Number(m[2])>0?{number:m[1]?m[1].padStart(5,'0')+'-'+m[2].padStart(8,'0'):String(Number(m[2])),pv:m[1]?Number(m[1]):0,n:Number(m[2])}:null}
function sameInvoice(a,b){const x=invoice(a),y=invoice(b);return !!(x&&y&&x.n===y.n&&(!x.pv||!y.pv||x.pv===y.pv))}
function iso(v){const s=T(v);let m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/),y,month,day;if(m){[,y,month,day]=m}else{m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!m)return'';day=m[1];month=m[2];y=Number(m[3]);if(y<100)y+=2000}const d=new Date(Date.UTC(Number(y),Number(month)-1,Number(day)));return d.getUTCFullYear()===Number(y)&&d.getUTCMonth()===Number(month)-1&&d.getUTCDate()===Number(day)?d.toISOString().slice(0,10):''}
async function read(){if(typeof window.leerFacturacionBaseMadreTIZV123!=='function')throw new Error('No está disponible la lectura de Base Madre');return window.leerFacturacionBaseMadreTIZV123()}
function rows(data){return(data.rows||[]).map((r,i)=>({row:i+(data.firstRow||2),ot:otBase(r[2]),descripcion:T(r[3]),cliente:T(r[5]),neto:N(r[6]),bruto:N(r[7]),fechaFactura:iso(r[17]),numeroFactura:T(r[18]),vencimiento:iso(r[19]),status:T(r[24]),comentarios:T(r[25])})).filter(s=>s.ot&&(s.numeroFactura||s.status))}
function app(){return window.TIZFacturacionCobranzasDataV2?.build?.()||{workItems:[]}}
function clientMatches(w,s){if(!norm(s.cliente))return false;if(norm(w.clienteNombre)===norm(s.cliente))return true;const c=(window.DB?.clientes||[]).find(c=>c.id===w.clienteId);return !!c&&[c.nombre,c.razonSocial,c.razon_social,c.nombreFiscal].some(n=>norm(n)===norm(s.cliente))}
function chooseWork(works,s){const sameClient=works.filter(w=>String(w.ot)===s.ot&&clientMatches(w,s));if(sameClient.length===1)return sameClient[0];const exact=sameClient.filter(w=>norm(w.descripcion)===norm(s.descripcion));return exact.length===1?exact[0]:null}
function invoiceMatches(w,s){return(w?.invoices||[]).filter(i=>i.familia!=='credito'&&sameInvoice(i.numeroCompleto||i.cbteNro,s.numeroFactura))}
function statusDifference(w,s){const state=norm(s.status);if(state==='cobrado')return !w.historicoCerrado&&w.cobranzaEstado!=='cobrado';if(state==='cobrado pendiente')return norm(w.cobranzaEstadoManual)!=='cobrado pendiente'&&w.estadoOperativo!=='cobrado_pendiente';return false}
function classify(sheet,works){
 const items=sheet.map(s=>{
  const w=chooseWork(works,s),parsed=invoice(s.numeroFactura),matches=parsed&&w?invoiceMatches(w,{...s,numeroFactura:parsed.number}):[],inv=matches.length===1?matches[0]:null;let tipo='ok',detalle='Coincide con TIZ';
  if(!w){tipo=works.some(w=>String(w.ot)===s.ot)?'ambiguo':'sin_ot';detalle=tipo==='sin_ot'?'No hay una OT en Facturación/Cobranzas':'La OT o el cliente no tienen una coincidencia única'}
  else if(!w.obraId||w.anuladaConNC){tipo='ambiguo';detalle=w.anuladaConNC?'Factura anulada con NC: conservar su anulación':'La OT no está vinculada a una obra'}
  else if((s.numeroFactura&&!parsed)||matches.length>1){tipo='ambiguo';detalle='Número de factura compuesto o identidad fiscal ambigua'}
  else if(s.numeroFactura&&(!s.fechaFactura||s.neto<=0||(s.bruto>0&&s.bruto<s.neto))){tipo='ambiguo';detalle='Faltan fecha o importes válidos de la factura'}
  else if((inv&&inv.neto>0&&Math.abs(inv.neto-s.neto)>1)||(!inv&&parsed&&w.importeAprobado>0&&s.neto>w.importeAprobado+1)){tipo='importe';detalle='El neto difiere: revisar el importe antes de importar'}
  else if(parsed&&!inv){tipo='falta_tiz';detalle='Factura de Base Madre pendiente de registrar en TIZ'}
  else if(inv&&(!inv.neto||!inv.fechaEmision)){tipo='datos';detalle='Completar los datos históricos de la factura'}
  else if(statusDifference(w,s)){tipo='status';detalle='Base Madre: '+s.status+' · TIZ: '+w.estadoOperativo}
  return{...s,numeroFactura:parsed?.number||s.numeroFactura,tipo,detalle,obraId:w?.obraId||'',appEstado:w?.estadoOperativo||'',appInvoice:inv,safeImport:!!w&&['falta_tiz','datos','status'].includes(tipo)};
 });
 const groups=new Map();for(const item of items)if(item.obraId){const g=groups.get(item.obraId)||[];g.push(item);groups.set(item.obraId,g)}
 for(const g of groups.values())if(g.length>1)for(const item of g){item.safeImport=false;item.tipo='ambiguo';item.detalle='Varias filas corresponden a la misma obra: conciliar anticipo y saldo por separado'}
 return items;
}
async function audit(){const items=classify(rows(await read()),app().workItems),totales={filas:items.length,ok:0,faltan:0,status:0,importe:0,sinOt:0,ambiguos:0,datos:0};const counters={ok:'ok',falta_tiz:'faltan',status:'status',importe:'importe',sin_ot:'sinOt',ambiguo:'ambiguos',datos:'datos'};for(const item of items)totales[counters[item.tipo]]++;return{items,totales,leidoAt:new Date().toISOString()}}
async function importOne(item){
 if(!item?.safeImport)throw new Error('Este caso requiere revisión manual');
 const o=(window.DB?.obras||[]).find(x=>x.id===item.obraId),current=app().workItems.find(w=>w.obraId===item.obraId);
 if(!o||!current||current.anuladaConNC||!clientMatches(current,item))throw new Error('La OT cambió desde la revisión; volver a conciliar');
 const matches=invoiceMatches(current,item);if(matches.length>1)throw new Error('Identidad de factura ambigua');
 if(matches[0]?.neto>0&&Math.abs(matches[0].neto-item.neto)>1)throw new Error('El importe cambió desde la revisión');
 const facturas=Array.isArray(o.facturasBaseMadre)?[...o.facturasBaseMadre]:[];
 if(item.numeroFactura&&(!matches.length||!matches[0].neto||!matches[0].fechaEmision)&&!facturas.some(x=>sameInvoice(x.numeroCompleto,item.numeroFactura))){
  facturas.push({id:'base-madre-'+item.row,origen:'base_madre',numeroCompleto:item.numeroFactura,fecha:item.fechaFactura,neto:item.neto,iva:Math.max(0,Math.round((item.bruto-item.neto)*100)/100),total:item.bruto||item.neto,tipoParte:/anticipo/i.test(item.descripcion)?'anticipo':/saldo/i.test(item.descripcion)?'saldo':'otro',estadoEnvio:'pendiente',fechaVencimientoPago:item.vencimiento,baseMadreRow:item.row,baseMadreStatus:item.status,creadoAt:new Date().toISOString()});
 }
 const hist={...(o.historicoExcel||{}),estado:item.status,baseMadreRow:item.row,baseMadreComentarios:item.comentarios},patch={facturasBaseMadre:facturas,historicoExcel:hist,estadoHistoricoExcel:item.status,baseMadreConciliadaAt:new Date().toISOString()};
 if(norm(item.status)==='cobrado'){
  if(item.numeroFactura)hist.facturasCobradas=[...new Set([...(hist.facturasCobradas||[]),item.numeroFactura])];
  const otherInvoices=(current.invoices||[]).some(i=>i.familia!=='credito'&&!sameInvoice(i.numeroCompleto,item.numeroFactura));
  if(!otherInvoices){patch.cobranzaEstadoManual='cobrado';patch.historicoCerrado=true}
 }else if(norm(item.status)==='cobrado pendiente'&&!o.historicoCerrado){patch.cobranzaEstadoManual='cobrado pendiente';patch.historicoCerrado=false}
 const anterior=JSON.parse(JSON.stringify({facturasBaseMadre:o.facturasBaseMadre||[],historicoExcel:o.historicoExcel||{},estadoHistoricoExcel:o.estadoHistoricoExcel||'',cobranzaEstadoManual:o.cobranzaEstadoManual||'',historicoCerrado:!!o.historicoCerrado}));
 patch.historialConciliacionBaseMadre=[...(o.historialConciliacionBaseMadre||[]),{fecha:patch.baseMadreConciliadaAt,fila:item.row,estado:item.status,anterior}].slice(-20);
 await window.updateDoc_('obras',o.id,patch);Object.assign(o,patch);return{ok:true,row:item.row};
}
async function applySafe(report){
 const fresh=await audit(),wanted=new Set(report.items.filter(x=>x.safeImport).map(x=>x.row)),eligible=fresh.items.filter(x=>x.safeImport&&wanted.has(x.row));
 const result={aplicadas:0,errores:[]};for(const item of eligible){try{await importOne(item);result.aplicadas++}catch(e){result.errores.push({row:item.row,ot:item.ot,error:String(e.message||e)})}}
 window.TIZFactCobUIV2?.render?.();return result;
}
window.TIZFactBaseMadreV2={audit,importOne,applySafe,spreadsheetId:SPREADSHEET_ID,sheet:SHEET};
})();
