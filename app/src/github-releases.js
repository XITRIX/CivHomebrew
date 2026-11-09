/* GitHub release discovery. No filesystem, installer or UI ownership. */
(function(g){
 "use strict";
 function config(metadata){
  var u=metadata&&metadata.extensions&&metadata.extensions.updates;if(!u||u.schema!==1)return null;
  var m=typeof u.releasesUrl==="string"&&/^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})\/releases\/latest\/?$/.exec(u.releasesUrl);
  if(!m||m[2]==="."||m[2]===".."||u.asset!==undefined&&(typeof u.asset!=="string"||! /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\.civapp$/.test(u.asset)))return null;
  return {repository:m[1]+"/"+m[2],asset:u.asset||null};
 }
 function allowHost(host){return ["api.github.com","github.com","objects.githubusercontent.com","release-assets.githubusercontent.com","github-releases.githubusercontent.com"].indexOf(host)>=0;}
 function create(http){
  async function release(declaration,cancel){
   var response=await http.get("https://api.github.com/repos/"+declaration.repository+"/releases/latest",{cancel:cancel,maxBytes:1048576,accept:"application/vnd.github+json",allowHost:allowHost});
   if(response.status!==200)throw Error("GitHub release lookup failed (HTTP "+response.status+").");
   var r=JSON.parse(g.PayloadCore.decode(response.body));if(!r||r.draft||r.prerelease||typeof r.tag_name!=="string"||!g.CivVersions.parse(r.tag_name))return null;
   if(!Array.isArray(r.assets)||r.assets.length>1024)throw Error("Invalid GitHub release assets.");return r;
  }
  function asset(a,r,declaration){
   if(!Number.isSafeInteger(a.size)||a.size<1||a.size>g.PayloadCore.maxFrame)throw Error("Release package exceeds the supported size.");
   var address=g.CivHttp.url(a.browser_download_url),prefix="/"+declaration.repository+"/releases/download/";
   if(address.host!=="github.com"||address.path.slice(0,prefix.length).toLowerCase()!==prefix.toLowerCase())throw Error("Release package belongs to an unexpected repository.");
   if(a.digest!==null&&a.digest!==undefined&&!/^sha256:[0-9a-f]{64}$/i.test(a.digest))throw Error("Unsupported release asset digest.");
   return {version:r.tag_name,name:a.name,url:address.href,bytes:a.size,digest:a.digest?a.digest.toLowerCase():null,repository:declaration.repository};
  }
  async function latest(declaration,cancel){
   var r=await release(declaration,cancel);if(!r)return null;
   var assets=r.assets.filter(function(a){return a&&a.state==="uploaded"&&typeof a.name==="string"&&/\.civapp$/.test(a.name)&&(!declaration.asset||a.name===declaration.asset);});
   if(assets.length!==1)throw Error("The release must identify exactly one app package.");return asset(assets[0],r,declaration);
  }
  async function latestSystem(declaration,cancel){
   var r=await release(declaration,cancel);if(!r)return null;
   function named(name){var found=r.assets.filter(function(a){return a&&a.state==="uploaded"&&a.name===name;});if(found.length!==1)throw Error("Release must contain one "+name+".");return asset(found[0],r,declaration);}
   var index=named("civhomebrew-release.json");if(index.bytes>65536)throw Error("Release manifest exceeds 64 KiB.");
   var response=await http.get(index.url,{cancel:cancel,maxBytes:65536,allowHost:allowHost});
   if(response.status!==200||response.body.length!==index.bytes)throw Error("Release manifest size or status mismatch.");
   if(index.digest&&"sha256:"+await g.CivSha256.hash(response.body,cancel)!==index.digest)throw Error("Release manifest checksum mismatch.");
   var manifest=JSON.parse(g.PayloadCore.decode(response.body));
   if(!manifest||manifest.format!=="civhomebrew-release"||manifest.version!==1||g.CivVersions.compare(manifest.release,r.tag_name)!==0||!manifest.components)throw Error("Invalid CivHomebrew release manifest.");
   var assets=["core","launcher"].map(function(component){
    var target=manifest.components[component];if(!target||!g.CivVersions.parse(target.release)||target.asset!==component+".civupdate"||typeof target.checksum!=="string"||! /^[0-9a-f]{8}$/.test(target.checksum))throw Error("Invalid "+component+" release target.");
    return Object.assign(named(target.asset),{component:component,release:target.release,checksum:target.checksum});
   });return {version:r.tag_name,assets:assets};
  }
  return {latest:latest,latestSystem:latestSystem,download:async function(a,o){return http.get(a.url,{cancel:o.cancel,maxBytes:g.PayloadCore.maxFrame,timeoutMs:90000,progress:o.progress,allowHost:allowHost});}};
 }
 g.CivGithubReleases={config:config,create:create};
})(typeof window!=="undefined"?window:globalThis);
