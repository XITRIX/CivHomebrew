/* Self-update policy lives in the launcher; existing component APIs own staging. */
(function(g){
 "use strict";
 function platform(api,boot){
  var C=g.PayloadCore;
  async function snapshot(){
   var result={};for(var name of ["core","launcher"]){
    var s=await boot.system.status(name),trial=s.pending!==null&&s.attempted,index=trial?s.pending:s.active;if(index===null)throw Error("No active "+name+" component.");
    var m=C.open(await boot.native.io.read(C.path("system/"+name+"/slot-"+index+".json"),65536,false));
    if(m.component!==name||m.checksum!==s.hashes[index])throw Error("Component metadata changed.");
    result[name]={release:m.release,checksum:m.checksum,pending:s.pending===null||trial?null:s.hashes[s.pending]};
   }return result;
  }
  return {snapshot:snapshot,stage:function(p){return api.submit(p.component+".civupdate",C.encode(JSON.stringify(p)));}};
 }
 function create(o){
  var C=g.PayloadCore,V=g.CivVersions,http=o.http||g.CivHttp.create(),provider=o.provider||g.CivGithubReleases.create(http),adapter=o.platform||platform(o.api,o.boot),declaration={repository:"XITRIX/CivHomebrew"},last=null;
  function active(cancel){if(cancel&&cancel.cancelled)throw g.CivHttp.cancelled();}
  function fingerprint(s){return C.hash(JSON.stringify(s));}
  async function remember(s,release){if(o.status)try{await o.status.set("system",fingerprint(s),release);}catch(e){if(o.diagnostic)o.diagnostic(e.message);}}
  async function snapshot(){last=await adapter.snapshot();return last;}
  async function check(cancel){
   active(cancel);var before=await snapshot();active(cancel);if(before.core.pending)return {kind:"restart"};
   var release,comparison;try{
    release=await provider.latestSystem(declaration,cancel);active(cancel);comparison=release?0:null;
    if(release){
     if(!Array.isArray(release.assets)||release.assets.length!==2||["core","launcher"].some(function(name){return release.assets.filter(function(a){return a.component===name;}).length!==1;}))throw Error("Release must describe both components.");
     for(var target of release.assets){var c=V.compare(target.release,before[target.component].release);if(c===null){comparison=null;break;}if(target.checksum!==before[target.component].checksum){if(c!==1){comparison=c===-1?-1:null;break;}comparison=1;}}
    }
   }
   catch(e){if(e.cancelled)throw e;if(o.diagnostic)o.diagnostic("System update check: "+String(e.message).slice(0,180));return {kind:"latest",reason:"unverified"};}
   if(fingerprint(await snapshot())!==fingerprint(before))throw Error("CivHomebrew changed; check for updates again.");
   if(comparison===1||comparison===0||comparison===-1)await remember(before,comparison===1?release.version:null);
   active(cancel);if(comparison!==1)return {kind:"latest",reason:comparison===0?"equal":comparison===-1?"older":"unverified"};
   return {kind:"update",release:release,snapshot:before};
  }
  async function install(offer,options){
   options=options||{};var cancel=options.cancel,images=[],total=0,completed=0;active(cancel);
   if(fingerprint(await snapshot())!==fingerprint(offer.snapshot))throw Error("CivHomebrew changed; check for updates again.");
   var needed=offer.release.assets.filter(function(a){return a.checksum!==offer.snapshot[a.component].checksum;});
   needed.forEach(function(a){if(V.compare(a.release,offer.snapshot[a.component].release)!==1)throw Error("Component version is not newer.");total+=a.bytes;});if(total>C.maxFrame*2)throw Error("System update exceeds the download limit.");
   for(var asset of needed){
    var r=await provider.download(asset,{cancel:cancel,progress:function(done){if(options.progress)options.progress(completed+done,total);}});active(cancel);
    if(r.status!==200||r.body.length!==asset.bytes||r.body.length>C.maxFrame)throw Error("Component download size or status mismatch.");
    if(asset.digest&&"sha256:"+await g.CivSha256.hash(r.body,cancel)!==asset.digest)throw Error("Component download checksum mismatch.");
    var p=g.CivSystem.image(JSON.parse(C.decode(r.body)));
    if(p.component!==asset.component||V.compare(p.release,asset.release)!==0||p.checksum!==asset.checksum)throw Error("Component identity, version or checksum mismatch.");
    images.push(p);completed+=r.body.length;
   }
   if(!images.length||images.length>2||["core","launcher"].some(function(name){return images.filter(function(p){return p.component===name;}).length>1;}))throw Error("Invalid component set.");
   active(cancel);if(fingerprint(await snapshot())!==fingerprint(offer.snapshot))throw Error("CivHomebrew changed; check for updates again.");
   // All downloads validate before any write. Unchanged core code never needs a restart.
   var changed=images.sort(function(a,b){return a.component==="core"?-1:b.component==="core"?1:0;}),coreStaged=false,reload=null,expected=JSON.parse(JSON.stringify(offer.snapshot));
   if(options.installing)options.installing();
   try{
    for(var image of changed){
     if(fingerprint(await snapshot())!==fingerprint(expected))throw Error("Component staging changed; restart before updating again.");
     var result=await adapter.stage(image);expected[image.component].pending=image.checksum;if(image.component==="core")coreStaged=true;else reload=result&&result.after;
    }
    if(fingerprint(await snapshot())!==fingerprint(expected))throw Error("Component staging changed before activation.");
   }catch(e){try{last=await snapshot();}catch(_){}if(coreStaged||last&&last.core.pending)e.restartRequired=true;throw e;}
   await remember(offer.snapshot,null);last=await snapshot();
   if(coreStaged)return {kind:"restart"};
   if(reload)reload();return {kind:"reloading"};
  }
  return {initialize:snapshot,available:function(){return !!(last&&o.status&&o.status.get("system",fingerprint(last)));},check:check,install:install,close:http.close};
 }
 g.CivSystemUpdates={create:create,platform:platform};
})(typeof window!=="undefined"?window:globalThis);
