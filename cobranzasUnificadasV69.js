// TIZ V69 — unifica Gestiones dentro de Por cobrar
(function(){
  'use strict';

  function tabs(){return [...document.querySelectorAll('#page-cobranzas .page-tabs .page-tab')];}
  function porCobrarBtn(){return tabs().find(b=>/por cobrar/i.test(b.textContent||''));}
  function gestionesBtn(){return tabs().find(b=>/gestiones/i.test(b.textContent||''));}

  function limpiarTabs(){
    const g=gestionesBtn();
    if(g) g.style.display='none';
  }

  function activarVisualPorCobrar(){
    const p=porCobrarBtn();
    tabs().forEach(b=>b.classList.remove('active'));
    if(p) p.classList.add('active');
  }

  function instalar(){
    limpiarTabs();
    if(typeof window.setCobTab!=='function'||window.setCobTab.__tizV69)return false;
    const old=window.setCobTab;
    const wrapped=function(tab,button){
      if(tab==='cobrar'||tab==='gestiones'){
        const p=porCobrarBtn()||button;
        const r=old.call(this,'gestiones',p);
        setTimeout(()=>{limpiarTabs();activarVisualPorCobrar();},0);
        return r;
      }
      const r=old.apply(this,arguments);
      setTimeout(limpiarTabs,0);
      return r;
    };
    wrapped.__tizV69=true;
    window.setCobTab=wrapped;

    // Si el usuario estaba parado en Gestiones al cargar esta mejora,
    // dejamos la vista igual pero con Por cobrar como pestaña visible.
    if(window.cobTab==='gestiones') setTimeout(activarVisualPorCobrar,0);
    return true;
  }

  instalar();
  window.addEventListener('load',()=>{instalar();setTimeout(()=>{instalar();limpiarTabs();},300);setTimeout(()=>{instalar();limpiarTabs();},1200)});
  let n=0;const t=setInterval(()=>{instalar();limpiarTabs();if(++n>120)clearInterval(t)},250);
})();