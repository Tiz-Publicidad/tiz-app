'use strict';
const C=require('./insumosCotizacionCoreV1');
const SALES=new Set(['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com']);
const USERS=new Set([...SALES,'pablo.aciar@tizpublicidad.com','julieta.aguirre@tizpublicidad.com','carolina.flores@tizpublicidad.com']);
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const list=s=>s.docs.map(d=>({...d.data(),id:d.id}));
async function readCatalog(db,tx){const names=['articulosCompra','compras','conteosStock','planesMateriales'],snaps=await Promise.all(names.map(name=>tx?tx.get(db.collection(name)):db.collection(name).get()));return C.catalog(...snaps.map(list));}
const FIELDS=['emisorComercial','nro','revision','cliente','desc','importe','fecha','estado','nota','cond','validez','items','calculosAuxiliares','vendedor','moneda','tipoFacturaSolicitada','plazoEstimado','anticipoPct','diasPago','oc','observacionesComerciales','entregaLogistica','creadoPor','obraId','cotizacionBase','revisionAnteriorId','cotizacionBaseId'];
async function approve(db,body,user,at=new Date().toISOString()){
 if(!SALES.has(user.email))throw fail('Sólo Ventas puede aprobar una cotización.',403);
 const id=C.text(body.id)||db.collection('presupuestos').doc().id;if(!/^[\w-]{1,150}$/.test(id))throw fail('Cotización inválida.');
 const ref=db.collection('presupuestos').doc(id),audit=db.collection('aprobacionesInsumosCotizacion').doc(id),input=body.cotizacion||{};
 if(input.estado!=='Aprobado'||!C.text(input.cliente)||!Array.isArray(input.items)||!input.items.length||!Number.isFinite(Number(input.importe))||Number(input.importe)<0)throw fail('Revisá los datos de la cotización.');
 if(!Array.isArray(input.insumosVentas)||input.insumosVentas.length>200)throw fail('Cargá entre 1 y 200 materiales.');
 const saleTotal=input.items.reduce((s,i)=>s+Number(i.precio??i.unitario??0)*Number(i.cant??i.cantidad??1),0);
 if(!Number.isFinite(saleTotal)||Math.abs(saleTotal-Number(input.importe))>.011)throw fail('El total de la cotización no coincide con sus renglones.');
 return db.runTransaction(async tx=>{
  const [snap,check]=await Promise.all([tx.get(ref),tx.get(audit)]),old=snap.exists?snap.data():null;
  if(!old&&body.crear!==true)throw fail('La cotización ya no está disponible.',404);
  if(old&&(old.estado==='Baja'||old.bajaCotizacion?.activa))throw fail('La cotización está dada de baja.');
  // Optimistic lock includes the entire edited document and is checked before any write.
  if(old&&JSON.stringify(C.draft(old.insumosVentas))!==JSON.stringify(C.draft(body.insumosAnteriores)))throw fail('Otra persona cambió los materiales. Reabrí la cotización antes de guardar.',409);
  const rows=C.draft(input.insumosVentas);let baseline;
  if(check.exists){
   const prior=check.data();if(JSON.stringify(rows)!==JSON.stringify(C.draft(prior.insumos)))throw fail('El detalle aprobado está congelado. Creá una nueva revisión para cambiar materiales.');baseline=prior.resumen;
  }else{const catalog=await readCatalog(db,tx);baseline=C.snapshot(rows,catalog,input,user,at);}
  const data=Object.fromEntries(FIELDS.filter(k=>input[k]!==undefined).map(k=>[k,input[k]]));
  Object.assign(data,{insumosVentas:rows,insumosVentasAprobados:baseline,fechaAprobacion:C.text(old?.fechaAprobacion)||baseline.aprobadoEn});
  if(!old)data._ts=new Date(at);
  if(!check.exists)tx.set(audit,{presupuestoId:id,insumos:rows,resumen:baseline});
  tx.set(ref,data,{merge:true});return {ok:true,id,insumosVentas:rows,insumosVentasAprobados:baseline,fechaAprobacion:data.fechaAprobacion};
 });
}
async function equivalence(db,body,user,at=new Date().toISOString()){
 if(!SALES.has(user.email)&&user.email!=='carolina.flores@tizpublicidad.com')throw fail('Ventas o Compras deben definir la equivalencia.',403);
 const id=C.text(body.articuloId),target=C.unit(body.unidad),factor=C.number(body.factor);if(!/^[\w-]{1,150}$/.test(id)||!C.units.includes(target)||!Number.isFinite(factor)||factor<=0)throw fail('Equivalencia inválida.');
 return db.runTransaction(async tx=>{const ref=db.collection('articulosCompra').doc(id),snap=await tx.get(ref);if(!snap.exists)throw fail('El insumo ya no existe.');const a=snap.data();if(C.unit(a.unidad)!==C.unit(body.unidadStock))throw fail('Cambió la unidad de stock. Actualizá el catálogo.');if(target===C.unit(a.unidad))throw fail('La unidad de uso ya coincide con stock.');const values={...(a.equivalenciasStock||{}),[target]:factor};tx.update(ref,{equivalenciasStock:values,equivalenciasActualizadasEn:at,equivalenciasActualizadasPor:user.email});return {ok:true,equivalenciasStock:values};});
}
async function createArticle(db,body,user,at=new Date().toISOString()){
 mayUnits(user);const data=C.articleDraft(body.articulo),request=C.text(body.solicitudId);
 if(!/^[\w-]{16,100}$/.test(request))throw fail('La solicitud de alta no es válida. Reabrí el formulario.');
 const fingerprint=JSON.stringify(data),receipt=db.collection('altasInsumosCotizacion').doc(request),sequence=db.collection('comprasSecuencias').doc('insumos');
 return db.runTransaction(async tx=>{
  const prior=await tx.get(receipt);
  if(prior.exists){const saved=prior.data();if(saved.datos!==fingerprint)throw fail('Esta solicitud ya creó otro insumo. Reabrí el formulario.',409);const snap=await tx.get(db.collection('articulosCompra').doc(saved.articuloId));if(!snap.exists)throw fail('El insumo creado ya no está disponible.',409);return {ok:true,articulo:{...snap.data(),id:snap.id||saved.articuloId}};}
  const [snap,seq]=await Promise.all([tx.get(db.collection('articulosCompra')),tx.get(sequence)]),articles=list(snap);
  const duplicate=articles.find(a=>C.articleIdentity(a.descripcion)===C.articleIdentity(data.descripcion));
  if(duplicate)throw fail('Ya existe '+C.text(duplicate.codigo)+' · '+C.text(duplicate.descripcion)+'. Buscalo y vinculalo desde el catálogo.',409);
  const codigo=C.nextArticleCode(articles,seq.exists?seq.data().ultimo:0),ref=db.collection('articulosCompra').doc('insumo-'+codigo),existing=await tx.get(ref);
  if(existing.exists)throw fail('El número ya existe. Actualizá el catálogo y reintentá.',409);
  const article={...data,codigo,origen:'cotizacion',creadoPor:user.email,creadoEn:at,_ts:new Date(at)};
  tx.set(sequence,{ultimo:Number(codigo)},{merge:true});tx.set(ref,article);tx.set(receipt,{datos:fingerprint,articuloId:ref.id,fecha:at,usuario:user.email});
  return {ok:true,articulo:{...article,id:ref.id}};
 });
}
function unitVersion(a){return require('node:crypto').createHash('sha256').update(JSON.stringify({unidad:a.unidad||'',unidadControl:a.unidadControl||'',unidadCompra:a.unidadCompraPreferida||'',equivalencias:Object.entries(a.equivalenciasStock||{}).sort(([a],[b])=>a.localeCompare(b)),medidas:a.medidasPresentacion||{}})).digest('hex');}
function mayUnits(user){if(!SALES.has(user.email)&&user.email!=='carolina.flores@tizpublicidad.com')throw fail('Ventas o Compras deben definir las unidades de stock.',403);}
async function stockUnits(db,body,user,at=new Date().toISOString()){
 mayUnits(user);const id=C.text(body.articuloId);if(!/^[\w-]{1,150}$/.test(id))throw fail('Insumo inválido.');const ref=db.collection('articulosCompra').doc(id);
 if(body.mode==='quote-materials-units-read'){const snap=await ref.get();if(!snap.exists)throw fail('El insumo ya no existe.',404);return {ok:true,articulo:{...snap.data(),id},version:unitVersion(snap.data())};}
 if(body.mode==='quote-materials-units-preview'){
  const [snap,purchases,counts,plans]=await Promise.all([ref.get(),...['compras','conteosStock','planesMateriales'].map(name=>db.collection(name).get())]);if(!snap.exists)throw fail('El insumo ya no existe.',404);const a=snap.data();if(C.unit(body.unidadOrigen)!==C.unit(a.unidad))throw fail('Cambió la unidad original. Reabrí el formulario.',409);
  const setting=C.unitSetting(a,body),proposed={...a,...setting,id},meta=C.catalog([proposed],list(purchases),list(counts),list(plans))[0];return {ok:true,version:unitVersion(a),articulo:proposed,resumen:meta,configuracion:setting};
 }
 if(body.mode!=='quote-materials-units-save')throw fail('Operación de unidades inválida.');
 return db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw fail('El insumo ya no existe.',404);const a=snap.data();if(body.version!==unitVersion(a)||C.unit(body.unidadOrigen)!==C.unit(a.unidad))throw fail('Otra persona cambió el criterio de unidades. Volvé a revisar el cálculo.',409);const setting=C.unitSetting(a,body);tx.update(ref,{...setting,unidadesActualizadasEn:at,unidadesActualizadasPor:user.email});tx.set(ref.collection('historialUnidades').doc(),{anterior:{unidad:a.unidad||'',unidadControl:a.unidadControl||'',equivalenciasStock:a.equivalenciasStock||{},medidasPresentacion:a.medidasPresentacion||{}},nuevo:setting,fecha:at,usuario:user.email});return {ok:true,articulo:{...a,...setting,id}};});
}
function aiRows(payload,catalog){if(!Array.isArray(payload?.materiales)||!payload.materiales.length)throw fail('La IA no devolvió materiales. Ampliá la descripción o cargalos manualmente.');return payload.materiales.slice(0,80).map(r=>{const a=catalog.find(a=>a.id===C.text(r.articuloId));return {articuloId:a?.id||'',descripcion:C.text(a?.descripcion||r.descripcion).slice(0,300),cantidad:'',unidad:a?.unidad||C.unit(r.unidad),revisado:false,compraPendiente:false,origen:'ia',nota:C.text(r.motivo).slice(0,500)};});}
async function sharedIA(db,input){
 const snap=await db.collection('configuracionCompras').doc('iaComprobantes').get(),url=snap.exists?C.text(snap.data().url):'';
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec\/[A-Za-z0-9_-]+$/.test(url))throw fail('Guardá la conexión compartida en Compras → IA comprobantes antes de usar el desglose.',503);
 // Use the same browser POST + authenticated JSONP polling transport as Compras.
 return {url,datos:input};
}
async function suggest(db,body){
 const quote=body.cotizacion||{},description=C.text(quote.desc).slice(0,10000),items=(Array.isArray(quote.items)?quote.items:[]).slice(0,100).map(i=>({descripcion:C.text(i.desc||i.descripcion).slice(0,1500),cantidad:C.number(i.cant||i.cantidad)||1}));
 if(!description&&!items.some(i=>i.descripcion))throw fail('Describí el trabajo en Cotizaciones antes de pedir el desglose.');
 const catalog=await readCatalog(db);if(!catalog.length)throw fail('Primero cargá el catálogo de insumos en Compras.');
 const servicioIA=await sharedIA(db,{descripcion:description,items,catalogo:catalog.map(a=>({articuloId:a.id,codigo:a.codigo,descripcion:a.descripcion,unidad:a.unidad}))});
 return {ok:true,servicioIA};
}
async function handle(req,res){
 res.set('Cache-Control','no-store');try{const header=req.get('authorization')||'';if(!header.startsWith('Bearer '))throw fail('Iniciá sesión en TIZ.',401);const admin=require('firebase-admin'),token=await admin.auth().verifyIdToken(header.slice(7)),user={email:C.norm(token.email)};if(!USERS.has(user.email))throw fail('Tu cuenta no tiene acceso a los materiales de cotizaciones.',403);const db=admin.firestore(),body=req.body||{},mode=C.text(body.mode).replace(/^quote-materials-/,'');
  if(mode==='catalog')return res.json({ok:true,articulos:await readCatalog(db)});
  if(mode==='approve')return res.json(await approve(db,body,user));
  if(mode==='equivalence')return res.json(await equivalence(db,body,user));
  if(mode==='article-create')return res.json(await createArticle(db,body,user));
  if(['units-read','units-preview','units-save'].includes(mode))return res.json(await stockUnits(db,body,user));
  if(mode==='suggest'){if(!SALES.has(user.email))throw fail('Sólo Ventas puede generar el desglose de una cotización.',403);return res.json(await suggest(db,body));}throw fail('Operación inválida.');
 }catch(e){return res.status(e.status||400).json({ok:false,error:e.message||'No se pudo procesar el detalle de materiales.'});}
}
module.exports={readCatalog,approve,equivalence,createArticle,stockUnits,unitVersion,aiRows,sharedIA,suggest,handle};
