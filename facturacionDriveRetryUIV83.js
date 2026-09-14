// TIZ V92 - PDF state estable + Drive OAuth directo, sin re-render completo
(function(){
'use strict';
const RECOVER_ENDPOINT='https://us-central1-tiz---app.cloudfunctions.net/facturacionRecuperarHistoricosV86';
const DRIVE_CACHE='tiz-drive-oauth-v92';
const KNOWN_DRIVE={1:{fileId:'1OW0DBW9pH-QslFHdVJ--LHE2_q81s2jn',webViewLink:'https://drive.google.com/file/d/1OW0DBW9pH-QslFHdVJ--LHE2_q81s2jn/view'}};
const base=v=>String(v??'').match(/\d{4,7}/)?.[0].replace(/^0+/,'')||'';
let authApi=null,authReadyPromise=null,busy=false,scheduled=false;

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
preloadAuth().catch(e=>console.error('[TIZ V92 auth preload]',e));

function cachedDriveToken(){try{const x=JSON.parse(sessionStorage.getItem(DRIVE_CACHE)||'null');if(!x?.token||!x?.ts)return'';if(Date.now()-Number(x.ts)>45*60*1000){sessionStorage.removeItem(DRIVE_CACHE);return''}return x.token}catch(_){return''}}
function cacheDriveToken(token,email){sessionStorage.setItem(DRIVE_CACHE,JSON.stringify({token,ts:Date.now(),email:email||''}))}
async function firebaseToken(){const {auth}=await preloadAuth();if(!auth.currentUser)throw new Error('Sesión no iniciada');return auth.currentUser.getIdToken()}
async function authorizeDriveDirect(){
  const cached=cachedDriveToken();if(cached)return cached;
  const {auth,GoogleAuthProvider,reauthenticateWithPopup}=authApi||await preloadAuth();
  const u=auth.currentUser;if(!u)throw new Error('Sesión no iniciada');
  const p=new GoogleAuthProvider();p.addScope('https://www.googleapis.com/auth/drive');p.setCustomParameters({prompt:'consent',login_hint:u.email||''});
  const result=await reauthenticateWithPopup(u,p);const cred=GoogleAuthProvider.credentialFromResult(result),access=cred?.accessToken||'';
  if(!access)throw new Error('Google no entregó autorización para Drive');
  cacheDriveToken(access,result.user?.email||u.email||'');window.showToast?.('Google Drive autorizado ✓');return access;
}
window.obtenerDriveAccessTokenTizV92=authorizeDriveDirect;

function comps(o){const a=Array.isArray(o?.comprobantesArca)?[...o.comprobantesArca]:Array.isArray(o?.facturasArca)?[...o.facturasArca]:[];if(o?.facturaArca?.cae&&!a.some(x=>String(x?.cae)===String(o.facturaArca.cae)))a.push(o.facturaArca);return a.filter(x=>x?.cae)}
function latest(o){return [...comps(o)].sort((a,b)=>Number(b?.cbteNro||0)-Number(a?.cbteNro||0))[0]||o?.facturaArca||null}
function knownDrive(c){return KNOWN_DRIVE[Number(c?.cbteNro||0)]||null}
function hasDrive(c){return !!(c?.driveFileId||c?.fileId||c?.driveWebViewLink||knownDrive(c))}
function normalizeKnown(o){const c=latest(o),k=knownDrive(c);if(!c||!k||c.driveFileId)return;if(o.facturaArca&&Number(o.facturaArca.cbteNro||0)===Number(c.cbteNro||0)){o.facturaArca.driveFileId=k.fileId;o.facturaArca.driveWebViewLink=k.webViewLink;o.facturaArca.drivePendiente=false;o.facturaDrivePendiente=false}c.driveFileId=k.fileId;c.driveWebViewLink=k.webViewLink;c.drivePendiente=false}
function findObraByCbte(n){return (window.DB?.obras||[]).find(o=>comps(o).some(c=>Number(c?.cbteNro||0)===Number(n))||Number(o?.facturaArca?.cbteNro||0)===Number(n))||null}
async function postJson(url,body){const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+await firebaseToken(),'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Error del servidor');return d}

window.recuperarPdfFacturaV86=async function(n,btn){
  n=Number(n);if(!n||busy)return false;const old=btn?.textContent;
  try{
    busy=true;if(btn){btn.disabled=true;btn.textContent='Autorizando…'}
    const access=cachedDriveToken()||await authorizeDriveDirect();if(btn)btn.textContent='Archivando…';
    const d=await postJson(RECOVER_ENDPOINT,{cbteTipo:1,numeros:[n],driveAccessToken:access}),row=d.resultados?.[0];
    if(!row?.ok)throw new Error(row?.error||'No se pudo recuperar el comprobante');
    const o=findObraByCbte(n);if(o){const c=latest(o);if(c){c.driveFileId=row.fileId;c.driveFileName=row.fileName;c.driveWebViewLink=row.webViewLink;c.drivePendiente=false}if(o.facturaArca&&Number(o.facturaArca.cbteNro||0)===n){o.facturaArca.driveFileId=row.fileId;o.facturaArca.driveFileName=row.fileName;o.facturaArca.driveWebViewLink=row.webViewLink;o.facturaArca.drivePendiente=false;o.facturaDrivePendiente=false}}
    window.showToast?.(`FC ${row.numero}: PDF archivado en 2026 Facturacion ✓`);scheduleDecorate();return true;
  }catch(e){console.error('[TIZ V92 archive]',e);alert('La factura ya existe en ARCA, pero no se pudo archivar su PDF.\n\n'+(e.message||e)+'\n\nNo se vuelve a emitir ningún comprobante.');return false}
  finally{busy=false;if(btn&&document.contains(btn)){btn.disabled=false;btn.textContent=old}}
};

function pdfHtml(o){normalizeKnown(o);const c=latest(o);if(!c?.cae)return '<span style="color:var(--text3)">—</span>';const k=knownDrive(c);if(hasDrive(c)){const href=c.driveWebViewLink||k?.webViewLink||'';return href?`<a href="${href}" target="_blank" rel="noopener" class="badge badge-green" style="text-decoration:none" title="Abrir PDF archivado">En Drive</a>`:'<span class="badge badge-green">En Drive</span>'}return `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="badge badge-amber">PDF pendiente</span><button type="button" class="btn btn-ghost btn-sm fv92-pdf-recover" data-n="${Number(c.cbteNro||0)}">Archivar PDF</button></div>`}
function obraForRow(tr){const ot=base(tr.cells?.[0]?.textContent||'');return (window.DB?.obras||[]).find(x=>base(x.ot)===ot)||null}
function decorateTable(){
  scheduled=false;const mod=document.getElementById('cobr-modulo-v48');if(!mod)return;const table=mod.querySelector('table');if(!table)return;
  const hr=table.querySelector('thead tr');if(hr&&!hr.querySelector('.fv92-pdf-head')){[...hr.querySelectorAll('.fv91-pdf-head,.fv90-pdf-head,.fv86-pdf-head')].forEach(x=>x.remove());const th=document.createElement('th');th.className='fv92-pdf-head';th.textContent='PDF';const action=[...hr.children].find(x=>/acci[oó]n/i.test(x.textContent||''));action?hr.insertBefore(th,action):hr.appendChild(th)}
  table.querySelectorAll('tbody tr').forEach(tr=>{const o=obraForRow(tr);if(!o)return;[...tr.querySelectorAll('.fv91-pdf-cell,.fv90-pdf-cell,.fv86-pdf-cell')].forEach(x=>x.remove());let td=tr.querySelector('.fv92-pdf-cell');if(!td){td=document.createElement('td');td.className='fv92-pdf-cell';const action=tr.lastElementChild;action?tr.insertBefore(td,action):tr.appendChild(td)}const next=pdfHtml(o);if(td.innerHTML!==next)td.innerHTML=next});
}
function scheduleDecorate(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>setTimeout(decorateTable,20))}
function bindClick(){if(window.__tizDrivePdfClickV92)return;window.__tizDrivePdfClickV92=true;document.addEventListener('click',e=>{const b=e.target?.closest?.('.fv92-pdf-recover');if(b){e.preventDefault();e.stopPropagation();window.recuperarPdfFacturaV86(Number(b.dataset.n||0),b);return}if(e.target?.closest?.('#page-cobranzas .page-tab,[data-page="cobranzas"],.nav-item'))scheduleDecorate()},true)}
function install(){bindClick();(window.DB?.obras||[]).forEach(normalizeKnown);scheduleDecorate()}
install();window.addEventListener('load',install,{once:true});document.addEventListener('DOMContentLoaded',install,{once:true});
const mo=new MutationObserver(muts=>{if(!document.getElementById('page-cobranzas')?.classList.contains('active'))return;for(const m of muts){if([...m.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('#cobr-modulo-v48,table,tbody,tr')||n.querySelector?.('#cobr-modulo-v48,table')))){scheduleDecorate();break}}});
mo.observe(document.documentElement,{childList:true,subtree:true});
})();
