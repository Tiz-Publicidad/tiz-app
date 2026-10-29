/* Copia fiel de las filas de Google Sheets: no combina anticipos ni saldos. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZObrasPlanillaCoreV1=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const spreadsheetId='1mOhuPKcMG8PO3QsY3g84WL4p3o43t4ilK8Jx1DHjF5M';
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function columns(headers){const find=(aliases,required=true)=>{const hits=headers.flatMap((h,i)=>aliases.includes(norm(h))?[i]:[]);if(required&&hits.length!==1)throw Error('La columna '+aliases[0]+' no tiene una identificación única en Google Sheets.');return hits.length===1?hits[0]:-1;};return {ot:find(['ot ct','ot']),desc:find(['descripcion de la obra','descripcion']),cliente:find(['cliente']),estado:find(['status','estado']),semana:find(['sem','semana'],false)};}
  function fromResponse(data){
    if(data?.ok!==true||data.spreadsheetId!==spreadsheetId||data.sheet!=='Base de datos'||data.firstRow!==2||!Array.isArray(data.rows)||!data.readAt||!Number.isFinite(Date.parse(data.readAt)))throw Error('No se pudo verificar el origen de los datos de Google Sheets.');
    const headers=(data.rows[0]||[]).map(text),map=columns(headers);
    if(headers.length<26||headers.length>38)throw Error('La lectura no incluye todas las columnas de la planilla.');
    const entries=data.rows.slice(1).map((r,i)=>({row:i+3,cells:Array.from({length:headers.length},(_,j)=>String(r?.[j]??''))})).filter(e=>[map.ot,map.desc,map.cliente,map.estado].some(c=>text(e.cells[c])));
    if(!entries.length)throw Error('Google Sheets no devolvió obras para copiar. Se conserva la copia anterior.');
    return {version:1,spreadsheetId,sheet:data.sheet,sourceReadAt:data.readAt,headers,entries};
  }
  function validateCopy(value){
    if(value?.version!==1||value.spreadsheetId!==spreadsheetId||value.sheet!=='Base de datos'||!Array.isArray(value.headers)||!Array.isArray(value.entries)||!value.entries.length||!value.sourceReadAt||!Number.isFinite(Date.parse(value.sourceReadAt)))throw Error('La copia de la planilla no es válida.');
    columns(value.headers);const seen=new Set();
    for(const e of value.entries){if(!Number.isInteger(e.row)||e.row<3||seen.has(e.row)||!Array.isArray(e.cells)||e.cells.length!==value.headers.length||e.cells.some(c=>typeof c!=='string'))throw Error('La copia contiene una fila incompleta o repetida.');seen.add(e.row);}
    return value;
  }
  function filter(copy,{query='',cliente='',estado=''}={}){const c=columns(copy.headers),q=norm(query),cl=norm(cliente);return copy.entries.filter(e=>(!q||norm(e.cells[c.ot]+' '+e.cells[c.desc]).includes(q))&&(!cl||norm(e.cells[c.cliente]).includes(cl))&&(!estado||text(e.cells[c.estado])===estado));}
  const csvCell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  function csv(copy,entries=copy.entries){return '\uFEFF'+[copy.headers,...entries.map(e=>e.cells)].map(r=>r.map(v=>csvCell(/^[=+@\-\t\r]/.test(String(v))?'\''+v:v)).join(';')).join('\r\n');}
  return {spreadsheetId,text,norm,esc,columns,fromResponse,validateCopy,filter,csv};
});
