import './comprasIngresoCoreV1.js?v=20261103-nombres';
import { createPurchaseDistribution } from './comprasDistribucionUIV1.js?v=20261111-distribucion';
import { createMaterialsControl } from './comprasControlUIV1.js?v=20261109-catalogo-ot&distribucion=20261111';
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, query, orderBy, limit, writeBatch, runTransaction, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const db = getFirestore(getApp());
const C = {
  compras: [], articulos: [], conteos: [], planes: [], pagos: [], proveedores: [], analisisOT: [], preparacionCol: [], ayudamemorias: []
};
let compraEditId = null;
const cpDistribution=createPurchaseDistribution({esc:v=>esc(v),money:v=>money(v),qty:v=>String(Math.round(v*1e8)/1e8),works:()=>cpWorks(),article:id=>C.articulos.find(a=>a.id===id),stockCore:()=>window.TIZInsumosCotizacionCoreV1,item:tr=>rowToItem(tr),defaults:()=>({destino:document.getElementById('cp-destino')?.value,ot:document.getElementById('cp-ot')?.value,tipoCosto:document.getElementById('cp-tipo-costo')?.value||'CD'}),changed:()=>calcTotals()});
let selectedFile = null;
let currentTab = 'inicio';
const cpMaterialsControl=createMaterialsControl({
 data:()=>window.TIZVigenciaComercialV1?{...C,planes:C.planes.filter(p=>window.TIZVigenciaComercialV1.relatedVisible(p))}:C,works:()=>cpWorks(),planForWork:o=>cpPlanForWork(o),sameOT:(a,b)=>window.TIZComprasObrasCoreV1.same(a,b),
 quoteForWork:o=>(window.DB?.presupuestos||[]).find(q=>q.id===o?.presupuestoId||window.TIZComprasObrasCoreV1.same(q.nro||q.numero,o?.ot)),
 esc:(...args)=>esc(...args),money:(...args)=>money(...args),today:()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),week:d=>weekKey(new Date(d+'T12:00:00')),user:()=>window.currentUser?.email||'',toast:msg=>toast(msg),stock:()=>cpStockSnapshot(),
 editArticle:(id,onSaved)=>window.cpEditArticulo(id,null,{onSaved}),
 units:(id,onSaved)=>window.TIZUnidadesStockV1.open(id,{onSaved:a=>{window.cpAfterStockUnitsChanged?.(a);onSaved?.(a);}}),
 createArticle:async fields=>{const a=await cpCreateNumberedArticle(fields);C.articulos=[...C.articulos.filter(x=>x.id!==a.id),a];return a;},
 suggest:async(query,plan)=>{const owner=window.currentUser?.email;await cpIaConfigReady;if(owner!==window.currentUser?.email)throw Error('Cambió la sesión. Volvé a ingresar.');if(!cpValidIaUrl(cpIaUrlShared))throw Error(cpIaConfigError||'Configurá la conexión compartida en IA comprobantes');if(!window.TIZInsumosCotizacionV1?.requestShared)throw Error('Actualizá TIZ para cargar el buscador');return window.TIZInsumosCotizacionV1.requestShared({url:cpIaUrlShared,datos:{descripcion:'Identificar alternativas de insumos existentes para: '+query+'. Trabajo: '+(plan?.descripcion||'')+'. Si es impresión, distinguir tinta y soporte de impresión propia y servicio contratado. No inventar cantidades ni elegir automáticamente.',items:[{descripcion:query,cantidad:1}],catalogo:C.articulos.map(a=>({articuloId:a.id,codigo:a.codigo,descripcion:a.descripcion,unidad:a.unidad,familia:a.familia||'',subfamilia:a.subfamilia||''}))}});},
 motherState:()=>cpMotherState(),refreshMother:()=>cpRefreshMother(true),refresh:()=>render(),
 savePlan:async(id,payload,revision)=>{const existing=cpPlanForWork({id:payload.obraId,ot:payload.ot});const ref=doc(db,'planesMateriales',id||existing?.id||'materiales-'+encodeURIComponent(payload.obraId));await runTransaction(db,async tx=>{const snap=await tx.get(ref),old=snap.exists()?snap.data():{};if((old.revisionMateriales||0)!==revision)throw Error('Otra persona revisó este plan. Cerrá y reabrí la revisión para conservar ambos cambios.');tx.set(ref,{...payload,_ts:serverTimestamp()},{merge:true});});},
 addMovement:async(id,m)=>{await runTransaction(db,async tx=>{const ref=doc(db,'planesMateriales',id),snap=await tx.get(ref);if(!snap.exists())throw Error('No se encontró el plan. Reabrí la OT.');tx.update(ref,{movimientosMateriales:[...(snap.data().movimientosMateriales||[]),m]});});},
 saveCount:async payload=>{await addDoc(collection(db,'conteosStock'),{...payload,_ts:serverTimestamp()});},
 justifyCount:async(id,index,note)=>{await runTransaction(db,async tx=>{const ref=doc(db,'conteosStock',id),snap=await tx.get(ref);if(!snap.exists())throw Error('No se encontró el conteo.');const items=[...(snap.data().items||[])];items[index]={...items[index],justificaciones:[...(items[index].justificaciones||[]),note]};tx.update(ref,{items});});}
});
let cpMotherRows=[],cpMotherUser='',cpMotherBusy=false,cpMotherRead=0,cpMotherError='';
function cpWorks(){return window.TIZComprasObrasCoreV1.merge(cpMotherUser===window.currentUser?.email?cpMotherRows:[],window.DB?.obras||[]);}
function cpFindWork(id){return cpWorks().find(w=>w.id===id);}
async function cpRefreshMother(force=false){
 const email=window.currentUser?.email;if(!email||window.currentUser?.restrictedColocaciones||window.currentUser?.restrictedChecklists)return;
 if(cpMotherUser!==email){cpMotherRows=[];cpMotherUser=email;cpMotherRead=0;cpMotherError='';}
 if(cpMotherBusy||!force&&Date.now()-cpMotherRead<60000)return;
 cpMotherBusy=true;cpMotherRead=Date.now();
 try{const response=await window.leerCalidadBaseMadreV1();if(window.currentUser?.email!==email)return;if(!Array.isArray(response.rows))throw Error('Respuesta de TIZ 2026 inválida.');cpMotherRows=response.rows;cpMotherError='';}
 catch(e){if(window.currentUser?.email===email)cpMotherError=e.message||String(e);}
 finally{cpMotherBusy=false;if(window.currentUser?.email===email&&window.currentPage==='compras'&&['inicio','planes','controlot','alertas'].includes(currentTab))render();}
}
window.cpRefreshMother=()=>cpRefreshMother(true);
function cpMotherState(){return cpMotherError?'<p role="alert" style="color:var(--amber)">No se pudo actualizar TIZ 2026: '+esc(cpMotherError)+'. Se conserva la última lectura.</p>':cpMotherBusy?'<p class="cp-sub">Actualizando TIZ 2026…</p>':'';}

let aiCleanupActive = null;
let purchaseFilters;
let migrationPreview = null;
let migrationFileName = '';
const CATALOGO_TIZ_BASE = [{"codigo":"000001","descripcion":"Silicona Transparente","unidad":"UNID","familia":"Pegamentos","subfamilia":""},{"codigo":"000002","descripcion":"Silicona Negra","unidad":"UNID","familia":"Pegamentos","subfamilia":""},{"codigo":"000003","descripcion":"Silicona Blanca","unidad":"UNID","familia":"Pegamentos","subfamilia":""},{"codigo":"000004","descripcion":"Ciano CM1 20g","unidad":"UNID","familia":"Pegamentos","subfamilia":""},{"codigo":"000005","descripcion":"Cianoacrilato suprabon","unidad":"UNID","familia":"Pegamentos","subfamilia":""},{"codigo":"000006","descripcion":"Aerosol activador secado rapido de Ciano","unidad":"UNID","familia":"Pegamentos","subfamilia":""},{"codigo":"000007","descripcion":"Suprabon","unidad":"UNID","familia":"Pegamentos","subfamilia":""},{"codigo":"000008","descripcion":"Cinta de Papel 12 mm","unidad":"UNID","familia":"Cintas Autoadhesivas","subfamilia":""},{"codigo":"000009","descripcion":"Cinta de Papel 18mm","unidad":"UNID","familia":"Cintas Autoadhesivas","subfamilia":""},{"codigo":"000010","descripcion":"Cinta de Embalar","unidad":"UNID","familia":"Cintas Autoadhesivas","subfamilia":""},{"codigo":"000011","descripcion":"Cinta Bifaz Transparente","unidad":"UNID","familia":"Cintas Autoadhesivas","subfamilia":""},{"codigo":"000012","descripcion":"Cinta Bifaz Espumada 9mm","unidad":"UNID","familia":"Cintas Autoadhesivas","subfamilia":""},{"codigo":"000013","descripcion":"Cinta Bifaz Espumada 10mm","unidad":"UNID","familia":"Cintas Autoadhesivas","subfamilia":""},{"codigo":"000014","descripcion":"Cinta Aisladora Negra","unidad":"UNID","familia":"Cintas Autoadhesivas","subfamilia":""},{"codigo":"000015","descripcion":"Cinta Aisladora Blanca","unidad":"UNID","familia":"Cintas Autoadhesivas","subfamilia":""},{"codigo":"000016","descripcion":"Disco de Corte","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000017","descripcion":"Disco Flap grano 60","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000018","descripcion":"Disco Flap grano 80","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000019","descripcion":"Disco Flap grano 100","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000020","descripcion":"Disco Flap grano 120","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000021","descripcion":"Pintura Sintetica Blanco Satinado","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000022","descripcion":"Pintura Sintetica Negro Satinado","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000023","descripcion":"Pintura Sintetica Verde Manzana","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000024","descripcion":"Pintura Sintetica Naranja","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000025","descripcion":"Pintura Sintetica Gris","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000026","descripcion":"Pintura Latex Azul","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000027","descripcion":"Pintura Latex Blanco Mate","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000028","descripcion":"Pintura Latex Negro","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000029","descripcion":"Pintura Color Generico / Galvite","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000030","descripcion":"Pintura Acrilica Verde","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000031","descripcion":"Pintura Acrilica Color Generico","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000032","descripcion":"Pintura Acrilica Blanca","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000033","descripcion":"Pintura Acrilica Violeta","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000034","descripcion":"Pintura sintetica brillante Blanca","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000035","descripcion":"Pintura generica trabajo especifico","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000036","descripcion":"Filtro para pintura","unidad":"UNID","familia":"Pinturas","subfamilia":""},{"codigo":"000037","descripcion":"Pincel Pintor N°10","unidad":"UNID","familia":"Pinturas","subfamilia":""},{"codigo":"000038","descripcion":"Pincel Pintor N°20","unidad":"UNID","familia":"Pinturas","subfamilia":""},{"codigo":"000039","descripcion":"Pinceleta N° 1","unidad":"UNID","familia":"Pinturas","subfamilia":""},{"codigo":"000040","descripcion":"Pinceleta N° 3","unidad":"UNID","familia":"Pinturas","subfamilia":""},{"codigo":"000041","descripcion":"Rodillo de 10cm","unidad":"UNID","familia":"Pinturas","subfamilia":""},{"codigo":"000042","descripcion":"Rodillo de 5 cm","unidad":"UNID","familia":"Pinturas","subfamilia":""},{"codigo":"000043","descripcion":"Rodillo de 20 cm","unidad":"UNID","familia":"Pinturas","subfamilia":""},{"codigo":"000044","descripcion":"Enduido","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000045","descripcion":"Masilla","unidad":"KG","familia":"Pinturas","subfamilia":""},{"codigo":"000046","descripcion":"Thinner","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000047","descripcion":"Aguarras","unidad":"LTS","familia":"Pinturas","subfamilia":""},{"codigo":"000048","descripcion":"Fresas 3mm","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000049","descripcion":"Fresas 3mm con copiador","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000050","descripcion":"Fresas a definir numero y descripcion","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000051","descripcion":"Fresas a definir numero y descripcion","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000052","descripcion":"Fresas a definir numero y descripcion","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000053","descripcion":"Fresas a definir numero y descripcion","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000054","descripcion":"Fresas a definir numero y descripcion","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000055","descripcion":"Madera no habitual","unidad":"PLACA","familia":"Maderas y otros","subfamilia":""},{"codigo":"000056","descripcion":"MDF 3mm","unidad":"PLACA","familia":"Maderas y otros","subfamilia":""},{"codigo":"000057","descripcion":"MDF 5mm","unidad":"PLACA","familia":"Maderas y otros","subfamilia":""},{"codigo":"000058","descripcion":"MDF 9mm","unidad":"PLACA","familia":"Maderas y otros","subfamilia":""},{"codigo":"000059","descripcion":"MDF 12mm","unidad":"PLACA","familia":"Maderas y otros","subfamilia":""},{"codigo":"000060","descripcion":"MDF 15mm","unidad":"PLACA","familia":"Maderas y otros","subfamilia":""},{"codigo":"000061","descripcion":"MDF 18mm","unidad":"PLACA","familia":"Maderas y otros","subfamilia":""},{"codigo":"000062","descripcion":"Guantes de latex","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000063","descripcion":"Guantes moteados","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000064","descripcion":"Embellecedores 12 mm plateados","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000065","descripcion":"Tornillos T1 8 x 1/2","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000066","descripcion":"TORNILLOS Y TARUGOS DEL 6 X100","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000067","descripcion":"Tornillo cabeza hexagonal p/ tarugos del 12","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000068","descripcion":"Tarugos del 12","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000069","descripcion":"Tornillo cabeza hexagonal p/ tarugos del 10","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000070","descripcion":"Tarrugos del 10","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000071","descripcion":"Tarugos para ladrillo hueco","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000072","descripcion":"Tarugos para durlock","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000073","descripcion":"FILM STRETCH","unidad":"UNID","familia":"Elementos de Embalaje","subfamilia":""},{"codigo":"000074","descripcion":"CAJAS 70x40","unidad":"UNID","familia":"Elementos de Embalaje","subfamilia":""},{"codigo":"000075","descripcion":"Transfer 30 CM","unidad":"UNID","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000076","descripcion":"Transfer 60 CM","unidad":"UNID","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000077","descripcion":"Transfer 120 CM","unidad":"UNID","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000078","descripcion":"Vinilo Base Blanca mate de 1,37 x 50 mts","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000079","descripcion":"Vinilo Base Blanca mate de 1,27 x 50 mts","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000080","descripcion":"Vinilo Base Blanca mate de 1,52 x 50 mts","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000081","descripcion":"Vinilo Transparente brillante de 1,2 x 50 mts","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000082","descripcion":"Vinilo esmerilado de 1,22 x 50 mts","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000083","descripcion":"Lona Front de 1,0 x 50 mts","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000084","descripcion":"Lona Front de 1,22 x 50 mts","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000085","descripcion":"Lona Front de 1,37 x 50 mts","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000086","descripcion":"Lona New Back","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000087","descripcion":"Vinilo verde oracal /","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000088","descripcion":"Lona New Back","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000089","descripcion":"Vinilo Color Generico","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000090","descripcion":"Vinilo Base negra mate","unidad":"Rollo","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000091","descripcion":"Vinilo Azul ORACAL 098","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000092","descripcion":"Vinilo Gris ORACAL","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000093","descripcion":"Vinilo Blanco ORACAL","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000094","descripcion":"Vinilo Negro ORACAL","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000095","descripcion":"Kit tintas  ecosolvente Kit x 4 (CMYK","unidad":"UNID","familia":"Consumibles de Impresión","subfamilia":""},{"codigo":"000096","descripcion":"Tintas Ecosolvente color amarillo","unidad":"UNID","familia":"Consumibles de Impresión","subfamilia":""},{"codigo":"000097","descripcion":"Tintas Ecosolvente color Magenta","unidad":"UNID","familia":"Consumibles de Impresión","subfamilia":""},{"codigo":"000098","descripcion":"Tintas Ecosolvente color Negro","unidad":"UNID","familia":"Consumibles de Impresión","subfamilia":""},{"codigo":"000099","descripcion":"Tintas Ecosolvente color Cyan","unidad":"UNID","familia":"Consumibles de Impresión","subfamilia":""},{"codigo":"000100","descripcion":"Dumpers","unidad":"UNID","familia":"Consumibles de Impresión","subfamilia":""},{"codigo":"000101","descripcion":"Solvente","unidad":"UNID","familia":"Consumibles de Impresión","subfamilia":""},{"codigo":"000102","descripcion":"Filo de Cutter","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000103","descripcion":"Cutter","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000104","descripcion":"Alcohol","unidad":"LITROS","familia":"Limpieza y Mantenimiento","subfamilia":""},{"codigo":"000105","descripcion":"PAI 1mm","unidad":"PLACA","familia":"Pai PVC y polyfan","subfamilia":""},{"codigo":"000106","descripcion":"PAI 3mm","unidad":"PLACA","familia":"Pai PVC y polyfan","subfamilia":""},{"codigo":"000107","descripcion":"PVC espumado 3mm","unidad":"PLACA","familia":"Pai PVC y polyfan","subfamilia":""},{"codigo":"000108","descripcion":"PVC espumado 5mm","unidad":"PLACA","familia":"Pai PVC y polyfan","subfamilia":""},{"codigo":"000109","descripcion":"Corrugado Plastico","unidad":"PLACA","familia":"Pai PVC y polyfan","subfamilia":""},{"codigo":"000110","descripcion":"Acrilico Cristal 2 mm de 1,0 x 2,0","unidad":"PLACA","familia":"Acrilicos","subfamilia":""},{"codigo":"000111","descripcion":"Acrilico Cristal 2 mm de 1,22 x 2,44","unidad":"PLACA","familia":"Acrilicos","subfamilia":""},{"codigo":"000112","descripcion":"Acrilico Cristal 3 mm de 1,22 x 2,44","unidad":"PLACA","familia":"Acrilicos","subfamilia":""},{"codigo":"000113","descripcion":"Acrilico Opalino 2mm de 1,0  x 2,0","unidad":"PLACA","familia":"Acrilicos","subfamilia":""},{"codigo":"000114","descripcion":"Acrilico Opalino 2mm de 1,22  x 2,44","unidad":"PLACA","familia":"Acrilicos","subfamilia":""},{"codigo":"000115","descripcion":"Acrilico Naranja 2mm de 1,0 x 2,0 mts","unidad":"PLACA","familia":"Acrilicos","subfamilia":""},{"codigo":"000116","descripcion":"Acrilico Naranja 2mm de 1,22 x 2,44 mts","unidad":"PLACA","familia":"Acrilicos","subfamilia":""},{"codigo":"000117","descripcion":"Acrilico Negro 2mm de 1,22 x 2,44","unidad":"PLACA","familia":"Acrilicos","subfamilia":""},{"codigo":"000118","descripcion":"Acrilico Verde 2mm","unidad":"PLACA","familia":"Acrilicos","subfamilia":""},{"codigo":"000119","descripcion":"P. Bicapa laserable 1200x600mm","unidad":"PLACA","familia":"Pai PVC y polyfan","subfamilia":""},{"codigo":"000120","descripcion":"Tiras Led Blanco Frio 220","unidad":"Rollo 5 Mts","familia":"Iluminacion","subfamilia":""},{"codigo":"000121","descripcion":"Modulos Led 5054 blanco frio de 6,5 cm x 1 cm","unidad":"UNID","familia":"Iluminacion","subfamilia":""},{"codigo":"000122","descripcion":"Leds Pixel Verdes racimo de 50 unid","unidad":"UNID","familia":"Iluminacion","subfamilia":""},{"codigo":"000123","descripcion":"Leds Pixel Blancos racimo de 50 unid","unidad":"UNID","familia":"Iluminacion","subfamilia":""},{"codigo":"000124","descripcion":"Led Neon Blanco","unidad":"UNID","familia":"Iluminacion","subfamilia":""},{"codigo":"000125","descripcion":"Led neon Color","unidad":"UNID","familia":"Iluminacion","subfamilia":""},{"codigo":"000126","descripcion":"Fuentes 12V 5AMP","unidad":"UNID","familia":"Iluminacion","subfamilia":""},{"codigo":"000127","descripcion":"Fuente 12V  10AMP","unidad":"UNID","familia":"Iluminacion","subfamilia":""},{"codigo":"000128","descripcion":"Fuente 12 V 30AMP","unidad":"UNID","familia":"Iluminacion","subfamilia":""},{"codigo":"000129","descripcion":"Perfil L de aluminio 6 mts (totem)","unidad":"UNID","familia":"Hierros","subfamilia":""},{"codigo":"000130","descripcion":"Caño 15x15 x1,24 mm espesor 6 mts","unidad":"UNID","familia":"Hierros","subfamilia":""},{"codigo":"000131","descripcion":"Caño 40x60  1,2mm espesor 6 mts","unidad":"UNID","familia":"Hierros","subfamilia":""},{"codigo":"000132","descripcion":"Caño 20x20 x1,24 mm espesor 6 mts","unidad":"UNID","familia":"Hierros","subfamilia":""},{"codigo":"000133","descripcion":"Caño 25x25 x 1,2 mm espesor 6 mts","unidad":"UNID","familia":"Hierros","subfamilia":""},{"codigo":"000134","descripcion":"Caño 30x30 x ,2 mm espesor 6 mts","unidad":"UNID","familia":"Hierros","subfamilia":""},{"codigo":"000135","descripcion":"Caño 20x30 1,24 espesor","unidad":"UNID","familia":"Hierros","subfamilia":""},{"codigo":"000136","descripcion":"Caño 20x40  1,24 espesor","unidad":"UNID","familia":"Hierros","subfamilia":""},{"codigo":"000137","descripcion":"Caño No Habitual","unidad":"UNID","familia":"Hierros","subfamilia":""},{"codigo":"000138","descripcion":"Caño 60x40 x 1.24 de espesor 6 mts","unidad":"UNID","familia":"Hierros","subfamilia":""},{"codigo":"000139","descripcion":"Caño 100x100 1,6 de espesor 6 mts","unidad":"UNID","familia":"Hierros","subfamilia":""},{"codigo":"000140","descripcion":"Estaño Electronica","unidad":"ROLLO","familia":"Ferreteria","subfamilia":""},{"codigo":"000141","descripcion":"Estaño 50% (8 barras x kilo)","unidad":"KILO","familia":"Ferreteria","subfamilia":""},{"codigo":"000142","descripcion":"Acero inoxidable","unidad":"UNID","familia":"Chapas","subfamilia":""},{"codigo":"000143","descripcion":"Chapa lisa fina galvanizada C18 1.22 x 2.44","unidad":"UNID","familia":"Chapas","subfamilia":""},{"codigo":"000144","descripcion":"Chapa lisa fina galvanizada C20 1.22 x 2.44","unidad":"UNID","familia":"Chapas","subfamilia":""},{"codigo":"000145","descripcion":"Chapa lisa fina galvanizada C22 1.0 x 2.0","unidad":"UNID","familia":"Chapas","subfamilia":""},{"codigo":"000146","descripcion":"Chapa lisa fina galvanizada C22 1.22 x 2.44","unidad":"UNID","familia":"Chapas","subfamilia":""},{"codigo":"000147","descripcion":"Chapa lisa fina galvanizada C25 1.0 X2.0","unidad":"UNID","familia":"Chapas","subfamilia":""},{"codigo":"000148","descripcion":"Chapa lisa fina galvanizada C25 1.22 X2.44","unidad":"UNID","familia":"Chapas","subfamilia":""},{"codigo":"000149","descripcion":"Chapa lisa fina galvanizada C27/C30 1.22x2.44","unidad":"UNID","familia":"Chapas","subfamilia":""},{"codigo":"000150","descripcion":"Garrafa 10 KG","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000151","descripcion":"Arandela 12mm agujero 3mm","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000152","descripcion":"Tornillo Parker 6x3/8","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000153","descripcion":"Tornillo Fix 6","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000154","descripcion":"Hexagonal Punta Mecha 14x 3/4","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000155","descripcion":"Tarugo Tope Fischer N°10 + Tirafondo","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000156","descripcion":"Tornillo 12mm (PARKER)","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000157","descripcion":"Tornillo 12mm (PARKER)","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000158","descripcion":"Tornillo 12mm (PARKER)","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000159","descripcion":"Tornillo 12mm (PARKER)","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000160","descripcion":"Tornillo 12mm (PARKER)","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000161","descripcion":"Tornillo 12mm (PARKER)","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000162","descripcion":"Remache Pop 3,5 x 10mm","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000163","descripcion":"Remache","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000164","descripcion":"Tornillo fix 5x30","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000165","descripcion":"Cable De Audio Bafle Rojo Y Negro 2x0,75 Mm","unidad":"MTS","familia":"Ferreteria","subfamilia":""},{"codigo":"000166","descripcion":"Conectores para luces (terminal ficha pala hembra)","unidad":"UNID","familia":"Electricidad","subfamilia":""},{"codigo":"000167","descripcion":"Conectores para luces (terminal ficha pala macho)","unidad":"UNID","familia":"Electricidad","subfamilia":""},{"codigo":"000168","descripcion":"Cable unipolar rojo de 1mm","unidad":"MTS","familia":"Electricidad","subfamilia":""},{"codigo":"000169","descripcion":"Cable unipolar negro de 1mm","unidad":"MTS","familia":"Electricidad","subfamilia":""},{"codigo":"000170","descripcion":"Cable bipolar tipo taller color negro de 3 x 2,5mm","unidad":"MTS","familia":"Electricidad","subfamilia":""},{"codigo":"000171","descripcion":"Cable bipolar tipo taller color negro de 2,5mm","unidad":"MTS","familia":"Electricidad","subfamilia":""},{"codigo":"000172","descripcion":"Electrodos 1,5mm","unidad":"KILOS","familia":"Ferreteria","subfamilia":""},{"codigo":"000173","descripcion":"Electrodos 2,5 mm Punta Azul","unidad":"KILOS","familia":"Ferreteria","subfamilia":""},{"codigo":"000174","descripcion":"Lijas 60","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000175","descripcion":"Lijas 80","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000176","descripcion":"Lijas 120","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000177","descripcion":"Lijas 220","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000178","descripcion":"Lijas 320","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000179","descripcion":"Lijas 420","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000180","descripcion":"Bolsa de residuos 90x120","unidad":"UNID","familia":"Consumibles Fabrica","subfamilia":""},{"codigo":"000181","descripcion":"Bolsa ecommerce 30x 40","unidad":"UNID","familia":"Consumibles Fabrica","subfamilia":""},{"codigo":"000182","descripcion":"Bolsa ecommerce 20x30","unidad":"UNID","familia":"Consumibles Fabrica","subfamilia":""},{"codigo":"000183","descripcion":"Pulverizador","unidad":"UNID","familia":"Consumibles Fabrica","subfamilia":""},{"codigo":"000184","descripcion":"Limpieza Fabrica","unidad":"UNID","familia":"Limpieza y Mantenimiento","subfamilia":""},{"codigo":"000185","descripcion":"Precintos 10 cm negro","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000186","descripcion":"Precintos 25 cm negro","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000187","descripcion":"Precintos 35 cm negro","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000188","descripcion":"Precintos 10 cm blanco","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000189","descripcion":"Precinto 25 cm blanco","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000190","descripcion":"Precinto 35 cm blanco","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000191","descripcion":"Film stretch Cristal","unidad":"UNID","familia":"Elementos de Embalaje","subfamilia":""},{"codigo":"000192","descripcion":"Film stretch Negro","unidad":"UNID","familia":"Elementos de Embalaje","subfamilia":""},{"codigo":"000193","descripcion":"Film cinta","unidad":"UNID","familia":"Elementos de Embalaje","subfamilia":""},{"codigo":"000194","descripcion":"Carton corrugado","unidad":"UNID","familia":"Elementos de Embalaje","subfamilia":""},{"codigo":"000195","descripcion":"Pluriball (burbujita) x Rollo 25 mts x 1 mt","unidad":"UNID","familia":"Elementos de Embalaje","subfamilia":""},{"codigo":"000196","descripcion":"Pluriball (burbujita) x Rollo 50 mts x 1 mt","unidad":"UNID","familia":"Elementos de Embalaje","subfamilia":""},{"codigo":"000197","descripcion":"Resma A4","unidad":"UNID","familia":"Librería","subfamilia":""},{"codigo":"000198","descripcion":"Fibron Indeleble fino x 12 unidades","unidad":"UNID","familia":"Librería","subfamilia":""},{"codigo":"000199","descripcion":"Fibron Indeleble grueso x 12 unidades","unidad":"UNID","familia":"Librería","subfamilia":""},{"codigo":"000200","descripcion":"Lapiceras por caja","unidad":"UNID","familia":"Librería","subfamilia":""},{"codigo":"000201","descripcion":"Folios","unidad":"UND","familia":"Librería","subfamilia":""},{"codigo":"000202","descripcion":"Varios Librería","unidad":"UND","familia":"Librería","subfamilia":""},{"codigo":"000203","descripcion":"Destellador","unidad":"UND","familia":"Ferreteria","subfamilia":""},{"codigo":"000204","descripcion":"Edenor","unidad":"UND","familia":"Servicios","subfamilia":""},{"codigo":"000205","descripcion":"Detergente","unidad":"UNID","familia":"Limpieza y Mantenimiento","subfamilia":""},{"codigo":"000206","descripcion":"Papel higienico","unidad":"UNID","familia":"Limpieza y Mantenimiento","subfamilia":""},{"codigo":"000207","descripcion":"Lavandina","unidad":"LITROS","familia":"Limpieza y Mantenimiento","subfamilia":""},{"codigo":"000208","descripcion":"Cif","unidad":"UNID","familia":"Limpieza y Mantenimiento","subfamilia":""},{"codigo":"000209","descripcion":"Desosorante para piso","unidad":"UNID","familia":"Limpieza y Mantenimiento","subfamilia":""},{"codigo":"000210","descripcion":"Esponja de acero","unidad":"UNID","familia":"Limpieza y Mantenimiento","subfamilia":""},{"codigo":"000211","descripcion":"Rejilla","unidad":"UNID","familia":"Limpieza y Mantenimiento","subfamilia":""},{"codigo":"000212","descripcion":"Trapo de piso","unidad":"UNID","familia":"Limpieza y Mantenimiento","subfamilia":""},{"codigo":"000213","descripcion":"Bolsas chicas","unidad":"UNID","familia":"Consumibles Fabrica","subfamilia":""},{"codigo":"000214","descripcion":"Panel Wall por tira de 2,9 mts","unidad":"UNID","familia":"Pai PVC y polyfan","subfamilia":""},{"codigo":"000215","descripcion":"Comida/Bebidas","unidad":"UNID","familia":"Comidas","subfamilia":""},{"codigo":"000216","descripcion":"Gasoil","unidad":"LITROS","familia":"Combustible","subfamilia":""},{"codigo":"000217","descripcion":"Agua destilada","unidad":"LITROS","familia":"Combustible","subfamilia":""},{"codigo":"000218","descripcion":"Bidon de Agua 20 Lts","unidad":"UNID","familia":"Consumibles Fabrica","subfamilia":""},{"codigo":"000219","descripcion":"Pintura sintetico satinado negro x 4 lts","unidad":"LITROS","familia":"Pinturas","subfamilia":""},{"codigo":"000220","descripcion":"Pintura sintetico satinado blanco x 4 lts","unidad":"LITROS","familia":"Pinturas","subfamilia":""},{"codigo":"000221","descripcion":"Pintura sintetico satinado verde manzana ACRYSOL","unidad":"LITROS","familia":"Pinturas","subfamilia":""},{"codigo":"000222","descripcion":"Gastos viaje colocaciones en provincias","unidad":"UNID","familia":"Colocaciones Externas","subfamilia":""},{"codigo":"000223","descripcion":"Gastos de relevamiento en provincias","unidad":"UNID","familia":"Colocaciones Externas","subfamilia":""},{"codigo":"000224","descripcion":"Externos","unidad":"UNID","familia":"Sueldos","subfamilia":""},{"codigo":"000225","descripcion":"Cortes externos Chapas","unidad":"UNID","familia":"Cortes / Impresiones Externas","subfamilia":""},{"codigo":"000226","descripcion":"Seguro","unidad":"UNID","familia":"Seguros Vehiculos","subfamilia":""},{"codigo":"000227","descripcion":"Alquiler","unidad":"UNID","familia":"Alquiler","subfamilia":""},{"codigo":"000316","descripcion":"Seguro Personal","unidad":"UNID","familia":"Seguros Personales","subfamilia":""},{"codigo":"000228","descripcion":"AFIP Pagos Vep + Autonomos","unidad":"UNID","familia":"Arca Veps Autonomos","subfamilia":""},{"codigo":"000229","descripcion":"Mantenimiento maquinas","unidad":"UNID","familia":"Mantenimiento maquinas","subfamilia":""},{"codigo":"000230","descripcion":"Uber","unidad":"UNID","familia":"Uber/Motos","subfamilia":""},{"codigo":"000231","descripcion":"Google Ads","unidad":"UNID","familia":"Publicidad","subfamilia":""},{"codigo":"000232","descripcion":"Art Varios","unidad":"UNID","familia":"Compras esporadicas","subfamilia":""},{"codigo":"000233","descripcion":"Sueldos Produccion","unidad":"UNID","familia":"Sueldos","subfamilia":""},{"codigo":"000234","descripcion":"Sueldos Colocaciones","unidad":"UNID","familia":"Sueldos","subfamilia":""},{"codigo":"000235","descripcion":"Sueldos Diseños","unidad":"UNID","familia":"Sueldos","subfamilia":""},{"codigo":"000236","descripcion":"Sueldos Administrativos","unidad":"UNID","familia":"Sueldos","subfamilia":""},{"codigo":"000237","descripcion":"Cinta metrica 5mts","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000238","descripcion":"Cinta Metrica 10 MTS","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000239","descripcion":"Dimmer Switch Interruptor Tira Led 12v- 24v 3a Monocromatico","unidad":"UNID","familia":"Electronica","subfamilia":""},{"codigo":"000240","descripcion":"Horas extras produccion","unidad":"UNID","familia":"Sueldos","subfamilia":""},{"codigo":"000241","descripcion":"Aguinaldos","unidad":"UNID","familia":"Sueldos","subfamilia":""},{"codigo":"000242","descripcion":"Pasaje larga distancia","unidad":"UNID","familia":"Colocaciones Externas","subfamilia":""},{"codigo":"000243","descripcion":"Hospedaje","unidad":"UNID","familia":"Colocaciones Externas","subfamilia":""},{"codigo":"000244","descripcion":"Rasquetas","unidad":"UNID","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000245","descripcion":"Via Cargo","unidad":"UNID","familia":"Logística y Envíos","subfamilia":""},{"codigo":"000246","descripcion":"Corte MDF","unidad":"UNID","familia":"Maderas y otros","subfamilia":""},{"codigo":"000247","descripcion":"Porta Banner Roll Up","unidad":"UNID","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000248","descripcion":"Tijera para chapa","unidad":"UNID","familia":"Consumibles Fabrica","subfamilia":""},{"codigo":"000249","descripcion":"Colocaciones en provincias","unidad":"UNID","familia":"Colocaciones Externas","subfamilia":""},{"codigo":"000250","descripcion":"Felpa repuesto espatula","unidad":"Rollo","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000251","descripcion":"Regatones","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000252","descripcion":"Impresion Lonas externas","unidad":"UNID","familia":"Cortes / Impresiones Externas","subfamilia":""},{"codigo":"000253","descripcion":"Polyfan 5 mm","unidad":"UNID","familia":"Pai PVC y polyfan","subfamilia":""},{"codigo":"000254","descripcion":"Polyfan 2 mm","unidad":"UNID","familia":"Pai PVC y polyfan","subfamilia":""},{"codigo":"000255","descripcion":"Acido","unidad":"LTS","familia":"Consumibles Fabrica","subfamilia":""},{"codigo":"000256","descripcion":"Tirafondo 1/4 x 2-1/2","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000257","descripcion":"Solvente","unidad":"LTS","familia":"Limpieza y Mantenimiento","subfamilia":""},{"codigo":"000258","descripcion":"Bisagras","unidad":"UND","familia":"Ferreteria","subfamilia":""},{"codigo":"000259","descripcion":"Artt de limpieza","unidad":"UND","familia":"Limpieza y Mantenimiento","subfamilia":""},{"codigo":"000260","descripcion":"Adelantos de Sueldos","unidad":"UNID","familia":"Sueldos","subfamilia":""},{"codigo":"000261","descripcion":"Colocaciones Externas","unidad":"UNID","familia":"Colocaciones Externas","subfamilia":""},{"codigo":"000262","descripcion":"Seguridad e Higiene","unidad":"UNID","familia":"Seguridad e higiene","subfamilia":""},{"codigo":"000263","descripcion":"Capacitaciones","unidad":"UND","familia":"Capacitaciones","subfamilia":""},{"codigo":"000264","descripcion":"Programas para diseño","unidad":"UND","familia":"Mantenimiento maquinas","subfamilia":""},{"codigo":"000265","descripcion":"Punta Phillips","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000266","descripcion":"Rollo de cocina","unidad":"UNID","familia":"Limpieza y Mantenimiento","subfamilia":""},{"codigo":"000267","descripcion":"Cinta sujeta equipaje","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000268","descripcion":"Maquinaria","unidad":"UNID","familia":"Maquinaria","subfamilia":""},{"codigo":"000269","descripcion":"Impresiones de papeleria externa","unidad":"UNID","familia":"Cortes / Impresiones Externas","subfamilia":""},{"codigo":"000270","descripcion":"Rollo de alambre 09 mig","unidad":"KILO","familia":"Ferreteria","subfamilia":""},{"codigo":"000271","descripcion":"Angulo 1 \" 1/2 x 1\" 1/2 x 1/8","unidad":"UNID","familia":"Hierros","subfamilia":""},{"codigo":"000272","descripcion":"Barbijos","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000273","descripcion":"Tornillo Punta Mecha Hexagonal 12 X 1 X 100u. Con Arandela","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000274","descripcion":"Antiparra","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000275","descripcion":"Audífonos Inalámbricos Skullcandy Indy Evo True Gris","unidad":"UNID","familia":"Electronica","subfamilia":""},{"codigo":"000276","descripcion":"Cable de carga","unidad":"UNID","familia":"Electronica","subfamilia":""},{"codigo":"000277","descripcion":"Caja estanco","unidad":"UNID","familia":"Iluminacion","subfamilia":""},{"codigo":"000278","descripcion":"Materiales de Construcción","unidad":"UND","familia":"Materiales de Construcción","subfamilia":""},{"codigo":"000279","descripcion":"Raspador Metalico","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000280","descripcion":"Espatula","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000281","descripcion":"Lavadero","unidad":"UNID","familia":"Limpieza y Mantenimiento","subfamilia":""},{"codigo":"000282","descripcion":"Reald Trends","unidad":"UNID","familia":"Publicidad","subfamilia":""},{"codigo":"000283","descripcion":"Pintura en polvo","unidad":"UNID","familia":"Pinturas","subfamilia":""},{"codigo":"000284","descripcion":"Alquiler de equipos","unidad":"UNID","familia":"Alquiler de Equipos","subfamilia":""},{"codigo":"000285","descripcion":"Mantenimiento fabrica","unidad":"UNID","familia":"Mantenimiento Fabrica","subfamilia":""},{"codigo":"000286","descripcion":"Porta Banner 3 x 2","unidad":"UNID","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000287","descripcion":"compras insumos (azucar,café,etc)","unidad":"UNID","familia":"Consumibles Fabrica","subfamilia":""},{"codigo":"000288","descripcion":"Ficha plug","unidad":"UNID","familia":"Electricidad","subfamilia":""},{"codigo":"000289","descripcion":"Tapacantos","unidad":"MTS","familia":"Maderas y otros","subfamilia":""},{"codigo":"000290","descripcion":"Compras insumos varios","unidad":"UNID","familia":"Compras esporadicas","subfamilia":""},{"codigo":"000291","descripcion":"Bolsas Ecommerce Varias","unidad":"UNID","familia":"Elementos de Embalaje","subfamilia":""},{"codigo":"000292","descripcion":"Rollo Sontara","unidad":"UNID","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000293","descripcion":"Mecanico Camioneta","unidad":"UNID","familia":"Mantenimiento Autos","subfamilia":""},{"codigo":"000294","descripcion":"TECNICO","unidad":"UNID","familia":"Consumibles Fabrica","subfamilia":""},{"codigo":"000295","descripcion":"Consultoria","unidad":"UNID","familia":"Sueldos","subfamilia":""},{"codigo":"000296","descripcion":"Carpintero","unidad":"UNID","familia":"Sueldos","subfamilia":""},{"codigo":"000297","descripcion":"cierra circular","unidad":"UNID","familia":"Maquinaria","subfamilia":""},{"codigo":"000298","descripcion":"Fabricacion externa","unidad":"UNID","familia":"Fabricacion externa","subfamilia":""},{"codigo":"000299","descripcion":"Servicios Generales (internet, luz, municipal)","unidad":"UNID","familia":"Servicios","subfamilia":""},{"codigo":"000300","descripcion":"impuesto municipal","unidad":"UNID","familia":"Impuesto municipal","subfamilia":""},{"codigo":"000301","descripcion":"electricista","unidad":"UNID","familia":"Mantenimiento Fabrica","subfamilia":""},{"codigo":"000302","descripcion":"Carga de Gas","unidad":"UNID","familia":"Consumibles Fabrica","subfamilia":""},{"codigo":"000303","descripcion":"Kit de pinza dobladora de acrilico","unidad":"UNID","familia":"Maquinaria","subfamilia":""},{"codigo":"000304","descripcion":"Armado de muebles","unidad":"UNID","familia":"Carpinteria","subfamilia":""},{"codigo":"000305","descripcion":"Horas extras diseños","unidad":"UNID","familia":"Sueldos","subfamilia":""},{"codigo":"000306","descripcion":"Varios Ferreteria","unidad":"UNID","familia":"Ferreteria","subfamilia":""},{"codigo":"000307","descripcion":"Eventuales","unidad":"UNID","familia":"Sueldos","subfamilia":""},{"codigo":"000308","descripcion":"Goma espuma","unidad":"UNID","familia":"Tapiceria","subfamilia":""},{"codigo":"000309","descripcion":"Cuerina","unidad":"MTS","familia":"Tapiceria","subfamilia":""},{"codigo":"000310","descripcion":"Caño Medida No Habitual","unidad":"UNID","familia":"Hierros","subfamilia":""},{"codigo":"000311","descripcion":"Tarjetas","unidad":"UND","familia":"Banco","subfamilia":""},{"codigo":"000312","descripcion":"Comisiones","unidad":"UNID","familia":"Comisiones","subfamilia":""},{"codigo":"000313","descripcion":"Microperforado","unidad":"MTS","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000314","descripcion":"Despido","unidad":"UNID","familia":"Sueldos","subfamilia":""},{"codigo":"000315","descripcion":"Comisiones bancarias  (cheque/Iva/ deb/cred)","unidad":"UNID","familia":"Banco","subfamilia":""},{"codigo":"000317","descripcion":"Hisopos Limpieza Impresora","unidad":"UND","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000318","descripcion":"Fletes","unidad":"UNID","familia":"Fletes","subfamilia":""},{"codigo":"000319","descripcion":"Mantenimeto Autos","unidad":"UND","familia":"Mantenimiento Autos","subfamilia":""},{"codigo":"000320","descripcion":"Insumos Papeleria","unidad":"UND","familia":"Papeleria","subfamilia":""},{"codigo":"000321","descripcion":"Varios Electricidad","unidad":"UND","familia":"Electricidad","subfamilia":""},{"codigo":"000322","descripcion":"Motos","unidad":"UNID","familia":"Uber/Motos","subfamilia":""},{"codigo":"000323","descripcion":"Tubos LEDS","unidad":"UND","familia":"Electricidad","subfamilia":""},{"codigo":"000324","descripcion":"Jeringas/agujas","unidad":"UND","familia":"Consumibles Fabrica","subfamilia":""},{"codigo":"000325","descripcion":"Madera Salignas","unidad":"UND","familia":"Maderas y otros","subfamilia":""},{"codigo":"000326","descripcion":"Bonos","unidad":"UND","familia":"Bonos","subfamilia":""},{"codigo":"000327","descripcion":"Termocontraible","unidad":"Rollo","familia":"Ferreteria","subfamilia":""},{"codigo":"000328","descripcion":"Estacionamiento","unidad":"UND","familia":"Estacionamiento","subfamilia":""},{"codigo":"000329","descripcion":"Roll Up","unidad":"UND","familia":"Lonas y Vinilos","subfamilia":""},{"codigo":"000330","descripcion":"Angulo Carteles","unidad":"UND","familia":"Ferreteria","subfamilia":""},{"codigo":"000331","descripcion":"Burlete para marco de aluminio","unidad":"UND","familia":"Ferreteria","subfamilia":""}];


