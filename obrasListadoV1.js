(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TIZObrasListadoV1=factory();})(typeof window==='object'?window:globalThis,()=>{
'use strict';
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const base=v=>{const m=String(v??'').match(/\d+/);return m?m[0].replace(/^0+(?=\d)/,'').slice(0,4):'';};
const key=w=>base(w.ot)?'ot:'+base(w.ot):'id:'+String(w.obraOperativaId||w.id||w.obraId||'');
function millis(v){if(!v)return 0;if(typeof v.toMillis==='function')return v.toMillis();const sec=v.seconds??v._seconds;if(Number.isFinite(sec))return sec*1000;const n=typeof v==='number'?v:Date.parse(v);return Number.isFinite(n)?n:0;}
function approval(w,source=[]){const own=millis(w.analisisPreliminarAprobadoEn||w.aprobacion);if(own)return own;const s=source.find(x=>key(x)===key(w));return s?.inicioTipo==='aprobacion'?millis(s.aprobadoEn):w.inicioTipo==='aprobacion'?millis(w.aprobadoEn):0;}
function sorted(works,source=[]){return [...works].sort((a,b)=>approval(b,source)-approval(a,source)||Number(base(b.ot))-Number(base(a.ot))||String(a.id||a.obraId||'').localeCompare(String(b.id||b.obraId||'')));}
function production(works=[],source=[]){
 const cancelled=w=>w.bajaObra?.activa===true||norm(w.estado)==='baja',cancelledKeys=new Set(works.filter(cancelled).map(key));
 const active=w=>!cancelled(w)&&!w.archivado&&w.revisionVigente!==false&&w.revisionOperativa!==false,groups=new Map();
 for(const w of sorted(works.filter(w=>active(w)&&['aprobado','en produccion','pendiente','cobrado pendiente'].includes(norm(w.estado))),source))if(!groups.has(key(w)))groups.set(key(w),{...w,ot:base(w.ot)||w.ot});
 for(const s of source){if(cancelled(s)||cancelledKeys.has(key(s)))continue;const actual=works.find(w=>active(w)&&w.id===(s.obraOperativaId||s.id)),old=actual||groups.get(key(s)),w=old?{...old,ot:base(s.ot)||base(old.ot),cliente:s.cliente||old.cliente,desc:s.descripcion||old.desc||old.descripcion,driveFolderUrl:s.driveFolderUrl||old.driveFolderUrl}:{id:s.id,ot:base(s.ot),cliente:s.cliente,desc:s.descripcion,estado:'Pendiente',driveFolderUrl:s.driveFolderUrl,_p8SourceOnly:true};groups.set(key(s),w);}
 return sorted([...groups.values()],source);
}
return {base,key,millis,approval,sorted,production};
});
