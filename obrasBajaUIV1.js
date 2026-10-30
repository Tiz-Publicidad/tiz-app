(function(){
'use strict';
const C=()=>window.TIZObrasSeguimientoCoreV2,E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let saving=false;
function close(){if(!saving)document.getElementById('obra-baja-modal')?.remove();}
function open(id){
 if(!window.currentUser?.isAdmin)return;
 const g=C().grouped(window.DB?.obras||[]).find(g=>g.ids.includes(id));if(!g)return;
 close();const reactivate=g.estado==='Baja',node=document.createElement('div');node.id='obra-baja-modal';node.className='o2-overlay';
 node.innerHTML='<section class="o2-dialog o2-form" role="dialog" aria-modal="true" aria-labelledby="obra-baja-title" style="max-width:560px"><h2 id="obra-baja-title">'+(reactivate?'Reactivar obra':'Dar de baja obra')+'</h2><p style="margin:14px 0">CT/OT '+E(g.ot)+' · '+E(g.cliente)+'<br>'+E(g.desc)+'</p>'+(reactivate?'<p class="o2-muted">Baja registrada: '+E(g.bajaObra?.motivo||'Sin motivo anterior')+'</p>':'<p class="o2-muted">La obra saldrá de los pendientes de producción y facturación. Se conservarán su historial, facturas, cobros y cualquier saldo ya facturado.</p>')+'<form id="obra-baja-form"><label style="margin-top:18px">Motivo de '+(reactivate?'reactivación':'baja')+'<textarea name="motivo" required minlength="3" maxlength="1000" rows="3" placeholder="'+(reactivate?'Por qué vuelve a estar activa':'Ej.: el cliente canceló el trabajo')+'"></textarea></label><p data-baja-error class="o2-error" role="alert"></p><div class="o2-actions"><button type="button" class="btn btn-ghost" data-baja-close>Volver</button><button type="submit" class="btn btn-primary">'+(reactivate?'Confirmar reactivación':'Confirmar baja')+'</button></div></form></section>';
 node.querySelector('[data-baja-close]').onclick=close;
 node.querySelector('form').onsubmit=async e=>{
  e.preventDefault();if(saving)return;const motivo=node.querySelector('textarea').value.trim(),button=node.querySelector('[type=submit]'),error=node.querySelector('[data-baja-error]');
  if(motivo.length<3){error.textContent='Indicá el motivo.';return;}
  saving=true;button.disabled=true;error.textContent='';
  try{
   const patches=await window.cambiarBajaObraV1(g.ids,motivo,reactivate);
   for(const p of patches){const o=(window.DB?.obras||[]).find(o=>o.id===p.id);if(o)Object.assign(o,p.patch);}
   saving=false;close();window.refreshCurrent?.();window.showToast?.(reactivate?'Obra reactivada':'Obra dada de baja');
  }catch(err){error.textContent=err.message||'No se pudo guardar el cambio.';}finally{saving=false;button.disabled=false;}
 };
 document.body.appendChild(node);node.querySelector('textarea').focus();
}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-obra-baja]');if(b)open(b.dataset.obraBaja);});
document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
window.TIZObraBajaV1={open,close};
})();
