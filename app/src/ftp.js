/* Launcher-owned passive FTP transport; the core owns paths, installs and policy. */
(function(g){
 "use strict";
 async function create(o){
  var listener=await o.listen(o.port===undefined?5000:o.port),control=null,passive=null,data=null,stopped=false,task,busy=false;
  function pause(){return new Promise(function(r){setTimeout(r,10);});}
  function dropData(){if(data){data.close();data=null;}if(passive){passive.close();passive=null;}}
  function path(cwd,arg){return g.CivFtpFiles.canonical(cwd,arg);}
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
    var buffer="",login=false,user=null,cwd="/",renameFrom=null,idle=Date.now();
    try{
     await reply(220,"CivHomebrew package inbox");
     while(!stopped){
      var end=buffer.indexOf("\r\n");
      if(end<0){var chunk=control.receive();if(chunk===null){if(Date.now()-idle>300000)throw Error("Idle timeout.");await pause();continue;}if(chunk==="")break;buffer+=chunk;idle=Date.now();if(buffer.length>4096)throw Error("Command too long.");continue;}
      var line=g.PayloadCore.decode(buffer.slice(0,end));buffer=buffer.slice(end+2);var split=line.indexOf(" "),cmd=(split<0?line:line.slice(0,split)).toUpperCase(),arg=split<0?"":line.slice(split+1);if(cmd!=="PASS")arg=arg.trim();
      try{
       if(cmd==="USER"){user=arg;login=false;renameFrom=null;await reply(331,"Send password.");continue;}
       if(cmd==="PASS"){if(user===null){await reply(503,"Send USER first.");continue;}var auth=o.settings||{anonymous:true};login=auth.anonymous?user.toLowerCase()==="anonymous":user===auth.username&&arg===auth.password;await reply(login?230:530,login?"Logged in.":"Login incorrect.");continue;}
       if(cmd==="QUIT"){await reply(221,"Goodbye.");break;}
       if(cmd==="FEAT"){await control.write("211-Features\r\n UTF8\r\n EPSV\r\n PASV\r\n SIZE\r\n MLST type*;size*;\r\n211 End\r\n");continue;}
       if(cmd==="SYST"){await reply(215,"UNIX Type: L8");continue;}
       if(!login){await reply(530,"Login required.");continue;}
       if(cmd==="NOOP"||cmd==="OPTS"){await reply(200,"OK");continue;}
       if(cmd==="TYPE"){if(arg!=="I"&&arg!=="A")throw Error("Unsupported transfer type.");await reply(200,"OK");continue;}
       if(cmd==="PWD"||cmd==="XPWD"){await reply(257,'"'+cwd+'"');continue;}
       if(cmd==="CWD"||cmd==="CDUP"){var next=path(cwd,cmd==="CDUP"?"..":arg);if((await o.fs.stat(next)).type!=="dir")throw Error("Not a directory.");cwd=next;await reply(250,"Directory changed.");continue;}
       if(cmd==="PASV"||cmd==="EPSV"){
        dropData();passive=await o.listen(o.dataPort===undefined?0:o.dataPort);
        if(cmd==="EPSV")await reply(229,"Entering Extended Passive Mode (|||"+passive.port+"|)");
        else{var ip=o.ip();if(!/^\d+\.\d+\.\d+\.\d+$/.test(ip||""))throw Error("IPv4 address unavailable.");await reply(227,"Entering Passive Mode ("+ip.replace(/\./g,",")+","+(passive.port>>8)+","+(passive.port&255)+")");}continue;
       }
       if(cmd==="LIST"||cmd==="NLST"||cmd==="MLSD"||cmd==="MLST"){
        var listingArg=arg;if(cmd==="LIST"||cmd==="NLST")listingArg=listingArg.replace(/^-[aAlL]+(?: +|$)/,"");var target=path(cwd,listingArg||"."),info=await o.fs.stat(target),files=info.type==="dir"?await o.fs.list(target):[Object.assign({name:target.slice(target.lastIndexOf("/")+1)},info)];
        var listing=files.map(function(f){if(cmd==="NLST")return f.name;if(cmd==="MLSD"||cmd==="MLST")return "type="+(f.type==="dir"?"dir":"file")+";size="+f.bytes+"; "+f.name;return (f.type==="dir"?"drwxr-xr-x":"-rw-r--r--")+" 1 civ civ "+f.bytes+" Jan 01 00:00 "+f.name;}).join("\r\n")+(files.length?"\r\n":"");
        if(cmd==="MLST"){await control.write("250-Listing\r\n"+listing+"250 End\r\n");continue;}
        if(await transfer(function(){return data.writeBinary(g.PayloadCore.encode(listing));}))await reply(226,"Listing complete.");continue;
       }
       if(cmd==="SIZE"){var entry=await o.fs.stat(path(cwd,arg));if(entry.type!=="file")throw Error("Not a file.");await reply(213,String(entry.bytes));continue;}
       if(cmd==="DELE"||cmd==="RMD"||cmd==="XRMD"){await o.fs.remove(path(cwd,arg),cmd!=="DELE");await reply(250,"Removed.");continue;}
       if(cmd==="MKD"||cmd==="XMKD"){var dir=path(cwd,arg);await o.fs.mkdir(dir);await reply(257,'"'+dir+'" created');continue;}
       if(cmd==="RNFR"){var from=path(cwd,arg);await o.fs.stat(from);renameFrom=from;await reply(350,"Send destination.");continue;}
       if(cmd==="RNTO"){if(!renameFrom){await reply(503,"Send RNFR first.");continue;}var from=renameFrom;renameFrom=null;await o.fs.rename(from,path(cwd,arg));await reply(250,"Renamed.");continue;}
       if(cmd==="RETR"){var content=await o.fs.read(path(cwd,arg));if(content===null)throw Error("File not found.");if(await transfer(function(){return data.writeBinary(content);}))await reply(226,"Transfer complete.");continue;}
       if(cmd==="STOR"){
        var target=path(cwd,arg),parts=[],length=0,after=null;busy=true;
        try{if(await transfer(async function(){
         var deadline=Date.now()+30000;
         while(!stopped){var bytes=data.receive();if(bytes===null){if(Date.now()>deadline)throw Error("Upload timed out.");await pause();continue;}if(bytes==="")break;deadline=Date.now()+30000;length+=bytes.length;if(length>o.maxBytes)throw Error("Package exceeds upload limit.");parts.push(bytes);await pause();}
         if(stopped)throw Error("Transfer cancelled.");var result=await o.fs.write(target,parts.join(""));after=result&&result.after;
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
