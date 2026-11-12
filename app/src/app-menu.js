/* Selected-app drawer and dialogs; installed files remain resident-owned. */
(function(g){
 "use strict";
 function create(o){
  var entry=null,selected=0,dialog="",choice=0,removing=false,closed=false,ticket=0,selectionTicket=0,rows=[],actions=[],items=[],detailsTask=null,operation=null,offer=null;
  var textFont="BodyFont, BodyFont-JP, BodyFont-KR, BodyFont-SC, BodyFont-TC, Arial, sans-serif";
  function node(tag,parent,style,text){return o.layout.node(tag,parent,style,text);}
  // Gameface buttons need a text child with the registered body font. Do not
  // rely on native button defaults or an inherited font keyword for labels.
  function label(parent,text){return node("span",parent,{display:"block",fontFamily:textFont,fontWeight:"400",lineHeight:"28px"},text);}
  var overlay=node("div",o.stage,{position:"absolute",left:"0",right:"0",top:"0",bottom:"0",display:"none",backgroundColor:"rgba(0,0,0,0.64)",zIndex:"5"});overlay.id="app-menu-overlay";
  overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-labelledby","app-menu-title");
  node("div",overlay,{position:"absolute",left:"30px",right:"15px",top:"0",height:"87px",backgroundColor:"rgba(0,0,0,0.85)",borderBottom:"1px solid #aaa"});
  node("div",overlay,{position:"absolute",right:"15px",top:"87px",width:"420px",bottom:"74px",backgroundColor:"rgba(10,10,10,0.96)"});
  var title=node("div",overlay,{position:"absolute",right:"30px",top:"35px",width:"396px",fontSize:"32px",textAlign:"right",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},"Menu");title.id="app-menu-title";
  var list=node("div",overlay,{position:"absolute",right:"28px",top:"166px",width:"396px",bottom:"75px",overflowY:"auto",paddingLeft:"10px"});list.id="app-menu-list";
  var description=node("div",overlay,{position:"absolute",right:"460px",top:"100px",width:"400px",padding:"16px 28px",fontSize:"22px",lineHeight:"31px",whiteSpace:"pre-wrap",overflowWrap:"break-word",backgroundColor:"rgba(0,0,0,0.8)"});description.id="app-menu-description";
  var foot=node("div",overlay,{position:"absolute",right:"15px",width:"420px",top:"646px",bottom:"0",borderTop:"1px solid #aaa",backgroundColor:"#000",display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:"30px",fontSize:"23px"});
  function footer(letter,text,fn){var b=node("button",foot,{display:"flex",alignItems:"center",backgroundColor:"transparent",color:"#fff",border:"0",fontFamily:textFont,fontWeight:"400",fontSize:"23px",marginLeft:"28px"});b.type="button";b.tabIndex=-1;var i=node("img",b,{width:"25px",height:"25px",marginRight:"10px"});i.src=((g.__payloadMenuConfig||{}).buttonIcons||{})[letter]||"assets/button-"+letter.toLowerCase()+".png";i.alt=letter;label(b,text);b.addEventListener("click",fn);}
  footer("B","Back",back);footer("A","OK",activate);
  function drawRows(updates){
   var previous=items[selected]&&items[selected].id;while(list.firstChild)list.removeChild(list.firstChild);rows=[];
   items=[{id:"information",text:"Information"}];if(updates)items.push({id:"updates",text:o.updates.available&&o.updates.available(entry)?"Update available":"Check app updates"});items.push({id:"delete",text:"Delete"});
   items.forEach(function(item,i){var row=node("button",list,{width:"100%",height:"70px",display:"flex",alignItems:"center",padding:"0 16px",border:"3px solid transparent",boxSizing:"border-box",fontFamily:textFont,fontWeight:"400",fontSize:"23px",textAlign:"left",color:item.id==="delete"?"#ff6b6b":"#f5f5f5",backgroundColor:"transparent",outline:"none"});label(row,item.text);
    row.type="button";row.tabIndex=-1;row.setAttribute("data-app-action",item.id);row.addEventListener("click",function(){if(!entry||dialog||removing)return;selected=i;paint();activate();});rows.push(row);
   });selected=Math.max(0,items.findIndex(function(item){return item.id===previous;}));paint();
  }
  var modal=node("div",o.stage,{position:"absolute",left:"0",right:"0",top:"0",bottom:"0",display:"none",alignItems:"center",justifyContent:"center",backgroundColor:"rgba(0,0,0,0.72)",zIndex:"6"});modal.id="app-dialog";
  modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","app-dialog-title");
  var panel=node("div",modal,{width:"520px",padding:"32px",boxSizing:"border-box",border:"1px solid #3b4146",borderRadius:"8px",backgroundColor:"#1b1e21",textAlign:"center"});panel.id="app-dialog-panel";
  var heading=node("div",panel,{fontSize:"26px",lineHeight:"34px",overflowWrap:"break-word"});heading.id="app-dialog-title";
  var body=node("div",panel,{marginTop:"24px",maxHeight:"360px",overflowY:"auto",fontSize:"20px",lineHeight:"28px",whiteSpace:"pre-wrap",overflowWrap:"break-word",color:"#c5cdd0",textAlign:"left"});body.id="app-dialog-body";
  var bar=node("div",panel,{display:"flex",marginTop:"26px"});
  function paint(){rows.forEach(function(r,i){r.style.borderColor=i===selected?(items[i].id==="delete"?"#ff6b6b":"#80e0e6"):"transparent";r.style.backgroundColor=i===selected?"#333":"transparent";r.setAttribute("data-selected",String(i===selected));});var id=items[selected]&&items[selected].id;description.textContent=entry?entry.name+"\n\n"+(id==="delete"?"Delete this app and its installed files from CivHomebrew.":id==="updates"?"Check GitHub for a newer release of this app.":"View the app title, developer, version and installation details."):"";}
  function paintActions(){actions.forEach(function(b,i){b.style.borderColor=i===choice?(dialog==="delete"&&i===1?"#ff6b6b":"#80e0e6"):"#3b4146";b.style.backgroundColor=i===choice?"#333":"transparent";b.disabled=removing;b.setAttribute("data-selected",String(i===choice));});}
  function showDialog(kind,text,labels,title){
   if(o.layout.changed)o.layout.changed();
   ticket++;dialog=kind;choice=0;modal.style.display="flex";modal.setAttribute("role",kind==="delete"||kind==="update"?"alertdialog":"dialog");heading.textContent=title||(kind==="information"?"Information":kind==="delete"?"Delete "+entry.name+"?":"Unable to complete action");body.textContent=text;body.style.textAlign=kind==="information"||kind==="error"?"left":"center";body.scrollTop=0;
   while(bar.firstChild)bar.removeChild(bar.firstChild);actions=[];
   labels.forEach(function(text,i){var b=node("button",bar,{display:"flex",alignItems:"center",justifyContent:"center",flex:"1",minWidth:"0",marginLeft:i?"12px":"0",padding:"12px 16px",border:"2px solid #3b4146",borderRadius:"4px",fontFamily:textFont,fontWeight:"400",fontSize:"22px",color:kind==="delete"&&i===1?"#ff6b6b":"#f5f5f5",backgroundColor:"transparent",outline:"none"});label(b,text);b.type="button";b.tabIndex=-1;b.addEventListener("click",function(){if(removing)return;choice=i;confirm();});actions.push(b);});paintActions();o.focus();o.suppress();
  }
  function stopOperation(){if(operation)operation.cancelled=true;operation=null;offer=null;}
  function hideDialog(){stopOperation();ticket++;dialog="";modal.style.display="none";o.focus();o.suppress();}
  function dismiss(){if(removing)return;stopOperation();ticket++;selectionTicket++;entry=null;detailsTask=null;dialog="";overlay.style.display="none";modal.style.display="none";o.focus();o.suppress();}
  function back(){if(removing)return;if(dialog)hideDialog();else dismiss();}
  async function activate(){
   if(!entry||dialog||removing||closed)return;
   if(items[selected].id==="delete"){showDialog("delete","Its installed files will be removed. This cannot be undone.",["Cancel","Delete"]);return;}
   if(items[selected].id==="updates"){checkUpdates();return;}
   showDialog("information","Loading app details…",["Close"]);var current=ticket,target=entry;
   try{
    var info=await (detailsTask||o.describe(target.id,target.checksum));if(closed||current!==ticket)return;
    var m=info.metadata||{},size=info.bytes<1048576?(info.bytes/1024).toFixed(1)+" KiB":(info.bytes/1048576).toFixed(2)+" MiB";
    body.textContent="Title: "+info.name+"\nDeveloper: "+(m.author||"Not provided")+"\nVersion: "+(g.CivVersions.format(m.release)||m.release||"Not provided")+"\nApp ID: "+info.id+"\nInstalled size: "+size+"\nScripts: "+info.scripts+(m.description?"\n\n"+m.description:"");
   }catch(e){if(!closed&&current===ticket)body.textContent="Unable to load app details.\n\n"+e.message;}
  }
  async function checkUpdates(){
   var cancel={cancelled:false};operation=cancel;showDialog("checking",entry.name,["Cancel"],"Checking for updates…");var current=ticket;
   try{var result=await o.updates.check(entry,cancel);if(closed||current!==ticket)return;operation=null;drawRows(true);
    if(result.kind==="update"){offer=result;showDialog("update","Installed: "+g.CivVersions.format(result.installed)+"\nAvailable: "+g.CivVersions.format(result.release.version),["Cancel","Update"],"Update "+entry.name+"?");}
    else showDialog("latest","Latest version installed",["Close"],"App updates");
   }catch(e){if(!closed&&current===ticket&&!e.cancelled){operation=null;showDialog("update-error",e.message,["Close"],"Unable to check updates");}}
  }
  async function installUpdate(){
   var selectedOffer=offer,cancel={cancelled:false};operation=cancel;showDialog("downloading","Downloading app package…",["Cancel"],"Updating "+entry.name+"…");var current=ticket;
   try{await o.updates.install(selectedOffer,{cancel:cancel,progress:function(done,total){if(!closed&&current===ticket)body.textContent=total?"Downloading… "+Math.floor(done*100/total)+"%":(done/1024).toFixed(1)+" KiB downloaded";},installing:function(){if(closed||cancel.cancelled)throw g.CivHttp.cancelled();removing=true;paintActions();modal.style.display="none";}});if(!closed){removing=false;operation=null;dismiss();}}
   catch(e){if(!closed&&current===ticket){removing=false;operation=null;if(!e.cancelled)showDialog("update-error",e.message,["Close"],"Update failed");}}
  }
  async function confirm(){
   if(removing||closed||!dialog)return;if(dialog==="update"&&choice===1){installUpdate();return;}if(dialog!=="delete"||choice===0){hideDialog();return;}
   removing=true;paintActions();heading.textContent="Deleting app…";var target=entry;
   try{await o.remove(target.id,target.checksum);if(!closed){removing=false;dismiss();}}
   catch(e){if(!closed){removing=false;showDialog("error","Deletion failed.\n\n"+e.message,["Close"]);}}
  }
  return {open:function(value){if(closed||entry||!value)return;entry={id:value.id,name:value.name,checksum:value.checksum};selected=0;items=[];overlay.style.display="block";drawRows(false);o.focus();var current=++selectionTicket,target=entry;
    detailsTask=Promise.resolve().then(function(){return o.describe(target.id,target.checksum);});detailsTask.then(function(info){if(!closed&&entry&&current===selectionTicket&&o.updates&&o.updates.supports(info.metadata))drawRows(true);},function(){});},
   active:function(){return !!entry;},pending:function(){return removing;},dismiss:dismiss,
   refresh:function(entries){if(entry&&!removing&&!entries.some(function(e){return e.id===entry.id&&e.checksum===entry.checksum;}))dismiss();},
   action:function(name,phase){if(!entry)return false;if(removing)return true;if(name==="cancel"&&phase===0)back();else if(name==="accept"&&phase===0){if(dialog)confirm();else activate();}else if(dialog){if(name==="nav-left"||name==="nav-right"){choice=Math.max(0,Math.min(actions.length-1,choice+(name==="nav-left"?-1:1)));paintActions();}else if(name==="nav-up"||name==="nav-down")body.scrollTop+=(name==="nav-up"?-1:1)*o.layout.px(84);}else if(name==="nav-up"||name==="nav-down"){selected=Math.max(0,Math.min(items.length-1,selected+(name==="nav-up"?-1:1)));paint();}return true;},
   close:function(){closed=true;stopOperation();ticket++;selectionTicket++;entry=null;[overlay,modal].forEach(function(n){if(n.parentNode)n.parentNode.removeChild(n);});}};
 }
 g.CivAppMenu={create:create,buttonIcon:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAE10lEQVR4nO2dLXLzMBCGc4P2BvUJOr1AZ3KB3qAgvMS4KLgkuMi0LLTMsLCs1Kz0Q4v7eWNlxnESW2tL3tf2auYhmcRa7RuvtLZ+VivwQkS3JeuSrSN3FCV/Vyhq3zv+jq9xq92eyZXSaUlJWrLvcHpfCndtriPRbi9kKR3zULKLJICPQFz3g7YfVIsLRamSCG3ipIsKbS4kZQDO7yKbdUibkBDzFoaq0LQDcOxQuA3TDmVUxeN/AM4MBbcl1faruFAVnnIAB8aC25Zo+9mrlIZuZnZXtN0tG21/Xy1U9RUZgKPGhtuM1bc4Mb4BnKPFN4woVGXZSwhRXbAPdLN9EwNIFBMDSBQTA0gUEwNIFKpGUyaGTJQ4oy+yoW1f4gyJaZlJXyiy0GJsABo1dTahxOAHhdZvDId9mIQQJB9iSHkJL15eXtScxXX72jmwrnyoGOnQxvo2lPn4+BhdDK5TYmOAOvu9T6FAQ9z7+3vvxt7c3Px9fX2NJgbXxXX62sdtCVBvv6EwBXrt2qfRv7+/0cXgOhT/LDupGEnIxkvDwtPTU3RBuA6JTRHCaSIRJAvtAEnHyby9vUUTg68tsSXSgMMvNwl9d9R5fHwUOeLz8zO4DXxNiQ1scyx/kM9dQhEzco7bkv6EvxuyP9Gu/wLtdwlVI6uYBhw6Rsk/NNDI5oCkE2dGGvFdH3FRgLzDB40YjtSHNbiel9CIE5+fn59FDnp/f+9dF/9WUhfbNpYf2OfXxHgY0YjR8gDUPKjB+YssUph/G9tZysmfhPNEkZTWacRMGgGSP19OwxZFzD18iNHhgiR/EpK6IKOMrtoImTSCJX++pHVB9toGcby/u7sTxfufn5+z6/Bnkn6J61ToxC+xV+8/moRIGkGTPx+KoxjRs3MJQ3KGMXObSNyyIGsAQ07o41jw5M+XNQuyBTDkhD75wwSSPx+2kIIw0s556GAAhO3gWSUxkSaNPigmfz7k0IIwr6+vwcTga2m3x0eQAsCQVqRJ4yVAkr8uihWAEZ1Ik8YmQMlfJ5MQhJEmjXWAkr/5CMJIcw0GMPkzQbTtnqUgFrKAWFqnXmgb0cXShr05gCFXWWJiCCvIUh+d2MNFHDCf9i798bu9oMJhba9wAdpco5p4TSBDX5vk4ArZNCBtMZiTaUA2UU5fkJOJcjaVFGkqqWY/YpOtDxSrZiFbjgC3HMEW7PQQPRCXd54jW9J2AGJJmxPEFn0KBg6BaF30acuia6gvi3aiZLEq1164r13/BbJWMZwgtrVGDfWtNWLdJUgxHCRp7L47Yt0ltj3TgLujJoptYNboT9Q2MHOC2BZ/F/4sAertv9s12SaYZwSoc9ihYmTbxIYUJB8khhPENlIOQ5iNlJ0ottX4cDZBxKiJkgE0aqr45xwCQey4in7EO8GN7EAXKfEOdKmJYkce+Yth51CBYCe1AWFnGQJhp30CoS/GsZANiXEOJz4WsuO7MQvZAfd4haoHkjmA02LBbUu0/SwuVL1PmdPdwm0Z9j5Du1DVt4w+bzgC3AbcvkJaqApjGYBjpbDNibb/opUJCTNvIZqFqlDGfUwB4PwjhbNpPqGpT6Eq298piVO4ujGybLTiQhr/S/eRBCrctdNFhaRQxYU23txg68gdbWIVte8df7eeQij6D64GdSOJCd40AAAAAElFTkSuQmCC"};
})(typeof window!=="undefined"?window:globalThis);