const TIZ_FAMILIAS = {
  'Hierros': ['Caños cuadrados','Caños rectangulares','Caños redondos','Perfiles U','Perfiles C','Ángulos','Planchuelas','Hierro redondo','Hierro macizo','Tubos estructurales','Mallas','Otros hierros'],
  'Chapas': ['Galvanizada','Negra','Acero inoxidable','Aluminio','Perforada','Expandida','Lisa','Trapezoidal','Calibre 18','Calibre 20','Calibre 22','Calibre 25','Calibre 27/30','Otros'],
  'Acrilicos': ['Cristal','Opalino','Blanco','Negro','Color','Espejado','Translúcido','2 mm','3 mm','4 mm','5 mm','Otros'],
  'Pai PVC y polyfan': ['PAI','PVC espumado','Polyfan','Alto impacto','Corrugado plástico','Panel Wall','1 mm','3 mm','5 mm','10 mm','Otros'],
  'Maderas y otros': ['MDF','Fenólico','Melamina','OSB','Pino','Saligna','Terciado','Listones','3 mm','5 mm','9 mm','12 mm','15 mm','18 mm','Otros'],
  'Lonas y Vinilos': ['Lona front','Lona backlight','Lona blackout','Vinilo blanco','Vinilo transparente','Vinilo de color','Vinilo esmerilado','Vinilo reflectivo','Transfer','Laminado','Oracal','Rollo completo','Por metro','Otros'],
  'Iluminacion': ['Módulos LED','Tiras LED','LED neón','LED píxel','Fuentes 12 V','Drivers','Lámparas','Cableado','Conectores','Controladores','Blanco frío','Blanco cálido','RGB','Otros'],
  'Electricidad': ['Cables','Fichas','Conectores','Llaves','Térmicas','Disyuntores','Enchufes','Terminales','Canaletas','Otros'],
  'Pinturas': ['Sintética','Poliuretánica','Acrílica','Látex','Epoxi','Aerosol','Primer','Galvite','Thinner','Aguarrás','Masilla','Enduido','Rodillos y pinceles','Otros'],
  'Ferreteria': ['Tornillos','Tarugos','Remaches','Arandelas','Tuercas','Bulones','Precintos','Discos de corte','Discos flap','Lijas','Electrodos','Fresas','Herramientas','Guantes','Otros'],
  'Pegamentos': ['Silicona','Cianoacrilato','Suprabond','Adhesivo de contacto','Epoxi','Activador','Otros'],
  'Cintas Autoadhesivas': ['Papel','Embalaje','Bifaz transparente','Bifaz espumada','Aisladora','Duct tape','Transfer','Otros'],
  'Consumibles de Impresión': ['Tintas ecosolventes','Tintas UV','Solvente','Dumpers','Cabezales','Filtros','Paños','Otros'],
  'Elementos de Embalaje': ['Film stretch','Cartón corrugado','Pluriball','Cajas','Cinta','Esquineros','Bolsas','Otros'],
  'Limpieza y Mantenimiento': ['Detergente','Lavandina','Alcohol','Desodorante','Papel','Trapos','Rejillas','Esponjas','Otros'],
  'Librería': ['Papel','Resmas','Fibrones','Lapiceras','Folios','Carpetas','Otros'],
  'Consumibles Fabrica': ['Agua','Bolsas','Elementos descartables','Otros'],
  'Combustible': ['Gasoil','Nafta','GNC','Lubricantes','Agua destilada','Otros'],
  'Servicios': ['Energía','Internet','Telefonía','Mantenimiento','Otros'],
  'Colocaciones Externas': ['Mano de obra','Viáticos','Hospedaje','Comidas','Traslados','Relevamientos','Otros'],
  'Cortes / Impresiones Externas': ['Corte láser','Corte CNC','Plegado','Guillotina','Impresión UV','Impresión gran formato','Otros'],
  'Seguros Vehiculos': ['Seguro automotor','Seguro de carga','Otros'],
  'Seguros Personales': ['ART','Accidentes personales','Vida','Otros'],
  'Alquiler': ['Inmueble','Máquinas','Herramientas','Vehículos','Otros'],
  'Comidas': ['Comidas','Bebidas','Refrigerios','Otros'],
  'Sueldos': ['Personal interno','Personal externo','Adelantos','Bonos','Otros'],
  'Publicidad': ['Google Ads','Meta Ads','Diseño','Producción audiovisual','Otros'],
  'Comisiones': ['Ventas','Referidos','Bancarias','Otros'],
  'Estacionamiento': ['Estacionamiento','Peajes','Otros'],
  'Bonos': ['Bonos','Premios','Otros']
};
const familyOptions=()=>{const source=window.TIZComprasBaseDatosV1?.stats?.()||{};return uniqueSorted([...Object.keys(TIZ_FAMILIAS),...C.articulos.map(a=>a.familia),...CATALOGO_TIZ_BASE.map(a=>a.familia),...(source.rubros||[]),...(source.referenceRubros||[])].map(v=>String(v||'').trim()).filter(Boolean));};
const subfamilyOptions=family=>uniqueSorted([...Object.entries(TIZ_FAMILIAS).filter(([key])=>normText(key)===normText(family)).flatMap(([,values])=>values),...C.articulos.filter(a=>normText(a.familia)===normText(family)).map(a=>a.subfamilia)].filter(Boolean));
function setSubfamilyList(listId,family){const dl=document.getElementById(listId);if(dl)dl.innerHTML=subfamilyOptions(family).map(v=>`<option value="${esc(v)}"></option>`).join('');}
window.cpArticleFamilyChanged=()=>{const family=document.getElementById('cp-a-family')?.value||'';setSubfamilyList('cp-subfamily-list',family);};
function attachFamilySuggestions(tr){const fam=tr.querySelector('.i-family'),sub=tr.querySelector('.i-subfamily');if(!fam||!sub)return;const uid=Math.random().toString(36).slice(2);const fdl=document.createElement('datalist');fdl.id='cp-row-fam-'+uid;fdl.innerHTML=familyOptions().map(v=>`<option value="${esc(v)}"></option>`).join('');const sdl=document.createElement('datalist');sdl.id='cp-row-sub-'+uid;tr.append(fdl,sdl);fam.setAttribute('list',fdl.id);sub.setAttribute('list',sdl.id);const refresh=()=>{sdl.innerHTML=subfamilyOptions(fam.value).map(v=>`<option value="${esc(v)}"></option>`).join('');};fam.addEventListener('input',refresh);fam.addEventListener('change',refresh);refresh();}

const money = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(n)||0);
const num = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let s = String(value ?? '').trim().replace(/\s/g,'').replace(/\$/g,'');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) {
    // Formato argentino: 1.234,56
    s = s.replace(/\./g,'').replace(',','.');
  } else if (s.includes(',')) {
    s = s.replace(',','.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const todayISO = () => new Date().toISOString().slice(0,10);
const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR') : '—';
const weekKey = (d=new Date()) => {
  const x = new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate()+4-day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(),0,1));
  return `${x.getUTCFullYear()}-S${String(Math.ceil((((x-yearStart)/86400000)+1)/7)).padStart(2,'0')}`;
};
const toast = msg => window.showToast ? window.showToast(msg) : alert(msg);
purchaseFilters = {period:'month',week:weekKey(),month:todayISO().slice(0,7),from:'',to:'',search:'',proveedor:'',familia:'',subfamilia:'',fc:''};

const normText=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const uniqueSorted=values=>[...new Set(values.filter(Boolean).map(String))].sort((a,b)=>a.localeCompare(b,'es'));
function similarityScore(a,b){const x=normText(a),y=normText(b);if(!x||!y)return 0;if(x===y)return 1;if(x.includes(y)||y.includes(x))return .88;const ax=new Set(x.split(' ').filter(t=>t.length>1)),by=new Set(y.split(' ').filter(t=>t.length>1));const inter=[...ax].filter(t=>by.has(t)).length,union=new Set([...ax,...by]).size;return union?inter/union:0;}
function findBestArticle(text){let best=null,score=0;C.articulos.forEach(a=>{const s=Math.max(similarityScore(text,a.descripcion),similarityScore(text,a.codigo));if(s>score){score=s;best=a;}});return score>=.58?{article:best,score}:null;}
function articleByDescription(value){const n=normText(value);return C.articulos.find(a=>normText(a.descripcion)===n||normText(a.codigo)===n);}

function injectStyles(){
  if(document.getElementById('tiz-compras-v21-styles')) return;
  const st=document.createElement('style');
  st.id='tiz-compras-v21-styles';
  st.textContent=`
  #page-compras{padding:18px 20px 70px;overflow:auto}
  .cp-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap}
  .cp-title{font-size:22px;font-weight:800}.cp-sub{font-size:12px;color:var(--text3);margin-top:3px}
  .cp-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 16px}.cp-tab{border:1px solid var(--border);background:var(--surface);color:var(--text2);border-radius:8px;padding:7px 11px;cursor:pointer;font-size:12px}.cp-tab.active{background:var(--accent);color:#17120a;border-color:var(--accent);font-weight:800}
  .cp-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px}.cp-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px}.cp-kpi{font:700 24px 'DM Mono',monospace;margin-top:5px}.cp-lbl{font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em}
  .cp-alert{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--border);background:var(--surface);padding:11px;border-radius:10px;margin-bottom:7px}.cp-alert.red{border-left:4px solid var(--red)}.cp-alert.amber{border-left:4px solid var(--amber)}.cp-alert.green{border-left:4px solid var(--green)}
  .cp-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:11px;background:var(--surface)}.cp-table{width:100%;border-collapse:collapse;min-width:980px}.cp-table th,.cp-table td{padding:8px 9px;border-bottom:1px solid var(--border);font-size:11px;text-align:left}.cp-table th{position:sticky;top:0;background:var(--surface2);color:var(--text3);text-transform:uppercase}.cp-table tr:hover td{background:rgba(255,255,255,.018)}
  .cp-pill{display:inline-flex;border-radius:99px;padding:3px 7px;font-size:10px;font-weight:700}.cp-pill.yes{background:rgba(61,191,160,.14);color:var(--green)}.cp-pill.no{background:rgba(239,91,91,.14);color:var(--red)}.cp-pill.warn{background:rgba(232,160,32,.14);color:var(--amber)}
  .cp-panel{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px}.cp-row{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.cp-field label{display:block;font-size:10px;color:var(--text3);margin-bottom:4px;text-transform:uppercase}.cp-field input,.cp-field select,.cp-field textarea{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:8px;font-size:12px}.cp-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
  .cp-btn{border:0;border-radius:8px;padding:8px 11px;cursor:pointer;font-weight:700;font-size:11px;background:var(--surface3);color:var(--text)}.cp-btn.primary{background:var(--accent);color:#17120a}.cp-btn.danger{background:rgba(239,91,91,.15);color:var(--red)}
  .cp-btn:disabled{opacity:.45;cursor:not-allowed}#cp-ingreso>.cp-btn{margin:4px 5px 0 0}#cp-items-gate:disabled{opacity:.5}#cp-modal-new-insumo .cp-row{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cp-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:12000;display:none;align-items:flex-start;justify-content:center;padding:22px;overflow:auto}.cp-modal-bg.open{display:flex}.cp-modal{width:min(1100px,100%);background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:16px;box-shadow:0 25px 80px #000}.cp-modal h2{margin:0 0 12px}.cp-items{width:100%;border-collapse:collapse;min-width:900px}.cp-items th,.cp-items td{padding:5px}.cp-items input,.cp-items select{width:100%;padding:7px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:6px}
  .cp-confidence{height:6px;background:var(--surface3);border-radius:99px;overflow:hidden}.cp-confidence>span{display:block;height:100%;background:var(--green)}
  .cp-filter-grid{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:8px}.cp-filter-summary{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:8px;margin-top:10px}.cp-filter-summary .cp-card{padding:10px}.cp-item-match{font-size:9px;margin-top:4px;color:var(--text3)}

  #cp-modal-compra>.cp-modal{width:min(1700px,100%);box-sizing:border-box}
  #cp-items-panel .cp-items th:nth-child(1),#cp-items-panel .cp-items td:nth-child(1){min-width:360px;width:360px}
  #cp-items-panel .cp-items th:nth-child(2),#cp-items-panel .cp-items td:nth-child(2){min-width:420px;width:420px}
  #cp-items-panel .cp-items td{vertical-align:top}
  #cp-items-panel .cp-items input,#cp-items-panel .cp-items textarea{box-sizing:border-box}
  #cp-items-panel .cp-items .i-original{min-height:96px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45}
  .cp-full-desc{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45;font-size:13px;font-weight:600;color:var(--text);margin:6px 0}

  .cp-items{min-width:1500px}.cp-items th:nth-child(1),.cp-items td:nth-child(1){min-width:330px;width:330px}.cp-items th:nth-child(2),.cp-items td:nth-child(2){min-width:280px;width:280px}.cp-items textarea{width:100%;min-height:58px;resize:vertical;padding:7px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:6px;line-height:1.3}.cp-original{opacity:.92}.cp-match-ok{color:var(--green)}.cp-match-warn{color:var(--amber)}

  /* V25 · Panel financiero visual */
  #page-compras{max-width:1700px;margin:0 auto}
  #page-compras .cp-head{padding:2px 2px 0}
  #page-compras .cp-tabs{border-bottom:1px solid var(--border);gap:26px;margin:4px 0 14px;padding:0 8px}
  #page-compras .cp-tab{border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;padding:10px 2px;color:var(--text2)}
  #page-compras .cp-tab.active{background:transparent;color:#3b82f6;border-bottom-color:#3b82f6}
  .cp-pay-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}
  .cp-pay-title{font-size:16px;font-weight:800}.cp-pay-buttons{display:flex;gap:8px;flex-wrap:wrap}
  .cp-btn.blue{background:#1463d9;color:#fff}.cp-btn.outline{background:transparent;border:1px solid var(--border);color:var(--text)}
  .cp-pay-kpis{display:grid;grid-template-columns:repeat(5,minmax(170px,1fr));gap:10px;margin-bottom:10px}
  .cp-pay-kpi{position:relative;overflow:hidden;background:linear-gradient(145deg,var(--surface),rgba(18,39,56,.78));border:1px solid var(--border);border-radius:10px;padding:12px 14px;min-height:82px}
  .cp-pay-kpi:before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--kpi-color,#3b82f6)}
  .cp-pay-kpi .cp-lbl{color:var(--kpi-color,#3b82f6);font-weight:800}.cp-pay-kpi .cp-kpi{font-size:19px;color:var(--kpi-color,#fff)}
  .cp-pay-layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(350px,.85fr);gap:10px;margin-bottom:10px}
  .cp-pay-section{background:linear-gradient(145deg,var(--surface),rgba(13,31,45,.84));border:1px solid var(--border);border-radius:10px;padding:12px}
  .cp-pay-section h3{font-size:13px;margin:0 0 10px}.cp-week-grid{display:grid;grid-template-columns:repeat(5,minmax(130px,1fr));gap:8px}
  .cp-week-card-v25{border:1px solid color-mix(in srgb,var(--week-color) 35%,var(--border));background:color-mix(in srgb,var(--week-color) 7%,var(--surface2));border-radius:8px;padding:10px;min-height:100px}
  .cp-week-card-v25 .wk{font-size:11px;color:var(--week-color);font-weight:800}.cp-week-card-v25 .range{font-size:10px;color:var(--text3);margin:3px 0 8px}.cp-week-card-v25 .amount{font:800 18px 'DM Mono',monospace;color:var(--week-color)}.cp-week-card-v25 .count{font-size:10px;color:var(--text3);margin-top:5px}
  .cp-bars{height:170px;display:flex;align-items:flex-end;gap:14px;padding:16px 12px 4px;border-left:1px solid var(--border);border-bottom:1px solid var(--border)}
  .cp-bar-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;min-width:42px}.cp-bar-value{font-size:10px;margin-bottom:5px}.cp-bar{width:min(48px,75%);min-height:3px;border-radius:4px 4px 0 0;background:var(--bar-color)}.cp-bar-label{font-size:10px;color:var(--text3);margin-top:5px}
  .cp-pay-table .cp-table{min-width:1180px}.cp-pay-table .cp-table th{font-size:9px}.cp-pay-table .cp-table td{padding:7px 8px}
  .cp-status{display:inline-flex;border-radius:5px;padding:3px 7px;font-size:9px;font-weight:800}.cp-status.overdue{background:rgba(239,68,68,.18);color:#ff5a5a}.cp-status.due{background:rgba(245,158,11,.18);color:#ffb000}.cp-status.pending{background:rgba(59,130,246,.16);color:#5fa2ff}
  .cp-icon-btn{width:27px;height:27px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text2);cursor:pointer;padding:0}.cp-icon-btn.ok{color:#23d784;background:rgba(35,215,132,.1)}.cp-icon-btn.edit{color:#4f9cff;background:rgba(79,156,255,.1)}.cp-icon-btn.delete{color:#ff5353;background:rgba(255,83,83,.1)}
  .cp-pay-bottom{display:grid;grid-template-columns:minmax(440px,1.15fr) minmax(420px,1fr) minmax(240px,.58fr);gap:10px;margin-top:10px}.cp-info-row{display:flex;gap:9px;align-items:flex-start;margin:0 0 14px;font-size:11px;color:var(--text2)}.cp-info-icon{width:28px;height:28px;border-radius:7px;display:grid;place-items:center;background:rgba(59,130,246,.13);color:#5fa2ff;flex:none}
  .cp-empty-chart{display:grid;place-items:center;height:150px;color:var(--text3);font-size:11px}
  @media(max-width:1250px){.cp-pay-kpis{grid-template-columns:repeat(3,1fr)}.cp-pay-layout,.cp-pay-bottom{grid-template-columns:1fr}.cp-week-grid{grid-template-columns:repeat(3,1fr)}}
  @media(max-width:750px){.cp-pay-kpis,.cp-week-grid{grid-template-columns:1fr}.cp-pay-bottom{grid-template-columns:1fr}.cp-pay-section{padding:9px}}
  /* V26.1 · Vista final aprobada */
  .cp-pay-kpis{grid-template-columns:repeat(6,minmax(145px,1fr))}
  .cp-pay-kpi{display:grid;grid-template-columns:42px 1fr;column-gap:10px;align-items:center;padding:13px;min-height:92px}
  .cp-pay-kpi .cp-kpi-icon{grid-row:1/4;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;border:2px solid var(--kpi-color);color:var(--kpi-color);font-size:19px;background:color-mix(in srgb,var(--kpi-color) 10%,transparent)}
  .cp-pay-kpi .cp-lbl,.cp-pay-kpi .cp-kpi,.cp-pay-kpi .cp-sub{grid-column:2}
  .cp-pay-kpi .cp-kpi{margin-top:1px}
  .cp-pay-workspace{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:10px;margin-top:10px}
  .cp-pay-main{min-width:0}
  .cp-payment-summary{display:flex;flex-direction:column;gap:0}
  .cp-method-row{display:grid;grid-template-columns:34px 1fr auto;gap:9px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)}
  .cp-method-icon{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;font-weight:900;background:color-mix(in srgb,var(--method-color) 18%,var(--surface2));color:var(--method-color)}
  .cp-method-name{font-size:11px;font-weight:700}.cp-method-count{font-size:9px;color:var(--text3);margin-top:2px}.cp-method-amount{font:700 12px 'DM Mono',monospace;text-align:right}
  .cp-pay-filters{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr)) auto auto;gap:8px;align-items:center;margin-bottom:10px}
  .cp-pay-filters select,.cp-pay-filters input{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:8px;font-size:11px}
  .cp-quick-filters{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
  .cp-quick{border:1px solid var(--border);background:var(--surface2);color:var(--text2);padding:7px 9px;border-radius:7px;font-size:10px;cursor:pointer}.cp-quick.active{border-color:var(--accent);color:var(--accent);background:rgba(232,184,75,.08)}
  .cp-empty-pay{text-align:center;padding:44px 20px;color:var(--text3)}.cp-empty-pay .icon{font-size:38px;margin-bottom:10px}.cp-empty-pay strong{display:block;color:var(--text2);font-size:13px;margin-bottom:4px}.cp-empty-actions{display:flex;gap:8px;justify-content:center;margin-top:15px;flex-wrap:wrap}
  .cp-pay-footer{border:1px solid rgba(232,184,75,.28);background:rgba(232,184,75,.05);border-radius:9px;padding:12px;margin-top:10px;font-size:10px;color:var(--text2)}
  @media(max-width:1450px){.cp-pay-kpis{grid-template-columns:repeat(3,1fr)}}
  @media(max-width:1100px){.cp-pay-workspace{grid-template-columns:1fr}.cp-pay-filters{grid-template-columns:1fr 1fr}.cp-quick-filters{grid-column:1/-1;justify-content:flex-start}}
  @media(max-width:700px){.cp-pay-kpis{grid-template-columns:1fr}.cp-pay-filters{grid-template-columns:1fr}}
  /* V27 · controles rápidos por checks */
  .cp-check-board{display:grid;grid-template-columns:repeat(3,minmax(250px,1fr));gap:10px}
  .cp-ot-card{background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:12px;position:relative}
  .cp-ot-card.late{border-left:4px solid var(--red)}.cp-ot-card.warn{border-left:4px solid var(--amber)}.cp-ot-card.ok{border-left:4px solid var(--green)}
  .cp-ot-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:9px}.cp-ot-title{font-size:12px;font-weight:800}.cp-ot-meta{font-size:10px;color:var(--text3);margin-top:2px}
  .cp-mini-checks{display:grid;grid-template-columns:1fr 1fr;gap:6px}.cp-mini-check{display:flex;align-items:center;gap:7px;border:1px solid var(--border);background:var(--surface2);border-radius:7px;padding:7px;font-size:10px;color:var(--text2);cursor:pointer}.cp-mini-check.done{color:var(--green);border-color:rgba(76,175,125,.28);background:rgba(76,175,125,.06)}.cp-mini-check input{accent-color:var(--green)}
  .cp-progress-line{height:5px;background:var(--surface3);border-radius:99px;overflow:hidden;margin:9px 0 5px}.cp-progress-line span{display:block;height:100%;background:var(--green)}
  .cp-price-alert{font-size:9px;margin-top:3px;padding:3px 5px;border-radius:5px;display:none}.cp-price-alert.show{display:block}.cp-price-alert.warn{background:rgba(232,160,32,.15);color:var(--amber)}.cp-price-alert.danger{background:rgba(224,92,92,.16);color:var(--red)}
  .col-v27-board{margin-top:16px}.col-v27-grid{display:grid;grid-template-columns:repeat(2,minmax(320px,1fr));gap:10px}.col-v27-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px}.col-v27-card.ready{border-left:4px solid var(--green)}.col-v27-card.pending{border-left:4px solid var(--amber)}
  .col-v27-checks{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:9px}.col-v27-check{display:flex;gap:5px;align-items:center;background:var(--surface2);border:1px solid var(--border);padding:7px;border-radius:7px;font-size:9px;cursor:pointer}.col-v27-check.done{color:var(--green);background:rgba(76,175,125,.06)}
  @media(max-width:1100px){.cp-check-board{grid-template-columns:1fr 1fr}.col-v27-grid{grid-template-columns:1fr}.col-v27-checks{grid-template-columns:1fr 1fr}}
  @media(max-width:700px){.cp-check-board{grid-template-columns:1fr}.cp-mini-checks{grid-template-columns:1fr}.col-v27-checks{grid-template-columns:1fr}}

  /* V28 · Ayudamemorias y operación simplificada */
  .am-btn{border:1px solid rgba(232,184,75,.38);background:rgba(232,184,75,.08);color:var(--accent);border-radius:7px;padding:7px 9px;font-size:10px;font-weight:700;cursor:pointer}
  .am-list{display:flex;flex-direction:column;gap:6px;margin-top:9px}
  .am-item{display:grid;grid-template-columns:22px 1fr auto;gap:7px;align-items:start;border:1px solid var(--border);background:var(--surface2);border-radius:8px;padding:8px}
  .am-item.done{opacity:.58}.am-item.done .am-text{text-decoration:line-through}
  .am-check{margin-top:2px;accent-color:var(--green)}.am-text{font-size:10px;line-height:1.35}.am-meta{font-size:9px;color:var(--text3);margin-top:3px}.am-badge{font-size:8px;border-radius:99px;padding:3px 6px;white-space:nowrap;background:rgba(79,156,255,.12);color:#6caaff}.am-badge.alerta{background:rgba(239,68,68,.14);color:#ff6464}.am-badge.tarea{background:rgba(245,158,11,.14);color:#ffb000}
  .am-modal-card{width:min(520px,95vw);background:var(--surface);border:1px solid var(--border);border-radius:13px;box-shadow:0 20px 80px rgba(0,0,0,.55)}
  .am-modal-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--border)}.am-modal-body{padding:14px 16px}.am-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.am-field{display:flex;flex-direction:column;gap:5px}.am-field.full{grid-column:1/-1}.am-field label{font-size:9px;color:var(--text3);text-transform:uppercase}.am-field input,.am-field select,.am-field textarea{background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:9px;font-size:11px}.am-quick{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.am-quick button{border:1px solid var(--border);background:var(--surface2);color:var(--text2);border-radius:6px;padding:5px 7px;font-size:9px;cursor:pointer}
  .col-v28-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap}.col-v28-filters{display:flex;gap:7px;flex-wrap:wrap}.col-v28-filters input,.col-v28-filters select{background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:8px;font-size:10px}
  .col-v27-card{position:relative}.col-v27-card.overdue{border-left-color:var(--red)}.col-v27-card .cp-progress-line{margin-top:10px}
  .col-status-row{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:8px}
  @media(max-width:700px){.am-grid{grid-template-columns:1fr}.am-field.full{grid-column:auto}}
  /* V28.1 · Dashboard de Colocaciones */
  .col-dash{padding:16px 28px 24px}.col-dash-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:12px;flex-wrap:wrap}
  .col-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:13px}.col-tab{border:0;background:transparent;color:var(--text3);padding:10px 13px;font-size:10px;font-weight:700;cursor:pointer;border-bottom:2px solid transparent}.col-tab.active{color:var(--accent);border-bottom-color:var(--accent)}
  .col-kpis-v281{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:10px;margin-bottom:12px}.col-kpi-v281{background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:13px;min-height:90px}.col-kpi-v281 .label{font-size:9px;text-transform:uppercase;color:var(--text3)}.col-kpi-v281 .value{font:800 25px 'DM Mono',monospace;margin-top:7px}.col-kpi-v281 .sub{font-size:9px;color:var(--text3);margin-top:5px}
  .col-panel-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(280px,.75fr);gap:10px;margin-bottom:12px}.col-panel{background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:13px}.col-panel-title{font-size:11px;font-weight:800;margin-bottom:10px}.col-progress-list{display:flex;flex-direction:column;gap:10px}.col-progress-row{display:grid;grid-template-columns:minmax(130px,1fr) minmax(180px,2fr) 42px;gap:9px;align-items:center;font-size:10px}.col-progress-track{height:7px;border-radius:99px;background:var(--surface2);overflow:hidden}.col-progress-track span{display:block;height:100%;background:var(--accent);border-radius:99px}.col-alert-list{display:flex;flex-direction:column;gap:7px}.col-alert-item{border:1px solid rgba(239,68,68,.22);background:rgba(239,68,68,.06);border-radius:8px;padding:9px;font-size:10px}.col-alert-item b{display:block;margin-bottom:3px}.col-alert-item span{color:var(--text3)}
  .col-board-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.col-board-filters{display:flex;gap:7px;flex-wrap:wrap}.col-board-filters input,.col-board-filters select{background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:8px;font-size:10px}.col-board-stats{font-size:9px;color:var(--text3)}
  #col-v27-board{margin-top:0}.col-v27-grid{grid-template-columns:repeat(2,minmax(360px,1fr))}.col-v27-card{background:var(--surface2)}
  .col-legacy-wrap{display:none}.col-legacy-wrap.active{display:block}.col-dashboard-view.hidden{display:none}
  @media(max-width:1200px){.col-kpis-v281{grid-template-columns:repeat(3,1fr)}.col-panel-grid{grid-template-columns:1fr}.col-v27-grid{grid-template-columns:1fr}}
  @media(max-width:700px){.col-dash{padding:12px}.col-kpis-v281{grid-template-columns:1fr}.col-progress-row{grid-template-columns:1fr}.col-tabs{overflow:auto}}



  @media(max-width:1000px){.cp-grid{grid-template-columns:repeat(2,1fr)}.cp-row{grid-template-columns:repeat(2,1fr)}.cp-filter-grid{grid-template-columns:repeat(3,1fr)}}
  @media(max-width:650px){#page-compras{padding:12px}.cp-grid,.cp-row,.cp-filter-grid,.cp-filter-summary{grid-template-columns:1fr}.cp-modal-bg{padding:7px}.cp-title{font-size:19px}}
  `;
  document.head.appendChild(st);
}

