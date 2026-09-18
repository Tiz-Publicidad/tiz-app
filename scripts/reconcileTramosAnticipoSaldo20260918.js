'use strict';
const admin=require('firebase-admin');
admin.initializeApp();
const db=admin.firestore();
const TARGETS={
  '4176':{paid:['1307'],open:true,note:'Una linea cobrada y una linea entregada sin FC'},
  '4492':{paid:['1412'],open:true,note:'Anticipo 25% cobrado; saldo 75% facturado pendiente'},
  '4531':{paid:['1428'],open:true,note:'Anticipo 50% cobrado; saldo facturado pendiente'},
  '4561':{paid:[],open:true,note:'Cobrado pendiente + saldo pendiente, ambos sin factura'},
  '4594':{paid:['135'],open:true,note:'Anticipo cobrado; saldo entregado sin FC'},
  '4627':{paid:['1452'],open:true,note:'Anticipo 50% cobrado; saldo 50% facturado pendiente'},
  '4706':{paid:['1437'],open:true,note:'Anticipo 50% cobrado; saldo 50% pendiente de facturar'},
  '4708':{paid:['1472'],open:true,note:'Anticipo 50% cobrado; saldo 50% pendiente de facturar'},
  '4709':{paid:['1474'],open:true,note:'Anticipo cobrado; saldo con FC pendiente'}
};
const base=v=>{const m=String(v??'').match(/\d{4,7}/);return m?String(Number(m[0])):''};
(async()=>{
 const snap=await db.collection('obras').get(),byOt=new Map();
 snap.forEach(doc=>{const o=doc.data()||{},ot=base(o.ot||o.nroPresupuesto||o.infoPresupuesto?.nro);if(ot&&!byOt.has(ot))byOt.set(ot,{doc,o});});
 let fixed=0,missing=[];
 for(const [ot,cfg] of Object.entries(TARGETS)){
   const hit=byOt.get(ot);if(!hit){missing.push(ot);continue;}
   const h={...(hit.o.historicoExcel||{}),facturasCobradas:cfg.paid,conciliacion:'tramos_anticipo_saldo',conciliacionNota:cfg.note,conciliadoAt:new Date().toISOString()};
   await hit.doc.ref.set({historicoCerrado:false,cobranzaEstadoManual:'',historicoExcel:h},{merge:true});fixed++;
 }
 await db.collection('migraciones').doc('reconcileTramosAnticipoSaldo20260918').set({appliedAt:admin.firestore.FieldValue.serverTimestamp(),fixed,missing,targets:Object.keys(TARGETS)},{merge:true});
 console.log(JSON.stringify({fixed,missing},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
