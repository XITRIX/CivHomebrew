/* RAM-only component filesystem. The normal bootstrap/core/Launcher execute
 * unchanged, and actual native graphics/input/networking are used. */
(async function(){
 var g=window,t={version:1,ready:false,finished:false,error:null,failures:[],events:[],reads:0,writes:0},nativeLog=g.log;
 if(g.__civhomebrewCore||g.__civNanoVGVulkan)throw Error('Shutdown the recovery Terminal first; a fresh graphics process is required');
 g.__civStartupTrial=t;
 var memory=g.__startupTrialFileState||new Map(),fileSources=!!g.__startupTrialFileState,nativeState=!!g.__startupTrialNativeState,scratch='save:/civhomebrew/startup-cold-test',scratchFiles=new Set(),decorated=[],cleanupNative=null,nativeDescriptor=Object.getOwnPropertyDescriptor(g,'PayloadNative'),entryDescriptor=Object.getOwnPropertyDescriptor(g,'CivResidentEntry'),nativeValue=g.PayloadNative,entryValue=g.CivResidentEntry;
 delete g.__startupTrialFileState;
 delete g.__startupTrialNativeState;
 function systemPath(p){return p==='save:/civhomebrew/system'||p.indexOf('save:/civhomebrew/system/')===0;}
 function adapter(n){
  var io=Object.create(n.io),files=Object.create(n.files);
  t.realNative=n;cleanupNative=n;
  function mapped(p){return scratch+p.slice('save:/civhomebrew'.length);}
  io.read=async function(p,limit,binary){if(systemPath(p)){t.reads++;if(memory.has(p))return memory.get(p);if(nativeState&&!p.endsWith('.js'))return n.files.read(mapped(p),limit,binary);if(!fileSources||!p.endsWith('.js'))return null;}return n.io.read.apply(n.io,arguments);};
  io.write=async function(p,v){if(!systemPath(p))throw Error('RAM trial refuses persistent writes: '+p);t.writes++;if(nativeState&&!p.endsWith('.js')){var target=mapped(p);scratchFiles.add(target);return n.files.write(target,v);}memory.set(p,v);};
  io.ensureDirectory=async function(p){if(p==='save:/civhomebrew'||systemPath(p)){if(nativeState)try{await n.files.mkdir(mapped(p));}catch(e){if(!/0x402$/.test(e.message)||(await n.files.stat(mapped(p))).type!=='dir')throw e;}return;}throw Error('RAM trial refuses directory creation');};
  io.remove=async function(p){if(systemPath(p)){memory.delete(p);return;}if(p==='save:/civhomebrew/inbox/index.json')return;throw Error('RAM trial refuses persistent removal: '+p);};
  io.removeDirectory=async function(){throw Error('RAM trial refuses directory removal');};
  io.commit=nativeState?n.files.commit:async function(){};
  files.read=async function(p){if(systemPath(p))return io.read.apply(io,arguments);return n.files.read.apply(n.files,arguments);};
  ['write','remove','rmdir','mkdir','rename','commit'].forEach(function(k){files[k]=async function(){throw Error('RAM trial filesystem is read-only outside component memory');};});
  return Object.assign({},n,{io:io,files:files});
 }
 function decorate(n){if(!n||n.__startupTrial)return n;var create=n.create;decorated.push({object:n,create:create});n.create=function(){return adapter(create.apply(n,arguments));};n.__startupTrial=true;return n;}
 Object.defineProperty(g,'PayloadNative',{configurable:true,get:function(){return nativeValue;},set:function(n){nativeValue=decorate(n);}});nativeValue=decorate(nativeValue);
 async function failure(e){
  var message=String(e.stack||e).slice(0,5000);t.failures.push(message);
  if(t.core)t.diagnostics=t.core.diagnostics.slice(-24);
  for(var i=0;i<message.length;i+=300)await nativeLog('RAM_STARTUP_ERROR '+JSON.stringify(message.slice(i,i+300)));
 }
 Object.defineProperty(g,'CivResidentEntry',{configurable:true,get:function(){return entryValue;},set:function(v){
  var start=v.start;v.start=async function(boot){
   var originalReady=boot.ready;boot.ready=async function(){await originalReady();t.ready=true;t.readyAt=Date.now();await nativeLog('RAM_STARTUP_READY');};
   try{var running=start(boot);t.core=g.__civhomebrewCore;return await running;}
   catch(e){await failure(e);throw e;}
  };entryValue=v;
 }});
 try{
  /* STARTUP_TRIAL_BOOT */
 }catch(e){t.error=String(e.stack||e).slice(0,5000);await failure(e);}
 finally{
  t.finished=true;
  delete g.__startupTrialFileBoot;
  if(nativeState&&cleanupNative){
   t.cleanup=[];for(var p of Array.from(scratchFiles))try{await cleanupNative.files.remove(p);}catch(e){t.cleanup.push(e.message);}
   for(var p of [scratch+'/system/core',scratch+'/system/launcher',scratch+'/system',scratch])try{await cleanupNative.files.rmdir(p);}catch(e){if(!/0x202$/.test(e.message))t.cleanup.push(e.message);}
   await cleanupNative.files.commit();
  }
  decorated.forEach(function(entry){entry.object.create=entry.create;delete entry.object.__startupTrial;});
  if(nativeDescriptor)Object.defineProperty(g,'PayloadNative',nativeDescriptor);else{delete g.PayloadNative;g.PayloadNative=nativeValue;}
  if(entryDescriptor)Object.defineProperty(g,'CivResidentEntry',entryDescriptor);else{delete g.CivResidentEntry;g.CivResidentEntry=entryValue;}
  await nativeLog('RAM_STARTUP_TRIAL_COMPLETE '+JSON.stringify({ready:t.ready,failed:!!t.error,componentWritesInRam:t.writes}));
 }
})();