function injectUI(){
  if(document.getElementById('page-compras')) return;
  const nav=document.querySelector('.nav');
  if(nav && !document.querySelector('[data-cp-nav]')){
    const b=document.createElement('button'); b.className='nav-item'; b.dataset.cpNav='1';
    b.innerHTML='<i>🛒</i><span>Compras</span>'; b.setAttribute('onclick',"goTo('compras')");
    const ref=[...nav.children].find(x=>x.textContent.includes('Cobranzas'));
    nav.insertBefore(b,ref||null);
  }
  const page=document.createElement('section'); page.id='page-compras'; page.className='page';
  page.innerHTML=`
    <div class="cp-head"><div><div class="cp-title">Compras y Proveedores</div><div class="cp-sub">Compras por ítem, deudas, pagos, proveedores, servicios contratados, stock y ayudamemorias.</div></div><div class="cp-actions"><button class="cp-btn" id="cp-resume-ingreso" hidden onclick="cpResumeIngreso()">Retomar compra en curso</button><button class="cp-btn" onclick="cpOpenConfigIA()">⚙ IA comprobantes</button><button class="cp-btn primary" onclick="cpNuevaCompra()">＋ Nueva compra</button></div></div>
    <div class="cp-tabs">
      <button class="cp-tab active" data-tab="inicio">Dashboard</button><button class="cp-tab" data-tab="compras">Compras</button><button class="cp-tab" data-tab="proveedores">Proveedores</button><button class="cp-tab" data-tab="pagos">Deudas y previsiones</button><button class="cp-tab" data-tab="conteo">Stock / conteo</button><button class="cp-tab" data-tab="articulos">Artículos</button><button class="cp-tab" data-tab="equivalencias">Equivalencias</button><button class="cp-tab" data-tab="planes">Materiales por OT</button><button class="cp-tab" data-tab="controlot">Control OT</button><button class="cp-tab" data-tab="alertas">Alertas</button>
    </div><div id="cp-content"></div>`;
  document.querySelector('.main, main, .content')?.appendChild(page) || document.body.appendChild(page);
  page.querySelectorAll('.cp-tab').forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;page.querySelectorAll('.cp-tab').forEach(x=>x.classList.toggle('active',x===b));render();});

  const modal=document.createElement('div'); modal.id='cp-modal-compra'; modal.className='cp-modal-bg';
  modal.innerHTML=`<div class="cp-modal"><div style="display:flex;justify-content:space-between"><h2>Nueva compra detallada</h2><button class="cp-btn" onclick="cpCloseCompra()">✕</button></div>
    <div class="cp-panel"><div class="cp-row">
      <div class="cp-field"><label>Foto/PDF del comprobante</label><input id="cp-file" type="file" accept="image/*,application/pdf" capture="environment"></div>
      <div class="cp-field"><label>Lectura IA</label><button class="cp-btn primary" style="width:100%;margin-top:16px" onclick="cpAnalizarIA()">✨ Analizar comprobante</button><p id="cp-ia-status" role="status" aria-live="polite" style="font-size:12px;line-height:1.4" hidden></p></div>
      <div class="cp-field"><label>Fecha</label><input id="cp-fecha" type="date"></div>
      <div class="cp-field"><label>Proveedor</label><input id="cp-proveedor" placeholder="Ej. Indartubo"></div>
      <div class="cp-field"><label>¿FC?</label><select id="cp-fc"><option value="si">Sí</option><option value="no">No</option></select></div>
      <div class="cp-field"><label>Tipo comprobante</label><select id="cp-tipo"><option>Factura A</option><option>Factura B</option><option>Factura C</option><option>Ticket fiscal</option><option>Remito</option><option>Otro</option><option>Sin comprobante</option></select></div>
      <div class="cp-field"><label>Número</label><input id="cp-numero" placeholder="0001-00001234"></div>
      <div class="cp-field"><label>Medio de pago</label><select id="cp-medio"><option>Transferencia</option><option>Efectivo</option><option>Tarjeta Visa</option><option>Tarjeta Cabal</option><option value="Tarjeta" hidden>Tarjeta (histórica sin identificar)</option><option>Cheque</option><option>Cuenta corriente</option><option>Otro</option></select></div>
      <div class="cp-field"><label>Vencimiento general</label><input id="cp-vencimiento" type="date"></div>
      <div class="cp-field"><label>Condición de pago</label><select id="cp-condicion"><option value="contado">Contado</option><option value="cuenta_corriente">Cuenta corriente</option><option value="cheques">Cheques</option><option value="cuotas">Cuotas / tarjeta</option><option value="otro">Otro</option></select></div>
      <div class="cp-field"><label>Cantidad de pagos</label><input id="cp-cuotas" type="number" min="1" max="36" value="1"></div>
      <div class="cp-field"><label>Primer vencimiento</label><input id="cp-primer-venc" type="date"></div>
      <div class="cp-field"><label>Días entre pagos</label><input id="cp-dias-cuota" type="number" min="1" value="30"></div>
      <div class="cp-field"><label>N.º cheque / referencia</label><input id="cp-ref-pago" placeholder="Opcional"></div>
      <div class="cp-field"><label>Destino por defecto (se puede distribuir cada ítem)</label><select id="cp-destino"><option>Stock</option><option>OT</option><option>Gasto general</option><option>Vehículo</option></select></div>
      <div class="cp-field"><label>OT por defecto</label><input id="cp-ot" placeholder="Ej. 1568"></div><div class="cp-field"><label>Tipo de costo por defecto para OT</label><select id="cp-tipo-costo"><option value="CD">CD · Costo directo</option><option value="EX">EX · Extracosto</option><option value="" hidden>Sin clasificar (histórico)</option></select></div>
      <div class="cp-field"><label>Observación</label><input id="cp-obs"></div>
    </div></div>
    <div id="cp-ingreso" class="cp-panel" hidden></div>
    <div id="cp-items-panel" class="cp-panel"><fieldset id="cp-items-gate" style="border:0;padding:0;min-width:0"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div><b>Ítems del comprobante</b><div class="cp-sub">La descripción original queda visible; vinculá cada línea con el artículo normalizado de TIZ.</div></div><button class="cp-btn" onclick="cpAddItem()">＋ Ítem</button></div><datalist id="cp-catalog-list"></datalist><div style="overflow:auto"><table class="cp-items"><thead><tr><th>Descripción de factura</th><th>Artículo TIZ</th><th>Código</th><th>Familia</th><th>Subfamilia</th><th>Cant.</th><th>Unidad</th><th>P. unit. neto</th><th>IVA %</th><th>Total bruto</th><th></th></tr></thead><tbody id="cp-items-body"></tbody></table></div></fieldset></div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div id="cp-totales" style="font:700 13px 'DM Mono',monospace"></div><div class="cp-actions"><button class="cp-btn" onclick="cpCloseCompra()">Cancelar</button><button class="cp-btn primary" onclick="cpGuardarCompra()">Guardar compra</button></div></div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#cp-file').addEventListener('change',e=>{if(aiCleanupActive)aiCleanupActive('file-change');cpSetIaStatus('');selectedFile=e.target.files?.[0]||null;if(selectedFile){document.getElementById('cp-proveedor').value='';document.getElementById('cp-numero').value='';document.getElementById('cp-fecha').value='';document.getElementById('cp-items-body').replaceChildren();cpStartIngreso({});window.cpAddItem();}else cpResetIngreso();});
  modal.querySelector('#cp-fc').addEventListener('change',syncFC);

  const pay=document.createElement('div'); pay.id='cp-modal-pago'; pay.className='cp-modal-bg';
  pay.innerHTML=`<div class="cp-modal" style="max-width:760px"><div style="display:flex;justify-content:space-between"><h2>Cargar compromiso de pago</h2><button class="cp-btn" onclick="cpClosePago()">✕</button></div><div class="cp-panel"><div class="cp-row"><div class="cp-field"><label>Proveedor / beneficiario</label><input id="cp-p-proveedor"></div><div class="cp-field"><label>Concepto</label><input id="cp-p-concepto"></div><div class="cp-field"><label>Importe</label><input id="cp-p-importe" type="number" step="0.01"></div><div class="cp-field"><label>Vencimiento</label><input id="cp-p-venc" type="date"></div><div class="cp-field"><label>Medio</label><select id="cp-p-medio"><option>Cuenta corriente</option><option>Cheque</option><option>Transferencia</option><option>Tarjeta Visa</option><option>Tarjeta Cabal</option><option value="Tarjeta" hidden>Tarjeta (histórica sin identificar)</option><option>Efectivo</option><option>Otro</option></select></div><div class="cp-field"><label>N.º cheque / referencia</label><input id="cp-p-ref"></div><div class="cp-field"><label>OT</label><input id="cp-p-ot"></div><div class="cp-field"><label>Observación</label><input id="cp-p-obs"></div></div></div><div style="text-align:right"><button class="cp-btn primary" onclick="cpSavePagoManual()">Guardar compromiso</button></div></div>`;
  document.body.appendChild(pay);

  const cfg=document.createElement('div'); cfg.id='cp-modal-ia'; cfg.className='cp-modal-bg';
  cfg.innerHTML=`<div class="cp-modal" style="max-width:650px"><div style="display:flex;justify-content:space-between"><h2>Configuración IA de comprobantes</h2><button class="cp-btn" onclick="cpCloseConfigIA()">✕</button></div><p style="font-size:12px;color:var(--text2)">La conexión se comparte con los usuarios autorizados de TIZ. Pegá una sola vez el enlace privado completo de Apps Script. La clave API de Gemini permanece guardada en Apps Script.</p><div class="cp-field"><label>Enlace privado de conexión compartida</label><input id="cp-ia-url" placeholder="https://script.google.com/macros/s/…/exec/…"></div><div style="margin-top:12px;text-align:right"><button class="cp-btn primary" onclick="cpSaveConfigIA()">Guardar</button></div></div>`;
  document.body.appendChild(cfg);
}

function syncFC(){
  const yes=document.getElementById('cp-fc').value==='si';
  const tipo=document.getElementById('cp-tipo');
  if(!yes) tipo.value='Sin comprobante';
  tipo.disabled=!yes;
}

function startListeners(){
  const listen=(name,key)=>onSnapshot(['articulos','proveedores','compras','conteos','planes'].includes(key)?collection(db,name):query(collection(db,name),orderBy('_ts','desc'),limit(1000)),s=>{C[key]=s.docs.map(d=>({id:d.id,...d.data()}));render();cpRefreshIngreso();},()=>{
    onSnapshot(collection(db,name),s=>{C[key]=s.docs.map(d=>({id:d.id,...d.data()}));render();});
  });
  listen('compras','compras'); listen('articulosCompra','articulos'); listen('conteosStock','conteos'); listen('planesMateriales','planes'); listen('pagosCompra','pagos'); listen('proveedoresCompra','proveedores'); listen('analisisComprasOT','analisisOT'); listen('preparacionColocaciones','preparacionCol'); listen('ayudamemoriasOT','ayudamemorias');
}

function render(){
  if(window.currentPage!=='compras') return;
  cpCaptureProviderDraft();
  if(currentTab==='proveedores'&&document.getElementById('cp-prov-id')&&(cpIngreso?.editingProvider||(document.activeElement?.matches('input,textarea,select')&&document.activeElement.closest('#cp-provider-form'))))return;
  cpRefreshMother();
  const el=document.getElementById('cp-content'); if(!el)return;
  ({inicio:renderInicio,compras:renderCompras,proveedores:renderProveedores,pagos:renderPagos,conteo:renderConteo,articulos:renderArticulos,equivalencias:renderEquivalencias,planes:renderPlanes,controlot:renderControlOT,alertas:renderAlertas}[currentTab]||renderInicio)(el);
  if(currentTab==='inicio')el.insertAdjacentHTML('afterbegin',`<div class="cp-panel"><div class="cp-actions" style="justify-content:space-between"><div><b>${cpWorks().length} obras para Compras</b><p class="cp-sub">Pendiente / Cobrado pendiente de TIZ 2026 y obras nuevas, sin duplicar OT.</p></div><button class="cp-btn primary" onclick="cpTab('planes')">Ver materiales por OT</button></div>${cpMotherState()}</div>`);
  if(cpIngreso?.editingProvider&&currentTab==='proveedores'){cpFillProvider(cpIngreso.providerDraft);cpShowProviderReturn();cpMarkProviderPending();}
  cpRefreshIngreso();
}

// One canonical stock view, while invoice quantities and their units stay unchanged.
let cpStockRefs=[],cpStockCache=[];
function cpStockArticle(a){return window.TIZInsumosCotizacionCoreV1?.baseArticle(a)||a;}
function cpStockSnapshot(){const refs=[C.articulos,C.compras,C.conteos,C.planes];if(refs.some((r,i)=>r!==cpStockRefs[i])){cpStockCache=window.TIZInsumosCotizacionCoreV1?.catalog(...refs)||[];cpStockRefs=refs;}return cpStockCache;}
function cpStockMeta(a){return cpStockSnapshot().find(x=>x.id===a?.id);}
function cpStockAmount(row,a,value){
 const core=window.TIZInsumosCotizacionCoreV1;if(!core)return num(value??row.cantidad);
 if(value!==undefined&&Number(value)<0)throw Error('La reserva de material no puede ser negativa.');const item=value===undefined?row:{...row,cantidad:value,cantidadStock:undefined};return core.movementQuantity(item,a);
}
function cpStockUnitData(tr){
 const a=C.articulos.find(a=>a.id===tr.dataset.articleId),q=num(tr.querySelector('.i-qty')?.value),p=num(tr.querySelector('.i-price')?.value),unit=tr.querySelector('.i-unit')?.value||'';
 if(!a)return {error:'Vinculá el insumo del catálogo para convertir la unidad de la compra.'};
 const core=window.TIZInsumosCotizacionCoreV1,original=tr.dataset.unidadComprobanteOriginal||'';
 if(core&&original&&core.unit(original)!==core.unit(unit)&&tr.dataset.unitCorrectionConfirmed!=='1')return {error:'La unidad seleccionada ('+unit+') difiere de la leída en el comprobante ('+original+'). Confirmá la corrección.',needsUnitConfirmation:true};
 if(tr.dataset.stockMovementOriginal){try{const previous=JSON.parse(tr.dataset.stockMovementOriginal);if(previous.articuloId===a.id&&previous.cantidad===q&&previous.precio===p&&core?.unit(previous.unidad)===core?.unit(unit)&&Number.isFinite(previous.cantidadStock)&&previous.cantidadStock>0&&q>0&&previous.unidadStock){const factor=Number.isFinite(previous.factorStock)?previous.factorStock:previous.cantidadStock/q;return {cantidadStock:previous.cantidadStock,unidadStock:previous.unidadStock,factorStock:factor,precioUnitarioStock:Number.isFinite(previous.precioUnitarioStock)?previous.precioUnitarioStock:p/factor};}}catch{}}

 if(a.control==='sin_stock')return {cantidadStock:null,unidadStock:'',sinStock:true};
 try{const view=cpStockArticle(a),quantity=window.TIZInsumosCotizacionCoreV1?window.TIZInsumosCotizacionCoreV1.stockQuantity(q,unit,view):q;return {cantidadStock:quantity,unidadStock:view.unidad,factorStock:quantity/q,precioUnitarioStock:p/(quantity/q)};}catch(e){return {error:e.message};}
}

function cpUnitPreviewPurchase(tr){
 const row={articuloId:tr.dataset.articleId||'',cantidad:tr.querySelector('.i-qty').value,unidad:tr.querySelector('.i-unit').value,precioUnitarioNeto:tr.querySelector('.i-price').value,ivaPorcentaje:tr.querySelector('.i-iva').value};
 // Only an unchanged saved movement keeps its historical conversion.
 try{const prior=JSON.parse(tr.dataset.stockMovementOriginal||'null'),core=window.TIZInsumosCotizacionCoreV1;if(prior&&prior.articuloId===row.articuloId&&prior.cantidad===num(row.cantidad)&&prior.precio===num(row.precioUnitarioNeto)&&core.unit(prior.unidad)===core.unit(row.unidad)&&Number.isFinite(prior.cantidadStock)&&prior.cantidadStock>0&&prior.unidadStock){row.cantidadStock=prior.cantidadStock;row.unidadStock=prior.unidadStock;}}catch{}
 return row;
}


function cpComparableCostHtml(meta){
 const unit=meta.unidadCosto||'',gross=Number.isFinite(meta.ultimoCostoCompraConIVA)?'<b>'+money(meta.ultimoCostoCompraConIVA)+' / '+esc(unit)+' con IVA</b>':'Con IVA: pendiente';
 const net=Number.isFinite(meta.ultimoCostoCompraNeto)?money(meta.ultimoCostoCompraNeto)+' / '+esc(unit)+' netos':'Neto: pendiente';
 return gross+'<div class="cp-sub">'+net+'</div>'+(meta.fechaCosto?'<div class="cp-sub">'+esc(fmtDate(meta.fechaCosto))+' · '+esc(meta.proveedor||'Sin proveedor')+'</div>':'')+(meta.errorCostoCompra?'<div class="cp-sub">'+esc(meta.errorCostoCompra)+'</div>':'');
}
function cpPurchaseCostFields(item,article){
 const core=window.TIZInsumosCotizacionCoreV1;if(!core||!article)return {};
 try{return core.comparablePurchaseCost(item,article);}catch(e){return {unidadCosto:core.purchaseCostUnit(article,item),cantidadCosto:null,precioUnitarioCostoNeto:null,precioUnitarioCostoConIVA:null,costoComparadoPendiente:e.message};}
}
function cpRefreshPurchaseCost(tr,article,box){
 const i=cpUnitPreviewPurchase(tr),cost=cpPurchaseCostFields(i,article),current=document.createElement('div');current.className='cp-sub';
 current.textContent=Number.isFinite(cost.precioUnitarioCostoConIVA)?'Esta compra: '+money(cost.precioUnitarioCostoConIVA)+' / '+cost.unidadCosto+' con IVA · '+money(cost.precioUnitarioCostoNeto)+' netos':'Esta compra: costo por '+(cost.unidadCosto||'unidad')+' pendiente. '+(cost.costoComparadoPendiente||'');box.append(current);
 const previous=compraEditId?window.TIZInsumosCotizacionCoreV1.catalog([article],C.compras.filter(c=>c.id!==compraEditId),[],[])[0]:cpStockMeta(article);
 const old=document.createElement('div');old.className='cp-sub';old.innerHTML='<b>Última compra guardada</b><br>'+cpComparableCostHtml(previous||{});box.append(old);
}
function cpEquivalenceLabel(article){
 const core=window.TIZInsumosCotizacionCoreV1;if(!core)return '';
 try{const view=core.baseArticle(article),purchase=core.unit(article.unidadCompraPreferida||article.unidad),quantity=core.stockQuantity(1,purchase,view);return '1 '+purchase+' = '+Number(quantity.toPrecision(12)).toLocaleString('es-AR',{maximumFractionDigits:8})+' '+view.unidad;}catch{return 'Equivalencia pendiente';}
}
function renderEquivalencias(el){
 const families=familyOptions();el.innerHTML=`<div class="cp-panel"><b>Unidades y equivalencias</b><p class="cp-sub">Elegí el insumo y abrí Equivalencias. Podés comprar por rollo o placa y controlar el stock en m². En maderas está disponible el formato de placa de 1,83 × 2,75 m (5,0325 m²).</p><div class="cp-row"><div class="cp-field"><label>Buscar insumo</label><input id="cp-art-search" oninput="cpRenderArticleRows()" placeholder="Código, MDF, melamina, vinilo…"></div><div class="cp-field"><label>Familia</label><select id="cp-art-family" onchange="cpRenderArticleRows()"><option value="">Todas</option>${families.map(v=>`<option>${esc(v)}</option>`).join('')}</select></div></div></div><div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Código</th><th>Artículo</th><th>Familia</th><th>Subfamilia</th><th>Unidad de control / equivalencia</th><th>Control</th><th>Mínimo</th><th>Última compra / costo comparable</th><th>Stock disponible</th><th></th></tr></thead><tbody id="cp-art-rows"></tbody></table></div>`;window.cpRenderArticleRows();
}

function cpRefreshUnitNotices(){
 if(!window.TIZInsumosCotizacionCoreV1)return;
 document.querySelectorAll('#cp-items-body tr').forEach(tr=>{const note=tr.querySelector('.cp-item-match');if(!note)return;let box=note.querySelector?.('.cp-stock-unit-notice');if(!box){box=document.createElement('div');box.className='cp-stock-unit-notice';note.append(box);}const data=cpStockUnitData(tr),a=C.articulos.find(a=>a.id===tr.dataset.articleId);box.replaceChildren();box.style.color=data.error?'var(--red)':'var(--text2)';const label=document.createElement('div');label.textContent=data.error|| (data.sinStock?'Servicio / sin movimiento físico de stock.':'Ingreso de stock: '+Number(data.cantidadStock).toLocaleString('es-AR')+' '+data.unidadStock+'. Se conserva la cantidad y el precio del comprobante.');box.append(label);if(data.needsUnitConfirmation){const confirm=document.createElement('button');confirm.type='button';confirm.className='cp-btn';confirm.textContent='Confirmar corrección de unidad del comprobante';confirm.onclick=()=>{tr.dataset.unitCorrectionConfirmed='1';if(cpIngreso)cpIngreso.reviewed='';calcTotals();cpRefreshIngreso();};box.append(confirm);}if(a){cpRefreshPurchaseCost(tr,a,box);const button=document.createElement('button');button.type='button';button.className='cp-btn';button.textContent='Unidades y equivalencias';button.onclick=()=>window.TIZUnidadesStockV1?.open(a.id,{unidadCompra:tr.querySelector('.i-unit').value,compraActual:()=>cpUnitPreviewPurchase(tr)});box.append(button);}});
}
function cpPurchaseUnitOptions(value){const core=window.TIZInsumosCotizacionCoreV1,selected=core?.unit(value||'UNID')||value||'UNID',units=[...new Set([selected,...(core?.units||['UNID','ROLLO','PLACA','M²','MTS LINEALES','KG','LITRO','SERVICIO'])])];return units.map(u=>'<option value="'+esc(u)+'" '+(u===selected?'selected':'')+'>'+esc(u)+'</option>').join('');}
window.cpAfterStockUnitsChanged=article=>{C.articulos=C.articulos.map(a=>a.id===article.id?{...a,...article}:a);cpStockRefs=[];cpRefreshUnitNotices();if(window.currentPage==='compras'){cpRenderArticleRows();if(['conteo','planes','alertas'].includes(currentTab))render();}calcTotals();};

function purchaseItems(){ return C.compras.flatMap(c=>(c.items||[]).map(i=>({...i,compra:c}))); }
function latestCounts(){
  const map={}; [...C.conteos].sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))).forEach(c=>{(c.items||[]).forEach(i=>{if(!map[i.articuloId||i.descripcion])map[i.articuloId||i.descripcion]={...i,conteo:c};});}); return map;
}
function alerts(){
  const out=[]; const now=new Date();
  C.compras.forEach(c=>{
    if(c.fc==='no') out.push({level:'amber',title:`Compra sin factura: ${c.proveedor||'Sin proveedor'}`,text:`${fmtDate(c.fecha)} · ${money(c.totalBruto)} · solicitar comprobante.`});
    if(c.vencimiento){const dd=Math.ceil((new Date(c.vencimiento+'T12:00:00')-now)/86400000);if(dd<0)out.push({level:'red',title:`Pago vencido: ${c.proveedor}`,text:`Venció hace ${Math.abs(dd)} días · ${money(c.totalBruto)}`});else if(dd<=7)out.push({level:'amber',title:`Pago próximo: ${c.proveedor}`,text:`Vence en ${dd} días · ${money(c.totalBruto)}`});}
  });
  C.articulos.filter(a=>a.control!=='sin_stock').forEach(a=>{const m=cpStockMeta(a);if(!m)return;if(m.stockDisponible===null)out.push({level:'amber',title:'Stock a verificar: '+a.descripcion,text:m.errorStock||'Falta un conteo en '+m.unidad+'.'});else if(m.stockMinimo!=null&&m.stockDisponible<m.stockMinimo)out.push({level:'red',title:'Stock bajo: '+a.descripcion,text:'Quedan '+m.stockDisponible+' '+m.unidad+'; mínimo '+m.stockMinimo+'.'});});
  C.pagos.filter(p=>p.estado!=='pagado'&&p.vencimiento).forEach(p=>{const dd=Math.ceil((new Date(p.vencimiento+'T12:00:00')-now)/86400000);if(dd<0)out.push({level:'red',title:`Deuda vencida: ${p.proveedor||'Proveedor'}`,text:`${p.concepto||'Compromiso'} · ${money(p.importe)} · venció hace ${Math.abs(dd)} días.`});else if(dd<=7)out.push({level:'amber',title:`Pago a preparar: ${p.proveedor||'Proveedor'}`,text:`${p.concepto||'Compromiso'} · ${money(p.importe)} · vence en ${dd} días.`});});
  priceAlerts().forEach(x=>out.push({level:'amber',title:`Cambio de precio: ${x.descripcion}`,text:`Último ${money(x.actual)} vs anterior ${money(x.anterior)} (${x.pct>0?'+':''}${x.pct.toFixed(1)}%).`}));
  const below=cpBelowMinimumItems();if(below.length>35)out.push({level:'red',title:'Stock mínimo fuera de objetivo',text:`${below.length} ítems están debajo del mínimo. El objetivo es no superar 35.`});
  const unexplained=C.conteos.flatMap(c=>(c.items||[]).map(i=>({...i,cierre:c.fecha}))).filter(i=>i.desvio>0&&(!i.justificaciones?.length)&&(!i.motivo||i.motivo==='Por justificar'));if(unexplained.length)out.push({level:'amber',title:'Consumos por encima de lo previsto',text:unexplained.length+' diferencias sin explicación. Revisalas en Stock / conteo → Desvíos e historial.'});
  const pendingExp=cpPendingExplosionWorks();if(pendingExp.length)out.push({level:'amber',title:'OT pendientes de explosión',text:`${pendingExp.length} obras todavía no tienen despiece de materiales.`});
  if(new Date().getDay()===2&&!C.conteos.some(x=>String(x.fecha||'')===todayISO()))out.push({level:'amber',title:'Conteo semanal pendiente',text:'Hoy es martes. Falta confirmar el conteo físico de stock.'});
  return out;
}
function priceAlerts(){
  const groups={}; purchaseItems().forEach(x=>{const k=(x.articuloId||x.descripcion||'').toLowerCase();(groups[k]??=[]).push(x);}); const out=[];
  Object.values(groups).forEach(g=>{g.sort((a,b)=>String(b.compra.fecha||'').localeCompare(String(a.compra.fecha||'')));if(g.length>1){const a=num(g[0].precioUnitarioNeto),b=num(g[1].precioUnitarioNeto);if(a&&b){const pct=(a-b)/b*100;if(Math.abs(pct)>=12)out.push({descripcion:g[0].descripcion,actual:a,anterior:b,pct});}}}); return out;
}

function cpBelowMinimumItems(){const last=latestCounts();return C.articulos.filter(a=>{if(a.control==='sin_stock'||num(a.stockMinimo)<=0)return false;const ct=last[a.id]||last[a.descripcion];return !!ct&&num(ct.cantidad)<num(a.stockMinimo);});}
function renderInicio(el){
  const month=todayISO().slice(0,7); const cm=C.compras.filter(x=>String(x.fecha||'').startsWith(month)); const total=cm.reduce((s,x)=>s+num(x.totalBruto),0); const nofc=cm.filter(x=>x.fc==='no'); const al=alerts();
  const factA=cm.filter(x=>x.fc==='si'&&x.tipoComprobante==='Factura A');const ivaA=factA.reduce((s,x)=>s+num(x.ivaTotal),0);const below=cpBelowMinimumItems();const pendingExp=cpPendingExplosionWorks();
  el.innerHTML=`<div class="cp-grid"><div class="cp-card"><div class="cp-lbl">Compras del mes</div><div class="cp-kpi">${cm.length}</div><div class="cp-sub">${money(total)}</div></div><div class="cp-card"><div class="cp-lbl">Factura A</div><div class="cp-kpi" style="color:var(--green)">${factA.length}</div><div class="cp-sub">IVA informado ${money(ivaA)}</div></div><div class="cp-card"><div class="cp-lbl">Sin factura</div><div class="cp-kpi" style="color:var(--amber)">${nofc.length}</div><div class="cp-sub">${money(nofc.reduce((s,x)=>s+num(x.totalBruto),0))}</div></div><div class="cp-card"><div class="cp-lbl">Alertas activas</div><div class="cp-kpi" style="color:${al.length?'var(--red)':'var(--green)'}">${al.length}</div></div><div class="cp-card"><div class="cp-lbl">Ítems bajo mínimo</div><div class="cp-kpi" style="color:${below.length>35?'var(--red)':'var(--green)'}">${below.length} <span style="font-size:11px;color:var(--text3)">/ 35</span></div><div class="cp-sub">${below.length>35?'Fuera del objetivo':'Dentro del objetivo'}</div></div><div class="cp-card"><div class="cp-lbl">OT sin explosión</div><div class="cp-kpi" style="color:${pendingExp.length?'var(--amber)':'var(--green)'}">${pendingExp.length}</div></div></div>
  <div class="cp-panel" style="margin-top:12px"><div style="display:flex;justify-content:space-between"><b>Prioridades de Caro</b><button class="cp-btn" onclick="cpTab('alertas')">Ver todas</button></div><div style="margin-top:10px">${al.slice(0,6).map(alertHTML).join('')||'<div class="cp-alert green">✅ No hay alertas críticas.</div>'}</div></div>
  <div class="cp-panel"><b>Clemen IA · lectura del período</b><div style="margin-top:10px;font-size:12px;color:var(--text2);line-height:1.8">${iaSummary(cm,al)}</div></div>`;
}
function iaSummary(cm,al){
  const total=cm.reduce((s,x)=>s+num(x.totalBruto),0), fa=cm.filter(x=>x.tipoComprobante==='Factura A'); const no=cm.filter(x=>x.fc==='no'); const pa=priceAlerts();
  const lines=[]; lines.push(`Este mes se registraron <b>${cm.length}</b> compras por <b>${money(total)}</b>.`); lines.push(`<b>${fa.length}</b> operaciones tienen Factura A y <b>${no.length}</b> no tienen comprobante asociado.`); if(pa.length)lines.push(`Detecté <b>${pa.length}</b> variaciones de precio superiores al 12%; conviene revisar antes de repetir la compra.`); if(al.some(a=>a.title.includes('Stock bajo')))lines.push('Hay materiales por debajo del mínimo. Revisá el conteo y las OT de la próxima semana.'); return lines.join('<br>');
}
function alertHTML(a){return `<div class="cp-alert ${a.level}"><div>${a.level==='red'?'🔴':'🟠'}</div><div><b>${esc(a.title)}</b><div class="cp-sub">${esc(a.text)}</div></div></div>`}

function getFilteredPurchaseItems(){const f=purchaseFilters;return purchaseItems().filter(x=>{const c=x.compra||{},date=String(c.fecha||'');if(f.period==='week'&&c.semana!==f.week)return false;if(f.period==='month'&&!date.startsWith(f.month))return false;if(f.period==='custom'&&((f.from&&date<f.from)||(f.to&&date>f.to)))return false;if(f.proveedor&&c.proveedor!==f.proveedor)return false;if(f.familia&&String(x.familia||x.rubro||'')!==f.familia)return false;if(f.subfamilia&&String(x.subfamilia||'')!==f.subfamilia)return false;if(f.fc&&c.fc!==f.fc)return false;if(f.search){const hay=normText([x.descripcionOriginal,x.descripcion,x.codigo,x.familia,x.subfamilia,c.proveedor,c.numeroComprobante,c.ot,...(x.distribucion?.asignaciones||[]).map(r=>r.ot)].join(' '));if(!hay.includes(normText(f.search)))return false;}return true;});}
let cpPurchaseView='comprobantes';
window.cpSetPurchaseView=value=>{cpPurchaseView=['anual','distribucion'].includes(value)?value:'comprobantes';render();};
function renderCompras(el){
  if(cpPurchaseView==='distribucion')renderDistribucionCompras(el);else if(cpPurchaseView==='anual')renderHistoricoMateriales(el);else renderComprobantes(el);
  el.insertAdjacentHTML('afterbegin',`<div class="cp-panel"><div class="cp-field"><label for="cp-purchase-view">Vista de Compras</label><select id="cp-purchase-view" onchange="cpSetPurchaseView(this.value)"><option value="comprobantes" ${cpPurchaseView==='comprobantes'?'selected':''}>Comprobantes</option><option value="anual" ${cpPurchaseView==='anual'?'selected':''}>Comparativo anual de materiales</option><option value="distribucion" ${cpPurchaseView==='distribucion'?'selected':''}>Distribución por OT / stock · CD / EX</option></select></div></div>`);
}
function cpItemDestinoLabel(item,compra={}){try{return window.TIZComprasDistribucionV1.read(item,compra).map(r=>(r.destino==='OT'?'OT '+r.ot+' · '+r.tipoCosto:r.destino)+' '+r.porcentaje+'%').join(' / ');}catch(err){return err.message;}}
function cpCompraDestinoLabel(compra){return [...new Set((compra.items||[]).map(i=>cpItemDestinoLabel(i,compra)))].join(' / ');}
window.cpDistFilters=window.cpDistFilters||{from:'',to:'',ot:'',type:''};
window.cpSetDistFilter=(key,value)=>{window.cpDistFilters[key]=value;render();};
function cpDistributionRows(){const f=window.cpDistFilters;return window.TIZComprasDistribucionV1.rows(C.compras.filter(c=>(!f.from||c.fecha>=f.from)&&(!f.to||c.fecha<=f.to))).filter(r=>(!f.ot||(f.ot==='stock'?r.destino==='Stock':r.destino==='OT'&&window.TIZComprasDistribucionV1.ot(r.ot)===window.TIZComprasDistribucionV1.ot(f.ot)))&&(!f.type||r.tipoCosto===f.type));}
window.cpExportDistribucion=()=>{const rows=cpDistributionRows(),values=[['Fecha','Proveedor','Comprobante','Artículo','Destino','OT','Cliente','CD / EX','Porcentaje','Cantidad comprobante asignada','Unidad','Cantidad stock asignada','Unidad stock','Neto asignado','IVA asignado','Bruto asignado','Medio de pago'],...rows.map(r=>[r.fecha,r.proveedor,r.numeroComprobante,r.descripcion,r.destino,r.ot,r.cliente,r.tipoCosto,r.porcentaje,r.cantidad,r.unidad,r.cantidadStock,r.unidadStock,r.totalNeto,r.ivaImporte,r.totalBruto,r.medioPago])],url=URL.createObjectURL(new Blob(['\ufeff'+values.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='distribucion-compras-ot-stock.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function renderDistribucionCompras(el){
 let rows;try{rows=cpDistributionRows();}catch(err){el.innerHTML='<div class="cp-panel">'+esc(err.message)+'</div>';return;}
 const f=window.cpDistFilters,tot=type=>rows.filter(type).reduce((s,r)=>s+num(r.totalNeto),0),summary=new Map();
 rows.forEach(r=>{const key=r.destino==='OT'?'OT '+r.ot:r.destino;if(!summary.has(key))summary.set(key,{key,cd:0,ex:0,other:0,net:0});const g=summary.get(key);g.net+=num(r.totalNeto);g[r.tipoCosto==='CD'?'cd':r.tipoCosto==='EX'?'ex':'other']+=num(r.totalNeto);});
 el.innerHTML=`<div class="cp-panel"><b>Distribución de compras por OT y stock</b><p>Se reparte el neto, IVA y total de cada ítem. La parte asignada a OT es una entrega directa; el remanente ingresa al depósito. Los importes de stock conservan su valor de inventario y no se imputan a una OT.</p><div class="cp-row"><div class="cp-field"><label>Desde</label><input type="date" value="${esc(f.from)}" onchange="cpSetDistFilter('from',this.value)"></div><div class="cp-field"><label>Hasta</label><input type="date" value="${esc(f.to)}" onchange="cpSetDistFilter('to',this.value)"></div><div class="cp-field"><label>OT (o stock)</label><input value="${esc(f.ot)}" placeholder="Todas · Ej. 4799 o stock" onchange="cpSetDistFilter('ot',this.value)"></div><div class="cp-field"><label>Tipo de costo</label><select onchange="cpSetDistFilter('type',this.value)"><option value="">Todos</option><option value="CD" ${f.type==='CD'?'selected':''}>CD · Costo directo</option><option value="EX" ${f.type==='EX'?'selected':''}>EX · Extracosto</option></select></div></div><button class="cp-btn" onclick="cpExportDistribucion()">Exportar distribución filtrada</button></div><div class="cp-grid">${[['CD neto',tot(r=>r.destino==='OT'&&r.tipoCosto==='CD')],['EX neto',tot(r=>r.destino==='OT'&&r.tipoCosto==='EX')],['Stock neto',tot(r=>r.destino==='Stock')],['Neto distribuido',tot(()=>true)]].map(([label,value])=>`<div class="cp-card"><div class="cp-lbl">${label}</div><div class="cp-kpi" style="font-size:18px">${money(value)}</div></div>`).join('')}</div><div class="cp-panel"><b>Totales por destino</b><table class="cp-table"><thead><tr><th>Destino</th><th>CD neto</th><th>EX neto</th><th>Stock / otros / sin clasificar</th><th>Neto total</th></tr></thead><tbody>${[...summary.values()].map(g=>`<tr><td>${esc(g.key)}</td><td>${money(g.cd)}</td><td>${money(g.ex)}</td><td>${money(g.other)}</td><td>${money(g.net)}</td></tr>`).join('')}</tbody></table></div><div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Fecha / proveedor</th><th>Artículo</th><th>Destino / OT</th><th>CD / EX</th><th>%</th><th>Cantidad asignada</th><th>Neto</th><th>IVA</th><th>Total</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${fmtDate(r.fecha)} · ${esc(r.proveedor)}</td><td>${esc(r.codigo)} · ${esc(r.descripcion)}</td><td>${esc(r.destino==='OT'?'OT '+r.ot:r.destino)} ${esc(r.cliente||'')}</td><td>${esc(r.tipoCosto||'—')}</td><td>${r.porcentaje}%</td><td>${num(r.cantidad).toFixed(4)} ${esc(r.unidad)}</td><td>${money(r.totalNeto)}</td><td>${money(r.ivaImporte)}</td><td>${money(r.totalBruto)}</td><td><button class="cp-btn" onclick="cpEditCompra('${esc(r.compraId)}')">Editar compra</button></td></tr>`).join('')||'<tr><td colspan="10">Sin asignaciones para estos filtros.</td></tr>'}</tbody></table></div>`;
}
function renderComprobantes(el){
  const families=uniqueSorted([...C.articulos.map(a=>a.familia),...purchaseItems().map(i=>i.familia||i.rubro)]),providers=uniqueSorted(C.compras.map(c=>c.proveedor));
  const subfamilies=uniqueSorted([...C.articulos.filter(a=>!purchaseFilters.familia||a.familia===purchaseFilters.familia).map(a=>a.subfamilia),...purchaseItems().filter(i=>!purchaseFilters.familia||(i.familia||i.rubro)===purchaseFilters.familia).map(i=>i.subfamilia)]);
  const items=getFilteredPurchaseItems(),ids=new Set(items.map(i=>i.compra.id)),filtered=C.compras.filter(c=>ids.has(c.id)).sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
  const net=items.reduce((s,i)=>s+num(i.totalNeto),0),iva=items.reduce((s,i)=>s+num(i.ivaImporte),0),gross=items.reduce((s,i)=>s+num(i.totalBruto),0),qty=items.reduce((s,i)=>s+num(i.cantidad),0);
  const periodFields=purchaseFilters.period==='week'?`<div class="cp-field"><label>Semana</label><input id="cp-f-week" value="${esc(purchaseFilters.week)}" onchange="cpFilterChanged()"></div>`:purchaseFilters.period==='month'?`<div class="cp-field"><label>Mes</label><input id="cp-f-month" type="month" value="${esc(purchaseFilters.month)}" onchange="cpFilterChanged()"></div>`:purchaseFilters.period==='custom'?`<div class="cp-field"><label>Desde</label><input id="cp-f-from" type="date" value="${esc(purchaseFilters.from)}" onchange="cpFilterChanged()"></div><div class="cp-field"><label>Hasta</label><input id="cp-f-to" type="date" value="${esc(purchaseFilters.to)}" onchange="cpFilterChanged()"></div>`:'';
  const rows=filtered.map(c=>{const matched=items.filter(i=>i.compra.id===c.id),labels=matched.slice(0,3).map(i=>`<div title="${esc(i.descripcionOriginal||i.descripcion)}"><b>${esc(i.codigo||'')}</b> ${esc(i.descripcion||i.descripcionOriginal||'')}</div>`).join('');return `<tr><td>${fmtDate(c.fecha)}</td><td><b>${esc(c.proveedor|| (c.proveedorPendiente?'A completar':''))}</b></td><td><span class="cp-pill ${c.fc==='si'?'yes':'no'}">${c.fc==='si'?'Sí':'No'}</span></td><td>${esc(c.tipoComprobante||'')}</td><td>${esc(c.numeroComprobante||'')}</td><td>${labels}${matched.length>3?`<div class="cp-sub">+${matched.length-3} ítems</div>`:''}</td><td>${money(matched.reduce((s,i)=>s+num(i.totalNeto),0))}</td><td>${money(matched.reduce((s,i)=>s+num(i.ivaImporte),0))}</td><td><b>${money(matched.reduce((s,i)=>s+num(i.totalBruto),0))}</b></td><td>${esc(cpCompraDestinoLabel(c))}</td><td><button class="cp-btn" onclick="cpEditCompra('${c.id}')">Editar</button> <button class="cp-btn danger" onclick="cpDeleteCompra('${c.id}')">Borrar</button></td></tr>`;}).join('');
  el.innerHTML=`<div class="cp-panel"><div class="cp-actions" style="justify-content:space-between"><div class="cp-actions"><button class="cp-btn primary" onclick="cpNuevaCompra()">＋ Nueva compra</button><button class="cp-btn" onclick="cpExportCSV(true)">⬇ Exportar filtrado</button></div><button class="cp-btn" onclick="cpClearFilters()">Limpiar filtros</button></div><div class="cp-filter-grid" style="margin-top:12px"><div class="cp-field"><label>Período</label><select id="cp-f-period" onchange="cpFilterPeriod(this.value)"><option value="all" ${purchaseFilters.period==='all'?'selected':''}>Todo</option><option value="week" ${purchaseFilters.period==='week'?'selected':''}>Semana</option><option value="month" ${purchaseFilters.period==='month'?'selected':''}>Mes</option><option value="custom" ${purchaseFilters.period==='custom'?'selected':''}>Rango</option></select></div>${periodFields}<div class="cp-field"><label>Búsqueda rápida de ítem</label><input id="cp-f-search" value="${esc(purchaseFilters.search)}" placeholder="Código, caño 20x20, chapa…" oninput="cpFilterDebounced(this.value)"></div><div class="cp-field"><label>Proveedor</label><select id="cp-f-provider" onchange="cpFilterChanged()"><option value="">Todos</option>${providers.map(v=>`<option ${purchaseFilters.proveedor===v?'selected':''}>${esc(v)}</option>`).join('')}</select></div><div class="cp-field"><label>Familia</label><select id="cp-f-family" onchange="cpFilterChanged(true)"><option value="">Todas</option>${families.map(v=>`<option ${purchaseFilters.familia===v?'selected':''}>${esc(v)}</option>`).join('')}</select></div><div class="cp-field"><label>Subfamilia</label><select id="cp-f-subfamily" onchange="cpFilterChanged()"><option value="">Todas</option>${subfamilies.map(v=>`<option ${purchaseFilters.subfamilia===v?'selected':''}>${esc(v)}</option>`).join('')}</select></div><div class="cp-field"><label>Factura</label><select id="cp-f-fc" onchange="cpFilterChanged()"><option value="">Todas</option><option value="si" ${purchaseFilters.fc==='si'?'selected':''}>Con factura</option><option value="no" ${purchaseFilters.fc==='no'?'selected':''}>Sin factura</option></select></div></div><div class="cp-filter-summary"><div class="cp-card"><div class="cp-lbl">Compras</div><div class="cp-kpi">${filtered.length}</div></div><div class="cp-card"><div class="cp-lbl">Ítems</div><div class="cp-kpi">${items.length}</div><div class="cp-sub">${qty.toFixed(2)} unidades</div></div><div class="cp-card"><div class="cp-lbl">Neto filtrado</div><div class="cp-kpi" style="font-size:18px">${money(net)}</div><div class="cp-sub">IVA ${money(iva)}</div></div><div class="cp-card"><div class="cp-lbl">Total filtrado</div><div class="cp-kpi" style="font-size:18px">${money(gross)}</div></div></div></div><div class="cp-table-wrap"><table class="cp-table" style="min-width:1180px"><thead><tr><th>Fecha</th><th>Proveedor</th><th>FC</th><th>Tipo</th><th>Número</th><th>Ítems coincidentes</th><th>Neto</th><th>IVA</th><th>Total</th><th>OT</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="11">No hay compras para estos filtros.</td></tr>'}</tbody></table></div>`;
}


