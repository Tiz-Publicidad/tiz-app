const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../functions/baseMadreLayoutV1');
const headers=['Fecha','F de Prod','Sem','OT/CT','Descripcion de la obra','Arquitecto','Cliente','Neto','Bruto'];
function readerFixture(header,{changed=header}={}){
 const requests=[],fields={ot:'OT/CT',desc:'Descripcion de la obra',cliente:'Cliente',status:'Status'},records=[{ot:'4679.1',desc:'Anticipo cartel',cliente:'Cliente real',status:'Pendiente'},{ot:'4679.2',desc:'Saldo cartel',cliente:'Cliente real',status:'Cobrado pendiente'},{ot:'4777',desc:'Trabajo terminado',cliente:'Otro cliente',status:'Entregado'}];
 const sheets={spreadsheets:{values:{get:async args=>{requests.push(args);return {data:{values:[header]}}},batchGet:async args=>{requests.push(args);return {data:{valueRanges:args.ranges.map(range=>{if(range.endsWith('A2:AL2'))return {values:[changed]};const col=range.match(/!([A-Z]+)3:/)[1],index=[...col].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1,key=Object.keys(fields).find(k=>fields[k]===header[index]);assert.ok(key,'sólo se leen columnas operativas');return {values:records.map(r=>[r[key]])};})}}}}}};
 return {sheets,requests,records};
}
test('listados operativos conservan OT, cliente, descripciones y filas al insertar o reordenar columnas',async()=>{
 for(const header of [['Fecha','Sem','OT/CT','Descripcion de la obra','Arquitecto','Cliente','Neto','Bruto','Status'],[...headers,'Status'],['Cliente','Neto','Status','F de Prod','Arquitecto','OT/CT','Bruto','Descripcion de la obra']]){
  const x=readerFixture(header),rows=await C.readWorks(x.sheets,'sheet','Base de datos');assert.deepEqual(rows,x.records.map((r,i)=>({row:i+3,...r})));assert.ok(x.requests.every(r=>r.valueRenderOption==='FORMATTED_VALUE'));
  const core=require('../functions/analisisPreliminarCoreV1'),works=core.workList(rows,[]);assert.equal(works.length,1);assert.equal(works[0].ot,'4679');assert.equal(works[0].cliente,'Cliente real');assert.deepEqual(works[0].sourceRows,[3,4]);assert.equal(works[0].descripcion,'Anticipo cartel / Saldo cartel');assert.equal(works[0].neto,undefined);
 }
});
test('un encabezado ausente, duplicado o que cambia durante la lectura detiene la importación',async()=>{
 for(const header of [['Cliente','Descripcion de la obra','Status'],['Cliente','OT/CT','OT','Descripcion de la obra','Status']]){const x=readerFixture(header);await assert.rejects(C.readWorks(x.sheets,'sheet','Base de datos'),/encabezados/);assert.equal(x.requests.length,1);}
 const h=[...headers,'Status'],x=readerFixture(h,{changed:['Status',...headers]});await assert.rejects(C.readWorks(x.sheets,'sheet','Base de datos'),/cambiaron durante/);
});
test('encabezados actuales localizan la OT en D y no escriben F de Prod',()=>{
 const l=C.layout(headers),data=C.approvalData('Base de datos',429,{ot:'4775',descripcion:'Cheque',contacto:'Eduardo',cliente:'Cliente',neto:30000,bruto:36300},'15/10/26',42,l);
 assert.equal(l.ot,3);assert.equal(l.cliente,6);assert.deepEqual(data.map(x=>x.range),["'Base de datos'!A429:A429","'Base de datos'!C429:I429"]);
 assert.deepEqual(data[1].values[0],[42,'4775','Cheque','Eduardo','Cliente',30000,36300]);
 assert.throws(()=>C.layout(headers.map(x=>x==='OT/CT'?'Desconocida':x)),/encabezados/);
 assert.throws(()=>C.layout([...headers,'OT/CT']),/único/);
});
test('sincronización del navegador reusa fila 429 y conserva producción, gasto y factura',async()=>{
 const source=fs.readFileSync(require.resolve('../baseMadreSyncV116.js'),'utf8'),r=Array(30).fill('');Object.assign(r,{0:'15/10/26',1:'20/10/26',2:42,3:'4775',4:'Cheque',5:'Eduardo',6:'Cliente',7:30000,8:36300,9:10000,18:'00009-00000019',24:'Pendiente'});
 const writes=[],window={TIZBaseMadreLayoutV1:C,DB:{presupuestos:[],obras:[]}};
 const fetch=async(url,options)=>{
  const address=decodeURIComponent(url);
  if(options.method==='POST'){
   const data=JSON.parse(options.body).data;writes.push(...data);
   for(const d of data){const m=d.range.match(/!([A-Z]+)429/);assert.ok(m);const col=[...m[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;d.values[0].forEach((v,i)=>r[col+i]=v);}
   return {ok:true,json:async()=>({})};
  }
  let values;
  if(address.includes('A2:AL2'))values=[headers];
  else if(address.includes('D3:D')){values=Array.from({length:427},()=>['']);values[426]=['4775'];}
  else if(address.includes('A429:AD429'))values=[[...r]];
  else throw Error(address);
  return {ok:true,json:async()=>({values})};
 };
 vm.runInNewContext(source.slice(0,source.indexOf('let billingMonitorBusy'))+'\nwindow.testSync=syncBudget;})();', {window,fetch,Date,Intl,console});
 const result=await window.testSync({estado:'Aprobado',nro:'4775',cliente:'Cliente',desc:'Cheque',importe:30000},{token:'test',silent:true});
 assert.equal(result.row,429);assert.equal(result.updated,true);assert.equal(r[1],'20/10/26');assert.equal(r[9],10000);assert.equal(r[18],'00009-00000019');assert.equal(r[3],'4775');assert.equal(writes.length,2);
});
function fiscalFixture(lookup){
 const writes=[],marked=[];
 const sheet={spreadsheets:{values:{get:async({range})=>({data:{values:range.endsWith('A2:AL2')?[headers]:range.endsWith('D3:D')?lookup:[['15/10/26','',42,'4775','Cheque','Eduardo','Cliente',30000,36300]]}}),batchUpdate:async req=>writes.push(req)}}};
 const google={auth:{GoogleAuth:class{}},sheets:()=>sheet},db={collection:()=>({doc:()=>({set:async v=>marked.push(v)})})};
 const source=fs.readFileSync(require.resolve('../functions/facturacionIntegralApiV83'),'utf8'),start=source.indexOf('const BASE_MADRE_ID ='),end=source.indexOf('const secrets =',start),exports={};
 vm.runInNewContext(source.slice(start,end)+'\nexports.sync=syncBaseMadreFactura;', {exports,google,Date,require:n=>{assert.equal(n,'./baseMadreLayoutV1');return C;}});
 return {writes,marked,run:()=>exports.sync({ot:'4775',cliente:'Cliente'},[{cbteTipo:1,ptoVta:9,cbteNro:21,numeroCompleto:'00009-00000021',fecha:'2026-10-16',cae:'test'}],db,'obra','admin')};
}
test('al emitir se busca la OT en D antes de sincronizar su factura',async()=>{
 const x=fiscalFixture([['4775']]),r=await x.run();assert.equal(r.row,3);assert.equal(x.writes.length,1);assert.equal(x.writes[0].requestBody.data[0].range,"'Base de datos'!R3:S3");
});
test('al emitir no se modifica una fila si la OT es inexistente o ambigua',async()=>{
 for(const rows of [[],[['4775'],['4775']]]){const x=fiscalFixture(rows);await assert.rejects(x.run(),/única fila/);assert.equal(x.writes.length,0);assert.equal(x.marked.length,0);}
});

test('alta desde navegador busca la próxima fila libre, preserva tareas y no duplica al reintentar',async()=>{
 const source=fs.readFileSync(require.resolve('../baseMadreSyncV116.js'),'utf8');
 const rows=new Map([[420,Object.assign([],{3:'4774'})]]),writes=[];
 for(let row=421;row<=675;row++)rows.set(row,Object.assign([],{4:'Tarea manual',37:'Dato a preservar'}));
 const before=JSON.stringify([...rows]);
 const window={TIZBaseMadreLayoutV1:C,DB:{presupuestos:[],obras:[]}};
 const fetch=async(url,options)=>{
  const address=decodeURIComponent(url);let result;
  if(options.method==='POST'){
   const data=JSON.parse(options.body).data;writes.push(...data);
   for(const d of data){const m=d.range.match(/!([A-Z]+)(\d+)/),row=Number(m[2]),col=[...m[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1,r=rows.get(row)||[];d.values[0].forEach((v,i)=>r[col+i]=v);rows.set(row,r);}
   result={};
  }else if(address.includes('fields=sheets('))result={sheets:[{properties:{title:'Base de datos',sheetId:1,gridProperties:{rowCount:2205,columnCount:38}}}]};
  else if(address.includes('A2:AL2'))result={values:[headers]};
  else if(address.includes('D3:D'))result={values:Array.from({length:Math.max(...rows.keys())-2},(_,i)=>[rows.get(i+3)?.[3]||''])};
  else{
   const m=address.match(/!A(\d+):(?:AL|AD)(\d+)/);assert.ok(m,address);
   result={values:Array.from({length:Number(m[2])-Number(m[1])+1},(_,i)=>rows.get(Number(m[1])+i)||[])};
  }
  return {ok:true,json:async()=>result};
 };
 vm.runInNewContext(source.slice(0,source.indexOf('let billingMonitorBusy'))+'\nwindow.testSync=syncBudget;})();',{window,fetch,Date,Intl,console});
 const budget={estado:'Aprobado',nro:'4775',cliente:'Cliente',desc:'Placas DT',importe:30000};
 const result=await window.testSync(budget,{token:'test',silent:true});
 assert.equal(result.row,676);assert.equal(result.updated,false);assert.equal(rows.get(676)[3],'4775');
 assert.equal(JSON.stringify([...rows].filter(([r])=>r<676)),before);
 const retry=await window.testSync(budget,{token:'test',silent:true});
 assert.equal(retry.row,676);assert.equal(retry.updated,true);assert.equal(rows.has(677),false);
});

test('si una fila se ocupa durante la lectura, busca la siguiente sin tocarla',async()=>{
 const calls=[];
 const row=await C.nextFreeRow(450,{
  getGrid:async()=>({sheetId:1,rowCount:1000,columnCount:40}),
  readRows:async(first,last,count)=>{calls.push([first,last,count]);return first===last&&first===450?[[0]]:[];},
  appendRows:async()=>assert.fail('hay espacio en la grilla')
 });
 assert.equal(row,451);assert.deepEqual(calls,[[450,649,40],[450,450,40],[451,451,40]]);
});

test('las ventas nuevas omiten filas vacías ocultadas manualmente',async()=>{
 const row=await C.nextFreeRow(450,{
  getGrid:async()=>({sheetId:1,rowCount:2203,columnCount:38,hiddenRows:[450,451,452]}),
  readRows:async()=>[],appendRows:async()=>assert.fail('hay filas visibles libres')
 });
 assert.equal(row,453);
});
