/* Reglas de ingreso de comprobantes. No ejecuta instrucciones del documento. */
(function(root){
'use strict';
const text=v=>typeof v==='string'||typeof v==='number'?String(v).trim():'';
const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const digits=v=>text(v).replace(/\D/g,'');
function supplier(data={}){
 const p=typeof data.proveedor==='object'&&data.proveedor?data.proveedor:{};
 const q=data.datosProveedor||data.proveedorDatos||{};
 const pick=(...xs)=>xs.map(text).find(Boolean)||'';
 return {razonSocial:pick(p.razonSocial,q.razonSocial,data.razonSocialProveedor,p.nombre,q.nombre,typeof data.proveedor==='string'?data.proveedor:''),nombre:pick(p.nombreComercial,p.nombre,p.razonSocial,q.nombre,q.razonSocial,data.razonSocialProveedor,typeof data.proveedor==='string'?data.proveedor:''),cuit:digits(p.cuit||q.cuit||data.cuitProveedor||data.proveedorCuit),domicilio:pick(p.domicilio,p.direccion,q.domicilio,q.direccion,data.domicilioProveedor),contacto:pick(p.contacto,p.vendedor,q.contacto,q.vendedor,data.contactoProveedor),telefono:pick(p.telefono,q.telefono,data.telefonoProveedor),email:pick(p.email,q.email,data.emailProveedor)};
}
function supplierMatches(p,providers){
 const cuit=digits(p.cuit),name=norm(p.nombre);
 const exact=cuit.length===11?providers.filter(x=>digits(x.cuit)===cuit):[];
 if(exact.length)return {type:exact.length===1?'cuit':'ambiguous',candidates:exact};
 const names=name?providers.filter(x=>[x.nombreComercial,x.nombre,x.razonSocial,...(x.nombresAnteriores||[])].some(n=>norm(n)===name)&&(!cuit||!digits(x.cuit)||cuit===digits(x.cuit))):[];
 return {type:names.length===1?'name':names.length?'ambiguous':'missing',candidates:names};
}
function pendingSupplier(p){return ['cuit','domicilio','contacto','telefono','email'].filter(k=>!text(p[k]||(k==='telefono'?p.cel:'')));}
function score(a,b){
 const x=norm(a),y=norm(b);if(!x||!y)return 0;if(x===y)return 1;
 const ax=new Set(x.split(' ')),by=new Set(y.split(' '));const n=[...ax].filter(t=>by.has(t)).length;
 return n/new Set([...ax,...by]).size;
}
function articleSuggestions(line,articles,purchases=[],providerId=''){
 const original=norm(line.descripcionOriginal||line.descripcion),code=text(line.codigoProveedor);
 const remembered=new Set();
 if(providerId)for(const c of purchases){if(c.proveedorId!==providerId)continue;for(const i of c.items||[]){if(i.vinculacionConfirmada&&norm(i.descripcionOriginal)===original&&(!code||text(i.codigoProveedor)===code))remembered.add(i.articuloId);}}
 return articles.map(article=>{
  const learned=remembered.size===1&&remembered.has(article.id);
  return {article,score:learned?1:score(original,article.descripcion),reason:learned?'Vinculación confirmada en una compra anterior':'Descripción del catálogo'};
 }).filter(x=>x.score>=.25).sort((a,b)=>b.score-a.score).slice(0,4);
}
function nextCode(articles,base=[],last=0){return String(Math.max(Number(last)||0,...[...articles,...base].map(a=>/^\d+$/.test(text(a.codigo))?Number(a.codigo):0))+1).padStart(6,'0');}
const api={text,norm,digits,supplier,supplierMatches,pendingSupplier,articleSuggestions,nextCode};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TIZComprasIngresoCoreV1=api;
})(typeof window!=='undefined'?window:globalThis);
