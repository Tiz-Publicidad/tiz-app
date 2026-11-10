/* Shared operations only: no commercial or fiscal data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZColocacionesGeneralCore=api})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const text=v=>String(v??'').trim(), norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function iso(v){const s=text(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';const d=new Date(s+'T12:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===s?s:''}
  function shift(v,n){const d=new Date(iso(v)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
  function week(v){if(!iso(v))return {label:'Sin fecha',start:'',end:''};const d=new Date(v+'T12:00:00Z'),start=shift(v,1-(d.getUTCDay()||7)),thursday=new Date(shift(start,3)+'T12:00:00Z'),year=thursday.getUTCFullYear(),jan4=`${year}-01-04`,janD=new Date(jan4+'T12:00:00Z'),first=shift(jan4,1-(janD.getUTCDay()||7)),number=1+Math.round((new Date(start+'T12:00:00Z')-new Date(first+'T12:00:00Z'))/604800000);return {start,end:shift(start,6),number,year,label:`${year}-W${String(number).padStart(2,'0')}`}}
  const open=a=>['Pendiente','Bloqueada'].includes(a.estado);
  const overdue=(a,day)=>scheduled(a)&&!!iso(a.fecha)&&a.fecha<=shift(day,-2);
  const ARIEL='arielbenitezpublicidad@gmail.com';
  const requestFields=['solicitudExterna','estadoSolicitud','solicitadaPor','solicitadaEn','solicitudFechaOriginal','respuestaPor','respuestaEn','respuestaMotivo','confirmadaPor','confirmadaEn','historialSolicitud'];
  function requestMetadata(old,next,email,at){
    const meta=Object.fromEntries(requestFields.filter(k=>old?.[k]!==undefined).map(k=>[k,old[k]]));
    const external=text(email).toLowerCase()!==ARIEL, assigned=isAriel(next);
    const changed=!!old&&['titulo','fecha','responsable','direccion','zona','hora','duracion','todoDia'].some(k=>text(old[k])!==text(next[k]));
    if(external&&assigned&&open(next)&&(!old||changed))Object.assign(meta,{solicitudExterna:true,estadoSolicitud:'Pendiente de Ariel',solicitadaPor:email,solicitadaEn:at,solicitudFechaOriginal:next.fecha||'',respuestaPor:'',respuestaEn:'',respuestaMotivo:'',confirmadaPor:'',confirmadaEn:''});
    if(external&&old?.solicitudExterna&&!assigned&&changed)meta.estadoSolicitud='Reasignada';
    return meta;
  }
  function respondRequest(old,response,day,at,email){
    old=asRequest(old);
    if(text(email).toLowerCase()!==ARIEL)throw new Error('Sólo Ariel puede responder esta solicitud.');
    if(!old?.solicitudExterna||!isAriel(old)||!open(old)||!['Pendiente de Ariel','Confirmada por Ariel','Aceptada por Ariel','Reprogramada por Ariel'].includes(old.estadoSolicitud))throw new Error('Esta solicitud ya no está disponible para responder.');
    const decision=response.decision,motivo=text(response.motivo).slice(0,2000);
    if(!['aceptar','rechazar','reprogramar'].includes(decision))throw new Error('Elegí una respuesta válida.');
    if(decision==='aceptar'&&old.estadoSolicitud!=='Pendiente de Ariel')throw new Error('Esta solicitud ya fue aceptada.');
    if(decision!=='aceptar'&&!motivo)throw new Error('Indicá el motivo para informar a quien cargó la acción.');
    if(decision==='reprogramar'&&(!iso(response.fecha)||response.fecha<day||response.fecha===old.fecha))throw new Error('Indicá una nueva fecha de hoy o posterior, distinta de la actual.');
    const acceptedBefore=!!old.fechaAceptadaOriginal||['Aceptada por Ariel','Confirmada por Ariel','Reprogramada por Ariel'].includes(old.estadoSolicitud);
    const why=decision==='reprogramar'?cause(response,motivo):null;
    const estadoSolicitud={aceptar:'Aceptada por Ariel',rechazar:'Rechazada por Ariel',reprogramar:'Reprogramada por Ariel'}[decision];
    const acceptedChange=decision==='aceptar'&&acceptedBefore&&old.fechaAceptadaVigente&&old.fechaAceptadaVigente!==old.fecha;
    return {...old,...(acceptedChange?{historialPlan:{...(old.historialPlan||{}),[at.replace(/[^a-z0-9]/gi,'')]:{tipo:'reprogramacion',anterior:old.fechaAceptadaVigente,nueva:old.fecha,usuario:email,fecha:at,...cause(old)}}}:{}),...(decision!=='rechazar'?{fechaAceptadaOriginal:old.fechaAceptadaOriginal||(decision==='reprogramar'?response.fecha:old.fecha),fechaPlanOriginal:old.fechaPlanOriginal||(decision==='reprogramar'?response.fecha:old.fecha),fechaAceptadaVigente:decision==='reprogramar'?response.fecha:old.fecha,responsablePlanOriginal:old.responsablePlanOriginal||old.responsable}:{}),estadoSolicitud,respuestaPor:email,respuestaEn:at,respuestaMotivo:motivo,actualizadoPor:email,actualizadoEn:at,
      historialSolicitud:{...(old.historialSolicitud||{}),[at.replace(/[^a-z0-9]/gi,'')]:{decision,motivo,...(why?{causa:why.motivo,responsabilidad:why.responsabilidad}:{}),afectaPlan:acceptedBefore,fechaAnterior:old.fecha||'',fechaNueva:decision==='reprogramar'?response.fecha:old.fecha||'',usuario:email,fecha:at}},
      ...(decision==='rechazar'?{estado:'Cancelada',resultado:'Solicitud rechazada: '+motivo,gestionadaPor:email,gestionadaEn:at,fechaReal:day}:{}),
      ...(decision==='reprogramar'?{fecha:response.fecha,fechaAnterior:old.fecha||''}:{}),
      ...(decision!=='rechazar'?{confirmadaPor:email,confirmadaEn:at}:{})};
  }
  function resolveDraftAction(old,result,next,day,at,email){
    if(!open(old))throw new Error('Esta acción ya fue gestionada.');
    if(!text(result.detalle)||!iso(result.fechaReal))throw new Error('Completá el resultado y la fecha real.');
    if(next){next=cleanAction(next);validate(next);if(next.fecha<day)throw new Error('La próxima acción debe tener fecha de hoy o posterior.');}
    if(!next&&old.tipo==='Colocación'&&!['conforme','aprobado'].includes(norm(result.control||old.control)))throw new Error('Registrá control conforme para terminar una colocación.');
    return {closed:{...old,control:result.control===undefined?old.control||'':text(result.control),retrabajo:result.retrabajo===undefined?old.retrabajo||'':text(result.retrabajo),cantidadReal:result.cantidadReal===undefined?old.cantidadReal||'':text(result.cantidadReal),estado:next?'Reprogramada':'Cerrada',resultado:text(result.detalle),fechaReal:result.fechaReal,gestionadaEn:at,gestionadaPor:email,actualizadoEn:at,actualizadoPor:email,siguienteId:next?.id||''},next:next?{...next,anteriorId:old.id,creadoEn:at,creadoPor:email,actualizadoEn:at,actualizadoPor:email}:null};
  }
  function correctClosedAction(old,fields,day,at,email){
    if(open(old))throw new Error('Esta acción sigue abierta. Usá la edición habitual.');
    if(fields.fecha!==undefined&&fields.fecha!==old.fecha)throw new Error('El compromiso original se conserva para medir el cumplimiento.');
    const next={...old},before={},after={};
    const limits={titulo:500,responsable:160,observaciones:2000,resultado:3000};
    for(const key of Object.keys(limits)){const value=fields[key]??(key==='resultado'?fields.detalle:undefined);if(value===undefined)continue;const v=text(value);if(v.length>limits[key])throw new Error('El campo '+key+' supera el máximo permitido.');if(key==='titulo'&&!v)throw new Error('Escribí la acción.');next[key]=v;}
    for(const key of ['fechaApertura','fechaReal'])if(fields[key]!==undefined){const v=text(fields[key]);if(v&&!iso(v))throw new Error('Fecha inválida.');if(key==='fechaReal'&&(!v||v>day))throw new Error('La fecha real debe ser una fecha válida de hoy o anterior.');next[key]=v;}
    if(next.fechaApertura&&next.fechaReal&&next.fechaApertura>next.fechaReal)throw new Error('La apertura no puede ser posterior al cierre real.');
    if(fields.control!==undefined)next.control=text(fields.control);if(fields.retrabajo!==undefined)next.retrabajo=text(fields.retrabajo);
    if(old.tipo==='Colocación'&&old.estado==='Cerrada'&&!['conforme','aprobado'].includes(norm(next.control)))throw new Error('La colocación cerrada debe conservar un control conforme.');
    for(const key of ['titulo','responsable','observaciones','resultado','fechaApertura','fechaReal','control','retrabajo'])if((old[key]||'')!==(next[key]||'')){before[key]=old[key]||'';after[key]=next[key]||'';}
    if(!Object.keys(after).length)return old;
    next.correcciones={...(old.correcciones||{}),[at.replace(/[^a-z0-9]/gi,'')]:{antes:before,despues:after,motivo:text(fields.motivo).slice(0,1000),fecha:at,usuario:email}};next.actualizadoEn=at;next.actualizadoPor=email;return next;
  }
  const visit=a=>['Relevamiento','Colocación','Entrega','Control final'].includes(a.tipo);
  function zone(address,explicit=''){if(text(explicit))return ['caba','capital federal','ciudad autonoma de buenos aires'].includes(norm(explicit))?'CABA':text(explicit);const n=' '+norm(address)+' ';if(/\b(caba|capital federal|ciudad autonoma de buenos aires)\b/.test(n))return 'CABA';return ''}
  function validate(a,{draft=false}={}){if(!text(a.titulo))throw new Error('Escribí la acción.');if(text(a.titulo).length>500)throw new Error('La acción supera 500 caracteres.');if(a.fechaApertura&&!iso(a.fechaApertura))throw new Error('Fecha de apertura inválida.');if(a.fecha&&!iso(a.fecha))throw new Error('Fecha inválida.');if(!draft&&(!iso(a.fecha)||!text(a.responsable)))throw new Error('Completá responsable y fecha de compromiso.');if(a.todoDia===false&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.hora||'')||!Number.isFinite(+a.duracion)||+a.duracion<15||+a.duracion>1440))throw new Error('Hora o duración inválida.');return a}
  function cleanAction(a){const out={};for(const k of ['id','titulo','tipo','responsable','fecha','fechaApertura','prioridad','contactoId','estado','observaciones','direccion','zona','tipoTrabajo','cliente','referencia','hora','cantidadReal','control','retrabajo','motivoReprogramacion','detalleReprogramacion','responsabilidadReprogramacion'])out[k]=text(a[k]);if(Array.isArray(a.datosPlanilla))out.datosPlanilla=a.datosPlanilla.slice(0,22).filter(p=>Array.isArray(p)&&p.length===2).map(p=>p.map(v=>text(v).slice(0,3000)));out.estado=['Pendiente','Bloqueada'].includes(out.estado)?out.estado:'Pendiente';out.todoDia=a.todoDia!==false;out.duracion=Number(a.duracion)||60;out.aviso=Number(a.aviso)||0;return validate(out,{draft:true})}
  function nearby(rows,anchor,day){if(!anchor||!visit(anchor.accion))return [];const z=zone(anchor.accion.direccion,anchor.accion.zona);if(!z)return [];const end=week(day).end;return rows.filter(r=>r.key!==anchor.key&&scheduled(r.accion)&&r.accion.estado!=='Bloqueada'&&visit(r.accion)&&norm(zone(r.accion.direccion,r.accion.zona))===norm(z)&&(!r.accion.fecha||r.accion.fecha<=end)).map(r=>{const sameWork=!!anchor.tipoTrabajo&&norm(anchor.tipoTrabajo)===norm(r.tipoTrabajo),sameType=r.accion.tipo===anchor.accion.tipo;return {...r,score:2+(sameWork?2:0)+(sameType?1:0),motivo:`Misma zona: ${z}${sameWork?' · mismo tipo de obra':''}${sameType?' · misma tarea':''}${r.accion.fecha&&r.accion.fecha<day?' · pendiente vencido':''}`}}).sort((a,b)=>b.score-a.score||(a.accion.fecha||'9999').localeCompare(b.accion.fecha||'9999'))}
  function planPatch(o,selected,day,id,email,at){if(!iso(day))throw new Error('Indicá el día de salida.');if(o.colocacionesGestion?.cierre?.cerrada)throw new Error('La colocación está cerrada.');const p={};for(const item of selected){const a=o.colocacionesGestion?.acciones?.[item.actionId];if(!a||!scheduled(a)||a.estado==='Bloqueada'||!visit(a))throw new Error('Una acción cambió o no admite visita. Volvé a revisar.');if(text(a.actualizadoEn||a.creadoEn)!==text(item.version)||text(a.fecha)!==text(item.fecha))throw new Error('Una acción fue modificada. Volvé a revisar.');p[`colocacionesGestion.acciones.${a.id}`]={...a,fecha:day,salidaId:id,fechaAnterior:a.fecha||'',actualizadoEn:at,actualizadoPor:email};p[`colocacionesGestion.eventos.salida${id}${a.id}`]={accion:`Salida agrupada: ${a.titulo}. Compromiso anterior ${a.fecha||'sin fecha'}; nueva fecha ${day}`,fecha:at,usuario:email}}p['colocacionesGestion.actualizadoEn']=at;p['colocacionesGestion.actualizadoPor']=email;return p}
  function report(o,contacts=[],legacy=[]){const g=o.colocacionesGestion||{};return {ot:text(o.ot),cliente:text(o.cliente),descripcion:text(o.desc),direccion:text(g.direccion||o.entregaLogistica?.domicilio||o.direccion),zona:text(g.zona),modalidad:text(g.modalidad),tipoTrabajo:text(g.tipoTrabajo),contactos:contacts.map(c=>({nombre:text(c.nombre),cargo:text(c.cargo),telefono:text(c.telefono),email:text(c.email)})),acciones:[...Object.values(g.acciones||{}),...legacy].map(a=>({titulo:text(a.titulo),tipo:text(a.tipo),fecha:text(a.fecha),responsable:text(a.responsable),prioridad:text(a.prioridad),estado:text(a.estado),observaciones:text(a.observaciones),contacto:contacts.find(c=>c.id===a.contactoId)?.nombre||'',hora:text(a.hora),duracion:Number(a.duracion)||0,direccion:text(a.direccion),zona:text(a.zona),fechaReal:text(a.fechaReal),resultado:text(a.resultado),cantidadReal:text(a.cantidadReal),control:text(a.control),retrabajo:text(a.retrabajo)})),preparacion:Object.entries(g.preparacion||{}).map(([k,v])=>({paso:k,estado:text(v.estado),detalle:text(v.detalle),url:text(v.url),fecha:text(v.fecha),destinatario:contacts.find(c=>c.id===v.contactoId)?.nombre||''})),notas:Object.values(g.notas||{}).map(n=>({tipo:text(n.tipo),texto:text(n.texto),fecha:text(n.fecha)}))}}
  const REPLAN_CAUSES=Object.freeze([['cliente','Cliente / aprobación'],['acceso','Acceso a la obra'],['produccion','Producción no terminada'],['materiales','Materiales / insumos'],['planos','Planos / información faltante'],['capacidad','Capacidad / personal'],['coordinacion','Planificación / coordinación'],['transporte','Transporte / herramientas'],['clima','Clima'],['calidad','Calidad / retrabajo'],['otro','Otro'],['investigacion','En investigación']]);
  const RESPONSIBILITIES=Object.freeze([['interna','Interna · TIZ'],['externa','Externa'],['mixta','Mixta'],['pendiente','Pendiente de analizar']]);
  const isAriel=a=>/(^| )(ariel|ari)( |$)/.test(norm(a?.responsable))||text(a?.responsable).toLowerCase()===ARIEL;
  const canReview=email=>['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com','giancarlo.pareja@gmail.com'].includes(text(email).toLowerCase());
  function asRequest(a){if(a?.solicitudExterna)return a;const creator=text(a?.creadoPor).toLowerCase();return isAriel(a)&&creator.includes('@')&&creator!==ARIEL?{...a,solicitudExterna:true,estadoSolicitud:a.estadoSolicitud||'Pendiente de Ariel'}:a;}
  function needsAcceptance(a){a=asRequest(a);return isAriel(a)&&!!a?.solicitudExterna&&!['Aceptada por Ariel','Confirmada por Ariel','Reprogramada por Ariel'].includes(a.estadoSolicitud);}
  const scheduled=a=>open(a)&&!needsAcceptance(a);
  function cause(input={},fallback=''){
    const motivo=text(input.motivoReprogramacion||input.causa)||'otro',detalle=text(input.detalleReprogramacion||input.motivo||fallback),responsabilidad=text(input.responsabilidadReprogramacion||input.responsabilidad)||'pendiente';
    if(!REPLAN_CAUSES.some(([id])=>id===motivo)||!RESPONSIBILITIES.some(([id])=>id===responsabilidad))throw Error('Seleccioná una causa y una atribución válidas.');
    if(detalle.length<5||detalle.length>3000)throw Error('Explicá el motivo de la reprogramación con entre 5 y 3000 caracteres.');
    return {motivo,detalle,responsabilidad};
  }
  function closureStatus(a){const r=a?.revisionCierre,declared=iso(a?.fechaReal||a?.fecha);if(!r)return 'Histórico sin validar';return r.fechaDeclarada!==declared?'Pendiente':r.estado||'Pendiente';}
  function governAction(old,next,email,at,whole=false){
    let a={...next};const realKey=whole?'fecha':'fechaReal',closed=whole?a.cerrada:a.estado==='Cerrada';
    const protectedKeys=['revisionCierre','fechaAceptadaOriginal','fechaPlanOriginal','fechaAceptadaVigente','responsablePlanOriginal','historialPlan'];
    for(const k of protectedKeys){delete a[k];if(old?.[k]!==undefined)a[k]=old[k];}
    if(!whole){
      a.creadoPor=old?.creadoPor||email;a.creadoEn=old?.creadoEn||a.creadoEn||at;
      for(const k of requestFields){delete a[k];if(old?.[k]!==undefined)a[k]=old[k];}
      Object.assign(a,requestMetadata(old?asRequest(old):null,a,email,at));
      if(isAriel(a)&&scheduled(a)){
        a.fechaAceptadaOriginal=old?.fechaAceptadaOriginal||old?.fechaPlanOriginal||iso(old?.fecha)||iso(a.fecha);
        a.fechaPlanOriginal=a.fechaAceptadaOriginal;a.responsablePlanOriginal=old?.responsablePlanOriginal||a.responsable;
        a.fechaAceptadaVigente=iso(a.fecha);
      }
      const moved=!!old&&iso(old.fecha)&&iso(a.fecha)!==iso(old.fecha)&&open(old);
      if(moved){if(!text(a.motivoReprogramacion))throw Error('Elegí la causa de la reprogramación.');const why=cause(a),accepted=!needsAcceptance(a);a.historialPlan={...(old.historialPlan||{}),[at.replace(/[^a-z0-9]/gi,'')]:{tipo:accepted?'reprogramacion':'cambioSolicitado',anterior:old.fecha,nueva:a.fecha,usuario:email,fecha:at,...why}};}
      if(closed&&old&&needsAcceptance(old))throw Error('Ariel debe aceptar el pedido antes de registrar su cierre.');
    }
    if(closed&&!(!old&&a.datosPlanilla?.length&&!a.fechaReal)){
      const real=iso(a[realKey]);if(!real||real>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(at)))throw Error('La fecha real debe ser válida, de hoy o anterior.');
      const changed=!old||(whole?!old.cerrada:old.estado!=='Cerrada')||[realKey,'resultado','control','responsable'].some(k=>text(old?.[k])!==text(a[k]));
      if(changed){a.revisionCierre={estado:'Pendiente',fechaDeclarada:real,solicitadaEn:at,solicitadaPor:email,historial:{...(old?.revisionCierre?.historial||{}),[at.replace(/[^a-z0-9]/gi,'')+'declaracion']:{estado:'Declarado',fechaDeclarada:real,fechaAnterior:iso(old?.[realKey]),resultado:text(a.resultado),usuario:email,fecha:at}}};}
    }
    a.actualizadoEn=at;a.actualizadoPor=email;return a;
  }
  function governPatch(work,patch,email,at){
    const out={...patch},g=work.colocacionesGestion||{},actions=new Map();let closure;
    for(const [key,value]of Object.entries(patch)){
      if(key==='colocacionesGestion.acciones')throw Error('Guardá cada acción por su identidad.');
      if(key.startsWith('colocacionesGestion.acciones.')){const parts=key.split('.'),id=parts[2];if(!/^[\w-]{1,150}$/.test(id))throw Error('Identidad de acción inválida.');let next=actions.get(id)||{...(g.acciones?.[id]||{})};if(parts.length===3)next={...value};else{if(parts.length!==4||['__proto__','constructor','prototype'].includes(parts[3]))throw Error('Campo de acción inválido.');next[parts[3]]=value;}actions.set(id,next);delete out[key];}
      if(key==='colocacionesGestion.cierre'){closure={...value};delete out[key];}
      else if(key.startsWith('colocacionesGestion.cierre.')){closure||={...(g.cierre||{})};const parts=key.split('.');if(parts.length!==3)throw Error('La revisión del cierre se registra desde Validar cierres.');closure[parts[2]]=value;delete out[key];}
    }
    for(const [id,next]of actions){out['colocacionesGestion.acciones.'+id]=governAction(g.acciones?.[id],{...next,id},email,at);}
    if(closure){const next=governAction(g.cierre,closure,email,at,true);out['colocacionesGestion.cierre']=next;if(next.cerrada&&closureStatus(next)!=='Aprobado'){for(const key of ['sectores.colocaciones.real','sectores.colocaciones.estado','sectores.colocaciones.instalada'])delete out[key];}}
    return out;
  }
  function reviewClosure(old,input,day,at,email,whole=false){
    if(!canReview(email))throw Error('Sólo Giancarlo puede validar los cierres.');
    if(whole?!old?.cerrada:old?.estado!=='Cerrada')throw Error('Este registro no tiene un cierre para validar.');
    const declared=iso(whole?old.fecha:old.fechaReal),decision=text(input.decision),detail=text(input.detalle),valid=iso(input.fechaValidada||declared);
    if(!['aprobar','observar'].includes(decision))throw Error('Elegí aprobar u observar el cierre.');
    if(decision==='aprobar'&&(!valid||valid>day))throw Error('La fecha validada debe ser de hoy o anterior.');
    if(detail.length>3000||(decision==='observar'||valid!==declared)&&detail.length<5)throw Error('Explicá la observación o corrección de fecha con al menos 5 caracteres.');
    const previous=old.revisionCierre||{},event={estado:decision==='aprobar'?'Aprobado':'Observado',fechaDeclarada:declared,fechaValidada:decision==='aprobar'?valid:'',detalle:detail,usuario:email,fecha:at};
    return {...old,revisionCierre:{...event,historial:{...(previous.historial||{}),[at.replace(/[^a-z0-9]/gi,'')]:event}},actualizadoEn:at,actualizadoPor:email};
  }
  function controlReport(rows,{desde='',hasta='',responsable='Ariel',query=''}={},day=''){
    if(desde&&!iso(desde)||hasta&&!iso(hasta)||desde&&hasta&&desde>hasta)throw Error('Revisá el período del informe.');
    let unlinked=0;const groups=new Map(),events=[],requests=rows.filter(r=>open(r.accion)&&needsAcceptance(r.accion)),all=new Map(rows.map(r=>[r.key,r]));
    const owner=a=>{const saved={...a,responsable:a.responsablePlanOriginal||a.responsable};return !responsable||(norm(responsable)==='ariel'?isAriel(saved):norm(saved.responsable)===norm(responsable));};
    function root(r){let a=r,seen=new Set();while(a.accion.anteriorId){if(seen.has(a.key))break;seen.add(a.key);const previous=all.get(a.key.slice(0,a.key.lastIndexOf('/')+1)+a.accion.anteriorId);if(!previous)break;a=previous;}return a.key;}
    const chains=new Map();for(const r of rows){const id=root(r),list=chains.get(id)||[];list.push(r);chains.set(id,list);}
    for(const [id,list]of chains){
      const first=all.get(id)||list[0],a=first.accion;if(!list.some(r=>owner(r.accion)))continue;
      if(query&&!norm([first.obra.ot,first.cliente,first.obra.desc,...list.map(r=>r.accion.titulo)].join(' ')).includes(norm(query)))continue;
      const baseline=iso(a.fechaAceptadaOriginal||a.fechaPlanOriginal)||(!needsAcceptance(a)?iso(a.fecha):'');
      if(!baseline||desde&&baseline<desde||hasta&&baseline>hasta)continue;if(first.draft){unlinked++;continue;}
      const history=[];for(const r of list){const x=r.accion;for(const [hid,h]of Object.entries(x.historialPlan||{}))if(h.tipo==='reprogramacion')history.push({...h,id:r.key+':plan:'+hid});for(const [hid,h]of Object.entries(x.historialSolicitud||{}))if(h.decision==='reprogramar'&&h.afectaPlan!==false)history.push({id:r.key+':solicitud:'+hid,tipo:'reprogramacion',anterior:h.fechaAnterior,nueva:h.fechaNueva,motivo:h.causa||'otro',detalle:h.motivo||'',responsabilidad:h.responsabilidad||'pendiente',fecha:h.fecha,usuario:h.usuario});if(x.estado==='Reprogramada')history.push({id:r.key+':continuacion',tipo:'reprogramacion',anterior:x.fecha,nueva:all.get(r.key.slice(0,r.key.lastIndexOf('/')+1)+x.siguienteId)?.accion.fecha||'',motivo:x.motivoReprogramacion||'otro',detalle:x.detalleReprogramacion||x.resultado||'',responsabilidad:x.responsabilidadReprogramacion||'pendiente',fecha:x.gestionadaEn||x.actualizadoEn||'',usuario:x.gestionadaPor||''});}
      const terminal=list.find(r=>!r.accion.siguienteId)||list[list.length-1],x=terminal.accion,review=closureStatus(x),closed=x.estado==='Cerrada',real=iso(x.revisionCierre?.fechaValidada),verified=closed&&review==='Aprobado'&&real&&(!day||real<=day)&&(x.tipo!=='Colocación'||['conforme','aprobado'].includes(norm(x.control))),replanned=history.length>0||list.length>1,cancelled=list.every(r=>r.accion.estado==='Cancelada')||norm(responsable)==='ariel'&&isAriel({responsable:a.responsablePlanOriginal})&&!isAriel(x);
      const unit=first.draft?'sinOT/'+a.id:otGroup(first),unitData=groups.get(unit)||{key:unit,obraId:first.obra.id,ot:first.obra.ot||'Sin OT',cliente:first.cliente||'',descripcion:first.obra.desc||'',chains:[],events:[]};
      const status=cancelled?'cancelada':closed&&!verified?(review==='Observado'?'observada':'por-validar'):verified?(real<=baseline?'en-fecha':'tardia'):baseline<day?'vencida':'pendiente';
      unitData.chains.push({key:terminal.key,whole:!!terminal.whole,fecha:baseline,status,real:verified?real:'',declarada:iso(x.fechaReal),titulo:x.titulo,responsable:x.responsable,replanned,closed,verified,review});
      for(const event of history){const e={...event,ot:first.obra.ot||'Sin OT',cliente:first.cliente||'',obraId:first.obra.id};unitData.events.push(e);events.push(e);}groups.set(unit,unitData);
    }
    const result=[...groups.values()].map(g=>{const whole=g.chains.find(c=>c.whole),live=whole?[whole]:g.chains.filter(c=>c.status!=='cancelada'),done=live.length>0&&live.every(c=>c.verified),replanned=g.chains.some(c=>c.replanned),observed=live.some(c=>c.status==='observada'),pendingReview=live.some(c=>c.status==='por-validar'),overdue=live.some(c=>c.status==='vencida'),due=live.some(c=>c.fecha<=day||c.closed);return {...g,done,replanned,due,pendingReview:pendingReview||observed,status:!live.length?'cancelada':observed?'observada':pendingReview?'por-validar':replanned?'reprogramada':done?(live.some(c=>c.status==='tardia')?'tardia':'en-fecha'):overdue?'vencida':'pendiente'};}).sort((a,b)=>String(a.ot).localeCompare(String(b.ot),'es',{numeric:true}));
    const buckets=[['en-fecha','Cumplidas en fecha','#43b581'],['tardia','Cumplidas con atraso','#dd8d46'],['reprogramada','Reprogramadas','#9b7be5'],['por-validar','Cierres por validar','#e8b84b'],['observada','Cierres observados','#d56b91'],['vencida','Pendientes vencidas','#e05c5c'],['pendiente','Pendientes en plazo','#6b8cb5'],['cancelada','Canceladas o reasignadas','#777']].map(([key,label,color])=>({key,label,color,total:result.filter(g=>g.status===key).length}));
    const causes=new Map();for(const e of events){const key=e.motivo||'otro',a=causes.get(key)||{key,eventos:0,obras:new Set(),detalles:[]};a.eventos++;a.obras.add(e.ot==='Sin OT'?'sinOT/'+e.id:e.ot+'|'+e.cliente);a.detalles.push(e);causes.set(key,a);}
    const evaluated=result.filter(g=>g.due&&g.status!=='cancelada');
    return {unlinked,rows:result,total:result.length,done:result.filter(g=>g.done).length,replanned:result.filter(g=>g.replanned).length,pendingReview:result.filter(g=>g.pendingReview).length,evaluated:evaluated.length,percent:evaluated.length?Math.round(100*evaluated.filter(g=>g.done).length/evaluated.length):null,requests:requests.length,buckets,events,causes:[...causes.values()].map(a=>({...a,obras:a.obras.size})).sort((a,b)=>b.eventos-a.eventos||a.key.localeCompare(b.key))};
  }
  function otGroup(r){return norm(r.obra.ot)?norm(r.obra.ot).replace(/^0+(?=\d)/,'')+'|'+norm(r.cliente):r.obra.id;}

  return {REPLAN_CAUSES,RESPONSIBILITIES,isAriel,asRequest,needsAcceptance,scheduled,canReview,cause,closureStatus,governAction,governPatch,reviewClosure,controlReport,ARIEL,requestMetadata,respondRequest,text,norm,iso,shift,week,open,overdue,resolveDraftAction,correctClosedAction,visit,zone,validate,cleanAction,nearby,planPatch,report};
});

