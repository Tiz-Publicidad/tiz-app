const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function fixture({occupied = false, existing = false, billing = false, weekFormula = '', extra = {}, shifted = false, duplicate = false, hidden = false} = {}) {
  const rows = new Map([[420, {C:'4754'}]]);
  if (existing || billing) rows.set(421, {C:'4755', F:'Farmacity', I:'dato de producción'});
  if (occupied) rows.set(421, {I:'dato de otra OT'});
  if (weekFormula || Object.keys(extra).length) rows.set(421, {...rows.get(421), ...(weekFormula ? {U:weekFormula} : {}), ...extra});
  if(duplicate)rows.set(422,{C:'4755',F:'Farmacity'});
  if(shifted)for(const [r,values] of rows)rows.set(r,Object.fromEntries(Object.entries(values).map(([c,v])=>[c>='B'&&c<='I'?String.fromCharCode(c.charCodeAt(0)+1):c,v])));
  const headers=['Fecha',...(shifted?['F de Prod']:[]),'Sem','OT/CT','Descripcion de la obra','Arquitecto','Cliente','Neto','Bruto'];
  const otColumn=shifted?'D':'C';
  const calls = [];
  let rowCount=2205;
  const sheet = {spreadsheets:{
    get:async()=>({data:{sheets:[{properties:{title:'Base de datos',sheetId:1,gridProperties:{rowCount,columnCount:38}},data:[{startRow:420,rowMetadata:[{hiddenByUser:hidden}]}]}]}}),
    batchUpdate:async({requestBody})=>{rowCount+=requestBody.requests[0].appendDimension.length;},
    values:{
    get: async ({range}) => {
      if (range.endsWith('R421:Y421')) return {data:{values:[Array(8).fill('')]}};
      if(range.endsWith('A2:AL2'))return {data:{values:[headers]}};
      if (range.endsWith(otColumn+'3:'+otColumn)) {
        const arr = Array.from({length:Math.max(422,...rows.keys())-2}, (_,i) => [rows.get(i+3)?.[otColumn] || '']);
        return {data:{values:arr}};
      }
      const m = range.match(/!A(\d+):(?:AD|AL|Y)(\d+)/);
      if (m) {
        const values=Array.from({length:Number(m[2])-Number(m[1])+1},(_,offset)=>{
          const r=rows.get(Number(m[1])+offset)||{};
          return Array.from({length:38},(_,i)=>r[require('../functions/baseMadreLayoutV1').column(i)]??'');
        });
        return {data:{values}};
      }
      throw new Error('rango inesperado: '+range);
    },
    update: async ({range,requestBody}) => {calls.push({range,values:requestBody.values}); const row=Number(range.match(/A(\d+)/)[1]);rows.set(row,{...rows.get(row),C:String(requestBody.values[0][2]),F:requestBody.values[0][5]});},
    batchUpdate: async ({requestBody}) => {
      calls.push(...requestBody.data);
      for(const change of requestBody.data){const m=change.range.match(/!([A-Z]+)(\d+)(?::[A-Z]+\d+)?$/);if(!m)continue;const row=Number(m[2]),start=m[1].charCodeAt(0);const old=rows.get(row)||{};change.values[0].forEach((v,i)=>old[String.fromCharCode(start+i)]=v);rows.set(row,old);}

    },
    append: async () => {throw new Error('No debe usarse values.append')},
  }}};
  const budget={id:'p1',nro:'4755',estado:'Aprobado',cliente:'Farmacity',desc:'Placa DT Suc 79',importe:58513.2};
  const docs = [budget];
  const obra={id:'o1',ot:'4755',cliente:'Farmacity',comprobantesArca:[{numeroCompleto:'00009-00000001',fecha:'2026-09-29',neto:100,iva:21,total:121,fechaVencimientoPago:'2026-10-29'}],cobros:[{importe:50,retenciones:10,fecha:'2026-09-29'}]};
  const firestore = {collection: name => ({
    limit: () => ({get: async () => ({docs: (name==='presupuestos'?docs:billing?[obra]:[]).map(x=>({id:x.id,data:()=>x}))})}),
    doc: () => ({set: async () => {},get:async()=>({exists:true,id:obra.id,data:()=>obra})}),
  })};
  const admin={auth:()=>({verifyIdToken:async()=>({email:'info@tizpublicidad.com'})}),firestore:()=>firestore};
  const exports={};
  const context={exports,require:name=>name==='./baseMadreLayoutV1'?require('../functions/baseMadreLayoutV1'):name==='firebase-admin'?admin:name==='googleapis'?{google:{auth:{GoogleAuth:class{}},sheets:()=>sheet}}:{onRequest:(_opts,fn)=>fn},console:{error(){}},Date,Intl};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../functions/baseMadreBackendV120.js'),'utf8'),context);
  const response={statusCode:200,set(){return this},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};
  const req={method:'POST',body:{ot:'4755',...(billing?{mode:'billing',obraId:'o1'}:{})},get:key=>key==='authorization'?'Bearer test':''};
  return {handler:exports.sincronizarBaseMadreV120,req,response,calls,rows,budget};
}

