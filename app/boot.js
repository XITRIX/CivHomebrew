/* Stable boot layer. Its pending direct-eval promise owns the whole session. */
(async function(){
 "use strict";
 if(window.__civhomebrewCore)throw Error("Close the active core before starting another boot layer.");
 var config=window.__payloadMenuConfig||{},native=window.PayloadNative.available?window.PayloadNative.create():window.PayloadPreview&&window.PayloadPreview.native;
 if(!native)throw Error("No CivSwitch storage adapter.");
 var system=window.CivSystem.create(native.io),recovery=!!config.terminal,selected=null,warnings=[],acknowledged=false;
 if(native.controllerButtons){var bootButtons;try{bootButtons=native.controllerButtons();var held=bootButtons.poll();if(held!==null&&(held&0x800n))recovery=true;}catch(e){warnings.push("Boot buttons: "+e.message);}finally{if(bootButtons)bootButtons.close();}}
 var seeds=config.seeds||window.PayloadPreview&&window.PayloadPreview.seeds;
 if(!seeds)throw Error("Boot components are missing.");
 for(var name of ["launcher","core"])try{await system.seed(seeds[name]);}catch(e){warnings.push(e.message);recovery=true;}
 var context={native:native,system:system,config:config,recovery:recovery,warnings:warnings,evaluate:window.PayloadLoaderScope.evaluate,
  ready:async function(){if(!window.__civhomebrewCore||!window.__civhomebrewCore.lifetime)throw Error("Core acknowledged readiness before initialization.");await system.confirm("core",selected);acknowledged=true;}};
 window.__civhomebrewBoot=context;
 try{
  try{selected=await system.choose("core",recovery);}catch(e){warnings.push(e.message);context.recovery=true;selected={source:seeds.core.source,release:seeds.core.release,trial:false};}
  context.release=selected.release;await context.evaluate(selected.source);if(!acknowledged)throw Error("Core returned before readiness.");
 }catch(e){
  if(selected&&selected.trial&&!window.__civhomebrewCore){var failed=await system.status("core");if(failed.pending===selected.slot)await system.reject("core");else if(failed.active===selected.slot&&failed.previous!==null)await system.rollback("core");selected=await system.choose("core",true);context.recovery=true;context.release=selected.release;await context.evaluate(selected.source);}
  else throw e;
 }finally{delete window.__civhomebrewBoot;}
})();
