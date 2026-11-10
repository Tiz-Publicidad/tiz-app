'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../functions/insumosCotizacionCoreV1'),API=require('../functions/insumosCotizacionApiV1');
const sales={email:'giancarlo.pareja@tizpublicidad.com'},original=()=>({codigo:'000362',descripcion:'Tinta para impresión UV',unidad:'LITRO',familia:'Tintas',subfamilia:'',control:'consumible',stockMinimo:7});
function fixture(extra=[]){
 const docs=new Map([['articulosCompra/tinta',original()],...extra]),writes=[];
 const ref=path=>({id:path.split('/').at(-1),path,get:async()=>({id:path.split('/').at(-1),exists:docs.has(path),data:()=>structuredClone(docs.get(path))}),collection:name=>({doc:()=>ref(path+'/'+name+'/audit')})});
 const collection=name=>({name,doc:id=>ref(name+'/'+id),get:async()=>({docs:[...docs].filter(([p])=>p.startsWith(name+'/')&&p.split('/').length===2).map(([p,d])=>({id:p.split('/')[1],data:()=>structuredClone(d)}))})});
 const db={collection,runTransaction:async fn=>{const staged=[],tx={get:async r=>{assert.equal(staged.length,0);return r.get();},set:(r,d)=>staged.push({r,d,merge:false}),update:(r,d)=>staged.push({r,d,merge:true})};const out=await fn(tx);for(const w of staged){docs.set(w.r.path,w.merge?{...docs.get(w.r.path),...w.d}:w.d);writes.push(w);}return out;}};
 return{db,docs,writes,read:()=>API.editArticle(db,{mode:'quote-materials-article-read',articuloId:'tinta'},sales)};
}
async function update(f,changes={},user=sales){const read=await f.read();return API.editArticle(f.db,{mode:'quote-materials-article-update',articuloId:'tinta',version:read.version,articulo:{...read.articulo,...changes}},user,'2026-11-06T15:00:00Z');}
test('corrige LITRO a M² sin historial, conserva código y mínimo y audita la corrección',async()=>{
 const f=fixture(),result=await update(f,{unidad:'M²'});assert.equal(result.articulo.unidad,'M²');assert.equal(result.articulo.unidadControl,'M²');assert.equal(result.articulo.codigo,'000362');assert.equal(result.articulo.stockMinimo,7);assert.equal(result.articulo.subfamilia,'');assert.deepEqual(result.articulo.equivalenciasStock,{});assert.equal(f.writes.length,2);
 const audit=f.docs.get('articulosCompra/tinta/historialArticulo/audit');assert.equal(audit.anterior.unidad,'LITRO');assert.equal(audit.nuevo.unidad,'M²');assert.equal(audit.usuario,sales.email);assert.equal([...f.docs.keys()].some(p=>p.startsWith('compras/')),false);
});
test('una compra, conteo, reserva o cotización aprobada impide renombrar la unidad histórica',async()=>{
 for(const [name,data]of [['compras',{items:[{articuloId:'tinta',cantidad:1,unidad:'LITRO'}]}],['conteosStock',{items:[{articuloId:'tinta',cantidad:1}]}],['planesMateriales',{items:[{articuloId:'tinta',cantidadPlanificada:1}]}],['aprobacionesInsumosCotizacion',{resumen:{items:[{articuloId:'tinta',unidadStock:'LITRO'}]}}]]){
  const f=fixture([[name+'/history',data]]);await assert.rejects(update(f,{unidad:'M²'}),/Unidades y equivalencias/);assert.equal(f.writes.length,0);assert.equal(f.docs.get('articulosCompra/tinta').unidad,'LITRO');
 }
});
test('editar descripción no cambia movimientos, costos ni equivalencias',async()=>{
 const purchase={items:[{articuloId:'tinta',cantidad:1,unidad:'LITRO',precioUnitarioNeto:1000}]},f=fixture([['compras/p',purchase]]);f.docs.get('articulosCompra/tinta').equivalenciasStock={'M²':100};
 const r=await update(f,{descripcion:'Tinta UV cian'});assert.equal(r.articulo.unidad,'LITRO');assert.deepEqual(r.articulo.equivalenciasStock,{'M²':100});assert.deepEqual(f.docs.get('compras/p'),purchase);
});
test('bloquea conflictos de ficha, descripciones duplicadas, unidad inválida y cuentas no autorizadas',async()=>{
 const f=fixture(),read=await f.read();f.docs.get('articulosCompra/tinta').descripcion='Otro cambió esta ficha';await assert.rejects(API.editArticle(f.db,{articuloId:'tinta',version:read.version,articulo:original()},sales),/Otra persona/);assert.equal(f.writes.length,0);
 for(const variant of ['duplicate','unit','permission']){const x=fixture([['articulosCompra/otro',{...original(),descripcion:'Otra tinta'}]]);await assert.rejects(update(x,variant==='duplicate'?{descripcion:'otra tinta'}:variant==='unit'?{unidad:'inventada'}:{},variant==='permission'?{email:'arielbenitezpublicidad@gmail.com'}:sales));assert.equal(x.writes.length,0);}
});
test('no convierte un material con movimientos en servicio sin stock',async()=>{
 const f=fixture([['compras/p',{items:[{articuloId:'tinta'}]}]]);await assert.rejects(update(f,{control:'sin_stock'}),/Conservá el control/);assert.equal(f.writes.length,0);
});
test('con historial, convertir el control a m² conserva litros y transforma el costo mediante rendimiento explícito',()=>{
 const raw=original(),setting=C.unitSetting(raw,{unidadCompra:'LITRO',unidadControl:'M²',factor:100,ancho:'',largo:''}),p={id:'p',fecha:'2026-11-05',items:[{articuloId:'tinta',cantidad:1,unidad:'LITRO',precioUnitarioNeto:1000}]};
 const article={...raw,...setting,id:'tinta'},view=C.catalog([article],[p],[{fecha:'2026-11-05',items:[{articuloId:'tinta',cantidad:1,unidad:'LITRO'}]}],[])[0];assert.equal(article.unidad,'LITRO');assert.equal(view.unidad,'M²');assert.equal(view.stockDisponible,100);assert.equal(view.ultimoCosto,10);assert.equal(C.stockQuantity(5,'M²',view),5);
});
