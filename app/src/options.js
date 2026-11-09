/* Screenshot-inspired options drawer; no filesystem or socket ownership. */
(function(g){
 "use strict";
 function create(o){
  var page="",selected=0,draft=null,saving=false,rows=[],closed=false;
  function node(tag,parent,style,text){if(o.layout)return o.layout.node(tag,parent,style,text);var e=document.createElement(tag);Object.assign(e.style,style||{});if(text!==undefined)e.textContent=text;if(parent)parent.appendChild(e);return e;}
  var overlay=node("div",o.stage,{position:"absolute",left:"0",right:"0",top:"0",bottom:"0",display:"none",backgroundColor:"rgba(0,0,0,0.64)",zIndex:"5"});overlay.id="options-overlay";
  node("div",overlay,{position:"absolute",left:"15px",right:"30px",top:"0",height:"87px",backgroundColor:"rgba(0,0,0,0.85)",borderBottom:"1px solid #aaa"});
  node("div",overlay,{position:"absolute",left:"15px",top:"87px",width:"420px",bottom:"74px",backgroundColor:"rgba(10,10,10,0.96)"});
  var title=node("div",overlay,{position:"absolute",left:"30px",top:"35px",fontSize:"32px"});title.id="options-title";
  var list=node("div",overlay,{position:"absolute",left:"28px",top:"166px",width:"396px",bottom:"75px",overflowY:"auto",paddingRight:"10px"});list.id="options-list";
  var description=node("div",overlay,{position:"absolute",left:"460px",top:"100px",width:"400px",padding:"16px 28px",fontSize:"22px",lineHeight:"31px",whiteSpace:"pre-wrap",backgroundColor:"rgba(0,0,0,0.8)"});description.id="options-description";
  var foot=node("div",overlay,{position:"absolute",left:"15px",width:"420px",top:"646px",bottom:"0",borderTop:"1px solid #aaa",backgroundColor:"#000",display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:"30px",fontSize:"23px"});
  function footer(letter,text,fn){var b=node("button",foot,{display:"flex",alignItems:"center",backgroundColor:"transparent",color:"#fff",border:"0",fontSize:"23px",marginLeft:"28px"});var i=node("img",b,{width:"25px",height:"25px",marginRight:"10px"});i.src=((g.__payloadMenuConfig||{}).buttonIcons||{})[letter]||"assets/button-"+letter.toLowerCase()+".png";i.alt=letter;node("span",b,{},text);b.addEventListener("click",fn);}
  footer("B","Back",back);footer("A","OK",activate);
  var fields=[
   ["enabled","Enable","Run FTP while the launcher is open. It stops when opening the terminal or launching an app."],
   ["port","Port","TCP control port (1–65535). Default: 5000. Passive data ports are assigned automatically."],
   ["anonymous","Anonymous","Allow anonymous login with any password. Turn off to require the configured username and password."],
   ["username","User","Username used when anonymous login is off."],
   ["password","Password","Password used when anonymous login is off. Stored in the local save; FTP transfers are unencrypted."],
   ["protect","Protect CivHomebrew","Prevent FTP changes to the CivHomebrew folder, including core, launcher, settings and installed apps. Package installation still works. Turning this off allows direct changes that can break the launcher."]
  ];
  var keyboard=g.CivKeyboard.create({root:overlay,layout:o.layout,native:o.native,focus:function(){o.focus();o.suppress();},error:function(t){description.textContent=t;o.error(t);}});
  function draw(){
   if(closed)return;while(list.firstChild)list.removeChild(list.firstChild);rows=[];title.textContent=page==="ftp"?"FTP Options":"Options";
   var items=page==="ftp"?fields:[["ftp","FTP","Enable / modify the FTP server settings such as port, username/password and file protection.\n\nChanges are saved and restart FTP when leaving FTP Options."]];
   items.forEach(function(f,i){var row=node("div",list,{height:"70px",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",borderBottom:"1px solid #444",boxSizing:"border-box",border:"3px solid transparent",fontSize:"23px",flexShrink:"0"});row.setAttribute("data-option",f[0]);
    node("span",row,{whiteSpace:"nowrap"},f[1]);var value="";if(page==="ftp"){value=draft[f[0]];if(typeof value==="boolean")value=value?"On":"Off";else if(f[0]==="password")value=value?"••••••••":"Not set";}
    node("span",row,{color:"#00efcf",maxWidth:"175px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginLeft:"16px"},String(value));row.addEventListener("click",function(){if(!saving&&!keyboard.active()){selected=i;paint();}});row.addEventListener("dblclick",activate);rows.push(row);
   });paint();
  }
  function paint(){rows.forEach(function(r,i){r.style.borderColor=i===selected?"#80e0e6":"transparent";r.style.backgroundColor=i===selected?"#333":"transparent";r.setAttribute("data-selected",String(i===selected));});description.textContent=page==="ftp"?fields[selected][1]+"\n\n"+fields[selected][2]+"\n\n"+(draft.enabled?"FTP: "+o.ip()+":"+draft.port:"FTP disabled"):"FTP\n\nEnable / modify the FTP server settings such as port, username/password and file protection.\n\nChanges restart FTP when leaving FTP Options.";if(rows[selected]){var height=o.layout?o.layout.px(70):70,top=selected*height;if(top<list.scrollTop)list.scrollTop=top;else if(top+height>list.scrollTop+list.clientHeight)list.scrollTop=top+height-list.clientHeight;}}
  async function activate(){
   if(closed||saving||keyboard.active())return;if(page!=="ftp"){page="ftp";selected=0;draft=Object.assign({},o.settings());draw();return;}
   var key=fields[selected][0];if(typeof draft[key]==="boolean"){draft[key]=!draft[key];draw();return;}
   var result=await keyboard.edit(String(draft[key]),key==="port"?5:128,key==="password",fields[selected][1]);if(closed||result===null)return;
   draft[key]=key==="port"&&/^\d+$/.test(result)?Number(result):result;draw();
  }
  async function back(){
   if(closed||saving||keyboard.active())return;
   if(page==="ftp"){saving=true;try{await o.save(draft);if(!closed){page="options";selected=0;draw();}}catch(e){description.textContent=e.message+"\n\nCorrect the setting and press B to save.";o.error(e.message);}finally{saving=false;}return;}
   page="";overlay.style.display="none";o.focus();o.suppress();
  }
  function action(name,phase){
   if(!page)return false;if(keyboard.active())return keyboard.action(name,phase);if(saving)return true;
   if(name==="cancel"&&phase===0){back();return true;}if(name==="accept"&&phase===0){activate();return true;}
   if(name==="nav-up"||name==="nav-down"){selected=Math.max(0,Math.min(rows.length-1,selected+(name==="nav-up"?-1:1)));paint();return true;}
   if((name==="nav-left"||name==="nav-right")&&page==="ftp"&&typeof draft[fields[selected][0]]==="boolean"&&phase===0)activate();return true;
  }
  return {open:function(){if(closed)return;page="options";selected=0;overlay.style.display="block";draw();},active:function(){return !!page;},editing:keyboard.active,action:action,
   close:function(){closed=true;keyboard.cancel();if(overlay.parentNode)overlay.parentNode.removeChild(overlay);}};
 }
 g.CivOptions={create:create};
})(typeof window!=="undefined"?window:globalThis);