window.cpHistFilters=window.cpHistFilters||{year:'2026',familia:'',search:'',mode:'cantidad'};
window.cpSetHistFilter=(key,value)=>{window.cpHistFilters[key]=value;render();};
function renderHistoricoMateriales(el){
  const all=purchaseItems().filter(i=>i.compra?.fecha);
  if(!all.length){
    el.innerHTML='<div class="cp-panel"><b>Comparativo anual de materiales</b><div class="cp-sub" style="margin-top:6px">Todavía no hay compras históricas cargadas en la base.</div></div>';
    return;
  }
  const years=uniqueSorted(all.map(i=>String(i.compra.fecha||'').slice(0,4)).filter(Boolean)).sort().reverse();
  const f=window.cpHistFilters||{};if(!years.includes(f.year))f.year=years[0]||'2026';
  const fams=uniqueSorted(all.map(i=>i.familia||i.rubro).filter(Boolean));
  const filtered=all.filter(i=>{
    const d=String(i.compra.fecha||'');
    if(!d.startsWith(f.year+'-'))return false;
    if(f.familia&&String(i.familia||i.rubro)!==f.familia)return false;
    if(f.search){
      const hay=normText([i.codigo,i.descripcion,i.descripcionOriginal,i.familia,i.rubro,i.subfamilia].join(' '));
      if(!hay.includes(normText(f.search)))return false;
    }
    return true;
  });

  const groups=new Map();
  filtered.forEach(i=>{
    const key=String(i.codigo||'')+'|'+normText(i.descripcion||i.descripcionOriginal||'');
    if(!groups.has(key))groups.set(key,{codigo:i.codigo||'',descripcion:i.descripcion||i.descripcionOriginal||'',familia:i.familia||i.rubro||'',subfamilia:i.subfamilia||'',unidad:i.unidad||'',months:Array.from({length:12},()=>({qty:0,net:0,gross:0,unitNet:[]})),qty:0,net:0,gross:0});
    const g=groups.get(key),m=Math.max(0,Math.min(11,Number(String(i.compra.fecha).slice(5,7))-1));
    const q=num(i.cantidad),n=num(i.totalNeto),b=num(i.totalBruto),u=num(i.precioUnitarioNeto);
    g.months[m].qty+=q;g.months[m].net+=n;g.months[m].gross+=b;if(u)g.months[m].unitNet.push(u);
    g.qty+=q;g.net+=n;g.gross+=b;
  });
  const rows=[...groups.values()].sort((a,b)=>String(a.codigo).localeCompare(String(b.codigo)));
  const monthNames=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const totalQty=rows.reduce((s,r)=>s+r.qty,0),totalNet=rows.reduce((s,r)=>s+r.net,0),totalGross=rows.reduce((s,r)=>s+r.gross,0);
  const monthlyTotals=Array.from({length:12},(_,m)=>({qty:rows.reduce((s,r)=>s+r.months[m].qty,0),net:rows.reduce((s,r)=>s+r.months[m].net,0)}));

  const body=rows.map(r=>{
    const ms=r.months.map(x=>{
      if(f.mode==='importe')return '<td style="text-align:right"><b>'+money(x.net)+'</b>'+(x.qty?'<div class="cp-sub">'+x.qty.toFixed(2)+' '+esc(r.unidad||'')+'</div>':'')+'</td>';
      const avg=x.unitNet.length?x.unitNet.reduce((s,v)=>s+v,0)/x.unitNet.length:0;
      return '<td style="text-align:right"><b>'+(x.qty?x.qty.toFixed(2):'—')+'</b>'+(x.net?'<div class="cp-sub">'+money(x.net)+(avg?' · u. '+money(avg):'')+'</div>':'')+'</td>';
    }).join('');
    return '<tr><td><b>'+esc(r.codigo||'—')+'</b></td><td><b>'+esc(r.descripcion)+'</b><div class="cp-sub">'+esc(r.familia)+(r.subfamilia?' / '+esc(r.subfamilia):'')+'</div></td><td>'+esc(r.unidad||'—')+'</td>'+ms+'<td style="text-align:right"><b>'+r.qty.toFixed(2)+'</b></td><td style="text-align:right"><b>'+money(r.net)+'</b></td><td style="text-align:right"><b>'+money(r.gross)+'</b></td></tr>';
  }).join('');

  const familyRows=(()=>{
    const m=new Map();
    filtered.forEach(i=>{const k=i.familia||i.rubro||'Sin familia';if(!m.has(k))m.set(k,{name:k,qty:0,net:0});const x=m.get(k);x.qty+=num(i.cantidad);x.net+=num(i.totalNeto);});
    return [...m.values()].sort((a,b)=>b.net-a.net).slice(0,12).map(x=>'<tr><td><b>'+esc(x.name)+'</b></td><td style="text-align:right">'+x.qty.toFixed(2)+'</td><td style="text-align:right"><b>'+money(x.net)+'</b></td></tr>').join('');
  })();

  el.innerHTML='<div class="cp-pay-toolbar"><div><div class="cp-pay-title">Comparativo anual de materiales</div><div class="cp-sub">Filtrá por año, familia, código o descripción. Ejemplo: buscá “chapa c22” para ver cuánto se compró en cada mes.</div></div></div>'+
    '<div class="cp-panel"><div class="cp-filter-grid">'+
      '<div class="cp-field"><label>Año</label><select onchange="cpSetHistFilter(\'year\',this.value)">'+years.map(y=>'<option '+(f.year===y?'selected':'')+'>'+esc(y)+'</option>').join('')+'</select></div>'+
      '<div class="cp-field"><label>Familia</label><select onchange="cpSetHistFilter(\'familia\',this.value)"><option value="">Todas</option>'+fams.map(v=>'<option '+(f.familia===v?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></div>'+
      '<div class="cp-field"><label>Código / material</label><input value="'+esc(f.search||'')+'" placeholder="Ej.: 000123 o chapa c22" oninput="cpSetHistFilter(\'search\',this.value)"></div>'+
      '<div class="cp-field"><label>Vista mensual</label><select onchange="cpSetHistFilter(\'mode\',this.value)"><option value="cantidad" '+(f.mode==='cantidad'?'selected':'')+'>Cantidad + importe</option><option value="importe" '+(f.mode==='importe'?'selected':'')+'>Importe neto + cantidad</option></select></div>'+
    '</div></div>'+
    '<div class="cp-grid">'+
      '<div class="cp-card"><div class="cp-lbl">Materiales distintos</div><div class="cp-kpi">'+rows.length+'</div></div>'+
      '<div class="cp-card"><div class="cp-lbl">Unidades / consumo comprado</div><div class="cp-kpi" style="font-size:18px">'+totalQty.toFixed(2)+'</div></div>'+
      '<div class="cp-card"><div class="cp-lbl">Neto anual filtrado</div><div class="cp-kpi" style="font-size:18px">'+money(totalNet)+'</div></div>'+
      '<div class="cp-card"><div class="cp-lbl">Bruto anual filtrado</div><div class="cp-kpi" style="font-size:18px">'+money(totalGross)+'</div></div>'+
    '</div>'+
    '<div class="cp-table-wrap"><table class="cp-table" style="min-width:2100px"><thead><tr><th>Código</th><th>Material</th><th>Unidad</th>'+monthNames.map(m=>'<th style="text-align:right">'+m+'</th>').join('')+'<th style="text-align:right">Cant. anual</th><th style="text-align:right">Neto anual</th><th style="text-align:right">Bruto anual</th></tr></thead><tbody>'+body+'<tr style="font-weight:800"><td colspan="3">TOTAL FILTRADO</td>'+monthlyTotals.map(x=>'<td style="text-align:right">'+(f.mode==='importe'?money(x.net):x.qty.toFixed(2))+'</td>').join('')+'<td style="text-align:right">'+totalQty.toFixed(2)+'</td><td style="text-align:right">'+money(totalNet)+'</td><td style="text-align:right">'+money(totalGross)+'</td></tr></tbody></table></div>'+
    '<div class="cp-panel" style="margin-top:12px"><b>Resumen por familia</b><div class="cp-table-wrap" style="margin-top:8px"><table class="cp-table"><thead><tr><th>Familia</th><th style="text-align:right">Cantidad</th><th style="text-align:right">Neto</th></tr></thead><tbody>'+familyRows+'</tbody></table></div></div>';
}

function providerByName(name){
  const n=normText(name||'');
  return n?C.proveedores.find(p=>[p.nombre,p.nombreComercial,p.razonSocial,...(p.nombresAnteriores||[])].some(x=>normText(x)===n))||null:null;
}
function providerNames(){
  return uniqueSorted([
    ...C.proveedores.map(p=>p.nombre||p.razonSocial),
    ...C.compras.map(x=>providerByName(x.proveedor)?.nombre||x.proveedor),
    ...C.pagos.map(x=>providerByName(x.proveedor)?.nombre||x.proveedor)
  ]);
}
function renderProveedores(el){
  const names=providerNames();
  const rows=names.map(name=>{
    const p=providerByName(name)||{};
    const belongs=x=>p.id?(x.proveedorId?x.proveedorId===p.id:providerByName(x.proveedor)?.id===p.id):normText(x.proveedor)===normText(name);
    const compras=C.compras.filter(belongs);
    const deuda=C.pagos.filter(x=>x.estado!=='pagado'&&belongs(x));
    const total=compras.reduce((s,x)=>s+num(x.totalBruto),0);
    const saldo=deuda.reduce((s,x)=>s+num(x.importe),0);
    const last=[...compras].sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')))[0];
    const prox=[...deuda].filter(x=>x.vencimiento).sort((a,b)=>String(a.vencimiento).localeCompare(String(b.vencimiento)))[0];
    return `<tr>
      <td><b>${esc(name)}</b>${p.razonSocial&&p.razonSocial!==name?'<div class="cp-sub">'+esc(p.razonSocial)+'</div>':''}<div class="cp-sub">${p.cuit?'CUIT '+esc(p.cuit):'CUIT sin cargar'}</div><div class="cp-match-warn">${ING.pendingSupplier(p).length?'Completar: '+ING.pendingSupplier(p).map(k=>k==='contacto'?'vendedor / contacto':k).join(', '):''}</div></td>
      <td>${cpProviderContacts(p).map(c=>'<div>'+esc(c.nombre||'—')+'</div>').join('')||'—'}</td><td>${cpProviderContacts(p).map(c=>'<div>'+esc(c.telefono||'—')+'</div>').join('')||'—'}</td><td>${cpProviderContacts(p).map(c=>'<div>'+esc(c.email||'—')+'</div>').join('')||'—'}</td>
      <td>${esc(p.condicionPago||'—')}${p.diasPago?'<div class="cp-sub">'+esc(p.diasPago)+' días</div>':''}</td>
      <td>${compras.length}<div class="cp-sub">${money(total)}</div></td>
      <td><b style="color:${saldo?'var(--amber)':'var(--green)'}">${money(saldo)}</b><div class="cp-sub">${deuda.length} compromisos</div></td>
      <td>${last?fmtDate(last.fecha):'—'}</td><td>${prox?fmtDate(prox.vencimiento):'—'}</td>
      <td><button class="cp-btn" data-edit-provider="${esc(p.id||'')}" data-provider-name="${esc(name)}">Editar</button></td>
    </tr>`;
  }).join('');
  const debt=C.pagos.filter(x=>x.estado!=='pagado').reduce((s,x)=>s+num(x.importe),0);
  el.innerHTML=`
    <div class="cp-grid">
      <div class="cp-card"><div class="cp-lbl">Proveedores activos</div><div class="cp-kpi">${names.length}</div></div>
      <div class="cp-card"><div class="cp-lbl">Deuda total registrada</div><div class="cp-kpi" style="font-size:18px;color:var(--amber)">${money(debt)}</div></div>
      <div class="cp-card"><div class="cp-lbl">Con ficha completa</div><div class="cp-kpi" style="color:var(--green)">${C.proveedores.filter(p=>!ING.pendingSupplier(p).length).length}</div></div>
      <div class="cp-card"><div class="cp-lbl">A completar</div><div class="cp-kpi" style="color:var(--amber)">${names.filter(name=>ING.pendingSupplier(providerByName(name)||{}).length).length}</div></div>
    </div>
    <div class="cp-panel" id="cp-provider-form">
      <b>Ficha maestra de proveedor</b><div class="cp-sub">Sirve para recordar CUIT, contactos y condiciones habituales sin volver a cargar todo en cada compra.</div>
      <input type="hidden" id="cp-prov-id">
      <div class="cp-row" style="margin-top:10px">
        <div class="cp-field" style="grid-column:span 2"><label for="cp-prov-nombre">Nombre comercial / nombre del proveedor</label><textarea id="cp-prov-nombre" rows="2" placeholder="Ej.: Acqua Acrilicos"></textarea></div>
        <div class="cp-field" style="grid-column:span 2"><label for="cp-prov-razon">Razón social del comprobante</label><textarea id="cp-prov-razon" rows="2" placeholder="Nombre legal completo que figura en la factura"></textarea></div>
        <div class="cp-field"><label>CUIT</label><input id="cp-prov-cuit"></div>
        <div class="cp-field"><label>Domicilio</label><input id="cp-prov-domicilio"></div>
        <div class="cp-field"><label>Contacto principal</label><input id="cp-prov-contacto"></div>
        <div class="cp-field"><label>Teléfono</label><input id="cp-prov-tel"></div>
        <div class="cp-field"><label>Email</label><input id="cp-prov-email"></div>
        <div class="cp-field"><label>Condición habitual</label><select id="cp-prov-cond"><option value="">A definir</option><option>Contado</option><option>Cuenta corriente</option><option>Cheque</option><option>Transferencia</option><option>Tarjeta Visa</option><option>Tarjeta Cabal</option><option value="Tarjeta" hidden>Tarjeta (histórica sin identificar)</option><option>Cuotas</option></select></div>
        <div class="cp-field"><label>Días de pago</label><input id="cp-prov-dias" type="number" min="0"></div>
        <div class="cp-field"><label>Notas</label><input id="cp-prov-notas" placeholder="Ej.: entrega martes y jueves"></div>
      </div>
      <div style="margin-top:14px"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>Más contactos del proveedor</b><button type="button" class="cp-btn" onclick="cpAddProviderContact()">＋ Agregar contacto</button></div><div id="cp-prov-contactos"></div></div>
      <div style="margin-top:10px;display:flex;gap:8px"><button class="cp-btn primary" onclick="cpSaveProveedor()">Guardar proveedor</button><button class="cp-btn" onclick="cpClearProveedor()">Limpiar</button></div>
    </div>
    <div class="cp-table-wrap"><table class="cp-table" style="min-width:1200px"><thead><tr><th>Proveedor</th><th>Contacto</th><th>Teléfono</th><th>Email</th><th>Condición</th><th>Compras</th><th>Saldo pendiente</th><th>Última compra</th><th>Próx. venc.</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="10">Todavía no hay proveedores.</td></tr>'}</tbody></table></div>
  `;
  el.querySelectorAll('[data-edit-provider]').forEach(b=>b.onclick=()=>window.cpEditProveedor(b.dataset.editProvider,b.dataset.providerName));
}
window.cpClearProveedor=()=>{['cp-prov-id','cp-prov-nombre','cp-prov-cuit','cp-prov-contacto','cp-prov-tel','cp-prov-email','cp-prov-dias','cp-prov-notas'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});const c=document.getElementById('cp-prov-cond');if(c)c.value='';};
window.cpEditProveedor=(id,name)=>{currentTab='proveedores';render();setTimeout(()=>{const p=id?C.proveedores.find(x=>x.id===id):providerByName(name)||{};document.getElementById('cp-prov-id').value=p.id||'';document.getElementById('cp-prov-nombre').value=p.nombre||p.razonSocial||name||'';document.getElementById('cp-prov-cuit').value=p.cuit||'';document.getElementById('cp-prov-contacto').value=p.contacto||'';document.getElementById('cp-prov-tel').value=p.telefono||p.cel||'';document.getElementById('cp-prov-email').value=p.email||'';document.getElementById('cp-prov-cond').value=p.condicionPago||'';document.getElementById('cp-prov-dias').value=p.diasPago||'';document.getElementById('cp-prov-notas').value=p.notas||'';document.getElementById('cp-prov-nombre').scrollIntoView({behavior:'smooth',block:'center'});},30);};
window.cpSaveProveedor=async()=>{const nombre=document.getElementById('cp-prov-nombre').value.trim();if(!nombre)return toast('Ingresá el proveedor.');const data={nombre,cuit:document.getElementById('cp-prov-cuit').value.trim(),contacto:document.getElementById('cp-prov-contacto').value.trim(),telefono:document.getElementById('cp-prov-tel').value.trim(),email:document.getElementById('cp-prov-email').value.trim(),condicionPago:document.getElementById('cp-prov-cond').value,diasPago:num(document.getElementById('cp-prov-dias').value),notas:document.getElementById('cp-prov-notas').value.trim(),_ts:serverTimestamp()};const id=document.getElementById('cp-prov-id').value;if(id)await updateDoc(doc(db,'proveedoresCompra',id),data);else await addDoc(collection(db,'proveedoresCompra'),data);toast('Proveedor guardado.');cpClearProveedor();};

function isServicePurchaseItem(i){
  const f=normText(i.familia||i.rubro||'');
  const d=normText(i.descripcion||i.descripcionOriginal||'');
  return /(servicio|colocacion|corte|impresion externa|flete|logistica|alquiler|mantenimiento|publicidad|honorario|terceriz)/.test(f+' '+d) || String(i.compra?.destino||'').toLowerCase()==='gasto general';
}
function renderContrataciones(el){
  const items=purchaseItems().filter(isServicePurchaseItem).sort((a,b)=>String(b.compra?.fecha||'').localeCompare(String(a.compra?.fecha||'')));
  const total=items.reduce((s,i)=>s+num(i.totalBruto),0);
  const byProvider={};items.forEach(i=>{const k=i.compra?.proveedor||'Sin proveedor';byProvider[k]=(byProvider[k]||0)+num(i.totalBruto);});
  const top=Object.entries(byProvider).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const rows=items.slice(0,300).map(i=>`<tr><td>${fmtDate(i.compra?.fecha)}</td><td><b>${esc(i.compra?.proveedor||'')}</b></td><td>${esc(i.descripcionOriginal||i.descripcion||'')}</td><td>${esc(i.familia||i.rubro||'')}</td><td>${esc(i.compra?.ot||'—')}</td><td>${esc(i.compra?.medioPago||'—')}</td><td><b>${money(i.totalBruto)}</b></td></tr>`).join('');
  el.innerHTML=`<div class="cp-grid"><div class="cp-card"><div class="cp-lbl">Servicios / contrataciones</div><div class="cp-kpi">${items.length}</div></div><div class="cp-card"><div class="cp-lbl">Importe registrado</div><div class="cp-kpi" style="font-size:18px">${money(total)}</div></div><div class="cp-card"><div class="cp-lbl">Proveedores / contratistas</div><div class="cp-kpi">${Object.keys(byProvider).length}</div></div></div>
  <div class="cp-panel"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><b>Contrataciones y servicios externos</b><div class="cp-sub">Se arma automáticamente con servicios, colocaciones externas, cortes/impresiones, fletes, alquileres, mantenimiento y gastos generales cargados en Compras.</div></div><button class="cp-btn primary" onclick="cpNuevaCompra()">＋ Registrar contratación</button></div><div style="margin-top:10px">${top.map(([n,v])=>'<div class="cp-alert green"><div>•</div><div><b>'+esc(n)+'</b><div class="cp-sub">'+money(v)+'</div></div></div>').join('')||'<div class="cp-sub">Todavía no hay contrataciones identificadas.</div>'}</div></div>
  <div class="cp-table-wrap"><table class="cp-table" style="min-width:900px"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Concepto</th><th>Rubro</th><th>OT</th><th>Medio</th><th>Total</th></tr></thead><tbody>${rows||'<tr><td colspan="7">Sin contrataciones registradas.</td></tr>'}</tbody></table></div>`;
}


function cpHash32(s){
  let h=2166136261;for(let i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);
}
function cpExcelISO(v){
  if(!v)return '';
  if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10);
  if(typeof v==='number'&&window.XLSX?.SSF?.parse_date_code){const d=window.XLSX.SSF.parse_date_code(v);if(d)return String(d.y).padStart(4,'0')+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0');}
  const s=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
  const m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);if(m){const y=m[3].length===2?'20'+m[3]:m[3];return y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');}
  const d=new Date(s);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10);
}
function cpNormHeader(v){return normText(v).replace(/[^a-z0-9]+/g,' ').trim();}
function cpPaymentMethod(v){
  const raw=String(v||'').trim(),n=normText(raw);
  if(!raw)return {normalizado:'',original:''};
  if(/cheq/.test(n))return {normalizado:'Cheque',original:raw};
  if(/transf|transfer/.test(n))return {normalizado:'Transferencia',original:raw};
  if(/efect|contado/.test(n))return {normalizado:'Efectivo',original:raw};
  if(/visa|master|cabal|tarjet|credito|debito/.test(n))return {normalizado:window.TIZComprasDistribucionV1.paymentMethod(raw),original:raw};
  if(/cuenta|cta cte|corriente/.test(n))return {normalizado:'Cuenta corriente',original:raw};
  return {normalizado:'Otro',original:raw};
}
function cpEnsureXLSX(){
  if(window.XLSX)return Promise.resolve(window.XLSX);
  return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=()=>resolve(window.XLSX);s.onerror=()=>reject(new Error('No se pudo cargar el lector Excel'));document.head.appendChild(s);});
}
function cpArticleByCode(code,excelCatalog){
  const k=String(code||'').trim().padStart(6,'0');
  const live=C.articulos.find(a=>String(a.codigo||'').trim().padStart(6,'0')===k);
  if(live)return {...live,_catalogSource:'firestore'};
  const base=CATALOGO_TIZ_BASE.find(a=>String(a.codigo||'').trim().padStart(6,'0')===k);
  if(base)return {...base,id:'',_catalogSource:'base_embebida'};
  const excel=excelCatalog?.get(k);
  if(excel)return {...excel,id:'',_catalogSource:'excel'};
  return null;
}
function cpParseExcelCatalog(wb){
  const ws=wb.Sheets['Base de Datos'];const map=new Map();if(!ws)return map;
  const rows=window.XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:'',blankrows:false});
  for(let i=1;i<rows.length;i++){
    const r=rows[i],codigo=String(r[0]||'').trim().padStart(6,'0'),descripcion=String(r[1]||'').trim();
    if(!/^\d{6}$/.test(codigo)||!descripcion)continue;
    map.set(codigo,{codigo,descripcion,unidad:String(r[2]||'').trim(),familia:String(r[3]||'').trim(),subfamilia:''});
  }
  return map;
}
function cpValidInvoiceNumber(v){
  const s=normText(v||'').trim();
  return !!s&&!['n/a','na','ver','s/f','sf','sin fc','sin factura','-'].includes(s);
}
function cpExistingRowSignature(r){
  return [r.fecha,String(r.codigo||'').trim(),Math.round(num(r.totalBruto)*100)/100,normText(r.numeroComprobante||''),normText(r.aclaracion||'')].join('|');
}
function cpCurrentPurchaseSignatures(){
  const set=new Set();
  C.compras.forEach(p=>(p.items||[]).forEach(i=>set.add([p.fecha,String(i.codigo||'').trim(),Math.round(num(i.totalBruto)*100)/100,normText(p.numeroComprobante||''),normText(p.observacion||p.aclaracion||'')].join('|'))));
  return set;
}
function cpParseMonthlySheet(wb,sheetName,excelCatalog){
  const ws=wb.Sheets[sheetName];if(!ws)return [];
  const rows=window.XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:'',blankrows:true});
  let hi=-1;for(let i=0;i<Math.min(rows.length,30);i++){const h=rows[i].map(cpNormHeader);if(h.some(x=>x.includes('codigo de articulo'))&&h.some(x=>x.includes('ingreso'))) {hi=i;break;}}
  if(hi<0)return [];
  const heads=rows[hi].map(cpNormHeader);
  const col=(...names)=>{for(const n of names){const q=cpNormHeader(n),ix=heads.findIndex(h=>h===q||h.includes(q));if(ix>=0)return ix;}return -1;};
  const ix={proveedor:col('Proveedor'),fc:col('FC'),nro:col('N° FC','Nro FC'),sem:col('Semana'),fecha:col('Ingresó','Ingreso'),codigo:col('Codigo de Articulo'),desc:col('Descripcion 1','Descripcion','com'),aclar:col('Aclaracion'),rubro:col('Rubro'),unid:col('Unidades'),unitN:col('$ Unit Neto','Unit Neto'),neto:col('Total Neto'),iva:col('Iva'),unitB:col('$ Unit Bruto','Unit Bruto'),bruto:col('Total Bruto'),medio:col('Medio de Pago')};
  const out=[];
  for(let ri=hi+1;ri<rows.length;ri++){
    const r=rows[ri],get=k=>ix[k]>=0?r[ix[k]]:'';
    const fecha=cpExcelISO(get('fecha')),codigo=String(get('codigo')||'').trim(),desc=String(get('desc')||'').trim(),bruto=num(get('bruto'));
    if(!fecha&&!codigo&&!desc&&!bruto)continue;
    if((!codigo&&!desc)||!bruto)continue;
    const art=cpArticleByCode(codigo,excelCatalog);
    const pm=cpPaymentMethod(get('medio')),fcRaw=String(get('fc')||'').trim(),nro=String(get('nro')||'').trim();
    const fcOk=!!fcRaw&&!/^n\/?a$/i.test(fcRaw)&&fcRaw.toLowerCase()!=='ver';
    const row={
      sheet:sheetName,row:ri+1,fecha,proveedor:String(get('proveedor')||'').trim(),codigo,descripcion:desc,aclaracion:String(get('aclar')||'').trim(),rubro:String(get('rubro')||'').trim(),
      cantidad:num(get('unid'))||1,precioUnitarioNeto:num(get('unitN')),totalNeto:num(get('neto')),ivaImporte:num(get('iva')),
      precioUnitarioBruto:num(get('unitB')),totalBruto:bruto,medioPago:pm.normalizado,medioPagoOriginal:pm.original,
      fc:fcOk?'si':'no',tipoComprobante:fcOk&&/^[ABC]$/i.test(fcRaw)?'Factura '+fcRaw.toUpperCase():(fcOk?'Otro':'Sin comprobante'),
      numeroComprobante:cpValidInvoiceNumber(nro)?nro:'',numeroComprobanteOriginal:nro,semanaExcel:String(get('sem')||'').trim(),articuloId:art?.id||'',descripcionCatalogo:art?.descripcion||'',unidad:art?.unidad||'',familia:String(get('rubro')||'').trim()||art?.familia||'',subfamilia:art?.subfamilia||'',catalogSource:art?._catalogSource||'',
      status:art?'valida':'ambigua',motivo:art?(art._catalogSource==='firestore'?'Vinculada a Artículos':art._catalogSource==='excel'?'Código válido del catálogo Excel; se creará/vinculará al importar':'Código válido de base TIZ; falta vincularlo en Firestore'):'Código sin correspondencia en el catálogo'
    };
    if(!fecha){row.status='ambigua';row.motivo='Falta la fecha de ingreso en el Excel';}
    out.push(row);
  }
  return out;
}
function cpParsePrevisiones(wb){
  const ws=wb.Sheets['Previsiones'];if(!ws)return [];
  const rows=window.XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:'',blankrows:false});
  let hi=-1;for(let i=0;i<15;i++){const h=(rows[i]||[]).map(cpNormHeader);if(h.some(x=>x==='descripcion')&&h.some(x=>x.includes('importe bruto'))&&h.some(x=>x.includes('fecha de pago'))){hi=i;break;}}
  if(hi<0)return [];
  const h=rows[hi].map(cpNormHeader),find=q=>h.findIndex(x=>x.includes(cpNormHeader(q)));
  const ix={nro:find('nro de cheque'),desc:find('descripcion'),importe:find('importe bruto'),fecha:find('fecha de pago')};
  const out=[];
  for(let ri=hi+1;ri<rows.length;ri++){
    const r=rows[ri],desc=String(r[ix.desc]||'').trim(),importe=num(r[ix.importe]),fecha=cpExcelISO(r[ix.fecha]);if(!desc||!importe||!fecha)continue;
    const plausible=fecha>='2025-01-01'&&fecha<='2027-12-31';
    out.push({sheet:'Previsiones',row:ri+1,proveedor:desc,concepto:desc,importe,vencimiento:fecha,referencia:String(r[ix.nro]||'').trim(),medio:'Cheque',status:plausible?'revision':'ambigua',motivo:plausible?'':'Fecha fuera del rango esperable para la planilla 2026'});
  }
  return out;
}
function cpBuildMigrationPreview(wb,fileName,selectedSheet=''){ 
  const excelCatalog=cpParseExcelCatalog(wb);
  const monthly=['Ene','Feb','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].filter(n=>wb.Sheets[n]&&(!selectedSheet||n===selectedSheet));
  const rows=monthly.flatMap(n=>cpParseMonthlySheet(wb,n,excelCatalog));
  const existing=cpCurrentPurchaseSignatures();
  rows.forEach(r=>{if(existing.has(cpExistingRowSignature(r))){r.status='duplicada';r.motivo='Ya existe una compra equivalente';}});
  const groups=new Map();
  rows.filter(r=>r.status==='valida').forEach(r=>{
    const hasInvoice=cpValidInvoiceNumber(r.numeroComprobante);
    const k=hasInvoice?[r.sheet,r.fecha,r.tipoComprobante,r.numeroComprobante,r.proveedor].join('|'):[r.sheet,'fila',r.row].join('|');
    if(!groups.has(k))groups.set(k,{key:k,sheet:r.sheet,rows:[],fecha:r.fecha,proveedor:r.proveedor,fc:r.fc,tipoComprobante:r.tipoComprobante,numeroComprobante:r.numeroComprobante,medioPago:r.medioPago,medioPagoOriginal:r.medioPagoOriginal});
    groups.get(k).rows.push(r);
  });
  const purchases=[...groups.values()].map(g=>{
    const totalNeto=g.rows.reduce((s,r)=>s+num(r.totalNeto),0),ivaTotal=g.rows.reduce((s,r)=>s+num(r.ivaImporte),0),totalBruto=g.rows.reduce((s,r)=>s+num(r.totalBruto),0);
    return {...g,totalNeto,ivaTotal,totalBruto,docId:'imp26_'+cpHash32(fileName+'|'+g.key)};
  });
  const previsiones=selectedSheet?[]:cpParsePrevisiones(wb);
  const existingPays=new Set(C.pagos.map(p=>[p.vencimiento,normText(p.proveedor||p.concepto||''),Math.round(num(p.importe)*100)/100,normText(p.referencia||'')].join('|')));
  previsiones.forEach(p=>{const sig=[p.vencimiento,normText(p.proveedor),Math.round(num(p.importe)*100)/100,normText(p.referencia)].join('|');if(existingPays.has(sig)){p.status='duplicada';p.motivo='Ya existe un compromiso equivalente';}});
  const catalogMissing=[...excelCatalog.values()].filter(a=>!C.articulos.some(x=>String(x.codigo||'').trim().padStart(6,'0')===a.codigo));
  return {fileName,monthly,rows,purchases,previsiones,excelCatalog:[...excelCatalog.values()],catalogMissing,createdAt:new Date().toISOString()};
}
function renderMigracion(el){
  const p=migrationPreview;
  if(!p){el.innerHTML=`<div class="cp-panel"><div style="display:flex;justify-content:space-between;gap:15px;align-items:flex-start;flex-wrap:wrap"><div><b>Migración controlada desde Excel</b><div class="cp-sub" style="max-width:720px">Primero se analiza el archivo y se muestra una previsualización. No se escribe nada en Firestore hasta confirmar. Los códigos se vinculan contra Artículos y las filas dudosas quedan afuera.</div></div><span class="cp-pill warn">Sin escritura automática</span></div><div class="cp-row" style="margin-top:14px"><div class="cp-field"><label>Archivo histórico de Compras</label><input id="cp-mig-file" type="file" accept=".xlsx,.xls"></div><div class="cp-field"><label>Mes a importar</label><select id="cp-mig-month"><option value="">Todos los meses</option>${['Ene','Feb','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map(n=>`<option>${n}</option>`).join('')}</select></div><div class="cp-field"><label>Acción</label><button class="cp-btn primary" style="margin-top:16px;width:100%" onclick="cpAnalizarMigracion()">Analizar y previsualizar</button></div></div><div class="cp-alert amber" style="margin-top:12px"><div>🛡</div><div><b>Protección activa</b><div class="cp-sub">No toca Facturación, Cobranzas, ARCA, Producción ni PDFs. La importación utiliza únicamente las colecciones del módulo Compras.</div></div></div></div>`;return;}
  const valid=p.rows.filter(r=>r.status==='valida'),dup=p.rows.filter(r=>r.status==='duplicada'),amb=p.rows.filter(r=>r.status==='ambigua');
  const linked=valid.filter(r=>r.articuloId).length,baseLinked=valid.filter(r=>!r.articuloId&&r.catalogSource).length,prevOk=p.previsiones.filter(x=>x.status!=='duplicada'&&x.status!=='ambigua'),prevAmb=p.previsiones.filter(x=>x.status==='ambigua');
  const sample=[...amb,...dup,...valid].slice(0,120).map(r=>`<tr><td><span class="cp-pill ${r.status==='valida'?'yes':r.status==='duplicada'?'warn':'no'}">${esc(r.status)}</span></td><td>${esc(r.sheet)} · ${r.row}</td><td>${fmtDate(r.fecha)}</td><td><b>${esc(r.codigo)}</b></td><td>${esc(r.descripcion)}</td><td>${esc(r.rubro)}</td><td>${money(r.totalBruto)}</td><td>${esc(r.medioPagoOriginal||r.medioPago||'—')}</td><td>${esc(r.motivo||'Vinculada al catálogo')}</td></tr>`).join('');
  el.innerHTML=`
    <div class="cp-pay-toolbar"><div><div class="cp-pay-title">Previsualización · ${esc(p.fileName)}</div><div class="cp-sub">Hojas detectadas: ${p.monthly.map(esc).join(', ')}</div></div><div class="cp-actions"><button class="cp-btn" onclick="cpResetMigracion()">Cambiar archivo</button><button class="cp-btn primary" onclick="cpConfirmarMigracion()">Importar sólo filas válidas</button></div></div>
    <div class="cp-grid">
      <div class="cp-card"><div class="cp-lbl">Filas válidas</div><div class="cp-kpi" style="color:var(--green)">${valid.length}</div><div class="cp-sub">${p.purchases.length} compras agrupadas · ${money(valid.reduce((s,r)=>s+r.totalBruto,0))}</div></div>
      <div class="cp-card"><div class="cp-lbl">Duplicadas</div><div class="cp-kpi" style="color:var(--amber)">${dup.length}</div><div class="cp-sub">No se importan</div></div>
      <div class="cp-card"><div class="cp-lbl">A revisar</div><div class="cp-kpi" style="color:var(--red)">${amb.length}</div><div class="cp-sub">No se importan</div></div>
      <div class="cp-card"><div class="cp-lbl">Artículos ya vinculados</div><div class="cp-kpi">${linked}</div><div class="cp-sub">${baseLinked} válidos por catálogo a crear/vincular</div></div>
      <div class="cp-card"><div class="cp-lbl">Catálogo faltante</div><div class="cp-kpi">${p.catalogMissing.length}</div><div class="cp-sub">códigos de Base de Datos aún no creados</div></div>
      <div class="cp-card"><div class="cp-lbl">Previsiones detectadas</div><div class="cp-kpi">${p.previsiones.length}</div><div class="cp-sub">${prevOk.length} utilizables · ${prevAmb.length} con fecha a revisar</div></div>
    </div>
    <div class="cp-panel"><b>Catálogo maestro</b><div class="cp-sub">El Excel trae ${p.excelCatalog.length} códigos en “Base de Datos”. Los que todavía no existen en Artículos pueden crearse durante la migración para conservar la referencia histórica.</div><div class="cp-row" style="margin-top:10px"><div class="cp-field"><label>Catálogo faltante</label><select id="cp-mig-catalog-mode"><option value="create">Crear artículos faltantes desde Base de Datos</option><option value="skip">No crear; conservar sólo el código histórico</option></select></div></div></div>
    <div class="cp-panel"><b>Tratamiento de Previsiones / cheques</b><div class="cp-sub">La hoja Previsiones es ambigua respecto de si “Fecha de Pago” es vencimiento previsto o pago ya realizado. Por seguridad no se importa por defecto.</div><div class="cp-row" style="margin-top:10px"><div class="cp-field"><label>Al confirmar</label><select id="cp-mig-prev-mode"><option value="skip">No importar previsiones</option><option value="pagado">Importar como histórico / pagado</option><option value="pendiente">Importar como pendiente</option></select></div></div></div>
    <div class="cp-table-wrap"><table class="cp-table" style="min-width:1200px"><thead><tr><th>Estado</th><th>Origen</th><th>Fecha</th><th>Código</th><th>Descripción</th><th>Rubro</th><th>Total</th><th>Medio original</th><th>Control</th></tr></thead><tbody>${sample||'<tr><td colspan="9">Sin filas.</td></tr>'}</tbody></table></div>
    <div class="cp-pay-footer">Las compras importadas conservan archivo, hoja y filas de origen. Se usan IDs determinísticos para que volver a cargar el mismo archivo no duplique la migración.</div>`;
}
window.cpResetMigracion=()=>{migrationPreview=null;migrationFileName='';render();};
window.cpAnalizarMigracion=async()=>{
  const input=document.getElementById('cp-mig-file'),file=input?.files?.[0];if(!file)return toast('Seleccioná el Excel de Compras.');
  try{toast('Analizando Excel…');await cpEnsureXLSX();const buf=await file.arrayBuffer();const wb=window.XLSX.read(buf,{type:'array',cellDates:true});migrationFileName=file.name;migrationPreview=cpBuildMigrationPreview(wb,file.name,document.getElementById('cp-mig-month')?.value||'');render();toast('Previsualización lista. Todavía no se escribió nada.');}
  catch(e){console.error('[Compras migración]',e);toast('No se pudo analizar el Excel: '+(e?.message||e));}
};
window.cpConfirmarMigracion=async()=>{
  const p=migrationPreview;if(!p)return;
  const valid=p.rows.filter(r=>r.status==='valida');if(!valid.length)return toast('No hay filas válidas para importar.');
  const mode=document.getElementById('cp-mig-prev-mode')?.value||'skip',catalogMode=document.getElementById('cp-mig-catalog-mode')?.value||'create';
  const msg=`Se crearán/actualizarán ${p.purchases.length} compras históricas desde ${valid.length} filas válidas.${catalogMode==='create'?' Se completarán '+p.catalogMissing.length+' artículos faltantes del catálogo.':''}${mode==='skip'?' No se importarán previsiones.':' También se importarán '+p.previsiones.filter(x=>x.status!=='duplicada'&&x.status!=='ambigua').length+' previsiones como '+mode+'. Las fechas anómalas quedarán afuera.'} ¿Continuar?`;
  if(!confirm(msg))return;
  try{
    if(catalogMode==='create'&&p.catalogMissing.length){
      const existing=new Set(C.articulos.map(a=>String(a.codigo||'').trim().padStart(6,'0')));
      const missing=p.catalogMissing.filter(a=>!existing.has(a.codigo));
      for(let start=0;start<missing.length;start+=400){
        const batch=writeBatch(db);
        missing.slice(start,start+400).forEach(a=>{
          const id='art_'+a.codigo;
          batch.set(doc(db,'articulosCompra',id),{codigo:a.codigo,descripcion:a.descripcion,unidad:a.unidad||'',familia:a.familia||'Sin clasificar',subfamilia:a.subfamilia||'',control:['Hierros','Chapas','Acrilicos','Lonas y Vinilos','Iluminacion','Maderas y otros','Pai PVC y polyfan'].includes(a.familia)?'estrategico':['Servicios','Sueldos','Publicidad','Alquiler','Comisiones','Colocaciones Externas','Cortes / Impresiones Externas'].includes(a.familia)?'sin_stock':'consumible',stockMinimo:0,origen:'excel_2026_catalogo',_ts:serverTimestamp()},{merge:true});
        });
        await batch.commit();
      }
    }
    const articleIdByCode=new Map(C.articulos.map(a=>[String(a.codigo||'').trim().padStart(6,'0'),a.id]));
    if(catalogMode==='create')p.catalogMissing.forEach(a=>articleIdByCode.set(a.codigo,'art_'+a.codigo));
    const purchaseOps=p.purchases;
    for(let start=0;start<purchaseOps.length;start+=400){
      const batch=writeBatch(db);
      purchaseOps.slice(start,start+400).forEach(g=>{
        const items=g.rows.map(r=>({articuloId:r.articuloId||articleIdByCode.get(String(r.codigo||'').trim().padStart(6,'0'))||'',codigo:r.codigo,descripcionOriginal:r.descripcion,aclaracion:r.aclaracion,descripcion:r.descripcionCatalogo||r.descripcion,familia:r.familia,rubro:r.rubro,subfamilia:r.subfamilia,unidad:r.unidad||'',cantidad:r.cantidad,precioUnitarioNeto:r.precioUnitarioNeto,totalNeto:r.totalNeto,ivaImporte:r.ivaImporte,ivaPct:r.totalNeto?Math.round((r.ivaImporte/r.totalNeto)*10000)/100:0,totalBruto:r.totalBruto,origenExcel:{archivo:p.fileName,hoja:r.sheet,fila:r.row}}));
        const data={fecha:g.fecha,semana:paymentWeek(g.fecha),proveedor:g.proveedor||'',proveedorPendiente:!g.proveedor,fc:g.fc,tipoComprobante:g.tipoComprobante,numeroComprobante:g.numeroComprobante,medioPago:g.medioPago||'',medioPagoOriginal:g.medioPagoOriginal||'',destino:g.rows.some(isServicePurchaseItem)?'Gasto general':'Stock',ot:'',observacion:g.rows.map(r=>r.aclaracion).filter(Boolean).join(' | '),items,totalNeto:g.totalNeto,ivaTotal:g.ivaTotal,totalBruto:g.totalBruto,origen:'excel_2026',importacion:{archivo:p.fileName,hoja:g.sheet,filas:g.rows.map(r=>r.row),clave:g.key},_ts:serverTimestamp()};
        batch.set(doc(db,'compras',g.docId),data,{merge:true});
      });
      await batch.commit();
    }
    if(mode!=='skip'){
      const prev=p.previsiones.filter(x=>x.status!=='duplicada'&&x.status!=='ambigua');
      for(let start=0;start<prev.length;start+=400){
        const batch=writeBatch(db);
        prev.slice(start,start+400).forEach(x=>{const id='imp26p_'+cpHash32(p.fileName+'|'+x.sheet+'|'+x.row+'|'+x.vencimiento+'|'+x.proveedor+'|'+x.importe);batch.set(doc(db,'pagosCompra',id),{proveedor:x.proveedor,concepto:x.concepto,importe:x.importe,vencimiento:x.vencimiento,semana:paymentWeek(x.vencimiento),medio:'Cheque',condicion:'Cheque',referencia:x.referencia||'',ot:'',observacion:'Migrado desde Previsiones',estado:mode==='pagado'?'pagado':'pendiente',fechaPago:mode==='pagado'?x.vencimiento:'',origen:'excel_2026_previsiones',importacion:{archivo:p.fileName,hoja:x.sheet,fila:x.row},_ts:serverTimestamp()},{merge:true});});
        await batch.commit();
      }
    }
    toast('Migración completada. Filas dudosas y duplicadas quedaron afuera.');
    migrationPreview=null;currentTab='compras';setTimeout(render,300);
  }catch(e){console.error('[Compras migración guardar]',e);toast('La migración se detuvo: '+(e?.message||e));}
};

function renderConteo(el){
  return cpMaterialsControl.renderCounts(el);
  const arts=C.articulos.filter(a=>a.control!=='sin_stock'); const last=latestCounts();
  el.innerHTML=`<div class="cp-panel"><b>Conteo físico semanal · martes</b><p class="cp-sub">El conteo físico se realiza todos los martes. Solo se informa lo que queda. El ERP calcula consumo real: stock inicial + compras − stock final y lo compara contra materiales reservados por OT.</p><div class="cp-row"><div class="cp-field"><label>Semana</label><input id="cp-count-week" value="${weekKey()}"></div><div class="cp-field"><label>Fecha de cierre</label><input id="cp-count-date" type="date" value="${todayISO()}"></div></div></div>
  <div class="cp-table-wrap"><table class="cp-table" style="min-width:720px"><thead><tr><th>Artículo</th><th>Tipo</th><th>Último conteo</th><th>Compras desde conteo</th><th>Planificado OT</th><th>Conteo actual</th><th>Consumo calculado</th></tr></thead><tbody>${arts.map(a=>countRow(a,last[a.id]||last[a.descripcion])).join('')||'<tr><td colspan="7">Primero cargá artículos controlados.</td></tr>'}</tbody></table></div><div style="margin-top:12px;text-align:right"><button class="cp-btn primary" onclick="cpSaveConteo()">Confirmar conteo semanal</button></div>`;
}
function countRow(a,prev){
 const view=cpStockArticle(a),since=prev?.conteo?.fecha||'0000-00-00';let ini=0,bought=0,plan=0,issue='';
 try{if(prev)ini=cpStockAmount(prev,a);for(const i of purchaseItems().filter(i=>i.articuloId===a.id&&String(i.compra.fecha||'')>since&&normText(i.compra.destino)==='stock'))bought+=cpStockAmount(i,a);for(const i of C.planes.filter(p=>p.estado!=='cerrado').flatMap(p=>p.items||[]).filter(i=>i.articuloId===a.id))plan+=cpStockAmount(i,a,i.cantidadPlanificada??i.cantidadSugerida);}catch(e){issue=e.message;}
 return `<tr data-count-row data-id="${a.id}" data-desc="${esc(a.descripcion)}" data-unit="${esc(view.unidad)}" data-inicial="${ini}" data-compras="${bought}" data-plan="${plan}" data-unit-error="${esc(issue)}" data-primer-conteo="${prev?'0':'1'}"><td><b>${esc(a.descripcion)}</b><div class="cp-sub">${esc(view.unidad)} · compra: ${esc(a.unidad)}${issue?' · '+esc(issue):''}</div></td><td>${esc(a.control||'')}</td><td>${prev?ini:'Sin conteo'}</td><td>+${bought}</td><td>${plan}</td><td><input class="cp-count-input" type="number" min="0" step="0.01" style="width:95px" oninput="cpCalcCountRow(this)"></td><td class="cp-consumo">—</td></tr>`;
}

function renderArticulos(el){const families=familyOptions();el.innerHTML=`<div class="cp-panel"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><b>Catálogo maestro de artículos</b><p class="cp-sub">Código + descripción normalizada + familia + subfamilia. Para consultar el catálogo original elegí Mostrar → Referencias originales por revisar. Las referencias no generan stock ni compras; conservan familia y unidad original.</p></div><button class="cp-btn" onclick="cpImportCatalogoBase()">Importar base TIZ (${CATALOGO_TIZ_BASE.length})</button></div><div class="cp-row" style="margin-top:10px"><div class="cp-field"><label>Código</label><input id="cp-a-code" placeholder="000332"></div><div class="cp-field"><label>Descripción normalizada</label><input id="cp-a-desc"></div><div class="cp-field"><label>Unidad</label><input id="cp-a-unit" list="cp-unit-list"><datalist id="cp-unit-list"><option value="UNID"><option value="MTS"><option value="M2"><option value="LTS"><option value="KG"><option value="PLACA"><option value="ROLLO"><option value="SERVICIO"></datalist></div><div class="cp-field"><label>Familia</label><input id="cp-a-family" list="cp-family-list" oninput="cpArticleFamilyChanged()" onchange="cpArticleFamilyChanged()" placeholder="Ej.: Hierros"></div><div class="cp-field"><label>Subfamilia</label><input id="cp-a-subfamily" list="cp-subfamily-list" placeholder="Elegí primero la familia"></div><div class="cp-field"><label>Control</label><select id="cp-a-control"><option value="estrategico">Estratégico por OT</option><option value="consumible">Consumible por conteo</option><option value="sin_stock">Servicio / sin stock</option></select></div><div class="cp-field"><label>Stock mínimo</label><input id="cp-a-min" type="number" step="0.01"></div></div><datalist id="cp-family-list">${families.map(v=>`<option value="${esc(v)}"></option>`).join('')}</datalist><datalist id="cp-subfamily-list"></datalist><div style="margin-top:9px"><button class="cp-btn primary" onclick="cpAddArticulo()">Agregar artículo</button></div></div><div class="cp-panel"><div class="cp-row"><div class="cp-field"><label>Buscar catálogo</label><input id="cp-art-search" placeholder="Código o descripción" oninput="cpRenderArticleRows()"></div><div class="cp-field"><label>Mostrar</label><select id="cp-art-scope" onchange="cpRenderArticleRows()"><option value="registrados">Insumos dados de alta</option><option value="referencias">Referencias originales por revisar</option><option value="todos">Todo el catálogo</option></select></div><div class="cp-field"><label>Familia</label><select id="cp-art-family" onchange="cpRenderArticleRows()"><option value="">Todas</option>${families.map(v=>`<option>${esc(v)}</option>`).join('')}</select></div></div></div><div class="cp-table-wrap"><table class="cp-table" style="min-width:1050px"><thead><tr><th>Código</th><th>Artículo</th><th>Familia</th><th>Subfamilia</th><th>Unidad de control</th><th>Control</th><th>Mínimo</th><th>Última compra / costo por m² o unidad</th><th>Stock disponible</th><th></th></tr></thead><tbody id="cp-art-rows"></tbody></table></div>`;cpArticleFamilyChanged();cpRenderArticleRows();}
function cpQuoteItemsForWork(o){
  const raw=Array.isArray(o?.itemsTecnicos)&&o.itemsTecnicos.length?o.itemsTecnicos:(Array.isArray(o?.itemsCotizados)?o.itemsCotizados:[]);
  return raw.map(i=>String(i?.articulo||i?.descripcion||i?.desc||'').trim()).filter(Boolean);
}
function cpPlanForWork(o){return C.planes.find(p=>p.obraId===o.id||window.TIZComprasObrasCoreV1.same(p.ot,o.ot||o.nro));}
function cpPendingExplosionWorks(){return cpWorks().filter(o=>!cpPlanForWork(o));}
function renderPlanes(el){
  return cpMaterialsControl.renderPlans(el);
  const obras=cpWorks();
  const pending=obras.filter(o=>!cpPlanForWork(o));
  const pendingRows=pending.map(o=>{
    const qi=cpQuoteItemsForWork(o);
    return `<tr><td><b>OT ${esc(o.ot||o.nro||'—')}</b><span data-ap-drive-ot="${esc(o.ot||o.nro)}" data-ap-drive-id="${esc(o.id)}"></span></td><td><b>${esc(o.cliente||'')}</b><div class="cp-sub">${esc(o.desc||o.descripcion||'')}</div></td><td>${qi.length?qi.slice(0,4).map(esc).join(' · '):'Sin ítems técnicos cargados'}</td><td><span class="cp-pill warn">Pendiente</span></td><td><button class="cp-btn primary" onclick="cpExplodeObra('${o.id}')">Hacer explosión</button></td></tr>`;
  }).join('');
  el.innerHTML=`<div class="cp-pay-toolbar"><div><div class="cp-pay-title">Materiales por OT · explosión</div><div class="cp-sub">Toda obra nueva aparece automáticamente desde Ventas / Presupuestos. Caro descompone los materiales específicos; los consumibles genéricos se controlan por stock mínimo.</div>${cpMotherState()}</div><button class="cp-btn" onclick="cpRefreshMother()" ${cpMotherBusy?'disabled':''}>Actualizar desde TIZ 2026</button></div>
  <div class="cp-grid"><div class="cp-card"><div class="cp-lbl">OT activas</div><div class="cp-kpi">${obras.length}</div></div><div class="cp-card"><div class="cp-lbl">Pendientes de explosión</div><div class="cp-kpi" style="color:${pending.length?'var(--amber)':'var(--green)'}">${pending.length}</div></div><div class="cp-card"><div class="cp-lbl">Con plan</div><div class="cp-kpi">${C.planes.length}</div></div><div class="cp-card"><div class="cp-lbl">Objetivo stock mínimo</div><div class="cp-kpi" style="font-size:18px">≤ 35</div><div class="cp-sub">ítems por debajo del mínimo</div></div></div>
  <div class="cp-panel"><b>Obras nuevas para Compras</b><div class="cp-sub">La OT no se duplica: sólo se crea su plan de materiales.</div><div class="cp-table-wrap" style="margin-top:10px"><table class="cp-table" style="min-width:900px"><thead><tr><th>OT</th><th>Trabajo</th><th>Ítems vendidos</th><th>Estado</th><th></th></tr></thead><tbody>${pendingRows||'<tr><td colspan="5">Todas las obras activas ya tienen plan.</td></tr>'}</tbody></table></div></div>
  ${C.planes.map(planCard).join('')||'<div class="cp-panel">Todavía no hay planes de materiales.</div>'}`;
}
function cpPhysicalStock(a){const meta=cpStockMeta(a);return meta?.stockFisico??0;}
function cpReservedStock(articleId,desc,excludePlanId=''){const a=C.articulos.find(a=>a.id===articleId)||C.articulos.find(a=>normText(a.descripcion)===normText(desc));if(!a)return 0;return C.planes.filter(p=>p.estado!=='cerrado'&&p.id!==excludePlanId).flatMap(p=>p.items||[]).filter(i=>i.modoStock!=='generico'&&i.articuloId===a.id).reduce((sum,i)=>{try{return sum+cpStockAmount(i,a,i.cantidadPlanificada??i.cantidadSugerida);}catch{return NaN;}},0);}

function planCard(p){
  const o=cpWorks().find(x=>x.id===p.obraId||window.TIZComprasObrasCoreV1.same(x.ot,p.ot));
  const sold=(p.componentesVenta&&p.componentesVenta.length?p.componentesVenta:cpQuoteItemsForWork(o||{}));
  const rows=(p.items||[]).map((i,ix)=>{
    const art=C.articulos.find(a=>a.id===i.articuloId)||C.articulos.find(a=>normText(a.descripcion)===normText(i.descripcion));
    const view=art?cpStockArticle(art):{unidad:i.unidad};let q;try{q=art?cpStockAmount(i,art,i.cantidadPlanificada??i.cantidadSugerida):num(i.cantidadPlanificada??i.cantidadSugerida);}catch{q=NaN;}const physical=cpPhysicalStock(art),reserved=cpReservedStock(i.articuloId,i.descripcion,p.id),generic=i.modoStock==='generico'||art?.control==='consumible';
    const free=Math.max(0,physical-reserved),need=generic?0:Math.max(0,q-free),after=generic?null:Math.max(0,free-q);
    const dim=[i.medidas?.largo&&('L '+i.medidas.largo),i.medidas?.ancho&&('A '+i.medidas.ancho),i.medidas?.espesor&&('E '+i.medidas.espesor)].filter(Boolean).join(' · ');
    return `<tr><td><b>${esc(i.codigo||art?.codigo||'')}</b> ${esc(i.descripcion||art?.descripcion||'')}<div class="cp-sub">${esc(art?.familia||'')}${dim?' · '+esc(dim):''}</div></td><td><span class="cp-pill ${generic?'warn':'yes'}">${generic?'Genérico / mínimo':'Específico OT'}</span></td><td><input type="number" step="0.01" value="${q}" style="width:80px" onchange="cpUpdatePlanQty('${p.id}',${ix},this.value)"> ${esc(view.unidad||'')}</td><td>${physical}</td><td>${generic?'—':reserved}</td><td><b style="color:${need?'var(--red)':'var(--green)'}">${generic?'mínimo':after}</b></td><td><b style="color:${need?'var(--red)':'var(--text2)'}">${generic?'—':need}</b></td><td>${esc(i.observacion||'')}</td><td><button class="cp-btn danger" onclick="cpRemovePlanItem('${p.id}',${ix})">✕</button></td></tr>`;
  }).join('');
  const done=p.explosionCompleta||p.estado==='explosion completa';
  return `<div class="cp-panel"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><b>OT ${esc(p.ot)} · ${esc(p.cliente||o?.cliente||'')} · ${esc(p.descripcion||o?.desc||'')}</b><div class="cp-sub">${esc(p.estado||'')} · origen ${esc(p.origen||'manual')}</div></div><div class="cp-actions"><button class="cp-btn" onclick="cpAddPlanItem('${p.id}')">＋ Material</button><button class="cp-btn ${done?'':'primary'}" onclick="cpCompleteExplosion('${p.id}')">${done?'✓ Explosión completa':'Marcar explosión completa'}</button></div></div>${sold.length?`<div class="cp-alert green" style="margin-top:10px"><div>◫</div><div><b>Ítems vendidos</b><div class="cp-sub">${sold.map(esc).join(' · ')}</div></div></div>`:''}<div class="cp-table-wrap" style="margin-top:10px"><table class="cp-table" style="min-width:1200px"><thead><tr><th>Material / medida</th><th>Control</th><th>Cant. OT</th><th>Stock físico</th><th>Reservado otras OT</th><th>Disponible luego OT</th><th>A comprar</th><th>Observación</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="9">Sin materiales. Agregá los materiales específicos de esta OT.</td></tr>'}</tbody></table></div></div>`;
}
window.cpCompleteExplosion=async id=>{const p=C.planes.find(x=>x.id===id);if(!p)return;if(!(p.items||[]).length&&!confirm('La explosión no tiene materiales. ¿Marcarla completa igualmente?'))return;await updateDoc(doc(db,'planesMateriales',id),{estado:'explosion completa',explosionCompleta:true,fechaExplosion:todayISO(),_tsExplosion:serverTimestamp()});toast('Explosión completada.');};

function renderAlertas(el){const al=alerts();el.innerHTML=`<div class="cp-panel"><b>Alertas visuales y avisos</b><p class="cp-sub">Se generan desde comprobantes, vencimientos, stock mínimo, planes de OT e historial de precios.</p></div>${al.map(alertHTML).join('')||'<div class="cp-alert green">✅ Sin alertas activas.</div>'}`}

window.cpTab=t=>{if(t==='historico')cpPurchaseView='anual';currentTab=t==='base-datos'?'articulos':t==='obras'?'planes':t==='migracion'?'compras':t==='historico'?'compras':t==='contrataciones'?'compras':t;document.querySelectorAll('.cp-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===currentTab));render();};
window.cpNuevaCompra=()=>{compraEditId=null;selectedFile=null;document.getElementById('cp-modal-compra').classList.add('open');const file=document.getElementById('cp-file');if(file)file.value='';['cp-proveedor','cp-numero','cp-ot','cp-obs','cp-vencimiento','cp-primer-venc','cp-ref-pago'].forEach(id=>document.getElementById(id).value='');document.getElementById('cp-fecha').value=todayISO();document.getElementById('cp-fc').value='si';document.getElementById('cp-tipo').value='Factura A';document.getElementById('cp-condicion').value='contado';document.getElementById('cp-tipo-costo').value='CD';document.getElementById('cp-cuotas').value=1;document.getElementById('cp-dias-cuota').value=30;document.getElementById('cp-items-body').innerHTML='';cpAddItem();syncFC();calcTotals();};
window.cpCloseCompra=()=>{ if(aiCleanupActive) aiCleanupActive('cancelled'); document.getElementById('cp-modal-compra').classList.remove('open'); };
function refreshCatalogDatalist(){const dl=document.getElementById('cp-catalog-list');if(!dl)return;dl.innerHTML=C.articulos.map(a=>`<option value="${esc(a.descripcion)}">${esc(a.codigo||'')} · ${esc(a.familia||'')}${a.subfamilia?' / '+esc(a.subfamilia):''}</option>`).join('');}
function cpRefreshItemText(tr){
 const input=tr.querySelector('.i-desc'),full=tr.querySelector('.cp-full-desc'),original=tr.querySelector('.i-original');
 if(input&&full){full.textContent=input.value;full.hidden=!input.value.trim();input.title=input.value;}
 if(original){original.style.height='auto';original.style.height=Math.max(96,original.scrollHeight+2)+'px';}
}
function applyArticleToRow(tr,a,score=1){if(!tr||!a)return;tr.dataset.articleId=a.id||'';tr.querySelector('.i-desc').value=a.descripcion||'';tr.querySelector('.i-code').value=a.codigo||'';tr.querySelector('.i-family').value=a.familia||a.rubro||'';tr.querySelector('.i-subfamily').value=a.subfamilia||'';if(!tr.querySelector('.i-unit').value&&a.unidad)tr.querySelector('.i-unit').value=a.unidadCompraPreferida||a.unidad;const note=tr.querySelector('.cp-item-match');note.textContent=`Vinculado: ${a.codigo||'s/c'} · ${Math.round(score*100)}%`;note.className='cp-item-match cp-match-ok';cpRefreshItemText(tr);}
function matchRowArticle(tr,force=false){if(cpIngreso){cpPrepareIngresoRow(tr);return;}const typed=tr.querySelector('.i-desc').value||tr.querySelector('.i-original').value,exact=articleByDescription(typed);if(exact)return applyArticleToRow(tr,exact,1);const found=findBestArticle(typed);if(found&&(force||found.score>=.68))return applyArticleToRow(tr,found.article,found.score);tr.dataset.articleId='';const note=tr.querySelector('.cp-item-match');note.textContent='Sin vincular al catálogo';note.className='cp-item-match cp-match-warn';}

function previousItemPrice(desc,articleId,currentDate='9999-12-31'){
  const matches=purchaseItems().filter(x=>(articleId&&x.articuloId===articleId)||(!articleId&&normText(x.descripcion)===normText(desc))).filter(x=>String(x.compra.fecha||'')<currentDate&&num(x.precioUnitarioNeto)>0).sort((a,b)=>String(b.compra.fecha||'').localeCompare(String(a.compra.fecha||'')));
  return matches[0]||null;
}
function checkRowPrice(tr){
  let box=tr.querySelector('.cp-price-alert');if(!box){box=document.createElement('div');box.className='cp-price-alert';tr.querySelector('.i-price')?.parentElement.appendChild(box);}
  const desc=tr.querySelector('.i-desc')?.value||'',price=num(tr.querySelector('.i-price')?.value),date=document.getElementById('cp-fecha')?.value||'9999-12-31';
  const prev=previousItemPrice(desc,tr.dataset.articleId,date);box.className='cp-price-alert';box.textContent='';
  if(!prev||!price)return;let currentCost=price,previousCost=num(prev.precioUnitarioNeto),label=prev.unidad||'';const a=C.articulos.find(a=>a.id===tr.dataset.articleId),core=window.TIZInsumosCotizacionCoreV1;
  if(a&&core&&a.control!=='sin_stock'){try{const view=core.baseArticle(a),data=cpStockUnitData(tr);if(data.error)throw Error(data.error);currentCost=data.precioUnitarioStock/core.stockQuantity(1,data.unidadStock,view);const previousQuantity=Number(prev.cantidad);previousCost=previousQuantity>0?previousCost*previousQuantity/core.movementQuantity(prev,a):previousCost/core.stockQuantity(1,prev.unidad,view);label=view.unidad;}catch{box.classList.add('show','warn');box.textContent='Revisá las unidades antes de comparar los precios.';return;}}
  const pct=(currentCost/previousCost-1)*100;if(pct>=10){box.classList.add('show',pct>=20?'danger':'warn');box.textContent='▲ '+pct.toFixed(1)+'% vs última compra ('+money(previousCost)+' / '+label+')';}
}
window.cpAddItem=(data={})=>{refreshCatalogDatalist();const original=data.descripcionOriginal||data.descripcion||'';const tr=document.createElement('tr');tr.dataset.articleId=data.articuloId||'';tr.innerHTML=`<td><textarea class="i-original cp-original" title="Descripción exacta leída de la factura">${esc(original)}</textarea></td><td><input class="i-desc" list="cp-catalog-list" value="${esc(data.descripcion||original)}" placeholder="Elegir artículo TIZ" aria-label="Buscar o editar artículo TIZ"><div class="cp-full-desc"></div><div class="cp-item-match">Sin vincular al catálogo</div></td><td><input class="i-code" value="${esc(data.codigo||'')}"></td><td><input class="i-family" value="${esc(data.familia||data.rubro||'')}"></td><td><input class="i-subfamily" value="${esc(data.subfamilia||'')}"></td><td><input class="i-qty" type="number" step="0.01" value="${data.cantidad??1}"></td><td><select class="i-unit" aria-label="Unidad del comprobante">${cpPurchaseUnitOptions(data.unidad)}</select></td><td><input class="i-price" type="number" step="0.01" value="${data.precioUnitarioNeto??0}"></td><td><input class="i-iva" type="number" step="0.01" value="${data.ivaPorcentaje??21}"></td><td class="i-total">${money(0)}</td><td><button class="cp-btn danger" onclick="this.closest('tr').remove();cpCalcTotals()">✕</button></td>`;attachFamilySuggestions(tr);tr.querySelectorAll('input,textarea,select').forEach(i=>i.addEventListener('input',calcTotals));tr.querySelector('.i-desc').addEventListener('change',()=>matchRowArticle(tr,true));tr.querySelector('.i-price').addEventListener('blur',()=>checkRowPrice(tr));tr.querySelector('.i-desc').addEventListener('change',()=>setTimeout(()=>checkRowPrice(tr),0));document.getElementById('cp-items-body').appendChild(tr);const linked=data.articuloId&&C.articulos.find(a=>a.id===data.articuloId);if(linked)applyArticleToRow(tr,linked,1);else matchRowArticle(tr,false);calcTotals();};
window.cpCalcTotals=()=>calcTotals();
function rowToItem(tr){const q=num(tr.querySelector('.i-qty').value),p=num(tr.querySelector('.i-price').value),iva=num(tr.querySelector('.i-iva').value),net=q*p;const item={articuloId:tr.dataset.articleId||'',descripcionOriginal:tr.querySelector('.i-original').value.trim(),descripcion:tr.querySelector('.i-desc').value.trim(),codigo:tr.querySelector('.i-code').value.trim(),familia:tr.querySelector('.i-family').value.trim(),subfamilia:tr.querySelector('.i-subfamily').value.trim(),rubro:tr.querySelector('.i-family').value.trim(),cantidad:q,unidad:tr.querySelector('.i-unit').value.trim(),unidadComprobanteOriginal:tr.dataset.unidadComprobanteOriginal||tr.querySelector('.i-unit').value.trim(),precioUnitarioNeto:p,ivaPorcentaje:iva,totalNeto:net,ivaImporte:net*iva/100,totalBruto:net*(1+iva/100)};const stock=typeof cpStockUnitData==='function'?cpStockUnitData(tr):null;return stock?{...item,...(stock.error?{errorUnidadStock:stock.error}:stock)}:item;}
function getItems(){return [...document.querySelectorAll('#cp-items-body tr')].map(rowToItem).filter(i=>i.descripcion);}
function calcTotals(){
  document.querySelectorAll('#cp-items-body tr').forEach(cpRefreshItemText);
  const rows=[...document.querySelectorAll('#cp-items-body tr')];
  rows.forEach(tr=>{const i=rowToItem(tr);tr.querySelector('.i-total').textContent=money(i.totalBruto);});
  const items=rows.map(rowToItem).filter(i=>i.descripcion),net=items.reduce((s,i)=>s+i.totalNeto,0),iva=items.reduce((s,i)=>s+i.ivaImporte,0);
  const el=document.getElementById('cp-totales');if(el)el.textContent=`Neto ${money(net)} · IVA ${money(iva)} · TOTAL ${money(net+iva)}`;
}
window.cpGuardarCompra=async()=>{
  const items=getItems(); if(!items.length)return toast('Agregá al menos un ítem.'); if(items.some(i=>i.errorDistribucion))return toast(items.find(i=>i.errorDistribucion).errorDistribucion);if(items.some(i=>!i.distribucion)&&document.getElementById('cp-destino').value==='OT'&&(!document.getElementById('cp-ot').value.trim()||!document.getElementById('cp-tipo-costo').value))return toast('Completá la OT y su clasificación CD / EX, o distribuí cada ítem.'); const fc=document.getElementById('cp-fc').value; const data={fecha:document.getElementById('cp-fecha').value,semana:weekKey(new Date(document.getElementById('cp-fecha').value+'T12:00:00')),proveedor:document.getElementById('cp-proveedor').value.trim(),fc,tipoComprobante:fc==='si'?document.getElementById('cp-tipo').value:'Sin comprobante',numeroComprobante:document.getElementById('cp-numero').value.trim(),medioPago:document.getElementById('cp-medio').value,vencimiento:document.getElementById('cp-vencimiento').value,condicionPago:document.getElementById('cp-condicion').value,cantidadPagos:Math.max(1,num(document.getElementById('cp-cuotas').value)),primerVencimiento:document.getElementById('cp-primer-venc').value,diasEntrePagos:Math.max(1,num(document.getElementById('cp-dias-cuota').value)||30),referenciaPago:document.getElementById('cp-ref-pago').value.trim(),destino:document.getElementById('cp-destino').value,ot:document.getElementById('cp-ot').value.trim(),tipoCosto:document.getElementById('cp-tipo-costo').value,observacion:document.getElementById('cp-obs').value.trim(),items,totalNeto:items.reduce((s,i)=>s+i.totalNeto,0),ivaTotal:items.reduce((s,i)=>s+i.ivaImporte,0),totalBruto:items.reduce((s,i)=>s+i.totalBruto,0),usuario:window.currentUser?.email||'',_ts:serverTimestamp()};
  if(!data.proveedor)return toast('Ingresá el proveedor.');
  if(cpIngreso){data.proveedorId=cpIngreso.providerId;data.proveedorCuit=C.proveedores.find(p=>p.id===cpIngreso.providerId)?.cuit||'';data.ingresoGuiadoVersion=1;data.archivoOrigen=selectedFile?{nombre:selectedFile.name,tipo:selectedFile.type}:null;}
  let savedId=compraEditId;if(compraEditId)await updateDoc(doc(db,'compras',compraEditId),data);else{const ref=await addDoc(collection(db,'compras'),data);savedId=ref.id;compraEditId=savedId;}await cpSyncPagosCompra(savedId,data);
  cpCloseCompra();toast('Compra y previsión de pagos guardadas.');
};
window.cpEditCompra=id=>{const c=C.compras.find(x=>x.id===id);if(!c)return;cpNuevaCompra();compraEditId=id;document.getElementById('cp-fecha').value=c.fecha||todayISO();document.getElementById('cp-proveedor').value=c.proveedor||'';document.getElementById('cp-fc').value=c.fc||'si';document.getElementById('cp-tipo').value=c.tipoComprobante||'Factura A';document.getElementById('cp-numero').value=c.numeroComprobante||'';document.getElementById('cp-medio').value=window.TIZComprasDistribucionV1.paymentMethod(c.medioPago)||'Transferencia';document.getElementById('cp-vencimiento').value=c.vencimiento||'';document.getElementById('cp-condicion').value=c.condicionPago||'contado';document.getElementById('cp-cuotas').value=c.cantidadPagos||1;document.getElementById('cp-primer-venc').value=c.primerVencimiento||c.vencimiento||'';document.getElementById('cp-dias-cuota').value=c.diasEntrePagos||30;document.getElementById('cp-ref-pago').value=c.referenciaPago||'';document.getElementById('cp-destino').value=c.destino||'Stock';document.getElementById('cp-ot').value=c.ot||'';document.getElementById('cp-tipo-costo').value=c.tipoCosto||'';document.getElementById('cp-obs').value=c.observacion||'';document.getElementById('cp-items-body').innerHTML='';(c.items||[]).forEach(cpAddItem);syncFC();calcTotals();};
window.cpDeleteCompra=async id=>{if(confirm('¿Borrar esta compra y sus pagos pendientes?')){for(const p of C.pagos.filter(x=>x.compraId===id&&x.estado!=='pagado'))await deleteDoc(doc(db,'pagosCompra',p.id));await deleteDoc(doc(db,'compras',id));}};
window.cpAddArticulo=async()=>{const descripcion=document.getElementById('cp-a-desc').value.trim();if(!descripcion)return toast('Ingresá una descripción.');const codigo=document.getElementById('cp-a-code').value.trim();if(codigo&&C.articulos.some(a=>a.codigo===codigo))return toast('Ese código ya existe.');const familia=document.getElementById('cp-a-family').value.trim();const subfamilia=document.getElementById('cp-a-subfamily').value.trim();if(!familia)return toast('Elegí o escribí una familia.');await addDoc(collection(db,'articulosCompra'),{codigo,descripcion,unidad:document.getElementById('cp-a-unit').value.trim(),familia,subfamilia,control:document.getElementById('cp-a-control').value,stockMinimo:num(document.getElementById('cp-a-min').value),_ts:serverTimestamp()});toast('Artículo agregado.');};
window.cpDeleteArticulo=async id=>{if(confirm('¿Borrar artículo?'))await deleteDoc(doc(db,'articulosCompra',id));};
window.cpCalcCountRow=input=>{const tr=input.closest('tr'),final=num(input.value),cons=num(tr.dataset.inicial)+num(tr.dataset.compras)-final;tr.querySelector('.cp-consumo').textContent=tr.dataset.unitError?'Revisar unidades':tr.dataset.primerConteo==='1'?'Primer saldo':isNaN(cons)?'—':cons;};
window.cpSaveConteo=async()=>{const items=[...document.querySelectorAll('[data-count-row]')].map(tr=>{const raw=tr.querySelector('.cp-count-input').value;if(raw==='')return null;const cantidad=num(raw);return {articuloId:tr.dataset.id,descripcion:tr.dataset.desc,cantidad,unidad:tr.dataset.unit,stockInicial:num(tr.dataset.inicial),comprasPeriodo:num(tr.dataset.compras),planificadoOT:num(tr.dataset.plan),consumoReal:tr.dataset.unitError||tr.dataset.primerConteo==='1'?null:num(tr.dataset.inicial)+num(tr.dataset.compras)-cantidad,errorUnidadStock:tr.dataset.unitError||''};}).filter(Boolean);if(!items.length)return toast('Ingresá al menos un conteo.');if(items.some(i=>!Number.isFinite(i.cantidad)||i.cantidad<0))return toast('El conteo debe ser una cantidad válida, cero o mayor.');await addDoc(collection(db,'conteosStock'),{semana:document.getElementById('cp-count-week').value,fecha:document.getElementById('cp-count-date').value,items,usuario:window.currentUser?.email||'',_ts:serverTimestamp()});toast('Conteo guardado. Consumos calculados automáticamente.');};
window.cpExplodeObra=async obraId=>{
  return cpMaterialsControl.openWork(obraId);
  const o=cpFindWork(obraId);if(!o)return toast('No se encontró la obra.');
  if(cpPlanForWork(o))return toast('La OT ya tiene un plan de materiales.');
  await addDoc(collection(db,'planesMateriales'),{obraId:o.id,ot:o.ot||o.nro||'',cliente:o.cliente||'',descripcion:o.desc||o.descripcion||'',estado:'pendiente de explosion',origen:'venta sincronizada',componentesVenta:cpQuoteItemsForWork(o),items:[],fechaAlta:todayISO(),_ts:serverTimestamp()});
  toast('OT sincronizada con Compras. Ya podés hacer la explosión.');
};
window.cpCreatePlan=async()=>{const ot=document.getElementById('cp-plan-ot').value;if(!ot)return toast('Seleccioná una OT.');await addDoc(collection(db,'planesMateriales'),{ot,descripcion:document.getElementById('cp-plan-desc').value.trim(),estado:document.getElementById('cp-plan-status').value,origen:document.getElementById('cp-plan-source').value,items:[],_ts:serverTimestamp()});toast('Plan creado.');};
window.cpAddPlanItem=async id=>{const p=C.planes.find(x=>x.id===id);if(!p)return;const raw=prompt('Material (escribí descripción exacta del catálogo):');if(!raw)return;const art=C.articulos.find(a=>normText(a.descripcion)===normText(raw))||findBestArticle(raw)?.article;if(!art)return toast('No encontré ese material en el catálogo.');const q=num(prompt('Cantidad para esta OT en '+cpStockArticle(art).unidad+':',1));if(q<=0)return;const tipo=(prompt('Tipo de control: 1 = específico de esta OT / 2 = genérico por stock mínimo','1')==='2')?'generico':'especifico';const largo=prompt('Largo / desarrollo (opcional):','')||'';const ancho=prompt('Ancho (opcional):','')||'';const espesor=prompt('Espesor / calibre (opcional):','')||'';const obs=prompt('Observación (opcional):','')||'';const items=[...(p.items||[]),{articuloId:art.id||'',codigo:art.codigo||'',descripcion:art.descripcion,unidad:cpStockArticle(art).unidad||'',familia:art.familia||'',subfamilia:art.subfamilia||'',cantidadSugerida:q,cantidadPlanificada:q,modoStock:tipo,medidas:{largo,ancho,espesor},observacion:obs,confianza:100}];await updateDoc(doc(db,'planesMateriales',id),{items,estado:'explosion en curso',explosionCompleta:false,_ts:serverTimestamp()});toast('Material agregado a la explosión.');};
window.cpUpdatePlanQty=async(id,ix,val)=>{if(!Number.isFinite(Number(val))||Number(val)<0)return toast('La reserva debe ser cero o mayor.');const p=C.planes.find(x=>x.id===id),items=[...(p.items||[])];const art=C.articulos.find(a=>a.id===items[ix].articuloId);items[ix]={...items[ix],cantidadPlanificada:num(val),unidad:art?cpStockArticle(art).unidad:items[ix].unidad,modificadoManualmente:true};await updateDoc(doc(db,'planesMateriales',id),{items});};
window.cpRemovePlanItem=async(id,ix)=>{const p=C.planes.find(x=>x.id===id),items=(p.items||[]).filter((_,i)=>i!==ix);await updateDoc(doc(db,'planesMateriales',id),{items});};
// El enlace privado se comparte sólo mediante Firestore autenticado; la API key permanece en Apps Script.
let cpIaUrlShared='',cpIaUser='',cpIaLoading=false,cpIaConfigError='',cpIaStop=null,cpIaResolve=null,cpIaConfigReady=Promise.resolve();
function cpLocalIaUrl(){try{return (localStorage.getItem('tizComprasIaUrl')||'').trim();}catch{return '';}}
function cpValidIaUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='script.google.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/macros\/s\/[A-Za-z0-9_-]+\/exec\/[A-Za-z0-9_-]+$/.test(u.pathname);}catch{return false;}}
function cpStartSharedIA(user){
 cpIaStop?.();cpIaStop=null;cpIaResolve?.();cpIaUrlShared='';cpIaUser=user?.uid||'';cpIaLoading=!!user;cpIaConfigError='';
 if(!user){cpIaConfigReady=Promise.resolve();return;}
 const uid=user.uid,ref=doc(db,'configuracionCompras','iaComprobantes');let migrating=false;
 cpIaConfigReady=new Promise(resolve=>{cpIaResolve=resolve;});
 cpIaStop=onSnapshot(ref,async snap=>{
  if(cpIaUser!==uid)return;
  const value=snap.exists()?String(snap.data().url||'').trim():'';
  cpIaUrlShared=cpValidIaUrl(value)?value:'';cpIaConfigError='';
  const local=cpLocalIaUrl();
  // Migra una sola vez la conexión existente, sin reemplazar la de otro usuario.
  if(!snap.exists()&&!migrating&&cpValidIaUrl(local)){
   migrating=true;
   try{await runTransaction(db,async tx=>{const current=await tx.get(ref);if(!current.exists())tx.set(ref,{url:local,actualizado:serverTimestamp()});});}
   catch{if(cpIaUser===uid)cpIaConfigError='No se pudo compartir la conexión existente. Revisá la conexión e intentá Guardar en IA comprobantes.';}
   finally{migrating=false;}
  }
  if(cpIaUser===uid){cpIaLoading=false;cpIaResolve?.();}
 },()=>{if(cpIaUser!==uid)return;cpIaLoading=false;cpIaConfigError='No se pudo consultar la conexión compartida de IA. Revisá la conexión y los permisos de tu usuario.';cpIaResolve?.();});
}
window.cpOpenConfigIA=()=>{document.getElementById('cp-ia-url').value=cpIaUrlShared||cpLocalIaUrl();document.getElementById('cp-modal-ia').classList.add('open');};
window.cpCloseConfigIA=()=>document.getElementById('cp-modal-ia').classList.remove('open');
let cpIaSaving=false;
window.cpSaveConfigIA=async()=>{
 if(cpIaSaving)return;const url=document.getElementById('cp-ia-url').value.trim();
 if(!cpValidIaUrl(url))return toast('Pegá el enlace privado completo de Apps Script (/exec/…), no la clave API de Gemini.');
 if(!cpIaUser)return toast('Iniciá sesión en TIZ para compartir la conexión.');
 cpIaSaving=true;const uid=cpIaUser;
 try{await runTransaction(db,async tx=>{tx.set(doc(db,'configuracionCompras','iaComprobantes'),{url,actualizado:serverTimestamp()});});if(cpIaUser!==uid)return;cpIaUrlShared=url;try{localStorage.setItem('tizComprasIaUrl',url);}catch{}window.cpCloseConfigIA();toast('Conexión IA compartida con los usuarios autorizados de TIZ.');}
 catch{toast('No se pudo guardar la conexión compartida. Revisá la conexión y los permisos de tu usuario.');}
 finally{cpIaSaving=false;}
};
function cpSetIaStatus(message,error=false){const el=document.getElementById('cp-ia-status');if(!el)return;el.hidden=!message;el.textContent=message;el.setAttribute('role',error?'alert':'status');el.style.color=error?'var(--amber)':'var(--text2)';}
window.cpAnalizarIA=async()=>{
  if(!selectedFile)return toast('Seleccioná una foto o PDF.');
  let waiting;await Promise.race([cpIaConfigReady,new Promise(resolve=>{waiting=setTimeout(resolve,5000);})]).finally(()=>clearTimeout(waiting));
  const local=cpLocalIaUrl(),url=cpIaUrlShared||(cpValidIaUrl(local)?local:'');
  if(!url&&(cpIaLoading||cpIaConfigError))return toast(cpIaConfigError||'Todavía se está consultando la conexión compartida. Intentá nuevamente en unos segundos.');
  if(!url){cpOpenConfigIA();return toast('Primero configurá la URL del Apps Script IA.');}
  if(aiCleanupActive)aiCleanupActive('restart');
  const file=selectedFile,button=document.querySelector('[onclick="cpAnalizarIA()"]'),startedAt=Date.now(),maxAttempts=3;
  if(button){button.disabled=true;button.textContent='⏳ Analizando…';}
  cpSetIaStatus('Preparando el archivo para enviarlo al lector…');
  let iframe,form,timer,pollTimer,retryTimer,done=false,attempt=0,base64='',requestId='',callbackName='';
  const releaseAttempt=()=>{
    clearTimeout(pollTimer);
    const retiredId=requestId,retiredCallback=callbackName;
    requestId='';callbackName='';
    if(retiredCallback){window[retiredCallback]=()=>{};setTimeout(()=>{try{delete window[retiredCallback];}catch{window[retiredCallback]=undefined;}},10000);}
    if(retiredId)document.querySelectorAll('script[data-tiz-ia="'+retiredId+'"]').forEach(x=>x.remove());
    iframe?.remove();form?.remove();iframe=null;form=null;
  };
  const cleanup=(reason='done')=>{
    if(done)return;done=true;clearTimeout(timer);clearTimeout(retryTimer);releaseAttempt();
    if(button){button.disabled=false;button.textContent='✨ Analizar comprobante';}
    if(!['response','exception','timeout'].includes(reason))cpSetIaStatus('Lectura cancelada. Podés volver a analizar el archivo.');
    if(aiCleanupActive===cleanup)aiCleanupActive=null;
    console.info('[TIZ IA] limpieza',reason);
  };
  aiCleanupActive=cleanup;
  const sendError=e=>{
    if(done)return;cleanup('exception');
    cpSetIaStatus('No se pudo enviar el comprobante: '+(e?.message||e)+'. El archivo sigue seleccionado.',true);
    console.error('[TIZ IA] envío',e);toast('No se pudo enviar el comprobante.');
  };
  const finish=payload=>{
    if(done)return;
    const transient=!payload?.ok&&/^Gemini no est[aá] disponible temporalmente\b/i.test(String(payload?.error||''));
    if(transient&&attempt<maxAttempts&&Date.now()-startedAt<90000){
      const delay=4000*Math.pow(2,attempt-1)+Math.floor(Math.random()*1000);
      releaseAttempt();
      cpSetIaStatus('El lector está temporalmente ocupado. Reintentando en '+Math.ceil(delay/1000)+' s (intento '+(attempt+1)+' de '+maxAttempts+')…');
      retryTimer=setTimeout(()=>{if(!done)sendAttempt();},delay);
      return;
    }
    cleanup('response');
    if(!payload?.ok){
      const message=transient?'Gemini sigue sin responder después de '+attempt+' intento(s). El archivo sigue seleccionado. Probá nuevamente en unos minutos.':'No se pudo leer el comprobante: '+(payload?.error||'No se recibió una respuesta válida.')+' Podés volver a intentarlo.';
      cpSetIaStatus(message,true);toast(transient?'El servicio de lectura sigue temporalmente no disponible.':'Error IA: '+(payload?.error||'No se pudo analizar'));return;
    }
    try{applyAI(payload.data||{});cpSetIaStatus('Lectura terminada: '+(payload.data?.items?.length||0)+' renglones. Confirmá el proveedor y revisá los insumos.');toast('Lectura IA completa. Revisá y confirmá.');}
    catch(e){cpSetIaStatus('El lector respondió, pero no se pudieron mostrar los datos. Volvé a intentarlo; si persiste, informá este mensaje.',true);console.error('[TIZ IA] mostrar resultado',e);}
  };
  const poll=id=>{
    if(done||requestId!==id)return;
    clearTimeout(pollTimer);
    document.querySelectorAll('script[data-tiz-ia="'+id+'"]').forEach(x=>x.remove());
    const script=document.createElement('script');script.dataset.tizIa=id;
    script.onerror=()=>{script.remove();if(!done&&requestId===id){clearTimeout(pollTimer);pollTimer=setTimeout(()=>poll(id),3000);}};
    script.src=url+'?action=status&requestId='+encodeURIComponent(id)+'&callback='+encodeURIComponent(callbackName)+'&_='+Date.now();
    document.body.appendChild(script);
    pollTimer=setTimeout(()=>{script.remove();poll(id);},10000);
  };
  const sendAttempt=()=>{
    if(done)return;
    try{
      attempt++;
      // Cada intento necesita una identidad nueva: el servidor conserva los errores anteriores en caché.
      const id='cpia-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'-'+attempt;
      requestId=id;callbackName='__tizIaCb_'+id.replace(/[^a-zA-Z0-9_]/g,'_');
      window[callbackName]=payload=>{
        if(done||requestId!==id)return;
        clearTimeout(pollTimer);document.querySelectorAll('script[data-tiz-ia="'+id+'"]').forEach(x=>x.remove());
        if(payload?.pending){cpSetIaStatus('Esperando el resultado del lector ('+Math.round((Date.now()-startedAt)/1000)+' s)'+(attempt>1?' · intento '+attempt+' de '+maxAttempts:'')+'. La lectura puede demorar más de medio minuto.');pollTimer=setTimeout(()=>poll(id),3000);return;}
        finish(payload);
      };
      iframe=document.createElement('iframe');iframe.name='cp-ia-frame-'+id;iframe.style.display='none';document.body.appendChild(iframe);
      form=document.createElement('form');form.method='POST';form.action=url;form.target=iframe.name;form.style.display='none';
      const fields={action:'analyzeExpense',requestId:id,filename:file.name,mimeType:file.type||'application/octet-stream',dataBase64:base64};
      Object.entries(fields).forEach(([name,value])=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);});
      document.body.appendChild(form);
      cpSetIaStatus('Archivo enviado al lector'+(attempt>1?' · intento '+attempt+' de '+maxAttempts:'')+'. Esperando el resultado…');
      form.submit();pollTimer=setTimeout(()=>poll(id),1500);
    }catch(e){sendError(e);}
  };
  try{
    toast('Analizando comprobante…');
    // El límite total incluye la lectura local, las pausas y todos los intentos.
    timer=setTimeout(()=>{if(done)return;cleanup('timeout');cpSetIaStatus('No se recibió el resultado en 2 minutos. El archivo sigue seleccionado. Volvé a analizarlo; no necesitás cargar otra clave API.',true);toast('No se recibió el resultado del lector. Revisá el mensaje junto al botón Analizar.');},120000);
    base64=await fileToBase64(file);if(!done)sendAttempt();
  }catch(e){sendError(e);}
};

function fileToBase64(f){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=no;r.readAsDataURL(f);});}
function applyAI(d){document.getElementById('cp-proveedor').value=d.proveedor||'';document.getElementById('cp-fecha').value=d.fecha||todayISO();document.getElementById('cp-fc').value=d.fc===false?'no':'si';document.getElementById('cp-tipo').value=d.tipoComprobante||'Factura A';document.getElementById('cp-numero').value=d.numeroComprobante||'';document.getElementById('cp-items-body').innerHTML='';(d.items||[]).forEach(item=>cpAddItem({...item,descripcionOriginal:item.descripcionOriginal||item.descripcion}));if(!(d.items||[]).length)cpAddItem();syncFC();calcTotals();}
window.cpExportCSV=(filtered=false)=>{const h=['Fecha','Semana','Proveedor','FC','Tipo FC','Nro FC','Código','Descripción factura','Artículo TIZ','Familia','Subfamilia','Cantidad','Unidad','P.Unit.Neto','Total Neto','IVA','Total Bruto','Medio Pago','Vencimiento','Destino','OT','Distribución OT / stock · CD / EX'];const base=filtered?getFilteredPurchaseItems():purchaseItems();const rows=base.map(i=>{const c=i.compra||{};return[c.fecha,c.semana,c.proveedor,c.fc,c.tipoComprobante,c.numeroComprobante,i.codigo,i.descripcionOriginal,i.descripcion,i.familia||i.rubro,i.subfamilia,i.cantidad,i.unidad,i.precioUnitarioNeto,i.totalNeto,i.ivaImporte,i.totalBruto,c.medioPago,c.vencimiento,c.destino,c.ot,cpItemDestinoLabel(i,c)]});const csv=[h,...rows].map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv'}));a.download=filtered?'compras_filtradas.csv':'compras_detalladas.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};

