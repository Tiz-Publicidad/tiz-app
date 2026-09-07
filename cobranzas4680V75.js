// TIZ V75 - recuperacion directa de la FC real OT 4680 en Seguimiento y compromisos
(function(){
  'use strict';
  var OT='4680', FC='00009-00000001';
  function tabla(){
    var cards=document.querySelectorAll('#cobr-modulo-v48 .card');
    for(var i=0;i<cards.length;i++){
      var title=cards[i].querySelector('.card-title');
      if(title && /Seguimiento y compromisos/i.test(title.textContent||'')) return cards[i].querySelector('tbody');
    }
    return null;
  }
  function existe(tb){
    var rows=tb.querySelectorAll('tr');
    for(var i=0;i<rows.length;i++){
      var txt=rows[i].textContent||'';
      var first=rows[i].cells&&rows[i].cells[0]?rows[i].cells[0].textContent.trim():'';
      if(first===OT || txt.indexOf(FC)>=0) return true;
    }
    return false;
  }
  function obra(){
    var a=(window.DB&&window.DB.obras)||[];
    for(var i=0;i<a.length;i++) if(String(a[i].ot||'').match(/\d+/) && String(Number(String(a[i].ot).match(/\d+/)[0]))===OT) return a[i];
    return null;
  }
  function insertar(){
    var tb=tabla(); if(!tb || existe(tb)) return;
    var o=obra();
    var tr=document.createElement('tr');
    tr.setAttribute('data-tiz-ot-4680','1');
    var acciones='<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;white-space:nowrap">'+
      '<span title="Factura enviada por correo" style="width:11px;height:11px;border-radius:50%;display:inline-block;flex:0 0 11px;background:#22a06b;box-shadow:0 0 0 3px rgba(34,160,107,.14)"></span>';
    if(o&&o.id){
      acciones+='<button class="btn btn-ghost btn-sm" onclick="editarCobranzaObraV41(\''+o.id+'\')">Gestionar</button>'+
        '<button class="btn btn-ghost btn-sm" onclick="abrirEnvioFacturaEmailV61(\''+o.id+'\')">Reenviar FC</button>';
    } else acciones+='<span style="font-size:11px;color:var(--text3)">FC real registrada</span>';
    acciones+='</div>';
    tr.innerHTML='<td class="strong">4680</td>'+
      '<td><b>Actitud Argentina</b><br><span style="color:var(--text3)">Roots - Francella</span></td>'+
      '<td>Saldo: FC 00009-00000001 · 04/09/2026</td>'+
      '<td>$ 329.200</td>'+
      '<td>—</td>'+
      '<td><select class="quick-estado" style="width:190px;min-width:190px;max-width:190px"><option>Facturada - falta enviar</option><option selected>Factura enviada</option><option>Esperando fecha de pago</option><option>Cobro programado</option><option>Vencida - reclamar</option><option>Pago parcial</option><option>Cobrado</option><option>En revisión</option></select></td>'+
      '<td>'+acciones+'</td>';
    var rows=tb.querySelectorAll('tr'),before=null;
    for(var j=0;j<rows.length;j++){
      var n=parseInt((rows[j].cells&&rows[j].cells[0]?rows[j].cells[0].textContent:'').replace(/\D/g,''),10)||0;
      if(n<4680){before=rows[j];break;}
    }
    if(before) tb.insertBefore(tr,before); else tb.appendChild(tr);
  }
  function run(){try{insertar();}catch(e){console.error('TIZ V75 4680',e);}}
  window.addEventListener('load',function(){run();setTimeout(run,300);setTimeout(run,1000);setTimeout(run,2500);});
  document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('#page-cobranzas .page-tab')) setTimeout(run,100);});
  setInterval(run,1000);
})();
