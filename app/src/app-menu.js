/* Selected-app drawer and dialogs; installed files remain resident-owned. */
(function(g){
 "use strict";
 function create(o){
  var entry=null,selected=0,dialog="",choice=0,removing=false,closed=false,ticket=0,rows=[],actions=[];
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
  ["Information","Delete"].forEach(function(text,i){
   var row=node("button",list,{width:"100%",height:"70px",display:"flex",alignItems:"center",padding:"0 16px",border:"3px solid transparent",boxSizing:"border-box",fontFamily:textFont,fontWeight:"400",fontSize:"23px",textAlign:"left",color:i?"#ff6b6b":"#f5f5f5",backgroundColor:"transparent",outline:"none"});label(row,text);
   row.type="button";row.tabIndex=-1;row.setAttribute("data-app-action",i?"delete":"information");row.addEventListener("click",function(){if(!entry||dialog||removing)return;selected=i;paint();activate();});rows.push(row);
  });
  var modal=node("div",o.stage,{position:"absolute",left:"0",right:"0",top:"0",bottom:"0",display:"none",alignItems:"center",justifyContent:"center",backgroundColor:"rgba(0,0,0,0.72)",zIndex:"6"});modal.id="app-dialog";
  modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","app-dialog-title");
  var panel=node("div",modal,{width:"520px",padding:"32px",boxSizing:"border-box",border:"1px solid #3b4146",borderRadius:"8px",backgroundColor:"#1b1e21",textAlign:"center"});panel.id="app-dialog-panel";
  var heading=node("div",panel,{fontSize:"26px",lineHeight:"34px",overflowWrap:"break-word"});heading.id="app-dialog-title";
  var body=node("div",panel,{marginTop:"24px",maxHeight:"360px",overflowY:"auto",fontSize:"20px",lineHeight:"28px",whiteSpace:"pre-wrap",overflowWrap:"break-word",color:"#c5cdd0",textAlign:"left"});body.id="app-dialog-body";
  var bar=node("div",panel,{display:"flex",marginTop:"26px"});
  function paint(){rows.forEach(function(r,i){r.style.borderColor=i===selected?(i?"#ff6b6b":"#80e0e6"):"transparent";r.style.backgroundColor=i===selected?"#333":"transparent";r.setAttribute("data-selected",String(i===selected));});description.textContent=entry?entry.name+"\n\n"+(selected?"Delete this app and its installed files from CivHomebrew.":"View the app title, developer, version and installation details."):"";}
  function paintActions(){actions.forEach(function(b,i){b.style.borderColor=i===choice?(dialog==="delete"&&i===1?"#ff6b6b":"#80e0e6"):"#3b4146";b.style.backgroundColor=i===choice?"#333":"transparent";b.disabled=removing;b.setAttribute("data-selected",String(i===choice));});}
  function showDialog(kind,text,labels){
   ticket++;dialog=kind;choice=0;modal.style.display="flex";modal.setAttribute("role",kind==="delete"?"alertdialog":"dialog");heading.textContent=kind==="information"?"Information":kind==="delete"?"Delete "+entry.name+"?":"Unable to complete action";body.textContent=text;body.style.textAlign=kind==="delete"?"center":"left";body.scrollTop=0;
   while(bar.firstChild)bar.removeChild(bar.firstChild);actions=[];
   labels.forEach(function(text,i){var b=node("button",bar,{display:"flex",alignItems:"center",justifyContent:"center",flex:"1",minWidth:"0",marginLeft:i?"12px":"0",padding:"12px 16px",border:"2px solid #3b4146",borderRadius:"4px",fontFamily:textFont,fontWeight:"400",fontSize:"22px",color:kind==="delete"&&i===1?"#ff6b6b":"#f5f5f5",backgroundColor:"transparent",outline:"none"});label(b,text);b.type="button";b.tabIndex=-1;b.addEventListener("click",function(){if(removing)return;choice=i;confirm();});actions.push(b);});paintActions();o.focus();o.suppress();
  }
  function hideDialog(){ticket++;dialog="";modal.style.display="none";o.focus();o.suppress();}
  function dismiss(){if(removing)return;ticket++;entry=null;dialog="";overlay.style.display="none";modal.style.display="none";o.focus();o.suppress();}
  function back(){if(removing)return;if(dialog)hideDialog();else dismiss();}
  async function activate(){
   if(!entry||dialog||removing||closed)return;
   if(selected){showDialog("delete","Its installed files will be removed. This cannot be undone.",["Cancel","Delete"]);return;}
   showDialog("information","Loading app details…",["Close"]);var current=ticket,target=entry;
   try{
    var info=await o.describe(target.id,target.checksum);if(closed||current!==ticket)return;
    var m=info.metadata||{},size=info.bytes<1048576?(info.bytes/1024).toFixed(1)+" KiB":(info.bytes/1048576).toFixed(2)+" MiB";
    body.textContent="Title: "+info.name+"\nDeveloper: "+(m.author||"Not provided")+"\nVersion: "+(m.release||"Not provided")+"\nApp ID: "+info.id+"\nInstalled size: "+size+"\nScripts: "+info.scripts+(m.description?"\n\n"+m.description:"");
   }catch(e){if(!closed&&current===ticket)body.textContent="Unable to load app details.\n\n"+e.message;}
  }
  async function confirm(){
   if(removing||closed||!dialog)return;if(dialog!=="delete"||choice===0){hideDialog();return;}
   removing=true;paintActions();heading.textContent="Deleting app…";var target=entry;
   try{await o.remove(target.id,target.checksum);if(!closed){removing=false;dismiss();}}
   catch(e){if(!closed){removing=false;showDialog("error","Deletion failed.\n\n"+e.message,["Close"]);}}
  }
  return {open:function(value){if(closed||entry||!value)return;entry={id:value.id,name:value.name,checksum:value.checksum};selected=0;overlay.style.display="block";paint();o.focus();},
   active:function(){return !!entry;},pending:function(){return removing;},dismiss:dismiss,
   refresh:function(entries){if(entry&&!removing&&!entries.some(function(e){return e.id===entry.id&&e.checksum===entry.checksum;}))dismiss();},
   action:function(name,phase){if(!entry)return false;if(removing)return true;if(name==="cancel"&&phase===0)back();else if(name==="accept"&&phase===0){if(dialog)confirm();else activate();}else if(dialog){if(name==="nav-left"||name==="nav-right"){choice=Math.max(0,Math.min(actions.length-1,choice+(name==="nav-left"?-1:1)));paintActions();}else if(name==="nav-up"||name==="nav-down")body.scrollTop+=(name==="nav-up"?-1:1)*o.layout.px(84);}else if(name==="nav-up"||name==="nav-down"){selected=name==="nav-up"?0:1;paint();}return true;},
   close:function(){closed=true;ticket++;entry=null;[overlay,modal].forEach(function(n){if(n.parentNode)n.parentNode.removeChild(n);});}};
 }
 g.CivAppMenu={create:create,buttonIcon:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAE10lEQVR4nO2dLXLzMBCGc4P2BvUJOr1AZ3KB3qAgvMS4KLgkuMi0LLTMsLCs1Kz0Q4v7eWNlxnESW2tL3tf2auYhmcRa7RuvtLZ+VivwQkS3JeuSrSN3FCV/Vyhq3zv+jq9xq92eyZXSaUlJWrLvcHpfCndtriPRbi9kKR3zULKLJICPQFz3g7YfVIsLRamSCG3ipIsKbS4kZQDO7yKbdUibkBDzFoaq0LQDcOxQuA3TDmVUxeN/AM4MBbcl1faruFAVnnIAB8aC25Zo+9mrlIZuZnZXtN0tG21/Xy1U9RUZgKPGhtuM1bc4Mb4BnKPFN4woVGXZSwhRXbAPdLN9EwNIFBMDSBQTA0gUEwNIFKpGUyaGTJQ4oy+yoW1f4gyJaZlJXyiy0GJsABo1dTahxOAHhdZvDId9mIQQJB9iSHkJL15eXtScxXX72jmwrnyoGOnQxvo2lPn4+BhdDK5TYmOAOvu9T6FAQ9z7+3vvxt7c3Px9fX2NJgbXxXX62sdtCVBvv6EwBXrt2qfRv7+/0cXgOhT/LDupGEnIxkvDwtPTU3RBuA6JTRHCaSIRJAvtAEnHyby9vUUTg68tsSXSgMMvNwl9d9R5fHwUOeLz8zO4DXxNiQ1scyx/kM9dQhEzco7bkv6EvxuyP9Gu/wLtdwlVI6uYBhw6Rsk/NNDI5oCkE2dGGvFdH3FRgLzDB40YjtSHNbiel9CIE5+fn59FDnp/f+9dF/9WUhfbNpYf2OfXxHgY0YjR8gDUPKjB+YssUph/G9tZysmfhPNEkZTWacRMGgGSP19OwxZFzD18iNHhgiR/EpK6IKOMrtoImTSCJX++pHVB9toGcby/u7sTxfufn5+z6/Bnkn6J61ToxC+xV+8/moRIGkGTPx+KoxjRs3MJQ3KGMXObSNyyIGsAQ07o41jw5M+XNQuyBTDkhD75wwSSPx+2kIIw0s556GAAhO3gWSUxkSaNPigmfz7k0IIwr6+vwcTga2m3x0eQAsCQVqRJ4yVAkr8uihWAEZ1Ik8YmQMlfJ5MQhJEmjXWAkr/5CMJIcw0GMPkzQbTtnqUgFrKAWFqnXmgb0cXShr05gCFXWWJiCCvIUh+d2MNFHDCf9i798bu9oMJhba9wAdpco5p4TSBDX5vk4ArZNCBtMZiTaUA2UU5fkJOJcjaVFGkqqWY/YpOtDxSrZiFbjgC3HMEW7PQQPRCXd54jW9J2AGJJmxPEFn0KBg6BaF30acuia6gvi3aiZLEq1164r13/BbJWMZwgtrVGDfWtNWLdJUgxHCRp7L47Yt0ltj3TgLujJoptYNboT9Q2MHOC2BZ/F/4sAertv9s12SaYZwSoc9ihYmTbxIYUJB8khhPENlIOQ5iNlJ0ottX4cDZBxKiJkgE0aqr45xwCQey4in7EO8GN7EAXKfEOdKmJYkce+Yth51CBYCe1AWFnGQJhp30CoS/GsZANiXEOJz4WsuO7MQvZAfd4haoHkjmA02LBbUu0/SwuVL1PmdPdwm0Z9j5Du1DVt4w+bzgC3AbcvkJaqApjGYBjpbDNibb/opUJCTNvIZqFqlDGfUwB4PwjhbNpPqGpT6Eq298piVO4ujGybLTiQhr/S/eRBCrctdNFhaRQxYU23txg68gdbWIVte8df7eeQij6D64GdSOJCd40AAAAAElFTkSuQmCC"};
})(typeof window!=="undefined"?window:globalThis);
