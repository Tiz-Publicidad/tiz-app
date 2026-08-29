/** TIZ Produccion V8.1 - asistencia operativa sobre V8 */
(()=>{
'use strict';
if(window.__TIZ_PRODUCCION_V81__) return;
window.__TIZ_PRODUCCION_V81__=true;
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const prod=o=>({...((window.getSectoresV35?.(o)||{}).produccion||{}),...((o?.gestionSectores||{}).produccion||{})});
const active=()=>[...(window.DB?.obras||[])].filter(o=>['aprobado','en produccion'].includes(norm(o.estado))&&o.archivado!==true&&o.revisionVigente!==false);
function learnedOwners(){
 const score=new Map();
 active().forEach(o=>{
   const p=prod(o), owner=p.responsable||p.operadorAsignado||p.asignadoA;
   if(owner) score.set(owner,(score.get(owner)||0)+1);
   (Array.isArray(p.procesos)?p.procesos:[]).forEach(x=>{if(x.responsable)score.set(x.responsable,(score.get(x.responsable)||0)+1)});
 });
 return [...score.entries()].sort((a,b)=>b[1]-a[1]);
}
function recommendation(o){
 const p=prod(o), route=Array.isArray(p.procesos)?p.procesos:[];
 const next=route.find(x=>norm(x.estado)!=='terminado');
 if(next?.responsable) return {name:next.responsable,why:'ya figura como responsable del proximo proceso'};
 const hist=learnedOwners();
 if(hist.length) return {name:hist[0][0],why:'es el responsable mas utilizado en trabajos activos'};
 return null;
}
async function assignSuggested(id){
 const o=active().find(x=>x.id===id); if(!o) return;
 const r=recommendation(o); if(!r){alert('Todavia no hay historial suficiente para sugerir un responsable.');return;}
 if(!confirm(`Sugerencia: ${r.name}\n\nMotivo: ${r.why}.\n\n¿Asignarlo a esta OT?`)) return;
 const gs={...(o.gestionSectores||{})};
 const p={...(gs.produccion||{}),responsable:r.name};
 const h=Array.isArray(p.historial)?[...p.historial]:[];
 h.unshift({fecha:new Date().toISOString(),tipo:'asignacion_sugerida',detalle:`Responsable sugerido y asignado: ${r.name}`,usuario:window.currentUser?.email||''});
 p.historial=h.slice(0,100); gs.produccion=p;
 await window.updateDoc_?.('obras',o.id,{gestionSectores:gs});
 o.gestionSectores=gs;
 window.renderProduccionV34?.();
}
window.p81AssignSuggested=assignSuggested;
function enhance(){
 const page=document.getElementById('page-produccion');
 if(!page||!page.querySelector('.p8')||page.querySelector('#p81-assist')) return;
 const head=page.querySelector('.p8-head'); if(!head) return;
 const owners=learnedOwners();
 const box=document.createElement('div'); box.id='p81-assist';
 box.style.cssText='margin-top:7px;font-size:9px;color:var(--text3)';
 box.innerHTML=owners.length?`Historial operativo activo: <b style="color:var(--text2)">${owners.slice(0,3).map(x=>`${x[0]} (${x[1]})`).join(' · ')}</b>`:'Historial operativo: se ira aprendiendo a medida que asignen responsables y procesos.';
 head.firstElementChild?.appendChild(box);
 const rows=[...page.querySelectorAll('.p8-table tbody tr')];
 rows.forEach(row=>{
   const text=row.textContent||'';
   if(!/Sin asignar/i.test(text)) return;
   const m=text.match(/\b(\d{4,})\b/); if(!m) return;
   const o=active().find(x=>String(x.ot||'').includes(m[1])); if(!o||row.querySelector('.p81-suggest'))return;
   const cell=row.lastElementChild; if(!cell)return;
   const b=document.createElement('button');b.className='btn btn-ghost p81-suggest';b.textContent='Sugerir responsable';b.style.cssText='font-size:8px;padding:5px 7px;margin-left:4px';b.onclick=()=>assignSuggested(o.id);cell.appendChild(b);
 });
}
const mo=new MutationObserver(()=>requestAnimationFrame(enhance));
function install(){if(document.body){mo.observe(document.body,{childList:true,subtree:true});enhance()}else setTimeout(install,300)}
install();
})();
