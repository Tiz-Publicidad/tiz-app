/* Resultados oficiales de la pestaña Estadistica de TIZ 2026. */
(function(){
'use strict';
let snapshot=null,session='',busy=false,error='',lastRead=0,request=0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>v===null||v===undefined?'Sin dato':new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(v);
const percent=(a,t)=>a===null||!(t>0)?null:Math.round(a/t*100);
const badge=(a,t)=>{const p=percent(a,t);return p===null?'<span style="color:var(--text3)">Sin meta</span>':`<span class="badge badge-${p>=100?'green':p>=80?'amber':'red'}">${p}%</span>`;};
const allowed=()=>window.currentUser?.isAdmin&&['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com'].includes(String(window.currentUser.email||'').toLowerCase());
function current(){return allowed()&&window.currentPage==='estadistica'&&['tabla','mensual','metas'].includes(window.estTab);}
function reset(){snapshot=null;error='';busy=false;lastRead=0;request++;}
async function load(force){if(!allowed()||busy||!force&&lastRead&&Date.now()-lastRead<60000)return;busy=true;error='';const email=session,id=++request;render();try{const value=await window.estadisticaSourceApiV1();if(id!==request||!allowed()||email!==window.currentUser.email)return;snapshot=value;lastRead=Date.now();}catch(e){if(id===request&&email===window.currentUser?.email)error=e.message;}finally{if(id===request){busy=false;if(current())render();}}}
function render(){
 if(!allowed())return;
 if(session!==window.currentUser.email){reset();session=window.currentUser.email;}
 if(!current())return;
 const content=document.getElementById('est-content'),kpis=document.getElementById('est-kpis');if(!content||!kpis)return;
 const title=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin:12px 0"><div style="font-size:12px;color:var(--text3)">Fuente: TIZ 2026 · Estadistica${snapshot?' · Leído '+esc(new Date(snapshot.readAt).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})):''}<br>Resultados y metas de cada puesto según la planilla. Los acumulados respetan sus celdas de resumen.</div><button class="btn btn-ghost btn-sm" data-est-refresh ${busy?'disabled':''}>${busy?'Actualizando…':'Actualizar desde TIZ 2026'}</button></div>`;
 const warning=error?`<div role="alert" style="color:var(--red);margin:12px 0">${esc(error)}${snapshot?' Se conserva la última lectura.':''}</div>`:'';
 if(!snapshot){kpis.innerHTML='';content.innerHTML=title+warning+(!error?'<p>Consultando resultados por puesto…</p>':'');bind();if(!busy&&!error)load(false);return;}
 const sectors=snapshot.sectors;
 kpis.innerHTML=sectors.map(s=>`<div class="kpi"><div class="kpi-label">${esc(s.label)} acum.</div><div class="kpi-val">${money(s.actual)}</div><div class="kpi-sub">${badge(s.actual,s.target)} · ${s.target>0?'sobre metas cargadas: '+money(s.target):'Meta no cargada'}</div></div>`).join('');
 let html='';
 if(window.estTab==='metas'){
  html='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">'+sectors[0].monthly.map((m,i)=>`<div class="card"><div class="card-header"><span class="card-title">${esc(m.month)}</span></div><div class="card-body">${sectors.map(s=>{const v=s.monthly[i];return `<div style="margin-bottom:14px"><strong>${esc(s.label)}</strong><div style="display:flex;justify-content:space-between;gap:8px">${money(v.actual)} ${badge(v.actual,v.target)}</div><small style="color:var(--text3)">Meta: ${v.target>0?money(v.target):'Sin meta'}</small></div>`;}).join('')}</div></div>`).join('')+'</div>';
 }else{
  const monthly=window.estTab==='mensual',series=monthly?'monthly':'weekly';
  const rows=sectors[0][series].map((r,i)=>`<tr><td>${esc(r.month)}</td>${monthly?'':`<td>${r.week}</td>`}${sectors.map(s=>{const v=s[series][i];return `<td>${money(v.actual)}${monthly?'<br>'+badge(v.actual,v.target):''}${monthly?'<br><small>Meta: '+(v.target>0?money(v.target):'Sin meta')+'</small>':''}</td>`;}).join('')}</tr>`).join('');
  html=`<div class="card"><div class="table-wrap"><table><thead><tr><th>Mes</th>${monthly?'':'<th>Semana</th>'}${sectors.map(s=>'<th>'+esc(s.label)+'</th>').join('')}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
 }
 content.innerHTML=title+warning+html;bind();
}
function bind(){document.querySelector('[data-est-refresh]')?.addEventListener('click',()=>load(true));}
function exportCSV(){if(!allowed()||!snapshot)return window.showToast?.('Primero actualizá los resultados de TIZ 2026.');const monthly=window.estTab!=='tabla',series=monthly?'monthly':'weekly',cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"',rows=[['Mes',...(monthly?[]:['Semana']),...snapshot.sectors.flatMap(s=>monthly?[s.label,'Meta '+s.label]:[s.label])],...snapshot.sectors[0][series].map((r,i)=>[r.month,...(monthly?[]:[r.week]),...snapshot.sectors.flatMap(s=>{const v=s[series][i];return monthly?[v.actual,v.target]:[v.actual];})])],url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='TIZ-2026-estadistica-'+series+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
window.TIZEstadisticaSourceV1={render,exportCSV,reset};
})();
