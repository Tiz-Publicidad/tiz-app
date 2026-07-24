/**
 * TIZ ERP — Drive OT V16 FINAL
 * Aplicación web: ejecutar como YO; acceso CUALQUIER USUARIO.
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
    return output_(handleRequest_(JSON.parse(raw)), callback);
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
  const action = String(payload && payload.action || 'ensureOtFolder');
  if (action === 'ping') {
    const parent = DriveApp.getFolderById(TIZ_OT_PARENT_FOLDER_ID);
    return {ok:true, action:'ping', parentFolderId:parent.getId(), parentFolderName:parent.getName(), version:'V16'};
  }

  const obra = payload && payload.obra ? payload.obra : (payload || {});
  if (String(obra.estado || '').trim().toLowerCase() !== 'aprobado') {
    return {ok:true, skipped:true, reason:'Estado distinto de Aprobado'};
  }
  if (!String(obra.ot || '').trim()) throw new Error('La obra aprobada no tiene número de OT');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const parent = DriveApp.getFolderById(TIZ_OT_PARENT_FOLDER_ID);
    const ot = normalizeOt_(obra.ot);
    const props = PropertiesService.getScriptProperties();
    const firestoreId = String(obra.firestoreId || '').trim();
    const propKey = 'TIZ_FOLDER_' + (firestoreId || ('OT_' + ot)).replace(/[^A-Za-z0-9_-]/g, '_');

    let folder = getFolderFromProperty_(props.getProperty(propKey));
    if (!folder) folder = getFolderFromProperty_(props.getProperty('TIZ_FOLDER_OT_' + ot));
    if (!folder) folder = findFolderByOt_(parent, ot);

    const desiredName = cleanName_('OT ' + ot + ' - ' + (obra.cliente || 'SIN CLIENTE') + ' - ' + (obra.desc || 'OBRA'));
    const created = !folder;
    if (!folder) folder = parent.createFolder(desiredName);
    else if (folder.getName() !== desiredName) folder.setName(desiredName);

    TIZ_OT_SUBFOLDERS.forEach(name => ensureSubfolder_(folder, name));
    props.setProperty(propKey, folder.getId());
    props.setProperty('TIZ_FOLDER_OT_' + ot, folder.getId());

    return {ok:true, created, folderId:folder.getId(), driveFolderUrl:folder.getUrl(), folderName:folder.getName(), ot, version:'V16'};
  } finally {
    lock.releaseLock();
  }
}

function getFolderFromProperty_(id) {
  if (!id) return null;
  try { const f = DriveApp.getFolderById(id); f.getName(); return f; } catch (_) { return null; }
}
function findFolderByOt_(parent, ot) {
  const prefixes = ['OT ' + ot + ' -', 'OT ' + ot];
  const folders = parent.getFolders();
  while (folders.hasNext()) {
    const f = folders.next();
    if (prefixes.some(prefix => f.getName().indexOf(prefix) === 0)) return f;
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

/** 1) Ejecutar primero: solo valida permisos y carpeta madre. */
function testConexionDrive() {
  Logger.log(JSON.stringify(handleRequest_({action:'ping'})));
}

/** 2) Ejecutar después: crea/reutiliza la OT de prueba con sus seis subcarpetas. */
function testCrearCarpetaOt() {
  Logger.log(JSON.stringify(handleRequest_({action:'ensureOtFolder', obra:{firestoreId:'PRUEBA_V16',ot:'999999',cliente:'PRUEBA TIZ',desc:'CARPETA DE PRUEBA',estado:'Aprobado'}})));
}
