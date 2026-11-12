/* Persistent launcher adapter. One shared native owner survives resident remounts.
 * The component source caches this adapter before any later dependency eval. */
(function(g){
 'use strict';
 function create(o){
  var base=o.factory,sessionApi=o.sessions,prototype=o.prototype,component={identity:o.identity,release:o.release,mounts:0,factory:null};
  component.factory={api:1,mount:async function(api){
   g.CivFtp=o.ftp;prototype.enabled=true;
   var shared=sessionApi.current||await sessionApi.pending;
   if(!shared)shared=await sessionApi.start({core:g.__civhomebrewCore,browser:!(g.PayloadNative&&g.PayloadNative.available)});
   if(o.follow)shared=o.follow(shared,g.__civhomebrewCore);
   if(shared.stats.errors.length)throw Error('Native UI session has an error; restart Civ VII');
   var instance=null;
   try{
    instance=await base.mount(api);
    var until=Date.now()+5000;
    while(Date.now()<until){
     var active=shared.active;
     if(active&&active.root.id==='civhomebrew'){
      active.ui.update();if(active.ui.stats.error)throw Error(active.ui.stats.error);
      if(active.ui.stats.frames>0){component.mounts++;return instance;}
     }
     await new Promise(function(r){setTimeout(r,25);});
    }
    throw Error('Native launcher did not draw its first frame');
   }catch(e){if(instance)await instance.close();throw e;}
  }};
  return component;
 }
 g.CivNanoVGMainComponent={create:create};
})(typeof window!=='undefined'?window:globalThis);
