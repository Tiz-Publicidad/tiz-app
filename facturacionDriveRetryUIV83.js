// TIZ V97 - Drive PDF: solo autorizacion + archivado. No modifica la tabla ni renderiza por su cuenta.
(function(){
'use strict';
const RECOVER_ENDPOINT='https://us-central1-tiz---app.cloudfunctions.net/facturacionRecuperarHistoricosV86';
const DRIVE_CACHE='tiz-drive-oauth-v97';
let authApi=null,authReadyPromise=null,busy=false;

async function preloadAuth(){
  if(authReadyPromise)return authReadyPromise;
  authReadyPromise=(async()=>{
    const [{getApp},{getAuth,GoogleAuthProvider,reauthenticateWithPopup}]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')
    ]);
    const auth=getAuth(getApp());
    if(typeof auth.authStateReady==='function')await auth.authStateReady();
    authApi={auth,GoogleAuthProvider,reauthenticateWithPopup};
    return authApi;
  })();
  return authReadyPromise;
}
preloadAuth().catch(e=>console.error('[TIZ V97 auth preload]',e));
function cachedDriveToken(){try{const x=JSON.parse(sessionStorage.getItem(DRIVE_CACHE)||'null');if(!x?.token||!x?.ts)return'';if(Date.now()-Number(x.ts)>45*60*1000){sessionStorage.removeItem(DRIVE_CACHE);return''}return x.token}catch(_){return''}}
function cacheDriveToken(token,email){sessionStorage.setItem(DRIVE_CACHE,JSON.stringify({token,ts:Date.now(),email:email||''}))}
async function firebaseToken(){const {auth}=await preloadAuth();if(!auth.currentUser)throw new Error('Sesion no iniciada');return auth.currentUser.getIdToken()}
async function authorizeDriveDirect(){
  const cached=cachedDriveToken();if(cached)return cached;
  const {auth,GoogleAuthProvider,reauthenticateWithPopup}=authApi||await preloadAuth();
  const u=auth.currentUser;if(!u)throw new Error('Sesion no iniciada');
  const p=new GoogleAuthProvider();p.addScope('https://www.googleapis.com/auth/drive');p.setCustomParameters({prompt:'consent',login_hint:u.email||''});
  const result=await reauthenticateWithPopup(u,p);const cred=GoogleAuthProvider.credentialFromResult(result),access=cred?.accessToken||'';
  if(!access)throw new Error('Google no entrego autorizacion para Drive');
  cacheDriveToken(access,result.user?.email||u.email||'');window.showToast?.('Google Drive autorizado');return access;
}
window.obtenerDriveAccessTokenTizV97=authorizeDriveDirect;
window.obtenerDriveAccessTokenTizV93=authorizeDriveDirect;
window.obtenerDriveAccessTokenTizV92=authorizeDriveDirect;
window.obtenerDriveAccessTokenTizV91=authorizeDriveDirect;

function comps(o){const a=Array.isArray(o?.comprobantesArca)?[...o.comprobantesArca]:Array.isArray(o?.facturasArca)?[...o.facturasArca]:[];if(o?.facturaArca?.cae&&!a.some(x=>String(x?.cae)===String(o.facturaArca.cae)))a.push(o.facturaArca);return a.filter(x=>x?.cae)}
function latest(o){return [...comps(o)].sort((a,b)=>Number(b?.cbteNro||0)-Number(a?.cbteNro||0))[0]||o?.facturaArca||null}
function findObraByCbte(n){return (window.DB?.obras||[]).find(o=>comps(o).some(c=>Number(c?.cbteNro||0)===Number(n))||Number(o?.facturaArca?.cbteNro||0)===Number(n))||null}
async function postJson(url,body){const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+await firebaseToken(),'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Error del servidor');return d}

window.recuperarPdfFacturaV86=async function(n,btn){
  n=Number(n);if(!n||busy)return false;const old=btn?.textContent;
  try{
    busy=true;if(btn){btn.disabled=true;btn.textContent='Autorizando...'}
    const access=cachedDriveToken()||await authorizeDriveDirect();if(btn)btn.textContent='Archivando...';
    const d=await postJson(RECOVER_ENDPOINT,{cbteTipo:1,numeros:[n],driveAccessToken:access}),row=d.resultados?.[0];
    if(!row?.ok)throw new Error(row?.error||'No se pudo recuperar el comprobante');
    const o=findObraByCbte(n);
    if(o){
      const c=latest(o);
      if(c){c.driveFileId=row.fileId;c.driveFileName=row.fileName;c.driveWebViewLink=row.webViewLink;c.drivePendiente=false;}
      if(o.facturaArca&&Number(o.facturaArca.cbteNro||0)===n){o.facturaArca.driveFileId=row.fileId;o.facturaArca.driveFileName=row.fileName;o.facturaArca.driveWebViewLink=row.webViewLink;o.facturaArca.drivePendiente=false;o.facturaDrivePendiente=false;}
    }
    window.showToast?.(`FC ${row.numero}: PDF archivado en 2026 Facturacion`);
    window.renderCobranzas?.();
    return true;
  }catch(e){
    console.error('[TIZ V97 archive]',e);
    alert('La factura ya existe en ARCA, pero no se pudo archivar su PDF.\n\n'+(e.message||e)+'\n\nNo se vuelve a emitir ningun comprobante.');
    return false;
  }finally{
    busy=false;if(btn&&document.contains(btn)){btn.disabled=false;btn.textContent=old;}
  }
};
})();
