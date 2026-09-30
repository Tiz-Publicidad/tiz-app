"use strict";
function validarDiasPago(value){
 if(value===null||value===undefined||!["number","string"].includes(typeof value)||(typeof value==="string"&&!value.trim()))throw Object.assign(new Error("Seleccioná el plazo de pago: contado o cantidad de días."),{status:400});
 const days=Number(value);if(!Number.isInteger(days)||days<0||days>3650)throw Object.assign(new Error("El plazo de pago debe ser un número entero entre 0 y 3650 días."),{status:400});
 return days;
}
module.exports={validarDiasPago};
