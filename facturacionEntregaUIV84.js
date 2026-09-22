// TIZ V85 — entrega de comprobantes por email con agenda persistente por cliente
(function () {
  'use strict';
  const EMAIL_ENDPOINT = 'https://us-central1-tiz---app.cloudfunctions.net/facturacionEnviarEmailV84';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const splitEmails = v => [...new Set(String(v || '').split(/[;,\n]+/).map(x => x.trim().toLowerCase()).filter(validEmail))];

  function clienteDe(o) {
    return (window.DB?.clientes || []).find(c => c.id === o?.clienteId)
      || (window.DB?.clientes || []).find(c => norm(c.nombre) === norm(o?.cliente)) || {};
  }
  function emailsDe(c) {
    const vals = [];
    ['emailFacturacionPredeterminado', 'email', 'correo', 'mail', 'emailFacturacion'].forEach(k => { if (c?.[k]) vals.push(c[k]); });
    ['emailsFacturacion', 'emails', 'correos', 'mails'].forEach(k => {
      const v = c?.[k];
      if (Array.isArray(v)) vals.push(...v); else if (v) vals.push(v);
    });
    return splitEmails(vals.join(','));
  }
  async function token() {
    const [{ getApp }, { getAuth }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'),
    ]);
    const u = getAuth(getApp()).currentUser;
    if (!u) throw new Error('Sesión no iniciada');
    return u.getIdToken();
  }
  function ensureStyle() {
    if (document.getElementById('fv84-style')) return;
    const s = document.createElement('style');
    s.id = 'fv84-style';
    s.textContent = '.fv84-grid{display:grid;grid-template-columns:1fr;gap:10px}.fv84-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.fv84-hint{font-size:10px;color:var(--text3);margin-top:4px}.fv84-presets{display:flex;gap:6px;align-items:center}.fv84-presets select{flex:1;min-width:0}.fv84-email-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}.fv84-email-chip{border:1px solid var(--border);background:rgba(255,255,255,.03);color:var(--text2);border-radius:999px;padding:5px 8px;font-size:10px;cursor:pointer}.fv84-email-chip:hover{border-color:var(--amber);color:var(--amber)}';
    document.head.appendChild(s);
  }

  window.abrirEntregaFacturaV84 = function (opts) {
    opts = opts || {};
    const o = (window.DB?.obras || []).find(x => x.id === opts.obraId);
    if (!o) return alert('No se encontró la OT.');
    const c = clienteDe(o), prueba = !!opts.prueba;
    const fileId = String(opts.fileId || opts.driveFileId || '');
    const url = String(opts.webViewLink || opts.driveWebViewLink || '');
    const numero = String(opts.numero || opts.numeroCompleto || (prueba ? 'PRUEBA HOMOLOGACION' : 'Comprobante'));
    if (!fileId && !url) return alert('Todavía no hay un PDF archivado para enviar.');
    ensureStyle();
    document.getElementById('modal-fv84')?.remove();
    const root = document.createElement('div');
    root.id = 'modal-fv84'; root.className = 'modal-overlay open';
    const sugeridos = emailsDe(c);
    const preferido = splitEmails(c.emailFacturacionPredeterminado)[0] || sugeridos[0] || '';
    const initialEmails = prueba ? (window.currentUser?.email || preferido) : preferido;
    const options = sugeridos.map(email => `<option value="${esc(email)}">${esc(email)}</option>`).join('');
    const chips = sugeridos.map(email => `<button type="button" class="fv84-email-chip" data-email="${esc(email)}">+ ${esc(email)}</button>`).join('');
    root.innerHTML = `<div class="modal" style="max-width:760px"><div class="modal-title">${prueba ? 'Enviar PRUEBA por correo' : 'Enviar comprobante por correo'} · OT ${esc(o.ot || '')}</div><div style="padding:10px;border:1px solid ${prueba ? 'rgba(91,156,246,.45)' : 'rgba(76,175,125,.45)'};border-radius:8px;margin-bottom:12px;font-size:11px">${prueba ? '<b>PRUEBA SIN VALIDEZ FISCAL.</b> Usá preferentemente tu propio correo para validar el circuito.' : 'El PDF ya fue archivado en Drive. Revisá los destinatarios antes de enviarlo.'}</div><div class="fv84-grid">${sugeridos.length ? `<div class="form-group"><label>Correos guardados del cliente</label><div class="fv84-presets"><select id="fv84-preset"><option value="">Elegir correo guardado…</option>${options}</select><button type="button" class="btn btn-ghost" id="fv84-use-preset">Agregar</button></div><div class="fv84-email-chips">${chips}</div></div>` : ''}<div class="form-group"><label>Correo(s) destinatario(s)</label><input id="fv84-email" placeholder="cliente@empresa.com; administracion@empresa.com" value="${esc(initialEmails)}"><div class="fv84-hint">Podés elegir correos guardados o agregar hasta 10 correos separados por coma o punto y coma.</div></div><label style="display:flex;gap:8px;align-items:flex-start;font-size:11px"><input id="fv84-save-email" type="checkbox" ${!prueba ? 'checked' : ''}>Asociar los correos nuevos al cliente y conservarlos para próximas ventas.</label><div class="form-group"><label>Asunto</label><input id="fv84-subject" value="${esc(prueba ? `PRUEBA TIZ · OT ${o.ot || ''}` : `Factura ${numero} · OT ${o.ot || ''}`)}"></div><div style="font-size:10px;color:var(--text3)">PDF: ${esc(opts.fileName || numero)}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">Abrir en Drive</a>` : ''}</div></div><div class="modal-actions fv84-actions"><button class="btn btn-ghost" id="fv84-close">Cerrar</button>${url ? '<button class="btn btn-ghost" id="fv84-copy">Copiar link PDF</button>' : ''}${fileId ? '<button class="btn btn-primary" id="fv84-mail"><i class="ti ti-mail-forward"></i> Enviar por correo</button>' : ''}</div></div>`;
    document.body.appendChild(root);
    const $ = q => root.querySelector(q);
    function addEmail(email) {
      const next = [...new Set([...splitEmails($('#fv84-email').value), ...splitEmails(email)])].slice(0, 10);
      $('#fv84-email').value = next.join('; ');
    }
    $('#fv84-close').onclick = () => root.remove();
    $('#fv84-use-preset')?.addEventListener('click', () => addEmail($('#fv84-preset').value));
    root.querySelectorAll('.fv84-email-chip').forEach(btn => btn.addEventListener('click', () => addEmail(btn.dataset.email)));
    if ($('#fv84-copy')) $('#fv84-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(url); window.showToast?.('Link del PDF copiado ✓'); }
      catch (_) { prompt('Copiá este link:', url); }
    };
    if ($('#fv84-mail')) $('#fv84-mail').onclick = async () => {
      const destinatarios = splitEmails($('#fv84-email').value);
      if (!destinatarios.length) return alert('Ingresá al menos un correo válido.');
      if (destinatarios.length > 10) return alert('Podés enviar hasta 10 correos por vez.');
      if (prueba && !confirm('Vas a enviar por correo un PDF de PRUEBA SIN VALIDEZ FISCAL. ¿Continuar?')) return;
      const b = $('#fv84-mail'), old = b.innerHTML;
      b.disabled = true; b.textContent = 'Enviando…';
      try {
        const r = await fetch(EMAIL_ENDPOINT, { method: 'POST', headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmacion: 'ENVIAR FACTURA POR EMAIL', obraId: o.id, fileId, numeroCompleto: numero, destinatario: destinatarios.join(','), asunto: $('#fv84-subject').value.trim(), guardarEnCliente: $('#fv84-save-email').checked, prueba }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.ok) throw new Error(d.error || `Correo respondió HTTP ${r.status}`);
        if (!prueba) {
          o.facturaArca = o.facturaArca || {}; o.facturaArca.emailUltimoDestinatarios = d.destinatario.split(','); o.estadoGestionFactura = 'Factura enviada';
          if ($('#fv84-save-email').checked) { c.emailsFacturacion = d.emailsCliente?.length ? d.emailsCliente : [...new Set([...emailsDe(c), ...destinatarios])]; c.emailFacturacionPredeterminado = destinatarios[0]; }
          window.renderCobranzas?.();
        }
        window.showToast?.('Correo enviado y asociado al cliente ✓');
        alert(`Correo enviado correctamente a:\n${d.destinatario}${prueba ? '\n\nPRUEBA SIN VALIDEZ FISCAL' : ''}`);
      } catch (e) { console.error('[TIZ V85 email]', e); alert('No se pudo enviar el correo.\n\n' + (e.message || e)); }
      finally { b.disabled = false; b.innerHTML = old; }
    };
  };

  function abrirExistente(id) {
    const o = (window.DB?.obras || []).find(x => x.id === id); if (!o) return alert('No se encontró la OT.');
    const f = o.facturaArca || {}, fileId = f.driveFileId || o.ultimoPdfFacturaId || '', url = f.driveWebViewLink || o.ultimoPdfFacturaUrl || '';
    if (!fileId && !url) return alert('La factura todavía no tiene PDF archivado en Drive.');
    return window.abrirEntregaFacturaV84({ obraId: id, prueba: false, fileId, fileName: f.driveFileName || f.numeroCompleto || o.nrfc || 'Factura', webViewLink: url, numero: f.numeroCompleto || o.nrfc || 'Factura' });
  }
  window.abrirEnvioFacturaEspecificaV2 = function (obraId, invoiceKey) {
    const w = window.TIZFacturacionCobranzasDataV2?.build?.().workItems?.find(x => x.obraId === obraId), f = w?.invoices?.find(x => x.key === invoiceKey);
    if (!f) return alert('No se encontró la factura seleccionada.');
    if (!f.driveFileId && !f.driveUrl) return alert('La factura todavía no tiene PDF archivado en Drive.');
    return window.abrirEntregaFacturaV84({ obraId, prueba: false, fileId: f.driveFileId, fileName: f.numeroCompleto || 'Factura', webViewLink: f.driveUrl, numero: f.numeroCompleto });
  };
  function installAlias() { window.abrirEnvioFacturaEmailV61 = abrirExistente; window.abrirEnvioFacturaV84 = abrirExistente; }
  installAlias(); window.addEventListener('load', () => { installAlias(); setTimeout(installAlias, 500); setTimeout(installAlias, 1500); });
  let n = 0; const t = setInterval(() => { installAlias(); if (++n > 120) clearInterval(t); }, 250);
})();
