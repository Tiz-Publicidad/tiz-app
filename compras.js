import './comprasIngresoCoreV1.js?v=20261103-nombres';
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
let selectedFile = null;
let currentTab = 'inicio';
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
 finally{cpMotherBusy=false;if(window.currentUser?.email===email&&window.currentPage==='compras'&&['inicio','obras','planes','controlot','alertas'].includes(currentTab))render();}
}
window.cpRefreshMother=()=>cpRefreshMother(true);
function cpMotherState(){return cpMotherError?'<p role="alert" style="color:var(--amber)">No se pudo actualizar TIZ 2026: '+esc(cpMotherError)+'. Se conserva la última lectura.</p>':cpMotherBusy?'<p class="cp-sub">Actualizando TIZ 2026…</p>':'';}
function renderObrasCompras(el){
 const works=cpWorks();el.innerHTML=`<div class="cp-panel"><div class="cp-actions" style="justify-content:space-between"><div><b>Obras a gestionar en Compras</b><p class="cp-sub">Pendiente y Cobrado pendiente de TIZ 2026, más las obras nuevas de la app. Anticipo y saldo se agrupan por OT.</p></div><button class="cp-btn" onclick="cpRefreshMother()" ${cpMotherBusy?'disabled':''}>Actualizar desde TIZ 2026</button></div>${cpMotherState()}</div><p class="cp-sub">${works.length} obras · Actualización automática · OT de mayor a menor</p><div class="cp-table-wrap"><table class="cp-table" style="min-width:850px"><thead><tr><th>OT</th><th>Cliente / trabajo</th><th>Estado</th><th>Insumos</th><th></th></tr></thead><tbody>${works.map(w=>`<tr><td><b>${esc(w.ot||'Sin OT')}</b></td><td><b>${esc(w.cliente||'—')}</b><div class="cp-sub">${esc(w.desc||'—')}</div><small>${w.comprasFuenteMadre?'TIZ 2026 · filas '+w.comprasFilasMadre.join(', '):'Obra nueva de la app'}</small></td><td>${esc(w.estado||'Pendiente')}</td><td>${pctChecks(ANALISIS_CHECKS,analysisFor(w))}%</td><td><button class="cp-btn primary" data-cp-source="${esc(w.id)}">Control de insumos</button></td></tr>`).join('')||'<tr><td colspan="5">No hay obras para gestionar.</td></tr>'}</tbody></table></div>`;
 el.querySelectorAll('[data-cp-source]').forEach(button=>button.onclick=()=>{const work=cpFindWork(button.dataset.cpSource);window.cpOTSearch=work?.ot||work?.cliente||'';window.cpOTFilter='todas';window.cpTab('controlot');});
}

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
const familyOptions=()=>uniqueSorted([...Object.keys(TIZ_FAMILIAS),...C.articulos.map(a=>a.familia),...CATALOGO_TIZ_BASE.map(a=>a.familia)].filter(Boolean));
const subfamilyOptions=family=>uniqueSorted([...(TIZ_FAMILIAS[family]||[]),...C.articulos.filter(a=>a.familia===family).map(a=>a.subfamilia)].filter(Boolean));
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
    <div class="cp-head"><div><div class="cp-title">Compras, Contrataciones y Proveedores</div><div class="cp-sub">Compras por ítem, deudas, pagos, proveedores, servicios contratados, stock y ayudamemorias.</div></div><div class="cp-actions"><button class="cp-btn" id="cp-resume-ingreso" hidden onclick="cpResumeIngreso()">Retomar compra en curso</button><button class="cp-btn" onclick="cpOpenConfigIA()">⚙ IA comprobantes</button><button class="cp-btn primary" onclick="cpNuevaCompra()">＋ Nueva compra</button></div></div>
    <div class="cp-tabs">
      <button class="cp-tab active" data-tab="inicio">Dashboard</button><button class="cp-tab" data-tab="obras">Obras a gestionar</button><button class="cp-tab" data-tab="compras">Compras</button><button class="cp-tab" data-tab="historico">Histórico materiales</button><button class="cp-tab" data-tab="contrataciones">Contrataciones</button><button class="cp-tab" data-tab="proveedores">Proveedores</button><button class="cp-tab" data-tab="pagos">Deudas y previsiones</button><button class="cp-tab" data-tab="conteo">Stock / conteo</button><button class="cp-tab" data-tab="base-datos">Base de datos</button><button class="cp-tab" data-tab="articulos">Artículos</button><button class="cp-tab" data-tab="planes">Materiales por OT</button><button class="cp-tab" data-tab="controlot">Control OT</button><button class="cp-tab" data-tab="alertas">Alertas</button><button class="cp-tab" data-tab="migracion">Migración Excel</button>
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
      <div class="cp-field"><label>Medio de pago</label><select id="cp-medio"><option>Transferencia</option><option>Efectivo</option><option>Tarjeta</option><option>Cheque</option><option>Cuenta corriente</option><option>Otro</option></select></div>
      <div class="cp-field"><label>Vencimiento general</label><input id="cp-vencimiento" type="date"></div>
      <div class="cp-field"><label>Condición de pago</label><select id="cp-condicion"><option value="contado">Contado</option><option value="cuenta_corriente">Cuenta corriente</option><option value="cheques">Cheques</option><option value="cuotas">Cuotas / tarjeta</option><option value="otro">Otro</option></select></div>
      <div class="cp-field"><label>Cantidad de pagos</label><input id="cp-cuotas" type="number" min="1" max="36" value="1"></div>
      <div class="cp-field"><label>Primer vencimiento</label><input id="cp-primer-venc" type="date"></div>
      <div class="cp-field"><label>Días entre pagos</label><input id="cp-dias-cuota" type="number" min="1" value="30"></div>
      <div class="cp-field"><label>N.º cheque / referencia</label><input id="cp-ref-pago" placeholder="Opcional"></div>
      <div class="cp-field"><label>Destino</label><select id="cp-destino"><option>Stock</option><option>OT</option><option>Gasto general</option><option>Vehículo</option></select></div>
      <div class="cp-field"><label>OT asociada</label><input id="cp-ot" placeholder="Ej. 1568"></div>
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
  pay.innerHTML=`<div class="cp-modal" style="max-width:760px"><div style="display:flex;justify-content:space-between"><h2>Cargar compromiso de pago</h2><button class="cp-btn" onclick="cpClosePago()">✕</button></div><div class="cp-panel"><div class="cp-row"><div class="cp-field"><label>Proveedor / beneficiario</label><input id="cp-p-proveedor"></div><div class="cp-field"><label>Concepto</label><input id="cp-p-concepto"></div><div class="cp-field"><label>Importe</label><input id="cp-p-importe" type="number" step="0.01"></div><div class="cp-field"><label>Vencimiento</label><input id="cp-p-venc" type="date"></div><div class="cp-field"><label>Medio</label><select id="cp-p-medio"><option>Cuenta corriente</option><option>Cheque</option><option>Transferencia</option><option>Tarjeta</option><option>Efectivo</option><option>Otro</option></select></div><div class="cp-field"><label>N.º cheque / referencia</label><input id="cp-p-ref"></div><div class="cp-field"><label>OT</label><input id="cp-p-ot"></div><div class="cp-field"><label>Observación</label><input id="cp-p-obs"></div></div></div><div style="text-align:right"><button class="cp-btn primary" onclick="cpSavePagoManual()">Guardar compromiso</button></div></div>`;
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
  const listen=(name,key)=>onSnapshot(['articulos','proveedores'].includes(key)?collection(db,name):query(collection(db,name),orderBy('_ts','desc'),limit(1000)),s=>{C[key]=s.docs.map(d=>({id:d.id,...d.data()}));render();cpRefreshIngreso();},()=>{
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
  ({inicio:renderInicio,obras:renderObrasCompras,compras:renderCompras,historico:renderHistoricoMateriales,contrataciones:renderContrataciones,proveedores:renderProveedores,pagos:renderPagos,migracion:renderMigracion,conteo:renderConteo,articulos:renderArticulos,'base-datos':el=>window.TIZComprasBaseDatosV1.render(el),planes:renderPlanes,controlot:renderControlOT,alertas:renderAlertas}[currentTab]||renderInicio)(el);
  if(currentTab==='inicio')el.insertAdjacentHTML('afterbegin',`<div class="cp-panel"><div class="cp-actions" style="justify-content:space-between"><div><b>${cpWorks().length} obras para Compras</b><p class="cp-sub">Pendiente / Cobrado pendiente de TIZ 2026 y obras nuevas, sin duplicar OT.</p></div><button class="cp-btn primary" onclick="cpTab('obras')">Ver obras a gestionar</button></div>${cpMotherState()}</div>`);
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
function cpRefreshUnitNotices(){
 if(!window.TIZInsumosCotizacionCoreV1)return;
 document.querySelectorAll('#cp-items-body tr').forEach(tr=>{const note=tr.querySelector('.cp-item-match');if(!note)return;let box=note.querySelector?.('.cp-stock-unit-notice');if(!box){box=document.createElement('div');box.className='cp-stock-unit-notice';note.append(box);}const data=cpStockUnitData(tr),a=C.articulos.find(a=>a.id===tr.dataset.articleId);box.replaceChildren();box.style.color=data.error?'var(--red)':'var(--text2)';const label=document.createElement('div');label.textContent=data.error|| (data.sinStock?'Servicio / sin movimiento físico de stock.':'Ingreso de stock: '+Number(data.cantidadStock).toLocaleString('es-AR')+' '+data.unidadStock+'. Se conserva la cantidad y el precio del comprobante.');box.append(label);if(data.needsUnitConfirmation){const confirm=document.createElement('button');confirm.type='button';confirm.className='cp-btn';confirm.textContent='Confirmar corrección de unidad del comprobante';confirm.onclick=()=>{tr.dataset.unitCorrectionConfirmed='1';if(cpIngreso)cpIngreso.reviewed='';calcTotals();cpRefreshIngreso();};box.append(confirm);}if(a){const button=document.createElement('button');button.type='button';button.className='cp-btn';button.textContent='Unidades y equivalencias';button.onclick=()=>window.TIZUnidadesStockV1?.open(a.id,{unidadCompra:tr.querySelector('.i-unit').value});box.append(button);}});
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

function getFilteredPurchaseItems(){const f=purchaseFilters;return purchaseItems().filter(x=>{const c=x.compra||{},date=String(c.fecha||'');if(f.period==='week'&&c.semana!==f.week)return false;if(f.period==='month'&&!date.startsWith(f.month))return false;if(f.period==='custom'&&((f.from&&date<f.from)||(f.to&&date>f.to)))return false;if(f.proveedor&&c.proveedor!==f.proveedor)return false;if(f.familia&&String(x.familia||x.rubro||'')!==f.familia)return false;if(f.subfamilia&&String(x.subfamilia||'')!==f.subfamilia)return false;if(f.fc&&c.fc!==f.fc)return false;if(f.search){const hay=normText([x.descripcionOriginal,x.descripcion,x.codigo,x.familia,x.subfamilia,c.proveedor,c.numeroComprobante,c.ot].join(' '));if(!hay.includes(normText(f.search)))return false;}return true;});}
function renderCompras(el){
  const families=uniqueSorted([...C.articulos.map(a=>a.familia),...purchaseItems().map(i=>i.familia||i.rubro)]),providers=uniqueSorted(C.compras.map(c=>c.proveedor));
  const subfamilies=uniqueSorted([...C.articulos.filter(a=>!purchaseFilters.familia||a.familia===purchaseFilters.familia).map(a=>a.subfamilia),...purchaseItems().filter(i=>!purchaseFilters.familia||(i.familia||i.rubro)===purchaseFilters.familia).map(i=>i.subfamilia)]);
  const items=getFilteredPurchaseItems(),ids=new Set(items.map(i=>i.compra.id)),filtered=C.compras.filter(c=>ids.has(c.id)).sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
  const net=items.reduce((s,i)=>s+num(i.totalNeto),0),iva=items.reduce((s,i)=>s+num(i.ivaImporte),0),gross=items.reduce((s,i)=>s+num(i.totalBruto),0),qty=items.reduce((s,i)=>s+num(i.cantidad),0);
  const periodFields=purchaseFilters.period==='week'?`<div class="cp-field"><label>Semana</label><input id="cp-f-week" value="${esc(purchaseFilters.week)}" onchange="cpFilterChanged()"></div>`:purchaseFilters.period==='month'?`<div class="cp-field"><label>Mes</label><input id="cp-f-month" type="month" value="${esc(purchaseFilters.month)}" onchange="cpFilterChanged()"></div>`:purchaseFilters.period==='custom'?`<div class="cp-field"><label>Desde</label><input id="cp-f-from" type="date" value="${esc(purchaseFilters.from)}" onchange="cpFilterChanged()"></div><div class="cp-field"><label>Hasta</label><input id="cp-f-to" type="date" value="${esc(purchaseFilters.to)}" onchange="cpFilterChanged()"></div>`:'';
  const rows=filtered.map(c=>{const matched=items.filter(i=>i.compra.id===c.id),labels=matched.slice(0,3).map(i=>`<div title="${esc(i.descripcionOriginal||i.descripcion)}"><b>${esc(i.codigo||'')}</b> ${esc(i.descripcion||i.descripcionOriginal||'')}</div>`).join('');return `<tr><td>${fmtDate(c.fecha)}</td><td><b>${esc(c.proveedor|| (c.proveedorPendiente?'A completar':''))}</b></td><td><span class="cp-pill ${c.fc==='si'?'yes':'no'}">${c.fc==='si'?'Sí':'No'}</span></td><td>${esc(c.tipoComprobante||'')}</td><td>${esc(c.numeroComprobante||'')}</td><td>${labels}${matched.length>3?`<div class="cp-sub">+${matched.length-3} ítems</div>`:''}</td><td>${money(matched.reduce((s,i)=>s+num(i.totalNeto),0))}</td><td>${money(matched.reduce((s,i)=>s+num(i.ivaImporte),0))}</td><td><b>${money(matched.reduce((s,i)=>s+num(i.totalBruto),0))}</b></td><td>${esc(c.ot||'—')}</td><td><button class="cp-btn" onclick="cpEditCompra('${c.id}')">Editar</button> <button class="cp-btn danger" onclick="cpDeleteCompra('${c.id}')">Borrar</button></td></tr>`;}).join('');
  el.innerHTML=`<div class="cp-panel"><div class="cp-actions" style="justify-content:space-between"><div class="cp-actions"><button class="cp-btn primary" onclick="cpNuevaCompra()">＋ Nueva compra</button><button class="cp-btn" onclick="cpExportCSV(true)">⬇ Exportar filtrado</button></div><button class="cp-btn" onclick="cpClearFilters()">Limpiar filtros</button></div><div class="cp-filter-grid" style="margin-top:12px"><div class="cp-field"><label>Período</label><select id="cp-f-period" onchange="cpFilterPeriod(this.value)"><option value="all" ${purchaseFilters.period==='all'?'selected':''}>Todo</option><option value="week" ${purchaseFilters.period==='week'?'selected':''}>Semana</option><option value="month" ${purchaseFilters.period==='month'?'selected':''}>Mes</option><option value="custom" ${purchaseFilters.period==='custom'?'selected':''}>Rango</option></select></div>${periodFields}<div class="cp-field"><label>Búsqueda rápida de ítem</label><input id="cp-f-search" value="${esc(purchaseFilters.search)}" placeholder="Código, caño 20x20, chapa…" oninput="cpFilterDebounced(this.value)"></div><div class="cp-field"><label>Proveedor</label><select id="cp-f-provider" onchange="cpFilterChanged()"><option value="">Todos</option>${providers.map(v=>`<option ${purchaseFilters.proveedor===v?'selected':''}>${esc(v)}</option>`).join('')}</select></div><div class="cp-field"><label>Familia</label><select id="cp-f-family" onchange="cpFilterChanged(true)"><option value="">Todas</option>${families.map(v=>`<option ${purchaseFilters.familia===v?'selected':''}>${esc(v)}</option>`).join('')}</select></div><div class="cp-field"><label>Subfamilia</label><select id="cp-f-subfamily" onchange="cpFilterChanged()"><option value="">Todas</option>${subfamilies.map(v=>`<option ${purchaseFilters.subfamilia===v?'selected':''}>${esc(v)}</option>`).join('')}</select></div><div class="cp-field"><label>Factura</label><select id="cp-f-fc" onchange="cpFilterChanged()"><option value="">Todas</option><option value="si" ${purchaseFilters.fc==='si'?'selected':''}>Con factura</option><option value="no" ${purchaseFilters.fc==='no'?'selected':''}>Sin factura</option></select></div></div><div class="cp-filter-summary"><div class="cp-card"><div class="cp-lbl">Compras</div><div class="cp-kpi">${filtered.length}</div></div><div class="cp-card"><div class="cp-lbl">Ítems</div><div class="cp-kpi">${items.length}</div><div class="cp-sub">${qty.toFixed(2)} unidades</div></div><div class="cp-card"><div class="cp-lbl">Neto filtrado</div><div class="cp-kpi" style="font-size:18px">${money(net)}</div><div class="cp-sub">IVA ${money(iva)}</div></div><div class="cp-card"><div class="cp-lbl">Total filtrado</div><div class="cp-kpi" style="font-size:18px">${money(gross)}</div></div></div></div><div class="cp-table-wrap"><table class="cp-table" style="min-width:1180px"><thead><tr><th>Fecha</th><th>Proveedor</th><th>FC</th><th>Tipo</th><th>Número</th><th>Ítems coincidentes</th><th>Neto</th><th>IVA</th><th>Total</th><th>OT</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="11">No hay compras para estos filtros.</td></tr>'}</tbody></table></div>`;
}


window.cpHistFilters=window.cpHistFilters||{year:'2026',familia:'',search:'',mode:'cantidad'};
window.cpSetHistFilter=(key,value)=>{window.cpHistFilters[key]=value;render();};
function renderHistoricoMateriales(el){
  const all=purchaseItems().filter(i=>i.compra?.fecha);
  if(!all.length){
    el.innerHTML='<div class="cp-panel"><b>Histórico de materiales</b><div class="cp-sub" style="margin-top:6px">Todavía no hay compras históricas cargadas en la base.</div><div style="margin-top:12px"><button class="cp-btn primary" onclick="cpTab(\'migracion\')">Ir a Migración Excel</button></div></div>';
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

  el.innerHTML='<div class="cp-pay-toolbar"><div><div class="cp-pay-title">Histórico de materiales por mes</div><div class="cp-sub">Filtrá por año, familia, código o descripción. Ejemplo: buscá “chapa c22” para ver cuánto se compró en cada mes.</div></div></div>'+
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
        <div class="cp-field"><label>Condición habitual</label><select id="cp-prov-cond"><option value="">A definir</option><option>Contado</option><option>Cuenta corriente</option><option>Cheque</option><option>Transferencia</option><option>Tarjeta</option><option>Cuotas</option></select></div>
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
  if(/visa|master|cabal|tarjet|credito|debito/.test(n))return {normalizado:'Tarjeta',original:raw};
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
  const arts=C.articulos.filter(a=>a.control!=='sin_stock'); const last=latestCounts();
  el.innerHTML=`<div class="cp-panel"><b>Conteo físico semanal · martes</b><p class="cp-sub">El conteo físico se realiza todos los martes. Solo se informa lo que queda. El ERP calcula consumo real: stock inicial + compras − stock final y lo compara contra materiales reservados por OT.</p><div class="cp-row"><div class="cp-field"><label>Semana</label><input id="cp-count-week" value="${weekKey()}"></div><div class="cp-field"><label>Fecha de cierre</label><input id="cp-count-date" type="date" value="${todayISO()}"></div></div></div>
  <div class="cp-table-wrap"><table class="cp-table" style="min-width:720px"><thead><tr><th>Artículo</th><th>Tipo</th><th>Último conteo</th><th>Compras desde conteo</th><th>Planificado OT</th><th>Conteo actual</th><th>Consumo calculado</th></tr></thead><tbody>${arts.map(a=>countRow(a,last[a.id]||last[a.descripcion])).join('')||'<tr><td colspan="7">Primero cargá artículos controlados.</td></tr>'}</tbody></table></div><div style="margin-top:12px;text-align:right"><button class="cp-btn primary" onclick="cpSaveConteo()">Confirmar conteo semanal</button></div>`;
}
function countRow(a,prev){
 const view=cpStockArticle(a),since=prev?.conteo?.fecha||'0000-00-00';let ini=0,bought=0,plan=0,issue='';
 try{if(prev)ini=cpStockAmount(prev,a);for(const i of purchaseItems().filter(i=>i.articuloId===a.id&&String(i.compra.fecha||'')>since&&normText(i.compra.destino)==='stock'))bought+=cpStockAmount(i,a);for(const i of C.planes.filter(p=>p.estado!=='cerrado').flatMap(p=>p.items||[]).filter(i=>i.articuloId===a.id))plan+=cpStockAmount(i,a,i.cantidadPlanificada??i.cantidadSugerida);}catch(e){issue=e.message;}
 return `<tr data-count-row data-id="${a.id}" data-desc="${esc(a.descripcion)}" data-unit="${esc(view.unidad)}" data-inicial="${ini}" data-compras="${bought}" data-plan="${plan}" data-unit-error="${esc(issue)}" data-primer-conteo="${prev?'0':'1'}"><td><b>${esc(a.descripcion)}</b><div class="cp-sub">${esc(view.unidad)} · compra: ${esc(a.unidad)}${issue?' · '+esc(issue):''}</div></td><td>${esc(a.control||'')}</td><td>${prev?ini:'Sin conteo'}</td><td>+${bought}</td><td>${plan}</td><td><input class="cp-count-input" type="number" min="0" step="0.01" style="width:95px" oninput="cpCalcCountRow(this)"></td><td class="cp-consumo">—</td></tr>`;
}

function renderArticulos(el){const families=familyOptions();el.innerHTML=`<div class="cp-panel"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><b>Catálogo maestro de artículos</b><p class="cp-sub">Código + descripción normalizada + familia + subfamilia. Escribí para buscar o elegí una sugerencia.</p></div><button class="cp-btn" onclick="cpImportCatalogoBase()">Importar base TIZ (${CATALOGO_TIZ_BASE.length})</button></div><div class="cp-row" style="margin-top:10px"><div class="cp-field"><label>Código</label><input id="cp-a-code" placeholder="000332"></div><div class="cp-field"><label>Descripción normalizada</label><input id="cp-a-desc"></div><div class="cp-field"><label>Unidad</label><input id="cp-a-unit" list="cp-unit-list"><datalist id="cp-unit-list"><option value="UNID"><option value="MTS"><option value="M2"><option value="LTS"><option value="KG"><option value="PLACA"><option value="ROLLO"><option value="SERVICIO"></datalist></div><div class="cp-field"><label>Familia</label><input id="cp-a-family" list="cp-family-list" oninput="cpArticleFamilyChanged()" onchange="cpArticleFamilyChanged()" placeholder="Ej.: Hierros"></div><div class="cp-field"><label>Subfamilia</label><input id="cp-a-subfamily" list="cp-subfamily-list" placeholder="Elegí primero la familia"></div><div class="cp-field"><label>Control</label><select id="cp-a-control"><option value="estrategico">Estratégico por OT</option><option value="consumible">Consumible por conteo</option><option value="sin_stock">Servicio / sin stock</option></select></div><div class="cp-field"><label>Stock mínimo</label><input id="cp-a-min" type="number" step="0.01"></div></div><datalist id="cp-family-list">${families.map(v=>`<option value="${esc(v)}"></option>`).join('')}</datalist><datalist id="cp-subfamily-list"></datalist><div style="margin-top:9px"><button class="cp-btn primary" onclick="cpAddArticulo()">Agregar artículo</button></div></div><div class="cp-panel"><div class="cp-row"><div class="cp-field"><label>Buscar catálogo</label><input id="cp-art-search" placeholder="Código o descripción" oninput="cpRenderArticleRows()"></div><div class="cp-field"><label>Familia</label><select id="cp-art-family" onchange="cpRenderArticleRows()"><option value="">Todas</option>${families.map(v=>`<option>${esc(v)}</option>`).join('')}</select></div></div></div><div class="cp-table-wrap"><table class="cp-table" style="min-width:1050px"><thead><tr><th>Código</th><th>Artículo</th><th>Familia</th><th>Subfamilia</th><th>Unidad de control</th><th>Control</th><th>Mínimo</th><th>Costo / unidad de control</th><th>Stock disponible</th><th></th></tr></thead><tbody id="cp-art-rows"></tbody></table></div>`;cpArticleFamilyChanged();cpRenderArticleRows();}
function cpQuoteItemsForWork(o){
  const raw=Array.isArray(o?.itemsTecnicos)&&o.itemsTecnicos.length?o.itemsTecnicos:(Array.isArray(o?.itemsCotizados)?o.itemsCotizados:[]);
  return raw.map(i=>String(i?.articulo||i?.descripcion||i?.desc||'').trim()).filter(Boolean);
}
function cpPlanForWork(o){return C.planes.find(p=>p.obraId===o.id||window.TIZComprasObrasCoreV1.same(p.ot,o.ot||o.nro));}
function cpPendingExplosionWorks(){return cpWorks().filter(o=>!cpPlanForWork(o));}
function renderPlanes(el){
  const obras=cpWorks();
  const pending=obras.filter(o=>!cpPlanForWork(o));
  const pendingRows=pending.map(o=>{
    const qi=cpQuoteItemsForWork(o);
    return `<tr><td><b>OT ${esc(o.ot||o.nro||'—')}</b><span data-ap-drive-ot="${esc(o.ot||o.nro)}" data-ap-drive-id="${esc(o.id)}"></span></td><td><b>${esc(o.cliente||'')}</b><div class="cp-sub">${esc(o.desc||o.descripcion||'')}</div></td><td>${qi.length?qi.slice(0,4).map(esc).join(' · '):'Sin ítems técnicos cargados'}</td><td><span class="cp-pill warn">Pendiente</span></td><td><button class="cp-btn primary" onclick="cpExplodeObra('${o.id}')">Hacer explosión</button></td></tr>`;
  }).join('');
  el.innerHTML=`<div class="cp-pay-toolbar"><div><div class="cp-pay-title">Materiales por OT · explosión</div><div class="cp-sub">Toda obra nueva aparece automáticamente desde Ventas / Presupuestos. Caro descompone los materiales específicos; los consumibles genéricos se controlan por stock mínimo.</div></div></div>
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

window.cpTab=t=>{currentTab=t;document.querySelectorAll('.cp-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));render();};
window.cpNuevaCompra=()=>{compraEditId=null;selectedFile=null;document.getElementById('cp-modal-compra').classList.add('open');const file=document.getElementById('cp-file');if(file)file.value='';['cp-proveedor','cp-numero','cp-ot','cp-obs','cp-vencimiento','cp-primer-venc','cp-ref-pago'].forEach(id=>document.getElementById(id).value='');document.getElementById('cp-fecha').value=todayISO();document.getElementById('cp-fc').value='si';document.getElementById('cp-tipo').value='Factura A';document.getElementById('cp-condicion').value='contado';document.getElementById('cp-cuotas').value=1;document.getElementById('cp-dias-cuota').value=30;document.getElementById('cp-items-body').innerHTML='';cpAddItem();syncFC();calcTotals();};
window.cpCloseCompra=()=>{ if(aiCleanupActive) aiCleanupActive('cancelled'); document.getElementById('cp-modal-compra').classList.remove('open'); };
function refreshCatalogDatalist(){const dl=document.getElementById('cp-catalog-list');if(!dl)return;dl.innerHTML=C.articulos.map(a=>`<option value="${esc(a.descripcion)}">${esc(a.codigo||'')} · ${esc(a.familia||'')}${a.subfamilia?' / '+esc(a.subfamilia):''}</option>`).join('');}
function applyArticleToRow(tr,a,score=1){if(!tr||!a)return;tr.dataset.articleId=a.id||'';tr.querySelector('.i-desc').value=a.descripcion||'';tr.querySelector('.i-code').value=a.codigo||'';tr.querySelector('.i-family').value=a.familia||a.rubro||'';tr.querySelector('.i-subfamily').value=a.subfamilia||'';if(!tr.querySelector('.i-unit').value&&a.unidad)tr.querySelector('.i-unit').value=a.unidadCompraPreferida||a.unidad;const note=tr.querySelector('.cp-item-match');note.textContent=`Vinculado: ${a.codigo||'s/c'} · ${Math.round(score*100)}%`;note.className='cp-item-match cp-match-ok';}
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
window.cpAddItem=(data={})=>{refreshCatalogDatalist();const original=data.descripcionOriginal||data.descripcion||'';const tr=document.createElement('tr');tr.dataset.articleId=data.articuloId||'';tr.innerHTML=`<td><textarea class="i-original cp-original" title="Descripción exacta leída de la factura">${esc(original)}</textarea></td><td><input class="i-desc" list="cp-catalog-list" value="${esc(data.descripcion||original)}" placeholder="Elegir artículo TIZ"><div class="cp-item-match">Sin vincular al catálogo</div></td><td><input class="i-code" value="${esc(data.codigo||'')}"></td><td><input class="i-family" value="${esc(data.familia||data.rubro||'')}"></td><td><input class="i-subfamily" value="${esc(data.subfamilia||'')}"></td><td><input class="i-qty" type="number" step="0.01" value="${data.cantidad??1}"></td><td><select class="i-unit" aria-label="Unidad del comprobante">${cpPurchaseUnitOptions(data.unidad)}</select></td><td><input class="i-price" type="number" step="0.01" value="${data.precioUnitarioNeto??0}"></td><td><input class="i-iva" type="number" step="0.01" value="${data.ivaPorcentaje??21}"></td><td class="i-total">${money(0)}</td><td><button class="cp-btn danger" onclick="this.closest('tr').remove();cpCalcTotals()">✕</button></td>`;attachFamilySuggestions(tr);tr.querySelectorAll('input,textarea,select').forEach(i=>i.addEventListener('input',calcTotals));tr.querySelector('.i-desc').addEventListener('change',()=>matchRowArticle(tr,true));tr.querySelector('.i-price').addEventListener('blur',()=>checkRowPrice(tr));tr.querySelector('.i-desc').addEventListener('change',()=>setTimeout(()=>checkRowPrice(tr),0));document.getElementById('cp-items-body').appendChild(tr);const linked=data.articuloId&&C.articulos.find(a=>a.id===data.articuloId);if(linked)applyArticleToRow(tr,linked,1);else matchRowArticle(tr,false);calcTotals();};
window.cpCalcTotals=()=>calcTotals();
function rowToItem(tr){const q=num(tr.querySelector('.i-qty').value),p=num(tr.querySelector('.i-price').value),iva=num(tr.querySelector('.i-iva').value),net=q*p;const item={articuloId:tr.dataset.articleId||'',descripcionOriginal:tr.querySelector('.i-original').value.trim(),descripcion:tr.querySelector('.i-desc').value.trim(),codigo:tr.querySelector('.i-code').value.trim(),familia:tr.querySelector('.i-family').value.trim(),subfamilia:tr.querySelector('.i-subfamily').value.trim(),rubro:tr.querySelector('.i-family').value.trim(),cantidad:q,unidad:tr.querySelector('.i-unit').value.trim(),unidadComprobanteOriginal:tr.dataset.unidadComprobanteOriginal||tr.querySelector('.i-unit').value.trim(),precioUnitarioNeto:p,ivaPorcentaje:iva,totalNeto:net,ivaImporte:net*iva/100,totalBruto:net*(1+iva/100)};const stock=typeof cpStockUnitData==='function'?cpStockUnitData(tr):null;return stock?{...item,...(stock.error?{errorUnidadStock:stock.error}:stock)}:item;}
function getItems(){return [...document.querySelectorAll('#cp-items-body tr')].map(rowToItem).filter(i=>i.descripcion);}
function calcTotals(){
  const rows=[...document.querySelectorAll('#cp-items-body tr')];
  rows.forEach(tr=>{const i=rowToItem(tr);tr.querySelector('.i-total').textContent=money(i.totalBruto);});
  const items=rows.map(rowToItem).filter(i=>i.descripcion),net=items.reduce((s,i)=>s+i.totalNeto,0),iva=items.reduce((s,i)=>s+i.ivaImporte,0);
  const el=document.getElementById('cp-totales');if(el)el.textContent=`Neto ${money(net)} · IVA ${money(iva)} · TOTAL ${money(net+iva)}`;
}
window.cpGuardarCompra=async()=>{
  const items=getItems(); if(!items.length)return toast('Agregá al menos un ítem.'); const fc=document.getElementById('cp-fc').value; const data={fecha:document.getElementById('cp-fecha').value,semana:weekKey(new Date(document.getElementById('cp-fecha').value+'T12:00:00')),proveedor:document.getElementById('cp-proveedor').value.trim(),fc,tipoComprobante:fc==='si'?document.getElementById('cp-tipo').value:'Sin comprobante',numeroComprobante:document.getElementById('cp-numero').value.trim(),medioPago:document.getElementById('cp-medio').value,vencimiento:document.getElementById('cp-vencimiento').value,condicionPago:document.getElementById('cp-condicion').value,cantidadPagos:Math.max(1,num(document.getElementById('cp-cuotas').value)),primerVencimiento:document.getElementById('cp-primer-venc').value,diasEntrePagos:Math.max(1,num(document.getElementById('cp-dias-cuota').value)||30),referenciaPago:document.getElementById('cp-ref-pago').value.trim(),destino:document.getElementById('cp-destino').value,ot:document.getElementById('cp-ot').value.trim(),observacion:document.getElementById('cp-obs').value.trim(),items,totalNeto:items.reduce((s,i)=>s+i.totalNeto,0),ivaTotal:items.reduce((s,i)=>s+i.ivaImporte,0),totalBruto:items.reduce((s,i)=>s+i.totalBruto,0),usuario:window.currentUser?.email||'',_ts:serverTimestamp()};
  if(!data.proveedor)return toast('Ingresá el proveedor.');
  if(cpIngreso){data.proveedorId=cpIngreso.providerId;data.proveedorCuit=C.proveedores.find(p=>p.id===cpIngreso.providerId)?.cuit||'';data.ingresoGuiadoVersion=1;data.archivoOrigen=selectedFile?{nombre:selectedFile.name,tipo:selectedFile.type}:null;}
  let savedId=compraEditId;if(compraEditId)await updateDoc(doc(db,'compras',compraEditId),data);else{const ref=await addDoc(collection(db,'compras'),data);savedId=ref.id;compraEditId=savedId;}await cpSyncPagosCompra(savedId,data);
  cpCloseCompra();toast('Compra y previsión de pagos guardadas.');
};
window.cpEditCompra=id=>{const c=C.compras.find(x=>x.id===id);if(!c)return;cpNuevaCompra();compraEditId=id;document.getElementById('cp-fecha').value=c.fecha||todayISO();document.getElementById('cp-proveedor').value=c.proveedor||'';document.getElementById('cp-fc').value=c.fc||'si';document.getElementById('cp-tipo').value=c.tipoComprobante||'Factura A';document.getElementById('cp-numero').value=c.numeroComprobante||'';document.getElementById('cp-medio').value=c.medioPago||'Transferencia';document.getElementById('cp-vencimiento').value=c.vencimiento||'';document.getElementById('cp-condicion').value=c.condicionPago||'contado';document.getElementById('cp-cuotas').value=c.cantidadPagos||1;document.getElementById('cp-primer-venc').value=c.primerVencimiento||c.vencimiento||'';document.getElementById('cp-dias-cuota').value=c.diasEntrePagos||30;document.getElementById('cp-ref-pago').value=c.referenciaPago||'';document.getElementById('cp-destino').value=c.destino||'Stock';document.getElementById('cp-ot').value=c.ot||'';document.getElementById('cp-obs').value=c.observacion||'';document.getElementById('cp-items-body').innerHTML='';(c.items||[]).forEach(cpAddItem);syncFC();calcTotals();};
window.cpDeleteCompra=async id=>{if(confirm('¿Borrar esta compra y sus pagos pendientes?')){for(const p of C.pagos.filter(x=>x.compraId===id&&x.estado!=='pagado'))await deleteDoc(doc(db,'pagosCompra',p.id));await deleteDoc(doc(db,'compras',id));}};
window.cpAddArticulo=async()=>{const descripcion=document.getElementById('cp-a-desc').value.trim();if(!descripcion)return toast('Ingresá una descripción.');const codigo=document.getElementById('cp-a-code').value.trim();if(codigo&&C.articulos.some(a=>a.codigo===codigo))return toast('Ese código ya existe.');const familia=document.getElementById('cp-a-family').value.trim();const subfamilia=document.getElementById('cp-a-subfamily').value.trim();if(!familia)return toast('Elegí o escribí una familia.');await addDoc(collection(db,'articulosCompra'),{codigo,descripcion,unidad:document.getElementById('cp-a-unit').value.trim(),familia,subfamilia,control:document.getElementById('cp-a-control').value,stockMinimo:num(document.getElementById('cp-a-min').value),_ts:serverTimestamp()});toast('Artículo agregado.');};
window.cpDeleteArticulo=async id=>{if(confirm('¿Borrar artículo?'))await deleteDoc(doc(db,'articulosCompra',id));};
window.cpCalcCountRow=input=>{const tr=input.closest('tr'),final=num(input.value),cons=num(tr.dataset.inicial)+num(tr.dataset.compras)-final;tr.querySelector('.cp-consumo').textContent=tr.dataset.unitError?'Revisar unidades':tr.dataset.primerConteo==='1'?'Primer saldo':isNaN(cons)?'—':cons;};
window.cpSaveConteo=async()=>{const items=[...document.querySelectorAll('[data-count-row]')].map(tr=>{const raw=tr.querySelector('.cp-count-input').value;if(raw==='')return null;const cantidad=num(raw);return {articuloId:tr.dataset.id,descripcion:tr.dataset.desc,cantidad,unidad:tr.dataset.unit,stockInicial:num(tr.dataset.inicial),comprasPeriodo:num(tr.dataset.compras),planificadoOT:num(tr.dataset.plan),consumoReal:tr.dataset.unitError||tr.dataset.primerConteo==='1'?null:num(tr.dataset.inicial)+num(tr.dataset.compras)-cantidad,errorUnidadStock:tr.dataset.unitError||''};}).filter(Boolean);if(!items.length)return toast('Ingresá al menos un conteo.');if(items.some(i=>!Number.isFinite(i.cantidad)||i.cantidad<0))return toast('El conteo debe ser una cantidad válida, cero o mayor.');await addDoc(collection(db,'conteosStock'),{semana:document.getElementById('cp-count-week').value,fecha:document.getElementById('cp-count-date').value,items,usuario:window.currentUser?.email||'',_ts:serverTimestamp()});toast('Conteo guardado. Consumos calculados automáticamente.');};
window.cpExplodeObra=async obraId=>{
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
window.cpExportCSV=(filtered=false)=>{const h=['Fecha','Semana','Proveedor','FC','Tipo FC','Nro FC','Código','Descripción factura','Artículo TIZ','Familia','Subfamilia','Cantidad','Unidad','P.Unit.Neto','Total Neto','IVA','Total Bruto','Medio Pago','Vencimiento','Destino','OT'];const base=filtered?getFilteredPurchaseItems():purchaseItems();const rows=base.map(i=>{const c=i.compra||{};return[c.fecha,c.semana,c.proveedor,c.fc,c.tipoComprobante,c.numeroComprobante,i.codigo,i.descripcionOriginal,i.descripcion,i.familia||i.rubro,i.subfamilia,i.cantidad,i.unidad,i.precioUnitarioNeto,i.totalNeto,i.ivaImporte,i.totalBruto,c.medioPago,c.vencimiento,c.destino,c.ot]});const csv=[h,...rows].map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv'}));a.download=filtered?'compras_filtradas.csv':'compras_detalladas.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};

let cpFilterTimer=null;
window.cpFilterPeriod=value=>{purchaseFilters.period=value;render();};window.cpFilterDebounced=value=>{clearTimeout(cpFilterTimer);purchaseFilters.search=value;cpFilterTimer=setTimeout(render,250);};window.cpFilterChanged=familyChanged=>{const val=id=>document.getElementById(id)?.value||'';purchaseFilters.week=val('cp-f-week')||purchaseFilters.week;purchaseFilters.month=val('cp-f-month')||purchaseFilters.month;purchaseFilters.from=val('cp-f-from');purchaseFilters.to=val('cp-f-to');purchaseFilters.proveedor=val('cp-f-provider');purchaseFilters.familia=val('cp-f-family');purchaseFilters.subfamilia=familyChanged?'':val('cp-f-subfamily');purchaseFilters.fc=val('cp-f-fc');render();};window.cpClearFilters=()=>{purchaseFilters={period:'month',week:weekKey(),month:todayISO().slice(0,7),from:'',to:'',search:'',proveedor:'',familia:'',subfamilia:'',fc:''};render();};
window.cpRenderArticleRows=()=>{
 const tbody=document.getElementById('cp-art-rows');if(!tbody)return;const search=normText(document.getElementById('cp-art-search')?.value||''),family=document.getElementById('cp-art-family')?.value||'',list=C.articulos.filter(a=>(!family||a.familia===family)&&(!search||normText([a.codigo,a.descripcion,a.familia,a.subfamilia].join(' ')).includes(search)));
 tbody.innerHTML=list.map(a=>{const m=cpStockMeta(a)||{},u=m.unidad||a.unidad;return `<tr><td><b>${esc(a.codigo||'—')}</b></td><td><b>${esc(a.descripcion)}</b></td><td>${esc(a.familia||'')}</td><td>${esc(a.subfamilia||'')}</td><td><b>${esc(u)}</b><div class="cp-sub">Compra: ${esc(a.unidadCompraPreferida||a.unidad)}</div></td><td>${esc(a.control||'')}</td><td>${m.stockMinimo??'—'}</td><td>${Number.isFinite(m.ultimoCosto)?money(m.ultimoCosto)+' / '+esc(u):'Precio pendiente'}</td><td>${m.stockDisponible===null||m.stockDisponible===undefined?'Sin conteo':m.stockDisponible+' '+esc(u)}</td><td><button class="cp-btn" data-edit-insumo="${esc(a.id)}">Editar</button> <button class="cp-btn" data-unit-insumo="${esc(a.id)}">Unidades</button> <button class="cp-btn danger" onclick="cpDeleteArticulo('${a.id}')">Borrar</button></td></tr>`;}).join('')||'<tr><td colspan="10">No hay artículos para este filtro.</td></tr>';
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
    ['Tarjeta de crédito','▣','#ff5656',p=>String(p.medio||'').toLowerCase().includes('tarjeta')],
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
 const save=document.querySelector('[onclick="cpGuardarCompra()"]');if(save)save.disabled=!reviewed||cpIngresoSaving;
 const uiKey=JSON.stringify([cpIngreso.confirmed,cpIngreso.providerId,cpIngreso.supplier.nombre,cpIngreso.supplier.cuit,resolved,rows.length,reviewed,C.proveedores.map(p=>[p.id,p.nombre,p.cuit,p.domicilio,p.contacto,p.telefono,p.email,p.contactos])]);
 if(cpIngreso.uiKey===uiKey)return;cpIngreso.uiKey=uiKey;
 box.replaceChildren();const heading=document.createElement('b');heading.textContent='1. Proveedor → 2. Insumos → 3. Revisar y guardar';box.append(heading);
 const status=document.createElement('p');status.className='cp-sub';box.append(status);
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
 if(duplicate)…23333 tokens truncated… </div>
      <div class="form-group"><label>Semana</label><input id="f-semana" type="number" placeholder="22"></div>
      <div class="form-group"><label>Precio de venta (neto)</label><input id="f-neto" type="number" placeholder="0"></div>
      <div class="form-group"><label>Precio de venta (bruto)</label><input id="f-bruto" type="number" placeholder="0"></div>
      <div class="form-group"><label>Gastos</label><input id="f-gastos" type="number" placeholder="0"></div>
      <div class="form-section">Ítems cotizados</div>
      <div class="form-group full" style="background:var(--surface2);border-radius:8px;padding:12px;gap:10px;display:flex;flex-direction:column"><p style="font-size:11px;color:var(--text3);margin:0">Una obra puede tener varios renglones con importes distintos.</p><div id="obra-items-list"></div><button type="button" class="btn btn-ghost btn-sm" onclick="addObraItem()" style="align-self:flex-start"><i class="ti ti-plus"></i> Agregar ítem</button><div style="text-align:right;font-size:13px;color:var(--accent);font-weight:600">Total ítems: <span id="obra-items-total">$0</span></div></div>
      <div class="form-section">Cálculos auxiliares / respaldo interno</div>
      <div class="form-group full" style="background:var(--surface2);border-radius:8px;padding:12px;gap:10px;display:flex;flex-direction:column"><p style="font-size:11px;color:var(--text3);margin:0">Guardá materiales, horas, colocación, tercerizados o cualquier cuenta usada para formar el precio.</p><div id="obra-calculos-list"></div><button type="button" class="btn btn-ghost btn-sm" onclick="addCalculoAux()" style="align-self:flex-start"><i class="ti ti-plus"></i> Agregar cálculo</button><div style="text-align:right;font-size:13px;color:var(--text2);font-weight:600">Total auxiliar: <span id="obra-calculos-total">$0</span></div></div>
      <div class="form-section">Producción</div>
      <div class="form-group"><label>F. compromiso prod.</label><input id="f-fprod-c" placeholder="DD/MM/AAAA"></div>
      <div class="form-group"><label>F. real prod.</label><input id="f-fprod-r" placeholder="DD/MM/AAAA"></div>
      <div class="form-section">Colocación</div>
      <div class="form-group"><label>F. compromiso col.</label><input id="f-fcol-c" placeholder="DD/MM/AAAA"></div>
      <div class="form-group"><label>F. real col.</label><input id="f-fcol-r" placeholder="DD/MM/AAAA"></div>
      <div class="form-section">Facturación</div>
      <div class="form-group"><label>OC / OP</label><input id="f-oc" placeholder="Nro orden de compra"></div>
      <div class="form-group"><label>Nro factura</label><input id="f-nrfc" placeholder="Nro factura"></div>
      <div class="form-group"><label>F. factura</label><input id="f-ffc" placeholder="DD/MM/AAAA" oninput="calcFechaVencimiento()"></div>
      <div class="form-group"><label>Estado cobranza</label>
        <select id="f-cobr"><option>Pendiente</option><option>Entregado</option><option>Facturado</option><option>Cobrado</option></select>
      </div>
      <div class="form-group"><label>Días de pago acordados</label>
        <input id="f-dias-pago" type="number" placeholder="Ej: 30" oninput="calcFechaVencimiento()">
      </div>
      <div class="form-group" style="justify-content:flex-end">
        <label>Fecha de vencimiento</label>
        <span id="f-venc-calculada" style="font-size:12px;font-weight:500;padding-top:4px"></span>
      </div>
      <div class="form-group full"><label>Comentarios generales</label><textarea id="f-comentarios"></textarea></div>
      <div class="form-section">Checklist de liberación / control</div>
      <div class="form-group full">
        <div class="checklist-grid" id="checklist-v58">
          <label class="check-item"><input type="checkbox" data-check="clienteConfirmado"> Cliente confirmado</label>
          <label class="check-item"><input type="checkbox" data-check="ocCargada"> OC / OP cargada</label>
          <label class="check-item"><input type="checkbox" data-check="senaRecibida"> Seña recibida</label>
          <label class="check-item"><input type="checkbox" data-check="disenoAprobado"> Diseño aprobado</label>
          <label class="check-item"><input type="checkbox" data-check="materialesCompletos"> Materiales completos</label>
          <label class="check-item"><input type="checkbox" data-check="produccionTerminada"> Producción terminada</label>
          <label class="check-item"><input type="checkbox" data-check="colocacionCoordinada"> Colocación coordinada</label>
          <label class="check-item"><input type="checkbox" data-check="fotosFinales"> Fotos finales cargadas</label>
          <label class="check-item"><input type="checkbox" data-check="facturado"> Facturado</label>
          <label class="check-item"><input type="checkbox" data-check="cobrado"> Cobrado</label>
        </div>
      </div>
      <div class="form-section">Anotaciones por sector</div>
      <div class="form-group full" style="background:var(--surface2);border-radius:8px;padding:12px;gap:10px;display:flex;flex-direction:column">
        <p style="font-size:11px;color:var(--text3);margin:0">Cada sector puede escribir sus propias notas. Se guarda con fecha y hora automáticamente.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <label style="color:var(--blue);margin:0">📦 Producción <span id="nota-ts-produccion" style="font-size:10px;color:var(--text3);font-weight:400"></span></label>
              <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 7px" onclick="crearTareaDesdeNota('Producción')">📅 Tarea</button>
            </div>
            <textarea id="nota-produccion" placeholder="Notas del sector Producción..." style="min-height:60px"></textarea>
          </div>
          <div class="form-group">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <label style="color:var(--teal);margin:0">🚛 Colocaciones <span id="nota-ts-colocaciones" style="font-size:10px;color:var(--text3);font-weight:400"></span></label>
              <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 7px" onclick="crearTareaDesdeNota('Colocaciones')">📅 Tarea</button>
            </div>
            <textarea id="nota-colocaciones" placeholder="Notas del sector Colocaciones..." style="min-height:60px"></textarea>
          </div>
          <div class="form-group">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <label style="color:var(--purple);margin:0">✏️ Diseño <span id="nota-ts-diseno" style="font-size:10px;color:var(--text3);font-weight:400"></span></label>
              <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 7px" onclick="crearTareaDesdeNota('Diseño')">📅 Tarea</button>
            </div>
            <textarea id="nota-diseno" placeholder="Notas del sector Diseño..." style="min-height:60px"></textarea>
          </div>
          <div class="form-group">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <label style="color:var(--amber);margin:0">💰 Ventas <span id="nota-ts-ventas" style="font-size:10px;color:var(--text3);font-weight:400"></span></label>
              <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 7px" onclick="crearTareaDesdeNota('Ventas')">📅 Tarea</button>
            </div>
            <textarea id="nota-ventas" placeholder="Notas del sector Ventas..." style="min-height:60px"></textarea>
          </div>
          <div class="form-group">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <label style="color:var(--accent);margin:0">🛒 Compras <span id="nota-ts-compras" style="font-size:10px;color:var(--text3);font-weight:400"></span></label>
              <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 7px" onclick="crearTareaDesdeNota('Compras')">📅 Tarea</button>
            </div>
            <textarea id="nota-compras" placeholder="Notas del sector Compras..." style="min-height:60px"></textarea>
          </div>
          <div class="form-group"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px"><label style="color:var(--green);margin:0">✅ Calidad <span id="nota-ts-calidad" style="font-size:10px"></span></label><button type="button" class="btn btn-ghost btn-sm" onclick="crearTareaDesdeNota('Calidad')">📅 Tarea</button></div><textarea id="nota-calidad" placeholder="Notas del sector Calidad..." style="min-height:60px"></textarea></div>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('obra')">Cancelar</button>
      <button class="btn btn-ghost" onclick="abrirPresupuestoPDF()" style="color:var(--accent);border-color:var(--accent)"><i class="ti ti-file-invoice"></i> Generar presupuesto</button>
      <button class="btn btn-ghost" onclick="exportarDatosFacturaActual()" title="Descarga datos listos para facturación"><i class="ti ti-receipt"></i> Datos factura</button>
      <button class="btn btn-primary" onclick="saveObra()">Guardar</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modal-prespdf" style="padding:20px">
  <div class="modal" style="max-width:1120px;width:calc(100vw - 80px);max-height:90vh;overflow-y:auto">
    <div class="modal-title">Generar presupuesto</div>
    <div class="form-grid">
      <div class="form-group"><label>Nro presupuesto</label><input id="pp-nro" oninput="actualizarIdentificacionCotizacionV354()" placeholder="0001"></div>
      <div class="form-group"><label>Validez (días)</label><input id="pp-validez" type="number" value="7"></div>
      <div class="form-group full" style="position:relative">
        <label>Cliente</label>
        <input id="pp-cliente" placeholder="Escribí para buscar..." autocomplete="off" oninput="sugerirClientesPP(this.value,false)" onfocus="sugerirClientesPP(this.value,true)" onblur="setTimeout(()=>cerrarSugerenciasPP(),200)">
        <div id="pp-clientes-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--surface3);border:1px solid var(--border2);border-radius:var(--border-radius-md);z-index:300;max-height:160px;overflow-y:auto;margin-top:2px"></div>
      </div>
      <div class="form-group full"><label>Descripción general del presupuesto</label>
        <input id="pp-desc" placeholder="Ej: Cartelería interna y externa sucursal Florida 441">
      </div>
      <div class="form-group full" id="pp-ayudamemoria-wrap">
        <label>Ayudamemoria de cotización</label>
        <div id="pp-ayudamemoria" style="background:rgba(232,184,75,.07);border:1px solid var(--border2);border-radius:10px;padding:12px;font-size:11px;color:var(--text2)"></div>
      </div>
      <div class="form-group"><label>Revisión</label>
        <input id="pp-revision" value="1.1" readonly style="font-family:'DM Mono',monospace;font-weight:700">
      </div>
      <div class="form-group"><label>Identificación</label>
        <input id="pp-identificacion" value="CT 0000000 1.1" readonly style="font-family:'DM Mono',monospace;color:var(--accent)">
      </div>
      <div class="form-group full"><label>Nota al pie</label>
        <input id="pp-nota" value="Los precios cotizados se encuentran a valores netos">
      </div>
      <div class="form-group full"><label>Condición de compra</label>
        <input id="pp-condicion" value="Anticipo 50% Saldo a contraentrega">
      </div>
    </div>
    <div style="margin:14px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text3)">Ítems a cotizar</div>
    <div id="pp-items-wrap">
      <div style="display:flex;gap:6px;margin-bottom:6px;padding:0 2px">
        <span style="width:28px;flex-shrink:0;font-size:10px;color:var(--text3);text-align:center">N°</span><span style="flex:1;font-size:10px;color:var(--text3);text-transform:uppercase">Descripción del ítem</span>
        <span style="width:120px;font-size:10px;color:var(--text3);text-transform:uppercase">$ Unitario</span>
        <span style="width:65px;font-size:10px;color:var(--text3);text-transform:uppercase">Cant</span>
        <span style="width:120px;font-size:10px;color:var(--text3);text-transform:uppercase;text-align:right">Subtotal</span>
        <span style="width:32px"></span>
      </div>
      <div id="pp-items" style="max-height:280px;overflow-y:auto;padding-right:2px"></div>
    </div>
    <button class="btn btn-ghost btn-sm" onclick="addItemPP()" style="margin-top:8px"><i class="ti ti-plus"></i> Agregar ítem</button>
    <details id="pp-entrega-wrap" style="margin-top:14px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:0 12px">
      <summary style="cursor:pointer;padding:12px 0;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text2);font-weight:600">🚚 Entrega / logística <span id="pp-entrega-resumen" style="color:var(--text3);font-weight:400;text-transform:none;letter-spacing:0">— A definir</span></summary>
      <div style="padding:2px 0 12px"><div class="form-grid">
        <div class="form-group full"><label>Modalidad</label><select id="pp-entrega-tipo" onchange="actualizarEntregaLogisticaPP()"><option value="a_definir">A definir</option><option value="retiro_fabrica">Retira en fábrica</option><option value="envio">Envío a domicilio</option><option value="colocacion">Con colocación</option></select></div>
        <div class="form-group pp-entrega-domicilio" style="display:none"><label>Domicilio</label><input id="pp-entrega-domicilio" placeholder="Calle, número, localidad y referencia"></div>
        <div class="form-group pp-entrega-fecha" style="display:none"><label id="pp-entrega-fecha-label">Fecha prevista</label><input id="pp-entrega-fecha" type="date"></div>
        <div class="form-group full pp-entrega-contacto" style="display:none"><label for="pp-entrega-contacto-select">Contacto guardado del cliente</label><select id="pp-entrega-contacto-select" onchange="elegirContactoClientePP('contacto')"><option value="">Seleccionar contacto…</option><option value="__nuevo">+ Agregar contacto nuevo</option></select></div>
        <div class="form-group pp-entrega-contacto" style="display:none"><label for="pp-entrega-contacto">Contacto en destino</label><input id="pp-entrega-contacto" list="pp-entrega-contactos-list" placeholder="Nombre del contacto" oninput="sugerirContactoClientePP()"><datalist id="pp-entrega-contactos-list"></datalist><small style="color:var(--text3)">Al guardar el presupuesto, los contactos nuevos se agregan a este cliente.</small></div>
        <div class="form-group pp-entrega-contacto" style="display:none"><label>Teléfono contacto</label><input id="pp-entrega-contacto-tel" placeholder="Teléfono / WhatsApp"></div>
        <div class="form-group pp-entrega-contacto" style="display:none"><label for="pp-entrega-contacto-cargo">Cargo</label><input id="pp-entrega-contacto-cargo" placeholder="Compras, administración, recepción…"></div>
        <div class="form-group pp-entrega-contacto full" style="display:none"><label>Email contacto</label><input id="pp-entrega-contacto-email" type="email" placeholder="correo@cliente.com"></div>
        <div class="form-group full pp-entrega-retira" style="display:none"><label for="pp-entrega-retira-select">Persona guardada del cliente</label><select id="pp-entrega-retira-select" onchange="elegirContactoClientePP('retira')"><option value="">Seleccionar contacto…</option><option value="__nuevo">+ Agregar contacto nuevo</option></select></div>
        <div class="form-group pp-entrega-retira" style="display:none"><label>Persona que retira</label><input id="pp-entrega-retira" list="pp-entrega-retira-list" placeholder="Nombre del contacto" oninput="sugerirRetiraClientePP()"><datalist id="pp-entrega-retira-list"></datalist></div>
        <div class="form-group pp-entrega-retira" style="display:none"><label>Teléfono</label><input id="pp-entrega-retira-tel" placeholder="Teléfono / WhatsApp"></div>
        <div class="form-group pp-entrega-retira" style="display:none"><label for="pp-entrega-retira-cargo">Cargo</label><input id="pp-entrega-retira-cargo" placeholder="Compras, administración, recepción…"></div>
        <div class="form-group pp-entrega-retira full" style="display:none"><label>Email</label><input id="pp-entrega-retira-email" type="email" placeholder="correo@cliente.com"></div>
        <div class="form-group full pp-entrega-detalle" style="display:none"><label id="pp-entrega-detalle-label">Indicaciones adicionales</label><textarea id="pp-entrega-detalle" placeholder="Horarios, acceso, permisos, equipos necesarios u otras indicaciones"></textarea></div>
      </div><div style="font-size:11px;color:var(--text3);margin-top:4px">Esta información se comparte en la OT con Producción, Colocaciones y los demás sectores que la necesiten.</div></div>
    </details>
    <div style="margin-top:14px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:8px">
        <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text3)">Cálculos auxiliares internos</div><div style="font-size:11px;color:var(--text3);margin-top:3px">Materiales, horas, colocación, tercerizados o cualquier cálculo usado para formar el precio. No aparece en el PDF del cliente.</div></div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="addCalculoAuxPP()"><i class="ti ti-plus"></i> Agregar cálculo</button>
      </div>
      <div id="pp-calculos-list"></div>
      <div style="text-align:right;font-size:13px;color:var(--text2);font-weight:600;margin-top:8px">Total auxiliar: <span id="pp-calculos-total">$0</span></div>
    </div>
    <div style="text-align:right;margin-top:14px;padding-top:10px;border-top:1px solid var(--border);font-size:15px;font-weight:700;color:var(--accent)">
      Total cotizado: <span id="pp-total">$0</span>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-prespdf').classList.remove('open')">Cancelar</button>
      <button id="pp-btn-nueva-revision" class="btn btn-ghost" onclick="crearNuevaRevisionDesdeCotizador()" style="display:none"><i class="ti ti-copy-plus"></i> Nueva revisión</button>
      <button class="btn btn-ghost" onclick="guardarPresupuestoCompleto()" style="color:var(--accent);border-color:var(--accent)"><i class="ti ti-device-floppy"></i> Guardar presupuesto</button>
      <button class="btn btn-primary" onclick="generarPDF()"><i class="ti ti-printer"></i> Generar PDF + Excel</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modal-cliente">
  <div class="modal">
    <div class="modal-title">Nuevo cliente</div>
    <input type="hidden" id="cli-id">
    <div class="form-grid">
      <div class="form-group"><label>N° cliente</label><input id="fc-numero" placeholder="Automático" readonly></div>
      <div class="form-group"><label>Nombre / Razón social</label><input id="fc-nombre"></div>
      <div class="form-group"><label>CUIT</label><input id="fc-cuit"></div>
      <div class="form-group"><label>Contacto</label><input id="fc-contacto" list="fc-contactos-list" oninput="sugerirContactoFichaClienteV1()"><datalist id="fc-contactos-list"></datalist></div>
      <div class="form-group"><label>Celular</label><input id="fc-cel"></div>
      <div class="form-group"><label>Cargo del contacto</label><input id="fc-cargo"></div>
      <div class="form-group full"><label>Email</label><input id="fc-email"></div>
      <div class="form-group full"><label>Otros contactos del cliente</label><textarea id="fc-contactos" rows="4" placeholder="Un contacto por línea: Nombre | teléfono | email | cargo"></textarea><small style="color:var(--text3)">Se sugieren al crear nuevos presupuestos y obras de este cliente.</small></div>
      <div class="form-group full"><label>Notas</label><textarea id="fc-notas"></textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('cliente')">Cancelar</button>
      <button class="btn btn-primary" onclick="saveCliente()">Guardar</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modal-presupuesto">
  <div class="modal">
    <div class="modal-title">Nuevo presupuesto</div>
    <input type="hidden" id="pre-id">
    <div class="form-grid">
      <div class="form-group"><label>Nro presupuesto</label><input id="fp-nro"></div>
      <div class="form-group"><label>Vendedor</label><select id="fp-vend"><option value="G">G · Giancarlo</option><option>J</option><option>G/J</option></select></div>
      <div class="form-group full"><label>Cliente</label><input id="fp-cliente"></div>
      <div class="form-group full"><label>Descripción</label><input id="fp-desc"></div>
      <div class="form-group"><label>Importe</label><input id="fp-importe" type="number"></div>
      <div class="form-group"><label>Fecha</label><input id="fp-fecha" placeholder="DD/MM/AAAA"></div>
      <div class="form-group"><label>Estado</label>
        <select id="fp-estado"><option selected>Pendiente</option><option>Enviado</option><option>Aprobado</option><option>Entregado</option><option>Cobrado pendiente</option><option>Cobrado</option></select>
      </div>
      <div class="form-group full"><label>Comentarios</label><textarea id="fp-comentarios"></textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('presupuesto')">Cancelar</button>
      <button class="btn btn-primary" onclick="savePresupuesto()">Guardar</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modal-retencion">
  <div class="modal">
    <div class="modal-title">Nueva retención</div>
    <input type="hidden" id="ret-id">
    <div class="form-grid">
      <div class="form-group"><label>Mes</label><input id="fr-mes" placeholder="Enero"></div>
      <div class="form-group"><label>Cliente</label><input id="fr-cliente"></div>
      <div class="form-group"><label>Nro factura</label><input id="fr-nrfc"></div>
      <div class="form-group"><label>Importe bruto</label><input id="fr-bruto" type="number"></div>
      <div class="form-group"><label>R. SUSS</label><input id="fr-suss" type="number" placeholder="0"></div>
      <div class="form-group"><label>R. IIBB</label><input id="fr-iibb" type="number" placeholder="0"></div>
      <div class="form-group"><label>R. Ganancias</label><input id="fr-gan" type="number" placeholder="0"></div>
      <div class="form-group"><label>R. IVA</label><input id="fr-iva" type="number" placeholder="0"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('retencion')">Cancelar</button>
      <button class="btn btn-primary" onclick="saveRetencion()">Guardar</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modal-cobranza">
  <div class="modal">
    <div class="modal-title">Registrar cobro</div>
    <input type="hidden" id="cob-id">
    <div class="form-grid">
      <div class="form-group"><label>OT</label><input id="fcob-ot"></div>
      <div class="form-group"><label>Cliente</label><input id="fcob-cliente"></div>
      <div class="form-group full"><label>Descripción</label><input id="fcob-desc"></div>
      <div class="form-group"><label>Nro factura</label><input id="fcob-nrfc"></div>
      <div class="form-group"><label>Importe</label><input id="fcob-importe" type="number"></div>
      <div class="form-group"><label>F. vencimiento</label><input id="fcob-venc" placeholder="DD/MM/AAAA"></div>
      <div class="form-group"><label>F. cobro real</label><input id="fcob-real" placeholder="DD/MM/AAAA"></div>
      <div class="form-group"><label>Estado</label>
        <select id="fcob-estado"><option>Pendiente</option><option>Cobrado</option><option>Vencido</option></select>
      </div>
      <div class="form-group full"><label>Comentarios</label><textarea id="fcob-comentarios"></textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('cobranza')">Cancelar</button>
      <button class="btn btn-primary" onclick="saveCobranza()">Guardar</button>
    </div>
  </div>
</div>

<!-- LOGIN SCREEN -->
<div id="login-screen" style="display:none;position:fixed;inset:0;background:#0f0f0f;z-index:999;align-items:center;justify-content:center;flex-direction:column;gap:20px">
  <div style="text-align:center;max-width:340px">
    <div style="font-size:32px;font-weight:700;color:#e8b84b;letter-spacing:-1px;margin-bottom:4px">TIZ</div>
    <div style="font-size:12px;color:#5a5856;text-transform:uppercase;letter-spacing:.1em;margin-bottom:40px">Gestión operativa</div>
    <button onclick="doLogin()" style="display:flex;align-items:center;gap:12px;padding:14px 24px;background:#fff;color:#1a1a1a;border:none;border-radius:10px;font-size:14px;font-weight:500;cursor:pointer;width:100%;justify-content:center">
      <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.34-8.16 2.34-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      Entrar con Google
    </button>
    <p id="login-err" style="color:#e05c5c;font-size:12px;margin-top:12px"></p>
    <p style="font-size:11px;color:#5a5856;margin-top:16px">Solo cuentas autorizadas de TIZ</p>
  </div>
</div>

<!-- MODAL TAREA -->
<div class="modal-overlay" id="modal-tarea">
  <div class="modal">
    <div class="modal-title">Nueva tarea</div>
    <input type="hidden" id="tarea-id">
    <div class="form-grid">
      <div class="form-group full">
        <label>Buscar obra</label>
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <input id="ft-buscar-ot" placeholder="Buscar por OT, descripción o cliente..." oninput="filtrarObrasModal()" style="flex:1">
          <select id="ft-filtro-estado" onchange="filtrarObrasModal()" style="width:160px">
            <option value="">Todos los estados</option>
            <option>Aprobado</option>
            <option>En producción</option>
            <option>Entregado</option>
            <option>Facturado</option>
            <option>Cobrado</option>
          </select>
        </div>
        <select id="ft-obra-id" onchange="fillTareaObra(this.value)" size="5" style="width:100%;min-height:110px;border-radius:8px;padding:4px">
          <option value="">— Seleccionar obra —</option>
        </select>
        <div id="ft-obras-count" style="font-size:11px;color:var(--text3);margin-top:4px"></div>
      </div>
      <div class="form-group full"><label>Descripción de la tarea</label>
        <input id="ft-desc" placeholder="Ej: Imprimir lonas para Farmacity Florida 441">
      </div>
      <div class="form-group"><label>Fecha</label><input id="ft-fecha" placeholder="DD/MM/AAAA"></div>
      <div class="form-group"><label>Hora inicio</label><input id="ft-hora-ini" placeholder="09:00" type="time"></div>
      <div class="form-group"><label>Hora fin</label><input id="ft-hora-fin" placeholder="11:00" type="time"></div>
      <div class="form-group"><label>Sector responsable</label>
        <select id="ft-sector">
          <option>Producción</option><option>Colocaciones</option><option>Diseño</option><option>Ventas</option><option>Compras</option><option>Calidad</option>
        </select>
      </div>
      <div class="form-group full"><label>Notas adicionales</label><textarea id="ft-notas"></textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('tarea')">Cancelar</button>
      <button class="btn btn-primary" onclick="saveTarea()"><i class="ti ti-calendar-plus"></i> Guardar y enviar a Calendar</button>
    </div>
  </div>
</div>

<!-- AREA DE IMPRESIÓN PDF -->
<div id="print-area" style="display:none"></div>

<div class="toast" id="toast"></div>

<script src="clienteContactosV1.js?v=TIZ-CONTACTOS-CARGO-20261026"></script>

<!-- Firebase SDK -->
<script src="presupuestoEmisorV1.js?v=TIZ-DOMICILIO-PRESUPUESTOS-20261030"></script>
<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBkTVxyE0Qd6SBTw5jf-hdn1aCP5Y9g42E",
  authDomain: "tiz---app.firebaseapp.com",
  projectId: "tiz---app",
  storageBucket: "tiz---app.firebasestorage.app",
  messagingSenderId: "52620104053",
  appId: "1:52620104053:web:d62bf8b7ca296581f1833c",
  measurementId: "G-EXPT46ZFJT"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ hd: 'tizpublicidad.com' });

// ============================================================
// PERMISOS
// ============================================================
const ADMIN_EMAIL = 'info@tizpublicidad.com';
const ADMIN_EMAILS = new Set([ADMIN_EMAIL, 'giancarlo.pareja@tizpublicidad.com']);

// Mapa email → sector. Completar con los emails reales del equipo.
const USER_SECTOR_MAP = {
  'contrerasfedericogabriel365@gmail.com': 'Operaciones',
  'info@tizpublicidad.com':              'Ventas',
  'giancarlo.pareja@tizpublicidad.com': 'Ventas',
  'pablo.aciar@tizpublicidad.com':       'Producción',
  'julieta.aguirre@tizpublicidad.com':   'Diseño',
  'carolina.flores@tizpublicidad.com':   'Compras',
  'cristiantizpublicidad@gmail.com':     'Calidad',
  'arielbenitezpublicidad@gmail.com':    'Colocaciones',
};

const SECTOR_COLORS = {
  'Ventas':'var(--amber)','Producción':'var(--blue)',
  'Colocaciones':'var(--teal)','Diseño':'var(--purple)','Compras':'var(--accent)','Calidad':'var(--green)'
};
const SECTOR_EMOJI = {
  'Ventas':'💰','Producción':'📦','Colocaciones':'🚛','Diseño':'✏️','Compras':'🛒','Calidad':'✅'
};

window.currentUser = null;

function getUserSector(email) {
  if (USER_SECTOR_MAP[email]) return USER_SECTOR_MAP[email];
  const local = (email||'').split('@')[0].toLowerCase();
  if (local.includes('calidad'))return 'Calidad';
  if (local.includes('prod'))   return 'Producción';
  if (local.includes('col'))    return 'Colocaciones';
  if (local.includes('dis') || local.includes('design')) return 'Diseño';
  if (local.includes('comp'))   return 'Compras';
  return 'Ventas';
}
// Colocaciones is visible to authenticated users; edits keep sector permissions.
window.canViewPage = page => !!window.currentUser && (page==='obras'||page==='colocaciones');
window.canViewOperaciones = () => ['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com','pablo.aciar@tizpublicidad.com','contrerasfedericogabriel365@gmail.com'].includes(String(window.currentUser?.email||'').toLowerCase());
window.canEditFechasCompromiso = () => window.currentUser?.isAdmin;
window.canViewIndicadores = () => ['info@tizpublicidad.com','giancarlo.pareja@tizpublicidad.com','pablo.aciar@tizpublicidad.com'].includes(String(window.currentUser?.email||'').toLowerCase());
window.canAnnotateSector = s => {
  if (!window.currentUser) return false;
  if (window.currentUser.isAdmin) return true;
  if (window.currentUser.sector === s) return true;
  if (s === 'Operaciones' && window.canViewOperaciones()) return true;
  if (s === 'Calidad' && window.currentUser.email === 'pablo.aciar@tizpublicidad.com') return true;
  // Compras y Pablo pueden gestionar tareas de Colocaciones.
  if (s === 'Colocaciones' && (window.currentUser.sector === 'Compras' || window.currentUser.email === 'pablo.aciar@tizpublicidad.com')) return true;
  return false;
};
window.canEditObra        = () => window.currentUser?.isAdmin;
window.isAdmin            = () => window.currentUser?.isAdmin;

// ============================================================
// AUTH SCREEN
// ============================================================
function showLoginScreen() {
  document.querySelector('.app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}
function hideLoginScreen() {
  document.querySelector('.app').style.display = 'flex';
  document.getElementById('login-screen').style.display = 'none';
}

window.doLogin = async () => {
  try {
    // La sesión de Firebase sirve para toda la app. Sheets y Drive se ejecutan
    // desde el backend y no deben volver a pedir consentimiento en cada operación.
    const providerFlex = new GoogleAuthProvider();
    providerFlex.setCustomParameters({prompt:'select_account'});
    await signInWithPopup(auth, providerFlex);
  } catch(e) {
    document.getElementById('login-err').textContent = 'Error al iniciar sesión: ' + e.message;
  }
};
window.doLogout = async () => { await signOut(auth); };

const dataSubscriptions=[];let dataGeneration=0,portalTimer=null,lastSessionEmail='';
function stopDataSubscriptions(){dataGeneration++;dataSubscriptions.splice(0).forEach(fn=>fn());if(portalTimer)clearInterval(portalTimer);portalTimer=null;}
onAuthStateChanged(auth, async user => {
  stopDataSubscriptions();
  if(user&&lastSessionEmail&&lastSessionEmail!==user.email){location.reload();return;}
  if(user)lastSessionEmail=user.email;
  if (user) {
    // Validar que el email esté en la lista autorizada
    const allowed = Object.keys(USER_SECTOR_MAP);
    if (!allowed.includes(user.email)) {
      await signOut(auth);
      document.getElementById('login-err').textContent =
        `La cuenta ${user.email} no tiene acceso a esta app. Contactá a info@tizpublicidad.com`;
      showLoginScreen();
      return;
    }
    const sector = getUserSector(user.email);
    window.currentUser = {
      email: user.email,
      name: user.email === 'giancarlo.pareja@tizpublicidad.com' ? 'Giancarlo Pareja' : user.displayName,
      photo: user.photoURL,
      sector,
      isAdmin: ADMIN_EMAILS.has(String(user.email||'').toLowerCase()),
      vendedor: user.email === 'giancarlo.pareja@tizpublicidad.com' ? 'G' : '',
      restrictedOperaciones:user.email==='contrerasfedericogabriel365@gmail.com',
      restrictedColocaciones:user.email==='arielbenitezpublicidad@gmail.com',
      restrictedChecklists:user.email==='cristiantizpublicidad@gmail.com',
      qualityFullAccess:user.email==='cristiantizpublicidad@gmail.com',
    };
    hideLoginScreen();
    updateUserUI();
    initListeners();
  } else {
    window.currentUser = null;
    window.TIZClemenSecretariaV1?.reset();
    window.TIZOperacionesV1?.reset();
    window.TIZObrasSeguimientoV2?.resetConsulta();
    window.TIZEstadisticaSourceV1?.reset();
    document.getElementById('est-kpis')?.replaceChildren();
    document.getElementById('est-content')?.replaceChildren();
    for(const key of Object.keys(window.DB||{}))window.DB[key]=[];
    showLoginScreen();
  }
});

function updateUserUI() {
  const u = window.currentUser;
  if (!u) return;
  const color = SECTOR_COLORS[u.sector] || 'var(--accent)';
  document.getElementById('user-name').textContent   = u.name || u.email;
  document.getElementById('user-sector').textContent = u.sector;
  document.getElementById('user-sector').style.color = color;
  if (u.photo) {
    document.getElementById('user-avatar').src   = u.photo;
    document.getElementById('user-avatar').style.display = 'block';
  }
  if(u.restrictedOperaciones){document.querySelectorAll('.nav-item').forEach(el=>el.style.display=["goTo('operaciones')","goTo('obras')"].some(p=>el.getAttribute('onclick')?.includes(p))?'flex':'none');document.querySelectorAll('.nav-section').forEach(el=>el.style.display='none');window.currentPage='operaciones';window.goTo?.('operaciones');}
  document.querySelectorAll('.operations-only').forEach(el=>el.style.display=window.canViewOperaciones()?'flex':'none');
  if(u.restrictedColocaciones){document.querySelectorAll('.nav-item').forEach(el=>{el.style.display=["goTo('colocaciones')","goTo('obras')"].some(p=>el.getAttribute('onclick')?.includes(p))?'flex':'none';});document.querySelectorAll('.sidebar-section').forEach(el=>el.style.display='none');window.currentPage='colocaciones';window.goTo?.('colocaciones');}
  if(u.restrictedChecklists){document.querySelectorAll('.nav-item').forEach(el=>{el.style.display=["goTo('calidad')","goTo('obras')"].some(p=>el.getAttribute('onclick')?.includes(p))?'flex':'none';});document.querySelectorAll('.sidebar-section').forEach(el=>el.style.display='none');window.currentPage='calidad';window.goTo?.('calidad');}
  document.querySelectorAll('.stats-managers-only').forEach(el=>el.style.display=window.canViewIndicadores()?'flex':'none');
  if(!window.canViewIndicadores()){window.TIZEstadisticaSourceV1?.reset();document.getElementById('est-content')?.replaceChildren();if(window.currentPage==='estadistica')window.goTo?.('dashboard');}
  // Ocultar secciones admin-only en sidebar
  if (!u.isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
  // Obras es una consulta común para todas las cuentas autorizadas.
  document.querySelectorAll('.nav-item').forEach(el=>{if(el.getAttribute('onclick')?.includes("goTo(\'obras\')"))el.style.display='flex';});
}

// ============================================================
// ESTADO GLOBAL
// ============================================================
function getSemanaActual() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = date.getUTCDay() || 7; // lunes=1, domingo=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

window.DB = { obras:[], clientes:[], presupuestos:[], retenciones:[], cobranzas:[], tareas:[], calidad:[], checklists:[] };
window.tizNumeroBase = value => {
  const match=String(value??'').match(/\d+/); if(!match)return '';
  const sinCeros=match[0].replace(/^0+(?=\d)/,'');
  return sinCeros.slice(0,4);
};
// Formato visible de cotizaciones; conserva la clave interna sin ceros.
window.tizNumeroCotizacion = value => {
  const match = String(value ?? '').match(/\d+/);
  return match ? match[0].replace(/^0+(?=\d)/, '').padStart(7, '0') : '';
};
window.currentSem = getSemanaActual();
['dash-sem','sem-label','prod-sem','col-sem'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.textContent = 'Sem ' + window.currentSem;
});
window.currentPage = 'dashboard';
window.obrasSemana = new Set();
window.cobTab = 'pendientes';
window.obrasSectorFilter = 'Todos';
window.editingId = { obra:null, cliente:null, presupuesto:null, retencion:null, cobranza:null, tarea:null };

function initListeners() {
  stopDataSubscriptions();const generation=dataGeneration;
  if(window.currentUser?.restrictedOperaciones){for(const key of Object.keys(window.DB))window.DB[key]=[];window.TIZOperacionesV1?.render();portalTimer=setInterval(()=>window.TIZOperacionesV1?.reload(true),30000);return;}
  if(window.currentUser?.restrictedColocaciones){for(const key of Object.keys(window.DB))window.DB[key]=[];window.loadColocacionesPortalV153();portalTimer=setInterval(()=>window.loadColocacionesPortalV153(),30000);return;}
  if(window.currentUser?.restrictedChecklists){for(const key of Object.keys(window.DB))window.DB[key]=[];window.loadChecklistsPortalV2();portalTimer=setInterval(()=>window.loadChecklistsPortalV2(),30000);return;}
  const numeroDesc = (a,b) => (Number(window.tizNumeroBase(b.ot??b.nro))||-1) - (Number(window.tizNumeroBase(a.ot??a.nro))||-1);
  const clienteAZ = (a,b) => String(a.razonSocial||a.razon_social||a.nombreFiscal||a.nombre||'').localeCompare(String(b.razonSocial||b.razon_social||b.nombreFiscal||b.nombre||''),'es',{sensitivity:'base'});
  function listen(col, key) {
    dataSubscriptions.push(onSnapshot(collection(db, col), snap => {
      if(generation!==dataGeneration)return;
      window.DB[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if(key==='clientes') window.DB[key].sort(clienteAZ);
      if(key==='obras'||key==='presupuestos'||key==='cobranzas') window.DB[key].sort(numeroDesc);
      refreshCurrent();
    }));
  }
  listen('obras', 'obras');
  listen('clientes', 'clientes');
  listen('presupuestos', 'presupuestos');
  listen('retenciones', 'retenciones');
  listen('cobranzas', 'cobranzas');
  listen('tareas', 'tareas');
  listen('calidadRegistros', 'calidad');
  listen('calidadChecklists', 'checklists');
  document.getElementById('sync-text').textContent = 'En línea';
}

// Análisis preliminar: endpoint autenticado para todos los puestos, incluidos portales restringidos.
window.clemenSecretariaApiV1 = async body => {
  if(!auth.currentUser)throw new Error('Iniciá sesión en TIZ.');
  const response=await fetch('https://us-central1-tiz---app.cloudfunctions.net/sincronizarBaseMadreV120',{signal:AbortSignal.timeout(30000),method:'POST',headers:{Authorization:'Bearer '+await auth.currentUser.getIdToken(),'Content-Type':'application/json'},body:JSON.stringify({...body,mode:'secretary-'+body.mode})});
  const result=await response.json();if(!response.ok||result.ok!==true)throw new Error(result.error||'No se pudo consultar Clemen.');return result;
};
window.leerObrasConsultaV1 = async () => {
  if(!auth.currentUser)throw new Error('Iniciá sesión en TIZ.');
  const session=auth.currentUser;
  for(let attempt=0;attempt<2;attempt++){
    if(auth.currentUser!==session)throw new Error('La sesión cambió. Volvé a abrir Obras.');
    try{
      const response=await fetch('https://us-central1-tiz---app.cloudfunctions.net/sincronizarBaseMadreV120',{signal:AbortSignal.timeout(30000),method:'POST',headers:{Authorization:'Bearer '+await session.getIdToken(),'Content-Type':'application/json'},body:JSON.stringify({mode:'obras-consulta-list'})});
      if(response.status>=500)throw Object.assign(new Error('El servicio de Obras no está disponible por el momento.'),{temporary:true});
      const result=await response.json();if(!response.ok||result.ok!==true)throw new Error(result.error||'No se pudo consultar Obras.');return result;
    }catch(error){
      const temporary=error.temporary||['TypeError','AbortError','TimeoutError'].includes(error.name);
      if(!temporary)throw error;
      if(attempt===1)throw new Error('No se pudo conectar para actualizar Obras. Reintentá con «Actualizar obras».');
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
  }
};
window.operacionesApiV1 = async body => {
  if(!auth.currentUser)throw new Error('Iniciá sesión en TIZ.');
  const response=await fetch('https://us-central1-tiz---app.cloudfunctions.net/sincronizarBaseMadreV120',{signal:AbortSignal.timeout(30000),method:'POST',headers:{Authorization:'Bearer '+await auth.currentUser.getIdToken(),'Content-Type':'application/json'},body:JSON.stringify({...body,mode:'operations-'+body.mode})});
  const result=await response.json();if(!response.ok||result.ok!==true)throw new Error(result.error||'No se pudo consultar Operaciones.');return result;
};
window.estadisticaSourceApiV1 = async () => {
  if (!auth.currentUser) throw new Error('Iniciá sesión en TIZ.');
  const response=await fetch('https://us-central1-tiz---app.cloudfunctions.net/sincronizarBaseMadreV120',{
    signal:AbortSignal.timeout(30000),method:'POST',headers:{Authorization:'Bearer '+await auth.currentUser.getIdToken(),'Content-Type':'application/json'},body:JSON.stringify({mode:'read-statistics'})
  });
  const result=await response.json();
  if(!response.ok||result.ok!==true)throw new Error(result.error||'No se pudieron leer los resultados de TIZ 2026.');
  return result;
};
window.analisisPreliminarApiV1 = async body => {
  if (!auth.currentUser) throw new Error('Iniciá sesión en TIZ.');
  const response = await fetch('https://us-central1-tiz---app.cloudfunctions.net/sincronizarBaseMadreV120', {
    signal:AbortSignal.timeout(30000),
    method:'POST', headers:{Authorization:'Bearer '+await auth.currentUser.getIdToken(),'Content-Type':'application/json'},
    body:JSON.stringify({...body,mode:"preliminary-"+body.mode})
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) throw new Error(result.error || 'No se pudo consultar el análisis preliminar.');
  return result;
};

// Una transacción fusiona contra la ficha actual, sin perder contactos de otros usuarios.
window.recordarContactosClienteV1 = async (reference,contacts) => {
  const core=window.TIZClienteContactosV1,client=core.client(window.DB,reference);
  if(!contacts?.length)return false;
  if(!client?.id)throw Error('Seleccioná un cliente existente para recordar sus contactos.');
  const merged=await runTransaction(db,async tx=>{
    const ref=doc(db,'clientes',client.id),snap=await tx.get(ref);
    if(!snap.exists())throw Error('El cliente ya no está disponible.');
    const current=snap.data(),contactos=core.merge(current.contactos,contacts);
    tx.update(ref,{contactos});return contactos;
  });
  Object.assign(client,{contactos:merged});
  window.sugerirContactoClientePP?.();window.sugerirRetiraClientePP?.();
  return true;
};

// CRUD helpers
window.insumosCotizacionApiV1 = async body => {
  const session=auth.currentUser;if(!session)throw Error('Iniciá sesión en TIZ.');
  const response=await fetch('https://us-central1-tiz---app.cloudfunctions.net/sincronizarBaseMadreV120',{signal:AbortSignal.timeout(45000),method:'POST',headers:{Authorization:'Bearer '+await session.getIdToken(),'Content-Type':'application/json'},body:JSON.stringify({...body,mode:'quote-materials-'+body.mode})});
  const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'No se pudo consultar el detalle de insumos.');return result;
};
window.addDoc_ = async (col_, data) => {
  if(col_==='presupuestos'&&data.estado==='Aprobado'){
    const result=await window.insumosCotizacionApiV1({mode:'approve',crear:true,id:data.insumosCotizacionId||'',cotizacion:data,insumosAnteriores:data.insumosVentas||[]});Object.assign(data,{insumosVentas:result.insumosVentas,insumosVentasAprobados:result.insumosVentasAprobados});return {id:result.id};
  }
  const patch={...data};
  if(col_==='obras') {
    delete patch.analisisPreliminarAprobadoEn;
    if(window.TIZAnalisisPreliminarCoreV1.isApproval(null,patch)) patch.analisisPreliminarAprobadoEn=serverTimestamp();
  }
  return addDoc(collection(db,col_),{...patch,_ts:serverTimestamp()});
};
window.updateDoc_ = async (col_, id, data) => {
  if(col_==='presupuestos'&&data.estado==='Aprobado'){
    const prior=window.DB?.presupuestos?.find(p=>p.id===id)||{};
    const result=await window.insumosCotizacionApiV1({mode:'approve',id,cotizacion:{...prior,...data},insumosAnteriores:prior.insumosVentas||[]});Object.assign(data,{insumosVentas:result.insumosVentas,insumosVentasAprobados:result.insumosVentasAprobados});return;
  }
  if(col_!=='obras'||String(data?.estado||'').trim().toLowerCase()!=='aprobado') return updateDoc(doc(db,col_,id),data);
  return runTransaction(db,async transaction=>{
    const ref=doc(db,col_,id),snap=await transaction.get(ref);
    if(!snap.exists())throw Error('La obra ya no está disponible.');
    const current=snap.data(),patch={...data};delete patch.analisisPreliminarAprobadoEn;
    if(!current.analisisPreliminarAprobadoEn&&window.TIZAnalisisPreliminarCoreV1.isApproval(current,patch))patch.analisisPreliminarAprobadoEn=serverTimestamp();
    transaction.update(ref,patch);
  });
};

// Estado de Obras: valida los datos actuales y guarda la OT completa con auditoría.
window.cambiarEstadoObraV1 = async (ids, estado, anteriores) => {
  const core=window.TIZObrasSeguimientoCoreV2,user={...window.currentUser};
  if(!core.canStatus(user))throw Error('Tu cuenta no puede modificar el estado de Obras.');
  if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^[\w-]{1,150}$/.test(id)))throw Error('La selección de obras no es válida.');
  return runTransaction(db,async transaction=>{
    const refs=ids.map(id=>doc(db,'obras',id)),snapshots=await Promise.all(refs.map(ref=>transaction.get(ref)));
    if(snapshots.some(s=>!s.exists()))throw Error('La obra cambió. Actualizá el listado antes de continuar.');
    const works=snapshots.map((s,i)=>({...s.data(),id:ids[i]}));
    if(core.grouped(works).length!==1||works.some(w=>!anteriores||w.estado!==anteriores[w.id]))throw Error('Otra persona actualizó la obra. Actualizá el listado antes de cambiar su estado.');
    const at=new Date().toISOString(),patches=works.map(w=>({id:w.id,patch:core.statusPatch(w,estado,user,at)}));
    patches.forEach((p,i)=>{
      transaction.update(refs[i],p.patch);
      transaction.set(doc(collection(refs[i],'seguimientoHistorial')),{tipo:'estado',fecha:at,usuario:user.email,estadoAnterior:String(works[i].estado||''),estadoNuevo:estado});
    });
    return patches;
  });
};

// Compatibilidad: la baja directa se retiró; sólo se inicia desde Presupuestos.
window.cambiarBajaObraV1 = async () => {
  throw new Error('La baja se realiza únicamente desde Presupuestos por Ventas.');
};

// La baja comercial y sus obras se confirman juntas; no borra registros fiscales.
window.darBajaCotizacionV1 = async (id, motivo) => {
  const user={...window.currentUser},core=window.TIZObrasSeguimientoCoreV2;
  if(!core.canBaja(user))throw Error('Solo Ventas puede dar de baja la cotización.');
  if(typeof id!=='string'||!/^[\w-]{1,150}$/.test(id))throw Error('Guardá la cotización como Borrador antes de darla de baja.');
  motivo=String(motivo||'').trim();if(motivo.length<3||motivo.length>1000)throw Error('Indicá un motivo de entre 3 y 1000 caracteres.');
  const all=await getDocs(collection(db,'obras'));
  const result=await runTransaction(db,async tx=>{
    const ref=doc(db,'presupuestos',id),snap=await tx.get(ref);
    if(!snap.exists())throw Error('La cotización ya no está disponible.');
    const p=snap.data(),matches=w=>w.presupuestoId===id||w.cotizacionId===id||w.id===p.obraId||core.base(w.ot)&&core.base(w.ot)===core.base(p.nro)&&core.norm(w.cliente)===core.norm(p.cliente);
    const ids=new Set(all.docs.map(d=>({...d.data(),id:d.id})).filter(matches).map(w=>w.id));if(p.obraId)ids.add(p.obraId);
    if(ids.size>100)throw Error('La cotización tiene demasiadas obras vinculadas. Revisá sus vínculos.');
    const refs=[...ids].map(id=>doc(db,'obras',id)),works=await Promise.all(refs.map(ref=>tx.get(ref)));
    if(works.some(s=>!s.exists()))throw Error('Una obra vinculada cambió. Actualizá la cotización antes de continuar.');
    const at=new Date().toISOString(),patch={estado:'Baja',bajaCotizacion:p.estado==='Baja'&&p.bajaCotizacion?p.bajaCotizacion:{motivo,fecha:at,usuario:user.email,estadoAnterior:String(p.estado||'Borrador')}},patches=[];
    works.forEach((s,i)=>{const w={...s.data(),id:refs[i].id};if(!matches(w))throw Error('Cambió la vinculación de una obra. Actualizá antes de continuar.');if(!core.isBaja(w))patches.push({id:w.id,patch:core.bajaPatch(w,motivo,user,false,at)});});
    tx.update(ref,patch);for(const w of patches)tx.update(doc(db,'obras',w.id),w.patch);
    return {presupuestoId:id,patch,patches};
  });
  const p=(window.DB?.presupuestos||[]).find(p=>p.id===id);if(p)Object.assign(p,result.patch);
  window.TIZObrasSeguimientoV2?.applyWorkPatches(result.patches);
  return result;
};

// Gestiones de Colocaciones: validar sobre la versión actual del documento evita
// duplicar cierres/reprogramaciones cuando dos personas gestionan la misma acción.
window.mutateColocacionesV128 = async (id, buildPatch) => {
  if (!window.canViewPage('colocaciones') || !window.canAnnotateSector('Colocaciones')) {
    throw new Error('Tu puesto no tiene permiso para editar Colocaciones.');
  }
  if(window.currentUser?.restrictedColocaciones){const current=await window.colocacionesApiV129({mode:'portal-work',obraId:id}),patch=buildPatch(current.obra);if(!patch||!Object.keys(patch).length)return {};const result=await window.colocacionesApiV129({mode:'portal-mutate',obraId:id,patch,version:current.obra.colocacionesGestion?.actualizadoEn||''});return result.patch;}
  return runTransaction(db, async transaction => {
    const ref = doc(db, 'obras', id), snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('La obra ya no está disponible.');
    const patch = buildPatch({ ...snapshot.data(), id });
    if (!patch || !Object.keys(patch).length) return {};
    const allowed = key => key.startsWith('colocacionesGestion.') ||
      /^sectores\.colocaciones\.(estado|real|instalada|fotosFinales)$/.test(key);
    if (!Object.keys(patch).every(allowed)) throw new Error('La gestión sólo puede actualizar Colocaciones.');
    transaction.update(ref, patch);
    return patch;
  });
};
// Calidad conserva registros por OT y evita pisar gestiones de otros sectores.
window.leerCalidadBaseMadreV1 = async () => {
  if(window.currentUser?.restrictedChecklists)return window.calidadChecklistApiV2({mode:'mother'});
  if (!auth.currentUser || !window.TIZCalidadCore?.canRecord(window.currentUser)) throw new Error('Tu cuenta no puede consultar Calidad.');
  const response = await fetch('https://us-central1-tiz---app.cloudfunctions.net/sincronizarBaseMadreV120', {
    method:'POST', headers:{Authorization:'Bearer '+await auth.currentUser.getIdToken(),'Content-Type':'application/json'},
    body:JSON.stringify({mode:'read-quality'})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw new Error(result.error||'No se pudo consultar TIZ 2026');
  return result;
};
window.calidadChecklistApiV2 = async (payload, pdf = false) => {
  if (!auth.currentUser || !window.TIZChecklistCoreV2?.canWrite(window.currentUser)) throw new Error('Tu cuenta no puede completar estos formularios.');
  if(!['save','pdf','list','mother','record-save','obras-sync','obras-save'].includes(payload.mode))throw new Error('Operación de checklist inválida.');
  const response = await fetch('https://us-central1-tiz---app.cloudfunctions.net/sincronizarBaseMadreV120', {
    method:'POST', headers:{Authorization:'Bearer '+await auth.currentUser.getIdToken(),'Content-Type':'application/json'},
    body:JSON.stringify({...payload,mode:'quality-checklist-'+payload.mode})
  });
  if(pdf && response.ok)return response.blob();
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw new Error(result.error||'No se pudo guardar el checklist.');
  return result;
};
let checklistPortalBusy=false;
window.loadChecklistsPortalV2=async()=>{
  if(checklistPortalBusy||!window.currentUser?.restrictedChecklists)return;
  checklistPortalBusy=true;const generation=dataGeneration;
  try{const result=await window.calidadChecklistApiV2({mode:'list'});if(generation!==dataGeneration||!window.currentUser?.restrictedChecklists)return;window.DB.obras=result.obras||[];window.DB.checklists=result.checklists||[];window.DB.calidad=result.calidad||[];document.getElementById('sync-text').textContent='Calidad · en línea';window.refreshCurrent();}
  catch(e){if(generation===dataGeneration)document.getElementById('sync-text').textContent='Calidad · '+e.message;}
  finally{checklistPortalBusy=false;}
};
window.saveCalidadV1 = async payload => {
  if(window.currentUser?.restrictedChecklists){const result=await window.calidadChecklistApiV2({...payload,mode:'record-save'});await window.loadChecklistsPortalV2();return result;}
  const C=window.TIZCalidadCore,u=window.currentUser;
  if(!C?.canRecord(u))throw new Error('Tu cuenta no puede registrar Calidad.');
  const at=new Date().toISOString(),record=payload.record?C.clean(payload.record,u,at):null;
  const obraId=record?.obraId||payload.obraId||'',id=record?.id||payload.id;
  if(!/^[\w-]{1,150}$/.test(id||'')||obraId&&!/^[\w-]{1,150}$/.test(obraId))throw new Error('Identificador inválido.');
  return runTransaction(db,async tx=>{
    const ref=doc(db,obraId?'obras':'calidadRegistros',obraId||id),snap=await tx.get(ref);
    if(obraId){
      if(!snap.exists())throw new Error('La OT ya no está disponible.');
      const work={...snap.data(),id:obraId};
      if(work.archivado||work.revisionVigente===false||work.revisionOperativa===false)throw new Error('La OT no está disponible para edición.');
      let patch;
      if(record)patch=C.registerPatch(work,record);
      else {const old=work.calidadGestion?.registros?.[id];if(!old)throw new Error('El registro ya no está disponible.');patch={[`calidadGestion.registros.${id}`]:C.closeRecord(old,payload.fields,u,at)};}
      tx.update(ref,patch);
    }else{
      if(record){if(snap.exists())throw new Error('Ese registro ya existe.');tx.set(ref,record);}
      else{if(!snap.exists())throw new Error('El registro ya no está disponible.');tx.set(ref,C.closeRecord(snap.data(),payload.fields,u,at));}
    }
  });
};
// Pendientes sin OT and printable archive are protected by Firebase ID tokens.
window.colocacionesApiV129 = async payload => {
  if (!auth.currentUser || !window.canViewPage('colocaciones') || !window.canAnnotateSector('Colocaciones')) {
    throw new Error('Tu puesto no tiene permiso para editar Colocaciones.');
  }
  const response = await fetch('https://us-central1-tiz---app.cloudfunctions.net/facturacionIntegralEmitirV83', {
    method: 'POST', headers: { Authorization: 'Bearer ' + await auth.currentUser.getIdToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, sector: 'colocaciones' })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo conectar con la base de Colocaciones.');
  return result;
};

let portalBusy=false;
window.loadColocacionesPortalV153=async()=>{if(portalBusy||!window.currentUser?.restrictedColocaciones)return;portalBusy=true;const generation=dataGeneration;try{const result=await window.colocacionesApiV129({mode:'portal-list'});if(generation!==dataGeneration||!window.currentUser?.restrictedColocaciones)return;window.DB.obras=result.obras||[];window.colocacionesFormsURL=result.formsUrl;document.getElementById('sync-text').textContent='Colocaciones · en línea';if(!document.activeElement?.matches('input,select,textarea')&&!document.querySelector('#c128-overlay.show,.g129-overlay'))window.refreshCurrent();}catch(e){if(generation===dataGeneration){document.getElementById('sync-text').textContent='Colocaciones · '+e.message;window.showToast?.(e.message);}}finally{portalBusy=false;}};
window.deleteDoc_ = async (col_, id)   => { await deleteDoc(doc(db, col_, id)); };
window.sincronizarCotizacionActualBaseMadreV114=async function(){
  const nro=String(document.getElementById('pp-nro')?.value||'').trim();
  const revision=String(document.getElementById('pp-revision')?.value||'1.1').trim();
  const digits=v=>String(v||'').replace(/\D/g,'');
  const p=(window.DB?.presupuestos||[]).find(x=>digits(x.nro)===digits(nro)&&String(x.revision||'1.1')===revision)
    ||(window.DB?.presupuestos||[]).find(x=>digits(x.nro)===digits(nro));
  if(!p){alert('No encontré la cotización guardada. Guardala primero y volvé a intentar.');return;}
  if(typeof window.repararBaseMadreAprobadaV111!=='function'){alert('El módulo de Base Madre no está cargado en esta versión de TIZ. Hacé Ctrl+F5 y volvé a intentar.');return;}
  try{
    const r=await window.repararBaseMadreAprobadaV111(p.id||p.nro);
    alert('Base Madre sincronizada correctamente. Fila '+(r?.row||'actualizada')+'.');
  }catch(e){
    console.error('[TIZ V114 Base Madre]',e);
    alert('No se pudo sincronizar TIZ 2026 Base de Datos.\n\n'+(e?.message||e));
  }
};

// Helpers
function parseDate(s) { if (!s) return null; const [d,m,y] = s.split('/'); return new Date(+y,+m-1,+d); }
function parseFecha(s) { return parseDate(s); }
function diasEntre(a, b) { const da=parseDate(a), db_=parseDate(b); if(!da||!db_) return null; return Math.round((db_-da)/(864e5)); }
function diasDesdeHoy(s) { const d=parseDate(s); if(!d) return null; return Math.round((new Date()-d)/(864e5)); }
function semaforo(fc, fr) {
  if (fr) { const d=diasEntre(fc,fr); return d===null?'n':d<=0?'g':'r'; }
  const d=diasDesdeHoy(fc); if(d===null) return 'n';
  return d<-3?'g':d<0?'a':'r';
}
function fmtM(n) { if(!n&&n!==0) return '-'; n=+n; if(n>=1e6) return '$'+Math.round(n/1e5)/10+'M'; if(n>=1000) return '$'+Math.round(n/1000)+'K'; return '$'+Math.round(n); }
function alertaVencimiento(o) {
  if (!o.ffc || !o.diasPago) return null;
  const [d,m,y] = o.ffc.split('/');
  if (!d||!m||!y) return null;
  const fechaVenc = new Date(+y,+m-1,+d);
  fechaVenc.setDate(fechaVenc.getDate() + (+o.diasPago||0));
  const hoy = new Date();
  const diff = Math.round((fechaVenc - hoy) / 86400000);
  if (diff < 0) return `VENCIDA hace ${Math.abs(diff)} días (${fechaVenc.toLocaleDateString('es-AR')})`;
  if (diff <= 5) return `Vence en ${diff} días (${fechaVenc.toLocaleDateString('es-AR')})`;
  return null;
}

window.calcFechaVencimiento = () => {
  const ffc = document.getElementById('f-ffc').value;
  const dias = +document.getElementById('f-dias-pago').value||0;
  const el = document.getElementById('f-venc-calculada');
  if (!ffc || !dias || !el) { if(el) el.textContent=''; return; }
  const [d,m,y] = ffc.split('/');
  if(!d||!m||!y) { el.textContent=''; return; }
  const fecha = new Date(+y,+m-1,+d);
  fecha.setDate(fecha.getDate()+dias);
  el.textContent = 'Vence: ' + fecha.toLocaleDateString('es-AR',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'});
  const hoy = new Date();
  const diff = Math.round((fecha-hoy)/86400000);
  el.style.color = diff<0?'var(--red)':diff<=5?'var(--amber)':'var(--green)';
};

function hasNotas(o) {
  const n = o.notas_sector || {};
  return ['Producción','Colocaciones','Diseño','Ventas','Compras','Calidad'].some(s => n[s] && n[s].trim());
}
function notasPreview(o) {
  const n = o.notas_sector || {};
  return ['Producción','Colocaciones','Diseño','Ventas','Compras','Calidad']
    .filter(s => n[s] && n[s].trim())
    .map(s => `<div style="margin-bottom:4px"><span style="font-size:10px;font-weight:500;color:${SECTOR_COLORS[s]}">${SECTOR_EMOJI[s]} ${s}:</span> <span style="font-size:11px;color:var(--text2)">${n[s]}</span> <span style="font-size:10px;color:var(--text3)">${n[s+'_ts']||''}</span></div>`)
    .join('');
}
function semBadge(fc, fr) {
  const s=semaforo(fc,fr);
  const map={g:'green',a:'amber',r:'red',n:'gray'};
  const lbl={g:'En fecha',a:'Riesgo',r:'Vencido',n:'Sin fecha'};
  return `<span class="badge badge-${map[s]}">${lbl[s]}</span>`;
}
function estadoBadge(e) {
  const map={'Pendiente':'gray','Enviado':'blue','Aprobado':'teal','Entregado':'purple','Cobrado pendiente':'amber','Cobrado':'green'};
  return `<span class="badge badge-${map[e]||'gray'}">${e}</span>`;
}
function pct(works, tipo) {
  const cf = works.filter(w => tipo==='prod'?w.fprod_c:w.fcol_c);
  if (!cf.length) return null;
  const ok = cf.filter(w => semaforo(tipo==='prod'?w.fprod_c:w.fcol_c, tipo==='prod'?w.fprod_r:w.fcol_r)==='g');
  return Math.round(ok.length/cf.length*100);
}

// Navigation
window.goTo = function(page) {
  if((page==='ia'||page==='tareas')&&window.TIZClemenSecretariaV1){window.TIZClemenSecretariaV1.show(page==='tareas'?'agenda':'dia');return;}
  if(window.currentUser?.restrictedOperaciones&&page!=='operaciones'&&page!=='obras')return window.showToast?.('Tu perfil está habilitado para Operaciones y la consulta de Obras.');
  if(page==='operaciones'&&!window.canViewOperaciones())return window.showToast?.('Sin acceso a Operaciones.');
  if(page==='estadistica'&&!window.canViewIndicadores())return window.showToast?.('Estadística está habilitada para Administración y Pablo.');
  if(page==='estadistica'&&!window.currentUser?.isAdmin)window.estTab='indicadores';
  if(window.currentUser?.restrictedChecklists&&page!=='calidad'&&page!=='obras')return window.showToast?.('Tu perfil está habilitado para Calidad y Obras.');
  if(window.currentUser?.restrictedColocaciones&&page!=='colocaciones'&&page!=='obras')return window.showToast?.('Tu perfil está habilitado para Colocaciones y la consulta de Obras.');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.querySelector(`[onclick="goTo('${page}')"]`).classList.add('active');
  window.currentPage = page;
  refreshCurrent();
};

window.refreshCurrent = function() {
  const p = window.currentPage;
  if (p==='dashboard') renderDashboard();
  else if (p==='obras') renderObras();
  else if (p==='semana') renderSemana();
  else if (p==='operaciones') window.TIZOperacionesV1?.render();
  else if (p==='produccion') renderProduccion();
  else if (p==='colocaciones') renderColocaciones();
  else if (p==='diseno') renderDiseno();
  else if (p==='calidad') window.TIZCalidadV1?.render();
  else if (p==='estadistica') renderEstadistica();
  else if (p==='alertas') renderAlertasV58();
  else if (p==='cobranzas') (window.TIZFactCobUIV2?.render || renderCobranzas)();
  else if (p==='presupuestos') renderPresupuestos();
  else if (p==='clientes') renderClientes();
  else if (p==='retenciones') renderRetenciones();
  else if (p==='vendedores') renderVendedores();
  updateBadges();
};

window.moveSem = function(d) {
  window.currentSem = Math.max(1, Math.min(52, window.currentSem + d));
  ['dash-sem','sem-label','prod-sem','col-sem'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent='Sem '+window.currentSem; });
  refreshCurrent();
};

// Inicializar labels de semana con la semana actual
setTimeout(() => {
  ['dash-sem','sem-label','prod-sem','col-sem'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.textContent = 'Sem ' + window.currentSem;
  });
}, 100);

function updateBadges() {
  const venc = window.DB.cobranzas.filter(c => c.estado==='Pendiente' && diasDesdeHoy(c.vencimiento) >= 0).length;
  document.getElementById('badge-cobr').textContent = venc || '';
  document.getElementById('badge-cobr').style.display = venc ? '' : 'none';
  const alertCount = (window.DB.obras||[]).filter(o => !window.TIZObrasSeguimientoCoreV2?.isBaja(o) && window.analizaObraV58 && window.analizaObraV58(o).nivel !== 'ok').length;
  const ba = document.getElementById('badge-alertas');
  if (ba) { ba.textContent = alertCount || ''; ba.style.display = alertCount ? '' : 'none'; }
}

// DASHBOARD
function renderDashboard() {
  const obras = window.DB.obras.filter(o=>!window.TIZObrasSeguimientoCoreV2?.isBaja(o));
  const sem = window.currentSem;
  const semObras = obras.filter(o => +o.semana === sem);
  const activas = obras.filter(o => o.estado==='En producción'||o.estado==='Aprobado');
  const termSem = semObras.filter(o => o.fprod_r || o.estado==='Entregado'||o.estado==='Facturado'||o.estado==='Cobrado');
  const pctP = pct(obras.filter(o=>o.fprod_c), 'prod');
  const pctC = pct(obras.filter(o=>o.fcol_c), 'col');
  const venc = obras.filter(o => semaforo(o.fprod_c,o.fprod_r)==='r').length;
  const vencFacturas = obras.filter(o => alertaVencimiento(o)).length;
  const totalVentaSem = semObras.reduce((a,o)=>a+(+o.neto||0),0);

  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('es-AR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  document.getElementById('dash-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Ventas sem. ${sem}</div><div class="kpi-val">${fmtM(totalVentaSem)}</div><div class="kpi-sub">${semObras.length} obras</div></div>
    <div class="kpi"><div class="kpi-label">Activas total</div><div class="kpi-val">${activas.length}</div><div class="kpi-sub">en producción o aprobadas</div></div>
    <div class="kpi"><div class="kpi-label">Cumpl. producción</div><div class="kpi-val ${pctP===null?'':pctP>=80?'green':pctP>=60?'amber':'red'}">${pctP===null?'—':pctP+'%'}</div><div class="kpi-sub">acumulado global</div></div>
    <div class="kpi"><div class="kpi-label">Cumpl. colocación</div><div class="kpi-val ${pctC===null?'':pctC>=80?'green':pctC>=60?'amber':'red'}">${pctC===null?'—':pctC+'%'}</div><div class="kpi-sub">acumulado global</div></div>
    <div class="kpi"><div class="kpi-label">Alertas prod.</div><div class="kpi-val ${venc>0?'red':''}">${venc}</div><div class="kpi-sub">vencidas o en riesgo</div></div>
    <div class="kpi"><div class="kpi-label">Facturas por vencer</div><div class="kpi-val ${vencFacturas>0?'red':''}">${vencFacturas}</div><div class="kpi-sub">próximas o vencidas</div></div>
  `;

  const SECTORS = ['Producción','Colocaciones','Diseño','Ventas','Compras','Calidad'];
  const COLORS = {'Producción':'var(--blue)','Colocaciones':'var(--teal)','Diseño':'var(--purple)','Ventas':'var(--amber)','Compras':'var(--accent)','Calidad':'var(--green)'};
  document.getElementById('dash-sectors').innerHTML = SECTORS.map(sec => {
    const sw = semObras.filter(o=>o.sector===sec);
    const term = sw.filter(o=>o.fprod_r||['Entregado','Facturado','Cobrado'].includes(o.estado));
    const neto = term.reduce((a,o)=>a+(+o.neto||0),0);
    const p = sw.length ? Math.round(term.length/sw.length*100) : 0;
    return `<div class="sector-card">
      <div class="sector-card-name" style="color:${COLORS[sec]}">${sec}</div>
      <div class="sector-card-num" style="color:${COLORS[sec]}">${term.length}<span style="font-size:15px;color:var(--text3)">/${sw.length}</span></div>
      <div class="sector-card-money">${fmtM(neto)}</div>
      <div class="progress" style="margin-top:8px"><div class="progress-fill" style="width:${p}%;background:${COLORS[sec]}"></div></div>
    </div>`;
  }).join('');

  const alertas = obras.filter(o => {
    const sp=semaforo(o.fprod_c,o.fprod_r); const sc=semaforo(o.fcol_c,o.fcol_r);
    return sp==='r'||sp==='a'||sc==='r'||sc==='a';
  }).slice(0,10);
  document.getElementById('dash-alertas').innerHTML = alertas.length ? alertas.map(o => {
    const sp=semaforo(o.fprod_c,o.fprod_r); const sc=semaforo(o.fcol_c,o.fcol_r);
    const dias = diasEntre(o.fprod_c, o.fprod_r||new Date().toLocaleDateString('es-AR'));
    return `<tr>
      <td class="strong">${String(o.ot||'—').replace(/^0+(?=\d)/,'')}</td><td class="strong">${o.desc||''}</td><td>${o.cliente||''}</td>
      <td><span style="color:var(--blue)">${o.sector||''}</span></td>
      <td>${sp!=='g'&&sp!=='n'?`<span>Prod: ${semBadge(o.fprod_c,o.fprod_r)}</span>`:''}${sc!=='g'&&sc!=='n'?`<span>Col: ${semBadge(o.fcol_c,o.fcol_r)}</span>`:''}</td>
      <td>${dias!==null?Math.abs(dias)+'d':'—'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin alertas activas</td></tr>';
}


// DRIVE / OT — integración desactivada temporalmente
// Estas funciones quedan como compatibilidad para que el resto del ERP siga funcionando.
function isObraAprobadaParaDrive(o){ return false; }
function driveStatusV9(o){
  if (o?.driveFolderUrl || o?.driveFolderId) return 'ready';
  return o?.id && o?.ot ? 'pending' : 'none';
}

window.openDriveFolderV201 = function(url, event){
  if (event) event.stopPropagation();
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
};

window.renderDriveButtonsV9 = function(o){
  const status = driveStatusV9(o);
  if (status === 'ready') {
    const safeUrl = String(o.driveFolderUrl || ('https://drive.google.com/drive/folders/' + encodeURIComponent(o.driveFolderId))).replace(/'/g, '&#39;');
    return `<button class="btn-icon drive-folder-ready"
      title="Abrir carpeta OT en Google Drive"
      onclick="openDriveFolderV201('${safeUrl}', event)"
      style="margin-right:4px;color:var(--green);border-color:rgba(76,175,125,.45);background:rgba(76,175,125,.08)">
      <i class="ti ti-brand-google-drive" style="font-size:15px"></i>
    </button>`;
  }
  if (status === 'pending') {
    return `<button class="btn-icon drive-folder-pending"
      title="Crear o recuperar carpeta OT"
      onclick="requestDriveSyncForObra('${o.id}', event)"
      style="margin-right:4px;color:var(--amber);border-color:rgba(232,160,32,.4);background:rgba(232,160,32,.06)">
      <i class="ti ti-brand-google-drive" style="font-size:15px"></i>
    </button>`;
  }
  return '';
};

async function queueDriveSyncV9(o){
  if (!o?.id) return null;
  return window.requestDriveSyncForObra(o.id);
}
window.queueDriveSyncV9 = queueDriveSyncV9;

window.requestDriveSyncForObra = async function(id, event){
  if (event) event.stopPropagation();
  const obra = (window.DB.obras || []).find(x => x.id === id);
  if (!obra) {
    showToast('No se encontró la obra');
    return null;
  }
  if (!obra.ot) {
    showToast('La obra no tiene número de OT');
    return null;
  }
  try {
    showToast('Creando o recuperando carpeta OT...');
    const result = await syncToSheets({...obra, estado:'Aprobado', firestoreId:id});
    if (!result?.driveFolderUrl) throw new Error(result?.error || 'Apps Script no devolvió el enlace');
    const links = {
      driveFolderId: result.folderId || result.driveFolderId || '',
      driveFolderUrl: result.driveFolderUrl,
      driveSyncedAt: new Date().toISOString()
    };
    await updateDoc_('obras', id, links);
    const local = (window.DB.obras || []).find(x => x.id === id);
    if (local) Object.assign(local, links);
    renderObras();
    showToast(result.created ? 'Carpeta OT creada ✓' : 'Carpeta OT recuperada ✓');
    return result;
  } catch (e) {
    console.error('[Drive OT]', e);
    showToast('Error al vincular Drive: ' + (e?.message || e));
    return null;
  }
};

// OBRAS
window.renderObras = function() {
  const SECTORS = ['Todos','Producción','Colocaciones','Diseño','Ventas','Compras','Calidad'];
  document.getElementById('obras-sectors').innerHTML = SECTORS.map(s =>
    `<button class="sector-tab ${window.obrasSectorFilter===s?'active':''}" onclick="setObrasSector('${s}')">${s}</button>`
  ).join('');

  let obras = window.DB.obras;
  if (window.obrasSectorFilter!=='Todos') obras = obras.filter(o=>o.sector===window.obrasSectorFilter);
  const estado = document.getElementById('filter-estado')?.value;
  const cli = document.getElementById('filter-cliente')?.value.toLowerCase();
  const otQ = document.getElementById('filter-ot')?.value.toLowerCase();
  const semDesde = +document.getElementById('filter-semana-desde')?.value||0;
  const semHasta = +document.getElementById('filter-semana-hasta')?.value||0;
  if (estado) obras = obras.filter(o=>o.estado===estado);
  if (cli) obras = obras.filter(o=>(o.cliente||'').toLowerCase().includes(cli));
  if (otQ) obras = obras.filter(o=>(o.ot||'').toLowerCase().includes(otQ)||(o.desc||'').toLowerCase().includes(otQ));
  if (semDesde) obras = obras.filter(o=>(+o.semana||0)>=semDesde);
  if (semHasta) obras = obras.filter(o=>(+o.semana||0)<=semHasta);
  obras = [...obras].sort((a,b)=>{ const bo=Number(window.tizNumeroBase(b.ot))||-1; const ao=Number(window.tizNumeroBase(a.ot))||-1; return bo-ao || ((+b.semana||0)-(+a.semana||0)); });

  document.getElementById('obras-count').textContent = obras.length + ' obras';
  document.getElementById('obras-tbody').innerHTML = obras.length ? obras.map(o => {
    const tieneNotas = hasNotas(o);
    const riesgoV58 = window.analizaObraV58 ? window.analizaObraV58(o) : {nivel:'ok', problemas:[]};
    return `<tr onclick="toggleNotasRow('${o.id}')" style="cursor:pointer">
      <td>${o.semana||'—'}</td>
      <td class="strong">${String(o.ot||'—').replace(/^0+(?=\d)/,'')}</td>
      <td class="strong" style="max-width:190px;overflow:hidden;text-overflow:ellipsis" title="${o.desc||''}">${o.desc||''}<div style="margin-top:5px">${riesgoV58.nivel==='ok'?'':`<span class="risk-pill ${riesgoV58.nivel==='danger'?'risk-danger':'risk-warn'}">${riesgoV58.nivel==='danger'?'🔴':'🟡'} ${riesgoV58.problemas.length}</span>`}</div></td>
      <td>${o.cliente||''}</td>
      <td><span style="font-size:11px;font-weight:500;color:var(--blue)">${o.sector||''}</span></td>
      <td onclick="event.stopPropagation()">
        <select class="quick-estado" onchange="quickChangeEstado('${o.id}',this.value)">
          ${['Pendiente','Enviado','Aprobado','Entregado','Cobrado pendiente','Cobrado'].map(s=>`<option value="${s}" ${o.estado===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td style="white-space:nowrap" onclick="event.stopPropagation()">
        ${o.nrfc ? `<span title="Facturado: FC ${o.nrfc}" style="color:var(--amber);margin-right:4px;font-size:13px">●</span>` : ''}
        ${alertaVencimiento(o) ? `<span title="${alertaVencimiento(o)}" style="color:var(--red);margin-right:4px;font-size:13px">⚠</span>` : ''}
        ${tieneNotas?`<span title="Tiene anotaciones" style="color:var(--accent);margin-right:4px"><i class="ti ti-message-dots" style="font-size:13px;vertical-align:middle"></i></span>`:''}
        ${renderDriveButtonsV9(o)}
        <button class="btn-icon" onclick="editObra('${o.id}')" style="margin-left:4px"><i class="ti ti-edit" style="font-size:13px"></i></button>
        <button class="btn-icon" onclick="delObra('${o.id}')" style="margin-left:4px"><i class="ti ti-trash" style="font-size:13px"></i></button>
      </td>
    </tr>
    <tr id="notas-row-${o.id}" style="display:none">
      <td colspan="7" style="background:var(--surface2);padding:10px 14px;border-bottom:0.5px solid var(--border)">
        ${tieneNotas ? notasPreview(o) : '<span style="font-size:12px;color:var(--text3)">Sin anotaciones. Hacé clic en el lápiz para agregar.</span>'}
        <button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="editObra('${o.id}')"><i class="ti ti-edit" style="font-size:11px"></i> Editar / Agregar nota</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">No hay obras. Hacé clic en "Nueva obra" para agregar.</td></tr>';
};

window.setObrasSector = s => { window.obrasSectorFilter=s; renderObras(); };
window.toggleNotasRow = id => {
  const row = document.getElementById('notas-row-'+id);
  if(row) row.style.display = row.style.display==='none' ? '' : 'none';
};

// SEMANA
window.renderSemana = function() {
  const activas = window.DB.obras.filter(o => o.estado==='Aprobado'||o.estado==='En producción');
  const sel = activas.filter(o => window.obrasSemana.has(o.id));

  document.getElementById('semana-body').innerHTML = sel.length ? `
    <table style="width:100%;font-size:12px"><thead><tr><th>OT</th><th>Descripción</th><th>Cliente</th><th>Sector</th><th>F.Prod</th><th>F.Col</th></tr></thead>
    <tbody>${sel.map(o=>`<tr><td class="strong">${String(o.ot||'—').replace(/^0+(?=\d)/,'')}</td><td>${o.desc||''}</td><td>${o.cliente||''}</td><td>${o.sector||''}</td><td>${o.fprod_c||'—'}</td><td>${o.fcol_c||'—'}</td></tr>`).join('')}</tbody>
    </table>` : '<p style="color:var(--text3);font-size:13px">Ninguna obra seleccionada todavía. Tildá las obras abajo.</p>';

  document.getElementById('semana-picker').innerHTML = activas.length ? activas.map(o => `
    <label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer">
      <input type="checkbox" ${window.obrasSemana.has(o.id)?'checked':''} onchange="toggleSemana('${o.id}',this.checked)" style="accent-color:var(--accent);width:16px;height:16px">
      <div>
        <span style="font-weight:500;color:var(--text)">${String(o.ot||'—').replace(/^0+(?=\d)/,'')} — ${o.desc||''}</span>
        <span style="color:var(--text3);font-size:11px;margin-left:8px">${o.cliente||''} · ${o.sector||''}</span>
      </div>
      <span style="margin-left:auto;color:var(--text3);font-size:11px">${estadoBadge(o.estado)}</span>
    </label>
  `).join('') : '<p style="color:var(--text3);font-size:13px">No hay obras activas.</p>';
};

window.toggleSemana = (id, on) => { on ? window.obrasSemana.add(id) : window.obrasSemana.delete(id); renderSemana(); };

window.exportCalendar = function() {
  const sel = window.DB.obras.filter(o => window.obrasSemana.has(o.id));
  if (!sel.length) { showToast('Seleccioná al menos una obra'); return; }
  sel.forEach(o => {
    const title = encodeURIComponent(`[TIZ] ${o.ot||''} - ${o.desc||''}`);
    const details = encodeURIComponent(`Cliente: ${o.cliente||''}\nSector: ${o.sector||''}\nEstado: ${o.estado||''}`);
    const date = (o.fprod_c||'').split('/').reverse().join('');
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}${date?`&dates=${date}/${date}`:''}`;
    window.open(url, '_blank');
  });
  showToast(`${sel.length} obra(s) enviadas a Google Calendar`);
};

// PRODUCCION
function renderProduccion() {
  const obras = window.DB.obras;
  const sem = window.currentSem;
  const semObras = obras.filter(o=>+o.semana===sem);
  const pctP = pct(obras.filter(o=>o.fprod_c),'prod');
  const term = obras.filter(o=>o.fprod_r);
  const venc = obras.filter(o=>semaforo(o.fprod_c,o.fprod_r)==='r').length;

  document.getElementById('prod-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Cumpl. producción</div><div class="kpi-val ${pctP===null?'':pctP>=80?'green':pctP>=60?'amber':'red'}">${pctP===null?'—':pctP+'%'}</div><div class="kpi-sub">global</div></div>
    <div class="kpi"><div class="kpi-label">Terminadas total</div><div class="kpi-val green">${term.length}</div><div class="kpi-sub">con fecha real</div></div>
    <div class="kpi"><div class="kpi-label">En producción</div><div class="kpi-val">${obras.filter(o=>o.estado==='En producción').length}</div></div>
    <div class="kpi"><div class="kpi-label">Vencidas</div><div class="kpi-val ${venc>0?'red':''}">${venc}</div></div>
  `;

  const show = obras.filter(o=>o.fprod_c||o.estado==='En producción').sort((a,b)=>(+b.semana||0)-(+a.semana||0));
  document.getElementById('prod-tbody').innerHTML = show.map(o => {
    const dias = diasEntre(o.fprod_r||o.fprod_c, o.fcol_r||o.fcol_c);
    return `<tr>
      <td class="strong">${String(o.ot||'—').replace(/^0+(?=\d)/,'')}<span data-ap-drive-ot="${String(o.ot||'')}" data-ap-drive-id="${o.id}"></span></td>
      <td class="strong">${o.desc||''}</td>
      <td>${o.cliente||''}</td>
      <td><span class="dot dot-${semaforo(o.fprod_c,o.fprod_r)==='g'?'green':semaforo(o.fprod_c,o.fprod_r)==='a'?'amber':'red'}"></span>${o.fprod_c||'—'}</td>
      <td style="color:${o.fprod_r?'var(--green)':'var(--text3)'}">${o.fprod_r||'Pendiente'}</td>
      <td>${semBadge(o.fprod_c,o.fprod_r)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${dias!==null?dias+'d':'—'}</td>
      <td><button class="btn-icon" onclick="editObra('${o.id}')"><i class="ti ti-edit" style="font-size:13px"></i></button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3)">No hay obras con fechas de producción cargadas.</td></tr>';
}

// COLOCACIONES
function renderColocaciones() {
  const obras = window.DB.obras;
  const pctC = pct(obras.filter(o=>o.fcol_c),'col');
  const term = obras.filter(o=>o.fcol_r).length;
  const venc = obras.filter(o=>semaforo(o.fcol_c,o.fcol_r)==='r').length;

  document.getElementById('col-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Cumpl. colocación</div><div class="kpi-val ${pctC===null?'':pctC>=80?'green':pctC>=60?'amber':'red'}">${pctC===null?'—':pctC+'%'}</div></div>
    <div class="kpi"><div class="kpi-label">Colocadas</div><div class="kpi-val green">${term}</div></div>
    <div class="kpi"><div class="kpi-label">Vencidas</div><div class="kpi-val ${venc>0?'red':''}">${venc}</div></div>
  `;

  const show = obras.filter(o=>o.fcol_c).sort((a,b)=>(+b.semana||0)-(+a.semana||0));
  document.getElementById('col-tbody').innerHTML = show.map(o => {
    const dias = diasEntre(o.fcol_c, o.fcol_r||new Date().toLocaleDateString('es-AR'));
    return `<tr>
      <td class="strong">${String(o.ot||'—').replace(/^0+(?=\d)/,'')}</td><td class="strong">${o.desc||''}</td><td>${o.cliente||''}</td>
      <td><span class="dot dot-${semaforo(o.fcol_c,o.fcol_r)==='g'?'green':semaforo(o.fcol_c,o.fcol_r)==='a'?'amber':'red'}"></span>${o.fcol_c||'—'}</td>
      <td style="color:${o.fcol_r?'var(--green)':'var(--text3)'}">${o.fcol_r||'Pendiente'}</td>
      <td>${semBadge(o.fcol_c,o.fcol_r)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${o.fcol_r?diasEntre(o.fcol_c,o.fcol_r)+'d':'—'}</td>
      <td><button class="btn-icon" onclick="editObra('${o.id}')"><i class="ti ti-edit" style="font-size:13px"></i></button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3)">No hay obras con fechas de colocación.</td></tr>';
}

// DISEÑO
function renderDiseno() {
  const obras = window.DB.obras.filter(o=>o.sector==='Diseño'&&!window.TIZObrasSeguimientoCoreV2?.isBaja(o));
  const total = obras.length;
  const term = obras.filter(o=>['Entregado','Facturado','Cobrado'].includes(o.estado)).length;
  const totalNeto = obras.reduce((a,o)=>a+(+o.neto||0),0);

  document.getElementById('dis-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Obras diseño</div><div class="kpi-val">${total}</div></div>
    <div class="kpi"><div class="kpi-label">Terminadas</div><div class="kpi-val green">${term}</div></div>
    <div class="kpi"><div class="kpi-label">Total en cartera</div><div class="kpi-val">${fmtM(totalNeto)}</div></div>
  `;

  document.getElementById('dis-tbody').innerHTML = obras.map(o => `<tr>
    <td class="strong">${String(o.ot||'—').replace(/^0+(?=\d)/,'')}<span data-ap-drive-ot="${String(o.ot||'')}" data-ap-drive-id="${o.id}"></span></td><td class="strong">${o.desc||''}</td><td>${o.cliente||''}</td>
    <td>${o.vendedor||'—'}</td><td>${estadoBadge(o.estado)}</td><td>${fmtM(o.neto)}</td>
    <td><button class="btn-icon" onclick="editObra('${o.id}')"><i class="ti ti-edit" style="font-size:13px"></i></button></td>
  </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">No hay obras de diseño.</td></tr>';
}

// COBRANZAS
window.renderCobranzas = function() {
  const cobr = window.DB.cobranzas;
  const pend = cobr.filter(c=>c.estado==='Pendiente');
  const cobradas = cobr.filter(c=>c.estado==='Cobrado');
  const totalPend = pend.reduce((a,c)=>a+(+c.importe||0),0);
  const totalCobr = cobradas.reduce((a,c)=>a+(+c.importe||0),0);
  const venc = pend.filter(c=>diasDesdeHoy(c.vencimiento)>=0).length;

  document.getElementById('cobr-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Pendiente de cobro</div><div class="kpi-val amber">${fmtM(totalPend)}</div><div class="kpi-sub">${pend.length} facturas</div></div>
    <div class="kpi"><div class="kpi-label">Cobrado total</div><div class="kpi-val green">${fmtM(totalCobr)}</div></div>
    <div class="kpi"><div class="kpi-label">Vencidas</div><div class="kpi-val ${venc>0?'red':''}">${venc}</div></div>
  `;

  let show = cobr;
  if (window.cobTab==='pendientes') show = pend;
  else if (window.cobTab==='cobradas') show = cobradas;
  const cobrQ = document.getElementById('cobr-filter-cliente')?.value.toLowerCase();
  const cobrE = document.getElementById('cobr-filter-estado')?.value;
  if (cobrQ) show = show.filter(c=>(c.cliente||'').toLowerCase().includes(cobrQ)||(c.ot||'').toLowerCase().includes(cobrQ));
  if (cobrE) show = show.filter(c=>c.estado===cobrE);
  const cntEl = document.getElementById('cobr-count');
  if (cntEl) cntEl.textContent = show.length + ' registros';

  document.getElementById('cobr-tbody').innerHTML = show.map(c => {
    const dias = diasDesdeHoy(c.vencimiento);
    const isAlert = c.estado==='Pendiente' && dias >= 0;
    return `<tr class="${isAlert?'alerta-row':''}">
      <td class="strong">${c.ot||'—'}</td><td>${c.cliente||''}</td><td>${c.desc||''}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${c.nrfc||'—'}</td>
      <td style="font-weight:500">${fmtM(c.importe)}</td>
      <td style="color:${isAlert?'var(--red)':'var(--text2)'}">${c.vencimiento||'—'}</td>
      <td>${c.estado==='Cobrado'?'<span class="badge badge-green">Cobrado</span>':isAlert?'<span class="badge badge-red">Vencida</span>':'<span class="badge badge-amber">Pendiente</span>'}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:${isAlert?'var(--red)':''}">${dias!==null?Math.abs(dias)+'d':'—'}</td>
      <td>
        ${c.estado!=='Cobrado'?`<button class="btn btn-ghost btn-sm" onclick="marcarCobrado('${c.id}')">Cobrar</button>`:''}
        <button class="btn-icon" onclick="delCobranza('${c.id}')" style="margin-left:4px"><i class="ti ti-trash" style="font-size:12px"></i></button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text3)">Sin registros.</td></tr>';
};

window.setCobTab = (tab, el) => {
  window.cobTab = tab;
  document.querySelectorAll('.page-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  renderCobranzas();
};

window.marcarCobrado = async id => { await updateDoc_('cobranzas', id, { estado: 'Cobrado' }); showToast('Marcada como cobrada'); };
window.delCobranza = async id => { if(confirm('¿Eliminar?')) await deleteDoc_('cobranzas', id); };

// PRESUPUESTOS
window.renderCotizacionDriveShortcut = function(p) {
  const valid = value => {
    try {
      const url = new URL(String(value || '').trim());
      return url.protocol === 'https:' && ['drive.google.com', 'docs.google.com'].includes(url.hostname) ? url.href : '';
    } catch (_) { return ''; }
  };
  const pdf = valid(p?.cotizacionPdfUrl);
  const folder = valid(p?.cotizacionFolderUrl);
  const icon = '<i class="ti ti-brand-google-drive" style="font-size:15px"></i>';
  if (!pdf && !folder) return `<button class="btn-icon" type="button" disabled title="Todavía no hay PDF ni carpeta de Drive vinculados" aria-label="Drive pendiente" style="margin-left:4px;opacity:.45;cursor:not-allowed">${icon}</button>`;
  const title = pdf ? 'Abrir PDF de esta cotización en Google Drive' : 'Abrir carpeta de análisis de esta cotización en Google Drive';
  const href = (pdf || folder).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<a class="btn-icon" href="${href}" target="_blank" rel="noopener noreferrer" title="${title}" aria-label="${title}" style="display:inline-flex;vertical-align:middle;margin-left:4px;color:var(--green)">${icon}</a>`;
};

function renderPresupuestos() {
  const grupos=new Map();
  (window.DB.presupuestos||[]).forEach(p=>{const k=String(p.nro||'').replace(/\D/g,'')+'|'+normalizarRevisionV354(p.revision||'1.1'),actual=grupos.get(k);if(!actual||p.estado==='Aprobado'&&actual.estado!=='Aprobado')grupos.set(k,p);});
  const pres = [...grupos.values()];
  const aprobados = pres.filter(p=>p.estado==='Aprobado').reduce((a,p)=>a+(+p.importe||0),0);
  const enviados = pres.filter(p=>p.estado==='Enviado').length;

  document.getElementById('pres-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Total presupuestos</div><div class="kpi-val">${pres.length}</div></div>
    <div class="kpi"><div class="kpi-label">Aprobados</div><div class="kpi-val green">${fmtM(aprobados)}</div></div>
    <div class="kpi"><div class="kpi-label">En revisión</div><div class="kpi-val amber">${enviados}</div></div>
  `;

  const map={'Pendiente':'gray','Enviado':'blue','Aprobado':'teal','Entregado':'purple','Cobrado pendiente':'amber','Cobrado':'green'};
  const ordenados=[...pres].sort((a,b)=>{ const na=parseInt(a.nro)||0, nb=parseInt(b.nro)||0; if(nb!==na)return nb-na; const ra=normalizarRevisionV354(a.revision||'1.1').split('.').map(Number), rb=normalizarRevisionV354(b.revision||'1.1').split('.').map(Number); return (rb[0]-ra[0])||(rb[1]-ra[1]); });
  document.getElementById('pres-tbody').innerHTML = ordenados.map(p => `<tr data-presupuesto-id="${p.id}">
    <td class="strong" style="white-space:nowrap">CT ${window.tizNumeroCotizacion(p.nro)} <span class="badge badge-blue">${normalizarRevisionV354(p.revision||'1.1')}</span></td><td>${p.cliente||''}</td><td>${p.desc||''}</td>
    <td>${p.vendedor||''}</td><td style="font-weight:500">${fmtM(p.importe)}</td>
    <td>${p.fecha||'—'}</td><td><span class="badge badge-${map[p.estado]||'gray'}">${p.estado||''}</span></td>
    <td style="white-space:nowrap">
      <button class="btn-icon" onclick="abrirRevisionCotizacionV354('${p.id}',false)" title="Abrir esta revisión"><i class="ti ti-eye" style="font-size:13px"></i></button>
      ${window.renderCotizacionDriveShortcut(p)}
      <button class="btn-icon" onclick="regenerarArchivosCotizacionV65('${p.id}',this)" title="Actualizar PDF y Excel de esta revisión" style="margin-left:4px"><i class="ti ti-refresh" style="font-size:13px"></i></button>
      <button class="btn-icon" onclick="crearNuevaRevisionV354('${p.id}')" title="Crear nueva revisión sin borrar esta" style="margin-left:4px;color:var(--accent)"><i class="ti ti-copy-plus" style="font-size:13px"></i></button>
      <button class="btn-icon" onclick="delPres('${p.id}')" title="Eliminar revisión" style="margin-left:4px"><i class="ti ti-trash" style="font-size:13px"></i></button>
    </td>
  </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3)">Sin presupuestos.</td></tr>';
}

window.delPres = async id => { if(confirm('¿Eliminar?')) await deleteDoc_('presupuestos', id); };
window.editPres = id => {
  const p = window.DB.presupuestos.find(x=>x.id===id);
  if (!p) return;
  window.editingId.presupuesto = id;
  document.getElementById('fp-nro').value=p.nro||'';
  document.getElementById('fp-vend').value=p.vendedor||'G';
  document.getElementById('fp-cliente').value=p.cliente||'';
  document.getElementById('fp-desc').value=p.desc||'';
  document.getElementById('fp-importe').value=p.importe||'';
  document.getElementById('fp-fecha').value=p.fecha||'';
  document.getElementById('fp-estado').value=p.estado||'Enviado';
  document.getElementById('fp-comentarios').value=p.comentarios||'';
  openModal('presupuesto');
};

// CLIENTES
window.renderClientes = function() {
  let clis = [...window.DB.clientes].sort((a,b)=>String(a.razonSocial||a.razon_social||a.nombreFiscal||a.nombre||'').localeCompare(String(b.razonSocial||b.razon_social||b.nombreFiscal||b.nombre||''),'es',{sensitivity:'base'}));
  const q = document.getElementById('filter-cliente2')?.value.toLowerCase();
  if (q) clis = clis.filter(c=>(c.nombre||'').toLowerCase().includes(q)||(c.cuit||'').includes(q));
  document.getElementById('clientes-count').textContent = clis.length + ' clientes';
  document.getElementById('clientes-tbody').innerHTML = clis.map(c => {
    const nombre=c.razonSocial||c.razon_social||c.nombreFiscal||c.nombre||'';
    const obras = window.DB.obras.filter(o=>(o.cliente||'').toLowerCase()===nombre.toLowerCase()).length;
    return `<tr>
      <td class="strong">${nombre}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${c.cuit||'—'}</td>
      <td>${c.contacto||'—'}</td><td>${c.cel||'—'}</td>
      <td style="color:var(--blue)">${c.email||'—'}</td>
      <td><span class="badge badge-blue">${obras}</span></td>
      <td>
        <button class="btn-icon" onclick="asignarClienteAOTV56('${c.id}')" title="Asignar este cliente a una OT"><i class="ti ti-link" style="font-size:13px"></i></button>
        <button class="btn-icon" onclick="editCliente('${c.id}')"><i class="ti ti-edit" style="font-size:13px"></i></button>
        <button class="btn-icon" onclick="delCliente('${c.id}')" style="margin-left:4px"><i class="ti ti-trash" style="font-size:13px"></i></button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">Sin clientes.</td></tr>';
};

window.editCliente = id => {
  const c = window.DB.clientes.find(x=>x.id===id);
  if(!c) return;
  window.editingId.cliente = id;
  document.getElementById('fc-numero').value=c.numeroCliente||c.numero||'';
  document.getElementById('fc-nombre').value=c.nombre||'';
  document.getElementById('fc-cuit').value=c.cuit||'';
  document.getElementById('fc-contacto').value=c.contacto||'';
  document.getElementById('fc-cel').value=c.cel||'';
  document.getElementById('fc-email').value=c.email||'';
  document.getElementById('fc-cargo').value=c.contactoCargo||'';
  const otros=window.TIZClienteContactosV1.list(window.DB,{clienteId:c.id}).filter(x=>window.TIZClienteContactosV1.norm(x.nombre)!==window.TIZClienteContactosV1.norm(c.contacto));
  document.getElementById('fc-contactos').value=otros.map(x=>[x.nombre,x.telefono,x.email,x.cargo].join(' | ')).join('\n');
  window.sugerirContactoFichaClienteV1();
  document.getElementById('fc-notas').value=c.notas||'';
  openModal('cliente');
};
window.delCliente = async id => { if(confirm('¿Eliminar?')) await deleteDoc_('clientes',id); };
window.asignarClienteAOTV56 = async clienteId => {
  const cliente=(window.DB.clientes||[]).find(c=>c.id===clienteId);if(!cliente)return showToast('No se encontró el cliente');
  const nombre=String(cliente.razonSocial||cliente.razon_social||cliente.nombreFiscal||cliente.nombre||'').trim(),cuit=String(cliente.cuit||'').trim();
  if(!cuit)return showToast('Este cliente no tiene CUIT cargado');
  const solicitado=prompt(`Asignar ${nombre} · CUIT ${cuit}\n\nIngresá el número de OT:`, '4680');if(solicitado===null)return;
  const base=window.tizNumeroBase(solicitado),obra=(window.DB.obras||[]).find(o=>window.tizNumeroBase(o.ot)===base);if(!obra)return showToast('No se encontró la OT '+base);
  if(!confirm(`Confirmar cambio de cliente\n\nOT: ${base}\nCliente actual: ${obra.cliente||'—'}\nCliente nuevo: ${nombre}\nCUIT: ${cuit}\n\nNo se modificarán importes ni estados.`))return;
  try{
    await updateDoc_('obras',obra.id,{cliente:nombre,clienteId:cliente.id,clienteCuit:cuit});
    const ids=new Set([obra.presupuestoId,obra.cotizacionId].filter(Boolean));
    const vinculadas=(window.DB.presupuestos||[]).filter(p=>p.obraId===obra.id||ids.has(p.id)||window.tizNumeroBase(p.nro)===base);
    for(const p of vinculadas){await updateDoc_('presupuestos',p.id,{cliente:nombre,clienteId:cliente.id,clienteCuit:cuit});p.cliente=nombre;p.clienteId=cliente.id;p.clienteCuit=cuit}
    obra.cliente=nombre;obra.clienteId=cliente.id;obra.clienteCuit=cuit;showToast(`OT ${base} vinculada a ${nombre} ✓`);window.renderClientes();
  }catch(e){console.error(e);showToast('No se pudo vincular el cliente a la OT')}
};

window.saveCliente = async () => {
  const nombre = document.getElementById('fc-nombre').value.trim();
  if (!nombre) { showToast('Ingresá el nombre del cliente'); return; }
  const data = {
    nombre,
    cuit: document.getElementById('fc-cuit').value.trim(),
    contacto: document.getElementById('fc-contacto').value.trim(),
    cel: document.getElementById('fc-cel').value.trim(),
    email: document.getElementById('fc-email').value.trim(),
    notas: document.getElementById('fc-notas')?.value.trim() || '',
  };
  const id = window.editingId.cliente;
  if (id) await updateDoc_('clientes', id, data);
  else await addDoc_('clientes', data);
  // Si vino desde presupuesto, actualizar campo cliente del presupuesto
  const fCliente = document.getElementById('f-cliente');
  if (fCliente && !id) fCliente.value = nombre;
  if (window._volvioDePresupuesto && !id) {
    document.getElementById('pp-cliente').value = nombre;
    window._volvioDePresupuesto = false;
  }
  closeModal('cliente');
  showToast(id ? 'Cliente actualizado' : 'Cliente guardado ✓');
};

// RETENCIONES
function renderRetenciones() {
  const rets = window.TIZFacturacionCobranzasDataV2?.retentionRows?.() || window.DB.retenciones || [];
  const retained = r => r.retencionesTotal ?? ((+r.suss||0)+(+r.iibb||0)+(+r.gan||0)+(+r.iva||0));
  const escRet = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const totalBruto = rets.reduce((a,r)=>a+(+r.bruto||0),0);
  const totalRet = rets.reduce((a,r)=>a+retained(r),0);

  document.getElementById('ret-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Total bruto</div><div class="kpi-val">${fmtM(totalBruto)}</div></div>
    <div class="kpi"><div class="kpi-label">Total retenido</div><div class="kpi-val red">${fmtM(totalRet)}</div></div>
    <div class="kpi"><div class="kpi-label">Neto recibido</div><div class="kpi-val green">${fmtM(totalBruto-totalRet)}</div></div>
  `;

  document.getElementById('ret-tbody').innerHTML = rets.map(r => {
    const neto = (+r.bruto||0)-retained(r);
    return `<tr>
      <td>${escRet(r.mes||'—')}</td><td class="strong">${escRet(r.cliente||'')}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${escRet(r.nrfc||'—')}</td>
      <td>${fmtM(r.bruto)}</td>
      <td style="color:${r.suss?'var(--red)':'var(--text3)'}">${r.suss?fmtM(r.suss):'—'}</td>
      <td style="color:${r.iibb?'var(--red)':'var(--text3)'}">${r.iibb?fmtM(r.iibb):'—'}</td>
      <td style="color:${r.gan?'var(--red)':'var(--text3)'}">${r.gan?fmtM(r.gan):'—'}</td>
      <td style="color:${r.iva?'var(--red)':'var(--text3)'}">${r.iva?fmtM(r.iva):'—'}</td>
      <td style="color:var(--green);font-weight:500">${fmtM(neto)}</td>
      <td>${r.automatica?`<span class="badge" title="Registrada desde Cobros${r.referencia?' · '+escRet(r.referencia):''}">Cobro OT ${escRet(r.ot)}</span>`:`<button class="btn-icon" onclick="delRet('${r.id}')"><i class="ti ti-trash" style="font-size:12px"></i></button>`}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text3)">Sin retenciones.</td></tr>';
}
window.delRet = async id => { if(confirm('¿Eliminar?')) await deleteDoc_('retenciones',id); };

// VENDEDORES
function renderVendedores() {
  const obras = window.DB.obras;
  const vends = [...new Set(obras.map(o=>o.vendedor).filter(Boolean))];

  document.getElementById('vend-cards').innerHTML = vends.map(v => {
    const wo = obras.filter(o=>o.vendedor===v||o.vendedor===v);
    const neto = wo.reduce((a,o)=>a+(+o.neto||0),0);
    const cobr = wo.filter(o=>o.estado==='Cobrado').reduce((a,o)=>a+(+o.neto||0),0);
    return `<div class="sector-card">
      <div class="sector-card-name" style="color:var(--accent)">${v}</div>
      <div class="sector-card-num">${wo.length}</div>
      <div class="sector-card-money">${fmtM(neto)}</div>
      <div class="sector-card-sub">Cobrado: ${fmtM(cobr)}</div>
    </div>`;
  }).join('');

  document.getElementById('vend-tbody').innerHTML = vends.map(v => {
    const wo = obras.filter(o=>o.vendedor===v);
    const neto = wo.reduce((a,o)=>a+(+o.neto||0),0);
    const cobr = wo.filter(o=>o.estado==='Cobrado').reduce((a,o)=>a+(+o.neto||0),0);
    const pctCobr = neto ? Math.round(cobr/neto*100) : 0;
    const pp = pct(wo.filter(o=>o.fprod_c),'prod');
    const pc = pct(wo.filter(o=>o.fcol_c),'col');
    return `<tr>
      <td class="strong" style="color:var(--accent)">${v}</td>
      <td>${wo.length}</td><td>${fmtM(neto)}</td><td>${fmtM(cobr)}</td>
      <td><span class="badge badge-${pctCobr>=80?'green':pctCobr>=50?'amber':'red'}">${pctCobr}%</span></td>
      <td>${pp!==null?`<span class="badge badge-${pp>=80?'green':pp>=60?'amber':'red'}">${pp}%</span>`:'—'}</td>
      <td>${pc!==null?`<span class="badge badge-${pc>=80?'green':pc>=60?'amber':'red'}">${pc}%</span>`:'—'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">Sin datos de vendedores.</td></tr>';
}

// MODALES
window.openModal = (type) => {
  if (type==='cliente' && !window.editingId.cliente) {
    const n = document.getElementById('fc-numero'); if(n) n.value = nextClienteNumero();
    ['fc-nombre','fc-cuit','fc-contacto','fc-cel','fc-email','fc-cargo','fc-contactos','fc-notas'].forEach(i=>{ const el=document.getElementById(i); if(el) el.value=''; });
  }
  if (type==='obra') {
    if (!window.editingId.obra) {
      ['f-desc','f-cliente','f-neto','f-bruto','f-gastos','f-fprod-c','f-fprod-r','f-fcol-c','f-fcol-r','f-oc','f-nrfc','f-ffc','f-comentarios','f-dias-pago'].forEach(i=>{ const el=document.getElementById(i); if(el) el.value=''; });
      // Sugerir siguiente número de OT
      const otNros = window.DB.obras.map(o=>parseInt(o.ot)||0).filter(n=>n>0);
      const maxOT = otNros.length ? Math.max(...otNros) : 4400;
      document.getElementById('f-ot').value = maxOT + 1;
      document.getElementById('f-semana').value = getSemanaActual();
      document.getElementById('f-sector').value = 'Producción';
      document.getElementById('f-vendedor').value = 'G';
      document.getElementById('f-estado').value = 'Pendiente';
      document.getElementById('modal-obra-title').textContent = 'Nueva obra';
      window.obraItems = [{descripcion:'', cantidad:1, unitario:0, subtotal:0, observaciones:''}];
      window.calculosAuxiliares = [];
      renderObraItems(); renderCalculosAux();
      ['Producción','Colocaciones','Diseño','Ventas','Compras','Calidad'].forEach(s => {
        const el = document.getElementById('nota-'+s.toLowerCase().replace(/ó/g,'o').replace(/é/g,'e'));
        if(el) el.value = '';
      });
    }
  }
  document.getElementById('modal-'+type).classList.add('open');
};

window.closeModal = type => {
  document.getElementById('modal-'+type).classList.remove('open');
  if(type==='obra') window.editingId.obra = null;
};

window.editObra = id => {
  const o = window.DB.obras.find(x=>x.id===id); if(!o) return;
  window.editingId.obra = id;
  document.getElementById('obra-id').value = id;
  document.getElementById('f-ot').value = o.ot||'';
  document.getElementById('f-sector').value = o.sector||'Producción';
  document.getElementById('f-desc').value = o.desc||'';
  document.getElementById('f-cliente').value = o.cliente||'';
  { const input=document.getElementById('f-cliente'),norm=v=>String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''),fiscal=c=>c.razonSocial||c.razon_social||c.nombreFiscal||c.nombre||'',cli=(window.DB.clientes||[]).find(c=>c.id===o.clienteId||norm(fiscal(c))===norm(o.cliente)||norm(c.nombre)===norm(o.cliente)); if(input){input.dataset.clienteId=cli?.id||o.clienteId||'';input.dataset.clienteCuit=cli?.cuit||o.clienteCuit||''} const info=document.getElementById('f-cliente-cuit');if(info)info.textContent=(cli?.cuit||o.clienteCuit)?'CUIT '+(cli?.cuit||o.clienteCuit):'Seleccioná un cliente de la lista para vincular su CUIT'; }
  document.getElementById('f-vendedor').value = o.vendedor||'G';
  document.getElementById('f-estado').value = o.estado||'Pendiente';
  document.getElementById('f-semana').value = o.semana||'';
  document.getElementById('f-neto').value = o.neto||'';
  document.getElementById('f-bruto').value = o.bruto||'';
  document.getElementById('f-gastos').value = o.gastos||'';
  document.getElementById('f-fprod-c').value = o.fprod_c||'';
  document.getElementById('f-fprod-r').value = o.fprod_r||'';
  document.getElementById('f-fcol-c').value = o.fcol_c||'';
  document.getElementById('f-fcol-r').value = o.fcol_r||'';
  document.getElementById('f-oc').value = o.oc||'';
  document.getElementById('f-nrfc').value = o.nrfc||'';
  document.getElementById('f-ffc').value = o.ffc||'';
  document.getElementById('f-cobr').value = o.cobr||'Pendiente';
  document.getElementById('f-dias-pago').value = o.diasPago||'';
  document.getElementById('f-comentarios').value = o.comentarios||'';
  document.getElementById('modal-obra-title').textContent = 'Editar obra — ' + (o.ot||o.desc||'');
  window.obraItems = Array.isArray(o.itemsCotizados) && o.itemsCotizados.length ? o.itemsCotizados : [{descripcion:o.desc||'', cantidad:1, unitario:+o.neto||0, subtotal:+o.neto||0, observaciones:''}];
  window.calculosAuxiliares = Array.isArray(o.calculosAuxiliares) ? o.calculosAuxiliares : [];
  renderObraItems(); renderCalculosAux();

  // Cargar anotaciones por sector
  const notas = o.notas_sector || {};
  const sectorKeys = {
    'Producción':'produccion','Colocaciones':'colocaciones','Diseño':'diseno','Ventas':'ventas','Compras':'compras','Calidad':'calidad'
  };
  Object.entries(sectorKeys).forEach(([sec, key]) => {
    const el = document.getElementById('nota-'+key);
    if(el) {
      el.value = notas[sec] || '';
      // Mostrar timestamp si existe
      const ts = document.getElementById('nota-ts-'+key);
      if(ts) ts.textContent = notas[sec+'_ts'] ? '— ' + notas[sec+'_ts'] : '';
    }
  });

  document.getElementById('modal-obra').classList.add('open');
};

window.delObra = async id => { if(confirm('¿Eliminar esta obra?')) await deleteDoc_('obras',id); };
window.quickChangeEstado = async (id, val) => {
  const obra = window.DB.obras.find(o => o.id === id);
  const data = { ...(obra || {}), estado: val, cobr: val, firestoreId: id };
  await updateDoc_('obras', id, { estado: val, cobr: val, historial: window.buildHistorialV58 ? window.buildHistorialV58(obra, val) : (obra?.historial || []) });
  if (String(val || '').toLowerCase() === 'aprobado') {
    if (!obra?.autoTasksCreatedAt && window.crearTareasAutomaticasV58) { await window.crearTareasAutomaticasV58({...obra, estado:val, id}); await updateDoc_('obras', id, { autoTasksCreatedAt: new Date().toISOString() }); } 
    showToast('Actualizando estado...');
    const syncResult = await syncToSheets(data);
    if (syncResult?.driveFolderUrl || syncResult?.otSheetUrl) {
      await updateDoc_('obras', id, {
        driveFolderId: syncResult.folderId || syncResult.driveFolderId || '',
        driveFolderUrl: syncResult.driveFolderUrl || '',
        otSheetUrl: syncResult.otSheetUrl || '',
        driveSyncedAt: new Date().toISOString()
      });
      showToast('Carpeta de OT creada ✓');
    } else {
      showToast('Estado actualizado: Aprobado');
    }
  } else {
    showToast('Estado actualizado: ' + val);
  }
};

window.limpiarFiltros = () => {
  ['filter-ot','filter-cliente','filter-semana-desde','filter-semana-hasta'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  const fe = document.getElementById('filter-estado'); if(fe) fe.value = '';
  window.obrasSectorFilter = 'Todos';
  renderObras();
};

// EXPORTAR EXCEL
window.exportarExcel = () => {
  const obras = [...window.DB.obras].sort((a,b)=>(+b.semana||0)-(+a.semana||0));
  if (!obras.length) { showToast('No hay obras para exportar'); return; }
  const headers = ['Fecha','Semana','OT','Descripción','Arquitecto','Cliente','Sector','Vendedor',
    'Estado','Neto','Bruto','Gastos','F.Prod.Comp','F.Prod.Real','F.Col.Comp','F.Col.Real',
    'OC/OP','Nro Factura','F.Factura','Estado Cobranza','Comentarios',
    'Nota Producción','Nota Colocaciones','Nota Diseño','Nota Ventas','Nota Compras','Nota Calidad'];
  const rows = obras.map(o => {
    const n = o.notas_sector||{};
    return [o.fecha||'',o.semana||'',o.ot||'',o.desc||'',o.arquitecto||'',o.cliente||'',
      o.sector||'',o.vendedor||'',o.estado||'',+o.neto||0,+o.bruto||0,+o.gastos||0,
      o.fprod_c||'',o.fprod_r||'',o.fcol_c||'',o.fcol_r||'',o.oc||'',o.nrfc||'',o.ffc||'',
      o.cobr||'',o.comentarios||'',n['Producción']||'',n['Colocaciones']||'',n['Diseño']||'',n['Ventas']||'',n['Compras']||'',n['Calidad']||''];
  });
  const doExport = () => {
    const ws = window.XLSX.utils.aoa_to_sheet([headers,...rows]);
    ws['!cols'] = headers.map((_,i)=>({wch:i<=2?8:i<=4?30:i<=7?15:25}));
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb,ws,'Obras 2026');
    const fecha = new Date().toLocaleDateString('es-AR').replace(/\//g,'-');
    window.XLSX.writeFile(wb,`TIZ_Obras_${fecha}.xlsx`);
    showToast(`${obras.length} obras exportadas a Excel`);
  };
  if (!window.XLSX) {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = doExport;
    document.head.appendChild(s);
  } else { doExport(); }
};

// CARGAR COBRANZAS DESDE OTs
window.cargarDesdeOTs = async () => {
  const obrasOK = window.DB.obras.filter(o=>['Entregado','Facturado'].includes(o.estado)&&+o.neto>0);
  if (!obrasOK.length) { showToast('No hay obras entregadas/facturadas'); return; }
  const otsCargadas = new Set(window.DB.cobranzas.map(c=>c.ot).filter(Boolean));
  const nuevas = obrasOK.filter(o=>!o.ot||!otsCargadas.has(o.ot));
  if (!nuevas.length) { showToast('Todas las OTs ya están en cobranzas'); return; }
  if (!confirm(`¿Agregar ${nuevas.length} obra(s) a cobranzas?`)) return;
  for (const o of nuevas) {
    await addDoc_('cobranzas',{ot:o.ot||'',cliente:o.cliente||'',desc:o.desc||'',
      nrfc:o.nrfc||'',importe:+o.neto||0,vencimiento:'',fechaCobro:'',estado:'Pendiente',comentarios:''});
  }
  showToast(`${nuevas.length} obras cargadas en cobranzas`);
};

// NÚMERO AUTOMÁTICO DE PRESUPUESTO
window.abrirPresupuestoPDF = () => {
  window._presupuestoOrigen = 'obra';
  const obraId = window.editingId.obra;
  const obra = obraId ? window.DB.obras.find(x=>x.id===obraId) : null;
  const presNros = window.DB.presupuestos.map(p=>parseInt(p.nro)||0);
  const otNros = window.DB.obras.map(o=>parseInt(o.ot)||0);
  const maxNro = Math.max(4695,...presNros,...otNros);
  document.getElementById('pp-nro').value = (maxNro+1).toString().padStart(4,'0');
  document.getElementById('pp-cliente').value = obra?.cliente||'';
  document.getElementById('pp-desc').value = obra?.desc||'';
  document.getElementById('pp-nota').value = 'Los precios cotizados se encuentran a valores netos';
  document.getElementById('pp-condicion').value = 'Anticipo 50% Saldo a contraentrega';
  document.getElementById('pp-validez').value = '7';
  window.ppItems = obra?[{desc:obra.desc||'',precio:+obra.neto||0,cant:1}]:[{desc:'',precio:0,cant:1}];
  window.ppCalculosAux = obra?.calculosAuxiliares?.length ? obra.calculosAuxiliares.map(it=>({...it})) : [{concepto:'Materiales',detalle:'',cantidad:1,unidad:'u',precioUnitario:0,total:0,observaciones:''}];
  renderPPItems(); renderCalculosAuxPP();
  document.getElementById('modal-prespdf').classList.add('open');
};

// Autocomplete cliente para presupuesto — V35.6
// Fuente unificada: Clientes + Obras + Presupuestos + Base Madre histórica.
// Así no dependemos de que el cliente haya sido cargado manualmente en la colección Clientes.
window.sugerirClientesPP = (q='', mostrarAunqueVacio=false) => {
  const dd = document.getElementById('pp-clientes-dropdown');
  if (!dd) return;

  const texto = String(q||'').trim();
  const norm = v => String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const mapa = new Map();

  const agregar = (nombre, cuit='', fuente='', peso=1) => {
    nombre = String(nombre||'').trim();
    if (!nombre) return;
    const k = norm(nombre);
    if (!k) return;
    const actual = mapa.get(k);
    if (!actual) mapa.set(k,{nombre,cuit:cuit||'',fuentes:new Set(fuente?[fuente]:[]),peso});
    else {
      if (!actual.cuit && cuit) actual.cuit=cuit;
      if (fuente) actual.fuentes.add(fuente);
      actual.peso += peso;
    }
  };

  // 1) Maestro de clientes de Firebase
  (window.DB?.clientes||[]).forEach(c=>agregar(c.nombre,c.cuit,'Clientes',20));
  // 2) Obras ya cargadas en Firebase
  (window.DB?.obras||[]).forEach(o=>agregar(o.cliente,'','Obras',4));
  // 3) Presupuestos/cotizaciones históricas de Firebase
  (window.DB?.presupuestos||[]).forEach(p=>agregar(p.cliente,'','Cotizaciones',6));
  // 4) Base Madre incluida en la app (contiene el histórico, ej. Farmacity)
  (window.OBRAS_MADRE_V291||[]).forEach(o=>agregar(o.cliente,'','Base Madre',2));

  let todos=[...mapa.values()];
  const nq=norm(texto);
  if (nq) todos=todos.filter(c=>norm(c.nombre).includes(nq));
  else if (!mostrarAunqueVacio) { dd.style.display='none'; return; }

  // Primero coincidencias que comienzan con lo escrito; luego frecuencia/relevancia.
  todos.sort((a,b)=>{
    if(nq){
      const ai=norm(a.nombre).startsWith(nq)?0:1, bi=norm(b.nombre).startsWith(nq)?0:1;
      if(ai!==bi) return ai-bi;
    }
    return b.peso-a.peso || a.nombre.localeCompare(b.nombre,'es');
  });
  const matches=todos.slice(0,12);

  let html = matches.map(c=>{
    const fuente=[...c.fuentes].join(' · ');
    const sub=c.cuit?`CUIT: ${c.cuit}${fuente?' · '+fuente:''}`:(fuente||'Histórico');
    return `<div class="cli-option" onmousedown="elegirClientePP('${c.nombre.replace(/'/g,"\\'")}')">
      <span>${texto?resaltar(c.nombre,texto):c.nombre}</span>
      <span class="cli-option-sub">${sub}</span>
    </div>`;
  }).join('');

  if (!matches.length && texto) {
    html = `<div class="cli-option" style="cursor:default;color:var(--text3)"><span>Sin coincidencias guardadas</span></div>`;
  }
  if (texto) html += `<div class="cli-option" onmousedown="nuevoClienteDesdePresupuesto('${texto.replace(/'/g,"\\'")}')" style="border-top:1px solid var(--border);color:var(--accent)">
    <span>➕ Crear cliente "<strong>${texto}</strong>"</span>
    <span class="cli-option-sub" style="color:var(--accent)">Abre el formulario de nuevo cliente</span>
  </div>`;

  dd.innerHTML = html || '<div class="cli-option" style="cursor:default;color:var(--text3)">Todavía no hay clientes disponibles</div>';
  dd.style.display = 'block';
};
window.elegirClientePP = nombre => {
  document.getElementById('pp-cliente').value = nombre;
  document.getElementById('pp-clientes-dropdown').style.display = 'none';
  window.sugerirContactoClientePP?.();window.sugerirRetiraClientePP?.();
};
window.cerrarSugerenciasPP = () => {
  const dd = document.getElementById('pp-clientes-dropdown');
  if(dd) dd.style.display = 'none';
};
window.nuevoClienteDesdePresupuesto = nombre => {
  cerrarSugerenciasPP();
  document.getElementById('pp-cliente').value = nombre;
  window.editingId.cliente = null;
  document.getElementById('fc-numero').value = nextClienteNumero();
  document.getElementById('fc-nombre').value = nombre;
  ['fc-cuit','fc-contacto','fc-cel','fc-email','fc-cargo','fc-contactos','fc-notas'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  window._volvioDePresupuesto = true;
  document.getElementById('modal-cliente').classList.add('open');
};

// Selector y guardado directo de cliente desde Obras — V55.
// La versión integrada de index no tenía estas funciones, aunque el campo las invocaba.
window.sugerirClientes = q => {
  const dd=document.getElementById('clientes-dropdown');if(!dd)return;
  const norm=v=>String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const fiscal=c=>String(c.razonSocial||c.razon_social||c.nombreFiscal||c.nombre||'').trim();
  const texto=String(q||'').trim(),nq=norm(texto);if(!nq){dd.style.display='none';return}
  const clientes=(window.DB.clientes||[]).map(c=>({id:c.id,nombre:fiscal(c),alias:String(c.nombre||'').trim(),cuit:String(c.cuit||'').trim()})).filter(c=>c.nombre&&(norm(c.nombre).includes(nq)||norm(c.alias).includes(nq)||c.cuit.includes(texto))).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'})).slice(0,12);
  dd.innerHTML=clientes.map((c,i)=>`<div class="cli-option" data-obra-cliente="${i}"><span>${resaltar(c.nombre,texto)}</span><span class="cli-option-sub">${c.cuit?'CUIT: '+c.cuit:'Sin CUIT'}${c.alias&&c.alias!==c.nombre?' · '+c.alias:''}</span></div>`).join('')+`<div class="cli-option" data-nuevo-obra="1" style="border-top:1px solid var(--border);color:var(--accent)"><span>➕ Crear cliente nuevo: <strong>${texto}</strong></span></div>`;
  dd.querySelectorAll('[data-obra-cliente]').forEach(el=>el.addEventListener('mousedown',e=>{e.preventDefault();const c=clientes[+el.dataset.obraCliente];if(c)window.elegirCliente(c.nombre,c.id,c.cuit)}));
  dd.querySelector('[data-nuevo-obra]')?.addEventListener('mousedown',e=>{e.preventDefault();window.nuevoClienteDesdeObra(texto)});dd.style.display='block';
};
window.elegirCliente=(nombre,id='',cuit='')=>{const input=document.getElementById('f-cliente');if(input){input.value=nombre;input.dataset.clienteId=id;input.dataset.clienteCuit=cuit}const info=document.getElementById('f-cliente-cuit');if(info)info.textContent=cuit?'Razón social seleccionada · CUIT '+cuit:'Cliente sin CUIT vinculado';const dd=document.getElementById('clientes-dropdown');if(dd)dd.style.display='none'};
window.cerrarSugerencias=()=>{const dd=document.getElementById('clientes-dropdown');if(dd)dd.style.display='none'};
window.nuevoClienteDesdeObra=nombre=>{window.cerrarSugerencias();window.editingId.cliente=null;document.getElementById('fc-numero').value=nextClienteNumero();document.getElementById('fc-nombre').value=nombre||'';['fc-cuit','fc-contacto','fc-cel','fc-email','fc-cargo','fc-contactos','fc-notas'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});document.getElementById('modal-cliente').classList.add('open')};
window.guardarClienteObraV55=async()=>{
  const obraId=window.editingId?.obra,input=document.getElementById('f-cliente');if(!obraId||!input)return showToast('No hay una obra abierta');
  const norm=v=>String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''),fiscal=c=>String(c.razonSocial||c.razon_social||c.nombreFiscal||c.nombre||'').trim();
  const cliente=(window.DB.clientes||[]).find(c=>c.id===input.dataset.clienteId||norm(fiscal(c))===norm(input.value)||norm(c.nombre)===norm(input.value));
  if(!cliente)return showToast('Seleccioná un cliente existente de la lista');const nombre=fiscal(cliente),cuit=String(cliente.cuit||'').trim();if(!cuit)return showToast('El cliente seleccionado no tiene CUIT cargado');
  const obra=(window.DB.obras||[]).find(o=>o.id===obraId);input.disabled=true;
  try{await updateDoc_('obras',obraId,{cliente:nombre,clienteId:cliente.id,clienteCuit:cuit});const ids=new Set([obra?.presupuestoId,obra?.cotizacionId].filter(Boolean));const vinculadas=(window.DB.presupuestos||[]).filter(p=>p.obraId===obraId||ids.has(p.id));for(const p of vinculadas){await updateDoc_('presupuestos',p.id,{cliente:nombre,clienteId:cliente.id,clienteCuit:cuit});p.cliente=nombre;p.clienteId=cliente.id;p.clienteCuit=cuit}if(obra){obra.cliente=nombre;obra.clienteId=cliente.id;obra.clienteCuit=cuit}const info=document.getElementById('f-cliente-cuit');if(info)info.textContent='Guardado · CUIT '+cuit;showToast('Cliente y CUIT actualizados en Obra y Presupuesto ✓')}catch(e){console.error(e);showToast('No se pudo guardar el cliente')}finally{input.disabled=false}
};

// ============================================================
// ÍTEMS DE OBRA + CÁLCULOS AUXILIARES
// ============================================================
window.obraItems = window.obraItems || [{descripcion:'', cantidad:1, unitario:0, subtotal:0, observaciones:''}];
window.calculosAuxiliares = window.calculosAuxiliares || [];

function moneyInput(v){ return Number.isFinite(+v) ? +v : 0; }
function fmtPesoObra(n){ return '$' + Math.round(+n || 0).toLocaleString('es-AR'); }

window.addObraItem = () => {
  window.obraItems = collectObraItems();
  window.obraItems.push({descripcion:'', cantidad:1, unitario:0, subtotal:0, observaciones:''});
  renderObraItems();
};
window.removeObraItem = idx => {
  window.obraItems = collectObraItems();
  window.obraItems.splice(idx,1);
  if (!window.obraItems.length) window.obraItems.push({descripcion:'', cantidad:1, unitario:0, subtotal:0, observaciones:''});
  renderObraItems();
};
window.renderObraItems = () => {
  const wrap = document.getElementById('obra-items-list');
  if (!wrap) return;
  const items = window.obraItems || [];
  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 80px 115px 115px 34px;gap:6px;margin-bottom:5px;font-size:10px;color:var(--text3);text-transform:uppercase">
      <span>Descripción</span><span>Cant.</span><span>$ Unit.</span><span>Subtotal</span><span></span>
    </div>
    ${items.map((it,i)=>`
      <div class="obra-item-row" data-idx="${i}" style="display:grid;grid-template-columns:1fr 80px 115px 115px 34px;gap:6px;margin-bottom:6px;align-items:center">
        <input class="oi-desc" value="${(it.descripcion||'').replace(/"/g,'&quot;')}" placeholder="Ej: letras, lona, vinilo, estructura..." oninput="updateObraTotals()">
        <input class="oi-cant" type="number" step="0.01" value="${it.cantidad ?? 1}" oninput="updateObraTotals()">
        <input class="oi-unit" type="number" step="0.01" value="${it.unitario ?? 0}" oninput="updateObraTotals()">
        <input class="oi-sub" type="number" step="0.01" value="${it.subtotal ?? ((+it.cantidad||0)*(+it.unitario||0))}" oninput="updateObraTotals(true)">
        <button type="button" class="btn-icon" onclick="removeObraItem(${i})" title="Quitar"><i class="ti ti-x" style="font-size:13px"></i></button>
        <input class="oi-obs" value="${(it.observaciones||'').replace(/"/g,'&quot;')}" placeholder="Observaciones internas del ítem" style="grid-column:1 / -1">
      </div>`).join('')}`;
  updateObraTotals();
};
window.collectObraItems = () => {
  return [...document.querySelectorAll('.obra-item-row')].map(row => {
    const cantidad = moneyInput(row.querySelector('.oi-cant')?.value);
    const unitario = moneyInput(row.querySelector('.oi-unit')?.value);
    const subtotalManual = moneyInput(row.querySelector('.oi-sub')?.value);
    const subtotal = subtotalManual || cantidad * unitario;
    return { descripcion: row.querySelector('.oi-desc')?.value.trim() || '', cantidad, unitario, subtotal, observaciones: row.querySelector('.oi-obs')?.value.trim() || '' };
  }).filter(it => it.descripcion || it.subtotal || it.unitario);
};
window.updateObraTotals = (manual=false) => {
  document.querySelectorAll('.obra-item-row').forEach(row => {
    const cant = moneyInput(row.querySelector('.oi-cant')?.value);
    const unit = moneyInput(row.querySelector('.oi-unit')?.value);
    const sub = row.querySelector('.oi-sub');
    if (sub && !manual && document.activeElement !== sub) sub.value = Math.round(cant * unit * 100) / 100;
  });
  const total = collectObraItems().reduce((a,it)=>a+(+it.subtotal||0),0);
  const totalEl = document.getElementById('obra-items-total');
  if (totalEl) totalEl.textContent = fmtPesoObra(total);
  const neto = document.getElementById('f-neto');
  if (neto && total > 0 && (!neto.value || +neto.value===0)) neto.value = Math.round(total);
};

window.addCalculoAux = () => {
  window.calculosAuxiliares = collectCalculosAux();
  window.calculosAuxiliares.push({concepto:'', detalle:'', cantidad:1, unidad:'', precioUnitario:0, total:0, observaciones:''});
  renderCalculosAux();
};
window.removeCalculoAux = idx => {
  window.calculosAuxiliares = collectCalculosAux();
  window.calculosAuxiliares.splice(idx,1);
  renderCalculosAux();
};
window.renderCalculosAux = () => {
  const wrap = document.getElementById('obra-calculos-list');
  if (!wrap) return;
  const items = window.calculosAuxiliares || [];
  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:150px 1fr 70px 75px 105px 105px 34px;gap:6px;margin-bottom:5px;font-size:10px;color:var(--text3);text-transform:uppercase">
      <span>Concepto</span><span>Detalle</span><span>Cant.</span><span>Unidad</span><span>$ Unit.</span><span>Total</span><span></span>
    </div>
    ${items.map((it,i)=>`
      <div class="calc-aux-row" data-idx="${i}" style="display:grid;grid-template-columns:150px 1fr 70px 75px 105px 105px 34px;gap:6px;margin-bottom:6px;align-items:center">
        <input class="ca-concepto" value="${(it.concepto||'').replace(/"/g,'&quot;')}" placeholder="Material/horas/etc" oninput="updateCalculosTotals()">
        <input class="ca-detalle" value="${(it.detalle||'').replace(/"/g,'&quot;')}" placeholder="Detalle del cálculo" oninput="updateCalculosTotals()">
        <input class="ca-cant" type="number" step="0.01" value="${it.cantidad ?? 1}" oninput="updateCalculosTotals()">
        <input class="ca-unidad" value="${(it.unidad||'').replace(/"/g,'&quot;')}" placeholder="m2/hs/u">
        <input class="ca-unit" type="number" step="0.01" value="${it.precioUnitario ?? 0}" oninput="updateCalculosTotals()">
        <input class="ca-total" type="number" step="0.01" value="${it.total ?? ((+it.cantidad||0)*(+it.precioUnitario||0))}" oninput="updateCalculosTotals(true)">
        <button type="button" class="btn-icon" onclick="removeCalculoAux(${i})" title="Quitar"><i class="ti ti-x" style="font-size:13px"></i></button>
        <input class="ca-obs" value="${(it.observaciones||'').replace(/"/g,'&quot;')}" placeholder="Observaciones internas" style="grid-column:1 / -1">
      </div>`).join('') || `<div style="font-size:12px;color:var(--text3);padding:8px 0">Sin cálculos auxiliares cargados todavía.</div>`}`;
  updateCalculosTotals();
};
window.collectCalculosAux = () => {
  return [...document.querySelectorAll('.calc-aux-row')].map(row => {
    const cantidad = moneyInput(row.querySelector('.ca-cant')?.value);
    const precioUnitario = moneyInput(row.querySelector('.ca-unit')?.value);
    const totalManual = moneyInput(row.querySelector('.ca-total')?.value);
    const total = totalManual || cantidad * precioUnitario;
    return { concepto: row.querySelector('.ca-concepto')?.value.trim() || '', detalle: row.querySelector('.ca-detalle')?.value.trim() || '', cantidad, unidad: row.querySelector('.ca-unidad')?.value.trim() || '', precioUnitario, total, observaciones: row.querySelector('.ca-obs')?.value.trim() || '' };
  }).filter(it => it.concepto || it.detalle || it.total || it.precioUnitario);
};
window.updateCalculosTotals = (manual=false) => {
  document.querySelectorAll('.calc-aux-row').forEach(row => {
    const cant = moneyInput(row.querySelector('.ca-cant')?.value);
    const unit = moneyInput(row.querySelector('.ca-unit')?.value);
    const total = row.querySelector('.ca-total');
    if (total && !manual && document.activeElement !== total) total.value = Math.round(cant * unit * 100) / 100;
  });
  const total = collectCalculosAux().reduce((a,it)=>a+(+it.total||0),0);
  const el = document.getElementById('obra-calculos-total');
  if (el) el.textContent = fmtPesoObra(total);
};

function nextClienteNumero() {
  const nums = window.DB.clientes.map(c => parseInt(String(c.numeroCliente || c.numero || '').replace(/\D/g,''),10)).filter(n => n>0);
  return 'CLI-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4,'0');
}

window.saveObra = async () => {
  const sectorKeys = { 'Producción':'produccion','Colocaciones':'colocaciones','Diseño':'diseno','Ventas':'ventas','Compras':'compras','Calidad':'calidad' };
  const notas_sector = {};
  const existingId = window.editingId.obra;
  const existing = existingId ? window.DB.obras.find(x=>x.id===existingId) : null;
  const existingNotas = existing?.notas_sector || {};
  Object.entries(sectorKeys).forEach(([sec, key]) => {
    const el = document.getElementById('nota-'+key);
    const newVal = el ? el.value.trim() : '';
    const oldVal = existingNotas[sec] || '';
    notas_sector[sec] = newVal;
    notas_sector[sec+'_ts'] = (newVal !== oldVal && newVal) ? new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : (existingNotas[sec+'_ts'] || '');
  });
  const itemsCotizados = collectObraItems();
  const calculosAuxiliares = collectCalculosAux();
  const totalItems = itemsCotizados.reduce((a,it)=>a+(+it.subtotal||0),0);
  const data = {
    ot: document.getElementById('f-ot').value.trim(), sector: document.getElementById('f-sector').value,
    desc: document.getElementById('f-desc').value.trim(), cliente: document.getElementById('f-cliente').value.trim(),
    vendedor: document.getElementById('f-vendedor').value, estado: document.getElementById('f-estado').value,
    semana: +document.getElementById('f-semana').value||0, neto: +document.getElementById('f-neto').value||totalItems||0,
    bruto: +document.getElementById('f-bruto').value||0, gastos: +document.getElementById('f-gastos').value||0,
    fprod_c: document.getElementById('f-fprod-c').value.trim(), fprod_r: document.getElementById('f-fprod-r').value.trim(),
    fcol_c: document.getElementById('f-fcol-c').value.trim(), fcol_r: document.getElementById('f-fcol-r').value.trim(),
    oc: document.getElementById('f-oc').value.trim(), nrfc: document.getElementById('f-nrfc').value.trim(), ffc: document.getElementById('f-ffc').value.trim(),
    cobr: document.getElementById('f-cobr').value, diasPago: +document.getElementById('f-dias-pago').value||0,
    comentarios: document.getElementById('f-comentarios').value.trim(), notas_sector,
    itemsCotizados, calculosAuxiliares, totalItems,
    validacionCotizacion: window.analizaCotizacionMinimaTIZ ? window.analizaCotizacionMinimaTIZ({cliente:getValue('f-cliente'), desc:getValue('f-desc'), comentarios:getValue('f-comentarios'), sector:getValue('f-sector'), estado:getValue('f-estado'), neto:+getValue('f-neto')||totalItems||0, itemsCotizados, calculosAuxiliares}) : null,
    totalCalculosAuxiliares: calculosAuxiliares.reduce((a,it)=>a+(+it.total||0),0),
    checklist: window.collectChecklistV58 ? window.collectChecklistV58() : (existing?.checklist || {}),
      historial: window.buildHistorialV58 ? window.buildHistorialV58(existing, estado) : (existing?.historial || []),
      alertasDetectadas: window.analizaObraV58 ? window.analizaObraV58({ estado, cliente:getValue('f-cliente'), desc:getValue('f-desc'), ot:getValue('f-ot'), itemsCotizados, neto:+getValue('f-neto')||totalItems||0, fprod_c:getValue('f-fprod-c'), fcol_c:getValue('f-fcol-c'), oc:getValue('f-oc'), driveFolderUrl: existing?.driveFolderUrl || '', checklist: window.collectChecklistV58 ? window.collectChecklistV58() : {} }).problemas : [],
      driveFolderUrl: existing?.driveFolderUrl || '', otSheetUrl: existing?.otSheetUrl || '', otExcelUrl: existing?.otExcelUrl || '',
  };
  if (!data.desc) { showToast('Ingresá una descripción'); return; }
  let docRefId = existingId;
  if (existingId) await updateDoc_('obras', existingId, data);
  else { const ref = await addDoc_('obras', data); docRefId = ref?.id || null; }
  if (existingId && existing && existing.cliente !== data.cliente) {
    const ids=new Set([existing.presupuestoId,existing.cotizacionId].filter(Boolean));
    const vinculadas=(window.DB.presupuestos||[]).filter(p=>p.obraId===existingId||ids.has(p.id));
    for (const p of vinculadas) {
      await updateDoc_('presupuestos',p.id,{cliente:data.cliente,nombreArchivo:window.tizCotizacionNombreBaseV354?.(p.nro,data.cliente,p.desc,p.revision||'1.1')||p.nombreArchivo||''});
      p.cliente=data.cliente;
    }
  }
  try {
    const syncResult = await syncToSheets({...data, firestoreId: docRefId});
    if (syncResult?.driveFolderUrl || syncResult?.otSheetUrl) {
      const links = {
          driveFolderId: syncResult.folderId || syncResult.driveFolderId || data.driveFolderId || '',
          driveFolderUrl: syncResult.driveFolderUrl || data.driveFolderUrl || '',
          otSheetUrl: syncResult.otSheetUrl || data.otSheetUrl || '',
          driveSyncedAt: new Date().toISOString()
        };
      if (docRefId) await updateDoc_('obras', docRefId, links);
      if (String(data.estado || '').toLowerCase() === 'aprobado') showToast('Obra aprobada: carpeta Drive creada ✓');
    } else if (String(data.estado || '').toLowerCase() === 'aprobado') {
      showToast('Obra aprobada');
    }
  } catch(e) { console.warn('No se pudo sincronizar Drive/Sheets:', e); }
  closeModal('obra'); showToast(existingId ? 'Obra actualizada' : 'Obra guardada');
};

window.sugerirContactoFichaClienteV1 = () => {
  const core=window.TIZClienteContactosV1,c=(window.DB.clientes||[]).find(c=>c.id===window.editingId.cliente),input=document.getElementById('fc-contacto'),list=document.getElementById('fc-contactos-list');
  const choices=c?core.list(window.DB,{clienteId:c.id}):[];
  list.innerHTML=choices.map(x=>'<option value="'+String(x.nombre).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'"></option>').join('');
  core.fill(input,document.getElementById('fc-cel'),document.getElementById('fc-email'),choices,document.getElementById('fc-cargo'));
};

window.saveCliente = async () => {
  const numeroCliente = document.getElementById('fc-numero')?.value || nextClienteNumero();
  const contactos=(document.getElementById('fc-contactos')?.value||'').split(/\r?\n/).map(line=>{
    const [nombre,telefono,email,cargo]=line.split('|').map(x=>x.trim());return {nombre,telefono:telefono||'',email:email||'',cargo:cargo||''};
  }).filter(x=>x.nombre);
  const data = {
    numeroCliente,
    nombre: document.getElementById('fc-nombre').value.trim(),
    cuit: document.getElementById('fc-cuit').value.trim(),
    contacto: document.getElementById('fc-contacto').value.trim(),
    cel: document.getElementById('fc-cel').value.trim(),
    email: document.getElementById('fc-email').value.trim(),
    contactoCargo: document.getElementById('fc-cargo').value.trim(),
    contactos,
    notas: document.getElementById('fc-notas').value.trim(),
  };
  if(!data.nombre){showToast('Ingresá un nombre');return;}
  const id = window.editingId.cliente;
  const previous=(window.DB.clientes||[]).find(c=>c.id===id),core=window.TIZClienteContactosV1;
  data.contactos=core.merge(contactos,previous&&core.norm(previous.contacto)!==core.norm(data.contacto)?[{nombre:previous.contacto,telefono:previous.cel,email:previous.email,cargo:previous.contactoCargo}]:[]);
  if(id){await updateDoc_('clientes',id,data);Object.assign(previous||{},data);}
  else {const ref=await addDoc_('clientes',data);if(ref?.id&&!window.DB.clientes.some(c=>c.id===ref.id))window.DB.clientes.push({id:ref.id,...data});}
  const fCliente = document.getElementById('f-cliente');
  if (fCliente && document.getElementById('modal-obra')?.classList.contains('open')) fCliente.value = data.nombre;
  const ppCliente = document.getElementById('pp-cliente');
  if (ppCliente && document.getElementById('modal-prespdf')?.classList.contains('open')) ppCliente.value = data.nombre;
  window.editingId.cliente=null;
  window.sugerirContactoClientePP?.();window.sugerirRetiraClientePP?.();
  closeModal('cliente'); showToast(`Cliente ${numeroCliente} guardado`);
};

window.savePresupuesto = async () => {
  const id = window.editingId.presupuesto;
  const existing = id ? window.DB.presupuestos.find(x => x.id === id) : null;
  const data = {
    nro: document.getElementById('fp-nro').value.trim(),
    vendedor: document.getElementById('fp-vend').value,
    cliente: document.getElementById('fp-cliente').value.trim(),
    desc: document.getElementById('fp-desc').value.trim(),
    importe: +document.getElementById('fp-importe').value||0,
    fecha: document.getElementById('fp-fecha').value.trim(),
    estado: document.getElementById('fp-estado').value,
    comentarios: document.getElementById('fp-comentarios').value.trim(),
    driveFolderUrl: existing?.driveFolderUrl || '',
    otSheetUrl: existing?.otSheetUrl || '',
  };
  if (!data.desc) { showToast('Ingresá una descripción'); return; }
  let docRefId = id;
  if(id) await updateDoc_('presupuestos',id,data); else { const ref = await addDoc_('presupuestos',data); docRefId = ref?.id || null; }

  // V35.2: cada cotización tiene su carpeta en ANÁLISIS DE COTIZACIONES.
  // Si luego se aprueba, se crea otra carpeta independiente en ÓRDENES DE TRABAJO.
  // Ambas usan el mismo criterio: N° Cotización - Cliente - Descripción.
  try {
    const cotResult = await syncDriveFolder({
      ...data,
      firestoreId: docRefId,
      ot: data.nro,
      nroCotizacion: data.nro,
      origen: 'presupuesto'
    }, 'cotizacion');
    if (cotResult?.driveFolderUrl && docRefId) {
      await updateDoc_('presupuestos', docRefId, {
        cotizacionFolderUrl: cotResult.driveFolderUrl,
        cotizacionFolderId: cotResult.folderId || cotResult.driveFolderId || '',
        cotizacionFolderName: cotResult.folderName || buildTizFolderName(data.nro, data.cliente, data.desc),
        cotizacionDriveSyncedAt: new Date().toISOString()
      });
    }
  } catch(e) {
    console.warn('[TIZ V35.4] No se pudo crear carpeta de Análisis de Cotizaciones:', e);
  }

  if (String(data.estado || '').toLowerCase() === 'aprobado') {
    try {
      const otPayload = {
        ...data,
        ot: data.nro,
        nroCotizacion: data.nro,
        neto: data.importe,
        totalItems: data.importe,
        sector: data.sector || 'Ventas',
        firestoreId: docRefId,
        origen: 'presupuesto'
      };
      const syncResult = await syncDriveFolder(otPayload, 'ot');
      if (syncResult?.driveFolderUrl && docRefId) {
        await updateDoc_('presupuestos', docRefId, {
          driveFolderUrl: syncResult.driveFolderUrl,
          driveFolderId: syncResult.folderId || syncResult.driveFolderId || '',
          otFolderName: syncResult.folderName || buildTizFolderName(data.nro, data.cliente, data.desc),
          driveSyncedAt: new Date().toISOString()
        });
        showToast('Presupuesto aprobado: carpeta OT creada');
      }
    } catch(e) {
      console.warn('[TIZ V35.4] No se pudo crear carpeta OT:', e);
      showToast('Presupuesto aprobado y guardado');
    }
  }

  window.editingId.presupuesto=null;
  closeModal('presupuesto'); showToast('Presupuesto guardado');
};

window.saveRetencion = async () => {
  const data = {
    mes: document.getElementById('fr-mes').value.trim(),
    cliente: document.getElementById('fr-cliente').value.trim(),
    nrfc: document.getElementById('fr-nrfc').value.trim(),
    bruto: +document.getElementById('fr-bruto').value||0,
    suss: +document.getElementById('fr-suss').value||0,
    iibb: +document.getElementById('fr-iibb').value||0,
    gan: +document.getElementById('fr-gan').value||0,
    iva: +document.getElementById('fr-iva').value||0,
  };
  await addDoc_('retenciones',data);
  closeModal('retencion'); showToast('Retención guardada');
};

window.saveCobranza = async () => {
  const data = {
    ot: document.getElementById('fcob-ot').value.trim(),
    cliente: document.getElementById('fcob-cliente').value.trim(),
    desc: document.getElementById('fcob-desc').value.trim(),
    nrfc: document.getElementById('fcob-nrfc').value.trim(),
    importe: +document.getElementById('fcob-importe').value||0,
    vencimiento: document.getElementById('fcob-venc').value.trim(),
    fechaCobro: document.getElementById('fcob-real').value.trim(),
    estado: document.getElementById('fcob-estado').value,
    comentarios: document.getElementById('fcob-comentarios').value.trim(),
  };
  await addDoc_('cobranzas',data);
  closeModal('cobranza'); showToast('Cobranza registrada');
};

// Toast
window.showToast = msg => {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2800);
};

// ============================================================
// TAREAS
// ============================================================
window.tareaTab = 'pendientes';

window.setTareaTab = (tab, el) => {
  window.tareaTab = tab;
  document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderTareas();
};


// ============================================================
// PRESUPUESTO COMPLETO DESDE PÁGINA PRESUPUESTOS
// ============================================================
window.abrirNuevoPresupuestoCompleto = () => {
  window.editingId.presupuesto = null;
  window.editingId.obra = null;
  window._presupuestoOrigen = 'presupuestos';
  window._cotizacionBaseId = null;
  window._cotizacionRevisionAnteriorId = null;
  window._cotizacionEsRevisionNueva = false;
  const presNros = window.DB.presupuestos.map(p=>parseInt(p.nro)||0).filter(n=>n>0);
  const otNros = window.DB.obras.map(o=>parseInt(o.ot)||0).filter(n=>n>0);
  const maxNro = Math.max(4695, ...presNros, ...otNros);
  document.getElementById('pp-nro').value = (maxNro+1).toString().padStart(4,'0');
  document.getElementById('pp-cliente').value = '';
  document.getElementById('pp-desc').value = '';
  document.getElementById('pp-revision').value = '1.1';
  actualizarIdentificacionCotizacionV354();
  const revBtn = document.getElementById('pp-btn-nueva-revision'); if (revBtn) revBtn.style.display='none';
  document.getElementById('pp-nota').value = 'Los precios cotizados se encuentran a valores netos';
  document.getElementById('pp-condicion').value = 'Anticipo 50% Saldo a contraentrega';
  document.getElementById('pp-validez').value = '7';
  window.ppItems = [{desc:'', precio:0, cant:1}];
  window.ppCalculosAux = [{concepto:'Materiales',detalle:'',cantidad:1,unidad:'u',precioUnitario:0,total:0,observaciones:''}];
  renderPPItems(); renderCalculosAuxPP();
  document.getElementById('modal-prespdf').classList.add('open');
};

window.guardarPresupuestoCompleto = async () => {
  const nro = window.tizNumeroBase(document.getElementById('pp-nro').value) || '0';
  const cliente = document.getElementById('pp-cliente').value.trim();
  const descGeneral = document.getElementById('pp-desc').value.trim();
  const revision = normalizarRevisionV354(document.getElementById('pp-revision')?.value || '1.1');
  const nota = document.getElementById('pp-nota').value.trim();
  const cond = document.getElementById('pp-condicion').value.trim();
  const hoy = new Date().toLocaleDateString('es-AR');
  const items = (window.ppItems||[]).filter(i => (i.desc||'').trim() || (+i.precio||0)>0);
  const calculosAuxiliares = collectCalculosAuxPP();
  const total = round2Presupuesto(items.reduce((a,it)=>a+(+it.precio||0)*(+it.cant||1),0));
  const presupuestoAnterior = window.editingId.presupuesto ? (window.DB.presupuestos||[]).find(p=>p.id===window.editingId.presupuesto) : null;
  if (!cliente) { showToast('Falta cargar el cliente'); return; }
  if (!descGeneral) { showToast('Cargá la descripción general'); return; }
  if (!items.length) { showToast('Agregá al menos un ítem'); return; }

  // V35.4: una revisión es un documento propio. Nunca se actualiza una revisión anterior.
  const existente = (window.DB.presupuestos||[]).find(p => String(p.nro||'').replace(/\D/g,'')===String(nro).replace(/\D/g,'') && normalizarRevisionV354(p.revision||'1.1')===revision && p.id!==window.editingId.presupuesto);
  if (existente && !window.editingId.presupuesto) {
    showToast(`La revisión ${revision} ya existe. Usá “Nueva revisión” para conservar el historial.`);
    return;
  }

  const payload = {
    tipoFacturaSolicitada:document.getElementById('pp-tipo-factura')?.value??presupuestoAnterior?.tipoFacturaSolicitada??'',
    emisorComercial:window.TIZPresupuestoEmisorV1.forSave(presupuestoAnterior),
    nro, revision, cliente, desc: descGeneral || items.map(i=>i.desc).join(' / '),
    importe: total, fecha: hoy, estado: 'Pendiente', nota, cond, items, calculosAuxiliares, totalCalculosAuxiliares:calculosAuxiliares.reduce((a,it)=>a+(+it.total||0),0),
    creadoPor: window.currentUser?.email || '', obraId: window.editingId.obra || '',
    cotizacionBase: String(nro).replace(/\D/g,''),
    revisionAnteriorId: window._cotizacionRevisionAnteriorId || '',
    esRevision: !!window._cotizacionRevisionAnteriorId,
    nombreArchivo: window.tizCotizacionNombreBaseV354(nro, cliente, descGeneral, revision)
  };

  let ref;
  if (window.editingId.presupuesto && !window._cotizacionEsRevisionNueva) {
    // Solo se permite editar el borrador actual; crear una revisión nueva genera otro documento.
    await updateDoc_('presupuestos', window.editingId.presupuesto, payload);
    ref = {id:window.editingId.presupuesto};
  } else {
    ref = await addDoc_('presupuestos', payload);
    window.editingId.presupuesto = ref?.id || null;
    window._cotizacionBaseId = ref?.id || window._cotizacionBaseId;
    window._cotizacionEsRevisionNueva = false;
  }
  if (payload.obraId && presupuestoAnterior && presupuestoAnterior.cliente !== cliente) {
    await updateDoc_('obras', payload.obraId, {cliente});
    const obra=(window.DB.obras||[]).find(o=>o.id===payload.obraId); if(obra) obra.cliente=cliente;
  }
  const revBtn = document.getElementById('pp-btn-nueva-revision'); if (revBtn) revBtn.style.display='inline-flex';
  showToast(`CT ${String(nro).replace(/\D/g,'')} ${revision} guardada sin borrar revisiones anteriores`);
};

// ============================================================
// PRESUPUESTO PDF
// ============================================================
window.normalizarRevisionV354 = function(rev) {
  const m = String(rev||'1.1').trim().match(/^(\d+)\.(\d+)$/);
  return m ? `${parseInt(m[1],10)}.${parseInt(m[2],10)}` : '1.1';
};
function normalizarRevisionV354(rev){ return window.normalizarRevisionV354(rev); }
window.siguienteRevisionV354 = function(rev) {
  const r = normalizarRevisionV354(rev);
  const [mayor, menor] = r.split('.').map(Number);
  return `${mayor}.${menor+1}`;
};
window.actualizarIdentificacionCotizacionV354 = function() {
  const n = window.tizNumeroBase(document.getElementById('pp-nro')?.value)||'0';
  const r = normalizarRevisionV354(document.getElementById('pp-revision')?.value||'1.1');
  const el = document.getElementById('pp-identificacion'); if(el) el.value = `CT ${window.tizNumeroCotizacion(n)} ${r}`;
};
window.abrirRevisionCotizacionV354 = function(id, crearNueva=false) {
  const p = (window.DB.presupuestos||[]).find(x=>x.id===id);
  if(!p) return showToast('No se encontró la cotización');
  window.editingId.presupuesto = crearNueva ? null : id;
  window.editingId.obra = p.obraId || null;
  window._presupuestoOrigen='presupuestos';
  window._cotizacionBaseId = p.cotizacionBaseId || p.id;
  window._cotizacionRevisionAnteriorId = crearNueva ? p.id : (p.revisionAnteriorId||'');
  window._cotizacionEsRevisionNueva = !!crearNueva;
  document.getElementById('pp-nro').value = p.nro||'';
  document.getElementById('pp-cliente').value = p.cliente||'';
  document.getElementById('pp-desc').value = p.desc||'';
  document.getElementById('pp-nota').value = p.nota||'Los precios cotizados se encuentran a valores netos';
  document.getElementById('pp-condicion').value = p.cond||p.condicion||'Anticipo 50% Saldo a contraentrega';
  document.getElementById('pp-validez').value = p.validezDias||7;
  const revActual = normalizarRevisionV354(p.revision||'1.1');
  document.getElementById('pp-revision').value = crearNueva ? window.siguienteRevisionV354(revActual) : revActual;
  window.ppItems = (p.items&&p.items.length) ? p.items.map(it=>({desc:it.desc||it.descripcion||'',precio:+(it.precio??it.unitario)||0,cant:+(it.cant??it.unidades)||1})) : [{desc:p.desc||'',precio:+p.importe||0,cant:1}];
  window.ppCalculosAux = (p.calculosAuxiliares&&p.calculosAuxiliares.length) ? p.calculosAuxiliares.map(it=>({...it})) : [{concepto:'Materiales',detalle:'',cantidad:1,unidad:'u',precioUnitario:0,total:0,observaciones:''}];
  renderPPItems(); renderCalculosAuxPP(); actualizarIdentificacionCotizacionV354();
  const revBtn=document.getElementById('pp-btn-nueva-revision'); if(revBtn) revBtn.style.display=crearNueva?'none':'inline-flex';
  document.getElementById('modal-prespdf').classList.add('open');
  if(crearNueva) showToast(`Nueva revisión ${document.getElementById('pp-revision').value}: copiamos la anterior y no se modifica el original`);
};
window.crearNuevaRevisionV354 = id => window.abrirRevisionCotizacionV354(id,true);
window.crearNuevaRevisionDesdeCotizador = function(){
  const id=window.editingId.presupuesto || window._cotizacionBaseId;
  if(!id) return showToast('Primero guardá la cotización');
  window.crearNuevaRevisionV354(id);
};


// ============================================================
// V35.7 — CÁLCULOS AUXILIARES DEL PRESUPUESTO
// Se guardan con cada revisión y NO forman parte del PDF del cliente.
// ============================================================
window.ppCalculosAux = window.ppCalculosAux || [];
function ppNum(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
function ppMoney(n){ return '$' + Math.round(+n||0).toLocaleString('es-AR'); }
window.collectCalculosAuxPP = function(){
  return [...document.querySelectorAll('.pp-calc-aux-row')].map(row=>{
    const cantidad=ppNum(row.querySelector('.pp-ca-cant')?.value);
    const precioUnitario=ppNum(row.querySelector('.pp-ca-unit')?.value);
    const manual=ppNum(row.querySelector('.pp-ca-total')?.value);
    return {concepto:row.querySelector('.pp-ca-concepto')?.value.trim()||'',detalle:row.querySelector('.pp-ca-detalle')?.value.trim()||'',cantidad,unidad:row.querySelector('.pp-ca-unidad')?.value.trim()||'',precioUnitario,total:manual||cantidad*precioUnitario,observaciones:row.querySelector('.pp-ca-obs')?.value.trim()||''};
  }).filter(it=>it.concepto||it.detalle||it.total||it.precioUnitario||it.observaciones);
};
window.updateCalculosAuxPP=function(manual=false){
  document.querySelectorAll('.pp-calc-aux-row').forEach(row=>{
    const cant=ppNum(row.querySelector('.pp-ca-cant')?.value), unit=ppNum(row.querySelector('.pp-ca-unit')?.value), total=row.querySelector('.pp-ca-total');
    if(total && !manual && document.activeElement!==total) total.value=Math.round(cant*unit*100)/100;
  });
  const total=window.collectCalculosAuxPP().reduce((a,it)=>a+(+it.total||0),0);
  const el=document.getElementById('pp-calculos-total'); if(el) el.textContent=ppMoney(total);
};
window.renderCalculosAuxPP=function(){
  const wrap=document.getElementById('pp-calculos-list'); if(!wrap) return;
  const items=window.ppCalculosAux||[];
  const eh=v=>String(v??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  wrap.innerHTML=`<div style="display:grid;grid-template-columns:140px 1fr 70px 70px 105px 105px 34px;gap:6px;margin-bottom:5px;font-size:10px;color:var(--text3);text-transform:uppercase"><span>Concepto</span><span>Detalle</span><span>Cant.</span><span>Unidad</span><span>$ Unit.</span><span>Total</span><span></span></div>${items.map((it,i)=>`<div class="pp-calc-aux-row" data-idx="${i}" style="display:grid;grid-template-columns:140px 1fr 70px 70px 105px 105px 34px;gap:6px;margin-bottom:6px;align-items:center"><input class="pp-ca-concepto" value="${eh(it.concepto)}" placeholder="Material/horas/etc" oninput="updateCalculosAuxPP()"><input class="pp-ca-detalle" value="${eh(it.detalle)}" placeholder="Detalle del cálculo" oninput="updateCalculosAuxPP()"><input class="pp-ca-cant" type="number" step="0.01" value="${it.cantidad??1}" oninput="updateCalculosAuxPP()"><input class="pp-ca-unidad" value="${eh(it.unidad)}" placeholder="m2/hs/u"><input class="pp-ca-unit" type="number" step="0.01" value="${it.precioUnitario??0}" oninput="updateCalculosAuxPP()"><input class="pp-ca-total" type="number" step="0.01" value="${it.total??((+it.cantidad||0)*(+it.precioUnitario||0))}" oninput="updateCalculosAuxPP(true)"><button type="button" class="btn-icon" onclick="removeCalculoAuxPP(${i})" title="Quitar"><i class="ti ti-x" style="font-size:13px"></i></button><input class="pp-ca-obs" value="${eh(it.observaciones)}" placeholder="Observaciones internas" style="grid-column:1 / -1"></div>`).join('')||'<div style="font-size:12px;color:var(--text3);padding:8px 0">Sin cálculos auxiliares cargados todavía.</div>'}`;
  window.updateCalculosAuxPP();
};
window.addCalculoAuxPP=function(){ window.ppCalculosAux=window.collectCalculosAuxPP(); window.ppCalculosAux.push({concepto:'',detalle:'',cantidad:1,unidad:'',precioUnitario:0,total:0,observaciones:''}); window.renderCalculosAuxPP(); };
window.removeCalculoAuxPP=function(i){ window.ppCalculosAux=window.collectCalculosAuxPP(); window.ppCalculosAux.splice(i,1); window.renderCalculosAuxPP(); };

window.ppItems = [];

window.abrirPresupuesto = () => {
  // Tomar datos de la obra actual
  const obraId = window.editingId.obra;
  const obra = obraId ? window.DB.obras.find(x => x.id === obraId) : null;

  // Número de presupuesto
  const nro = obra?.ot ? window.tizNumeroBase(obra.ot) : '0';
  document.getElementById('pp-nro').value = nro;
  document.getElementById('pp-cliente').value = obra?.cliente || '';
  document.getElementById('pp-revision').value = '1.1';
  window._cotizacionRevisionAnteriorId = null; window._cotizacionEsRevisionNueva=false;
  actualizarIdentificacionCotizacionV354();
  const revBtn=document.getElementById('pp-btn-nueva-revision'); if(revBtn) revBtn.style.display='none';

  // Item inicial con descripción de la obra
  window.ppItems = obra ? [{
    desc: obra.desc || '',
    precio: obra.neto || 0,
    cant: 1,
  }] : [{ desc:'', precio:0, cant:1 }];

  renderPPItems();
  document.getElementById('modal-prespdf').classList.add('open');
};

window.addItemPP = () => {
  window.ppItems.push({ desc:'', precio:0, cant:1 });
  renderPPItems();
};

window.removeItemPP = (i) => {
  window.ppItems.splice(i, 1);
  renderPPItems();
};

window.updateItemPP = (i, field, val) => {
  window.ppItems[i][field] = field === 'desc' ? val : +val || 0;
  // Actualizar subtotal mostrado
  const row = document.querySelectorAll('.pp-item-row')[i];
  if (row) {
    const sub = (window.ppItems[i].precio || 0) * (window.ppItems[i].cant || 0);
    const subEl = row.querySelector('.pp-subtotal');
    if (subEl) subEl.textContent = fmtPesoPresupuesto(round2Presupuesto(sub));
  }
  updatePPTotal();
};

function fmtPeso(n) {
  return '$ ' + Math.round(+n || 0).toLocaleString('es-AR');
}
function fmtPesoPresupuesto(n) {
  const v = Math.round(((+n || 0) + Number.EPSILON) * 100) / 100;
  return '$ ' + v.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function round2Presupuesto(n) {
  return Math.round(((+n || 0) + Number.EPSILON) * 100) / 100;
}

function updatePPTotal() {
  const total = round2Presupuesto(window.ppItems.reduce((a,it) => a + (it.precio||0)*(it.cant||0), 0));
  const el = document.getElementById('pp-total');
  if (el) el.textContent = fmtPesoPresupuesto(total);
}

function renderPPItems() {
  const wrap = document.getElementById('pp-items');
  if (!wrap) return;
  wrap.innerHTML = window.ppItems.map((it, i) => `
    <div class="pp-item-row">
      <span aria-label="Renglón ${i+1}" style="width:28px;flex-shrink:0;text-align:center;color:var(--accent);font-weight:600">${i+1}</span>
      <input value="${(it.desc||'').replace(/"/g,'&quot;')}" placeholder="Descripción del ítem ${i+1}" oninput="updateItemPP(${i},'desc',this.value)" style="flex:1">
      <input type="number" value="${it.precio||''}" placeholder="$ Unit" oninput="updateItemPP(${i},'precio',this.value)" style="width:110px">
      <input type="number" value="${it.cant||1}" placeholder="Cant" oninput="updateItemPP(${i},'cant',this.value)" style="width:70px">
      <span class="pp-subtotal" style="font-size:12px;color:var(--text2);width:110px;text-align:right;padding:0 4px;white-space:nowrap">${fmtPesoPresupuesto(round2Presupuesto((it.precio||0)*(it.cant||1)))}</span>
      <button class="btn-icon" onclick="removeItemPP(${i})" title="Eliminar ítem" style="padding:4px;color:var(--red)"><i class="ti ti-trash" style="font-size:13px"></i></button>
    </div>
  `).join('');
  updatePPTotal();
}


window.tizCotizacionNombreBaseV354 = function(nro, cliente, descripcion, revision='1.1') {
  const n = window.tizNumeroCotizacion(nro)||'0000000';
  const clean = v => String(v||'').replace(/[\\/:*?"<>|#%{}~]/g,' ').replace(/\s+/g,' ').trim();
  // Formato TIZ: CT 0005406 1.2 - Cliente - Descripción
  return ['CT ' + n + ' ' + normalizarRevisionV354(revision), clean(cliente), clean(descripcion)].filter(Boolean).join(' - ').slice(0,180);
};
window.tizCotizacionNombreBaseV353 = window.tizCotizacionNombreBaseV354;

window._postCotizacionDriveV353 = function(payload) {
  return new Promise((resolve) => {
    try {
      const frameName = 'tiz-drive-upload-' + Date.now();
      const iframe = document.createElement('iframe');
      iframe.name = frameName;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = TIZ_DRIVE_OT_WEBHOOK;
      form.target = frameName;
      form.style.display = 'none';
      const inp = document.createElement('input');
      inp.type = 'hidden'; inp.name = 'payload'; inp.value = JSON.stringify(payload);
      form.appendChild(inp); document.body.appendChild(form);
      let submitted = false;
      iframe.onload = () => {
        if (!submitted) return;
        setTimeout(()=>{ try{form.remove();iframe.remove();}catch(_){} resolve({ok:true}); },300);
      };
      submitted = true; form.submit();
      setTimeout(()=>{ try{form.remove();iframe.remove();}catch(_){} resolve({ok:true,timeout:true}); },12000);
    } catch(e) { console.warn('[TIZ V35.4] Error enviando cotización a Drive', e); resolve({ok:false,error:String(e)}); }
  });
};

window.generarPDF = async () => {
  const nro = window.tizNumeroBase(document.getElementById('pp-nro').value) || '0';
  const cliente = document.getElementById('pp-cliente').value.trim();
  const descGeneral = document.getElementById('pp-desc').value.trim();
  const nota = document.getElementById('pp-nota').value.trim();
  const cond = document.getElementById('pp-condicion').value.trim();
  const validezDias = +document.getElementById('pp-validez').value || 7;
  const calculosAuxiliares = window.collectCalculosAuxPP?.() || window.ppCalculosAux || [];
  const plazoEstimado = document.getElementById('pp-plazo')?.value || '';
  const anticipoPct = +document.getElementById('pp-anticipo')?.value || 0;
  const diasPago = +document.getElementById('pp-dias-pago')?.value || 0;
  const oc = document.getElementById('pp-oc')?.value || '';
  const observacionesComerciales = document.getElementById('pp-obs-comercial')?.value || '';
  const items = (window.ppItems||[]).filter(i => (i.desc||'').trim() || (+i.precio||0)>0);
  if (!cliente) { showToast('Falta cargar el cliente'); return; }
  if (!descGeneral) { showToast('Cargá la descripción general: se usa para nombrar la cotización y la carpeta'); return; }
  if (!items.length) { showToast('Agregá al menos un ítem'); return; }

  const hoy = new Date();
  const validez = new Date(hoy); validez.setDate(validez.getDate() + validezDias);
  const revision = normalizarRevisionV354(document.getElementById('pp-revision')?.value || '1.1');
  const total = round2Presupuesto(items.reduce((a,it)=>a+(+it.precio||0)*(+it.cant||1),0));
  const fmtFecha = d => d.toLocaleDateString('es-AR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const esc = v => String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const nombreBase = window.tizCotizacionNombreBaseV354(nro, cliente, descGeneral, revision);
  const entregaLogistica = window.collectEntregaLogisticaPP?.() || {tipo:'a_definir'};

  const documentoExistente = !window._cotizacionEsRevisionNueva ? (window.DB.presupuestos||[]).find(p=>p.id===window.editingId.presupuesto)||(window.DB.presupuestos||[]).find(p=>String(p.nro||'').replace(/\D/g,'')===String(nro).replace(/\D/g,'')&&normalizarRevisionV354(p.revision||'1.1')===revision) : null;
  const emisorComercial = window.TIZPresupuestoEmisorV1.forSave(documentoExistente);
  let ref;
  const registro = {
    emisorComercial,
    nro, cliente, desc: descGeneral, importe: total,
    fecha: hoy.toLocaleDateString('es-AR'), validez: validez.toLocaleDateString('es-AR'),
    estado:'Pendiente', nota, cond, items, revision,
    creadoPor: window.currentUser?.email || '', obraId: window.editingId.obra || '',
    nombreArchivo: nombreBase, cotizacionBase:String(nro).replace(/\D/g,''),
    revisionAnteriorId:window._cotizacionRevisionAnteriorId||'', esRevision:!!window._cotizacionRevisionAnteriorId,
    entregaLogistica, calculosAuxiliares, plazoEstimado, anticipoPct, diasPago, oc, observacionesComerciales,
    tipoFacturaSolicitada:document.getElementById('pp-tipo-factura')?.value??documentoExistente?.tipoFacturaSolicitada??'',
    vendedor:document.getElementById('pp-vendedor')?.value||'',moneda:document.getElementById('pp-moneda')?.value||'ARS'
  };
  Object.assign(registro,window.TIZInsumosCotizacionV1?.saveFields()||{});
  if(window.editingId.presupuesto && !window._cotizacionEsRevisionNueva){
    await updateDoc_('presupuestos',window.editingId.presupuesto,registro); ref={id:window.editingId.presupuesto};
  } else {
    const existe=(window.DB.presupuestos||[]).find(p=>String(p.nro||'').replace(/\D/g,'')===String(nro).replace(/\D/g,'') && normalizarRevisionV354(p.revision||'1.1')===revision);
    if(existe && !window._cotizacionEsRevisionNueva){ ref={id:existe.id}; await updateDoc_('presupuestos',existe.id,registro); }
    else { ref=await addDoc_('presupuestos',registro); window.editingId.presupuesto=ref?.id||null; }
    window._cotizacionEsRevisionNueva=false;
  }

  // Crea/asegura carpeta de análisis con el nombre CT - Cliente - Descripción.
  try {
    const cotResult = await syncDriveFolder({
      nroCotizacion:nro, cliente, desc:descGeneral, revision, firestoreId:ref?.id||'', estado:'Pendiente'
    }, 'cotizacion');
    if (cotResult?.driveFolderUrl && ref?.id) await updateDoc_('presupuestos', ref.id, {
      cotizacionFolderUrl:cotResult.driveFolderUrl,
      cotizacionFolderId:cotResult.folderId||'',
      cotizacionFolderName:cotResult.folderName||''
    });
  } catch(e) { console.warn('[TIZ V35.4] Carpeta análisis:',e); }

  // Guarda automáticamente una copia PDF en PDF 2026 y una XLSX en Excel 2026.
  window._postCotizacionDriveV353({
    action:'guardarCotizacionArchivos', nroCotizacion:window.tizNumeroCotizacion(nro), revision, cliente, descripcion:descGeneral,
    fecha:fmtFecha(hoy), validez:fmtFecha(validez), nota, condicion:cond, total,
    items:items.map((it,i)=>({orden:i+1,descripcion:String(it.desc||''), unitario:+it.precio||0, unidades:+it.cant||1, subtotal:(+it.precio||0)*(+it.cant||1)})),
    nombreBase, firestoreId:ref?.id||'', entregaLogistica, emisorComercial
  });

  const rows = items.map((it,i)=>`<tr><td class="cant">${i+1}</td><td>${esc(it.desc)}</td><td class="num">${fmtPesoPresupuesto(+it.precio||0)}</td><td class="cant">${+it.cant||1}</td><td class="num">${fmtPesoPresupuesto(round2Presupuesto((+it.precio||0)*(+it.cant||1)))}</td></tr>`).join('');
  const html = `<div class="ct-page">
    <div class="ct-header">
      <div class="ct-brand"><img src="assets/tiz-logo-presupuesto.png"><div class="ct-contact">☎ 11-3479-9737<br>✉ info@tizpublicidad.com<br>www.tizpublicidad.com<br>⌖ ${esc(emisorComercial.direccion)}</div></div>
      <div class="ct-meta"><div class="ct-title">Presupuesto Nro: <b>${window.tizNumeroCotizacion(nro)}</b></div><div>Fecha: ${esc(fmtFecha(hoy))}</div><div>Validez hasta: ${esc(fmtFecha(validez))}</div><div>Cliente: <b>${esc(cliente)}</b></div></div>
    </div>
    <div class="ct-items"><table class="ct-table"><colgroup><col style="width:5%"><col style="width:54%"><col style="width:14%"><col style="width:12%"><col style="width:15%"></colgroup><thead><tr><th>N°</th><th>Descripción</th><th>$ Unit</th><th>Unidades</th><th>Subtotal</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="ct-bottom"><div class="ct-notes"><div>Nota: ${esc(nota)}</div><div>Condición de pago: ${esc(cond)}</div></div><div class="ct-total"><b>Total Cotizado</b><b>${fmtPesoPresupuesto(total)}</b></div></div>
    <div class="ct-footer"><span>☎ 11-3479-9737</span><span>✉ INFO@TIZPUBLICIDAD.COM</span><span>WWW.TIZPUBLICIDAD.COM</span><span>⌖ ${esc(emisorComercial.direccion.toLocaleUpperCase('es-AR'))}</span></div>
  </div>`;

  const printWin = window.open('', '_blank', 'width=920,height=780');
  printWin.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(nombreBase)}</title><style>
    *{box-sizing:border-box;print-color-adjust:exact}body{margin:0;background:#eee;font-family:Arial,sans-serif;color:#111}.toolbar{width:210mm;margin:12px auto 0;background:#1b1b1b;padding:10px;display:flex;gap:8px;align-items:center}.toolbar button{border:0;border-radius:5px;padding:9px 14px;cursor:pointer;font-weight:700}.pdf{background:#e8b84b}.hint{color:#bbb;font-size:11px}
    .ct-page{width:210mm;min-height:297mm;margin:0 auto;background:white;padding:8mm 7mm 7mm;border:1px solid #aaa;display:flex;flex-direction:column}.ct-header{display:flex;justify-content:space-between;gap:12mm;min-height:30mm;margin-bottom:5mm}.ct-brand{width:90mm;background:#111;padding:3mm 4mm;color:white;display:flex;align-items:center;gap:4mm}.ct-brand img{width:32mm;height:22mm;object-fit:contain}.ct-contact{font-size:7.8pt;line-height:1.55}.ct-meta{font-size:9pt;line-height:1.55;padding-top:2mm}.ct-title{font-size:14pt;font-style:italic;margin-bottom:2mm}.ct-items{flex:1;border:1px solid #777;overflow:hidden}.ct-table{width:100%;border-collapse:collapse;table-layout:fixed}.ct-table th,.ct-table td{border-left:1px solid #999;padding:2.2mm 2mm;vertical-align:top}.ct-table th:first-child,.ct-table td:first-child{border-left:0}.ct-table th{border-bottom:1px solid #777;font-size:9.2pt;font-style:italic;text-align:center;white-space:nowrap;overflow:hidden}.ct-table td{font-size:8.3pt;border-bottom:1px solid #ddd;height:auto}.num{text-align:right;white-space:nowrap}.cant{text-align:center}.ct-bottom{border:1px solid #777;border-top:0;display:grid;grid-template-columns:1fr 36%;font-size:8pt}.ct-notes{padding:2mm 2.5mm;line-height:1.45}.ct-total{border-left:1px solid #777;padding:2mm 2.5mm;display:flex;justify-content:space-between;align-items:center;font-size:9pt}.ct-footer{margin-top:3mm;height:13mm;padding:0 4mm;display:flex;align-items:center;justify-content:space-between;color:white;font-size:7pt;font-weight:700;background:linear-gradient(90deg,#ff9b23,#ff3b55,#ef2375,#7537e8)}
    @media print{body{background:white}.toolbar{display:none}.ct-page{margin:0;border:1px solid #777;min-height:282mm}@page{size:A4 portrait;margin:6mm}}
  </style></head><body><div class="toolbar"><button class="pdf" onclick="window.print()">📄 Guardar PDF local</button><span class="hint">La copia PDF y Excel ya se envía a Drive.</span></div>${html}
</body></html>`);
  printWin.document.close();
  showToast('Cotización guardada: Drive PDF 2026 + Excel 2026');
};
window.estTab = 'tabla';
window.setEstTab = (tab, el) => {
  if(!window.canViewIndicadores()||!window.currentUser?.isAdmin&&tab!=='indicadores')return;
  window.estTab = tab;
  document.querySelectorAll('#page-estadistica .page-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderEstadistica();
};

function renderEstadistica() {
  const content=document.getElementById('est-content'),page=document.getElementById('page-estadistica');
  if(!content||!window.canViewIndicadores())return;
  if(!window.currentUser?.isAdmin)window.estTab='indicadores';
  const indicators=window.estTab==='indicadores';
  page.querySelectorAll('[data-est-tab]').forEach(el=>{el.style.display=(window.currentUser.isAdmin||el.dataset.estTab==='indicadores')?'':'none';el.classList.toggle('active',el.dataset.estTab===window.estTab);});
  document.getElementById('est-kpis').style.display=indicators?'none':'';
  page.querySelector('.header-actions').style.display=indicators?'none':'';
  page.querySelector('.page-subtitle').textContent=indicators?'Indicadores de gestión por puesto y obra':'Ventas · Producción · Colocaciones · Cobranzas por semana';
  if(indicators){
    let host=document.getElementById('est-indicadores');
    if(!host){content.innerHTML='<div id="est-indicadores"></div>';host=document.getElementById('est-indicadores');}
    window.TIZAnalisisPreliminarV1?.renderIndicators(host);
    return;
  }

  if(window.estTab==='cumplimiento'){
    document.getElementById('est-kpis').innerHTML='';
    page.querySelector('.header-actions').style.display='none';
    page.querySelector('.page-subtitle').textContent='Cumplimiento operativo registrado en la app';
    renderEstCumplimiento();
  }else window.TIZEstadisticaSourceV1?.render();
}

function renderEstCumplimiento() {
  const obras = window.DB.obras;
  const conFProd = obras.filter(o => o.fprod_c);
  const prodEnFecha  = conFProd.filter(o => semaforo(o.fprod_c,o.fprod_r)==='g').length;
  const prodVencida  = conFProd.filter(o => semaforo(o.fprod_c,o.fprod_r)==='r').length;
  const prodEnRiesgo = conFProd.filter(o => semaforo(o.fprod_c,o.fprod_r)==='a').length;
  const prodSinFecha = obras.filter(o => !o.fprod_c).length;
  const conFCol = obras.filter(o => o.fcol_c);
  const colEnFecha   = conFCol.filter(o => semaforo(o.fcol_c,o.fcol_r)==='g').length;
  const colVencida   = conFCol.filter(o => semaforo(o.fcol_c,o.fcol_r)==='r').length;
  const colEnRiesgo  = conFCol.filter(o => semaforo(o.fcol_c,o.fcol_r)==='a').length;
  const colSinFecha  = obras.filter(o => !o.fcol_c).length;

  // --- Cobranzas ---
  const cobr = window.DB.cobranzas;
  const cobrCobradas  = cobr.filter(c => c.estado==='Cobrado').length;
  const cobrPendiente = cobr.filter(c => c.estado==='Pendiente' && diasDesdeHoy(c.vencimiento)<0).length;
  const cobrVencidas  = cobr.filter(c => c.estado==='Pendiente' && diasDesdeHoy(c.vencimiento)>=0).length;
  const cobrTotalMonto = cobr.reduce((a,c)=>a+(+c.importe||0),0);
  const cobrCobradoMonto = cobr.filter(c=>c.estado==='Cobrado').reduce((a,c)=>a+(+c.importe||0),0);
  const cobrPendMonto = cobr.filter(c=>c.estado!=='Cobrado').reduce((a,c)=>a+(+c.importe||0),0);
  const SECTORS = ['Producción','Colocaciones','Diseño','Ventas','Compras','Calidad'];
  const COLORS_SEC = {'Producción':'#5b9cf6','Colocaciones':'#3dbfa0','Diseño':'#9b7ff4','Ventas':'#e8a020','Compras':'#e8b84b','Calidad':'#4caf7d'};
  const sectorData = SECTORS.map(sec => {
    const ws = obras.filter(o=>o.sector===sec&&o.fprod_c);
    const ok = ws.filter(o=>semaforo(o.fprod_c,o.fprod_r)==='g').length;
    const mal = ws.filter(o=>semaforo(o.fprod_c,o.fprod_r)==='r').length;
    const riesgo = ws.filter(o=>semaforo(o.fprod_c,o.fprod_r)==='a').length;
    const pct = ws.length?Math.round(ok/ws.length*100):0;
    return {sec,ok,mal,riesgo,total:ws.length,pct};
  });

  document.getElementById('est-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div class="card">
        <div class="card-header"><span class="card-title">📦 Cumplimiento producción</span></div>
        <div class="card-body" style="display:flex;flex-direction:column;align-items:center;gap:14px">
          <div style="position:relative;width:200px;height:200px">
            <canvas id="chart-prod" width="200" height="200"></canvas>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
              <div style="font-size:26px;font-weight:700;color:var(--green)">${conFProd.length?Math.round(prodEnFecha/conFProd.length*100):0}%</div>
              <div style="font-size:10px;color:var(--text3)">en fecha</div>
            </div>
          </div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center;font-size:12px;color:var(--text2)">
            <span><span style="display:inline-block;width:10px;height:10px;background:#4caf7d;border-radius:2px;margin-right:4px"></span>En fecha: <b>${prodEnFecha}</b></span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#e8a020;border-radius:2px;margin-right:4px"></span>En riesgo: <b>${prodEnRiesgo}</b></span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#e05c5c;border-radius:2px;margin-right:4px"></span>Vencida: <b>${prodVencida}</b></span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#444;border-radius:2px;margin-right:4px"></span>Sin fecha: <b>${prodSinFecha}</b></span>
          </div>
          <div style="font-size:11px;color:var(--text3)">Total con fecha: ${conFProd.length} obras</div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">🚛 Cumplimiento colocaciones</span></div>
        <div class="card-body" style="display:flex;flex-direction:column;align-items:center;gap:14px">
          <div style="position:relative;width:200px;height:200px">
            <canvas id="chart-col" width="200" height="200"></canvas>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
              <div style="font-size:26px;font-weight:700;color:var(--green)">${conFCol.length?Math.round(colEnFecha/conFCol.length*100):0}%</div>
              <div style="font-size:10px;color:var(--text3)">en fecha</div>
            </div>
          </div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center;font-size:12px;color:var(--text2)">
            <span><span style="display:inline-block;width:10px;height:10px;background:#4caf7d;border-radius:2px;margin-right:4px"></span>En fecha: <b>${colEnFecha}</b></span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#e8a020;border-radius:2px;margin-right:4px"></span>En riesgo: <b>${colEnRiesgo}</b></span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#e05c5c;border-radius:2px;margin-right:4px"></span>Vencida: <b>${colVencida}</b></span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#444;border-radius:2px;margin-right:4px"></span>Sin fecha: <b>${colSinFecha}</b></span>
          </div>
          <div style="font-size:11px;color:var(--text3)">Total con fecha: ${conFCol.length} obras</div>
        </div>
      </div>
    </div>

    <!-- Cobranzas torta -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span class="card-title">💰 Estado de cobranzas</span></div>
      <div class="card-body" style="display:grid;grid-template-columns:200px 1fr;gap:24px;align-items:center">
        <div style="position:relative;width:200px;height:200px">
          <canvas id="chart-cobr" width="200" height="200"></canvas>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
            <div style="font-size:22px;font-weight:700;color:var(--green)">${cobr.length?Math.round(cobrCobradas/cobr.length*100):0}%</div>
            <div style="font-size:10px;color:var(--text3)">cobrado</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:12px;color:var(--text2)"><span style="display:inline-block;width:10px;height:10px;background:#4caf7d;border-radius:2px;margin-right:6px"></span>Cobrado</span>
              <span style="font-size:12px;font-weight:500;color:var(--green)">${cobrCobradas} facturas · ${fmtM(cobrCobradoMonto)}</span>
            </div>
            <div style="height:6px;background:var(--border);border-radius:3px">
              <div style="width:${cobr.length?Math.round(cobrCobradas/cobr.length*100):0}%;height:6px;background:#4caf7d;border-radius:3px"></div>
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:12px;color:var(--text2)"><span style="display:inline-block;width:10px;height:10px;background:#e8a020;border-radius:2px;margin-right:6px"></span>Pendiente</span>
              <span style="font-size:12px;font-weight:500;color:var(--amber)">${cobrPendiente} facturas</span>
            </div>
            <div style="height:6px;background:var(--border);border-radius:3px">
              <div style="width:${cobr.length?Math.round(cobrPendiente/cobr.length*100):0}%;height:6px;background:#e8a020;border-radius:3px"></div>
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:12px;color:var(--text2)"><span style="display:inline-block;width:10px;height:10px;background:#e05c5c;border-radius:2px;margin-right:6px"></span>Vencida</span>
              <span style="font-size:12px;font-weight:500;color:var(--red)">${cobrVencidas} facturas</span>
            </div>
            <div style="height:6px;background:var(--border);border-radius:3px">
              <div style="width:${cobr.length?Math.round(cobrVencidas/cobr.length*100):0}%;height:6px;background:#e05c5c;border-radius:3px"></div>
            </div>
          </div>
          <div style="padding-top:8px;border-top:1px solid var(--border);display:flex;justify-content:space-between">
            <span style="font-size:12px;color:var(--text3)">Total cobrado: <b style="color:var(--green)">${fmtM(cobrCobradoMonto)}</b></span>
            <span style="font-size:12px;color:var(--text3)">Pendiente: <b style="color:var(--amber)">${fmtM(cobrPendMonto)}</b></span>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Cumplimiento de producción por sector</span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:center">
          <div style="position:relative;height:220px"><canvas id="chart-sector"></canvas></div>
          <div style="display:flex;flex-direction:column;gap:12px">
            ${sectorData.map(d=>`
              <div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                  <span style="font-size:12px;font-weight:500;color:${COLORS_SEC[d.sec]}">${d.sec}</span>
                  <span style="font-size:12px;color:var(--text2)">${d.ok}/${d.total} · <b style="color:${d.pct>=80?'var(--green)':d.pct>=60?'var(--amber)':'var(--red)'}">${d.pct}%</b></span>
                </div>
                <div style="height:6px;background:var(--border);border-radius:3px">
                  <div style="width:${d.pct}%;height:6px;background:${COLORS_SEC[d.sec]};border-radius:3px"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>`;

  const drawCharts = () => {
    if (window._chartProd) { try{window._chartProd.destroy();}catch(e){} }
    if (window._chartCol)  { try{window._chartCol.destroy();}catch(e){} }
    if (window._chartSec)  { try{window._chartSec.destroy();}catch(e){} }
    if (window._chartCobr) { try{window._chartCobr.destroy();}catch(e){} }
    const donutOpts = {
      cutout:'65%',
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${ctx.raw}`}}},
      animation:{animateRotate:true,duration:700}
    };
    window._chartProd = new Chart(document.getElementById('chart-prod'),{
      type:'doughnut',
      data:{labels:['En fecha','En riesgo','Vencida','Sin fecha'],
        datasets:[{data:[prodEnFecha,prodEnRiesgo,prodVencida,prodSinFecha],
          backgroundColor:['#4caf7d','#e8a020','#e05c5c','#2a2a2a'],borderWidth:0,hoverOffset:4}]},
      options:donutOpts
    });
    window._chartCol = new Chart(document.getElementById('chart-col'),{
      type:'doughnut',
      data:{labels:['En fecha','En riesgo','Vencida','Sin fecha'],
        datasets:[{data:[colEnFecha,colEnRiesgo,colVencida,colSinFecha],
          backgroundColor:['#4caf7d','#e8a020','#e05c5c','#2a2a2a'],borderWidth:0,hoverOffset:4}]},
      options:donutOpts
    });
    window._chartCobr = new Chart(document.getElementById('chart-cobr'),{
      type:'doughnut',
      data:{labels:['Cobrado','Pendiente','Vencida'],
        datasets:[{data:[cobrCobradas,cobrPendiente,cobrVencidas],
          backgroundColor:['#4caf7d','#e8a020','#e05c5c'],borderWidth:0,hoverOffset:4}]},
      options:donutOpts
    });
    window._chartSec = new Chart(document.getElementById('chart-sector'),{
      type:'bar',
      data:{
        labels:sectorData.map(d=>d.sec),
        datasets:[
          {label:'En fecha',data:sectorData.map(d=>d.ok),backgroundColor:'#4caf7d',borderRadius:4},
          {label:'Vencida',data:sectorData.map(d=>d.mal),backgroundColor:'#e05c5c',borderRadius:4},
          {label:'En riesgo',data:sectorData.map(d=>d.riesgo),backgroundColor:'#e8a020',borderRadius:4},
        ]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#a09e9a',font:{size:11}}}},
        scales:{
          x:{stacked:true,ticks:{color:'#888780',font:{size:11}},grid:{display:false}},
          y:{stacked:true,ticks:{color:'#888780',font:{size:11}},grid:{color:'rgba(255,255,255,0.05)'}}
        }
      }
    });
  };
  if (typeof Chart==='undefined') {
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    s.onload=drawCharts; document.head.appendChild(s);
  } else { setTimeout(drawCharts,50); }
}

// ============================================================
// DRIVE OT — integración estable validada con Apps Script V16
// ============================================================
const TIZ_DRIVE_OT_WEBHOOK = "https://script.google.com/macros/s/AKfycbx_Uy_ijUG38rht-m-Xp-y9Eou8WzoG4jepXi1GqJaHAknwQsQd-rQgYcQ1ucrAJPlK/exec";
// Exponer el endpoint a los módulos externos que se cargan después del módulo Firebase.
window.TIZ_DRIVE_OT_WEBHOOK = TIZ_DRIVE_OT_WEBHOOK;

function sanitizeTizFolderPart(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|#%{}~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTizFolderName(nroCotizacion, cliente, descripcion) {
  const n=String(nroCotizacion||'').replace(/\D/g,'').padStart(7,'0');
  const partes = ['CT '+n, cliente, descripcion].map(sanitizeTizFolderPart).filter(Boolean);
  return partes.join(' - ').slice(0, 180) || 'SIN NOMBRE';
}
window.buildTizFolderName = buildTizFolderName;

async function syncDriveFolder(data, tipoCarpeta) {
  if (!TIZ_DRIVE_OT_WEBHOOK.includes('/exec')) throw new Error('URL /exec de Apps Script no configurada');
  const tipo = tipoCarpeta === 'cotizacion' ? 'cotizacion' : 'ot';
  const nroCotizacion = String(data.nroCotizacion || data.nroPresupuesto || data.presupuesto || data.ot || '').trim();
  if (!nroCotizacion) throw new Error('Falta el número de cotización');
  const folderName = buildTizFolderName(nroCotizacion, data.cliente, data.desc);
  const compact = {
    action: 'ensureTizFolder',
    tipoCarpeta: tipo,
    folderName,
    obra: {
      firestoreId: String(data.firestoreId || ''),
      ot: String(data.ot || nroCotizacion).trim(),
      nroCotizacion,
      emisorComercial:window.TIZPresupuestoEmisorV1.forDocument(data),
      cliente: String(data.cliente || '').trim(),
      desc: String(data.desc || '').trim(),
      estado: String(data.estado || '').trim(),
      sector: String(data.sector || '').trim(),
      vendedor: String(data.vendedor || '').trim(),
      itemsTecnicos: (Array.isArray(data.itemsTecnicos)?data.itemsTecnicos:[]).map(item=>({
        articulo:String(item?.articulo||item?.desc||item?.descripcion||'').trim(),
        cantidad:Number(item?.cantidad||item?.cant||1)||1,
        unidad:String(item?.unidad||'UNID').trim()||'UNID',
        observaciones:String(item?.observaciones||item?.detalle||'').trim()
      })).filter(item=>item.articulo),
      folderName,
      tipoCarpeta: tipo
    }
  };

  return await new Promise((resolve, reject) => {
    const callback = '__tizDriveCb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const timer = setTimeout(() => cleanup(new Error('Apps Script no respondió en 20 segundos')), 20000);
    function cleanup(err, value) {
      clearTimeout(timer);
      try { delete window[callback]; } catch (_) { window[callback] = undefined; }
      script.remove();
      if (err) reject(err); else resolve(value);
    }
    window[callback] = result => {
      if (!result || result.ok !== true) cleanup(new Error(result?.error || 'Error desconocido de Apps Script'));
      else cleanup(null, result);
    };
    script.onerror = () => cleanup(new Error('No se pudo conectar con Apps Script'));
    const qs = new URLSearchParams({ callback, payload: JSON.stringify(compact) });
    script.src = TIZ_DRIVE_OT_WEBHOOK + '?' + qs.toString();
    document.head.appendChild(script);
  });
}
window.syncDriveFolder = syncDriveFolder;

async function syncToSheets(data) {
  if (!data || String(data.estado || '').trim().toLowerCase() !== 'aprobado') {
    return { ok:true, skipped:true, reason:'Estado distinto de Aprobado' };
  }
  return await syncDriveFolder(data, 'ot');
}

// ============================================================
// V20 — cierre de integración y estado inicial
// ============================================================
(function(){
  const forcePresupuestado = () => {
    const estado = document.getElementById('f-estado');
    if (estado) {
      const option = [...estado.options].find(o => o.value === 'Pendiente' || o.textContent.trim() === 'Pendiente');
      if (option) estado.value = option.value;
    }
  };

  const originalNuevaObra = window.abrirNuevaObraV52;
  window.abrirNuevaObraV52 = function(){
    const result = originalNuevaObra ? originalNuevaObra.apply(this, arguments) : undefined;
    forcePresupuestado();
    requestAnimationFrame(forcePresupuestado);
    setTimeout(forcePresupuestado, 50);
    return result;
  };

  const originalNuevoPresupuesto = window.abrirNuevoPresupuestoCompleto;
  window.abrirNuevoPresupuestoCompleto = function(){
    const result = originalNuevoPresupuesto ? originalNuevoPresupuesto.apply(this, arguments) : undefined;
    forcePresupuestado();
    const sector = document.getElementById('f-sector');
    if (sector) sector.value = 'Ventas';
    const title = document.getElementById('modal-obra-title');
    if (title) title.textContent = 'Nuevo presupuesto';
    requestAnimationFrame(forcePresupuestado);
    setTimeout(forcePresupuestado, 50);
    return result;
  };

  const badge = document.createElement('div');
  badge.id = 'tiz-build-v20';
  badge.textContent = 'TIZ V35.7 · CLIENTES + CÁLCULOS AUXILIARES · 17/08/2026';
  badge.style.cssText = 'position:fixed;right:10px;bottom:8px;z-index:9999;font:10px DM Mono,monospace;color:#e8b84b;background:#151515;border:1px solid rgba(232,184,75,.35);border-radius:6px;padding:4px 7px;opacity:.92;pointer-events:none';
  const mountBadge = () => { if (!document.getElementById(badge.id)) document.body.appendChild(badge); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountBadge);
  else mountBadge();

  console.info('[TIZ V35.7] Clientes históricos + cálculos auxiliares del presupuesto restaurados; revisiones e historial activos.');
})();

</script>


<script>
// ============================================================
// TIZ V35.5 — Restauración de clientes + ayudamemoria comercial
// ============================================================
(function(){
  const esc = v => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const jsq = v => String(v ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/[\r\n]+/g,' ');
  const norm = v => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

  function clientesDisponibles(){
    const mapa = new Map();
    const add=(nombre,cuit='',numero='',fuente='')=>{
      nombre=String(nombre||'').trim(); if(!nombre) return;
      const k=norm(nombre);
      const prev=mapa.get(k)||{};
      mapa.set(k,{nombre:prev.nombre||nombre,cuit:prev.cuit||cuit||'',numero:prev.numero||numero||'',fuente:prev.fuente||fuente});
    };
    (window.DB?.clientes||[]).forEach(c=>{const fiscal=c.razonSocial||c.razon_social||c.nombreFiscal||c.nombre;add(fiscal,c.cuit,c.numeroCliente||c.numero,'Base de clientes');if(c.nombre&&norm(c.nombre)!==norm(fiscal))add(c.nombre,c.cuit,c.numeroCliente||c.numero,'Nombre comercial');});
    (window.DB?.obras||[]).forEach(o=>add(o.cliente,'','','Obras anteriores'));
    (window.DB?.presupuestos||[]).forEach(p=>add(p.cliente,'','','Cotizaciones anteriores'));
    return [...mapa.values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  }

  function posicionarSugerenciasPP(){
    const input=document.getElementById('pp-cliente'),dd=document.getElementById('pp-clientes-dropdown');
    if(!input||!dd)return;
    if(input.nextElementSibling!==dd)input.insertAdjacentElement('afterend',dd);
    dd.style.position='static';dd.style.left='auto';dd.style.top='auto';dd.style.width='100%';
    dd.style.right='auto';dd.style.zIndex='auto';dd.style.background='var(--surface3,#202020)';
    dd.style.boxShadow='0 8px 20px rgba(0,0,0,.35)';dd.style.marginTop='4px';
  }

  window.sugerirClientesPP=function(q, mostrarAunqueVacio=false){
    const dd=document.getElementById('pp-clientes-dropdown'); if(!dd) return;
    const texto=String(q||'').trim();
    // V35.7: además de Clientes/Obras/Presupuestos, incorporar la Base Madre histórica.
    const listaBase=clientesDisponibles();
    const mapa=new Map(listaBase.map(c=>[norm(c.nombre),c]));
    (window.OBRAS_MADRE_V291||[]).forEach(o=>{ const nombre=String(o.cliente||'').trim(); if(nombre && !mapa.has(norm(nombre))) mapa.set(norm(nombre),{nombre,cuit:'',numero:'',fuente:'Base Madre'}); });
    const lista=[...mapa.values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
    const nq=norm(texto);
    if(!nq && !mostrarAunqueVacio){ dd.style.display='none'; return; }
    const matches=(nq?lista.filter(c=>norm(c.nombre).includes(nq)):lista).slice(0,12);
    let html=matches.map((c,i)=>`<div class="cli-option" data-cliente-index="${i}"><span>${esc(c.nombre)}</span><span class="cli-option-sub">${c.numero?'Cliente '+esc(c.numero)+' · ':''}${c.cuit?'CUIT: '+esc(c.cuit):esc(c.fuente||'Cliente existente')}</span></div>`).join('');
    if(texto){
      html += `<div class="cli-option" data-crear-cliente="1" style="border-top:1px solid var(--border);color:var(--accent)"><span>➕ Crear cliente nuevo: <strong>${esc(texto)}</strong></span><span class="cli-option-sub" style="color:var(--accent)">Dar de alta y volver al presupuesto</span></div>`;
    }
    dd.innerHTML=html || '<div style="padding:10px;color:var(--text3)">Sin clientes cargados todavía.</div>';
    dd.querySelectorAll('[data-cliente-index]').forEach(el=>el.addEventListener('mousedown',e=>{e.preventDefault();const c=matches[+el.dataset.clienteIndex];if(c){document.getElementById('pp-cliente').value=c.nombre;dd.style.display='none';}}));
    dd.querySelector('[data-crear-cliente]')?.addEventListener('mousedown',e=>{e.preventDefault();window.nuevoClienteDesdePresupuestoV355(texto);});
    posicionarSugerenciasPP();
    dd.style.display='block';
  };
  window.nuevoClienteDesdePresupuestoV355=function(nombre){
    document.getElementById('pp-clientes-dropdown')?.style && (document.getElementById('pp-clientes-dropdown').style.display='none');
    window._clienteReturnTarget='presupuesto';
    if(window.editingId) window.editingId.cliente=null;
    if(document.getElementById('fc-numero') && typeof window.nextClienteNumero==='function') document.getElementById('fc-numero').value=window.nextClienteNumero();
    if(document.getElementById('fc-nombre')) document.getElementById('fc-nombre').value=nombre||'';
    ['fc-cuit','fc-contacto','fc-cel','fc-email','fc-cargo','fc-contactos','fc-notas'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    document.getElementById('modal-cliente')?.classList.add('open');
  };

  const MEASURE=/\b\d+(?:[\.,]\d+)?\s*(?:m|mt|mts|cm|mm)?\s*[x×]\s*\d+/i;
  const MATERIAL=/(acr[ií]lico|pvc|chapa|aluminio|acm|mdf|hierro|cañ[oó]|perfil|lona|vinilo|polyfan|polifan|madera|pintura|tela|backlight)/i;
  const ILUM=/(led|m[oó]dulo|tira|ne[oó]n|retroilumin|iluminad|sin iluminaci[oó]n|fuente|driver|12v|24v|220v)/i;
  const FINISH=/(pintura|poliuret|sint[eé]tica|horno|powder|laminado|mate|brillo|uv|impresi[oó]n|vinilo|backlight)/i;
  const DEPTH=/(profundidad|prof\.|faja|lateral|espesor|canto|retorno|cuerpo)/i;
  function textoCotizacion(){
    const desc=document.getElementById('pp-desc')?.value||'';
    const items=(window.ppItems||[]).map(i=>[i.desc,i.descripcion,i.observaciones].filter(Boolean).join(' ')).join(' ');
    return (desc+' '+items).trim();
  }
  function add(arr,ok,titulo,sugerencia){arr.push({ok,titulo,sugerencia});}
  window.renderAyudamemoriaPPV355=function(){
    const box=document.getElementById('pp-ayudamemoria'); if(!box) return;
    const txt=textoCotizacion(); const low=norm(txt); const checks=[];
    add(checks,MEASURE.test(txt),'Medidas','Indicá ancho × alto y, cuando corresponda, profundidad.');
    add(checks,MATERIAL.test(txt),'Material principal','Aclarar material: hierro/caño, chapa, PVC, acrílico, ACM, MDF, lona, vinilo, etc.');
    if(/letra|corporea|corpórea/.test(low)){
      add(checks,DEPTH.test(txt),'Profundidad / faja de letras','Ej.: faja 8 cm, lateral chapa, contraletra PVC.');
      add(checks,ILUM.test(txt),'Iluminación','Aclarar retroiluminada, frente iluminado, neón flexible o sin iluminación.');
    } else if(/ilumin|led|neon|neón|backlight/.test(low)) add(checks,ILUM.test(txt),'Tipo de iluminación','Indicar módulo/tira/neón y tensión o fuente cuando corresponda.');
    if(/vinilo|lona|impres|pintura|chapa|acm|mdf/.test(low)) add(checks,FINISH.test(txt),'Terminación','Aclarar pintura, laminado, UV, brillo/mate u otra terminación cuando aplique.');
    const pendientes=checks.filter(x=>!x.ok);
    box.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:8px"><strong>${pendientes.length?'📝 Antes de enviar, revisar':'✅ Datos técnicos básicos completos'}</strong><span style="color:${pendientes.length?'var(--amber)':'var(--green)'}">${checks.length-pendientes.length}/${checks.length}</span></div>`+
      checks.map(x=>`<div style="display:flex;gap:7px;margin:4px 0;color:${x.ok?'var(--text3)':'var(--text2)'}"><span>${x.ok?'✓':'•'}</span><div><b>${esc(x.titulo)}</b>${x.ok?'':` — ${esc(x.sugerencia)}`}</div></div>`).join('')+
      `<div style="margin-top:8px;color:var(--text3)">Es un ayudamemoria: no bloquea el presupuesto y se actualiza mientras escribís.</div>`;
  };

  function bind(){
    const cli=document.getElementById('pp-cliente'),dd=document.getElementById('pp-clientes-dropdown');
    if(cli&&dd&&cli.nextElementSibling!==dd)cli.insertAdjacentElement('afterend',dd);
    if(cli && !cli.dataset.v355){cli.dataset.v355='1';cli.addEventListener('focus',()=>window.sugerirClientesPP(cli.value,true));cli.addEventListener('input',()=>window.sugerirClientesPP(cli.value,false));}
    document.getElementById('modal-prespdf')?.addEventListener('scroll',posicionarSugerenciasPP,{passive:true});
    const desc=document.getElementById('pp-desc');
    if(desc && !desc.dataset.v355){desc.dataset.v355='1';desc.addEventListener('input',window.renderAyudamemoriaPPV355);}
    window.renderAyudamemoriaPPV355();
  }
  const oldRender=window.renderPPItems;
  if(typeof oldRender==='function') window.renderPPItems=function(){const r=oldRender.apply(this,arguments);setTimeout(window.renderAyudamemoriaPPV355,0);return r;};
  const oldOpen=window.abrirNuevoPresupuestoCompleto;
  if(typeof oldOpen==='function') window.abrirNuevoPresupuestoCompleto=function(){const r=oldOpen.apply(this,arguments);setTimeout(bind,0);return r;};
  document.addEventListener('input',e=>{if(e.target?.closest?.('#modal-prespdf') && (e.target.id==='pp-desc'||e.target.closest('#pp-items'))) window.renderAyudamemoriaPPV355();});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind); else bind();
})();
</script>

<script src="excelMadre.js?v=TIZ-V40-BASE-20260903"></script>
<script src="migracionBaseMadreV29_1.js?v=TIZ-V40-4-BASE-20260903"></script>
<script src="functions/calidadChecklistCoreV2.js?v=TIZ-CHECKLISTS-CRISTIAN-20261014C-GIANCARLO-20261023"></script>
<script src="calidadChecklistsV2.js?v=TIZ-CHECKLISTS-CRISTIAN-20261014C&baja-ventas=20261103"></script>
<script src="calidadV1.js?v=TIZ-CALIDAD-COMPLETA-20261015&baja-ventas=20261103"></script>
<script src="comprasObrasCoreV1.js?v=TIZ-COMPRAS-OBRAS-20261015&baja-ventas=20261103"></script>
<script src="comprasBaseDatosV1.js?v=TIZ-BASE-DATOS-COMPRAS-20261030"></script>
<script type="module" src="compras.js?v=TIZ-COMPRAS-OBRAS-20261015-DRIVE&base-datos=20261030&import-mes=20261030&orden-fecha=20261030&ingreso-guiado=20261103&proveedor-nombres=20261103&editar-insumo=20261103&ia-compartida=20261104&estado-lectura=20261104&vincular-catalogo=20261104&editar-catalogo=20261104&reintentos-ia=20261104&contactos-proveedor=20261104&unidades=20261104"></script>
<script src="operacionesV31.js?v=TIZ-V31-3-CONTACTO-OT-20260929"></script>
<script src="cotizadorV32.js?v=TIZ-V35-12-ITEMS-TECNICOS-20260901&orden=20261030"></script>
<script src="expedientesV33.js?v=TIZ-V54-NUMERO-BASE-20260904"></script>
<script src="clemenBuscarPresupuestoV81.js?v=TIZ-V82-FILTRO-PRESUPUESTOS-20260929"></script>
<script src="obrasListadoV1.js?v=TIZ-LISTADOS-COMPACTOS-20261016A&baja=20261030"></script>
<script src="produccionV34.js?v=TIZ-PRODUCCION-INTEGRAL-V1-20260914-LISTADO-20261104-LEGIBLE"></script>
<script src="sectorizacionV35.js?v=TIZ-V35-26-ESTADO-COTIZACION-20261016-CONTACTOS-CARGO-20261026-DOMICILIO-20261030&baja=20261030&tipo-factura=20261030&comercial=20261103&obras-semaforo=20261104&insumos=20261104"></script>
<script src="vincularCarpetasV38.js?v=TIZ-CT-CEROS-20260930"></script>
<script src="driveFolderNameSyncV110.js?v=TIZ-DRIVE-FOLDER-NAME-SYNC-V1103-NO-AUTO-POPUP-20260923"></script>
<script src="functions/baseMadreLayoutV1.js?v=TIZ-BASE-MADRE-FILA-VISIBLE-20261023"></script>
<script src="baseMadreSyncV116.js?v=TIZ-BASE-MADRE-FILA-VISIBLE-20261023"></script>
<!-- GitHub Pages compatibility checks retained while Cobranzas V2 replaces the legacy UI:
  cobranzasVistaUnificadaV98.js?v=TIZ-V99-BUSCADOR-FC0001-20260915
  cobranzasIndicadorEnvioV100.js?v=TIZ-V100-ESTADO-ENVIO-20260916
  cobranzasPorCobrarV101.js?v=TIZ-V1012-SOLO-FACTURAS-20260918
  cobranzasCompatFacturasV102.js?v=TIZ-V102-HISTORICAS-20260916
  cobranzasCompatPresupuestosV103.js?v=TIZ-V103-APROBADAS-20260916
-->

<!-- FACTURACIÓN / COBRANZAS V2: única interfaz activa -->
<script src="cobranzasSemanalV127.js?v=TIZ-FC-PAGOS-SEMANAS-20260930"></script>
<script src="functions/arcaFechasV1.js?v=TIZ-ARCA-FECHA-20261023"></script>
<script src="facturadorIntegralV83.js?v=TIZ-FCE-MINIMO-OFICIAL-20261026&tipo-factura=20261030"></script>
<script src="facturacionEntregaUIV84.js?v=TIZ-FC-V2-EMAIL-V86-DIRECT-SAVE-20260922"></script>
<script src="facturacionDriveRetryUIV83.js?v=TIZ-FC-DRIVE-AUTO-20260930"></script>
<script src="facturacionCobranzasDataV2.js?v=TIZ-FC-REFACTURAR-NC-20261016&r=retenciones-20261030&baja=20261030&general=20261102"></script>
<script src="facturacionCobranzasActionsV2.js?v=TIZ-FC-PAGOS-SEMANAS-20260930&r=retenciones-20261030&baja=20261030&seguimiento=20261030&general=20261102"></script>
<script src="facturacionBaseMadreReconcileV2.js?v=TIZ-BASE-MADRE-COLUMNAS-20261016"></script>
<script src="facturacionCobranzasMadreV1.js?v=TIZ-COBRANZAS-GENERAL-20261102"></script>
<script src="facturacionCobranzasSeguimientoV1.js?v=TIZ-FC-SEGUIMIENTO-20261030&edicion=20261102&general=20261102"></script>
<script src="facturacionCobranzasUIV2.js?v=TIZ-FC-REFACTURAR-NC-20261016&r=retenciones-20261030&baja=20261030&seguimiento=20261030&edicion=20261102&general=20261102"></script>
<script src="functions/colocacionesCoreV129.js?v=TIZ-COLOCACIONES-V153-20261012-SOLICITUDES-20261022"></script><script src="colocacionesGeneralUIV129.js?v=TIZ-COLOCACIONES-V153-20261012-OT-IMPRIMIR-20261019-SOLICITUDES-20261022-REALIZADO-20261029&baja=20261030"></script><script src="colocacionesFotosV146.js?v=TIZ-COLOCACIONES-V153-20261012"></script><script src="colocacionesDatesV150.js?v=TIZ-FECHAS-DDMMYYYY-20261104"></script><script src="colocacionesV128.js?v=TIZ-COLOCACIONES-V153-20261012-OT-IMPRIMIR-20261019-SOLICITUDES-20261022-CONTACTOS-REALIZADO-20261029"></script>
<script src="functions/analisisPreliminarCoreV1.js?v=TIZ-ANALISIS-PRELIMINAR-20261019M-FEDE&baja-ventas=20261103"></script>
<script src="estadisticaSourceV1.js?v=TIZ-ESTADISTICA-FUENTE-20261015A-GIANCARLO-20261023"></script>
<script src="operacionesV1.js?v=TIZ-OPERACIONES-20261016C-OSCURO"></script>
<script src="analisisPreliminarV1.js?v=TIZ-ANALISIS-PRELIMINAR-20261019M-FEDE-GIANCARLO-20261023&obras-semaforo=20261104"></script>
<script src="clemenSecretariaCoreV1.js?v=TIZ-CLEMEN-SECRETARIA-20261016B-AGENDA-PERSONAL"></script>
<script src="clemenSecretariaV1.js?v=TIZ-CLEMEN-SECRETARIA-20261016B-AGENDA-PERSONAL"></script>
<script src="functions/obrasSeguimientoCoreV2.js?v=TIZ-OBRAS-SEGUIMIENTO-20261030A&baja=20261030&estado=20261103&obras-semaforo=20261104"></script>
<script src="obrasConsultaCacheV1.js?v=TIZ-OBRAS-COMUNES-20261102&baja-ventas=20261103&obras-semaforo=20261104"></script>
<script src="obrasSeguimientoV2.js?v=TIZ-OBRAS-SEGUIMIENTO-20261030B&baja=20261030&obras-comunes=20261102&drive=20261102&estados-iniciales=20261102&carga-resiliente=20261102&estado=20261103&baja-ventas=20261103&obras-semaforo=20261104"></script>
<script src="functions/insumosCotizacionCoreV1.js?v=20261104-control"></script>
<script src="unidadesStockV1.js?v=20261104-control"></script>
<script src="insumosCotizacionV1.js?v=20261104-control"></script>
</body>
</html>

