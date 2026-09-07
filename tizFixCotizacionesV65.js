// TIZ V65 — CT Drive + cola de facturación + clientes del cotizador
(function(){
  'use strict';

  const DRIVE_WEBHOOK = window.TIZ_DRIVE_OT_WEBHOOK || 'https://script.google.com/macros/s/AKfycbx_Uy_ijUG38rht-m-Xp-y9Eou8WzoG4jepXi1GqJaHAknwQsQd-rQgYcQ1ucrAJPlK/exec';
  const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const num = v => Number(v) || 0;
  const digits = v => String(v ?? '').replace(/\D/g,'');
  const rev = v => String(v || '1.1').trim() || '1.1';
  const val = id => document.getElementById(id)?.value ?? '';

  function itemsFromBudget(p={}){
    const raw = Array.isArray(p.items) ? p.items : (Array.isArray(p.itemsCotizados) ? p.itemsCotizados : []);
    return raw.map(it=>{
      const cantidad = num(it.cant ?? it.cantidad ?? it.unidades ?? 1) || 1;
      const unitario = num(it.precio ?? it.unitario ?? it.precioUnitario);
      const subtotal = num(it.subtotal ?? it.total) || cantidad * unitario;
      return {desc:String(it.desc ?? it.descripcion ?? it.detalle ?? '').trim(),descripcion:String(it.descripcion ?? it.desc ?? it.detalle ?? '').trim(),cant:cantidad,cantidad,unidades:cantidad,precio:unitario,unitario,subtotal,observaciones:String(it.observaciones ?? '').trim()};
    }).filter(it=>it.descripcion || it.subtotal || it.unitario);
  }
  function totalBudget(p={}){ const explicit=num(p.importe||p.neto||p.total||p.totalItems); return explicit || itemsFromBudget(p).reduce((a,it)=>a+num(it.subtotal),0); }

  function jsonpDrive(payload, timeoutMs=45000){
    return new Promise((resolve,reject)=>{
      const cb='__tizDriveCbV65_'+Date.now()+'_'+Math.random().toString(36).slice(2), script=document.createElement('script'); let done=false;
      const cleanup=()=>{try{delete window[cb]}catch(_){window[cb]=undefined} script.remove();};
      const timer=setTimeout(()=>{if(done)return;done=true;cleanup();reject(new Error('Drive no respondió dentro del tiempo esperado'));},timeoutMs);
      window[cb]=data=>{if(done)return;done=true;clearTimeout(timer);cleanup();if(data?.ok===false)reject(new Error(data.error||'Drive rechazó la generación'));else resolve(data||{});};
      script.onerror=()=>{if(done)return;done=true;clearTimeout(timer);cleanup();reject(new Error('No se pudo conectar con Apps Script'));};
      script.src=DRIVE_WEBHOOK+'?callback='+encodeURIComponent(cb)+'&payload='+encodeURIComponent(JSON.stringify(payload)); document.head.appendChild(script);
    });
  }
  window.tizGuardarCotizacionDriveV65=jsonpDrive;

  async function persistDriveLinks(p,result){
    if(!p?.id||!result)return;
    const patch={cotizacionExcelId:result.cotizacionExcelId||'',cotizacionExcelUrl:result.cotizacionExcelUrl||'',cotizacionPdfId:result.cotizacionPdfId||'',cotizacionPdfUrl:result.cotizacionPdfUrl||'',driveCotizacionSyncedAt:new Date().toISOString()};
    await window.updateDoc_?.('presupuestos',p.id,patch); Object.assign(p,patch);
  }
  async function generateCommercialFiles(p){
    if(!p)throw new Error('No se encontró la cotización'); const nro=digits(p.nro||p.nroPresupuesto||p.cotizacionBase); if(!nro)throw new Error('La cotización no tiene número');
    const payload={action:'guardarCotizacionArchivos',nroCotizacion:nro,revision:rev(p.revision),cliente:String(p.cliente||'').trim(),descripcion:String(p.desc||p.descripcion||'').trim(),fecha:p.fecha||'',validez:p.validez||'',validezDias:num(p.validez)||7,nota:p.nota||'',condicion:p.cond||p.condicion||'',total:totalBudget(p),items:itemsFromBudget(p),firestoreId:p.id||'',nombreBase:p.nombreBase||'',entregaLogistica:p.entregaLogistica||''};
    const result=await jsonpDrive(payload); await persistDriveLinks(p,result); return result;
  }
  window.generarArchivosCotizacionV65=generateCommercialFiles;

  async function repairApprovedWork(p){
    if(!p||norm(p.estado)!=='aprobado')return null; const nro=digits(p.nro||p.cotizacionBase), obras=window.DB?.obras||[]; let o=p.obraId?obras.find(x=>x.id===p.obraId):null; if(!o)o=obras.find(x=>digits(x.ot)===nro); if(!o)return null;
    const total=totalBudget(p),items=itemsFromBudget(p),f={...(o.finanzas||{})},patch={}; if(total>0){patch.neto=total;patch.importe=total;f.total=total;patch.finanzas=f;} if(items.length){patch.itemsCotizados=items;patch.itemsTecnicos=items.map(it=>({descripcion:it.descripcion,articulo:it.descripcion,cantidad:it.cantidad,unidad:it.unidad||'u',observaciones:it.observaciones||''}));}
    patch.infoPresupuesto={...(o.infoPresupuesto||{}),presupuestoId:p.id||'',nro:p.nro||nro,revision:rev(p.revision),importe:total,cliente:p.cliente||o.cliente||'',descripcion:p.desc||o.desc||''}; patch.cotizacionExcelUrl=p.cotizacionExcelUrl||o.cotizacionExcelUrl||''; patch.cotizacionPdfUrl=p.cotizacionPdfUrl||o.cotizacionPdfUrl||'';
    await window.updateDoc_?.('obras',o.id,patch); Object.assign(o,patch); return o;
  }
  window.repararObraDesdeCotizacionV65=repairApprovedWork;

  function installBudgetSavePatch(){
    const old=window.guardarPresupuestoCompleto; if(typeof old!=='function'||old.__tizV65)return false;
    const wrapped=async function(){ const beforeNro=digits(val('pp-nro')),beforeRev=rev(val('pp-revision')),result=await old.apply(this,arguments); try{const p=(window.DB?.presupuestos||[]).find(x=>digits(x.nro)===beforeNro&&rev(x.revision)===beforeRev)||(window.DB?.presupuestos||[]).find(x=>digits(x.nro)===beforeNro); if(p){window.showToast?.('Guardando PDF y Excel en Drive…');await generateCommercialFiles(p);await repairApprovedWork(p);window.showToast?.('Cotización guardada · PDF y Excel en Drive ✓');window.renderCobranzas?.();}}catch(e){console.error('[TIZ V65] Cotización guardada, pero falló Drive:',e);window.showToast?.('Cotización guardada, pero no se pudieron generar PDF/Excel: '+(e.message||e));} return result;};
    wrapped.__tizV65=true; window.guardarPresupuestoCompleto=wrapped; return true;
  }

  function installClientPatch(){
    const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    const js=s=>String(s??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,' ');

    window.sugerirClientesPP=function(q='',mostrarTodos=false){
      const dd=document.getElementById('pp-clientes-dropdown'); if(!dd)return; const term=String(q||'').trim(),nterm=norm(term);
      const db=(window.DB?.clientes||[]).filter(c=>String(c?.nombre||'').trim()).map(c=>({id:c.id||'',nombre:String(c.nombre).trim(),cuit:c.cuit||'',origen:'clientes'}));
      const names=new Set(db.map(c=>norm(c.nombre))); const obras=[...new Set((window.DB?.obras||[]).map(o=>String(o.cliente||'').trim()).filter(Boolean))].filter(n=>!names.has(norm(n))).map(nombre=>({nombre,cuit:'',origen:'obras'}));
      const todos=[...db,...obras].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'})); const matches=term?todos.filter(c=>norm(c.nombre).includes(nterm)).slice(0,100):(mostrarTodos?todos.slice(0,100):[]);
      let html=matches.map(c=>`<div class="cli-option" onmousedown="elegirClientePP('${js(c.nombre)}')"><span>${esc(c.nombre)}</span>${c.cuit?`<span class="cli-option-sub">CUIT: ${esc(c.cuit)}</span>`:`<span class="cli-option-sub">${c.origen==='obras'?'de obras anteriores':'cliente guardado'}</span>`}</div>`).join('');
      const exact=term&&todos.some(c=>norm(c.nombre)===nterm); if(term&&!exact)html+=`<div class="cli-option" onmousedown="nuevoClienteDesdePresupuesto('${js(term)}')" style="border-top:1px solid var(--border);color:var(--accent)"><span>➕ Crear cliente “<strong>${esc(term)}</strong>”</span><span class="cli-option-sub" style="color:var(--accent)">Guardar y usar en esta cotización</span></div>`;
      if(!html&&!term){dd.style.display='none';return;} dd.innerHTML=html||'<div class="cli-option-sub" style="padding:9px">No hay clientes.</div>'; dd.style.display='block';
    };

    window.nuevoClienteDesdePresupuesto=function(nombre){
      window._clienteParaPresupuesto=String(nombre||'').trim();
      if(typeof window.openCliente==='function') window.openCliente(); else document.getElementById('modal-cliente')?.classList.add('open');
      setTimeout(()=>{const f=document.getElementById('fc-nombre'); if(f){f.value=window._clienteParaPresupuesto;f.focus();}},60);
    };

    const oldSave=window.saveCliente;
    if(typeof oldSave==='function'&&!oldSave.__tizV65){
      const wrapped=async function(){
        const nombre=String(document.getElementById('fc-nombre')?.value||window._clienteParaPresupuesto||'').trim(); const wasNew=!window.editingId?.cliente; const result=await oldSave.apply(this,arguments);
        if(wasNew&&nombre){
          if(!Array.isArray(window.DB?.clientes))window.DB.clientes=[];
          if(!window.DB.clientes.some(c=>norm(c.nombre)===norm(nombre))) window.DB.clientes.push({id:'local-'+Date.now(),nombre,cuit:String(document.getElementById('fc-cuit')?.value||'').trim()});
          const pp=document.getElementById('pp-cliente'); if(pp){pp.value=nombre;pp.dispatchEvent(new Event('input',{bubbles:true}));}
          window._clienteParaPresupuesto=''; document.getElementById('pp-clientes-dropdown')?.style.setProperty('display','none');
        }
        return result;
      };
      wrapped.__tizV65=true; window.saveCliente=wrapped;
    }

    // Hace visible la lista completa al hacer foco, aunque todavía no haya texto.
    document.addEventListener('focusin',e=>{if(e.target?.id==='pp-cliente')window.sugerirClientesPP(e.target.value,true);});
  }

  async function repair4701Once(){
    if(window.__tiz4701RepairDone)return; const p=(window.DB?.presupuestos||[]).filter(x=>digits(x.nro)==='4701').sort((a,b)=>rev(b.revision).localeCompare(rev(a.revision),undefined,{numeric:true}))[0]; if(!p||norm(p.estado)!=='aprobado')return; window.__tiz4701RepairDone=true;
    try{await generateCommercialFiles(p);await repairApprovedWork(p);window.renderCobranzas?.();console.info('[TIZ V65] CT 4701 reparada: archivos Drive + datos financieros.');}catch(e){window.__tiz4701RepairDone=false;console.error('[TIZ V65] No se pudo reparar CT 4701',e);}
  }

  function init(){ installClientPatch(); let tries=0;const t=setInterval(()=>{tries++;if(installBudgetSavePatch()||tries>30)clearInterval(t);},200); setTimeout(repair4701Once,1800);setTimeout(repair4701Once,4000);setTimeout(repair4701Once,8000); console.info('[TIZ] V65 CT Drive + Facturación + Clientes cargado'); }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
