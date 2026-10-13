/* TIZ PWA v1: install once; updates remain shared with the web app. */
(() => {
  'use strict';
  const base=new URL('./',document.baseURI);
  const installed=()=>installedThisSession||window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  let promptEvent=null,registration=null,applying=false,installedThisSession=false,pendingUpdate=false;
  const updateEditors=new Set(['info@tizpublicidad.com','pablo.aciar@tizpublicidad.com']);
  const managesUpdates=()=>updateEditors.has(String(window.currentUser?.email||'').toLowerCase());
  const edited=new Map();
  const value=el=>['checkbox','radio'].includes(el.type)?el.checked:el.value;
  const dirty=()=>[...edited].some(([el,initial])=>el.isConnected&&value(el)!==initial);
  document.addEventListener('focusin',e=>{const el=e.target;if(el.matches?.('input,textarea,select')&&el.type!=='search'&&!/query|search|filter/i.test(el.id||'')&&!edited.has(el))edited.set(el,value(el));});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;refreshInstall();});
  window.addEventListener('appinstalled',()=>{installedThisSession=true;promptEvent=null;refreshInstall();});
  function refreshInstall(){document.querySelectorAll('[data-tiz-install]').forEach(b=>b.hidden=installed());}
  function installButton(){const b=document.createElement('button');b.type='button';b.className='tiz-install';b.dataset.tizInstall='';b.textContent='Instalar TIZ';b.addEventListener('click',async()=>{
    if(promptEvent){const event=promptEvent;promptEvent=null;await event.prompt();await event.userChoice;refreshInstall();}
    else{const help=document.getElementById('tiz-install-help');help.hidden=!help.hidden;}
  });return b;}
  function setup(){
    const app=document.querySelector('.app'),sidebar=app?.querySelector('.sidebar');
    const help=document.createElement('div');help.id='tiz-install-help';help.hidden=true;help.setAttribute('role','status');help.textContent='En Android, abrí TIZ con Chrome. En el menú ⋮ elegí “Instalar aplicación” o “Agregar a la pantalla principal”. Si ya está instalada, abrila desde el icono TIZ.';
    const login=document.getElementById('login-screen');document.body.append(help);if(login)login.append(installButton());
    if(app&&sidebar){
      sidebar.id ||= 'tiz-sidebar';
      const bar=document.createElement('header');bar.className='tiz-mobile-bar';
      const menu=document.createElement('button');menu.type='button';menu.textContent='☰';menu.setAttribute('aria-label','Abrir menú');menu.setAttribute('aria-controls',sidebar.id);menu.setAttribute('aria-expanded','false');
      const title=document.createElement('strong');title.textContent='TIZ · Gestión';
      const shade=document.createElement('button');shade.type='button';shade.className='tiz-menu-backdrop';shade.setAttribute('aria-label','Cerrar menú');
      const toggle=open=>{app.classList.toggle('tiz-menu-open',open);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');if(open)sidebar.querySelector('.nav-item:not([style*="display: none"])')?.focus();else menu.focus();};
      menu.addEventListener('click',()=>toggle(!app.classList.contains('tiz-menu-open')));shade.addEventListener('click',()=>toggle(false));
      sidebar.addEventListener('click',e=>{if(e.target.closest('.nav-item'))toggle(false);});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&app.classList.contains('tiz-menu-open'))toggle(false);});
      bar.append(menu,title,installButton());app.prepend(bar,shade);
      const desktop=installButton();desktop.style.marginTop='10px';sidebar.querySelector('.logo')?.append(desktop);
    }
    refreshInstall();
    const banner=document.createElement('aside');banner.id='tiz-update';banner.hidden=true;banner.setAttribute('role','status');
    const message=document.createElement('p');message.textContent='Hay una versión nueva de TIZ. Guardá tu trabajo antes de actualizar.';
    const update=document.createElement('button');update.type='button';update.textContent='Actualizar';
    let postponed=false;
    const later=document.createElement('button');later.type='button';later.dataset.later='';later.textContent='Después';later.addEventListener('click',()=>{postponed=true;banner.hidden=true});
    const saving=()=>!!document.querySelector('[aria-busy="true"],.c128-busy,form button[type="submit"]:disabled')||!!window.__tizPresupuestoGuardando||!!window.TIZColocacionesFotosV146?.busy();
    const applyUpdate=()=>{
      if(applying)return;applying=true;update.disabled=true;
      if(registration?.waiting)registration.waiting.postMessage({type:'TIZ_APPLY_UPDATE'});else location.reload();
    };
    const processUpdate=()=>{
      if(!pendingUpdate||applying)return;
      if(managesUpdates()){if(!postponed)banner.hidden=false;return;}
      banner.hidden=true;
      // Auth arrives asynchronously. Keep edited forms and in-flight saves intact.
      if(!window.currentUser||document.hidden||!navigator.onLine||saving()||dirty())return;
      applyUpdate();
    };
    update.addEventListener('click',()=>{
      if(!managesUpdates())return;
      if(saving()){message.textContent='Esperá a que termine el guardado antes de actualizar.';return;}
      if(dirty()&&!window.confirm('Hay campos modificados. ¿Ya guardaste lo necesario y querés actualizar TIZ?'))return;
      applyUpdate();
    });banner.append(message,update,later);document.body.append(banner);
    const announce=()=>{pendingUpdate=true;postponed=false;processUpdate();};
    setInterval(processUpdate,5000);
    if('serviceWorker' in navigator){
      navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applying)location.reload();});
      navigator.serviceWorker.register(new URL('sw.js',base).href,{scope:base.pathname,updateViaCache:'none'}).then(r=>{
        registration=r;if(r.waiting)announce();r.addEventListener('updatefound',()=>{const worker=r.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)announce();});});
      }).catch(e=>console.warn('[TIZ PWA] Instalación del servicio pendiente:',e.message));
    }
    let checking=false;
    const checkBuild=async()=>{
      if(checking||document.hidden||!navigator.onLine)return;checking=true;
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
      try{
        const current=document.querySelector('meta[name="tiz-build"]')?.content;
        if(!/^[a-f0-9]{40}$/.test(current||''))return;
        const url=new URL('DEPLOY_COMMIT.txt',base);url.searchParams.set('check',Date.now());
        const response=await fetch(url,{cache:'no-store',signal:controller.signal});
        const latest=response.ok?(await response.text()).trim():'';
        if(/^[a-f0-9]{40}$/.test(latest)&&latest!==current)announce();
        await registration?.update();
      }catch(_){/* Keep the current page and unsaved work on connection failures. */}
      finally{checking=false;clearTimeout(timer);}
    };
    window.addEventListener('online',()=>{processUpdate();checkBuild()});document.addEventListener('visibilitychange',()=>{processUpdate();checkBuild()});setInterval(checkBuild,120000);checkBuild();
    console.info('[TIZ] PWA instalada en web TIZ-PWA-V1-20261012');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
