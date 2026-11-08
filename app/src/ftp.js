/* Launcher-owned passive FTP. Virtual /inbox only; the core installs uploads. */
(function(g){
 "use strict";
 async function create(o){
  var listener=await o.listen(o.port===undefined?2121:o.port),control=null,passive=null,data=null,stopped=false,task,busy=false;
  function pause(){return new Promise(function(r){setTimeout(r,10);});}
  function dropData(){if(data){data.close();data=null;}if(passive){passive.close();passive=null;}}
  function filename(arg){var s=arg.replace(/^\/inbox\//,"").replace(/^\//,"");if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\.(civapp|civupdate)$/.test(s))throw Error("Use a package filename under /inbox.");return s;}
  async function reply(code,text){await control.write(code+" "+text+"\r\n");}
  async function transfer(body){
   if(!passive){await reply(425,"Use PASV or EPSV first.");return false;}
   await reply(150,"Opening binary data connection.");var deadline=Date.now()+30000;
   try{
    while(!stopped&&!data){data=passive.accept();if(!data){if(Date.now()>deadline)throw Error("Data connection timed out.");await pause();}}
    if(stopped)throw Error("Transfer cancelled.");await body();return true;
   }finally{dropData();}
  }
  task=(async function(){
   try{while(!stopped){
    control=listener.accept();if(!control){await pause();continue;}
    var buffer="",login=false,user=false,cwd="/inbox",idle=Date.now();
    try{
     await reply(220,"CivHomebrew package inbox");
     while(!stopped){
      var end=buffer.indexOf("\r\n");
      if(end<0){var chunk=control.receive();if(chunk===null){if(Date.now()-idle>300000)throw Error("Idle timeout.");await pause();continue;}if(chunk==="")break;buffer+=chunk;idle=Date.now();if(buffer.length>4096)throw Error("Command too long.");continue;}
      var line=buffer.slice(0,end);buffer=buffer.slice(end+2);var split=line.indexOf(" "),cmd=(split<0?line:line.slice(0,split)).toUpperCase(),arg=split<0?"":line.slice(split+1).trim();
      try{
       if(cmd==="USER"){user=true;await reply(331,"Send password.");continue;}
       if(cmd==="PASS"){if(!user){await reply(503,"Send USER first.");continue;}login=true;await reply(230,"Trusted LAN session.");continue;}
       if(cmd==="QUIT"){await reply(221,"Goodbye.");break;}
       if(cmd==="FEAT"){await control.write("211-Features\r\n EPSV\r\n PASV\r\n SIZE\r\n MLST type*;size*;\r\n211 End\r\n");continue;}
       if(cmd==="SYST"){await reply(215,"UNIX Type: L8");continue;}
       if(!login){await reply(530,"Login required.");continue;}
       if(cmd==="NOOP"||cmd==="TYPE"||cmd==="OPTS"){await reply(200,"OK");continue;}
       if(cmd==="PWD"||cmd==="XPWD"){await reply(257,'"'+cwd+'"');continue;}
       if(cmd==="CWD"||cmd==="CDUP"){if(cmd==="CDUP"||arg==="/"||arg==="..")cwd="/";else if(arg==="inbox"||arg==="/inbox"||arg==="/inbox/")cwd="/inbox";else throw Error("Only /inbox is available.");await reply(250,"Directory changed.");continue;}
       if(cmd==="PASV"||cmd==="EPSV"){
        dropData();passive=await o.listen(o.dataPort===undefined?0:o.dataPort);
        if(cmd==="EPSV")await reply(229,"Entering Extended Passive Mode (|||"+passive.port+"|)");
        else{var ip=o.ip();if(!/^\d+\.\d+\.\d+\.\d+$/.test(ip||""))throw Error("IPv4 address unavailable.");await reply(227,"Entering Passive Mode ("+ip.replace(/\./g,",")+","+(passive.port>>8)+","+(passive.port&255)+")");}continue;
       }
       if(cmd==="LIST"||cmd==="NLST"||cmd==="MLSD"){
        var files=await o.list(),listing=files.map(function(f){if(cmd==="NLST")return f.name;if(cmd==="MLSD")return "type=file;size="+f.bytes+"; "+f.name;return "-rw-r--r-- 1 civ civ "+f.bytes+" Jan 01 00:00 "+f.name;}).join("\r\n")+(files.length?"\r\n":"");
        if(await transfer(function(){return data.writeBinary(listing);}))await reply(226,"Listing complete.");continue;
       }
       if(cmd==="SIZE"){var name=filename(arg),entry=(await o.list()).find(function(f){return f.name===name;});if(!entry)throw Error("File not found.");await reply(213,String(entry.bytes));continue;}
       if(cmd==="DELE"){await o.remove(filename(arg));await reply(250,"Removed.");continue;}
       if(cmd==="RETR"){var content=await o.read(filename(arg));if(content===null)throw Error("File not found.");if(await transfer(function(){return data.writeBinary(content);}))await reply(226,"Transfer complete.");continue;}
       if(cmd==="STOR"){
        var name=filename(arg),parts=[],length=0,after=null;busy=true;
        try{if(await transfer(async function(){
         var deadline=Date.now()+30000;
         while(!stopped){var bytes=data.receive();if(bytes===null){if(Date.now()>deadline)throw Error("Upload timed out.");await pause();continue;}if(bytes==="")break;deadline=Date.now()+30000;length+=bytes.length;if(length>o.maxBytes)throw Error("Package exceeds upload limit.");parts.push(bytes);await pause();}
         if(stopped)throw Error("Transfer cancelled.");var result=await o.submit(name,parts.join(""));after=result&&result.after;
        })){await reply(226,"Package accepted by core.");if(after)setTimeout(after,0);}}finally{busy=false;}
        continue;
       }
       await reply(502,"Command not supported.");
      }catch(e){dropData();if(!stopped)await reply(550,String(e.message).replace(/[\r\n]/g," ").slice(0,180));}
     }
    }catch(e){if(!stopped&&o.log)o.log("FTP: "+e.message);}
    finally{dropData();if(control)control.close();control=null;}
   }}catch(e){if(!stopped&&o.log)o.log("FTP stopped: "+e.message);}
   finally{stopped=true;dropData();if(control)control.close();control=null;listener.close();}
  })();
  return {port:listener.port,getState:function(){return {running:!stopped,busy:busy};},stop:function(){stopped=true;dropData();if(control)control.close();listener.close();return task;}};
 }
 g.CivFtp={create:create};
})(typeof window!=="undefined"?window:globalThis);
