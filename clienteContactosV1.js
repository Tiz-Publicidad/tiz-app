/* Contactos compartidos por cliente: ficha, cotizaciones y obras. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZClienteContactosV1=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const text=v=>String(v??'').trim();
 const array=v=>Array.isArray(v)?v:[];
 const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
 const aliases=c=>[c.nombre,c.razonSocial,c.razon_social,c.nombreFiscal].map(norm).filter(Boolean);
 function client(db,reference){
  const ref=typeof reference==='string'?{cliente:reference}:reference||{},clients=db?.clientes||[];
  if(ref.clienteId)return clients.find(c=>c.id===ref.clienteId)||null;
  const name=norm(ref.cliente||ref.nombre),matches=clients.filter(c=>aliases(c).includes(name));
  return name&&matches.length===1?matches[0]:null;
 }
 function contact(c){return {...c,nombre:text(c?.nombre||c?.contacto),telefono:text(c?.telefono||c?.tel||c?.cel),email:text(c?.email||c?.correo),cargo:text(c?.cargo)};}
 function merge(list,additions){
  const out=[];
  for(const item of [...(Array.isArray(list)?list:[]),...(Array.isArray(additions)?additions:[])]){
   const c=contact(item);if(!c.nombre)continue;
   const old=out.find(x=>norm(x.nombre)===norm(c.nombre));
   if(old){for(const [k,v] of Object.entries(c))if(v!==''&&v!==undefined&&v!==null)old[k]=v;}
   else out.push(c);
  }
  return out;
 }
 function fromLogistics(e={}){return [
  {nombre:e.contacto,telefono:e.contactoTelefono||e.telefonoContacto,email:e.contactoEmail||e.emailContacto,cargo:e.contactoCargo},
  {nombre:e.retira,telefono:e.retiraTelefono||e.telefonoRetira,email:e.retiraEmail||e.emailRetira,cargo:e.retiraCargo}
 ].filter(c=>text(c.nombre));}
 function list(db,reference){
  const c=client(db,reference);if(!c)return[];
  const master=[{nombre:c.contacto,telefono:c.cel||c.telefono,email:c.email,cargo:c.contactoCargo},...array(c.contactosEntrega),...array(c.contactosRetiro),...array(c.contactos)];
  let out=merge([],master);
  for(const record of [...(db.presupuestos||[]),...(db.obras||[])]){
   if(client(db,record)?.id!==c.id)continue;
   out=merge(out,[...fromLogistics(record.entregaLogistica||record.logistica||{}),...Object.values(record.colocacionesGestion?.contactos||{}).filter(x=>!x.oculto)]);
  }
  return merge(out,master);
 }
 function fill(input,tel,mail,choices,cargo){
  const selected=choices.find(c=>norm(c.nombre)===norm(input.value)),previous=input._tizContactAutofill||{};
  for(const [el,key] of [[tel,'telefono'],[mail,'email'],[cargo,'cargo']])if(el&&(!text(el.value)||el.value===previous[key]))el.value=selected?.[key]||'';
  input._tizContactAutofill={telefono:selected?.telefono||'',email:selected?.email||'',cargo:selected?.cargo||''};
 }
 return {norm,client,contact,merge,fromLogistics,list,fill};
});
