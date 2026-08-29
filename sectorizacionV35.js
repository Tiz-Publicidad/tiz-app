// TIZ V35 compatibility loader — Production Full OT V7 preview branch
(()=>{
  'use strict';
  function load(src, done){
    const s=document.createElement('script');s.src=src;s.onload=()=>done&&done();s.onerror=()=>console.error('[TIZ] No se pudo cargar',src);document.head.appendChild(s);
  }
  load('sectorizacionV35Base.js?v=TIZ-V35-7-BASE-20260817',()=>{
    load('produccionCopilotoV1.js?v=TIZ-PROD-COPILOTO-V3-STABLE-20260829-2',()=>{
      load('produccionOperativaV4.js?v=TIZ-PROD-OPERATIVA-V4-20260829-1',()=>{
        load('produccionDashboardV5.js?v=TIZ-PROD-DASHBOARD-V5-20260829-1',()=>{
          load('produccionFichaV6.js?v=TIZ-PROD-FICHA-V6-20260829-1',()=>{
            load('produccionFichaCompletaV7.js?v=TIZ-PROD-FICHA-COMPLETA-V7-20260829-1');
          });
        });
      });
    });
  });
})();