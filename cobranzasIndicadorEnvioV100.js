// TIZ V100 - Sincroniza el indicador visual con el estado manual "Factura enviada".
(function(){
'use strict';
function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function syncRow(row){
  if(!row)return;
  const estado=row.querySelector('select.tiz-v98-estado, select.quick-estado');
  if(!estado||norm(estado.value)!=='factura enviada')return;
  const pdfCell=[...row.cells].find(td=>/en drive/i.test(td.textContent||''));
  if(!pdfCell)return;
  const action=row.cells[row.cells.length-1];
  const dot=action?.querySelector('span[title]');
  if(!dot)return;
  dot.style.background='#22a06b';
  dot.title='PDF en Drive y factura enviada';
}
function syncAll(){
  document.querySelectorAll('#cobr-modulo-v48 tbody tr').forEach(syncRow);
}
const priorRender=window.renderCobranzas;
if(typeof priorRender==='function')window.renderCobranzas=function(){
  const r=priorRender.apply(this,arguments);
  queueMicrotask(syncAll);
  return r;
};
const priorSet=window.setCobTab;
if(typeof priorSet==='function')window.setCobTab=function(){
  const r=priorSet.apply(this,arguments);
  queueMicrotask(syncAll);
  return r;
};
document.addEventListener('change',e=>{
  if(e.target?.matches?.('select.tiz-v98-estado, select.quick-estado'))queueMicrotask(()=>syncRow(e.target.closest('tr')));
});
window.addEventListener('load',syncAll,{once:true});
syncAll();
})();
