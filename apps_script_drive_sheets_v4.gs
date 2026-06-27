/**
 * TIZ App v4 — Backend Google Apps Script
 * 1) Crear una carpeta en Drive al aprobar una obra.
 * 2) Crear/actualizar un Google Sheet de respaldo con: Obra, Items cotizados, Calculos auxiliares y Notas.
 *
 * PASO CLAVE:
 * Reemplazar ORDENES_APROBADAS_FOLDER_ID por el ID de la carpeta madre de Drive:
 * Drive > carpeta "Ordenes de trabajo aprobadas" > copiar ID de la URL.
 */
const ORDENES_APROBADAS_FOLDER_ID = '1M2SnvFBaU4lVN2Jq9omHR8JjJIpargXh';

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const payload = JSON.parse(raw);
    const obra = payload.obra || payload || {};
    const items = payload.itemsCotizados || obra.itemsCotizados || [];
    const calculos = payload.calculosAuxiliares || obra.calculosAuxiliares || [];

    if (!obra.desc && !obra.ot) return jsonOut({ ok:false, error:'Faltan datos de obra' });

    // Si no está aprobada, solo confirmar recepción. No crea carpeta.
    if (String(obra.estado || '').toLowerCase() !== 'aprobado') {
      return jsonOut({ ok:true, skipped:true, reason:'La obra no está aprobada' });
    }

    const parent = DriveApp.getFolderById(ORDENES_APROBADAS_FOLDER_ID);
    const folderName = cleanName(`OT-${obra.ot || 'SIN_OT'} - ${obra.cliente || 'SIN_CLIENTE'} - ${obra.desc || 'Obra'}`);
    const folder = getOrCreateFolder(parent, folderName);

    getOrCreateFolder(folder, '01 Fotos');
    getOrCreateFolder(folder, '02 Archivos cliente');
    getOrCreateFolder(folder, '03 Diseño');
    getOrCreateFolder(folder, '04 Producción');
    getOrCreateFolder(folder, '05 Colocación');
    getOrCreateFolder(folder, '06 Facturación');

    const ssName = cleanName(`Respaldo OT-${obra.ot || 'SIN_OT'} - ${obra.cliente || ''}`);
    const ss = getOrCreateSpreadsheetInFolder(folder, ssName);

    writeOrdenTrabajoSheet(ss, obra);
    writeObraSheet(ss, obra);
    writeItemsSheet(ss, items);
    writeCalculosSheet(ss, calculos);
    writeNotasSheet(ss, obra.notas_sector || {});

    return jsonOut({
      ok: true,
      driveFolderUrl: folder.getUrl(),
      otSheetUrl: ss.getUrl(),
      folderId: folder.getId(),
      spreadsheetId: ss.getId()
    });
  } catch (err) {
    return jsonOut({ ok:false, error:String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return jsonOut({ ok:true, service:'TIZ Drive Sheets v4' });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function cleanName(s) {
  return String(s || '').replace(/[\\/:*?"<>|#%{}~&]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function getOrCreateFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function getOrCreateSpreadsheetInFolder(folder, name) {
  const files = folder.getFilesByName(name);
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(f.getId());
  }
  const ss = SpreadsheetApp.create(name);
  const file = DriveApp.getFileById(ss.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  return ss;
}

function resetSheet(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  return sh;
}

function writeObraSheet(ss, obra) {
  const sh = resetSheet(ss, 'Obra');
  const rows = [
    ['Campo', 'Valor'],
    ['OT', obra.ot || ''],
    ['Cliente', obra.cliente || ''],
    ['Descripción', obra.desc || ''],
    ['Estado', obra.estado || ''],
    ['Semana', obra.semana || ''],
    ['Sector', obra.sector || ''],
    ['Vendedor', obra.vendedor || ''],
    ['Neto', obra.neto || 0],
    ['Bruto', obra.bruto || 0],
    ['Gastos', obra.gastos || 0],
    ['Total ítems', obra.totalItems || 0],
    ['Total cálculos auxiliares', obra.totalCalculosAuxiliares || 0],
    ['F. compromiso producción', obra.fprod_c || ''],
    ['F. real producción', obra.fprod_r || ''],
    ['F. compromiso colocación', obra.fcol_c || ''],
    ['F. real colocación', obra.fcol_r || ''],
    ['OC / OP', obra.oc || ''],
    ['Nro factura', obra.nrfc || ''],
    ['F. factura', obra.ffc || ''],
    ['Estado cobranza', obra.cobr || ''],
    ['Días pago', obra.diasPago || ''],
    ['Comentarios', obra.comentarios || ''],
    ['Firestore ID', obra.firestoreId || ''],
    ['Última actualización', new Date()]
  ];
  sh.getRange(1,1,rows.length,2).setValues(rows);
  sh.getRange(1,1,1,2).setFontWeight('bold').setBackground('#e8b84b');
  sh.autoResizeColumns(1,2);
}

function writeItemsSheet(ss, items) {
  const sh = resetSheet(ss, 'Items cotizados');
  const rows = [['Descripción','Cantidad','Unitario','Subtotal','Observaciones']];
  (items || []).forEach(i => rows.push([i.descripcion || i.desc || '', +i.cantidad || +i.cant || 0, +i.unitario || +i.precio || 0, +i.subtotal || 0, i.observaciones || '']));
  sh.getRange(1,1,rows.length,5).setValues(rows);
  sh.getRange(1,1,1,5).setFontWeight('bold').setBackground('#e8b84b');
  sh.autoResizeColumns(1,5);
}

function writeCalculosSheet(ss, calculos) {
  const sh = resetSheet(ss, 'Calculos auxiliares');
  const rows = [['Concepto','Detalle','Cantidad','Unidad','Precio unitario','Total','Observaciones']];
  (calculos || []).forEach(c => rows.push([c.concepto || '', c.detalle || '', +c.cantidad || 0, c.unidad || '', +c.precioUnitario || 0, +c.total || 0, c.observaciones || '']));
  sh.getRange(1,1,rows.length,7).setValues(rows);
  sh.getRange(1,1,1,7).setFontWeight('bold').setBackground('#e8b84b');
  sh.autoResizeColumns(1,7);
}

function writeNotasSheet(ss, notas) {
  const sh = resetSheet(ss, 'Notas por sector');
  const sectors = ['Producción','Colocaciones','Diseño','Ventas','Compras'];
  const rows = [['Sector','Nota','Fecha/Hora']];
  sectors.forEach(sec => rows.push([sec, notas[sec] || '', notas[sec + '_ts'] || '']));
  sh.getRange(1,1,rows.length,3).setValues(rows);
  sh.getRange(1,1,1,3).setFontWeight('bold').setBackground('#e8b84b');
  sh.autoResizeColumns(1,3);
}


function writeOrdenTrabajoSheet(ss, obra) {
  const sh = resetSheet(ss, 'Orden de Trabajo');
  const rows = [
    ['TIZ PUBLICIDAD - ORDEN DE TRABAJO', ''],
    ['OT', obra.ot || ''],
    ['Cliente', obra.cliente || ''],
    ['Descripción de la obra', obra.desc || ''],
    ['Sector responsable', obra.sector || ''],
    ['Semana', obra.semana || ''],
    ['Vendedor', obra.vendedor || ''],
    ['Estado', obra.estado || ''],
    ['Fecha compromiso producción', obra.fprod_c || ''],
    ['Fecha real producción', obra.fprod_r || ''],
    ['Fecha compromiso colocación', obra.fcol_c || ''],
    ['Fecha real colocación', obra.fcol_r || ''],
    ['OC / OP', obra.oc || ''],
    ['Nro factura', obra.nrfc || ''],
    ['Comentarios generales', obra.comentarios || ''],
    ['Carpeta generada', new Date()]
  ];
  sh.getRange(1,1,rows.length,2).setValues(rows);
  sh.getRange(1,1,1,2).merge().setFontWeight('bold').setFontSize(14).setBackground('#e8b84b');
  sh.getRange(2,1,rows.length-1,1).setFontWeight('bold');
  sh.setColumnWidth(1, 230);
  sh.setColumnWidth(2, 620);
}
