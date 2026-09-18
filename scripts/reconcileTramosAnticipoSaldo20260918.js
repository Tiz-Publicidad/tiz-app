'use strict';
const admin=require('firebase-admin');
admin.initializeApp();
const db=admin.firestore();
const TARGETS={
  '4176':{openAmount:149451,paid:['1307'],note:'Una linea cobrada y una linea entregada sin FC'},
  '4417':{openAmount:457008,paid:[],note:'Entregado sin FC; reclamar OC'},
  '4460':{openAmount:32748.8,paid:[],note:'Entregado sin FC; reclamar'},
  '4492':{openAmount:0,paid:['1412'],note:'Anticipo 25% cobrado; saldo 75% facturado pendiente'},
  '4531':{openAmount:0,paid:['1428'],note:'Anticipo 50% cobrado; saldo facturado pendiente'},
  '4561':{openAmount:3801900,paid:[],note:'Cobrado pendiente + saldo pendiente, ambos sin factura'},
  '4594':{openAmount:824050,paid:['135'],note:'Anticipo cobrado; saldo entregado sin FC'},
  '4627':{openAmount:0,paid:['1452'],note:'Anticipo 50% cobrado; saldo 50% facturado pendiente'},
  '4662':{openAmount:263000,paid:[],note:'Pendiente sin FC; Excel indica hacer FC'},
  '4679':{openAmount:12825000,paid:[],note:'Pendiente sin FC; pago efectivo'},
  '4682':{openAmount:1748995.2,paid:[],note:'Anticipo facturado; saldo sin FC'},
  '4696':{openAmount:1137500,paid:[],note:'Pendiente sin FC'},
  '4702':{openAmount:1471750,paid:[],note:'Anticipo facturado; saldo sin FC'},
  '4703':{openAmount:62000,paid:[],note:'Entregado sin FC; hacer FC'},
  '4706':{openAmount:1938700,paid:['1437'],note:'Anticipo 50% cobrado; saldo 50% sin FC'},
  '4708':{openAmount:5870910,paid:['1472'],note:'Anticipo 50% cobrado; saldo 50% sin FC'},
  '4709':{openAmount:0,paid:['1474'],note:'Anticipo cobrado; saldo con FC pendiente'},
  '4719':{openAmount:187872,paid:[],note:'Entregado sin factura'},
  '4721':{openAmount:29256.6,paid:[],note:'Entregado sin FC'},
  '4723':{openAmount:710000,paid:[],note:'Pendiente sin FC; OT no encontrada en Firebase al importar'},
  '4724':{openAmount:29256.6,paid:[],note:'Entregado sin FC'},
  '4725':{openAmount:87769.8,paid:[],note:'Pendiente sin FC'},
  '4728':{openAmount:24000,paid:[],note:'Pendiente sin FC; hacer FC'},
  '4731':{openAmount:5995080,paid:[],note:'Pendiente sin FC'},
  '4732':{openAmount:192463,paid:[],note:'Pendiente sin FC'},
  '4734':{openAmount:7720299.73,paid:[],note:'Pendiente sin FC'},
  '4735':{openAmount:239660.58,paid:[],note:'Pendiente sin FC'}
}
const base=v=>{const m=String(v??'').match(/\d{4,7}/);return m?String(Number(m[0])):''};
(async()=>{
 const snap=await db.collection('obras').get(),byOt=new Map();
 snap.forEach(doc=>{const o=doc.data()||{},ot=base(o.ot||o.nroPresupuesto||o.infoPresupuesto?.nro);if(ot&&!byOt.has(ot))byOt.set(ot,{doc,o});});
 let fixed=0,missing=[];
 for(const [ot,cfg] of Object.entries(TARGETS)){
   const hit=byOt.get(ot);if(!hit){missing.push(ot);continue;}
   const h={...(hit.o.historicoExcel||{}),facturasCobradas:cfg.paid,porFacturarExcel:Number(cfg.openAmount)||0,conciliacion:'tramos_anticipo_saldo',conciliacionNota:cfg.note,conciliadoAt:new Date().toISOString()};
   await hit.doc.ref.set({historicoCerrado:false,cobranzaEstadoManual:'',historicoExcel:h},{merge:true});fixed++;
 }
 await db.collection('migraciones').doc('reconcileTramosAnticipoSaldo20260918').set({appliedAt:admin.firestore.FieldValue.serverTimestamp(),fixed,missing,targets:Object.keys(TARGETS)},{merge:true});
 console.log(JSON.stringify({fixed,missing},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
