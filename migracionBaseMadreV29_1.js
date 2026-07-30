// TIZ ERP V29.1 — Migración segura de Base Madre
// No se ejecuta automáticamente. Abrir la consola del ERP y ejecutar primero:
//   await previsualizarMigracionBaseMadreV291()
// Luego, para confirmar:
//   await ejecutarMigracionBaseMadreV291()
(function(){
  const norm = v => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const otKey = v => { const d=String(v??'').replace(/\D/g,''); return d ? String(parseInt(d,10)) : ''; };
  const keyText = o => `${norm(o.descripcion||o.desc)}|${norm(o.cliente)}`;
  const source = () => Array.isArray(window.OBRAS_MADRE_V291) ? window.OBRAS_MADRE_V291 : [];
  const current = () => Array.isArray(window.DB?.obras) ? window.DB.obras : [];
  function mergeFields(actual,madre){
    const protectedFields=['id','driveFolderId','driveFolderUrl','driveSyncedAt','otSheetId','otSheetUrl','cotizacionExcelId','cotizacionExcelUrl','cotizacionPdfId','cotizacionPdfUrl','checklist','notas','alertasDetectadas','createdAt','_ts'];
    const next={...actual,
      fecha:madre.fecha||actual.fecha||'', semana:madre.semana||actual.semana||'', ot:madre.ot||actual.ot||'',
      desc:madre.descripcion||actual.desc||'', descripcion:madre.descripcion||actual.descripcion||'', arquitecto:madre.arquitecto||actual.arquitecto||'',
      cliente:madre.cliente||actual.cliente||'', vendedor:actual.vendedor||madre.vendedor||'G',
      neto:Number(madre.precioVentaNeto||actual.neto||0), bruto:Number(madre.precioVentaBruto||actual.bruto||0), gastos:Number(madre.gastos||actual.gastos||0),
      sector:actual.sector||madre.sector||'Producción', estado:madre.estado||actual.estado||'',
      fprod_c:madre.produccion?.fechaCompromiso||actual.fprod_c||'', fprod_r:madre.produccion?.fechaReal||actual.fprod_r||'',
      fcol_c:madre.colocacion?.fechaCompromiso||actual.fcol_c||'', fcol_r:madre.colocacion?.fechaReal||actual.fcol_r||'',
      oc:madre.oc||actual.oc||'', op:madre.op||actual.op||'', ocOp:madre.ocOp||actual.ocOp||'',
      fechaFactura:madre.fechaFactura||actual.fechaFactura||'', fFactura:madre.fFactura||actual.fFactura||'',
      nroFactura:madre.nroFactura||actual.nroFactura||'', numeroFactura:madre.numeroFactura||actual.numeroFactura||'',
      estadoCobranza:madre.estadoCobranza||actual.estadoCobranza||'', comentarios:madre.comentarios||actual.comentarios||'',
      prod:madre.prod||actual.prod||'', col:madre.col||actual.col||'', extracostos:Number(madre.extracostos||actual.extracostos||0)
    };
    protectedFields.forEach(k=>{ if(actual[k]!==undefined) next[k]=actual[k]; });
    return next;
  }
  function plan(){
    const actuales=current(), madre=source();
    const byOt=new Map(), byText=new Map();
    actuales.forEach(o=>{ const k=otKey(o.ot); if(k&&!byOt.has(k))byOt.set(k,o); if(!byText.has(keyText(o)))byText.set(keyText(o),o); });
    const actualizar=[],crear=[];
    madre.forEach(m=>{ const a=(otKey(m.ot)&&byOt.get(otKey(m.ot)))||byText.get(keyText(m)); if(a) actualizar.push({actual:a,madre:m}); else crear.push(m); });
    const carpetasFaltantes=actuales.filter(o=>otKey(o.ot)&&!o.driveFolderUrl);
    return {totalMadre:madre.length,actuales:actuales.length,actualizar,crear,carpetasFaltantes};
  }
  window.previsualizarMigracionBaseMadreV291=async function(){
    const p=plan();
    const resumen={totalMadre:p.totalMadre,obrasActuales:p.actuales,obrasAActualizar:p.actualizar.length,obrasNuevas:p.crear.length,obrasSinEnlaceDrive:p.carpetasFaltantes.length};
    console.table(resumen); console.log('Nuevas:',p.crear); console.log('Sin enlace Drive:',p.carpetasFaltantes);
    return resumen;
  };
  window.ejecutarMigracionBaseMadreV291=async function(){
    if(!window.updateDoc_||!window.addDoc_) throw new Error('Firebase todavía no está listo. Recargá y volvé a intentar.');
    const p=plan();
    if(!confirm(`Actualizar ${p.actualizar.length} obras y crear ${p.crear.length} nuevas?\nLos enlaces de Drive existentes se conservarán.`)) return {cancelado:true};
    let actualizadas=0,nuevas=0,errores=[];
    for(const x of p.actualizar){ try{ const data=mergeFields(x.actual,x.madre); await window.updateDoc_('obras',x.actual.id,data); Object.assign(x.actual,data); actualizadas++; }catch(e){errores.push({ot:x.madre.ot,error:String(e?.message||e)});} }
    for(const m of p.crear){ try{ const data=mergeFields({},m); const ref=await window.addDoc_('obras',data); data.id=ref.id; window.DB.obras.push(data); nuevas++; }catch(e){errores.push({ot:m.ot,error:String(e?.message||e)});} }
    if(window.renderObras) window.renderObras();
    console.log({actualizadas,nuevas,errores});
    alert(`Base Madre actualizada.\nActualizadas: ${actualizadas}\nNuevas: ${nuevas}\nErrores: ${errores.length}\n\nLas carpetas Drive no se duplicaron ni se tocaron automáticamente.`);
    return {actualizadas,nuevas,errores};
  };
  window.sincronizarSoloCarpetasFaltantesV291=async function(){
    const faltantes=current().filter(o=>otKey(o.ot)&&!o.driveFolderUrl);
    if(!confirm(`Hay ${faltantes.length} obras sin enlace de Drive.\nSe buscará primero una carpeta existente por OT y solo se creará si no existe. ¿Continuar?`)) return {cancelado:true};
    let recuperadas=0,creadas=0,errores=[];
    for(const o of faltantes){
      try{
        const r=await window.syncToSheets({...o,estado:'Aprobado',firestoreId:o.id});
        if(!r?.driveFolderUrl) throw new Error(r?.error||'Sin enlace devuelto');
        const links={driveFolderId:r.folderId||r.driveFolderId||'',driveFolderUrl:r.driveFolderUrl,otSheetId:r.otSheetId||'',otSheetUrl:r.otSheetUrl||'',driveSyncedAt:new Date().toISOString()};
        await window.updateDoc_('obras',o.id,links); Object.assign(o,links);
        if(r.created) creadas++; else recuperadas++;
      }catch(e){errores.push({ot:o.ot,error:String(e?.message||e)});}
    }
    if(window.renderObras) window.renderObras();
    alert(`Drive finalizado.\nCarpetas recuperadas: ${recuperadas}\nCarpetas creadas: ${creadas}\nErrores: ${errores.length}`);
    return {recuperadas,creadas,errores};
  };
})();
