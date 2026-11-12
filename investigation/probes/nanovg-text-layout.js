/* Finite deferred real-core style/layout diagnosis; no new native owner. */
(function(g){
 var t=g.__civNanoVGTerminalTrial;if(!t||!t.active||!t.complete)throw Error('Wait for native terminal checks to finish');
 var previous=t.snapshot;t.layoutProbe={complete:false,stages:[],error:null};t.snapshot=function(){var r=previous();r.layoutProbe=t.layoutProbe;return r;};
 function delay(ms){return new Promise(r=>setTimeout(r,ms));}
 function press(name){var e=document.createEvent('CustomEvent');e.initCustomEvent('engine-input',true,true,{name:name,status:0});g.dispatchEvent(e);}
 function capture(label){
  var ui=t.session.active.ui;ui.update();var root=document.getElementById('civhomebrew'),nodes=Array.from(root.querySelectorAll('*')),out=[];
  for(var n of nodes){if(n.children.length||!String(n.textContent||'').trim())continue;var s=getComputedStyle(n),r=n.getBoundingClientRect();if(!r.width||!r.height)continue;
   var names=['display','fontFamily','fontSize','lineHeight','textAlign','justifyContent','alignItems','whiteSpace','textOverflow','boxSizing','paddingLeft','paddingRight','paddingTop','paddingBottom','borderLeftWidth','borderRightWidth','width','maxWidth','letterSpacing'];var inline={},computed={};for(var k of names){inline[k]=n.style[k];computed[k]=s[k];}
   out.push({id:n.id,parent:n.parentNode.id,tag:n.tagName,text:String(n.textContent).slice(0,1200),rect:[r.left,r.top,r.right,r.bottom],inline:inline,computed:computed});
  }
  t.layoutProbe.stages.push({label:label,rootFont:getComputedStyle(document.documentElement).fontSize,nodes:out,text:ui.scene.commands.filter(c=>c.kind==='text')});
 }
 setTimeout(async function(){try{
  await g.__civhomebrewCore.showLauncher();await delay(450);capture('launcher');
  g.__civswitchApp.openOptions();await delay(450);capture('options');
  press('cancel');await delay(350);press('menu');await delay(450);capture('app-menu');
  t.layoutProbe.complete=true;
 }catch(e){t.layoutProbe.error=String(e.stack||e);}},300);
})(window);
