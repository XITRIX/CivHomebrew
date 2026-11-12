const {readModule}=require('./library.cjs');
/* Persistent component staging and real resident remounts in Chrome. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {pathToFileURL}=require('node:url');const {open,sleep}=require('./chrome.cjs');const root=path.resolve(__dirname,'../..');
(async()=>{const chrome=await open(),{call,evaluate,until}=chrome;try{
 await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1.5,mobile:false});await call('Page.navigate',{url:pathToFileURL(path.join(root,'app/index.html')).href+'?demo=1'});
 await until('!!window.__civhomebrewCore&&__civhomebrewCore.getState().mode==="launcher"');
 await evaluate(readModule('web'));
 const image=JSON.parse(fs.readFileSync(path.join(root,'dist/launcher-nanovg-main.civupdate')));await evaluate('(async()=>{var r=await __civhomebrewCore.dispatch({protocol:1,op:"update",package:'+JSON.stringify(image)+'});if(r.after)r.after();})()');
 await until('!!window.__civNanoVGMainLauncher&&__civhomebrewCore.getState().mode==="launcher"&&!__civhomebrewCore.getState().busy&&CivNanoVGSession.current?.active?.ui.stats.frames>0');
 const state=await evaluate('__civhomebrewBoot.system.status("launcher")');assert.equal(state.pending,null);assert.notEqual(state.previous,null);const identity=await evaluate('__civNanoVGMainLauncher.identity');
 await evaluate('window.__mainSessions=CivNanoVGSession;window.__mainCompiled=CivNanoVGFactory');
 await evaluate('window.__launcherSourceReads=0;window.__startupRead=PayloadPreview.io.read;PayloadPreview.io.read=async function(p,...args){if(/system\\/launcher\\/slot-[01]\\.js$/.test(p))__launcherSourceReads++;return __startupRead(p,...args);};');
 for(let i=0;i<3;i++){
  await evaluate('__civhomebrewCore.showTerminal()');await until('__civhomebrewCore.getState().mode==="terminal"&&!__civhomebrewCore.getState().busy&&CivNanoVGSession.current.active?.root.id==="civhomebrew-core"&&CivNanoVGSession.current.active.ui.stats.frames>0');
  await evaluate('__civhomebrewCore.showLauncher()');await until('__civhomebrewCore.getState().mode==="launcher"&&!__civhomebrewCore.getState().busy&&CivNanoVGSession.current.active?.root.id==="civhomebrew"&&CivNanoVGSession.current.active.ui.stats.frames>0');
  assert.equal(await evaluate('CivNanoVGSession===__mainSessions&&CivNanoVGFactory===__mainCompiled'),true);assert.equal(await evaluate('document.querySelectorAll("#nanovg-output").length'),1);
 }
 assert.equal(await evaluate('__civNanoVGMainLauncher.identity'),identity);assert.equal(await evaluate('__civNanoVGMainLauncher.mounts'),4);assert.deepEqual(await evaluate('CivNanoVGSession.current.stats.errors'),[]);
 assert.equal(await evaluate('__launcherSourceReads'),0,'warm Terminal returns must not read the component source');
 // A pending metadata read must not block the first native frame. Closing waits
 // for the owned read and must not let its callback mutate the next mount.
 await evaluate('__civhomebrewCore.showTerminal()');await until('!__civhomebrewCore.getState().busy');
 await evaluate('window.__holdStartup=true;window.__releaseStartup=null;window.__startupFilesRead=__civhomebrewBoot.native.files.read;__civhomebrewBoot.native.files.read=async function(p,...args){if(__holdStartup&&p.includes("/update-status-"))await new Promise(r=>__releaseStartup=r);return __startupFilesRead(p,...args);};');
 await evaluate('__civhomebrewCore.showLauncher()');await until('__civhomebrewCore.getState().mode==="launcher"&&!__civhomebrewCore.getState().busy&&!!__releaseStartup&&CivNanoVGSession.current.active.ui.stats.frames>0');
 assert.equal(await evaluate('__launcherSourceReads'),0);
 await evaluate('__civhomebrewCore.showTerminal()');assert.equal(await evaluate('__civhomebrewCore.getState().busy'),true);
 await evaluate('__holdStartup=false;__releaseStartup()');await until('!__civhomebrewCore.getState().busy');
 await evaluate('__civhomebrewCore.showLauncher()');await evaluate('__civswitchApp.ready');
 // Native launch must present the overlay before closing its view. Simulate
 // delayed Gameface layout, then inspect the actual rendered scene at close.
 const loadingApp={format:'civswitch-app',version:1,id:'loading-check',name:'Loading Check',icon:'',metadata:{api:1,extensions:{nativeUi:{api:1},execution:{schema:1,scripts:'ordered'}}},scripts:[{name:'app.js',source:'new Promise(r=>globalThis.__finishLoadingCheck=r)'}]};
 await evaluate('__civhomebrewCore.dispatch({protocol:1,op:"install",package:'+JSON.stringify(loadingApp)+'})');
 for(const explicit of [false,true]){
  await evaluate('__civswitchApp.ready');
  await evaluate('window.__loadingAtClose=null;window.__loadingUpdates=0;var lease=CivNanoVGSession.current.active.lease,update=lease.update,close=lease.close;lease.update=function(...args){if(++__loadingUpdates<3)return false;return update(...args);};lease.close=async function(){__loadingAtClose={scene:lease.scene,frames:lease.stats.frames,updates:__loadingUpdates};return close();};');
  if(explicit){
   await sleep(350);await evaluate('document.querySelector("[data-id=loading-check]").dispatchEvent(new MouseEvent("click",{bubbles:true}))');
   await evaluate('window.dispatchEvent(new CustomEvent("engine-input",{detail:{name:"accept",status:0}}))');
  }else await evaluate('(async()=>{var r=await __civhomebrewCore.dispatch({protocol:1,op:"run",id:"loading-check"});if(r.after)r.after();})()');
  await until('typeof __finishLoadingCheck==="function"');
  const presented=await evaluate('__loadingAtClose');assert.ok(presented.updates>=3);assert.ok(presented.frames>0);
  assert.ok(presented.scene.commands.some(c=>c.kind==='text'&&c.text==='Loading Loading Check…'),'loading text was rendered before releasing the native view');
  assert.equal(await evaluate('CivNanoVGSession.current.active'),null,'no native view remains during ordered evaluation');
  await evaluate('__finishLoadingCheck();delete window.__finishLoadingCheck');await until('__civhomebrewCore.getState().mode==="launcher"&&!__civhomebrewCore.getState().busy');
 }
 // Same native implementation, new component release: exercise the normal
 // staging/acknowledgement and previous-slot path without replacing the GPU.
 const next={...image,release:image.release+'-test'};
 await evaluate('(async()=>{var r=await __civhomebrewCore.dispatch({protocol:1,op:"update",package:'+JSON.stringify(next)+'});if(r.after)r.after();})()');
 await until('__civhomebrewCore.getState().mode==="launcher"&&!__civhomebrewCore.getState().busy');
 assert.equal(await evaluate('(async()=> (await __civhomebrewBoot.system.choose("launcher",false)).release)()'),next.release);
 assert.equal((await evaluate('__civhomebrewBoot.system.status("launcher")')).pending,null);
 await evaluate('(async()=>{var r=await __civhomebrewCore.dispatch({protocol:1,op:"rollback",component:"launcher"});if(r.after)r.after();})()');await until('__civhomebrewCore.getState().mode==="launcher"&&!__civhomebrewCore.getState().busy');
 assert.equal(await evaluate('(async()=> (await __civhomebrewBoot.system.choose("launcher",false)).release)()'),image.release);
 assert.equal(await evaluate('CivNanoVGSession===__mainSessions&&CivNanoVGFactory===__mainCompiled'),true);
 await evaluate('CivNanoVGSession.current.close()');console.log('Native Launcher passed: cold activation, cached Terminal returns, first frame before held metadata, drained close, live update/rollback and retained owner.');
}finally{await chrome.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
