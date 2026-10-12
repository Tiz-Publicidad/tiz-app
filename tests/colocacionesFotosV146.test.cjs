'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto').webcrypto;
const P=require('../colocacionesFotosV146'),root=path.join(__dirname,'..');
const file=(name='foto.jpg')=>({name,type:'image/jpeg',size:3,arrayBuffer:async()=>Uint8Array.from([1,2,3]).buffer});
function fixture(){return {id:'obra',ot:'4682',driveFolderId:'OTfolder',colocacionesGestion:{acciones:{a:{titulo:'Pendiente',estado:'Pendiente'}},preparacion:{final:{estado:'Pendiente'}}}};}
function apply(o,patch){for(const[k,v]of Object.entries(patch)){const keys=k.split('.');let p=o;for(const key of keys.slice(0,-1))p=p[key]??(p[key]={});p[keys.at(-1)]=v;}}
function driveMock({existingFolder=true,foreign=false,account='operador@example.test',folderNames=['03 - COLOCACIÓN']}={}){
 const calls=[],files=new Map(),pending=new Map();let created=0,folders=0;const response=(data,status=200,headers={})=>({ok:status>=200&&status<300,status,headers:new Headers(headers),json:async()=>data});
 const fetchImpl=async(url,opt)=>{const u=new URL(url);calls.push({url:u,opt});if(u.pathname.endsWith('/about'))return response({user:{emailAddress:account}});
  if(u.pathname==='/drive/v3/files/OTfolder')return response({id:'OTfolder',mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true}});
  if(u.pathname==='/drive/v3/files/Colfolder')return response({id:'Colfolder',mimeType:'application/vnd.google-apps.folder',parents:['OTfolder'],capabilities:{canAddChildren:true}});
  if(u.pathname.startsWith('/drive/v3/files/'))return response(files.get(u.pathname.split('/').pop())||{});
  if(u.pathname==='/drive/v3/files'&&opt.method==='POST'){const data=JSON.parse(opt.body);assert.deepEqual(data.parents,['OTfolder']);folders++;return response({id:'Colfolder'});}
  if(u.pathname==='/drive/v3/files'){const q=u.searchParams.get('q');if(q.includes('mimeType'))return response({files:existingFolder?folderNames.map(name=>({id:'Colfolder',name})):[]});return response({files:[...files.values()].filter(f=>q.includes(f.appProperties.tizPhotoHash)&&q.includes(f.appProperties.tizPhotoType)&&q.includes(f.appProperties.tizObra))});}
  if(u.pathname==='/upload/drive/v3/files'&&opt.method==='POST'){const id='photo'+(++created);pending.set(id,JSON.parse(opt.body));return response({},200,{Location:'https://www.googleapis.com/upload/drive/v3/files?upload_id='+id});}
  if(u.pathname==='/upload/drive/v3/files'&&opt.method==='PUT'){const id=u.searchParams.get('upload_id'),data=pending.get(id);files.set(id,{...data,id,size:String(opt.body.size),parents:foreign?['OtherOT']:data.parents});return response({id});}
  throw Error('Unexpected URL '+url);
 };
 return {client:P.createDriveClient('test-token',{fetchImpl,cryptoImpl:crypto}),calls,files,created:()=>created,folders:()=>folders};
}
test('parent uses only an existing valid OT folder and rejects unsupported images before writes',()=>{
 assert.equal(P.parentId({driveFolderUrl:'https://drive.google.com/drive/u/0/folders/OTfolder'}),'OTfolder');for(const o of [{},{driveFolderId:"id' injection"},{driveFolderUrl:'https://evil.example/drive/folders/id'}])assert.throws(()=>P.parentId(o));
 for(const list of [[],[{...file(),type:'image/svg+xml'}],[{...file(),size:16*1024*1024}],Array.from({length:21},()=>file())])assert.throws(()=>P.validateFiles(list));
});
test('Drive account must match TIZ and reuses the existing Colocaciones folder without creating an OT',async()=>{
 const d=driveMock();await d.client.account('operador@example.test');assert.equal(await d.client.folder('OTfolder'),'Colfolder');assert.equal(d.folders(),0);await assert.rejects(d.client.account('another@example.test'),/otra cuenta/);
 const fresh=driveMock({existingFolder:false});await assert.rejects(fresh.client.folder('OTfolder'),/No se encontró/);assert.equal(fresh.folders(),0);
});
test('original photo upload is verified against its parent, category and bytes, and repeated selection reuses it',async()=>{
 const d=driveMock(),f=file(),o=fixture();const first=await d.client.upload(f,'Colfolder','finales',o),second=await d.client.upload(f,'Colfolder','finales',o);assert.equal(first.id,second.id);assert.equal(second.reused,true);assert.equal(d.created(),1);const put=d.calls.find(x=>x.opt.method==='PUT');assert.equal(put.opt.body,f);assert.equal(put.opt.credentials,'omit');assert.equal(first.tipo,'finales');assert.equal(d.files.get(first.id).appProperties.tizObra,o.id);
 const wrong=driveMock({foreign:true});await assert.rejects(wrong.client.upload(f,'Colfolder','finales',o),/verificar/);
});
test('verified final photos enable only the photo requirement; review and open actions remain untouched',async()=>{
 const o=fixture(),d=driveMock(),save=async fn=>{const patch=fn(o);apply(o,patch);return patch;};const result=await P.uploadBatch({files:[file()],kind:'finales',client:d.client,save,user:'Operador',leaseId:'lease',now:()=>1000});assert.equal(result.saved.length,1);assert.equal(o.colocacionesGestion.preparacion.fotos.estado,'Listo');assert.equal(o.colocacionesGestion.preparacion.fotos.url,P.folderURL('Colfolder'));assert.equal(o.colocacionesGestion.preparacion.final.estado,'Pendiente');assert.equal(o.colocacionesGestion.acciones.a.estado,'Pendiente');assert.equal(o.driveFolderId,'OTfolder');assert.equal(o.colocacionesGestion.fotosDrive.lease,null);
});
test('relevamiento photos do not satisfy final photos and a partial batch leaves final photos pending',async()=>{
 const o=fixture(),d=driveMock(),save=async fn=>apply(o,fn(o));await P.uploadBatch({files:[file()],kind:'relevamiento',client:d.client,save,user:'Operador',leaseId:'lease',now:()=>1000});assert.equal(o.colocacionesGestion.preparacion.fotos,undefined);
 const client={folder:d.client.folder,upload:async(f,...args)=>{if(f.name==='error.jpg')throw Error('Connection failed');return d.client.upload(f,...args);}};
 const result=await P.uploadBatch({files:[file(),file('error.jpg')],kind:'finales',client,save,user:'Operador',leaseId:'lease',now:()=>1000});assert.equal(result.failed.length,1);assert.equal(result.saved.length,1);assert.equal(o.colocacionesGestion.preparacion.fotos.estado,'Pendiente');assert.equal(o.colocacionesGestion.fotosDrive.lease,null);
});
test('failure to record a Drive upload can be retried without creating a second photo',async()=>{
 const o=fixture(),d=driveMock();let fail=true;const save=async fn=>{const patch=fn(o);if(fail&&Object.keys(patch).some(k=>k.includes('.archivos.')))throw Error('TIZ did not save');apply(o,patch);return patch;};
 const a=await P.uploadBatch({files:[file()],kind:'finales',client:d.client,save,user:'Operador',leaseId:'lease',now:()=>1000});assert.equal(a.failed.length,1);assert.ok(a.failed[0].error.includes('está en Drive'));assert.equal(o.colocacionesGestion.preparacion.fotos.estado,'Pendiente');fail=false;const b=await P.uploadBatch({files:[file()],kind:'finales',client:d.client,save,user:'Operador',leaseId:'lease',now:()=>1000});assert.equal(b.saved.length,1);assert.equal(d.created(),1);assert.equal(o.colocacionesGestion.preparacion.fotos.estado,'Listo');
});
test('an active upload lease prevents another operator from creating a folder or uploading files',async()=>{
 const o=fixture();o.colocacionesGestion.fotosDrive={lease:{id:'other',hasta:9000}};const d=driveMock();await assert.rejects(P.uploadBatch({files:[file()],kind:'finales',client:d.client,save:async fn=>apply(o,fn(o)),user:'Operador',leaseId:'lease',now:()=>1000}),/Otra persona/);assert.equal(d.calls.length,0);assert.equal(o.colocacionesGestion.fotosDrive.lease.id,'other');
});
test('a resumable session cannot send the photo or token to another host',async()=>{
 const d=driveMock(),calls=[];const f=P.createDriveClient('test-token',{cryptoImpl:crypto,fetchImpl:async(url,opt)=>{calls.push(url);if(new URL(url).pathname==='/drive/v3/files')return {ok:true,json:async()=>({files:[]})};return {ok:true,headers:new Headers({Location:'https://evil.example/upload'}),json:async()=>({})};}});await assert.rejects(f.upload(file(),'Colfolder','finales',fixture()),/Destino/);assert.ok(calls.every(u=>new URL(u).hostname==='www.googleapis.com'));
});
test('closing a work still requires final control even with uploaded photos',async()=>{
 const source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),start=source.indexOf('  async function submit('),end=source.indexOf('  function downloadCalendar(',start),o=fixture(),w={},errors=[];o.colocacionesGestion.acciones={};o.colocacionesGestion.preparacion.fotos={estado:'Listo',url:P.folderURL('Colfolder')};
 vm.runInNewContext(source.slice(start,end)+'\nwindow.closeTest=submit;',{window:w,state:{id:'obra',busy:false},blockers:()=>[],FormData:class{get(k){return {fecha:'2026-10-12',resultado:'Terminada'}[k]}},obra:()=>o,stamp:()=> 'at',actor:()=> 'Operador',db:()=>({}),mutate:async(id,fn)=>apply(o,fn(o)),pending:()=>[],data:x=>x.colocacionesGestion,isoDate:x=>x,uid:()=> 'event',fmtDate:x=>x,drawModal:()=>{},toast:()=>{},error:e=>errors.push(e.message)});
 const event={target:{dataset:{form:'closeWork'}},preventDefault:()=>{}};await w.closeTest(event);assert.ok(errors[0].includes('control final'));assert.equal(o.colocacionesGestion.cierre,undefined);o.colocacionesGestion.preparacion.final.estado='Listo';errors.length=0;await w.closeTest(event);assert.equal(o.colocacionesGestion.cierre.cerrada,true);assert.equal(errors.length,0);
});

