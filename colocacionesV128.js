/** TIZ Colocaciones V128 · agenda, contactos, gestiones y experiencia por obra. */
(() => {
  'use strict';
  const VERSION = 'TIZ-COLOCACIONES-V144-20261009';
  const TZ = 'America/Argentina/Buenos_Aires';
  const norm = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => 'a' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, '');
  const stamp = () => new Date().toISOString();
  const actor = () => window.currentUser?.email || '';
  const values = x => Object.values(x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const numOT = x => String(x ?? '').replace(/\D/g, '').replace(/^0+/, '');
  function isoDate(x) {
    if (!x) return '';
    if (x instanceof Date) return Number.isNaN(+x) ? '' : x.toISOString().slice(0, 10);
    const s = String(x).trim(), m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    const d = m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : s.slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
    const parsed = new Date(d+'T12:00:00Z');
    return !Number.isNaN(+parsed) && parsed.toISOString().slice(0,10) === d ? d : '';
  }
  function today(now = new Date()) {
    const p = new Intl.DateTimeFormat('en-US', {timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const v = k => p.find(x => x.type === k).value;
    return `${v('year')}-${v('month')}-${v('day')}`;
  }
  function shift(day, n) { const d = new Date(isoDate(day)+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
  const fmtDate = x => isoDate(x) ? isoDate(x).split('-').reverse().join('/') : 'Sin fecha';
  const data = o => o.colocacionesGestion || {};
  function quote(o, db) {
    const all = db?.presupuestos || [], direct = all.find(p => p.id === (o.presupuestoId || o.cotizacionId));
    if (direct) return direct;
    const matches = all.filter(p => numOT(p.nro) && numOT(p.nro) === numOT(o.ot) && p.revisionVigente !== false && !p.archivado);
    return matches.length === 1 ? matches[0] : {};
  }
  function logistics(o, db) {
    const q = quote(o, db), old = o.gestionSectores?.colocaciones || {}, canonical = o.sectores?.colocaciones || {};
    const source = {...(o.infoPresupuesto || {}), ...(o.entregaLogistica || {}), ...(q.entregaLogistica || {})};
    const client = (db?.clientes || []).find(c => c.id === o.clienteId) || (db?.clientes || []).find(c => norm(c.nombre) === norm(o.cliente));
    const nombre = source.contacto || canonical.contacto || old.contacto || client?.contacto || '';
    return {direccion:data(o).direccion ?? (source.domicilio || canonical.direccion || old.direccion || o.direccion || ''),
      contacto:nombre, telefono:source.contactoTelefono || old.telefono || (nombre === client?.contacto ? client.cel || client.telefono : '') || '',
      email:source.contactoEmail || (nombre === client?.contacto ? client.email : '') || '',
      fecha:isoDate(canonical.compromiso || old.fechaPlan || old.compromiso || source.fecha || source.fechaEntrega || o.fcol_c),
      modalidad:source.tipo || source.modalidadEntrega || '', indicaciones:data(o).indicacionesColocacion ?? (source.detalle || source.indicacionesEntrega || '')};
  }
  function contacts(o, db) {
    const l = logistics(o, db), inherited = l.contacto ? {cotizacion:{id:'cotizacion',nombre:l.contacto,cargo:'',telefono:l.telefono,email:l.email,origen:'Cotización / ficha existente'}} : {};
    const saved = data(o).contactos || {};
    const merged = {...inherited};
    Object.entries(saved).forEach(([id,c]) => { merged[id] = {...(merged[id]||{}),...c,id}; });
    return values(merged).filter(c => !c.oculto && c.nombre);
  }
  function actions(o, db) {
    const g = data(o), list = values(g.acciones), l = logistics(o, db);
    const installed = o.sectores?.colocaciones ? !!(o.sectores.colocaciones.instalada || o.sectores.colocaciones.real) : !!o.fcol_r;
    if (!g.legacyCapturada && l.fecha && !installed && !g.cierre?.cerrada) {
      list.push({id:'legacy',titulo:'Coordinar colocación / entrega',tipo:'Coordinación',fecha:l.fecha,responsable:o.sectores?.colocaciones?.responsable || o.gestionSectores?.colocaciones?.responsable || '',estado:'Pendiente',direccion:l.direccion,contactoId:l.contacto?'cotizacion':'',virtual:true,todoDia:true});
    }
    return list.sort((a,b) => (a.fecha || '9999').localeCompare(b.fecha || '9999') || (a.hora||'').localeCompare(b.hora||''));
  }
  const open = a => a.estado === 'Pendiente' || a.estado === 'Bloqueada';
  const pending = (o, db) => actions(o, db).filter(open);
  function bucket(a, day = today()) { return !a.fecha ? 'sinfecha' : a.fecha < day ? 'vencidas' : a.fecha === day ? 'hoy' : 'proximas'; }
  function validateAction(a) {
    if (!String(a.titulo||'').trim()) throw new Error('Escribí la acción.');
    if (!String(a.responsable||'').trim()) throw new Error('Asigná un responsable.');
    if (a.fecha && !isoDate(a.fecha)) throw new Error('Indicá una fecha de compromiso válida.');
    if (!a.todoDia && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.hora||'') || !Number.isFinite(+a.duracion) || +a.duracion < 15 || +a.duracion > 1440)) throw new Error('Indicá hora y duración entre 15 y 1440 minutos.');
    return a;
  }
  function resultPatch(o, id, result, next, at, user, db) {
    const a = actions(o, db).find(x => x.id === id);
    if (!a || !open(a)) throw new Error('Esta acción ya fue gestionada. Actualizá la ficha.');
    if (!String(result.detalle||'').trim() || !isoDate(result.fechaReal)) throw new Error('Completá el resultado y la fecha real.');
    if (next) { validateAction(next); if (!isoDate(next.fecha) || next.fecha < today()) throw new Error('La próxima acción debe tener fecha de hoy o posterior.'); }
    if(!next&&a.tipo==='Colocación'&&!['conforme','aprobado'].includes(norm(result.control||a.control)))throw new Error('Registrá control conforme para terminar una colocación.');
    const closed = {...a,cantidadReal:result.cantidadReal??a.cantidadReal??'',control:result.control??a.control??'',retrabajo:result.retrabajo??a.retrabajo??'',estado:next?'Reprogramada':'Cerrada',resultado:result.detalle,fechaReal:result.fechaReal,gestionadaEn:at,gestionadaPor:user,siguienteId:next?.id || ''};
    delete closed.virtual;
    const p = {[`colocacionesGestion.acciones.${id}`]:closed};
    if (id === 'legacy') p['colocacionesGestion.legacyCapturada'] = true;
    if (next) p[`colocacionesGestion.acciones.${next.id}`] = {...next,anteriorId:id,estado:'Pendiente',creadoEn:at,creadoPor:user};
    return p;
  }
  function applyPatch(o, p) {
    Object.entries(p).forEach(([path,value]) => {const parts = path.split('.');let x=o;parts.slice(0,-1).forEach(k=>{x[k] ||= {};x=x[k]});x[parts.at(-1)]=value});
  }
  function icsEscape(x) { return String(x??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'); }
  function fold(line) {
    const out=[];let s='',bytes=0;
    for (const ch of line) { const n = new TextEncoder().encode(ch).length; if(bytes+n>73){out.push(s);s=' ';bytes=1} s+=ch;bytes+=n; }
    out.push(s);return out.join('\r\n');
  }
  function calendar(entries, at = new Date(), db = {}) {
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TIZ Publicidad//Colocaciones V128//ES','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
    entries.forEach(({obra:o,accion:a})=>{
      if(!open(a) || !isoDate(a.fecha))return;
      const whole = a.todoDia !== false, compact = d => d.replace(/-/g,'');
      let start,end;
      if(whole){start='DTSTART;VALUE=DATE:'+compact(a.fecha);end='DTEND;VALUE=DATE:'+compact(shift(a.fecha,1));}
      else {validateAction(a);const d=new Date(`${a.fecha}T${a.hora}:00-03:00`);const utc=x=>x.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');start='DTSTART:'+utc(d);end='DTEND:'+utc(new Date(+d+(+a.duracion||60)*60000));}
      const c=contacts(o,db).find(x=>x.id===a.contactoId), details=[a.titulo,'Responsable: '+(a.responsable||'Sin asignar'),c?`Contacto: ${c.nombre} · ${c.cargo||'Sin cargo'} · ${c.telefono||''} · ${c.email||''}`:'',a.observaciones||''].filter(Boolean).join('\n');
      lines.push('BEGIN:VEVENT',`UID:${encodeURIComponent(o.id)}-${encodeURIComponent(a.id)}@tizpublicidad.com`,'DTSTAMP:'+at.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z'),start,end,'SUMMARY:'+icsEscape(`OT ${o.ot||'—'} · ${o.cliente||''} · ${a.titulo}`),'LOCATION:'+icsEscape(a.direccion||logistics(o,db).direccion),'DESCRIPTION:'+icsEscape(details));
      if(+a.aviso>0)lines.push('BEGIN:VALARM','TRIGGER:-PT'+Number(a.aviso)+'M','ACTION:DISPLAY','DESCRIPTION:Recordatorio de colocación','END:VALARM');
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
  }
  const CHECKS = [
    ['relevamiento','Relevamiento','Medidas, fotos, superficie de anclaje y accesos','todas'],
    ['planos','Planos revisados','Versión vigente y aprobación','todas'],
    ['kit','Insumos y herramientas','Lista de materiales, fijaciones y herramientas','Propia'],
    ['cuadrilla','Cuadrilla y recursos','Personal, vehículo, equipos y elementos de seguridad','Propia'],
    ['externo','Contratar colocador externo','Contacto, disponibilidad y alcance acordado','Externa'],
    ['enviado','Planos enviados','Versión, destinatario y fecha de envío','Externa'],
    ['recibido','Recepción confirmada','Confirmación del colocador','Externa'],
    ['acceso','Fecha y acceso confirmados','Cliente, horario, permisos y condiciones de ingreso','todas'],
    ['produccion','Producción liberó la obra','Piezas listas, embalaje y transporte','todas'],
    ['final','Control final','Verificación de colocación y conformidad','todas'],
    ['fotos','Fotos finales','Vínculo a las fotos de la colocación','todas']
  ];
  function suggestions(o, db, day=today()) {
    const g=data(o), cs=contacts(o,db), checks=g.preparacion||{}, out=[];
    if(!cs.length || cs.every(c=>!c.telefono&&!c.email))out.push({titulo:'Completar contacto en obra',detalle:'Falta un teléfono o correo para coordinar.'});
    if(pending(o,db).some(a=>a.fecha&&a.fecha<day))out.push({titulo:'Revisar las acciones vencidas',detalle:'Registrar el resultado y definir la próxima acción.'});
    if(['Externa','Mixta'].includes(g.modalidad)&&checks.recibido?.estado!=='Listo')out.push({titulo:'Confirmar recepción de planos con el colocador',detalle:'Revisar versión, envío y recepción antes de coordinar.'});
    if(['Propia','Mixta'].includes(g.modalidad)&&checks.kit?.estado!=='Listo')out.push({titulo:'Completar kit de colocación',detalle:'Revisar insumos, herramientas y recursos de esta obra.'});
    if(g.tipoTrabajo) (db.obras||[]).filter(x=>x.id!==o.id&&norm(data(x).tipoTrabajo)===norm(g.tipoTrabajo)).forEach(x=>values(data(x).notas).filter(n=>n.tipo==='Experiencia').forEach(n=>out.push({titulo:n.titulo||n.texto,detalle:n.texto,origen:`OT ${x.ot||'—'} · ${x.cliente||''}`})));
    return out.slice(0,10);
  }
  function importKey(sheet,row,a){let h=2166136261;for(const c of `${sheet}|${row}|${a.ot}|${a.titulo}`)h=Math.imul(h^c.charCodeAt(0),16777619);return 'excel'+(h>>>0).toString(16);}
  function parseImportRows(matrices,works){
    const rows=[];
    Object.entries(matrices).forEach(([sheet,matrix])=>{
      const index=matrix.findIndex(r=>r.some(v=>norm(v)==='tarea / operacion'));if(index<0)return;
      const headers=matrix[index].map(norm),col=name=>headers.indexOf(norm(name));
      const read=(r,...names)=>{for(const n of names){const i=col(n);if(i>=0&&r[i]!==''&&r[i]!==undefined&&r[i]!==null)return r[i]}return ''};
      matrix.slice(index+1).forEach((r,n)=>{
        const titulo=String(read(r,'Tarea / Operación')).trim();if(!titulo)return;
        const a={titulo,ot:numOT(read(r,'Obra / OT')),cliente:String(read(r,'Cliente')),fecha:isoDate(read(r,'Fecha compromiso')),responsable:String(read(r,'Responsable')),prioridad:String(read(r,'Prioridad'))||'Normal',fechaReal:isoDate(read(r,'Fecha Real','Fecha de finalización')),estado:sheet==='Histórico'||norm(read(r,'Estado'))==='terminada'?'Cerrada':'Pendiente',estadoPlanilla:String(read(r,'Estado')),controlPlanilla:String(read(r,'Control de colocación','Control calidad')),retrabajo:String(read(r,'Retrabajo')),resultado:String(read(r,'Próxima acción / observaciones'))||'',tipo:'Seguimiento',todoDia:true};
        a.datosPlanilla=matrix[index].map((h,i)=>[String(h||'Columna '+(i+1)),r[i] instanceof Date?isoDate(r[i]):String(r[i]??'')]);if(norm(a.estadoPlanilla)==='bloqueada')a.estado='Bloqueada';a.control=a.controlPlanilla;a.cantidadReal=String(read(r,'Cant. real','Cantidad real'));a.observaciones=a.resultado;a.id=importKey(sheet,n+index+2,a);const matches=a.ot?works.filter(o=>numOT(o.ot)===a.ot):[];
        rows.push({...a,obraId:matches.length===1?matches[0].id:'',fila:n+index+2,hoja:sheet});
      });
    });return rows;
  }
  function pendingInstallation(o){
    if(!o||o.archivado||o.revisionVigente===false||o.revisionOperativa===false||o.colocacionesGestion?.cierre?.cerrada)return false;
    const state=norm(o.estado),source=norm(o.estadoHistoricoExcel||o.historicoExcel?.estado||o.estado);
    if(/^(entregad[oa]s?|cobrado|archivado|anulado|cancelado|rechazado)$/.test(state))return false;
    return source==='pendiente'||source==='cobrado pendiente';
  }
  function phoneLinks(value){
    const raw=String(value||'').trim();if(!/^\+?[\d\s().-]+$/.test(raw))return {tel:'',whatsapp:''};
    const digits=raw.replace(/\D/g,'');if(digits.length<7||digits.length>15)return {tel:'',whatsapp:''};
    const international=raw.startsWith('+')&&digits.length>=8;
    return {tel:'tel:'+(international?'+':'')+digits,whatsapp:international?'https://wa.me/'+digits:''};
  }
  const VISIT_CHECKS={materiales:'Materiales preparados',herramientas:'Herramientas listas',vehiculo:'Vehículo confirmado',responsable:'Responsable confirmado'};
  function safeVisitURL(value){const v=String(value||'').trim();if(!v)return '';try{const u=new URL(v);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)return u.href}catch(_){}throw new Error('Usá un link completo http o https para fotos y planos.');}
  function visitPatch(current,fields,version,at,user,database={}){
    const old=current.colocacionesGestion?.visita||{};if(String(old.actualizadoEn||'')!==String(version||''))throw new Error('Otra persona actualizó la visita. Cerrá y volvé a abrir para actualizarla.');
    const v={fecha:String(fields.fechaVisita||''),hora:String(fields.horaVisita||''),accesoConfirmado:!!fields.accesoConfirmado,contactoId:String(fields.contactoId||''),indicaciones:String(fields.indicaciones||'').trim().slice(0,2000),fotosURL:safeVisitURL(fields.fotosURL),planosURL:safeVisitURL(fields.planosURL),checklist:Object.fromEntries(Object.keys(VISIT_CHECKS).map(k=>[k,!!fields[k]])),actualizadoEn:at,actualizadoPor:user};
    if(v.fecha&&!isoDate(v.fecha))throw new Error('Fecha de visita inválida.');if(v.hora&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.hora))throw new Error('Horario inválido.');
    if((v.accesoConfirmado||Object.values(v.checklist).some(Boolean))&&!v.fecha)throw new Error('Indicá la fecha de esta visita para confirmar la salida.');
    if(v.contactoId&&!contacts(current,database).some(c=>c.id===v.contactoId))throw new Error('El contacto ya no está disponible. Actualizá la visita.');
    if(v.accesoConfirmado&&(!v.hora||!v.contactoId))throw new Error('Para confirmar acceso, indicá horario y contacto que lo confirmó.');
    return {'colocacionesGestion.visita':v};
  }
  function visitForm(o){const g=data(o),v=g.visita||{};return `<form data-form="visit"><h3>Preparar visita</h3><input type="hidden" name="version" value="${esc(v.actualizadoEn||'')}"><div class="c128-grid"><label>Fecha de visita<input type="date" name="fechaVisita" value="${esc(v.fecha||'')}"></label><label>Horario acordado<input type="time" name="horaVisita" value="${esc(v.hora||'')}"></label><label>Contacto que confirma<select name="contactoId">${contactOptions(o,v.contactoId)}</select></label><label class="c128-checkline"><input type="checkbox" name="accesoConfirmado" ${v.accesoConfirmado?'checked':''}>Acceso y horario confirmados</label><label class="c128-full">Acceso / indicaciones<textarea name="indicaciones" rows="2" maxlength="2000">${esc(v.indicaciones||'')}</textarea></label><label>Fotos del lugar / relevamiento<input type="url" name="fotosURL" value="${esc(v.fotosURL??g.preparacion?.fotos?.url??'')}"></label><label>Plano de colocación<input type="url" name="planosURL" value="${esc(v.planosURL??g.preparacion?.planos?.url??'')}"></label></div><h3>Antes de salir</h3><div class="c128-grid">${Object.entries(VISIT_CHECKS).map(([k,label])=>`<label class="c128-checkline"><input type="checkbox" name="${k}" ${v.checklist?.[k]?'checked':''}>${label}</label>`).join('')}</div><div class="c128-muted">Los controles corresponden a la fecha indicada. Si cambiás la visita, revisalos y confirmalos nuevamente.</div>${canWrite()?'<button type="submit" class="btn btn-primary">Guardar visita</button>':''}</form>`;}
  window.TIZColocacionesCore = {pendingInstallation,phoneLinks,safeVisitURL,visitPatch,isoDate,today,shift,quote,logistics,contacts,actions,pending,bucket,validateAction,resultPatch,applyPatch,calendar,suggestions,parseImportRows};
  if (typeof document === 'undefined') return;
  const state={view:'base',filter:'todas',query:'',id:'',tab:'ficha',calendarStart:'',busy:false,editor:null,importRows:[],drafts:{},editors:{}};
  const db=()=>window.DB||{obras:[],presupuestos:[],clientes:[]};
  const obra=id=>(db().obras||[]).find(o=>o.id===id);
  const canRead=()=>!!window.currentUser&&!!window.canViewPage?.('colocaciones');
  const canWrite=()=>canRead()&&!!window.canAnnotateSector?.('Colocaciones');
  const toast=x=>window.showToast?.(x);
  function allWorks(){return (db().obras||[]).filter(pendingInstallation).sort((a,b)=>(+numOT(b.ot)||0)-(+numOT(a.ot)||0));}
  const btn=(text,attr='',primary=false)=>`<button type="button" class="btn ${primary?'btn-primary':'btn-ghost'}" ${attr}>${text}</button>`;
  const chip=(text,color='')=>`<span class="c128-chip ${color}">${esc(text)}</span>`;
  function style(){
    if(document.getElementById('c128-style'))return;
    const s=document.createElement('style');s.id='c128-style';s.textContent=`
      .c128-legacy{display:none!important}.c128{font-size:13px;color:var(--text);min-width:0}.c128 h2{font-size:22px;margin:0}.c128 h3{font-size:15px;margin:0}.c128-head,.c128-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.c128-muted{color:var(--text2);font-size:12px}.c128-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:15px 0}.c128 .btn{font-size:12px;min-height:36px}.c128 .btn[data-active=true]{border-color:var(--accent);color:var(--accent);background:var(--surface3)}.c128-chip{display:inline-block;padding:3px 8px;border-radius:99px;background:var(--surface3);color:var(--accent);font-size:11px}.c128-chip.red{color:var(--red)}.c128-chip.green{color:var(--green)}.c128-chip.amber{color:var(--amber)}.c133-week{grid-template-columns:repeat(7,minmax(160px,1fr))!important;overflow-x:auto}.c128-days{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.c128-day{padding:13px;background:var(--surface);border:1px solid var(--border2);border-radius:10px;min-width:0;display:flex;flex-direction:column;gap:9px}.c128-day.today{border-color:var(--accent)}.c128-number{font-size:24px;font-weight:600}.c128-event{display:block;width:100%;text-align:left;border:1px solid var(--border2);border-left:3px solid var(--accent);background:var(--surface2);color:var(--text);border-radius:7px;padding:10px;cursor:pointer;overflow-wrap:anywhere}.c128-event.red{border-left-color:var(--red)}.c128-event b{display:block;margin:5px 0;font-weight:500}.c128-event small{display:block;color:var(--text2);font-size:11px}.c128-add{margin-top:auto}.c128-panel{border:1px solid var(--border2);background:var(--surface);border-radius:10px;padding:15px;margin-top:12px}.c128-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.c128-simple-list{border:1px solid var(--border2);border-radius:9px;overflow:hidden;margin-top:14px}.c128-simple-row{display:flex;align-items:center;gap:15px;padding:12px 14px;border-bottom:1px solid var(--border2)}.c128-simple-row:last-child{border-bottom:0}.c128-simple-row>div{flex:1;min-width:0}.c130-main-tabs{border-bottom:1px solid var(--border2);padding-bottom:12px}.c128-simple-row .btn{white-space:nowrap}.c128-empty{padding:14px 0;color:var(--text2)}.c128-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.c128-search{background:var(--surface);border:1px solid var(--border2);border-radius:8px;color:var(--text);padding:9px;max-width:100%;min-width:180px}.c128-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:10060;padding:24px;overflow:auto;display:none}.c128-overlay.show{display:block}.c128-dialog{width:min(100%,1050px);margin:0 auto;background:var(--bg);border:1px solid var(--border2);border-radius:12px;padding:20px}.c128-tabs{display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border2);padding:12px 0;margin-bottom:16px}.c128-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.c128-full{grid-column:1/-1}.c128 label{display:block;font-size:12px;color:var(--text2)}.c128 input:not([type=checkbox]),.c128 select,.c128 textarea{width:100%;font:inherit;color:var(--text);background:var(--surface2);border:1px solid var(--border2);border-radius:7px;padding:9px;margin-top:5px;box-sizing:border-box;min-width:0}.c128 textarea{resize:vertical}.c128 input[type=checkbox]{accent-color:var(--accent);margin-right:7px}.c128-task{border-bottom:1px solid var(--border2);padding:14px 0}.c128-task:first-child{padding-top:0}.c128-task-title{font-weight:500;margin:7px 0;overflow-wrap:anywhere}.c128-note{border-left:3px solid var(--accent);padding:10px;background:var(--surface2);margin:12px 0;font-size:12px}.c128-error{color:var(--red);margin:12px 0;white-space:pre-wrap}.c128-check{padding:12px 0;border-bottom:1px solid var(--border2)}.c128 table{width:100%;table-layout:fixed}.c128 td{overflow-wrap:anywhere}.c128-busy button,.c128-busy input{pointer-events:none;opacity:.65}.c128-close{border-color:var(--accent)!important}.c128 label.c128-checkline{display:flex;align-items:center;gap:6px;margin:10px 0}.c128-status{color:var(--accent);font-size:12px}.c128 a{color:var(--accent);overflow-wrap:anywhere}
      @media(max-width:950px){.c128-days{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){.c128-grid,.c128-list{grid-template-columns:1fr}.c128-full{grid-column:auto}.c128-overlay{padding:10px}.c128-dialog{padding:14px}.c128 .btn{min-height:44px}.c128 input,.c128 select,.c128 textarea{font-size:16px!important}}@media(max-width:380px){.c128-days{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }
  function pageRoot(){const p=document.getElementById('page-colocaciones');if(!p)return null;let r=document.getElementById('c128-root');if(!r){Array.from(p.children).forEach(x=>x.classList.add('c128-legacy'));r=document.createElement('div');r.id='c128-root';r.className='c128';p.appendChild(r);r.addEventListener('click',click);r.addEventListener('input',e=>{if(e.target.id==='c128-query'){state.query=e.target.value;renderList()}});r.addEventListener('change',change)}Array.from(p.children).filter(x=>x!==r).forEach(x=>x.classList.add('c128-legacy'));return r;}
  function filteredWorks(){return allWorks().filter(o=>!state.query||norm([o.ot,o.cliente,o.desc].join(' ')).includes(norm(state.query))).filter(o=>state.filter==='historico'?!!data(o).cierre?.cerrada:state.filter==='todas'?true:pending(o,db()).some(a=>state.filter==='bloqueadas'?a.estado==='Bloqueada':bucket(a)===state.filter));}
  function renderList(){const list=document.getElementById('c128-work-list');if(!list)return;list.innerHTML=`<div class="c128-simple-list">${filteredWorks().map(o=>{const a=pending(o,db())[0];return `<div class="c128-simple-row"><div><b>OT ${esc(o.ot||'—')} · ${esc(o.cliente||'')}</b><div class="c128-muted">${esc((o.desc||'').slice(0,150))}</div></div><span class="c128-muted">${pending(o,db()).length} pendientes${a?.fecha?' · '+fmtDate(a.fecha):''}</span>${btn('Abrir obra',`data-open="${esc(o.id)}"`)}</div>`}).join('')||'<div class="c128-empty">No hay OT aprobadas para este filtro.</div>'}</div>`;}
  function agendaHTML(){const start=state.calendarStart||window.TIZColocacionesGeneralCore.week(today()).start;return window.TIZColocacionesGeneralV129?.datesBody(start)||'';}
  function blockers(){return window.TIZColocacionesGeneralV129?.entries().filter(r=>!r.accion.virtual&&window.TIZColocacionesGeneralCore.overdue(r.accion,today()))||[];}
  function gateHTML(rows){return `<h2>Colocaciones · pendientes a resolver</h2><div class="c128-note" role="alert">Hay ${rows.length} acciones de anteayer o anteriores sin resolver. Registrá qué pasó y cerrá la acción o definí una próxima acción con fecha de hoy o posterior para continuar.</div><div class="c128-simple-list">${rows.map(r=>`<div class="c128-simple-row"><div><b>${esc(r.obra.ot?'OT '+r.obra.ot:'Sin OT')} · ${esc(r.cliente)}</b><div>${esc(r.accion.titulo)}</div><small>Compromiso: ${fmtDate(r.accion.fecha)} · ${esc(r.accion.responsable||'Sin asignar')}</small></div>${canWrite()?btn('Resolver',`data-overdue="${esc(r.key)}"`,true):'<span>Debe resolverlo un responsable de Colocaciones.</span>'}</div>`).join('')}</div>`;}
  function render(){
    if(!canRead())return;style();const r=pageRoot();if(!r)return;
    const blocked=blockers();
    if(blocked.length){r.innerHTML=gateHTML(blocked);window.TIZColocacionesGeneralV129?.attach(r);window.TIZColocacionesGeneralV129?.load();return;}
    r.innerHTML=`<div class="c128-head"><div><h2>Colocaciones</h2></div></div><div class="c128-toolbar c130-main-tabs" role="tablist" aria-label="Colocaciones">${[['base','Acciones'],['agenda','Por fecha'],['historico','Histórico']].map(([k,label])=>`<button type="button" class="btn btn-ghost" role="tab" aria-selected="${state.view===k}" data-view="${k}" data-active="${state.view===k}">${label}</button>`).join('')}</div>${state.view==='base'&&window.TIZColocacionesGeneralV129?window.TIZColocacionesGeneralV129.body('base'):state.view==='historico'?window.TIZColocacionesGeneralV129.body('historico',state.calendarStart||window.TIZColocacionesGeneralCore.week(today()).start):state.view==='agenda'?`<div id="c132-calendar">${agendaHTML()}</div>`:`<div class="c128-row"><input class="c128-search" id="c128-query" placeholder="Buscar OT, cliente o trabajo" aria-label="Buscar obra" value="${esc(state.query)}"></div><div id="c128-work-list"></div>`}`;
    if(state.view==='obras')renderList();
    window.TIZColocacionesGeneralV129?.attach(r);window.TIZColocacionesGeneralV129?.load();
  }
  function overlay(){let r=document.getElementById('c128-overlay');if(!r){r=document.createElement('div');r.id='c128-overlay';r.className='c128-overlay c128';r.setAttribute('role','dialog');r.setAttribute('aria-modal','true');r.setAttribute('aria-label','Ficha de Colocaciones');document.body.appendChild(r);r.addEventListener('click',click);r.addEventListener('change',change);r.addEventListener('submit',submit);r.addEventListener('keydown',e=>{if(e.key==='Escape'&&!state.busy)closeModal();if(e.key==='Tab'){const items=[...r.querySelectorAll('button,input,select,textarea,a[href]')].filter(el=>!el.disabled&&el.getClientRects().length);if(!items.length)return;const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}})}return r;}
  let focusReturn=null;
  function closeModal(){if(state.busy)return;overlay().classList.remove('show');state.editor=null;state.drafts={};state.editors={};focusReturn?.focus?.();}
  function showModal(id,tab='ficha',editor=null){if(!canRead())return;focusReturn=document.activeElement;state.id=id;state.tab=tab;state.editor=editor;state.drafts={};state.editors={};drawModal();overlay().classList.add('show');overlay().querySelector('button,input,select')?.focus();}
  function error(e){console.error('[Colocaciones V128]',e);const x=document.getElementById('c128-error');if(x)x.textContent=e.message||String(e);else toast(e.message||String(e));}
  function captureDraft(){const f=document.querySelector('#c128-overlay form');if(f){state.drafts[state.tab]=Object.fromEntries(new FormData(f));f.querySelectorAll('input[type=checkbox]').forEach(el=>state.drafts[state.tab][el.name]=el.checked)}}
  function restoreDraft(){const f=document.querySelector('#c128-overlay form'), draft=state.drafts[state.tab];if(f&&draft)Object.entries(draft).forEach(([k,v])=>{const el=f.elements.namedItem(k);if(el){if(el.type==='checkbox')el.checked=!!v;else el.value=v}});toggleTime();}
  function drawModal(){
    const o=obra(state.id), r=overlay();
    const body=!o?newActionForm(null,state.editor?.fecha):tabHTML(o);
    r.innerHTML=`<div class="c128-dialog"><div class="c128-head"><div><h3>${o?`Cotización ${esc(quote(o,db()).nro||o.ot||'—')} · ${esc(o.cliente||'')}`:'Nueva acción de colocación'}</h3><div class="c128-muted">${o?esc(o.desc||''):'Seleccioná la obra y el compromiso'}</div></div>${btn('Cerrar','data-close="1"')}</div>${o?`<details><summary>Más datos y herramientas de la obra</summary><div class="c128-actions">${btn('Imprimir ficha','data-print-work="1"')}${canWrite()?btn('Actualizar ficha en Drive','data-archive-work="1"'):''}${g129Doc(o)}</div><div class="c128-tabs" role="tablist" aria-label="Ficha de obra">${Object.entries({ficha:'Ficha de obra',contactos:'Contactos',ubicacion:'Datos de colocación',preparacion:'Preparación',salida:'Preparar visita',historico:'Histórico'}).map(([k,v])=>`<button type="button" class="btn btn-ghost" role="tab" aria-selected="${state.tab===k}" data-tab="${k}" data-active="${state.tab===k}">${v}</button>`).join('')}</div></details>`:''}<div id="c128-modal-content">${body}</div><div id="c128-error" class="c128-error" role="alert"></div></div>`;restoreDraft();
  }
  function g129Doc(o){const doc=data(o).documento||{};return `${doc.url?`<a class="btn btn-ghost" href="${esc(doc.url)}" target="_blank" rel="noopener">Abrir PDF en Drive</a>`:''}<span class="c128-muted">${doc.error?'Drive pendiente: '+esc(doc.error):doc.fecha&&(!data(o).actualizadoEn||doc.fecha>=data(o).actualizadoEn)?'Ficha en Drive · '+fmtDate(doc.fecha):'Ficha de Drive pendiente de actualización'}</span>`;}
  const options=(list,value)=>list.map(x=>`<option value="${esc(x)}" ${x===value?'selected':''}>${esc(x)}</option>`).join('');
  function contactOptions(o,id=''){return '<option value="">Sin asignar</option>'+contacts(o,db()).map(c=>`<option value="${esc(c.id)}" ${c.id===id?'selected':''}>${esc(c.nombre)} · ${esc(c.cargo||'Sin cargo')}</option>`).join('');}
  function actionFields(o,a={}){return `<div class="c128-grid"><label class="c128-full">Acción<input name="titulo" required maxlength="500" value="${esc(a.titulo||'')}" placeholder="Qué hay que hacer"></label><label>Tipo<select name="tipo">${options(['Seguimiento','Relevamiento','Planos','Insumos','Contratar externo','Coordinación','Colocación','Entrega','Control final'],a.tipo||'Seguimiento')}</select></label><label>Responsable<input name="responsable" required list="c128-owners" value="${esc(a.responsable||'')}"><datalist id="c128-owners">${['Gian','Pablo','Julieta','Carolina','Ariel','Cristian'].map(x=>`<option value="${x}">`).join('')}</datalist></label><label>Fecha compromiso<input name="fecha" type="date" value="${esc(a.fecha||'')}"></label><label>Prioridad<select name="prioridad">${options(['Normal','Alta','Urgente'],a.prioridad||'Normal')}</select></label><label>Contacto<select name="contactoId">${o?contactOptions(o,a.contactoId):'<option value="">Sin asignar</option>'}</select></label><label>Estado<select name="estado">${options(['Pendiente','Bloqueada'],a.estado||'Pendiente')}</select></label><label class="c128-full">Observaciones / bloqueo<textarea name="observaciones" rows="2" maxlength="2000">${esc(a.observaciones||'')}</textarea></label><label class="c128-full c128-checkline"><input type="checkbox" name="todoDia" ${a.todoDia!==false?'checked':''}>Todo el día</label><label>Hora de inicio<input type="time" name="hora" value="${esc(a.hora||'')}"></label><label>Duración (minutos)<input type="number" name="duracion" min="15" max="1440" step="15" value="${esc(a.duracion||60)}"></label><label class="c128-full">Lugar / domicilio<input name="direccion" value="${esc(a.direccion??(o?logistics(o,db()).direccion:''))}"></label><label>Zona / localidad<input name="zona" list="c128-zones" value="${esc(a.zona??data(o||{}).zona??'')}" placeholder="Ej.: CABA, San Miguel, Zona Norte"><datalist id="c128-zones"><option value="CABA"><option value="Zona Norte"><option value="Zona Oeste"><option value="Zona Sur"></datalist></label><label>Aviso previo<select name="aviso">${[0,30,60,1440].map(x=>`<option value="${x}" ${Number(a.aviso??1440)===x?'selected':''}>${x===0?'Sin aviso':x===1440?'1 día antes':x+' minutos antes'}</option>`).join('')}</select></label></div>`;}
  function newActionForm(o,fecha){const e=state.editor||{},a=e.action||{fecha:fecha||'',titulo:e.titulo||''};return `<form data-form="action"><h3>${e.editId?'Editar pendiente':'Agregar pendiente'}</h3>${!o?`<label>Obra / cotización<select name="obraId" required id="c128-form-work"><option value="">Seleccionar…</option>${allWorks().map(x=>`<option value="${esc(x.id)}">${esc(x.ot)} · ${esc(x.cliente)}</option>`).join('')}</select></label>`:''}<label>Qué hay que hacer<textarea name="titulo" required rows="3" maxlength="500">${esc(a.titulo||'')}</textarea></label><div class="c128-grid"><label>Fecha (opcional)<input type="date" name="fecha" value="${esc(a.fecha||'')}"></label><label>Responsable<input name="responsable" required value="${esc(a.responsable||'')}"></label></div><details style="margin-top:12px"><summary>Más detalles</summary>${actionFields(o,a).replace(/<label class="c128-full">Acción[\s\S]*?<\/label>/,'').replace(/<label>Responsable[\s\S]*?<\/label>/,'').replace(/<label>Fecha compromiso[\s\S]*?<\/label>/,'')}</details><div class="c128-actions"><button type="submit" class="btn btn-primary">Guardar pendiente</button>${o?btn('Cancelar','data-cancel="1"'):''}</div></form>`;}
  function taskHTML(o,a){return `<div class="c128-task"><div class="c128-row">${chip(a.tipo||'Seguimiento')}${chip(fmtDate(a.fecha),bucket(a)==='vencidas'?'red':bucket(a)==='hoy'?'amber':'')}</div><div class="c128-task-title">${esc(a.titulo)}</div><div class="c128-muted">${esc(a.responsable||'Sin responsable')} · ${esc(contacts(o,db()).find(c=>c.id===a.contactoId)?.nombre||'Sin contacto')} · ${esc(a.estado)}${a.virtual?' · Fecha heredada de la obra':''}</div>${a.observaciones?`<div class="c128-muted">${esc(a.observaciones)}</div>`:''}<div class="c128-actions">${canWrite()?btn('Registrar resultado',`data-result="${esc(a.id)}"`,true)+btn('Editar',`data-edit-action="${esc(a.id)}"`):''}${a.fecha?btn('Calendario .ics',`data-export="${esc(a.id)}"`):''}</div></div>`;}
  function tabHTML(o){
    const g=data(o), l=logistics(o,db());
    if(state.tab==='salida')return visitForm(o);
    if(state.tab==='ubicacion')return `<form data-form="location"><h3>Datos de colocación de esta obra</h3><label>Domicilio de colocación<input name="direccion" maxlength="500" value="${esc(l.direccion)}"></label><label>Zona / localidad<input name="zona" maxlength="160" value="${esc(g.zona||'')}"></label><label>Acceso, horario u otras indicaciones<textarea name="indicaciones" rows="3" maxlength="2000">${esc(g.indicacionesColocacion??l.indicaciones??'')}</textarea></label>${canWrite()?'<button type="submit" class="btn btn-primary">Guardar datos de colocación</button>':''}<div class="c128-actions">${btn('Ver / agregar contactos',`data-open="${esc(o.id)}" data-open-tab="contactos"`)}</div></form>`;
    if(state.tab==='ficha'){return `<div class="c128-note"><div>${esc(l.direccion||'Domicilio pendiente')}</div><div>${esc(l.contacto||'Contacto pendiente')} ${esc(l.telefono)} ${esc(l.email)}</div>${l.indicaciones?`<div>${esc(l.indicaciones)}</div>`:''}</div>${canWrite()?`<form data-form="note"><input type="hidden" name="tipo" value="Ayudamemoria"><label>Agregar información de esta obra<textarea name="texto" required rows="3" maxlength="3000" placeholder="Medidas, conversación con el cliente, materiales, accesos o lo que falta resolver…"></textarea></label><button type="submit" class="btn btn-primary">Guardar información</button></form>`:''}${values(g.notas).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')).map(n=>`<div class="c128-task">${esc(n.texto)}<small class="c128-muted">${fmtDate(n.fecha)}</small></div>`).join('')}<div class="c128-row" style="margin-top:20px"><h3>Pendientes y compromisos</h3>${canWrite()?btn('＋ Agregar pendiente',`data-new="${esc(o.id)}"`):''}</div>${pending(o,db()).map(a=>`<div class="c128-task"><div>${esc(a.titulo)}</div><small class="c128-muted">${fmtDate(a.fecha)} · ${esc(a.responsable||'Sin asignar')}${a.estado==='Bloqueada'?' · Bloqueada':''}</small>${a.observaciones?`<div>${esc(a.observaciones)}</div>`:''}${a.datosPlanilla?.length?`<details><summary>Datos originales de la planilla</summary>${a.datosPlanilla.filter(pair=>pair[1]).map(([label,value])=>`<div><b>${esc(label)}:</b> ${esc(value)}</div>`).join('')}</details>`:''}${canWrite()?`<div class="c128-actions">${btn('Editar',`data-edit-action="${esc(a.id)}"`)}${btn('Resolver',`data-result="${esc(a.id)}"`)}</div>`:''}</div>`).join('')||'<div class="c128-empty">Sin pendientes. Podés agregar información o una tarea con fecha.</div>'}`;}
    if(state.tab==='acciones'){
      if(state.editor?.kind==='result'){const a=actions(o,db()).find(x=>x.id===state.editor.id);if(!a)return '<div class="c128-empty">Esta acción ya no está disponible.</div>';return `<form data-form="result"><h3>${esc(a.titulo)}</h3><div class="c128-grid" style="margin-top:12px"><label class="c128-full">Qué se hizo / resultado<textarea name="resultado" required rows="3" maxlength="3000"></textarea></label><label>Fecha real<input type="date" name="fechaReal" required value="${today()}"></label><label>Cantidad real<input name="cantidadReal" maxlength="80" value="${esc(a.cantidadReal||'')}"></label><label>Control de colocación<select name="control">${options(['Sin revisar','Conforme','Con observaciones'],a.control||'Sin revisar')}</select></label><label>Retrabajo<select name="retrabajo">${options(['No','Sí'],a.retrabajo||'No')}</select></label><label>Resultado<select name="resultadoTipo" id="c128-result-type"><option value="cerrar">Se resolvió · cerrar acción</option><option value="continuar">No se resolvió · nueva acción</option></select></label></div><div id="c128-next" hidden style="margin-top:15px"><h3>Próxima acción</h3>${actionFields(o,{...a,titulo:'',fecha:shift(today(),1),estado:'Pendiente'})}</div><label class="c128-checkline"><input type="checkbox" name="experiencia">Guardar este resultado como experiencia para futuras obras</label><div class="c128-actions"><button type="submit" class="btn btn-primary">Guardar resultado</button>${btn('Cancelar','data-cancel="1"')}</div></form>`;}
      if(state.editor?.kind==='action')return newActionForm(o,state.editor.fecha);
      return `<div class="c128-row"><h3>Próximas acciones</h3>${canWrite()?btn('＋ Nueva acción',`data-new="${esc(o.id)}"`,true):''}</div>${g.cierre?.cerrada?`<div class="c128-note">Colocación cerrada el ${fmtDate(g.cierre.fecha)}. ${canWrite()?btn('Reabrir seguimiento','data-reopen="1"'):''}</div>`:''}${pending(o,db()).map(a=>taskHTML(o,a)).join('')||'<div class="c128-empty">Sin acciones pendientes. Podés cargar el siguiente paso.</div>'}<div class="c128-note">Terminar una acción no cierra toda la colocación. Para cerrar la obra: sin acciones pendientes, control final y fotos.</div>${canWrite()&&!g.cierre?.cerrada?btn('Cerrar colocación de la obra','data-close-work="1"'):''}`;
    }
    if(state.tab==='contactos'){
      if(state.editor?.kind==='contact'){const c=contacts(o,db()).find(x=>x.id===state.editor.id)||{};return `<form data-form="contact"><h3>${c.id?'Completar contacto':'Nuevo contacto'}</h3><div class="c128-grid"><label>Nombre<input name="nombre" required maxlength="160" value="${esc(c.nombre||'')}"></label><label>Cargo / función<input name="cargo" list="c128-roles" value="${esc(c.cargo||'')}" placeholder="Elegí o escribí un cargo"><datalist id="c128-roles">${['Comprador','Arquitecto','Colocador','Encargado de local','Mantenimiento','Responsable de obra'].map(x=>`<option value="${x}">`).join('')}</datalist></label><label>Teléfono / WhatsApp (con código de país, ej. +54 9 11…)<input name="telefono" type="tel" value="${esc(c.telefono||'')}"></label><label>Correo<input name="email" type="email" value="${esc(c.email||'')}"></label><label class="c128-full">Observaciones<textarea name="observaciones" rows="2">${esc(c.observaciones||'')}</textarea></label><label class="c128-full c128-checkline"><input name="principal" type="checkbox" ${g.contactoPrincipal===c.id?'checked':''}>Contacto principal de esta obra</label></div><div class="c128-actions"><button type="submit" class="btn btn-primary">Guardar contacto</button>${btn('Cancelar','data-cancel="1"')}</div></form>`;}
      return `<div class="c128-row"><h3>Contactos de esta obra</h3>${canWrite()?btn('＋ Contacto','data-contact=""',true):''}</div><div class="c128-note">Se toman de la cotización. Los datos que completes acá quedan asociados a esta obra.</div>${contacts(o,db()).map(c=>`<div class="c128-task"><div class="c128-row"><h3>${esc(c.nombre)}</h3>${chip(c.cargo||'Cargo por completar')}${g.contactoPrincipal===c.id?chip('Principal'):''}</div><div class="c128-muted">Tel.: ${esc(c.telefono||'Falta completar')} · Correo: ${esc(c.email||'Falta completar')}</div><div class="c128-muted">${esc(c.origen||'Agregado a esta obra')} · ${esc(c.observaciones||'')}</div>${canWrite()?`<div class="c128-actions">${btn('Completar / editar',`data-contact="${esc(c.id)}"`)}</div>`:''}</div>`).join('')||'<div class="c128-empty">La cotización no trae un contacto. Agregalo acá.</div>'}`;
    }
    if(state.tab==='preparacion'){
      const mode=state.drafts.preparacion?.modalidad||g.modalidad||'A definir';
      return `<form data-form="preparation"><div class="c128-grid"><label>Modalidad<select name="modalidad" id="c128-mode">${options(['A definir','Propia','Externa','Mixta'],mode)}</select></label><label>Tipo de trabajo<input name="tipoTrabajo" list="c128-types" value="${esc(g.tipoTrabajo||'')}"><datalist id="c128-types">${['Letras corpóreas','Cartel iluminado','Vinilos','Placas','Muebles','Reparación'].map(x=>`<option value="${x}">`).join('')}</datalist></label><label class="c128-full">Domicilio<input name="direccion" value="${esc(l.direccion)}"></label><label>Zona / localidad<input name="zona" value="${esc(g.zona||'')}" placeholder="Ej.: CABA"></label></div>${CHECKS.filter(x=>x[3]==='todas'||mode===x[3]||mode==='Mixta'||mode==='A definir').map(([k,title,detail])=>{const c=g.preparacion?.[k]||{};return `<div class="c128-check"><div class="c128-row"><h3>${title}</h3><label>Estado<select name="${k}_estado">${options(['Pendiente','Listo','No corresponde'],c.estado||'Pendiente')}</select></label></div><div class="c128-muted">${detail}</div><div class="c128-grid" style="margin-top:8px"><label>Detalle / insumos / motivo si no corresponde<input name="${k}_detalle" value="${esc(c.detalle||'')}"></label><label>Archivo / carpeta / fotos (URL)<input type="url" name="${k}_url" value="${esc(c.url||'')}"></label>${['enviado','recibido'].includes(k)?`<label>Fecha<input type="date" name="${k}_fecha" value="${esc(c.fecha||'')}"></label><label>Destinatario<select name="${k}_contactoId">${contactOptions(o,c.contactoId)}</select></label>`:''}</div></div>`}).join('')}${canWrite()?'<div class="c128-actions"><button type="submit" class="btn btn-primary">Guardar preparación</button></div>':''}</form>`;
    }
    if(state.tab==='clemen')return `<h3>Clemen · Ayudamemorias y experiencias</h3><div class="c128-muted">Revisión de faltantes y experiencias guardadas de obras del mismo tipo.</div>${suggestions(o,db()).map((s,i)=>`<div class="c128-note"><b>${esc(s.titulo)}</b><div>${esc(s.detalle)}</div>${s.origen?`<div class="c128-muted">Experiencia de ${esc(s.origen)}</div>`:''}${canWrite()?`<div class="c128-actions">${btn('Armar acción',`data-suggestion="${i}"`)}</div>`:''}</div>`).join('')||'<div class="c128-empty">No hay sugerencias para esta obra.</div>'}${canWrite()?`<form data-form="note" class="c128-panel"><label>Ayudamemoria / problema y solución<textarea name="texto" required rows="3" maxlength="3000" placeholder="Ej.: llamar a Luis mañana para confirmar recepción de planos"></textarea></label><label>Guardar como<select name="tipo">${options(['Ayudamemoria','Experiencia'],'Ayudamemoria')}</select></label><div class="c128-actions"><button type="submit" class="btn btn-primary">Guardar nota</button>${btn('Armar acción desde la nota','data-note-action="1"')}</div></form>`:''}${values(g.notas).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')).map(n=>`<div class="c128-task">${chip(n.tipo)}<div>${esc(n.texto)}</div><div class="c128-muted">${esc(n.usuario||'')} · ${fmtDate(n.fecha)}</div></div>`).join('')}`;
    return `<h3>Histórico de gestiones</h3>${actions(o,db()).filter(a=>!open(a)).sort((a,b)=>(b.gestionadaEn||'').localeCompare(a.gestionadaEn||'')).map(a=>`<div class="c128-task"><div class="c128-row">${chip(a.estado,a.estado==='Cerrada'?'green':'amber')}<span class="c128-muted">${fmtDate(a.fechaReal)}</span></div><div class="c128-task-title">${esc(a.titulo)}</div><div>${esc(a.resultado||'')}</div><div class="c128-muted">Compromiso original: ${fmtDate(a.fecha)} · ${esc(a.gestionadaPor||'')}</div>${a.siguienteId?`<div class="c128-note">Próxima acción: ${esc(data(o).acciones?.[a.siguienteId]?.titulo||'')} · ${fmtDate(data(o).acciones?.[a.siguienteId]?.fecha)}</div>`:''}</div>`).join('')||'<div class="c128-empty">Las gestiones registradas aparecerán acá.</div>'}${values(g.eventos).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')).map(e=>`<div class="c128-note">${esc(e.accion)} · ${fmtDate(e.fecha)} · ${esc(e.usuario)}</div>`).join('')}`;
  }
  function toggleTime(){const f=document.querySelector('#c128-overlay form');if(!f)return;const next=document.getElementById('c128-next');const continuing=f.elements.resultadoTipo?.value==='continuar';if(next){next.hidden=!continuing;next.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=!continuing)}const enabled=!next||continuing;const whole=f.elements.todoDia?.checked!==false;['hora','duracion'].forEach(k=>{if(f.elements[k]){f.elements[k].disabled=!enabled||whole;f.elements[k].required=enabled&&!whole}});if(next){['titulo','responsable','fecha'].forEach(k=>f.elements[k].required=continuing)}}
  async function mutate(id,builder){
    if(state.busy)throw new Error('Esperá a que termine el guardado.');
    if(!canWrite())throw new Error('Tu puesto no tiene permiso para editar Colocaciones.');
    if(typeof window.mutateColocacionesV128!=='function')throw new Error('La conexión está cargando. Probá de nuevo en unos segundos.');
    state.busy=true;overlay().classList.add('c128-busy');overlay().setAttribute('aria-busy','true');
    try {const p=await window.mutateColocacionesV128(id,o=>{const patch=builder(o);return {...patch,'colocacionesGestion.version':130,'colocacionesGestion.actualizadoEn':stamp(),'colocacionesGestion.actualizadoPor':actor()}});const current=obra(id);if(current)applyPatch(current,p);render();window.TIZColocacionesGeneralV129?.changed(id);return p;}
    finally {state.busy=false;overlay().classList.remove('c128-busy');overlay().removeAttribute('aria-busy');}
  }
  async function saveInline(id,actionId,fields,version,result=null){if(blockers().length&&!result)throw new Error('Resolvé primero los pendientes vencidos.');return mutate(id,current=>{const old=actions(current,db()).find(a=>a.id===actionId);if(!old||!open(old))throw new Error('La acción ya fue gestionada. Actualizá el listado.');if(String(old.virtual?'virtual:'+old.fecha+'|'+(old.responsable||''):old.actualizadoEn||old.creadoEn||'')!==String(version))throw new Error('Otra persona modificó este renglón. Cancelá la edición para actualizarlo.');if(result)return resultPatch(current,actionId,result,null,stamp(),actor(),db());if(fields.fechaApertura&&!isoDate(fields.fechaApertura))throw new Error('Fecha de apertura inválida.');if(fields.fecha&&!isoDate(fields.fecha))throw new Error('Fecha de compromiso inválida.');const next=validateAction({...old,fechaApertura:fields.fechaApertura===undefined?old.fechaApertura||'':isoDate(fields.fechaApertura),titulo:String(fields.titulo||'').trim(),fecha:isoDate(fields.fecha),responsable:String(fields.responsable||'').trim(),observaciones:String(fields.observaciones||'').trim(),actualizadoEn:stamp(),actualizadoPor:actor()});delete next.virtual;const patch={[`colocacionesGestion.acciones.${actionId}`]:next};if(actionId==='legacy')patch['colocacionesGestion.legacyCapturada']=true;return patch})}
  function actionFromForm(f,id=uid()){const d=new FormData(f);return validateAction({id,titulo:String(d.get('titulo')||'').trim(),tipo:d.get('tipo')||'Seguimiento',responsable:String(d.get('responsable')||'').trim(),fecha:isoDate(d.get('fecha')),prioridad:d.get('prioridad')||'Normal',estadoPlanilla:'',contactoId:d.get('contactoId')||'',estado:d.get('estado')||'Pendiente',observaciones:d.get('observaciones')||'',todoDia:f.elements.todoDia.checked,hora:d.get('hora')||'',duracion:Number(d.get('duracion')||60),direccion:d.get('direccion')||'',zona:d.get('zona')||'',aviso:Number(d.get('aviso')||0)});}
  async function submit(e){
    const f=e.target;if(!f.dataset.form)return;e.preventDefault();if(state.busy)return;
    try{
      if(blockers().length&&f.dataset.form!=='result')throw new Error('Registrá el resultado de los pendientes vencidos antes de continuar.');
      const d=new FormData(f), type=f.dataset.form, id=state.id||d.get('obraId'), o=obra(id);if(!o)throw new Error('Seleccioná una obra disponible.');const at=stamp(),user=actor();
      if(type==='visit'){const fields=Object.fromEntries(d);f.querySelectorAll('input[type=checkbox]').forEach(el=>fields[el.name]=el.checked);await mutate(id,current=>visitPatch(current,fields,d.get('version'),at,user,db()));
      }else if(type==='action'){
        const aid=state.editor?.editId||uid(), a=actionFromForm(f,aid);
        await mutate(id,current=>{if(data(current).cierre?.cerrada)throw new Error('Reabrí el seguimiento antes de agregar acciones.');const old=actions(current,db()).find(x=>x.id===aid);if(old&&!open(old))throw new Error('La acción ya fue gestionada.');const patch={[`colocacionesGestion.acciones.${aid}`]:{...old,...a,creadoEn:old?.creadoEn||at,creadoPor:old?.creadoPor||user,actualizadoEn:at,actualizadoPor:user}};delete patch[`colocacionesGestion.acciones.${aid}`].virtual;if(aid==='legacy')patch['colocacionesGestion.legacyCapturada']=true;return patch;});state.id=id;state.tab='ficha';
      }else if(type==='result'){
        const next=d.get('resultadoTipo')==='continuar'?actionFromForm(f):null;
        await mutate(id,current=>{const p=resultPatch(current,state.editor.id,{detalle:d.get('resultado'),fechaReal:d.get('fechaReal'),cantidadReal:d.get('cantidadReal')||'',control:d.get('control')||'',retrabajo:d.get('retrabajo')||''},next,at,user,db());if(d.has('experiencia'))p[`colocacionesGestion.notas.${uid()}`]={tipo:'Experiencia',texto:d.get('resultado'),fecha:at,usuario:user};return p;});
      }else if(type==='contact'){
        const cid=state.editor?.id||uid();const c={id:cid,nombre:String(d.get('nombre')||'').trim(),cargo:d.get('cargo')||'',telefono:d.get('telefono')||'',email:d.get('email')||'',observaciones:d.get('observaciones')||'',origen:cid==='cotizacion'?'Cotización · completado en obra':'Agregado a esta obra',actualizadoEn:at,actualizadoPor:user};if(!c.nombre)throw new Error('Indicá el nombre del contacto.');
        await mutate(id,current=>{const p={[`colocacionesGestion.contactos.${cid}`]:c};if(d.has('principal'))p['colocacionesGestion.contactoPrincipal']=cid;else if(data(current).contactoPrincipal===cid)p['colocacionesGestion.contactoPrincipal']='';return p;});
      }else if(type==='preparation'){
        const p={'colocacionesGestion.modalidad':d.get('modalidad'),'colocacionesGestion.tipoTrabajo':d.get('tipoTrabajo')||'','colocacionesGestion.direccion':d.get('direccion')||'','colocacionesGestion.zona':d.get('zona')||''};
        CHECKS.forEach(([k])=>{if(!d.has(k+'_estado'))return;const c={estado:d.get(k+'_estado'),detalle:d.get(k+'_detalle')||'',url:d.get(k+'_url')||'',fecha:d.get(k+'_fecha')||'',contactoId:d.get(k+'_contactoId')||'',actualizadoEn:at,usuario:user};if(c.estado==='No corresponde'&&!c.detalle.trim())throw new Error('Indicá el motivo de “No corresponde”.');if(k==='enviado'&&c.estado==='Listo'&&(!c.fecha||!c.contactoId||!c.url||!c.detalle.trim()))throw new Error('Para planos enviados, completá versión, archivo, fecha y destinatario.');if(k==='recibido'&&c.estado==='Listo'&&(!c.fecha||!c.contactoId))throw new Error('Registrá fecha y contacto que confirmó recepción.');p[`colocacionesGestion.preparacion.${k}`]=c;});await mutate(id,()=>p);
      }else if(type==='location'){await mutate(id,()=>({'colocacionesGestion.direccion':String(d.get('direccion')||'').trim(),'colocacionesGestion.zona':String(d.get('zona')||'').trim(),'colocacionesGestion.indicacionesColocacion':String(d.get('indicaciones')||'').trim()}));}else if(type==='note'){const text=String(d.get('texto')||'').trim();if(!text)throw new Error('Escribí la nota.');const nid=uid();await mutate(id,()=>({[`colocacionesGestion.notas.${nid}`]:{tipo:d.get('tipo'),texto:text,fecha:at,usuario:user}}));}
      else if(type==='closeWork'){await mutate(id,current=>{if(pending(current,db()).length)throw new Error('Hay acciones pendientes. Registrá su resultado antes de cerrar.');const checks=data(current).preparacion||{};if(checks.final?.estado!=='Listo'||checks.fotos?.estado!=='Listo'||!checks.fotos?.url)throw new Error('Completá el control final y el vínculo a las fotos en Preparación.');if(!isoDate(d.get('fecha')))throw new Error('Indicá la fecha real.');return {'colocacionesGestion.cierre':{cerrada:true,fecha:d.get('fecha'),resultado:d.get('resultado'),usuario:user},[`colocacionesGestion.eventos.${uid()}`]:{accion:'Colocación cerrada: '+d.get('resultado'),fecha:at,usuario:user},'sectores.colocaciones.estado':'Instalada','sectores.colocaciones.real':fmtDate(d.get('fecha')),'sectores.colocaciones.instalada':true,'sectores.colocaciones.fotosFinales':true};});state.tab='historico';}
      state.editor=null;state.drafts={};state.editors={};if(type==='result'&&blockers().length){closeModal();render();}else drawModal();toast('Colocaciones guardada ✓');
    }catch(err){error(err)}
  }
  function downloadCalendar(entries){const eligible=entries.filter(x=>open(x.accion)&&isoDate(x.accion.fecha));if(!eligible.length)return toast('No hay acciones con fecha para exportar.');const file=new Blob([calendar(eligible,new Date(),db())],{type:'text/calendar;charset=utf-8'});const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download='TIZ-Colocaciones-'+today()+'.ics';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Calendario exportado. Importalo en tu calendario.');}
  async function click(e){
    const b=e.target.closest('button');if(!b||state.busy)return;
    try{
      if(b.hasAttribute('data-overdue')){const r=blockers().find(r=>r.key===b.dataset.overdue);if(!r)return render();if(r.draft)return window.TIZColocacionesGeneralV129.resolveDraft(r.accion.id);return showModal(r.obra.id,'acciones',{kind:'result',id:r.accion.id});}
      if(blockers().length&&!b.hasAttribute('data-close')&&!b.hasAttribute('data-cancel')&&!b.hasAttribute('data-result')){toast('Resolvé los pendientes de anteayer o anteriores para continuar.');return;}
      if(b.hasAttribute('data-close'))return closeModal();
      if(b.hasAttribute('data-print-work'))return window.TIZColocacionesGeneralV129?.printWork(state.id);
      if(b.hasAttribute('data-archive-work')){b.disabled=true;try{await window.TIZColocacionesGeneralV129.archive(state.id,true);drawModal();toast('Ficha de Colocaciones actualizada en Drive ✓')}finally{b.disabled=false}return}
      if(b.hasAttribute('data-week-step')){state.calendarStart=shift(b.dataset.weekStart,Number(b.dataset.weekStep));render();return}if(b.hasAttribute('data-week-today')){state.calendarStart='';render();return}if(b.hasAttribute('data-view')){state.view=b.dataset.view;state.filter='todas';render();return}
      if(b.hasAttribute('data-filter')){state.view='obras';state.filter=b.dataset.filter;render();return}
      if(b.hasAttribute('data-open'))return showModal(b.dataset.open,b.dataset.openTab||'ficha');
      if(b.hasAttribute('data-day'))return showModal('','acciones',{kind:'action',fecha:b.dataset.day});
      if(b.hasAttribute('data-new'))return showModal(b.dataset.new,'acciones',{kind:'action'});
      if(b.hasAttribute('data-tab')){captureDraft();state.editors[state.tab]=state.editor;state.tab=b.dataset.tab;state.editor=state.editors[state.tab]||null;drawModal();return}
      if(b.hasAttribute('data-cancel')){if(state.tab==='acciones')state.tab='ficha';state.editor=null;delete state.editors[state.tab];delete state.drafts[state.tab];drawModal();return}
      if(b.hasAttribute('data-contact')){state.tab='contactos';state.editor={kind:'contact',id:b.dataset.contact};state.drafts={};drawModal();return}
      if(b.hasAttribute('data-result')){state.tab='acciones';state.editor={kind:'result',id:b.dataset.result};state.drafts={};drawModal();return}
      if(b.hasAttribute('data-edit-action')){state.tab='acciones';const a=actions(obra(state.id),db()).find(x=>x.id===b.dataset.editAction);state.editor={kind:'action',editId:a.id,action:a};state.drafts={};drawModal();return}
      if(b.hasAttribute('data-export')){const id=b.dataset.export;return downloadCalendar(id==='all'?(window.TIZColocacionesGeneralV129?.entries().map(r=>({obra:r.obra,accion:r.accion}))||allWorks().flatMap(o=>pending(o,db()).map(a=>({obra:o,accion:a})))):actions(obra(state.id),db()).filter(a=>a.id===id).map(a=>({obra:obra(state.id),accion:a})));}
      if(b.hasAttribute('data-suggestion')){const s=suggestions(obra(state.id),db())[+b.dataset.suggestion];state.tab='acciones';state.editor={kind:'action',titulo:s.titulo};state.drafts={};drawModal();return}
      if(b.hasAttribute('data-note-action')){const text=overlay().querySelector('[name=texto]')?.value.trim();if(!text)throw new Error('Escribí la ayudamemoria.');state.tab='acciones';state.editor={kind:'action',titulo:text,fecha:/\bmañana\b/i.test(text)?shift(today(),1):today()};state.drafts={};drawModal();return}
      if(b.hasAttribute('data-close-work')){document.getElementById('c128-modal-content').innerHTML=`<form data-form="closeWork"><h3>Cerrar colocación de la obra</h3><div class="c128-note">Requiere: acciones resueltas, control final y fotos.</div><label>Fecha real<input name="fecha" type="date" required value="${today()}"></label><label>Resultado / conformidad<textarea name="resultado" required rows="3"></textarea></label><div class="c128-actions"><button type="submit" class="btn btn-primary">Confirmar cierre</button>${btn('Cancelar','data-cancel="1"')}</div></form>`;return}
      if(b.hasAttribute('data-reopen')){await mutate(state.id,()=>({'colocacionesGestion.cierre.cerrada':false,[`colocacionesGestion.eventos.${uid()}`]:{accion:'Seguimiento reabierto',fecha:stamp(),usuario:actor()},'sectores.colocaciones.estado':'A coordinar','sectores.colocaciones.real':'','sectores.colocaciones.instalada':false}));drawModal();toast('Seguimiento reabierto');return}
      if(b.hasAttribute('data-import-confirm'))return importSelected();
    }catch(err){error(err)}
  }
  async function change(e){
    if(e.target.name==='todoDia'||e.target.id==='c128-result-type')toggleTime();
    if(e.target.name==='fechaVisita'){const f=e.target.closest('form');f?.querySelectorAll('input[type=checkbox]').forEach(el=>el.checked=false)}
    if(e.target.id==='c128-mode'){captureDraft();drawModal()}
    if(e.target.id==='c128-form-work'){const o=obra(e.target.value);const f=e.target.form;if(o){f.elements.contactoId.innerHTML=contactOptions(o);f.elements.direccion.value=logistics(o,db()).direccion}}
    if(e.target.id==='c128-upload'&&e.target.files?.[0])try{await importPreview(e.target.files[0]);}catch(err){error(err)}
  }
  async function sheetJS(){if(window.XLSX)return window.XLSX;await new Promise((resolve,reject)=>{let s=document.getElementById('c128-xlsx');if(!s){s=document.createElement('script');s.id='c128-xlsx';s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';document.head.appendChild(s)}s.addEventListener('load',resolve,{once:true});s.addEventListener('error',()=>{s.remove();reject(new Error('No se pudo cargar el lector de Excel.'));},{once:true});});return window.XLSX;}
  async function importPreview(file){
    if(!canWrite())throw new Error('Sin permiso para importar.');const X=await sheetJS(),w=X.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    const sheets=['Colocaciones','Histórico'].filter(n=>w.Sheets[n]);if(!w.Sheets.Colocaciones)throw new Error('La planilla debe tener una hoja Colocaciones.');
    const matrices=Object.fromEntries(sheets.map(sheet=>[sheet,X.utils.sheet_to_json(w.Sheets[sheet],{header:1,defval:'',raw:true})]));
    return importMatrices(matrices);
  }
  function importMatrices(matrices){
    const rows=parseImportRows(matrices,allWorks());if(!rows.length)throw new Error('No se encontraron acciones en la planilla.');
    state.importRows=rows;state.id='';state.editor=null;state.drafts={};const r=overlay();r.classList.add('show');r.innerHTML=`<div class="c128-dialog"><div class="c128-head"><h3>Importar planificación · ${rows.length} acciones</h3>${btn('Cerrar','data-close="1"')}</div><div class="c128-note">Cada fila se vincula a una obra. Sólo se propone vínculo automático cuando la OT coincide con una única obra. Las filas sin OT pueden guardarse en la base general y asociarse después. Se conservan fechas y responsables originales; los faltantes se destacan después.</div>${rows.map((a,i)=>`<div class="c128-task"><b>${esc(a.cliente)} · ${esc(a.ot||'Sin OT')} · ${chip(a.estado)}</b><div>${esc(a.titulo)}</div><div class="c128-muted">${fmtDate(a.fecha)} · ${esc(a.responsable||'Sin responsable')} · ${esc(a.hoja)} fila ${a.fila}</div><label>Vincular a obra<select id="c128-import-${i}"><option value="">No importar todavía</option><option value="__draft__" ${!a.obraId?'selected':''}>Guardar sin asociar todavía</option>${allWorks().map(o=>`<option value="${esc(o.id)}" ${o.id===a.obraId?'selected':''}>OT ${esc(o.ot||'—')} · ${esc(o.cliente||'')} · ${esc((o.desc||'').slice(0,70))}</option>`).join('')}</select></label></div>`).join('')}<div class="c128-actions">${btn('Importar filas seleccionadas','data-import-confirm="1"',true)}</div><div id="c128-import-status" class="c128-status" aria-live="polite"></div><div id="c128-error" class="c128-error" role="alert"></div></div>`;
  }
  async function importSelected(){
    const selections=state.importRows.map((a,i)=>({...a,obraId:document.getElementById('c128-import-'+i)?.value||''})).filter(a=>a.obraId);if(!selections.length)throw new Error('Vinculá al menos una fila a una obra.');
    const drafts=selections.filter(a=>a.obraId==='__draft__'), linked=selections.filter(a=>a.obraId!=='__draft__');
    const groups=new Map();linked.forEach(a=>{if(!groups.has(a.obraId))groups.set(a.obraId,[]);groups.get(a.obraId).push(a)});let count=0;
    for(const [id,rows] of groups){let added=0;await mutate(id,current=>{const p={};if(data(current).cierre?.cerrada&&rows.some(a=>open(a)))throw new Error('La obra '+current.ot+' está cerrada. Reabrila antes de importar pendientes.');for(const a of rows){if(data(current).acciones?.[a.id])continue;const {obraId,...record}=a;record.origen='Excel';record.creadoEn=stamp();record.creadoPor=actor();if(!open(record)){record.gestionadaPor=actor();record.gestionadaEn=stamp();record.resultado ||= 'Importada desde histórico';}p[`colocacionesGestion.acciones.${a.id}`]=record;added++}if(added)p['colocacionesGestion.legacyCapturada']=true;return p});count+=added;const s=document.getElementById('c128-import-status');if(s)s.textContent=`${count} acciones importadas. Las filas ya importadas se omiten.`;}
    for(const a of drafts){const exists=window.TIZColocacionesGeneralV129?.entries().some(r=>r.accion.id===a.id);if(exists)continue;await window.colocacionesApiV129({mode:'save',action:{...a,origen:'Planilla'},version:''});count++}if(drafts.length)await window.TIZColocacionesGeneralV129?.load(true);
    toast(`${count} acciones importadas ✓`);
  }
  function install(){
    if(!window.refreshCurrent){setTimeout(install,250);return}style();window.__TIZ_COLOCACIONES_V128__=true;
    window.renderColocacionesV128=render;window.renderColocaciones=render;
    window.TIZColocacionesUIV128={render,blockers,saveInline,calendar:agendaHTML,importMatrices,open:showModal,view:v=>{state.view=v;render()},edit:(id,a,kind)=>showModal(id,'acciones',kind==='result'?{kind,id:a.id}:{kind:'action',editId:a.id,action:a})};
    const previous=window.refreshCurrent;window.refreshCurrent=function(){if(window.currentPage==='colocaciones')return render();return previous.apply(this,arguments)};
    const oldFicha=window.openSectorFichaV31;window.openSectorFichaV31=function(id,sector){if(sector==='Colocaciones')return showModal(id);return oldFicha?.apply(this,arguments)};
    const oldSector=window.openSectorV34;window.openSectorV34=function(key,id){if(key==='colocaciones')return showModal(id||window.editingId?.obra);return oldSector?.apply(this,arguments)};
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay().classList.contains('show')&&!state.busy)closeModal()});
    if(window.currentPage==='colocaciones')render();
    let lastDay=today();setInterval(()=>{const d=today();if(d!==lastDay){lastDay=d;if(window.currentPage==='colocaciones')render()}},60000);
    console.info('[TIZ] Colocaciones integrada',VERSION);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,1800));else setTimeout(install,1800);
})();

