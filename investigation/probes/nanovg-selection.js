(async function(){
 var g=window,boot=g.__civhomebrewBoot,core=g.__civhomebrewCore,entries,app,geometry,result={stages:[],complete:false};
 function note(){}function delay(ms){return new Promise(function(r){setTimeout(r,ms);});}
 function press(name){var e=document.createEvent('CustomEvent');e.initCustomEvent('engine-input',true,true,{name:name,status:0});g.dispatchEvent(e);}
 g.CivNanoVGPrototype.defer=true;g.CivNanoVGPrototype.enabled=false;
 try{
  var reply=await core.dispatch({protocol:1,op:'list'}),entries=reply.response.entries;
  function deny(){throw Error('This console benchmark is read-only');}
  var api={list:function(){return entries.slice();},icon:async function(id){g.PayloadCore.id(id);var raw=await boot.native.io.read(g.PayloadCore.appPath(id,'icon.png'),512*1024,true);return raw?'data:image/png;base64,'+g.PayloadCore.base64(raw):'';},
   config:{bootIntegrated:true},selection:null,error:'',log:function(text){note('launcher-log',String(text).slice(0,140));},ip:boot.native.ip,
   ftpSettings:{enabled:false,port:5000,anonymous:true,username:'',password:'',protect:true},saveFtpSettings:deny,submit:deny,launch:deny,terminal:function(){note('exit-requested');},
   files:{read:function(path){if(path.indexOf('/Root/civhomebrew/apps/')!==0||!path.endsWith('/manifest.json'))throw Error('Read-only benchmark path rejected');return boot.native.files.read('save:/'+path.slice(6),65536,true);}}};

 app=await g.CivHomebrewLauncher.mount(api);geometry=await g.CivNanoVGGeometry.create();await delay(500);
 function capture(label){
  var root=document.getElementById('civhomebrew'),tiles=root.querySelectorAll('[role="option"]'),rows=[];
  for(var i=0;i<tiles.length;i++){var n=tiles[i],style=getComputedStyle(n),bubble=n.children[0];rows.push({id:n.getAttribute('data-id'),selected:n.getAttribute('data-selected'),inlineBorder:n.style.borderColor,computedBorder:style.borderTopColor,inlineBubble:bubble.style.display,computedBubble:getComputedStyle(bubble).display,rect:[n.getBoundingClientRect().left,n.getBoundingClientRect().top]});}
  var scene=CivNanoVGScene.snapshot(root,{width:1920,height:1080,metrics:geometry.metrics,measure:geometry.measure,textCache:new WeakMap()});
  result.stages.push({label:label,counter:document.getElementById('menu-counter').textContent,key:root.__civNanoVGSceneKey(),rows:rows,commands:scene.commands.filter(function(c){return c.kind==='border'||c.kind==='text'||c.kind==='triangle';})});
 }
 capture('initial-settled');press('nav-right');capture('right-immediate');await delay(100);capture('right-settled');press('nav-left');capture('left-immediate');await delay(100);capture('left-settled');press('nav-right');capture('right-again-immediate');await delay(100);capture('right-again-settled');result.complete=true;
 }catch(e){result.error=String(e.stack||e);}finally{if(app)await app.close();if(geometry)geometry.close();g.CivNanoVGPrototype.defer=false;}
 if(g.__civNanoVGBenchmark)g.__civNanoVGBenchmark.selectionProbe=result;
 var text=JSON.stringify(result),encoded=PayloadCore.base64(PayloadCore.encode(text)),count=Math.ceil(encoded.length/900);
 for(var i=0;i<count;i++)await log('CIV_NANOVG_SELECTION '+i+'/'+count+' '+encoded.slice(i*900,(i+1)*900));await log('CIV_NANOVG_SELECTION_COMPLETE');
})();