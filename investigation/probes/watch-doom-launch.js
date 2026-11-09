(async function(){
 var g=window,check={started:Date.now(),ready:null,closed:false,error:null},seen=0,closing=false;
 g.__doomLaunchVerification=check;
 check.timer=setInterval(function(){
  if(Date.now()-check.started>90000){clearInterval(check.timer);check.error='Normal launch verification deadline';return;}
  var app=g.__civswitchApp;
  if(app&&app.id==='doom-civhomebrew'){
   if(!seen){seen=Date.now();check.ready={state:app.getState(),labels:Array.prototype.map.call(document.querySelectorAll('#doom-civhomebrew button'),function(b){return b.textContent;})};}
   if(!closing&&Date.now()-seen>700){closing=true;app.close().then(function(){check.closed=true;clearInterval(check.timer);},function(e){check.error=String(e.message);clearInterval(check.timer);});}
  }
 },40);
 await log('DOOM_NORMAL_WATCH_READY');
})();
