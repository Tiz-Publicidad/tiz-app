/* Domicilio comercial congelado por presupuesto/revisión. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZPresupuestoEmisorV1=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const LEGACY=Object.freeze({version:'domicilio-anterior',direccion:'Av Pte Perón 3779 J C Paz'});
 const CURRENT=Object.freeze({version:'domicilio-20261030',direccion:'René Favaloro 4256, José C. Paz'});
 function forDocument(doc){const e=doc?.emisorComercial;return e&&typeof e.direccion==='string'&&e.direccion.trim()?{version:String(e.version||'personalizado'),direccion:e.direccion.trim().slice(0,200)}:{...LEGACY};}
 function forSave(existing){return existing?forDocument(existing):{...CURRENT};}
 return {LEGACY,CURRENT,forDocument,forSave};
});
