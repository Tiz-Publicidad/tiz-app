// TIZ V111 - sincroniza CT/OT aprobadas con la planilla madre TIZ 2026 Base de Datos.
(function(){
'use strict';

const VERSION='BASE-MADRE-SYNC-V119-CLIENT-CONTACT-20260922';
const BACKEND_URL='https://us-central1-tiz---app.cloudfunctions.net/sincronizarBaseMadreV120';
const SPREADSHEET_ID='1mOhuPKcMG8PO3QsY3g84WL4p3o43t4ilK8Jx1DHjF5M';
const SHEET='Base de datos';
const SHEET_SCOPE='https://www.googleapis.com/auth/spreadsheets';
const CACHE_KEY='tiz-master-sheet-oauth-v118';
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
    const raw=sessionStorage.getItem(CACHE_KEY)||localStorage.getItem(CACHE_KEY)||'null';
    const x=JSON.parse(raw);
    if(!x?.token||!x?.ts)return'';
    if(Date.now()-Number(x.ts)>50*60*1000){sessionStorage.removeItem(CACHE_KEY);localStorage.removeItem(CACHE_KEY);return''}
    return x.token;
  }catch(_){return''}
}
function cacheToken(token,email){
  const value=JSON.stringify({token,ts:Date.now(),email:email||''});
  try{sessionStorage.setItem(CACHE_KEY,value)}catch(_){}
  try{localStorage.setItem(CACHE_KEY,value)}catch(_){}
}

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
async function validateToken(token){
  if(!token)return {ok:false,error:'No se obtuvo token de Google'};
  try{
    await sheetsFetch('/values/'+encodeURIComponent(escSheetName(SHEET)+'!A1:A2')+'?majorDimension=ROWS',token);
    return {ok:true,error:''};
  }catch(e){
    console.warn('[TIZ V115] token Sheets invalido o sin acceso',e);
    return {ok:false,error:e?.message||String(e)};
  }
}
async function getToken(interactive=true){
  const cached=cachedToken(),cachedCheck=cached?await validateToken(cached):{ok:false,error:''};
  if(cached&&cachedCheck.ok)return cached;
  if(cached){try{sessionStorage.removeItem(CACHE_KEY)}catch(_){}try{localStorage.removeItem(CACHE_KEY)}catch(_){}}
  if(!interactive)throw new Error(cachedCheck.error||'Falta autorizar Google Sheets');
  const {auth,GoogleAuthProvider,reauthenticateWithPopup}=await authApi(),u=auth.currentUser;
  if(!u)throw new Error('Sesion de Google no iniciada');
  const p=new GoogleAuthProvider();
  p.addScope(SHEET_SCOPE);
  p.setCustomParameters({login_hint:u.email||''});
  const result=await reauthenticateWithPopup(u,p),cred=GoogleAuthProvider.credentialFromResult(result),token=cred?.accessToken||'';
  if(!token)throw new Error('Google no entrego autorizacion para la planilla madre');
  const check=await validateToken(token);
  if(!check.ok)throw new Error(check.error||'Google Sheets rechazo el acceso a TIZ 2026 Base de Datos');
  cacheToken(token,result.user?.email||u.email||'');return token;
}

