/**
 * TIZ V81 — Buscador seguro de presupuestos por cliente o trabajo.
 * Solo consulta window.DB.presupuestos: no escribe ni modifica estados.
 */
(() => {
  'use strict';
  const VERSION='V81-CLEMEN-BUSCAR-PRESUPUESTO-20260909';
  const norm=value=>String(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const numero=p=>{const m=String(p?.expedienteId||p?.ct||p?.nro||'').match(/d+/);return m?(m[0].replace(/^0+(?=d)/,'')||'0'):''};
  const revision=p=>String(p?.revision||'1.0');
  const revValue=p=>revision(p).split('.').reduce((t,x,i)=>t+(Number(x)||0)/Math.pow(100,i),0);
  const dateValue=p=>{const d=new Date(p?.actualizadoEn||p?.createdAt||p?.fecha||0);return Number.isNaN(d.getTime())?0:d.getTime()};
  const archived=p=>!!p?.archivado||norm(p?.estado)==='archivado';

  function currentBudgets(){
    const groups=new Map();
    (window.DB?.presupuestos||[]).filter(p=>!archived(p)).forEach(p=>{const key=numero(p)||String(p.id||'');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p)});
    return [...groups.values()].map(list=>[...list].sort((a,b)=>Number(b.revisionVigente===true)-Number(a.revisionVigente===true)||revValue(b)-revValue(a)||dateValue(b)-dateValue(a))[0]).sort((a,b)=>Number(numero(b))-Number(numero(a)));
  }
  function score(p,query){
    const words=norm(query).split(' ').filter(Boolean);if(!words.length)return -1;
    const client=norm(p.cliente),description=norm(p.desc||p.descripcion),number=norm(numero(p)),haystack=`${client} ${description} ${number}`;
    if(!words.every(word=>haystack.includes(word)))return -1;
    let points=0,q=norm(query);
    if(client===q)points+=100;if(client.startsWith(q))points+=55;if(description.startsWith(q))points+=45;if(number===q)points+=90;
    words.forEach(word=>{if(client.includes(word))points+=20;if(description.includes(word))points+=12;if(number.includes(word))points+=8});return points;
  }
  function results(query){return currentBudgets().map(p=>({p,score:score(p,query)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score||Number(numero(b.p))-Number(numero(a.p))).slice(0,8).map(x=>x.p)}
  function close(){const list=document.getElementById('clemen-pres-results');if(list)list.hidden=true}
  function render(query){
    const list=document.getElementById('clemen-pres-results');if(!list)return;const q=String(query||'').trim();
    if(!q){list.hidden=true;list.innerHTML='';return}const matches=results(q);
    list.innerHTML=matches.length?matches.map(p=>`
      <button type="button" class="clemen-pres-result" data-presupuesto-id="${esc(p.id)}">
        <span class="clemen-pres-ct">CT ${esc(numero(p)||'—')} <small>Rev ${esc(revision(p))}</small></span>
        <span class="clemen-pres-copy"><strong>${esc(p.cliente||'Sin cliente')}</strong><small>${esc(p.desc||p.descripcion||'Sin descripción')}</small></span>
        <span class="badge badge-${norm(p.estado)==='aprobado'?'green':norm(p.estado)==='enviado'?'blue':'gray'}">${esc(p.estado||'Sin estado')}</span>
      </button>`).join(''):'<div class="clemen-pres-empty">No encontré una cotización con ese cliente o trabajo.</div>';
    list.hidden=false;
    list.querySelectorAll('[data-presupuesto-id]').forEach(button=>button.addEventListener('mousedown',event=>{event.preventDefault();const id=button.dataset.presupuestoId;close();if(typeof window.editPres==='function')window.editPres(id)}));
  }
  function install(){
    const page=document.getElementById('page-presupuestos'),contentEl=page?.querySelector(':scope > div[style*="padding:16px"]');
    if(!page||!contentEl||document.getElementById('clemen-pres-search'))return;
    const box=document.createElement('div');box.id='clemen-pres-search';box.className='clemen-pres-search';
    box.innerHTML=`<div class="clemen-pres-icon"><i class="ti ti-sparkles"></i></div><div class="clemen-pres-field"><label for="clemen-pres-input">Buscar con Clemen</label><input id="clemen-pres-input" type="search" autocomplete="off" placeholder="Escribí un cliente o trabajo: River, Huawei, marquesina…"><div id="clemen-pres-results" class="clemen-pres-results" hidden></div></div>`;
    contentEl.insertBefore(box,contentEl.firstChild);const input=document.getElementById('clemen-pres-input');
    input.addEventListener('input',()=>render(input.value));input.addEventListener('focus',()=>render(input.value));
    input.addEventListener('keydown',event=>{if(event.key==='Escape'){close();input.blur()}if(event.key==='Enter'){const first=document.querySelector('#clemen-pres-results [data-presupuesto-id]');if(first){event.preventDefault();first.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))}}});
    input.addEventListener('blur',()=>setTimeout(close,160));console.info('[TIZ] Buscador Clemen de presupuestos cargado',VERSION);
  }
  const style=document.createElement('style');style.textContent=`
    .clemen-pres-search{position:relative;display:flex;align-items:center;gap:11px;max-width:760px;margin-bottom:14px;padding:10px 12px;background:linear-gradient(135deg,rgba(232,184,75,.10),rgba(155,127,244,.06));border:1px solid rgba(232,184,75,.25);border-radius:14px}
    .clemen-pres-icon{display:grid;place-items:center;width:34px;height:34px;flex:0 0 34px;border-radius:50%;background:var(--accent);color:#111;font-size:18px}.clemen-pres-field{position:relative;flex:1;min-width:0}
    .clemen-pres-field label{display:block;margin-bottom:3px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--accent)}.clemen-pres-field input{width:100%;padding:5px 0;background:transparent;border:0;outline:0;color:var(--text);font-size:13px}.clemen-pres-field input::placeholder{color:var(--text3)}
    .clemen-pres-results{position:absolute;top:calc(100% + 9px);left:-45px;right:0;z-index:90;max-height:360px;overflow:auto;background:var(--surface3);border:1px solid var(--border2);border-radius:11px;box-shadow:0 18px 50px rgba(0,0,0,.55)}
    .clemen-pres-result{display:grid;grid-template-columns:105px minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;padding:11px 12px;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--border);color:var(--text2)}
    .clemen-pres-result:last-child{border-bottom:0}.clemen-pres-result:hover,.clemen-pres-result:focus{background:var(--surface2);outline:0}.clemen-pres-ct{font-family:'DM Mono',monospace;color:var(--text);font-weight:600}.clemen-pres-ct small{display:block;color:var(--blue);font-size:9px}
    .clemen-pres-copy{min-width:0}.clemen-pres-copy strong,.clemen-pres-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.clemen-pres-copy strong{color:var(--text);font-size:12px}.clemen-pres-copy small{margin-top:2px;color:var(--text3);font-size:11px}.clemen-pres-empty{padding:16px;color:var(--text3);font-size:12px}
    @media(max-width:700px){.clemen-pres-result{grid-template-columns:82px minmax(0,1fr)}.clemen-pres-result .badge{display:none}.clemen-pres-results{left:0}}`;
  document.head.appendChild(style);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();