const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../compras.js'),'utf8');
function setup(){
 const items=[{codigo:'1',descripcion:'Material de prueba',familia:'Maderas',unidad:'PLACA',cantidad:2,totalNeto:100,totalBruto:121,precioUnitarioNeto:50,compra:{fecha:'2026-01-10'}},{codigo:'1',descripcion:'Material de prueba',familia:'Maderas',unidad:'PLACA',cantidad:3,totalNeto:180,totalBruto:217.8,precioUnitarioNeto:60,compra:{fecha:'2026-02-10'}}],el={innerHTML:'',insertAdjacentHTML(where,html){assert.equal(where,'afterbegin');this.innerHTML=html+this.innerHTML;}};
 const ctx={window:{},document:{querySelectorAll:()=>[]},currentTab:'compras',purchaseItems:()=>items,uniqueSorted:a=>[...new Set(a)].sort(),normText:s=>String(s||'').toLowerCase(),num:x=>Number(x)||0,money:n=>'ARS '+Number(n).toFixed(2),esc:x=>String(x??''),render(){ctx.renderCompras(el);},el};
 vm.createContext(ctx);
 const start=source.indexOf("let cpPurchaseView="),end=source.indexOf('function renderComprobantes',start);
 vm.runInContext(source.slice(start,end),ctx);vm.runInContext('function renderComprobantes(el){el.innerHTML="<b>Comprobantes de prueba</b>";}',ctx);
 vm.runInContext(source.slice(source.indexOf('window.cpHistFilters='),source.indexOf('function providerByName')),ctx);
 const route=source.indexOf('window.cpTab=');vm.runInContext(source.slice(route,source.indexOf('\n',route)),ctx);
 return ctx;
}
test('Compras integra ambas vistas y mantiene sus filtros al alternar',()=>{const c=setup();c.render();assert.match(c.el.innerHTML,/id="cp-purchase-view"/);assert.match(c.el.innerHTML,/Comprobantes de prueba/);c.window.cpSetPurchaseView('anual');assert.match(c.el.innerHTML,/Comparativo anual de materiales/);assert.match(c.el.innerHTML,/<th[^>]*>Ene<\/th>/);assert.match(c.el.innerHTML,/ARS 280.00/);assert.match(c.el.innerHTML,/5.00/);c.window.cpHistFilters.search='material';c.window.cpSetPurchaseView('comprobantes');assert.match(c.el.innerHTML,/Comprobantes de prueba/);c.window.cpSetPurchaseView('anual');assert.equal(c.window.cpHistFilters.search,'material');assert.match(c.el.innerHTML,/ARS 280.00/);});
test('el acceso antiguo abre el comparativo dentro de Compras y desaparece la solapa duplicada',()=>{const c=setup();c.window.cpTab('historico');assert.equal(c.currentTab,'compras');assert.match(c.el.innerHTML,/Comparativo anual de materiales/);assert.doesNotMatch(source,/data-tab="historico"|historico:renderHistoricoMateriales/);c.window.cpTab('migracion');assert.equal(c.currentTab,'compras');});
