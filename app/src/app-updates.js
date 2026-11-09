/* Replaceable update coordinator; networking finishes before store mutation. */
(function(g){
 "use strict";
 function create(o){
  var C=g.PayloadCore,http=o.http||g.CivHttp.create(),provider=o.provider||g.CivGithubReleases.create(http);
  function current(entry){var now=o.api.list().find(function(e){return e.id===entry.id;});if(!now||now.checksum!==entry.checksum)throw Error("App changed; reopen its menu before updating.");return now;}
  function active(cancel){if(cancel&&cancel.cancelled)throw g.CivHttp.cancelled();}
  async function check(entry,cancel){
   active(cancel);var info=await o.library.describe(entry.id,entry.checksum);active(cancel);current(entry);
   var declaration=g.CivGithubReleases.config(info.metadata);if(!declaration)return {kind:"unavailable"};
   try{
    var release=await provider.latest(declaration,cancel);active(cancel);current(entry);
    var comparison=release&&g.CivVersions.compare(release.version,info.metadata.release);
    if(comparison!==1)return {kind:"latest",reason:comparison===0?"equal":comparison===-1?"older":"unverified"};
    return {kind:"update",entry:{id:entry.id,name:entry.name,checksum:entry.checksum},installed:info.metadata.release,release:release};
   }catch(e){if(e.cancelled)throw e;current(entry);if(o.diagnostic)o.diagnostic("Update check: "+String(e.message).slice(0,180));return {kind:"latest",reason:"unverified"};}
  }
  async function install(offer,options){
   options=options||{};var cancel=options.cancel;active(cancel);current(offer.entry);
   var result=await provider.download(offer.release,{cancel:cancel,progress:options.progress});active(cancel);
   if(result.status!==200)throw Error("Package download failed (HTTP "+result.status+").");
   var bytes=result.body;if(bytes.length!==offer.release.bytes||bytes.length>C.maxFrame)throw Error("Downloaded package size does not match the release.");
   if(offer.release.digest&&"sha256:"+await g.CivSha256.hash(bytes,cancel)!==offer.release.digest)throw Error("Downloaded package checksum does not match the release.");
   active(cancel);var p=C.package(JSON.parse(C.decode(bytes)));
   if(p.id!==offer.entry.id)throw Error("Downloaded package has a different app ID.");
   if(g.CivVersions.compare(p.metadata.release,offer.release.version)!==0||g.CivVersions.compare(p.metadata.release,offer.installed)!==1)throw Error("Package version does not match the offered update.");
   active(cancel);current(offer.entry);
   // These operations stay synchronous through entry into the serialized installer.
   if(options.installing)options.installing();return o.api.submit(p.id+".civapp",C.encode(JSON.stringify(p)));
  }
  return {supports:function(metadata){return !!g.CivGithubReleases.config(metadata);},check:check,install:install,close:http.close};
 }
 g.CivAppUpdates={create:create};
})(typeof window!=="undefined"?window:globalThis);
