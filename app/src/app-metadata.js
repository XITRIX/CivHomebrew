/* Replaceable app-format policy. Boot keeps its legacy fallback for recovery. */
(function(g){
 "use strict";
 var C=g.PayloadCore;
 function extensions(input){
  var count=0;
  function copy(v,depth){
   if(++count>2048||depth>8)throw Error("Manifest extensions are too complex.");
   if(v===null||typeof v==="boolean"||typeof v==="string")return v;
   if(typeof v==="number"&&Number.isFinite(v))return v;
   if(Array.isArray(v))return v.map(function(x){return copy(x,depth+1);});
   if(!v||typeof v!=="object"||Object.prototype.toString.call(v)!=="[object Object]")throw Error("Invalid manifest extension value.");
   var out={};Object.keys(v).forEach(function(k){if(!k||k.length>80||/[\x00-\x1f\x7f]/.test(k)||["__proto__","prototype","constructor"].indexOf(k)>=0)throw Error("Invalid manifest extension key.");out[k]=copy(v[k],depth+1);});return out;
  }
  if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Manifest extensions must be an object.");
  var result=copy(input,0);if(C.encode(JSON.stringify(result)).length>16384)throw Error("Manifest extensions exceed 16 KiB.");return result;
 }
 C.extensions=extensions;
 C.metadata=function(input){
  var m=input===undefined?{}:input,out={};
  if(!m||typeof m!=="object"||Array.isArray(m))throw Error("Invalid metadata.");
  [["author",80],["release",32],["description",500]].forEach(function(f){var v=m[f[0]]===undefined?"":m[f[0]];if(typeof v!=="string"||v.length>f[1]||/[\x00-\x1f\x7f]/.test(v))throw Error("Invalid "+f[0]+" metadata.");out[f[0]]=v;});
  if(m.api!==undefined&&m.api!==1)throw Error("Package requires an unsupported launcher API.");out.api=1;
  if(m.extensions!==undefined)out.extensions=extensions(m.extensions);return out;
 };
})(typeof window!=="undefined"?window:globalThis);
