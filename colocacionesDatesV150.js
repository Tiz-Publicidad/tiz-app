/* Explicit day/month/year editors; stored form values stay ISO. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZColocacionesDatesV150=api;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 function parse(value){const m=String(value||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!m)return '';const iso=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'),d=new Date(iso+'T12:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===iso?iso:'';}
 function display(iso){return /^\d{4}-\d{2}-\d{2}$/.test(iso||'')?iso.split('-').reverse().join('/'):'';}
 function validate(value,min='',max=''){if(!String(value||'').trim())return {iso:'',error:''};const iso=parse(value);return {iso,error:!iso?'Usá una fecha válida con formato DD/MM/AAAA.':min&&iso<min?'La fecha debe ser '+display(min)+' o posterior.':max&&iso>max?'La fecha debe ser '+display(max)+' o anterior.':''};}
 return {parse,display,validate};
});
(()=>{
 if(typeof document==='undefined'||typeof MutationObserver==='undefined')return;
 const C=window.TIZColocacionesDatesV150,pairs=new WeakMap();
 function prepare(scope){for(const original of scope.querySelectorAll('input[type=date]:not([data-tiz-calendar])')){if(!original.closest('.c128'))continue;
   const visible=original.cloneNode(true),min=original.min,max=original.max;visible.type='text';visible.removeAttribute('name');visible.removeAttribute('id');visible.removeAttribute('min');visible.removeAttribute('max');visible.setAttribute('inputmode','numeric');visible.setAttribute('placeholder','DD/MM/AAAA');visible.setAttribute('data-tiz-dmy','1');visible.setAttribute('maxlength','10');visible.defaultValue=C.display(original.value);visible.value=visible.defaultValue;
   const picker=document.createElement('input'),button=document.createElement('button');picker.type='date';picker.setAttribute('data-tiz-calendar','1');picker.setAttribute('aria-hidden','true');picker.tabIndex=-1;picker.style.cssText='position:absolute;opacity:0;width:1px;height:1px;pointer-events:none';picker.min=min;picker.max=max;picker.value=original.value;picker.disabled=original.disabled;button.type='button';button.className='btn btn-ghost';button.textContent='📅';button.setAttribute('aria-label','Abrir calendario');button.style.cssText='min-height:44px;min-width:44px;margin:4px';button.disabled=original.disabled||original.readOnly;
   original.type='hidden';original.required=false;original.after(visible,button,picker);const pair={original,min,max,picker};pairs.set(visible,pair);
   const open=()=>{if(original.disabled||visible.readOnly)return;picker.value=C.parse(visible.value)||original.value||'';try{if(picker.showPicker)picker.showPicker();else picker.click();}catch(_){picker.click();}};button.addEventListener('click',open);visible.addEventListener('click',open);picker.addEventListener('change',()=>{visible.value=C.display(picker.value);commit(visible,'change');});
 }}
 function commit(visible,type){const p=pairs.get(visible);if(!p)return;const v=C.validate(visible.value,p.min,p.max);visible.setCustomValidity(v.error);p.original.value=v.error?'':v.iso;p.picker.value=p.original.value;p.original.dispatchEvent(new Event(type,{bubbles:true}));}
 function sync(e){if(!pairs.has(e.target))return;commit(e.target,e.type);e.stopPropagation();}
 document.addEventListener('input',sync,true);document.addEventListener('change',sync,true);document.addEventListener('focusout',e=>{const p=pairs.get(e.target);if(p&&C.parse(e.target.value))e.target.value=C.display(C.parse(e.target.value));},true);
 const observer=new MutationObserver(()=>prepare(document));observer.observe(document.documentElement,{childList:true,subtree:true});prepare(document);
})();
