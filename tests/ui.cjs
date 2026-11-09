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
  await until('window.__civhomebrewCore?.getState().mode==="launcher"');
  assert.match(await evaluate('document.getElementById("menu-status").textContent'),/No payloads/);
  await evaluate('window.__ticks=0;window.__ticker=setInterval(()=>window.__ticks++,20)');await sleep(120);
  assert.ok(await evaluate('window.__ticks')>2);await evaluate('clearInterval(window.__ticker)');
  await evaluate('window.__civhomebrewCore.close()');await until('!window.__civhomebrewCore');
  await call('Page.navigate',{url:url+'?demo=1'});
  await until('window.__civhomebrewCore?.getState().mode==="launcher"');await sleep(350);
  await until('document.querySelectorAll("[role=option]").length===16');
  assert.equal(await evaluate('window.__civhomebrewCore.getState().ftp'),true);
  await evaluate('window.__originalCore=window.__civhomebrewCore');
  // Y opens a one-entry options drawer; FTP settings persist and own server restarts.
  await key('y');assert.equal(await evaluate('document.getElementById("options-title").textContent'),'Options');
  assert.equal(await evaluate('document.querySelectorAll("#options-list [data-option]").length'),1);
  fs.mkdirSync(path.join(__dirname,'../build'),{recursive:true});
  var optionsShot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'../build/options-preview.png'),Buffer.from(optionsShot.data,'base64'));
  await gameAction('accept');assert.equal(await evaluate('document.getElementById("options-title").textContent'),'FTP Options');
  assert.match(await evaluate('document.querySelector("[data-option=port]").textContent'),/5000/);
  var ftpShot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'../build/ftp-options-preview.png'),Buffer.from(ftpShot.data,'base64'));

  await gameAction('accept');await gameAction('cancel');await until('!__civhomebrewCore.getState().ftp');
  await gameAction('accept');await gameAction('accept');await gameAction('nav-down');await gameAction('accept');
  const edit=async value=>{await until('!!document.querySelector("#options-overlay input")');await evaluate('(()=>{var i=document.querySelector("#options-overlay input");i.value='+JSON.stringify(value)+';i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));})()');await until('!document.querySelector("#options-overlay input")');await sleep(300);};
  await edit('9027');await gameAction('cancel');assert.match(await evaluate('document.getElementById("options-description").textContent'),/conflicts/);
  await gameAction('accept');await edit('5001');await gameAction('cancel');await until('__civhomebrewCore.getState().ftp');
  await evaluate('PayloadPreview.failFtpPort=5002');
  await gameAction('accept');await gameAction('nav-down');await gameAction('accept');await edit('5002');await gameAction('cancel');
  assert.match(await evaluate('document.getElementById("options-description").textContent'),/already in use/);
  assert.equal(await evaluate('__civhomebrewCore.getState().ftp'),false);
  await gameAction('accept');await edit('5001');await gameAction('cancel');await until('__civhomebrewCore.getState().ftp');
  await gameAction('accept');await gameAction('nav-down');await gameAction('nav-down');await gameAction('accept');
  await gameAction('nav-down');await gameAction('accept');await edit('tester');
  await gameAction('nav-down');await gameAction('accept');await edit(' secret ');
  assert.equal(await evaluate('document.querySelector("[data-option=password]").textContent.includes("secret")'),false);
  await gameAction('accept');await until('!!document.querySelector("#options-overlay input")');
  await evaluate('(()=>{var i=document.querySelector("#options-overlay input");i.value="discard this";i.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));})()');await until('!document.querySelector("#options-overlay input")');await sleep(300);

  await gameAction('cancel');await gameAction('cancel');await sleep(300);
  const saved=await evaluate('(async()=>PayloadCore.open(await PayloadPreview.io.read(PayloadCore.path("ftp-settings.json"))))()');
  assert.equal(saved.enabled,true);assert.equal(saved.port,5001);assert.equal(saved.anonymous,false);assert.equal(saved.password,' secret ');assert.equal(saved.protect,true);
  await evaluate('PayloadPreview.buttons=8n');await until('document.getElementById("options-overlay").style.display!=="none"');await evaluate('PayloadPreview.buttons=0n');await gameAction('cancel');await sleep(300);
  await key('-');await until('window.__civhomebrewCore.getState().mode==="terminal"');
  assert.equal(await evaluate('!!document.getElementById("civhomebrew")'),false,'terminal unloads the launcher DOM');
  assert.equal(await evaluate('window.__civhomebrewCore.getState().ftp'),false,'FTP is closed with launcher');
  assert.equal(await evaluate('PayloadPreview.services.filter(s=>s.kind!=="ftp").every(s=>!s.closed)'),true,'core listeners survive');
  await key('Escape');await until('window.__civhomebrewCore.getState().mode==="launcher"');await sleep(350);
  assert.equal(await evaluate('window.__civhomebrewCore===window.__originalCore'),true);
  fs.mkdirSync(path.join(__dirname,'../build'),{recursive:true});
  const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'../build/menu-preview.png'),Buffer.from(shot.data,'base64'));
  await gameAction('nav-right');await gameAction('nav-down');assert.equal(await evaluate('__civswitchApp.getState().selected'),7);
  await gameAction('nav-down');await gameAction('nav-right');await gameAction('nav-right');
  assert.equal(await evaluate('__civswitchApp.getState().selected'),15);
  assert.ok(await evaluate('document.getElementById("payload-viewport").scrollTop')>0);
  await evaluate(`HTMLElement.prototype.click=undefined;window.dispatchEvent(new CustomEvent('engine-input',{detail:{name:'nav-left',status:0}}));window.dispatchEvent(new CustomEvent('navigate-input',{detail:{name:'nav-left',status:0}}));`);
  assert.equal(await evaluate('__civswitchApp.getState().selected'),14);
  await evaluate(`window.__originalRead=PayloadPreview.io.read;window.__holdLoad=true;
   PayloadPreview.io.read=async function(path,limit,binary,onProgress){var text=await __originalRead(path,limit,binary);if(__holdLoad&&path.includes('/scripts/')){__holdLoad=false;if(onProgress)onProgress(Math.floor(PayloadCore.encode(text).length/2));await new Promise(r=>window.__releaseLoad=r);}return text;};`);
  await sleep(100);await gameAction('accept');await until('!!window.__releaseLoad');
  assert.equal(await evaluate('document.getElementById("loading-overlay").style.display'),'flex');
  assert.equal(await evaluate('__civhomebrewCore.getState().ftp'),false,'FTP stops before file loading');
  await gameAction('cancel');assert.equal(await evaluate('__civhomebrewCore.getState().mode'),'launcher','B during loading cannot interrupt the transition');
  const progress=await evaluate('Number(document.getElementById("loading-progress").getAttribute("aria-valuenow"))');assert.ok(progress>0&&progress<100);
  const geometry=await evaluate('(()=>{var p=document.getElementById("loading-panel").getBoundingClientRect(),t=document.getElementById("loading-progress").getBoundingClientRect(),f=document.getElementById("loading-progress-fill").getBoundingClientRect();return {x:p.left+p.width/2,y:p.top+p.height/2,left:f.left,trackLeft:t.left,width:f.width,trackWidth:t.width};})()');
  assert.ok(Math.abs(geometry.x-640)<1&&Math.abs(geometry.y-360)<1);assert.ok(Math.abs(geometry.left-geometry.trackLeft)<1);assert.ok(Math.abs(geometry.width-geometry.trackWidth*progress/100)<1);
  const loadingShot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'../build/loading-preview.png'),Buffer.from(loadingShot.data,'base64'));
  await evaluate('PayloadPreview.io.read=__originalRead;__releaseLoad();true');
  await until('__civhomebrewCore.getState().mode==="app"');
  assert.equal(await evaluate('!!document.getElementById("civhomebrew")'),false,'launcher unmounts before app');
  assert.equal(await evaluate('PayloadPreview.services.filter(s=>s.kind!=="ftp").every(s=>!s.closed)'),true);
  await until('__civhomebrewCore.getState().mode==="launcher"');await sleep(350);
  assert.equal(await evaluate('__civswitchApp.getState().selected'),14,'selection survives unloading');
  // Companion start follows the same visible loading path as controller A.
  await evaluate(`window.__holdCompanion=true;PayloadPreview.io.read=async function(path,limit,binary,onProgress){var text=await __originalRead(path,limit,binary);if(__holdCompanion&&path.includes('/scripts/')){__holdCompanion=false;if(onProgress)onProgress(Math.floor(PayloadCore.encode(text).length/2));await new Promise(r=>window.__releaseCompanion=r);}return text;};
   (async function(){var r=await PayloadPreview.dispatch({protocol:1,op:'run',id:'demo-14'});r.after();})();`);
  await until('!!window.__releaseCompanion');
  assert.equal(await evaluate('document.getElementById("loading-overlay").style.display'),'flex');
  assert.equal(await evaluate('__civswitchApp.getState().busy'),true);
  assert.equal(await evaluate('__civhomebrewCore.getState().ftp'),false);
  await evaluate('PayloadPreview.io.read=__originalRead;__releaseCompanion();true');
  await until('__civhomebrewCore.getState().mode==="app"');await until('__civhomebrewCore.getState().mode==="launcher"');await sleep(350);
  await evaluate(`PayloadPreview.io.read=async function(path,limit,binary){if(path.includes('/scripts/'))throw Error('Load fixture unavailable');return __originalRead(path,limit,binary);};`);
  await gameAction('accept');await until('document.getElementById("menu-notice")?.textContent.includes("Load fixture unavailable")');
  assert.equal(await evaluate('document.getElementById("loading-overlay").style.display'),'none');
  await evaluate('PayloadPreview.io.read=__originalRead');
  // A real launcher FTP command stream drives the same centered overlay during core installation.
  await evaluate(`window.__ftpReplies='';window.__holdInstall=true;window.__oldInstallRead=PayloadPreview.io.read;
   PayloadPreview.io.read=async function(path,limit,binary,onProgress){var text=await __oldInstallRead(path,limit,binary);if(__holdInstall&&path.endsWith('/ftp-overlay/scripts/app.js')){__holdInstall=false;if(onProgress)onProgress(Math.floor(PayloadCore.encode(text).length/2));await new Promise(r=>window.__releaseInstall=r);}return text;};
   var p={format:'civswitch-app',version:1,id:'ftp-overlay',name:'FTP installation',metadata:{api:1},icon:'',scripts:[{name:'lib.js',source:'var message="雪 😀";'},{name:'app.js',source:'/*'+ 'x'.repeat(1000)+'*/42'}]};
   window.__ftpPackage=PayloadCore.encode(JSON.stringify(p));window.__ftpIncoming=[];var incoming=__ftpIncoming,commands=[PayloadCore.encode('USER tester\\r\\nPASS  secret \\r\\nCWD /Install civapp\\r\\nEPSV\\r\\nSTOR overlay.civapp\\r\\n')];
   PayloadPreview.services.filter(s=>s.kind==='ftp'&&!s.closed).at(-1).queue.push({receive:()=>commands.length?commands.shift():null,close:()=>{},write:async text=>{__ftpReplies+=text;if(text.startsWith('229 '))PayloadPreview.services.at(-1).queue.push({receive:()=>incoming.length?incoming.shift():null,close:()=>{}});}});`);
  await until('document.getElementById("loading-title").textContent==="Uploading overlay.civapp…"');
  await evaluate('__ftpIncoming.push(__ftpPackage.slice(0,100));true');
  await until('document.getElementById("loading-progress").getAttribute("aria-valuetext")?.includes("0.1 KiB received")');
  assert.equal(await evaluate('document.getElementById("loading-progress").hasAttribute("aria-valuenow")'),false,'unknown total is not a fabricated percentage');
  assert.equal(await evaluate('__civswitchApp.getState().busy'),true);
  await gameAction('accept');await gameAction('cancel');assert.equal(await evaluate('__civhomebrewCore.getState().mode'),'launcher');
  const uploadShot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'../build/uploading-preview.png'),Buffer.from(uploadShot.data,'base64'));
  await evaluate('__ftpIncoming.push(__ftpPackage.slice(100), "");true');
  await until('!!window.__releaseInstall');
  assert.equal(await evaluate('document.getElementById("loading-overlay").style.display'),'flex');
  assert.equal(await evaluate('document.getElementById("loading-title").textContent'),'Installing FTP installation…');
  assert.equal(await evaluate('__civswitchApp.getState().busy'),true);
  const installProgress=await evaluate('Number(document.getElementById("loading-progress").getAttribute("aria-valuenow"))');assert.ok(installProgress>0&&installProgress<100);
  await gameAction('accept');await gameAction('cancel');assert.equal(await evaluate('__civhomebrewCore.getState().mode'),'launcher');
  const installShot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'../build/installing-preview.png'),Buffer.from(installShot.data,'base64'));
  await evaluate('PayloadPreview.io.read=__oldInstallRead;__releaseInstall();true');await until('__ftpReplies.includes("226 Package accepted")');
  assert.equal(await evaluate('document.getElementById("loading-overlay").style.display'),'none');assert.equal(await evaluate('__civswitchApp.getState().busy'),false);
  assert.equal(await evaluate('__civhomebrewCore.getState().ftp'),true);assert.ok(await evaluate('!!document.querySelector("[data-id=ftp-overlay]")'));
  assert.equal(await evaluate('(async()=>await PayloadPreview.io.read(PayloadCore.path("inbox/overlay.civapp")))()'),null,'Package uploads never persist their distribution copy');
  await evaluate(`window.__badUploadReplies='';var commands=[PayloadCore.encode('USER tester\\r\\nPASS  secret \\r\\nEPSV\\r\\nSTOR /Install civapp/invalid.civapp\\r\\n')];
   PayloadPreview.services.filter(s=>s.kind==='ftp'&&!s.closed&&s.port===5001)[0].queue.push({receive:()=>commands.length?commands.shift():null,close:()=>{},write:async text=>{__badUploadReplies+=text;if(text.startsWith('229 ')){var parts=['{}',''];PayloadPreview.services.at(-1).queue.push({receive:()=>parts.length?parts.shift():null,close:()=>{}});}}});`);
  await until('__badUploadReplies.includes("550 ")');assert.equal(await evaluate('document.getElementById("loading-overlay").style.display'),'none');assert.equal(await evaluate('__civswitchApp.getState().busy'),false);
  assert.match(await evaluate('document.getElementById("menu-notice").textContent'),/Upload failed/);
  // An installation failure dismisses the modal and restores input with an actionable error.
  await evaluate(`window.__oldInstallWrite=PayloadPreview.io.write;PayloadPreview.io.write=async function(path,text,binary){if(path.includes('/failed-overlay/scripts/'))throw Error('Install disk fixture');return __oldInstallWrite(path,text,binary);};
   window.__failedInstall=null;PayloadPreview.dispatch({protocol:1,op:'install',package:{format:'civswitch-app',version:1,id:'failed-overlay',name:'Failure',metadata:{api:1},icon:'',scripts:[{name:'app.js',source:'42'}]}}).catch(e=>__failedInstall=e.message);`);
  await until('__failedInstall!==null');assert.match(await evaluate('document.getElementById("menu-notice").textContent'),/Install disk fixture/);
  assert.equal(await evaluate('document.getElementById("loading-overlay").style.display'),'none');assert.equal(await evaluate('__civswitchApp.getState().busy'),false);
  await evaluate('PayloadPreview.io.write=__oldInstallWrite');
  // Core-owned installer works with the entire launcher/FTP module unloaded.
  await sleep(350);await key('-');await until('__civhomebrewCore.getState().mode==="terminal"');
  const pkg={format:'civswitch-app',version:1,id:'resident-test',name:'<img src=x onerror=alert(1)>',metadata:{api:1},icon:'',scripts:[{name:'app.js',source:'(async function(){await new Promise(r=>setTimeout(r,40));})();'}]};
  await evaluate('PayloadPreview.dispatch({protocol:1,op:"install",package:'+JSON.stringify(pkg)+'})');
  await key('Escape');await until('document.querySelector("[data-id=resident-test]")');
  assert.equal(await evaluate('document.querySelectorAll("#payload-grid img").length'),0);
  // Raw payloads retain native lexical helpers, streamed logs and terminal ownership.
  await evaluate(`window.__nativeCloseCalls=[];window.__originalClose=window.close;window.close=v=>__nativeCloseCalls.push(v);window.__rawText='';window.__rawDone=false;
   var source='(async function(){close(123);await log("RAW_HELLO");await new Promise(r=>window.__rawFinish=r);await log("RAW_DONE");})();';var parts=[PayloadCore.encode(source),''];
   PayloadPreview.rawQueue.push({receive:()=>parts.length?parts.shift():null,write:async t=>{__rawText+=t;},close:()=>{__rawDone=true;}});`);
  await until('__rawText.includes("RAW_HELLO")');assert.equal(await evaluate('__nativeCloseCalls[0]'),123);
  assert.match(await evaluate('document.getElementById("terminal-output").textContent'),/RAW_HELLO/);
  const terminalShot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'../build/terminal-preview.png'),Buffer.from(terminalShot.data,'base64'));
  await evaluate('__rawFinish();true');await until('__rawDone');assert.match(await evaluate('__rawText'),/RAW_DONE\nExecuted successfully/);
  await evaluate('window.close=__originalClose');
  // Replace launcher in place; a failed candidate rolls back without replacing the core.
  const updateSource='window.CivFtp=PayloadPreview.ftpFactory;window.__launcherVersion=2;PayloadPreview.launcherFactory;';
  await evaluate('(async()=>{var p={format:"civswitch-system",version:1,api:1,component:"launcher",release:"0.2.1",source:'+JSON.stringify(updateSource)+'};p.checksum=PayloadCore.hash(p.source);var r=await PayloadPreview.dispatch({protocol:1,op:"update",package:p});r.after();})()');
  await until('__civhomebrewCore.getState().mode==="launcher"&&window.__launcherVersion===2');
  assert.equal(await evaluate('__civhomebrewCore===__originalCore'),true);
  const badUpdate={format:"civswitch-system",version:1,api:1,component:"launcher",release:"bad",source:'({api:1,mount:async function(){throw Error("bad launcher")}})'};
  await evaluate('(async()=>{var p='+JSON.stringify(badUpdate)+';p.checksum=PayloadCore.hash(p.source);var r=await PayloadPreview.dispatch({protocol:1,op:"update",package:p});r.after();})()');
  await until('__civhomebrewCore.getState().mode==="launcher"&&!__civhomebrewCore.getState().busy');
  assert.equal(await evaluate('__civhomebrewCore===__originalCore'),true);
  // Core update is staged until the next boot-layer invocation.
  await evaluate('(async()=>{var source="window.__coreVersion=2;(async function(){return await CivResidentEntry.start(window.__civhomebrewBoot);})();";var p={format:"civswitch-system",version:1,api:1,component:"core",release:"0.2.1",source:source,checksum:PayloadCore.hash(source)};await PayloadPreview.dispatch({protocol:1,op:"update",package:p});})()');
  assert.equal(await evaluate('window.__coreVersion'),undefined);
  await evaluate('__civhomebrewCore.close()');await until('!window.__civhomebrewCore');
  await evaluate('void eval('+JSON.stringify(fs.readFileSync(path.join(__dirname,'../app/boot.js'),'utf8'))+');true');
  await until('window.__coreVersion===2&&window.__civhomebrewCore?.getState().mode==="launcher"');
  assert.equal(await evaluate('__civhomebrewCore===__originalCore'),false);
  // A core that throws before readiness falls back to the previous core terminal.
  const badCoreUpdate={format:"civswitch-system",version:1,api:1,component:"core",release:"bad",source:'throw Error("core fixture failed")'};
  await evaluate('(async()=>{var p='+JSON.stringify(badCoreUpdate)+';p.checksum=PayloadCore.hash(p.source);await PayloadPreview.dispatch({protocol:1,op:"update",package:p});})()');
  await evaluate('__civhomebrewCore.close()');await until('!window.__civhomebrewCore');
  await evaluate('void eval('+JSON.stringify(fs.readFileSync(path.join(__dirname,'../app/boot.js'),'utf8'))+');true');
  await until('window.__civhomebrewCore?.getState().mode==="terminal"');
  await evaluate('__civhomebrewCore.close()');await until('!window.__civhomebrewCore');
  assert.equal(await evaluate('PayloadPreview.services.every(s=>s.closed)'),true,'all listeners are released on core shutdown');
  // A listener can report a fatal accept error synchronously during construction.
  // Do not acknowledge core readiness with the returned, already-dead handle.
  await evaluate(`window.__serve=PayloadPreview.native.serve;window.__rawTransport=PayloadPreview.native.rawTransport;
   window.__rpcAttempts=0;window.__rawAttempts=0;window.__readyAttempts=null;
   PayloadPreview.native.serve=function(port,dispatch,onError){if(++__rpcAttempts===1){onError(Error('initial accept failed'));return {stop:async function(){}};}return __serve(port,dispatch,onError);};
   PayloadPreview.native.rawTransport=function(){if(++__rawAttempts===1)return {accept:function(){throw Error('initial raw accept failed')},close:function(){}};return __rawTransport();};
   window.__startCore=CivResidentEntry.start;CivResidentEntry.start=function(boot){var ready=boot.ready;boot.ready=function(){__readyAttempts=[__rpcAttempts,__rawAttempts];return ready();};return __startCore(boot);};`);
  await evaluate('void eval('+JSON.stringify(fs.readFileSync(path.join(__dirname,'../app/boot.js'),'utf8'))+');true');
  await until('window.__readyAttempts!==null');
  assert.deepEqual(await evaluate('__readyAttempts'),[2,2],'readiness waits for both listeners to recover');
  await evaluate('__civhomebrewCore.close()');await until('!window.__civhomebrewCore');
  assert.equal(await evaluate('PayloadPreview.services.every(s=>s.closed)'),true);
  // Installed mode starts locally even when both PC listeners are unavailable.
  await evaluate(`CivResidentEntry.start=__startCore;window.__payloadMenuConfig={bootIntegrated:true};
   PayloadPreview.native.serve=function(){throw Error('offline fixture')};
   PayloadPreview.native.rawTransport=function(){throw Error('offline fixture')};`);
  await evaluate('void eval('+JSON.stringify(fs.readFileSync(path.join(__dirname,'../app/boot.js'),'utf8'))+');true');
  await until('__civhomebrewCore?.getState().mode==="launcher"');await sleep(350);
  assert.equal(await evaluate('__civhomebrewCore.getState().services.bootIntegrated'),true);
  assert.equal(await evaluate('__civhomebrewCore.getState().services.rpc'),false);
  assert.equal(await evaluate('__civhomebrewCore.getState().services.raw'),false);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.includes('Exit')).every(b=>b.style.display==='none')`),true,'installed mode hides Exit actions');
  await key('-');await until('__civhomebrewCore.getState().mode==="terminal"');await key('+');
  assert.equal(await evaluate('!!window.__civhomebrewCore'),true,'Plus cannot exit installed core');
  await evaluate('__civhomebrewCore.close()');await until('!window.__civhomebrewCore');
  // Holding Minus at boot skips launcher autostart and enters the core terminal.
  await evaluate('PayloadPreview.native.serve=__serve;PayloadPreview.native.rawTransport=__rawTransport;PayloadPreview.buttons=0x800n');
  await evaluate('void eval('+JSON.stringify(fs.readFileSync(path.join(__dirname,'../app/boot.js'),'utf8'))+');true');
  await until('__civhomebrewCore?.getState().mode==="terminal"');await evaluate('PayloadPreview.buttons=0n');await sleep(350);
  await key('Escape');await until('__civhomebrewCore.getState().mode==="launcher"');
  await evaluate('__civhomebrewCore.close()');await until('!window.__civhomebrewCore');
  console.log('Resident UI checks passed: terminal, installer, FTP lifecycle, progress, raw payloads, live launcher rollback and next-boot core update.');
 }finally{
  if(socket)socket.close();chrome.kill();
  await sleep(300);fs.rmSync(profile,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