test('alta nueva escribe A:H e Y de una fila explícita sin desplazar columnas',async()=>{
  const x=fixture();await x.handler(x.req,x.response);
  assert.equal(x.response.statusCode,200);
  assert.equal(x.response.body.row,421);
  assert.deepEqual(x.calls.map(c=>c.range),["'Base de datos'!A421:H421","'Base de datos'!Y421"]);
  assert.equal(x.rows.get(421).C,'4755');
});
test('salta una fila con datos ajenos y no sobrescribe Producción',async()=>{
  const x=fixture({occupied:true});await x.handler(x.req,x.response);
  assert.equal(x.response.statusCode,200);
  assert.equal(x.response.body.row,422);
  assert.equal(x.rows.get(422).C,'4755');
  assert.equal(x.rows.get(421).I,'dato de otra OT');
});
test('reintento de OT existente actualiza solo A:H en la fila encontrada',async()=>{
  const x=fixture({existing:true});await x.handler(x.req,x.response);
  assert.equal(x.response.statusCode,200);
  assert.deepEqual(x.calls.map(c=>c.range),["'Base de datos'!A421:H421"]);
  assert.equal(x.rows.get(421).I,'dato de producción');
});
test('facturación y cobro respetan las columnas R:S, T:U, V e Y',async()=>{
  const x=fixture({billing:true});await x.handler(x.req,x.response);
  assert.equal(x.response.statusCode,200);
  assert.deepEqual(x.calls.map(c=>c.range),["'Base de datos'!S421","'Base de datos'!R421","'Base de datos'!T421","'Base de datos'!U421","'Base de datos'!V421","'Base de datos'!Y421"]);
  assert.equal(x.calls[5].values[0][0],'Cobrado pendiente');
  assert.equal(x.rows.get(421).I,'dato de producción');
});

test('alta conserva la fórmula de semana preparada en U y el reintento no duplica la OT',async()=>{
  const formula='=IF(T421="";"";IFERROR(WEEKNUM(INT(T421);2);""))';
  const x=fixture({weekFormula:formula});await x.handler(x.req,x.response);
  assert.equal(x.response.statusCode,200);assert.equal(x.rows.get(421).U,formula);
  assert.equal(x.calls.some(c=>c.range.includes('!U421')),false);
  x.calls.length=0;await x.handler(x.req,x.response);
  assert.equal(x.response.statusCode,200);assert.equal(x.response.body.updated,true);
  assert.deepEqual(x.calls.map(c=>c.range),["'Base de datos'!C421:H421"]);
});
test('tolera separadores y referencias absolutas de la misma fórmula de plantilla',async()=>{
  const x=fixture({weekFormula:'=IF($T$421="","",IFERROR(WEEKNUM(INT($T$421),2),""))'});
  await x.handler(x.req,x.response);assert.equal(x.response.statusCode,200);
});
test('preserva fórmulas inesperadas y datos manuales al elegir otra fila',async()=>{
  for(const options of [
    {weekFormula:'=WEEKNUM(T421;2)'},
    {weekFormula:'=IF(T420="";"";IFERROR(WEEKNUM(INT(T420);2);""))'},
    {extra:{H:'=G421*1.21'}},
    {extra:{U:'41'}},
    {weekFormula:'=IF(T421="";"";IFERROR(WEEKNUM(INT(T421);2);""))',extra:{I:'Trabajo manual'}}
  ]){const x=fixture(options);await x.handler(x.req,x.response);assert.equal(x.response.statusCode,200);assert.equal(x.response.body.row,422);assert.equal(x.calls.some(c=>c.range.includes('421')),false);}
});


