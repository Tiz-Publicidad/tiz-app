// TIZ V97 - unifica Gestiones dentro de Por cobrar sin polling ni rerenders.
(function(){
  'use strict';
  function tabs(){return [...document.querySelectorAll('#page-cobranzas .page-tabs .page-tab')];}
  function porCobrarBtn(){return tabs().find(b=>/por cobrar/i.test(b.textContent||''));}
  function gestionesBtn(){return tabs().find(b=>/gestiones/i.test(b.textContent||''));}
  function limpiarTabs(){const g=gestionesBtn();if(g)g.style.display='none';}
  function activarVisualPorCobrar(){const p=porCobrarBtn();tabs().forEach(b=>b.classList.remove('active'));if(p)p.classList.add('active');}
  function instalar(){
    limpiarTabs();
    if(typeof window.setCobTab!=='function'||window.setCobTab.__tizV97)return;
    const old=window.setCobTab;
    const wrapped=function(tab,button){
      if(tab==='cobrar'||tab==='gestiones'){
        const p=porCobrarBtn()||button;
        const r=old.call(this,'gestiones',p);
        limpiarTabs();activarVisualPorCobrar();
        return r;
      }
      const r=old.apply(this,arguments);limpiarTabs();return r;
    };
    wrapped.__tizV97=true;window.setCobTab=wrapped;
    if(window.cobTab==='gestiones')activarVisualPorCobrar();
  }
  instalar();
  window.addEventListener('load',instalar,{once:true});
})();
