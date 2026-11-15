/* App integration browser launcher. The released SDK helpers remain immutable. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const chromeCleanup=require('../helpers/chrome-cleanup.cjs');
const {chromeArgs,waitForChromePort}=require('../helpers/chrome-startup.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function open(){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'civ-nanovg-'));
 const chrome=spawn(process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',chromeArgs(profile,{nativeRendering:true}),{stdio:['ignore','ignore','pipe']});
 const cleanup=chromeCleanup(chrome);let socket;
 try{
  const port=await waitForChromePort(chrome,profile);
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  const pending=new Map();let id=0;
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data),request=pending.get(message.id);if(request){pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout: '+method));},60000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  return {call,evaluate,until:async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(80);}throw Error('UI timed out: '+expression+'\n'+await evaluate('document.body.innerText'));},close:()=>cleanup(socket,profile)};
 }catch(error){await cleanup(socket,profile);throw error;}
}
module.exports={open,sleep};
