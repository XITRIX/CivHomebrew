/* Real Switch RAM trial: native frames, Start/A, app B returns, and ordinary
 * component update/rollback against the trial's isolated state filesystem. */
(function(g){
 var core=g.__civhomebrewCore,boot=g.__civhomebrewBoot,shared=g.CivAppsNativeUI.sessions.current;
 var r={complete:false,error:null,steps:[],started:Date.now()},choose=boot.system.choose,choices=0;
 g.__optimizedLauncherTest=r;
 boot.system.choose=function(name){if(name==='launcher')choices++;return choose.apply(boot.system,arguments);};
 function delay(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
 function input(name){var e=document.createEvent('CustomEvent');e.initCustomEvent('engine-input',true,true,{name:name,status:0});g.dispatchEvent(e);}
 function owner(){var d=shared.renderer.owner.display;return String(d.device)+':'+String(d.swapchain);}
 var firstOwner=owner();r.owner=firstOwner;
 async function ready(mode,id,timeout){
  var end=Date.now()+(timeout||15000);
  while(Date.now()<end){
   var state=core.getState(),view=shared.active;
   if(shared.stats.errors.length)throw Error(shared.stats.errors.join('; '));
   if(state.mode===mode&&(mode==='app'||!state.busy)&&view&&view.root.id===id){view.ui.update();if(view.ui.stats.frames>0)return view.ui;}
   await delay(25);
  }
  throw Error('Timed out: '+mode+' '+id+' '+JSON.stringify(core.getState()));
 }
 setTimeout(async function(){try{
  await core.showLauncher();await ready('launcher','civhomebrew');choices=0;
  for(var i=0;i<3;i++){
   core.showTerminal();await ready('terminal','civhomebrew-core');var at=Date.now();
   await core.showLauncher();await ready('launcher','civhomebrew');
   r.steps.push({kind:'terminal',cycle:i,returnMs:Date.now()-at,sourceSelections:choices});
  }
  if(choices!==0)throw Error('Warm Terminal returns reselected Launcher source');
  for(var app of [{id:'hello-civswitch',root:'hello-civswitch',text:'Hello'},
                  {id:'moonlight-civswitch',root:'moonlight-simple-ui',text:'Hosts'},
                  {id:'doom-civhomebrew',root:'doom-civhomebrew',text:'DOOM'}]){
   for(var cycle=0;cycle<2;cycle++){
    await delay(350);
    var tiles=Array.from(document.querySelectorAll('#payload-grid [role=option]')),target=tiles.findIndex(function(t){return t.getAttribute('data-id')===app.id;});
    if(target<0)throw Error('Missing tile: '+app.id);
    for(var moves=0;g.__civswitchApp.getState().selected!==target&&moves<30;moves++){
     var selected=g.__civswitchApp.getState().selected,row=Math.floor(selected/6),wanted=Math.floor(target/6);
     input(row!==wanted?(row>wanted?'nav-up':'nav-down'):(selected>target?'nav-left':'nav-right'));await delay(180);
    }
    if(g.__civswitchApp.selection()!==app.id)throw Error('Selection failed: '+app.id);
    var before=choices,start=Date.now();input('accept');var ui=await ready('app',app.root,60000),firstFrameMs=Date.now()-start;
    if(!ui.scene.commands.some(function(c){return c.kind==='text'&&c.text.indexOf(app.text)>=0;}))throw Error('App content absent: '+app.id);
    if(core.getState().ftp)throw Error('FTP still active in app');
    await delay(400);var back=Date.now();input('cancel');await ready('launcher','civhomebrew');
    if(owner()!==firstOwner)throw Error('Native owner changed');
    if(choices!==before)throw Error('App return reselected Launcher source');
    r.steps.push({kind:'app',id:app.id,cycle:cycle,firstFrameMs:firstFrameMs,returnMs:Date.now()-back,sourceSelections:choices,ftp:core.getState().ftp});
   }
  }
  var image=Object.assign({},g.__payloadMenuConfig.seeds.launcher,{release:'0.4.3-nanovg.11-trial'});
  var update=await core.dispatch({protocol:1,op:'update',package:image});if(update.after)update.after();
  await ready('launcher','civhomebrew');
  var s=await boot.system.status('launcher');if(s.pending!==null)throw Error('Trial update was not acknowledged');
  r.steps.push({kind:'update',state:s});
  var rollback=await core.dispatch({protocol:1,op:'rollback',component:'launcher'});if(rollback.after)rollback.after();
  await ready('launcher','civhomebrew');s=await boot.system.status('launcher');if(s.pending!==null)throw Error('Rollback did not finish');
  r.steps.push({kind:'rollback',state:s});
  if(owner()!==firstOwner||shared.stats.errors.length)throw Error('Owner/session failure after updates');
  r.complete=true;r.errors=shared.stats.errors.slice();r.services=core.getState();
 }catch(e){r.error=String(e.stack||e).slice(0,3000);var child=g.__civswitchApp;if(child&&child.id!=='civhomebrew'&&child.close)try{await child.close();}catch(_){};}
 finally{boot.system.choose=choose;r.finished=Date.now();}},350);
})(window);
