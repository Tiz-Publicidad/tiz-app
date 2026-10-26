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

test('desplegable muestra todos los contactos aunque ya esté escrito otro nombre',()=>{
 const f=formFixture();f.field('pp-entrega-contacto').value='Ana';f.window.sugerirContactoClientePP();
 assert.match(f.field('pp-entrega-contacto-select').innerHTML,/Ana/);
 assert.match(f.field('pp-entrega-contacto-select').innerHTML,/Belén Núñez/);
 f.field('pp-entrega-contacto-select').value='contacto:belen nunez';f.window.elegirContactoClientePP('contacto');
 assert.equal(f.field('pp-entrega-contacto').value,'Belén Núñez');assert.equal(f.field('pp-entrega-contacto-tel').value,'222');assert.equal(f.field('pp-entrega-contacto-email').value,'belen@example.test');
});

test('selección explícita reemplaza los datos del contacto anterior y nuevo contacto limpia los campos',()=>{
 const f=formFixture();f.current.contactos[0].cargo='Compradora';f.field('pp-entrega-contacto-tel').value='otro';
 f.field('pp-entrega-contacto-select').value='contacto:belen nunez';f.window.elegirContactoClientePP('contacto');
 assert.equal(f.field('pp-entrega-contacto-tel').value,'222');assert.equal(f.field('pp-entrega-contacto-cargo').value,'Compradora');
 f.field('pp-entrega-contacto-select').value='contacto:ana';f.window.elegirContactoClientePP('contacto');assert.equal(f.field('pp-entrega-contacto-cargo').value,'');
 f.field('pp-entrega-contacto-select').value='__nuevo';f.window.elegirContactoClientePP('contacto');
 for(const suffix of ['','-tel','-email','-cargo'])assert.equal(f.field('pp-entrega-contacto'+suffix).value,'');
});

test('cargo y contactos históricos quedan disponibles en otros presupuestos sin modificar el principal',async()=>{
 const f=formFixture();f.window.DB.presupuestos.push({cliente:'Miniso',entregaLogistica:{contacto:'Tayanna',contactoTelefono:'777',contactoEmail:'tay@example.test',contactoCargo:'Compras'}});
 f.window.sugerirContactoClientePP();assert.match(f.field('pp-entrega-contacto-select').innerHTML,/Tayanna · Compras · 777 · tay@example.test/);
 await f.window.remember('Miniso',{contacto:'Belén Núñez',contactoTelefono:'222',contactoEmail:'belen@example.test',contactoCargo:'Compradora'});
 assert.equal(f.latest().contactos.find(x=>C.norm(x.nombre)==='belen nunez').cargo,'Compradora');
 assert.equal(f.latest().contacto,'Ana');
 f.field('pp-entrega-retira-select').value='contacto:belen nunez';f.window.elegirContactoClientePP('retira');assert.equal(f.field('pp-entrega-retira-cargo').value,'Compradora');
});

test('el desplegable no ofrece contactos de otro cliente',()=>{
 const f=formFixture();f.window.DB.clientes.push({id:'otro',nombre:'Otro cliente',contactos:[{nombre:'Exclusivo'}]});
 f.field('pp-cliente').value='Otro cliente';f.window.sugerirContactoClientePP();const options=f.field('pp-entrega-contacto-select').innerHTML;
 assert.match(options,/Exclusivo/);assert.doesNotMatch(options,/Belén|Ana/);
});

test('cargo viaja con la logística del presupuesto y se restaura al reabrirlo',()=>{
 const f=formFixture(),ctx={window:f.window,document:{getElementById:f.field},val:id=>f.field(id).value};
 vm.runInNewContext(sector.slice(sector.indexOf('  function entregaLogisticaActual('),sector.indexOf('  function validarLogisticaCotizacion('))+'\nwindow.collect=entregaLogisticaActual;',ctx);
 vm.runInNewContext(sector.slice(sector.indexOf('  function cargarEntregaLogisticaPP('),sector.indexOf('  function cleanObraModal('))+'\nwindow.load=cargarEntregaLogisticaPP;',ctx);
 f.window.actualizarEntregaLogisticaPP=()=>{};
 f.field('pp-entrega-contacto').value='Belén';f.field('pp-entrega-contacto-cargo').value='Compradora';f.field('pp-entrega-retira-cargo').value='Depósito';
 const saved=f.window.collect();assert.equal(saved.contactoCargo,'Compradora');assert.equal(saved.retiraCargo,'Depósito');
 f.field('pp-entrega-contacto')._tizContactAutofill={telefono:'obsoleto'};
 f.window.load({entregaLogistica:saved});assert.equal(f.field('pp-entrega-contacto-cargo').value,'Compradora');assert.equal(f.field('pp-entrega-retira-cargo').value,'Depósito');
});

test('ficha de cliente conserva cargo del principal y de los contactos adicionales',async()=>{
 const f=formFixture();f.window.editingId={cliente:'m'};for(const id of ['modal-obra','modal-prespdf'])f.field(id).classList={contains:()=>false};
 const ctx={window:f.window,document:{getElementById:f.field},nextClienteNumero:()=>1,updateDoc_:async(_col,_id,data)=>Object.assign(f.current,data),closeModal(){},showToast(){}};
 vm.runInNewContext(html.slice(html.lastIndexOf('window.saveCliente ='),html.lastIndexOf('window.saveCliente =')+html.slice(html.lastIndexOf('window.saveCliente =')).indexOf('\n};')+4),ctx);
 f.field('fc-nombre').value='Miniso';f.field('fc-contacto').value='Ana';f.field('fc-cargo').value='Compradora';f.field('fc-contactos').value='Belén | 222 | belen@example.test | Compras';
 await f.window.saveCliente();assert.equal(f.current.contactoCargo,'Compradora');assert.equal(f.current.contactos[0].cargo,'Compras');
});
