/* TIZ Calidad: registros por OT, seguimiento y liberaciones por etapa. */
(function(root,factory){const core=factory();if(typeof module==='object'&&module.exports)module.exports=core;else root.TIZCalidadCore=core;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const TYPES=['Anomalía','Liberación','Control aleatorio'],STAGES=['Materiales','Diseño','Producción','Salida a colocación','Entrega'],AREAS=['Producción','Impresiones','Diseño','Compras','Colocaciones','Calidad'],CATEGORIES=['Medidas','Material','Color / impresión','Terminación','Armado / fijaciones','Electricidad / iluminación','Embalaje','Documentación','Otro'];
 const DECISIONS=['Aprobado','Rechazado','Aprobado con desvío'];
 const CAUSES=['Planos / medidas','Diseño','Herrería','Carpintería','Pintura','Gráfica / impresión','Iluminación / eléctrica','Armado','Terminación','Embalaje','Despacho','Colocación','Materiales / Compras','Otro'];
 const text=x=>String(x??'').trim(),norm=x=>text(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function date(v){const s=text(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s+'T12:00:00Z'))||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s)throw Error('Ingresá una fecha válida.');return s;}
 const canRecord=u=>!!u&&!u.restrictedColocaciones;
 const canControl=u=>canRecord(u)&&(u.isAdmin||u.sector==='Calidad'||norm(u.email)==='pablo.aciar@tizpublicidad.com');
 const DEVIATION_AUTHORIZERS=['gian','giancarlo','pablo'];
 const SUBCAUSES={
  'Planos / medidas':['Medida incorrecta','Pieza faltante','Material equivocado','Archivo desactualizado','Otro'],
  'Diseño':['Archivo incorrecto','Versión desactualizada','Escala incorrecta','Especificación incompleta','Otro'],
  'Herrería':['Medida incorrecta','Escuadra / nivel','Soldadura','Material incorrecto','Terminación','Otro'],
  'Carpintería':['Medida incorrecta','Corte / mecanizado','Armado','Material incorrecto','Terminación','Otro'],
  'Pintura':['Color incorrecto','Mala terminación','Rayado','Contaminación','Cobertura insuficiente','Otro'],
  'Gráfica / impresión':['Color incorrecto','Escala / medida','Impresión defectuosa','Laminado','Corte','Otro'],
  'Iluminación / eléctrica':['LED / módulo','Fuente / driver','Cableado','Tensión incorrecta','Falla de encendido','Otro'],
  'Armado':['Pieza faltante','Fijación','Alineación','Montaje incorrecto','Otro'],
  'Terminación':['Rayado','Golpe','Suciedad','Borde / canto','Detalle estético','Otro'],
  'Embalaje':['Protección insuficiente','Identificación incorrecta','Pieza suelta','Embalaje dañado','Otro'],
  'Despacho':['Faltante','Destino incorrecto','Documentación','Carga / manipulación','Otro'],
  'Colocación':['Medida de obra','Fijación','Nivel / alineación','Daño en montaje','Terminación en sitio','Otro'],
  'Materiales / Compras':['Material incorrecto','Cantidad insuficiente','Material dañado','Especificación incorrecta','Otro'],
  'Otro':['Otro']
 };
 const isDeviationAuthorizer=u=>!!u&&(u.isAdmin||DEVIATION_AUTHORIZERS.some(k=>norm(u.name).includes(k)||norm(u.email).includes(k)));
 function validateDecision(fields,user,at){
  const decision=text(fields.decision||fields.decisionFinal);
  if(!DECISIONS.includes(decision))throw Error('Seleccioná Aprobado, Rechazado o Aprobado con desvío.');
  const out={decision};
  if(decision!=='Aprobado'){
   const cause=text(fields.cause||fields.causa),subcause=text(fields.subcause||fields.subcausa);
   if(!CAUSES.includes(cause))throw Error('Seleccioná la causa del rechazo o desvío.');
   if(!(SUBCAUSES[cause]||[]).includes(subcause))throw Error('Seleccioná una subcausa válida.');
   out.causa=cause;out.subcausa=subcause;
  }
  if(decision==='Aprobado con desvío'){
   if(!isDeviationAuthorizer(user))throw Error('El desvío sólo puede ser autorizado por Gian, Pablo o Administración.');
   const reason=text(fields.deviationReason||fields.motivoDesvio);
   if(!reason)throw Error('Indicá el motivo de autorización del desvío.');
   out.autorizacionDesvio={autorizadoPor:user.email||user.name,autorizadoEn:at,motivo:reason};
  }
  return out;
 }
 const pending=r=>r.estado==='Pendiente';
 function clean(fields,user,at,today=day()){
  if(!canRecord(user))throw Error('Tu cuenta no puede registrar Calidad.');
  if(!TYPES.includes(fields.tipo))throw Error('Seleccioná el tipo de registro.');
  if(fields.tipo!=='Anomalía'&&!canControl(user))throw Error('Los controles y liberaciones los registra Calidad, Pablo o Administración.');
  const r={};for(const k of ['id','obraId','referencia','tipo','etapa','area','categoria','fecha','detalle','criterio','responsable','vencimiento','resultado','evidencia'])r[k]=text(fields[k]);
  if(!/^[\w-]{1,150}$/.test(r.id)||r.obraId&&!/^[\w-]{1,150}$/.test(r.obraId))throw Error('Identificador inválido.');
  if(!AREAS.includes(r.area)||!CATEGORIES.includes(r.categoria))throw Error('Seleccioná área y categoría.');
  r.fecha=date(r.fecha);if(r.fecha>today)throw Error('La fecha del registro no puede ser futura.');
  if(r.vencimiento)r.vencimiento=date(r.vencimiento);
  if(!r.detalle||!r.responsable)throw Error('Completá qué ocurrió o qué revisaste y el responsable.');
  if(!r.obraId&&!r.referencia)throw Error('Elegí una OT o indicá la máquina, proceso o sector interno.');
  if(r.evidencia){let u;try{u=new URL(r.evidencia);}catch(_){throw Error('El enlace de evidencia no es válido.');}if(u.protocol!=='https:'||u.username||u.password)throw Error('Usá un enlace HTTPS para la evidencia.');}
  if(Object.values(r).some(v=>v.length>3000))throw Error('El texto excede el máximo de 3000 caracteres.');
  if(r.tipo==='Anomalía'){
   if(!['Menor','Mayor','Crítica'].includes(fields.gravedad))throw Error('Seleccioná la gravedad.');
   if(!r.vencimiento)throw Error('Indicá cuándo se debe resolver la anomalía.');
   r.gravedad=fields.gravedad;r.resultado='No conforme';r.estado='Pendiente';
  }else{
   if(!STAGES.includes(r.etapa)||!r.criterio)throw Error('Indicá etapa y criterio de aceptación.');
   if(r.tipo==='Liberación'){
    if(!r.obraId)throw Error('La liberación debe estar vinculada a una OT.');
    if(!['Liberado','Retenido'].includes(r.resultado))throw Error('Seleccioná Liberado o Retenido.');
   }else{
    if(!['Conforme','No conforme'].includes(r.resultado))throw Error('Seleccioná el resultado del control.');
    for(const k of ['lote','revisadas','defectuosas']){if(text(fields[k])==='')throw Error('Completá las cantidades del control.');r[k]=Number(fields[k]);if(!Number.isSafeInteger(r[k])||r[k]<0)throw Error('Las cantidades deben ser números enteros.');}
    if(r.lote<1||r.revisadas<1||r.revisadas>r.lote||r.defectuosas>r.revisadas)throw Error('Revisadas debe estar entre 1 y el lote; defectuosas no puede superar revisadas.');
    if((r.defectuosas>0)!==(r.resultado==='No conforme'))throw Error('El resultado debe coincidir con la cantidad de unidades defectuosas.');
   }
   r.estado=['Retenido','No conforme'].includes(r.resultado)?'Pendiente':'Registrado';
   if(pending(r)&&!r.vencimiento)throw Error('Indicá cuándo se resolverá el resultado no conforme.');
  }
  r.creadoEn=at;r.creadoPor=user.email;r.historial=[{evento:'Registro creado',fecha:at,usuario:user.email}];return r;
 }
 function registerPatch(work,record){
  if(!work||work.id!==record.obraId||work.archivado||work.revisionVigente===false||work.revisionOperativa===false)throw Error('La OT no está disponible.');
  const rows=work.calidadGestion?.registros||{};if(rows[record.id])throw Error('Ese registro ya existe.');
  if(record.tipo==='Liberación'&&record.resultado==='Liberado'&&Object.values(rows).some(pending))throw Error('Esta OT tiene anomalías o resultados retenidos pendientes. Resolvelos antes de liberar.');
  const patch={[`calidadGestion.registros.${record.id}`]:record};
  if(pending(record)||record.tipo==='Liberación'&&record.etapa==='Salida a colocación'){
   const approved=record.tipo==='Liberación'&&record.resultado==='Liberado';
   Object.assign(patch,{'sectores.calidad.estado':approved?'Aprobado':'Observado','sectores.calidad.aprobado':approved,'sectores.calidad.actualizadoAt':record.creadoEn,'sectores.calidad.actualizadoPor':record.creadoPor,'sectores.calidad.ultimoRegistroId':record.id});
  }
  return patch;
 }
 function closeRecord(record,fields,user,at,today=day()){
  if(!canControl(user))throw Error('Sólo Calidad, Pablo o Administración pueden verificar y cerrar pendientes.');
  if(!pending(record))throw Error('El registro ya está cerrado o no requiere cierre.');
  const action=text(fields.accion),verification=text(fields.verificacion),real=date(fields.fechaReal);
  if(!action||!verification)throw Error('Indicá la corrección realizada y cómo verificaste el resultado.');
  if(action.length>3000||verification.length>3000)throw Error('El texto excede el máximo.');
  if(real>today||real<record.fecha)throw Error('La fecha de cierre debe estar entre la apertura y hoy.');
  return {...record,estado:'Cerrado',accion:action,verificacion:verification,fechaReal:real,cerradoEn:at,cerradoPor:user.email,historial:[...(record.historial||[]),{evento:'Corrección verificada',fecha:at,usuario:user.email}]};
 }
 function rows(db={}){return [...(db.obras||[]).flatMap(o=>Object.values(o.calidadGestion?.registros||{}).map(r=>({...r,obraId:o.id,ot:o.ot,cliente:o.cliente,obra:o.desc||o.descripcion||''}))),...(db.calidad||[]).map(r=>({...r,obraId:''}))].sort((a,b)=>String(b.creadoEn).localeCompare(String(a.creadoEn)));}
 function metrics(db={}){
  const rs=rows(db),decided=rs.filter(r=>DECISIONS.includes(r.decision)),workIds=new Set(decided.map(r=>r.obraId).filter(Boolean));
  const counts=Object.fromEntries(DECISIONS.map(d=>[d,decided.filter(r=>r.decision===d).length]));
  const byCause={};for(const r of decided){if(r.decision==='Aprobado'||!r.causa)continue;const key=r.causa+' · '+(r.subcausa||'Sin subcausa');byCause[key]=(byCause[key]||0)+1;}
  const patterns=Object.entries(byCause).map(([key,count])=>({key,count,rate:decided.length?100*count/decided.length:0})).sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key,'es'));
  return {decided:decided.length,controlledWorks:workIds.size,approved:counts['Aprobado']||0,rejected:counts['Rechazado']||0,deviations:counts['Aprobado con desvío']||0,firstPassRate:decided.length?100*(counts['Aprobado']||0)/decided.length:0,incidenceRate:decided.length?100*((counts['Rechazado']||0)+(counts['Aprobado con desvío']||0))/decided.length:0,patterns};
 }
 return {TYPES,STAGES,AREAS,CATEGORIES,DECISIONS,CAUSES,SUBCAUSES,day,norm,canRecord,canControl,isDeviationAuthorizer,validateDecision,pending,clean,registerPatch,closeRecord,rows,metrics};
});
(() => {
 if(typeof document==='undefined')return;
 const C=window.TIZCalidadCore,E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let tab='dashboard',query='',filter='Todos',form=null,busy=false;
 const user=()=>window.currentUser,all=()=>C.rows(window.DB),option=(xs,value='')=>xs.map(x=>`<option value="${E(x)}" ${x===value?'selected':''}>${E(x)}</option>`).join('');
 function render(){
  const host=document.getElementById('calidad-root');if(!host||user()?.restrictedColocaciones)return;
  if(document.activeElement?.id==='q1-query'){renderList();return;}
  const rows=all(),open=rows.filter(C.pending),late=open.filter(r=>r.vencimiento&&r.vencimiento<C.day()),samples=rows.filter(r=>r.tipo==='Control aleatorio'),checked=samples.reduce((n,r)=>n+r.revisadas,0),bad=samples.reduce((n,r)=>n+r.defectuosas,0);
  host.innerHTML=`<div class="q1-top"><div><h2>Calidad</h2><p>Anomalías, controles y liberaciones de TIZ · cada registro conserva quién lo cargó y verificó.</p></div>${C.canRecord(user())?'<button class="btn btn-primary" data-q-new>＋ Nuevo registro</button>':''}</div><div class="q1-tabs">${[['dashboard','Dashboard'],['pendientes','Pendientes'],['historico','Histórico']].map(([k,l])=>`<button class="btn ${tab===k?'btn-primary':'btn-ghost'}" data-q-tab="${k}">${l}</button>`).join('')}</div>${tab==='dashboard'?`<div class="q1-kpis">${[['Pendientes',open.length],['Vencidos',late.length],['Liberaciones registradas',rows.filter(r=>r.tipo==='Liberación'&&r.resultado==='Liberado').length],['Unidades revisadas',checked]].map(([l,v])=>`<div class="card"><strong>${v}</strong><span>${l}</span></div>`).join('')}</div><p class="q1-muted">${checked?`${bad} unidades defectuosas de ${checked} revisadas (${(100*bad/checked).toFixed(1)}%). Son controles registrados, no una estimación de toda la producción.`:'Los indicadores se calculan sobre los registros cargados; no se presume que una obra está aprobada.'}</p><details class="card q1-guide"><summary>Qué revisar según el trabajo</summary><p><b>Letras / carteles:</b> medidas y plano vigente, armado, terminación, iluminación cuando corresponda, identificación y embalaje.</p><p><b>Impresiones / vinilos:</b> archivo aprobado, escala, color de referencia, corte, laminado y terminación.</p><p><b>Antes de colocar:</b> piezas completas, medidas del relevamiento, documentación, embalaje y observaciones resueltas.</p><p><b>Para ampliar el sector:</b> causas de retrabajo, reclamos de clientes, controles de recepción de materiales, auditorías 5S y seguimiento de acciones correctivas. Se pueden comenzar como anomalías o controles internos.</p><p>El criterio se define para cada trabajo; los registros no reemplazan la revisión técnica ni cierran la obra.</p></details>`:''}<label class="q1-search"><i class="ti ti-search" aria-hidden="true"></i><input id="q1-query" type="search" aria-label="Buscar registros de calidad" placeholder="Buscar obra, cliente, OT, responsable o anomalía" value="${E(query)}"></label><label>Tipo de registro <select id="q1-filter">${option(['Todos',...C.TYPES],filter)}</select></label><div id="q1-list"></div>`;
  renderList();
 }
 function renderList(){const el=document.getElementById('q1-list');if(!el)return;const rows=all().filter(r=>(tab==='historico'||C.pending(r))&&(filter==='Todos'||r.tipo===filter)&&(!query||C.norm([r.ot,r.cliente,r.obra,r.referencia,r.detalle,r.responsable,r.categoria].join(' ')).includes(C.norm(query))));
  el.innerHTML=rows.length?rows.map(r=>`<article class="card q1-record"><div class="q1-top"><strong>${E(r.tipo)} · ${r.ot?'OT '+E(r.ot)+' · '+E(r.cliente)+' · '+E(r.obra):E(r.referencia)}</strong><span class="q1-state ${C.pending(r)?'q1-warning':''}">${E(r.estado)}${r.vencimiento&&C.pending(r)&&r.vencimiento<C.day()?' · Vencido':''}</span></div><p>${E(r.detalle)}</p><p class="q1-muted">${E(r.area)} · ${E(r.categoria)}${r.etapa?' · '+E(r.etapa):''} · ${E(r.fecha)} · Responsable: ${E(r.responsable)}${r.vencimiento?' · Plazo: '+E(r.vencimiento):''}</p><p>Resultado: <b>${E(r.resultado)}</b>${r.gravedad?' · Gravedad: '+E(r.gravedad):''}${r.tipo==='Control aleatorio'?` · Lote ${r.lote} · Revisadas ${r.revisadas} · Defectuosas ${r.defectuosas}`:''}</p>${r.criterio?'<p>Criterio: '+E(r.criterio)+'</p>':''}${r.accion?'<p>Corrección: '+E(r.accion)+'<br>Verificación: '+E(r.verificacion)+' · '+E(r.fechaReal)+'</p>':''}<small class="q1-muted">Cargó: ${E(r.creadoPor)}${r.cerradoPor?' · Verificó: '+E(r.cerradoPor):''}</small><div class="q1-tabs">${r.evidencia?`<a class="btn btn-ghost" href="${E(r.evidencia)}" target="_blank" rel="noopener noreferrer">Ver evidencia</a>`:''}${r.obraId?`<button class="btn btn-ghost" data-q-work="${E(r.obraId)}">Ficha de obra</button>`:''}${C.pending(r)&&C.canControl(user())?`<button class="btn btn-primary" data-q-close="${E(r.id)}" data-work="${E(r.obraId)}">Verificar y cerrar</button>`:''}</div></article>`).join(''):'<p class="q1-muted">No hay registros para esta vista.</p>';
 }
 function show(body){form=document.createElement('div');form.className='q1-overlay';form.innerHTML=`<div class="q1-dialog" role="dialog" aria-modal="true" aria-label="Registro de calidad">${body}</div>`;document.body.append(form);form.querySelector('input,select,textarea')?.focus();}
 const input=(title,name,type='text',value='',extra='')=>`<label>${title}<input name="${name}" type="${type}" value="${E(value)}" ${extra}></label>`;
 const area=(title,name,required=true)=>`<label>${title}<textarea name="${name}" maxlength="3000" rows="3" ${required?'required':''}></textarea></label>`;
 function newForm(){if(!C.canRecord(user()))return;const works=(window.DB?.obras||[]).filter(o=>!o.archivado&&o.revisionVigente!==false&&o.revisionOperativa!==false);show(`<h3>Nuevo registro de Calidad</h3><form data-q-form="new"><div class="q1-grid"><label>Tipo<select name="tipo" id="q1-type">${option(C.canControl(user())?C.TYPES:['Anomalía'])}</select></label><label>OT<select name="obraId"><option value="">Registro interno / sin OT</option>${works.map(o=>`<option value="${E(o.id)}">OT ${E(o.ot)} · ${E(o.cliente)} · ${E(o.desc||o.descripcion)}</option>`).join('')}</select></label>${input('Referencia interna (si no hay OT)','referencia','text','','maxlength="3000" placeholder="Ej.: laminadora / recepción de material"')}<label>Área<select name="area">${option(C.AREAS)}</select></label><label>Categoría<select name="categoria">${option(C.CATEGORIES)}</select></label>${input('Fecha del registro','fecha','date',C.day(),'required max="'+C.day()+'"')}${input('Responsable de seguimiento','responsable','text',user()?.name||'','required maxlength="160"')}${input('Resolver antes de (si hay una observación)','vencimiento','date')}<label data-q-anomaly>Gravedad<select name="gravedad">${option(['Menor','Mayor','Crítica'])}</select></label><label data-q-control>Etapa<select name="etapa">${option(C.STAGES)}</select></label><label data-q-control>Resultado<select name="resultado" id="q1-result"></select></label></div>${area('Qué ocurrió / qué se revisó','detalle')}<div data-q-control>${area('Criterio de aceptación / referencia al plano o muestra','criterio',false)}</div><div data-q-sample class="q1-grid">${input('Cantidad del lote','lote','number','','min="1" step="1"')}${input('Unidades revisadas','revisadas','number','','min="1" step="1"')}${input('Unidades defectuosas','defectuosas','number','0','min="0" step="1"')}</div><details><summary>Evidencia opcional</summary>${input('Enlace a fotos, plano o documento existente','evidencia','url','','placeholder="https://..."')}</details>${decisionFields()}<p class="q1-muted">Una liberación se registra por etapa. Salida a colocación actualiza Calidad en la ficha de la OT. No termina la obra.</p><p data-q-error role="alert"></p><div class="q1-tabs"><button type="submit" class="btn btn-primary">Guardar registro</button><button type="button" class="btn btn-ghost" data-q-cancel>Cancelar</button></div></form>`);typeChanged();decisionChanged();}
 function typeChanged(){const t=form.querySelector('[name=tipo]').value;for(const [sel,visible] of [['[data-q-anomaly]',t==='Anomalía'],['[data-q-control]',t!=='Anomalía'],['[data-q-sample]',t==='Control aleatorio']])form.querySelectorAll(sel).forEach(el=>{el.hidden=!visible;el.querySelectorAll('input,select,textarea').forEach(x=>x.disabled=!visible)});form.querySelector('#q1-result').innerHTML=option(t==='Liberación'?['Liberado','Retenido']:['Conforme','No conforme']);}
 function decisionFields(){
  return `<fieldset class="q1-decision"><legend>Decisión final de Calidad</legend><div class="q1-grid"><label>Estado<select name="decision" id="q1-decision">${option(C.DECISIONS)}</select></label><label data-q-cause>Causa<select name="cause" id="q1-cause"><option value="">Seleccionar...</option>${option(C.CAUSES)}</select></label><label data-q-subcause>Subcausa<select name="subcause" id="q1-subcause"><option value="">Seleccioná primero una causa</option></select></label></div><div data-q-deviation>${area('Motivo de autorización del desvío','deviationReason')}</div><p class="q1-muted" data-q-deviation>El desvío queda auditado con usuario y fecha. Sólo Gian, Pablo o Administración pueden autorizarlo.</p></fieldset>`;
 }
 function decisionChanged(){
  const d=form?.querySelector('#q1-decision')?.value||'Aprobado',needs=d!=='Aprobado',dev=d==='Aprobado con desvío';
  form?.querySelectorAll('[data-q-cause],[data-q-subcause]').forEach(el=>{el.hidden=!needs;el.querySelectorAll('select').forEach(x=>x.disabled=!needs)});
  form?.querySelectorAll('[data-q-deviation]').forEach(el=>{el.hidden=!dev;el.querySelectorAll('textarea').forEach(x=>x.disabled=!dev)});
 }
 function causeChanged(){
  const cause=form?.querySelector('#q1-cause')?.value||'',sel=form?.querySelector('#q1-subcause');if(!sel)return;
  sel.innerHTML='<option value="">Seleccionar...</option>'+option(C.SUBCAUSES[cause]||[]);
 }
 function closing(id,obraId){const r=all().find(r=>r.id===id&&r.obraId===obraId);if(!r||!C.canControl(user()))return;show(`<h3>Verificar y cerrar ${E(r.tipo)}</h3><p>${E(r.detalle)}</p><form data-q-form="close" data-id="${E(id)}" data-work="${E(obraId)}">${area('Corrección o acción realizada','accion')}${area('Cómo se verificó que quedó resuelto','verificacion')}${input('Fecha real de resolución','fechaReal','date',C.day(),'required')}<p class="q1-muted">Conserva el resultado original y el responsable. Cerrar una observación no libera automáticamente la OT.</p><p data-q-error role="alert"></p><div class="q1-tabs"><button class="btn btn-primary" type="submit">Confirmar cierre</button><button class="btn btn-ghost" type="button" data-q-cancel>Cancelar</button></div></form>`);}
 document.addEventListener('click',e=>{const b=e.target.closest?.('[data-q-tab],[data-q-new],[data-q-cancel],[data-q-close],[data-q-work]');if(!b||busy)return;if(b.hasAttribute('data-q-tab')){tab=b.dataset.qTab;render();}else if(b.hasAttribute('data-q-new'))newForm();else if(b.hasAttribute('data-q-cancel')){form?.remove();form=null;}else if(b.hasAttribute('data-q-work'))window.editObra?.(b.dataset.qWork);else closing(b.dataset.qClose,b.dataset.work);});
 document.addEventListener('input',e=>{if(e.target.id==='q1-query'){query=e.target.value;renderList();}});
 document.addEventListener('change',e=>{if(e.target.id==='q1-type')typeChanged();if(e.target.id==='q1-decision')decisionChanged();if(e.target.id==='q1-cause')causeChanged();if(e.target.id==='q1-filter'){filter=e.target.value;renderList();}});
 document.addEventListener('submit',async e=>{const f=e.target;if(!f.dataset.qForm)return;e.preventDefault();if(busy)return;const fields=Object.fromEntries(new FormData(f)),at=new Date().toISOString(),button=f.querySelector('[type=submit]');try{busy=true;button.disabled=true;f.setAttribute('aria-busy','true');if(f.dataset.qForm==='new'){const decision=C.validateDecision(fields,user(),at);const r={...C.clean({...fields,id:'q'+crypto.randomUUID().replace(/-/g,'')},user(),at),...decision};await window.saveCalidadV1({record:r});}else await window.saveCalidadV1({id:f.dataset.id,obraId:f.dataset.work,fields});form.remove();form=null;render();window.showToast?.('Registro de Calidad guardado ✓');}catch(err){f.querySelector('[data-q-error]').textContent=err.message||String(err);}finally{busy=false;button.disabled=false;f.removeAttribute('aria-busy');}});
 window.TIZCalidadV1={render,busy:()=>busy};
 const style=document.createElement('style');style.textContent=`#calidad-root{padding:24px;max-width:1500px}.q1-top,.q1-tabs{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.q1-tabs{justify-content:flex-start;margin:14px 0}.q1-muted,#calidad-root p,.q1-top p{color:var(--text2);font-size:13px;line-height:1.6}.q1-kpis,.q1-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.q1-kpis{grid-template-columns:repeat(4,minmax(0,1fr));margin:20px 0}.q1-kpis .card{padding:18px}.q1-kpis strong{display:block;font-size:28px;color:var(--green)}.q1-kpis span{display:block;font-size:12px;margin-top:7px}.q1-guide,.q1-record{padding:18px;margin:16px 0}.q1-state{font-size:12px;color:var(--green)}.q1-warning{color:var(--amber)}.q1-search{display:flex;gap:12px;align-items:center;margin:20px 0 14px}.q1-search input{width:100%}.q1-overlay{position:fixed;inset:0;background:#000b;z-index:20000;display:flex;align-items:center;justify-content:center;padding:16px}.q1-dialog{width:850px;max-width:100%;max-height:90vh;overflow:auto;background:var(--surface,#181818);border:1px solid var(--border);border-radius:12px;padding:24px}.q1-dialog label{display:block;font-size:12px;color:var(--text2);margin-bottom:12px}.q1-dialog input,.q1-dialog select,.q1-dialog textarea{width:100%;box-sizing:border-box;margin-top:6px;background:var(--surface3,#202020);color:var(--text,#f3f0e8);border:1px solid rgba(232,184,75,.38);border-radius:8px}.q1-dialog input:focus,.q1-dialog select:focus,.q1-dialog textarea:focus{outline:none;border-color:#e8b84b;box-shadow:0 0 0 2px rgba(232,184,75,.16)}.q1-dialog select option{background:#202020;color:#f3f0e8}.q1-decision{border:1px solid rgba(232,184,75,.28);border-radius:10px;padding:14px;margin:16px 0}.q1-decision legend{color:#e8b84b;padding:0 7px;font-weight:700}.q1-dialog [hidden]{display:none!important}.q1-dialog [data-q-error]{color:var(--red)}@media(max-width:700px){.q1-grid,.q1-kpis{grid-template-columns:1fr 1fr}#calidad-root{padding:16px}.q1-dialog{padding:16px}}@media(max-width:440px){.q1-grid{grid-template-columns:1fr}}`;document.head.append(style);
})();
