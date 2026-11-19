const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('renglones históricos se numeran al abrir; quitar un ítem renumera sin tocar los importes restantes',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),start=html.indexOf('window.addItemPP ='),end=html.indexOf('window.tizCotizacionNombreBaseV354',start),wrap={innerHTML:''},total={textContent:''},items=[{desc:'Cartel',precio:100,cant:2},{desc:'Lona',precio:50,cant:3},{desc:'Instalación',precio:25,cant:1}],window={ppItems:items},ctx={window,document:{getElementById:id=>id==='pp-items'?wrap:total}};vm.runInNewContext(html.slice(start,end)+';globalThis.render=renderPPItems;',ctx);ctx.render();assert.match(wrap.innerHTML,/aria-label="Renglón 1"/);assert.match(wrap.innerHTML,/aria-label="Renglón 3"/);window.removeItemPP(1);assert.match(wrap.innerHTML,/aria-label="Renglón 2"/);assert.doesNotMatch(wrap.innerHTML,/Renglón 3/);assert.deepEqual(items,[{desc:'Cartel',precio:100,cant:2},{desc:'Instalación',precio:25,cant:1}]);assert.match(total.textContent,/225/);
});

test('TIZ muestra áreas junto al precio y recupera las correcciones de una cotización guardada',()=>{
 const M=require('../insumosMatrizV1'),C=require('../functions/insumosCotizacionCoreV1');
 const js=fs.readFileSync(require.resolve('../insumosCotizacionV1'),'utf8');
 const makeElement=()=>({dataset:{},style:{},setAttribute(){},addEventListener(type,handler){this[type]=handler;}});
 const rows=Array.from({length:4},()=>({
  querySelector(selector){return selector==='[data-pp-item-area]'?this.area:{before:area=>{this.area=area;}};},
 }));
 const header={children:[{}, {}, {before:title=>{header.areaTitle=title;}}],querySelector(){return this.areaTitle;}};
 const quoteItems={previousElementSibling:header,querySelectorAll:()=>rows};
 const window={TIZInsumosCotizacionCoreV1:C,TIZInsumosMatrizV1:M,ppItems:[
  {desc:'Vinilo esmerilado 1.29 mts x 1.2 mts',precio:100,cant:2},
  {desc:'Vinilo esmerilado 0.94 mts x 1.2 mts',precio:50,cant:1},
  {desc:'Vinilo esmerilado 0.78 mts x 1.2 mts',precio:50,cant:1},
  {desc:'Colocación',precio:25,cant:1},
 ]};
 const hook='window.areaTest={renderItemAreas,restoreItemAreas};';
 vm.runInNewContext(js.replace("if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();",hook),{window,document:{createElement:makeElement}});
 window.areaTest.renderItemAreas(quoteItems);
 assert.equal(header.areaTitle.textContent,'Área (m²)');
 assert.deepEqual(rows.map(row=>row.area.value),['1,548','1,128','0,936','']);

 const item=window.ppItems[0],input=rows[0].area;
 input.value='1,6';input.change();
 const items=M.create([],window.ppItems).exportItems(window.ppItems);
 delete item.areaM2Manual;
 window.areaTest.restoreItemAreas({items},window.ppItems);
 item.desc='Vinilo 125 cm × 1,2 m';
 window.areaTest.renderItemAreas(quoteItems);
 assert.equal(input.value,'1,6');
 input.value='';input.change();
 assert.equal(input.value,'1,5');
 assert.equal(item.areaM2Manual,undefined);
 assert.equal(item.precio,100);
 assert.equal(item.cant,2);
});
