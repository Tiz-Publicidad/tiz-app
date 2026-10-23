'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),NEW='giancarlo.pareja@tizpublicidad.com',INFO='info@tizpublicidad.com';
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function fn(file,name,context={}){const s=read(file),start=s.indexOf('async function '+name+'(')>=0?s.indexOf('async function '+name+'('):s.indexOf('function '+name+'(');assert.ok(start>=0,file+' '+name);const line=s.slice(start).split('\n')[0],code=line.endsWith('}')?line:s.slice(start,s.indexOf('\n}',start)+2);return vm.runInNewContext(code+'\n'+name,context);}
function fiscal(file,name,emails){const secret={value:()=>emails},admin={auth:()=>({verifyIdToken:async token=>({email:token})})};return fn(file,name,{admin,allowed:secret,allowedEmails:secret});}
test('la pantalla real reconoce a Giancarlo como administrador y vendedor sin cambiar info',()=>{
 const html=read('index.html'),permission=html.slice(html.indexOf('const ADMIN_EMAIL ='),html.indexOf('const SECTOR_COLORS ='));const config=vm.runInNewContext(permission+'\n({admins:ADMIN_EMAILS,sectors:USER_SECTOR_MAP})');
 assert.ok(config.admins.has(NEW));assert.ok(config.admins.has(INFO));assert.equal(config.sectors[NEW],'Ventas');assert.equal(config.sectors[INFO],'Ventas');assert.equal(config.admins.has('pablo.aciar@tizpublicidad.com'),false);
 assert.match(html,/vendedor: user.email === 'giancarlo.pareja@tizpublicidad.com' \? 'G'/);assert.match(html,/<option value="G">G · Giancarlo<\/option>/);
 const window={currentUser:{email:NEW,isAdmin:true,sector:'Ventas'}};vm.runInNewContext(html.slice(html.indexOf('window.canViewOperaciones ='),html.indexOf('// ============================================================',html.indexOf('window.canAnnotateSector ='))),{window});
 assert.ok(window.canViewOperaciones());assert.ok(window.canViewIndicadores());for(const sector of ['Ventas','Producción','Compras','Diseño','Colocaciones','Calidad'])assert.ok(window.canAnnotateSector(sector));
});
test('los siete accesos fiscales heredan el permiso de info, deniegan extraños y siguen respetando la lista autorizada',async()=>{
 for(const [file,name] of [['functions/index.js','requireAdmin'],['functions/facturacionIntegralApiV83.js','operator'],['functions/facturacionDriveRetryV83.js','operator'],['functions/facturacionEntregaV84.js','requireAdmin'],['functions/facturacionRecuperarV86.js','operator'],['functions/arcaPadronA5V125.js','operator'],['functions/arcaProduccionGeneral.js','requireAdmin']]){
 const op=fiscal(file,name,INFO),req=email=>({get:()=> 'Bearer '+email});assert.ok(await op(req(NEW)),file);assert.ok(await op(req(INFO)),file);
 await assert.rejects(op(req('otro@tizpublicidad.com')),e=>e.status===403,file);await assert.rejects(op({get:()=>''}),e=>e.status===401,file);
 await assert.rejects(fiscal(file,name,'otro@example.com')(req(NEW)),e=>e.status===403,file);
 }
});
test('análisis, operaciones y Colocaciones admiten el correo nuevo y mantienen los límites de los demás puestos',async()=>{
 const C=require('../functions/analisisPreliminarCoreV1'),u=C.operator(NEW);assert.equal(u.isAdmin,true);assert.equal(u.sector,'ventas');assert.equal(C.operator(INFO).isAdmin,true);assert.equal(C.operator('pablo.aciar@tizpublicidad.com').isAdmin,false);
 const O=require('../functions/operacionesV1');assert.equal(O.authorize(NEW),NEW);assert.throws(()=>O.authorize('otro@tizpublicidad.com'));
 const admin={auth:()=>({verifyIdToken:async()=>({email:NEW})})},OPERATORS=new Set([INFO,NEW]),text=v=>String(v||'').trim();
 assert.equal(await fn('functions/colocacionesGeneralV129.js','operator',{admin,OPERATORS,C:{text},fail:(message,status)=>Object.assign(Error(message),{status})})({get:()=> 'Bearer token'}),NEW);
});
test('Calidad asigna Ventas y permisos de administración a Giancarlo',async()=>{
 const file='functions/calidadChecklistApiV2.js',source=read(file),line=source.split('\n').find(l=>l.startsWith('const USERS=')),USERS=vm.runInNewContext(line+'\nUSERS');const operator=fn(file,'operator',{USERS,admin:{auth:()=>({verifyIdToken:async token=>({email:token})})},C:{norm:v=>String(v||'').toLowerCase()},fail:(m,s)=>Object.assign(Error(m),{status:s})});
 const u=await operator({get:()=> 'Bearer '+NEW});assert.equal(u.isAdmin,true);assert.equal(u.sector,'Ventas');assert.equal(u.restrictedChecklists,false);
 const p=await operator({get:()=> 'Bearer pablo.aciar@tizpublicidad.com'});assert.equal(p.isAdmin,false);
});
test('estadísticas económicas permiten Giancarlo y rechazan a otros antes de consultar la planilla',async()=>{
 let calls=0;const sheets={spreadsheets:{values:{get:async()=>{calls++;throw Error('LECTURA_AUTORIZADA');}}}};const S=require('../functions/estadisticaSourceV1');
 await assert.rejects(S.load(sheets,NEW),/LECTURA_AUTORIZADA/);assert.equal(calls,1);await assert.rejects(S.load(sheets,'pablo.aciar@tizpublicidad.com'),e=>e.status===403);assert.equal(calls,1);
});
test('Firestore agrega sólo el usuario solicitado; el remitente de facturas continúa siendo info',()=>{
 const rules=read('firestore.rules');assert.ok(rules.includes('"'+NEW+'"'));assert.ok(rules.includes('"'+INFO+'"'));assert.ok(!rules.includes('email_verified == false'));assert.ok(!rules.includes('endsWith'));
 for(const file of ['functions/index.js','functions/facturacionEntregaV84.js']){assert.match(read(file),/emailUltimoRemitente["']?:\s*"info@tizpublicidad.com"/);assert.match(read(file),/remitente:\s*"info@tizpublicidad.com"/);}
});
