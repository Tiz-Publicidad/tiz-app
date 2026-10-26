'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../functions/arcaFceMinimoV1');
const html='<p>Desde el <strong>14 de abril de 2026</strong>, el monto mínimo a partir del cual las empresas están obligadas a emitir Facturas de Crédito Electrónicas se actualizó a <strong>$ 5.549.862</strong> (Resolución 1/2026)</p>';
test('lee importe y vigencia de la publicación oficial sin fijar un monto en el código de emisión',()=>{
 const m=M.parse(html);assert.equal(m.desde,'2026-04-14');assert.equal(m.montoDesde,5549862);assert.equal(m.sourceUrl,M.URL);
 for(const text of ['',html+html,html.replace('5.549.862','desconocido'),html.replace('14 de abril','31 de febrero'),'<script>'+html+'</script>'])assert.throws(()=>M.parse(text));
});
test('por debajo del mínimo corresponde común sin afirmar la clasificación del receptor; en el límite exige consulta',()=>{
 const m=M.parse(html),small=M.decision({fecha:'2026-10-26',total:60500},m);assert.equal(small.requiereFce,false);assert.equal(small.obligado,null);assert.equal(small.criterio,'inferior_minimo_general');assert.equal(small.fuente,'ARCA.minimoGeneralFCE');
 assert.equal(M.decision({fecha:'2026-10-26',total:5549861.99},m).requiereFce,false);
 for(const total of [5549862,6000000])assert.equal(M.decision({fecha:'2026-10-26',total},m),null);
 assert.equal(M.decision({fecha:'2026-04-13',total:60500},m),null);
 for(const total of [0,-1,NaN,Infinity])assert.throws(()=>M.decision({fecha:'2026-10-26',total},m));
 assert.throws(()=>M.decision({fecha:'2026-02-31',total:60500},m));
});
test('consulta únicamente la URL oficial, agrupa lecturas y renueva la fuente al vencer la caché',async()=>{
 let requests=0,clock=0;const read=M.createReader(async(url,opts)=>{assert.equal(url,M.URL);assert.equal(opts.redirect,'error');requests++;return {ok:true,text:async()=>html};},()=>clock);
 const input={fecha:'2026-10-26',total:60500};await Promise.all([read(input),read(input)]);assert.equal(requests,1);await read(input);assert.equal(requests,1);clock=3600001;await read(input);assert.equal(requests,2);
});
test('si la publicación falla no inventa un resultado y permite reintentar',async()=>{
 let fail=true;const read=M.createReader(async()=>{if(fail)throw Error('sin conexión');return {ok:true,text:async()=>html};});
 await assert.rejects(read({fecha:'2026-10-26',total:60500}));fail=false;assert.equal((await read({fecha:'2026-10-26',total:60500})).requiereFce,false);
 const invalid=M.createReader(async()=>({ok:true,text:async()=>'<html>Error</html>'}));await assert.rejects(invalid({fecha:'2026-10-26',total:60500}));
});