test('03 - COLOCACIÓN is reused even when a legacy Colocaciones folder exists, and missing or ambiguous destinations never create folders',async()=>{for(const name of ['03 - COLOCACIÓN','3 colocacion','03 – Colocaciones']){const d=driveMock({folderNames:['Colocaciones',name]});assert.equal(await d.client.folder('OTfolder'),'Colfolder');assert.equal(d.folders(),0);}const legacy=driveMock({folderNames:['Colocaciones']});await assert.rejects(legacy.client.folder('OTfolder'),/No se encontró/);assert.equal(legacy.folders(),0);const duplicate=driveMock({folderNames:['03 - COLOCACIÓN','3 colocacion']});await assert.rejects(duplicate.client.folder('OTfolder'),/varias/);assert.equal(duplicate.folders(),0);});
test('the close screen accepts explicit final approval only after actions and photos are complete, and records who approved it',async()=>{
 const source=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8'),start=source.indexOf('  async function submit('),end=source.indexOf('  function downloadCalendar(',start),o=fixture(),w={},errors=[],fields={fecha:'2026-10-12',resultado:'Cliente conforme'};o.colocacionesGestion.acciones={};o.colocacionesGestion.preparacion.fotos={estado:'Listo',url:P.folderURL('Colfolder')};o.sectores={produccion:{estado:'En proceso'}};
 vm.runInNewContext(source.slice(start,end)+'\nwindow.closeTest=submit;',{window:w,state:{id:'obra',busy:false},blockers:()=>[],FormData:class{get(k){return fields[k]}},obra:()=>o,stamp:()=> '2026-10-12T15:00:00Z',actor:()=> 'Operador',db:()=>({}),mutate:async(id,fn)=>apply(o,fn(o)),pending:x=>Object.values(x.colocacionesGestion.acciones).filter(a=>a.estado==='Pendiente'),data:x=>x.colocacionesGestion,isoDate:x=>x,uid:()=> 'event',fmtDate:x=>x,drawModal:()=>{},toast:()=>{},error:e=>errors.push(e.message)});
 const e={target:{dataset:{form:'closeWork'}},preventDefault(){}};await w.closeTest(e);assert.ok(errors.pop().includes('Revisado y conforme'));assert.equal(o.colocacionesGestion.preparacion.final.estado,'Pendiente');assert.equal(o.colocacionesGestion.cierre,undefined);
 fields.controlFinal='on';o.colocacionesGestion.preparacion.fotos.estado='Pendiente';await w.closeTest(e);assert.ok(errors.pop().includes('Faltan fotos'));assert.equal(o.colocacionesGestion.preparacion.final.estado,'Pendiente');
 o.colocacionesGestion.preparacion.fotos.estado='Listo';o.colocacionesGestion.acciones={a:{estado:'Pendiente'}};await w.closeTest(e);assert.ok(errors.pop().includes('acciones pendientes'));assert.equal(o.colocacionesGestion.cierre,undefined);
 o.colocacionesGestion.acciones={};await w.closeTest(e);assert.equal(errors.length,0);assert.equal(o.colocacionesGestion.cierre.cerrada,true);assert.equal(o.colocacionesGestion.preparacion.final.aprobadoPor,'Operador');assert.equal(o.colocacionesGestion.preparacion.final.detalle,'Cliente conforme');assert.equal(o.sectores.produccion.estado,'En proceso');
});
