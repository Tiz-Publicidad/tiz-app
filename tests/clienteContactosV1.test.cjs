'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const C=require('../clienteContactosV1');
const miniso=()=>({id:'m',nombre:'Miniso',razonSocial:'Miniso Argentina',contacto:'Ana',cel:'111',email:'ana@example.test',contactos:[{nombre:'Belén Núñez',telefono:'222',email:'belen@example.test'}]});
test('Clientes, logística y cotizaciones previas comparten contactos sin cruzar clientes',()=>{
 const db={clientes:[miniso(),{id:'f',nombre:'Farmacity'}],presupuestos:[{cliente:'Miniso Argentina',entregaLogistica:{contacto:'Belen Nunez',contactoTelefono:'viejo'}},{cliente:'Farmacity',entregaLogistica:{contacto:'No corresponde'}}],obras:[{clienteId:'m',colocacionesGestion:{contactos:{x:{nombre:'Juan',telefono:'333'}}}}]};
 const list=C.list(db,'Miniso');assert.deepEqual(list.map(c=>c.nombre),['Ana','Belén Núñez','Juan']);assert.equal(list[1].telefono,'222');assert.equal(C.list(db,'Farmacity').some(x=>x.nombre==='Belén Núñez'),false);
});
test('recordar un contacto sin teléfono no borra sus datos ni recorta la lista',()=>{
 const source=Array.from({length:40},(_,i)=>({nombre:'Contacto '+i,telefono:String(i)}));source.push({nombre:'Belén Núñez',telefono:'222',email:'belen@example.test',cargo:'Compradora'});
 const result=C.merge(source,[{nombre:'  belen nunez ',telefono:'',email:''}]);assert.equal(result.length,41);assert.equal(result[40].telefono,'222');assert.equal(result[40].email,'belen@example.test');assert.equal(result[40].cargo,'Compradora');assert.equal(source[40].nombre,'Belén Núñez');
});
test('no elige entre clientes homónimos y el identificador tiene prioridad',()=>{
 const db={clientes:[miniso(),{id:'otro',nombre:'Miniso'}]};assert.equal(C.client(db,'Miniso'),null);assert.equal(C.client(db,{clienteId:'m',cliente:'Farmacity'}).id,'m');assert.equal(C.client(db,{clienteId:'missing',cliente:'Miniso'}),null);
});
test('elegir otro contacto cambia datos autocompletados, preserva datos manuales y limpia los anteriores',()=>{
 const input={value:'Ana'},tel={value:''},mail={value:''},list=[{nombre:'Ana',telefono:'111',email:'ana@example.test'},{nombre:'Belén Núñez',telefono:'222',email:'belen@example.test'}];
 C.fill(input,tel,mail,list);assert.equal(tel.value,'111');input.value='Belen Nunez';C.fill(input,tel,mail,list);assert.equal(tel.value,'222');assert.equal(mail.value,'belen@example.test');
 tel.value='manual';input.value='Nuevo';C.fill(input,tel,mail,list);assert.equal(tel.value,'manual');assert.equal(mail.value,'');
});
const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),sector=fs.readFileSync(require.resolve('../sectorizacionV35.js'),'utf8');
function formFixture(){
 const fields=new Map(),field=id=>{if(!fields.has(id))fields.set(id,{value:'',innerHTML:''});return fields.get(id)};
 const current=miniso(),window={TIZClienteContactosV1:C,DB:{clientes:[current],presupuestos:[],obras:[]}},writes=[];
 let latest={...current,contactos:[...current.contactos,{nombre:'Agregado por otra persona',telefono:'444'}]};
 const ctx={window,document:{getElementById:field},val:id=>field(id).value,esc:v=>v,doc:(_db,col,id)=>({col,id}),db:{},runTransaction:async(_db,fn)=>fn({get:async()=>({exists:()=>true,data:()=>latest}),update:(ref,patch)=>{writes.push({ref,patch});latest={...latest,...patch}}})};
 vm.runInNewContext(html.slice(html.indexOf('window.recordarContactosClienteV1 ='),html.indexOf('// CRUD helpers')),ctx);
 vm.runInNewContext(sector.slice(sector.indexOf('  function normContacto('),sector.indexOf('  function cargarEntregaLogisticaPP('))+'\nwindow.remember=recordarContactoEntregaCliente;',ctx);
 field('pp-cliente').value='Miniso';return {window,field,current,writes,latest:()=>latest};
}
test('la sugerencia del presupuesto incluye Otros contactos y completa teléfono/correo',()=>{
 const f=formFixture();f.field('pp-entrega-contacto').value='Belen Nunez';f.window.sugerirContactoClientePP();assert.match(f.field('pp-entrega-contactos-list').innerHTML,/Belén Núñez/);assert.equal(f.field('pp-entrega-contacto-tel').value,'222');assert.equal(f.field('pp-entrega-contacto-email').value,'belen@example.test');
});
test('el guardado del presupuesto suma contactos a la ficha actual sin perder altas concurrentes ni principal',async()=>{
 const f=formFixture();await f.window.remember('Miniso',{contacto:'Beatriz',contactoTelefono:'555',retira:'Retiro',retiraEmail:'retiro@example.test'});
 assert.deepEqual(f.latest().contactos.map(c=>c.nombre),['Belén Núñez','Agregado por otra persona','Beatriz','Retiro']);assert.equal(f.latest().contacto,'Ana');assert.equal(f.current.contactos.length,4);assert.equal(f.writes[0].ref.col,'clientes');
});
test('los contactos sin cliente válido no se guardan en otra ficha',async()=>{
 const f=formFixture();await assert.rejects(f.window.recordarContactosClienteV1({cliente:'Desconocido'},[{nombre:'Belén'}]),/cliente existente/);assert.equal(f.writes.length,0);
});
