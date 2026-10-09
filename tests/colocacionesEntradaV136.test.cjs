'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
test('la app define los permisos que consume el listado; lectura autenticada y edición según puesto',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const roles=html.slice(html.indexOf('window.canViewPage ='),html.indexOf('// AUTH SCREEN'));
 const ui=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8');
 const guards=ui.slice(ui.indexOf('  const canRead='),ui.indexOf('  const toast='));
 const window={currentUser:null},context={window};
 vm.runInNewContext(roles+'\n'+guards+'\nglobalThis.read=canRead;globalThis.write=canWrite;',context);
 assert.equal(context.read(),false);assert.equal(context.write(),false);
 for(const user of [{isAdmin:true,sector:'Ventas'},{isAdmin:false,sector:'Colocaciones'},{isAdmin:false,sector:'Compras'}]){window.currentUser=user;assert.equal(context.read(),true);assert.equal(context.write(),true);}
 window.currentUser={isAdmin:false,sector:'Ventas'};assert.equal(context.read(),true);assert.equal(context.write(),false);
 window.currentUser=null;assert.equal(context.read(),false);assert.equal(context.write(),false);
});
test('el dashboard de Compras cede la entrada a Colocaciones después de instalarse, incluso en callbacks demorados',()=>{
 const src=fs.readFileSync(path.join(root,'compras.js'),'utf8');
 const body=src.slice(src.indexOf('function renderColocacionesV27(){'),src.indexOf('  const host=',src.indexOf('function renderColocacionesV27(){')));
 let calls=0;const window={__TIZ_COLOCACIONES_V128__:true,renderColocacionesV128:()=>++calls};
 vm.runInNewContext(body+'throw new Error("No debe dibujar el dashboard viejo");}\nrenderColocacionesV27();renderColocacionesV27();',{window});
 assert.equal(calls,2);
});
test('la entrada cambia la versión de todos los archivos de Colocaciones y de Compras',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const file of ['compras.js','functions/colocacionesCoreV129.js','colocacionesGeneralUIV129.js','colocacionesV128.js'])assert.ok(html.includes('src="'+file+'?v=TIZ-COLOCACIONES-'+(file==='compras.js'?'V136':'V142')+'-20261009"'),file);
});
test('cada render oculta elementos heredados agregados después de crear el listado',()=>{
 const src=fs.readFileSync(path.join(root,'colocacionesV128.js'),'utf8');
 const start=src.indexOf('  function pageRoot()'),end=src.indexOf('\n',start);
 const node=()=>({classes:new Set(),classList:{add(c){this.owner.classes.add(c)}}});
 const r=node(),legacy=node(),late=node();for(const n of [r,legacy,late])n.classList.owner=n;
 const page={children:[legacy,r]},document={getElementById:id=>id==='page-colocaciones'?page:r};
 const context={document};vm.runInNewContext(src.slice(start,end)+'\nglobalThis.run=pageRoot;',context);
 assert.equal(context.run(),r);page.children.push(late);context.run();
 assert.ok(legacy.classes.has('c128-legacy'));assert.ok(late.classes.has('c128-legacy'));assert.ok(!r.classes.has('c128-legacy'));
});
