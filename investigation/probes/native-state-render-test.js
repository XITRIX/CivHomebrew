/* Reproduce old bootstrap read/write overlap using isolated temporary files.
 * Arm from an idle resident; execute after raw cleanup so native UI is active.
 * __serializeNativeStateTest selects the fix. No installed slot is modified. */
(function(g){
 var r={started:Date.now(),finished:false,serialized:!!g.__serializeNativeStateTest,events:[],cleanup:[],error:null};
 g.__nativeStateRenderTest=r;
 setTimeout(async function(){
  var n=null,made=[],root='save:/civhomebrew/startup-state-test',pulse=null;
  try{
   await g.__civhomebrewCore.showLauncher();
   var b=g.__civhomebrewBoot,text=await b.native.files.read('save:/civhomebrew/boot-install/bootstrap-9f9b52a4.js',524288,false);
   var end=text.indexOf('/* Stable boot layer'),prefix=text.slice(text.indexOf('\n')+1,end),scope={CivHomebrewSDK:CivHomebrewSDK};
   (function(window){eval(prefix);})(scope);text=null;
   n=scope.PayloadNative.create();var C=scope.PayloadCore;
   function mapped(p){return root+p.slice(C.root.length);}
   async function ensure(p){try{await n.files.mkdir(p);}catch(e){if(!/0x402$/.test(e.message)||(await n.files.stat(p)).type!=='dir')throw e;}}
   var io={read:function(p,limit,binary){return n.files.read(mapped(p),limit,binary);},
    write:function(p,v,binary){made.push(mapped(p));return n.files.write(mapped(p),v,binary);},
    ensureDirectory:function(p){return ensure(mapped(p));},commit:n.files.commit};
   function image(name,release,source){return {format:'civswitch-system',version:1,api:1,component:name,release:release,source:source,checksum:C.hash(source)};}
   await ensure(root);var s=scope.CivSystem.create(io);
   if(r.serialized)g.CivResident.serializeSystem(s);
   for(var name of ['core','launcher']){await s.stage(image(name,'1','({api:1})'));await s.confirm(name,await s.choose(name,false));}
   var shared=CivAppsNativeUI.sessions.current,frames=0;
   pulse=setInterval(function(){try{if(shared.active){shared.active.ui.update(true);frames++;}}catch(e){r.renderError=String(e.stack||e);}},25);
   for(var i=0;i<8;i++)for(var name of ['core','launcher']){
    await s.stage(image(name,String(i+2),'({api:1,v:'+String(i+2)+'})'));
    var selected=await s.choose(name,false),observer=CivSystemUpdates.platform({},{system:s,native:{io:io}});
    var results=await Promise.allSettled([s.confirm(name,selected),observer.snapshot()]);
    r.events.push({round:i,name:name,results:results.map(function(v){return {status:v.status,error:v.reason&&String(v.reason.stack||v.reason)};})});
   }
   r.frames=frames;
  }catch(e){r.error=String(e.stack||e);}
  finally{
   if(pulse!==null)clearInterval(pulse);
   if(n){
    for(var p of Array.from(new Set(made)))try{await n.files.remove(p);}catch(e){r.cleanup.push(p+': '+e.message);}
    for(var p of [root+'/system/core',root+'/system/launcher',root+'/system',root])try{await n.files.rmdir(p);}catch(e){if(!/0x202$/.test(e.message))r.cleanup.push(p+': '+e.message);}
    try{await n.files.commit();}catch(e){r.cleanup.push(e.message);}
   }
   r.finished=Date.now();
  }
 },300);
})(window);
