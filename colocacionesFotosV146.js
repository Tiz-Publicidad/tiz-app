/* TIZ: original photos go straight to the existing OT's Colocaciones folder. */
(function(root,factory){const core=factory();if(typeof module==='object'&&module.exports)module.exports=core;else root.TIZColocacionesFotosCore=core;})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const ident=x=>{if(!/^[\w-]{1,150}$/.test(String(x||'')))throw Error('Identificador de carpeta o archivo inválido.');return String(x);};
  const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const folderURL=id=>'https://drive.google.com/drive/folders/'+ident(id);
  const fileURL=id=>'https://drive.google.com/file/d/'+ident(id)+'/view';
  function parentId(o){if(o.driveFolderId)return ident(o.driveFolderId);try{const u=new URL(o.driveFolderUrl);if(u.protocol==='https:'&&u.hostname==='drive.google.com'&&!u.username&&!u.password){const m=u.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)/);if(m)return ident(m[1]);}}catch(_){}throw Error('Esta OT no tiene una carpeta de Drive vinculada. Vinculá la carpeta existente desde Obras.');}
  function validateFiles(files){const list=Array.from(files||[]);if(!list.length)throw Error('Elegí al menos una foto.');if(list.length>20)throw Error('Subí hasta 20 fotos por tanda.');for(const f of list){if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type||''))throw Error('Usá fotos JPG, PNG, WEBP, HEIC o HEIF.');if(!f.size||f.size>15*1024*1024)throw Error('Cada foto debe tener contenido y pesar hasta 15 MB.');}return list;}
  function createDriveClient(token,{fetchImpl=fetch,cryptoImpl=crypto}={}){
    async function request(url,options={},timeout=30000){
      const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='www.googleapis.com'||!u.pathname.startsWith('/drive/v3/')&&!u.pathname.startsWith('/upload/drive/v3/'))throw Error('Destino de Drive inválido.');
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
      try{return await fetchImpl(u.href,{...options,headers:{...options.headers,Authorization:'Bearer '+token},signal:controller.signal,credentials:'omit'});}catch(e){throw Error(e.name==='AbortError'?'Drive tardó demasiado. Reintentá la carga; primero se buscan fotos ya subidas.':'No se pudo conectar con Drive. Reintentá cuando tengas conexión.');}finally{clearTimeout(timer);}
    }
    async function json(url,options){const r=await request(url,options),d=await r.json().catch(()=>({}));if(!r.ok){if(r.status===401)throw Error('La autorización de Drive venció. Cerrá y volvé a abrir Fotos para autorizar.');if(r.status===403)throw Error('Google Drive no permite escribir en esta carpeta con tu cuenta.');throw Error(d.error?.message||'Drive no pudo completar la operación.');}return d;}
    const endpoint=(path,params={})=>'https://www.googleapis.com/drive/v3/'+path+'?'+new URLSearchParams({supportsAllDrives:'true',...params});
    async function account(email){const d=await json('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');if(norm(d.user?.emailAddress)!==norm(email))throw Error('Drive está autorizado con otra cuenta. Volvé a autorizar con la cuenta que usás en TIZ.');}
    async function get(id){return json(endpoint('files/'+ident(id),{fields:'id,name,mimeType,size,parents,trashed,capabilities(canAddChildren),appProperties'}));}
    async function list(q){const all=[];let pageToken='';do{const d=await json(endpoint('files',{q,fields:'nextPageToken,files(id,name,mimeType,size,parents,appProperties)',includeItemsFromAllDrives:'true',pageSize:'1000',...(pageToken?{pageToken}:{})}));all.push(...(d.files||[]));pageToken=d.nextPageToken||'';}while(pageToken);return all;}
    async function folder(parent){const p=await get(parent);if(p.mimeType!=='application/vnd.google-apps.folder'||p.trashed)throw Error('La carpeta vinculada a esta OT no está disponible.');const matches=(await list(`'${ident(parent)}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`)).filter(f=>/^0?3\s*[-–—_. ]*\s*colocacion(?:es)?$/.test(norm(f.name)));if(matches.length>1)throw Error('Hay varias carpetas 03 - COLOCACIÓN en esta OT. Revisá cuál corresponde.');if(!matches.length)throw Error('No se encontró 03 - COLOCACIÓN dentro de esta OT. Vinculá la carpeta correcta desde Obras; no se creó otra carpeta.');const target=await get(matches[0].id);if(target.trashed||target.mimeType!=='application/vnd.google-apps.folder'||!target.parents?.includes(parent))throw Error('No se pudo verificar 03 - COLOCACIÓN dentro de esta OT.');if(target.capabilities?.canAddChildren===false)throw Error('No tenés permiso para subir fotos a 03 - COLOCACIÓN.');return ident(target.id);}
    async function hash(file){const bytes=await cryptoImpl.subtle.digest('SHA-256',await file.arrayBuffer());return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
    async function verify(id,parent,file,key,kind,obraId){const d=await get(id);if(d.trashed||!d.parents?.includes(parent)||Number(d.size)!==file.size||d.appProperties?.tizPhotoHash!==key||d.appProperties?.tizPhotoType!==kind||d.appProperties?.tizObra!==obraId||!/^image\//.test(d.mimeType||''))throw Error('No se pudo verificar la foto dentro de la carpeta de esta OT.');return {id:ident(d.id),nombre:d.name,url:fileURL(d.id),tipo:kind,hash:key,size:file.size,mimeType:d.mimeType};}
    async function upload(file,parent,kind,o,{beforeCreate=async()=>{}}={}){
      const key=await hash(file),obraId=ident(o.id),matches=await list(`'${ident(parent)}' in parents and trashed = false and appProperties has { key='tizPhotoHash' and value='${key}' } and appProperties has { key='tizPhotoType' and value='${kind}' } and appProperties has { key='tizObra' and value='${obraId}' }`);
      if(matches.length>1)throw Error('Hay varias copias de esta foto en Drive. Revisá la carpeta antes de continuar.');
      if(matches.length)return {...await verify(matches[0].id,parent,file,key,kind,obraId),reused:true};
      const name=`OT ${String(o.ot||'').replace(/[^\w.-]/g,'')} - ${kind==='finales'?'Trabajo terminado':'Relevamiento'} - ${String(file.name||'foto').replace(/[\r\n\u0000-\u001f]/g,'').slice(0,160)}`;
      const metadata={name,mimeType:file.type,parents:[parent],appProperties:{tizPhotoHash:key,tizPhotoType:kind,tizObra:obraId}};
      await beforeCreate();const init=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id',{method:'POST',headers:{'Content-Type':'application/json','X-Upload-Content-Type':file.type,'X-Upload-Content-Length':String(file.size)},body:JSON.stringify(metadata)});
      if(!init.ok)throw Error('Drive no pudo iniciar la subida. Verificá autorización y permisos de la carpeta.');
      const session=init.headers.get('Location');if(!session)throw Error('Drive no entregó la dirección de subida.');
      const sent=await request(session,{method:'PUT',headers:{'Content-Type':file.type},body:file},90000);
      if(!sent.ok)throw Error('No se confirmó la subida de la foto. Reintentá para comprobar si ya está en Drive.');
      const result=await sent.json();return {...await verify(result.id,parent,file,key,kind,obraId),reused:false};
    }
    return {account,folder,upload,parentId,folderURL};
  }
  function photoPatch(o,photo,folder,at,user){const parent=parentId(o);return {[`colocacionesGestion.fotosDrive.archivos.${ident(photo.id)}`]:{...photo,subidaEn:at,subidaPor:user},'colocacionesGestion.fotosDrive.carpetaId':ident(folder),'colocacionesGestion.fotosDrive.carpetaUrl':folderURL(folder),'colocacionesGestion.fotosDrive.carpetaOT':parent,'colocacionesGestion.fotosDrive.carpetaVerificadaV147':true};}
  async function uploadBatch({files,kind,client,save,progress=()=>{},user,now=()=>Date.now(),leaseId}){
    files=validateFiles(files);if(!['relevamiento','finales'].includes(kind))throw Error('Elegí Relevamiento o Trabajo terminado.');
    const lease=ident(leaseId),result={saved:[],failed:[],folder:''};let locked=false,o;
    const renew=async()=>save(current=>{const old=current.colocacionesGestion?.fotosDrive?.lease;if(old?.id&&old.id!==lease&&old.hasta>now())throw Error('Otra persona está subiendo fotos a esta OT. Esperá a que termine.');if(o&&parentId(current)!==parentId(o))throw Error('Cambió la carpeta de esta OT. Cerrá y volvé a abrir Fotos.');parentId(current);o=current;locked=true;return {'colocacionesGestion.fotosDrive.lease':{id:lease,hasta:now()+300000}};});
    try{
      await renew();progress('Verificando la carpeta de esta OT…');const folder=await client.folder(parentId(o),{beforeCreate:renew});result.folder=folder;
      const owned=current=>{if(current.colocacionesGestion?.fotosDrive?.lease?.id!==lease)throw Error('Otra persona retomó la carga de esta OT. Cerrá y volvé a abrir Fotos.');};
      if(kind==='finales'&&!o.colocacionesGestion?.cierre?.cerrada)await save(current=>{owned(current);return {'colocacionesGestion.preparacion.fotos.estado':'Pendiente'};});
      for(let i=0;i<files.length;i++){
        const file=files[i];progress(`Subiendo ${i+1} de ${files.length}: ${file.name||'foto'}`);
        let photo;try{await renew();photo=await client.upload(file,folder,kind,o,{beforeCreate:renew});await save(current=>{owned(current);if(parentId(current)!==parentId(o))throw Error('Cambió la carpeta de esta OT. La foto está en Drive, pero falta revisar su vínculo en TIZ.');return photoPatch(current,photo,folder,new Date(now()).toISOString(),user);});result.saved.push(photo);}
        catch(e){result.failed.push({nombre:file.name||'foto',error:(photo?'La foto está en Drive, pero falta registrarla en TIZ. ':'')+errorMessage(e)});}
      }
      if(kind==='finales'&&!result.failed.length&&result.saved.length)await save(current=>{owned(current);if(parentId(current)!==parentId(o))throw Error('Cambió la carpeta de la OT. Revisá las fotos antes de cerrar.');return {'colocacionesGestion.preparacion.fotos.estado':'Listo','colocacionesGestion.preparacion.fotos.url':folderURL(folder)};});
      return result;
    }finally{if(locked)await save(current=>current.colocacionesGestion?.fotosDrive?.lease?.id===lease?{'colocacionesGestion.fotosDrive.lease':null}:{}).catch(()=>{});}
  }
  function errorMessage(err){
    const code=String(err?.code||''),raw=String(err?.message||err||'No se pudo completar la carga.');
    const messages={
      'auth/popup-blocked':'El navegador bloqueó la autorización de Google Drive. Permití las ventanas emergentes de TIZ y tocá nuevamente el botón de fotos.',
      'auth/popup-closed-by-user':'Se cerró la autorización de Google Drive. Tocá nuevamente el botón de fotos y completá la autorización.',
      'auth/cancelled-popup-request':'Ya hay una autorización de Google abierta. Completala y volvé a intentar.',
      'auth/user-mismatch':'Google se abrió con otra cuenta. Elegí la misma cuenta con la que ingresaste a TIZ.',
      'auth/unauthorized-domain':'Este dominio de TIZ no está autorizado en Firebase. Administración debe agregarlo en Authentication → Settings → Authorized domains.',
      'auth/network-request-failed':'No se pudo conectar con Google para autorizar Drive. Revisá la conexión y volvé a intentar.',
      'permission-denied':'Firebase no permitió registrar las fotos de esta cuenta. Administración debe revisar sus permisos; no vuelvas a crear la OT ni la carpeta.',
      'auth/internal-error':'Google/Firebase no pudo completar la autorización de Drive. Probá desde Chrome o Edge y verificá que esta cuenta esté habilitada en el consentimiento de Google.'
    };
    return (messages[code]||raw)+(code?' ('+code+')':'');
  }
  return {parentId,validateFiles,createDriveClient,photoPatch,uploadBatch,folderURL,fileURL,errorMessage};
});

