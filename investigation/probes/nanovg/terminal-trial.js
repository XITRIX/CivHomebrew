/* Finite RAM-only activation: the existing resident core/model/input/services
 * remain in control. The component lookup override is never written to save. */
window.__civNanoVGTerminalStart=(async function(){
 'use strict';
 var g=window,core=g.__civhomebrewCore,boot=g.__civhomebrewBoot;
 if(!core||!boot||!boot.system)throw Error('Resident core required');
 if(g.__civNanoVGTerminalTrial)throw Error('A terminal trial is already active');
 var originalChoose=boot.system.choose,factory=g.CivHomebrewLauncher,ftp=g.CivFtp,session=null;
 if(!factory||typeof factory.mount!=='function')throw Error('Prototype launcher factory required');
 var trial={version:1,active:false,started:Date.now(),checks:[],error:null,factory:factory,ftp:ftp};
 var source='window.CivFtp=window.__civNanoVGTerminalTrial.ftp;window.CivHomebrewLauncher=window.__civNanoVGTerminalTrial.factory;window.CivNanoVGPrototype.enabled=true;window.CivHomebrewLauncher;';
 function choose(name,recovery){if(name!=='launcher')return originalChoose.call(boot.system,name,recovery);return Promise.resolve({component:'launcher',source:source,release:'0.4.3-native-terminal-trial',trial:false,checksum:g.PayloadCore.hash(source)});}
 try{
  session=await g.CivHomebrewNativeUI.start({core:core,report:function(e){trial.phase=e.stage;}});trial.session=session;g.__civNanoVGTerminalTrial=trial;
  boot.system.choose=choose;trial.active=true;
  trial.stop=async function(){if(boot.system.choose===choose)boot.system.choose=originalChoose;trial.active=false;await session.close();g.CivNanoVGPrototype.enabled=false;trial.finished=Date.now();};
  await log('CIV_NANOVG_TERMINAL_READY RAM-only; existing terminal retained');return trial;
 }catch(e){boot.system.choose=originalChoose;if(session)await session.close();trial.error=String(e.message);g.__civNanoVGTerminalTrial=trial;throw e;}
})();
