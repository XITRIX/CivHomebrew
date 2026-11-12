const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await sleep(5);}throw Error('Condition timed out');}
async function fixture(){
 const c=vm.createContext({setTimeout,clearTimeout,trace:[],ftp:false});c.window=c;vm.runInContext(fs.readFileSync(__dirname+'/../app/vendor/civhomebrew-sdk.js','utf8'),c);for(const name of ['core','app-metadata','storage','system','ftp-settings','ftp-files','loader-scope','resident'])vm.runInContext(fs.readFileSync(__dirname+'/../app/src/'+name+'.js','utf8'),c);
 const files=new Map();const io={read:async p=>files.get(p)??null,write:async(p,s)=>files.set(p,s),commit:async()=>{},ensureDirectory:async()=>{},remove:async p=>files.delete(p),removeDirectory:async p=>{for(const k of files.keys())if(k.startsWith(p+'/'))files.delete(k);}};
 const system=c.CivSystem.create(io),source='({api:1,mount:async function(api){globalThis.launcherApi=api;trace.push("mount");ftp=true;return {id:"civhomebrew",close:async function(){ftp=false;trace.push("unmount")},stopServices:async function(){ftp=false;trace.push("ftp-stop")},ftpState:function(){return {running:ftp}},refresh:function(){trace.push("refresh")}}}})';
 await system.stage({format:'civswitch-system',version:1,api:1,component:'launcher',release:'1',source,checksum:c.PayloadCore.hash(source)});
 const evaluations=[];
 const manager=c.CivResident.create({io,files:{read:io.read,write:function(...args){return io.write(...args);},commit:io.commit},system,evaluate:async s=>{evaluations.push(s);return vm.runInContext(s,c);},evaluateScripts:c.PayloadLoaderScope.evaluateScripts,ip:()=>'',log:()=>{},view:mode=>c.trace.push(mode)});await manager.start();
 return {c,io,files,system,manager,evaluations};
}
const pkg=(id='sample')=>({format:'civswitch-app',version:1,id,name:id,metadata:{api:1,extensions:{nativeUi:{api:1}}},icon:'',scripts:[{name:'app.js',source:'(async function(){trace.push("app-start");await new Promise(r=>globalThis.finishApp=r);trace.push("app-stop");})();'}]});
test('ordered apps read and evaluate each verified initializer before loading the next and await their final UI',async()=>{
 const {c,io,manager}=await fixture(),p=pkg('ordered');p.metadata.extensions.execution={schema:1,scripts:'ordered'};
 p.scripts.unshift({name:'first.js',source:'var sharedOrdered=41;trace.push("first-init");'},{name:'second.js',source:'trace.push("second:"+(sharedOrdered+1));'});
 await manager.install(p);const original=io.read;io.read=async path=>{if(path.includes('/scripts/'))c.trace.push('read:'+path.split('/').at(-1));return original(path);};
 manager.launch(p.id);await until(()=>c.trace.includes('app-start'));
 assert(c.trace.indexOf('ftp-stop')<c.trace.indexOf('first-init'));
 assert(c.trace.indexOf('first-init')<c.trace.indexOf('read:second.js'));
 assert(c.trace.indexOf('second:42')<c.trace.indexOf('read:app.js'));
 assert(c.trace.indexOf('second:42')<c.trace.indexOf('unmount'));
 assert(c.trace.indexOf('unmount')<c.trace.indexOf('app-start'));
 assert.equal(manager.getState().mode,'app');assert.equal(c.sharedOrdered,undefined);
 c.finishApp();await manager.idle();assert.equal(manager.getState().mode,'launcher');await manager.shutdown();
});
test('ordered mode rejects corruption before evaluation and does not read later scripts',async()=>{
 const {c,io,files,manager}=await fixture(),p=pkg('ordered');p.metadata.extensions.execution={schema:1,scripts:'ordered'};
 p.scripts.unshift({name:'init.js',source:'trace.push("initializer");'});await manager.install(p);
 files.set(c.PayloadCore.appPath(p.id,'scripts/init.js'),'corrupt');const original=io.read,reads=[];io.read=async path=>{reads.push(path);return original(path);};
 manager.launch(p.id);await manager.idle();assert(!c.trace.includes('initializer'));assert(!c.trace.includes('app-start'));
 assert(!reads.some(path=>path.endsWith('/scripts/app.js')));assert.equal(manager.getState().mode,'launcher');await manager.shutdown();
});
test('launcher and FTP unload before app execution, core installer/catalog survive and launcher returns',async()=>{
 const {c,manager}=await fixture();await manager.install(pkg());manager.launch('sample');await until(()=>c.trace.includes('app-start'));
 assert.ok(c.trace.indexOf('ftp-stop')<c.trace.indexOf('app-start'));assert.ok(c.trace.indexOf('unmount')<c.trace.indexOf('app-start'));
 assert.equal(manager.getState().mode,'app');assert.equal(manager.getState().ftp,false);
 assert.equal((await manager.dispatch({protocol:1,op:'list'})).response.entries.length,1);
 await assert.rejects(manager.install(pkg('other')),/Foreground/);assert.throws(()=>manager.launch('sample'),/Foreground/);
 c.finishApp();await manager.idle();assert.equal(manager.getState().mode,'launcher');assert.equal(manager.getState().ftp,true);await manager.shutdown();
});
test('accepted installation completes before a queued launch',async()=>{
 const {c,io,manager}=await fixture();await manager.install(pkg());const oldWrite=io.write;let release,held=false;
 io.write=async(p,s)=>{if(p.includes('apps/new/scripts')){held=true;await new Promise(r=>release=r);}return oldWrite(p,s);};
 const install=manager.install(pkg('new'));await until(()=>held);manager.launch('sample');await sleep(20);assert.equal(c.trace.includes('app-start'),false);
 release();await install;await until(()=>c.trace.includes('app-start'));c.finishApp();await manager.idle();assert.equal(manager.store.list().length,2);await manager.shutdown();
});
test('terminal unloads frontend and installer remains usable without it',async()=>{
 const {manager}=await fixture();manager.showTerminal();await manager.idle();assert.equal(manager.getState().mode,'terminal');assert.equal(manager.getState().launcher,false);
 await manager.install(pkg());assert.equal(manager.store.list().length,1);await manager.showLauncher();assert.equal(manager.getState().ftp,true);await manager.shutdown();
});
test('acknowledged launcher factory survives Terminal and app returns without rereading source or reevaluating dependencies',async()=>{
 const {c,io,manager,evaluations}=await fixture(),reads=[],read=io.read;
 io.read=async path=>{reads.push(path);return read(path);};
 for(let i=0;i<2;i++){manager.showTerminal();await manager.idle();await manager.showLauncher();}
 assert.equal(evaluations.length,1);assert.equal(reads.filter(p=>p.includes('system/launcher/')&&p.endsWith('.js')).length,0);
 await manager.install(pkg());
 for(let i=0;i<2;i++){manager.launch('sample');await until(()=>c.finishApp);c.finishApp();await manager.idle();delete c.finishApp;}
 assert.equal(evaluations.length,3,'only the two app evaluations are added');
 assert.equal(reads.filter(p=>p.includes('system/launcher/')&&p.endsWith('.js')).length,0);
 assert.equal(manager.getState().ftp,true);await manager.shutdown();
});
test('updates and rollback replace the cached factory and restore launcher exports on later mounts',async()=>{
 const {c,manager,system,evaluations}=await fixture();
 const source='(function(){var ftp={version:2};globalThis.CivFtp=ftp;return globalThis.CivHomebrewLauncher={api:1,mount:async function(){if(globalThis.CivFtp!==ftp)throw Error("FTP export lost");trace.push("mount-2");return {close:async function(){},ftpState:function(){return {running:true}}};}};})()';
 const r=await manager.dispatch({protocol:1,op:'update',package:{format:'civswitch-system',version:1,api:1,component:'launcher',release:'2',source,checksum:c.PayloadCore.hash(source)}});await r.after();
 await until(()=>c.trace.includes('mount-2'));await until(()=>!manager.getState().busy);
 assert.equal((await system.status('launcher')).pending,null);const count=evaluations.length,ftp=c.CivFtp;
 manager.showTerminal();await manager.idle();assert.equal(c.CivFtp,undefined);await manager.showLauncher();assert.equal(c.CivFtp,ftp);assert.equal(evaluations.length,count);
 const rollback=await manager.dispatch({protocol:1,op:'rollback',component:'launcher'});await rollback.after();await until(()=>!manager.getState().busy);
 assert.equal((await system.status('launcher')).active,0);assert.equal(evaluations.length,count+1);assert.equal(manager.getState().mode,'launcher');await manager.shutdown();
});
test('FTP writes invalidate the factory even when they fail; raw payloads and state corruption cannot reuse it',async()=>{
 const {c,io,files,manager,evaluations}=await fixture();
 await c.launcherApi.saveFtpSettings({...c.launcherApi.ftpSettings,protect:false});
 const write=io.write;io.write=async()=>{throw Error('disk full');};
 await assert.rejects(c.launcherApi.files.write('/Root/civhomebrew/test.txt','bytes'),/disk full/);io.write=write;
 await manager.showLauncher();assert.equal(evaluations.length,2);
 await manager.executeRaw('42',()=>{});await manager.showLauncher();assert.equal(evaluations.length,4);
 files.set(c.PayloadCore.path('system/launcher/state-0.json'),'bad');files.set(c.PayloadCore.path('system/launcher/state-1.json'),'bad');
 await manager.showLauncher();assert.equal(manager.getState().mode,'terminal');assert.equal(evaluations.length,4);await manager.shutdown();
});
test('generic app-store callbacks share installer exclusion and finish across launcher unload',async()=>{
 const {c,manager,files}=await fixture();await manager.install(pkg());const api=c.launcherApi;let release,entered=false;
 const work=api.appStore(async store=>{entered=true;await new Promise(r=>release=r);await store.publish([]);await store.files.removeDirectory('sample');await store.files.commit();});
 await until(()=>entered);assert.equal(manager.getState().busy,true);await assert.rejects(manager.install(pkg('other')),/busy/);await assert.rejects(api.appStore(()=>{}),/busy/);
 manager.showTerminal();await until(()=>manager.getState().mode==='terminal');assert.equal(manager.getState().busy,true);
 release();await work;await manager.idle();assert.equal(manager.getState().busy,false);assert.equal(manager.store.list().length,0);assert.equal(files.has(c.PayloadCore.appPath('sample','manifest.json')),false);
 await manager.showLauncher();assert.equal(manager.getState().mode,'launcher');await manager.shutdown();
});
test('failed launcher update rolls back in the same core without losing apps',async()=>{
 const {c,manager,system}=await fixture();await manager.install(pkg());
 const source='({api:1,mount:async function(){throw Error("broken launcher")}})';await system.stage({format:'civswitch-system',version:1,api:1,component:'launcher',release:'bad',source,checksum:c.PayloadCore.hash(source)});
 await manager.showLauncher();assert.equal(manager.getState().mode,'launcher');assert.equal((await system.status('launcher')).pending,null);assert.equal(manager.store.list().length,1);await manager.shutdown();
});
test('raw payload errors release child resources and leave a recoverable terminal',async()=>{
 const {c,manager}=await fixture();await assert.rejects(manager.executeRaw('globalThis.__civswitchApp={close:async function(){trace.push("cleaned")}};throw Error("raw failed")',()=>{}),/raw failed/);
 assert.ok(c.trace.includes('cleaned'));assert.equal(manager.getState().mode,'terminal');assert.equal(manager.getState().busy,false);await manager.shutdown();
});
test('fatal FTP listener failure reports the server stopped',async()=>{
 const c=vm.createContext({setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(__dirname+'/../app/src/ftp.js','utf8'),c);let closed=false;
 const ftp=await c.CivFtp.create({listen:async()=>({port:2121,accept:()=>{throw Error('accept failed');},close:()=>{closed=true;}}),log:()=>{}});
 assert.equal(ftp.getState().running,false);assert.equal(closed,true);await ftp.stop();
});
test('FTP settings default to 5000, persist credentials and fail closed on unreadable files',async()=>{
 const {c,io,files,manager}=await fixture();const settings=c.CivFtpSettings.create(io);assert.equal((await settings.load()).port,5000);
 const next={...settings.get(),anonymous:false,username:'tester',password:' secret ',enabled:false};await settings.save(next);
 const reboot=c.CivFtpSettings.create(io);assert.equal((await reboot.load()).password,' secret ');assert.equal(reboot.get().enabled,false);
 files.set(c.PayloadCore.path('ftp-settings.json'),'bad settings');await assert.rejects(reboot.load(),/preserved/);assert.equal(reboot.get().enabled,false);assert.equal(files.get(c.PayloadCore.path('ftp-settings.json')),'bad settings');
 for(const port of [0,65536,9026,9027,'5000'])assert.throws(()=>c.CivFtpSettings.validate({...next,port}));
 assert.throws(()=>c.CivFtpSettings.validate({...next,enabled:true,password:''}));assert.equal(c.CivFtpSettings.validate({...next,enabled:false,password:''}).enabled,false);await manager.shutdown();
});
test('FTP virtual paths enforce protection on aliases, renames and both source/destination',async()=>{
 const {c,manager}=await fixture();let protect=true,writes=[];const v=c.CivFtpFiles.create({settings:()=>({protect}),files:{write:async(p,b)=>writes.push(p),read:async()=> 'bytes',commit:async()=>{},rename:async(a,b)=>writes.push(a,b),remove:async p=>writes.push(p),rmdir:async p=>writes.push(p)},mutate:async fn=>fn()});
 const canonical=c.CivFtpFiles.canonical;
 assert.equal(canonical('/Install civapp','../../Root/civhomebrew/system/./core/slot-0.js'),'/Root/civhomebrew/system/core/slot-0.js');
 for(const path of ['/Root/civhomebrew','/Root/CivHomebrew/system/core/slot-0.js','/Root/civhomebrew/ftp-settings.json']){
  await assert.rejects(v.write(path,'bytes'),/protected/);await assert.rejects(v.remove(path,false),/protected/);
  await assert.rejects(v.rename(path,'/Root/other'),/protected/);await assert.rejects(v.rename('/Root/other',path),/protected/);
 }
 assert.equal(writes.length,0);protect=false;await v.write('/Root/civhomebrew/test.txt','bytes');assert.equal(writes[0],'save:/civhomebrew/test.txt');
 await assert.rejects(v.remove('/Root',true),/mount root/);await assert.rejects(v.write('/Root/other:/file','bytes'),/Invalid/);
 await manager.shutdown();
});

test('native app roundtrips close the loading view before ordered reads, retain the owner and reject undeclared apps',async()=>{
 const {c,io,manager}=await fixture(),owner={api:1,renderer:{owner:{device:'same-device',swapchain:'same-swapchain'}}};c.CivNanoVGSession={current:owner};
 const native=pkg('native');native.metadata.extensions.execution={schema:1,scripts:'ordered'};await manager.install(native);const legacy=pkg('legacy');delete legacy.metadata.extensions;await manager.install(legacy);
 manager.launch('legacy');await manager.idle();assert(!c.trace.includes('app-start'));assert.match(c.launcherApi.error,/native Launcher/);
 const read=io.read;io.read=async path=>{if(path.includes('/scripts/')){assert.equal(owner.active,null,'Loading view must finish closing before a child script is read');c.trace.push('child-read');}return read(path);};
 for(let i=0;i<3;i++){
  owner.active={lease:{close:async()=>{c.trace.push('view-closing');await sleep(5);owner.active=null;c.trace.push('view-closed');}}};
  c.trace.length=0;manager.launch('native');await until(()=>c.trace.includes('app-start'));
  assert.equal(c.CivNanoVGSession.current,owner);assert.equal(manager.getState().ftp,false);assert(c.trace.indexOf('ftp-stop')<c.trace.indexOf('app-start'));
  assert(c.trace.indexOf('ftp-stop')<c.trace.indexOf('view-closing'));assert(c.trace.indexOf('view-closed')<c.trace.indexOf('child-read'));
  c.finishApp();await manager.idle();assert.equal(manager.getState().mode,'launcher');assert.equal(manager.getState().ftp,true);assert.equal(c.CivNanoVGSession.current,owner);
 }
 await manager.shutdown();
});
test('legacy apps are rejected through launcher and companion paths without a native session',async()=>{
 const {c,io,manager}=await fixture(),p=pkg('legacy');delete p.metadata.extensions;await manager.install(p);
 const read=io.read,scriptReads=[];io.read=async path=>{if(path.includes('/scripts/'))scriptReads.push(path);return read(path);};
 for(const terminal of [false,true]){
  if(terminal){manager.showTerminal();await manager.idle();}
  const before=Array.from(c.trace),state=manager.getState();
  for(const request of [{op:'run',id:p.id},{op:'run-source',package:p}])await assert.rejects(manager.dispatch({protocol:1,...request}),/needs an update for the native Launcher/);
  assert.deepEqual(Array.from(c.trace),before,'Rejected companion requests leave the launcher/FTP/terminal intact');assert.deepEqual(manager.getState(),state);
 }
 await manager.showLauncher();manager.launch(p.id);await manager.idle();
 assert.match(c.launcherApi.error,/needs an update for the native Launcher/);assert(!c.trace.includes('app-start'));assert.deepEqual(scriptReads,[]);
 assert.equal(manager.getState().mode,'launcher');assert.equal(manager.getState().ftp,true);await manager.shutdown();
});
test('native API and library mismatches reject both companion launch forms before acceptance',async()=>{
 const {c,manager}=await fixture();c.CivAppsNativeUI={name:'civapps-native-ui',api:1,version:'1.3.0',sessions:{current:{api:1}}};
 for(const cap of [null,{}, {api:'1'}, {api:2}, {api:1,library:'other',version:'1.3.0'}, {api:1,library:'civapps-native-ui',version:'2.0.0'}, {api:1,library:'civapps-native-ui',version:'1.2.0',minVersion:'1.4.0'}, {api:1,capabilities:['missing']}, {api:1,version:'invalid'}]){
  const p=pkg();p.metadata.extensions.nativeUi=cap;await manager.install(p);
  for(const request of [{op:'run',id:p.id},{op:'run-source',package:p}])await assert.rejects(manager.dispatch({protocol:1,...request}),/native Launcher|native UI library|SDK|compatibility version/);
 }
 assert(!c.trace.includes('app-start'));assert.equal(manager.getState().ftp,true);await manager.shutdown();
});
test('migrated apps launch through both companion forms with the canonical native session',async()=>{
 const {c,manager}=await fixture(),session={api:1};c.CivAppsNativeUI={name:'civapps-native-ui',api:1,version:'1.3.0',sessions:{current:session}};
 const p=pkg();p.metadata.extensions.nativeUi={api:1,library:'civapps-native-ui',version:'1.3.0'};await manager.install(p);
 for(const request of [{op:'run',id:p.id},{op:'run-source',package:p}]){
  const r=await manager.dispatch({protocol:1,...request});assert.equal(r.response.state,'accepted');r.after();await until(()=>manager.getState().mode==='app');
  c.finishApp();await manager.idle();assert.equal(manager.getState().mode,'launcher');assert.equal(manager.getState().ftp,true);assert.equal(c.CivAppsNativeUI.sessions.current,session);
 }
 await manager.shutdown();
});
test('launch rechecks migration after an accepted request and before reading scripts',async()=>{
 const {c,io,manager}=await fixture(),p=pkg();await manager.install(p);const r=await manager.dispatch({protocol:1,op:'run',id:p.id});
 delete p.metadata.extensions;await manager.install(p);const read=io.read,scriptReads=[];io.read=async path=>{if(path.includes('/scripts/'))scriptReads.push(path);return read(path);};
 r.after();await manager.idle();assert(!c.trace.includes('app-start'));assert.deepEqual(scriptReads,[]);assert.match(c.launcherApi.error,/native Launcher/);await manager.shutdown();
});

test('compatible release requirements work through both companion forms and direct selection without replacing the session',async()=>{
 const {c,manager}=await fixture(),session={api:1};
 c.CivAppsNativeUI={name:'civapps-native-ui',api:1,version:'1.4.0',capabilities:['framebuffer'],sessions:{current:session}};
 const p=pkg('compatible');p.metadata.extensions.nativeUi={api:1,library:'civapps-native-ui',version:'1.3.0',minVersion:'1.2.0',capabilities:['framebuffer']};await manager.install(p);
 for(const op of ['run','run-source','direct']){
  if(op==='direct')manager.launch(p.id);
  else {const r=await manager.dispatch({protocol:1,op,...(op==='run'?{id:p.id}:{package:p})});r.after();}
  await until(()=>manager.getState().mode==='app');c.finishApp();await manager.idle();
  assert.equal(c.CivAppsNativeUI.sessions.current,session);assert.equal(manager.getState().ftp,true);
 }
 await manager.shutdown();
});
test('requirements reject before script reads or foreground changes in launcher and terminal modes',async()=>{
 const {c,io,manager}=await fixture(),session={api:1};
 c.CivAppsNativeUI={name:'civapps-native-ui',api:1,version:'1.3.0',capabilities:[],sessions:{current:session}};
 const read=io.read,reads=[];io.read=async path=>{if(path.includes('/scripts/'))reads.push(path);return read(path);};
 for(const terminal of [false,true]){
  if(terminal){manager.showTerminal();await manager.idle();}
  for(const requirement of [{minVersion:'1.4.0'},{capabilities:['framebuffer']},{version:'2.0.0'},{api:2}]){
   const p=pkg();p.metadata.extensions.nativeUi={api:1,library:'civapps-native-ui',version:'1.3.0',...requirement};await manager.install(p);reads.length=0;
   const before=Array.from(c.trace),state=manager.getState();
   for(const request of [{op:'run',id:p.id},{op:'run-source',package:p}])await assert.rejects(manager.dispatch({protocol:1,...request}),/SDK|native Launcher/);
   assert.deepEqual(Array.from(c.trace),before);assert.deepEqual(manager.getState(),state);assert.deepEqual(reads,[]);
  }
 }
 reads.length=0;await manager.showLauncher();manager.launch('sample');await manager.idle();
 assert.deepEqual(reads,[]);assert(!c.trace.includes('app-start'));assert.equal(manager.getState().ftp,true);await manager.shutdown();
});