let cpFilterTimer=null;
window.cpFilterPeriod=value=>{purchaseFilters.period=value;render();};window.cpFilterDebounced=value=>{clearTimeout(cpFilterTimer);purchaseFilters.search=value;cpFilterTimer=setTimeout(render,250);};window.cpFilterChanged=familyChanged=>{const val=id=>document.getElementById(id)?.value||'';purchaseFilters.week=val('cp-f-week')||purchaseFilters.week;purchaseFilters.month=val('cp-f-month')||purchaseFilters.month;purchaseFilters.from=val('cp-f-from');purchaseFilters.to=val('cp-f-to');purchaseFilters.proveedor=val('cp-f-provider');purchaseFilters.familia=val('cp-f-family');purchaseFilters.subfamilia=familyChanged?'':val('cp-f-subfamily');purchaseFilters.fc=val('cp-f-fc');render();};window.cpClearFilters=()=>{purchaseFilters={period:'month',week:weekKey(),month:todayISO().slice(0,7),from:'',to:'',search:'',proveedor:'',familia:'',subfamilia:'',fc:''};render();};

function cpCatalogCodeKey(value){const s=String(value??'').trim();return /^\d+$/.test(s)?s.replace(/^0+(?=\d)/,''):s.toLowerCase();}
function cpArticleCatalog(){
 const registered=[...C.articulos],byCode=new Map(registered.map(a=>[cpCatalogCodeKey(a.codigo),a])),base=window.TIZComprasBaseDatosV1?.articles?.()||CATALOGO_TIZ_BASE;
 return registered.concat(base.filter(a=>{const saved=byCode.get(cpCatalogCodeKey(a.codigo));return !saved||normText(saved.descripcion)!==normText(a.descripcion);}).map(a=>({...a,id:'base-'+a.codigo,referenciaBase:true,articuloActualId:byCode.get(cpCatalogCodeKey(a.codigo))?.id||''})));
}
function cpBaseArticleRow(a){
 return `<tr><td><b>${esc(a.codigo)}</b></td><td><b>${esc(a.descripcion)}</b><div class="cp-sub">Referencia del catálogo original · ${a.articuloActualId?'código ya dado de alta':'pendiente de alta'}</div></td><td>${esc(a.familia)}</td><td>${esc(a.subfamilia||'—')}</td><td>${esc(a.unidad||'Unidad pendiente')}</td><td>Sin alta</td><td>—</td><td>Sin compra registrada</td><td>Sin alta en stock</td><td><button type="button" class="cp-btn" data-base-article="${esc(a.codigo)}">${a.articuloActualId?'Ver artículo actual':'Completar alta'}</button></td></tr>`;
}
window.cpCompleteBaseArticle=code=>{
 const a=cpArticleCatalog().find(a=>a.referenciaBase&&a.codigo===code);if(!a)return toast('Ese código ya tiene alta. Abrí su ficha desde Editar.');if(a.articuloActualId)return window.cpEditArticulo(a.articuloActualId);
 if(currentTab!=='articulos')window.cpTab('articulos');
 const values={code:a.codigo,desc:a.descripcion,unit:a.unidad||'',family:a.familia||'',subfamily:a.subfamilia||'',min:'0',control:['Hierros','Chapas','Acrilicos','Lonas y Vinilos','Iluminacion','Maderas y otros','Pai PVC y polyfan'].includes(a.familia)?'estrategico':'consumible'};
 for(const [key,value]of Object.entries(values)){const el=document.getElementById('cp-a-'+key);if(el)el.value=value;}
 window.cpArticleFamilyChanged();document.getElementById('cp-a-unit')?.scrollIntoView?.({behavior:'smooth',block:'center'});document.getElementById('cp-a-unit')?.focus();
 toast('Referencia copiada al alta. Revisá unidad, familia y subfamilia antes de agregar el artículo.');
};

