// TIZ V67 — Facturación ARCA producción general · PV 00009
(function(){
  "use strict";
  const ENDPOINT="https://us-central1-tiz---app.cloudfunctions.net/arcaProduccionEmitirGeneral";
  const $=id=>document.getElementById(id);
  const num=v=>Number(v)||0;
  const norm=v=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const money=v=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:2}).format(num(v));
  const otBase=v=>String(v??"").match(/\d{4,7}/)?.[0].replace(/^0+/,"")||"";

  function clienteDe(obra){
    const clientes=window.DB?.clientes||[];
    return clientes.find(c=>c.id===obra.clienteId) || clientes.find(c=>norm(c.nombre)===norm(obra.cliente)) || {};
  }
  function itemsDe(obra){
    return (Array.isArray(obra.itemsCotizados)?obra.itemsCotizados:[]).map(i=>({descripcion:String(i.descripcion||i.desc||"").trim(),cantidad:num(i.cantidad||i.cant||i.unidades||1)||1,unitario:num(i.unitario??i.precio??i.precioUnitario)})).filter(i=>i.descripcion);
  }
  function totalAprobado(obra){return num(obra.finanzas?.total||obra.neto||obra.importe||obra.infoPresupuesto?.importe);}
  function netoFacturado(obra){
    const list=Array.isArray(obra.facturasArca)?obra.facturasArca:[];
    const extra=obra.facturaArca?.cae&&!list.some(x=>x.cae===obra.facturaArca.cae)?[obra.facturaArca]:[];
    return [...list,...extra].reduce((a,f)=>a+num(f.neto),0);
  }
  function sugerirTipo(cond){return String(cond)==="1"?1:6;}

  window.abrirFacturacionProduccionV67=function(id){
    if(!window.currentUser?.isAdmin)return window.showToast?.("Sólo administración puede facturar");
    const obra=(window.DB?.obras||[]).find(o=>o.id===id);if(!obra)return window.showToast?.("No se encontró la OT");
    const cli=clienteDe(obra),cuit=String(obra.clienteCuit||obra.cuit||cli.cuit||"").replace(/\D/g,"");
    const aprobado=totalAprobado(obra),previo=netoFacturado(obra),saldo=Math.max(0,aprobado-previo),items=itemsDe(obra);
    if(!aprobado)return alert("La OT no tiene importe aprobado. Corregí la cotización antes de facturar.");
    const cond=String(cli.condicionIvaId||cli.condicionIVAReceptorId||obra.condicionIVAReceptorId||"1"),tipo=sugerirTipo(cond);
    document.getElementById("modal-fact-general-v63")?.remove();document.getElementById("modal-fc-prod-v67")?.remove();
    const root=document.createElement("div");root.id="modal-fc-prod-v67";root.className="modal-overlay open";
    root.innerHTML=`<div class="modal" style="max-width:760px"><div class="modal-title">Facturar · OT ${esc(otBase(obra.ot))} · ${esc(obra.cliente||"")}</div><div style="padding:11px;border:1px solid rgba(232,184,75,.55);background:rgba(232,184,75,.08);border-radius:8px;margin-bottom:14px;font-size:12px"><b>PRODUCCIÓN · COMPROBANTE FISCAL REAL · PV 00009.</b> Al confirmar se solicitará CAE a ARCA.</div><div class="form-grid"><div class="form-group"><label>CUIT receptor</label><input id="fc67-cuit" value="${esc(cuit)}"></div><div class="form-group"><label>Condición frente al IVA</label><select id="fc67-cond"><option value="1" ${cond==="1"?"selected":""}>IVA Responsable Inscripto</option><option value="4" ${cond==="4"?"selected":""}>IVA Exento</option><option value="5" ${cond==="5"?"selected":""}>Consumidor Final</option><option value="6" ${cond==="6"?"selected":""}>Responsable Monotributo</option></select></div><div class="form-group"><label>Comprobante</label><select id="fc67-tipo"><option value="1" ${tipo===1?"selected":""}>Factura A</option><option value="6" ${tipo===6?"selected":""}>Factura B</option><option value="201">Factura de Crédito Electrónica A</option><option value="206">Factura de Crédito Electrónica B</option></select></div><div class="form-group"><label>IVA</label><select id="fc67-iva"><option value="21" selected>21%</option><option value="10.5">10,5%</option><option value="27">27%</option><option value="5">5%</option><option value="2.5">2,5%</option><option value="0">0%</option><option value="exento">Exento</option></select></div><div class="form-group"><label>Porcentaje a facturar</label><input id="fc67-pct" type="number" min="0.01" max="100" step="0.01" value="${saldo&&aprobado?Math.round(saldo/aprobado*10000)/100:100}"></div><div class="form-group"><label>Importe neto</label><input id="fc67-neto" type="number" min="0.01" step="0.01" value="${saldo.toFixed(2)}"></div></div><div style="font-size:11px;color:var(--text3);margin:8px 0">Aprobado: ${money(aprobado)} · Ya facturado: ${money(previo)} · Saldo: ${money(saldo)} · ${items.length} ítem(s) cotizado(s)</div><label style="display:flex;gap:9px;align-items:flex-start;font-size:12px;margin-top:15px"><input id="fc67-check" type="checkbox" style="margin-top:2px">Revisé CUIT, condición fiscal, comprobante, IVA, porcentaje e importe y confirmo que deseo emitir un comprobante fiscal real.</label><div class="modal-actions"><button class="btn btn-ghost" id="fc67-cancel">Cancelar</button><button class="btn btn-primary" id="fc67-emit" disabled>EMITIR FACTURA REAL · PV 00009</button></div></div>`;
    document.body.appendChild(root);
    const pct=$("fc67-pct"),net=$("fc67-neto");pct.oninput=()=>{net.value=(aprobado*num(pct.value)/100).toFixed(2)};net.oninput=()=>{pct.value=aprobado?Math.round(num(net.value)/aprobado*10000)/100:0};$("fc67-check").onchange=()=>{$("fc67-emit").disabled=!$("fc67-check").checked};$("fc67-cancel").onclick=()=>root.remove();$("fc67-emit").onclick=()=>emitir(obra,items,root,$("fc67-emit"));
  };

  async function emitir(obra,items,root,button){
    const cuit=String($("fc67-cuit").value||"").replace(/\D/g,""),cbteTipo=Number($("fc67-tipo").value),condicionIVAReceptorId=Number($("fc67-cond").value),ivaRaw=$("fc67-iva").value,tratamientoIva=ivaRaw==="exento"?"exento":"gravado",alicuota=ivaRaw==="exento"?0:Number(ivaRaw),neto=num($("fc67-neto").value);
    if(!/^\d{11}$/.test(cuit))return alert("Revisá el CUIT receptor.");if(!(neto>0))return alert("Revisá el importe neto.");
    if(!confirm(`ÚLTIMA CONFIRMACIÓN\n\nSe emitirá un comprobante fiscal REAL por PV 00009.\nOT: ${otBase(obra.ot)}\nCliente: ${obra.cliente||""}\nNeto: ${money(neto)}\n\n¿Confirmás la emisión?`))return;
    const original=button.textContent;button.disabled=true;button.textContent="Solicitando CAE a ARCA…";
    try{
      const [{getApp},{getAuth}]=await Promise.all([import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js")]);const user=getAuth(getApp()).currentUser;if(!user)throw new Error("Sesión no iniciada");const token=await user.getIdToken();
      const idempotencyKey=`ot${otBase(obra.ot)}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const response=await fetch(ENDPOINT,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({obraId:obra.id,confirmacion:"EMITIR FACTURA REAL",idempotencyKey,docNro:cuit,cbteTipo,condicionIVAReceptorId,tratamientoIva,alicuota,neto,items})});const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw new Error(data.error||"ARCA no autorizó la factura");
      obra.facturaArca=data;obra.facturasArca=[...(obra.facturasArca||[]),data];obra.nrfc=data.numeroCompleto;obra.ffc=data.fecha;obra.facturado=!!data.completo;root.remove();window.renderCobranzas?.();alert(`FACTURA AUTORIZADA POR ARCA\n\n${data.tipo} ${data.numeroCompleto}\nCAE: ${data.cae}\nTotal: ${money(data.total)}\nSaldo neto pendiente: ${money(data.saldoNeto)}`);window.showToast?.("Factura real emitida · PV 00009 ✓");
    }catch(e){console.error(e);alert("No se pudo completar la emisión.\n\n"+(e.message||e)+"\n\nSi el mensaje indica que quedó en proceso, no vuelvas a emitir hasta verificar ARCA.");button.disabled=false;button.textContent=original;}
  }

  // El script de Cobranzas puede redefinir V63 después de que V67 cargó. Mantener
  // el alias de producción activo evita que reaparezca la pantalla de homologación.
  function instalar(){
    if(window.abrirFacturacionGeneralV63!==window.abrirFacturacionProduccionV67){window.abrirFacturacionGeneralV63=window.abrirFacturacionProduccionV67;}
    return true;
  }
  instalar();
  let intentos=0;const t=setInterval(()=>{instalar();if(++intentos>=120)clearInterval(t)},250);
  window.addEventListener("load",()=>{instalar();setTimeout(instalar,0);setTimeout(instalar,500);setTimeout(instalar,1500)});
})();