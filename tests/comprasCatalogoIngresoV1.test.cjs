'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ING=require('../comprasIngresoCoreV1');
const source=fs.readFileSync(path.join(__dirname,'../compras.js'),'utf8');
function node(){return {value:'',innerHTML:'',textContent:'',children:[],style:{},dataset:{},classList:{open:false,add(){this.open=true;},remove(){this.open=false;}},focus(){this.focused=true;},addEventListener(){},append(x){this.children.push(x);},replaceChildren(){this.children=[];},querySelectorAll(){return [];}};}
function fixture(){
 const fields=Object.fromEntries(['.i-original','.i-desc','.i-code','.i-family','.i-subfamily','.i-unit','.i-qty','.i-price','.cp-item-match'].map(k=>[k,node()]));
 fields['.i-original'].value='Perfil nro 80 Blanco - 10 t x 6 mts';fields['.i-desc'].value=fields['.i-original'].value;fields['.i-qty'].value='10';fields['.i-price'].value='123.45';
 const row={dataset:{providerCode:'80'},querySelector:s=>fields[s]},elements=Object.fromEntries(['cp-catalog-create','cp-catalog-query','cp-catalog-family','cp-catalog-count','cp-catalog-results'].map(id=>[id,node()])),messages=[],created=[];
 const article={id:'perfil-j',codigo:'000321',descripcion:'Perfil J de aluminio blanco',familia:'Hierros',subfamilia:'Aluminio',unidad:'UNID'};
 const context={window:{},ING,C:{articulos:[article],compras:[]},cpIngreso:{confirmed:true,providerId:'proveedor',reviewed:'revisada'},cpIngresoRows:()=>[row],cpRefreshIngreso(){},cpOpenNewIngresoArticle:r=>created.push(r),toast:m=>messages.push(m),esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),document:{createElement:node,getElementById:id=>elements[id],body:{append(el){elements[el.id]=el;}}}};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function applyArticleToRow('),source.indexOf('function matchRowArticle('))+source.slice(source.indexOf('function cpPrepareIngresoRow('),source.indexOf('let cpArticleEditor=')),context);
 return {context,row,fields,elements,article,messages,created};
}
test('el renglón ofrece sugerencias, búsqueda manual y alta, incluso sin coincidencias',()=>{
 const f=fixture();f.context.cpPrepareIngresoRow(f.row);
 let buttons=f.fields['.cp-item-match'].children;assert.ok(buttons.some(b=>b.textContent==='Buscar en catálogo y vincular'));assert.ok(buttons.some(b=>b.textContent==='+ Crear nuevo insumo'));
 f.fields['.i-desc'].value='Perfil J de aluminio blanco';f.context.cpPrepareIngresoRow(f.row);buttons=f.fields['.cp-item-match'].children;
 assert.ok(buttons.some(b=>b.textContent.startsWith('Usar 000321')));assert.ok(buttons.some(b=>b.textContent==='Buscar en catálogo y vincular'));assert.equal(f.row.dataset.confirmed,'');
});
test('busca todo el catálogo por palabras en cualquier orden, código, familia y J o jota',()=>{
 const f=fixture(),articles=[f.article,{id:'otro',codigo:'000120',descripcion:'Perfil jota negro',familia:'Hierros',subfamilia:'Aluminio'},{id:'tornillo',codigo:'000040',descripcion:'Tornillo',familia:'Ferretería'}];
 const ids=(q,family='')=>Array.from(f.context.cpCatalogMatches(articles,q,family),a=>a.id);
 assert.deepEqual(ids('aluminio jota blanco'),['perfil-j']);assert.deepEqual(ids('perfil j'),['otro','perfil-j']);assert.deepEqual(ids('000321'),['perfil-j']);assert.deepEqual(ids('tornillo','ferreteria'),['tornillo']);assert.deepEqual(ids('tornillo','Hierros'),[]);assert.equal(ids('').length,3);
});
test('abrir y cancelar conserva el vínculo anterior y crear sigue siendo una alternativa',()=>{
 const f=fixture();f.row.dataset.articleId='anterior';f.row.dataset.confirmed='1';f.context.window.cpOpenCatalogoIngreso(f.row);
 assert.match(f.elements['cp-catalog-results'].innerHTML,/Perfil J de aluminio blanco/);assert.equal(f.row.dataset.articleId,'anterior');
 f.context.window.cpCloseCatalogoIngreso();assert.equal(f.row.dataset.articleId,'anterior');assert.equal(f.row.dataset.confirmed,'1');assert.equal(f.context.cpIngreso.reviewed,'revisada');
 f.context.window.cpOpenCatalogoIngreso(f.row);f.elements['cp-catalog-create'].onclick();assert.equal(f.created[0],f.row);assert.equal(f.row.dataset.articleId,'anterior');
});
test('vincular usa el artículo existente y conserva descripción de factura, código del proveedor, cantidades y precio',()=>{
 const f=fixture();f.context.window.cpOpenCatalogoIngreso(f.row);f.context.window.cpLinkCatalogoIngreso('perfil-j');
 assert.equal(f.row.dataset.articleId,'perfil-j');assert.equal(f.row.dataset.confirmed,'1');assert.equal(f.fields['.i-desc'].value,f.article.descripcion);assert.equal(f.fields['.i-code'].value,'000321');
 assert.equal(f.fields['.i-original'].value,'Perfil nro 80 Blanco - 10 t x 6 mts');assert.equal(f.row.dataset.providerCode,'80');assert.equal(f.fields['.i-qty'].value,'10');assert.equal(f.fields['.i-price'].value,'123.45');assert.equal(f.context.C.articulos.length,1);assert.equal(f.context.cpIngreso.reviewed,'');assert.equal(f.elements['cp-modal-catalogo-ingreso'].classList.open,false);
});
test('no vincula si cambió el proveedor o desapareció el artículo mientras se elegía',()=>{
 const f=fixture();f.context.window.cpOpenCatalogoIngreso(f.row);f.context.C.articulos=[];f.context.window.cpLinkCatalogoIngreso('perfil-j');assert.equal(f.row.dataset.articleId,undefined);assert.match(f.messages.at(-1),/ya no está disponible/);
 f.context.C.articulos=[f.article];f.context.cpIngreso.providerId='otro';f.context.window.cpLinkCatalogoIngreso('perfil-j');assert.equal(f.row.dataset.articleId,undefined);assert.match(f.messages.at(-1),/compra cambió/);
});

