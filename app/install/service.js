/* Finite trigger-only installation service. No directory clearing or game template. */
(function(g){
 "use strict";
 var ROOT="save:/civhomebrew/boot-install",TARGET="save:/saves/Single/XSTRIG.Civ7Save";
 function create(files,system){
  var C=g.PayloadCore,paths={pairing0:"save:/moonlight-experiment/pairing-0.json",pairing1:"save:/moonlight-experiment/pairing-1.json",current:TARGET,original:ROOT+"/original.Civ7Save",candidate:ROOT+"/candidate.Civ7Save",previous:ROOT+"/previous.Civ7Save",receipt:ROOT+"/receipt.json"},busy=false,uncertain=false;
  async function read(name){if(!paths[name])throw Error("Unknown installation file.");return files.read(paths[name],C.maxFrame,true);}
  function identity(bytes){return bytes===null?null:{bytes:bytes.length,checksum:C.hash(bytes)};}
  function matches(bytes,expected){return bytes!==null&&expected&&bytes.length===expected.bytes&&C.hash(bytes)===expected.checksum;}
  async function ensure(){for(var p of ["save:/civhomebrew",ROOT])try{await files.mkdir(p);}catch(e){var stat=await files.stat(p);if(!stat||stat.type!=="dir")throw e;}}
  async function verified(name,bytes){await files.write(paths[name],bytes);await files.commit();if(await read(name)!==bytes)throw Error("Installation readback failed: "+name);}
  async function exclusive(fn){if(busy||uncertain)throw Error("Installer busy or state uncertain; inspect backups before retrying.");busy=true;try{return await fn();}finally{busy=false;}}
  async function inspect(){var current=await read("current"),original=await read("original");return {current:identity(current),original:identity(original),single:await files.list("save:/saves/Single"),uncertain:uncertain};}
  async function backup(expected){return exclusive(async function(){await ensure();var current=await read("current");if(!matches(current,expected))throw Error("Trigger changed before backup.");var old=await read("original");if(old!==null&&old!==current)throw Error("A different original backup already exists; preserved.");if(old===null)await verified("original",current);return {original:identity(current)};});}
  async function stage(encoded,expected){return exclusive(async function(){await ensure();var bytes=C.unbase64(encoded);if(!matches(bytes,expected)||bytes.slice(0,4)!=="CIV7")throw Error("Invalid trigger candidate.");await verified("candidate",bytes);return {candidate:identity(bytes)};});}
  async function publish(expectedCurrent,expectedCandidate,expectedOriginal,mode,expectedBootstrap){return exclusive(async function(){
   if(mode!=="install"&&mode!=="restore")throw Error("Invalid installation mode.");
   var before=await read("current"),candidate=await read("candidate"),original=await read("original");
   if(!matches(before,expectedCurrent)||!matches(candidate,expectedCandidate)||!matches(original,expectedOriginal))throw Error("Trigger or backup changed; nothing replaced.");
   if(mode==="install"&&!matches(await read("bootstrap"),expectedBootstrap))throw Error("Bootstrap file changed; trigger preserved.");
   if(mode==="restore"&&candidate!==original)throw Error("Restore candidate differs from the original backup.");
   if(before===candidate)return {installed:identity(candidate),changed:false};
   var moved=false,published=false;
   try{
    if(await read("previous")!==null){await files.remove(paths.previous);await files.commit();}
    await files.rename(paths.current,paths.previous);moved=true;await files.commit();
    await files.rename(paths.candidate,paths.current);published=true;await files.commit();
    if(await read("current")!==candidate)throw Error("Published trigger readback failed.");
    await verified("receipt",C.encode(JSON.stringify({version:1,mode:mode,current:identity(candidate),original:identity(original)})));
    return {installed:identity(candidate),changed:true};
   }catch(error){
    if(moved)try{
     if(published)await files.remove(paths.current);
     await files.rename(paths.previous,paths.current);await files.commit();
     if(await read("current")!==before)throw Error("Rollback readback failed.");
    }catch(rollback){uncertain=true;throw Error("Trigger state uncertain. Preserve PC backup and inspect with save manager. "+rollback.message);}
    throw Error("Installation failed; original active trigger restored. "+error.message);
   }
  });}
  async function dispatch(r){
   if(!r||r.protocol!==1)throw Error("Unsupported installer protocol.");
   if(r.op==="inspect")return inspect();
   if(r.op==="get"){var bytes=await read(r.name);return {data:bytes===null?null:C.base64(bytes),identity:identity(bytes)};}
   if(r.op==="bootstrap")return exclusive(async function(){await ensure();var bytes=C.unbase64(r.data);if(!matches(bytes,r.expected)||! /^[0-9a-f]{8}$/.test(r.expected.checksum)||bytes.length>512*1024)throw Error("Invalid bootstrap image.");paths.bootstrap=ROOT+"/bootstrap-"+r.expected.checksum+".js";var old=await read("bootstrap");if(old!==null&&old!==bytes)throw Error("Bootstrap identity collision; files preserved.");if(old===null)await verified("bootstrap",bytes);return {bootstrap:identity(bytes),path:paths.bootstrap};});
   if(r.op==="backup")return backup(r.expected);
   if(r.op==="component"){if(!system)throw Error("Component installer unavailable.");return exclusive(function(){return system.stage(r.package);});}
   if(r.op==="stage")return stage(r.data,r.expected);
   if(r.op==="publish")return publish(r.current,r.candidate,r.original,r.mode,r.bootstrap);
   throw Error("Unknown installer operation.");
  }
  return {dispatch:dispatch};
 }
 async function serve(port){
  if(g.__civBootInstaller)throw Error("An installation service is already running.");
  var native=g.PayloadNative.create(),service=create(native.files,g.CivSystem.create(native.io)),finish,closed=false,last=Date.now();
  var lifetime=new Promise(function(r){finish=r;});g.__civBootInstaller={close:finish};
  var server,timer;
  try{
   server=native.serve(port,async function(r){last=Date.now();try{if(r.op==="finish")return {response:{ok:true},after:finish};return {response:Object.assign({ok:true},await service.dispatch(r))};}catch(e){return {response:{ok:false,error:String(e.message).slice(0,400)}};}},function(e){log("CIV_BOOT_INSTALLER_ERROR "+e.message);finish();});
   timer=setInterval(function(){if(Date.now()-last>120000)finish();},1000);
   await log("CIV_BOOT_INSTALLER_READY "+port);await lifetime;
  }finally{closed=true;if(timer)clearInterval(timer);if(server)await server.stop();delete g.__civBootInstaller;}
  await log("CIV_BOOT_INSTALLER_STOPPED");
 }
 g.CivBootInstaller={create:create,serve:serve};
})(typeof window!=="undefined"?window:globalThis);
