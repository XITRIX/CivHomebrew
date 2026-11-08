const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await sleep(5);}throw Error('Condition timed out');}
async function fixture(){
 const c=vm.createContext({setTimeout,clearTimeout,trace:[],ftp:false});for(const name of ['core','storage','system','resident'])vm.runInContext(fs.readFileSync(__dirname+'/../app/src/'+name+'.js','utf8'),c);
 const files=new Map();const io={read:async p=>files.get(p)??null,write:async(p,s)=>files.set(p,s),commit:async()=>{},ensureDirectory:async()=>{},remove:async p=>files.delete(p),removeDirectory:async p=>{for(const k of files.keys())if(k.startsWith(p+'/'))files.delete(k);}};
 const system=c.CivSystem.create(io),source='({api:1,mount:async function(api){trace.push("mount");ftp=true;return {id:"civhomebrew",close:async function(){ftp=false;trace.push("unmount")},stopServices:async function(){ftp=false;trace.push("ftp-stop")},ftpState:function(){return {running:ftp}},refresh:function(){trace.push("refresh")}}}})';
 await system.stage({format:'civswitch-system',version:1,api:1,component:'launcher',release:'1',source,checksum:c.PayloadCore.hash(source)});
 const manager=c.CivResident.create({io,system,evaluate:async s=>vm.runInContext(s,c),ip:()=>'',log:()=>{},view:mode=>c.trace.push(mode)});await manager.start();
 return {c,io,files,system,manager};
}
const pkg=(id='sample')=>({format:'civswitch-app',version:1,id,name:id,metadata:{api:1},icon:'',scripts:[{name:'app.js',source:'(async function(){trace.push("app-start");await new Promise(r=>globalThis.finishApp=r);trace.push("app-stop");})();'}]});
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
