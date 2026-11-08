/* Integration smoke: install the real packaged Moonlight app in memory, then
 * launch its extracted scripts in Chrome. No console or Sunshine host is used.
 * node tests/moonlight-package.cjs /absolute/path/to/moonlight.civapp
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const pkg=JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'civapp-smoke-'));
 const chrome=spawn(process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--disable-gpu','--disable-extensions','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
 ],{stdio:['ignore','ignore','pipe']});
 let socket,spawnError,stderr='';chrome.on('error',e=>spawnError=e);chrome.stderr.on('data',s=>stderr=(stderr+s).slice(-2000));
 try{
  let port;
  for(let i=0;i<200;i++){
   if(spawnError)throw spawnError;
   try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch{}
   if(chrome.exitCode!==null)throw Error(stderr);await pause(50);
  }
  assert(port,'Chrome did not start');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  const pending=new Map();let nextId=1;
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=nextId++;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  for(const file of ['core','storage'])await evaluate(fs.readFileSync(path.join(__dirname,'../app/src/'+file+'.js'),'utf8'));
  await evaluate(`window.__files=new Map();window.__store=PayloadCore.createStore({
   read:async path=>__files.get(path)||null,write:async(path,data)=>{__files.set(path,data);},
   ensureDirectory:async()=>{},remove:async path=>{__files.delete(path);},commit:async()=>{},
   removeDirectory:async path=>{for(const file of __files.keys())if(file.startsWith(path+'/'))__files.delete(file);}
  });window.__package=${JSON.stringify(pkg)};true`);
  const result=await evaluate(`(async()=>{
   await __store.load();await __store.install(__package);
   const loaded=await __store.read(__package.id);
   if(PayloadCore.source(loaded)!==PayloadCore.source(__package))throw Error('Extracted script mismatch');
   const icon=await __store.icon(__package.id);
   const image=new Image();image.src=icon;await image.decode();
   if(image.naturalWidth!==256||image.naturalHeight!==256)throw Error('Icon decode failed');
   window.__moonlightStreamModuleUpload={sha256:'stale',count:0,parts:[]};
   window.__done=false;
   window.__lifetime=eval(PayloadCore.source(loaded));
   if(!__lifetime||typeof __lifetime.then!=='function')throw Error('No app lifetime promise');
   __lifetime.then(()=>{__done=true;});
   await new Promise(r=>setTimeout(r,100));
   return {scripts:loaded.scripts.length,files:__files.size,factory:typeof __moonlightStreamFactory,
    staleUpload:!!window.__moonlightStreamModuleUpload,pending:!__done,
    hosts:document.getElementById('moonlight-hosts-screen')?.style.display};
  })()`);
  assert.equal(result.scripts,24);assert.equal(result.factory,'function');assert.equal(result.staleUpload,false);
  assert.equal(result.pending,true);assert.equal(result.hosts,'flex');
  assert.equal(await evaluate('(async()=>{window.__moonlightSimpleUI.close();await __lifetime;return __done;})()'),true);
  console.log('Moonlight package smoke passed: 24 extracted scripts, decoded 256×256 icon, runtime factory, visible Hosts UI, pending lifetime and clean close.');
 }finally{
  if(socket)socket.close();chrome.kill('SIGTERM');
  await Promise.race([new Promise(r=>chrome.once('exit',r)),pause(3000)]);
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
