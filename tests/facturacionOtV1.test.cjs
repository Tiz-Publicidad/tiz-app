const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const src=fs.readFileSync(require.resolve('../operacionesV31'),'utf8');
function payload(o,old={},presupuestos=[]){const window={DB:{presupuestos}},ctx={window};vm.runInNewContext(src.slice(src.indexOf('  function productionDataWithQuote('),src.indexOf('  async function autoSyncProductionDocuments('))+';globalThis.build=productionSheetPayload;',ctx);return ctx.build(window.productionDataWithQuoteV311(o,old));}
test('la hoja de OT recibe la elección A, B o A definir sin importes comerciales',()=>{for(const [tipo,label] of [['A','Factura A'],['B','Factura B'],['','A definir']]){const p=payload({tipoFacturaSolicitada:tipo,importe:65000,itemsCotizados:[{desc:'Cartel',cant:1,precio:65000}]});assert.match(p.observaciones,new RegExp('Tipo de factura: '+label));assert.doesNotMatch(JSON.stringify(p),/65000/);assert.equal(p.materiales[0].articulo,'Cartel');}});
test('se respeta el presupuesto vinculado, incluso A definir, sin mezclar otros clientes',()=>{const ps=[{id:'p',tipoFacturaSolicitada:''},{id:'otro',tipoFacturaSolicitada:'B'}];assert.match(payload({presupuestoId:'p',tipoFacturaSolicitada:'A'},{},ps).observaciones,/Tipo de factura: A definir/);assert.match(payload({infoPresupuesto:{tipoFacturaSolicitada:'B'}},{},ps).observaciones,/Tipo de factura: Factura B/);});
test('resincronizar actualiza la elección sin duplicar líneas y conserva notas y contacto',()=>{const o={tipoFacturaSolicitada:'B',entregaLogistica:{contactoTelefono:'112233'}},old={observaciones:'Teléfono contacto: anterior\nTipo de factura: Factura A\nManipular con cuidado',checks:{stock:true},ayudamemoria:'Coordinar entrega'};const first=payload(o,old),second=payload(o,first);assert.equal(first.observaciones,second.observaciones);assert.equal((second.observaciones.match(/Tipo de factura:/g)||[]).length,1);assert.match(second.observaciones,/Teléfono contacto: 112233/);assert.match(second.observaciones,/Manipular con cuidado/);assert.equal(second.checks.stock,true);assert.equal(second.ayudamemoria,'Coordinar entrega');});

test('OT 4813 recupera los dos artículos del presupuesto vinculado aunque la obra no tenga ítems',()=>{
 const q={id:'q4813',items:[{desc:'Cartel Fronta lGabinete de Salud (CAI02224)',cant:1,precio:70370.74},{desc:'Colocacion',cant:1,precio:42000}]};
 const p=payload({ot:'4813',presupuestoId:q.id},{materiales:[],observaciones:'Tipo de factura: A definir'},[q]);
 assert.equal(p.materiales.length,2);assert.match(p.materiales[0].articulo,/CAI02224/);assert.equal(p.materiales[1].articulo,'Colocacion');
 assert.doesNotMatch(p.observaciones,/Cartel|Colocacion/);assert.doesNotMatch(JSON.stringify(p),/70370|42000|precio|importe/);
});
test('las variantes artículo, descripción y desc se conservan en la columna de artículo',()=>{
 const p=payload({}, {materiales:[{articulo:'A',cantidad:0,unidad:'UNID'},{descripcion:'B',cantidad:2,unidad:'M²',detalle:'Revisar color'},{desc:'C',cant:3,unidad:'ML'},{descripcion:'  ',observaciones:'Sólo nota'}]});
 assert.deepEqual(Array.from(p.materiales,m=>m.articulo),['A','B','C']);assert.equal(p.materiales[0].cantidad,0);assert.equal(p.materiales[1].observaciones,'Revisar color');assert.equal(p.materiales[2].cantidad,3);
});
test('preserva los materiales editados por Producción, las cantidades y las notas manuales al sincronizar',()=>{
 const p=payload({itemsTecnicos:[{articulo:'Cotizado',cantidad:1}]},{materiales:[{articulo:'Elegido por Producción',cantidad:4,unidad:'PLACA'}],observaciones:'No apilar las piezas',checks:{stock:true}});
 assert.equal(p.materiales[0].articulo,'Elegido por Producción');assert.equal(p.materiales[0].cantidad,4);assert.match(p.observaciones,/No apilar/);assert.equal(p.checks.stock,true);
});
test('listas vacías o filas sin descripción no ocultan las fuentes disponibles y no se inventan artículos',()=>{
 const q={id:'p',items:[{descripcion:'Insumo vinculado',cantidad:2}]};
 assert.equal(payload({presupuestoId:'p',itemsTecnicos:[{}],itemsCotizados:[]},{materiales:[{articulo:' '}]},[q]).materiales[0].articulo,'Insumo vinculado');
 assert.equal(payload({infoPresupuesto:{items:[{descripcion:'Detalle técnico',cantidad:1}]}}).materiales[0].articulo,'Detalle técnico');
 assert.equal(payload({desc:'Título de la obra'},{observaciones:'Aclaración sin artículo'}).materiales.length,0);
});
test('la sincronización automática envía los artículos recuperados en vez de reponer la lista anterior vacía',async()=>{
 const events=[],updates=[],o={id:'w4813',ot:'4813',estado:'Aprobado',presupuestoId:'q4813',gestionSectores:{produccion:{materiales:[],observaciones:'Cuidar la terminación',checks:{plano:true}}}},window={DB:{obras:[o],presupuestos:[{id:'q4813',items:[{desc:'Cartel',cant:1},{desc:'Colocacion',cant:1}]}]},updateDoc_:async(...args)=>updates.push(args)},ctx={window,approvedWorks:()=>[o],norm:s=>s.toLowerCase(),getGestion:o=>o.gestionSectores.produccion,pct:()=>20,autoSyncState:{running:false,attempted:new Set()},callWebhook:async p=>{events.push(p);return {sheetUrl:'https://docs.google.com/spreadsheets/d/existing',sheetId:'existing'}},console:{info(){},warn(){}},Date,Set};
 vm.runInNewContext(src.slice(src.indexOf('  function productionDataWithQuote('),src.indexOf('  function scheduleAutoSync('))+'\nglobalThis.sync=autoSyncProductionDocuments;',ctx);
 const linked=window.DB.presupuestos.splice(0);await ctx.sync();assert.equal(events.length,0);assert.equal(ctx.autoSyncState.attempted.has(o.id),false);window.DB.presupuestos.push(...linked);
 await ctx.sync();assert.equal(events.length,1);assert.equal(events[0].obra.data.materiales.length,2);assert.equal(events[0].obra.data.materiales[0].articulo,'Cartel');assert.match(events[0].obra.data.observaciones,/Cuidar/);assert.equal(updates.length,1);
});

test('los antiguos renglones automáticos de Observaciones no duplican el artículo y las notas libres se conservan',()=>{
 const p=payload({items:[{desc:'Cartel',cant:1}]},{observaciones:'1. Cartel — Cantidad: 1 UNID\nEmbalar sin apilar'});
 assert.equal(p.materiales[0].articulo,'Cartel');assert.doesNotMatch(p.observaciones,/1\. Cartel/);assert.match(p.observaciones,/Embalar sin apilar/);
});
