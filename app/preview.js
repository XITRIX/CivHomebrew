/* Browser-only adapter. Never included in the console bundle. */
(function(){
 var files={};
 window.PayloadPreview={io:{read:async function(p){return Object.prototype.hasOwnProperty.call(files,p)?files[p]:null;},write:async function(p,t){files[p]=t;},ensureDirectory:function(){},removeDirectory:function(p){Object.keys(files).forEach(function(name){if(name.indexOf(p+"/")===0)delete files[name];});},commit:function(){},remove:function(p){delete files[p];}}};
 window.PayloadPreview.launcherFactory=window.CivHomebrewLauncher;window.PayloadPreview.ftpFactory=window.CivFtp;
 var preview=window.PayloadPreview;preview.services=[];preview.rawQueue=[];preview.buttons=0n;
 preview.files={
  list:async function(p){var prefix=p.endsWith("/")?p:p+"/",entries={};Object.keys(files).forEach(function(k){if(k.indexOf(prefix)!==0)return;var tail=k.slice(prefix.length),name=tail.split("/")[0];if(!name)return;entries[name]={name:name,type:tail.indexOf("/")>=0?"dir":"file",bytes:tail.indexOf("/")>=0?0:PayloadCore.encode(files[k]).length};});return Object.keys(entries).map(function(n){return entries[n];});},
  stat:async function(p){if(p==="save:/")return {type:"dir",bytes:0};var prefix=p+"/";if(Object.keys(files).some(function(k){return k.indexOf(prefix)===0;}))return {type:"dir",bytes:0};if(Object.prototype.hasOwnProperty.call(files,p))return {type:"file",bytes:files[p].length};throw Error("File not found.");},
  read:preview.io.read,write:preview.io.write,commit:preview.io.commit,remove:preview.io.remove,
  mkdir:async function(){},rmdir:async function(){},rename:async function(){throw Error("Preview rename unavailable");}
 };
 preview.native={io:preview.io,files:preview.files,ip:function(){return "Browser preview";},
   listenTcp:function(port){if(port===preview.failFtpPort)throw Error("Port is already in use.");var entry={kind:"ftp",port:port||2130,closed:false,queue:[]};preview.services.push(entry);return {port:entry.port,accept:function(){return entry.queue.shift()||null;},close:function(){entry.closed=true;}};},
   serve:function(port,dispatch){preview.dispatch=dispatch;var entry={kind:"rpc",port:port,closed:false};preview.services.push(entry);return {stop:async function(){entry.closed=true;}};},
   rawTransport:function(){var entry={kind:"raw",closed:false};preview.services.push(entry);return {accept:function(){return preview.rawQueue.shift()||null;},close:function(){entry.closed=true;}};},
   controllerButtons:function(){return {poll:function(){return preview.buttons;},close:function(){}};}
 };
 function component(name,source){return {format:"civswitch-system",version:1,api:1,component:name,release:"0.2.0",source:source,checksum:PayloadCore.hash(source)};}
 window.PayloadPreview.seeds={launcher:component("launcher","window.CivFtp=PayloadPreview.ftpFactory;PayloadPreview.launcherFactory;"),core:component("core","(async function(){return await CivResidentEntry.start(window.__civhomebrewBoot);})();")};
 if(location.search.indexOf('demo=1')<0)return;
 var C=window.PayloadCore,names=['Hello CivSwitch','Moonlight','Payload test','Settings lab','Input viewer','Network tools','Save browser','Gameface lab','Clock','Controller test','Display test','Diagnostics','Audio lab','Native bridge','Sandbox','New experiment'];
 var entries=names.map(function(name,i){var p={format:'civswitch-app',version:1,id:'demo-'+i,name:name,metadata:{author:'CivSwitch experiments',release:'0.1.0',description:'Browser preview fixture',api:1},scripts:[{name:'app.js',source:'(async function(){var e=document.createElement("div");e.textContent="'+name+' — returning to menu…";e.style.cssText="position:fixed;inset:0;background:#111;color:white;font:32px Arial;display:flex;align-items:center;justify-content:center;z-index:1";document.body.appendChild(e);await new Promise(function(r){setTimeout(r,1200);});e.remove();})();'}],icon:''};var plan=C.installPlan(p);plan.files.forEach(function(f){files[C.appPath(p.id,f.name)]=f.data;});files[C.appPath(p.id,"manifest.json")]=plan.text;return plan.entry;});
 files[C.path('catalog-0.json')]=C.seal({version:2,generation:2,entries:entries});
 files[C.path('catalog-1.json')]=C.seal({version:2,generation:1,entries:entries});
})();
