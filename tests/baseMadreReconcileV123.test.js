const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../facturacionBaseMadreReconcileV2.js'),'utf8');

function setup(sheetRows,works,obras){
  const writes=[];
  const window={DB:{obras},TIZFacturacionCobranzasDataV2:{build:()=>({workItems:works})},leerFacturacionBaseMadreTIZV123:async()=>({rows:sheetRows,firstRow:2}),updateDoc_:async(_,id,patch)=>writes.push({id,patch}),TIZFactCobUIV2:{render(){}}};
  vm.runInNewContext(source,{window,console});
  return{api:window.TIZFactBaseMadreV2,writes};
}
function sheet({ot='4524',client='Farmacity',invoice='1469',status='Cobrado',net=100,desc='Cartel'}={}){
  const row=Array(26).fill('');Object.assign(row,{2:ot,3:desc,5:client,6:String(net),7:String(net*1.21),17:'07/09/26',18:invoice,24:status});return row;
}
function work(ot='4524'){return{ot,obraId:'obra-1',clienteNombre:'Farmacity',estadoOperativo:'facturado',invoices:[],obra:{},historicoCerrado:false,anuladaConNC:false}}

test('importa una FC histórica y cierra una OT cobrada de fila única',async()=>{
  const o={id:'obra-1',ot:'4524',cliente:'Farmacity'},w=work(),{api,writes}=setup([sheet()], [w], [o]);
  const report=await api.audit();assert.equal(report.totales.faltan,1);
  await api.importOne(report.items[0]);
  assert.equal(writes.length,1);assert.equal(writes[0].patch.facturasBaseMadre[0].numeroCompleto,'1469');
  assert.equal(writes[0].patch.historicoCerrado,true);
  assert.deepEqual([...writes[0].patch.historicoExcel.facturasCobradas],['1469']);
});

test('no fusiona dos filas de la misma OT con estados diferentes',async()=>{
  const {api,writes}=setup([sheet({status:'Cobrado',desc:'Anticipo'}),sheet({invoice:'1470',status:'Pendiente',desc:'Saldo'})],[work()],[{id:'obra-1',ot:'4524',cliente:'Farmacity'}]);
  const report=await api.audit();assert.equal(report.totales.ambiguos,2);assert.equal(report.items[0].safeImport,false);assert.equal(writes.length,0);
});

test('no importa una factura anulada con nota de crédito',async()=>{
  const w=work();w.anuladaConNC=true;
  const {api}=setup([sheet()],[w],[{id:'obra-1',ot:'4524',cliente:'Farmacity'}]);
  const report=await api.audit();assert.equal(report.items[0].safeImport,false);
});

