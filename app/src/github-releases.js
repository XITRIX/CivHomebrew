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
  async function latest(declaration,cancel){
   var response=await http.get("https://api.github.com/repos/"+declaration.repository+"/releases/latest",{cancel:cancel,maxBytes:1048576,accept:"application/vnd.github+json",allowHost:allowHost});
   if(response.status!==200)throw Error("GitHub release lookup failed (HTTP "+response.status+").");
   var release=JSON.parse(g.PayloadCore.decode(response.body));if(!release||release.draft||release.prerelease||typeof release.tag_name!=="string"||!g.CivVersions.parse(release.tag_name))return null;
   if(!Array.isArray(release.assets)||release.assets.length>1024)throw Error("Invalid GitHub release assets.");
   var assets=release.assets.filter(function(a){return a&&a.state==="uploaded"&&typeof a.name==="string"&&/\.civapp$/.test(a.name)&&(!declaration.asset||a.name===declaration.asset);});
   if(assets.length!==1)throw Error("The release must identify exactly one app package.");
   var asset=assets[0];if(!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>g.PayloadCore.maxFrame)throw Error("Release package exceeds the supported size.");
   var address=g.CivHttp.url(asset.browser_download_url),prefix="/"+declaration.repository+"/releases/download/";
   if(address.host!=="github.com"||address.path.slice(0,prefix.length).toLowerCase()!==prefix.toLowerCase())throw Error("Release package belongs to an unexpected repository.");
   if(asset.digest!==null&&asset.digest!==undefined&&!/^sha256:[0-9a-f]{64}$/i.test(asset.digest))throw Error("Unsupported release asset digest.");
   return {version:release.tag_name,name:asset.name,url:address.href,bytes:asset.size,digest:asset.digest?asset.digest.toLowerCase():null,repository:declaration.repository};
  }
  return {latest:latest,download:async function(asset,o){return http.get(asset.url,{cancel:o.cancel,maxBytes:g.PayloadCore.maxFrame,timeoutMs:90000,progress:o.progress,allowHost:allowHost});}};
 }
 g.CivGithubReleases={config:config,create:create};
})(typeof window!=="undefined"?window:globalThis);
