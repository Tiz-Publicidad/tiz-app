/* One economic result per OT/stage; cash follows actual payment dates. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZEstadisticaResultadosCoreV1=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const text=v=>String(v??'').trim(),norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),round=v=>Math.round((v+Number.EPSILON)*100)/100;
const TYPES=['ventas','produccion','entregas','cobranzas'];
function date(v){
 if(v?.toDate)return date(v.toDate());if(v?.seconds)return date(new Date(v.seconds*1000));
 if(v instanceof Date||/^\d{4}-\d\d-\d\dT/.test(text(v))){const d=new Date(v);if(!Number.isFinite(d.getTime()))return'';const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;}
 let s=text(v),m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m)s=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
 if(!/^\d{4}-\d\d-\d\d$/.test(s))return'';const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';
}
function week(s){const d=new Date(s+'T12:00:00Z'),day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()-day+1);const inicio=d.toISOString().slice(0,10),end=new Date(d);end.setUTCDate(end.getUTCDate()+6);const thu=new Date(d);thu.setUTCDate(thu.getUTCDate()+3);const year=thu.getUTCFullYear(),num=Math.ceil(((thu-new Date(Date.UTC(year,0,1)))/86400000+1)/7);return{key:year+'-W'+String(num).padStart(2,'0'),inicio,fin:end.toISOString().slice(0,10)};}
const empty=()=>Object.fromEntries(TYPES.map(k=>[k,{importe:0,cantidad:0,sinImporte:0,retenciones:0}]));
function build(groups=[],payments=[],year=Number(date(new Date()).slice(0,4)),today=date(new Date())){
 if(!Number.isInteger(year)||year<2000||year>2200)throw Error('Año de resultados inválido.');
 const events=[],warnings=[],seen=new Set();
 function add(type,key,rawDate,amount,data={}){
  if(seen.has(type+'|'+key))return;const fecha=date(rawDate);
  if(!fecha){warnings.push({tipo:type,ot:data.ot||'',motivo:'Falta fecha real',key});return;}
  if(fecha>today){warnings.push({tipo:type,ot:data.ot||'',motivo:'Fecha real futura',key});return;}
  seen.add(type+'|'+key);for(let i=warnings.length-1;i>=0;i--)if(warnings[i].tipo===type&&warnings[i].key===key)warnings.splice(i,1);
  const valid=typeof amount==='number'&&Number.isFinite(amount)&&amount>=0&&(!data.moneda||data.moneda==='ARS');
  events.push({...data,tipo:type,key,fecha,importe:valid?round(amount):null,retenciones:(!data.moneda||data.moneda==='ARS')&&Number.isFinite(data.retenciones)?round(data.retenciones):0});
 }
 for(const g of groups){
  if(g.estado==='Baja'||g.bajaObra?.activa)continue;
  const members=g.members||[],q=g.quote||{},value=q.importe??g.importe??members.find(w=>Number.isFinite(w.neto))?.neto,moneda=q.moneda||members[0]?.moneda||'ARS',info={ot:g.ot,cliente:g.cliente,descripcion:g.desc,moneda},key=q.id?'pres:'+q.id:g.key||g.id;
  const approved=q.fechaAprobacion||q.insumosVentasAprobados?.aprobadoEn||g.fechaAprobacion;
  add('ventas',key,approved,value,info);
  const production=g.seguimiento?.produccionReal||members.map(w=>w.obraSeguimientoV2?.produccionReal||w.fprod_r||w.gestionSectores?.produccion?.real||w.estadisticaResultadosV1?.produccion?.fecha).find(Boolean);
  if(production||g.estado==='Producida'||members.some(w=>/producid|finaliz|terminad/.test(norm(w.gestionSectores?.produccion?.estadoInterno||w.gestionSectores?.produccion?.estado))))add('produccion',key,production,value,info);
  const delivered=members.map(w=>w.estadisticaResultadosV1?.entrega).find(e=>e?.activa!==false&&e?.fecha),cancelled=members.some(w=>w.estadisticaResultadosV1?.entrega?.activa===false);
  const delivery=delivered?.fecha||members.map(w=>w.fechaEntregaReal||w.entregaReal||(w.estadoGestionV1?.estado==='Entregado'?w.estadoGestionV1.fecha:'')).find(Boolean);
  if(!cancelled&&(delivery||g.estado==='Entregado'))add('entregas',key,delivery,value,info);
 }
 for(const p of payments){if(p.anulado||p.cancelado)continue;const amount=Number(p.importe),ret=Number(p.retenciones)||0;if(!(amount>0||ret>0))continue;add('cobranzas',(p.obraId||p.ot||'')+'|'+(p.id||[date(p.fecha),amount,ret,p.referencia||'',p.medio||''].join('|')),p.fecha,amount,{ot:p.ot,cliente:p.clienteNombre||p.cliente,moneda:p.moneda||'ARS',retenciones:ret});}
 const weekly=new Map(),monthly=Array.from({length:12},(_,i)=>({key:year+'-'+String(i+1).padStart(2,'0'),...empty()})),totals=empty();
 for(let d=new Date(year+'-01-01T12:00:00Z');d.getUTCFullYear()===year;d.setUTCDate(d.getUTCDate()+1)){const w=week(d.toISOString().slice(0,10));if(!weekly.has(w.key))weekly.set(w.key,{...w,...empty()});}
 const selected=events.filter(e=>e.fecha.startsWith(year+'-'));
 for(const e of selected)for(const target of [totals,weekly.get(week(e.fecha).key),monthly[Number(e.fecha.slice(5,7))-1]]){const v=target[e.tipo];v.cantidad++;if(e.importe===null)v.sinImporte++;else v.importe=round(v.importe+e.importe);v.retenciones=round(v.retenciones+(e.retenciones||0));}
 return{year,totals,weekly:[...weekly.values()],monthly,events:selected.sort((a,b)=>b.fecha.localeCompare(a.fecha)||a.ot?.localeCompare(b.ot||'')||0),warnings};
}
// Legacy due dates are never used as payment dates in results.
function paymentDates(payments,db={}){return payments.map(p=>{
 const legacy=(db.cobranzas||[]).find(c=>c.id&&c.id===p.id),work=(db.obras||[]).find(w=>w.id===p.obraId);
 if(legacy&&!work?.cobros?.some(c=>c.id&&c.id===p.id))return{...p,fecha:date(legacy.fechaCobro)};
 return p;
});}
return{date,week,build,paymentDates,TYPES};
});
