"use strict";
function tag(xml, name) {
 const match=String(xml||"").match(new RegExp("<(?:\\w+:)?"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?"+name+">","i"));
 return match?match[1].trim():"";
}
function decode(value) {
 return String(value||"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");
}
function redact(value, requestBody) {
 let text=decode(value);
 // Remove credentials echoed by the server, including bare and XML-encoded values.
 for(const name of ["token","sign","in0"]) {
  const secret=tag(requestBody,name);
  for(const candidate of [secret,decode(secret)]) if(candidate) text=text.split(candidate).join("[REDACTADO]");
 }
 return text
  .replace(/<(?:\w+:)?(?:authRequest|Auth|token|sign|in0)\b[^>]*>[\s\S]*?<\/(?:\w+:)?(?:authRequest|Auth|token|sign|in0)>/gi,"[REDACTADO]")
  .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g,"[REDACTADO]")
  .replace(/\bBearer\s+\S+/gi,"Bearer [REDACTADO]")
  .replace(/\b[A-Za-z0-9+/_=-]{32,}\b/g,"[REDACTADO]")
  .replace(/\d{11,}/g,"[REDACTADO]")
  .replace(/<[^>]*>/g," ").replace(/[\r\n\t]+/g," ").slice(0,600);
}
function failure(httpStatus, xml, requestBody) {
 const fault=decode(tag(xml,"faultstring"));
 const faultCode=decode(tag(xml,"faultcode"));
 const detail=fault?redact(fault,requestBody):"";
 return Object.assign(new Error(fault?"ARCA: "+detail:"ARCA respondió HTTP "+httpStatus),{
  arcaHttpStatus:httpStatus,
  ...(faultCode?{arcaFaultCode:/^[\w.:-]{1,80}$/.test(faultCode)?faultCode:"SOAP_FAULT"}:{}),
  ...(detail?{arcaDetail:detail}:{})
 });
}
function details(error) {
 // Only these explicitly sanitized fields may enter logs. Never log Error, body or XML.
 const result={};
 if(Number.isInteger(error?.arcaHttpStatus)&&error.arcaHttpStatus>=100&&error.arcaHttpStatus<=599)result.httpStatus=error.arcaHttpStatus;
 if(typeof error?.arcaFaultCode==="string"&&/^[\w.:-]{1,80}$/.test(error.arcaFaultCode))result.faultCode=error.arcaFaultCode;
 if(typeof error?.arcaDetail==="string")result.detail=redact(error.arcaDetail,"");
 return result;
}
module.exports={failure,details};
