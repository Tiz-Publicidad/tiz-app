// TIZ Produccion V7 - version visible + sincronizacion estable de datos
(()=>{
'use strict';
const LABEL='PREVIEW · Producción V7 · Ficha completa OT · 29/08/2026';
window.__TIZ_PRODUCCION_VERSION_LABEL__=LABEL;
let lastFingerprint='';
function fingerprint(){
  const obras=window.DB?.obras||[];
  if(!obras.length)return 'empty';
  return obras.map(o=>{
    const p=(o.gestionSectores||{}).produccion||{};
    return [o.id,o.estado,p.estadoInterno,p.responsable,p.fechaFinPlan,(p.procesos||[]).length,p.actualizadoEn].join('|');
  }).join('~');
}
function applyLabel(){document.querySelectorAll('.tpc-mode').forEach(el=>el.textContent=LABEL)}
function sync(){
  applyLabel();
  if(window.currentPage!=='produccion')return;
  const fp=fingerprint();
  if(fp==='empty'||fp===lastFingerprint)return;
  lastFingerprint=fp;
  window.renderProduccionCopilotoV3?.();
  setTimeout(()=>window.renderProduccionDashboardV5?.(),0);
  setTimeout(applyLabel,0);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(sync,0));else setTimeout(sync,0);
setInterval(sync,750);
})();