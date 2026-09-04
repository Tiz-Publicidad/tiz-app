/**
 * CLEMEN ERP V33.1 — Expedientes y revisiones
 * Implementación no destructiva sobre el modelo actual.
 * - Una fila visible por CT.
 * - Historial desplegable.
 * - Nueva revisión sin duplicar CT.
 * - Archivar en lugar de eliminar.
 * - Sectores operativos ocultan revisiones no vigentes.
 */
(() => {
  'use strict';

  const VERSION = 'V33.1-EXPEDIENTES-20260803';
  const expanded = new Set();
  let writeGuard = false;

  const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const ctKey = p => String(p?.expedienteId || p?.ct || p?.nro || '').replace(/\D/g,'') || String(p?.id || '');
  const revParts = value => String(value || '1.0').split('.').map(x => Number(x) || 0);
  const revCompare = (a,b) => {
    const aa=revParts(a), bb=revParts(b), n=Math.max(aa.length,bb.length);
    for(let i=0;i<n;i++){ const d=(aa[i]||0)-(bb[i]||0); if(d) return d; }
    return 0;
  };
  const nextRevision = value => {
    const p=revParts(value); if(p.length<2)p.push(0); p[1]=(p[1]||0)+1; return p.slice(0,2).join('.');
  };
  const dateValue = p => {
    const raw=p?.actualizadoEn||p?.createdAt||p?.fecha||'';
    const d=new Date(raw); return Number.isNaN(d.getTime())?0:d.getTime();
  };
  const isArchived = x => !!(x?.archivado || norm(x?.estado)==='archivado');
  const isApproved = x => norm(x?.estado)==='aprobado' || x?.revisionEstado==='aprobada';
  const isOperationalVisible = o => !isArchived(o) && o?.revisionVigente !== false && o?.revisionOperativa !== false;

  function groups(){
    const map=new Map();
    (window.DB?.presupuestos||[]).forEach(p=>{
      const key=ctKey(p); if(!map.has(key))map.set(key,[]); map.get(key).push(p);
    });
    return [...map.entries()].map(([key,list])=>{
      const sorted=[...list].sort((a,b)=>revCompare(b.revision||'1.0',a.revision||'1.0') || dateValue(b)-dateValue(a));
      const approved=sorted.filter(x=>isApproved(x)&&!isArchived(x));
      const vigente=approved.find(x=>x.revisionVigente===true) || approved[0] || sorted.find(x=>!isArchived(x)) || sorted[0];
      return {key,list:sorted,vigente};
    }).sort((a,b)=>(Number(b.key)||0)-(Number(a.key)||0));
  }

  function historyRows(group){
    return group.list.map(p=>{
      const historical=p.id!==group.vigente?.id;
      const state=isArchived(p)?'Archivada':(p.estado||'Presupuestado');
      return `<tr class="v33-history-row">
        <td><span class="v33-rev">Rev ${esc(p.revision||'1.0')}</span></td>
        <td>${esc(p.cliente||'')}</td>
        <td>${esc(p.motivoRevision||p.comentarios||'Sin motivo informado')}</td>
        <td>${esc(p.vendedor||'')}</td>
        <td>${window.fmtM?window.fmtM(p.importe||0):esc(p.importe||0)}</td>
        <td>${esc(p.fecha||'—')}</td>
        <td><span class="badge badge-${historical?'gray':isApproved(p)?'green':'amber'}">${historical?'Histórica':esc(state)}</span></td>
        <td><button class="btn-icon" title="Abrir revisión" onclick="editPres('${p.id}')"><i class="ti ti-eye"></i></button></td>
      </tr>`;
    }).join('');
  }

  function renderPresupuestosV33(){
    const all=groups();
    const visible=all.filter(g=>g.vigente&&!isArchived(g.vigente));
    const approvedTotal=visible.filter(g=>isApproved(g.vigente)).reduce((s,g)=>s+(Number(g.vigente.importe)||0),0);
    const reviewCount=visible.filter(g=>['enviado','en revision','en revisión','presupuestado','pendiente','borrador'].includes(norm(g.vigente.estado))).length;
    const kpi=document.getElementById('pres-kpis');
    if(kpi)kpi.innerHTML=`
      <div class="kpi"><div class="kpi-label">Expedientes CT</div><div class="kpi-val">${visible.length}</div></div>
      <div class="kpi"><div class="kpi-label">Aprobados vigentes</div><div class="kpi-val green">${window.fmtM?window.fmtM(approvedTotal):approvedTotal}</div></div>
      <div class="kpi"><div class="kpi-label">En revisión</div><div class="kpi-val amber">${reviewCount}</div></div>`;
    const map={'Enviado':'blue','En revisión':'amber','Aprobado':'green','Rechazado':'red','Vencido':'gray','Presupuestado':'gray','Pendiente':'gray','Borrador':'amber'};
    const body=document.getElementById('pres-tbody'); if(!body)return;
    body.innerHTML=visible.map(g=>{
      const p=g.vigente, open=expanded.has(g.key), rev=p.revision||'1.0';
      return `<tr class="v33-main-row">
        <td class="strong">${esc(p.nro||g.key||'—')}</td>
        <td>${esc(p.cliente||'')}</td>
        <td>${esc(p.desc||'')}<div class="v33-sub"><span class="v33-rev">Rev ${esc(rev)}</span> ${isApproved(p)?'<span class="v33-current">Última aprobada</span>':'<span class="v33-draft">Revisión actual</span>'}</div></td>
        <td>${esc(p.vendedor||'')}</td>
        <td style="font-weight:500">${window.fmtM?window.fmtM(p.importe):esc(p.importe||0)}</td>
        <td>${esc(p.fecha||'—')}</td>
        <td><span class="badge badge-${map[p.estado]||'gray'}">${esc(p.estado||'')}</span></td>
        <td class="v33-actions">
          <button class="btn-icon" title="${open?'Ocultar':'Ver'} historial" onclick="toggleHistoryV33('${esc(g.key)}')"><i class="ti ti-chevron-${open?'up':'down'}"></i></button>
          <button class="btn-icon" title="Nueva revisión" onclick="newRevisionV33('${p.id}')"><i class="ti ti-copy"></i></button>
          <button class="btn-icon" title="Editar revisión actual" onclick="editPres('${p.id}')"><i class="ti ti-edit"></i></button>
          <button class="btn-icon" title="Archivar expediente" onclick="archiveExpedienteV33('${esc(g.key)}')"><i class="ti ti-archive"></i></button>
        </td>
      </tr>${open?historyRows(g):''}`;
    }).join('') || '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3)">Sin expedientes activos.</td></tr>';
  }
  window.renderPresupuestos=renderPresupuestosV33;
  // Abrir siempre el editor completo: permite corregir cliente, ítems y condiciones
  // de la revisión vigente sin caer en el formulario histórico reducido.
  window.editPres=id=>window.abrirRevisionCotizacionV354?.(id,false);
  window.toggleHistoryV33=key=>{expanded.has(key)?expanded.delete(key):expanded.add(key);renderPresupuestosV33()};

  async function ensureRevisionFields(p, index=0){
    const patch={};
    if(!p.expedienteId)patch.expedienteId=ctKey(p);
    if(!p.revision)patch.revision=index===0?'1.0':`1.${index}`;
    if(p.revisionVigente===undefined)patch.revisionVigente=isApproved(p);
    if(!p.revisionEstado)patch.revisionEstado=isApproved(p)?'aprobada':'borrador';
    if(!p.creadoEn)patch.creadoEn=new Date().toISOString();
    if(Object.keys(patch).length) await originalUpdate('presupuestos',p.id,patch);
  }

  async function normalizeExisting(){
    if(!window.DB?.presupuestos?.length)return;
    for(const g of groups()){
      const ordered=[...g.list].sort((a,b)=>dateValue(a)-dateValue(b));
      for(let i=0;i<ordered.length;i++)await ensureRevisionFields(ordered[i],i);
      const approved=[...ordered].filter(isApproved).sort((a,b)=>dateValue(b)-dateValue(a));
      if(approved.length){
        const current=approved.find(x=>x.revisionVigente===true)||approved[0];
        for(const p of approved){
          if(p.revisionVigente!==(p.id===current.id))await originalUpdate('presupuestos',p.id,{revisionVigente:p.id===current.id,revisionEstado:p.id===current.id?'aprobada':'historica'});
        }
      }
    }
  }

  window.newRevisionV33=async id=>{
    const source=(window.DB?.presupuestos||[]).find(x=>x.id===id); if(!source)return;
    const g=groups().find(x=>x.key===ctKey(source));
    const maxRev=(g?.list||[source]).map(x=>x.revision||'1.0').sort(revCompare).pop()||'1.0';
    const motivo=prompt('Motivo de la nueva revisión:', 'Ajuste solicitado por el cliente');
    if(motivo===null)return;
    const clone=JSON.parse(JSON.stringify(source));
    ['id','obraId','driveFolderId','driveFolderUrl','otSheetUrl','otExcelUrl','cotizacionExcelUrl','cotizacionPdfUrl','driveSyncedAt'].forEach(k=>delete clone[k]);
    Object.assign(clone,{
      expedienteId:ctKey(source), revision:nextRevision(maxRev), revisionVigente:false,
      revisionEstado:'borrador', estado:'Presupuestado', archivado:false,
      motivoRevision:motivo.trim(), revisionOrigenId:source.id,
      creadoEn:new Date().toISOString(), actualizadoEn:new Date().toISOString()
    });
    const ref=await originalAdd('presupuestos',clone);
    if(ref?.id){ window.showToast?.(`Revisión ${clone.revision} creada`); setTimeout(()=>window.editPres?.(ref.id),500); }
  };

  window.archiveExpedienteV33=async key=>{
    if(!confirm(`¿Archivar el expediente CT ${key}?\nNo se eliminará ningún archivo de Drive.`))return;
    const g=groups().find(x=>x.key===key); if(!g)return;
    for(const p of g.list)await originalUpdate('presupuestos',p.id,{archivado:true,archivadoEn:new Date().toISOString(),revisionVigente:false});
    for(const o of (window.DB?.obras||[]).filter(x=>String(x.expedienteId||x.ctOrigen||x.nroPresupuesto||x.ot||'').replace(/\D/g,'')===key)){
      await originalUpdate('obras',o.id,{archivado:true,revisionVigente:false});
    }
    window.showToast?.('Expediente archivado. Drive no fue modificado.');
  };
  window.delPres=id=>{
    const p=(window.DB?.presupuestos||[]).find(x=>x.id===id); if(p)window.archiveExpedienteV33(ctKey(p));
  };

  async function reconcileBudget(id,data){
    if(writeGuard)return;
    const p={...(window.DB?.presupuestos||[]).find(x=>x.id===id),...data,id};
    const key=ctKey(p), approved=isApproved(p);
    const revision=p.revision||'1.0';
    writeGuard=true;
    try{
      await originalUpdate('presupuestos',id,{
        expedienteId:key, revision, revisionVigente:approved,
        revisionEstado:approved?'aprobada':(p.revisionEstado||'borrador'),
        actualizadoEn:new Date().toISOString()
      });
      const siblings=(window.DB?.presupuestos||[]).filter(x=>x.id!==id&&ctKey(x)===key);
      if(approved){
        for(const s of siblings)if(s.revisionVigente===true||isApproved(s))await originalUpdate('presupuestos',s.id,{revisionVigente:false,revisionEstado:'historica'});
      }
      const related=(window.DB?.obras||[]).filter(o=>String(o.expedienteId||o.ctOrigen||o.nroPresupuesto||o.ot||'').replace(/\D/g,'')===key || o.id===p.obraId);
      for(const o of related){
        const current=o.id===p.obraId || (!p.obraId && String(o.ot||'').replace(/\D/g,'')===key && approved);
        await originalUpdate('obras',o.id,{
          expedienteId:key, ctOrigen:key,
          revisionAprobada:current&&approved?revision:(o.revisionAprobada||''),
          revisionVigente:current&&approved,
          revisionOperativa:current&&approved,
          revisionEsUltimaAprobada:current&&approved
        });
      }
    }finally{writeGuard=false;}
  }

  const originalAdd=window.addDoc_;
  const originalUpdate=window.updateDoc_;
  if(originalAdd)window.addDoc_=async function(collection,data){
    const ref=await originalAdd.apply(this,arguments);
    if(collection==='presupuestos'&&ref?.id)setTimeout(()=>reconcileBudget(ref.id,data).catch(console.error),0);
    return ref;
  };
  if(originalUpdate)window.updateDoc_=async function(collection,id,data){
    const result=await originalUpdate.apply(this,arguments);
    if(collection==='presupuestos'&&!writeGuard)setTimeout(()=>reconcileBudget(id,data).catch(console.error),0);
    return result;
  };

  function withFilteredWorks(fn){
    if(typeof fn!=='function')return fn;
    return function(){
      const full=window.DB?.obras;
      if(Array.isArray(full))window.DB.obras=full.filter(isOperationalVisible);
      try{return fn.apply(this,arguments)}finally{if(Array.isArray(full))window.DB.obras=full;}
    };
  }
  ['renderDashboard','renderObras','renderProduccion','renderColocaciones','renderDiseno','renderAlertas','renderSemana'].forEach(name=>{
    if(typeof window[name]==='function'&&!window[name]._v33){const wrapped=withFilteredWorks(window[name]);wrapped._v33=true;window[name]=wrapped;}
  });

  function decorateOperationalRows(){
    if(window.currentPage!=='obras')return;
    document.querySelectorAll('#obras-tbody tr').forEach(tr=>{
      const ot=tr.cells?.[1]?.textContent?.trim(); if(!ot)return;
      const o=(window.DB?.obras||[]).find(x=>String(x.ot||'').trim()===ot&&isOperationalVisible(x));
      if(!o?.revisionAprobada)return;
      const desc=tr.cells?.[2]; if(desc&&!desc.querySelector('.v33-op-rev'))desc.insertAdjacentHTML('beforeend',`<div class="v33-op-rev">CT ${esc(o.ctOrigen||o.expedienteId||'')} · Rev ${esc(o.revisionAprobada)}${o.revisionEsUltimaAprobada?' · última aprobada':''}</div>`);
    });
  }
  const oldRefresh=window.refreshCurrent;
  window.refreshCurrent=function(){
    const r=oldRefresh?.apply(this,arguments);
    if(window.currentPage==='presupuestos')renderPresupuestosV33();
    setTimeout(decorateOperationalRows,0); return r;
  };

  function style(){
    if(document.getElementById('v33-style'))return;
    const s=document.createElement('style');s.id='v33-style';s.textContent=`
      .v33-sub{margin-top:5px;font-size:9px;color:var(--text3);display:flex;gap:6px;align-items:center}.v33-rev{font-family:'DM Mono',monospace;color:var(--blue)}
      .v33-current{color:var(--green)}.v33-draft{color:var(--amber)}.v33-actions{white-space:nowrap}.v33-history-row{background:#121212}.v33-history-row td{font-size:10px;color:var(--text2);border-top:1px dashed var(--border)}
      .v33-op-rev{font-size:8px;color:var(--amber);margin-top:4px;font-family:'DM Mono',monospace}
    `;document.head.appendChild(s);
  }

  async function install(){
    style();
    try{await normalizeExisting();}catch(e){console.warn('[V33 normalización]',e)}
    if(window.currentPage==='presupuestos')renderPresupuestosV33();
    const badge=document.getElementById('tiz-build-v20');if(badge)badge.textContent='TIZ V33.1 · EXPEDIENTES + REVISIONES · 03/08/2026';
    console.info('[CLEMEN ERP V33.1] Expedientes y revisiones cargados',VERSION);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,1200));else setTimeout(install,1200);
})();
