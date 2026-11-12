/* Replaceable app-format policy. Boot keeps its legacy fallback for recovery. */
(function(g){
 "use strict";
 var C=g.PayloadCore;
 // Feature-owned capacity policy: larger self-contained v1 apps can bundle
 // game data. Boot retains conservative recovery defaults; no trigger rewrite.
 C.maxSource=32*1024*1024;C.maxFrame=48*1024*1024;C.quota=128*1024*1024;
 C.orderedScripts=function(metadata){
  var value=metadata&&metadata.extensions&&metadata.extensions.execution;
  if(value===undefined)return false;
  if(!value||value.schema!==1||value.scripts!=="ordered")throw Error("Unsupported app execution mode.");
  return true;
 };
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
 // One policy for tile launches and both companion launch forms. Validation
 // happens before services stop, scripts are read, or a native view is closed.
 C.nativeUi=function(metadata){
  var cap=metadata&&metadata.extensions&&metadata.extensions.nativeUi;
  var ui=g.CivAppsNativeUI,sessions=ui&&ui.sessions||g.CivNanoVGSession,session=sessions&&sessions.current;
  if(!cap||cap.api!==1||(session&&session.api!==1))throw Error("This app needs an update for the native Launcher.");
  if(cap.library!==undefined&&cap.library!=="civapps-native-ui")throw Error("Unsupported native UI library requirement.");
  var policy=g.CivHomebrewSDK&&g.CivHomebrewSDK.compatibility;
  if(!policy)throw Error("Update the Launcher compatibility policy and restart Civ VII.");
  policy.validate(cap);
  if(ui)policy.assert(ui,cap);
  else if((session&&cap.library)||cap.minVersion!==undefined||(cap.capabilities&&cap.capabilities.length))throw Error("Update the native Launcher and restart Civ VII.");
  return session;
 };
 C.extensions=extensions;
 C.metadata=function(input){
  var m=input===undefined?{}:input,out={};
  if(!m||typeof m!=="object"||Array.isArray(m))throw Error("Invalid metadata.");
  [["author",80],["release",32],["description",500]].forEach(function(f){var v=m[f[0]]===undefined?"":m[f[0]];if(typeof v!=="string"||v.length>f[1]||/[\x00-\x1f\x7f]/.test(v))throw Error("Invalid "+f[0]+" metadata.");out[f[0]]=v;});
  if(m.api!==undefined&&m.api!==1)throw Error("Package requires an unsupported launcher API.");out.api=1;
  if(m.extensions!==undefined)out.extensions=extensions(m.extensions);return out;
 };
})(typeof window!=="undefined"?window:globalThis);