window.cpRenderArticleRows=()=>{
 const tbody=document.getElementById('cp-art-rows');if(!tbody)return;const scope=document.getElementById('cp-art-scope')?.value||'registrados';const search=normText(document.getElementById('cp-art-search')?.value||''),family=document.getElementById('cp-art-family')?.value||'',list=cpArticleCatalog().filter(a=>(scope==='todos'||(scope==='referencias'?a.referenciaBase:!a.referenciaBase))&&(!family||normText(a.familia)===normText(family))&&(!search||normText([a.codigo,a.descripcion,a.familia,a.subfamilia].join(' ')).includes(search)));
 tbody.innerHTML=list.map(a=>{if(a.referenciaBase)return cpBaseArticleRow(a);const m=cpStockMeta(a)||{},u=m.unidad||a.unidad;return `<tr><td><b>${esc(a.codigo||'—')}</b></td><td><b>${esc(a.descripcion)}</b></td><td>${esc(a.familia||'')}</td><td>${esc(a.subfamilia||'')}</td><td><b>${esc(u)}</b><div class="cp-sub">Compra: ${esc(a.unidadCompraPreferida||a.unidad)}</div><div class="cp-sub">${esc(cpEquivalenceLabel(a))}</div></td><td>${esc(a.control||'')}</td><td>${m.stockMinimo??'—'}</td><td>${cpComparableCostHtml(m)}</td><td>${m.stockDisponible===null||m.stockDisponible===undefined?'Sin conteo':m.stockDisponible+' '+esc(u)}</td><td><button class="cp-btn" data-edit-insumo="${esc(a.id)}">Editar</button> <button class="cp-btn" data-unit-insumo="${esc(a.id)}">Equivalencias</button> <button class="cp-btn danger" onclick="cpDeleteArticulo('${a.id}')">Borrar</button></td></tr>`;}).join('')||'<tr><td colspan="10">No hay artículos para este filtro.</td></tr>';
 tbody.querySelectorAll('[data-base-article]').forEach(b=>b.onclick=()=>window.cpCompleteBaseArticle(b.dataset.baseArticle));
 tbody.querySelectorAll('[data-edit-insumo]').forEach(b=>b.onclick=()=>window.cpEditArticulo(b.dataset.editInsumo));tbody.querySelectorAll('[data-unit-insumo]').forEach(b=>b.onclick=()=>window.TIZUnidadesStockV1?.open(b.dataset.unitInsumo));
};

window.cpImportCatalogoBase=async()=>{const existing=new Set(C.articulos.map(a=>String(a.codigo||'').trim()).filter(Boolean)),pending=CATALOGO_TIZ_BASE.filter(a=>!existing.has(a.codigo));if(!pending.length)return toast('La base TIZ ya está importada.');if(!confirm(`Se importarán ${pending.length} artículos. ¿Continuar?`))return;for(let start=0;start<pending.length;start+=450){const batch=writeBatch(db);pending.slice(start,start+450).forEach(a=>{const ref=doc(collection(db,'articulosCompra'));batch.set(ref,{...a,control:['Hierros','Chapas','Acrilicos','Lonas y Vinilos','Iluminacion','Maderas y otros','Pai PVC y polyfan'].includes(a.familia)?'estrategico':['Servicios','Sueldos','Publicidad','Alquiler','Comisiones','Colocaciones Externas','Cortes / Impresiones Externas'].includes(a.familia)?'sin_stock':'consumible',stockMinimo:0,_ts:serverTimestamp()});});await batch.commit();}toast(`${pending.length} artículos importados.`);};


function addDaysISO(iso,days){const d=new Date((iso||todayISO())+'T12:00:00');d.setDate(d.getDate()+Number(days||0));return d.toISOString().slice(0,10);}
function paymentWeek(iso){return weekKey(new Date((iso||todayISO())+'T12:00:00'));}
async function cpSyncPagosCompra(compraId,data){
  if(!compraId)return;
  for(const p of C.pagos.filter(x=>x.compraId===compraId&&x.estado!=='pagado'))await deleteDoc(doc(db,'pagosCompra',p.id));
  const n=Math.max(1,Number(data.cantidadPagos)||1), total=num(data.totalBruto), first=data.primerVencimiento||data.vencimiento||data.fecha||todayISO();
  if(data.condicionPago==='contado'&&!data.vencimiento&&!data.primerVencimiento)return;
  const base=Math.floor((total/n)*100)/100;
  for(let i=0;i<n;i++){
    const importe=i===n-1?Math.round((total-base*(n-1))*100)/100:base;
    const vencimiento=addDaysISO(first,i*(Number(data.diasEntrePagos)||30));
    await addDoc(collection(db,'pagosCompra'),{compraId,proveedor:data.proveedor,concepto:`${data.tipoComprobante||'Compra'} ${data.numeroComprobante||''}`.trim(),importe,vencimiento,semana:paymentWeek(vencimiento),medio:data.medioPago||data.condicionPago,condicion:data.condicionPago||'',referencia:data.referenciaPago||'',ot:data.ot||'',cuota:i+1,totalCuotas:n,estado:'pendiente',origen:'compra',_ts:serverTimestamp()});
  }
}
function weekRange(yearWeek){
  const m=String(yearWeek||'').match(/(\d{4})-S(\d{1,2})/);if(!m)return null;const y=+m[1],w=+m[2];const jan4=new Date(Date.UTC(y,0,4));const day=jan4.getUTCDay()||7;const mon=new Date(jan4);mon.setUTCDate(jan4.getUTCDate()-day+1+(w-1)*7);const sun=new Date(mon);sun.setUTCDate(mon.getUTCDate()+6);return {from:mon.toISOString().slice(0,10),to:sun.toISOString().slice(0,10)};
}

window.cpPayFilters = window.cpPayFilters || {estado:'',medio:'',proveedor:'',search:'',quick:'all'};
window.cpSetPayFilter = (key,value) => { window.cpPayFilters[key]=value; render(); };
window.cpSetPayQuick = value => { window.cpPayFilters.quick=value; render(); };