test('columna F de Prod: reintento actualiza la OT existente en D y conserva Producción',async()=>{
 const x=fixture({existing:true,shifted:true});x.rows.get(421).B='20/10/26';
 await x.handler(x.req,x.response);
 assert.equal(x.response.statusCode,200);assert.equal(x.response.body.row,421);assert.equal(x.response.body.updated,true);
 assert.equal(x.rows.get(421).D,'4755');assert.equal(x.rows.get(421).G,'Farmacity');assert.equal(x.rows.get(421).B,'20/10/26');assert.equal(x.rows.get(421).J,'dato de producción');
 assert.deepEqual(x.calls.map(c=>c.range),["'Base de datos'!A421:A421","'Base de datos'!C421:I421"]);
 assert.equal(x.rows.has(422),false);
});
test('alta con F de Prod escribe en las columnas actuales y deja B vacía',async()=>{
 const x=fixture({shifted:true});await x.handler(x.req,x.response);
 assert.equal(x.response.statusCode,200);assert.equal(x.rows.get(421).D,'4755');assert.equal(x.rows.get(421).B,undefined);
 assert.equal(x.rows.get(421).G,'Farmacity');assert.equal(x.rows.get(421).H,58513.2);assert.equal(x.rows.get(421).I,70800.97);
});
test('no elige arbitrariamente entre dos filas de la OT al sincronizar aprobación',async()=>{
 const x=fixture({existing:true,shifted:true,duplicate:true});await x.handler(x.req,x.response);assert.equal(x.response.statusCode,409);assert.equal(x.calls.length,0);
});


 test('dos tareas sin OT no bloquean una aprobación y el reintento no duplica',async()=>{
 const x=fixture({shifted:true});
 x.rows.set(421,{A:'19/10/26',B:'23/10/2026',C:'43',E:'Visita Proveedor Led',F:'Caro/Ari'});
 x.rows.set(422,{A:'19/10/26',B:'21/10/2026',C:'43',E:'Bacha Fabrica',F:'Gian'});
 const before=JSON.stringify([...x.rows]);
 await x.handler(x.req,x.response);
 assert.equal(x.response.statusCode,200);assert.equal(x.response.body.row,423);
 assert.equal(JSON.stringify([...x.rows].filter(([r])=>r<423)),before);
 x.calls.length=0;await x.handler(x.req,x.response);
 assert.equal(x.response.statusCode,200);assert.equal(x.response.body.row,423);assert.equal(x.response.body.updated,true);
 assert.equal(x.rows.get(424),undefined);
 });
 test('sigue buscando después de más de 50 filas ocupadas',async()=>{
 const x=fixture();for(let r=421;r<671;r++)x.rows.set(r,{E:'Tarea manual'});
 await x.handler(x.req,x.response);assert.equal(x.response.statusCode,200);assert.equal(x.response.body.row,671);assert.equal(x.rows.get(670).E,'Tarea manual');
 });

test('datos fuera de AD y valores falsy ocupan la fila',async()=>{
 for(const extra of [{AL:'Dato manual'},{K:0},{K:false},{AL:'=""'}]){
  const x=fixture({extra});await x.handler(x.req,x.response);
  assert.equal(x.response.statusCode,200);assert.equal(x.response.body.row,422);
  assert.deepEqual(x.rows.get(421),extra);
 }
});
test('extiende al final si toda la planilla está ocupada',async()=>{
 const x=fixture();for(let r=421;r<=2205;r++)x.rows.set(r,{E:'Tarea manual'});
 await x.handler(x.req,x.response);assert.equal(x.response.statusCode,200);assert.equal(x.response.body.row,2206);
 assert.equal(x.rows.get(2205).E,'Tarea manual');
});

test('el servidor consulta la visibilidad y salta la primera fila oculta',async()=>{
 const x=fixture({hidden:true});await x.handler(x.req,x.response);
 assert.equal(x.response.statusCode,200);assert.equal(x.response.body.row,422);
 assert.equal(x.rows.has(421),false);
});

test('venta aprobada hoy usa semana de aprobación aunque el presupuesto sea del viernes',async()=>{
 const x=fixture();Object.assign(x.budget,{fecha:'23/10/26',fechaVenta:'2026-10-26'});await x.handler(x.req,x.response);assert.equal(x.response.statusCode,200);assert.equal(x.rows.get(421).A,'26/10/26');assert.equal(x.rows.get(421).B,44);assert.equal(x.budget.fecha,'23/10/26');
});
test('reintento conserva fecha y semana corregidas en planilla sin reescribir esas celdas',async()=>{
 for(const shifted of [false,true]){const x=fixture({existing:true,shifted,extra:{A:'26/10/26',B:44}});Object.assign(x.budget,{fecha:'23/10/26',fechaAprobacion:'23/10/26'});await x.handler(x.req,x.response);assert.equal(x.response.statusCode,200);assert.equal(x.rows.get(421).A,'26/10/26');assert.equal(x.rows.get(421)[shifted?'C':'B'],44);assert.equal(x.calls.some(w=>w.range.includes('!A421')),false);}
});
