const {readModule}=require('./library.cjs');
/* Hello works without the native runtime and borrows a shared native renderer.
 * CIV_HELLO_MAIN_PACKAGE can pin a frozen device package for parity testing. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {pathToFileURL}=require('node:url');const {open,sleep}=require('./chrome.cjs');const root=path.resolve(__dirname,'../..');
(async()=>{const c=await open(),{call,evaluate,until}=c;try{
 const action=async name=>{await evaluate('window.dispatchEvent(new CustomEvent("engine-input",{detail:{name:'+JSON.stringify(name)+',status:0}}))');await sleep(180);};
 await call('Page.navigate',{url:pathToFileURL(path.join(root,'examples/hello/index.html')).href});await until('window.__civswitchApp?.id==="hello-civswitch"');assert.equal(await evaluate('__civswitchApp.renderer'),'gameface');await action('accept');assert.match(await evaluate('document.getElementById("hello-civswitch-status").textContent'),/Action ran 1 time/);await action('cancel');await until('!window.__civswitchApp');assert.equal(await evaluate('!!document.getElementById("hello-civswitch")'),false);
 await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1.5,mobile:false});await call('Page.navigate',{url:pathToFileURL(path.join(root,'app/index.html')).href+'?demo=1'});await until('!!window.__civhomebrewCore&&__civhomebrewCore.getState().mode==="launcher"');
 await evaluate(readModule('web'));
 if(!process.env.CIV_HELLO_MAIN_PACKAGE)require('node:child_process').execFileSync('python3',['tools/nanovg/package-main.py'],{cwd:root});
 require('node:child_process').execFileSync('python3',['tools/package_payload.py','--directory','examples/hello','--non-interactive','--no-save-metadata','-o','dist/hello.civapp'],{cwd:root});
 const main=JSON.parse(fs.readFileSync(path.resolve(root,process.env.CIV_HELLO_MAIN_PACKAGE||'dist/launcher-nanovg-main.civupdate'))),hello=JSON.parse(fs.readFileSync(path.join(root,'dist/hello.civapp')));
 // Exercise compatible manifest provenance with the real bundled runtime guard.
 if(!process.env.CIV_HELLO_MAIN_PACKAGE)hello.metadata.extensions.nativeUi={api:1,library:'civapps-native-ui',version:'1.2.0',minVersion:'1.2.0',capabilities:['native-ui','framebuffer']};
 await evaluate('__civhomebrewCore.dispatch({protocol:1,op:"install",package:'+JSON.stringify(hello)+'})');
 const legacy={format:'civswitch-app',version:1,id:'legacy-ui-check',name:'Legacy UI check',metadata:{api:1},icon:'',scripts:[{name:'app.js',source:'window.__legacyHelloTestExecuted=true;'}]};
 await evaluate('__civhomebrewCore.dispatch({protocol:1,op:"install",package:'+JSON.stringify(legacy)+'})');
 await evaluate('(async()=>{var r=await __civhomebrewCore.dispatch({protocol:1,op:"update",package:'+JSON.stringify(main)+'});if(r.after)r.after();})()');await until('!!window.CivNanoVGSession?.current?.active?.ui.stats.frames&&__civhomebrewCore.getState().mode==="launcher"&&!__civhomebrewCore.getState().busy');
 // Current development core explicitly versions the native interface. The
 // installed runtime already provides the same attach/lease API without a tag.
 await evaluate('window.__helloShared=CivNanoVGSession.current;if(!__helloShared.api)__helloShared.api=1;window.__helloCompiled=CivNanoVGFactory;');
 if(!process.env.CIV_HELLO_MAIN_PACKAGE){
  for(const requirement of [{minVersion:'1.99.0'},{capabilities:['future-ui']},{version:'2.0.0'},{api:2}]){
   const p={format:'civswitch-app',version:1,id:'requires-new-sdk',name:'Requires new SDK',metadata:{api:1,extensions:{nativeUi:{api:1,library:'civapps-native-ui',version:'1.3.2',...requirement}}},icon:'',scripts:[{name:'app.js',source:'window.__incompatibleAppExecuted=true;'}]};
   await evaluate('__civhomebrewCore.dispatch({protocol:1,op:"install",package:'+JSON.stringify(p)+'})');await sleep(350);
   await evaluate('document.querySelector("[data-id=requires-new-sdk]").dispatchEvent(new MouseEvent("click",{bubbles:true}))');await action('accept');
   await until('document.getElementById("menu-notice").textContent.includes("SDK")||document.getElementById("menu-notice").textContent.includes("needs an update")');
   assert.equal(await evaluate('!!window.__incompatibleAppExecuted'),false);assert.equal(await evaluate('__civswitchApp.getState().busy'),false);
   assert.equal(await evaluate('CivNanoVGSession.current===__helloShared&&CivNanoVGFactory===__helloCompiled'),true);assert.equal(await evaluate('__civhomebrewCore.getState().mode'),'launcher');
  }
 }
 for(let i=0;i<2;i++){
  await sleep(350);await evaluate('document.querySelector("[data-id=hello-civswitch]").dispatchEvent(new MouseEvent("click",{bubbles:true}))');assert.equal(await evaluate('__civswitchApp.selection()'),'hello-civswitch');
  await evaluate('window.__helloRange=document.createRange;document.createRange=undefined;CivNanoVGSession.current.active.ui.resetLayoutCache();');await sleep(120);
  assert.equal(await evaluate('CivNanoVGSession.current.active.ui.scene.commands.some(c=>c.kind==="text"&&c.text==="Hello CivHomebrew")'),true,'the selected app bubble preserves the complete Hello title without Range');
  await evaluate('document.createRange=__helloRange;delete window.__helloRange;');
  await action('accept');await until('window.__civswitchApp?.id==="hello-civswitch"&&CivNanoVGSession.current.active?.root.id==="hello-civswitch"&&CivNanoVGSession.current.active.ui.stats.frames>0');
  assert.equal(await evaluate('__civswitchApp.renderer'),'native-shared');await action('accept');await until('CivNanoVGSession.current.active.ui.scene.commands.some(c=>c.kind==="text"&&c.text.includes("Action ran 1 time"))');
  assert.deepEqual(await evaluate('Array.from(CivNanoVGSession.current.renderer.read().slice(0,4))'),[12,18,32,255]);assert.equal(await evaluate('CivNanoVGSession.current===__helloShared&&CivNanoVGFactory===__helloCompiled'),true);
  await action('cancel');await until('__civhomebrewCore.getState().mode==="launcher"&&!__civhomebrewCore.getState().busy&&CivNanoVGSession.current.active?.root.id==="civhomebrew"&&CivNanoVGSession.current.active.ui.stats.frames>0');assert.equal(await evaluate('document.querySelectorAll("#nanovg-output").length'),1);assert.equal(await evaluate('!!document.getElementById("hello-civswitch")'),false);
 }
 await sleep(350);await evaluate('document.querySelector("[data-id=legacy-ui-check]").dispatchEvent(new MouseEvent("click",{bubbles:true}))');await action('accept');await until('document.getElementById("menu-notice").textContent.includes("needs an update for the native Launcher")');
 assert.equal(await evaluate('!!window.__legacyHelloTestExecuted'),false);assert.equal(await evaluate('__civhomebrewCore.getState().mode'),'launcher');assert.equal(await evaluate('__civswitchApp.getState().busy'),false);assert.equal(await evaluate('document.getElementById("loading-overlay").style.display'),'none');
 assert.deepEqual(await evaluate('CivNanoVGSession.current.stats.errors'),[]);await evaluate('CivNanoVGSession.current.close()');console.log('Hello Gameface fallback, 2 launcher Start/A native app handoffs, action rendering, shared owner, close/return and legacy-app rejection passed.');
}finally{await c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
