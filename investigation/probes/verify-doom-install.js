(async function(){
 var expected={"entry":{"id":"doom-civhomebrew","name":"Doom","bytes":26024251,"checksum":"2fb976b9"},"components":{"core":{"release":"0.4.3","checksum":"7e64a58d"},"launcher":{"release":"0.4.3","checksum":"ed8d0465"}}},C=window.PayloadCore,boot=window.__civhomebrewBoot,result={};
 if(!boot||!window.__civhomebrewCore)throw Error('Missing running boot/core.');
 for(var name of ['core','launcher']){
  var state=await boot.system.status(name);
  if(state.active===null||state.pending!==null||state.attempted)throw Error('Component is not confirmed: '+name);
  var meta=C.open(await boot.native.io.read(C.path('system/'+name+'/slot-'+state.active+'.json'),65536,false));
  if(meta.release!==expected.components[name].release||meta.checksum!==expected.components[name].checksum||state.hashes[state.active]!==meta.checksum)throw Error('Component identity mismatch: '+name);
  result[name]=meta.release;
 }
 var catalogs=[];for(var slot=0;slot<2;slot++){var text=await boot.native.io.read(C.path('catalog-'+slot+'.json'),65536,false);if(text!==null)catalogs.push(C.catalog(C.open(text)));}
 catalogs.sort(function(a,b){return b.generation-a.generation;});
 var entry=catalogs[0].entries.find(function(e){return e.id===expected.entry.id;});
 if(!entry||entry.bytes!==expected.entry.bytes||entry.checksum!==expected.entry.checksum)throw Error('Doom catalog identity mismatch.');
 var manifestText=await boot.native.io.read(C.appPath(entry.id,'manifest.json'),65536,false);
 if(C.hash(manifestText)!==entry.checksum)throw Error('Doom manifest checksum mismatch.');
 var manifest=C.installedManifest(JSON.parse(manifestText));
 if(manifest.metadata.release!=='0.2.2'||manifest.scripts.length!==44||!manifest.icon||manifest.icon.bytes!==36111)throw Error('Doom manifest content mismatch.');
 result.doom=manifest.metadata.release;result.bytes=entry.bytes;result.scripts=manifest.scripts.length;result.icon=true;result.confirmed=true;
 await log('CIV_INSTALL_VERIFIED '+JSON.stringify(result));
})();