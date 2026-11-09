/* Launcher-owned, disposable availability hints; never authority to install. */
(function(g){
 "use strict";
 function platform(native){
  var C=g.PayloadCore;
  function owned(path){if(path!==C.root+"/update-status-0.json"&&path!==C.root+"/update-status-1.json")throw Error("Invalid update-status path.");return path;}
  return {read:async function(path,limit){var bytes=await native.files.read(owned(path),limit,true);return bytes===null?null:C.decode(bytes);},
   write:function(path,text){return native.files.write(owned(path),C.encode(text));},commit:native.files.commit,
   ensureDirectory:function(path){if(path!==C.root)throw Error("Invalid update-status root.");return native.io.ensureDirectory(path);}};
 }
 function create(io){
  var C=g.PayloadCore,current={version:1,generation:0,entries:[]},tail=Promise.resolve(),failed=false;
  function validate(v){
   if(!v||v.version!==1||!Number.isSafeInteger(v.generation)||v.generation<1||!Array.isArray(v.entries)||v.entries.length>129)throw Error("Invalid update status.");
   var seen={};v.entries.forEach(function(e){if(!e||typeof e.key!=="string"||! /^(system|app:[a-z0-9][a-z0-9._-]{0,63})$/.test(e.key)||seen[e.key]||typeof e.fingerprint!=="string"||! /^[0-9a-f]{8}$/.test(e.fingerprint)||!g.CivVersions.parse(e.release))throw Error("Invalid update hint.");seen[e.key]=true;});return v;
  }
  function path(i){return C.root+"/update-status-"+i+".json";}
  async function load(){
   var valid=[],existing=0;for(var i=0;i<2;i++)try{var text=await io.read(path(i),65536,false);if(text===null)continue;existing++;var v=validate(C.open(text));if(v.generation%2!==i)throw Error("Update status slot mismatch.");valid.push(v);}catch(e){existing++;}
   if(!valid.length&&existing){failed=true;throw Error("Update status unreadable; saved files preserved.");}
   if(valid.length)current=valid.sort(function(a,b){return b.generation-a.generation;})[0];
  }
  function get(key,fingerprint){var e=current.entries.find(function(v){return v.key===key&&v.fingerprint===fingerprint;});return e?e.release:null;}
  function set(key,fingerprint,release){
   var task=tail.catch(function(){}).then(async function(){
    if(failed)throw Error("Update status is unavailable.");if(release?get(key,fingerprint)===release:!current.entries.some(function(e){return e.key===key;}))return;
    var entries=current.entries.filter(function(e){return e.key!==key;});if(release)entries.push({key:key,fingerprint:fingerprint,release:release});if(entries.length>129)entries.shift();
    var next=validate({version:1,generation:current.generation+1,entries:entries}),text=g.PayloadCore.seal(next),file=path(next.generation%2);
    await io.ensureDirectory(C.root);await io.write(file,text,false);await io.commit();if(await io.read(file,65536,false)!==text){failed=true;throw Error("Update status readback failed.");}current=next;
   });tail=task;return task;
  }
  return {load:load,get:get,set:set,close:function(){return tail.catch(function(){});}};
 }
 g.CivUpdateStatus={create:create,platform:platform};
})(typeof window!=="undefined"?window:globalThis);
