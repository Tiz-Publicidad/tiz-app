// TIZ V68 — puente entre facturación ARCA y cartera por cobrar
(function(){
  'use strict';
  const num=v=>Number(v)||0;
  function totalAprobado(o){return num(o?.finanzas?.total||o?.neto||o?.importe||o?.infoPresupuesto?.importe)}
  function facturas(o){
    const list=Array.isArray(o?.facturasArca)?[...o.facturasArca]:[];
    if(o?.facturaArca?.cae&&!list.some(f=>f?.cae===o.facturaArca.cae))list.push(o.facturaArca);
    return list.filter(f=>f?.cae);
  }
  function syncObra(o){
    const fs=facturas(o);if(!fs.length)return false;
    const total=totalAprobado(o)||fs.reduce((a,f)=>a+num(f.neto),0);if(!total)return false;
    const fin={...(o.finanzas||{}),total};
    fin.anticipo={facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0,...(fin.anticipo||{})};
    fin.saldo={facturado:false,nroFactura:'',fechaFactura:'',porcentaje:0,monto:0,fechaPrevistaCobro:'',fechaCobro:'',montoCobrado:0,...(fin.saldo||{})};
    const ultimo=fs[fs.length-1];
    const facturado=fs.reduce((a,f)=>a+num(f.neto),0);
    const completo=facturado>=total-0.01 || o.facturado===true;
    if(!fin.anticipo.facturado&&!fin.saldo.facturado&&!fin.anticipo.nroFactura&&!fin.saldo.nroFactura){
      const dest=(!completo&&fs.length===1)?fin.anticipo:fin.saldo;
      dest.facturado=true;dest.nroFactura=ultimo.numeroCompleto||o.nrfc||'';dest.fechaFactura=ultimo.fecha||o.ffc||'';dest.monto=num(ultimo.neto)||facturado;dest.porcentaje=total?Math.round(dest.monto/total*10000)/100:100;
    }
    o.finanzas=fin;
    if(!o.nrfc)o.nrfc=ultimo.numeroCompleto||'';
    if(!o.ffc)o.ffc=ultimo.fecha||'';
    return true;
  }
  function syncTodas(){(window.DB?.obras||[]).forEach(syncObra)}
  function instalar(){
    syncTodas();
    if(typeof window.renderCobranzas==='function'&&!window.renderCobranzas._arcaBridgeV68){
      const old=window.renderCobranzas;
      const wrapped=function(){syncTodas();return old.apply(this,arguments)};
      wrapped._arcaBridgeV68=true;window.renderCobranzas=wrapped;
    }
  }
  instalar();
  window.addEventListener('load',()=>{instalar();setTimeout(instalar,300);setTimeout(instalar,1200);setTimeout(()=>window.renderCobranzas?.(),1500)});
  let n=0;const t=setInterval(()=>{instalar();if(++n>80)clearInterval(t)},250);
})();