// TIZ V123 - Drive PDF por backend, sin OAuth repetido del operador.
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
      const x = JSON.parse(sessionStorage.getItem(DRIVE_CACHE) || "null");
      if (!x?.token || !x?.ts) return "";
      if (Date.now() - Number(x.ts) > 45 * 60 * 1000) {
        sessionStorage.removeItem(DRIVE_CACHE);
        return "";
      }
      return x.token;
    } catch (_) {
      return "";
    }
  }
  function cacheDriveToken(token, email) {
    sessionStorage.setItem(
      DRIVE_CACHE,
      JSON.stringify({ token, ts: Date.now(), email: email || "" }),
    );
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
    p.setCustomParameters({ prompt: "consent", login_hint: u.email || "" });
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
    if (!r.ok) throw new Error(d.error || "Error del servidor");
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
      const d = await postJson(RECOVER_ENDPOINT, {
        obraId,
        invoiceKey,
        numeroCompleto: inv.numeroCompleto,
        cbteTipo: inv.cbteTipo,
        cbteNro: inv.cbteNro,
      });
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
  let retryBusy = false;
  async function retryPendingPdf() {
    if (retryBusy || busy) return;
    const obra = (window.DB?.obras || []).find(
      (o) =>
        o?.facturaArca?.cae &&
        !o?.facturaArca?.driveFileId &&
        (o?.facturaArca?.drivePendiente || o?.facturaDrivePendiente),
    );
    if (!obra) return;
    retryBusy = true;
    try {
      const d = await postJson(RECOVER_ENDPOINT, {
        obraId: obra.id,
        numeroCompleto: obra.facturaArca.numeroCompleto,
        cbteTipo: obra.facturaArca.cbteTipo,
        cbteNro: obra.facturaArca.cbteNro,
      });
      Object.assign(obra.facturaArca, {
        driveFileId: d.fileId,
        driveFileName: d.fileName,
        driveWebViewLink: d.webViewLink,
        drivePendiente: false,
      });
      obra.facturaDrivePendiente = false;
      window.TIZFactCobUIV2?.render?.();
      window.showToast?.(
        "PDF " +
          obra.facturaArca.numeroCompleto +
          " archivado automáticamente en Drive",
      );
    } catch (e) {
      console.warn("[TIZ V123 reintento PDF]", e);
    } finally {
      retryBusy = false;
    }
  }
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
