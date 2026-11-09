/* Finite installed-script profile: validate every file, omit final UI lifetime. */
(async function(){
 var g=window,C=g.PayloadCore,boot=g.__civhomebrewBoot,clock=function(){return Date.now();},stats={readMs:0,hashMs:0,encodeMs:0,decodeMs:0,evalMs:0,bytes:0,files:0},original={},rows=[],pending=null,start=clock();
 ['hash','encode','decode'].forEach(function(name){original[name]=C[name];C[name]=function(s){var at=clock();try{return original[name](s);}finally{stats[name+'Ms']+=clock()-at;}};});
 var io=Object.create(boot.native.io);io.read=async function(path,limit,binary,progress){var at=clock();try{return await boot.native.io.read(path,limit,binary,progress);}finally{stats.readMs+=clock()-at;}};
 try{
  var store=C.createStore(io);await store.load();var reader=await store.scriptReader('doom-civhomebrew');
  await boot.evaluateScripts(async function(){
   if(pending){pending.evalMs=clock()-pending.evalAt;stats.evalMs+=pending.evalMs;delete pending.evalAt;pending=null;}
   var at=clock(),before={read:stats.readMs,hash:stats.hashMs},piece=await reader.next();if(!piece)return null;
   var row={name:piece.name,ms:clock()-at,readMs:stats.readMs-before.read,hashMs:stats.hashMs-before.hash};rows.push(row);stats.bytes+=C.encode(piece.source).length;stats.files++;
   if(piece.last)return null;pending=row;row.evalAt=clock();return piece.source;
  });
 }finally{Object.keys(original).forEach(function(name){C[name]=original[name];});if(g.DoomNative)g.DoomNative.releaseHeap();delete g.DoomBundledData;}
 var result={totalMs:clock()-start,stats:stats,slowest:rows.sort(function(a,b){return b.ms+(b.evalMs||0)-a.ms-(a.evalMs||0);}).slice(0,7)};
 await log('CIV_APP_LAUNCH_PROFILE '+JSON.stringify(result));await log('CIV_APP_LAUNCH_PROFILE_COMPLETE');
})();
