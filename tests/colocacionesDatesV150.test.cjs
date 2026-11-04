const test=require('node:test'),assert=require('node:assert/strict'),D=require('../colocacionesDatesV150');
test('day/month/year values preserve their ISO dates without swapping day and month',()=>{assert.equal(D.parse('01/10/2026'),'2026-10-01');assert.equal(D.parse('13/10/2026'),'2026-10-13');assert.equal(D.display('2026-10-13'),'13/10/2026');assert.equal(D.parse('31/02/2026'),'');assert.equal(D.parse('29/02/2028'),'2028-02-29');assert.equal(D.parse('2026-10-13'),'');});
test('optional empty dates and calendar limits remain enforced',()=>{assert.deepEqual(D.validate(''),{iso:'',error:''});assert.equal(D.validate('12/10/2026','2026-10-13').error,'La fecha debe ser 13/10/2026 o posterior.');assert.equal(D.validate('13/10/2026','2026-10-13').error,'');assert.ok(D.validate('14/10/2026','','2026-10-13').error);assert.ok(D.validate('99/10/2026').error);});
test('calendar selection updates the day/month/year display and submits ISO without depending on browser locale',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),events={},sent=[];let visible,button,picker;
 const node=()=>({type:'',value:'',attrs:{},style:{},listeners:{},append(...children){this.children=children},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},addEventListener(k,fn){this.listeners[k]=fn},setCustomValidity(e){this.error=e},showPicker(){this.opened=true},click(){this.clicked=true}});
 const original={type:'date',value:'2026-10-13',name:'fecha',min:'2026-10-12',max:'',required:true,closest:()=>null,cloneNode:()=>({...node(),attrs:{name:'fecha'}}),after:editor=>{[visible,button,picker]=editor.children},dispatchEvent:e=>sent.push({type:e.type,value:original.value})};
 const doc={documentElement:{},createElement:node,querySelectorAll:()=>original.type==='date'?[original]:[],addEventListener:(name,fn)=>events[name]=fn};
 vm.runInNewContext(fs.readFileSync(require.resolve('../colocacionesDatesV150'),'utf8'),{window:{},document:doc,MutationObserver:class{observe(){}},Event:class{constructor(type){this.type=type}},WeakMap,Date});
 assert.equal(original.type,'hidden');assert.equal(original.name,'fecha');assert.equal(visible.value,'13/10/2026');assert.equal(visible.defaultValue,visible.value);assert.equal(visible.attrs.name,undefined);button.listeners.click();assert.equal(picker.opened,true);picker.value='2026-10-14';picker.listeners.change();assert.equal(visible.value,'14/10/2026');assert.equal(original.value,'2026-10-14');assert.deepEqual(sent.at(-1),{type:'change',value:'2026-10-14'});visible.value='31/02/2026';events.input({type:'input',target:visible,stopPropagation(){}});assert.equal(original.value,'');assert.ok(visible.error);original.disabled=true;picker.opened=false;button.listeners.click();assert.equal(picker.opened,false);
});

test('Obras y los demás módulos mantienen valores ISO, permisos y campos creados después de abrir la pantalla',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),events={},sent=[],inputs=[];let observer;
 class Input{
  constructor(){Object.assign(this,{type:'date',attrs:{},style:{cssText:''},listeners:{},min:'',max:'',required:false,disabled:false,readOnly:false});this._value='';}
  get value(){return this._value;}set value(v){this._value=String(v);}
  setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}
  addEventListener(k,f){this.listeners[k]=f;}setCustomValidity(error){this.error=error;}
  cloneNode(){const n=new Input();Object.assign(n,{value:this.value,required:this.required,disabled:this.disabled,readOnly:this.readOnly});return n;}
  append(...children){this.children=children;}after(editor){this.editor=editor;}
  showPicker(){this.opened=true;}
  dispatchEvent(e){sent.push({name:this.name,type:e.type,value:this.value});}
 }
 const make=(name,value)=>{const n=new Input();n.name=name;n.value=value;inputs.push(n);return n;};
 const production=make('produccionPrevista','2026-10-29');production.required=true;
 const doc={documentElement:{},createElement:()=>new Input(),querySelectorAll:()=>inputs.filter(n=>n.type==='date'),addEventListener:(name,fn)=>events[name]=fn};
 vm.runInNewContext(fs.readFileSync(require.resolve('../colocacionesDatesV150'),'utf8'),{window:{},document:doc,HTMLInputElement:Input,MutationObserver:class{constructor(callback){observer=callback;}observe(){}},Event:class{constructor(type){this.type=type;}},WeakMap,Date});
 const [edit,calendar,picker]=production.editor.children;
 assert.equal(edit.value,'29/10/2026');assert.equal(edit.required,true);
 edit.value='04/11/2026';events.change({target:edit,type:'change',stopPropagation(){}});
 assert.equal(production.value,'2026-11-04');assert.equal(edit.value,'04/11/2026');
 assert.deepEqual(sent.at(-1),{name:'produccionPrevista',type:'change',value:'2026-11-04'});
 production.value='2026-12-03';assert.equal(edit.value,'03/12/2026');assert.equal(picker.value,'2026-12-03');
 edit.value='11/30/2026';events.input({target:edit,type:'input',stopPropagation(){}});
 assert.ok(edit.error);assert.equal(edit.value,'11/30/2026');assert.equal(production.value,'');
 production.value='2026-11-04';production.min='2026-11-05';observer([{target:production,type:'attributes',attributeName:'min'}]);assert.ok(edit.error);
 production.min='';production.disabled=true;observer([{target:production,type:'attributes',attributeName:'disabled'}]);
 assert.equal(edit.disabled,true);assert.equal(calendar.disabled,true);assert.equal(picker.disabled,true);
 calendar.listeners.click();assert.equal(picker.opened,undefined);
 production.disabled=false;production.readOnly=true;observer([{target:production,type:'attributes',attributeName:'readonly'}]);assert.equal(edit.readOnly,true);assert.equal(calendar.disabled,true);
 const actual=make('produccionReal','2026-10-30');observer([{type:'childList'}]);
 assert.equal(actual.editor.children[0].value,'30/10/2026');
 actual.editor.children[0].value='29/10/2026';events.change({target:actual.editor.children[0],type:'change',stopPropagation(){}});
 assert.equal(actual.value,'2026-10-29');
 const count=inputs.length;observer([{type:'childList'}]);assert.equal(inputs.length,count);
});

