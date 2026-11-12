/* Verify real resident remounts of the installed component after cold startup. */
(function(g){
 var main=g.__civNanoVGMainLauncher,shared=g.CivNanoVGSession&&g.CivNanoVGSession.current,core=g.__civhomebrewCore;
 if(!main||!shared||!core)throw Error('Installed native UI required');
 var report={version:1,complete:false,error:null,identity:main.identity,initialMounts:main.mounts,ramTrialPresent:!!g.__civNanoVGTerminalTrial,steps:[]},compiled=g.CivNanoVGFactory,sessions=g.CivNanoVGSession;
 g.__civNanoVGMainRoundtrips=report;
 function delay(ms){return new Promise(r=>setTimeout(r,ms));}
 function identity(){var d=shared.renderer.owner.display;return String(d.device)+':'+String(d.swapchain);}
 var firstIdentity=identity();
 async function ready(mode){var until=Date.now()+12000,id=mode==='terminal'?'civhomebrew-core':'civhomebrew';while(Date.now()<until){var state=core.getState(),a=shared.active;if(shared.stats.errors.length)throw Error(shared.stats.errors.join('; '));if(state.mode===mode&&!state.busy&&a&&a.root.id===id){a.ui.update();if(a.ui.stats.frames>0)return a.ui;}await delay(25);}throw Error(mode+' view timeout');}
 setTimeout(async function(){try{
  for(var i=0;i<2;i++){
   core.showTerminal();var ui=await ready('terminal'),marker='INSTALLED_NATIVE_TERMINAL_'+i;await g.log(marker);await delay(160);ui.update();if(!ui.scene.commands.some(c=>c.kind==='text'&&c.text.indexOf(marker)>=0))throw Error('Terminal log was not rendered');
   var termState=core.getState();if(termState.ftp||termState.launcher||!termState.services.rpc||!termState.services.raw)throw Error('Terminal services/ownership mismatch');
   await core.showLauncher();ui=await ready('launcher');var launcherState=core.getState();
   if(identity()!==firstIdentity||g.CivNanoVGFactory!==compiled||g.CivNanoVGSession!==sessions)throw Error('Renderer modules or owner were recreated');
   var b=ui.scene.commands.find(c=>c.kind==='border'&&c.color[0]<.01&&c.color[1]>.9&&c.color[2]>.7);if(!b)throw Error('Launcher border missing');var p=shared.renderer.sample([[Math.floor(b.rect[0]+1),Math.floor((b.rect[1]+b.rect[3])/2)]])[0];if(p[0]>2||Math.abs(p[1]-239)>2||Math.abs(p[2]-207)>2)throw Error('Launcher output mismatch');
   report.steps.push({cycle:i,owner:firstIdentity,mounts:main.mounts,terminalServices:termState.services,launcherServices:launcherState.services,launcherFtp:launcherState.ftp,launcherPixel:p});await delay(200);
  }
  report.finalMounts=main.mounts;report.errors=shared.stats.errors.slice();report.complete=true;
 }catch(e){report.error=String(e.stack||e).slice(0,1500);}},300);
})(window);
