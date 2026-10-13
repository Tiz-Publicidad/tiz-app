// Confirmed commercial exports, using the values that were actually saved.
(function () {
  'use strict';
  const inFlight = new Map();
  const text = v => String(v ?? '').trim();
  const number = v => Number(v) || 0;
  function request(payload) {
    return new Promise((resolve, reject) => {
      const endpoint = window.TIZ_DRIVE_OT_WEBHOOK;
      if (!endpoint) return reject(new Error('La conexión con Drive todavía no está disponible'));
      const cb = '__tizCommercial_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      let finished = false;
      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        delete window[cb];
        script.remove();
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(() => finish(new Error('Drive no confirmó la actualización. Los archivos pueden seguir mostrando la versión anterior.')), 90000);
      window[cb] = result => {
        if (result?.ok !== true || result.skipped || !result.cotizacionPdfUrl || !result.cotizacionExcelUrl) {
          finish(new Error(result?.error || result?.reason || 'Apps Script no confirmó los archivos PDF y Excel'));
        } else finish(null, result);
      };
      script.onerror = () => finish(new Error('No se pudo conectar con Apps Script; el presupuesto está guardado, pero Drive sigue pendiente'));
      script.src = endpoint + '?' + new URLSearchParams({callback:cb, payload:JSON.stringify(payload)});
      document.head.appendChild(script);
    });
  }
  function payloadFor(p) {
    const nro = text(p.nro || p.nroCotizacion).replace(/\D/g, '');
    const items = (Array.isArray(p.items) ? p.items : []).map(it => {
      const unidades = Number(it.cant ?? it.unidades ?? it.cantidad ?? 1);
      const unitario = number(it.precio ?? it.unitario);
      return {descripcion:text(it.desc ?? it.descripcion), unitario, unidades, subtotal:Math.round((unitario * unidades + Number.EPSILON) * 100) / 100};
    }).filter(it => it.descripcion || it.unitario);
    if (!nro || !text(p.cliente) || !items.length) throw new Error('Faltan número, cliente o ítems del presupuesto');
    const revision = text(p.revision) || '1.1';
    return {
      action:'guardarCotizacionArchivos', nroCotizacion:nro.padStart(7, '0'), revision,
      cliente:text(p.cliente), descripcion:text(p.desc ?? p.descripcion),
      fecha:p.fecha || '', validez:p.validez || '', validezDias:number(p.validezDias ?? p.validez) || 7,
      nota:p.nota || '', condicion:p.cond ?? p.condicion ?? '', items,
      total:Math.round((items.reduce((sum, it) => sum + it.subtotal, 0) + Number.EPSILON) * 100) / 100,
      firestoreId:p.id || p.firestoreId || '',
      nombreBase:window.tizCotizacionNombreBaseV354?.(nro, p.cliente, p.desc ?? p.descripcion, revision) || p.nombreBase || '',
      entregaLogistica:p.entregaLogistica || {}
    };
  }
  async function exportBudget(p) {
    const payload = payloadFor(p);
    // Coalesce identical exports; different saved versions remain separate requests.
    const key = JSON.stringify(payload);
    if (inFlight.has(key)) return inFlight.get(key);
    const operation = (async () => {
      const result = await request(payload);
      const patch = {
        cotizacionPdfId:result.cotizacionPdfId || '', cotizacionPdfUrl:result.cotizacionPdfUrl,
        cotizacionExcelId:result.cotizacionExcelId || '', cotizacionExcelUrl:result.cotizacionExcelUrl,
        driveCotizacionSyncedAt:new Date().toISOString(), cotizacionDriveEstado:'actualizado', cotizacionDriveError:''
      };
      if (payload.firestoreId) await window.updateDoc_('presupuestos', payload.firestoreId, patch);
      return result;
    })();
    inFlight.set(key, operation);
    try { return await operation; }
    catch (error) {
      if (payload.firestoreId) {
        try { await window.updateDoc_('presupuestos', payload.firestoreId, {cotizacionDriveEstado:'pendiente', cotizacionDriveError:error.message}); }
        catch (stateError) { console.warn('[TIZ Drive] Estado pendiente', stateError); }
      }
      throw error;
    } finally { inFlight.delete(key); }
  }
  window.generarArchivosCotizacionV65 = exportBudget;
  window.regenerarArchivosCotizacionV65 = async (id, button) => {
    const p = (window.DB?.presupuestos || []).find(p => p.id === id);
    if (!p || button?.disabled) return;
    if (button) button.disabled = true;
    try {
      window.showToast?.('Actualizando PDF y Excel en Drive…');
      await exportBudget(p);
      window.renderPresupuestos?.();
      window.showToast?.('PDF y Excel actualizados en Drive ✓');
    } catch (e) { window.showToast?.('Drive pendiente: ' + e.message); }
    finally { if (button) button.disabled = false; }
  };
  function install() {
    const old = window.guardarPresupuestoCompleto;
    if (typeof old !== 'function' || old.__commercialDriveV128) return;
    const wrapped = async function () {
      const saved = await old.apply(this, arguments);
      // Validation failures and concurrent clicks must never export stale DB data.
      if (!saved?.id || !Array.isArray(saved.items)) return saved;
      try {
        window.showToast?.('Presupuesto guardado. Actualizando PDF y Excel…');
        await exportBudget(saved);
        window.showToast?.('Presupuesto guardado · PDF y Excel actualizados en Drive ✓');
      } catch (e) { window.showToast?.('Presupuesto guardado; Drive pendiente: ' + e.message); }
      return saved;
    };
    wrapped.__commercialDriveV128 = true;
    window.guardarPresupuestoCompleto = wrapped;
  }
  window.tizCommercialDriveV128 = {request, payloadFor, exportBudget, install};
  install();
  window.addEventListener('load', install);
  let tries = 0;
  const installer = setInterval(() => { install(); if (++tries >= 40) clearInterval(installer); }, 250);
})();
