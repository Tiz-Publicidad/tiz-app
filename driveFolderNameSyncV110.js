// TIZ V110 - mantiene el nombre de la carpeta OT alineado con cliente + descripcion sin crear duplicados.
(function(){
'use strict';

const VERSION='DRIVE-FOLDER-NAME-SYNC-V110-20260921';
const DRIVE_CACHE='tiz-drive-oauth-v99';
const FIREBASE_CONFIG={apiKey:'AIzaSyBkTVxyE0Qd6SBTw5jf-hdn1aCP5Y9g42E',authDomain:'tiz---app.firebaseapp.com',projectId:'tiz---app',storageBucket:'tiz---app.firebasestorage.app',messagingSenderId:'52620104053',appId:'1:52620104053:web:d62bf8b7ca296581f1833c',measurementId:'G-EXPT46ZFJT'};
let authReadyPromise=null;

const T=v=>String(v??'').trim();
const base=v=>{const m=T(v).match(/\d{4,7}/);return m?String(Number(m[0])):''};
const norm=v=>T(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
function safe(v){return T(v).replace(/[\\/]+/g,' - ').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').replace(/^[-\s]+|[-\s]+$/g,'').trim()}
function folderId(o){
  if(o?.driveFolderId)return T(o.driveFolderId);
  const u=T(o?.driveFolderUrl);
  return u.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1]||u.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1]||'';
}
function desired(o){
  const ot=base(o?.ot||o?.nro||o?.nroPresupuesto||o?.infoPresupuesto?.nro);
  if(!ot)return'';
  const cliente=safe(o?.cliente||o?.infoPresupuesto?.cliente);
  const desc=safe(o?.desc||o?.descripcion||o?.infoPresupuesto?.descripcion);
  return ['OT '+String(Number(ot)).padStart(6,'0'),cliente,desc].filter(Boolean).join(' - ');
}
function cachedToken(){try{const x=JSON.parse(sessionStorage.getItem(DRIVE_CACHE)||'null');if(!x?.token||!x?.ts)return'';if(Date.now()-Number(x.ts)>45*60*1000){sessionStorage.removeItem(DRIVE_CACHE);return''}return x.token}catch(_){return''}}
function cacheToken(token,email){try{sessionStorage.setItem(DRIVE_CACHE,JSON.stringify({token,ts:Date.now(),email:email||''}))}catch(_){}}
async function authApi(){
  if(authReadyPromise)return authReadyPromise;
  authReadyPromise=(async()=>{
    const [{getApps,initializeApp},{getAuth,GoogleAuthProvider,reauthenticateWithPopup}]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')
    ]);
    const apps=getApps(),app=apps.length?apps[0]:initializeApp(FIREBASE_CONFIG),auth=getAuth(app);
    if(typeof auth.authStateReady==='function')await auth.authStateReady();
    return{auth,GoogleAuthProvider,reauthenticateWithPopup};
  })();
  return authReadyPromise;
}
async function driveToken(interactive){
  const cached=cachedToken();if(cached)return cached;
  const {auth,GoogleAuthProvider,reauthenticateWithPopup}=await authApi(),u=auth.currentUser;
  if(!u)throw new Error('Sesion de Google no iniciada');
  if(!interactive)throw new Error('Falta autorizacion de Google Drive');
  const p=new GoogleAuthProvider();p.addScope('https://www.googleapis.com/auth/drive');p.setCustomParameters({prompt:'consent',login_hint:u.email||''});
  const result=await reauthenticateWithPopup(u,p),cred=GoogleAuthProvider.credentialFromResult(result),token=cred?.accessToken||'';
  if(!token)throw new Error('Google no entrego autorizacion para Drive');
  cacheToken(token,result.user?.email||u.email||'');return token;
}
async function driveMeta(id,token){
  const r=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,name,trashed',{headers:{Authorization:'Bearer '+token}});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||'No se pudo leer la carpeta de Drive');return d;
}
async function renameDrive(id,name,token){
  const r=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,name',{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({name})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||'No se pudo renombrar la carpeta de Drive');return d;
}
async function syncName(o,opts={}){
  const id=folderId(o),name=desired(o);if(!id||!name)return{ok:false,skipped:true,reason:'sin carpeta o nombre'};
  let token=String(opts.token||'')||cachedToken();
  if(!token&&opts.interactive===false)return{ok:false,skipped:true,reason:'sin autorizacion'};
  if(!token)token=await driveToken(true);
  const meta=await driveMeta(id,token);
  if(meta.trashed)throw new Error('La carpeta OT esta en la papelera de Drive');
  if(norm(meta.name)===norm(name))return{ok:true,changed:false,id,name:meta.name};
  const renamed=await renameDrive(id,name,token);
  const patch={driveFolderId:id,driveFolderName:renamed.name||name,driveFolderNameSyncedAt:new Date().toISOString()};
  if(o?.id&&typeof window.updateDoc_==='function'){await window.updateDoc_('obras',o.id,patch);Object.assign(o,patch)}
  return{ok:true,changed:true,id,name:renamed.name||name,previousName:meta.name};
}
window.sincronizarNombreCarpetaOTV110=async function(idOrObra,opts={}){
  const o=typeof idOrObra==='string'?(window.DB?.obras||[]).find(x=>x.id===idOrObra||base(x.ot)===base(idOrObra)):idOrObra;
  if(!o)throw new Error('No se encontro la OT');
  const r=await syncName(o,{interactive:opts.interactive!==false});
  if(r.changed)window.showToast?.('Carpeta Drive actualizada: '+r.name);
  else if(!opts.silent&&!r.skipped)window.showToast?.('El nombre de la carpeta Drive ya estaba actualizado');
  return r;
};

