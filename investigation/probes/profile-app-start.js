/* Finite native read/eval/start/normal-close smoke; no streaming or save writes. */
(async function(){
 var C=window.PayloadCore,boot=window.__civhomebrewBoot,store=C.createStore(boot.native.io);
 await store.load();var begin=Date.now(),p=await store.read('moonlight-civswitch'),readMs=Date.now()-begin,readyMs=null,closeTimer=null;
 var watcher=setInterval(function(){if(readyMs===null&&window.__moonlightSimpleUI&&document.getElementById('moonlight-simple-ui')){readyMs=Date.now()-begin;closeTimer=setTimeout(function(){if(window.__moonlightSimpleUI)window.__moonlightSimpleUI.close();},1200);}},10);
 try{await boot.evaluate(C.source(p));}
 finally{clearInterval(watcher);if(closeTimer!==null)clearTimeout(closeTimer);if(window.__moonlightSimpleUI)window.__moonlightSimpleUI.close();}
 if(readyMs===null)throw Error('Moonlight UI did not become ready');
 await log('CIV_APP_START_PROFILE '+JSON.stringify({readMs:readMs,uiReadyMs:readyMs,scripts:p.scripts.length,closed:!document.getElementById('moonlight-simple-ui')}));
})();
