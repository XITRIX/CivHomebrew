/* Exercise the installed Hello app through the real resident core. */
(function(g){
 var core=g.__civhomebrewCore,shared=g.CivNanoVGSession&&g.CivNanoVGSession.current,main=g.__civNanoVGMainLauncher;
 if(!core||!shared||!main)throw Error('Installed native launcher required');
 var compiled=g.CivNanoVGFactory,sessions=g.CivNanoVGSession;
 function owner(){var d=shared.renderer.owner.display;return String(d.device)+':'+String(d.swapchain);}
 var firstOwner=owner(),report={version:1,complete:false,error:null,identity:main.identity,owner:firstOwner,steps:[]};
 g.__civNanoVGHelloRoundtrips=report;
 function delay(ms){return new Promise(r=>setTimeout(r,ms));}
 async function ready(mode,id){var end=Date.now()+15000;while(Date.now()<end){var s=core.getState(),a=shared.active;if(shared.stats.errors.length)throw Error(shared.stats.errors.join('; '));if(s.mode===mode&&(mode==='app'||!s.busy)&&a&&a.root.id===id){a.ui.update();if(a.ui.stats.frames>0)return a.ui;}await delay(25);}throw Error(mode+' '+id+' timed out: '+JSON.stringify(core.getState()));}
 function input(name){g.dispatchEvent(new CustomEvent('engine-input',{detail:{name:name,status:0}}));}
 setTimeout(async function(){try{
  for(var i=0;i<2;i++){
   var r=await core.dispatch({protocol:1,op:'run',id:'hello-civswitch'});if(!r.response.ok||!r.after)throw Error('App was not accepted');r.after();
   var ui=await ready('app','hello-civswitch'),app=g.__civswitchApp;if(!app||app.renderer!=='native-shared')throw Error('Hello did not borrow native UI');
   input('accept');await delay(450);ui.update();
   if(!ui.scene.commands.some(c=>c.kind==='text'&&c.text.indexOf('Action ran 1 time.')>=0))throw Error('Action status was not rendered');
   var pixel=shared.renderer.sample([[4,4]])[0];if(pixel[0]!==12||pixel[1]!==18||pixel[2]!==32||pixel[3]!==255)throw Error('Hello background pixel mismatch: '+pixel);
   var state=core.getState();if(state.launcher||state.ftp||!state.services.rpc||!state.services.raw)throw Error('Child service ownership mismatch');
   input('nav-down');await delay(250);ui.update();if(document.querySelector('#hello-civswitch button[data-selected="true"]').textContent!=='Close app')throw Error('Navigation did not select Close');
   // First cycle covers B; second covers the selected Close action.
   input(i?'accept':'cancel');ui=await ready('launcher','civhomebrew');
   if((g.__civswitchApp&&g.__civswitchApp.id==='hello-civswitch')||document.getElementById('hello-civswitch'))throw Error('Hello cleanup was incomplete');
   if(owner()!==firstOwner||g.CivNanoVGFactory!==compiled||g.CivNanoVGSession!==sessions)throw Error('Renderer owner or modules were recreated');
   report.steps.push({cycle:i,helloPixel:pixel,renderedStatus:'Action ran 1 time.',exit:i?'Close app':'B',owner:owner(),mounts:main.mounts,services:state.services});await delay(400);
  }
  report.errors=shared.stats.errors.slice();report.complete=true;
 }catch(e){report.error=String(e.stack||e).slice(0,2000);}},300);
})(window);
