const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../functions/baseMadreBackendV120.js'),'utf8');
function setup({credit=false,duplicate=false,wrongOt=false,formula=false}={}){
 const writes=[],row=Array(25).fill('');row[2]='4708';row[5]='Cliente';row[17]='07/09/26';row[18]='1472.0';row[24]='Pendiente';
 const o={ot:wrongOt?'4709':'4708',cliente:'Cliente',comprobantesArca:[{numeroCompleto:'00009-00001472',cbteTipo:credit?3:1,familia:credit?'credito':'factura',fecha:'2026-09-07',total:121,neto:100,fechaVencimientoPago:'2026-10-07'}],cobranzaEstadoManual:'cobrado'};
 const db={collection:()=>({doc:()=>({get:async()=>({exists:true,id:'o',data:()=>o}),set:async()=>{}})})};
 const sheets={spreadsheets:{values:{get:async args=>({data:{values:args.range.endsWith('C3:C')?(duplicate?[['4708'],['4708']]:[['4708']]):args.valueRenderOption==='FORMULA'?[[...Array(3).fill(''),formula?'=WEEKNUM(T3;2)':'']]:[row]}}),batchUpdate:async args=>writes.push(args)}}};
 const exports={};vm.runInNewContext(source+'\nexports.testSync=syncBilling;', {exports,console,require:n=>n==='firebase-admin'?{}:n==='googleapis'?{google:{}}:{onRequest:(_,h)=>h}});
 return{writes,run:()=>exports.testSync({db,sheets,requestedOt:'4708',obraId:'o',email:'info@tizpublicidad.com'})};
}
test('no exporta una nota de crédito a la celda de factura',async()=>{const {writes,run}=setup({credit:true});await assert.rejects(run,/nota de crédito/);assert.equal(writes.length,0)});
test('rechaza obraId de otra OT',async()=>{const {writes,run}=setup({wrongOt:true});await assert.rejects(run,/no corresponde/);assert.equal(writes.length,0)});
test('no escribe en la primera fila de una OT con anticipo y saldo',async()=>{const {writes,run}=setup({duplicate:true});await assert.rejects(run,/varias filas/);assert.equal(writes.length,0)});
test('conserva el FC existente y la fórmula de semana; actualiza el cobro y fecha faltante',async()=>{const {writes,run}=setup({formula:true});const result=await run();assert.equal(result.updated,true);const changes=writes[0].requestBody.data;assert.equal(changes.some(c=>c.range.includes('!S3')||c.range.includes('!U3')),false);assert.equal(changes.find(c=>c.range.includes('!Y3')).values[0][0],'Cobrado');assert.equal(changes.find(c=>c.range.includes('!T3')).values[0][0],'07/10/2026')});
