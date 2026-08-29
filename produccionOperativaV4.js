// TIZ Produccion V4 - Catalogos operativos + bloqueos guiados + acceso a Drive OT
(()=>{
'use strict';
window.__TIZ_PRODUCCION_OPERATIVA_V4__=true;
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const legacy=o=>(o?.gestionSectores||{}).produccion||{};
const prod=o=>{const s=window.getSectoresV35?window.getSectoresV35(o):(o?.sectores||{});return {...legacy(o),...(s?.produccion||{})}};
const assignee=o=>{const p=prod(o);return p.operadorAsignado||p.responsable||p.asignadoA||''};
const machine=o=>{const p=prod(o);return p.maquinaId||p.recurso||p.maquina||''};
const uniq=arr=>[...new Set(arr.map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
const RESPONSABLES=()=>uniq((window.DB?.obras||[]).map(assignee));
const MAQUINAS=()=>uniq((window.DB?.obras||[]).map(machine));
const BLOCKS=[
  'Materiales',
  'Diseño / archivo',
  'Cliente',
  'Proveedor / tercerización',
  'Máquina averiada / no disponible',
  'Falta operador',
  'Calidad / retrabajo',
  'Dependencia de otra tarea',
  'Otro'
];
const ACTIONS={
  'Materiales':'Verificar stock, solicitar a Compras y confirmar fecha de llegada.',
  'Diseño / archivo':'Solicitar archivo o aprobación a Diseño y definir fecha de respuesta.',
  'Cliente':'Solicitar la definición pendiente al cliente y fijar próximo seguimiento.',
  'Proveedor / tercerización':'Contactar proveedor, confirmar compromiso y cargar próximo seguimiento.',
  'Máquina averiada / no disponible':'Reasignar máquina o registrar indisponibilidad y alternativa.',
  'Falta operador':'Reasignar responsable o definir quién toma el trabajo.',
  'Calidad / retrabajo':'Registrar corrección necesaria y volver a control cuando esté resuelta.',
  'Dependencia de otra tarea':'Identificar la tarea previa, su responsable y fecha de liberación.',
  'Otro':'Definir la acción concreta necesaria para destrabar el trabajo.'
};
function selected(value,current){return norm(value)===norm(current)?'selected':''}
function optionList(items,current,emptyLabel){const values=uniq([current,...items]);return `<option value="">${esc(emptyLabel)}</option>${values.map(v=>`<option ${selected(v,current)}>${esc(v)}</option>`).join('')}`}
function blockFields(p,status){const blocked=norm(status)==='bloqueado',reason=p.motivoBloqueo||p.bloqueoMotivo||p.bloqueo||'',action=p.accionSiguiente||ACTIONS[reason]||'',owner=p.responsableDestrabe||'',follow=p.proximoSeguimiento||'';return `<div id="tpc-block-wrap" class="tpc-full" style="display:${blocked?'grid':'none'};grid-template-columns:1fr 1fr;gap:10px;padding:10px;border:1px solid var(--border);border-radius:9px;background:rgba(232,160,32,.04)"><div class="tpc-field"><label>Motivo de bloqueo</label><select id="tpc-block-reason"><option value="">Seleccionar…</option>${BLOCKS.map(v=>`<option ${selected(v,reason)}>${esc(v)}</option>`).join('')}</select></div><div class="tpc-field"><label>Responsable de destrabar</label><select id="tpc-unblock-owner">${optionList(RESPONSABLES(),owner,'Sin asignar')}</select></div><div class="tpc-field tpc-full"><label>Acción siguiente sugerida</label><textarea id="tpc-next-action" rows="2">${esc(action)}</textarea></div><div class="tpc-field"><label>Próximo seguimiento</label><input id="tpc-follow-up" type="date" value="${esc(follow)}"></div><div class="tpc-field"><label>Estado del bloqueo</label><select id="tpc-block-state"><option ${selected('Pendiente',p.estadoBloqueo||'Pendiente')}>Pendiente</option><option ${selected('En gestión',p.estadoBloqueo)}>En gestión</option><option ${selected('Resuelto',p.estadoBloqueo)}>Resuelto</option></select></div></div>`}
function driveButton(o){return o?.driveFolderUrl?`<button type="button" class="btn btn-ghost" onclick="window.open('${esc(o.driveFolderUrl)}','_blank')">📁 Abrir carpeta OT en Drive</button>`:`<button type="button" class="btn btn-ghost" disabled title="La OT todavía no tiene carpeta Drive vinculada">📁 Carpeta OT no disponible</button>`}
function install(){
  if(typeof window.tpcQuickEdit!=='function'||typeof window.tpcSaveQuick!=='function')return setTimeout(install,250);
  const oldQuick=window.tpcQuickEdit;
  window.tpcQuickEdit=function(id){
    oldQuick(id);
    const o=(window.DB?.obras||[]).find(x=>x.id===id);if(!o)return;
    const p=prod(o),body=document.getElementById('tpc-modal-body');if(!body)return;
    const resp=document.getElementById('tpc-resp'),maq=document.getElementById('tpc-machine'),status=document.getElementById('tpc-status');
    if(resp){const sel=document.createElement('select');sel.id='tpc-resp';sel.innerHTML=optionList(RESPONSABLES(),resp.value,'Sin asignar');resp.replaceWith(sel)}
    if(maq){const sel=document.createElement('select');sel.id='tpc-machine';sel.innerHTML=optionList(MAQUINAS(),maq.value,'Sin máquina / recurso');maq.replaceWith(sel)}
    const oldBlock=document.getElementById('tpc-block');if(oldBlock?.closest('.tpc-field'))oldBlock.closest('.tpc-field').remove();
    const form=body.querySelector('.tpc-form');if(form)form.insertAdjacentHTML('beforeend',blockFields(p,status?.value||''));
    const actions=body.querySelector('.tpc-actions');if(actions)actions.insertAdjacentHTML('afterbegin',driveButton(o));
    const sync=()=>{const blocked=norm(status?.value)==='bloqueado',wrap=document.getElementById('tpc-block-wrap');if(wrap)wrap.style.display=blocked?'grid':'none'};
    status?.addEventListener('change',sync);sync();
    document.getElementById('tpc-block-reason')?.addEventListener('change',e=>{const a=document.getElementById('tpc-next-action');if(a)a.value=ACTIONS[e.target.value]||''});
  };
  window.tpcSaveQuick=async function(){
    const m=document.getElementById('tpc-quick-modal'),o=(window.DB?.obras||[]).find(x=>x.id===m?.dataset.id);if(!o)return;
    const old=legacy(o),estado=document.getElementById('tpc-status')?.value||'Pendiente',blocked=norm(estado)==='bloqueado';
    const next={...old,
      prioridad:document.getElementById('tpc-prio')?.value||'Normal',
      estadoInterno:estado,
      responsable:document.getElementById('tpc-resp')?.value||'',
      maquina:document.getElementById('tpc-machine')?.value||'',
      fechaFinPlan:document.getElementById('tpc-date')?.value||'',
      motivoBloqueo:blocked?(document.getElementById('tpc-block-reason')?.value||''):'',
      accionSiguiente:blocked?(document.getElementById('tpc-next-action')?.value||''):'',
      responsableDestrabe:blocked?(document.getElementById('tpc-unblock-owner')?.value||''):'',
      proximoSeguimiento:blocked?(document.getElementById('tpc-follow-up')?.value||''):'',
      estadoBloqueo:blocked?(document.getElementById('tpc-block-state')?.value||'Pendiente'):'',
      observaciones:document.getElementById('tpc-obs')?.value||'',
      actualizadoPor:window.currentUser?.email||'',actualizadoEn:new Date().toISOString()
    };
    const gestion={...(o.gestionSectores||{}),produccion:next};
    try{await window.updateDoc_('obras',o.id,{gestionSectores:gestion});o.gestionSectores=gestion;window.showToast?.('Producción actualizada ✓');window.tpcCloseQuick?.();window.renderProduccionCopilotoV3?.()}catch(e){console.error(e);window.showToast?.('No se pudo guardar: '+(e.message||e))}
  };
  console.info('[TIZ Produccion V4] Catalogos, bloqueos guiados y Drive OT habilitados');
}
install();
})();
