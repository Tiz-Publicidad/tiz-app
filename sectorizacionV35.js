// TIZ V35 compatibility loader — Production Dashboard V5 preview branch
// Keep the existing sectorization implementation intact, then layer production control modules.
(()=>{
  'use strict';
  function load(src, done){
    const s=document.createElement('script');
    s.src=src;
    s.onload=()=>done&&done();
    s.onerror=()=>console.error('[TIZ] No se pudo cargar',src);
    document.head.appendChild(s);
  }
  load('sectorizacionV35Base.js?v=TIZ-V35-7-BASE-20260817',()=>{
    load('produccionCopilotoV1.js?v=TIZ-PROD-COPILOTO-V3-20260829-1',()=>{
      load('produccionOperativaV4.js?v=TIZ-PROD-OPERATIVA-V4-20260829-1',()=>{
        load('produccionDashboardV5.js?v=TIZ-PROD-DASHBOARD-V5-20260829-1');
      });
    });
  });
})();
