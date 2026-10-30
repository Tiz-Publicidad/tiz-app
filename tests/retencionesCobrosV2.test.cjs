const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const root=__dirname+'/..';
function app(){
 const o={id:'ot-1',ot:'4731',cliente:'Farmacity',finanzas:{total:5222427.87},facturasManual:[{cbteTipo:1,ptoVta:3,cbteNro:7,numeroCompleto:'00003-00000007',neto:5222427.87,iva:1096709.83,total:6319137.70}]};
 const window={DB:{obras:[o],presupuestos:[],clientes:[]},currentUser:{email:'admin@test.local'},TIZCobranzaSemanalV127:require(root+'/cobranzasSemanalV127.js'),updateDoc_:async()=>{}};
 const ctx=vm.createContext({window,Date,Intl,console,setTimeout:()=>{},document:{readyState:'loading',addEventListener(){}}});
 for(const p of ['facturacionCobranzasDataV2.js','facturacionCobranzasActionsV2.js'])vm.runInContext(fs.readFileSync(root+'/'+p,'utf8'),ctx);
 let ui=fs.readFileSync(root+'/facturacionCobranzasUIV2.js','utf8').replace('window.TIZFactCobUIV2={','window.testUI={bindPaymentForm,paymentForm,retenciones};window.TIZFactCobUIV2={');vm.runInContext(ui,ctx);
 window.TIZFactCobUIV2.render=()=>{};return{window,o,data:window.TIZFacturacionCobranzasDataV2,actions:window.TIZFactCobActionsV2,ui:window.testUI};
}
test('acepta importes argentinos y decimales con punto; rechaza datos ambiguos o inválidos',()=>{
 const {data}=app();for(const [v,n] of [['1.234,56',1234.56],['1234,56',1234.56],['1234.56',1234.56],['1.234',1234],['',0],['0,50',.5]])assert.equal(data.parseAmount(v),n);
 for(const v of ['1,234.56','1.2.3','1e3','abc','-2','2.3456'])assert.ok(Number.isNaN(data.parseAmount(v)),v);
});
test('guarda cuatro retenciones y acumula cobros sucesivos sin duplicar al reconstruir',async()=>{
 const {o,data,actions,ui}=app();
 await actions.registrarCobro(o.id,{fecha:'2026-10-29',importe:'1.000,00',retencionesDetalle:{iva:'100,25',ingresosBrutos:'50,50',ganancias:'25,25',suss:'24,00'}});
 await actions.registrarCobro(o.id,{fecha:'2026-10-29',importe:500,retencionesDetalle:{iva:10,ingresosBrutos:20,ganancias:30,suss:40}});
 for(let i=0;i<2;i++){const d=data.build(),w=d.workItems[0];assert.equal(w.cobrado,1500);assert.equal(w.retenciones,300);assert.equal(w.porCobrar,6317337.70);const html=ui.retenciones(d);assert.match(html,/Total acumulado/);assert.match(html,/300,00/);assert.match(html,/70,50/);assert.match(ui.paymentForm(w),/Ingresos Brutos:.*50,50/);}
 assert.equal(o.cobros[0].creadoPor,'admin@test.local');
});
test('bloquea exceso y retenciones inválidas; permite cancelar saldo sólo con retenciones',async()=>{
 const {o,actions,data}=app();
 await assert.rejects(actions.registrarCobro(o.id,{fecha:'2026-10-29',importe:6319137.7,retencionesDetalle:{iva:1}}),/supera el saldo/);
 await assert.rejects(actions.registrarCobro(o.id,{fecha:'2026-10-29',importe:1,retencionesDetalle:{iva:'texto'}}),/retención de IVA/);
 await actions.registrarCobro(o.id,{fecha:'2026-10-29',importe:0,retencionesDetalle:{iva:'6.319.137,70'}});assert.equal(data.build().workItems[0].porCobrar,0);
});
function form(ui,w){
 const fields={};for(const id of ['base','mode','pct','pct-wrap','amount','ret-iva','ret-iibb','ret-ganancias','ret-suss','save','summary'])fields['fc-pay-'+id]={value:id==='base'?'facturado':id==='mode'?'total':id==='pct'?'100':'0',style:{},events:{},addEventListener(type,fn){(this.events[type]??=[]).push(fn)},fire(type){for(const fn of this.events[type]||[])fn()}};
 ui.bindPaymentForm({querySelector:s=>fields[s.slice(1)],querySelectorAll:()=>Object.values(fields)},w);return id=>fields['fc-pay-'+id];
}
test('editar retenciones conserva escritura, recalcula efectivo; editar efectivo activa manual',()=>{
 const {ui,data}=app(),q=form(ui,data.build().workItems[0]);assert.equal(q('amount').readOnly,false);
 q('ret-iva').value='1.234,56';q('ret-iva').fire('input');assert.equal(q('ret-iva').value,'1.234,56');assert.equal(q('amount').value,'6317903.14');assert.equal(q('save').disabled,false);
 q('amount').value='1.000,00';q('amount').fire('input');assert.equal(q('mode').value,'importe');assert.equal(q('amount').value,'1.000,00');assert.equal(q('save').disabled,false);
 q('ret-iibb').value='100,50';q('ret-iibb').fire('input');assert.equal(q('amount').value,'1.000,00');
 q('ret-suss').value='no';q('ret-suss').fire('input');assert.equal(q('save').disabled,true);
});
test('porcentaje y total restan retenciones del monto aplicado',()=>{
 const {ui}=app(),q=form(ui,{porCobrar:1000});q('mode').value='porcentaje';q('pct').value='40';q('ret-iva').value='50';q('pct').fire('change');assert.equal(q('amount').value,'350');assert.equal(q('save').disabled,false);
 q('ret-iva').value='401';q('ret-iva').fire('input');assert.equal(q('save').disabled,true);
});
test('Retenciones del menú reúne manuales y cobros, sin escribir copias ni duplicar al consultar',async()=>{
 const {window,o,data,actions}=app();window.DB.retenciones=[{id:'manual',cliente:'Otro cliente',bruto:100,suss:5}];
 await actions.registrarCobro(o.id,{fecha:'2026-10-29',importe:1000,retencionesDetalle:{iva:10,ingresosBrutos:20,ganancias:30,suss:40}});
 for(let i=0;i<2;i++){const rows=data.retentionRows();assert.equal(rows.length,2);const r=rows[1];assert.equal(r.automatica,true);assert.equal(r.ot,'4731');assert.equal(r.mes,'2026-10');assert.equal(r.bruto,1100);assert.equal(r.retencionesTotal,100);assert.equal(r.iibb,20);assert.equal(r.gan,30);assert.equal(r.bruto-r.retencionesTotal,1000);}
 assert.equal(window.DB.retenciones.length,1);
 window.DB.retenciones.push({id:'linked',sourceCobroId:o.cobros[0].id});assert.equal(data.retentionRows().length,2);
});
