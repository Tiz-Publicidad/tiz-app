// TIZ V35 compatibility loader — Production Copilot V3 preview branch
// Keep the existing sectorization implementation intact, then layer the production control center.
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
    load('produccionCopilotoV1.js?v=TIZ-PROD-COPILOTO-V3-20260829-1');
  });
})();
