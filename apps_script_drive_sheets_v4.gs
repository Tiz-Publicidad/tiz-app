/**
 * TIZ App — Backend Drive/Sheets para OT aprobadas.
 * Carpeta madre: Produccion / OT 2026
 * Recibe JSONP desde GitHub Pages y crea:
 * - carpeta OT
 * - subcarpetas operativas
 * - Google Sheet de respaldo con Orden de Trabajo, Items, Calculos auxiliares, Notas y Datos Facturacion.
 */
const ORDENES_APROBADAS_FOLDER_ID = '1M2SnvFBaU4lVN2Jq9omHR8JjJIpargXh';

function doGet(e) {
  try {
    const callback = e && e.parameter && e.parameter.callback ? String(e.parameter.callback) : '';
    const raw = e && e.parameter && e.parameter.payload ? e.parameter.payload : '{}';
    const payload = JSON.parse(raw || '{}');
    const result = handleTizPayload_(payload);
    return output_(result, callback);
  } catch (err) {
    return output_({ ok:false, error:String(err && err.message ? err.message : err) }, e && e.parameter && e.parameter.callback);
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    return output_(handleTizPayload_(JSON.parse(raw || '{}')), '');
  } catch (err) {
    return output_({ ok:false, error:String(err && err.message ? err.message : err) }, '');
  }
}

function handleTizPayload_(payload) {
  const obra = payload.obra || payload || {};
  const items = payload.itemsCotizados || obra.itemsCotizados || [];
  const calculos = payload.calculosAuxiliares || obra.calculosAuxiliares || [];
  const estado = String(obra.estado || '').toLowerCase();

  if (!obra.desc && !obra.ot && !obra.nro) return { ok:false, error:'Faltan datos de obra: OT o descripción' };
  if (estado !== 'aprobado') return { ok:true, skipped:true, reason:'La obra no está aprobada' };

  const parentId = payload.parentFolderId || ORDENES_APROBADAS_FOLDER_ID;
  const parent = DriveApp.getFolderById(parentId);
  const ot = padOt_(obra.ot || obra.nro || 'SIN_OT');
  const folderName = cleanName_(`OT ${ot} - ${obra.cliente || 'SIN CLIENTE'} - ${obra.desc || 'Obra'}`);
  const folder = getOrCreateFolder_(parent, folderName);

  ['Archivos Cliente','Diseño','Compras','Producción','Colocaciones','Fotos finales','Facturación'].forEach(name => getOrCreateFolder_(folder, name));

  const ssName = cleanName_(`OT ${ot} - Respaldo presupuesto - ${obra.cliente || ''}`);
  const ss = getOrCreateSpreadsheetInFolder_(folder, ssName);

  writeOrdenTrabajoSheet_(ss, obra);
  writeObraSheet_(ss, obra);
  writeItemsSheet_(ss, items);
  writeCalculosSheet_(ss, calculos);
  writeNotasSheet_(ss, obra.notas_sector || {});
  writeFacturacionSheet_(ss, obra, items);

  return { ok:true, driveFolderUrl:folder.getUrl(), otSheetUrl:ss.getUrl(), folderId:folder.getId(), spreadsheetId:ss.getId() };
}

