/* Selector, terminal, input ownership and raw-loader checks. Requires Chrome and Node 22+. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'civhomebrew-ui-test-'));
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
   if(chrome.exitCode!==null)throw Error(stderr);await sleep(50);
  }
  assert(port,'Chrome did not expose its test port');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  const pending=new Map();let nextId=1;
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=nextId++;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(30);}throw Error('UI condition timed out: '+expression);};
  const key=async (name,shiftKey=false)=>{await evaluate('window.dispatchEvent(new KeyboardEvent("keydown",{key:'+JSON.stringify(name)+',shiftKey:'+shiftKey+',bubbles:true}))');await sleep(110);};
  const gameAction=async (name,x=0,y=0)=>{await evaluate('window.dispatchEvent(new CustomEvent("engine-input",{detail:{name:'+JSON.stringify(name)+',status:0,x:'+x+',y:'+y+'}}))');await sleep(110);};
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});

  const url=pathToFileURL(path.join(__dirname,'../app/index.html')).href;
  await call('Page.navigate',{url});
  await until('window.__civswitchApp&&!window.__civswitchApp.getState().busy');
  assert.match(await evaluate('document.getElementById("menu-status").textContent'),/No payloads/);
  await evaluate('window.__ticks=0;window.__ticker=setInterval(()=>window.__ticks++,20)');await sleep(120);
  assert.ok(await evaluate('window.__ticks')>2,'eval must keep timers alive');
  await evaluate('clearInterval(window.__ticker)');
  await key('Escape');await until('!document.getElementById("civhomebrew")');
  await call('Page.navigate',{url:url+'?demo=1'});
  await until('document.querySelectorAll("[role=option]").length===16');
  assert.equal(await evaluate('document.querySelector("[data-selected=true]").getAttribute("data-id")'),'demo-0');
  assert.equal(await evaluate('document.querySelectorAll("#civhomebrew button").length'),3);
  await key('-');
  assert.equal(await evaluate('window.__civswitchApp.getState().screen'),'terminal');
  assert.equal(await evaluate('document.getElementById("payload-terminal").style.display'),'block');
  await key('Escape');
  assert.equal(await evaluate('window.__civswitchApp.getState().screen'),'selector');
  assert.equal(await evaluate('window.__civswitchApp.getState().selected'),0);
  const shot=await call('Page.captureScreenshot',{format:'png'});
  fs.mkdirSync(path.join(__dirname,'../build'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'../build/menu-preview.png'),Buffer.from(shot.data,'base64'));
  await gameAction('nav-right');await gameAction('nav-down');
  assert.equal(await evaluate('window.__civswitchApp.getState().selected'),7);
  await gameAction('nav-down');await gameAction('nav-right');await gameAction('nav-right');
  assert.equal(await evaluate('window.__civswitchApp.getState().selected'),15);
  assert.ok(await evaluate('document.getElementById("payload-viewport").scrollTop')>0);
  // Remove click(), then feed duplicate native-style action routes in the same turn.
  await evaluate(`HTMLElement.prototype.click=undefined;
    window.dispatchEvent(new CustomEvent('engine-input',{detail:{name:'nav-left',status:0}}));
    window.dispatchEvent(new CustomEvent('navigate-input',{detail:{name:'nav-left',status:0}}));`);
  assert.equal(await evaluate('window.__civswitchApp.getState().selected'),14);
  await sleep(100);await gameAction('accept');
  await until('window.__civswitchApp===undefined');
  await until('window.__civswitchApp&&!window.__civswitchApp.getState().running');
  assert.equal(await evaluate('document.getElementById("civhomebrew").style.display'),'block');
  await sleep(350);await key('Escape');await until('!window.__civswitchApp');
  // Restart with the real UI and an explicit fake native service/storage adapter.
  await evaluate(`window.__serverStops=0;window.__rawQueue=[];window.__npadButtons=0n;window.PayloadNative.available=true;
    window.PayloadNative.create=()=>({rawTransport:()=>({accept:()=>window.__rawQueue.shift()||null,close:()=>{window.__rawClosed=true;}}),controllerButtons:()=>({poll:()=>window.__npadButtons,close:()=>{}}),io:window.PayloadPreview.io,ip:()=>"192.168.1.182",serve:(port,dispatch)=>{window.__rpcDispatch=dispatch;return {stop:async()=>{window.__serverStops++;}};}});`);
  await evaluate('void eval('+JSON.stringify(fs.readFileSync(path.join(__dirname,'../app/app.js'),'utf8'))+');true');
  await until('!!window.__rpcDispatch&&!window.__civswitchApp.getState().busy');
  const makePackage=(id,source)=>({format:'civswitch-app',version:1,id,name:'<img src=x onerror=alert(1)>',metadata:{api:1},icon:'',scripts:[{name:'app.js',source}]});
  const source=`(async function(){var finish;var life=new Promise(r=>finish=r);window.__childClose=()=>finish();window.__civswitchApp={close:()=>{finish();return life;}};await life;})();`;
  const packageValue=makePackage('child-test',source);
  await evaluate('window.__rpcDispatch({protocol:1,op:"install",package:'+JSON.stringify(packageValue)+'}).then(r=>{if(!r.response.ok)throw Error("install failed");});');
  await until('document.querySelector("[data-id=child-test]")');
  assert.equal(await evaluate('document.querySelectorAll("#payload-grid img").length'),0,'titles are text, not HTML');
  await evaluate(`(async()=>{window.__reply=await window.__rpcDispatch({protocol:1,op:'run',id:'child-test'});window.__reply.after();return true;})()`);
  await until('!!window.__childClose');
  assert.equal(await evaluate('document.getElementById("civhomebrew").style.display'),'none');
  assert.ok(await evaluate('window.__serverStops')>=1);
  await evaluate('window.__childClose();true');
  await until('window.__civswitchApp?.id==="civhomebrew"');
  await sleep(350);
  // Real protocol loop with mock native sockets: streamed logs, lexical helpers and B.
  await evaluate(`window.__nativeCloseCalls=[];window.__originalClose=window.close;window.close=v=>window.__nativeCloseCalls.push(v);
    window.__rawText='';window.__rawDone=false;
    var source='(async function(){close(123);await log("RAW_HELLO");await new Promise(r=>window.__rawFinish=r);await log("RAW_DONE");})();';
    var parts=[window.PayloadCore.encode(source),''];
    window.__rawQueue.push({receive:()=>parts.length?parts.shift():null,write:async t=>{window.__rawText+=t;},close:()=>{window.__rawDone=true;}});`);
  await until('window.__rawText.includes("RAW_HELLO")');
  assert.equal(await evaluate('window.__nativeCloseCalls[0]'),123,'raw evaluation retains original close(), not menu.close()');
  assert.equal(await evaluate('window.__civswitchApp'),undefined);
  assert.match(await evaluate('document.getElementById("terminal-output").textContent'),/RAW_HELLO/);
  const terminalShot=await call('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(__dirname,'../build/terminal-preview.png'),Buffer.from(terminalShot.data,'base64'));
  await sleep(350);await key('Escape');
  assert.equal(await evaluate('document.getElementById("payload-terminal").style.display'),'none');
  assert.ok(await evaluate('!!document.getElementById("civhomebrew")'),'B returns to selector while a log-only payload is pending');
  await evaluate('window.__rawFinish();true');await until('window.__rawDone');
  assert.match(await evaluate('window.__rawText'),/RAW_DONE\nExecuted successfully/);
  await sleep(350);await evaluate('window.__npadButtons=0x800n');
  await until('window.__civswitchApp.getState().screen==="terminal"');
  await evaluate('window.__npadButtons=0n');await sleep(120);await key('Escape');
  assert.equal(await evaluate('window.__civswitchApp.getState().screen'),'selector');
  await evaluate('window.close=window.__originalClose');
  // A rejected/throwing child returns an actionable message and the menu still exits.
  const bad=makePackage('bad-child','throw Error("fixture failure")');
  await evaluate('(async()=>{window.__reply=await window.__rpcDispatch({protocol:1,op:"run-source",package:'+JSON.stringify(bad)+'});window.__reply.after();return true;})()');
  await until('document.getElementById("menu-notice").textContent.includes("fixture failure")');
  await sleep(350);await key('Escape');await until('!window.__civswitchApp');
  await evaluate('window.__leakedInput=false;window.addEventListener("engine-input",()=>window.__leakedInput=true);window.dispatchEvent(new CustomEvent("engine-input",{detail:{name:"accept",status:0}}));');
  assert.equal(await evaluate('window.__leakedInput'),true,'menu input listener must be removed on exit');
  console.log('UI checks passed; preview: build/menu-preview.png');
 }finally{
  if(socket)socket.close();chrome.kill();
  await sleep(300);fs.rmSync(profile,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
