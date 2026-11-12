/* Finite RAM-only console benchmark. Runs as a foreground run-source app.
 * Uses real launcher code/catalog, read-only app metadata and neutral FTP
 * settings. Never installs components, opens a child, or changes boot/saves. */
(async function(){
 'use strict';
 var g=window,boot=g.__civhomebrewBoot,core=g.__civhomebrewCore;
 if(!boot||!core||!g.PayloadNative||!g.PayloadNative.available)throw Error('NanoVG benchmark requires the resident native runtime');
 if(g.__civNanoVGVulkan||g.__moonlightExperimentalGraphics)throw Error('Restart Civ VII before the first NanoVG console trial');
 var start=Date.now(),app=null,ui=null,record={version:1,rendererRevision:5,started:start,configuration:{hardware:'Switch 2',handheld:true,boost:false,userConfirmed:true},stages:[],results:[],error:null,complete:false};
 g.__civNanoVGBenchmark=record;
 function now(){return g.performance&&g.performance.now?g.performance.now():Date.now();}
 function delay(ms){return new Promise(function(r){setTimeout(r,ms);});}
 function note(stage,data){record.stages.push({stage:stage,elapsedMs:Date.now()-start,data:data||null});if(record.stages.length>64)record.stages.shift();}
 function stats(values){if(!values.length)return null;var a=values.slice().sort(function(x,y){return x-y;}),sum=a.reduce(function(s,x){return s+x;},0);return {n:a.length,meanMs:sum/a.length,p50Ms:a[Math.floor((a.length-1)*.5)],p95Ms:a[Math.floor((a.length-1)*.95)],maxMs:a[a.length-1]};}
 function bounds(){var result={};for(var id of ['civhomebrew','payload-stage','payload-viewport','menu-ip','menu-counter','options-title','options-description']){var n=document.getElementById(id);if(!n)continue;var r=n.getBoundingClientRect(),s=getComputedStyle(n);result[id]={rect:[r.left,r.top,r.right,r.bottom],font:s.fontFamily,fontSize:s.fontSize,text:String(n.textContent||'').slice(0,100)};}return result;}
 function press(name){var event=document.createEvent('CustomEvent');event.initCustomEvent('engine-input',true,true,{name:name,status:0});g.dispatchEvent(event);}
 async function frameIntervals(){
  var samples=[],previous=null,until=Date.now()+3500;
  await new Promise(function(resolve){var done=false,timer=setTimeout(function(){done=true;resolve();},3600);function frame(t){if(done)return;var n=now();if(previous!==null)samples.push(n-previous);previous=n;if(samples.length>=90||Date.now()>=until){done=true;clearTimeout(timer);resolve();return;}requestAnimationFrame(frame);}requestAnimationFrame(frame);});
  return stats(samples);
 }
 async function navigation(label,native){
  var samples=[],parts=[];
  for(var i=0;i<12;i++){
   await delay(130);var begin=now();press(i%2?'nav-left':'nav-right');
   // Measure synchronous event/layout work separately from the scheduled frame.
   var root=document.getElementById('payload-stage');root.getBoundingClientRect();var eventLayoutMs=now()-begin;
   if(native){var update=now();if(!ui.update())throw Error('Navigation did not redraw');requireSelection();samples.push(now()-begin);parts.push({eventLayoutMs:eventLayoutMs,updateMs:now()-update,sceneHit:ui.stats.sceneHit,preparedHit:ui.geometry.stats.preparedHit,snapshotMs:ui.stats.snapshotMs,geometryMs:ui.stats.geometryMs,renderMs:ui.stats.renderMs,geometryHits:ui.geometry.stats.geometryHits,geometryMisses:ui.geometry.stats.geometryMisses,native:ui.renderer.owner.lastTiming});}
   else samples.push(eventLayoutMs);
  }
  record.results.push({kind:label,total:stats(samples),samples:parts});
 }
 async function cached(label,count){
  var times=[],begin=now();for(var i=0;i<count;i++){times.push(ui.renderer.presentCached());if(i%15===14)await delay(0);}var elapsed=now()-begin;
  var value={kind:label,frames:count,elapsedMs:elapsed,measuredFps:count*1000/elapsed,frame:stats(times)};record.results.push(value);return value;
 }
 async function redraw(label,count){
  var times=[],parts=[],start=now();for(var i=0;i<count;i++){var begin=now();ui.renderer.render(ui.packet);times.push(now()-begin);parts.push(ui.renderer.owner.lastTiming);if(i%4===3)await delay(0);}record.results.push({kind:label,frames:count,elapsedMs:now()-start,measuredFps:count*1000/(now()-start),total:stats(times),samples:parts});
 }
 function requireSelection(){var text=document.getElementById('menu-counter').textContent,index=parseInt(text,10)-1;if(entries[index]&&ui.scene.selectionId!==entries[index].id)throw Error('Rendered scene does not match the selected app');}
 async function selectionSweep(){
  record.native.selectionChecks=[];var count=Math.min(entries.length,4);
  async function check(index){
   var begin=now();for(var attempt=0;attempt<30;attempt++){ui.update();if(ui.scene&&ui.scene.selectionId===entries[index].id)break;await delay(20);}
   var updateMs=now()-begin;requireSelection();await delay(150);ui.update();
   var selected=document.querySelector('[role="option"][data-selected="true"]'),r=selected.getBoundingClientRect(),sx=1920/innerWidth,sy=1080/innerHeight;
   var border=ui.scene.commands.find(function(c){return c.kind==='border'&&c.color[0]<.01&&c.color[1]>.9&&c.color[2]>.7;});
   if(!border||Math.abs(border.rect[0]-r.left*sx)>1||Math.abs(border.rect[1]-r.top*sy)>1)throw Error('NanoVG border geometry does not match the selected tile');
   var name=ui.scene.commands.find(function(c){return c.kind==='text'&&(c.text===entries[index].name||c.text.endsWith('…')&&entries[index].name.indexOf(c.text.slice(0,-1))===0);});if(!name)throw Error('Selected app name bubble is missing');
   var x=Math.floor((r.left+1)*sx),y=Math.floor((r.top+r.bottom)/2*sy),points=[[x,y]],previous=record.native.selectionChecks[record.native.selectionChecks.length-1];
   if(previous&&previous.index!==index)points.push(previous.point);
   var pixels=ui.renderer.sample(points),pixel=pixels[0];if(Math.abs(pixel[0])>2||Math.abs(pixel[1]-239)>2||Math.abs(pixel[2]-207)>2||pixel[3]!==255)throw Error('Selected tile GPU border pixel is not teal');
   if(pixels[1]&&Math.abs(pixels[1][0])<=2&&Math.abs(pixels[1][1]-239)<=2&&Math.abs(pixels[1][2]-207)<=2)throw Error('Previous tile GPU border remains teal');
   record.native.selectionChecks.push({index:index,id:entries[index].id,name:name.text,rect:border.rect,point:points[0],pixels:pixels,coldUpdateMs:updateMs,layoutDeferred:ui.stats.layoutDeferred||0});
   note('selection-visible',entries[index].name);await delay(900);
  }
  await check(0);for(var i=1;i<count;i++){press('nav-right');await check(i);}for(var i=count-2;i>=0;i--){press('nav-left');await check(i);}
 }
 async function navigationBurst(count){
  var times=[],parts=[],start=now();
  for(var i=0;i<count;i++){var begin=now();press(i%2?'nav-left':'nav-right');if(!ui.update())throw Error('Warm navigation did not redraw');requireSelection();times.push(now()-begin);parts.push({sceneHit:ui.stats.sceneHit,preparedHit:ui.geometry.stats.preparedHit,snapshotMs:ui.stats.snapshotMs,geometryMs:ui.stats.geometryMs,renderMs:ui.stats.renderMs,native:ui.renderer.owner.lastTiming});if(i%15===14)await delay(0);}
  var elapsed=now()-start;record.results.push({kind:'navigation-burst-1080p120',frames:count,elapsedMs:elapsed,measuredFps:count*1000/elapsed,total:stats(times),samples:parts});
 }
 try{
  note('gameface-mounting');
  var reply=await core.dispatch({protocol:1,op:'list'}),entries=reply.response.entries;
  function deny(){throw Error('This console benchmark is read-only');}
  var api={list:function(){return entries.slice();},icon:async function(id){g.PayloadCore.id(id);var raw=await boot.native.io.read(g.PayloadCore.appPath(id,'icon.png'),512*1024,true);return raw?'data:image/png;base64,'+g.PayloadCore.base64(raw):'';},
   config:{bootIntegrated:true},selection:null,error:'',log:function(text){note('launcher-log',String(text).slice(0,140));},ip:boot.native.ip,
   ftpSettings:{enabled:false,port:5000,anonymous:true,username:'',password:'',protect:true},saveFtpSettings:deny,submit:deny,launch:deny,terminal:function(){note('exit-requested');},
   files:{read:function(path){if(path.indexOf('/Root/civhomebrew/apps/')!==0||!path.endsWith('/manifest.json'))throw Error('Read-only benchmark path rejected');return boot.native.files.read('save:/'+path.slice(6),65536,true);}}};
  app=await g.CivHomebrewLauncher.mount(api);g.__civswitchApp=app;
  await delay(600);record.gameface={viewport:[innerWidth,innerHeight],bounds:bounds(),range:typeof document.createRange,mutationObserver:typeof MutationObserver,fontLoading:!!(document.fonts&&document.fonts.load)};
  note('gameface-visible');record.gameface.raf=await frameIntervals();await navigation('gameface-event-and-layout',false);
  app.openOptions();await delay(400);record.gameface.options=bounds();await delay(3500);press('cancel');await delay(300);
  note('nanovg-initializing');g.CivNanoVGPrototype.enabled=true;g.CivNanoVGPrototype.defer=false;
  var init=now();ui=await g.CivNanoVGPrototype.attach(document.getElementById('civhomebrew'),{report:function(e){note(e.stage);},log:function(s){note('renderer-log',s);}});
  // attach() defaults to the native backend; the compiled factory is unchanged.
  record.native={initializationMs:now()-init,viewport:[innerWidth,innerHeight],display:ui.renderer.owner.display.size,initial:JSON.parse(JSON.stringify(ui.stats)),bounds:bounds()};
  note('nanovg-visible');await delay(1000);await selectionSweep();await cached('cached-1080p60',120);await redraw('redraw-1080p60',12);await navigation('navigation-1080p60',true);
  note('raising-120hz');record.refreshRaise=await ui.renderer.setRefresh(120);record.refreshStatus=await ui.renderer.refreshStatus();
  if(!record.refreshRaise||record.refreshRaise.ok!==true)throw Error('The checked 120 Hz refresh controller did not confirm availability');
  record.refreshConfirmation=[];var confirmed120=false;
  for(var attempt=0;attempt<4;attempt++){
   var batch=await cached('cached-requested120-confirmation-'+attempt,30),state=await ui.renderer.confirmRefresh(batch);
   record.refreshConfirmation.push({state:state,measuredFps:batch.measuredFps});
   if(state==='raised'&&batch.measuredFps>=108){confirmed120=true;break;}
   if(state==='failed')break;await delay(0);
  }
  if(!confirmed120)throw Error('Requested 120 Hz did not reach a confirmed >=108 FPS presentation batch');
  record.refreshStatusConfirmed=await ui.renderer.refreshStatus();
  await cached('cached-1080p120',240);await redraw('redraw-1080p120',120);await navigation('navigation-1080p120',true);await navigationBurst(120);
  app.openOptions();await delay(300);ui.update();note('nanovg-options-visible');record.native.options=bounds();
  await delay(15000);
  record.native.lastStats=JSON.parse(JSON.stringify(ui.stats));record.native.geometry=JSON.parse(JSON.stringify(ui.geometry.stats));record.native.counters={presentations:ui.renderer.owner.presentations,recomputations:ui.renderer.owner.recomputations,uploadedBytes:ui.renderer.owner.uploadedBytes};
  note('restoring-refresh');record.refreshRestore=await ui.renderer.setRefresh(60);record.refreshAfter=await ui.renderer.refreshStatus();record.refreshEvents=ui.renderer.owner.refreshEvents;
  record.complete=true;note('complete');
 }catch(error){record.error=String(error&&error.stack||error).slice(0,1200);note('failed',record.error);}
 finally{
  if(ui)try{await ui.close();}catch(e){record.cleanupError=String(e.message);}
  if(app)try{await app.close();}catch(e){record.appCleanupError=String(e.message);}
  if(g.__civswitchApp===app)delete g.__civswitchApp;
  g.CivNanoVGPrototype.defer=false;g.CivNanoVGPrototype.enabled=false;record.elapsedMs=Date.now()-start;
 }
 if(!record.complete)throw Error('NanoVG console benchmark failed: '+record.error);
})();
