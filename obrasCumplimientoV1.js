/* Cumplimiento de Obras: solo lectura, contra fechas registradas. */
(function(root,factory){
 'use strict';
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./functions/obrasSeguimientoCoreV2'));
 else {const api=factory(root.TIZObrasSeguimientoCoreV2);root.TIZObrasCumplimientoV1=api;api.install(root);}
})(typeof window==='object'?window:globalThis,function(C){
 'use strict';
 const phases=[['produccion','Producción'],['colocacion','Colocación']];
 const labels={'en-fecha':'Terminada en fecha',atrasada:'Terminada con atraso',vencida:'Vencida · sin ejecución registrada',hoy:'Vence hoy',prevista:'Por vencer',incompleta:'Cerrada / entregada · falta fecha real',invalida:'Fecha real futura · revisar'};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const format=v=>v?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):'—';
 const days=(a,b)=>Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000);
 const rate=(n,d)=>d?Math.round(1000*n/d)/10:null;
 const percent=n=>n===null?'Sin datos':n.toLocaleString('es-AR',{maximumFractionDigits:1})+'%';
 function summary(rows){
  const n=status=>rows.filter(r=>r.status===status).length;
  const enFecha=n('en-fecha'),atrasadas=n('atrasada'),evaluadas=enFecha+atrasadas;
  return {total:rows.length,enFecha,atrasadas,evaluadas,vencidas:n('vencida'),sinEvaluar:n('incompleta')+n('invalida'),futuras:n('prevista'),hoy:n('hoy'),cumplimiento:rate(enFecha,evaluadas),demoraMedia:atrasadas?Math.round(rows.filter(r=>r.status==='atrasada').reduce((sum,r)=>sum+r.dias,0)/atrasadas*10)/10:null};
 }
 function report(groups,{desde='',hasta='',etapa='',query='',referencia='original'}={},today=C.day()){
  if(desde&&!C.iso(desde)||hasta&&!C.iso(hasta)||desde&&hasta&&desde>hasta)throw Error('Revisá el período: Desde debe ser anterior o igual a Hasta.');
  const rows=[];let sinPrevista=0;
  for(const g of groups){
   if(C.isBaja(g)||query&&!C.norm(g.ot+' '+g.cliente+' '+g.desc).includes(C.norm(query)))continue;
   const s=g.seguimiento||{};
   for(const [phase,label] of phases){
    if(etapa&&phase!==etapa)continue;
    const vigente=C.iso(g[phase+'Prevista']),original=C.iso(s[phase+'PrevistaOriginal']),prevista=referencia==='vigente'?vigente:original||vigente,real=C.iso(s[phase+'Real']);
    if(!prevista){sinPrevista++;continue;}
    if(desde&&prevista<desde||hasta&&prevista>hasta)continue;
    // Un estado comercial no acredita una fecha de ejecución.
    const cerrada=!!s.cierreResultado||['Cobrado','Entregado'].includes(g.estado),futureReal=real&&real>today;
    const status=futureReal?'invalida':real?(real>prevista?'atrasada':'en-fecha'):cerrada?'incompleta':prevista<today?'vencida':prevista===today?'hoy':'prevista';
    const dias=status==='atrasada'?days(real,prevista):status==='vencida'?days(today,prevista):0;
    const delay=s[phase+'Demora'],validDelay=delay?.real===real&&delay?.prevista===prevista;
    rows.push({id:g.id,ot:g.ot,cliente:g.cliente,desc:g.desc,phase,label,prevista,vigente,original,real,status,dias,usaOriginal:referencia!=='vigente'&&!!original,motivo:validDelay?delay.motivo:'',detalle:validDelay?delay.detalle:'',responsabilidad:validDelay?delay.responsabilidad:'',archivada:!!g.members?.length&&g.members.every(w=>!!w.archivado||w._archivadaEstadistica)});
   }
  }
  rows.sort((a,b)=>b.dias-a.dias||a.prevista.localeCompare(b.prevista)||String(a.ot).localeCompare(String(b.ot),'es',{numeric:true}));
  return aggregate(rows,sinPrevista);
 }
 function aggregate(rows,sinPrevista=0){
  const meses=[...new Set(rows.map(r=>r.prevista.slice(0,7)))].sort();
  return {rows,sinPrevista,total:summary(rows),porEtapa:Object.fromEntries(phases.map(([phase])=>[phase,summary(rows.filter(r=>r.phase===phase))])),meses:meses.map(mes=>({mes,...Object.fromEntries(phases.map(([phase])=>[phase,summary(rows.filter(r=>r.phase===phase&&r.prevista.startsWith(mes)))]))}))};
 }
 function completedReport(groups,filters={},today=C.day()){
  const r=report(groups,filters,today);
  return {...aggregate(r.rows.filter(row=>['en-fecha','atrasada'].includes(row.status))),base:'terminadas'};
 }
 function planningSummary(rows){const s=summary(rows),evaluadas=s.enFecha+s.atrasadas+s.vencidas,conAtraso=s.atrasadas+s.vencidas;return {...s,terminadas:s.enFecha+s.atrasadas,evaluadas,conAtraso,cumplimiento:rate(s.enFecha,evaluadas),atraso:rate(conAtraso,evaluadas)};}
 function planningReport(groups,filters={},today=C.day()){
  const raw=report(groups,filters,today),rows=raw.rows.filter(r=>['en-fecha','atrasada','vencida'].includes(r.status)),months=[...new Set(rows.map(r=>r.prevista.slice(0,7)))].sort();
  return {base:'planificacion',rows,sinPrevista:raw.sinPrevista,excluidas:{sinPrevista:raw.sinPrevista,enPlazo:raw.rows.filter(r=>['hoy','prevista'].includes(r.status)).length,sinRealCerradas:raw.rows.filter(r=>r.status==='incompleta').length,realFutura:raw.rows.filter(r=>r.status==='invalida').length},total:planningSummary(rows),porEtapa:Object.fromEntries(phases.map(([phase])=>[phase,{...planningSummary(rows.filter(r=>r.phase===phase)),enPlazo:raw.rows.filter(r=>r.phase===phase&&['hoy','prevista'].includes(r.status)).length}])),meses:months.map(mes=>({mes,...Object.fromEntries(phases.map(([phase])=>[phase,planningSummary(rows.filter(r=>r.phase===phase&&r.prevista.startsWith(mes)))]))}))};
 }
 function indicatorReport(groups,filters={},today=C.day()){return filters.base==='terminadas'?completedReport(groups,filters,today):planningReport(groups,filters,today);}
 function planningPieData(s){
  const counts=[s.enFecha,s.atrasadas,s.vencidas],raw=counts.map(n=>s.evaluadas?n*1000/s.evaluadas:0),parts=raw.map(Math.floor);
  if(s.evaluadas){const order=[0,1,2].sort((a,b)=>(raw[b]-parts[b])-(raw[a]-parts[a]));for(let left=1000-parts.reduce((a,b)=>a+b,0),i=0;i<left;i++)parts[order[i]]++;}
  return {total:s.evaluadas,enFecha:s.enFecha,atrasadas:s.atrasadas,vencidas:s.vencidas,enFechaPct:s.evaluadas?parts[0]/10:null,atrasadasPct:s.evaluadas?parts[1]/10:null,vencidasPct:s.evaluadas?parts[2]/10:null};
 }
 function pieData(summary){return {enFecha:summary.enFecha,atrasadas:summary.atrasadas,total:summary.evaluadas,enFechaPct:summary.cumplimiento,atrasadasPct:summary.cumplimiento===null?null:Math.round((100-summary.cumplimiento)*10)/10};}
 const visibleRows=(rows,situacion='incidencias')=>rows.filter(r=>situacion==='todas'||situacion==='incidencias'&&['atrasada','vencida'].includes(r.status)||r.status===situacion);
 function csv(rows){
  const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r\n]/,"'$&").replace(/"/g,'""')+'"';
  const values=[['CT/OT','Cliente','Obra','Etapa','Prevista comparada','Primera prevista conservada','Prevista vigente','Real','Situación','Días de atraso','Referencia','Motivo','Atribución','Detalle'],...rows.map(r=>[r.ot,r.cliente,r.desc,r.label,format(r.prevista),format(r.original),format(r.vigente),format(r.real),labels[r.status],r.dias,r.usaOriginal?'Primera conservada':'Vigente',r.motivo,r.responsabilidad,r.detalle])];
  return '\uFEFF'+values.map(row=>row.map(cell).join(';')).join('\r\n');
 }
 function cards(r){const planning=r.base==='planificacion';return phases.map(([phase,label])=>{const s=r.porEtapa[phase];return '<article class="oc-card"><h3>'+label+'</h3><strong class="oc-rate">'+percent(planning?s.atraso:s.cumplimiento)+'</strong><p>'+(planning?'con atraso · confirmado o vencido sin fecha real':'de trabajos terminados en fecha')+'</p><p><span class="oc-green">'+s.enFecha+' terminadas en fecha</span> · <span class="oc-red">'+s.atrasadas+' terminadas con atraso</span>'+(planning?' · <span class="oc-overdue">'+s.vencidas+' vencidas sin fecha real</span>':'')+' / '+s.evaluadas+' etapas evaluadas</p>'+(planning?'<p>En fecha: '+percent(s.cumplimiento)+'</p>':'')+'<p class="o2-muted">Demora media confirmada: '+(s.demoraMedia===null?'Sin atrasos registrados':s.demoraMedia.toLocaleString('es-AR')+' días')+'</p></article>';}).join('');}
 function distribution(r){if(r.base!=='planificacion')return completedDistribution(r);return '<div class="oc-pies">'+phases.map(([phase,label])=>{const p=planningPieData(r.porEtapa[phase]),first=p.enFechaPct||0,second=first+(p.atrasadasPct||0),caption=label+': '+p.enFecha+' terminadas en fecha, '+p.atrasadas+' terminadas con atraso y '+p.vencidas+' vencidas sin fecha real. Base: '+p.total+' etapas con fecha prevista.';return '<article class="oc-pie-card"><h3>'+label+' · '+p.total+' etapas evaluadas</h3>'+(p.total?'<div class="oc-pie-body"><div class="oc-pie" role="img" aria-label="'+esc(caption)+'" style="background:conic-gradient(#75c895 0% '+first+'%,#e56c73 '+first+'% '+second+'%,#ef3340 '+second+'% 100%)"></div><div class="oc-pie-legend">'+[[p.enFechaPct,p.enFecha,'oc-green','Terminadas en fecha'],[p.atrasadasPct,p.atrasadas,'oc-red','Terminadas con atraso'],[p.vencidasPct,p.vencidas,'oc-overdue','Vencidas sin fecha real']].map(([pct,count,color,text])=>'<p><span class="'+color+'">● '+text+'</span><strong>'+percent(pct)+'</strong><span>'+count+' de '+p.total+' etapas</span></p>').join('')+'</div></div>':'<p class="oc-note">Sin etapas terminadas o vencidas con fecha prevista válida.</p>')+'<p class="oc-in-time oc-yellow">● Sin vencer · '+(r.porEtapa[phase].enPlazo||0)+' etapas (incluye las que vencen hoy). Fuera del porcentaje de atraso.</p></article>';}).join('')+'</div>';}
 function completedDistribution(r){return '<div class="oc-pies">'+phases.map(([phase,label])=>{const p=pieData(r.porEtapa[phase]);return '<article class="oc-pie-card"><h3>'+label+' · '+p.total+' etapas con fechas cargadas</h3>'+(p.total?'<div class="oc-pie-body"><div class="oc-pie" role="img" aria-label="'+esc(label+': '+percent(p.enFechaPct)+' en fecha ('+p.enFecha+'), '+percent(p.atrasadasPct)+' con atraso ('+p.atrasadas+'). Total: '+p.total+' etapas con fecha prevista y real.')+'" style="background:conic-gradient(#75c895 0% '+p.enFechaPct+'%,#e56c73 '+p.enFechaPct+'% 100%)"></div><div class="oc-pie-legend"><p><span class="oc-green">● En fecha</span><strong>'+percent(p.enFechaPct)+'</strong><span>'+p.enFecha+' de '+p.total+' etapas</span></p><p><span class="oc-red">● Con atraso</span><strong>'+percent(p.atrasadasPct)+'</strong><span>'+p.atrasadas+' de '+p.total+' etapas</span></p></div></div>':'<p class="oc-note">Sin etapas con fecha prevista y fecha real cargadas para estos filtros.</p>')+'</article>';}).join('')+'</div>';}
 function monthly(r){return '<div class="oc-months"><table><caption>Cumplimiento por mes de la fecha prevista comparada</caption><thead><tr><th>Mes</th>'+phases.map(([,label])=>'<th>'+label+' · % en fecha</th>').join('')+'</tr></thead><tbody>'+r.meses.map(m=>'<tr><th>'+m.mes.slice(5,7)+'/'+m.mes.slice(0,4)+'</th>'+phases.map(([phase])=>{const s=m[phase];return '<td><div class="oc-month-rate"><span>'+percent(s.cumplimiento)+'</span><div class="oc-meter" role="img" aria-label="'+esc(percent(s.cumplimiento)+' en fecha sobre '+s.evaluadas+' etapas evaluadas')+'"><span style="width:'+(s.cumplimiento??0)+'%"></span></div></div><small>'+s.enFecha+'/'+s.evaluadas+' terminadas en fecha · '+s.atrasadas+' con atraso</small></td>';}).join('')+'</tr>').join('')+'</tbody></table></div>';}
 function lateChart(rows){
  const late=rows.filter(r=>['atrasada','vencida'].includes(r.status)).slice(0,15),max=Math.max(1,...late.map(r=>r.dias));
  return '<h3>Mayores atrasos · hasta 15 etapas</h3><p class="o2-muted">Solo etapas con fecha prevista válida. El atraso confirmado llega hasta la fecha real; el de etapas vencidas sin fecha real se mide hasta hoy.</p>'+ (late.length?late.map(r=>'<div class="oc-late-row"><div><b>OT '+esc(r.ot||'Sin OT')+' · '+r.label+'</b><small>'+esc(r.cliente)+' · '+esc(r.desc)+'</small><small>'+format(r.prevista)+' → '+(r.status==='atrasada'?format(r.real):'sin fecha real')+'</small></div><div class="oc-late-track"><div class="'+(r.status==='atrasada'?'oc-bad':'oc-pending')+'" style="width:'+Math.max(2,100*r.dias/max)+'%"></div></div><b>'+r.dias+' días</b></div>').join(''):'<p>No hay atrasos para los filtros seleccionados.</p>');
 }
 function table(rows){return '<div class="o2-table oc-detail"><table><caption>Detalle de fechas y cumplimiento · '+rows.length+' etapas</caption><thead><tr><th>CT/OT · cliente / obra</th><th>Etapa</th><th>Prevista comparada</th><th>Prevista vigente</th><th>Real</th><th>Situación</th><th>Atraso</th><th></th></tr></thead><tbody>'+rows.map(r=>'<tr><td><b>'+esc(r.ot||'Sin OT')+' · '+esc(r.cliente)+'</b><div>'+esc(r.desc)+'</div></td><td>'+r.label+'</td><td>'+format(r.prevista)+'<small>'+(r.usaOriginal?'Primera conservada':'Vigente')+'</small></td><td>'+format(r.vigente)+'</td><td>'+format(r.real)+'</td><td class="'+(r.status==='atrasada'?'oc-red':r.status==='vencida'?'oc-overdue':r.status==='en-fecha'?'oc-green':'')+'">'+labels[r.status]+'</td><td>'+(r.dias?r.dias+' días'+(r.status==='vencida'?' a hoy':''):r.status==='en-fecha'?'0 días':'—')+'</td><td>'+(r.archivada?'<small>Archivada</small>':'<button class="btn btn-ghost btn-sm" data-o2-edit="'+esc(r.id)+'">Ver seguimiento</button>')+'</td></tr>').join('')+'</tbody></table></div>';}
 function install(w){
  const d=w.document;let state={tab:'listado',filters:{desde:'',hasta:'',etapa:'',query:'',referencia:'original',base:'planificacion'},situacion:'todas'},lastRoot=null,lastEmail='',panel;
  function style(){if(d.getElementById('oc-style'))return;const el=d.createElement('style');el.id='oc-style';el.textContent=`
  #obras2-root [hidden]{display:none!important}.oc-tabs{display:flex;gap:8px;border-bottom:1px solid var(--border,#444);margin:18px 0}.oc-tabs button{padding:12px 18px;border:0;border-bottom:3px solid transparent;background:transparent;color:var(--text2,#aaa);font:inherit;cursor:pointer}.oc-tabs button[aria-selected=true]{color:var(--accent,#e8b84b);border-color:var(--accent,#e8b84b)}
  #obras2-cumplimiento{font-size:13px}.oc-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.oc-card,.oc-chart{border:1px solid var(--border,#444);background:var(--surface,#191919);padding:20px;border-radius:10px;margin-bottom:18px}.oc-card h3{font-size:16px}.oc-rate{font-size:38px;color:var(--accent,#e8b84b);display:block;margin:8px 0}.oc-card p{margin:7px 0}.oc-green{color:#75c895}.oc-red{color:#ff8f8f}.oc-yellow{color:#edb85e}.oc-overdue{color:#ff4655;font-weight:600}
  .oc-controls{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0;align-items:end}.oc-controls label{display:grid;gap:6px;font-size:12px}.oc-controls input,.oc-controls select{background:var(--surface3,#222);color:var(--text,#eee);border:1px solid var(--border,#444);border-radius:6px;padding:9px;max-width:100%}.oc-controls input[type=search]{width:250px}.oc-legend{display:flex;gap:15px;flex-wrap:wrap;margin:12px 0;font-size:12px}.oc-distribution{margin:16px 0}.oc-stack{display:flex;min-height:28px;overflow:hidden;border-radius:5px;background:#333;margin-top:6px}.oc-stack span{display:flex;align-items:center;justify-content:center;color:#101010;min-width:0;overflow:hidden}.oc-good{background:#75c895}.oc-bad{background:#e56c73}.oc-pending{background:#ef3340}.oc-rest{background:#777}
  .oc-pies{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin-top:18px}.oc-pie-card{padding:16px;border:1px solid var(--border,#444);border-radius:8px}.oc-pie-card h3{font-size:14px;margin-bottom:20px}.oc-pie-body{display:flex;align-items:center;justify-content:center;gap:28px;flex-wrap:wrap}.oc-pie{width:210px;height:210px;border-radius:50%;flex-shrink:0}.oc-pie-legend p{display:grid;gap:5px;margin:16px 0}.oc-pie-legend strong{font-size:25px}.oc-pie-legend p>span:last-child{color:var(--text2,#aaa);font-size:12px}@media(max-width:850px){.oc-pies{grid-template-columns:1fr}}
  .oc-months{overflow:auto}.oc-months table{border-collapse:collapse;width:100%;min-width:600px}.oc-months th,.oc-months td{padding:14px 10px;text-align:left;border-bottom:1px solid var(--border,#444)}.oc-months td{width:44%}.oc-months caption,.oc-detail caption{text-align:left;font-weight:600;font-size:16px;padding:0 0 15px;color:var(--text,#eee)}.oc-month-rate{display:flex;gap:12px;align-items:center}.oc-month-rate>span{width:65px;flex-shrink:0}.oc-meter{height:12px;flex:1;background:#444;border-radius:3px;overflow:hidden}.oc-meter>span{display:block;height:100%;background:#75c895}.oc-months small,.oc-detail small{display:block;color:var(--text2,#aaa);margin-top:5px}.oc-late-row{display:grid;grid-template-columns:minmax(180px,1fr) minmax(100px,2fr) 70px;gap:16px;align-items:center;margin:18px 0}.oc-late-row small{display:block;color:var(--text2,#aaa);font-size:11px;overflow-wrap:anywhere}.oc-late-track{background:#333;height:20px;border-radius:4px;overflow:hidden}.oc-late-track>div{height:100%}.oc-detail td:nth-child(1){min-width:240px;max-width:360px;white-space:normal!important}.oc-detail td:nth-child(4),.oc-detail td:nth-child(5){min-width:0;white-space:nowrap}.oc-note{line-height:1.7;margin:12px 0;color:var(--text2,#aaa)}
  @media(max-width:750px){.oc-cards{grid-template-columns:1fr}.oc-late-row{grid-template-columns:minmax(140px,1fr) 1fr 55px;gap:8px}.oc-chart,.oc-card{padding:14px}}
  `;d.head.appendChild(el);}
  function results(){
   if(!panel||state.tab!=='cumplimiento')return;
   const target=panel.querySelector('[data-oc-results]');
   try{
    const groups=w.TIZObrasSeguimientoV2.getStatisticsGroups(),r=indicatorReport(groups,state.filters),shown=visibleRows(r.rows,state.situacion);
    target.innerHTML='<div class="oc-cards">'+cards(r)+'</div><p class="oc-note">'+(r.base==='planificacion'?'Base: etapas terminadas con ambas fechas válidas y etapas abiertas con fecha prevista vencida. Sin fecha prevista, sin fecha real en obras ya cerradas, fechas reales futuras y etapas todavía en plazo quedan fuera del porcentaje. En fecha + atraso confirmado + vencidas sin fecha real = 100%.':'Base: solo etapas terminadas con fecha prevista y real válidas. En fecha + atraso confirmado = 100%.')+' Se incluyen obras archivadas y se excluyen bajas.</p>'+(r.excluidas?'<p class="oc-note">Fuera del porcentaje: '+r.excluidas.sinPrevista+' etapas sin fecha prevista · '+r.excluidas.enPlazo+' todavía en plazo o que vencen hoy · '+r.excluidas.sinRealCerradas+' cerradas sin fecha real · '+r.excluidas.realFutura+' con fecha real futura.</p>':'')+(r.rows.length||r.excluidas?.enPlazo?'<section class="oc-chart"><h3>Cumplimiento · etapas evaluadas según fechas cargadas</h3>'+distribution(r)+'</section><section class="oc-chart">'+monthly(r)+'</section><section class="oc-chart">'+lateChart(r.rows)+'</section>':'<p class="oc-note">No hay etapas evaluables con fechas válidas para los filtros seleccionados.</p>')+(shown.length?table(shown):'<p class="oc-note">No hay etapas para la situación seleccionada en el detalle.</p>');
    panel.querySelector('[data-oc-export]').disabled=!shown.length;
   }catch(e){target.innerHTML='<p role="alert" class="o2-error">'+esc(e.message)+'</p>';panel.querySelector('[data-oc-export]').disabled=true;}
  }
  function toggle(root){
   const active=state.tab==='cumplimiento';panel.hidden=!active;
   for(const el of root.children)if(el.classList.contains('o2-filter')||el.classList.contains('o2-table'))el.hidden=active;
   root.querySelectorAll('[data-oc-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.ocTab===state.tab)));
   if(active)results();
  }
  function render(){
   if(!w.currentUser||w.currentPage!=='obras')return;
   const root=d.getElementById('obras2-root');if(!root)return;style();
   if(lastRoot!==root){
    if(lastEmail!==w.currentUser.email){state={tab:'listado',filters:{desde:'',hasta:'',etapa:'',query:'',referencia:'original',base:'planificacion'},situacion:'todas'};lastEmail=w.currentUser.email;}
    lastRoot=root;const tabs=d.createElement('div');tabs.className='oc-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Vistas de Obras');tabs.innerHTML='<button role="tab" id="oc-list-tab" data-oc-tab="listado" aria-selected="true">Listado de obras</button><button role="tab" id="oc-report-tab" data-oc-tab="cumplimiento" aria-selected="false" aria-controls="obras2-cumplimiento">Cumplimiento</button>';root.insertBefore(tabs,root.querySelector('.o2-filter'));
    panel=d.createElement('section');panel.id='obras2-cumplimiento';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','oc-report-tab');panel.hidden=true;panel.innerHTML='<h2>Cumplimiento de la planificación</h2><p class="oc-note">Compará Producción y Colocación con las fechas cargadas. La vista de planificación incluye las etapas vencidas sin fecha real; las etapas sin fecha prevista no entran en los porcentajes. El período y los meses corresponden a la fecha prevista comparada. La primera fecha conservada permite ver atrasos aunque se haya reprogramado; cuando no existe, se usa la vigente. Los filtros del listado de Obras no limitan este informe.</p><div class="oc-controls"><label>Desde · prevista<input type="date" data-oc-filter="desde"></label><label>Hasta · prevista<input type="date" data-oc-filter="hasta"></label><label>Base del indicador<select data-oc-filter="base"><option value="planificacion">Terminadas + vencidas sin finalizar</option><option value="terminadas">Solo terminadas · ambas fechas</option></select></label><label>Etapa<select data-oc-filter="etapa"><option value="">Producción y colocación</option><option value="produccion">Producción</option><option value="colocacion">Colocación</option></select></label><label>Comparar contra<select data-oc-filter="referencia"><option value="original">Primera fecha conservada</option><option value="vigente">Fecha prevista vigente</option></select></label><label>Buscar obra<input type="search" data-oc-filter="query" placeholder="CT/OT, cliente o descripción"></label><label>Situación · solo detalle<select data-oc-situation><option value="todas">Todas las evaluadas</option><option value="incidencias">Con atraso · terminadas o vencidas</option><option value="atrasada">Terminadas con atraso</option><option value="vencida">Vencidas sin fecha real</option><option value="en-fecha">En fecha</option></select></label><button class="btn btn-ghost btn-sm" data-oc-export>Descargar detalle CSV</button></div><div data-oc-results aria-live="polite"></div>';root.appendChild(panel);
    for(const el of panel.querySelectorAll('[data-oc-filter]'))el.value=state.filters[el.dataset.ocFilter];panel.querySelector('[data-oc-situation]').value=state.situacion;
    tabs.addEventListener('click',e=>{const b=e.target.closest('[data-oc-tab]');if(b){state.tab=b.dataset.ocTab;toggle(root);}});
    panel.addEventListener('input',e=>{e.stopPropagation();if(e.target.dataset.ocFilter){state.filters[e.target.dataset.ocFilter]=e.target.value;results();}});
    panel.addEventListener('change',e=>{e.stopPropagation();if(e.target.hasAttribute('data-oc-situation'))state.situacion=e.target.value;else if(e.target.dataset.ocFilter)state.filters[e.target.dataset.ocFilter]=e.target.value;results();});
    panel.querySelector('[data-oc-export]').addEventListener('click',()=>{try{const r=indicatorReport(w.TIZObrasSeguimientoV2.getStatisticsGroups(),state.filters),url=w.URL.createObjectURL(new w.Blob([csv(visibleRows(r.rows,state.situacion))],{type:'text/csv;charset=utf-8'})),a=d.createElement('a');a.href=url;a.download='TIZ-cumplimiento-'+C.day()+'.csv';a.click();w.setTimeout(()=>w.URL.revokeObjectURL(url),1000);}catch(e){w.showToast?.(e.message);}});
   }
   toggle(root);
  }
  const refresh=()=>{if(d.visibilityState!=='hidden')render();};w.setInterval?.(refresh,60000);w.addEventListener?.('focus',refresh);d.addEventListener('visibilitychange',refresh);
  api.render=render;if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',render);else render();
 }
 const api={report,completedReport,planningReport,indicatorReport,planningPieData,pieData,distribution,summary,visibleRows,csv,install,labels};return api;
});



