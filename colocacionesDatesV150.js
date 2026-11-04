/* Explicit day/month/year editors; stored form values stay ISO. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TIZColocacionesDatesV150=api;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 function parse(value){const m=String(value||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!m||Number(m[3])<1)return '';const iso=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'),d=new Date(iso+'T12:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===iso?iso:'';}
 function display(iso){return /^\d{4}-\d{2}-\d{2}$/.test(iso||'')?iso.split('-').reverse().join('/'):'';}
 function validate(value,min='',max=''){if(!String(value||'').trim())return {iso:'',error:''};const iso=parse(value);return {iso,error:!iso?'Usá una fecha válida con formato DD/MM/AAAA.':min&&iso<min?'La fecha debe ser '+display(min)+' o posterior.':max&&iso>max?'La fecha debe ser '+display(max)+' o anterior.':''};}
 return {parse,display,validate};
});
(()=>{
 if(typeof document==='undefined'||typeof MutationObserver==='undefined')return;
 const C=window.TIZColocacionesDatesV150,pairs=new WeakMap(),originals=new WeakMap();
 const nativeValue=typeof HTMLInputElement==='undefined'?null:Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
 function prepare(scope){for(const original of scope.querySelectorAll('input[type=date]:not([data-tiz-calendar])')){
   const visible=original.cloneNode(true),min=original.min,max=original.max;visible.type='text';visible.removeAttribute('name');visible.removeAttribute('id');visible.removeAttribute('min');visible.removeAttribute('max');visible.setAttribute('inputmode','numeric');visible.setAttribute('placeholder','DD/MM/AAAA');visible.setAttribute('data-tiz-dmy','1');visible.setAttribute('maxlength','10');visible.defaultValue=C.display(original.value);visible.value=visible.defaultValue;
   const picker=document.createElement('input'),button=document.createElement('button');picker.type='date';picker.setAttribute('data-tiz-calendar','1');picker.setAttribute('aria-hidden','true');picker.tabIndex=-1;picker.style.cssText='position:absolute;opacity:0;width:1px;height:1px;pointer-events:none';picker.min=min;picker.max=max;picker.value=original.value;picker.disabled=original.disabled;button.type='button';button.className='btn btn-ghost';button.textContent='📅';button.setAttribute('aria-label','Abrir calendario');button.style.cssText='min-height:44px;min-width:44px;margin:4px';button.disabled=original.disabled||original.readOnly;
   visible.removeAttribute('oninput');visible.removeAttribute('onchange');visible.removeAttribute('onclick');
   if(original.id){visible.id=original.id+'-dmy';for(const label of original.labels||[])if(label.htmlFor===original.id)label.htmlFor=visible.id;}
   const editor=document.createElement('span');editor.className='tiz-date-editor';editor.style.cssText='display:flex;align-items:center;gap:4px;min-width:0;width:100%;position:relative';visible.style.cssText+=';flex:1;min-width:0;width:0;margin:0';button.style.cssText='flex:none;min-height:36px;min-width:36px;padding:4px;margin:0';editor.append(visible,button,picker);
   original.type='hidden';original.after(editor);const pair={original,visible,picker,button,resetValue:original.value};pairs.set(visible,pair);originals.set(original,pair);
   // Existing modules keep reading/writing ISO through the original input.
   if(nativeValue)Object.defineProperty(original,'value',{configurable:true,get(){return nativeValue.get.call(this);},set(value){picker.value=value;nativeValue.set.call(this,picker.value);visible.value=C.display(nativeValue.get.call(this));reflect(pair);}});
   reflect(pair);
   const open=()=>{if(original.disabled||visible.readOnly)return;picker.value=C.parse(visible.value)||original.value||'';try{if(picker.showPicker)picker.showPicker();else picker.click();}catch(_){picker.click();}};button.addEventListener('click',open);picker.addEventListener('change',()=>{visible.value=C.display(picker.value);commit(visible,'change');});
 }}
 function reflect(p){const o=p.original;p.visible.disabled=o.disabled;p.visible.readOnly=o.readOnly;p.visible.required=o.required;p.picker.disabled=o.disabled||o.readOnly;p.picker.min=o.min;p.picker.max=o.max;p.button.disabled=o.disabled||o.readOnly;const v=C.validate(p.visible.value,o.min,o.max);p.visible.setCustomValidity(v.error);}
 function commit(visible,type){const p=pairs.get(visible);if(!p||p.original.disabled||p.original.readOnly)return;const v=C.validate(visible.value,p.original.min,p.original.max);visible.setCustomValidity(v.error);if(nativeValue)nativeValue.set.call(p.original,v.error?'':v.iso);else p.original.value=v.error?'':v.iso;p.picker.value=p.original.value;p.original.dispatchEvent(new Event(type,{bubbles:true}));}
 function sync(e){if(!pairs.has(e.target))return;commit(e.target,e.type);e.stopPropagation();}
 document.addEventListener('input',sync,true);document.addEventListener('change',sync,true);document.addEventListener('focusout',e=>{const p=pairs.get(e.target);if(p&&C.parse(e.target.value))e.target.value=C.display(C.parse(e.target.value));},true);
 document.addEventListener('reset',e=>{setTimeout(()=>{if(e.defaultPrevented)return;for(const o of e.target.querySelectorAll('input')){const p=originals.get(o);if(p){o.value=p.resetValue;p.visible.value=C.display(o.value);p.picker.value=o.value;reflect(p);}}},0);});
 const observer=new MutationObserver(records=>{for(const record of records){const p=originals.get(record.target);if(p)reflect(p);}if(records.some(r=>r.type==='childList'))prepare(document);});observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','readonly','required','min','max']});prepare(document);
})();

