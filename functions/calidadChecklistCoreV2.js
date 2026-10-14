/* Checklists por obra: misma validación en formulario y servidor. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZChecklistCoreV2=api;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const STAGES={produccion:'Aprobación para Producción',colocacion:'Liberación para Colocación',resultado:'Resultado de la Colocación'};
 const PREVIOUS={colocacion:'produccion',resultado:'colocacion'},STATES=['Pendiente','Conforme','No conforme','No aplica'];
 const PLANNERS=['info@tizpublicidad.com','pablo.aciar@tizpublicidad.com','julieta.aguirre@tizpublicidad.com'];
 const T=v=>String(v??'').trim(),norm=v=>T(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const canWrite=u=>!!u&&!u.restrictedColocaciones;
 const canEdit=(stage,u)=>canWrite(u)&&!(u.restrictedChecklists&&stage==='produccion');
 const canValidate=(stage,u)=>canEdit(stage,u)&&(stage==='resultado'||u.isAdmin||u.sector==='Calidad'||PLANNERS.includes(norm(u.email)));
 const DEFAULTS={
  produccion:['Alcance, piezas y cantidades definidos','Plano o archivo vigente identificado','Medidas y relevamiento revisados','Materiales y terminaciones definidos para esta obra','Procesos y responsables definidos','Criterios de aceptación acordados','Plazos y destino de entrega acordados'],
  colocacion:['Piezas completas según alcance aprobado','Medidas y terminaciones controladas','Armado y pruebas funcionales revisados cuando corresponda','Observaciones de calidad resueltas','Identificación y embalaje verificados','Plano de montaje y destino confirmados','Fecha, acceso y contacto en obra confirmados'],
  resultado:['Piezas recibidas completas y sin daños','Montaje y fijaciones revisados','Nivel, alineación y ubicación verificados','Pruebas funcionales realizadas cuando corresponda','Terminación y limpieza revisadas','Fotos finales y observaciones registradas','Resultado y conformidad del cliente registrados']
 };
 function template(stage){if(!STAGES[stage])throw Error('Etapa inválida.');return DEFAULTS[stage].map(titulo=>({titulo,criterio:'',estado:'Pendiente',nota:''}));}
 function date(v){const s=T(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s+'T12:00:00Z'))||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s)throw Error('Indicá una fecha válida.');return s;}
 function clean(input,user,at,current={},previous=null,day=today()){
  if(!canWrite(user))throw Error('Tu cuenta no puede completar estos formularios.');
  const stage=T(input.etapa);if(!canEdit(stage,user))throw Error('El plan de Producción lo prepara Pablo o Juli.');if(!STAGES[stage])throw Error('Etapa inválida.');
  if(Number(input.revisionEsperada||0)!==Number(current.revision||0))throw Error('El checklist cambió. Volvé a abrirlo antes de guardar.');
  const out={etapa:stage,estado:input.validar===true?'Validado':'Borrador',revision:Number(current.revision||0)+1,fecha:date(input.fecha),creadoEn:at,creadoPor:T(user.email)};
  for(const k of ['obraId','ot','cliente','descripcion','alcance','referenciaPlano','preparadoPor','seguimiento','observaciones','evidencia','conformidad']){out[k]=T(input[k]);if(out[k].length>(['alcance','observaciones'].includes(k)?2400:600))throw Error('El campo '+k+' es demasiado largo.');}
  if(!out.descripcion||!out.cliente)throw Error('Indicá cliente y descripción de la obra.');
  if(out.fecha>day)throw Error('La fecha no puede ser futura.');
  if(!Array.isArray(input.items)||!input.items.length||input.items.length>40)throw Error('El checklist debe tener entre 1 y 40 puntos.');
  out.items=input.items.map(item=>{const r={};for(const k of ['titulo','criterio','estado','nota']){r[k]=T(item[k]);if(r[k].length>600)throw Error('Un punto del checklist es demasiado largo.');}if(!r.titulo||!STATES.includes(r.estado))throw Error('Completá el nombre y estado de cada punto.');if(r.estado==='No aplica'&&!r.nota)throw Error('Explicá por qué el punto no aplica.');return r;});
  if(out.evidencia){let url;try{url=new URL(out.evidencia);}catch(_){throw Error('El enlace de evidencia no es válido.');}if(url.protocol!=='https:'||url.username||url.password)throw Error('Usá un enlace HTTPS para la evidencia.');}
  out.anteriorEtapa=PREVIOUS[stage]||'';out.anteriorRevision=previous?.revision||0;
  if(out.estado==='Validado'){
   if(!canValidate(stage,user))throw Error('La aprobación de esta etapa corresponde a Pablo, Juli, Calidad o Administración.');
   if(!out.alcance||!out.preparadoPor||!out.seguimiento)throw Error('Completá alcance, responsable del formulario y responsable de seguimiento.');
   if(out.items.some(r=>!['Conforme','No aplica'].includes(r.estado)||r.estado==='Conforme'&&!r.criterio))throw Error('No se puede aprobar: faltan criterios o hay puntos pendientes/no conformes.');
   if(PREVIOUS[stage]&&previous?.estado!=='Validado')throw Error('Primero debe aprobarse el checklist de la etapa anterior.');
   if(stage==='resultado'&&(!out.evidencia||!out.conformidad))throw Error('Para cerrar el resultado, registrá fotos finales y resultado/conformidad.');
   out.validadoPor=T(user.email);out.validadoEn=at;
  }
  return out;
 }
 function fresh(record,records={}){if(!record)return false;const prev=PREVIOUS[record.etapa];return !prev||!!records[prev]&&records[prev].estado==='Validado'&&records[prev].revision===record.anteriorRevision&&fresh(records[prev],records);}
 function status(record,records={}){if(!record)return 'Sin iniciar';return record.estado==='Validado'&&!fresh(record,records)?'Revisar: cambió la etapa anterior':record.estado;}
 function docId(key,stage){if(!/^[a-f0-9]{32}$/.test(key)||!STAGES[stage])throw Error('Identificador de formulario inválido.');return key+'_'+stage;}
 return {STAGES,PREVIOUS,STATES,PLANNERS,T,norm,today,canWrite,canEdit,canValidate,template,date,clean,fresh,status,docId};
});