function wrapSaveObra(){
  const old=window.saveObra;if(typeof old!=='function'||old.__driveNameSyncV110)return;
  const wrapped=async function(){
    const id=window.editingId?.obra||'',o=id?(window.DB?.obras||[]).find(x=>x.id===id):null;
    const cliente=T(document.getElementById('f-cliente')?.value),desc=T(document.getElementById('f-desc')?.value),ot=T(document.getElementById('f-ot')?.value);
    const changed=!!(o&&folderId(o));
    const result=await old.apply(this,arguments);
    if(changed){
      const target={...o,ot:ot||o.ot,cliente:cliente||o.cliente,desc:desc||o.desc};
      try{await syncName(target,{interactive:true})}
      catch(e){console.error('[TIZ V110 nombre carpeta]',e);window.showToast?.('Obra guardada; pendiente actualizar nombre de carpeta Drive: '+(e.message||e))}
    }
    return result;
  };
  wrapped.__driveNameSyncV110=true;wrapped.__driveNameSyncOriginal=old;window.saveObra=wrapped;
}
function linkedObraForBudget(p,nro){
  const obras=window.DB?.obras||[];
  return (p?.obraId&&obras.find(o=>o.id===p.obraId))||obras.find(o=>base(o.ot)===base(nro))||null;
}
function wrapBudgetSave(){
  const old=window.guardarPresupuestoCompleto;if(typeof old!=='function'||old.__driveNameSyncV110)return;
  const wrapped=async function(){
    const nro=T(document.getElementById('pp-nro')?.value),cliente=T(document.getElementById('pp-cliente')?.value),desc=T(document.getElementById('pp-desc')?.value);
    const p=(window.DB?.presupuestos||[]).filter(x=>base(x.nro)===base(nro)).sort((a,b)=>String(b.revision||'').localeCompare(String(a.revision||''),undefined,{numeric:true}))[0]||null;
    const o=linkedObraForBudget(p,nro),changed=!!(o&&folderId(o));
    const result=await old.apply(this,arguments);
    if(changed){
      const patch={cliente:cliente||o.cliente,desc:desc||o.desc};
      try{
        if(o.id&&typeof window.updateDoc_==='function'){await window.updateDoc_('obras',o.id,patch);Object.assign(o,patch)}
        await syncName({...o,...patch},{interactive:true});
      }catch(e){console.error('[TIZ V110 presupuesto->carpeta]',e);window.showToast?.('Presupuesto guardado; pendiente actualizar nombre de carpeta Drive: '+(e.message||e))}
    }
    return result;
  };
  wrapped.__driveNameSyncV110=true;wrapped.__driveNameSyncOriginal=old;window.guardarPresupuestoCompleto=wrapped;
}
function install(){wrapSaveObra();wrapBudgetSave()}
install();window.addEventListener('load',()=>{install();setTimeout(install,800);setTimeout(install,1800)});
let tries=0;const timer=setInterval(()=>{install();if(++tries>40)clearInterval(timer)},250);
window.__TIZ_DRIVE_FOLDER_NAME_SYNC_V110={version:VERSION,desired,folderId,syncName};
})();
