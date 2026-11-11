'use strict';
// One-time preparation of existing active production files. No operational entries are rewritten.
const A=require('./materialesProduccionApiV1'),C=require('./materialesProduccionCoreV1'),V=require('./vigenciaComercialCoreV1');
async function run(db){const list=await A.list(db),quotes=await V.quoteRows(db),works=list.obras.filter(w=>w.sheetUrl&&['aprobado','pendiente','cobrado pendiente','en produccion','en proceso'].includes(C.norm(w.estado)));if(works.length>80)throw Error('Hay más de 80 hojas activas. Revisar el alcance antes de continuar.');let done=0;const pending=[];for(const w of works){try{const result=await A.ensure(db,{obraId:w.id},C.SALES[0],{quotes});done++;console.log('OK OT '+w.ot);}catch(err){pending.push(w.ot);console.log('PENDIENTE OT '+w.ot+': '+String(err.message).replace(/[\w-]{20,}/g,'[identificador]'));}}console.log(JSON.stringify({preparadas:done,pendientes:pending}));return {done,pending};}
if(require.main===module){const admin=require('firebase-admin');if(!admin.apps.length)admin.initializeApp({projectId:'tiz---app'});run(admin.firestore()).catch(err=>{console.error(err.message);process.exitCode=1;});}
module.exports={run};
