/* Replaceable frontend. No installer or resident socket ownership. */
(function(g){
 "use strict";
 var factory={api:1,mount:async function(api){
    if(!api.ftpSettings||!api.files||!api.saveFtpSettings)throw Error("FTP Options requires core 0.3.0; update core and restart first.");
    var closed=false,busy=false,selected=0,entries=[],tiles=[],artTask=null,ftp=null,ftpStopped=false;
    var subscription=null,nativeInput=false,removers=[],frame=null,ipTimer=null;
    var owner={owner:"civhomebrew-launcher"},held="",nextRepeat=0,last={name:"",time:0},buttons={},ignoreUntil=Date.now()+250;
    var loadingOwner=0,lastFtpError="",lastMessage="",options=null,ftpSettings=Object.assign({},api.ftpSettings),serviceTask=Promise.resolve();
    function record(s){api.log(s);}
    function listen(target,name,fn){target.addEventListener(name,fn,true);removers.push(function(){target.removeEventListener(name,fn,true);});}
    function node(tag,parent,styles,text){var n=document.createElement(tag);Object.assign(n.style,styles||{});if(text!==undefined)n.textContent=text;if(parent)parent.appendChild(n);return n;}
    var root=node("div",document.body,{position:"fixed",left:"0",right:"0",top:"0",bottom:"0",backgroundColor:"#000",color:"#f5f5f5",fontFamily:"Arial, sans-serif",zIndex:"1",outline:"none",overflow:"hidden"});
    root.id="civhomebrew";root.tabIndex=-1;
    var stage=node("div",root,{position:"absolute",width:"1280px",height:"720px",transformOrigin:"0 0",backgroundColor:"#000"});
    node("div",stage,{position:"absolute",left:"72px",top:"37px",fontSize:"32px",fontWeight:"400"},"CivHomebrew");
    var address=node("div",stage,{position:"absolute",right:"72px",top:"47px",fontSize:"23px",textAlign:"right"},"IP unavailable");address.id="menu-ip";
    node("div",stage,{position:"absolute",left:"30px",right:"30px",top:"86px",height:"1px",backgroundColor:"#a9a9a9"});
    var viewport=node("div",stage,{position:"absolute",left:"48px",right:"48px",top:"104px",height:"542px",overflowX:"hidden",overflowY:"auto"});viewport.id="payload-viewport";
    var grid=node("div",viewport,{display:"flex",flexDirection:"column",paddingTop:"80px",paddingLeft:"42px",paddingRight:"42px",paddingBottom:"6px"});grid.id="payload-grid";grid.setAttribute("role","listbox");grid.setAttribute("aria-label","Installed payloads");
    var message=node("div",stage,{position:"absolute",left:"100px",right:"100px",top:"300px",fontSize:"24px",lineHeight:"1.6",textAlign:"center",whiteSpace:"pre-wrap",color:"#b8c2c5",display:"none"});message.id="menu-status";message.setAttribute("role","status");
    node("div",stage,{position:"absolute",left:"30px",right:"30px",top:"646px",height:"1px",backgroundColor:"#a9a9a9"});
    var counter=node("div",stage,{position:"absolute",left:"80px",top:"672px",fontSize:"22px"},"0 / 0");counter.id="menu-counter";
    var footer=node("div",stage,{position:"absolute",right:"60px",top:"670px",display:"flex",alignItems:"center",fontSize:"24px"});
    function footerAction(letter,text,fn){
        var b=node("button",footer,{display:"flex",alignItems:"center",border:"0",padding:"0",marginLeft:"32px",backgroundColor:"transparent",color:"#f5f5f5",fontFamily:"Arial, sans-serif",fontSize:"24px",lineHeight:"30px",outline:"none"});
        b.type="button";b.tabIndex=-1;
        // Fixed artwork avoids inherited game font metrics shifting the badge letters.
        var icon=node("img",b,{display:"block",width:"25px",height:"25px",flexShrink:"0",margin:"0 10px 0 0",padding:"0",border:"0"});
        icon.alt=letter;
        var icons=(window.__payloadMenuConfig||{}).buttonIcons||{};
        icon.src=icons[letter]||"assets/button-"+(letter==="-"?"minus":letter.toLowerCase())+".png";
        node("span",b,{display:"block",lineHeight:"30px"},text);
        b.addEventListener("click",function(){if(!closed&&!busy)fn();});return b;
    }
    var optionsButton=footerAction("Y","Options",function(){action("options",0);});
    var terminalButton=footerAction("-","Terminal",function(){api.terminal();});
    var startButton=footerAction("A","Start",function(){startSelected();});
    var exitButton=footerAction("B","Exit",function(){api.terminal();});if(api.config&&api.config.bootIntegrated)exitButton.style.display="none";
    var notice=node("div",stage,{position:"absolute",left:"100px",right:"100px",bottom:"86px",padding:"12px 18px",backgroundColor:"#292929",color:"#fff",fontSize:"18px",display:"none"});notice.id="menu-notice";notice.setAttribute("role","status");
    var loading=node("div",stage,{position:"absolute",left:"0",right:"0",top:"0",bottom:"0",display:"none",alignItems:"center",justifyContent:"center",backgroundColor:"rgba(0,0,0,0.72)",zIndex:"6"});
    loading.id="loading-overlay";loading.setAttribute("role","dialog");loading.setAttribute("aria-modal","true");loading.setAttribute("aria-labelledby","loading-title");
    var loadingPanel=node("div",loading,{width:"520px",padding:"32px",boxSizing:"border-box",border:"1px solid #3b4146",borderRadius:"8px",backgroundColor:"#1b1e21",textAlign:"center"});loadingPanel.id="loading-panel";
    var loadingTitle=node("div",loadingPanel,{fontSize:"26px",lineHeight:"34px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"});loadingTitle.id="loading-title";
    var loadingTrack=node("div",loadingPanel,{position:"relative",display:"block",width:"100%",height:"10px",marginTop:"26px",overflow:"hidden",borderRadius:"5px",backgroundColor:"#3b4146"});
    loadingTrack.id="loading-progress";loadingTrack.setAttribute("role","progressbar");loadingTrack.setAttribute("aria-valuemin","0");loadingTrack.setAttribute("aria-valuemax","100");loadingTrack.setAttribute("aria-labelledby","loading-title");
    var loadingFill=node("div",loadingTrack,{position:"absolute",display:"block",left:"0",top:"0",margin:"0",width:"0%",height:"10px",backgroundColor:"#00efcf"});loadingFill.id="loading-progress-fill";
    var loadingPercent=node("div",loadingPanel,{marginTop:"16px",fontSize:"18px",lineHeight:"24px",color:"#c5cdd0"},"0%");
    function loadProgress(done,total){
        if(closed)return;loadingFill.style.left="0";loadingTrack.removeAttribute("aria-valuetext");var percent=total>0?Math.max(0,Math.min(100,Math.floor(done*100/total))):0;
        loadingFill.style.width=percent+"%";loadingPercent.textContent=percent+"%";loadingTrack.setAttribute("aria-valuenow",String(percent));
    }
    function hideLoading(){loading.style.display="none";}
    function status(s){lastMessage=s;message.textContent=s;message.style.display=s?"block":"none";}
    function announce(s){record(s);notice.textContent=s;notice.style.display=s?"block":"none";}
    function resize(){var scale=Math.min(window.innerWidth/1280,window.innerHeight/720);stage.style.transform="scale("+scale+")";stage.style.left=((window.innerWidth-1280*scale)/2)+"px";stage.style.top=((window.innerHeight-720*scale)/2)+"px";}
    function paint(scroll){
        tiles.forEach(function(t,i){var active=i===selected;t.node.style.borderColor=active?"#00efcf":"transparent";t.node.setAttribute("aria-selected",active?"true":"false");t.node.setAttribute("data-selected",active?"true":"false");t.label.style.display=active?"flex":"none";});
        counter.textContent=(entries.length?selected+1:0)+" / "+entries.length;startButton.disabled=busy||!entries.length;
        if(scroll&&tiles[selected]){var top=Math.floor(selected/6)*184;var bottom=top+80+176;if(top<viewport.scrollTop)viewport.scrollTop=top;else if(bottom>viewport.scrollTop+viewport.clientHeight)viewport.scrollTop=bottom-viewport.clientHeight;}
    }
    function draw(){
        while(grid.firstChild)grid.removeChild(grid.firstChild);tiles=[];
        var row;
        entries.forEach(function(e,i){
            if(i%6===0)row=node("div",grid,{display:"flex",flexDirection:"row",marginBottom:"8px",flexShrink:"0"});
            var tile=node("div",row,{position:"relative",width:"176px",height:"176px",marginRight:i%6===5?"0":"8px",boxSizing:"border-box",border:"3px solid transparent",borderRadius:"4px",backgroundColor:["#373b48","#d2d9de","#a995be","#647a79","#e3ddc8","#2b2b2b"][i%6],flexShrink:"0",display:"flex",alignItems:"center",justifyContent:"center",color:i%6===1||i%6===4?"#313d43":"#f2f4f3",fontSize:"76px"},e.name.charAt(0).toUpperCase());
            tile.setAttribute("role","option");tile.setAttribute("aria-label",e.name);tile.setAttribute("data-id",e.id);
            // Center in the tile's 170 px content area, without percentage transforms.
            var label=node("div",tile,{position:"absolute",bottom:"186px",left:"0",right:"0",display:"flex",alignItems:"center",justifyContent:"center",zIndex:"2"});
            var bubble=node("div",label,{display:"flex",alignItems:"center",justifyContent:"center",flexShrink:"0",maxWidth:"250px",minWidth:"64px",height:"48px",padding:"10px 22px",margin:"0",boxSizing:"border-box",borderRadius:"3px",backgroundColor:"#333",color:"#00efcf",fontSize:"24px",fontWeight:"400",lineHeight:"28px",whiteSpace:"nowrap",textAlign:"center"});
            node("span",bubble,{display:"block",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"206px",lineHeight:"28px",textAlign:"center"},e.name);
            node("div",label,{position:"absolute",top:"48px",left:"76px",width:"0",height:"0",borderLeft:"9px solid transparent",borderRight:"9px solid transparent",borderTop:"11px solid #333"});
            tile.addEventListener("click",function(){if(closed||busy)return;selected=i;paint(true);root.focus();});
            tile.addEventListener("dblclick",function(){if(!busy){selected=i;startSelected();}});
            tiles.push({node:tile,label:label});
        });
        selected=Math.max(0,Math.min(selected,entries.length-1));paint(true);
    }
    async function loadArt(){
        var local=tiles.slice(),list=entries.slice();
        for(var i=0;i<list.length&&!closed;i++){
            if(tiles!==local&&tiles[i]!==local[i])break;
            try{var icon=await api.icon(list[i].id);if(closed||tiles[i]!==local[i])break;if(icon){var image=node("img",local[i].node,{position:"absolute",left:"0",top:"0",width:"170px",height:"170px",borderRadius:"1px"});image.alt="";image.src=icon;local[i].label.style.zIndex="2";}}
            catch(e){record(e.message);local[i].node.setAttribute("data-error","true");}
        }
    }
    function refresh(){entries=api.list();draw();status(entries.length?"":"No payloads installed.\nInstall a .civapp package from the PC companion.");artTask=loadArt();}
    function choose(name){if(!entries.length)return;var row=Math.floor(selected/6),col=selected%6;if(name==="nav-left"&&col>0)selected--;if(name==="nav-right"&&col<5&&selected+1<entries.length)selected++;if(name==="nav-up"&&row>0)selected-=6;if(name==="nav-down"&&(row+1)*6<entries.length)selected=Math.min(selected+6,entries.length-1);notice.style.display="none";paint(true);}
    function action(name,phase,x,y){
        if(closed||busy||Date.now()<ignoreUntil)return;
        if(loading.style.display!=="none"&&name!=="cancel"&&name!=="keyboard-escape")return;
        phase=Number(phase);if(name==="keyboard-escape")name="cancel";if(name==="minus")name="terminal";
        if(name==="nav-move"){if(Math.abs(Number(x))>Math.abs(Number(y))&&Math.abs(Number(x))>.5)name=Number(x)>0?"nav-right":"nav-left";else if(Math.abs(Number(y))>.5)name=Number(y)>0?"nav-up":"nav-down";else{held="";return;}}
        if(["nav-up","nav-down","nav-left","nav-right","accept","cancel","terminal","options"].indexOf(name)<0)return;
        if(phase!==0&&phase!==3){if(held===name)held="";return;}
        var now=Date.now();if(last.name===name&&now-last.time<90)return;
        if(options&&options.editing())return;
        if(options&&options.active()&&name!=="terminal"){
            if(name.indexOf("nav-")===0){if(phase===3&&(held!==name||now<nextRepeat))return;held=name;nextRepeat=now+(phase===0?350:150);}
            options.action(name,phase);last={name:name,time:now};return;
        }
        if(name==="options"){if(phase===0)options.open();}
        else if(name==="terminal"){if(phase!==0)return;api.terminal();}
        else if(name.indexOf("nav-")===0){if(busy)return;if(phase===3&&(held!==name||now<nextRepeat))return;held=name;nextRepeat=now+(phase===0?350:150);choose(name);}
        else{if(phase!==0)return;if(name==="accept"){startSelected();}else api.terminal();}
        last={name:name,time:now};
    }
    function consume(e){e.preventDefault();e.stopImmediatePropagation();}
    function onNative(name,phase,x,y){action(name,phase,x,y);}
    function onGame(e){if(options&&options.editing())return;var d=e.detail||{};if(["nav-up","nav-down","nav-left","nav-right","nav-move","accept","cancel","keyboard-escape","terminal","minus","options"].indexOf(d.name)<0)return;action(d.name,d.status,d.x,d.y);consume(e);}
    function poll(){if(closed)return;if(!nativeInput&&navigator.getGamepads){var pads;try{pads=navigator.getGamepads();}catch(_){pads=[];}var mapping=[[12,"nav-up"],[13,"nav-down"],[14,"nav-left"],[15,"nav-right"],[0,"accept"],[1,"cancel"],[8,"terminal"],[3,"options"]];for(var p=0;p<pads.length;p++){if(!pads[p])continue;for(var b=0;b<mapping.length;b++){var index=mapping[b][0],key=p+":"+index,down=!!(pads[p].buttons[index]&&pads[p].buttons[index].pressed);if(down)action(mapping[b][1],buttons[key]?3:0);else if(buttons[key])action(mapping[b][1],1);buttons[key]=down;}}}frame=requestAnimationFrame(poll);}
    function updateIp(){if(api.ip){try{address.textContent=api.ip()||"IP unavailable";}catch(e){address.textContent="IP unavailable";record(e.message);}}}
    function startInput(){
        listen(window,"navigate-input",onGame);listen(window,"engine-input",onGame);listen(window,"resize",resize);
        listen(window,"keydown",function(e){if(options&&options.editing())return;var n={ArrowUp:"nav-up",ArrowDown:"nav-down",ArrowLeft:"nav-left",ArrowRight:"nav-right",Enter:"accept",Escape:"cancel","-":"terminal",Subtract:"terminal",y:"options",Y:"options"}[e.key];if(n){action(n,e.repeat?3:0);consume(e);}});
        listen(window,"keyup",function(e){if(options&&options.editing())return;var n={ArrowUp:"nav-up",ArrowDown:"nav-down",ArrowLeft:"nav-left",ArrowRight:"nav-right"}[e.key];if(n){action(n,1);consume(e);}});
        if(window.engine&&typeof window.engine.on==="function"){try{subscription=window.engine.on("InputAction",onNative,owner);nativeInput=true;}catch(e){record(e.message);}}
        frame=requestAnimationFrame(poll);updateIp();ipTimer=setInterval(updateIp,5000);resize();
    }
    function beginLoading(entry){
        loadingOwner++;busy=true;paint();notice.style.display="none";
        loadingTitle.textContent="Loading "+entry.name+"…";loading.style.display="flex";loadProgress(0,1);
        return function(done,total){loadProgress(done,total);if(done===total)loadingTitle.textContent="Starting "+entry.name+"…";};
    }
    function beginInstalling(name){
        var ticket=++loadingOwner;busy=true;paint();notice.style.display="none";
        loadingTitle.textContent="Installing "+name+"…";loading.style.display="flex";loadProgress(0,1);
        return {progress:function(done,total){if(ticket===loadingOwner)loadProgress(done,total);},close:function(error){
            if(closed||ticket!==loadingOwner)return;busy=false;hideLoading();held="";ignoreUntil=Date.now()+250;paint();
            if(error){refresh();announce("Installation failed: "+error);}
        }};
    }
    function beginUploading(target,total){
        if(closed||busy)throw Error("Launcher is busy; retry the upload.");
        var ticket=++loadingOwner,timer=null,offset=0,direction=1;busy=true;paint();notice.style.display="none";
        loadingTitle.textContent="Uploading "+target.slice(target.lastIndexOf("/")+1)+"…";loading.style.display="flex";
        function stopAnimation(){if(timer!==null){clearInterval(timer);timer=null;}}
        function progress(bytes,size){
            if(closed||ticket!==loadingOwner){stopAnimation();return;}
            if(size>0&&bytes<=size){stopAnimation();loadProgress(bytes,size);return;}
            // FTP does not normally provide a total size. Show real received bytes
            // and an indeterminate bar until EOF, instead of inventing a percentage.
            var received=bytes<1048576?(bytes/1024).toFixed(1)+" KiB":(bytes/1048576).toFixed(2)+" MiB";
            loadingPercent.textContent=received+" received";loadingTrack.removeAttribute("aria-valuenow");loadingTrack.setAttribute("aria-valuetext",loadingPercent.textContent);
            loadingFill.style.width="25%";
            if(timer===null)timer=setInterval(function(){
                if(closed||ticket!==loadingOwner){stopAnimation();return;}
                offset+=direction*5;if(offset>=75||offset<=0)direction=-direction;loadingFill.style.left=offset+"%";
            },100);
        }
        progress(0,total);
        return {progress:progress,close:function(error){
            stopAnimation();if(closed||ticket!==loadingOwner)return;
            busy=false;hideLoading();held="";ignoreUntil=Date.now()+250;paint();
            if(error)announce("Upload failed: "+error);
        }};
    }
    function startSelected(){
        if(closed||busy||!entries[selected])return;
        var entry=entries[selected],progress=beginLoading(entry);
        try{api.launch(entry.id,progress);}
        catch(e){busy=false;hideLoading();announce(e.message);paint();}
    }
    async function stopFtp(){var old=ftp;ftp=null;if(old)await old.stop();}
    async function startFtp(){
        if(closed||ftpStopped||!ftpSettings.enabled||!api.listen)return true;
        try{ftp=await g.CivFtp.create({listen:api.listen,port:ftpSettings.port,settings:ftpSettings,ip:api.ip,maxBytes:g.PayloadCore.maxFrame,fs:api.files,log:api.log,upload:beginUploading});
            api.log("FTP ready at "+api.ip()+":"+ftp.port);lastFtpError="";return true;}
        catch(e){ftp=null;lastFtpError="FTP: "+e.message;announce(lastFtpError);return false;}
    }
    function saveFtp(value){
        serviceTask=serviceTask.catch(function(){}).then(async function(){
            if(JSON.stringify(value)===JSON.stringify(ftpSettings))return;
            await stopFtp();try{ftpSettings=await api.saveFtpSettings(value);}catch(e){await startFtp();throw e;}if(!await startFtp())throw Error(lastFtpError);
        });return serviceTask;
    }
    async function stopServices(){ftpStopped=true;try{await serviceTask;}catch(_){}await stopFtp();}
    async function close(){
        if(closed)return;closed=true;if(options)options.close();await stopServices();
        if(frame!==null)cancelAnimationFrame(frame);if(ipTimer!==null)clearInterval(ipTimer);
        removers.splice(0).forEach(function(r){r();});
        try{if(subscription&&typeof subscription.clear==="function")subscription.clear();else if(nativeInput&&g.engine&&g.engine.off)g.engine.off("InputAction",onNative,owner);}catch(e){api.log(e.message);}
        if(artTask)await artTask;if(root.parentNode)root.parentNode.removeChild(root);
    }
    var instance={id:"civhomebrew",openOptions:function(){action("options",0);},close:close,stopServices:stopServices,refresh:refresh,
      installing:beginInstalling,
      loading:function(id){var entry=entries.find(function(e){return e.id===id;});if(entry)return beginLoading(entry);},
      flushArt:function(){return artTask;},selection:function(){return entries[selected]?entries[selected].id:null;},
      ftpState:function(){return ftp?ftp.getState():{running:false};},getState:function(){return {busy:busy,selected:selected,count:entries.length,screen:"selector"};}};
    try{
        resize();startInput();refresh();
        var restored=entries.findIndex(function(e){return e.id===api.selection;});if(restored>=0){selected=restored;paint(true);}
        if(api.error)announce(api.error);root.focus();
        options=g.CivOptions.create({stage:stage,settings:function(){return ftpSettings;},save:saveFtp,native:function(){return !!(g.PayloadNative&&g.PayloadNative.available);},ip:api.ip,focus:function(){if(!closed)root.focus();},suppress:function(){ignoreUntil=Date.now()+250;held="";last={name:"",time:0};},error:announce});
        await startFtp();
        return instance;
    }catch(e){await close();throw e;}
 }};
 g.CivHomebrewLauncher=factory;return factory;
})(typeof window!=="undefined"?window:globalThis);
