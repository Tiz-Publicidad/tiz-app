'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../compras.js'),'utf8');
function node(){return {value:'',listeners:{},children:[],addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);},append(x){this.children.push(x);},replaceChildren(){this.children=[];}};}
function rowFixture(){const fields=Object.fromEntries(['.i-original','.i-desc','.i-code','.i-unit','.i-family','.i-subfamily','.cp-item-match','[data-edit-linked-article]'].map(k=>[k,node()]));return {dataset:{},fields,querySelector:s=>fields[s]};}
test('completar subfamilia conserva el insumo y obliga a revisar otra vez; cambiar identidad lo desvincula',()=>{
 const row=rowFixture(),context={cpIngreso:{reviewed:'revisada'},cpRefreshIngreso(){},ING:{articleSuggestions:()=>[]},C:{articulos:[],compras:[]},document:{createElement:node}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function cpPrepareIngresoRow('),source.indexOf('function cpConfirmIngresoArticle(')),context);
 context.cpPrepareIngresoRow(row);row.dataset.articleId='existente';row.dataset.confirmed='1';context.cpIngreso.reviewed='revisada';
 row.fields['.i-subfamily'].value='2 mm';for(const fn of row.fields['.i-subfamily'].listeners.input)fn();
 assert.equal(row.dataset.articleId,'existente');assert.equal(row.dataset.confirmed,'1');assert.equal(context.cpIngreso.reviewed,'');assert.equal(row.fields['[data-edit-linked-article]'].textContent,'Guardar datos del insumo');
 for(const fn of row.fields['.i-desc'].listeners.input)fn();assert.equal(row.dataset.articleId,'');assert.equal(row.dataset.confirmed,'');
});
test('editar actualiza el mismo documento y permite reintentar una falla sin cerrar el editor',async()=>{
 const inputs=Object.fromEntries(Object.entries({desc:'Acrílico negro 2 mm',unit:'PLACA',family:'Acrílicos',subfamily:'2 mm',control:'estrategico',min:'0',error:'',save:'',cancel:''}).map(([k,value])=>['cp-edit-'+k,{value}]));
 const writes=[],existing={id:'a',codigo:'000117',descripcion:'Acrílico negro 2 mm',subfamilia:'',unidad:'PLACA'};let fail=true,closed=false;
 const context={window:{},C:{articulos:[existing]},document:{getElementById:id=>inputs[id]||{classList:{remove(){closed=true;}}},querySelectorAll:()=>[]},ING:{norm:s=>s.toLowerCase()},db:{},doc:(_db,collection,id)=>({collection,id}),serverTimestamp:()=>null,updateDoc:async(ref,data)=>{if(fail)throw Error('Sin conexión');writes.push({ref,data});},refreshCatalogDatalist(){},cpRenderArticleRows(){},calcTotals(){},toast(){}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('let cpArticleEditor='),source.indexOf('const cpAddItemLegacy='))+'\ncpArticleEditor={id:"a"};',context);
 await context.window.cpSaveEditArticulo();assert.match(inputs['cp-edit-error'].textContent,/Sin conexión/);assert.equal(closed,false);assert.equal(context.C.articulos[0].subfamilia,'');
 fail=false;await context.window.cpSaveEditArticulo();assert.equal(writes.length,1);assert.equal(writes[0].ref.collection,'articulosCompra');assert.equal(writes[0].ref.id,'a');assert.equal(writes[0].data.subfamilia,'2 mm');assert.equal(context.C.articulos.length,1);assert.equal(context.C.articulos[0].codigo,'000117');assert.equal(closed,true);
});
