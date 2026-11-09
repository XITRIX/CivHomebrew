(async function(){
 var g=window,v={started:null,ready:null,closed:false,error:null,deadline:Date.now()+60000};g.__civAppLaunchWatch=v;
 v.timer=setInterval(function(){
  if(Date.now()>v.deadline){clearInterval(v.timer);v.error='App launch deadline';return;}
  var state=g.__civhomebrewCore.getState(),app=g.__civswitchApp;
  if(v.started===null&&state.busy)v.started=Date.now();
  if(!v.ready&&app&&app.id==='doom-civhomebrew'){
   v.ready={elapsedMs:Date.now()-v.started,labels:Array.prototype.map.call(document.querySelectorAll('#doom-civhomebrew button'),function(b){return b.textContent;})};
   app.close().then(function(){v.closed=true;clearInterval(v.timer);},function(e){v.error=e.message;clearInterval(v.timer);});
  }
 },10);
 await log('CIV_APP_LAUNCH_WATCH_READY');
})();
