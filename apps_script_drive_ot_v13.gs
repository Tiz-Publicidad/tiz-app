/**
 * TIZ ERP — Drive OT definitivo (V13)
 * Implementar como Aplicación web: Ejecutar como "Yo"; acceso "Cualquier usuario".
 */
const TIZ_OT_PARENT_FOLDER_ID = '1M2SnvFBaU4lVN2Jq9omHR8JjJIpargXh';
const TIZ_OT_SUBFOLDERS = [
  '01 - PRESUPUESTO',
  '02 - DISEÑO',
  '03 - PRODUCCIÓN',
  '04 - COLOCACIÓN',
  '05 - FOTOS',
  '06 - FACTURACIÓN'
];

function doGet(e) {
  const callback = safeCallback_(e && e.parameter && e.parameter.callback);
  try {
    const raw = e && e.parameter && e.parameter.payload ? e.parameter.payload : '{}';
    const payload = JSON.parse(raw);
    return output_(handleRequest_(payload), callback);
  } catch (err) {
    return output_({ok:false, error:errorMessage_(err)}, callback);
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    return output_(handleRequest_(JSON.parse(raw)), '');
  } catch (err) {
    return output_({ok:false, error:errorMessage_(err)}, '');
  }
}

function handleRequest_(payload) {
  const obra = payload && payload.obra ? payload.obra : (payload || {});
  const estado = String(obra.estado || '').trim().toLowerCase();
  if (estado !== 'aprobado') return {ok:true, skipped:true, reason:'Estado distinto de Aprobado'};
  if (!String(obra.ot || '').trim()) throw new Error('La obra aprobada no tiene número de OT');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const parent = DriveApp.getFolderById(TIZ_OT_PARENT_FOLDER_ID);
    const ot = normalizeOt_(obra.ot);
    const key = String(obra.firestoreId || '').trim() || ('OT_' + ot);
    const props = PropertiesService.getScriptProperties();
    const propKey = 'TIZ_FOLDER_' + key.replace(/[^A-Za-z0-9_-]/g, '_');

    let folder = null;
    const savedId = props.getProperty(propKey);
    if (savedId) {
      try { folder = DriveApp.getFolderById(savedId); folder.getName(); } catch (_) { folder = null; }
    }

    if (!folder) folder = findFolderByOt_(parent, ot);
    const desiredName = cleanName_('OT ' + ot + ' - ' + (obra.cliente || 'SIN CLIENTE') + ' - ' + (obra.desc || 'OBRA'));
    if (!folder) folder = parent.createFolder(desiredName);
    else if (folder.getName() !== desiredName) folder.setName(desiredName);

    TIZ_OT_SUBFOLDERS.forEach(name => ensureSubfolder_(folder, name));
    props.setProperty(propKey, folder.getId());
    props.setProperty('TIZ_FOLDER_OT_' + ot, folder.getId());

    return {
      ok:true,
      created:true,
      folderId:folder.getId(),
      driveFolderUrl:folder.getUrl(),
      folderName:folder.getName(),
      ot:ot
    };
  } finally {
    lock.releaseLock();
  }
}

function findFolderByOt_(parent, ot) {
  const saved = PropertiesService.getScriptProperties().getProperty('TIZ_FOLDER_OT_' + ot);
  if (saved) {
    try { const f = DriveApp.getFolderById(saved); f.getName(); return f; } catch (_) {}
  }
  const prefix = 'OT ' + ot + ' -';
  const folders = parent.getFolders();
  while (folders.hasNext()) {
    const f = folders.next();
    if (f.getName().indexOf(prefix) === 0) return f;
  }
  return null;
}

function ensureSubfolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function normalizeOt_(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? digits.padStart(6, '0') : String(value || '').trim();
}
function cleanName_(value) {
  return String(value || '').replace(/[\\\/:*?"<>|#%{}~&]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 180);
}
function safeCallback_(value) {
  const cb = String(value || '');
  return /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(cb) ? cb : '';
}
function output_(data, callback) {
  const json = JSON.stringify(data || {});
  if (callback) return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
function errorMessage_(err) { return String(err && err.message ? err.message : err); }

/** Ejecutar manualmente una vez para comprobar permisos y carpeta madre. */
function testTizOtFolder() {
  const result = handleRequest_({obra:{firestoreId:'PRUEBA_MANUAL',ot:'999999',cliente:'PRUEBA TIZ',desc:'CARPETA DE PRUEBA',estado:'Aprobado'}});
  Logger.log(JSON.stringify(result));
}
