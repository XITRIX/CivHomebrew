/* Real bootstrap, installer/store and packaged Moonlight in Chrome's software
 * renderer. File/network adapters are mocked; this is not a console stream test.
 * npm run test:moonlight -- /absolute/path/to/moonlight.civapp
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {open,sleep}=require('./nanovg/chrome.cjs'),{readModule}=require('./nanovg/library.cjs');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
(async()=>{
 const raw=fs.readFileSync(process.argv[2]),pkg=JSON.parse(raw),release=JSON.parse(read('tests/fixtures/moonlight-release.json'));
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),release.sha256,'test the published Moonlight bytes');
 assert.equal(pkg.metadata.release,release.release);assert.equal(pkg.id,'moonlight-civswitch');
 const sdkVersion=JSON.parse(read('civapps-native-ui.lock.json')).version;
 assert.equal(pkg.metadata.extensions.nativeUi.library,'civapps-native-ui');
 const bootstrap=execFileSync('python3',['-B','-c',"import sys;sys.path.insert(0,'tools');import payload_menu as m;sys.stdout.buffer.write(m.bundle(boot_integrated=True))"],{cwd:root,maxBuffer:4*1024*1024}).toString('utf8');
 const config=JSON.parse(bootstrap.split('\n',1)[0].replace(/^window\.__payloadMenuConfig=/,'').replace(/;$/,''));
 const published=JSON.parse(read('dist/launcher.civupdate'));
 assert.equal(config.seeds.launcher.source,published.source,'README installer and release image must contain identical native code');
 const legacy=execFileSync('python3',['-B','-c',"import sys;sys.path.insert(0,'tools');import payload_menu as m;sys.stdout.buffer.write(m.component_bundle('launcher',native_launcher=False).encode('utf-8'))"],{cwd:root,maxBuffer:1024*1024}).toString('utf8');
 const fixture=path.join(root,'build/moonlight-compatibility.html');fs.mkdirSync(path.dirname(fixture),{recursive:true});
 fs.writeFileSync(fixture,'<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}*{box-sizing:border-box}</style></head><body></body></html>');
 const browser=await open(),{call,evaluate,until}=browser;
 try{
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1.5,mobile:false});
  for(const upgrade of [false,true]){
   await call('Page.navigate',{url:pathToFileURL(fixture).href+'?nativeUi=1'});
   await evaluate(read('app/src/core.js')+'\n;'+read('app/src/system.js')+'\n;'+read('app/preview.js')+'\n;'+read('app/install/service.js')+'\n;'+readModule('web'));
   await evaluate(`window.__seedImages=${JSON.stringify(config.seeds)};window.__legacyLauncher=${JSON.stringify(legacy)};window.__testPackage=${JSON.stringify(pkg)};true`);
   await evaluate(`(async()=>{
    var io=PayloadPreview.io,system=CivSystem.create(io);
    await io.write('save:/moonlight-experiment/readme-sentinel','pairing/settings sentinel');
    await io.write('save:/saves/Single/unrelated.Civ7Save','unrelated save');
    if(${upgrade}){
     for(var name of ['core','launcher']){
      var old={...__seedImages[name],release:'1.3.6'};
      if(name==='launcher'){old.source=__legacyLauncher;old.checksum=PayloadCore.hash(old.source);}
      await system.stage(old);await system.confirm(name,await system.choose(name,false));
     }
    }
    // Stage through the permanent installer's actual component endpoint.
    var installer=CivBootInstaller.create(PayloadPreview.files,system);
    for(var name of ['core','launcher'])await installer.dispatch({protocol:1,op:'component',package:__seedImages[name]});
    // Capture the real FTP virtual-filesystem endpoint when Launcher starts it.
    var ftp;
    Object.defineProperty(window,'CivFtp',{configurable:true,get(){return ftp;},set(value){
     ftp=value;if(value){var create=value.create;value.create=options=>{window.__ftpOptions=options;return create(options);};}
    }});
   })()`);
   await evaluate(`window.__bootError='';window.__bootLifetime=eval(${JSON.stringify(bootstrap)});__bootLifetime.catch(error=>__bootError=String(error.stack||error));true`);
   await until('!!__civhomebrewCore&&__civhomebrewCore.getState().mode==="launcher"&&!__civhomebrewCore.getState().busy&&CivAppsNativeUI.sessions.current?.active?.ui.stats.frames>0');
   await until('(async()=>{var system=__civhomebrewBoot.system;return (await system.status("core")).pending===null&&(await system.status("launcher")).pending===null;})()');
   const state=await evaluate(`(async()=>({sdk:CivAppsNativeUI.version,core:await __civhomebrewBoot.system.status('core'),launcher:await __civhomebrewBoot.system.status('launcher'),integrated:__civhomebrewCore.getState().services.bootIntegrated,error:__bootError}))()`);
   assert.equal(state.sdk,sdkVersion);assert.equal(state.core.pending,null);assert.equal(state.launcher.pending,null);assert.equal(state.integrated,true);assert.equal(state.error,'');
   await evaluate('PayloadCore.nativeUi(__testPackage.metadata);true');
   if(upgrade){assert.notEqual(state.core.previous,null);assert.notEqual(state.launcher.previous,null);}
   await evaluate('window.__sharedUi=CivAppsNativeUI.sessions.current;window.__compiledUi=CivNanoVGFactory;true');
   await until('!!window.__ftpOptions');
   // Start with older installed metadata, then update through the real X menu
   // using the exact published Moonlight bytes (transport/file I/O are mocked).
   await evaluate(`__ftpOptions.fs.write('/Install civapp/moonlight.civapp',PayloadCore.encode(JSON.stringify({...__testPackage,metadata:{...__testPackage.metadata,release:'0.1.3'}})))`);
   await evaluate(`window.__releaseBytes=${JSON.stringify(raw.toString('latin1'))};window.__originalFetch=window.fetch;window.fetch=async function(url){
    if(String(url).includes('api.github.com'))return new Response(JSON.stringify({tag_name:'v${pkg.metadata.release}',draft:false,prerelease:false,assets:[{name:'moonlight.civapp',state:'uploaded',size:__releaseBytes.length,browser_download_url:'https://github.com/XITRIX/Moonlight-CivSwitch/releases/download/v${pkg.metadata.release}/moonlight.civapp',digest:'sha256:${release.sha256}'}]}),{status:200});
    return new Response(Uint8Array.from(__releaseBytes,c=>c.charCodeAt(0)),{status:200});
   };window.__installWrite=null;window.__installRelease=null;window.__installFrame=null;window.__writeBeforeUpdate=PayloadPreview.io.write;
   PayloadPreview.io.write=async function(p,...args){if(p.includes('/apps/moonlight-civswitch/scripts/')&&!__installWrite){__installWrite=p;if(CivAppsNativeUI.sessions.current.active)throw Error('Native view active during installation');await new Promise(r=>__installRelease=r);}return __writeBeforeUpdate(p,...args);};
   var lease=CivAppsNativeUI.sessions.current.active.lease,close=lease.close;lease.close=async function(){__installFrame=lease.scene;return close();};true`);
   await evaluate('__civswitchApp.ready');await sleep(350);
   await evaluate(`document.querySelector('[data-id="moonlight-civswitch"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));__civswitchApp.openMenu();true`);
   await until('!!document.querySelector("[data-app-action=updates]")');
   await evaluate('document.querySelector("[data-app-action=updates]").click();true');
   await until('document.getElementById("app-dialog-title").textContent==="Update Moonlight?"');
   await evaluate('document.querySelectorAll("#app-dialog button")[1].click();true');
   await until('!!__installRelease');
   assert.equal(await evaluate('CivAppsNativeUI.sessions.current.active'),null);
   assert.equal(await evaluate('__installFrame.commands.some(c=>c.kind==="text"&&c.text==="Installing Moonlight…")'),true);
   await sleep(100);assert.equal(await evaluate('CivAppsNativeUI.sessions.current.active'),null,'view stays closed throughout file I/O');
   await evaluate('__installRelease();true');
   await until('!__civhomebrewCore.getState().busy&&CivAppsNativeUI.sessions.current.active?.root.id==="civhomebrew"&&CivAppsNativeUI.sessions.current.active.ui.stats.frames>0');
   await evaluate('PayloadPreview.io.write=__writeBeforeUpdate;window.fetch=__originalFetch;delete window.__releaseBytes;true');
   const installed=await evaluate(`(async()=>{
    var text=await PayloadPreview.io.read(PayloadCore.appPath(__testPackage.id,'manifest.json'));
    var manifest=JSON.parse(text);
    for(var script of manifest.scripts){var source=await PayloadPreview.io.read(PayloadCore.appPath(manifest.id,script.path));if(PayloadCore.hash(source)!==script.checksum||PayloadCore.encode(source).length!==script.bytes)throw Error('Installed script mismatch: '+script.name);}
    return {metadata:manifest.metadata,scripts:manifest.scripts.length};
   })()`);
   assert.deepEqual(installed.metadata,pkg.metadata);assert.equal(installed.scripts,pkg.scripts.length);
   for(let round=0;round<2;round++){
    await evaluate('__civswitchApp.ready');await sleep(350);
    await evaluate(`document.querySelector('[data-id="moonlight-civswitch"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));window.dispatchEvent(new CustomEvent('engine-input',{detail:{name:'accept',status:0}}));true`);
    await until('!!window.__moonlightSimpleUI&&CivAppsNativeUI.sessions.current.active?.root.id==="moonlight-simple-ui"&&CivAppsNativeUI.sessions.current.active.ui.stats.frames>0');
    assert.deepEqual(await evaluate(`({hosts:document.getElementById('moonlight-hosts-screen')?.style.display,blocked:!!document.getElementById('civ-sdk-update-launcher'),same:CivAppsNativeUI.sessions.current===__sharedUi&&CivNanoVGFactory===__compiledUi,factory:typeof __moonlightStreamFactory})`),{hosts:'flex',blocked:false,same:true,factory:'function'});
    await sleep(350);await evaluate(`window.dispatchEvent(new CustomEvent('engine-input',{detail:{name:'cancel',status:0}}));true`);
    await until('__civhomebrewCore.getState().mode==="launcher"&&!__civhomebrewCore.getState().busy&&CivAppsNativeUI.sessions.current.active?.root.id==="civhomebrew"&&CivAppsNativeUI.sessions.current.active.ui.stats.frames>0');
    assert.equal(await evaluate('CivAppsNativeUI.sessions.current===__sharedUi&&CivNanoVGFactory===__compiledUi'),true);
   }
   assert.deepEqual(await evaluate('CivAppsNativeUI.sessions.current.stats.errors'),[]);
   assert.equal(await evaluate(`PayloadPreview.io.read('save:/moonlight-experiment/readme-sentinel')`),'pairing/settings sentinel');
   assert.equal(await evaluate(`PayloadPreview.io.read('save:/saves/Single/unrelated.Civ7Save')`),'unrelated save');
   await evaluate('(async()=>{await __civhomebrewCore.close();await __bootLifetime;await __sharedUi.close();})()');
   console.log((upgrade?'Existing DOM installation upgrade':'Fresh installation')+': native bootstrap acknowledged, published Moonlight X-menu update verified with view paused through file I/O, 2 Start/A → Hosts → B → Launcher cycles, one retained renderer and preserved saves.');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
