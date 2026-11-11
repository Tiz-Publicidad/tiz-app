'use strict';
const {createHash}=require('node:crypto');
const TITLE='MATERIALES OT',KEY='tiz_materiales_ot_v1',FIRST=5,LAST=504;
const SALES=['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com'];
const SALES_GOOGLE=['info@tizpublicidad.com'];
const AUTOMATION=['github-arca-constancia@tiz---app.iam.gserviceaccount.com','tiz---app@appspot.gserviceaccount.com','52620104053-compute@developer.gserviceaccount.com'];
const PRODUCTION=['pablo.aciar@tizpublicidad.com','julieta.aguirre@tizpublicidad.com','contrerasfedericogabriel365@gmail.com'];
const STORE=['cristiantizpublicidad@gmail.com'];
const READERS=[...SALES,...PRODUCTION,...STORE,'carolina.flores@tizpublicidad.com'];
const HEADERS=['Código Ventas','Material presupuestado','Cantidad Ventas','Unidad Ventas','Costo neto previsto','Código Producción','Material / detalle Producción','Cantidad prevista Producción','Unidad Producción','Detalle / motivo Producción','Código Pañol','Material entregado','Cantidad entregada','Unidad Pañol','CD / EX','Fecha entrega','Detalle / motivo Pañol','Cantidad Ventas','Previsto Producción','Entregado acumulado','Desvío vs Producción','Alerta','Clave Ventas','Clave Producción','Clave Pañol'];
const text=v=>String(v??'').trim(),norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const fail=(m,status=409)=>Object.assign(Error(m),{status});
function sector(email){email=norm(email);return SALES.includes(email)?'ventas':PRODUCTION.includes(email)?'produccion':STORE.includes(email)?'panol':'';}
function salesRows(quote={},work={}){
 const approved=quote.insumosVentasAprobados||work.insumosVentasAprobados;
 const source=Array.isArray(approved?.items)&&approved.items.length?approved.items:Array.isArray(quote.insumosVentas)?quote.insumosVentas:work.insumosVentas||[];
 if(source.length>LAST-FIRST+1)throw fail('El presupuesto supera la capacidad de la solapa de materiales.');
 return source.map(r=>{
  const row=[text(r.codigo),text(r.descripcion||r.articulo||r.desc),r.cantidad===null||r.cantidad===undefined||r.cantidad===''?'':Number.isFinite(Number(r.cantidad))?Number(r.cantidad):'',text(r.unidad||r.unidadStock),Number.isFinite(r.costoTotal)?r.costoTotal:''];
  const manual=r.costoOrigen==='manual'||text(r.precioPrevisto)!=='',price=r.costoUnitarioPrevisto??(text(r.precioPrevisto)!==''?Number(text(r.precioPrevisto).replace(',','.')):null);
  const note=(manual?'Precio previsto manual.':'Precio de Compras conservado al aprobar.')+(Number.isFinite(price)?' Neto: ARS '+price.toLocaleString('es-AR',{maximumFractionDigits:6})+' / '+text(r.unidadCostoPrevisto||r.unidad):'')+(manual?' No modifica el precio del catálogo.':'');
  Object.defineProperties(row,{costoManual:{value:manual},costoNota:{value:note}});return row;
 }).filter(r=>r[0]||r[1]);
}
const hash=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>[...r,r.costoNota||'']))).digest('hex');
const range=(sheetId,a,b,c=0,d=25)=>({sheetId,startRowIndex:a,endRowIndex:b,startColumnIndex:c,endColumnIndex:d});
const cell=v=>({userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:String(v??'')}});
function values(sheetId,start,rows){const sales=start>=4&&rows[0].length===5;return {updateCells:{range:range(sheetId,start,start+rows.length,0,rows[0].length),rows:rows.map(r=>({values:r.map((v,i)=>({...cell(v),...(sales?{note:i===4?r.costoNota||'':'',userEnteredFormat:{numberFormat:i===4?{type:'NUMBER',pattern:r.costoManual?'#,##0.00" · manual"':'#,##0.00'}:{type:typeof v==='number'?'NUMBER':'TEXT',pattern:typeof v==='number'?'0.######':'@'}}}:{})}))})),fields:sales?'userEnteredValue,note,userEnteredFormat.numberFormat':'userEnteredValue'}};}
function formulas(row){
 const key=(code,desc,unit)=>`IF(AND(${code}${row}="",${desc}${row}=""),"",IF(${code}${row}<>"","c:"&IFERROR(VALUE(${code}${row}),LOWER(TRIM(${code}${row}))),"n:"&LOWER(TRIM(${desc}${row})))&"|"&UPPER(TRIM(${unit}${row})))`;
 return [
  `=IF(Y${row}="","",IF(COUNTIFS($W${FIRST}:$W${LAST},Y${row},$C${FIRST}:$C${LAST},"<>")=0,"",SUMIF($W$${FIRST}:$W$${LAST},Y${row},$C$${FIRST}:$C$${LAST})))`,
  `=IF(Y${row}="","",IF(COUNTIFS($X${FIRST}:$X${LAST},Y${row},$H${FIRST}:$H${LAST},"<>")=0,"",SUMIF($X$${FIRST}:$X$${LAST},Y${row},$H$${FIRST}:$H$${LAST})))`,
  `=IF(Y${row}="","",SUMIF($Y$${FIRST}:$Y$${LAST},Y${row},$M$${FIRST}:$M$${LAST}))`,
  `=IF(OR(Y${row}="",S${row}=""),"",T${row}-S${row})`,
  `=IF(Y${row}="","",IF(OR(M${row}="",N${row}="",O${row}="",P${row}=""),"Completar cantidad, unidad, CD/EX y fecha",IF(O${row}="EX","EX declarado",IF(S${row}="","Sin previsión Producción",IF(U${row}>0,"Entrega mayor a prevista","Dentro de previsión")))))`,
  '='+key('A','B','D'),'='+key('F','G','I'),'='+key('K','L','N')
 ];
}
function protections(sheetId,existing=[]){
 const managed=existing.filter(p=>text(p.description).startsWith(KEY+':'));
 const specs=[{name:'estructura',range:{sheetId},unprotectedRanges:[range(sheetId,FIRST-1,LAST,0,17)],users:[]},{name:'ventas',range:range(sheetId,FIRST-1,LAST,0,5),users:SALES_GOOGLE},{name:'produccion',range:range(sheetId,FIRST-1,LAST,5,10),users:PRODUCTION},{name:'panol',range:range(sheetId,FIRST-1,LAST,10,17),users:STORE}];
 return specs.map(s=>{const old=managed.find(p=>p.description===KEY+':'+s.name),protectedRange={description:KEY+':'+s.name,range:s.range,warningOnly:false,editors:{users:[...s.users,...AUTOMATION],domainUsersCanEdit:false},...(s.unprotectedRanges?{unprotectedRanges:s.unprotectedRanges}:{})};return old?{updateProtectedRange:{protectedRange:{...protectedRange,protectedRangeId:old.protectedRangeId},fields:'description,range,warningOnly,editors,unprotectedRanges'}}:{addProtectedRange:{protectedRange}};});
}
function initialize(sheetId,work,rows,metadata){
 const title='MATERIALES OT · Ventas / Producción / Pañol',info=`OT ${text(work.ot)} · ${text(work.cliente)} · Ventas: presupuesto original. Producción desglosa “varios”. Pañol registra entregas reales. Comparación por código o descripción + unidad; no convierte unidades automáticamente.`;
 const req=[values(sheetId,0,[[title,...Array(24).fill('')],[info,...Array(24).fill('')],['VENTAS · Giancarlo',...Array(4).fill(''),'PRODUCCIÓN · Pablo / Juli / Fede',...Array(4).fill(''),'PAÑOL · Cristian (Calidad)',...Array(6).fill(''),'COMPARACIÓN AUTOMÁTICA',...Array(7).fill('')],HEADERS]),{createDeveloperMetadata:{developerMetadata:{metadataKey:KEY,metadataValue:JSON.stringify(metadata),visibility:'DOCUMENT',location:{sheetId}}}}];
 for(const [start,end,row] of [[0,25,0],[0,25,1],[0,5,2],[5,10,2],[10,17,2],[17,22,2]])req.push({mergeCells:{range:range(sheetId,row,row+1,start,end),mergeType:'MERGE_ALL'}});
 req.push({repeatCell:{range:range(sheetId,0,LAST),cell:{userEnteredFormat:{backgroundColor:{red:1,green:1,blue:1},textFormat:{fontFamily:'Arial',fontSize:10,foregroundColor:{red:0,green:0,blue:0}},verticalAlignment:'TOP',wrapStrategy:'WRAP'}},fields:'userEnteredFormat'}},{repeatCell:{range:range(sheetId,2,4,0,22),cell:{userEnteredFormat:{backgroundColor:{red:.91,green:.93,blue:.9},textFormat:{bold:true}}},fields:'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.bold'}},{repeatCell:{range:range(sheetId,0,1),cell:{userEnteredFormat:{textFormat:{bold:true,fontSize:16}}},fields:'userEnteredFormat.textFormat'}},{updateDimensionProperties:{range:{sheetId,dimension:'ROWS',startIndex:1,endIndex:2},properties:{pixelSize:54},fields:'pixelSize'}},{updateDimensionProperties:{range:{sheetId,dimension:'ROWS',startIndex:2,endIndex:4},properties:{pixelSize:44},fields:'pixelSize'}},{updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:0,endIndex:25},properties:{pixelSize:110},fields:'pixelSize'}},{updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:22,endIndex:25},properties:{hiddenByUser:true},fields:'hiddenByUser'}});
 for(const c of [1,6,9,11,16,21])req.push({updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:c,endIndex:c+1},properties:{pixelSize:240},fields:'pixelSize'}});
 for(const c of [0,5,10])req.push({repeatCell:{range:range(sheetId,4,LAST,c,c+1),cell:{userEnteredFormat:{numberFormat:{type:'TEXT'}}},fields:'userEnteredFormat.numberFormat'}});
 for(const c of [2,7,12])req.push({setDataValidation:{range:range(sheetId,4,LAST,c,c+1),rule:{condition:{type:'NUMBER_GREATER_THAN_EQ',values:[{userEnteredValue:'0'}]},strict:true,showCustomUi:true,inputMessage:'Cantidad en la unidad indicada; no cargues importes aquí.'}}});
 req.push({setDataValidation:{range:range(sheetId,4,LAST,14,15),rule:{condition:{type:'ONE_OF_LIST',values:[{userEnteredValue:'CD'},{userEnteredValue:'EX'}]},strict:true,showCustomUi:true,inputMessage:'CD = costo directo; EX = extracosto. Desglosar “varios” no es automáticamente un extracosto.'}}},{setDataValidation:{range:range(sheetId,4,LAST,15,16),rule:{condition:{type:'DATE_IS_VALID'},strict:true,showCustomUi:true}}},{repeatCell:{range:range(sheetId,4,LAST,15,16),cell:{userEnteredFormat:{numberFormat:{type:'DATE',pattern:'dd/mm/yyyy'}}},fields:'userEnteredFormat.numberFormat'}});
 const form=Array.from({length:LAST-FIRST+1},(_,i)=>({values:formulas(FIRST+i).map(formulaValue=>({userEnteredValue:{formulaValue}}))}));req.push({updateCells:{range:range(sheetId,4,LAST,17,25),rows:form,fields:'userEnteredValue'}});
 if(rows.length){req.push(values(sheetId,4,rows));req.push({updateCells:{range:range(sheetId,4,4+rows.length,5,10),rows:rows.map(r=>({values:[r[0],r[1],r[2],r[3],''].map(cell)})),fields:'userEnteredValue'}});}
 if(rows.length)req.push({autoResizeDimensions:{dimensions:{sheetId,dimension:'ROWS',startIndex:4,endIndex:4+rows.length}}});
 req.push(...protections(sheetId));return req;
}
function updateSales(sheetId,rows,metadata){const padded=Array.from({length:LAST-FIRST+1},(_,i)=>rows[i]||Array(5).fill(''));return [values(sheetId,4,padded),{updateDeveloperMetadata:{dataFilters:[{developerMetadataLookup:{metadataKey:KEY,metadataLocation:{sheetId},locationMatchingStrategy:'EXACT_LOCATION'}}],developerMetadata:{metadataValue:JSON.stringify(metadata)},fields:'metadataValue'}}];}
module.exports={TITLE,KEY,FIRST,LAST,SALES,SALES_GOOGLE,AUTOMATION,PRODUCTION,STORE,READERS,HEADERS,text,norm,fail,sector,salesRows,hash,range,formulas,initialize,protections,updateSales};
