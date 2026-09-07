// TIZ V38 — Vinculación segura con carpetas OT ya existentes.
// Drive se consulta en modo lectura. Sólo después de una confirmación explícita
// se guardan driveFolderId y driveFolderUrl en las obras de Firestore.
(function(){
  'use strict';

  const BATCH_SIZE = 30;
  let ultimoResultado = null;

  const esc = value => String(value ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  function consultarAppsScript(payload) {
    return new Promise((resolve, reject) => {
      if (!window.TIZ_DRIVE_OT_WEBHOOK && typeof TIZ_DRIVE_OT_WEBHOOK === 'undefined') {
        reject(new Error('No está configurada la conexión con Apps Script'));
        return;
      }
      const endpoint = window.TIZ_DRIVE_OT_WEBHOOK || TIZ_DRIVE_OT_WEBHOOK;
      const callback = '__tizLinkFolders_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const timer = setTimeout(() => finish(new Error('Apps Script no respondió en 60 segundos')), 60000);
      function finish(error, value) {
        clearTimeout(timer);
        try { delete window[callback]; } catch (_) { window[callback] = undefined; }
        script.remove();
        error ? reject(error) : resolve(value);
      }
      window[callback] = result => {
        if (!result || result.ok !== true) finish(new Error(result?.error || 'Respuesta inválida de Apps Script'));
        else finish(null, result);
      };
      script.onerror = () => finish(new Error('No se pudo conectar con Apps Script'));
      script.src = endpoint + '?' + new URLSearchParams({callback, payload:JSON.stringify(payload)}).toString();
      document.head.appendChild(script);
    });
  }

  function cerrarModal() {
    document.getElementById('modal-vincular-drive-v38')?.remove();
  }

  function modalBase(contenido) {
    cerrarModal();
    const root = document.createElement('div');
    root.id = 'modal-vincular-drive-v38';
    root.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px';
    root.innerHTML = '<div style="width:min(760px,96vw);max-height:88vh;overflow:auto;background:#171717;border:1px solid #3a3a3a;border-radius:12px;padding:22px;color:#eee;font:14px Arial">'+contenido+'</div>';
    document.body.appendChild(root);
    return root;
  }

  function mostrarProgreso(actual, total) {
    modalBase('<h2 style="margin:0 0 14px">Buscando carpetas existentes</h2>'+
      '<p style="color:#bbb">Consultando Drive en modo lectura…</p>'+
      '<div style="height:7px;background:#333;border-radius:8px;margin-top:16px;overflow:hidden"><div style="height:100%;width:'+Math.round(actual/Math.max(total,1)*100)+'%;background:#e8b84b"></div></div>'+
      '<p style="margin-top:9px;color:#888">Revisadas '+actual+' de '+total+' obras</p>');
  }

  function mostrarError(error) {
    const root = modalBase('<h2 style="margin:0 0 14px">No se pudo completar la revisión</h2>'+
      '<p style="line-height:1.55;color:#ddd">'+esc(error?.message || error)+'</p>'+
      '<p style="margin-top:12px;color:#aaa">Comprobá que la implementación activa de Apps Script sea la V38 y volvé a intentar.</p>'+
      '<div style="display:flex;justify-content:flex-end;margin-top:20px"><button id="cerrar-vinculos-v38" class="btn btn-primary">Cerrar</button></div>');
    root.querySelector('#cerrar-vinculos-v38').onclick = cerrarModal;
  }

  function renderListaAmbiguas(items) {
    if (!items.length) return '';
    return '<details style="margin-top:14px"><summary style="cursor:pointer;color:#ffb020">Ver coincidencias ambiguas</summary><div style="margin-top:9px;font-size:12px;color:#bbb;line-height:1.55">'+
      items.slice(0,30).map(x=>'OT '+esc(x.ot)+' · '+esc(x.cliente)+' · '+esc(x.descripcion)+'<br><span style="color:#777">'+x.candidatas.map(c=>esc(c.nombre)).join(' / ')+'</span>').join('<br><br>')+
      (items.length>30?'<br><br>… y '+(items.length-30)+' casos más.':'')+'</div></details>';
  }

  function mostrarRevision(resultado) {
    ultimoResultado = resultado;
    const r = resultado.resumen;
    const root = modalBase('<h2 style="margin:0 0 16px">Revisión de vínculos de Drive</h2>'+
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 20px;line-height:1.55">'+
      '<div>Obras sin vínculo revisadas: <b>'+r.obras+'</b></div><div>Carpetas encontradas: <b style="color:#35c46a">'+r.vinculadas+'</b></div>'+
      '<div>Coincidencias ambiguas: <b style="color:'+(r.ambiguas?'#ffb020':'#35c46a')+'">'+r.ambiguas+'</b></div><div>Sin carpeta encontrada: <b>'+r.noEncontradas+'</b></div></div>'+
      '<p style="margin:15px 0 0;color:#aaa;line-height:1.5">No se creó, renombró ni movió ninguna carpeta. Al confirmar se guardarán únicamente los enlaces encontrados.</p>'+
      renderListaAmbiguas(resultado.ambiguas)+
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px"><button id="cancelar-vinculos-v38" class="btn btn-ghost">Cancelar</button><button id="aplicar-vinculos-v38" class="btn btn-primary" '+(r.vinculadas?'':'disabled')+'>Guardar '+r.vinculadas+' vínculos</button></div>');
    root.querySelector('#cancelar-vinculos-v38').onclick = cerrarModal;
    root.querySelector('#aplicar-vinculos-v38').onclick = aplicarVinculos;
  }

  async function aplicarVinculos() {
    if (!ultimoResultado?.vinculadas?.length) return;
    const button = document.getElementById('aplicar-vinculos-v38');
    button.disabled = true;
    let guardadas = 0;
    const errores = [];
    for (const link of ultimoResultado.vinculadas) {
      try {
        const obra = (window.DB?.obras || []).find(o => o.id === link.id);
        if (!obra || obra.driveFolderUrl) continue;
        const patch = {
          driveFolderId: link.driveFolderId,
          driveFolderUrl: link.driveFolderUrl,
          driveFolderName: link.folderName || '',
          driveSyncedAt: new Date().toISOString(),
          driveSyncSource: 'existing-folder-v38'
        };
        await window.updateDoc_('obras', link.id, patch);
        Object.assign(obra, patch);
        guardadas++;
        button.textContent = 'Guardando '+guardadas+' de '+ultimoResultado.vinculadas.length+'…';
      } catch (error) {
        errores.push({id:link.id, error:String(error?.message || error)});
      }
    }
    cerrarModal();
    window.renderObras?.();
    if (errores.length) {
      window.showToast?.('Se vincularon '+guardadas+' carpetas; '+errores.length+' no pudieron guardarse');
      console.error('[V38 vínculos Drive]', errores);
    } else {
      window.showToast?.('Se vincularon '+guardadas+' carpetas existentes ✓');
    }
  }

  window.revisarCarpetasExistentesV38 = async function() {
    if (!window.currentUser?.isAdmin) {
      window.showToast?.('Esta acción requiere permisos de administrador');
      return;
    }
    const pendientes = (window.DB?.obras || []).filter(o => o.id && o.ot && !o.driveFolderUrl);
    if (!pendientes.length) {
      window.showToast?.('Todas las obras con OT ya tienen carpeta vinculada');
      return;
    }
    const combinado = {vinculadas:[], ambiguas:[], noEncontradas:[]};
    try {
      mostrarProgreso(0, pendientes.length);
      for (let i=0; i<pendientes.length; i+=BATCH_SIZE) {
        const lote = pendientes.slice(i,i+BATCH_SIZE).map(o=>({
          id:o.id, ot:String(o.ot||''), cliente:String(o.cliente||'').slice(0,80), desc:String(o.desc||'').slice(0,120)
        }));
        const result = await consultarAppsScript({action:'buscarCarpetasOtExistentes', obras:lote});
        if (result.version !== 'V38') throw new Error('Apps Script respondió con '+(result.version||'una versión anterior')+'. Publicá la implementación V38.');
        combinado.vinculadas.push(...(result.vinculadas||[]));
        combinado.ambiguas.push(...(result.ambiguas||[]));
        combinado.noEncontradas.push(...(result.noEncontradas||[]));
        mostrarProgreso(Math.min(i+BATCH_SIZE,pendientes.length),pendientes.length);
      }
      combinado.resumen = {obras:pendientes.length,vinculadas:combinado.vinculadas.length,ambiguas:combinado.ambiguas.length,noEncontradas:combinado.noEncontradas.length};
      mostrarRevision(combinado);
    } catch (error) {
      console.error('[V38 búsqueda Drive]', error);
      mostrarError(error);
    }
  };

  function instalarBoton() {
    if (document.getElementById('btn-vincular-drive-v38')) return true;
    const page = document.getElementById('page-obras');
    const excel = [...(page?.querySelectorAll('button')||[])].find(b=>b.textContent.trim()==='Excel');
    if (!excel) return false;
    const button = document.createElement('button');
    button.id = 'btn-vincular-drive-v38';
    button.className = 'btn btn-ghost btn-sm admin-only';
    button.innerHTML = '<i class="ti ti-brand-google-drive"></i> Vincular carpetas';
    button.onclick = window.revisarCarpetasExistentesV38;
    excel.parentElement.insertBefore(button, excel);
    return true;
  }

  if (!instalarBoton()) {
    let intentos=0;
    const timer=setInterval(()=>{ if(instalarBoton() || ++intentos>40) clearInterval(timer); },250);
  }
})();
