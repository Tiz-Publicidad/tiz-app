/**
 * TIZ ERP V12 — Creación automática e idempotente de carpetas OT.
 * Publicar como Aplicación web: ejecutar como propietario y acceso "Cualquier usuario".
 */
const TIZ_OT_PARENT_FOLDER_ID = '1M2SnvFBaU4lVN2Jq9omHR8JjJIpargXh';
const TIZ_OT_TOKEN = 'TIZ-OT-2026-V12';
const TIZ_OT_SUBFOLDERS = [
  '01 - PRESUPUESTO',
  '02 - DISEÑO',
  '03 - PRODUCCIÓN',
  '04 - COLOCACIÓN',
  '05 - FOTOS',
  '06 - FACTURACIÓN'
];

function doGet(e) {
  const callback = cleanCallback_(e && e.parameter && e.parameter.callback);
  try {
    const raw = (e && e.parameter && e.parameter.payload) || '{}';
    const payload = JSON.parse(raw);
    return output_(handleRequest_(payload), callback);
  } catch (err) {
    return output_({ok:false,error:String(err && err.message || err)}, callback);
  }
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}';
    return output_(handleRequest_(JSON.parse(raw)), '');
  } catch (err) {
    return output_({ok:false,error:String(err && err.message || err)}, '');
  }
}

function handleRequest_(p) {
  if (!p || p.token !== TIZ_OT_TOKEN) throw new Error('Token inválido');
  if (p.action !== 'createOtFolder') throw new Error('Acción inválida');
  if (String(p.estado || '').toLowerCase() !== 'aprobado') return {ok:true,skipped:true,reason:'Estado no aprobado'};
  const otDigits = String(p.ot || '').replace(/\D/g, '');
  if (!otDigits) throw new Error('Falta número de OT');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const parent = DriveApp.getFolderById(TIZ_OT_PARENT_FOLDER_ID);
    const ot = otDigits.padStart(6, '0');
    const prefix = 'OT ' + ot;
    let folder = findFolderByOt_(parent, prefix);
    let created = false;
    if (!folder) {
      folder = parent.createFolder(cleanName_(prefix + ' - ' + (p.cliente || 'SIN CLIENTE') + ' - ' + (p.desc || 'Sin descripción')));
      created = true;
    }
    TIZ_OT_SUBFOLDERS.forEach(name => getOrCreateFolder_(folder, name));
    folder.setDescription(JSON.stringify({
      ot: ot,
      firestoreId: p.firestoreId || '',
      origen: p.origen || 'obra',
      actualizado: new Date().toISOString()
    }));
    return {
      ok:true,
      created:created,
      folderId:folder.getId(),
      driveFolderUrl:folder.getUrl(),
      folderName:folder.getName(),
      ot:ot
    };
  } finally { lock.releaseLock(); }
}

function findFolderByOt_(parent, prefix) {
  const it = parent.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    const n = f.getName();
    if (n === prefix || n.indexOf(prefix + ' - ') === 0) return f;
  }
  return null;
}
function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function cleanName_(s) {
  return String(s || '').replace(/[\/:*?"<>|#%{}~&]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 180);
}
function cleanCallback_(s) {
  s = String(s || '');
  return /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(s) ? s : '';
}
function output_(obj, callback) {
  const json = JSON.stringify(obj || {});
  if (callback) return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// Prueba manual desde el editor de Apps Script.
function testCrearCarpetaOT() {
  Logger.log(handleRequest_({
    action:'createOtFolder', token:TIZ_OT_TOKEN, estado:'Aprobado',
    ot:'999999', cliente:'PRUEBA TIZ', desc:'Carpeta de prueba', origen:'test'
  }));
}
