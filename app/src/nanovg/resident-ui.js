/* CivHomebrew policy for the shared CivApps renderer. Terminal discovery,
 * Launcher fonts and core lifetime belong here, outside the renderer library. */
(function(g){
 'use strict';
 var followed=new WeakMap();
 function follow(session,core){
  if(followed.has(session))return session;
  var style=document.createElement('style');
  style.textContent='#terminal-output{font-family:CivNanoMono,monospace!important}#civhomebrew-core button,#civhomebrew,#civhomebrew *{font-family:CivNanoVG,sans-serif!important}';
  document.head.appendChild(style);
  var attach=session.attach,close=session.close,closed=false;
  session.stats.terminalBinds=0;session.stats.launcherBinds=0;
  session.attach=async function(root,options){
   var lease=await attach(root,options),previous=followed.get(session);
   if(previous!==lease){
    followed.set(session,lease);
    if(root.id==='civhomebrew-core')session.stats.terminalBinds++;
    else if(root.id==='civhomebrew')session.stats.launcherBinds++;
   }
   return lease;
  };
  function failed(e){if(session.stats.errors.length<16)session.stats.errors.push(String(e.message||e));}
  var monitor=setInterval(function(){
   if(closed)return;
   var owner=core||g.__civhomebrewCore;if(!owner)return;
   var state=owner.getState();
   if(state.closed){session.close().catch(failed);return;}
   if(state.mode==='terminal'&&!state.busy){
    var root=document.getElementById('civhomebrew-core');
    if(root&&(!session.active||session.active.root!==root))session.attach(root).catch(function(){});
   }
  },25);
  session.close=async function(){
   if(closed)return;closed=true;clearInterval(monitor);
   try{await close();}finally{if(style.parentNode)style.parentNode.removeChild(style);followed.delete(session);}
  };
  followed.set(session,null);return session;
 }
 async function start(options){
  options=options||{};
  var library=g.CivAppsNativeUI;
  if(!library||library.api!==1)throw Error('Missing CivApps native UI library');
  return follow(await library.sessions.start(options),options.core);
 }
 g.CivHomebrewNativeUI={start:start,follow:follow};
})(typeof window!=='undefined'?window:globalThis);
