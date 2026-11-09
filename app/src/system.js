/* Two-slot component updates. The stable boot layer owns these files. */
(function(g){
 "use strict";
 var C=g.PayloadCore;
 function component(name){if(name!=="core"&&name!=="launcher")throw Error("Unknown system component.");return name;}
 function path(name,file){return C.path("system/"+component(name)+(file?"/"+file:""));}
 function image(p){
  if(!p||p.format!=="civswitch-system"||p.version!==1||p.api!==1)throw Error("Unsupported system update/API.");component(p.component);
  if(typeof p.release!=="string"||!p.release.trim()||p.release.length>32||/[\x00-\x1f\x7f]/.test(p.release))throw Error("Invalid component release.");
  if(typeof p.source!=="string"||!p.source.trim()||C.encode(p.source).length>8*1024*1024||p.checksum!==C.hash(p.source))throw Error("Invalid component source/checksum.");
  return {format:p.format,version:1,api:1,component:p.component,release:p.release,source:p.source,checksum:p.checksum};
 }
 function state(v){
  if(!v||v.version!==1||!Number.isSafeInteger(v.generation)||v.generation<1)throw Error("Invalid system state.");
  ["active","previous","pending"].forEach(function(k){if(v[k]!==null&&v[k]!==0&&v[k]!==1)throw Error("Invalid system slot.");});
  if(!Array.isArray(v.hashes)||v.hashes.length!==2||v.hashes.some(function(h){return h!==null&&(typeof h!=="string"||! /^[0-9a-f]{8}$/.test(h));}))throw Error("Invalid system slot hashes.");
  if(typeof v.attempted!=="boolean"||(v.active!==null&&v.active===v.pending)||(v.active!==null&&v.active===v.previous))throw Error("Conflicting system slots.");return v;
 }
 function create(io){
  var poisoned={};
  async function load(name){
   component(name);var valid=[],existing=0;
   for(var i=0;i<2;i++)try{var text=await io.read(path(name,"state-"+i+".json"),65536,false);if(text===null)continue;existing++;var v=state(C.open(text));if(v.generation%2!==i)throw Error("System state slot mismatch.");valid.push(v);}catch(e){existing++;}
   if(!valid.length&&existing)throw Error("System state unreadable: "+name+". Files preserved.");
   return valid.sort(function(a,b){return b.generation-a.generation;})[0]||{version:1,generation:0,active:null,previous:null,pending:null,attempted:false,hashes:[null,null]};
  }
  async function write(file,text,limit){await io.write(file,text,false);await io.commit();if(await io.read(file,limit,false)!==text)throw Error("System update readback failed.");}
  async function save(name,v){
   if(poisoned[name])throw Error("System state uncertain; restart before updating.");
   v=Object.assign({},v,{generation:v.generation+1});state(v);poisoned[name]=true;
   await write(path(name,"state-"+(v.generation%2)+".json"),C.seal(v),65536);poisoned[name]=false;return v;
  }
  async function slot(name,index,expected){
   if(index!==0&&index!==1)throw Error("No working "+name+" installed.");
   var text=await io.read(path(name,"slot-"+index+".json"),65536,false);if(text===null)throw Error("Missing system slot metadata.");var m=C.open(text);
   var source=await io.read(path(name,"slot-"+index+".js"),8*1024*1024,false);
   var p=image(Object.assign({},m,{source:source}));if(p.component!==name||p.checksum!==expected||C.encode(source).length!==m.bytes)throw Error("System slot identity mismatch.");return Object.assign(p,{slot:index});
  }
  async function stage(input){
   var p=image(input),name=p.component;if(poisoned[name])throw Error("System state uncertain; restart before updating.");var v=await load(name),index=v.active===0?1:0;
   await io.ensureDirectory(C.root);await io.ensureDirectory(C.path("system"));await io.ensureDirectory(path(name));
   // The active slot is untouched. Source is verified before metadata/state publish.
   await write(path(name,"slot-"+index+".js"),p.source,8*1024*1024);
   var m=Object.assign({},p,{bytes:C.encode(p.source).length});delete m.source;
   await write(path(name,"slot-"+index+".json"),C.seal(m),65536);
   v.hashes=v.hashes.slice();v.hashes[index]=p.checksum;v.pending=index;v.attempted=false;if(v.previous===index)v.previous=null;await save(name,v);return {component:name,release:p.release,restartRequired:name==="core"};
  }
  async function reject(name){var v=await load(name);if(v.pending!==null){v.pending=null;v.attempted=false;await save(name,v);}}
  async function choose(name,recovery){
   var v=await load(name);
   if(v.pending!==null&&!recovery){
    if(v.attempted){await reject(name);v=await load(name);}
    else{
     v.attempted=true;await save(name,v);
     try{return Object.assign(await slot(name,v.pending,v.hashes[v.pending]),{trial:true});}catch(e){await reject(name);v=await load(name);}
    }
   }
   try{return Object.assign(await slot(name,v.active,v.hashes[v.active]),{trial:false});}
   catch(e){
    if(v.previous===null)throw e;var previous=await slot(name,v.previous,v.hashes[v.previous]);v.active=v.previous;v.previous=null;await save(name,v);return Object.assign(previous,{trial:false});
   }
  }
  async function confirm(name,selected){
   if(!selected||!selected.trial)return;var v=await load(name);
   if(v.pending!==selected.slot||!v.attempted)throw Error("System trial changed before acknowledgement.");
   v.previous=v.active;v.active=v.pending;v.pending=null;v.attempted=false;await save(name,v);
  }
  async function rollback(name){
   var v=await load(name);await slot(name,v.previous,v.hashes[v.previous]);
   v.active=v.previous;v.previous=null;v.pending=null;v.attempted=false;await save(name,v);
   return {component:name,restartRequired:name==="core"};
  }
  async function seed(p){var v=await load(p.component);if(v.generation===0)await stage(p);}
  return {stage:stage,choose:choose,confirm:confirm,reject:reject,rollback:rollback,seed:seed,status:load};
 }
 g.CivSystem={create:create,image:image};
})(typeof window!=="undefined"?window:globalThis);
