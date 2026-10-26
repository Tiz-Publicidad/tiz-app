/* Shared column map: read the live header before locating or writing an OT. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TIZBaseMadreLayoutV1=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const names={fecha:['fecha'],semana:['sem','semana'],ot:['ot ct','ot','ct'],descripcion:['descripcion de la obra','descripcion'],contacto:['arquitecto','contacto'],cliente:['cliente'],neto:['neto'],bruto:['bruto']};
  const workNames={ot:names.ot,descripcion:names.descripcion,cliente:names.cliente,status:['status','estado','estado de la obra']};
  function layout(headers,fields=names){
    const h=headers.map(norm),out={};
    for(const [key,aliases] of Object.entries(fields)){
      const hits=h.map((v,i)=>aliases.includes(v)?i:-1).filter(i=>i>=0);
      if(hits.length!==1)throw Error('Revisar encabezados de Base Madre: '+key+' no es único');
      out[key]=hits[0];
    }
    return out;
  }
  function column(index){let s='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
  function salesDate(value){
    if(value==null||value==='')return '';
    let date;
    if(typeof value?.toDate==='function')date=value.toDate();
    else if(typeof value==='object'&&Number.isFinite(value.seconds??value._seconds))date=new Date(Number(value.seconds??value._seconds)*1000);
    else if(typeof value==='number')date=new Date(Date.UTC(1899,11,30)+Math.round(value)*86400000);
    else if(typeof value?.getTime==='function')date=value;
    let raw=String(value).trim(),m;
    if(!date&&/^\d{4}-\d{2}-\d{2}T/.test(raw))date=new Date(raw);
    if(date){
      if(!Number.isFinite(date.getTime()))throw Error('Fecha de venta inválida');
      if(typeof value==='number')raw=date.toISOString().slice(0,10);
      else{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const get=t=>parts.find(p=>p.type===t).value;raw=get('year')+'-'+get('month')+'-'+get('day');}
    }
    if((m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/))){/* ISO calendar date */}
    else if((m=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))){let year=Number(m[3]);if(year<100)year+=2000;m=[raw,String(year),m[2],m[1]];}
    else throw Error('Fecha de venta inválida; revisar la aprobación');
    const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]),check=new Date(Date.UTC(y,month-1,day));
    if(check.getUTCFullYear()!==y||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)throw Error('Fecha de venta inválida; revisar la aprobación');
    return String(y)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  }
  function salesPeriod(p={},existing=[],l={},now=new Date()){
    const stored=existing[l.fecha],week=existing[l.semana];
    const candidate=stored||p.fechaVenta||p.fechaAprobacion||p.promovidoEn||now;
    const iso=salesDate(candidate),[y,m,d]=iso.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
    date.setUTCDate(date.getUTCDate()+4-(date.getUTCDay()||7));
    const calculated=Math.ceil((((date-new Date(Date.UTC(date.getUTCFullYear(),0,1)))/86400000)+1)/7);
    if(!stored&&week!==''&&week!=null&&Number(week)!==calculated)throw Error('La fila tiene semana sin fecha de venta; revisar antes de sincronizar');
    return {iso,fecha:String(d).padStart(2,'0')+'/'+String(m).padStart(2,'0')+'/'+String(y).slice(-2),semana:stored&&week!==''&&week!=null?week:calculated};
  }
  function approvalData(sheet,row,payload,fecha,semana,l){
    const data=Object.entries({...payload,fecha,semana}).filter(([k,v])=>k in names&&v!==undefined).map(([k,v])=>({index:l[k],value:v})).sort((a,b)=>a.index-b.index),groups=[];
    for(const cell of data){const last=groups[groups.length-1];if(last&&last.end+1===cell.index){last.end=cell.index;last.values.push(cell.value)}else groups.push({start:cell.index,end:cell.index,values:[cell.value]});}
    return groups.map(g=>({range:"'"+sheet.replace(/'/g,"''")+"'!"+column(g.start)+row+':'+column(g.end)+row,values:[g.values]}));
  }
  function emptyRow(values,row){
    const expected=`=IF(T${row}="";"";IFERROR(WEEKNUM(INT(T${row});2);""))`;
    return !values.some((v,c)=>String(v??'').trim()&&!(c===20&&String(v).replace(/[\s$]/g,'').replace(/,/g,';').toUpperCase()===expected));
  }
  async function nextFreeRow(start,{getGrid,readRows,appendRows}){
    const grid=await getGrid();
    if(!Number.isInteger(grid.rowCount)||grid.rowCount<2||!Number.isInteger(grid.columnCount)||grid.columnCount<25)throw Error('No se pudo verificar el tamaño de Base Madre');
    // Read in blocks, including every column: manual tasks and formulas may lack an OT.
    for(let first=start;first<=grid.rowCount;first+=200){
      const last=Math.min(first+199,grid.rowCount),rows=await readRows(first,last,grid.columnCount);
      for(let row=first;row<=last;row++)if(!grid.hiddenRows?.includes(row)&&emptyRow(rows[row-first]||[],row)){
        // Recheck the candidate immediately before returning it for writing.
        const fresh=await readRows(row,row,grid.columnCount);
        if(emptyRow(fresh[0]||[],row))return row;
      }
    }
    // A full sheet is extended at the end; existing rows never move.
    await appendRows(grid.sheetId,100);
    return grid.rowCount+1;
  }
  async function read(sheets,spreadsheetId,sheet){const r=await sheets.spreadsheets.values.get({spreadsheetId,range:"'"+sheet+"'!A2:AL2",valueRenderOption:'FORMATTED_VALUE'});return layout(r.data.values?.[0]||[]);}
  async function readWorks(sheets,spreadsheetId,sheet){
    const prefix="'"+sheet.replace(/'/g,"''")+"'!",headerRange=prefix+'A2:AL2';
    const header=await sheets.spreadsheets.values.get({spreadsheetId,range:headerRange,valueRenderOption:'FORMATTED_VALUE'});
    const fields=layout(header.data.values?.[0]||[],workNames),keys=Object.keys(workNames);
    const ranges=keys.map(k=>prefix+column(fields[k])+'3:'+column(fields[k]));
    const result=await sheets.spreadsheets.values.batchGet({spreadsheetId,ranges:[...ranges,headerRange],valueRenderOption:'FORMATTED_VALUE'});
    const values=result.data.valueRanges||[],verified=layout(values[keys.length]?.values?.[0]||[],workNames);
    if(keys.some(k=>fields[k]!==verified[k]))throw Error('Las columnas de TIZ 2026 cambiaron durante la lectura. Volvé a actualizar.');
    const size=Math.max(0,...values.slice(0,keys.length).map(v=>v.values?.length||0));
    return Array.from({length:size},(_,i)=>({row:i+3,...Object.fromEntries(keys.map((k,j)=>[k==='descripcion'?'desc':k,String(values[j]?.values?.[i]?.[0]??'').trim()]))}));
  }
  return {layout,column,salesDate,salesPeriod,approvalData,emptyRow,nextFreeRow,read,readWorks};
});