function renderPagos(el){
  const allPending=C.pagos.filter(p=>p.estado!=='pagado').sort((a,b)=>String(a.vencimiento||'').localeCompare(String(b.vencimiento||'')));
  const now=todayISO(),cur=weekKey(),weeks=[];
  for(let i=0;i<5;i++){
    const wr=weekRange(cur); if(!wr) break;
    const start=addDaysISO(wr.from,i*7),wk=paymentWeek(start),range=weekRange(wk);
    const arr=allPending.filter(p=>p.semana===wk||((p.vencimiento||'')>=range.from&&(p.vencimiento||'')<=range.to));
    weeks.push({wk,range,arr,total:arr.reduce((s,p)=>s+num(p.importe),0)});
  }
  const overdue=allPending.filter(p=>p.vencimiento&&p.vencimiento<now), thisWeek=weeks[0], next4=weeks.slice(1).reduce((s,w)=>s+w.total,0);
  const isCC=p=>String(p.condicion||p.medio||'').toLowerCase().includes('cuenta');
  const isCheque=p=>String(p.medio||'').toLowerCase().includes('cheque');
  const cc=allPending.filter(isCC).reduce((s,p)=>s+num(p.importe),0);
  const cheques=allPending.filter(isCheque);
  const totalPending=allPending.reduce((s,p)=>s+num(p.importe),0);
  const colors=['#ff4d4d','#ffb000','#4f9cff','#2dd486','#8b8f98'];

  const f=window.cpPayFilters||{};
  const providers=uniqueSorted(allPending.map(p=>p.proveedor));
  const methods=uniqueSorted(allPending.map(p=>p.medio||p.condicion));
  let pending=allPending.filter(p=>{
    if(f.estado==='vencido' && !(p.vencimiento&&p.vencimiento<now)) return false;
    if(f.estado==='semana' && p.semana!==cur) return false;
    if(f.medio && (p.medio||p.condicion)!==f.medio) return false;
    if(f.proveedor && p.proveedor!==f.proveedor) return false;
    const hay=normText([p.proveedor,p.concepto,p.referencia,p.ot].join(' '));
    if(f.search && !hay.includes(normText(f.search))) return false;
    if(f.quick==='today' && p.vencimiento!==now) return false;
    if(f.quick==='week' && p.semana!==cur) return false;
    if(f.quick==='next4'){
      const maxDate=weeks[4]?.range?.to||'9999-12-31';
      if(!p.vencimiento || p.vencimiento<now || p.vencimiento>maxDate) return false;
    }
    return true;
  });

  const weekCards=weeks.map((w,i)=>`<div class="cp-week-card-v25" style="--week-color:${colors[i]}"><div class="wk">SEMANA ${String(w.wk).split('S')[1]||w.wk}</div><div class="range">${fmtDate(w.range.from)} - ${fmtDate(w.range.to)}</div><div class="amount">${money(w.total)}</div><div class="count">${w.arr.length} compromiso${w.arr.length===1?'':'s'}</div></div>`).join('');
  const max=Math.max(...weeks.map(w=>w.total),1);
  const bars=weeks.map((w,i)=>`<div class="cp-bar-col"><div class="cp-bar-value">${w.total?money(w.total).replace('$','').replace(/,00$/,''):'$0'}</div><div class="cp-bar" style="height:${Math.max(3,Math.round((w.total/max)*118))}px;--bar-color:${colors[i]}"></div><div class="cp-bar-label">S${String(w.wk).split('S')[1]||''}</div></div>`).join('');

  const rows=pending.map(p=>{
    const overdueFlag=p.vencimiento<now,dueFlag=p.semana===cur;
    const status=overdueFlag?'Vencido':dueFlag?'Por vencer':'Pendiente';
    const stClass=overdueFlag?'overdue':dueFlag?'due':'pending';
    return `<tr><td style="color:${overdueFlag?'#ff5656':dueFlag?'#ffb000':'inherit'};font-weight:700">${fmtDate(p.vencimiento)}</td><td><b>${esc(p.proveedor||'')}</b></td><td>${esc(p.concepto||'')}</td><td>${esc(p.ot||'—')}</td><td>${esc(p.medio||'')}</td><td><b>${money(p.importe)}</b></td><td><span class="cp-status ${stClass}">${status}</span></td><td style="white-space:nowrap"><button title="Marcar pagado" class="cp-icon-btn ok" onclick="cpMarkPago('${p.id}')">✓</button> <button title="Editar" class="cp-icon-btn edit" onclick="cpEditPago('${p.id}')">✎</button> <button title="Borrar" class="cp-icon-btn delete" onclick="cpDeletePago('${p.id}')">🗑</button></td></tr>`;
  }).join('');

  const methodDefs=[
    ['Cuenta corriente','👤','#ffb000',p=>isCC(p)],
    ['Cheques','✓','#a36cff',p=>isCheque(p)],
    ['Transferencia','↔','#4f9cff',p=>String(p.medio||'').toLowerCase().includes('transfer')],
    ['Tarjeta Visa','▣','#ff5656',p=>window.TIZComprasDistribucionV1.paymentMethod(p.medio)==='Tarjeta Visa'],
    ['Tarjeta Cabal','▣','#a36cff',p=>window.TIZComprasDistribucionV1.paymentMethod(p.medio)==='Tarjeta Cabal'],
    ['Tarjeta sin identificar','▣','#8b8f98',p=>window.TIZComprasDistribucionV1.paymentMethod(p.medio)==='Tarjeta'],
    ['Efectivo / Contado','▤','#2dd486',p=>/efectivo|contado/i.test(String(p.medio||p.condicion||''))],
    ['Otros','•••','#8b8f98',p=>!/cuenta|cheque|transfer|tarjeta|efectivo|contado/i.test(String(p.medio||p.condicion||''))]
  ];
  const methodRows=methodDefs.map(([name,icon,color,test])=>{
    const arr=allPending.filter(test),amount=arr.reduce((s,p)=>s+num(p.importe),0);
    return `<div class="cp-method-row"><div class="cp-method-icon" style="--method-color:${color}">${icon}</div><div><div class="cp-method-name">${name}</div><div class="cp-method-count">${arr.length} compromiso${arr.length===1?'':'s'}</div></div><div class="cp-method-amount">${money(amount)}</div></div>`;
  }).join('');

  const empty=`<div class="cp-empty-pay"><div class="icon">▧</div><strong>No hay compromisos ni pagos programados</strong><div>Comenzá cargando una nueva compra o un pago manual.</div><div class="cp-empty-actions"><button class="cp-btn primary" onclick="cpNuevaCompra()">＋ Nueva compra</button><button class="cp-btn outline" onclick="cpNuevoPagoManual()">＋ Carga manual de pago</button></div></div>`;

  el.innerHTML=`
    <div class="cp-pay-toolbar"><div><div class="cp-pay-title">Pagos y previsiones</div><div class="cp-sub">Cuenta corriente, cheques, cuotas y compromisos futuros.</div></div><div class="cp-pay-buttons"><button class="cp-btn outline" onclick="cpNuevoPagoManual()">＋ Carga manual de pago</button><button class="cp-btn primary" onclick="cpNuevaCompra()">＋ Nueva compra</button></div></div>
    <div class="cp-pay-kpis">
      <div class="cp-pay-kpi" style="--kpi-color:#ff5050"><div class="cp-kpi-icon">◷</div><div class="cp-lbl">Vencido</div><div class="cp-kpi">${money(overdue.reduce((s,p)=>s+num(p.importe),0))}</div><div class="cp-sub">${overdue.length} compromisos</div></div>
      <div class="cp-pay-kpi" style="--kpi-color:#ffb000"><div class="cp-kpi-icon">▣</div><div class="cp-lbl">A pagar esta semana</div><div class="cp-kpi">${money(thisWeek?.total||0)}</div><div class="cp-sub">${thisWeek?.arr.length||0} compromisos</div></div>
      <div class="cp-pay-kpi" style="--kpi-color:#54d268"><div class="cp-kpi-icon">◔</div><div class="cp-lbl">Próximas 4 semanas</div><div class="cp-kpi">${money(next4)}</div><div class="cp-sub">${weeks.slice(1).reduce((s,w)=>s+w.arr.length,0)} compromisos</div></div>
      <div class="cp-pay-kpi" style="--kpi-color:#4f9cff"><div class="cp-kpi-icon">↻</div><div class="cp-lbl">Saldo cuenta corriente</div><div class="cp-kpi">${money(cc)}</div><div class="cp-sub">${allPending.filter(isCC).length} compromisos</div></div>
      <div class="cp-pay-kpi" style="--kpi-color:#a36cff"><div class="cp-kpi-icon">✓</div><div class="cp-lbl">Cheques pendientes</div><div class="cp-kpi">${money(cheques.reduce((s,p)=>s+num(p.importe),0))}</div><div class="cp-sub">${cheques.length} cheques</div></div>
      <div class="cp-pay-kpi" style="--kpi-color:#36cdb8"><div class="cp-kpi-icon">◴</div><div class="cp-lbl">Total compromisos</div><div class="cp-kpi">${money(totalPending)}</div><div class="cp-sub">${allPending.length} compromisos</div></div>
    </div>
    <div class="cp-pay-layout"><section class="cp-pay-section"><h3>Previsiones por semana</h3><div class="cp-week-grid">${weekCards}</div></section><section class="cp-pay-section"><h3>Evolución próximas 5 semanas</h3>${allPending.length?`<div class="cp-bars">${bars}</div>`:'<div class="cp-empty-pay" style="padding:32px 10px"><strong>Sin datos disponibles</strong><div>A medida que cargues pagos y compromisos verás el gráfico aquí.</div></div>'}</section></div>
    <div class="cp-pay-workspace">
      <section class="cp-pay-section cp-pay-main">
        <h3>Compromisos y pagos programados</h3>
        <div class="cp-pay-filters">
          <select onchange="cpSetPayFilter('estado',this.value)"><option value="">Todos los estados</option><option value="vencido" ${f.estado==='vencido'?'selected':''}>Vencidos</option><option value="semana" ${f.estado==='semana'?'selected':''}>Esta semana</option></select>
          <select onchange="cpSetPayFilter('medio',this.value)"><option value="">Todos los medios de pago</option>${methods.map(v=>`<option ${f.medio===v?'selected':''}>${esc(v)}</option>`).join('')}</select>
          <select onchange="cpSetPayFilter('proveedor',this.value)"><option value="">Todos los proveedores</option>${providers.map(v=>`<option ${f.proveedor===v?'selected':''}>${esc(v)}</option>`).join('')}</select>
          <div class="cp-quick-filters"><button class="cp-quick ${f.quick==='today'?'active':''}" onclick="cpSetPayQuick('today')">Hoy</button><button class="cp-quick ${f.quick==='week'?'active':''}" onclick="cpSetPayQuick('week')">Esta semana</button><button class="cp-quick ${f.quick==='next4'?'active':''}" onclick="cpSetPayQuick('next4')">Próximas 4 semanas</button></div>
          <input placeholder="Buscar..." value="${esc(f.search||'')}" oninput="cpSetPayFilter('search',this.value)">
        </div>
        <div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Vencimiento</th><th>Proveedor</th><th>Concepto</th><th>Referencia</th><th>Medio de pago</th><th>Importe</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows||`<tr><td colspan="8">${empty}</td></tr>`}</tbody></table></div>
        <div style="display:flex;justify-content:space-between;padding:10px 2px 0;font-size:10px;color:var(--text3)"><span>Mostrando ${pending.length} de ${allPending.length} compromisos</span><strong style="color:var(--text)">Total: ${money(pending.reduce((s,p)=>s+num(p.importe),0))}</strong></div>
      </section>
      <aside class="cp-pay-section"><h3>Resumen de medios de pago</h3><div class="cp-payment-summary">${methodRows}<div class="cp-method-row" style="border-bottom:0;margin-top:4px"><div></div><div class="cp-method-name">Total general</div><div class="cp-method-amount">${money(totalPending)}</div></div></div></aside>
    </div>
    <div class="cp-pay-footer">ⓘ Los compromisos se agrupan por semana según la fecha de vencimiento. Los importes corresponden a los valores cargados en cada compra o compromiso manual.</div>`;
}

window.cpNuevoPagoManual=()=>{['cp-p-proveedor','cp-p-concepto','cp-p-importe','cp-p-ref','cp-p-ot','cp-p-obs'].forEach(id=>document.getElementById(id).value='');document.getElementById('cp-p-venc').value=todayISO();document.getElementById('cp-modal-pago').dataset.editId='';document.getElementById('cp-modal-pago').classList.add('open');};
window.cpClosePago=()=>document.getElementById('cp-modal-pago').classList.remove('open');
window.cpSavePagoManual=async()=>{const proveedor=document.getElementById('cp-p-proveedor').value.trim(),importe=num(document.getElementById('cp-p-importe').value),vencimiento=document.getElementById('cp-p-venc').value;if(!proveedor||!importe||!vencimiento)return toast('Completá proveedor, importe y vencimiento.');const data={proveedor,concepto:document.getElementById('cp-p-concepto').value.trim(),importe,vencimiento,semana:paymentWeek(vencimiento),medio:document.getElementById('cp-p-medio').value,condicion:document.getElementById('cp-p-medio').value,referencia:document.getElementById('cp-p-ref').value.trim(),ot:document.getElementById('cp-p-ot').value.trim(),observacion:document.getElementById('cp-p-obs').value.trim(),estado:'pendiente',origen:'manual',_ts:serverTimestamp()};const id=document.getElementById('cp-modal-pago').dataset.editId;if(id)await updateDoc(doc(db,'pagosCompra',id),data);else await addDoc(collection(db,'pagosCompra'),data);cpClosePago();toast('Compromiso guardado.');};
window.cpMarkPago=async id=>{const fecha=prompt('Fecha de pago:',todayISO());if(!fecha)return;await updateDoc(doc(db,'pagosCompra',id),{estado:'pagado',fechaPago:fecha,_tsPago:serverTimestamp()});toast('Pago marcado como realizado.');};
window.cpEditPago=id=>{const p=C.pagos.find(x=>x.id===id);if(!p)return;cpNuevoPagoManual();document.getElementById('cp-modal-pago').dataset.editId=id;document.getElementById('cp-p-proveedor').value=p.proveedor||'';document.getElementById('cp-p-concepto').value=p.concepto||'';document.getElementById('cp-p-importe').value=p.importe||0;document.getElementById('cp-p-venc').value=p.vencimiento||'';document.getElementById('cp-p-medio').value=p.medio||'Cuenta corriente';document.getElementById('cp-p-ref').value=p.referencia||'';document.getElementById('cp-p-ot').value=p.ot||'';document.getElementById('cp-p-obs').value=p.observacion||'';};
window.cpDeletePago=async id=>{if(confirm('¿Borrar este compromiso?'))await deleteDoc(doc(db,'pagosCompra',id));};


const ANALISIS_CHECKS=[
  ['listado','Materiales revisados'],['stock','Stock verificado'],['faltantes','Faltantes definidos'],['cotizaciones','Cotizaciones pedidas'],['compras','Compras realizadas'],['completo','Todos los insumos']
];
const COL_CHECKS=[
  ['contacto','Contacto y dirección'],['fotos','Fotos del lugar'],['plano','Plano / montaje'],['produccion','Producción terminada'],['calidad','Control de calidad'],['kit','Kit de colocación'],['equipo','Personal y vehículo'],['fecha','Fecha confirmada']
];
function obraCreatedDate(o){
  try{if(o._ts?.toDate)return o._ts.toDate();if(o.createdAt?.toDate)return o.createdAt.toDate();const s=o.fechaCreacion||o.fecha||o.fpresupuesto||'';if(s){if(/^\d{4}-\d{2}-\d{2}/.test(s))return new Date(s+'T12:00:00');const p=s.split('/');if(p.length===3)return new Date(+p[2],+p[1]-1,+p[0]);}}catch{}return null;
}
function analysisFor(o){return C.analisisOT.find(a=>a.obraId===o.id||window.TIZComprasObrasCoreV1.same(a.ot,o.ot));}
function colFor(o){return C.preparacionCol.find(a=>a.obraId===o.id||String(a.ot||'')===String(o.ot||''));}
function elapsedHours(o){const d=obraCreatedDate(o);return d?Math.max(0,(Date.now()-d.getTime())/3600000):null;}
function isActiveObra(o){return !['Cobrado','Rechazado','Vencido'].includes(o.estado||'');}
function pctChecks(keys,data){const c=data?.checks||{};return Math.round(keys.filter(([k])=>!!c[k]).length/keys.length*100);}


function memosFor(obraId,sector){
  return (C.ayudamemorias||[]).filter(m=>(m.obraId===obraId||sector==='Compras'&&window.TIZComprasObrasCoreV1.same(m.ot,cpFindWork(obraId)?.ot))&&m.sector===sector).sort((a,b)=>{
    if(!!a.resuelto!==!!b.resuelto)return a.resuelto?1:-1;
    return String(a.fecha||'9999-12-31').localeCompare(String(b.fecha||'9999-12-31'));
  });
}
function memoListHTML(obraId,sector){
  const arr=memosFor(obraId,sector);
  if(!arr.length)return '';
  return `<div class="am-list">${arr.slice(0,4).map(m=>`<div class="am-item ${m.resuelto?'done':''}">
    <input class="am-check" type="checkbox" ${m.resuelto?'checked':''} onchange="amToggle('${m.id}',this.checked)">
    <div><div class="am-text">${esc(m.texto||'')}</div><div class="am-meta">${m.fecha?'Fecha: '+fmtDate(m.fecha):'Sin fecha'}${m.responsable?' · '+esc(m.responsable):''}</div></div>
    <span class="am-badge ${esc(m.tipo||'nota').toLowerCase()}">${esc(m.tipo||'Nota')}</span>
  </div>`).join('')}${arr.length>4?`<div class="am-meta">+ ${arr.length-4} ayudamemorias más</div>`:''}</div>`;
}
window.amOpen=(obraId,sector)=>{
  const o=(sector==='Compras'?cpFindWork(obraId):(window.DB?.obras||[]).find(x=>x.id===obraId));if(!o)return;
  let modal=document.getElementById('am-modal');
  if(!modal){
    modal=document.createElement('div');modal.id='am-modal';modal.className='cp-modal-bg';
    modal.innerHTML=`<div class="am-modal-card"><div class="am-modal-head"><div><b>Nuevo ayudamemoria</b><div id="am-sub" class="am-meta"></div></div><button class="cp-icon-btn" onclick="amClose()">✕</button></div><div class="am-modal-body">
      <div class="am-grid">
        <div class="am-field full"><label>Recordar</label><textarea id="am-texto" rows="3" placeholder="Ej.: Confirmar horario con el cliente"></textarea></div>
        <div class="am-field"><label>Tipo</label><select id="am-tipo"><option>Nota</option><option>Tarea</option><option>Alerta</option></select></div>
        <div class="am-field"><label>Responsable</label><input id="am-resp" placeholder="Nombre o sector"></div>
        <div class="am-field"><label>Fecha</label><input id="am-fecha" type="date"><div class="am-quick"><button onclick="amQuick(0)">Hoy</button><button onclick="amQuick(1)">Mañana</button><button onclick="amQuick(2)">48 h</button></div></div>
        <div class="am-field"><label>Mostrar en tareas</label><select id="am-tareas"><option value="true">Sí</option><option value="false">No</option></select></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button class="cp-btn" onclick="amClose()">Cancelar</button><button class="cp-btn primary" onclick="amSave()">Guardar</button></div>
    </div></div>`;
    document.body.appendChild(modal);
  }
  modal.dataset.obraId=obraId;modal.dataset.sector=sector;
  document.getElementById('am-sub').textContent=`OT ${o.ot||'—'} · ${o.cliente||''} · ${sector}`;
  document.getElementById('am-texto').value='';document.getElementById('am-tipo').value='Nota';document.getElementById('am-resp').value='';document.getElementById('am-fecha').value='';document.getElementById('am-tareas').value='true';
  modal.classList.add('show');
};
window.amClose=()=>document.getElementById('am-modal')?.classList.remove('show');
window.amQuick=(days)=>{document.getElementById('am-fecha').value=addDaysISO(todayISO(),days);};
window.amSave=async()=>{
  const modal=document.getElementById('am-modal'),texto=document.getElementById('am-texto').value.trim();if(!texto){alert('Escribí el ayudamemoria.');return;}
  const o=modal.dataset.sector==='Compras'?cpFindWork(modal.dataset.obraId):(window.DB?.obras||[]).find(x=>x.id===modal.dataset.obraId);if(!o)return;
  await addDoc(collection(db,'ayudamemoriasOT'),{obraId:o.id,ot:o.ot||'',cliente:o.cliente||'',sector:modal.dataset.sector,texto,tipo:document.getElementById('am-tipo').value,responsable:document.getElementById('am-resp').value.trim(),fecha:document.getElementById('am-fecha').value,mostrarTareas:document.getElementById('am-tareas').value==='true',resuelto:false,creado:todayISO(),_ts:serverTimestamp()});
  amClose();toast('Ayudamemoria guardado.');
};
window.amToggle=async(id,on)=>{await updateDoc(doc(db,'ayudamemoriasOT',id),{resuelto:on,resueltoFecha:on?todayISO():'',_tsResuelto:serverTimestamp()});};

function renderControlOT(el){
  const obras=cpWorks();
  const q=String(window.cpOTSearch||'').toLowerCase(),filter=window.cpOTFilter||'pendientes';
  let list=obras.filter(o=>!q||[o.ot,o.cliente,o.desc].join(' ').toLowerCase().includes(q));
  if(filter==='vencidas')list=list.filter(o=>!analysisFor(o)&&elapsedHours(o)!==null&&elapsedHours(o)>=48);
  if(filter==='pendientes')list=list.filter(o=>pctChecks(ANALISIS_CHECKS,analysisFor(o))<100);
  if(filter==='completas')list=list.filter(o=>pctChecks(ANALISIS_CHECKS,analysisFor(o))===100);
  const late=obras.filter(o=>!analysisFor(o)&&elapsedHours(o)!==null&&elapsedHours(o)>=48).length;
  const complete=obras.filter(o=>pctChecks(ANALISIS_CHECKS,analysisFor(o))===100).length;
  const avgDays=(()=>{const vals=C.analisisOT.filter(a=>a.fechaCompleto&&a.fechaInicio).map(a=>(new Date(a.fechaCompleto)-new Date(a.fechaInicio))/86400000).filter(n=>n>=0&&n<100);return vals.length?(vals.reduce((s,n)=>s+n,0)/vals.length).toFixed(1):'—';})();
  const cards=list.map(o=>{const a=analysisFor(o),p=pctChecks(ANALISIS_CHECKS,a),h=elapsedHours(o),cls=p===100?'ok':(!a&&h!==null&&h>=48?'late':'warn');const checks=a?.checks||{};return `<div class="cp-ot-card ${cls}"><div class="cp-ot-top"><div><div class="cp-ot-title">OT ${esc(o.ot||'—')} · ${esc(o.cliente||'')}<span data-ap-drive-ot="${esc(o.ot)}" data-ap-drive-id="${esc(o.id)}"></span></div><div class="cp-ot-meta">${esc(o.desc||'')} · ${h===null?'sin fecha de alta':Math.floor(h)+' h desde el alta'}</div></div><span class="cp-pill ${p===100?'yes':cls==='late'?'no':'warn'}">${p}%</span></div><div class="cp-mini-checks">${ANALISIS_CHECKS.map(([k,l])=>`<label class="cp-mini-check ${checks[k]?'done':''}"><input type="checkbox" ${checks[k]?'checked':''} onchange="cpToggleOTCheck('${o.id}','${k}',this.checked)">${l}</label>`).join('')}</div><div class="cp-progress-line"><span style="width:${p}%"></span></div><div class="col-status-row"><div class="cp-ot-meta">${a?.fechaCompleto?'Insumos completos: '+fmtDate(a.fechaCompleto):p===100?'Completado':'Pendiente de Compras'}</div><button class="am-btn" onclick="amOpen('${o.id}','Compras')">＋ Ayudamemoria</button></div>${memoListHTML(o.id,'Compras')}</div>`}).join('');
  el.innerHTML=`<div class="cp-pay-toolbar"><div><div class="cp-pay-title">Control rápido de insumos por OT</div><div class="cp-sub">Se completa principalmente con checks. Las OTs sin análisis se alertan al superar 48 horas.</div></div></div><div class="cp-grid" style="margin-bottom:12px"><div class="cp-card"><div class="cp-lbl">OT activas</div><div class="cp-kpi">${obras.length}</div></div><div class="cp-card"><div class="cp-lbl">Análisis vencidos +48 h</div><div class="cp-kpi" style="color:var(--red)">${late}</div></div><div class="cp-card"><div class="cp-lbl">Insumos completos</div><div class="cp-kpi" style="color:var(--green)">${complete}</div></div><div class="cp-card"><div class="cp-lbl">Promedio abastecimiento</div><div class="cp-kpi">${avgDays}${avgDays==='—'?'':' d'}</div></div></div><div class="cp-panel"><div class="cp-actions"><input style="min-width:220px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:8px" placeholder="Buscar OT, cliente o trabajo" value="${esc(window.cpOTSearch||'')}" oninput="window.cpOTSearch=this.value;render()"><button class="cp-btn ${filter==='pendientes'?'primary':''}" onclick="window.cpOTFilter='pendientes';render()">Pendientes</button><button class="cp-btn ${filter==='vencidas'?'danger':''}" onclick="window.cpOTFilter='vencidas';render()">+48 h</button><button class="cp-btn ${filter==='completas'?'primary':''}" onclick="window.cpOTFilter='completas';render()">Completas</button><button class="cp-btn" onclick="window.cpOTFilter='todas';render()">Todas</button></div></div><div class="cp-check-board">${cards||'<div class="cp-panel">No hay OTs para este filtro.</div>'}</div>`;
}
window.cpToggleOTCheck=async(obraId,key,on)=>{
  const o=cpFindWork(obraId);if(!o)return;let a=analysisFor(o);const checks={...(a?.checks||{}),[key]:on};const data={obraId,ot:o.ot||'',cliente:o.cliente||'',descripcion:o.desc||'',checks,fechaInicio:a?.fechaInicio||todayISO(),actualizado:todayISO(),_ts:serverTimestamp()};
  if(key==='completo'&&on)data.fechaCompleto=todayISO();if(key==='completo'&&!on)data.fechaCompleto='';
  if(a)await updateDoc(doc(db,'analisisComprasOT',a.id),data);else await addDoc(collection(db,'analisisComprasOT'),data);
};


function colParseDate(v){
  if(!v)return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(v)){const [y,m,d]=v.split('-').map(Number);return new Date(y,m-1,d);}
  if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)){const [d,m,y]=v.split('/').map(Number);return new Date(y,m-1,d);}
  const dt=new Date(v);return Number.isNaN(dt.getTime())?null:dt;
}
function colSemaforo(fc,fr){
  const c=colParseDate(fc),r=colParseDate(fr);
  if(r&&c)return Math.round((r-c)/86400000)<=0?'g':'r';
  if(!c)return 'n';
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const d=Math.round((hoy-c)/86400000);
  return d<-3?'g':d<0?'a':'r';
}

window.colV281Tab=window.colV281Tab||'dashboard';
window.colSetTab=(tab)=>{window.colV281Tab=tab;renderColocacionesV27();};
function renderColocacionesV27(){
  if(window.__TIZ_COLOCACIONES_V128__ && typeof window.renderColocacionesV128==='function')return window.renderColocacionesV128();
  const host=document.getElementById('page-colocaciones');if(!host||window.currentPage!=='colocaciones')return;
  const original=host.querySelector(':scope > div:nth-child(2)');
  try{
  if(original)original.classList.add('col-legacy-wrap');
  let dash=document.getElementById('col-v281-dashboard');
  if(!dash){dash=document.createElement('div');dash.id='col-v281-dashboard';dash.className='col-dash';host.appendChild(dash);}
  const tab=window.colV281Tab||'dashboard';
  if(original)original.classList.toggle('active',tab==='detalle');
  dash.classList.toggle('hidden',tab==='detalle');
  let nav=document.getElementById('col-v281-tabs');
  if(!nav){nav=document.createElement('div');nav.id='col-v281-tabs';nav.className='col-tabs';host.querySelector('.page-header')?.after(nav);}
  nav.innerHTML=`<button class="col-tab ${tab==='dashboard'?'active':''}" onclick="colSetTab('dashboard')">Dashboard operativo</button><button class="col-tab ${tab==='detalle'?'active':''}" onclick="colSetTab('detalle')">Listado general</button>`;
  if(tab==='detalle')return;

  const q=normText(window.colV28Search||''),estado=window.colV28Estado||'pendientes';
  const all=(window.DB?.obras||[]).filter(o=>o.fcol_c||o.sector==='Colocaciones').filter(isActiveObra).sort((a,b)=>String(a.fcol_c||'9999-12-31').localeCompare(String(b.fcol_c||'9999-12-31')));
  const listas=all.filter(o=>pctChecks(COL_CHECKS,colFor(o))===100).length;
  const vencidas=all.filter(o=>!o.fcol_r&&colSemaforo(o.fcol_c,o.fcol_r)==='r').length;
  const sinFecha=all.filter(o=>!o.fcol_c).length;
  const hoy=todayISO();
  const proximas=all.filter(o=>o.fcol_c&&o.fcol_c>=hoy&&o.fcol_c<=addDaysISO(hoy,7)&&!o.fcol_r).length;
  const avg=all.length?Math.round(all.reduce((s,o)=>s+pctChecks(COL_CHECKS,colFor(o)),0)/all.length):0;
  let obras=all.filter(o=>!q||normText([o.ot,o.cliente,o.desc].join(' ')).includes(q));
  if(estado==='pendientes')obras=obras.filter(o=>pctChecks(COL_CHECKS,colFor(o))<100);
  if(estado==='listas')obras=obras.filter(o=>pctChecks(COL_CHECKS,colFor(o))===100);
  if(estado==='vencidas')obras=obras.filter(o=>!o.fcol_r&&colSemaforo(o.fcol_c,o.fcol_r)==='r');
  if(estado==='proximas')obras=obras.filter(o=>o.fcol_c&&o.fcol_c>=hoy&&o.fcol_c<=addDaysISO(hoy,7)&&!o.fcol_r);

  const stageDefs=[['info','Información del lugar'],['produccion','Producción terminada'],['calidad','Control de calidad'],['kit','Kit de colocación'],['equipo','Personal y vehículo'],['fecha','Fecha confirmada']];
  const stageRows=stageDefs.map(([key,label])=>{const done=all.filter(o=>colFor(o)?.checks?.[key]).length,p=all.length?Math.round(done/all.length*100):0;return `<div class="col-progress-row"><span>${label}</span><div class="col-progress-track"><span style="width:${p}%"></span></div><b>${p}%</b></div>`}).join('');
  const alerts=all.filter(o=>!o.fcol_r&&(colSemaforo(o.fcol_c,o.fcol_r)==='r'||pctChecks(COL_CHECKS,colFor(o))<50)).slice(0,5).map(o=>`<div class="col-alert-item"><b>OT ${esc(o.ot||'—')} · ${esc(o.cliente||'')}</b><span>${colSemaforo(o.fcol_c,o.fcol_r)==='r'?'Fecha vencida':'Preparación incompleta'} · ${pctChecks(COL_CHECKS,colFor(o))}% listo</span></div>`).join('');
  const cards=obras.map(o=>{const d=colFor(o),p=pctChecks(COL_CHECKS,d),checks=d?.checks||{},over=!o.fcol_r&&colSemaforo(o.fcol_c,o.fcol_r)==='r';return `<div class="col-v27-card ${p===100?'ready':'pending'} ${over?'overdue':''}">
    <div class="cp-ot-top"><div><div class="cp-ot-title">OT ${esc(o.ot||'—')} · ${esc(o.cliente||'')}<span data-ap-drive-ot="${esc(o.ot)}" data-ap-drive-id="${esc(o.id)}"></span></div><div class="cp-ot-meta">${esc(o.desc||'')} · Colocación: ${esc(o.fcol_c||'sin fecha')}</div></div><span class="cp-pill ${p===100?'yes':over?'no':'warn'}">${p===100?'Lista':over?'Vencida':'Preparación '+p+'%'}</span></div>
    <div class="col-v27-checks">${COL_CHECKS.map(([k,l])=>`<label class="col-v27-check ${checks[k]?'done':''}"><input type="checkbox" ${checks[k]?'checked':''} onchange="colToggleCheck('${o.id}','${k}',this.checked)">${l}</label>`).join('')}</div>
    <div class="cp-progress-line"><span style="width:${p}%"></span></div>
    <div class="col-status-row"><div class="cp-ot-meta">${p===100?'Lista para colocar':'Faltan '+(COL_CHECKS.length-Math.round(p/100*COL_CHECKS.length))+' controles'}</div><button class="am-btn" onclick="amOpen('${o.id}','Colocaciones')">＋ Ayudamemoria</button></div>${memoListHTML(o.id,'Colocaciones')}</div>`}).join('');

  dash.innerHTML=`<div class="col-dash-head"><div><div class="cp-pay-title">Dashboard de Colocaciones</div><div class="cp-sub">Preparación, vencimientos, checks y ayudamemorias por OT.</div></div><div class="col-board-filters"><input placeholder="Buscar OT, cliente o trabajo" value="${esc(window.colV28Search||'')}" oninput="window.colV28Search=this.value;renderColocacionesV27()"><select onchange="window.colV28Estado=this.value;renderColocacionesV27()"><option value="pendientes" ${estado==='pendientes'?'selected':''}>Pendientes</option><option value="proximas" ${estado==='proximas'?'selected':''}>Próximos 7 días</option><option value="listas" ${estado==='listas'?'selected':''}>Listas</option><option value="vencidas" ${estado==='vencidas'?'selected':''}>Vencidas</option><option value="todas" ${estado==='todas'?'selected':''}>Todas</option></select></div></div>
  <div class="col-kpis-v281"><div class="col-kpi-v281"><div class="label">Obras activas</div><div class="value">${all.length}</div><div class="sub">en seguimiento</div></div><div class="col-kpi-v281"><div class="label">Listas para colocar</div><div class="value" style="color:var(--green)">${listas}</div><div class="sub">100% preparadas</div></div><div class="col-kpi-v281"><div class="label">Vencidas</div><div class="value" style="color:var(--red)">${vencidas}</div><div class="sub">sin fecha real</div></div><div class="col-kpi-v281"><div class="label">Próximos 7 días</div><div class="value" style="color:var(--amber)">${proximas}</div><div class="sub">programadas</div></div><div class="col-kpi-v281"><div class="label">Preparación promedio</div><div class="value">${avg}%</div><div class="sub">avance global</div></div></div>
  <div class="col-panel-grid"><section class="col-panel"><div class="col-panel-title">Cumplimiento de controles</div><div class="col-progress-list">${stageRows}</div></section><aside class="col-panel"><div class="col-panel-title">Alertas prioritarias</div><div class="col-alert-list">${alerts||'<div class="empty">Sin alertas prioritarias.</div>'}</div></aside></div>
  <section class="col-panel"><div class="col-board-toolbar"><div><div class="col-panel-title" style="margin:0">Preparación por OT</div><div class="col-board-stats">${obras.length} obras visibles · ${sinFecha} sin fecha cargada</div></div></div><div class="col-v27-grid">${cards||'<div class="empty">No hay colocaciones para este filtro.</div>'}</div></section>`;
  }catch(err){
    console.error('[TIZ V28.2] Error dashboard colocaciones:',err);
    const dash=document.getElementById('col-v281-dashboard');
    if(dash)dash.innerHTML='<div class="card"><div class="card-body"><b>No se pudo cargar el dashboard nuevo.</b><div style="margin-top:6px;color:var(--text3)">Se mantiene disponible el listado general para no bloquear el sector.</div></div></div>';
    if(original){original.classList.add('active');original.style.display='block';}
    const nav=document.getElementById('col-v281-tabs');
    if(nav)nav.innerHTML='<button class="col-tab active" onclick="colSetTab(\'detalle\')">Listado general</button>';
  }
}
window.colToggleCheck=async(obraId,key,on)=>{const o=(window.DB?.obras||[]).find(x=>x.id===obraId);if(!o)return;let d=colFor(o);const checks={...(d?.checks||{}),[key]:on};const data={obraId,ot:o.ot||'',cliente:o.cliente||'',checks,actualizado:todayISO(),_ts:serverTimestamp()};if(d)await updateDoc(doc(db,'preparacionColocaciones',d.id),data);else await addDoc(collection(db,'preparacionColocaciones'),data);setTimeout(renderColocacionesV27,100);};

// Integración con navegación existente
const oldGoTo=window.goTo;
window.goTo=function(page){if(oldGoTo)oldGoTo(page);if(page==='compras'){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById('page-compras')?.classList.add('active');document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.cpNav==='1'));window.currentPage='compras';render();}};
const cpOldRefresh=window.refreshCurrent;window.refreshCurrent=function(){if(cpOldRefresh)cpOldRefresh();if(window.currentPage==='compras')render();setTimeout(renderColocacionesV27,0);};
const cpGoToV27=window.goTo;window.goTo=function(page){cpGoToV27(page);if(page==='colocaciones')setTimeout(renderColocacionesV27,20);};

