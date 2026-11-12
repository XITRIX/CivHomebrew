/* Runs only when explicitly included in the finite RAM trial. Uses the real
 * resident core's existing input routes, terminal DOM, log model and services. */
(async function(g){
 'use strict';
 var trial=g.__civNanoVGTerminalStart?await g.__civNanoVGTerminalStart:g.__civNanoVGTerminalTrial;
 if(!trial||!trial.active)throw Error('Native terminal trial is not active');
 function delay(ms){return new Promise(function(r){setTimeout(r,ms);});}
 function now(){return g.performance&&g.performance.now?g.performance.now():Date.now();}
 function press(name){var e=document.createEvent('CustomEvent');e.initCustomEvent('engine-input',true,true,{name:name,status:0});g.dispatchEvent(e);}
 async function wait(mode){
  var end=Date.now()+12000,rootId=mode==='terminal'?'civhomebrew-core':'civhomebrew';
  while(Date.now()<end){
   if(trial.session.stats.errors.length)throw Error(trial.session.stats.errors.join('; '));
   var state=g.__civhomebrewCore.getState(),active=trial.session.active;
   if(state.mode===mode&&!state.busy&&active&&active.root.id===rootId){active.ui.update();if(active.ui.stats.frames>0&&active.ui.scene&&active.ui.scene.commands.length)return active.ui;}
   await delay(25);
  }throw Error('Native '+mode+' did not become ready');
 }
 function nativeIdentity(){var owner=trial.session.renderer.owner;return owner?{device:String(owner.display.device),swapchain:String(owner.display.swapchain)}:{device:'web-oracle',swapchain:'web-oracle'};}
 function sample(ui,mode){
  var renderer=trial.session.renderer;if(!renderer.sample)return null;
  if(mode==='launcher'){
   var border=ui.scene.commands.find(function(c){return c.kind==='border'&&c.color[0]<.01&&c.color[1]>.9&&c.color[2]>.7;});if(!border)throw Error('Selected launcher border missing');
   var r=border.rect,p=renderer.sample([[Math.floor(r[0]+1),Math.floor((r[1]+r[3])/2)]])[0];if(p[0]>2||Math.abs(p[1]-239)>2||Math.abs(p[2]-207)>2)throw Error('Launcher border GPU pixel mismatch');return {border:p};
  }
  var text=ui.scene.commands.find(function(c){return c.kind==='text'&&c.id==='terminal-output'&&c.text.indexOf('NATIVE_TERMINAL_CYCLE_')===0;});if(!text)throw Error('New terminal marker missing from native scene');
  var points=[];for(var y=2;y<18;y+=2)for(var x=1;x<9;x+=1)points.push([Math.floor(text.x+x),Math.floor(text.baseline-y)]);
  var pixels=renderer.sample(points),ink=pixels.filter(function(p){return p[0]>100&&p[1]>100&&p[2]>100;}).length;if(!ink)throw Error('Terminal marker has no GPU text ink');return {textInkSamples:ink,samples:pixels.length};
 }
 trial.snapshot=function(){var owner=trial.session.renderer.owner;return {version:1,active:trial.active,complete:!!trial.complete,started:trial.started,elapsedMs:Date.now()-trial.started,error:trial.error,checks:trial.checks,session:trial.session.stats,native:owner?{state:owner.state,device:String(owner.display.device),swapchain:String(owner.display.swapchain),presentations:owner.presentations,recomputations:owner.recomputations,uploadedBytes:owner.uploadedBytes}:null};};
 trial.runChecks=async function(cycles){
  var identity=nativeIdentity();
  try{
   await wait('terminal');
   for(var i=0;i<cycles;i++){
    await delay(300);var start=now();press('cancel');var launcher=await wait('launcher'),launcherMs=now()-start;
    var state=g.__civhomebrewCore.getState();if(!state.services.rpc||!state.services.raw)throw Error('PC services lost during native launcher switch');
    var launcherPixel=sample(launcher,'launcher');await delay(1000);start=now();press('terminal');var terminal=await wait('terminal'),terminalMs=now()-start;
    state=g.__civhomebrewCore.getState();if(state.launcher||state.ftp)throw Error('Launcher/FTP did not unload for terminal');if(!state.services.rpc||!state.services.raw)throw Error('Terminal PC services lost');
    var marker='NATIVE_TERMINAL_CYCLE_'+i;await g.log(marker+' — existing resident logger');await delay(180);terminal.update();
    var output=document.getElementById('terminal-output').textContent,lines=output.split('\n');if(lines.length>37||lines.some(function(l){return l.length>146;}))throw Error('Existing terminal line/row bounds changed');if(output.indexOf(marker)<0)throw Error('Resident terminal did not receive marker');
    if(!terminal.scene.commands.some(function(c){return c.kind==='text'&&c.text.indexOf('(B) Launcher')>=0;}))throw Error('Terminal return action missing');
    if(JSON.stringify(nativeIdentity())!==JSON.stringify(identity))throw Error('Display owner changed between views');
    trial.checks.push({cycle:i,launcherMs:launcherMs,terminalMs:terminalMs,rows:lines.length,launcherPixel:launcherPixel,terminalPixel:sample(terminal,'terminal'),terminalGeometryHits:trial.session.geometry.stats.geometryHits,terminalGeometryMisses:trial.session.geometry.stats.geometryMisses,services:state.services,ftpStopped:!state.ftp,identity:identity});
    await delay(1000);
   }
   // Exercise actual model wrapping/retention and reuse of shifted lines.
   for(var i=0;i<40;i++)await g.log('NATIVE_TERMINAL_SCROLL_'+i+' '+(i===39?'X'.repeat(160):'cached line test'));
   await delay(200);var terminal=await wait('terminal');terminal.update();
   var lines=document.getElementById('terminal-output').textContent.split('\n');if(lines.length!==37||lines.some(function(l){return l.length>146;}))throw Error('Terminal rollover/wrapping failed');
   trial.checks.push({kind:'rollover',rows:lines.length,maxColumns:Math.max.apply(null,lines.map(function(l){return l.length;})),geometryHits:trial.session.geometry.stats.geometryHits,geometryMisses:trial.session.geometry.stats.geometryMisses});
   trial.complete=true;await g.log('Native terminal checks passed. Press B for native Launcher.');
  }catch(e){trial.error=String(e.stack||e).slice(0,1400);await g.log('Native terminal trial failed: '+String(e.message).slice(0,180));}
 };
 // The finite raw activation must return first; the existing resident lifetime
 // then owns the UI service and its ordinary input/service event loop.
 setTimeout(function(){trial.runChecks(6);},300);
})(typeof window!=='undefined'?window:globalThis);
