// TIZ V98 - Drive PDF: autorizacion + archivado robusto para preview/redesign.
(function(){
'use strict';
const RETRY_ENDPOINT='https://us-central1-tiz---app.cloudfunctions.net/facturacionReintentarDriveV83';
const RECOVER_ENDPOINT='https://us-central1-tiz---app.cloudfunctions.net/facturacionRecuperarHistoricosV86';
const DRIVE_CACHE='tiz-drive-oauth-v98';
const FIREBASE_CONFIG={apiKey:'AIzaSyBkTVxyE0Qd6SBTw5jf-hdn1aCP5Y9g42E',authDomain:'tiz---app.firebaseapp.com',projectId:'tiz---app',storageBucket:'tiz---app.firebasestorage.app',messagingSenderId:'52620104053',appId:'1:52620104053:web:d62bf8b7ca296581f1833c',measurementId:'G-EXPT46ZFJT'};
let authApi=null,authReadyPromise=null,busy=false;

async function preloadAuth(){
  if(authReadyPromise)return authReadyPromise;
  authReadyPromise=(async()=>{
    const [{getApps,initializeApp},{getAuth,GoogleAuthProvider,reauthenticateWithPopup}]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')
    ]);
    const apps=getApps();const app=apps.length?apps[0]:initializeApp(FIREBASE_CONFIG);
    const auth=getAuth(app);
    if(typeof auth.authStateReady==='function')await auth.authStateReady();
    authApi={auth,GoogleAuthProvider,reauthenticateWithPopup};
    return authApi;
  })();
  return authReadyPromise;
}
preloadAuth().catch(e=>console.error('[TIZ V98 auth preload]',e));
function cachedDriveToken(){try{const x=JSON.parse(sessionStorage.getItem(DRIVE_CACHE)||'null');if(!x?.token||!x?.ts)return'';if(Date.now()-Number(x.ts)>45*60*1000){sessionStorage.removeItem(DRIVE_CACHE);return''}return x.token}catch(_){return''}}
function cacheDriveToken(token,email){sessionStorage.setItem(DRIVE_CACHE,JSON.stringify({token,ts:Date.now(),email:email||''}))}
async function firebaseToken(){const {auth}=await preloadAuth();if(!auth.currentUser)throw new Error('Sesion de Firebase no iniciada');return auth.currentUser.getIdToken()}
async function authorizeDriveDirect(){
  const cached=cachedDriveToken();if(cached)return cached;
  const {auth,GoogleAuthProvider,reauthenticateWithPopup}=authApi||await preloadAuth();
  const u=auth.currentUser;if(!u)throw new Error('Sesion no iniciada');
  const p=new GoogleAuthProvider();p.addScope('https://www.googleapis.com/auth/drive');p.setCustomParameters({prompt:'consent',login_hint:u.email||''});
  const result=await reauthenticateWithPopup(u,p);const cred=GoogleAuthProvider.credentialFromResult(result),access=cred?.accessToken||'';
  if(!access)throw new Error('Google no entrego autorizacion para Drive');
  cacheDriveToken(access,result.user?.email||u.email||'');window.showToast?.('Google Drive autorizado');return access;
}
window.obtenerDriveAccessTokenTizV98=authorizeDriveDirect;
window.obtenerDriveAccessTokenTizV97=authorizeDriveDirect;
window.obtenerDriveAccessTokenTizV93=authorizeDriveDirect;
window.obtenerDriveAccessTokenTizV92=authorizeDriveDirect;
window.obtenerDriveAccessTokenTizV91=authorizeDriveDirect;
window.obtenerDriveAccessTokenTizV87=authorizeDriveDirect;

function comps(o){const a=Array.isArray(o?.comprobantesArca)?[...o.comprobantesArca]:Array.isArray(o?.facturasArca)?[...o.facturasArca]:[];if(o?.facturaArca?.cae&&!a.some(x=>String(x?.cae)===String(o.facturaArca.cae)))a.push(o.facturaArca);return a.filter(x=>x?.cae)}
function latest(o){return [...comps(o)].sort((a,b)=>Number(b?.cbteNro||0)-Number(a?.cbteNro||0))[0]||o?.facturaArca||null}
function findObraByCbte(n){return (window.DB?.obras||[]).find(o=>comps(o).some(c=>Number(c?.cbteNro||0)===Number(n))||Number(o?.facturaArca?.cbteNro||0)===Number(n))||null}
async function postJson(url,body){const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+await firebaseToken(),'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Error del servidor');return d}

window.recuperarPdfFacturaV86=async function(n,btn,opts={}){
  n=Number(n);if(!n||busy)return false;const old=btn?.textContent;
  try{
    busy=true;if(btn){btn.disabled=true;btn.textContent='Autorizando...'}
    const access=String(opts?.driveAccessToken||'')||cachedDriveToken()||await authorizeDriveDirect();if(btn)btn.textContent='Archivando...';
    const o=findObraByCbte(n);let row;
    if(o?.id){
      const d=await postJson(RETRY_ENDPOINT,{obraId:o.id,driveAccessToken:access});
      row={ok:!!d.ok,numero:latest(o)?.numeroCompleto||String(n),fileId:d.fileId, fileName:d.fileName, webViewLink:d.webViewLink, error:d.error};
    }else{
      const d=await postJson(RECOVER_ENDPOINT,{cbteTipo:1,numeros:[n],driveAccessToken:access});row=d.resultados?.[0];
    }
    if(!row?.ok)throw new Error(row?.error||'No se pudo archivar el comprobante');
    if(o){
      const c=latest(o);
      if(c){c.driveFileId=row.fileId;c.driveFileName=row.fileName;c.driveWebViewLink=row.webViewLink;c.drivePendiente=false;}
      if(o.facturaArca&&Number(o.facturaArca.cbteNro||0)===n){o.facturaArca.driveFileId=row.fileId;o.facturaArca.driveFileName=row.fileName;o.facturaArca.driveWebViewLink=row.webViewLink;o.facturaArca.drivePendiente=false;o.facturaDrivePendiente=false;}
    }
    if(!opts?.silent)window.showToast?.(`FC ${row.numero||n}: PDF archivado en 2026 Facturacion`);
    window.TIZFactCobUIV1?.render?.();window.renderCobranzas?.();
    return true;
  }catch(e){
    console.error('[TIZ V98 archive]',e);
    if(!opts?.silent)alert('La factura ya existe en ARCA, pero no se pudo archivar su PDF.\n\n'+(e.message||e)+'\n\nNo se vuelve a emitir ningun comprobante.');
    return false;
  }finally{
    busy=false;if(btn&&document.contains(btn)){btn.disabled=false;btn.textContent=old;}
  }
};
})();