function output_(obj, callback) {
  const json = JSON.stringify(obj || {});
  if (callback) return ContentService.createTextOutput(`${callback}(${json});`).setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
function cleanName_(s) { return String(s || '').replace(/[\\/:*?"<>|#%{}~&]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 180); }
function padOt_(v) { const s=String(v||'').replace(/\D/g,''); return s ? s.padStart(6,'0') : String(v||'SIN_OT'); }
function getOrCreateFolder_(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function getOrCreateSpreadsheetInFolder_(folder, name) {
  const files = folder.getFilesByName(name);
  while (files.hasNext()) { const f = files.next(); if (f.getMimeType() === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(f.getId()); }
  const ss = SpreadsheetApp.create(name);
  const file = DriveApp.getFileById(ss.getId());
  folder.addFile(file);
  try { DriveApp.getRootFolder().removeFile(file); } catch(_) {}
  return ss;
}
function resetSheet_(ss, name) { let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name); sh.clear(); return sh; }
function setRows_(sh, rows) { if (!rows || !rows.length) return; sh.getRange(1,1,rows.length,rows[0].length).setValues(rows); sh.autoResizeColumns(1, rows[0].length); }

function writeOrdenTrabajoSheet_(ss, obra) {
  const sh = resetSheet_(ss, 'Orden de Trabajo');
  const rows = [
    ['TIZ PUBLICIDAD - ORDEN DE TRABAJO', ''],
    ['OT', obra.ot || obra.nro || ''], ['Cliente', obra.cliente || ''], ['Descripción', obra.desc || ''],
    ['Estado', obra.estado || ''], ['Sector', obra.sector || ''], ['Vendedor', obra.vendedor || ''],
    ['Precio neto', Number(obra.neto || obra.importe || obra.totalItems || 0)], ['Fecha creación', new Date()],
    ['F. compromiso producción', obra.fprod_c || ''], ['F. compromiso colocación', obra.fcol_c || ''],
    ['OC / OP', obra.oc || ''], ['Nro factura', obra.nrfc || ''], ['Comentarios', obra.comentarios || '']
  ];
  setRows_(sh, rows); sh.getRange('A1:B1').merge().setFontWeight('bold').setFontSize(14).setBackground('#e8b84b'); sh.getRange(2,1,rows.length-1,1).setFontWeight('bold'); sh.setColumnWidth(1,230); sh.setColumnWidth(2,620);
}
function writeObraSheet_(ss, obra) { const sh=resetSheet_(ss,'Datos obra'); const rows=[['Campo','Valor'], ...Object.keys(obra||{}).filter(k=>typeof obra[k] !== 'object').map(k=>[k, obra[k]])]; setRows_(sh, rows); sh.getRange(1,1,1,2).setFontWeight('bold').setBackground('#e8b84b'); }
function writeItemsSheet_(ss, items) { const sh=resetSheet_(ss,'Items cotizados'); const rows=[['Descripción','Cantidad','Unidad','Unitario','Subtotal','Observaciones']]; (items||[]).forEach(i=>rows.push([i.descripcion||i.desc||'', Number(i.cantidad||i.cant||1), i.unidad||'u', Number(i.unitario||i.precio||0), Number(i.subtotal||0), i.observaciones||''])); setRows_(sh, rows); sh.getRange(1,1,1,6).setFontWeight('bold').setBackground('#e8b84b'); }
function writeCalculosSheet_(ss, calculos) { const sh=resetSheet_(ss,'Calculos auxiliares'); const rows=[['Concepto','Detalle','Cantidad','Unidad','Precio unitario','Total','Observaciones']]; (calculos||[]).forEach(c=>rows.push([c.concepto||'', c.detalle||'', Number(c.cantidad||1), c.unidad||'u', Number(c.precioUnitario||0), Number(c.total||0), c.observaciones||''])); setRows_(sh, rows); sh.getRange(1,1,1,7).setFontWeight('bold').setBackground('#e8b84b'); }
function writeNotasSheet_(ss, notas) { const sh=resetSheet_(ss,'Notas por sector'); const rows=[['Sector','Nota','Fecha']]; ['Producción','Colocaciones','Diseño','Ventas','Compras'].forEach(sec=>rows.push([sec, notas[sec]||'', notas[sec+'_ts']||''])); setRows_(sh, rows); sh.getRange(1,1,1,3).setFontWeight('bold').setBackground('#e8b84b'); }
function writeFacturacionSheet_(ss, obra, items) {
  const sh=resetSheet_(ss,'Datos Facturacion');
  const totalItems=(items||[]).reduce((a,i)=>a+Number(i.subtotal||0),0);
  const rows=[['Campo','Valor'], ['Cliente',obra.cliente||''], ['CUIT',obra.cuit||''], ['OT',obra.ot||obra.nro||''], ['OC / OP',obra.oc||''], ['Descripción factura',obra.desc||''], ['Importe neto',Number(obra.neto||obra.importe||totalItems||0)], ['Importe bruto',Number(obra.bruto||0)], ['Condición pago días',obra.diasPago||''], ['Estado cobranza',obra.cobr||'Pendiente'], [], ['Items para factura','Cantidad','Unitario','Subtotal']];
  (items||[]).forEach(i=>rows.push([i.descripcion||i.desc||'', Number(i.cantidad||i.cant||1), Number(i.unitario||i.precio||0), Number(i.subtotal||0)]));
  setRows_(sh, rows); sh.getRange(1,1,1,2).setFontWeight('bold').setBackground('#e8b84b'); sh.getRange(13,1,1,4).setFontWeight('bold').setBackground('#e8b84b');
}
