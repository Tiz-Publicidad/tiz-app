// TIZ Produccion V7 - identificador visible de preview
(()=>{
'use strict';
const LABEL='PREVIEW · Producción V7 · Ficha completa OT · 29/08/2026';
function apply(){
  document.querySelectorAll('.tpc-mode').forEach(el=>el.textContent=LABEL);
  // Oculta únicamente el badge legado de versión dentro del preview para evitar confusión.
  document.querySelectorAll('body *').forEach(el=>{
    if(el.children.length===0 && /TIZ V35\.6/i.test(el.textContent||'')){
      el.style.display='none';
    }
  });
}
window.__TIZ_PRODUCCION_VERSION_LABEL__=LABEL;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(apply,0));else setTimeout(apply,0);
const obs=new MutationObserver(apply);obs.observe(document.documentElement,{childList:true,subtree:true});
})();