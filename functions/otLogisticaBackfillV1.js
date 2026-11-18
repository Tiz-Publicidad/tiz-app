'use strict';
// Incluye las fórmulas automáticas con los separadores de la configuración regional.
// Reparación solicitada para la OT mostrada por el usuario. Sin tocar otras obras.
async function run(db){
 const A=require('./materialesProduccionApiV1'),C=require('./materialesProduccionCoreV1');
 const list=await A.list(db),matches=list.obras.filter(w=>Number(w.ot)===4829&&C.norm(w.cliente)==='farmacity');
 if(matches.length!==1)throw Error('No se identificó una única OT 4829 de Farmacity. No se modificó ninguna hoja.');
 const result=await A.ensure(db,{obraId:matches[0].id},C.SALES[0],{skipEditors:true,skipWorkCache:true});
 console.log(JSON.stringify({ot:4829,actualizada:result.ok}));return result;
}
if(require.main===module){const admin=require('firebase-admin');if(!admin.apps.length)admin.initializeApp({projectId:'tiz---app'});run(admin.firestore()).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={run};
