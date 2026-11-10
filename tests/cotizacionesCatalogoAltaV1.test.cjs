'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../functions/insumosCotizacionCoreV1'),API=require('../functions/insumosCotizacionApiV1'),Obras=require('../functions/obrasSeguimientoCoreV2');
const sales={email:'giancarlo.pareja@tizpublicidad.com'},payload=()=>({solicitudId:'request-test-00000001',articulo:{descripcion:'Tinta UV cian',unidad:'ML',familia:'Tintas',subfamilia:'UV',control:'consumible'}});
function fixture(){
 const docs=new Map([['articulosCompra/legacy',{codigo:'000450',descripcion:'Lona front',unidad:'M²',familia:'Lonas',control:'estrategico'}],['comprasSecuencias/insumos',{ultimo:460}]]),writes=[];
 const collection=name=>({name,doc:id=>({id,path:name+'/'+id}),get:async()=>({docs:[...docs].filter(([p])=>p.startsWith(name+'/')).map(([p,d])=>({id:p.split('/')[1],data:()=>structuredClone(d)}))})});
 const db={collection,runTransaction:async fn=>{const staged=[],tx={get:async ref=>{assert.equal(staged.length,0);return ref.path?{id:ref.id,exists:docs.has(ref.path),data:()=>structuredClone(docs.get(ref.path))}:ref.get();},set:(ref,data,opts)=>staged.push({ref,data,opts})};const result=await fn(tx);for(const w of staged){docs.set(w.ref.path,w.opts?.merge?{...docs.get(w.ref.path),...w.data}:w.data);writes.push(w);}return result;}};return {db,docs,writes};
}
test('alta desde Ventas comparte la numeración de Compras y sólo crea catálogo, contador y recibo',async()=>{
 const f=fixture(),r=await API.createArticle(f.db,payload(),sales,'2026-11-06T15:00:00Z');assert.equal(r.articulo.codigo,'000461');assert.equal(r.articulo.id,'insumo-000461');assert.equal(r.articulo.control,'consumible');assert.equal(r.articulo.creadoPor,sales.email);assert.equal(f.writes.length,3);
 assert.ok(f.writes.every(w=>/^(articulosCompra|comprasSecuencias|altasInsumosCotizacion)\//.test(w.ref.path)));const view=C.catalog([r.articulo],[],[],[])[0];assert.equal(view.ultimoCosto,null);assert.equal(view.stockDisponible,null);assert.equal(view.familia,'Tintas');
});
test('reintento con mismo identificador no duplica y una solicitud reutilizada con otros datos se rechaza',async()=>{
 const f=fixture(),p=payload(),a=await API.createArticle(f.db,p,sales),b=await API.createArticle(f.db,p,sales);assert.equal(a.articulo.id,b.articulo.id);assert.equal(f.writes.length,3);
 p.articulo.descripcion='Tinta negra';await assert.rejects(API.createArticle(f.db,p,sales),/otro insumo/);assert.equal(f.writes.length,3);
});
test('descripción duplicada, datos inválidos o usuario sin permiso no escriben',async()=>{
 for(const change of [{descripcion:' lona FRONT '},{unidad:'inventada'},{familia:''},{subfamilia:''},{control:'otro'}]){const f=fixture(),p=payload();Object.assign(p.articulo,change);await assert.rejects(API.createArticle(f.db,p,sales));assert.equal(f.writes.length,0);}
 const f=fixture();await assert.rejects(API.createArticle(f.db,payload(),{email:'arielbenitezpublicidad@gmail.com'}),/Ventas o Compras/);assert.equal(f.writes.length,0);
});
test('el contador compartido y códigos reservados se respetan para altas sucesivas',async()=>{
 const f=fixture();await API.createArticle(f.db,payload(),sales);const next=payload();next.solicitudId='request-test-00000002';next.articulo.descripcion='Tinta UV magenta';assert.equal((await API.createArticle(f.db,next,sales)).articulo.codigo,'000462');
 assert.equal(C.nextArticleCode([],0),'000332');const src=fs.readFileSync(require.resolve('../compras.js'),'utf8'),line=src.split(/\r?\n/).find(l=>l.startsWith('const CATALOGO_TIZ_BASE = ')),base=JSON.parse(line.slice('const CATALOGO_TIZ_BASE = '.length).replace(/;\s*$/,''));assert.equal(Number(C.nextArticleCode([],0)),Math.max(...base.map(a=>Number(a.codigo)))+1);
});
test('tinta propia consume sólo el artículo vinculado, sin agregar lona ni estimar litros por m²',()=>{
 const articles=[{id:'tinta',codigo:'000461',descripcion:'Tinta UV cian',unidad:'LITRO',control:'consumible',familia:'Tintas'}, {id:'lona',codigo:'000450',descripcion:'Lona',unidad:'M²',control:'estrategico'}];
 const purchases=[{id:'p',fecha:'2026-11-05',items:[{articuloId:'tinta',cantidad:1,unidad:'LITRO',precioUnitarioNeto:10000}]}],counts=[{fecha:'2026-11-05',items:[{articuloId:'tinta',cantidad:1,unidad:'LITRO'}]}],cat=C.catalog(articles,purchases,counts,[]);
 const r=C.validate([{articuloId:'tinta',cantidad:'50',unidad:'ML',revisado:true}],cat);assert.equal(r.ok,true);assert.equal(r.items.length,1);assert.equal(r.items[0].articuloId,'tinta');assert.equal(r.items[0].cantidadStock,.05);assert.equal(r.total,500);
});
test('el alta no habilita aprobar sin costo de Compras; servicio sin stock conserva su precio independiente',async()=>{
 const f=fixture(),p=payload();p.articulo.control='sin_stock';p.articulo.unidad='M²';const a=(await API.createArticle(f.db,p,sales)).articulo,rows=[{articuloId:a.id,cantidad:'3.2',unidad:'M²',revisado:true}],cat=C.catalog([a],[],[],[]);assert.equal(C.validate(rows,cat).ok,false);
 cat[0].ultimoCosto=1000;assert.equal(C.validate(rows,cat).ok,true);assert.equal(C.validate(rows,cat).total,3200);
});
test('alta en Obras usa aprobación en Buenos Aires y conserva aparte la fecha de cotización',()=>{
 const quote={fecha:'01/10/2026',fechaAprobacion:'2026-11-07T01:30:00Z'},result=C.approvalWorkDates(quote);assert.equal(result.fechaAltaObra,'2026-11-06');assert.equal(result.fecha,'2026-11-06');assert.equal(result.semanaVenta,45);assert.equal(quote.fecha,'01/10/2026');assert.equal(result.fechaAltaObraOrigen,'aprobacion');
 assert.equal(C.argentinaDay('2026-11-07T03:00:00Z'),'2026-11-07');assert.equal(C.approvalWorkDates({fecha:'01/10/2026'},{},'2026-11-06T15:00:00Z').fechaAltaObra,'2026-11-06');
});
test('editar o resincronizar una obra aprobada no cambia su primera fecha ni su semana de alta',()=>{
 const first=C.approvalWorkDates({fechaAprobacion:'2026-11-06T15:00:00Z'}),later=C.approvalWorkDates({fechaAprobacion:'2026-11-10T15:00:00Z'},first);assert.deepEqual(later,first);
 const w={id:'w',ot:'4810',cliente:'Cliente',estado:'Pendiente',...first},source=[{row:3,ot:'4810',cliente:'Cliente',fechaAlta:'2026-10-01',semana:40,estado:'Pendiente',produccionPrevista:'',colocacionPrevista:''}],patch=Obras.referencePlan([w],source,[]).updates[0].patch;assert.equal(patch.fechaAltaObra,undefined);assert.equal(patch.semanaVenta,undefined);
});
test('Base Madre recibe el mismo día de aprobación que Obras, incluso cerca de medianoche',()=>{
 const vm=require('node:vm'),src=fs.readFileSync(require.resolve('../functions/baseMadreBackendV120'),'utf8'),ctx={text:C.text,Date,Intl,require:n=>{assert.equal(n,'./insumosCotizacionCoreV1');return C;}};
 vm.runInNewContext(src.slice(src.indexOf('function shortDate('),src.indexOf('async function operator('))+';globalThis.date=approvalDate;',ctx);
 const p={fecha:'01/10/2026',fechaAprobacion:'2026-11-07T01:30:00Z'};assert.equal(ctx.date(p),'06/11/26');assert.equal(ctx.date({fecha:p.fecha,insumosVentasAprobados:{aprobadoEn:p.fechaAprobacion}}),'06/11/26');assert.equal(ctx.date({fecha:'01/10/2026'}),'01/10/26');
});
