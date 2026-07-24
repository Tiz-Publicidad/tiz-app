/**
 * TIZ ERP — Automatización Drive OT V1 (base nueva)
 *
 * Flujo:
 * 1. El ERP llama este Web App cuando una obra pasa a "Aprobado".
 * 2. Busca una carpeta ya creada para esa obra (idempotencia).
 * 3. Crea la carpeta OT y sus subcarpetas.
 * 4. Devuelve folderId y folderUrl mediante JSONP.
 *
 * CONFIGURACIÓN OBLIGATORIA:
 * - Pegar el ID de la carpeta madre de Drive en ROOT_FOLDER_ID.
 * - Implementar como Web App: ejecutar como vos y acceso "Cualquier usuario".
 */

const ROOT_FOLDER_ID = 'PEGAR_ID_CARPETA_MADRE_AQUI';
const SHARED_SECRET = 'CAMBIAR_CLAVE_PRIVADA';
const SUBFOLDERS = ['01 - PRESUPUESTO', '02 - DISEÑO', '03 - PRODUCCIÓN', '04 - COLOCACIÓN', '05 - FOTOS', '06 - FACTURACIÓN'];

function doGet(e) {
  const callback = sanitizeCallback_(e && e.parameter && e.parameter.callback);
  let response;
  try {
    response = handleRequest_(e && e.parameter ? e.parameter : {});
  } catch (err) {
    response = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  const json = JSON.stringify(response);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function handleRequest_(p) {
  if (ROOT_FOLDER_ID === 'PEGAR_ID_CARPETA_MADRE_AQUI') throw new Error('Falta configurar ROOT_FOLDER_ID');
  if (!p.secret || p.secret !== SHARED_SECRET) throw new Error('Clave inválida');
  if ((p.action || '') !== 'createOtFolder') throw new Error('Acción no reconocida');

  const estado = clean_(p.estado).toLowerCase();
  if (estado !== 'aprobado') return { ok: true, skipped: true, reason: 'La obra no está aprobada' };

  const obraId = clean_(p.obraId);
  const ot = clean_(p.ot);
  const cliente = clean_(p.cliente);
  const descripcion = clean_(p.descripcion);
  if (!obraId) throw new Error('Falta obraId');
  if (!ot) throw new Error('Falta número de OT');

  const props = PropertiesService.getScriptProperties();
  const key = 'OT_FOLDER_' + obraId;
  const existingId = props.getProperty(key);
  if (existingId) {
    try {
      const existing = DriveApp.getFolderById(existingId);
      return { ok: true, existed: true, folderId: existingId, folderUrl: existing.getUrl(), folderName: existing.getName() };
    } catch (_) {
      props.deleteProperty(key);
    }
  }

  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const folderName = buildFolderName_(ot, cliente, descripcion);

  // Segunda barrera contra duplicados: buscar por nombre exacto.
  const matches = root.getFoldersByName(folderName);
  if (matches.hasNext()) {
    const found = matches.next();
    props.setProperty(key, found.getId());
    return { ok: true, existed: true, folderId: found.getId(), folderUrl: found.getUrl(), folderName: found.getName() };
  }

  const folder = root.createFolder(folderName);
  SUBFOLDERS.forEach(name => folder.createFolder(name));
  props.setProperty(key, folder.getId());

  return { ok: true, existed: false, folderId: folder.getId(), folderUrl: folder.getUrl(), folderName: folder.getName() };
}

function buildFolderName_(ot, cliente, descripcion) {
  const parts = ['OT ' + safeName_(ot), safeName_(cliente), safeName_(descripcion)].filter(Boolean);
  return parts.join(' - ').slice(0, 180);
}

function clean_(value) {
  return String(value == null ? '' : value).trim();
}

function safeName_(value) {
  return clean_(value).replace(/[\\/:*?"<>|#%{}~&]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeCallback_(value) {
  const cb = clean_(value);
  return /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(cb) ? cb : '';
}

// Ejecutar una vez desde Apps Script para verificar permisos y configuración.
function testCrearCarpetaOT() {
  Logger.log(handleRequest_({
    action: 'createOtFolder',
    secret: SHARED_SECRET,
    obraId: 'TEST-' + Date.now(),
    ot: 'TEST',
    cliente: 'Prueba TIZ',
    descripcion: 'Automatización Drive',
    estado: 'Aprobado'
  }));
}