// Ingreso guiado: el PDF y el formulario permanecen montados al abrir Proveedores.
const ING=window.TIZComprasIngresoCoreV1;
let cpIngreso=null,cpIngresoSaving=false,cpNewArticleRow=null;
function cpIngresoNumberBase(){return [...CATALOGO_TIZ_BASE,...(window.TIZComprasBaseDatosV1?.source?.rows||[]).map(r=>({codigo:r.values?.[0]}))];}
function cpResetIngreso(){window.cpCloseCatalogoIngreso();cpIngreso=null;cpNewArticleRow=null;document.getElementById('cp-ingreso')?.setAttribute('hidden','');document.getElementById('cp-modal-new-insumo')?.classList.remove('open');const resume=document.getElementById('cp-resume-ingreso');if(resume)resume.hidden=true;const gate=document.getElementById('cp-items-gate');if(gate)gate.disabled=false;const save=document.querySelector('[onclick="cpGuardarCompra()"]');if(save)save.disabled=false;}
function cpStartIngreso(data){
 cpIngreso={supplier:ING.supplier(data),providerId:'',confirmed:false,reviewed:'',editingProvider:false};
 document.querySelectorAll('#cp-items-body tr').forEach(tr=>cpPrepareIngresoRow(tr));cpRefreshIngreso();
}
function cpIngresoRows(){return [...document.querySelectorAll('#cp-items-body tr')];}
function cpIngresoSignature(){return JSON.stringify({fields:[...document.querySelectorAll('#cp-modal-compra input:not([type=file]),#cp-modal-compra select,#cp-modal-compra textarea')].map(e=>[e.id||e.className,e.value]),providerId:cpIngreso?.providerId,items:cpIngresoRows().map(tr=>[tr.dataset.articleId,tr.dataset.confirmed])});}
function cpRefreshIngreso(){
 if(typeof cpRefreshUnitNotices==='function')cpRefreshUnitNotices();
 const resume=document.getElementById('cp-resume-ingreso');if(resume)resume.hidden=!cpIngreso;
 if(!cpIngreso)return;
 const box=document.getElementById('cp-ingreso');if(!box)return;box.hidden=false;
 const provider=C.proveedores.find(p=>p.id===cpIngreso.providerId);
 if(cpIngreso.confirmed&&!provider){cpIngreso.confirmed=false;cpIngreso.providerId='';}
 const rows=cpIngresoRows(),resolved=rows.filter(tr=>tr.dataset.confirmed==='1'&&C.articulos.some(a=>a.id===tr.dataset.articleId)).length;
 document.getElementById('cp-items-gate').disabled=!cpIngreso.confirmed;
 const ready=cpIngreso.confirmed&&rows.length>0&&resolved===rows.length;
 const reviewed=ready&&cpIngreso.reviewed===cpIngresoSignature();
 const save=document.querySelector('[onclick="cpGuardarCompra()"]');if(save)save.disabled=!ready||cpIngresoSaving;
 const uiKey=JSON.stringify([cpIngreso.confirmed,cpIngreso.providerId,cpIngreso.supplier.nombre,cpIngreso.supplier.cuit,resolved,rows.length,reviewed,cpIngreso.reviewError||'',C.proveedores.map(p=>[p.id,p.nombre,p.cuit,p.domicilio,p.contacto,p.telefono,p.email,p.contactos])]);
 if(cpIngreso.uiKey===uiKey)return;cpIngreso.uiKey=uiKey;
 box.replaceChildren();const heading=document.createElement('b');heading.textContent='1. Proveedor → 2. Insumos → 3. Revisar y guardar';box.append(heading);
 const status=document.createElement('p');status.className='cp-sub';box.append(status);
 if(cpIngreso.reviewError){const error=document.createElement('p');error.className='cp-match-warn';error.setAttribute('role','alert');error.textContent=cpIngreso.reviewError;box.append(error);}
 const button=(label,action)=>{const b=document.createElement('button');b.className='cp-btn';b.textContent=label;b.onclick=action;box.append(b);return b;};
 if(!cpIngreso.confirmed){
  cpIngreso.supplier.nombre=document.getElementById('cp-proveedor').value.trim()||cpIngreso.supplier.nombre;
  const match=ING.supplierMatches(cpIngreso.supplier,C.proveedores);
  status.textContent=match.candidates.length?'Confirmá el proveedor antes de revisar los insumos.':'Proveedor sin identificar. Buscalo o completá el alta en Proveedores.';
  for(const p of match.candidates)button('Usar '+(p.nombre||p.razonSocial)+' · '+(p.cuit||'CUIT pendiente'),()=>cpConfirmIngresoProvider(p));
  const select=document.createElement('select');select.setAttribute('aria-label','Buscar proveedor existente');select.style.margin='8px';select.add(new Option('Elegir proveedor existente…',''));
  for(const p of [...C.proveedores].sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre))))select.add(new Option((p.nombre||p.razonSocial||'Sin nombre')+' · '+(p.cuit||'Sin CUIT'),p.id));
  select.onchange=()=>{const p=C.proveedores.find(x=>x.id===select.value);if(p)cpConfirmIngresoProvider(p);};box.append(select);
  button('Ir a Proveedores / dar de alta',()=>cpOpenIngresoProvider());
 }else{
  status.textContent='Proveedor confirmado: '+(provider.nombre||provider.razonSocial)+'. Insumos resueltos: '+resolved+' de '+rows.length+'.';
  const pending=ING.pendingSupplier(provider);if(pending.length){const p=document.createElement('p');p.className='cp-match-warn';p.textContent='Datos pendientes del proveedor: '+pending.map(k=>({contacto:'vendedor / contacto',telefono:'teléfono'}[k]||k)).join(', ')+'. Podés completarlos en su ficha.';box.append(p);}
  button('Completar ficha del proveedor',()=>cpOpenIngresoProvider(provider));
  button('＋ Agregar contacto',()=>cpOpenIngresoProvider(provider,true));
  button('Cambiar proveedor',()=>{cpIngreso.confirmed=false;cpIngreso.reviewed='';cpIngresoRows().forEach(tr=>cpPrepareIngresoRow(tr));cpRefreshIngreso();});
  if(ready)button('Revisar compra',()=>cpReviewIngreso()).classList.add('primary');
  if(reviewed){const summary=document.createElement('div');summary.style.marginTop='12px';summary.textContent='Revisión lista · '+document.getElementById('cp-totales').textContent+'. Ya podés guardar la compra.';box.append(summary);}
 }
}
function cpConfirmIngresoProvider(p){
 const expected=ING.digits(cpIngreso.supplier.cuit),actual=ING.digits(p.cuit);
 if(expected.length===11&&actual&&expected!==actual)return toast('El CUIT del proveedor elegido difiere del comprobante. Revisá la ficha antes de continuar.');
 const sameProvider=cpIngreso.confirmed&&cpIngreso.providerId===p.id;
 cpIngreso.providerId=p.id;cpIngreso.confirmed=true;cpIngreso.reviewed='';document.getElementById('cp-proveedor').value=p.nombre||p.razonSocial||'';
 if(!sameProvider)cpIngresoRows().forEach(tr=>cpPrepareIngresoRow(tr));cpRefreshIngreso();
}
function cpOpenIngresoProvider(existing,addContact=false){
 if(!cpIngreso)return;cpIngreso.editingProvider=false;window.cpTab('proveedores');
 const p=existing||cpIngreso.supplier;cpFillProvider(p);cpIngreso.editingProvider=true;
 document.getElementById('cp-modal-compra').classList.remove('open');
 cpCaptureProviderDraft();cpShowProviderReturn();cpMarkProviderPending();if(addContact)window.cpAddProviderContact();
}
function cpShowProviderReturn(){if(document.getElementById('cp-provider-return'))return;const banner=document.createElement('div');banner.id='cp-provider-return';banner.className='cp-panel';banner.innerHTML='<b></b><p></p><button class="cp-btn" onclick="cpResumeIngreso()">Volver a la compra</button>';banner.querySelector('b').textContent=cpIngreso?.aiRead?'Lectura IA terminada · completar proveedor':'Compra en curso · completar proveedor';banner.querySelector('p').textContent=(cpIngreso?.aiRead?'Se reconocieron '+cpIngresoRows().length+' renglones. Completá y guardá la ficha del proveedor para continuar con los insumos. ':'')+'Los datos del comprobante y el archivo se conservan. Los campos sin datos quedan marcados para completarlos.';document.getElementById('cp-content').prepend(banner);}
function cpProviderContacts(p={}){
 const contacts=[],seen=new Set(),clean=v=>typeof v==='string'?v.trim():'';
 const add=c=>{if(!c||typeof c!=='object')return;const contact={nombre:clean(c.nombre||c.contacto),telefono:clean(c.telefono||c.cel),email:clean(c.email)};if(!Object.values(contact).some(Boolean))return;const key=JSON.stringify([contact.nombre.toLowerCase(),contact.telefono,contact.email.toLowerCase()]);if(!seen.has(key)){seen.add(key);contacts.push(contact);}};
 add({nombre:p.contacto,telefono:p.telefono||p.cel,email:p.email});
 if(Array.isArray(p.contactos))p.contactos.forEach(add);
 return contacts;
}
function cpReadProviderContacts(){
 const v=k=>document.getElementById('cp-prov-'+k)?.value||'';
 const additional=[...document.querySelectorAll('#cp-prov-contactos .cp-provider-contact')].map(row=>({nombre:row.querySelector('.cp-contact-name').value,telefono:row.querySelector('.cp-contact-phone').value,email:row.querySelector('.cp-contact-email').value}));
 return cpProviderContacts({contacto:v('contacto'),telefono:v('tel'),email:v('email'),contactos:additional});
}
window.cpAddProviderContact=(contact={},focus=true)=>{
 const list=document.getElementById('cp-prov-contactos');if(!list)return;
 const row=document.createElement('div');row.className='cp-row cp-provider-contact';row.style.cssText='margin-top:10px;padding:10px;border:1px solid var(--border);border-radius:8px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))';
 row.innerHTML='<div class="cp-field"><label>Nombre / contacto<input class="cp-contact-name" placeholder="Ej.: vendedor o administración"></label></div><div class="cp-field"><label>Teléfono<input class="cp-contact-phone" type="tel"></label></div><div class="cp-field"><label>Email<input class="cp-contact-email" type="email"></label></div><div style="align-self:end"><button type="button" class="cp-btn" data-remove-contact>Quitar contacto</button></div>';
 row.querySelector('.cp-contact-name').value=contact.nombre||contact.contacto||'';
 row.querySelector('.cp-contact-phone').value=contact.telefono||contact.cel||'';
 row.querySelector('.cp-contact-email').value=contact.email||'';
 row.querySelector('[data-remove-contact]').onclick=()=>{row.remove();cpCaptureProviderDraft();};
 row.addEventListener('input',()=>cpCaptureProviderDraft());list.append(row);
 if(focus){row.querySelector('.cp-contact-name').focus();cpCaptureProviderDraft();}
};

function cpCaptureProviderDraft(){if(!cpIngreso?.editingProvider||!document.getElementById('cp-prov-id'))return;const v=k=>document.getElementById('cp-prov-'+k)?.value||'';cpIngreso.providerDraft={id:v('id'),nombre:v('nombre'),nombreComercial:v('nombre'),razonSocial:v('razon'),cuit:v('cuit'),domicilio:v('domicilio'),contacto:v('contacto'),telefono:v('tel'),email:v('email'),contactos:cpReadProviderContacts(),condicionPago:v('cond'),diasPago:v('dias'),notas:v('notas')};}
window.cpResumeIngreso=()=>{if(!cpIngreso)return;cpIngreso.editingProvider=false;window.cpTab('compras');document.getElementById('cp-modal-compra').classList.add('open');cpRefreshIngreso();};
function cpFillProvider(p={}){
 const contacts=cpProviderContacts(p),primary=contacts[0]||{};
 const values={'id':p.id||'','nombre':p.nombreComercial||p.nombre||p.razonSocial||'','razon':p.razonSocial||(!p.nombreComercial?p.nombre:'')||'','cuit':p.cuit||'','domicilio':p.domicilio||'','contacto':primary.nombre||'','tel':primary.telefono||'','email':primary.email||'','cond':p.condicionPago||'','dias':p.diasPago??'','notas':p.notas||''};
 for(const [key,value]of Object.entries(values)){const e=document.getElementById('cp-prov-'+key);if(e)e.value=value;}
 const list=document.getElementById('cp-prov-contactos');if(list){list.replaceChildren();contacts.slice(1).forEach(c=>window.cpAddProviderContact(c,false));}
}
function cpMarkProviderPending(){for(const key of ['cuit','domicilio','contacto','tel','email']){const e=document.getElementById('cp-prov-'+key);if(!e)continue;const update=()=>{e.style.borderColor=e.value.trim()?'':'var(--amber)';e.placeholder=e.value.trim()?'':'Pendiente de completar';};e.addEventListener('input',update);update();}}
const cpClearProviderLegacy=window.cpClearProveedor;
window.cpClearProveedor=()=>{cpClearProviderLegacy();const e=document.getElementById('cp-prov-domicilio');if(e)e.value='';const legal=document.getElementById('cp-prov-razon');if(legal)legal.value='';document.getElementById('cp-prov-contactos')?.replaceChildren();cpMarkProviderPending();};
window.cpEditProveedor=(id,name)=>{window.cpTab('proveedores');cpFillProvider((id?C.proveedores.find(p=>p.id===id):providerByName(name))||{nombre:name});cpMarkProviderPending();};
let cpProviderSaving=false;
window.cpSaveProveedor=async()=>{
 if(cpProviderSaving)return;const v=k=>document.getElementById('cp-prov-'+k)?.value.trim()||'';
 const data={nombre:v('nombre'),nombreComercial:v('nombre'),razonSocial:v('razon'),cuit:ING.digits(v('cuit')),domicilio:v('domicilio'),contacto:v('contacto'),telefono:v('tel'),email:v('email'),condicionPago:v('cond'),diasPago:num(v('dias')),notas:v('notas'),_ts:serverTimestamp()};
 data.contactos=cpReadProviderContacts();const primary=data.contactos[0]||{};data.contacto=primary.nombre||'';data.telefono=primary.telefono||'';data.email=primary.email||'';
 if(!data.nombre)return toast('Ingresá el proveedor.');
 if(data.cuit&&data.cuit.length!==11)return toast('El CUIT debe tener 11 dígitos.');
 if(cpIngreso?.editingProvider&&(!data.cuit||!data.domicilio))return toast('Completá CUIT y domicilio para dar de alta al proveedor de esta compra.');
 let id=v('id');const duplicate=C.proveedores.find(p=>p.id!==id&&((data.cuit&&ING.digits(p.cuit)===data.cuit)||ING.norm(p.nombre||p.razonSocial)===ING.norm(data.nombre)));
 if(duplicate)return toast('Ese proveedor ya existe. Abrí su ficha o volvé a la compra y elegilo del listado.');
 const previous=C.proveedores.find(p=>p.id===id);
 data.nombresAnteriores=uniqueSorted([...(previous?.nombresAnteriores||[]),previous?.nombre,previous?.razonSocial,data.razonSocial].filter(x=>x&&ING.norm(x)!==ING.norm(data.nombre)));
 data.camposPendientes=ING.pendingSupplier(data);cpProviderSaving=true;
 try{
  // La clave por CUIT evita dos altas simultáneas del mismo proveedor.
  if(id)await updateDoc(doc(db,'proveedoresCompra',id),data);
  else if(data.cuit){id='cuit-'+data.cuit;await runTransaction(db,async tx=>{const ref=doc(db,'proveedoresCompra',id),snap=await tx.get(ref);if(snap.exists())throw Error('El proveedor ya fue dado de alta. Volvé y seleccioná la ficha existente.');tx.set(ref,data);});}
  else{id=(await addDoc(collection(db,'proveedoresCompra'),data)).id;}
  const record={...C.proveedores.find(p=>p.id===id),...data,id};C.proveedores=[...C.proveedores.filter(p=>p.id!==id),record];
  if(cpIngreso?.editingProvider){cpIngreso.editingProvider=false;cpConfirmIngresoProvider(record);window.cpResumeIngreso();}
  else{window.cpClearProveedor();render();}
  toast(data.camposPendientes.length?'Proveedor guardado. Quedan datos de contacto para completar.':'Proveedor guardado.');
 }catch(e){toast('No se pudo guardar el proveedor: '+e.message);}finally{cpProviderSaving=false;}
};
function cpPrepareIngresoRow(tr){
 if(!cpIngreso)return;tr.dataset.confirmed='';tr.dataset.articleId='';cpIngreso.reviewed='';
 if(!tr.dataset.ingresoWired){
  tr.dataset.ingresoWired='1';
  for(const selector of ['.i-desc','.i-code'])tr.querySelector(selector).addEventListener('input',()=>{cpPrepareIngresoRow(tr);cpRefreshIngreso();});
  for(const selector of ['.i-original','.i-unit','.i-family','.i-subfamily'])tr.querySelector(selector).addEventListener('input',()=>{
   cpIngreso.reviewed='';
   if(selector!=='.i-original'&&tr.dataset.confirmed==='1'){
    const edit=tr.querySelector('[data-edit-linked-article]');if(edit)edit.textContent='Guardar datos del insumo';
   }
   cpRefreshIngreso();
  });
  tr.querySelector('.i-desc').addEventListener('change',()=>{const exact=articleByDescription(tr.querySelector('.i-desc').value);cpPrepareIngresoRow(tr);if(exact)cpConfirmIngresoArticle(tr,exact);else cpRefreshIngreso();});
 }
 const note=tr.querySelector('.cp-item-match');note.className='cp-item-match cp-match-warn';note.replaceChildren();
 const label=document.createElement('div');label.textContent='Elegí el insumo del catálogo o dalo de alta.';note.append(label);
 const source={descripcionOriginal:tr.querySelector('.i-desc').value||tr.querySelector('.i-original').value,codigoProveedor:tr.dataset.providerCode||''};
 for(const candidate of ING.articleSuggestions(source,C.articulos,C.compras,cpIngreso.providerId)){
  const b=document.createElement('button');b.className='cp-btn';b.style.cssText='display:block;white-space:normal;text-align:left;margin:4px 0';b.textContent='Usar '+(candidate.article.codigo||'s/n')+' · '+candidate.article.descripcion+' ('+Math.round(candidate.score*100)+'%)';b.title=candidate.reason;b.onclick=()=>cpConfirmIngresoArticle(tr,candidate.article);note.append(b);
 }
 const browse=document.createElement('button');browse.className='cp-btn primary';browse.type='button';browse.textContent='Buscar en catálogo y vincular';browse.onclick=()=>window.cpOpenCatalogoIngreso(tr);note.append(browse);
 const create=document.createElement('button');create.className='cp-btn';create.type='button';create.textContent='+ Crear nuevo insumo';create.onclick=()=>cpOpenNewIngresoArticle(tr);note.append(create);
}
function cpConfirmIngresoArticle(tr,a){
 if(!cpIngreso?.confirmed)return toast('Confirmá primero el proveedor.');
 applyArticleToRow(tr,a);tr.dataset.confirmed='1';cpIngreso.reviewed='';cpRefreshIngreso();
 const change=document.createElement('button');change.className='cp-btn';change.type='button';change.textContent='Cambiar insumo';
 change.onclick=()=>window.cpOpenCatalogoIngreso(tr);
 tr.querySelector('.cp-item-match').append(change);
 const edit=document.createElement('button');edit.className='cp-btn';edit.type='button';edit.dataset.editLinkedArticle='1';edit.textContent='Editar insumo';edit.onclick=()=>window.cpEditArticulo(a.id,tr);
 tr.querySelector('.cp-item-match').append(edit);
}

let cpCatalogSelection=null;
function cpCatalogMatches(articles,query='',family=''){
 const normalize=value=>ING.norm(value).replace(/\bjota\b/g,'j');
 const terms=normalize(query).split(' ').filter(Boolean);
 return articles.filter(a=>a.id&&(!family||ING.norm(a.familia||a.rubro)===ING.norm(family))&&terms.every(term=>normalize([a.codigo,a.descripcion,a.familia,a.rubro,a.subfamilia,a.unidad].join(' ')).includes(term))).sort((a,b)=>String(a.codigo||'').localeCompare(String(b.codigo||''),undefined,{numeric:true})||String(a.descripcion||'').localeCompare(String(b.descripcion||''),'es'));
}
window.cpCloseCatalogoIngreso=()=>{
 const row=cpCatalogSelection?.row;cpCatalogSelection=null;
 document.getElementById('cp-modal-catalogo-ingreso')?.classList.remove('open');
 row?.querySelector('.i-desc')?.focus();
};
window.cpOpenCatalogoIngreso=tr=>{
 if(!cpIngreso?.confirmed)return toast('Confirmá primero el proveedor.');
 if(!cpIngresoRows().includes(tr))return;
 cpCatalogSelection={row:tr,providerId:cpIngreso.providerId};
 let modal=document.getElementById('cp-modal-catalogo-ingreso');
 if(!modal){modal=document.createElement('div');modal.id='cp-modal-catalogo-ingreso';modal.className='cp-modal-bg';modal.style.zIndex='12004';document.body.append(modal);}
 const original=tr.querySelector('.i-original').value;
 const families=[...new Set(C.articulos.map(a=>a.familia||a.rubro).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
 modal.innerHTML=`<div class="cp-modal" style="max-width:960px;width:100%" role="dialog" aria-modal="true" aria-labelledby="cp-catalog-title"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2 id="cp-catalog-title">Vincular con un insumo del catálogo</h2><button type="button" class="cp-btn" onclick="cpCloseCatalogoIngreso()" aria-label="Cerrar catálogo">✕</button></div><p class="cp-sub">Descripción de factura: <b>${esc(original)}</b></p><p class="cp-sub">Elegí el insumo existente que corresponde. Se conservan la descripción original, la cantidad y el precio de la factura.</p><div class="cp-row" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))"><div class="cp-field"><label for="cp-catalog-query">Buscar en todo el catálogo</label><input id="cp-catalog-query" placeholder="Perfil J, jota, aluminio o código" oninput="cpRenderCatalogoIngreso()"></div><div class="cp-field"><label for="cp-catalog-family">Familia</label><select id="cp-catalog-family" onchange="cpRenderCatalogoIngreso()"><option value="">Todas las familias</option>${families.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select></div></div><p id="cp-catalog-count" class="cp-sub" role="status" aria-live="polite"></p><div style="overflow:auto;max-height:50vh"><table class="cp-table" style="min-width:650px"><thead><tr><th>Código</th><th>Insumo</th><th>Familia / subfamilia</th><th>Unidad</th><th></th></tr></thead><tbody id="cp-catalog-results"></tbody></table></div><div class="cp-actions" style="margin-top:14px"><button type="button" class="cp-btn" onclick="cpCloseCatalogoIngreso()">Volver sin vincular</button><button type="button" class="cp-btn" id="cp-catalog-create">No existe: crear nuevo insumo</button></div></div>`;
 document.getElementById('cp-catalog-create').onclick=()=>{const row=cpCatalogSelection?.row;window.cpCloseCatalogoIngreso();if(row&&cpIngresoRows().includes(row))cpOpenNewIngresoArticle(row);};
 modal.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();window.cpCloseCatalogoIngreso();}};
 modal.classList.add('open');window.cpRenderCatalogoIngreso();document.getElementById('cp-catalog-query').focus();
};
window.cpRenderCatalogoIngreso=()=>{
 if(!cpCatalogSelection)return;
 const matches=cpCatalogMatches(C.articulos,document.getElementById('cp-catalog-query').value,document.getElementById('cp-catalog-family').value),visible=matches.slice(0,80),body=document.getElementById('cp-catalog-results');
 document.getElementById('cp-catalog-count').textContent=matches.length?(matches.length+' insumos encontrados'+(matches.length>80?' · Se muestran los primeros 80. Refiná la búsqueda para ver los demás.':'.')):'No hay coincidencias. Probá otras palabras o creá un nuevo insumo.';
 body.innerHTML=visible.map(a=>`<tr><td>${esc(a.codigo||'—')}</td><td><b>${esc(a.descripcion||'Sin descripción')}</b></td><td>${esc([a.familia||a.rubro,a.subfamilia].filter(Boolean).join(' / '))}</td><td>${esc(a.unidad||'—')}</td><td><button type="button" class="cp-btn primary" data-catalog-article="${esc(a.id)}" aria-label="Vincular ${esc(a.codigo||'')} ${esc(a.descripcion||'')}">Vincular</button> <button type="button" class="cp-btn" data-catalog-edit="${esc(a.id)}" aria-label="Editar insumo ${esc(a.codigo||'')} ${esc(a.descripcion||'')}">Editar insumo</button></td></tr>`).join('')||'<tr><td colspan="5">Sin resultados para esta búsqueda.</td></tr>';
 body.querySelectorAll('[data-catalog-article]').forEach(button=>button.onclick=()=>window.cpLinkCatalogoIngreso(button.dataset.catalogArticle));
 body.querySelectorAll('[data-catalog-edit]').forEach(button=>button.onclick=()=>window.cpEditArticulo(button.dataset.catalogEdit));
};
window.cpLinkCatalogoIngreso=id=>{
 const selection=cpCatalogSelection,article=C.articulos.find(a=>a.id===id);
 if(!selection||!cpIngreso?.confirmed||cpIngreso.providerId!==selection.providerId||!cpIngresoRows().includes(selection.row)){window.cpCloseCatalogoIngreso();return toast('La compra cambió. Volvé a abrir el catálogo desde el ítem.');}
 if(!article)return toast('Este insumo ya no está disponible. Elegí otro del catálogo.');
 cpConfirmIngresoArticle(selection.row,article);window.cpCloseCatalogoIngreso();
};

let cpArticleEditor=null,cpArticleSaving=false;
window.cpEditArticulo=(id,row=null,options={})=>{
 if(cpArticleSaving)return;
 const a=C.articulos.find(x=>x.id===id);if(!a)return toast('El insumo ya no está disponible.');
 cpArticleEditor={id,row,...options};let modal=document.getElementById('cp-modal-edit-insumo');
 if(!modal){modal=document.createElement('div');modal.id='cp-modal-edit-insumo';modal.className='cp-modal-bg';modal.style.zIndex='26000';document.body.append(modal);}
 const current=(selector,fallback)=>row?.querySelector(selector)?.value??fallback??'';
 const fields=[['desc','Descripción',a.descripcion],['unit','Unidad',current('.i-unit',a.unidad)],['family','Familia',current('.i-family',a.familia||a.rubro)],['subfamily','Subfamilia',current('.i-subfamily',a.subfamilia)]];
 modal.innerHTML=`<div class="cp-modal" style="max-width:720px" role="dialog" aria-label="Editar insumo"><h2>Editar insumo ${esc(a.codigo||'')}</h2><p class="cp-sub">Estos datos se actualizan en el catálogo y en la compra en curso. Las compras anteriores conservan sus datos.</p><div class="cp-row" style="grid-template-columns:repeat(2,minmax(0,1fr))">${fields.map(([key,label,value])=>`<div class="cp-field"><label for="cp-edit-${key}">${label}</label><input id="cp-edit-${key}" value="${esc(value)}" ${key==='family'?'list="cp-edit-families"':key==='subfamily'?'list="cp-edit-subfamilies"':''}></div>`).join('')}<div class="cp-field"><label for="cp-edit-control">Control de stock</label><select id="cp-edit-control"><option value="estrategico">Estratégico</option><option value="consumible">Consumible</option><option value="sin_stock">Sin stock</option></select></div><div class="cp-field"><label for="cp-edit-min">Stock mínimo</label><input id="cp-edit-min" type="number" min="0" step="0.01" value="${esc(a.stockMinimo??0)}"></div></div><datalist id="cp-edit-families">${familyOptions().map(f=>`<option value="${esc(f)}">`).join('')}</datalist><datalist id="cp-edit-subfamilies"></datalist><p id="cp-edit-error" role="alert" class="cp-match-warn"></p><div class="cp-actions" style="margin-top:14px"><button class="cp-btn" id="cp-edit-cancel" onclick="cpCloseEditArticulo()">Volver sin guardar</button><button class="cp-btn primary" id="cp-edit-save" onclick="cpSaveEditArticulo()">Guardar cambios del insumo</button></div></div>`;
 document.getElementById('cp-edit-control').value=a.control||'consumible';
 const refresh=()=>setSubfamilyList('cp-edit-subfamilies',document.getElementById('cp-edit-family').value);document.getElementById('cp-edit-family').oninput=refresh;refresh();modal.classList.add('open');
};
window.cpCloseEditArticulo=()=>{if(cpArticleSaving)return;document.getElementById('cp-modal-edit-insumo')?.classList.remove('open');cpArticleEditor=null;};
window.cpSaveEditArticulo=async()=>{
 if(cpArticleSaving||!cpArticleEditor)return;
 const {id,onSaved}=cpArticleEditor,existing=C.articulos.find(a=>a.id===id),v=k=>document.getElementById('cp-edit-'+k).value.trim(),error=document.getElementById('cp-edit-error');
 if(!existing){error.textContent='El insumo ya no está disponible.';return;}
 const data={descripcion:v('desc'),unidad:v('unit'),familia:v('family'),subfamilia:v('subfamily'),control:v('control'),stockMinimo:Number(v('min'))};
 if(!data.descripcion||!data.unidad){error.textContent='Completá descripción y unidad.';return;}
 if(!Number.isFinite(data.stockMinimo)||data.stockMinimo<0){error.textContent='El stock mínimo debe ser cero o mayor.';return;}
 if(C.articulos.some(a=>a.id!==id&&ING.norm(a.descripcion)===ING.norm(data.descripcion))){error.textContent='Ya existe otro insumo con esa descripción. Revisá el catálogo.';return;}
 cpArticleSaving=true;document.getElementById('cp-edit-save').disabled=true;document.getElementById('cp-edit-cancel').disabled=true;error.textContent='';
 try{
  await updateDoc(doc(db,'articulosCompra',id),{...data,actualizado:serverTimestamp()});
  const updated={...existing,...data,id};C.articulos=C.articulos.map(a=>a.id===id?updated:a);
  document.querySelectorAll('#cp-items-body tr').forEach(tr=>{if(tr.dataset.articleId===id){if(cpIngreso?.confirmed&&tr.dataset.confirmed==='1')cpConfirmIngresoArticle(tr,updated);else applyArticleToRow(tr,updated);}});
  refreshCatalogDatalist();cpRenderArticleRows();window.cpRenderCatalogoIngreso?.();calcTotals();cpArticleSaving=false;window.cpCloseEditArticulo();onSaved?.(updated);toast('Insumo actualizado. Se conservaron la cantidad y el precio de la compra.');
 }catch(e){error.textContent='No se pudo guardar el insumo: '+e.message;}
 finally{cpArticleSaving=false;document.getElementById('cp-edit-save').disabled=false;document.getElementById('cp-edit-cancel').disabled=false;}
};
const cpAddItemLegacy=window.cpAddItem;
window.cpAddItem=(data={})=>{
 cpAddItemLegacy(data);const tr=document.getElementById('cp-items-body').lastElementChild;
 tr.dataset.providerCode=ING.text(data.codigoProveedor||data.codigo||'');
 if(cpIngreso)cpPrepareIngresoRow(tr);
 cpDistribution.attach(tr,data);
 cpRefreshIngreso();
};
function cpOpenNewIngresoArticle(tr){
 if(!cpIngreso?.confirmed)return;cpNewArticleRow=tr;let modal=document.getElementById('cp-modal-new-insumo');
 if(!modal){modal=document.createElement('div');modal.id='cp-modal-new-insumo';modal.className='cp-modal-bg';modal.style.zIndex='12002';document.body.append(modal);}
 modal.innerHTML=`<div class="cp-modal" style="max-width:720px"><h2>Alta de insumo</h2><p class="cp-sub">Revisá las sugerencias antes de crear un insumo. Se asignará un número único al guardar.</p><p><b>N.º sugerido: ${esc(ING.nextCode(C.articulos,cpIngresoNumberBase()))}</b></p><div class="cp-row"><div class="cp-field"><label>Descripción</label><input id="cp-new-desc" value="${esc(tr.querySelector('.i-original').value||tr.querySelector('.i-desc').value)}"></div><div class="cp-field"><label>Unidad de stock</label><input id="cp-new-unit" value="${esc(tr.querySelector('.i-unit').value)}"></div><div class="cp-field"><label>Familia</label><input id="cp-new-family" list="cp-new-families"><datalist id="cp-new-families">${familyOptions().map(x=>`<option value="${esc(x)}">`).join('')}</datalist></div><div class="cp-field"><label>Subfamilia</label><input id="cp-new-subfamily" list="cp-new-subfamilies"><datalist id="cp-new-subfamilies"></datalist></div><div class="cp-field"><label>Control de stock</label><select id="cp-new-control"><option value="consumible">Consumible</option><option value="estrategico">Estratégico</option><option value="sin_stock">Sin stock</option></select></div></div><p id="cp-new-error" role="alert" class="cp-match-warn"></p><div class="cp-actions" style="margin-top:14px"><button class="cp-btn" onclick="cpCloseNewIngresoArticle()">Volver sin crear</button><button class="cp-btn primary" id="cp-new-save" onclick="cpSaveNewIngresoArticle()">Crear insumo y vincular</button></div></div>`;
 document.getElementById('cp-new-family').oninput=e=>setSubfamilyList('cp-new-subfamilies',e.target.value);modal.classList.add('open');
}
window.cpCloseNewIngresoArticle=()=>{document.getElementById('cp-modal-new-insumo')?.classList.remove('open');cpNewArticleRow=null;};
async function cpCreateNumberedArticle(data){
 // Lee el catálogo completo antes de reservar; el contador serializa las altas concurrentes.
 const snap=await getDocs(collection(db,'articulosCompra'));const catalog=snap.docs.map(d=>({id:d.id,...d.data()}));
 if(catalog.some(a=>ING.norm(a.descripcion)===ING.norm(data.descripcion)))throw Error('Ya existe un insumo con esa descripción. Buscalo en el catálogo.');
 const sequence=doc(db,'comprasSecuencias','insumos');
 return runTransaction(db,async tx=>{const seq=await tx.get(sequence),codigo=ING.nextCode(catalog,cpIngresoNumberBase(),seq.exists()?seq.data().ultimo:0),ref=doc(db,'articulosCompra','insumo-'+codigo),existing=await tx.get(ref);if(existing.exists())throw Error('El número ya existe. Volvé a intentar.');const article={...data,codigo,_ts:serverTimestamp()};tx.set(sequence,{ultimo:Number(codigo)});tx.set(ref,article);return {...article,id:ref.id};});
}
window.cpSaveNewIngresoArticle=async()=>{
 const tr=cpNewArticleRow;if(!tr||!tr.isConnected)return;const v=k=>document.getElementById('cp-new-'+k).value.trim();
 const data={descripcion:v('desc'),unidad:v('unit'),familia:v('family'),subfamilia:v('subfamily'),control:v('control'),stockMinimo:0};const error=document.getElementById('cp-new-error');
 if(!data.descripcion||!data.unidad||!data.familia||!data.subfamilia){error.textContent='Completá descripción, unidad, familia y subfamilia.';return;}
 const b=document.getElementById('cp-new-save');if(b.disabled)return;b.disabled=true;
 try{const a=await cpCreateNumberedArticle(data);C.articulos=[...C.articulos.filter(x=>x.id!==a.id),a];cpConfirmIngresoArticle(tr,a);window.cpCloseNewIngresoArticle();toast('Insumo '+a.codigo+' creado y vinculado.');}catch(e){error.textContent=e.message;}finally{b.disabled=false;}
};
function cpReviewError(message,fieldId=''){
 if(cpIngreso){cpIngreso.reviewed='';cpIngreso.reviewError=message;cpRefreshIngreso();}
 document.getElementById('cp-ingreso')?.scrollIntoView?.({behavior:'smooth',block:'center'});
 if(fieldId)document.getElementById(fieldId)?.focus();
 toast(message);return false;
}
function cpReviewIngreso(){
 if(!cpIngreso?.confirmed)return cpReviewError('Confirmá el proveedor.');
 const rows=cpIngresoRows();if(!rows.length||rows.some(tr=>tr.dataset.confirmed!=='1'||!C.articulos.some(a=>a.id===tr.dataset.articleId)))return cpReviewError('Resolvé todos los insumos antes de revisar.');
 if(rows.some(tr=>!tr.querySelector('.i-original').value.trim()||num(tr.querySelector('.i-qty').value)<=0||num(tr.querySelector('.i-price').value)<0))return cpReviewError('Revisá la descripción, cantidad y precio de cada renglón.');
 if(!document.getElementById('cp-fecha').value)return cpReviewError('Completá la fecha del comprobante.','cp-fecha');
 const number=document.getElementById('cp-numero').value.trim();
 if(number&&C.compras.some(c=>c.id!==compraEditId&&(c.proveedorId===cpIngreso.providerId||ING.norm(c.proveedor)===ING.norm(document.getElementById('cp-proveedor').value))&&ING.digits(c.numeroComprobante)===ING.digits(number)&&c.tipoComprobante===document.getElementById('cp-tipo').value))return cpReviewError('Este comprobante ya está cargado para ese proveedor. Revisá el número antes de volver a guardarlo.','cp-numero');
 cpIngreso.reviewError='';cpIngreso.reviewed=cpIngresoSignature();cpRefreshIngreso();return true;
}
const cpNuevaCompraLegacy=window.cpNuevaCompra;
window.cpNuevaCompra=()=>{cpResetIngreso();cpSetIaStatus('');cpNuevaCompraLegacy();};
const cpCalcTotalsLegacy=calcTotals;
calcTotals=function(){cpCalcTotalsLegacy();cpDistribution.refreshAll();cpRefreshIngreso();};
const cpRowToItemLegacy=rowToItem;
rowToItem=function(tr){const i=cpRowToItemLegacy(tr),a=C.articulos.find(a=>a.id===i.articuloId),cost=cpPurchaseCostFields(i,a),item={...i,...cost};try{const d=cpDistribution.capture(tr);if(d)item.distribucion=d;}catch(err){item.errorDistribucion=err.message;}return cpIngreso?{...item,codigoProveedor:tr.dataset.providerCode||'',vinculacionConfirmada:tr.dataset.confirmed==='1'}:item;};
const cpApplyAILegacy=applyAI;
applyAI=function(data){
 // Sólo campos de datos: el contenido del comprobante nunca indica acciones a ejecutar.
 const safe={...data,items:Array.isArray(data.items)?data.items:[],proveedor:ING.supplier(data).nombre};cpStartIngreso(data);cpIngreso.aiRead=true;cpApplyAILegacy(safe);if(!data.fecha)document.getElementById('cp-fecha').value='';cpRefreshIngreso();
 if(ING.supplierMatches(cpIngreso.supplier,C.proveedores).type==='missing')cpOpenIngresoProvider();
};
const cpGuardarCompraLegacy=window.cpGuardarCompra;
window.cpGuardarCompra=async()=>{
 if(cpIngresoSaving)return;
 if(cpIngreso&&!cpReviewIngreso())return;
 cpIngresoSaving=true;cpRefreshIngreso();try{await cpGuardarCompraLegacy();if(!document.getElementById('cp-modal-compra').classList.contains('open'))cpResetIngreso();}catch(e){toast('No se pudo completar el guardado: '+e.message);}finally{cpIngresoSaving=false;cpRefreshIngreso();}
};
// Cambiar un dato del comprobante invalida la revisión final, sin borrar el trabajo.
document.addEventListener('input',e=>{if(cpIngreso&&e.target.closest('#cp-modal-compra')){if(e.target.id==='cp-proveedor'){cpIngreso.supplier.nombre=e.target.value.trim();cpIngreso.supplier.cuit='';cpIngreso.confirmed=false;cpIngreso.providerId='';}cpRefreshIngreso();}});
document.addEventListener('change',e=>{if(cpIngreso&&e.target.closest('#cp-modal-compra'))cpRefreshIngreso();});


injectStyles();injectUI();startListeners();
onAuthStateChanged(getAuth(getApp()),cpStartSharedIA);
setInterval(()=>{if(window.currentPage==='compras'&&!document.hidden)cpRefreshMother();},60000);
console.info('[TIZ V28.2] Hotfix Dashboard de Colocaciones cargado');


// ============================================================
// TIZ V32 — API de catálogo y último costo para Cotizador
// ============================================================
window.tizComprasCatalogoV32 = function(){
  try {
    const allItems = typeof purchaseItems === 'function' ? purchaseItems() : [];
    return (C.articulos || []).map(a => {
      const matches = allItems
        .filter(x => x.articuloId === a.id || normText(x.descripcion) === normText(a.descripcion))
        .sort((x,y) => String(y.compra?.fecha || '').localeCompare(String(x.compra?.fecha || '')));
      const last = matches[0] || null;
      return {
        id: a.id || '',
        codigo: a.codigo || '',
        descripcion: a.descripcion || '',
        unidad: a.unidad || 'UNID',
        familia: a.familia || '',
        subfamilia: a.subfamilia || '',
        ultimoCosto: last ? Number(last.precioUnitarioNeto || 0) : 0,
        proveedor: last?.compra?.proveedor || '',
        fechaCosto: last?.compra?.fecha || '',
        compraId: last?.compra?.id || ''
      };
    }).sort((a,b) => String(a.descripcion).localeCompare(String(b.descripcion),'es'));
  } catch (err) {
    console.warn('[V32 catálogo cotizador]', err);
    return [];
  }
};

