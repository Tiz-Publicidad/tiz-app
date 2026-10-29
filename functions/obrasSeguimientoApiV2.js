'use strict';
const C=require('./obrasSeguimientoCoreV2');
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const valueAt=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
const changed=(work,patch)=>Object.entries(patch).some(([k,v])=>k!=='referenciaGoogle2026'&&JSON.stringify(valueAt(work,k)??'')!==JSON.stringify(v??''));
async function sync(db,user,at=new Date().toISOString()){
 if(!C.canSync(user))throw fail('Tu cuenta no puede actualizar la referencia de obras.',403);
 const {google}=require('googleapis'),auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']}),sheets=google.sheets({version:'v4',auth});
 const result=await sheets.spreadsheets.values.get({spreadsheetId:'1mOhuPKcMG8PO3QsY3g84WL4p3o43t4ilK8Jx1DHjF5M',range:"'Base de datos'!A2:AL",valueRenderOption:'FORMATTED_VALUE'});
 const source=C.references({rows:result.data.values||[],firstRow:2});if(!source.length)throw fail('La referencia no devolvió obras. No se realizaron cambios.');
 const [initial,clientsSnap]=await Promise.all([db.collection('obras').get(),db.collection('clientes').get()]);
 const ids=initial.docs.map(d=>d.id),clients=clientsSnap.docs.map(d=>({...d.data(),id:d.id}));let updated=0,plan;
 // Cada bloque revalida las obras actuales. Máximo 200 obras + sus auditorías por transacción.
 for(let start=0;start<ids.length;start+=200){const target=new Set(ids.slice(start,start+200));
  const count=await db.runTransaction(async tx=>{
   const snap=await tx.get(db.collection('obras')),works=snap.docs.map(d=>({...d.data(),id:d.id}));plan=C.referencePlan(works,source,clients,at);let count=0;
   for(const u of plan.updates.filter(u=>target.has(u.id))){const work=works.find(w=>w.id===u.id);if(!changed(work,u.patch))continue;
    const ref=db.collection('obras').doc(u.id);tx.update(ref,u.patch);tx.set(ref.collection('seguimientoHistorial').doc(),{tipo:'referencia',fecha:at,usuario:user.email,estadoAnterior:C.T(work.estado),estadoNuevo:u.patch.estado||C.T(work.estado),filas:u.sourceRows});count++;
   }
   return count;
  });updated+=count;
 }
 const summary={ok:true,leidaEn:at,obrasVinculadas:plan?.linked||0,documentosActualizados:updated,sinVincular:plan?.unmatched||[],filasReferencia:source.length};
 await db.collection('integraciones').doc('obrasReferencia2026').set({...summary,actualizadoPor:user.email});return summary;
}
async function save(db,body,user,at=new Date().toISOString()){
 if(!C.canProduction(user))throw fail('Calidad o Producción deben completar este seguimiento.',403);
 const id=C.T(body.obraId);if(!/^[\w-]{1,150}$/.test(id))throw fail('Obra inválida.');
 return db.runTransaction(async tx=>{
  const snap=await tx.get(db.collection('obras')),works=snap.docs.map(d=>({...d.data(),id:d.id})),group=C.grouped(works).find(g=>g.ids.includes(id));
  if(!group)throw fail('La obra ya no está disponible.',404);
  const versions=body.versiones||{};if(Object.keys(versions).length!==group.ids.length||group.ids.some(id=>Number(versions[id])!==group.versions[id]))throw fail('Otra persona actualizó la obra. Cerrá el formulario y volvé a abrirlo.',409);
  const patches=group.members.map(o=>({id:o.id,patch:C.trackingPatch(o,body.campos||{},user,at)}));
  for(const p of patches){const ref=db.collection('obras').doc(p.id),old=works.find(w=>w.id===p.id);tx.update(ref,p.patch);tx.set(ref.collection('seguimientoHistorial').doc(),{tipo:'seguimiento',fecha:at,usuario:user.email,antes:old.obraSeguimientoV2||{},despues:p.patch.obraSeguimientoV2});}
  return {ok:true,obraId:group.id,patches};
 });
}
async function handle(db,body,user){if(body.mode==='quality-checklist-obras-sync')return sync(db,user);if(body.mode==='quality-checklist-obras-save')return save(db,body,user);throw fail('Operación de seguimiento inválida.');}
module.exports={handle,sync,save};
