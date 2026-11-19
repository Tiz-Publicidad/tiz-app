/* Datos logísticos compartidos entre la OT y su formulario de producción. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TIZOtLogisticaV1=factory();})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const text=v=>String(v??'').trim();
 const modes={a_definir:'A definir',retiro_fabrica:'Retira en fábrica',envio:'Envío a domicilio',colocacion:'Con colocación'};
 function iso(value){const s=text(value),m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)||s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)?.map((v,i,a)=>i===1?a[3]:i===3?a[1]:v);if(!m)return '';const v=m[1]+'-'+m[2]+'-'+m[3],d=new Date(v+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v?v:'';}
 const date=value=>{const v=iso(value);return v?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):'';};
 function logistics(work={},quote={}){
  const info=work.infoPresupuesto||{};
  const obra=work.entregaLogistica||{}, presupuesto=quote.entregaLogistica||{};
  const domicilio=[presupuesto.domicilio,obra.domicilio,quote.infoPresupuesto?.domicilio,info.domicilio].map(text).find(Boolean)||'';
  return {...{tipo:info.modalidadEntrega||'a_definir',fecha:info.fechaEntrega||'',contacto:info.contacto||'',contactoTelefono:info.contactoTelefono||'',detalle:info.indicacionesEntrega||''},...obra,...presupuesto,domicilio};
 }
 function notes(previous,log){
  // Marcadores propios permiten reemplazar también indicaciones de varias líneas.
  const free=text(previous).replace(/\n?\[ENTREGA ACTUALIZADA\][\s\S]*?\[FIN ENTREGA\]\n?/g,'\n').split(/\r?\n/).filter(line=>!/^\s*(?:ENTREGA \/ LOGÍSTICA:|Domicilio:|Dirección de obra:|Fecha prevista(?: de colocación)?:|Contacto:|Cargo contacto:|Teléfono contacto:|Email contacto:|Indicaciones logísticas:|Retira:)/i.test(line)).join('\n').trim();
  const lines=['ENTREGA / LOGÍSTICA: '+(modes[log.tipo]||'A definir')];
  for(const [label,value] of [['Domicilio',log.domicilio],['Fecha prevista de colocación',date(log.fecha)],['Contacto',log.contacto],['Cargo contacto',log.contactoCargo],['Teléfono contacto',log.contactoTelefono],['Email contacto',log.contactoEmail],['Retira',log.retira],['Indicaciones logísticas',log.detalle]])if(text(value))lines.push(label+': '+text(value));
  return [free,'[ENTREGA ACTUALIZADA]',...lines,'[FIN ENTREGA]'].filter(Boolean).join('\n');
 }
 const displayNotes=value=>text(value).replace(/^\[(?:ENTREGA ACTUALIZADA|FIN ENTREGA)\]\n?/gm,'').trim();
 function requests(sheet,work,quote={}){
  const id=sheet.properties.sheetId,data=sheet.data?.[0]||{},rows=data.rowData||[],offset=data.startRow||0,log=logistics(work,quote),out=[];
  const value=(row,col)=>row.values?.[col]?.formattedValue??row.values?.[col]?.userEnteredValue?.stringValue??'';
  const write=(row,col,v)=>out.push({updateCells:{range:{sheetId:id,startRowIndex:row,endRowIndex:row+1,startColumnIndex:col,endColumnIndex:col+1},rows:[{values:[{userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:text(v)}}]}],fields:'userEnteredValue'}});
  const fmt=(row,col,endCol,format)=>out.push({repeatCell:{range:{sheetId:id,startRowIndex:row,endRowIndex:row+1,startColumnIndex:col,endColumnIndex:endCol},cell:{userEnteredFormat:format},fields:Object.keys(format).map(k=>'userEnteredFormat.'+k).join(',')}});
  let inLogistics=false;
  rows.forEach((r,i)=>{
   const a=text(value(r,0)),d=text(value(r,3)),row=offset+i;
   if(a==='DATOS DE OBRA / COLOCACIÓN')inLogistics=true;
   if(a==='INFORMACIÓN Y PLANEAMIENTO')inLogistics=false;
   if(inLogistics&&a==='Dirección'&&d==='Contacto'){write(row,1,log.domicilio);write(row,4,log.contacto);}
   if(inLogistics&&a==='Fecha prevista'&&d==='Modalidad'){
    const planned=iso(log.fecha);write(row,1,planned?(Date.parse(planned+'T12:00:00Z')-Date.UTC(1899,11,30,12))/86400000:'');write(row,4,modes[log.tipo]||'A definir');
    fmt(row,1,3,{numberFormat:{type:'DATE',pattern:'dd/mm/yyyy'},backgroundColor:{red:1,green:.93,blue:.55}});
   }
   // Las fechas de Producción conservan su valor y no reciben el resaltado de Colocación.
   if(a==='Inicio previsto')for(const col of [1,4]){const v=r.values?.[col]?.userEnteredValue;if(v?.numberValue!==undefined||iso(v?.stringValue)){if(v?.stringValue){const planned=iso(v.stringValue);write(row,col,(Date.parse(planned+'T12:00:00Z')-Date.UTC(1899,11,30,12))/86400000);}fmt(row,col,col===1?3:6,{numberFormat:{type:'DATE',pattern:'dd/mm/yyyy'}});}}
   if(a==='OBSERVACIONES OPERATIVAS'&&rows[i+1]){
    const target=rows[i+1].values?.[0]||{};let old=text(value(rows[i+1],0));
    if(text(target.note).startsWith('TIZ logística: ')){try{old=old.replace(JSON.parse(target.note.slice(15)),'').trim();}catch{}}
    const block=displayNotes(notes('',log)),note=displayNotes(notes(old,log));write(row+1,0,note);
    const update=out[out.length-1].updateCells;update.rows[0].values[0].note='TIZ logística: '+JSON.stringify(block);update.fields+=',note';
    out.push({updateDimensionProperties:{range:{sheetId:id,dimension:'ROWS',startIndex:row+1,endIndex:row+2},properties:{pixelSize:Math.max(65,Math.min(400,note.split('\n').length*17+10))},fields:'pixelSize'}});
    fmt(row+1,0,6,{wrapStrategy:'WRAP',verticalAlignment:'TOP'});
   }
  });return out;
 }
 return {logistics,iso,date,notes,displayNotes,requests};
});
