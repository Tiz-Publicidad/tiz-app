'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
test('manifest scopes installation to TIZ and supplies real Android icon dimensions',()=>{
  const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'))),base='https://tiz-publicidad.github.io/tiz-app/';
  assert.equal(new URL(m.id,base).href,base);assert.equal(new URL(m.scope,base).href,base);assert.equal(new URL(m.start_url,base).pathname,'/tiz-app/');assert.equal(m.display,'standalone');
  for(const icon of m.icons){const png=fs.readFileSync(path.join(root,icon.src));assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(icon.sizes,png.readUInt32BE(16)+'x'+png.readUInt32BE(20));}
});
function worker(){const events={},calls=[],deleted=[],precache=[],offline={offline:true};let skip=0,fail=false;const self={registration:{scope:'https://tiz-publicidad.github.io/tiz-app/'},clients:{claim:async()=>{}},addEventListener:(t,f)=>events[t]=f,skipWaiting:()=>skip++},caches={open:async()=>({addAll:async urls=>precache.push(...urls)}),keys:async()=>['tiz-pwa-static-old','firebase-local','another-app'],delete:async key=>deleted.push(key),match:async()=>offline};vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),{self,caches,URL,fetch:async(req,opts)=>{calls.push({req,opts});if(fail)throw Error('offline');return {online:true}}});return {events,calls,deleted,precache,offline,skip:()=>skip,fail:()=>fail=true};}
test('service worker leaves all remote requests, writes, authenticated requests and data untouched',async()=>{
  const w=worker(),request=(url,extra={})=>({url,method:'GET',mode:'cors',headers:new Headers(),...extra});
  for(const req of [request('https://firestore.googleapis.com/data'),request('https://tiz-publicidad.github.io/tiz-app/data.json'),request('https://tiz-publicidad.github.io/tiz-app/index.html',{method:'POST'}),request('https://tiz-publicidad.github.io/tiz-app/index.html',{mode:'navigate',headers:new Headers({Authorization:'Bearer test'})})]){let responded=false;w.events.fetch({request:req,respondWith:()=>responded=true});assert.equal(responded,false);}
  let response;w.events.fetch({request:request('https://tiz-publicidad.github.io/tiz-app/module.js?v=new'),respondWith:p=>response=p});await response;assert.equal(w.calls.length,1);assert.equal(w.calls[0].opts.cache,'no-store');
});
test('offline fallback contains no business data and activation only cleans its own old cache',async()=>{
  const w=worker();let done;w.events.install({waitUntil:p=>done=p});await done;assert.equal(w.precache.length,2);assert.ok(w.precache.every(u=>/offline.html|tiz-app-192.png/.test(u)));assert.equal(w.skip(),0);
  w.events.activate({waitUntil:p=>done=p});await done;assert.deepEqual(w.deleted,['tiz-pwa-static-old']);
  w.fail();let response;w.events.fetch({request:{url:'https://tiz-publicidad.github.io/tiz-app/',method:'GET',mode:'navigate',headers:new Headers()},respondWith:p=>response=p});assert.equal(await response,w.offline);
  w.events.message({data:{type:'OTHER'}});assert.equal(w.skip(),0);w.events.message({data:{type:'TIZ_APPLY_UPDATE'}});assert.equal(w.skip(),1);
});
class Element{
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.style={};this.attributes={};this.events={};this.hidden=false;this.isConnected=true;const classes=new Set();this.classList={toggle:(k,on)=>on?classes.add(k):classes.delete(k),contains:k=>classes.has(k)};}
  append(...els){this.children.push(...els)}prepend(...els){this.children.unshift(...els)}setAttribute(k,v){this.attributes[k]=v}addEventListener(k,f){this.events[k]=f}focus(){}matches(){return false}querySelector(sel){if(sel==='.sidebar')return this.sidebar;if(sel==='.logo')return this.logo;if(sel.startsWith('.nav-item'))return this.nav;return null;}
}
function page(email='info@tizpublicidad.com'){const body=new Element('body'),app=new Element('app'),sidebar=new Element('aside'),login=new Element('login'),docEvents={},winEvents={},swEvents={},appEvents={},intervals=[],loaded='a'.repeat(40),latest='b'.repeat(40);app.sidebar=sidebar;sidebar.logo=new Element('logo');sidebar.nav=new Element('button');let standalone=false,reloads=0,confirmValue=false,busy=false;const walk=el=>[el,...el.children.flatMap(walk)];body.append(app,login);let posted;
  const reg={waiting:{postMessage:m=>posted=m},addEventListener:(t,f)=>appEvents[t]=f,update:async()=>{}},document={baseURI:'https://tiz-publicidad.github.io/tiz-app/',readyState:'complete',hidden:false,body,createElement:t=>new Element(t),getElementById:id=>walk(body).find(e=>e.id===id),querySelector:s=>s==='.app'?app:s.startsWith('meta')?{content:loaded}:busy?{}:null,querySelectorAll:()=>walk(body).filter(e=>'tizInstall' in e.dataset),addEventListener:(t,f)=>docEvents[t]=f};const navigator={onLine:true,serviceWorker:{controller:{},addEventListener:(t,f)=>swEvents[t]=f,register:async()=>reg}},window={currentUser:email?{email}:null,matchMedia:()=>({matches:standalone}),addEventListener:(t,f)=>winEvents[t]=f,confirm:()=>confirmValue};
  vm.runInNewContext(fs.readFileSync(path.join(root,'pwa.js'),'utf8'),{document,window,navigator,URL,AbortController,location:{reload:()=>reloads++},fetch:async()=>({ok:true,text:async()=>latest}),setTimeout:()=>1,clearTimeout:()=>{},setInterval:(fn,ms)=>intervals.push({fn,ms}),console:{info:()=>{},warn:()=>{}}});
  return {body,app,sidebar,document,window,intervals,docEvents,winEvents,swEvents,reg,posted:()=>posted,reloads:()=>reloads,standalone:()=>standalone=true,confirm:()=>confirmValue=true,busy:v=>busy=v,flush:async()=>{for(let i=0;i<10;i++)await Promise.resolve();}};
}
test('new build announces an update without reloading; applying waits for save and respects edited fields',async()=>{
  const p=page();await p.flush();const banner=p.document.getElementById('tiz-update'),update=banner.children[1];assert.equal(banner.hidden,false);assert.equal(p.reloads(),0);
  p.busy(true);update.events.click();assert.equal(p.posted(),undefined);p.busy(false);
  const field={type:'text',id:'title',value:'old',isConnected:true,matches:()=>true};p.docEvents.focusin({target:field});field.value='new';update.events.click();assert.equal(p.posted(),undefined);p.confirm();update.events.click();assert.equal(p.posted().type,'TIZ_APPLY_UPDATE');assert.equal(p.reloads(),0);p.swEvents.controllerchange();assert.equal(p.reloads(),1);
});
test('install uses the browser prompt and the mobile drawer reuses the existing permission-controlled menu',async()=>{
  const p=page();await p.flush();let prompts=0,prevented=0;p.winEvents.beforeinstallprompt({preventDefault:()=>prevented++,prompt:async()=>prompts++,userChoice:Promise.resolve({outcome:'accepted'})});const button=p.document.querySelectorAll()[0];await button.events.click();assert.equal(prompts,1);assert.equal(prevented,1);p.standalone();p.winEvents.appinstalled();assert.ok(p.document.querySelectorAll().every(b=>b.hidden));
  const menu=p.app.children[0].children[0];menu.events.click();assert.equal(p.app.classList.contains('tiz-menu-open'),true);assert.equal(menu.attributes['aria-expanded'],'true');p.sidebar.events.click({target:{closest:()=>p.sidebar.nav}});assert.equal(p.app.classList.contains('tiz-menu-open'),false);
});


