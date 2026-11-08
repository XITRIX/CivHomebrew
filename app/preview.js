/* Browser-only adapter. Never included in the console bundle. */
(function(){
 var files={};
 window.PayloadPreview={io:{read:async function(p){return Object.prototype.hasOwnProperty.call(files,p)?files[p]:null;},write:async function(p,t){files[p]=t;},ensure:function(){},commit:function(){},remove:function(p){delete files[p];}}};
 if(location.search.indexOf('demo=1')<0)return;
 var C=window.PayloadCore,names=['Hello CivSwitch','Moonlight','Payload test','Settings lab','Input viewer','Network tools','Save browser','Gameface lab','Clock','Controller test','Display test','Diagnostics','Audio lab','Native bridge','Sandbox','New experiment'];
 var entries=names.map(function(name,i){var p={format:'civswitch-app',version:1,id:'demo-'+i,name:name,metadata:{author:'CivSwitch experiments',release:'0.1.0',description:'Browser preview fixture',api:1},scripts:[{name:'app.js',source:'(async function(){var e=document.createElement("div");e.textContent="'+name+' — returning to menu…";e.style.cssText="position:fixed;inset:0;background:#111;color:white;font:32px Arial;display:flex;align-items:center;justify-content:center;z-index:1";document.body.appendChild(e);await new Promise(function(r){setTimeout(r,1200);});e.remove();})();'}],icon:''};var t=C.seal(C.package(p)),file='package-'+(i+1)+'.json';files[C.path(file)]=t;return {id:p.id,name:p.name,file:file,bytes:C.encode(t).length,checksum:C.hash(t)};});
 files[C.path('catalog-1.json')]=C.seal({version:1,generation:17,entries:entries});
})();
