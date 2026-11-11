/* Aplica el mismo criterio a pantallas antiguas y modernas, sin borrar documentos. */
(()=>{'use strict';
 const V=window.TIZVigenciaComercialV1;if(!V)return;
 function wrap(target,key){const original=target?.[key];if(typeof original!=='function'||original.__commercialGate)return;function guarded(){const db=window.DB,full=db?.obras;if(!Array.isArray(full))return original.apply(this,arguments);const saved={obras:full};db.obras=full.filter(w=>V.visible(w));for(const name of ['checklists','calidad','tareas'])if(Array.isArray(db[name])){saved[name]=db[name];db[name]=db[name].filter(r=>V.relatedVisible(r,full));}try{return original.apply(this,arguments)}finally{for(const [name,value]of Object.entries(saved))db[name]=value;}}guarded.__commercialGate=true;target[key]=guarded;}
 function install(){for(const name of ['refreshCurrent','renderDashboard','renderObras','renderSemana','renderProduccion','renderColocaciones','renderDiseno','renderAlertas','renderAlertasV58','renderCobranzas'])wrap(window,name);for(const name of ['TIZCalidadV1','TIZColocacionesUIV128','TIZOperacionesV1'])wrap(window[name],'render');}
 window.TIZAplicarVigenciaComercialV1=install;install();document.addEventListener('DOMContentLoaded',install);setInterval(install,2000);
})();
