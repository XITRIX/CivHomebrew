/* Core-owned persistent FTP configuration. Passwords are local plaintext. */
(function(g){
 "use strict";
 var C=g.PayloadCore;
 function validate(v){
  if(!v||v.version!==1||typeof v.enabled!=="boolean"||typeof v.anonymous!=="boolean"||typeof v.protect!=="boolean"||!Number.isInteger(v.port)||v.port<1||v.port>65535)throw Error("Invalid FTP settings.");
  if([9026,9027].indexOf(v.port)>=0)throw Error("FTP port conflicts with a core service.");
  ["username","password"].forEach(function(k){if(typeof v[k]!=="string"||v[k].length>128||/[\x00-\x1f\x7f]/.test(v[k]))throw Error("Invalid FTP credentials.");});
  if(v.username!==v.username.trim())throw Error("Username cannot begin or end with spaces.");
  if(v.enabled&&!v.anonymous&&(!v.username.trim()||!v.password))throw Error("Set a username and password before disabling anonymous login.");
  return {version:1,enabled:v.enabled,port:v.port,anonymous:v.anonymous,username:v.username,password:v.password,protect:v.protect};
 }
 function create(io,port){
  var current=null;
  async function load(){var defaults=validate({version:1,enabled:true,port:port||5000,anonymous:true,username:"civhomebrew",password:"",protect:true});try{var text=await io.read(C.path("ftp-settings.json"),65536,false);current=text===null?defaults:validate(C.open(text));return get();}catch(e){current=Object.assign({},defaults,{enabled:false});throw Error("FTP settings unreadable; files preserved and FTP disabled. Configure FTP Options to repair.");}}
  function get(){if(!current)throw Error("FTP settings are not loaded.");return Object.assign({},current);}
  async function save(value){var next=validate(value),text=C.seal(next);await io.ensureDirectory(C.root);await io.write(C.path("ftp-settings.json"),text,false);await io.commit();if(await io.read(C.path("ftp-settings.json"),65536,false)!==text)throw Error("FTP settings readback failed.");current=next;return get();}
  return {load:load,get:get,save:save};
 }
 g.CivFtpSettings={create:create,validate:validate};
})(typeof window!=="undefined"?window:globalThis);
