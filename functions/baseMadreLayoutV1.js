/* Shared column map: read the live header before locating or writing an OT. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TIZBaseMadreLayoutV1=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const names={fecha:['fecha'],semana:['sem','semana'],ot:['ot ct','ot','ct'],descripcion:['descripcion de la obra','descripcion'],contacto:['arquitecto','contacto'],cliente:['cliente'],neto:['neto'],bruto:['bruto']};
  function layout(headers){
    const h=headers.map(norm),out={};
    for(const [key,aliases] of Object.entries(names)){
      const hits=h.map((v,i)=>aliases.includes(v)?i:-1).filter(i=>i>=0);
      if(hits.length!==1)throw Error('Revisar encabezados de Base Madre: '+key+' no es único');
      out[key]=hits[0];
    }
    return out;
  }
  function column(index){let s='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
  function approvalData(sheet,row,payload,fecha,semana,l){
    const data=Object.entries({...payload,fecha,semana}).filter(([k])=>k in names).map(([k,v])=>({index:l[k],value:v})).sort((a,b)=>a.index-b.index),groups=[];
    for(const cell of data){const last=groups[groups.length-1];if(last&&last.end+1===cell.index){last.end=cell.index;last.values.push(cell.value)}else groups.push({start:cell.index,end:cell.index,values:[cell.value]});}
    return groups.map(g=>({range:"'"+sheet.replace(/'/g,"''")+"'!"+column(g.start)+row+':'+column(g.end)+row,values:[g.values]}));
  }
  async function read(sheets,spreadsheetId,sheet){const r=await sheets.spreadsheets.values.get({spreadsheetId,range:"'"+sheet+"'!A2:AL2",valueRenderOption:'FORMATTED_VALUE'});return layout(r.data.values?.[0]||[]);}
  return {layout,column,approvalData,read};
});
