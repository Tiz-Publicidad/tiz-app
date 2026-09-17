// TIZ V99 - Drive PDF: archivado/recovery por comprobante exacto.
(function(){
'use strict';
const RETRY_ENDPOINT='https://us-central1-tiz---app.cloudfunctions.net/facturacionReintentarDriveV83';
const RECOVER_ENDPOINT='https://us-central1-tiz---app.cloudfunctions.net/facturacionRecuperarHistoricosV86';
const DRIVE_CACHE='tiz-drive-oauth-v99';
const FIREBASE_CONFIG={apiKey:'AIzaSyBkTVxyE0Qd6SBTw5jf-hdn1aCP5Y9g42E',authDomain:'tiz---app.firebaseapp.com',projectId:'tiz---app',storageBucket:'tiz---app.firebasestorage.app',messagingSenderId:'52620104053',appId:'1:52620104053:web:d62bf8b7ca296581f1833c',measurementId:'G-EXPT46ZFJT'};
let authApi=null,authReadyPromise=null,busy=false;
async function preloadAuth(){if(authReadyPromise)return authReadyPromise;authReadyPromise=(async()=>{const [{getApps,initializeApp},{getAuth,GoogleAuthProvider,reauthenticateWithPopup}]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')]);const apps=getApps(),app=apps.length?apps[0]:initializeApp(FIREBASE_CONFIG),auth=getAuth(app);if(typeof auth.authStateReady==='function')await auth.authStateReady();authApi={auth,GoogleAuthProvider,reauthenticateWithPopup};return authApi})();return authReadyPromise}
preloadAuth().catch(e=>console.error('[TIZ V99 auth preload]',e));
function cachedDriveToken(){try{const x=JSON.parse(sessionStorage.getItem(DRIVE_CACHE)||'null');if(!x?.token||!x?.ts)return'';if(Date.now()-Number(x.ts)>45*60*1000){sessionStorage.removeItem(DRIVE_CACHE);return''}return x.token}catch(_){return''}}
function cacheDriveToken(token,email){sessionStorage.setItem(DRIVE_CACHE,JSON.stringify({token,ts:Date.now(),email:email||''}))}
async function firebaseToken(){const {auth}=await preloadAuth();if(!auth.currentUser)throw new Error('Sesion de Firebase no iniciada');return auth.currentUser.getIdToken()}
async function authorizeDriveDirect(){const cached=cachedDriveToken();if(cached)return cached;const {auth,GoogleAuthProvider,reauthenticateWithPopup}=authApi||await preloadAuth(),u=auth.currentUser;if(!u)throw new Error('Sesion no iniciada');const p=new GoogleAuthProvider();p.addScope('https://www.googleapis.com/auth/drive');p.setCustomParameters({prompt:'consent',login_hint:u.email||''});const result=await reauthenticateWithPopup(u,p),cred=GoogleAuthProvider.credentialFromResult(result),access=cred?.accessToken||'';if(!access)throw new Error('Google no entrego autorizacion para Drive');cacheDriveToken(access,result.user?.email||u.email||'');window.showToast?.('Google Drive autorizado');return access}
for(const n of['TizV99','TizV98','TizV97','TizV93','TizV92','TizV91','TizV87'])window['obtenerDriveAccessToken'+n]=authorizeDriveDirect;
function key(c){if(c?.cae)return`cae:${c.cae}`;const p=Number(c?.ptoVta),t=Number(c?.cbteTipo),n=Number(c?.cbteNro);return p&&t&&n?`pv:${p}:${t}:${n}`:''}
function comps(o){const src=[...(Array.isArray(o?.comprobantesArca)?o.comprobantesArca:[]),...(Array.isArray(o?.facturasArca)?o.facturasArca:[]),...(o?.facturaArca?[o.facturaArca]:[])],m=new Map();for(const c of src){if(!c?.cae)continue;const k=key(c)||`x:${m.size}`;m.set(k,{...(m.get(k)||{}),...c})}return[...m.values()]}
function match(c,n,opts){if(Number(c?.cbteNro)!==Number(n))return false;if(opts?.ptoVta&&Number(c?.ptoVta)!==Number(opts.ptoVta))return false;if(opts?.cbteTipo&&Number(c?.cbteTipo)!==Number(opts.cbteTipo))return false;return true}
function findExact(n,opts){for(const o of(window.DB?.obras||[])){const c=comps(o).find(x=>match(x,n,opts));if(c)return{o,c}}return{o:null,c:null}}
function currentMatches(o,c){return !!(o?.facturaArca&&c&&key(o.facturaArca)===key(c))}
function applyLocal(o,c,row){if(!o||!c)return;const drive={driveFileId:row.fileId,driveFileName:row.fileName,driveWebViewLink:row.webViewLink,drivePendiente:false};Object.assign(c,drive);const k=key(c);for(const prop of['comprobantesArca','facturasArca'])if(Array.isArray(o[prop]))o[prop]=o[prop].map(x=>key(x)===k?{...x,...drive}:x);if(currentMatches(o,c)){o.facturaArca={...(o.facturaArca||{}),...drive};o.facturaDrivePendiente=false}}
async function postJson(url,body){const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+await firebaseToken(),'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Error del servidor');return d}
window.recuperarPdfFacturaV86=async function(n,btn,opts={}){
  n=Number(n);if(!n||busy)return false;const old=btn?.textContent;
  try{
    busy=true;if(btn){btn.disabled=true;btn.textContent='Autorizando...'}const access=String(opts?.driveAccessToken||'')||cachedDriveToken()||await authorizeDriveDirect();if(btn)btn.textContent='Archivando...';
    const found=findExact(n,opts),o=found.o,c=found.c,pto=Number(opts?.ptoVta||c?.ptoVta||3),tipo=Number(opts?.cbteTipo||c?.cbteTipo||1);let row;
    if(o?.id&&c&&currentMatches(o,c)){const d=await postJson(RETRY_ENDPOINT,{obraId:o.id,driveAccessToken:access});row={ok:!!d.ok,numero:c.numeroCompleto||String(n),fileId:d.fileId,fileName:d.fileName,webViewLink:d.webViewLink,error:d.error}}
    else{const d=await postJson(RECOVER_ENDPOINT,{ptoVta:pto,cbteTipo:tipo,numeros:[n],driveAccessToken:access});row=d.resultados?.[0]}
    if(!row?.ok)throw new Error(row?.error||'No se pudo archivar el comprobante');if(o&&c)applyLocal(o,c,row);if(!opts?.silent)window.showToast?.(`FC ${row.numero||n}: PDF archivado en 2026 Facturacion`);window.TIZFactCobUIV1?.render?.();window.renderCobranzas?.();return true;
  }catch(e){console.error('[TIZ V99 archive]',e);if(!opts?.silent)alert('La factura ya existe en ARCA, pero no se pudo archivar su PDF.\n\n'+(e.message||e)+'\n\nNo se vuelve a emitir ningun comprobante.');return false}
  finally{busy=false;if(btn&&document.contains(btn)){btn.disabled=false;btn.textContent=old}}
};
})();
