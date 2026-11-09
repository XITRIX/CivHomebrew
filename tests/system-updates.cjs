const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){const c=vm.createContext({setTimeout,clearTimeout,setInterval,clearInterval});for(const n of ['core','app-metadata','storage','system','versions','http','sha256','github-releases','update-status','app-library','app-updates','system-updates'])vm.runInContext(fs.readFileSync(__dirname+'/../app/src/'+n+'.js','utf8'),c);return c;}
async function fixture(core='1.0.0',launcher='1.0.0'){
 const c=harness(),C=c.PayloadCore,files=new Map(),io={read:async p=>files.get(p)??null,write:async(p,b)=>files.set(p,b),ensureDirectory:async()=>{},commit:async()=>{},remove:async p=>files.delete(p),removeDirectory:async p=>{for(const k of files.keys())if(k.startsWith(p+'/'))files.delete(k);}},system=c.CivSystem.create(io),status=c.CivUpdateStatus.create(io);await status.load();
 const image=(component,release,source=component+' '+release)=>({format:'civswitch-system',version:1,api:1,component,release,source,checksum:C.hash(source)});
 async function activate(name){const chosen=await system.choose(name,false);await system.confirm(name,chosen);}
 for(const name of ['core','launcher']){await system.stage(image(name,name==='core'?core:launcher));await activate(name);}
 let installs=[],downloads=[],reloads=0,latest=null,failStage=null,badBody=null,afterDownload=null,afterStage=null;
 const api={submit:async(name,bytes)=>{const p=JSON.parse(C.decode(bytes));installs.push(p.component);if(failStage===p.component)throw Error('stage failed');await system.stage(p);if(afterStage)await afterStage(p);return {after:p.component==='launcher'?()=>{reloads++;return activate('launcher');}:null};}};
 const platform=c.CivSystemUpdates.platform(api,{native:{io},system});
 let release;
 function target(coreVersion='1.2.0',launcherVersion='1.3.0',coreSource){
  const images=[image('core',coreVersion,coreSource),image('launcher',launcherVersion)];
  release={version:'v1.3.0',assets:images.map(p=>({component:p.component,release:p.release,checksum:p.checksum,name:p.component+'.civupdate',bytes:C.encode(JSON.stringify(p)).length,body:C.encode(JSON.stringify(p))}))};return release;
 }
 target();
 const provider={latestSystem:async()=>{if(latest) return latest();return release;},download:async(a,o)=>{downloads.push(a.component);assert.equal(installs.length,0,'all downloads finish before first stage');if(afterDownload)await afterDownload(a,o);return {status:200,body:badBody?badBody(a):a.body};}};
 const updater=c.CivSystemUpdates.create({api,platform,status,provider});await updater.initialize();
 return {c,C,io,files,system,status,image,activate,updater,target,installs,downloads,get reloads(){return reloads;},set latest(v){latest=v;},set failStage(v){failStage=v;},set badBody(v){badBody=v;},set afterDownload(v){afterDownload=v;},set afterStage(v){afterStage=v;}};
}
test('availability hints persist, invalidate by installation identity, serialize writes and recover one corrupt slot',async()=>{
 const f=await fixture(),s=f.status;await Promise.all([s.set('system','12345678','v1.3.0'),s.set('app:test','87654321','1.2.0')]);
 const loaded=f.c.CivUpdateStatus.create(f.io);await loaded.load();assert.equal(loaded.get('system','12345678'),'v1.3.0');assert.equal(loaded.get('system','00000000'),null);assert.equal(loaded.get('app:test','87654321'),'1.2.0');
 f.files.set(f.C.root+'/update-status-0.json','corrupt');const fallback=f.c.CivUpdateStatus.create(f.io);await fallback.load();assert.equal(fallback.get('system','12345678'),'v1.3.0');
 f.files.set(f.C.root+'/update-status-1.json','corrupt');const broken=f.c.CivUpdateStatus.create(f.io);await assert.rejects(broken.load(),/unreadable/);const before=Array.from(f.files);await assert.rejects(broken.set('system','12345678','1.4.0'),/unavailable/);assert.deepEqual(Array.from(f.files),before);
});
test('status persistence uses the generic file adapter with two constant paths, without extending core path policy',async()=>{
 const c=harness(),C=c.PayloadCore,files=new Map();
 const native={io:{read:()=>assert.fail('legacy owned adapter does not allow these new paths'),write:()=>assert.fail('must not use legacy owned writes'),ensureDirectory:async p=>assert.equal(p,C.root)},files:{read:async(p,limit,binary)=>{assert.equal(binary,true);return files.get(p)??null;},write:async(p,b)=>files.set(p,b),commit:async()=>{}}};
 const io=c.CivUpdateStatus.platform(native),status=c.CivUpdateStatus.create(io);await status.load();await status.set('system','12345678','v1.3.0');const reloaded=c.CivUpdateStatus.create(io);await reloaded.load();assert.equal(reloaded.get('system','12345678'),'v1.3.0');
 await assert.rejects(io.read(C.root+'/catalog-0.json',65536),/path/);assert.throws(()=>io.write('save:/other','x'),/path/);assert.throws(()=>C.path('update-status-0.json'),/path/);
});
test('skipping releases from 1.0 to 1.3 installs the manifest core 1.2 and launcher 1.3, then requires restart',async()=>{
 const f=await fixture(),offer=await f.updater.check({});assert.equal(offer.kind,'update');assert.equal(f.updater.available(),true);
 const result=await f.updater.install(offer,{cancel:{}});assert.equal(result.kind,'restart');assert.deepEqual(f.downloads,['core','launcher']);assert.deepEqual(f.installs,['core','launcher']);assert.equal(f.reloads,0);
 assert.notEqual((await f.system.status('core')).pending,null);assert.notEqual((await f.system.status('launcher')).pending,null);
 await f.activate('core');await f.activate('launcher');const snapshot=await f.updater.initialize();assert.equal(snapshot.core.release,'1.2.0');assert.equal(snapshot.launcher.release,'1.3.0');assert.equal(f.updater.available(),false);
});
test('an up-to-date core is not downloaded or staged; launcher-only update automatically reloads',async()=>{
 const f=await fixture('1.2.0','1.2.0'),offer=await f.updater.check({});const result=await f.updater.install(offer,{cancel:{}});assert.equal(result.kind,'reloading');assert.deepEqual(f.downloads,['launcher']);assert.deepEqual(f.installs,['launcher']);assert.equal(f.reloads,1);
 await new Promise(r=>setTimeout(r,5));assert.equal((await f.updater.initialize()).launcher.release,'1.3.0');assert.equal((await f.system.status('core')).pending,null);assert.equal((await f.updater.check({})).kind,'latest');
});
test('unchanged core content does not require restart even if its component version was bumped',async()=>{
 const f=await fixture('1.0.0','1.0.0');f.target('1.2.0','1.3.0','core 1.0.0');const offer=await f.updater.check({});assert.equal((await f.updater.install(offer,{cancel:{}})).kind,'reloading');assert.deepEqual(f.downloads,['launcher']);
});
test('all required components validate before any staging, including mismatched size, identity, version, digest and checksum',async()=>{
 for(const problem of ['size','identity','version','checksum','digest']){
  const f=await fixture(),offer=await f.updater.check({});
  if(problem==='digest')offer.release.assets[1].digest='sha256:'+'0'.repeat(64);
  else f.badBody=a=>{if(a.component==='core')return a.body;if(problem==='size')return a.body+' ';const p=JSON.parse(f.C.decode(a.body));if(problem==='identity')p.component='core';if(problem==='version')p.release='1.4.0';if(problem==='checksum')p.checksum='00000000';const b=f.C.encode(JSON.stringify(p));a.bytes=b.length;return b;};
  await assert.rejects(f.updater.install(offer,{cancel:{}}));assert.equal(f.installs.length,0,problem);assert.equal((await f.system.status('core')).pending,null);
 }
});
test('cancellation and changed component snapshots prevent staging; a partially staged core retains restart requirement',async()=>{
 for(const problem of ['cancel','changed','stage']){
  const f=await fixture(),offer=await f.updater.check({}),cancel={};
  if(problem==='cancel')f.afterDownload=()=>{cancel.cancelled=true;};
  if(problem==='changed')f.afterDownload=async a=>{if(a.component==='launcher')await f.system.stage(f.image('core','1.1.0'));};
  if(problem==='stage')f.failStage='launcher';
  await assert.rejects(f.updater.install(offer,{cancel}),e=>problem==='stage'?e.restartRequired===true:true);
  if(problem!=='stage')assert.equal(f.installs.length,0);else assert.deepEqual(f.installs,['core','launcher']);
 }
});
test('saved availability survives unavailable checks; equal/older checks clear it and every click rechecks',async()=>{
 const f=await fixture();await f.updater.check({});assert.equal(f.updater.available(),true);let calls=0;f.latest=()=>{calls++;throw Error('offline');};assert.equal((await f.updater.check({})).reason,'unverified');assert.equal(f.updater.available(),true);assert.equal(calls,1);
 f.target('1.0.0','1.0.0');f.latest=null;assert.equal((await f.updater.check({})).kind,'latest');assert.equal(f.updater.available(),false);
 await f.system.stage(f.image('core','1.2.0'));await f.updater.initialize();assert.equal((await f.updater.check({})).kind,'restart');
});
test('a concurrent external component update between stages is preserved and stops automatic activation',async()=>{
 const f=await fixture(),offer=await f.updater.check({});f.afterStage=async p=>{if(p.component==='core')await f.system.stage(f.image('launcher','1.1.0'));};
 await assert.rejects(f.updater.install(offer,{cancel:{}}),e=>e.restartRequired&&/staging changed/.test(e.message));assert.deepEqual(f.installs,['core']);assert.equal(f.reloads,0);
 const s=await f.system.status('launcher');assert.equal(s.hashes[s.pending],f.image('launcher','1.1.0').checksum);
});
test('unknown versions, downgrades and different code reusing an installed version never produce an offer',async()=>{
 for(const versions of [['rolling','1.0.0'],['2.0.0','1.0.0'],['1.0.0','1.0.0']]){
  const f=await fixture(...versions);if(versions[0]==='1.0.0')f.target('1.0.0','1.0.0','different core with same version');
  assert.equal((await f.updater.check({})).kind,'latest');assert.equal(f.downloads.length,0);assert.equal(f.installs.length,0);
 }
});
test('GitHub full release manifest resolves independently versioned components and rejects incomplete or inconsistent targets',async()=>{
 const c=harness(),C=c.PayloadCore,manifest={format:'civhomebrew-release',version:1,release:'1.3.0',components:{core:{release:'1.2.0',asset:'core.civupdate',checksum:'12345678'},launcher:{release:'1.3.0',asset:'launcher.civupdate',checksum:'87654321'}}};
 let body=C.encode(JSON.stringify(manifest)),api={tag_name:'v1.3.0',draft:false,prerelease:false,assets:['civhomebrew-release.json','core.civupdate','launcher.civupdate'].map(name=>({name,state:'uploaded',size:name.endsWith('.json')?body.length:100,browser_download_url:'https://github.com/test/project/releases/download/v1.3.0/'+name,digest:null}))};
 const http={get:async url=>({status:200,body:url.includes('api.github.com')?C.encode(JSON.stringify(api)):body})},provider=c.CivGithubReleases.create(http),declaration={repository:'test/project'};
 const result=await provider.latestSystem(declaration,{});assert.equal(result.version,'v1.3.0');assert.equal(result.assets[0].release,'1.2.0');assert.equal(result.assets[1].release,'1.3.0');
 api.assets=api.assets.filter(a=>a.name!=='core.civupdate');await assert.rejects(provider.latestSystem(declaration,{}),/core.civupdate/);
 api.assets.push({...api.assets[1],name:'core.civupdate'});manifest.release='1.4.0';body=C.encode(JSON.stringify(manifest));api.assets[0].size=body.length;await assert.rejects(provider.latestSystem(declaration,{}),/manifest/);
});
test('app update hints survive reload and failed checks and clear on verified equal versions',async()=>{
 const f=await fixture(),C=f.C,store=C.createStore(f.io);await store.load();let entry=await store.install({format:'civswitch-app',version:1,id:'test',name:'Test',metadata:{api:1,release:'1.0.0',extensions:{updates:{schema:1,releasesUrl:'https://github.com/test/project/releases/latest'}}},icon:'',scripts:[{name:'app.js',source:'42'}]});
 const api={list:store.list,appStore:store.transaction};let version='1.1.0';const provider={latest:async()=>{if(version==='offline')throw Error('offline');return {version};}};
 let updates=f.c.CivAppUpdates.create({api,status:f.status,library:f.c.CivAppLibrary.create(api),provider});await updates.check(entry,{});assert.equal(updates.available(entry),true);
 const status=f.c.CivUpdateStatus.create(f.io);await status.load();updates=f.c.CivAppUpdates.create({api,status,library:f.c.CivAppLibrary.create(api),provider});assert.equal(updates.available(entry),true);version='offline';await updates.check(entry,{});assert.equal(updates.available(entry),true);version='1.0.0';await updates.check(entry,{});assert.equal(updates.available(entry),false);
});
