const FOLDER_ID = 'PEGAR_ID_CARPETA_ORDENES_APROBADAS';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || '{}');
    if (data.action !== 'obra_aprobada') return json({ok:false, error:'Acción no soportada'});
    var obra = data.obra || {};
    var items = data.items || [];
    var calculos = data.calculos || [];
    var parent = DriveApp.getFolderById(FOLDER_ID);
    var ot = obra.ot || obra.nro || 'SIN_OT';
    var cliente = limpiarNombre(obra.cliente || 'Sin cliente');
    var desc = limpiarNombre(obra.desc || obra.descripcion || 'Sin descripcion');
    var folderName = 'OT-' + ot + ' - ' + cliente + ' - ' + desc;
    var folder = parent.createFolder(folderName);
    folder.createFolder('01 Fotos cliente');
    folder.createFolder('02 Diseño');
    folder.createFolder('03 Producción');
    folder.createFolder('04 Colocación');
    folder.createFolder('05 Facturación');
    var ss = SpreadsheetApp.create('Respaldo OT-' + ot + ' - ' + cliente);
    var file = DriveApp.getFileById(ss.getId());
    folder.addFile(file);
    try { DriveApp.getRootFolder().removeFile(file); } catch(err) {}
    var sh = ss.getSheets()[0];
    sh.setName('Obra');
    sh.getRange(1,1,1,2).setValues([['Campo','Valor']]);
    var rows = Object.keys(obra).filter(function(k){ return ['itemsCotizados','calculosAuxiliares','notas_sector'].indexOf(k) === -1; }).map(function(k){ return [k, String(obra[k] == null ? '' : obra[k])]; });
    if (rows.length) sh.getRange(2,1,rows.length,2).setValues(rows);
    var shi = ss.insertSheet('Items cotizados');
    shi.getRange(1,1,1,7).setValues([['Descripción','Cantidad','Unidad','Unitario','Subtotal','Observaciones','Tipo']]);
    if (items.length) shi.getRange(2,1,items.length,7).setValues(items.map(function(i){ return [i.descripcion||i.desc||'', +i.cantidad||0, i.unidad||'', +i.unitario||+i.precio||0, +i.subtotal||((+i.cantidad||0)*(+i.unitario||+i.precio||0)), i.observaciones||'', i.tipo||'']; }));
    var shc = ss.insertSheet('Calculos auxiliares');
    shc.getRange(1,1,1,7).setValues([['Tipo','Detalle','Cantidad','Unidad','Unitario','Total','Observaciones']]);
    if (calculos.length) shc.getRange(2,1,calculos.length,7).setValues(calculos.map(function(c){ return [c.tipo||'', c.detalle||c.concepto||'', +c.cantidad||0, c.unidad||'', +c.unitario||0, +c.total||((+c.cantidad||0)*(+c.unitario||0)), c.observaciones||'']; }));
    var shot = ss.insertSheet('Orden de trabajo');
    shot.getRange(1,1,10,2).setValues([
      ['OT', ot], ['Cliente', obra.cliente||''], ['Descripción', obra.desc||''], ['Estado', obra.estado||''], ['Semana', obra.semana||''], ['Vendedor', obra.vendedor||''], ['Sector', obra.sector||''], ['Neto', obra.neto||''], ['OC/OP', obra.oc||''], ['Fecha creación', new Date()]
    ]);
    [sh, shi, shc, shot].forEach(function(s){ s.autoResizeColumns(1, Math.max(1, s.getLastColumn())); s.getRange(1,1,1,s.getLastColumn()).setFontWeight('bold'); });
    return json({ok:true, folderUrl: folder.getUrl(), sheetUrl: ss.getUrl(), folderId: folder.getId(), sheetId: ss.getId()});
  } catch(err) {
    return json({ok:false, error: err.message, stack: err.stack});
  }
}
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function limpiarNombre(s) { return String(s).replace(/[\\/:*?"<>|#%{}~&]/g,' ').replace(/\s+/g,' ').trim().substring(0,80); }