async function sheetsFetch(path,token,options={}){
  const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+SPREADSHEET_ID+path,{
    ...options,
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const msg=d?.error?.message||'No se pudo actualizar TIZ 2026 Base de Datos';throw new Error('Google Sheets: '+msg)}
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
    contacto:T(e.contacto||e.retira||p.contacto),
    cliente:T(p.cliente),
    neto,
    bruto:Math.round(neto*(1+ivaPct/100)*100)/100,
    estado:'Pendiente'
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
function dateIso(v){
  const s=T(v);if(!s)return'';
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!m)return'';
  let y=Number(m[3]);if(y<100)y+=2000;
  return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
}
function sheetDate(v){const s=dateIso(v);if(!s)return'';const [y,m,d]=s.split('-');return `${d}/${m}/${y}`}
function weekFromIso(v){const s=dateIso(v);if(!s)return'';const [y,m,d]=s.split('-').map(Number);return String(isoWeek(new Date(y,m-1,d)))}
function invoiceNumber(x={}){return T(x.numeroCompleto||x.nroFactura||x.numero||x.cbteNro)}
function invoiceList(o={}){
  const all=[...(Array.isArray(o.comprobantesArca)?o.comprobantesArca:[]),...(Array.isArray(o.facturasArca)?o.facturasArca:[]),...(Array.isArray(o.facturasManual)?o.facturasManual:[])];
  if(o.facturaArca)all.push(o.facturaArca);
  const seen=new Set();return all.filter(x=>{const k=invoiceNumber(x).replace(/\D/g,'');if(!k||seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>dateIso(a.fecha).localeCompare(dateIso(b.fecha)));
}
function billingPayload(o={}){
  const invoices=invoiceList(o),payments=Array.isArray(o.cobros)?o.cobros:[],last=invoices[invoices.length-1]||{},lastPay=[...payments].sort((a,b)=>dateIso(a.fecha).localeCompare(dateIso(b.fecha))).pop()||{};
  const dueDates=invoices.map(x=>dateIso(x.fechaPrevistaCobro||x.fechaVencimientoPago)).filter(Boolean).sort();
  const due=dueDates[0]||dateIso(o.fechaPrevistaCobro||o.finanzas?.fechaPrevistaCobro);
  const numbers=invoices.map(invoiceNumber).filter(Boolean).join(' / ');
  const paid=payments.reduce((a,x)=>a+N(x.importe)+N(x.retenciones),0),invoiced=invoices.reduce((a,x)=>a+N(x.total||x.neto),0);
  const signature=[numbers||T(o.nrfc),last.fecha||o.ffc||'',due||'',payments.length,paid,o.cobranzaEstadoManual||'',o.estadoGestionFactCob||''].join('|');
  return{ot:base(o.ot||o.nroCotizacion||o.infoPresupuesto?.nro),fechaFactura:sheetDate(last.fecha||o.ffc),numeroFactura:numbers||T(o.nrfc),fechaProyectada:sheetDate(due),semanaProyectada:weekFromIso(due),semanaConfirmada:lastPay.fecha?weekFromIso(lastPay.fecha):'',paid,invoiced,cobrado:invoiced>0&&paid>=invoiced-.01,cobroParcial:paid>0,signature};
}
async function syncBilling(obraOrId,{interactive=true,silent=false,token=''}={}){
  const o=typeof obraOrId==='string'?(window.DB?.obras||[]).find(x=>x.id===obraOrId||base(x.ot)===base(obraOrId)):obraOrId;
  if(!o)throw new Error('No se encontró la OT para sincronizar Facturación/Cobranzas');
  const p=billingPayload(o);if(!p.ot)throw new Error('La OT no tiene número válido');
  token=token||await getToken(interactive);const row=await findRow(p.ot,token);if(!row)throw new Error('La OT '+p.ot+' no existe en Base de datos');
  const data=[];
  if(p.numeroFactura)data.push({range:escSheetName(SHEET)+'!T'+row+':U'+row,majorDimension:'ROWS',values:[[p.fechaFactura,p.numeroFactura]]});
  if(p.fechaProyectada)data.push({range:escSheetName(SHEET)+'!V'+row+':W'+row,majorDimension:'ROWS',values:[[p.fechaProyectada,p.semanaProyectada]]});
  if(p.semanaConfirmada)data.push({range:escSheetName(SHEET)+'!X'+row,majorDimension:'ROWS',values:[[p.semanaConfirmada]]});
  if(p.cobrado)data.push({range:escSheetName(SHEET)+'!AA'+row,majorDimension:'ROWS',values:[['Cobrado']]});
  else if(p.cobroParcial)data.push({range:escSheetName(SHEET)+'!AA'+row,majorDimension:'ROWS',values:[['Cobrado pendiente']]});
  if(!data.length)return{ok:true,row,skipped:true,payload:p};
  await sheetsFetch('/values:batchUpdate',token,{method:'POST',body:JSON.stringify({valueInputOption:'USER_ENTERED',data})});
  const actual=await readRow(row,token);
  if(p.numeroFactura&&T(actual[20])!==p.numeroFactura)throw new Error('La verificación de Nro FC falló en la fila '+row);
  const mark={baseMadreFactCobSyncAt:new Date().toISOString(),baseMadreFactCobSignature:p.signature,baseMadreRow:row,baseMadreFactCobSyncVersion:VERSION};
  if(o.id&&typeof window.updateDoc_==='function')try{await window.updateDoc_('obras',o.id,mark);Object.assign(o,mark)}catch(e){console.warn('[TIZ V117] No se pudo guardar marca de sincronización',e)}
  if(!silent)window.showToast?.('Facturación/Cobranzas de OT '+p.ot+' sincronizada con la planilla ✓');
  return{ok:true,row,payload:p,actual:{fechaFactura:actual[19],numeroFactura:actual[20],fechaProyectada:actual[21],semanaProyectada:actual[22],semanaConfirmada:actual[23],estado:actual[26]}};
}
async function readRow(row,token){
  const range=encodeURIComponent(escSheetName(SHEET)+'!A'+row+':AD'+row);
  const d=await sheetsFetch('/values/'+range+'?valueRenderOption=UNFORMATTED_VALUE',token);
  return d.values?.[0]||[];
}
async function verifyRow(row,payload,token){
  const values=await readRow(row,token);
  const ot=base(values[2]),cliente=norm(values[5]),neto=N(values[6]),estado=norm(values[26]);
  const errors=[];
  if(ot!==base(payload.ot))errors.push('OT distinta');
  if(cliente!==norm(payload.cliente))errors.push('cliente distinto');
  if(Math.abs(neto-N(payload.neto))>0.01)errors.push('neto distinto');
  if(!['pendiente','entregado','cobrado','cobrado pendiente'].includes(estado))errors.push('estado operativo inválido');
  if(errors.length)throw new Error('Base Madre escribió la fila '+row+' pero la verificación falló: '+errors.join(', '));
  return {ok:true,row,ot,cliente:values[5],neto,estado:values[26]};
}
async function updateExisting(row,payload,token){
  const old=await readRow(row,token),fecha=T(old[0])||fmtDate(),sem=T(old[1])||String(isoWeek());
  const body={valueInputOption:'USER_ENTERED',data:[
    {range:escSheetName(SHEET)+'!A'+row+':H'+row,majorDimension:'ROWS',values:[[fecha,sem,payload.ot,payload.descripcion,payload.contacto,payload.cliente,payload.neto,payload.bruto]]}
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
  const verified=await verifyRow(row,payload,token);
  await persistSync(p,row);
  if(!silent)window.showToast?.('OT '+payload.ot+' sincronizada con TIZ 2026 Base de Datos ✓');
  return{ok:true,row,updated:!!existing,payload,verified};
}
async function syncBudgetBackend(p,{silent=false}={}){
  if(!p||!approved(p.estado||p.status||p.estadoRevision))return{ok:false,skipped:true,reason:'no aprobado'};
  const ot=base(p.nro||p.nroPresupuesto||p.cotizacionBase);if(!ot)throw new Error('La OT no tiene número válido');
  const {auth}=await authApi(),user=auth.currentUser;if(!user)throw new Error('Sesión de TIZ no iniciada');
  const idToken=await user.getIdToken();
  const response=await fetch(BACKEND_URL,{method:'POST',headers:{Authorization:'Bearer '+idToken,'Content-Type':'application/json'},body:JSON.stringify({ot})});
  const result=await response.json().catch(()=>({}));if(!response.ok||!result.ok)throw new Error(result.error||'No se pudo sincronizar la Base Madre');
  const mark={baseMadreSyncAt:new Date().toISOString(),baseMadreRow:result.row||null,baseMadreSpreadsheetId:SPREADSHEET_ID,baseMadreSyncVersion:'BACKEND-V120'};
  Object.assign(p,mark);if(!silent)window.showToast?.('OT '+ot+' sincronizada con TIZ 2026 Base de Datos ✓');return result;
}
async function syncBillingBackend(obraOrId,{silent=false}={}){
  const o=typeof obraOrId==='string'?(window.DB?.obras||[]).find(x=>x.id===obraOrId||base(x.ot)===base(obraOrId)):obraOrId;
  if(!o)throw new Error('No se encontró la OT para sincronizar Facturación/Cobranzas');
  const ot=base(o.ot||o.nroCotizacion||o.infoPresupuesto?.nro);if(!ot)throw new Error('La OT no tiene número válido');
  const {auth}=await authApi(),user=auth.currentUser;if(!user)throw new Error('Sesión de TIZ no iniciada');
  const idToken=await user.getIdToken();
  const response=await fetch(BACKEND_URL,{method:'POST',headers:{Authorization:'Bearer '+idToken,'Content-Type':'application/json'},body:JSON.stringify({mode:'billing',ot,obraId:o.id||''})});
  const result=await response.json().catch(()=>({}));if(!response.ok||!result.ok)throw new Error(result.error||'No se pudo sincronizar Facturación/Cobranzas');
  if(!silent)window.showToast?.('Facturación/Cobranzas de OT '+ot+' sincronizada ✓');return result;
}
window.sincronizarBaseMadreBackendV120=syncBudgetBackend;
window.sincronizarFacturacionBaseMadreTIZV117=syncBillingBackend;
window.sincronizarBaseMadreTIZV111=syncBudget;
let billingMonitorBusy=false;
let repairMonitorBusy=false;
async function syncPendingBilling(){
  if(billingMonitorBusy)return;
  const pending=(window.DB?.obras||[]).find(o=>{const p=billingPayload(o);return p.numeroFactura&&p.signature!==T(o.baseMadreFactCobSignature)});
  if(!pending)return;billingMonitorBusy=true;
  try{await syncBillingBackend(pending,{silent:true})}catch(e){console.warn('[TIZ V121 monitor]',e)}finally{billingMonitorBusy=false}
}
setInterval(syncPendingBilling,5000);
async function repairKnownPendingOts(){
  if(repairMonitorBusy)return;
  const p=(window.DB?.presupuestos||[]).filter(x=>approved(x?.estado||x?.status||x?.estadoRevision)&&base(x?.nro||x?.cotizacionBase)==='4730').sort((a,b)=>T(b?.revision).localeCompare(T(a?.revision),undefined,{numeric:true}))[0];
  if(!p||p.baseMadreSyncAt||p.baseMadreRow)return;
  repairMonitorBusy=true;
  try{await syncBudgetBackend(p,{silent:false})}catch(e){console.warn('[TIZ V120 reparación OT 4730]',e)}finally{repairMonitorBusy=false}
}
setInterval(repairKnownPendingOts,7000);
window.autorizarBaseMadreTIZV111=async function(){throw new Error('La Base Madre se sincroniza automáticamente desde Firebase')};
window.verificarBaseMadreTIZV116=async function(idOrNro){
  const key=base(idOrNro),p=(window.DB?.presupuestos||[]).find(x=>x.id===idOrNro)||(window.DB?.presupuestos||[]).filter(x=>base(x?.nro||x?.cotizacionBase)===key).sort((a,b)=>String(b?.revision||'').localeCompare(String(a?.revision||''),undefined,{numeric:true}))[0];
  if(!p)throw new Error('No se encontro la cotizacion');
  const token=await getToken(true),payload=payloadFromBudget(p),row=await findRow(payload.ot,token);
  if(!row)return{ok:false,row:null,reason:'no existe en Base Madre',payload};
  const values=await readRow(row,token);
  return{ok:true,row,payload,actual:{fecha:values[0],semana:values[1],ot:values[2],descripcion:values[3],contacto:values[4],cliente:values[5],neto:values[6],bruto:values[7],estado:values[26]}};
};
window.repararBaseMadreAprobadaV111=async function(idOrNro){
  const key=base(idOrNro),p=(window.DB?.presupuestos||[]).find(x=>x.id===idOrNro)||(window.DB?.presupuestos||[]).filter(x=>base(x?.nro||x?.cotizacionBase)===key).sort((a,b)=>String(b?.revision||'').localeCompare(String(a?.revision||''),undefined,{numeric:true}))[0];
  if(!p)throw new Error('No se encontro la cotizacion');
  if(!approved(p.estado||p.status||p.estadoRevision))throw new Error('La cotizacion no esta aprobada');
  return syncBudgetBackend(p,{silent:false});
};

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
    const snap=formSnapshot(),current=currentBudgetFromForm(),shouldSync=approved(snap.estado),needsSync=shouldSync&&(!current?.baseMadreSyncAt||!current?.baseMadreRow);
    let token='',authError=null;
    if(needsSync){
      try{token=await getToken(true)}
      catch(e){authError=e;console.warn('[TIZ V111.2] Aprobacion/sync sin autorizacion de planilla madre',e)}
    }
    const result=await old.apply(this,arguments);
    if(needsSync){
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

function budgetById(id){return (window.DB?.presupuestos||[]).find(p=>p.id===id)||null}
function wrapFirestoreWrites(){
  const oldUpdate=window.updateDoc_;
  if(typeof oldUpdate==='function'&&!oldUpdate.__baseMadreSyncV1111){
    const wrapped=async function(collection,id,data){
      if(collection!=='presupuestos'||!approved(data?.estado))return oldUpdate.apply(this,arguments);
      const prev=budgetById(id),wasApproved=approved(prev?.estado||prev?.status||prev?.estadoRevision);
      const needsSync=!wasApproved||!prev?.baseMadreSyncAt||!prev?.baseMadreRow;
      let token='';
      if(needsSync){try{token=await getToken(true)}catch(e){console.warn('[TIZ V111.2] No se pudo autorizar Sheets antes de sincronizar',e)}}
      const result=await oldUpdate.apply(this,arguments);
      const merged={...(prev||{}),...(data||{}),id,estado:data?.estado||prev?.estado||'Aprobado'};
      if(needsSync){
        if(token)syncBudget(merged,{interactive:false,silent:false,token}).catch(e=>{console.error('[TIZ V111.2 update]',e);window.showToast?.('Aprobado, pero no se pudo actualizar la planilla madre: '+(e.message||e))});
        else window.showToast?.('Aprobado; falta autorizar Google Sheets para cargar la planilla madre');
      }
      return result;
    };
    wrapped.__baseMadreSyncV1111=true;wrapped.__baseMadreSyncOriginal=oldUpdate;window.updateDoc_=wrapped;
  }
  const oldAdd=window.addDoc_;
  if(typeof oldAdd==='function'&&!oldAdd.__baseMadreSyncV1111){
    const wrapped=async function(collection,data){
      if(collection!=='presupuestos'||!approved(data?.estado))return oldAdd.apply(this,arguments);
      let token='';try{token=await getToken(true)}catch(e){console.warn('[TIZ V111.1] No se pudo autorizar Sheets antes de crear aprobada',e)}
      const result=await oldAdd.apply(this,arguments);
      const p={...(data||{}),id:result?.id||'',estado:data?.estado||'Aprobado'};
      if(token)syncBudget(p,{interactive:false,silent:false,token}).catch(e=>{console.error('[TIZ V111.1 add]',e);window.showToast?.('Aprobado, pero no se pudo actualizar la planilla madre: '+(e.message||e))});
      else window.showToast?.('Aprobado; falta autorizar Google Sheets para cargar la planilla madre');
      return result;
    };
    wrapped.__baseMadreSyncV1111=true;wrapped.__baseMadreSyncOriginal=oldAdd;window.addDoc_=wrapped;
  }
}
function install(){/* V112: sincronizacion disparada explicitamente por sectorizacionV35 al guardar. */}
window.__TIZ_BASE_MADRE_SYNC_V111={version:VERSION,spreadsheetId:SPREADSHEET_ID,sheet:SHEET,syncBudget,syncBudgetBackend,payloadFromBudget};
})();
