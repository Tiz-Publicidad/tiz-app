const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function fixture({occupied = false, existing = false} = {}) {
  const rows = new Map([[420, {C:'4754'}]]);
  if (existing) rows.set(421, {C:'4755', I:'dato de producción'});
  if (occupied) rows.set(421, {I:'dato de otra OT'});
  const calls = [];
  const sheet = {spreadsheets:{values:{
    get: async ({range}) => {
      if (range.endsWith('C3:C')) {
        const arr = Array.from({length:419}, (_,i) => [rows.get(i+3)?.C || '']);
        return {data:{values:arr}};
      }
      const m = range.match(/!A(\d+):AD\d+/);
      if (m) {
        const r = rows.get(Number(m[1])) || {};
        const values = Array.from({length:30}, (_,i) => r[String.fromCharCode(65+i)] || '');
        return {data:{values:[values]}};
      }
      throw new Error('rango inesperado: '+range);
    },
    update: async ({range,requestBody}) => {calls.push({range,values:requestBody.values}); const row=Number(range.match(/A(\d+)/)[1]);rows.set(row,{...rows.get(row),C:String(requestBody.values[0][2]),F:requestBody.values[0][5]});},
    batchUpdate: async ({requestBody}) => {
      calls.push(...requestBody.data);
      const row=Number(requestBody.data[0].range.match(/A(\d+)/)[1]);
      rows.set(row,{C:String(requestBody.data[0].values[0][2]),F:requestBody.data[0].values[0][5]});
    },
    append: async () => {throw new Error('No debe usarse values.append')},
  }}};
  const budget={id:'p1',nro:'4755',estado:'Aprobado',cliente:'Farmacity',desc:'Placa DT Suc 79',importe:58513.2};
  const docs = [budget];
  const firestore = {collection: name => ({
    limit: () => ({get: async () => ({docs: name==='presupuestos'?docs.map(x=>({id:x.id,data:()=>x})):[]})}),
    doc: () => ({set: async () => {}}),
  })};
  const admin={auth:()=>({verifyIdToken:async()=>({email:'info@tizpublicidad.com'})}),firestore:()=>firestore};
  const exports={};
  const context={exports,require:name=>name==='firebase-admin'?admin:name==='googleapis'?{google:{auth:{GoogleAuth:class{}},sheets:()=>sheet}}:{onRequest:(_opts,fn)=>fn},console:{error(){}},Date,Intl};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../functions/baseMadreBackendV120.js'),'utf8'),context);
  const response={statusCode:200,set(){return this},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};
  const req={method:'POST',body:{ot:'4755'},get:key=>key==='authorization'?'Bearer test':''};
  return {handler:exports.sincronizarBaseMadreV120,req,response,calls,rows};
}

test('alta nueva escribe A:H y AA de una fila explícita sin desplazar columnas',async()=>{
  const x=fixture();await x.handler(x.req,x.response);
  assert.equal(x.response.statusCode,200);
  assert.equal(x.response.body.row,421);
  assert.deepEqual(x.calls.map(c=>c.range),["'Base de datos'!A421:H421","'Base de datos'!AA421"]);
  assert.equal(x.rows.get(421).C,'4755');
});
test('bloquea una fila con datos ajenos y no sobrescribe Producción',async()=>{
  const x=fixture({occupied:true});await x.handler(x.req,x.response);
  assert.equal(x.response.statusCode,409);
  assert.equal(x.calls.length,0);
  assert.equal(x.rows.get(421).I,'dato de otra OT');
});
test('reintento de OT existente actualiza solo A:H en la fila encontrada',async()=>{
  const x=fixture({existing:true});await x.handler(x.req,x.response);
  assert.equal(x.response.statusCode,200);
  assert.deepEqual(x.calls.map(c=>c.range),["'Base de datos'!A421:H421"]);
  assert.equal(x.rows.get(421).I,'dato de producción');
});
