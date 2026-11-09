/* Core-owned FTP virtual tree and write protection; no arbitrary mount access. */
(function(g){
 "use strict";
 var C=g.PayloadCore,INSTALL="/Install civapp",SAVE="/Root",PLACEHOLDER="drop civapp here";
 var hint="Drop a .civapp into this folder, or upload its contents onto this file, to install it.\r\n";
 function canonical(cwd,input){
  if(typeof input!=="string"||/[\\\x00-\x1f\x7f]/.test(input))throw Error("Invalid FTP path.");
  var parts=(input.charAt(0)==="/"?input:cwd+"/"+input).split("/"),out=[];
  parts.forEach(function(s){if(!s||s===".")return;if(s===".."){out.pop();return;}if(C.encode(s).length>0x300)throw Error("Filename too long.");out.push(s);});
  var path="/"+out.join("/");if(C.encode(path).length>0x300)throw Error("Path too long.");return path;
 }
 function create(o){
  function native(path){if(path===SAVE)return "save:/";if(path.indexOf(SAVE+"/")!==0)throw Error("Virtual directory is read-only.");var suffix=path.slice(SAVE.length+1);if(/^civhomebrew\/inbox(?:\/|$)/i.test(suffix))throw Error("File not found.");if(suffix.indexOf(":")>=0)throw Error("Invalid save path.");return "save:/"+suffix;}
  function writable(path){var p=native(path);if(p==="save:/")throw Error("Cannot modify the save mount root.");if(o.settings().protect&&/^save:\/civhomebrew(?:\/|$)/i.test(p))throw Error("CivHomebrew files are protected. Change FTP Options to allow modifications.");return p;}
  function packageName(path){if(path.indexOf(INSTALL+"/")!==0||path.slice(INSTALL.length+1).indexOf("/")>=0)throw Error("Use the Install civapp folder.");return path.slice(INSTALL.length+1);}
  async function list(path){
   if(path==="/")return [{name:"Install civapp",type:"dir",bytes:0},{name:"Root",type:"dir",bytes:0}];
   if(path===INSTALL)return [{name:PLACEHOLDER,type:"file",bytes:hint.length}];
   if(!o.files)throw Error("Save filesystem unavailable.");var p=native(path),entries=await o.files.list(p);return p.toLowerCase()==="save:/civhomebrew"?entries.filter(function(e){return e.name.toLowerCase()!=="inbox";}):entries;
  }
  async function stat(path){
   if(["/",INSTALL,SAVE].indexOf(path)>=0)return {type:"dir",bytes:0};
   if(path===INSTALL+"/"+PLACEHOLDER)return {type:"file",bytes:hint.length};
   if(path.indexOf(INSTALL+"/")===0)throw Error("File not found.");
   if(!o.files)throw Error("Save filesystem unavailable.");return o.files.stat(native(path));
  }
  async function read(path){
   if(path===INSTALL+"/"+PLACEHOLDER)return hint;
   if(path.indexOf(INSTALL+"/")===0)throw Error("File not found.");
   return o.files.read(native(path),C.maxFrame,true);
  }
  async function write(path,bytes){
   if(path.indexOf(INSTALL+"/")===0){var name=packageName(path);if(name===PLACEHOLDER){var p=C.package(JSON.parse(C.decode(bytes)));name=p.id+".civapp";}return o.submit(name,bytes);}
   var p=writable(path);return o.mutate(async function(){writable(path);await o.files.write(p,bytes,true);await o.files.commit();if(await o.files.read(p,C.maxFrame,true)!==bytes)throw Error("File readback failed.");if(o.changed)await o.changed();return {};});
  }
  async function remove(path,directory){
   if(path.indexOf(INSTALL+"/")===0){var name=packageName(path);if(name===PLACEHOLDER||directory)throw Error("Cannot remove installation placeholder.");throw Error("File not found.");}
   var p=writable(path);return o.mutate(async function(){writable(path);await (directory?o.files.rmdir(p):o.files.remove(p));await o.files.commit();if(o.changed)await o.changed();});
  }
  async function mkdir(path){var p=writable(path);return o.mutate(async function(){writable(path);await o.files.mkdir(p);await o.files.commit();});}
  async function rename(from,to){var a=writable(from),b=writable(to);return o.mutate(async function(){writable(from);writable(to);await o.files.rename(a,b);await o.files.commit();if(o.changed)await o.changed();});}
  return {list:list,stat:stat,read:read,write:write,remove:remove,mkdir:mkdir,rename:rename};
 }
 g.CivFtpFiles={create:create,canonical:canonical};
})(typeof window!=="undefined"?window:globalThis);