test('Pablo recibe el aviso manual; Carolina y Ariel actualizan automáticamente sin aviso',async()=>{
 for(const email of ['info@tizpublicidad.com','pablo.aciar@tizpublicidad.com']){const p=page(email);await p.flush();assert.equal(p.document.getElementById('tiz-update').hidden,false);assert.equal(p.posted(),undefined);assert.equal(p.reloads(),0);}
 for(const email of ['carolina.flores@tizpublicidad.com','arielbenitezpublicidad@gmail.com','julieta.aguirre@tizpublicidad.com']){const p=page(email);await p.flush();assert.equal(p.document.getElementById('tiz-update').hidden,true);assert.equal(p.posted().type,'TIZ_APPLY_UPDATE');p.swEvents.controllerchange();assert.equal(p.reloads(),1);}
});
test('actualización automática espera cambios sin guardar, un guardado activo y la identificación del usuario',async()=>{
 const p=page('carolina.flores@tizpublicidad.com'),field={type:'text',id:'task',value:'Inicial',isConnected:true,matches:()=>true};p.docEvents.focusin({target:field});field.value='Modificado';await p.flush();assert.equal(p.posted(),undefined);assert.equal(p.document.getElementById('tiz-update').hidden,true);
 const retry=p.intervals.find(x=>x.ms===5000).fn;field.isConnected=false;p.busy(true);retry();assert.equal(p.posted(),undefined);p.busy(false);retry();assert.equal(p.posted().type,'TIZ_APPLY_UPDATE');
 const unknown=page(null);await unknown.flush();assert.equal(unknown.posted(),undefined);unknown.window.currentUser={email:'pablo.aciar@tizpublicidad.com'};unknown.intervals.find(x=>x.ms===5000).fn();assert.equal(unknown.document.getElementById('tiz-update').hidden,false);assert.equal(unknown.posted(),undefined);
});
test('Pablo puede editar Colocaciones sin recibir permisos de administrador',()=>{
 const s=fs.readFileSync(path.join(root,'index.html'),'utf8'),start=s.indexOf('window.canAnnotateSector ='),end=s.indexOf('// ============================================================',start),window={currentUser:{email:'pablo.aciar@tizpublicidad.com',sector:'Producción',isAdmin:false}};
 vm.runInNewContext(s.slice(start,end),{window});assert.equal(window.canAnnotateSector('Colocaciones'),true);assert.equal(window.canAnnotateSector('Producción'),true);assert.equal(window.canAnnotateSector('Ventas'),false);assert.equal(window.canEditObra(),false);
 window.currentUser={email:'julieta.aguirre@tizpublicidad.com',sector:'Diseño',isAdmin:false};assert.equal(window.canAnnotateSector('Colocaciones'),false);
});
