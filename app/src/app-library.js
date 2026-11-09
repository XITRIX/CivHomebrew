/* Replaceable app actions, using the resident's generic app-store transaction. */
(function(g){
 "use strict";
 function create(api){
  var C=g.PayloadCore;
  function selected(entries,id,checksum){
   C.id(id);var entry=entries.find(function(e){return e.id===id;});
   if(!entry)throw Error("App is no longer installed.");
   if(entry.checksum!==checksum)throw Error("App changed; reopen its menu.");return entry;
  }
  async function describe(id,checksum){
   if(api.appStore)return api.appStore(async function(store){var entry=selected(store.entries,id,checksum);return details(entry,await store.manifest(id));});
   // Existing cores can provide information through their read-only file API.
   var entry=selected(api.list(),id,checksum),raw=await api.files.read("/Root/civhomebrew/apps/"+id+"/manifest.json"),text=C.decode(raw);
   if(C.hash(text)!==checksum)throw Error("App details are corrupt or changed; reopen its menu or reinstall it.");
   var m=C.installedManifest(JSON.parse(text));selected(api.list(),id,checksum);
   return details(entry,m);
  }
  function details(entry,m){
   if(m.id!==entry.id||m.name!==entry.name)throw Error("Installed app identity mismatch.");
   return {id:entry.id,name:m.name,metadata:C.metadata(m.metadata),bytes:entry.bytes,scripts:m.scripts.length};
  }
  async function remove(id,checksum){
   if(!api.appStore)throw Error("Update the core once and restart to enable app-store actions.");
   return api.appStore(async function(store){
    selected(store.entries,id,checksum);
    // Retire both catalog references before touching executable files.
    await store.publish(store.entries.filter(function(e){return e.id!==id;}));
    try{
     await store.files.removeDirectory(id);await store.files.commit();
     if(await store.files.read(id,"manifest.json",65536,false)!==null)throw Error("App deletion readback failed.");
    }catch(e){throw Error("The app was removed from the library, but file cleanup failed. Reinstall it to restore the app and clean up its files.\n\n"+e.message);}
   });
  }
  return {describe:describe,remove:remove};
 }
 g.CivAppLibrary={create:create};
})(typeof window!=="undefined"?window:globalThis);
