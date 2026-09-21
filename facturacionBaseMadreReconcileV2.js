// TIZ Facturacion/Cobranzas V2 - conciliacion de facturas manuales contra Base Madre
(function(){
'use strict';
const SPREADSHEET_ID='1mOhuPKcMG8PO3QsY3g84WL4p3o43t4ilK8Jx1DHjF5M',SHEET='Base de datos';
const T=v=>String(v??'').trim(),N=v=>{if(typeof v==='number')return v;let s=T(v).replace(/\s/g,'');if(!s)return 0;if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');else if(s.includes(','))s=s.replace(',','.');return Number(s)||0};
const norm=v=>T(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const otBase=v=>{const m=T(v).match(/\d{4,7}/);return m?String(Number(m[0])):''};
const digits=v=>{const a=T(v).match(/\d+/g)||[];return a.length?String(Number(a[a.length-1])):''};
function iso(v){const s=T(v);if(!s)return'';if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!m)return'';let y=Number(m[3]);if(y<100)y+=2000;return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`}
async function token(){if(typeof window.autorizarBaseMadreTIZV111!=='function')throw new Error('No está disponible la autorización de Base Madre');return window.autorizarBaseMadreTIZV111()}
async function read(){const t=await token(),range=encodeURIComponent("'"+SHEET.replace(/'/g,"''")+"'!A2:AD1954"),r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+SPREADSHEET_ID+'/values/'+range+'?valueRenderOption=FORMATTED_VALUE',{headers:{Authorization:'Bearer '+t}}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||'No se pudo leer la Base Madre');return d.values||[]}
function rows(values){const out=[];for(let i=0;i<values.length;i++){const r=values[i]||[],ot=otBase(r[2]),numero=T(r[20]);if(!ot||!numero)continue;out.push({row:i+2,fechaBase:T(r[0]),ot,descripcion:T(r[3]),contacto:T(r[4]),cliente:T(r[5]),neto:N(r[6]),bruto:N(r[7]),fechaFactura:iso(r[19]),numeroFactura:numero,vencimiento:iso(r[21]),status:T(r[26]),comentarios:T(r[27])})}return out}
function app(){return window.TIZFacturacionCobranzasDataV2?.build?.()||{workItems:[]}}
function matchInvoice(w,s){const n=digits(s.numeroFactura);return(w?.invoices||[]).find(i=>digits(i.numeroCompleto||i.cbteNro)===n)||null}
function compareStatus(w,s){const ss=norm(s.status),as=norm(w?.estadoOperativo);if(ss==='cobrado')return ['cobrado','historico'].includes(as)?'ok':'diferencia';if(ss==='cobrado pendiente')return as==='cobrado pendiente'?'ok':'diferencia';return 'informativo'}
async function audit(){
 const sheet=rows(await read()),d=app(),byOt=new Map(d.workItems.map(w=>[String(w.ot),w])),items=[];
 for(const s of sheet){const w=byOt.get(s.ot),inv=w?matchInvoice(w,s):null;let tipo='ok',detalle='Coincide con TIZ';if(!w){tipo='sin_ot';detalle='La OT no existe en el modelo de Facturación/Cobranzas'}else if(!inv){tipo='falta_tiz';detalle='La factura figura en Base Madre pero no está registrada en TIZ'}else{const st=compareStatus(w,s);if(st==='diferencia'){tipo='status';detalle=`Estado Base Madre: ${s.status||'—'} · TIZ: ${w.estadoOperativo||'—'}`}else if(s.neto>0&&inv.neto>0&&Math.abs(s.neto-inv.neto)>1){tipo='importe';detalle=`Neto Base Madre ${s.neto.toLocaleString('es-AR')} · TIZ ${Number(inv.neto).toLocaleString('es-AR')}`}}
 items.push({...s,tipo,detalle,obraId:w?.obraId||'',appEstado:w?.estadoOperativo||'',appInvoice:inv||null,safeImport:!!w&&!inv&&s.neto>0&&!!s.fechaFactura});
 }
 return{items,totales:{filas:items.length,ok:items.filter(x=>x.tipo==='ok').length,faltan:items.filter(x=>x.tipo==='falta_tiz').length,status:items.filter(x=>x.tipo==='status').length,importe:items.filter(x=>x.tipo==='importe').length,sinOt:items.filter(x=>x.tipo==='sin_ot').length},leidoAt:new Date().toISOString()};
}
async function importOne(item){
 if(!item?.safeImport)throw new Error('Este caso requiere revisión manual');
 const o=(window.DB?.obras||[]).find(x=>x.id===item.obraId);if(!o)throw new Error('No se encontró la OT');
 const facturas=Array.isArray(o.facturasManual)?[...o.facturasManual]:[];
 if(facturas.some(x=>digits(x.numeroCompleto||x.nroFactura)===digits(item.numeroFactura)))return{ok:true,repetida:true};
 const iva=Math.max(0,item.bruto-item.neto),row={id:'base-madre-'+item.row,origen:'base_madre',numeroCompleto:item.numeroFactura,fecha:item.fechaFactura,neto:item.neto,iva,total:item.bruto||item.neto,porcentaje:0,tipoParte:/anticipo/i.test(item.descripcion)?'anticipo':/saldo/i.test(item.descripcion)?'saldo':'otro',estadoEnvio:/envie|envia|enviado/i.test(item.comentarios)?'enviado':'pendiente',fechaVencimientoPago:item.vencimiento,baseMadreRow:item.row,baseMadreStatus:item.status,baseMadreComentarios:item.comentarios,creadoAt:new Date().toISOString()};
 facturas.push(row);await window.updateDoc_('obras',o.id,{facturasManual:facturas,baseMadreConciliadaAt:new Date().toISOString()});o.facturasManual=facturas;return{ok:true,row};
}
window.TIZFactBaseMadreV2={audit,importOne,spreadsheetId:SPREADSHEET_ID,sheet:SHEET};
})();
