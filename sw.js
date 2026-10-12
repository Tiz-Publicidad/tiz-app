/* TIZ PWA v1: network-only business data and code; offline information only. */
'use strict';
const CACHE='tiz-pwa-static-v1-20261012';
const local=path=>new URL(path,self.registration.scope).href;
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([local('offline.html'),local('assets/tiz-app-192.png')])));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('tiz-pwa-static-')&&k!==CACHE).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('message',event=>{
  if(event.data?.type==='TIZ_APPLY_UPDATE')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
  if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname)||request.headers.has('Authorization'))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request,{cache:'no-store'}).catch(()=>caches.match(local('offline.html'))));
  }else if(/\.(?:js|css)$/.test(url.pathname)||url.pathname.endsWith('/DEPLOY_COMMIT.txt')){
    event.respondWith(fetch(request,{cache:'no-store'}));
  }else if(url.href===local('assets/tiz-app-192.png')){
    event.respondWith(fetch(request).catch(()=>caches.match(request)));
  }
});
