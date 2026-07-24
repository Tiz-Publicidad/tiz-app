/**
 * TIZ ERP — Cliente Drive OT V1
 * Base nueva, aislada del resto del ERP.
 *
 * Para activarlo:
 * 1) Publicar apps_script_drive_ot_v1.gs como Web App.
 * 2) Completar WEB_APP_URL y SHARED_SECRET.
 * 3) Cambiar ENABLED a true.
 * 4) Incluir este archivo desde index.html, o copiar el bloque a su script principal.
 */
window.TIZ_DRIVE_OT_CONFIG = {
  ENABLED: false,
  WEB_APP_URL: 'PEGAR_URL_WEB_APP_AQUI',
  SHARED_SECRET: 'CAMBIAR_CLAVE_PRIVADA',
  TIMEOUT_MS: 15000,
  MAX_RETRIES: 5
};

(function () {
  const QUEUE_KEY = 'tiz_drive_ot_queue_v1';

  function jsonp(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const cb = '__tizDriveCb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const cleanup = () => { delete window[cb]; script.remove(); clearTimeout(timer); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Tiempo de espera agotado')); }, timeoutMs);
      window[cb] = data => { cleanup(); data && data.ok ? resolve(data) : reject(new Error(data?.error || 'Error desconocido')); };
      script.onerror = () => { cleanup(); reject(new Error('No se pudo conectar con Apps Script')); };
      script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + encodeURIComponent(cb);
      document.head.appendChild(script);
    });
  }

  function compactJob(obra) {
    return {
      obraId: String(obra.id || obra.docId || obra.ot || ''),
      ot: String(obra.ot || ''),
      cliente: String(obra.cliente || ''),
      descripcion: String(obra.descripcion || obra.desc || ''),
      estado: String(obra.estado || '')
    };
  }

  function buildUrl(job) {
    const c = window.TIZ_DRIVE_OT_CONFIG;
    const q = new URLSearchParams({ action:'createOtFolder', secret:c.SHARED_SECRET, ...job });
    return c.WEB_APP_URL + '?' + q.toString();
  }

  function readQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (_) { return []; } }
  function writeQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }

  async function createFolder(obra) {
    const c = window.TIZ_DRIVE_OT_CONFIG;
    if (!c.ENABLED) return { ok:false, skipped:true, reason:'Drive OT desactivado' };
    const job = compactJob(obra);
    if (job.estado.toLowerCase() !== 'aprobado') return { ok:true, skipped:true, reason:'Estado no aprobado' };
    return jsonp(buildUrl(job), c.TIMEOUT_MS);
  }

  function enqueue(obra, error) {
    const q = readQueue();
    const job = compactJob(obra);
    const old = q.find(x => x.obraId === job.obraId);
    if (old) { old.retries = (old.retries || 0) + 1; old.lastError = String(error || ''); old.updatedAt = Date.now(); }
    else q.push({ ...job, retries:0, lastError:String(error || ''), updatedAt:Date.now() });
    writeQueue(q);
  }

  async function syncApprovedObra(obra) {
    try {
      const result = await createFolder(obra);
      if (result.ok && result.folderUrl) {
        obra.driveFolderId = result.folderId;
        obra.driveFolderUrl = result.folderUrl;
      }
      return result;
    } catch (err) {
      enqueue(obra, err.message);
      throw err;
    }
  }

  async function processQueue() {
    const c = window.TIZ_DRIVE_OT_CONFIG;
    if (!c.ENABLED) return;
    const pending = readQueue();
    const keep = [];
    for (const job of pending) {
      if ((job.retries || 0) >= c.MAX_RETRIES) { keep.push(job); continue; }
      try { await jsonp(buildUrl(job), c.TIMEOUT_MS); }
      catch (err) { keep.push({ ...job, retries:(job.retries||0)+1, lastError:err.message, updatedAt:Date.now() }); }
    }
    writeQueue(keep);
  }

  window.TizDriveOT = { createFolder, syncApprovedObra, processQueue, getQueue:readQueue };
  setTimeout(processQueue, 3000);
})();
