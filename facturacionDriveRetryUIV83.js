// TIZ V126 - Archivo automático con la autorización Drive del operador.
(function () {
  "use strict";
  const RECOVER_ENDPOINT =
    "https://us-central1-tiz---app.cloudfunctions.net/facturacionReintentarDriveV83";
  const DRIVE_CACHE = "tiz-drive-oauth-v97";
  let authApi = null,
    authReadyPromise = null,
    busy = false;

  async function preloadAuth() {
    if (authReadyPromise) return authReadyPromise;
    authReadyPromise = (async () => {
      const [
        { getApp, getApps },
        { getAuth, GoogleAuthProvider, reauthenticateWithPopup },
      ] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"),
      ]);
      // Este script clásico puede ejecutarse antes que el módulo que inicializa
      // Firebase en index.html. Esperar evita dejar cacheada una promesa rechazada.
      for (let n = 0; !getApps().length && n < 200; n++)
        await new Promise((r) => setTimeout(r, 25));
      if (!getApps().length)
        throw new Error("Firebase todavía no está inicializado");
      const auth = getAuth(getApp());
      if (typeof auth.authStateReady === "function")
        await auth.authStateReady();
      authApi = { auth, GoogleAuthProvider, reauthenticateWithPopup };
      return authApi;
    })().catch((e) => {
      authReadyPromise = null;
      throw e;
    });
    return authReadyPromise;
  }
  preloadAuth().catch((e) => console.error("[TIZ V97 auth preload]", e));
  function cachedDriveToken() {
    try {
      const x = JSON.parse(
        sessionStorage.getItem(DRIVE_CACHE) ||
          localStorage.getItem(DRIVE_CACHE) ||
          "null",
      );
      if (!x?.token || !x?.ts) return "";
      if (Date.now() - Number(x.ts) > 50 * 60 * 1000) {
        sessionStorage.removeItem(DRIVE_CACHE);
        localStorage.removeItem(DRIVE_CACHE);
        return "";
      }
      return x.token;
    } catch (_) {
      return "";
    }
  }
  function cacheDriveToken(token, email) {
    const value = JSON.stringify({ token, ts: Date.now(), email: email || "" });
    sessionStorage.setItem(DRIVE_CACHE, value);
    localStorage.setItem(DRIVE_CACHE, value);
  }
  async function firebaseToken() {
    const { auth } = await preloadAuth();
    if (!auth.currentUser) throw new Error("Sesion no iniciada");
    return auth.currentUser.getIdToken();
  }
  async function authorizeDriveDirect() {
    const cached = cachedDriveToken();
    if (cached) return cached;
    const { auth, GoogleAuthProvider, reauthenticateWithPopup } =
      authApi || (await preloadAuth());
    const u = auth.currentUser;
    if (!u) throw new Error("Sesion no iniciada");
    const p = new GoogleAuthProvider();
    p.addScope("https://www.googleapis.com/auth/drive");
    p.setCustomParameters({ login_hint: u.email || "" });
    const result = await reauthenticateWithPopup(u, p);
    const cred = GoogleAuthProvider.credentialFromResult(result),
      access = cred?.accessToken || "";
    if (!access) throw new Error("Google no entrego autorizacion para Drive");
    cacheDriveToken(access, result.user?.email || u.email || "");
    window.showToast?.("Google Drive autorizado");
    return access;
  }
  window.obtenerDriveAccessTokenTizV97 = authorizeDriveDirect;
  window.obtenerDriveAccessTokenTizV93 = authorizeDriveDirect;
  window.obtenerDriveAccessTokenTizV92 = authorizeDriveDirect;
  window.obtenerDriveAccessTokenTizV91 = authorizeDriveDirect;
  window.obtenerDriveAccessTokenTizV87 = authorizeDriveDirect;
  window.obtenerDriveAccessTokenCacheTizV123 = cachedDriveToken;

  function comps(o) {
    const a = Array.isArray(o?.comprobantesArca)
      ? [...o.comprobantesArca]
      : Array.isArray(o?.facturasArca)
        ? [...o.facturasArca]
        : [];
    if (
      o?.facturaArca?.cae &&
      !a.some((x) => String(x?.cae) === String(o.facturaArca.cae))
    )
      a.push(o.facturaArca);
    return a.filter((x) => x?.cae);
  }
  function latest(o) {
    return (
      [...comps(o)].sort(
        (a, b) => Number(b?.cbteNro || 0) - Number(a?.cbteNro || 0),
      )[0] ||
      o?.facturaArca ||
      null
    );
  }
  function findObraByCbte(n) {
    return (
      (window.DB?.obras || []).find(
        (o) =>
          comps(o).some((c) => Number(c?.cbteNro || 0) === Number(n)) ||
          Number(o?.facturaArca?.cbteNro || 0) === Number(n),
      ) || null
    );
  }
  async function postJson(url, body) {
    const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + (await firebaseToken()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || "Error del servidor");
    return d;
  }

  window.recuperarPdfFacturaV2 = async function (obraId, invoiceKey, btn) {
    if (busy) return false;
    const w = window.TIZFacturacionCobranzasDataV2?.build?.().workItems?.find(
      (x) => x.obraId === obraId,
    );
    const inv = w?.invoices?.find((x) => x.key === invoiceKey);
    if (!w || !inv) {
      alert("No se encontró la factura seleccionada.");
      return false;
    }
    const old = btn?.textContent;
    try {
      busy = true;
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Archivando...";
      }
      let d;
      try {
        d = await postJson(RECOVER_ENDPOINT, {
          obraId,
          invoiceKey,
          numeroCompleto: inv.numeroCompleto,
          cbteTipo: inv.cbteTipo,
          cbteNro: inv.cbteNro,
          driveAccessToken: cachedDriveToken(),
        });
      } catch (firstError) {
        if (!/service accounts? do not have storage quota|storage quota|use oauth/i.test(String(firstError?.message || firstError)))
          throw firstError;
        if (btn) btn.textContent = "Autorizando Drive...";
        const access = await authorizeDriveDirect();
        if (btn) btn.textContent = "Archivando...";
        d = await postJson(RECOVER_ENDPOINT, {
          obraId,
          invoiceKey,
          numeroCompleto: inv.numeroCompleto,
          cbteTipo: inv.cbteTipo,
          cbteNro: inv.cbteNro,
          driveAccessToken: access,
        });
      }
      if (inv.raw) {
        inv.raw.driveFileId = d.fileId;
        inv.raw.driveFileName = d.fileName;
        inv.raw.driveWebViewLink = d.webViewLink;
        inv.raw.drivePendiente = false;
      }
      window.showToast?.(
        "FC " +
          (d.numeroCompleto || inv.numeroCompleto) +
          ": PDF archivado en 2026 Facturacion",
      );
      window.TIZFactCobUIV2?.render?.();
      return true;
    } catch (e) {
      console.error("[TIZ V2 archive]", e);
      alert(
        "La factura ya existe en ARCA, pero no se pudo archivar su PDF.\n\n" +
          (e.message || e) +
          "\n\nNo se vuelve a emitir ningún comprobante.",
      );
      return false;
    } finally {
      busy = false;
      if (btn && document.contains(btn)) {
        btn.disabled = false;
        btn.textContent = old;
      }
    }
  };
  const automaticJobs = new Map(), nextRetry = new Map();
  const sameInvoice = (a, b) => a?.cae === b?.cae &&
    Number(a?.cbteTipo) === Number(b?.cbteTipo) &&
    Number(a?.ptoVta) === Number(b?.ptoVta) &&
    Number(a?.cbteNro) === Number(b?.cbteNro);
  function updateArchived(obra, factura, d) {
    if (!d.fileId) throw new Error("Drive no confirmó el archivo PDF");
    const patch = { driveFileId: d.fileId, driveFileName: d.fileName || "",
      driveWebViewLink: d.webViewLink || "https://drive.google.com/file/d/" + d.fileId + "/view",
      drivePendiente: false };
    const current = (window.DB?.obras || []).find(x => x.id === obra.id) || obra;
    for (const o of new Set([obra, current])) {
      for (const c of [o.facturaArca, ...(o.comprobantesArca || []), ...(o.facturasArca || [])])
        if (sameInvoice(c, factura)) Object.assign(c, patch);
      if (sameInvoice(o.facturaArca, factura)) o.facturaDrivePendiente = false;
    }
    window.TIZFactCobUIV2?.render?.();
    window.showToast?.("FC " + factura.numeroCompleto + " · En Drive ✓");
    return d;
  }
  window.archivarPdfAutomaticoTizV126 = function (obra) {
    const factura = obra?.facturaArca, access = cachedDriveToken();
    if (!factura?.cae || factura.driveFileId || !access) return Promise.resolve(null);
    const key = obra.id + ":" + factura.cbteTipo + ":" + factura.ptoVta + ":" + factura.cbteNro;
    if (automaticJobs.has(key)) return automaticJobs.get(key);
    const job = postJson(RECOVER_ENDPOINT, {
      obraId: obra.id, cbteTipo: factura.cbteTipo, cbteNro: factura.cbteNro,
      numeroCompleto: factura.numeroCompleto, driveAccessToken: access
    }).then(d => updateArchived(obra, factura, d)).finally(() => automaticJobs.delete(key));
    automaticJobs.set(key, job);
    return job;
  };
  let retryBusy = false;
  async function retryPendingPdf() {
    if (retryBusy || busy || !cachedDriveToken()) return;
    const obras = (window.DB?.obras || []).filter(o => o?.facturaArca?.cae &&
      !o.facturaArca.driveFileId && (o.facturaArca.drivePendiente || o.facturaDrivePendiente) &&
      Date.now() >= (nextRetry.get(o.id) || 0));
    if (!obras.length) return;
    retryBusy = true;
    try {
      for (const obra of obras) {
        try { await window.archivarPdfAutomaticoTizV126(obra); nextRetry.delete(obra.id); }
        catch (e) {
          nextRetry.set(obra.id, Date.now() + 60000);
          console.warn("[TIZ V126 archivo automático]", e);
        }
      }
    } finally { retryBusy = false; }
  }
  window.conectarDriveFacturacionTizV126 = async function () {
    try {
      await authorizeDriveDirect();
      nextRetry.clear();
      window.TIZFactCobUIV2?.render?.();
      await retryPendingPdf();
    } catch (e) { alert("No se pudo conectar Google Drive. " + (e.message || e)); }
  };
  setInterval(retryPendingPdf, 10000);
  window.recuperarPdfFacturaV86 = async function (n, btn) {
    n = Number(n);
    const w = window.TIZFacturacionCobranzasDataV2?.build?.().workItems?.find(
      (w) => w.invoices?.some((i) => Number(i.cbteNro) === n),
    );
    const inv = w?.invoices?.find((i) => Number(i.cbteNro) === n);
    if (!w || !inv) {
      alert("No se encontró la factura para recuperar.");
      return false;
    }
    return window.recuperarPdfFacturaV2(w.obraId, inv.key, btn);
  };
})();
