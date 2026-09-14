// TIZ V91 - Drive OAuth estable por popup directo, sin loops de render ni redirects
(function(){
'use strict';
const ENDPOINT='https://us-central1-tiz---app.cloudfunctions.net/facturacionReintentarDriveV83';
const RECOVER_ENDPOINT='https://us-central1-tiz---app.cloudfunctions.net/facturacionRecuperarHistoricosV86';
const DRIVE_CACHE='tiz-drive-oauth-v91';
const base=v=>String(v??'').match(/\d{4,7}/)?.[0].replace(/^0+/,'')||'';
let authApi=null, authReadyPromise=null, busy=false;

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
preloadAuth().catch(e=>console.error('[TIZ V91 preload auth]',e));

function cachedDriveToken(){
  try{
    const x=JSON.parse(sessionStorage.getItem(DRIVE_CACHE)||'null');
    if(!x?.token||!x?.ts)return'';
    if(Date.now()-Number(x.ts)>45*60*1000){sessionStorage.removeItem(DRIVE_CACHE);return''}
    return x.token;
  }catch(_){return''}
}
function cacheDriveToken(token,email){sessionStorage.setItem(DRIVE_CACHE,JSON.stringify({token,ts:Date.now(),email:email||''}))}

async function firebaseToken(){
  const {auth}=await preloadAuth();
  if(!auth.currentUser)throw new Error('Sesión no iniciada');
  return auth.currentUser.getIdToken();
}

async function authorizeDriveDirect(){
  const cached=cachedDriveToken();
  if(cached)return cached;
  const {auth,GoogleAuthProvider,reauthenticateWithPopup}=authApi||await preloadAuth();
  const u=auth.currentUser;
  if(!u)throw new Error('Sesión no iniciada');
  const p=new GoogleAuthProvider();
  p.addScope('https://www.googleapis.com/auth/drive');
  p.setCustomParameters({prompt:'consent',login_hint:u.email||''});
  const result=await reauthenticateWithPopup(u,p);
  const cred=GoogleAuthProvider.credentialFromResult(result);
  const access=cred?.accessToken||'';
  if(!access)throw new Error('Google no entregó autorización para Drive');
  cacheDriveToken(access,result.user?.email||u.email||'');
  window.showToast?.('Google Drive autorizado ✓');
  return access;
}
window.obtenerDriveAccessTokenTizV91=authorizeDriveDirect;
window.obtenerDriveAccessTokenTizV90=authorizeDriveDirect;

function comps(o){
  const a=Array.isArray(o?.comprobantesArca)?[...o.comprobantesArca]:Array.isArray(o?.facturasArca)?[...o.facturasArca]:[];
  if(o?.facturaArca?.cae&&!a.some(x=>String(x?.cae)===String(o.facturaArca.cae)))a.push(o.facturaArca);
  return a.filter(x=>x?.cae);
}
function latest(o){return [...comps(o)].sort((a,b)=>Number(b?.cbteNro||0)-Number(a?.cbteNro||0))[0]||o?.facturaArca||null}
function hasDrive(c){return !!(c?.driveFileId||c?.fileId||c?.driveWebViewLink)}

async function postJson(url,body){
  const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+await firebaseToken(),'Content-Type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||'Error del servidor');
  return d;
}

window.recuperarPdfFacturaV86=async function(n,btn,opts={}){
  n=Number(n); if(!n)return false;
  if(busy&&!opts.silent)return false;
  const old=btn?.textContent;
  try{
    busy=true;
    if(btn){btn.disabled=true;btn.textContent='Autorizando…'}
    const access=opts.driveAccessToken||cachedDriveToken()||await authorizeDriveDirect();
    if(btn)btn.textContent='Archivando…';
    const d=await postJson(RECOVER_ENDPOINT,{cbteTipo:1,numeros:[n],driveAccessToken:access});
    const row=d.resultados?.[0];
    if(!row?.ok)throw new Error(row?.error||'No se pudo recuperar el comprobante');
    window.showToast?.(`FC ${row.numero}: PDF archivado en 2026 Facturacion ✓`);
    setTimeout(()=>window.renderCobranzas?.(),100);
    return true;
  }catch(e){
    console.error('[TIZ V91 recover]',e);
    if(!opts.silent)alert('La factura ya existe en ARCA, pero no se pudo archivar su PDF.\n\n'+(e.message||e)+'\n\nNo se vuelve a emitir ningún comprobante.');
    return false;
  }finally{
    busy=false;
    if(btn&&document.contains(btn)){btn.disabled=false;btn.textContent=old}
  }
};

window.reintentarPdfFacturaV83=async function(id,btn,opts={}){
  const o=(window.DB?.obras||[]).find(x=>x.id===id); if(!o?.facturaArca?.cae)return false;
  const old=btn?.textContent;
  try{
    busy=true;
    if(btn){btn.disabled=true;btn.textContent='Autorizando…'}
    const access=opts.driveAccessToken||cachedDriveToken()||await authorizeDriveDirect();
    if(btn)btn.textContent='Archivando…';
    const d=await postJson(ENDPOINT,{obraId:id,driveAccessToken:access});
    o.facturaArca.driveFileId=d.fileId;o.facturaArca.driveWebViewLink=d.webViewLink;o.facturaArca.drivePendiente=false;o.facturaDrivePendiente=false;
    window.showToast?.('PDF archivado en 2026 Facturacion ✓');
    setTimeout(()=>window.renderCobranzas?.(),100);
    return true;
  }catch(e){
    console.error('[TIZ V91 retry]',e);
    if(!opts.silent)alert('No se pudo archivar el PDF.\n\n'+(e.message||e)+'\n\nNo se vuelve a emitir el comprobante en ARCA.');
    return false;
  }finally{
    busy=false;
    if(btn&&document.contains(btn)){btn.disabled=false;btn.textContent=old}
  }
};

function pdfHtml(o){
  const c=latest(o);
  if(!c?.cae)return '<span style="color:var(--text3)">—</span>';
  if(hasDrive(c))return '<span class="badge badge-green" title="PDF archivado en 2026 Facturacion">En Drive</span>';
  return `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="badge badge-amber">PDF pendiente</span><button type="button" class="btn btn-ghost btn-sm fv91-pdf-recover" data-n="${Number(c.cbteNro||0)}">Archivar PDF</button></div>`;
}
function obraForRow(tr){const ot=base(tr.cells?.[0]?.textContent||'');return (window.DB?.obras||[]).find(x=>base(x.ot)===ot)||null}
function decorateTable(){
  const mod=document.getElementById('cobr-modulo-v48'); if(!mod)return;
  const table=mod.querySelector('table'); if(!table)return;
  const hr=table.querySelector('thead tr');
  if(hr&&!hr.querySelector('.fv91-pdf-head')){
    const th=document.createElement('th');th.className='fv91-pdf-head';th.textContent='PDF';
    const action=[...hr.children].find(x=>/acci[oó]n/i.test(x.textContent||''));action?hr.insertBefore(th,action):hr.appendChild(th);
  }
  table.querySelectorAll('tbody tr').forEach(tr=>{
    const o=obraForRow(tr); if(!o)return;
    let td=tr.querySelector('.fv91-pdf-cell');
    if(!td){td=document.createElement('td');td.className='fv91-pdf-cell';const action=tr.lastElementChild;action?tr.insertBefore(td,action):tr.appendChild(td)}
    const next=pdfHtml(o); if(td.innerHTML!==next)td.innerHTML=next;
  });
}
function bindClick(){
  if(window.__tizDrivePdfClickV91)return;window.__tizDrivePdfClickV91=true;
  document.addEventListener('click',e=>{
    const b=e.target?.closest?.('.fv91-pdf-recover'); if(!b)return;
    e.preventDefault();e.stopPropagation();
    window.recuperarPdfFacturaV86(Number(b.dataset.n||0),b);
  },true);
}
function install(){
  bindClick();
  if(typeof window.renderCobranzas==='function'&&!window.renderCobranzas.__driveRetryV91){
    const old=window.renderCobranzas;
    const wrapped=function(){const r=old.apply(this,arguments);requestAnimationFrame(()=>decorateTable());return r};
    wrapped.__driveRetryV91=true;window.renderCobranzas=wrapped;
  }
  decorateTable();
}
install();
window.addEventListener('load',install,{once:true});
setTimeout(install,600);
setTimeout(install,1600);
})();