(() => {
  if(typeof document==='undefined')return;
  const C=window.TIZColocacionesFotosCore,E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let busy=false;
  function html(o,kind='relevamiento'){
    const g=o.colocacionesGestion?.fotosDrive||{},photos=Object.values(g.archivos||{}),write=!!window.canAnnotateSector?.('Colocaciones'),url=g.carpetaVerificadaV147&&g.carpetaId?C.folderURL(g.carpetaId):'';if(!g.carpetaVerificadaV147)setTimeout(()=>reconcile(o.id,false),0);
    return `<fieldset class="c128-photo-panel" data-tiz-photo-work="${E(o.id)}" style="margin:14px 0;padding:14px;border:1px solid var(--border2);border-radius:8px"><legend>Fotos de la OT ${E(o.ot)}</legend><p class="c128-muted">Destino: 03 - COLOCACIÓN de esta OT. Las fotos elegidas se suben a Drive y quedan vinculadas a la obra.</p>${!g.carpetaVerificadaV147&&write?'<button type="button" class="btn btn-ghost" data-tiz-photo-sync>Vincular 03 - COLOCACIÓN</button>':''}${url?`<a class="btn btn-ghost" href="${E(url)}" target="_blank" rel="noopener noreferrer">Abrir fotos en Drive</a>`:''}<p class="c128-muted">${photos.filter(p=>p.tipo==='relevamiento').length} de relevamiento · ${photos.filter(p=>p.tipo==='finales').length} del trabajo terminado</p>${write?`<label>Tipo de fotos<select data-tiz-photo-kind><option value="relevamiento" ${kind==='relevamiento'?'selected':''}>Relevamiento</option><option value="finales" ${kind==='finales'?'selected':''}>Trabajo terminado</option></select></label><div class="c128-actions"><button type="button" class="btn btn-primary" data-tiz-photo-gallery>Elegir y subir desde galería</button><button type="button" class="btn btn-ghost" data-tiz-photo-camera>Sacar y subir foto</button></div><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden data-tiz-photo-files><input type="file" accept="image/*" capture="environment" hidden data-tiz-photo-capture><small class="c128-muted">Hasta 20 fotos por tanda, 15 MB por foto. Conservamos los archivos originales.</small>`:''}<div data-tiz-photo-status class="c128-status" role="status" aria-live="polite"></div><div data-tiz-photo-error class="c128-error" role="alert"></div>${photos.length?`<details><summary>Ver fotos registradas</summary>${photos.map(p=>`<div><a href="${E(C.fileURL(p.id))}" target="_blank" rel="noopener noreferrer">${E(p.nombre)}</a><small class="c128-muted"> · ${p.tipo==='finales'?'Trabajo terminado':'Relevamiento'}</small></div>`).join('')}</details>`:''}</fieldset>`;
  }
  async function reconcile(id,interactive){
    const panel=document.querySelector(`[data-tiz-photo-work="${CSS.escape(id)}"]`);if(!panel||busy)return;
    const token=interactive?null:window.obtenerDriveAccessTokenCacheTizV123?.();if(!interactive&&!token)return;
    const kind=panel.querySelector('[data-tiz-photo-kind]')?.value||'relevamiento',status=panel.querySelector('[data-tiz-photo-status]'),error=panel.querySelector('[data-tiz-photo-error]');
    try{if(!window.currentUser||!window.canViewPage?.('colocaciones')||!window.canAnnotateSector?.('Colocaciones'))return;
      busy=true;panel.setAttribute('aria-busy','true');status.textContent='Verificando 03 - COLOCACIÓN…';error.textContent='';
      const work=(window.DB?.obras||[]).find(o=>o.id===id);if(!work)throw Error('La obra ya no está disponible.');const parent=C.parentId(work),client=C.createDriveClient(token||await window.obtenerDriveAccessTokenTizV97?.());await client.account(window.currentUser.email);const folder=await client.folder(parent);
      const patch=await window.mutateColocacionesV128(id,current=>{if(C.parentId(current)!==parent)throw Error('Cambió la carpeta de la OT. Volvé a abrir Fotos.');const g=current.colocacionesGestion?.fotosDrive||{},p={'colocacionesGestion.fotosDrive.carpetaId':folder,'colocacionesGestion.fotosDrive.carpetaUrl':C.folderURL(folder),'colocacionesGestion.fotosDrive.carpetaOT':parent,'colocacionesGestion.fotosDrive.carpetaVerificadaV147':true};if(g.carpetaId&&current.colocacionesGestion?.preparacion?.fotos?.url===C.folderURL(g.carpetaId))p['colocacionesGestion.preparacion.fotos.url']=C.folderURL(folder);return p;});window.TIZColocacionesCore.applyPatch(work,patch);panel.outerHTML=html(work,kind);
    }catch(e){error.textContent=C.errorMessage(e);status.textContent='';}finally{busy=false;panel.removeAttribute('aria-busy');}
  }
  document.addEventListener('click',async e=>{
    const sync=e.target.closest?.('[data-tiz-photo-sync]');if(sync){reconcile(sync.closest('[data-tiz-photo-work]').dataset.tizPhotoWork,true);return;}
    const button=e.target.closest?.('[data-tiz-photo-gallery],[data-tiz-photo-camera]');if(!button||busy)return;
    const panel=button.closest('[data-tiz-photo-work]'),status=panel.querySelector('[data-tiz-photo-status]'),error=panel.querySelector('[data-tiz-photo-error]');
    error.textContent='';
    if(!window.obtenerDriveAccessTokenCacheTizV123?.()){
      try{
        if(!window.currentUser||!window.canAnnotateSector?.('Colocaciones'))throw Error('Tu puesto no tiene permiso para subir fotos.');
        busy=true;panel.setAttribute('aria-busy','true');button.disabled=true;
        status.textContent='Autorizando Google Drive antes de elegir las fotos…';
        // Abrir Google desde el clic, antes de que la galería consuma la activación del navegador.
        const token=await window.obtenerDriveAccessTokenTizV97?.();if(!token)throw Error('Falta autorizar Google Drive.');
        const client=C.createDriveClient(token);await client.account(window.currentUser.email);
        status.textContent='Google Drive autorizado. Tocá nuevamente el botón para elegir las fotos.';
      }catch(err){error.textContent=C.errorMessage(err);status.textContent='Autorización sin completar.';if(err.code==='auth/user-mismatch'||/otra cuenta/i.test(err.message||'')){sessionStorage.removeItem('tiz-drive-oauth-v97');localStorage.removeItem('tiz-drive-oauth-v97');}}
      finally{busy=false;panel.removeAttribute('aria-busy');button.disabled=false;}
      return;
    }
    panel.querySelector(button.hasAttribute('data-tiz-photo-camera')?'[data-tiz-photo-capture]':'[data-tiz-photo-files]').click();
  });
  document.addEventListener('change',async e=>{
    const input=e.target;if(!input.matches?.('[data-tiz-photo-files],[data-tiz-photo-capture]')||busy||!input.files?.length)return;
    const panel=input.closest('[data-tiz-photo-work]'),id=panel.dataset.tizPhotoWork,kind=panel.querySelector('[data-tiz-photo-kind]').value,files=Array.from(input.files),status=panel.querySelector('[data-tiz-photo-status]'),error=panel.querySelector('[data-tiz-photo-error]');error.textContent='';
    const controls=[...document.querySelectorAll('#c128-overlay button,#c128-overlay input,#c128-overlay select,#c128-overlay textarea')],previous=controls.map(el=>el.disabled);
    try{
      if(!window.currentUser||!window.canViewPage?.('colocaciones')||!window.canAnnotateSector?.('Colocaciones'))throw Error('Tu puesto no tiene permiso para subir fotos.');
      C.validateFiles(files);const work=(window.DB?.obras||[]).find(o=>o.id===id);if(!work)throw Error('La obra ya no está disponible.');C.parentId(work);
      busy=true;panel.setAttribute('aria-busy','true');controls.forEach(el=>el.disabled=true);status.textContent='Autorizando la subida a Drive…';
      const token=window.obtenerDriveAccessTokenCacheTizV123?.();if(!token)throw Error('La autorización de Drive venció. Tocá nuevamente el botón de fotos para autorizar antes de elegir los archivos.');
      const client=C.createDriveClient(token);await client.account(window.currentUser.email);
      const save=async builder=>{const patch=await window.mutateColocacionesV128(id,current=>({...builder(current),'colocacionesGestion.actualizadoEn':new Date().toISOString(),'colocacionesGestion.actualizadoPor':window.currentUser.email}));const o=(window.DB?.obras||[]).find(o=>o.id===id);if(o)window.TIZColocacionesCore.applyPatch(o,patch);return patch;};
      const result=await C.uploadBatch({files,kind,client,save,user:window.currentUser.email,leaseId:'foto'+crypto.randomUUID().replace(/-/g,''),progress:text=>status.textContent=text});
      window.TIZColocacionesGeneralV129?.changed(id);
      const current=(window.DB?.obras||[]).find(o=>o.id===id)||work;panel.outerHTML=html(current,kind);
      const fresh=document.querySelector(`[data-tiz-photo-work="${CSS.escape(id)}"]`);
      fresh.querySelector('[data-tiz-photo-status]').textContent=`${result.saved.length} fotos verificadas y registradas · ${result.failed.length} con error.${kind==='finales'&&!result.failed.length?' Fotos finales completas; confirmá el control final para cerrar.':''}`;
      fresh.querySelector('[data-tiz-photo-error]').textContent=result.failed.map(x=>x.nombre+': '+x.error).join('\n');
    }catch(err){error.textContent=C.errorMessage(err);status.textContent='Carga sin completar. Revisá el mensaje y reintentá; se buscan primero las fotos ya subidas.';if(/otra cuenta|venci[oó]/i.test(err.message||'')){sessionStorage.removeItem('tiz-drive-oauth-v97');localStorage.removeItem('tiz-drive-oauth-v97');}}
    finally{busy=false;panel.removeAttribute('aria-busy');controls.forEach((el,i)=>el.disabled=previous[i]);input.value='';}
  });
  window.TIZColocacionesFotosV146={html,busy:()=>busy};
})();
