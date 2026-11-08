/* Direct-eval entry point: this async lifetime MUST remain the final bundle value. */
(async function () {
    "use strict";
    var C=window.PayloadCore, previous=window.__civswitchApp;
    if(previous&&typeof previous.close==="function")await previous.close();
    var finish,lifetime=new Promise(function(r){finish=r;}),closed=false,busy=true,running=false;
    var selected=0,entries=[],tiles=[],native=null,store=null,server=null,legacy=null,task=null,artTask=null;
    var screen="selector",rawRunning=false,rawWrite=null,logTail=Promise.resolve(),inputButtons=null,buttonTimer=null,minusDown=false;
    var originalLogDescriptor=Object.getOwnPropertyDescriptor(window,"log"),originalLog=window.log;
    var subscription=null,nativeInput=false,removers=[],frame=null,ipTimer=null;
    var owner={owner:"civhomebrew"},held="",nextRepeat=0,last={name:"",time:0},buttons={},ignoreUntil=0;
    var diagnostics=[],lastMessage="",port=(window.__payloadMenuConfig||{}).port||9027;
    function record(s){diagnostics.push({time:Date.now(),message:String(s).slice(0,240)});if(diagnostics.length>64)diagnostics.shift();if(terminalModel)terminalModel.append(s);}
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
        b.addEventListener("click",function(){if(!closed&&(!running||rawRunning))fn();});return b;
    }
    var terminalButton=footerAction("-","Terminal",function(){setScreen("terminal");});
    var startButton=footerAction("A","Start",function(){startSelected();});
    var exitButton=footerAction("B","Exit",function(){cancel();});
    var terminalView=node("div",stage,{position:"absolute",left:"0",right:"0",top:"0",bottom:"74px",backgroundColor:"#000",display:"none",zIndex:"3"});
    terminalView.id="payload-terminal";
    var terminalText=node("pre",terminalView,{position:"absolute",left:"8px",right:"8px",top:"8px",bottom:"0",margin:"0",padding:"0",overflow:"hidden",fontFamily:"monospace",fontSize:"14px",fontWeight:"normal",lineHeight:"17px",whiteSpace:"pre",backgroundColor:"#000",color:"#fff"});
    terminalText.id="terminal-output";terminalText.setAttribute("role","log");
    var terminalModel=window.PayloadTerminal.create(function(text){if(screen==="terminal")terminalText.textContent=text;});
    function setScreen(value){
        if(closed)return;screen=value;held="";
        terminalView.style.display=value==="terminal"?"block":"none";
        counter.style.display=value==="terminal"?"none":"block";
        terminalButton.style.display=startButton.style.display=value==="terminal"?"none":"flex";
        exitButton.lastChild.textContent=value==="terminal"?"Back":"Exit";
        if(value==="terminal")terminalText.textContent=terminalModel.text();
        root.focus();
    }
    function cancel(){if(screen==="terminal")setScreen("selector");else close();}
    function menuLog(message){
        var text=String(message);if(text.length>32768)text=text.slice(0,32768)+"\n[message truncated]";
        terminalModel.append(text);
        if(rawWrite){logTail=rawWrite(text+"\n").catch(function(e){record(e.message);});return logTail;}
        return Promise.resolve();
    }
    window.log=menuLog;
    terminalModel.append("CivHomebrew / CivSwitch payload terminal");
    var notice=node("div",stage,{position:"absolute",left:"100px",right:"100px",bottom:"86px",padding:"12px 18px",backgroundColor:"#292929",color:"#fff",fontSize:"18px",display:"none"});notice.id="menu-notice";notice.setAttribute("role","status");
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
            tile.addEventListener("click",function(){if(closed||running||busy)return;selected=i;paint(true);root.focus();});
            tile.addEventListener("dblclick",function(){if(!busy&&!running){selected=i;startSelected();}});
            tiles.push({node:tile,label:label});
        });
        selected=Math.max(0,Math.min(selected,entries.length-1));paint(true);
    }
    async function loadArt(){
        var local=tiles.slice(),list=entries.slice();
        for(var i=0;i<list.length&&!closed;i++){
            if(tiles!==local&&tiles[i]!==local[i])break;
            try{var icon=await store.icon(list[i].id);if(closed||tiles[i]!==local[i])break;if(icon){var image=node("img",local[i].node,{position:"absolute",left:"0",top:"0",width:"170px",height:"170px",borderRadius:"1px"});image.alt="";image.src=icon;local[i].label.style.zIndex="2";}}
            catch(e){record(e.message);local[i].node.setAttribute("data-error","true");}
        }
    }
    function refresh(){entries=store.list();draw();status(entries.length?"":"No payloads installed.\nInstall a .civapp package from the PC companion.");artTask=loadArt();}
    function stopInput(){
        if(frame!==null){cancelAnimationFrame(frame);frame=null;}
        removers.splice(0).forEach(function(r){r();});
        try{if(subscription&&typeof subscription.clear==="function")subscription.clear();else if(nativeInput&&window.engine&&window.engine.off)window.engine.off("InputAction",onNative,owner);}catch(e){record(e.message);}
        subscription=null;nativeInput=false;held="";buttons={};
        if(ipTimer!==null){clearInterval(ipTimer);ipTimer=null;}
        if(buttonTimer!==null){clearInterval(buttonTimer);buttonTimer=null;}
        if(inputButtons){inputButtons.close();inputButtons=null;}minusDown=false;
    }
    async function close(){
        if(closed)return lifetime;
        if(running)return; // A child owns its own exit/lifetime.
        closed=true;stopInput();if(server){var s=server;server=null;await s.stop();}
        if(legacy){var oldLegacy=legacy;legacy=null;await oldLegacy.stop();}
        if(task)await task;if(artTask)await artTask;
        if(window.log===menuLog){if(originalLogDescriptor)Object.defineProperty(window,"log",originalLogDescriptor);else delete window.log;}
        if(root.parentNode)root.parentNode.removeChild(root);if(window.__civswitchApp===instance)delete window.__civswitchApp;
        finish();return lifetime;
    }
    async function execute(p){return executeSource(C.source(p),false,null,p.name);}
    async function executeSource(source,isRaw,writer,name){
        if(closed||busy||running){if(isRaw)throw Error("Menu is busy.");return;}
        busy=true;running=true;rawRunning=isRaw;rawWrite=writer;logTail=Promise.resolve();notice.style.display="none";paint();
        if(!isRaw){stopInput();root.style.display="none";record("Executing "+name+"...");}
        else setScreen("terminal");
        if(server){var s=server;server=null;await s.stop();}if(artTask)await artTask;
        if(window.__civswitchApp===instance)delete window.__civswitchApp;
        var error=null;
        try{await window.PayloadLoaderScope.evaluate(source);await logTail;}
        catch(e){error=e;record("Payload failed: "+String(e.message).slice(0,220));}
        finally{
            var child=window.__civswitchApp;
            if(child&&child!==instance&&typeof child.close==="function"){
                try{await child.close();}catch(e){record("Child cleanup failed: "+e.message);}
            }
            // A raw installer can update storage outside this UI's cached store.
            if(isRaw){
                try{var before=JSON.stringify(store.list()),loaded=await store.load();if(JSON.stringify(loaded.entries)!==before)refresh();}
                catch(e){if(!error)error=e;record("Catalog refresh failed: "+e.message);}
            }
            rawWrite=null;rawRunning=false;root.style.display="block";window.__civswitchApp=instance;running=false;busy=false;
            stopInput();ignoreUntil=Date.now()+300;last={name:"",time:0};startInput();startServer();paint();root.focus();
            if(error&&!isRaw)announce("Payload failed: "+String(error.message).slice(0,220));
            else if(!isRaw)record("Executed successfully");
        }
        if(error&&isRaw)throw error;
    }
    function startSelected(){
        if(closed||busy||running||!entries[selected])return;
        var id=entries[selected].id;busy=true;paint();
        task=(async function(){try{var p=await store.read(id);busy=false;if(!closed)await execute(p);}catch(e){busy=false;announce(e.message);paint();}})();
    }
    async function dispatch(request){
        if(!request||request.protocol!==1)throw Error("Unsupported companion protocol.");
        if(closed||running||busy)throw Error("Menu is busy.");
        if(request.op==="hello")return {response:{ok:true,app:"CivHomebrew",protocol:1,packageVersion:1}};
        if(request.op==="list")return {response:{ok:true,entries:store.list()}};
        busy=true;paint();
        try{
            if(request.op==="install"){
                if(artTask)await artTask;
                var entry;try{entry=await store.install(request.package);}catch(e){if(!closed){refresh();announce("Install failed: "+e.message);}throw e;}if(!closed){refresh();announce("Installed "+entry.name);}
                return {response:{ok:true,entry:entry}};
            }
            if(request.op==="run"||request.op==="run-source"){
                var p=request.op==="run"?await store.read(request.id):C.package(request.package);
                return {response:{ok:true,state:"accepted",name:p.name},after:function(){if(!closed&&!running){task=execute(p);}}};
            }
            throw Error("Unknown companion operation.");
        }finally{busy=false;paint();}
    }
    function startServer(){if(native&&!closed&&!running){try{server=native.serve(port,dispatch,function(e){announce(e.message);});}catch(e){announce(e.message);}}}
    function startLegacy(){
        if(!native||!window.PayloadLegacy||closed)return;
        try{
            var transport=native.rawTransport(window.PayloadLoaderScope.listener,window.PayloadLoaderScope.port);
            legacy=window.PayloadLegacy.create({transport:transport,busy:function(){return busy||running||closed;},
                execute:function(source,write){return executeSource(source,true,write,"PC payload");},
                record:record,error:function(e){announce(e.message);},
                ready:function(){record("Awaiting payload at "+(native.ip()||"IP unavailable")+":"+window.PayloadLoaderScope.port);}});
            record("Awaiting payload at "+(native.ip()||"IP unavailable")+":"+window.PayloadLoaderScope.port);
        }catch(e){announce("Gezine compatibility: "+e.message);}
    }
    function childOwnsInput(){
        if(!running)return false;
        if(!rawRunning)return true;
        var child=window.__civswitchApp,focus=document.activeElement;
        return !!(child&&child!==instance)||(focus&&focus!==document.body&&!root.contains(focus));
    }
    function startButtonPolling(){
        if(!native||!native.controllerButtons||inputButtons)return;
        try{
            inputButtons=native.controllerButtons();
            buttonTimer=setInterval(function(){
                try{var state=inputButtons.poll();if(state===null)return;var down=!!(state&0x800n);if(down&&!minusDown&&!childOwnsInput())action("terminal",0);minusDown=down;}
                catch(e){record(e.message);clearInterval(buttonTimer);buttonTimer=null;inputButtons.close();inputButtons=null;}
            },40);
        }catch(e){record("Minus input unavailable: "+e.message);}
    }
    function choose(name){if(!entries.length)return;var row=Math.floor(selected/6),col=selected%6;if(name==="nav-left"&&col>0)selected--;if(name==="nav-right"&&col<5&&selected+1<entries.length)selected++;if(name==="nav-up"&&row>0)selected-=6;if(name==="nav-down"&&(row+1)*6<entries.length)selected=Math.min(selected+6,entries.length-1);notice.style.display="none";paint(true);}
    function action(name,phase,x,y){
        if(closed||childOwnsInput()||Date.now()<ignoreUntil)return;
        phase=Number(phase);if(name==="keyboard-escape")name="cancel";if(name==="minus")name="terminal";
        if(name==="nav-move"){if(Math.abs(Number(x))>Math.abs(Number(y))&&Math.abs(Number(x))>.5)name=Number(x)>0?"nav-right":"nav-left";else if(Math.abs(Number(y))>.5)name=Number(y)>0?"nav-up":"nav-down";else{held="";return;}}
        if(["nav-up","nav-down","nav-left","nav-right","accept","cancel","terminal"].indexOf(name)<0)return;
        if(phase!==0&&phase!==3){if(held===name)held="";return;}
        var now=Date.now();if(last.name===name&&now-last.time<90)return;
        if(name==="terminal"){if(phase!==0)return;setScreen("terminal");}
        else if(name.indexOf("nav-")===0){if(busy||screen==="terminal")return;if(phase===3&&(held!==name||now<nextRepeat))return;held=name;nextRepeat=now+(phase===0?350:150);choose(name);}
        else{if(phase!==0)return;if(name==="accept"){if(screen==="selector")startSelected();}else cancel();}
        last={name:name,time:now};
    }
    function consume(e){e.preventDefault();e.stopImmediatePropagation();}
    function onNative(name,phase,x,y){action(name,phase,x,y);}
    function onGame(e){if(childOwnsInput())return;var d=e.detail||{};if(["nav-up","nav-down","nav-left","nav-right","nav-move","accept","cancel","keyboard-escape","terminal","minus"].indexOf(d.name)<0)return;action(d.name,d.status,d.x,d.y);consume(e);}
    function poll(){if(closed||childOwnsInput()&&!rawRunning)return;if(!nativeInput&&navigator.getGamepads){var pads;try{pads=navigator.getGamepads();}catch(_){pads=[];}var mapping=[[12,"nav-up"],[13,"nav-down"],[14,"nav-left"],[15,"nav-right"],[0,"accept"],[1,"cancel"],[8,"terminal"]];for(var p=0;p<pads.length;p++){if(!pads[p])continue;for(var b=0;b<mapping.length;b++){var index=mapping[b][0],key=p+":"+index,down=!!(pads[p].buttons[index]&&pads[p].buttons[index].pressed);if(down)action(mapping[b][1],buttons[key]?3:0);else if(buttons[key])action(mapping[b][1],1);buttons[key]=down;}}}frame=requestAnimationFrame(poll);}
    function updateIp(){if(native){try{address.textContent=native.ip()||"IP unavailable";}catch(e){address.textContent="IP unavailable";record(e.message);}}}
    function startInput(){
        listen(window,"navigate-input",onGame);listen(window,"engine-input",onGame);listen(window,"resize",resize);
        listen(window,"keydown",function(e){if(childOwnsInput())return;var n={ArrowUp:"nav-up",ArrowDown:"nav-down",ArrowLeft:"nav-left",ArrowRight:"nav-right",Enter:"accept",Escape:"cancel","-":"terminal",Subtract:"terminal"}[e.key];if(n){action(n,e.repeat?3:0);consume(e);}});
        listen(window,"keyup",function(e){if(childOwnsInput())return;var n={ArrowUp:"nav-up",ArrowDown:"nav-down",ArrowLeft:"nav-left",ArrowRight:"nav-right"}[e.key];if(n){action(n,1);consume(e);}});
        if(window.engine&&typeof window.engine.on==="function"){try{subscription=window.engine.on("InputAction",onNative,owner);nativeInput=true;}catch(e){record(e.message);}}
        frame=requestAnimationFrame(poll);updateIp();if(native)ipTimer=setInterval(updateIp,5000);startButtonPolling();resize();
    }
    var instance={id:"civhomebrew",close:close,lifetime:lifetime,diagnostics:diagnostics,getState:function(){return {busy:busy,running:running,count:entries.length,selected:selected,screen:screen};}};
    window.__civswitchApp=instance;
    resize();startInput();status("Loading installed payloads…");root.focus();
    task=(async function(){try{
        if(window.PayloadNative.available){native=window.PayloadNative.create();store=C.createStore(native.io);stopInput();startInput();updateIp();}
        else if(window.PayloadPreview){store=C.createStore(window.PayloadPreview.io);address.textContent="Browser preview";}
        else throw Error("CivSwitch native bridge unavailable.");
        var loaded=await store.load();busy=false;if(!closed){refresh();if(loaded.migrated)announce("Installed apps migrated to folders.");else if(loaded.recovered)announce("Recovered the catalog from its backup.");startServer();startLegacy();}
    }catch(e){busy=false;status(e.message);record(e.message);}
    })();
    await task;
    if(typeof originalLog==="function")await originalLog("CIVHOME_BREW_READY");
    await lifetime;
})();
