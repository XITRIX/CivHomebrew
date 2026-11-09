/* Resident ownership: installer, foreground lifetimes, inbox and system updates. */
(function(g){
 "use strict";
 function create(o){
  var C=g.PayloadCore,store=C.createStore(o.io),settings=g.CivFtpSettings.create(o.io,(o.config||{}).ftpPort),ftpFiles,launcher=null,mode="terminal",transition=false,operation=null,closed=false,appId=null,lastSelection=null,lastError="",job=Promise.resolve();
  function log(text){if(o.log)o.log(String(text));}
  function show(value){mode=value;if(o.view)o.view(value);}
  function status(){return {mode:mode,busy:!!operation||transition,app:appId,launcher:!!launcher,ftp:!!(launcher&&launcher.ftpState&&launcher.ftpState().running),closed:closed,services:o.services?o.services():{}};}
  function available(){if(closed)throw Error("Core is stopped.");if(transition||mode==="app")throw Error("Foreground app or transition active.");}
  async function exclusive(fn){
   available();if(operation)throw Error("Installer is busy.");
   var resolve;operation=new Promise(function(r){resolve=r;});
   try{return await fn();}finally{operation=null;resolve();}
  }
  async function unload(){
   var old=launcher;launcher=null;if(old){if(old.selection)lastSelection=old.selection();await old.close();}
   if(g.__civswitchApp===old)delete g.__civswitchApp;
   delete g.CivHomebrewLauncher;delete g.CivFtp;
   show("terminal");
  }
  async function mount(){
   if(closed)return;if(launcher)return;show("terminal");var selected=null;
   try{
    selected=await o.system.choose("launcher",false);
    var factory=await o.evaluate(selected.source);
    if(!factory||factory.api!==1||typeof factory.mount!=="function")throw Error("Launcher API mismatch.");
    var api={list:store.list,icon:store.icon,ip:o.ip,selection:lastSelection,error:lastError,config:o.config||{},
     log:log,terminal:function(){scheduleTerminal();},launch:function(id,progress){scheduleLaunch(id,progress);},
     listen:o.listen,ftpSettings:settings.get(),saveFtpSettings:function(v){return exclusive(function(){return settings.save(v);});},files:ftpFiles,
     submit:acceptUpload,appStore:appStore};
    launcher=await factory.mount(api);if(!launcher||typeof launcher.close!=="function")throw Error("Launcher did not provide cleanup.");
    g.__civswitchApp=launcher;await o.system.confirm("launcher",selected);lastError="";show("launcher");log("CIV_LAUNCHER_READY "+selected.release);
   }catch(e){
    lastError="Launcher failed: "+e.message;log(lastError);await unload();
    if(selected&&selected.trial){await o.system.reject("launcher");try{var previous=await o.system.choose("launcher",true);if(previous)await mount();}catch(f){log("Launcher recovery: "+f.message);}}
   }
  }
  function scheduleTerminal(){available();transition=true;job=(async function(){try{await unload();if(operation)await operation;}finally{transition=false;}})();job.catch(log);}
  async function cleanupChild(){var child=g.__civswitchApp;if(child===launcher)return;if(child&&typeof child.close==="function")await child.close();if(g.__civswitchApp===child)delete g.__civswitchApp;}
  function scheduleLaunch(id,onProgress,payload){
   available();if(transition)throw Error("Transition in progress.");C.id(id);transition=true;
   job=(async function(){
    try{
     if(!onProgress&&!payload&&launcher&&launcher.loading)onProgress=launcher.loading(id);
     // Stop launcher services first. Accepted installs finish; incomplete uploads cancel.
     if(launcher&&launcher.stopServices)await launcher.stopServices();
     if(operation)await operation;
     var m=!payload?await store.manifest(id):null;
     if(m&&C.orderedScripts(m.metadata)){
      if(typeof o.evaluateScripts!=="function")throw Error("Ordered scripts require the CivHomebrew 0.4.3 bootstrap. Update the boot installation.");
      var reader=await store.scriptReader(id,onProgress);
      await o.evaluateScripts(async function(){
       var piece=await reader.next();
       if(piece&&piece.last){onProgress=null;await unload();appId=m.id;show("app");log("Executing "+m.name+"...");}
       return piece?piece.source:null;
      });
     }else{
      var p=payload||await store.read(id,onProgress);onProgress=null;
      await new Promise(function(r){setTimeout(r,25);});
      await unload();appId=p.id;show("app");log("Executing "+p.name+"...");
      await o.evaluate(C.source(p));
     }
     await cleanupChild();log("Executed successfully");
    }catch(e){lastError="App failed: "+e.message;log(lastError);try{await cleanupChild();}catch(f){log("Cleanup failed: "+f.message);}await unload();}
    finally{onProgress=null;appId=null;try{if(!closed)await mount();}finally{transition=false;}}
   })();job.catch(log);
  }
  async function raw(source,writer){
   available();if(operation)throw Error("Installer is busy.");transition=true;
   try{await unload();if(o.rawWriter)o.rawWriter(writer);await o.evaluate(source);await cleanupChild();}
   finally{try{await cleanupChild();}finally{if(o.rawWriter)await o.rawWriter(null);try{await store.load();}catch(e){log(e.message);}transition=false;show("terminal");}}
  }
  async function installing(p,work){
   var display=launcher&&launcher.installing?launcher.installing(p.name):null,error="";
   try{if(display)await new Promise(function(r){setTimeout(r,25);});return await work(display?display.progress:null);}
   catch(e){error=e.message;throw e;}
   finally{if(display)display.close(error);}
  }
  async function install(p){return exclusive(async function(){p=C.package(p);return installing(p,async function(onProgress){if(launcher&&launcher.flushArt)await launcher.flushArt();var e=await store.install(p,onProgress);log("Installed "+e.name);if(launcher&&launcher.refresh)launcher.refresh();return e;});});}
  async function appStore(work){return exclusive(async function(){
   if(launcher&&launcher.flushArt)await launcher.flushArt();
   try{return await store.transaction(work);}
   finally{if(launcher&&launcher.refresh)launcher.refresh();}
  });}
  function inboxPath(name){if(typeof name!=="string"||! /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\.(civapp|civupdate)$/.test(name))throw Error("Invalid inbox filename.");return C.path("inbox/"+name);}
  async function inboxList(){var text=await o.io.read(C.path("inbox/index.json"),65536,false);if(text===null)return [];var entries=C.open(text);if(!Array.isArray(entries)||entries.length>16)throw Error("Invalid inbox index.");var seen={};entries.forEach(function(e){inboxPath(e.name);if(seen[e.name]||!Number.isSafeInteger(e.bytes)||e.bytes<1||e.bytes>C.maxFrame)throw Error("Invalid inbox entry.");seen[e.name]=true;});return entries;}
  async function cleanInbox(){
   var names=[];
   if(o.files&&o.files.list){
    var parent=await o.files.list(C.root);
    if(parent.some(function(e){return e.name==="inbox"&&e.type==="dir";}))names=(await o.files.list(C.path("inbox"))).filter(function(e){return e.type==="file";}).map(function(e){return e.name;});
   }else names=(await inboxList()).map(function(e){return e.name;});
   var paths=[];
   names.forEach(function(name){if(name==="index.json")return;try{paths.push(inboxPath(name));}catch(_){}});
   // Retire only recognized upload copies, including pre-index crash leftovers.
   for(var i=0;i<paths.length;i++)await o.io.remove(paths[i]);
   await o.io.remove(C.path("inbox/index.json"));await o.io.commit();
   for(var j=0;j<paths.length;j++)if(await o.io.read(paths[j],C.maxFrame,true)!==null)throw Error("Old upload cleanup readback failed.");
   if(await o.io.read(C.path("inbox/index.json"),65536,false)!==null)throw Error("Old upload index cleanup failed.");
  }
  async function stageUpdate(p){return exclusive(function(){return o.system.stage(p);});}
  async function restartLauncher(){available();if(operation)throw Error("Installer is busy.");transition=true;try{await unload();await mount();}finally{transition=false;}}
  async function acceptUpload(name,bytes){
   return exclusive(async function(){
    inboxPath(name);if(typeof bytes!=="string"||!bytes.length||bytes.length>C.maxFrame)throw Error("Invalid upload size.");
    var p=JSON.parse(C.decode(bytes)),system=name.endsWith(".civupdate");p=system?g.CivSystem.image(p):C.package(p);
    async function save(onProgress){
    // Uploads stay in bounded memory; only extracted app files or system slots persist.
    if(system){await o.system.stage(p);return {after:p.component==="launcher"?function(){restartLauncher().catch(log);}:null};}
    if(launcher&&launcher.flushArt)await launcher.flushArt();var entry=await store.install(p,onProgress);log("Installed "+entry.name);if(launcher&&launcher.refresh)launcher.refresh();return {entry:entry};
    }
    return system?save(null):installing(p,save);
   });
  }
  async function start(){transition=true;try{try{await settings.load();}catch(e){lastError=e.message;log(e.message);}try{await store.load();}catch(e){lastError=e.message;log(e.message);}try{await cleanInbox();}catch(e){lastError="Upload cleanup: "+e.message;log(lastError);}if(!o.terminal)await mount();}finally{transition=false;}}
  async function shutdown(){available();transition=true;try{await unload();if(operation)await operation;closed=true;if(o.shutdown)await o.shutdown();}finally{transition=false;}}
  async function dispatch(r){
   if(!r||r.protocol!==1)throw Error("Unsupported companion protocol.");
   if(r.op==="hello")return {response:{ok:true,app:"CivHomebrew",protocol:1,packageVersion:1,core:1}};
   if(r.op==="status")return {response:{ok:true,state:status()}};
   if(r.op==="list")return {response:{ok:true,entries:store.list()}};
   if(r.op==="install")return {response:{ok:true,entry:await install(r.package)}};
   if(r.op==="update"){var updated=await stageUpdate(r.package);return {response:{ok:true,update:updated},after:r.package.component==="launcher"?function(){restartLauncher().catch(log);}:null};}
   if(r.op==="rollback"){var rolled=await exclusive(function(){return o.system.rollback(r.component);});return {response:{ok:true,update:rolled},after:r.component==="launcher"?function(){restartLauncher().catch(log);}:null};}
   if(r.op==="run"||r.op==="run-source"){
    available();if(operation)throw Error("Installer is busy.");var p=r.op==="run-source"?C.package(r.package):null;
    var entry=p||store.list().find(function(e){return e.id===r.id;});if(!entry)throw Error("Payload not installed.");
    return {response:{ok:true,state:"accepted",name:entry.name},after:function(){scheduleLaunch(entry.id,null,p);}};
   }
   if(r.op==="launcher"){available();return {response:{ok:true},after:function(){restartLauncher().catch(log);}};}
   if(r.op==="terminal"){available();return {response:{ok:true},after:scheduleTerminal};}
   if(r.op==="shutdown"){available();return {response:{ok:true},after:function(){shutdown().catch(log);}};}
   throw Error("Unknown companion operation.");
  }
  ftpFiles=g.CivFtpFiles.create({files:o.files,settings:settings.get,submit:acceptUpload,
   mutate:exclusive,changed:async function(){await store.load();if(launcher&&launcher.refresh)launcher.refresh();}});
  return {start:start,dispatch:dispatch,install:install,executeRaw:raw,showLauncher:restartLauncher,showTerminal:scheduleTerminal,launch:scheduleLaunch,
   getState:status,shutdown:shutdown,rawBusy:function(){return closed||transition||!!operation||mode==="app";},idle:function(){return job;},store:store};
 }
 g.CivResident={create:create};
})(typeof window!=="undefined"?window:globalThis);
