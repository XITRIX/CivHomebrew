/* Options update dialogs and a restart blocker; no storage or transport ownership. */
(function(g){
 "use strict";
 function create(o){
  var dialog="",closed=false,choice=0,buttons=[],cancel=null,ticket=0,offer=null,locked=false,font="BodyFont, BodyFont-JP, BodyFont-KR, BodyFont-SC, BodyFont-TC, Arial, sans-serif";
  function node(tag,parent,style,text){return o.layout.node(tag,parent,style,text);}
  var modal=node("div",o.stage,{position:"absolute",left:"0",right:"0",top:"0",bottom:"0",display:"none",alignItems:"center",justifyContent:"center",backgroundColor:"rgba(0,0,0,0.92)",zIndex:"8"});modal.id="system-update-dialog";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","system-update-title");
  var panel=node("div",modal,{width:"520px",padding:"32px",boxSizing:"border-box",border:"1px solid #3b4146",borderRadius:"8px",backgroundColor:"#1b1e21",textAlign:"center"});
  var title=node("div",panel,{fontSize:"26px",lineHeight:"34px"});title.id="system-update-title";
  var body=node("div",panel,{marginTop:"24px",maxHeight:"360px",overflowY:"auto",fontSize:"20px",lineHeight:"28px",whiteSpace:"pre-wrap",overflowWrap:"break-word",color:"#c5cdd0"});body.id="system-update-body";
  var bar=node("div",panel,{display:"flex",marginTop:"26px"});
  function paint(){buttons.forEach(function(b,i){b.style.borderColor=i===choice?"#80e0e6":"#3b4146";b.style.backgroundColor=i===choice?"#333":"transparent";b.setAttribute("data-selected",String(i===choice));});}
  function show(kind,heading,text,labels){
   if(o.layout.changed)o.layout.changed();
   dialog=kind;title.textContent=heading;body.textContent=text;modal.style.display="flex";choice=0;while(bar.firstChild)bar.removeChild(bar.firstChild);buttons=[];bar.style.display=labels.length?"flex":"none";
   labels.forEach(function(text,i){var b=node("button",bar,{display:"flex",alignItems:"center",justifyContent:"center",flex:"1",minWidth:"0",marginLeft:i?"12px":"0",padding:"12px 16px",border:"2px solid #3b4146",borderRadius:"4px",fontFamily:font,fontWeight:"400",fontSize:"22px",color:"#f5f5f5",outline:"none"});node("span",b,{display:"block",fontFamily:font,fontWeight:"400",lineHeight:"28px"},text);b.type="button";b.tabIndex=-1;b.addEventListener("click",function(){choice=i;accept();});buttons.push(b);});paint();o.focus();o.suppress();
  }
  function hide(){if(locked||dialog==="restart")return;if(cancel)cancel.cancelled=true;cancel=null;offer=null;ticket++;dialog="";modal.style.display="none";o.focus();o.suppress();}
  function restart(error){locked=true;ticket++;show("restart","Restart required",(error?error+"\n\n":"")+"Close Civilization VII completely, start it again, then open Load Game to finish updating CivHomebrew.",[]);}
  async function check(){
   if(closed||locked||dialog)return;cancel={cancelled:false};var token=cancel,id=++ticket;show("checking","Checking for updates…","CivHomebrew",["Cancel"]);
   try{var result=await o.updates.check(token);if(closed||id!==ticket)return;cancel=null;o.changed();
    if(result.kind==="restart")restart();else if(result.kind==="update"){offer=result;var details=result.release.assets.map(function(a){return (a.component==="core"?"Core":"Launcher")+"\nInstalled: "+g.CivVersions.format(result.snapshot[a.component].release)+"\nAvailable: "+g.CivVersions.format(a.release);}).join("\n\n");show("offer","Update CivHomebrew?",details,["Cancel","Update"]);}else show("latest","CivHomebrew updates","Latest version installed",["Close"]);
   }catch(e){if(!closed&&id===ticket&&!e.cancelled){cancel=null;show("error","Unable to check updates",e.message,["Close"]);}}
  }
  async function install(){
   var selected=offer,token={cancelled:false},id=++ticket;cancel=token;show("downloading","Updating CivHomebrew…","Downloading update…",["Cancel"]);
   try{var result=await o.updates.install(selected,{cancel:token,progress:function(done,total){if(!closed&&id===ticket)body.textContent="Downloading… "+Math.floor(done*100/total)+"%";},installing:function(){locked=true;show("installing","Updating CivHomebrew…","Installing update…",[]);}});
    if(!closed&&id===ticket){cancel=null;if(result.kind==="restart")restart();else show("installing","Updating CivHomebrew…","Reloading launcher…",[]);}
   }catch(e){if(!closed&&id===ticket){cancel=null;if(e.restartRequired)restart("The core was staged, but another component could not be installed. "+e.message);else{locked=false;if(!e.cancelled)show("error","Update failed",e.message,["Close"]);}}}
  }
  function accept(){if(locked)return;if(dialog==="offer"&&choice===1)install();else hide();}
  return {check:check,restart:restart,active:function(){return !!dialog;},action:function(name,phase){if(!dialog)return false;if(locked)return true;if(name==="cancel"&&phase===0)hide();else if(name==="accept"&&phase===0)accept();else if((name==="nav-left"||name==="nav-right")&&phase===0){choice=Math.max(0,Math.min(buttons.length-1,choice+(name==="nav-left"?-1:1)));paint();}return true;},close:function(){closed=true;if(cancel)cancel.cancelled=true;ticket++;if(modal.parentNode)modal.parentNode.removeChild(modal);}};
 }
 g.CivSystemUpdateUI={create:create};
})(typeof window!=="undefined"?window:globalThis);
