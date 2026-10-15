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
 // One quality queue entry per OT; preserve every source row/description.
 function motherWorks(source=[], works=[], internalRecords=[]){
  const base=v=>{const m=text(v).match(/\d{4,7}/);return m?String(Number(m[0])):'';},groups=new Map();
  for(const r of source){
   if(!['pendiente','cobrado pendiente'].includes(norm(r.status).replace(/[_\s]+/g,' ')))continue;
   const ot=base(r.ot),key=ot?'ot:'+ot:'fila:'+r.row;
   if(!groups.has(key))groups.set(key,{key,ot,sourceRows:[],descriptions:[],clients:[],statuses:[]});
   const g=groups.get(key);g.sourceRows.push(r.row);
   for(const [field,value] of [['descriptions',r.desc],['clients',r.cliente],['statuses',r.status]])if(text(value)&&!g[field].includes(text(value)))g[field].push(text(value));
  }
  return [...groups.values()].map(g=>{
   const matches=g.ot?works.filter(o=>base(o.ot)===g.ot&&!o.archivado&&o.revisionVigente!==false&&o.revisionOperativa!==false):[];
   // Do not guess among duplicate operational works; the queue still shows the source reference.
   const work=matches.length===1?matches[0]:null;
   const reference=(g.ot?'OT '+g.ot+' · ':'')+g.clients.join(' / ')+' · '+g.descriptions.join(' / ');
   const rs=work?Object.values(work.calidadGestion?.registros||{}):internalRecords.filter(r=>norm(r.referencia)===norm(reference)),last=rs.filter(r=>DECISIONS.includes(r.decision)).sort((a,b)=>String(b.creadoEn||'').localeCompare(String(a.creadoEn||'')))[0];
   return {...g,id:work?.id||'',desc:g.descriptions.join(' / '),cliente:g.clients.join(' / '),status:g.statuses.join(' / '),calidadEstado:last?.decision||'Sin revisar',referencia:reference};
  }).sort((a,b)=>Number(b.ot||0)-Number(a.ot||0)||a.sourceRows[0]-b.sourceRows[0]);
 }
 function metrics(db={}){
  const rs=rows(db),decided=rs.filter(r=>DECISIONS.includes(r.decision)),workIds=new Set(decided.map(r=>r.obraId).filter(Boolean));
  const counts=Object.fromEntries(DECISIONS.map(d=>[d,decided.filter(r=>r.decision===d).length]));
  const byCause={};for(const r of decided){if(r.decision==='Aprobado'||!r.causa)continue;const key=r.causa+' · '+(r.subcausa||'Sin subcausa');byCause[key]=(byCause[key]||0)+1;}
  const patterns=Object.entries(byCause).map(([key,count])=>({key,count,rate:decided.length?100*count/decided.length:0})).sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key,'es'));
  return {decided:decided.length,controlledWorks:workIds.size,approved:counts['Aprobado']||0,rejected:counts['Rechazado']||0,deviations:counts['Aprobado con desvío']||0,firstPassRate:decided.length?100*(counts['Aprobado']||0)/decided.length:0,incidenceRate:decided.length?100*((counts['Rechazado']||0)+(counts['Aprobado con desvío']||0))/decided.length:0,patterns};
 }
 return {TYPES,STAGES,AREAS,CATEGORIES,DECISIONS,CAUSES,SUBCAUSES,day,norm,canRecord,canControl,isDeviationAuthorizer,validateDecision,pending,clean,registerPatch,closeRecord,rows,metrics,motherWorks};
});
