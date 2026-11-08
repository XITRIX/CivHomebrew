/* Resident shell: terminal, input, recoverable PC services, and manager lifetime. */
(function(g){
 "use strict";
 async function start(boot){
  if(g.__civhomebrewCore)throw Error("A resident core is already active.");
  var native=boot.native,config=boot.config||{},C=g.PayloadCore,closed=false,manager=null,rpc=null,raw=null,rawTransport=null;
  var rpcRetry=null,rawRetry=null,buttons=null,buttonTimer=null,frame=null,removers=[],subscription=null,finish;
  var lifetime=new Promise(function(r){finish=r;}),diagnostics=[],writer=null,writeTail=Promise.resolve(),lastInput=0;
  var originalDescriptor=Object.getOwnPropertyDescriptor(g,"log"),originalLog=g.log;
  function node(tag,parent,style,text){var e=document.createElement(tag);Object.assign(e.style,style||{});if(text!==undefined)e.textContent=text;if(parent)parent.appendChild(e);return e;}
  var root=node("div",document.body,{position:"fixed",left:"0",right:"0",top:"0",bottom:"0",backgroundColor:"#000",color:"#fff",zIndex:"0",fontFamily:"monospace",outline:"none"});root.id="civhomebrew-core";root.tabIndex=-1;
  var terminal=node("pre",root,{position:"absolute",left:"8px",right:"8px",top:"8px",bottom:"74px",margin:"0",overflow:"hidden",fontFamily:"monospace",fontSize:"14px",lineHeight:"17px",whiteSpace:"pre"});terminal.id="terminal-output";
  var footer=node("div",root,{position:"absolute",left:"30px",right:"30px",bottom:"22px",fontFamily:"Arial, sans-serif",fontSize:"22px",display:"flex",justifyContent:"flex-end",gap:"28px"});
  var launchButton=node("button",footer,{backgroundColor:"transparent",color:"#fff",border:"0",fontSize:"22px"},"(B) Launcher");
  var exitButton=node("button",footer,{backgroundColor:"transparent",color:"#fff",border:"0",fontSize:"22px"},"(+) Exit to Gezine");exitButton.style.display=config.bootIntegrated?"none":"block";
  var model=g.PayloadTerminal.create(function(text){terminal.textContent=text;});
  function record(text){diagnostics.push({time:Date.now(),message:String(text).slice(0,240)});if(diagnostics.length>64)diagnostics.shift();model.append(text);}
  function log(text){var value=String(text);record(value);if(writer){writeTail=writeTail.then(function(){return writer(value.slice(0,32768)+"\n");});return writeTail;}return Promise.resolve();}
  g.log=log;record("CivHomebrew resident core / terminal");
  record("Made by XITRIX");
  record("Powered by Gezine's CivSwitch");
  function view(mode){root.style.display=mode==="terminal"?"block":"none";if(mode==="terminal")root.focus();}
  async function dispose(){
   if(closed)return;closed=true;if(rpcRetry)clearTimeout(rpcRetry);if(rawRetry)clearTimeout(rawRetry);
   if(buttonTimer)clearInterval(buttonTimer);if(frame)cancelAnimationFrame(frame);if(buttons)buttons.close();
   removers.splice(0).forEach(function(r){r();});
   try{if(subscription&&subscription.clear)subscription.clear();else if(g.engine&&g.engine.off)g.engine.off("InputAction",onNative,owner);}catch(e){record(e.message);}
   if(rpc){var server=rpc;rpc=null;await server.stop();}if(raw){var receiver=raw;raw=null;await receiver.stop();}
   if(g.log===log){if(originalDescriptor)Object.defineProperty(g,"log",originalDescriptor);else delete g.log;}
   if(root.parentNode)root.parentNode.removeChild(root);delete g.__civhomebrewCore;finish();
  }
  manager=g.CivResident.create({io:native.io,files:native.files,system:boot.system,evaluate:boot.evaluate,config:config,terminal:boot.recovery,
    ip:native.ip,listen:native.listenTcp,log:record,view:view,shutdown:dispose,services:function(){return {rpc:!!rpc,raw:!!raw,release:boot.release};},
    rawWriter:async function(value){if(!value)try{await writeTail;}catch(e){record("Raw sender: "+e.message);}finally{writer=null;writeTail=Promise.resolve();}else{writer=value;writeTail=Promise.resolve();}}});
  var publicCore={id:"civhomebrew-core",getState:manager.getState,diagnostics:diagnostics,lifetime:lifetime,
   close:manager.shutdown,showLauncher:manager.showLauncher,showTerminal:manager.showTerminal,dispatch:manager.dispatch};
  g.__civhomebrewCore=publicCore;
  function retryRpc(e){if(closed||rpcRetry)return;rpc=null;record("Companion offline: "+e.message);rpcRetry=setTimeout(function(){rpcRetry=null;startRpc();},1000);}
  function retryRaw(e){if(closed||rawRetry)return;raw=null;record("Raw receiver offline: "+e.message);rawRetry=setTimeout(function(){rawRetry=null;startRaw();},1000);}
  function startRpc(){
   if(closed||!native.serve)return;
   try{var failed=false,server=native.serve(config.port||9027,manager.dispatch,function(e){failed=true;retryRpc(e);});if(!failed){rpc=server;record("Companion listening at "+native.ip()+":"+(config.port||9027));}}
   catch(e){retryRpc(e);}
  }
  var borrowed=g.PayloadLoaderScope.listener;
  function startRaw(){
   if(closed||!native.rawTransport)return;
   try{
    rawTransport=native.rawTransport(borrowed,g.PayloadLoaderScope.port);borrowed=null;
    var failed=false,receiver=g.PayloadLegacy.create({transport:rawTransport,busy:manager.rawBusy,execute:manager.executeRaw,record:record,
     ready:function(){record("Awaiting payload at "+native.ip()+":"+g.PayloadLoaderScope.port);},
     error:function(e){failed=true;retryRaw(e);}});
    if(!failed){raw=receiver;record("Awaiting payload at "+native.ip()+":"+g.PayloadLoaderScope.port);}
   }catch(e){retryRaw(e);}
  }
  function terminalAction(name,phase){
   if(!manager||manager.getState().mode!=="terminal"||Number(phase)!==0||Date.now()-lastInput<100)return;
   if(name==="accept"||name==="cancel"||name==="keyboard-escape"){lastInput=Date.now();manager.showLauncher().catch(record);}
   else if((name==="exit-core"||name==="pause")&&!config.bootIntegrated){lastInput=Date.now();manager.shutdown().catch(record);}
  }
  function onNative(name,phase){terminalAction(name,phase);}
  function listen(target,name,fn){target.addEventListener(name,fn,true);removers.push(function(){target.removeEventListener(name,fn,true);});}
  var owner={owner:"civhomebrew-core"};
  launchButton.addEventListener("click",function(){manager.showLauncher().catch(record);});exitButton.addEventListener("click",function(){manager.shutdown().catch(record);});
  listen(g,"keydown",function(e){if(manager.getState().mode!=="terminal")return;var name={Enter:"accept",Escape:"cancel","+":"exit-core"}[e.key];if(name){terminalAction(name,e.repeat?3:0);e.preventDefault();e.stopImmediatePropagation();}});
  ["navigate-input","engine-input"].forEach(function(name){listen(g,name,function(e){if(manager.getState().mode!=="terminal")return;var d=e.detail||{};if(["accept","cancel","keyboard-escape"].indexOf(d.name)>=0){terminalAction(d.name,d.status);e.preventDefault();e.stopImmediatePropagation();}});});
  if(g.engine&&typeof g.engine.on==="function")subscription=g.engine.on("InputAction",onNative,owner);
  if(native.controllerButtons)try{
   buttons=native.controllerButtons();var previous=0n;
   buttonTimer=setInterval(function(){
    if(closed)return;var state=manager.getState();if(state.mode==="app"||state.busy)return;
    try{var bits=buttons.poll();if(bits===null)return;
     if((bits&0x8n)&&!(previous&0x8n)&&state.mode==="launcher"&&g.__civswitchApp&&g.__civswitchApp.openOptions)g.__civswitchApp.openOptions();
     if((bits&0x800n)&&!(previous&0x800n)&&state.mode==="launcher")manager.showTerminal();
     if((bits&0x400n)&&!(previous&0x400n))terminalAction("exit-core",0);previous=bits;
    }catch(e){record(e.message);clearInterval(buttonTimer);buttonTimer=null;buttons.close();buttons=null;}
   },40);
  }catch(e){record("Core buttons: "+e.message);}
  try{
   (boot.warnings||[]).forEach(record);
   await manager.start();startRpc();startRaw();
   await new Promise(function(r){setTimeout(r,25);});
   for(var attempt=0;attempt<50&&((native.serve&&(!rpc||rpcRetry))||(native.rawTransport&&(!raw||rawRetry)));attempt++)await new Promise(function(r){setTimeout(r,100);});
   if((native.serve&&(!rpc||rpcRetry))||(native.rawTransport&&(!raw||rawRetry)))throw Error("Core services did not initialize.");
   await boot.ready();
   if(typeof originalLog==="function")try{await originalLog("CIVHOME_BREW_READY");}catch(e){record("Bootstrap sender: "+e.message);}
   await lifetime;
  }catch(e){try{await manager.shutdown();}catch(f){await dispose();}throw e;}
 }
 g.CivResidentEntry={start:start};
})(typeof window!=="undefined"?window:globalThis);
