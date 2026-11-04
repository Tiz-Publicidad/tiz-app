'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ING=require('../comprasIngresoCoreV1');
const source=fs.readFileSync(path.join(__dirname,'../compras.js'),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
function element(){const fields={};return {value:'',style:{},children:[],classList:{remove(){}},focus(){this.focused=true;},append(row){row.parent=this;this.children.push(row);},replaceChildren(){this.children=[];},remove(){this.parent.children=this.parent.children.filter(c=>c!==this);},addEventListener(){},querySelector(s){return fields[s]??=(element());}};}
function fixture(){
 const elements=Object.fromEntries(['id','nombre','razon','cuit','domicilio','contacto','tel','email','cond','dias','notas','contactos'].map(k=>['cp-prov-'+k,element()]));elements['cp-proveedor']=element();elements['cp-modal-compra']=element();
 const writes=[],messages=[],provider={id:'p',nombre:'Proveedor',cuit:'30123456789',domicilio:'Calle',contacto:'Ana',telefono:'111',email:'ana@example.test'};
 const context={window:{},C:{proveedores:[provider]},ING,cpIngreso:null,document:{getElementById:id=>elements[id],querySelectorAll:()=>elements['cp-prov-contactos'].children,createElement:element},num:v=>Number(v)||0,uniqueSorted:a=>[...new Set(a.filter(Boolean))],db:{},doc:(_db,collection,id)=>({collection,id}),serverTimestamp:()=>null,updateDoc:async(ref,data)=>writes.push({ref,data}),toast:m=>messages.push(m),render(){},cpConfirmIngresoProvider(){},cpClearProveedorLegacy(){},cpMarkProviderPending(){}};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function cpProviderContacts('),source.indexOf('function cpMarkProviderPending('))+source.slice(source.indexOf('let cpProviderSaving='),source.indexOf('function cpPrepareIngresoRow(')),context);
 context.window.cpClearProveedor=()=>{};
 return {context,elements,writes,messages,provider};
}
test('abre fichas antiguas sin perder el contacto principal y permite agregar varios',()=>{
 const f=fixture();f.context.cpFillProvider(f.provider);assert.equal(f.elements['cp-prov-contacto'].value,'Ana');assert.equal(f.elements['cp-prov-contactos'].children.length,0);
 f.context.window.cpAddProviderContact({nombre:'Luis',telefono:'222',email:'luis@example.test'});f.context.window.cpAddProviderContact({nombre:'Administración',email:'admin@example.test'});
 const contacts=plain(f.context.cpReadProviderContacts());assert.equal(contacts.length,3);assert.equal(contacts[0].nombre,'Ana');assert.equal(contacts[1].telefono,'222');assert.equal(contacts[2].nombre,'Administración');
});
test('guardar agrega contactos en la misma ficha y al reabrir no duplica el principal',async()=>{
 const f=fixture();f.context.cpFillProvider(f.provider);f.context.window.cpAddProviderContact({nombre:'Luis',telefono:'222'});await f.context.window.cpSaveProveedor();
 assert.equal(f.writes.length,1);assert.equal(f.writes[0].ref.collection,'proveedoresCompra');assert.equal(f.writes[0].ref.id,'p');assert.equal(f.writes[0].data.contactos.length,2);assert.equal(f.context.C.proveedores.length,1);assert.equal(f.writes[0].data.contacto,'Ana');
 f.context.cpFillProvider(f.context.C.proveedores[0]);assert.equal(f.elements['cp-prov-contactos'].children.length,1);assert.equal(f.context.cpReadProviderContacts().length,2);
});
test('borradores conservan contactos parciales; quitar una fila no escribe antes de guardar',()=>{
 const f=fixture();f.context.cpFillProvider(f.provider);f.context.cpIngreso={editingProvider:true};f.context.window.cpAddProviderContact({nombre:'Luis'});
 assert.equal(f.context.cpIngreso.providerDraft.contactos.length,2);const row=f.elements['cp-prov-contactos'].children[0];row.querySelector('[data-remove-contact]').onclick();assert.equal(f.context.cpIngreso.providerDraft.contactos.length,1);assert.equal(f.writes.length,0);
 f.context.cpFillProvider(f.context.cpIngreso.providerDraft);assert.equal(f.elements['cp-prov-contacto'].value,'Ana');
});
test('una falla de guardado conserva todos los contactos y permite reintentar',async()=>{
 const f=fixture();f.context.cpFillProvider(f.provider);f.context.window.cpAddProviderContact({nombre:'Luis'});const update=f.context.updateDoc;f.context.updateDoc=async()=>{throw Error('Sin conexión');};
 await f.context.window.cpSaveProveedor();assert.equal(f.elements['cp-prov-contactos'].children.length,1);assert.equal(f.context.C.proveedores[0].contactos,undefined);assert.match(f.messages.at(-1),/Sin conexión/);
 f.context.updateDoc=update;await f.context.window.cpSaveProveedor();assert.equal(f.writes.length,1);assert.equal(f.writes[0].data.contactos.length,2);
});
test('guardar contactos del mismo proveedor conserva los insumos vinculados; cambiar de proveedor los revisa',()=>{
 const f=fixture(),row={dataset:{articleId:'insumo',confirmed:'1'}};f.context.cpIngreso={confirmed:true,providerId:'p',supplier:{},reviewed:'lista'};f.context.cpIngresoRows=()=>[row];f.context.cpPrepareIngresoRow=tr=>{tr.dataset.articleId='';tr.dataset.confirmed='';};f.context.cpRefreshIngreso=()=>{};
 vm.runInContext(source.slice(source.indexOf('function cpConfirmIngresoProvider('),source.indexOf('function cpOpenIngresoProvider(')),f.context);
 f.context.cpConfirmIngresoProvider(f.provider);assert.equal(row.dataset.articleId,'insumo');assert.equal(row.dataset.confirmed,'1');assert.equal(f.context.cpIngreso.reviewed,'');
 f.context.cpConfirmIngresoProvider({...f.provider,id:'otro'});assert.equal(row.dataset.articleId,'');assert.equal(row.dataset.confirmed,'');
});
test('el acceso desde la factura abre la ficha y agrega una fila sin borrar el contacto existente',()=>{
 const f=fixture();f.context.cpIngreso={confirmed:true,providerId:'p',supplier:{}};f.context.window.cpTab=()=>{};f.context.cpShowProviderReturn=()=>{};
 vm.runInContext(source.slice(source.indexOf('function cpOpenIngresoProvider('),source.indexOf('function cpShowProviderReturn(')),f.context);
 f.context.cpOpenIngresoProvider(f.provider,true);assert.equal(f.elements['cp-prov-contacto'].value,'Ana');assert.equal(f.elements['cp-prov-contactos'].children.length,1);assert.equal(f.elements['cp-prov-contactos'].children[0].querySelector('.cp-contact-name').focused,true);assert.equal(f.context.cpIngreso.providerDraft.id,'p');
});

