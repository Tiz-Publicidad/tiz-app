'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),V=require('../functions/vigenciaComercialCoreV1'),O=require('../functions/obrasSeguimientoCoreV2'),A=require('../functions/analisisPreliminarCoreV1'),Q=require('../functions/calidadCoreV1'),P=require('../comprasObrasCoreV1');
const quote=(extra={})=>({id:'p4816',nro:'0004816',cliente:'Cliente 4816',revision:'1.1',estado:'Borrador',revisionEstado:'aprobada',obraId:'w4816',...extra});
const work=(extra={})=>({id:'w4816',ot:'4816',cliente:'Cliente 4816',desc:'Obra aprobada por error',presupuestoId:'p4816',estado:'Aprobado',revisionVigente:true,revisionOperativa:true,gestionSectores:{produccion:{notas:'Conservar información'}},cobros:[{importe:10}],...extra});
test('4816: Borrador prevalece sobre una aprobación anterior y excluye la obra sin borrar sus datos',()=>{
 const w=work(),before=JSON.stringify(w),q=quote(),marked=V.mark(w,[q]);assert.equal(V.approved(q),false);assert.equal(V.visible(w,[q]),false);assert.equal(marked.revisionOperativa,false);assert.equal(marked.vigenciaComercial.estado,'Borrador');assert.equal(O.grouped([marked]).length,0);assert.equal(JSON.stringify(w),before);assert.deepEqual(marked.cobros,w.cobros);assert.equal(marked.gestionSectores.produccion.notas,'Conservar información');
 for(const estado of ['Borrador','Enviado','Pendiente','Baja'])assert.equal(V.visible(w,[quote({estado})]),false,estado);
});
test('una fila vieja de Base Madre no resucita un borrador en Operaciones, Compras o Calidad',()=>{
 const marked=V.mark(work(),[quote()]),source=[{row:4,ot:'4816',cliente:'Cliente 4816',desc:'Fila anterior',status:'Pendiente'}];assert.equal(A.workList(source,[marked]).length,0);assert.equal(P.merge(source,[marked]).length,0);assert.equal(Q.motherWorks(source,[marked]).length,0);
 assert.equal(A.workList([{...source[0],cliente:'Otro cliente'}],[marked]).length,1);
});
test('los IDs y revisiones separan un borrador nuevo de la obra anterior que sigue aprobada',()=>{
 const approved=quote({id:'aprobada',estado:'Aprobado',revision:'1.1'}),draft=quote({id:'nueva',revision:'1.2',obraId:''});assert.equal(V.visible(work({presupuestoId:'aprobada'}),[approved,draft]),true);assert.equal(V.visible(work({presupuestoId:'nueva'}),[approved,draft]),false);
 assert.equal(V.visible(work({presupuestoId:'',revisionCotizacion:'1.1'}),[approved,draft]),true);assert.equal(V.visible(work({presupuestoId:'',revisionCotizacion:'1.2'}),[approved,draft]),false);
 assert.equal(V.visible(work({presupuestoId:'',cliente:'Otro cliente'}),[draft]),true);
});
test('volver a aprobar reutiliza la identidad y conserva los registros anteriores',()=>{
 const w=work(),q=quote({estado:'Aprobado'});assert.equal(V.visible(w,[q]),true);assert.equal(V.mark(w,[q]).id,w.id);assert.deepEqual(V.mark(w,[q]).cobros,w.cobros);assert.equal(V.visible(work({presupuestoId:''}),[]),true);assert.equal(V.visible(work(),[quote({estado:'',revisionEstado:''})]),true);
});
test('la consulta común entrega la marca de borrador a todos los perfiles sin devolver importes de la cotización',async()=>{
 const API=require('../functions/obrasConsultaV1'),q=quote({importe:999999}),w=work(),db={collection:name=>({get:async()=>({docs:[{id:name==='obras'?w.id:q.id,data:()=>name==='obras'?w:q}]})})},req={method:'POST',body:{mode:'obras-consulta-list'},get:k=>k==='authorization'?'Bearer token':''},res={code:200,status(n){this.code=n;return this},json(v){this.value=v;return v}};
 for(const email of ['info@tizpublicidad.com','pablo.aciar@tizpublicidad.com','cristiantizpublicidad@gmail.com','arielbenitezpublicidad@gmail.com']){await API.handle(req,res,{auth:()=>({verifyIdToken:async()=>({email})}),firestore:()=>db});assert.equal(res.code,200);assert.equal(O.grouped(res.value.obras).length,0);assert.equal(res.value.obras[0].vigenciaComercial.estado,'Borrador');assert.ok(!JSON.stringify(res.value).includes('999999'));}
});
test('reconciliar Borrador elimina la marca aprobada y desactiva sólo su obra; la promesa espera la propagación',async()=>{
 const source=fs.readFileSync(require.resolve('../expedientesV33'),'utf8'),start=source.indexOf('  async function reconcileBudget('),end=source.indexOf('  const originalAdd=',start),q=quote(),w=work(),writes=[],window={DB:{presupuestos:[q],obras:[w]},TIZVigenciaComercialV1:V},ctx={window,writeGuard:false,ctKey:p=>V.family(w,p)?'4816':'otro',isApproved:V.approved,norm:v=>String(v||'').toLowerCase(),Date,originalUpdate:async(col,id,patch)=>{await Promise.resolve();Object.assign(col==='obras'?w:q,patch);writes.push({col,id,patch})}};
 vm.runInNewContext(source.slice(start,end)+';globalThis.reconcile=reconcileBudget;',ctx);await ctx.reconcile(q.id,{estado:'Borrador'});assert.equal(q.revisionEstado,'borrador');assert.equal(q.revisionVigente,false);assert.equal(w.revisionOperativa,false);assert.equal(w.gestionSectores.produccion.notas,'Conservar información');assert.ok(writes.some(x=>x.col==='obras'));assert.ok(!source.includes('setTimeout(()=>reconcileBudget'));
});
