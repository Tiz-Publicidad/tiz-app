const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../functions/baseMadreLayoutV1');
const headers=['Fecha','F de Prod','Sem','OT/CT','Descripcion de la obra','Arquitecto','Cliente','Neto','Bruto'];
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
