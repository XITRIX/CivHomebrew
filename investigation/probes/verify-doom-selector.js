(async function(){
 var g=window,C=g.PayloadCore,boot=g.__civhomebrewBoot,store=C.createStore(boot.native.io),ready=null,seenAt=0,closeTask=null,started=Date.now(),index=0;
 await store.load();var reader=await store.scriptReader('doom-civhomebrew');
 if(reader.manifest.metadata.release!=='0.2.2'||!C.orderedScripts(reader.manifest.metadata))throw Error('Wrong Doom startup candidate.');
 var watch=setInterval(function(){
  var app=g.__civswitchApp;
  if(app&&app.id==='doom-civhomebrew'){
   if(!seenAt){seenAt=Date.now();ready={state:app.getState(),labels:Array.prototype.map.call(document.querySelectorAll('#doom-civhomebrew button'),function(b){return b.textContent;}),diagnostics:app.diagnostics.slice(-3)};}
   if(!closeTask&&Date.now()-seenAt>600)closeTask=app.close();
  }
 },40);
 try{
  await boot.evaluateScripts(async function(){
   if(Date.now()-started>90000)throw Error('Doom selector test deadline.');
   var piece=await reader.next();if(!piece)return null;
   index++;await log('DOOM_SOURCE_READY '+index+'/44 '+piece.name);return piece.source;
  });
 }finally{clearInterval(watch);if(closeTask)await closeTask;var child=g.__civswitchApp;if(child&&child.id==='doom-civhomebrew')await child.close();}
 if(!ready||ready.labels.slice(0,3).join(',')!=='doom.wad,doom1.wad,doom2.wad')throw Error('Doom selector was not verified.');
 if(g.__civswitchApp&&g.__civswitchApp.id==='doom-civhomebrew'||g.DoomBundledData)throw Error('Doom selector cleanup incomplete.');
 await log('DOOM_SELECTOR_VERIFIED '+JSON.stringify(ready));
})();