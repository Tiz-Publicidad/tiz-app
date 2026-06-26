/**
 * TIZ App — Backend Drive/Sheets para OT aprobadas
 *
 * Publicar como Aplicación web:
 * - Ejecutar como: Yo
 * - Usuarios con acceso: Cualquier usuario con el enlace / cualquiera que pueda acceder según Workspace
 *
 * Carpeta destino actual:
 * Producción / OT 2026
 */
const ORDENES_APROBADAS_FOLDER_ID = '1M2SnvFBaU4IVN2Jq9omHR8jjIpargXh';

function doGet(e) {
  try {
    const callback = e && e.parameter && e.parameter.callback ? e.parameter.callback : '';
    const payloadText = e && e.parameter && e.parameter.payload ? e.parameter.payload : '{}';
    const payload = JSON.parse(payloadText || '{}');
    const result = procesarPayloadTiz(payload);
    return salidaJSONP_(callback, result);
  } catch (err) {
    const cb = e && e.parameter && e.parameter.callback ? e.parameter.callback : '';
    return salidaJSONP_(cb, { ok:false, error:String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const payload = JSON.parse(raw || '{}');
    return jsonOut_(procesarPayloadTiz(payload));
  } catch (err) {
    return jsonOut_({ ok:false, error:String(err && err.message ? err.message : err) });
  }
}

function procesarPayloadTiz(payload) {
  const obra = payload.obra || payload || {};
  const items = payload.itemsCotizados || obra.itemsCotizados || [];
  const calculos = payload.calculosAuxiliares || obra.calculosAuxiliares || [];

  if (!obra.desc && !obra.ot) return { ok:false, error:'Faltan datos de obra: OT o descripción' };

  if (String(obra.estado || '').trim().toLowerCase() !== 'aprobado') {
    return { ok:true, skipped:true, reason:'La obra/presupuesto no está aprobado' };
  }

  const parent = DriveApp.getFolderById(ORDENES_APROBADAS_FOLDER_ID);
  const folderName = cleanName_(`OT ${padOT_(obra.ot || obra.nro || 'SIN_OT')} ${obra.cliente || 'SIN_CLIENTE'} ${obra.desc || 'Obra'}`);
  const folder = getOrCreateFolder_(parent, folderName);

  ['Archivos Cliente', 'Diseño', 'Compras', 'Producción', 'Colocaciones', 'Fotos finales', 'Facturación'].forEach(n => getOrCreateFolder_(folder, n));

  const ssName = cleanName_(`OT ${padOT_(obra.ot || obra.nro || 'SIN_OT')} - Respaldo presupuesto`);
  const ss = getOrCreateSpreadsheetInFolder_(folder, ssName);

  writeOrdenTrabajoSheet_(ss, obra);
  writeObraSheet_(ss, obra);
  writeItemsSheet_(ss, items);
  writeCalculosSheet_(ss, calculos);
  writeNotasSheet_(ss, obra.notas_sector || {});

  return {
    ok: true,
    driveFolderUrl: folder.getUrl(),
    otSheetUrl: ss.getUrl(),
    folderId: folder.getId(),
    spreadsheetId: ss.getId()
  };
}

function salidaJSONP_(callback, obj) {
  const json = JSON.stringify(obj || {});
  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonOut_(obj);
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj || {})).setMimeType(ContentService.MimeType.JSON);
}

function padOT_(v) {
  const s = String(v || '').replace(/\D/g, '');
  return s ? s.padStart(6, '0') : String(v || 'SIN_OT');
}

function cleanName_(s) {
  return String(s || '')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function getOrCreateSpreadsheetInFolder_(folder, name) {
  const files = folder.getFilesByName(name);
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(f.getId());
  }
  const ss = SpreadsheetApp.create(name);
  const file = DriveApp.getFileById(ss.getId());
  folder.addFile(file);
  try { DriveApp.getRootFolder().removeFile(file); } catch(_) {}
  return ss;
}

function resetSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  return sh;
}

function setTable_(sh, values) {
  if (!values || !values.length) return;
  sh.getRange(1, 1, values.length, values[0].length).setValues(values);
  sh.getRange(1, 1, 1, values[0].length).setFontWeight('bold');
  sh.autoResizeColumns(1, values[0].length);
}

function writeOrdenTrabajoSheet_(ss, obra) {
  const sh = resetSheet_(ss, 'Orden de Trabajo');
  const rows = [
    ['ORDEN DE TRABAJO TIZ', ''],
    ['OT', obra.ot || obra.nro || ''],
    ['Cliente', obra.cliente || ''],
    ['Descripción', obra.desc || ''],
    ['Estado', obra.estado || ''],
    ['Sector', obra.sector || ''],
    ['Vendedor', obra.vendedor || ''],
    ['Semana', obra.semana || ''],
    ['Fecha compromiso producción', obra.fprod_c || ''],
    ['Fecha real producción', obra.fprod_r || ''],
    ['Fecha compromiso colocación', obra.fcol_c || ''],
    ['Fecha real colocación', obra.fcol_r || ''],
    ['OC / OP', obra.oc || ''],
    ['Nro factura', obra.nrfc || ''],
    ['Comentarios', obra.comentarios || '']
  ];
  setTable_(sh, rows);
  sh.getRange('A1:B1').setFontWeight('bold').setFontSize(14);
}

function writeObraSheet_(ss, obra) {
  const sh = resetSheet_(ss, 'Obra');
  const rows = [
    ['Campo', 'Valor'],
    ['OT', obra.ot || obra.nro || ''],
    ['Cliente', obra.cliente || ''],
    ['Descripción', obra.desc || ''],
    ['Estado', obra.estado || ''],
    ['Neto', obra.neto || obra.importe || 0],
    ['Bruto', obra.bruto || 0],
    ['Gastos', obra.gastos || 0],
    ['Total ítems', obra.totalItems || 0],
    ['Total cálculos auxiliares', obra.totalCalculosAuxiliares || 0]
  ];
  setTable_(sh, rows);
}

function writeItemsSheet_(ss, items) {
  const sh = resetSheet_(ss, 'Items cotizados');
  const rows = [['Descripción', 'Cantidad', 'Unidad', 'Unitario', 'Subtotal', 'Observaciones']];
  (items || []).forEach(i => rows.push([
    i.descripcion || i.desc || '',
    Number(i.cantidad || i.cant || 0),
    i.unidad || 'u',
    Number(i.unitario || i.precio || 0),
    Number(i.subtotal || 0),
    i.observaciones || ''
  ]));
  setTable_(sh, rows);
}

function writeCalculosSheet_(ss, calculos) {
  const sh = resetSheet_(ss, 'Cálculos auxiliares');
  const rows = [['Concepto', 'Detalle', 'Cantidad', 'Unidad', 'Precio unitario', 'Total', 'Observaciones']];
  (calculos || []).forEach(c => rows.push([
    c.concepto || '',
    c.detalle || '',
    Number(c.cantidad || 0),
    c.unidad || 'u',
    Number(c.precioUnitario || c.unitario || 0),
    Number(c.total || 0),
    c.observaciones || ''
  ]));
  setTable_(sh, rows);
}

function writeNotasSheet_(ss, notas) {
  const sh = resetSheet_(ss, 'Notas por sector');
  const rows = [['Sector', 'Nota', 'Actualizado']];
  ['Producción', 'Colocaciones', 'Diseño', 'Ventas', 'Compras'].forEach(sec => rows.push([
    sec,
    notas[sec] || '',
    notas[sec + '_ts'] || ''
  ]));
  setTable_(sh, rows);
}
