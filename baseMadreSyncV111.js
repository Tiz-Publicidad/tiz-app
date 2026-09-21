// TIZ V111 - sincroniza CT/OT aprobadas con la planilla madre TIZ 2026 Base de Datos.
(function(){
'use strict';

const VERSION='BASE-MADRE-SYNC-V111-20260921';
const SPREADSHEET_ID='1mOhuPKcMG8PO3QsY3g84WL4p3o43t4ilK8Jx1DHjF5M';
const SHEET='Base de datos';
const SHEET_SCOPE='https://www.googleapis.com/auth/spreadsheets';
const CACHE_KEY='tiz-master-sheet-oauth-v111';
const FIREBASE_CONFIG={apiKey:'AIzaSyBkTVxyE0Qd6SBTw5jf-hdn1aCP5Y9g42E',authDomain:'tiz---app.firebaseapp.com',projectId:'tiz---app',storageBucket:'tiz---app.firebasestorage.app',messagingSenderId:'52620104053',appId:'1:52620104053:web:d62bf8b7ca296581f1833c',measurementId:'G-EXPT46ZFJT'};
let authPromise=null, syncPromise=null;

const T=v=>String(v??'').trim();
const norm=v=>T(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const base=v=>{const m=T(v).match(/\d{4,7}/);return m?String(Number(m[0])):''};
const N=v=>Number(v)||0;
const approved=v=>norm(v)==='aprobado'||norm(v)==='aprobada'||norm(v).startsWith('aprob');
const escSheetName=s=>"'"+String(s).replace(/'/g,"''")+"'";

function cachedToken(){
  try{
    const x=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null');
    if(!x?.token||!x?.ts)return'';
    if(Date.now()-Number(x.ts)>45*60*1000){sessionStorage.removeItem(CACHE_KEY);return''}
    return x.token;
  }catch(_){return''}
}
function cacheToken(token,email){try{sessionStorage.setItem(CACHE_KEY,JSON.stringify({token,ts:Date.now(),email:email||''}))}catch(_){}}

async function authApi(){
  if(authPromise)return authPromise;
  authPromise=(async()=>{
    const [{getApps,initializeApp},{getAuth,GoogleAuthProvider,reauthenticateWithPopup}]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')
    ]);
    const apps=getApps(),app=apps.length?apps[0]:initializeApp(FIREBASE_CONFIG),auth=getAuth(app);
    if(typeof auth.authStateReady==='function')await auth.authStateReady();
    return{auth,GoogleAuthProvider,reauthenticateWithPopup};
  })();
  return authPromise;
}
async function getToken(interactive=true){
  const cached=cachedToken();if(cached)return cached;
  if(!interactive)throw new Error('Falta autorizar Google Sheets');
  const {auth,GoogleAuthProvider,reauthenticateWithPopup}=await authApi(),u=auth.currentUser;
  if(!u)throw new Error('Sesion de Google no iniciada');
  const p=new GoogleAuthProvider();
  p.addScope(SHEET_SCOPE);
  p.setCustomParameters({prompt:'consent',login_hint:u.email||''});
  const result=await reauthenticateWithPopup(u,p),cred=GoogleAuthProvider.credentialFromResult(result),token=cred?.accessToken||'';
  if(!token)throw new Error('Google no entrego autorizacion para la planilla madre');
  cacheToken(token,result.user?.email||u.email||'');return token;
}

async function sheetsFetch(path,token,options={}){
  const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+SPREADSHEET_ID+path,{
    ...options,
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d?.error?.message||'No se pudo actualizar TIZ 2026 Base de Datos');
  return d;
}
function fmtDate(d=new Date()){
  return new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(d);
}
function isoWeek(d=new Date()){
  const x=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=x.getUTCDay()||7;x.setUTCDate(x.getUTCDate()+4-day);
  const yearStart=new Date(Date.UTC(x.getUTCFullYear(),0,1));
  return Math.ceil((((x-yearStart)/86400000)+1)/7);
}
function totalBudget(p){
  if(Array.isArray(p?.items)&&p.items.length){
    const s=p.items.reduce((a,it)=>a+N(it?.precio||it?.unitario)*N(it?.cant||it?.cantidad||1),0);
    if(s>0)return s;
  }
  return N(p?.importe||p?.neto||p?.total);
}
function payloadFromBudget(p={}){
  const e=p.entregaLogistica||p.logistica||{},neto=totalBudget(p),ivaPct=N(p.ivaPct||p.iva||21)||21;
  return{
    ot:base(p.nro||p.nroPresupuesto||p.cotizacionBase),
    descripcion:T(p.desc||p.descripcion),
    contacto:T(e.contacto||p.contacto||p.vendedor),
    cliente:T(p.cliente),
    neto,
    bruto:Math.round(neto*(1+ivaPct/100)*100)/100,
    estado:'Aprobado'
  };
}
async function findRow(ot,token){
  if(!ot)return null;
  const range=encodeURIComponent(escSheetName(SHEET)+'!C3:C1954');
  const d=await sheetsFetch('/values/'+range+'?majorDimension=ROWS',token);
  const vals=d.values||[];
  for(let i=0;i<vals.length;i++)if(base(vals[i]?.[0])===base(ot))return i+3;
  return null;
}
async function readRow(row,token){
  const range=encodeURIComponent(escSheetName(SHEET)+'!A'+row+':AD'+row);
  const d=await sheetsFetch('/values/'+range+'?valueRenderOption=FORMATTED_VALUE',token);
  return d.values?.[0]||[];
}
async function updateExisting(row,payload,token){
  const old=await readRow(row,token),fecha=T(old[0])||fmtDate(),sem=T(old[1])||String(isoWeek());
  const body={valueInputOption:'USER_ENTERED',data:[
    {range:escSheetName(SHEET)+'!A'+row+':H'+row,majorDimension:'ROWS',values:[[fecha,sem,payload.ot,payload.descripcion,payload.contacto,payload.cliente,payload.neto,payload.bruto]]},
    {range:escSheetName(SHEET)+'!AA'+row,majorDimension:'ROWS',values:[[payload.estado]]}
  ]};
  await sheetsFetch('/values:batchUpdate',token,{method:'POST',body:JSON.stringify(body)});
  return row;
}
async function appendNew(payload,token){
  const row=new Array(30).fill('');
  row[0]=fmtDate();row[1]=String(isoWeek());row[2]=payload.ot;row[3]=payload.descripcion;row[4]=payload.contacto;row[5]=payload.cliente;row[6]=payload.neto;row[7]=payload.bruto;row[26]=payload.estado;
  const range=encodeURIComponent(escSheetName(SHEET)+'!A:AD');
  const d=await sheetsFetch('/values/'+range+':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',token,{method:'POST',body:JSON.stringify({majorDimension:'ROWS',values:[row]})});
  const updated=d?.updates?.updatedRange||'';
  return Number(updated.match(/![A-Z]+(\d+):/)?.[1]||0)||null;
}
async function persistSync(p,row){
  const at=new Date().toISOString(),patch={baseMadreSyncAt:at,baseMadreRow:row||null,baseMadreSpreadsheetId:SPREADSHEET_ID,baseMadreSyncVersion:VERSION};
  if(p?.id&&typeof window.updateDoc_==='function'){
    try{await window.updateDoc_('presupuestos',p.id,patch);Object.assign(p,patch)}catch(e){console.warn('[TIZ V111] No se pudo guardar marca en presupuesto',e)}
  }
  const ot=base(p?.nro||p?.cotizacionBase),o=(window.DB?.obras||[]).find(x=>base(x?.ot||x?.nroCotizacion||x?.infoPresupuesto?.nro)===ot);
  if(o?.id&&typeof window.updateDoc_==='function'){
    try{await window.updateDoc_('obras',o.id,patch);Object.assign(o,patch)}catch(e){console.warn('[TIZ V111] No se pudo guardar marca en obra',e)}
  }
}
async function syncBudget(p,{interactive=true,silent=false,token=''}={}){
  if(!p||!approved(p.estado))return{ok:false,skipped:true,reason:'no aprobado'};
  const payload=payloadFromBudget(p);if(!payload.ot||!payload.cliente||payload.neto<=0)throw new Error('Faltan OT, cliente o importe para sincronizar la planilla madre');
  token=token||await getToken(interactive);
  const existing=await findRow(payload.ot,token);
  const row=existing?await updateExisting(existing,payload,token):await appendNew(payload,token);
  await persistSync(p,row);
  if(!silent)window.showToast?.('OT '+payload.ot+' sincronizada con TIZ 2026 Base de Datos ✓');
  return{ok:true,row,updated:!!existing,payload};
}
window.sincronizarBaseMadreTIZV111=syncBudget;

function currentBudgetFromForm(){
  const nro=T(document.getElementById('pp-nro')?.value),revision=T(document.getElementById('pp-revision')?.value||'1.1');
  const exact=(window.DB?.presupuestos||[]).find(p=>base(p.nro)===base(nro)&&T(p.revision||'1.1')===revision);
  return exact||(window.DB?.presupuestos||[]).find(p=>base(p.nro)===base(nro))||null;
}
function formSnapshot(){
  const items=Array.isArray(window.ppItems)?window.ppItems:[];
  return{
    id:window.editingId?.presupuesto||'',
    nro:T(document.getElementById('pp-nro')?.value),
    revision:T(document.getElementById('pp-revision')?.value||'1.1'),
    cliente:T(document.getElementById('pp-cliente')?.value),
    desc:T(document.getElementById('pp-desc')?.value),
    estado:T(document.getElementById('pp-estado')?.value),
    vendedor:T(document.getElementById('pp-vendedor')?.value),
    importe:items.reduce((a,it)=>a+N(it?.precio)*N(it?.cant||1),0),
    items:items.map(x=>({...x})),
    entregaLogistica:window.collectEntregaLogisticaPP?.()||{}
  };
}
function wrapSave(){
  const old=window.guardarPresupuestoCompleto;if(typeof old!=='function'||old.__baseMadreSyncV111)return;
  const wrapped=async function(){
    const snap=formSnapshot(),shouldSync=approved(snap.estado);
    let token='',authError=null;
    if(shouldSync){
      try{token=await getToken(true)}
      catch(e){authError=e;console.warn('[TIZ V111] Aprobacion sin autorizacion de planilla madre',e)}
    }
    const result=await old.apply(this,arguments);
    if(shouldSync){
      const p=currentBudgetFromForm()||{...snap,id:window.editingId?.presupuesto||snap.id};
      Object.assign(p,{...snap,id:p.id||window.editingId?.presupuesto||snap.id,estado:'Aprobado'});
      if(token){
        try{await syncBudget(p,{interactive:false,silent:false,token})}
        catch(e){console.error('[TIZ V111] No se pudo sincronizar planilla madre',e);window.showToast?.('Presupuesto aprobado; quedó pendiente sincronizar la planilla madre: '+(e.message||e))}
      }else if(authError)window.showToast?.('Presupuesto aprobado; falta autorizar Google Sheets para actualizar la planilla madre');
    }
    return result;
  };
  wrapped.__baseMadreSyncV111=true;wrapped.__baseMadreSyncOriginal=old;window.guardarPresupuestoCompleto=wrapped;
}
function wrapEnsure(){
  const old=window.ensureObraFromPresupuestoV358;if(typeof old!=='function'||old.__baseMadreSyncV111)return;
  const wrapped=async function(presupuestoId,data){
    const r=await old.apply(this,arguments);
    if(approved(data?.estado||'Aprobado')){
      const p={...(data||{}),id:presupuestoId,estado:'Aprobado'};
      const token=cachedToken();
      if(token)syncBudget(p,{interactive:false,silent:true,token}).catch(e=>console.warn('[TIZ V111 ensure]',e));
    }
    return r;
  };
  wrapped.__baseMadreSyncV111=true;window.ensureObraFromPresupuestoV358=wrapped;
}
function install(){wrapSave();wrapEnsure()}
install();window.addEventListener('load',()=>{install();setTimeout(install,800);setTimeout(install,1800)});
let n=0;const t=setInterval(()=>{install();if(++n>40)clearInterval(t)},250);
window.__TIZ_BASE_MADRE_SYNC_V111={version:VERSION,spreadsheetId:SPREADSHEET_ID,sheet:SHEET,syncBudget,payloadFromBudget};
})();
