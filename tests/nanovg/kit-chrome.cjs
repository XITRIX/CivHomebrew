/* Real SDK browser scene and Kit app lifecycle; bridge I/O is explicitly mocked. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {open,sleep}=require('../../tools/civapps-native-ui/chrome.cjs');
const root=path.resolve(__dirname,'../..');
const html=`<!doctype html><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}</style><body><script src="/app/vendor/native-ui-runtime.js"></script><script>
window.ready=(async()=>{window.session=await CivAppsNativeUI.sessions.start({browser:true});window.pkg=await(await fetch('/dist/civswitch-kit-checks.civapp')).json();
window.launch=()=>{window.done=false;window.result=(async()=>{for(var i=0;i<pkg.scripts.length;i++){var result=(0,eval)(pkg.scripts[i].source);if(i===pkg.scripts.length-1)await result;}})();result.then(()=>done=true);};launch();})();</script>`;
const server=http.createServer(async(req,res)=>{try{if(req.url==='/')return res.end(html);const file=path.resolve(root,'.'+req.url);if(!file.startsWith(root+'/'))throw Error('path');res.end(await fs.readFile(file));}catch(e){res.statusCode=404;res.end(String(e));}});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await open();const {evaluate:ev,until,call}=browser;
 await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});await until('!!window.ready');await ev('ready');
 const press=async name=>{await ev(`(()=>{var e=new CustomEvent('engine-input',{detail:{name:${JSON.stringify(name)},status:0}});window.dispatchEvent(e);})()`);await sleep(180);};
 await until('session.active?.root.id==="civswitch-kit-checks" && session.active.ui.stats.frames>0');
 assert.equal(await ev('done'),false);assert.equal(await ev('__civswitchApp.renderer'),'native-shared');
 await ev('HTMLElement.prototype.click=()=>{throw Error("click unavailable")};');
 await press('nav-down');await press('accept');await until('session.active.lease.scene.commands.some(c=>c.kind==="text"&&c.text.includes("LAN IPv4"))');
 await ev(`window.cleaned=false;CivKitConfig.pcIp='192.0.2.1';CivKitNative.create=()=>({});CivKitBridge.endpoint=()=>{};CivKitBridge.run=async(n,o)=>{while(!o.stopped())await new Promise(r=>setTimeout(r,10));await new Promise(r=>setTimeout(r,150));cleaned=true;throw Error('cancelled');};`);
 await press('accept');await press('cancel');await until('done');assert.equal(await ev('cleaned'),true);assert.equal(await ev('session.active'),null);assert.equal(await ev('!!document.getElementById("civswitch-kit-checks")'),false);
 await ev(`launch()`);await until('session.active?.root.id==="civswitch-kit-checks"');await press('nav-down');await press('nav-down');await press('accept');await until('done');assert.deepEqual(await ev('session.stats.errors'),[]);
 // Close while attachment is pending must retain the lifetime until the lease drains.
 await ev(`window.release=null;window.gate=new Promise(r=>release=r);window.originalMount=CivHomebrewSDK.app.mount;CivHomebrewSDK.app.mount=async(...args)=>{await gate;return originalMount(...args);};launch();`);await until('!!__civswitchApp');await ev('__civswitchApp.close();true');assert.equal(await ev('done'),false);await ev('release()');await until('done');assert.equal(await ev('session.active'),null);
 console.log('Kit native UI passed: first frame/status, direct controller A, B cancellation drains bridge, selected Return, repeat launch, pending attach cleanup, shared session retained.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
