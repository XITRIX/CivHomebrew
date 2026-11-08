/* Installed apps are ordinary files; .civapp remains the distribution format. */
(function(g){
    "use strict";
    var C=g.PayloadCore;
    function descriptor(name,text,binary){return {name:name,data:text,binary:!!binary,bytes:binary?text.length:C.encode(text).length,checksum:C.hash(text)};}
    C.installPlan=function(input){
        var p=C.package(input),files=p.scripts.map(function(s){return descriptor("scripts/"+s.name,s.source,false);});
        var manifest={format:"civswitch-installed-app",version:1,id:p.id,name:p.name,metadata:p.metadata,
            scripts:files.map(function(f,i){return {name:p.scripts[i].name,path:f.name,bytes:f.bytes,checksum:f.checksum};}),icon:null};
        if(p.icon){var icon=descriptor("icon.png",C.unbase64(p.icon.slice(22)),true);files.push(icon);manifest.icon={path:icon.name,bytes:icon.bytes,checksum:icon.checksum};}
        var text=JSON.stringify(manifest),bytes=C.encode(text).length;
        if(bytes>65536)throw Error("Installed manifest exceeds 64 KiB.");
        files.forEach(function(f){bytes+=f.bytes;});
        return {id:p.id,manifest:manifest,text:text,files:files,entry:{id:p.id,name:p.name,bytes:bytes,checksum:C.hash(text)}};
    };
    C.installedManifest=function(value){
        if(!value||value.format!=="civswitch-installed-app"||value.version!==1)throw Error("Invalid installed manifest.");
        C.id(value.id);
        if(typeof value.name!=="string"||!value.name.trim()||value.name.length>80||/[\x00-\x1f\x7f]/.test(value.name))throw Error("Invalid app name.");
        C.metadata(value.metadata);
        if(!Array.isArray(value.scripts)||value.scripts.length<1||value.scripts.length>64)throw Error("Invalid installed scripts.");
        C.scriptNames(value.scripts);var total=0;
        value.scripts.forEach(function(s){
            if(s.path!=="scripts/"+s.name||!Number.isSafeInteger(s.bytes)||s.bytes<1||! /^[0-9a-f]{8}$/.test(s.checksum))throw Error("Invalid installed script descriptor.");
            C.appPath(value.id,s.path);total+=s.bytes;
        });
        if(total>C.maxSource)throw Error("Installed scripts exceed 8 MiB.");
        if(value.icon!==null){var icon=value.icon;if(!icon||icon.path!=="icon.png"||!Number.isSafeInteger(icon.bytes)||icon.bytes<33||icon.bytes>C.maxIcon||! /^[0-9a-f]{8}$/.test(icon.checksum))throw Error("Invalid installed icon descriptor.");}
        return value;
    };
    C.createStore=function(io){
        var state=null,slots=[null,null],poisoned=false,mutating=false;
        function ready(){if(!state||poisoned||state.version!==2)throw Error("Catalog unavailable; restart the menu before installing.");}
        async function ensure(){
            if(typeof io.ensureDirectory!=="function"||typeof io.removeDirectory!=="function")throw Error("Folder installation is not supported by this storage adapter.");
            await io.ensureDirectory(C.root);await io.ensureDirectory(C.path("apps"));
        }
        async function checkedWrite(path,data,binary,limit){
            await io.write(path,data,binary);await io.commit();
            if(await io.read(path,limit,binary)!==data)throw Error("Installed file readback failed.");
        }
        async function publish(entries){
            await io.ensureDirectory(C.root);
            // Both slots describe the same live folders. Replaced app data is not retained.
            for(var i=0;i<2;i++){
                var next=C.catalog({version:2,generation:state.generation+1,entries:entries});
                var slot=next.generation%2,text=C.seal(next);poisoned=true;
                await checkedWrite(C.path("catalog-"+slot+".json"),text,false,65536);
                state=next;slots[slot]=next;
            }
            poisoned=false;
        }
        async function writeFolder(plan){
            var root=C.appPath(plan.id);
            await ensure();
            // User-requested clean replacement: deletion is committed before new files.
            await io.removeDirectory(root);await io.commit();
            try{
                await io.ensureDirectory(root);await io.ensureDirectory(C.appPath(plan.id,"scripts"));
                var made=Object.create(null);
                for(var i=0;i<plan.files.length;i++){
                    var file=plan.files[i],parts=file.name.split("/");parts.pop();
                    for(var j=1;j<=parts.length;j++){
                        var relative=parts.slice(0,j).join("/");
                        if(!made[relative]){await io.ensureDirectory(C.appPath(plan.id,relative));made[relative]=true;}
                    }
                    await io.write(C.appPath(plan.id,file.name),file.data,file.binary);
                }
                await io.commit();
                for(var k=0;k<plan.files.length;k++){
                    var f=plan.files[k];
                    if(await io.read(C.appPath(plan.id,f.name),f.bytes,f.binary)!==f.data)throw Error("Installed file readback failed: "+f.name);
                }
                // A partial folder has no manifest and is never executable.
                await checkedWrite(C.appPath(plan.id,"manifest.json"),plan.text,false,65536);
                return plan.entry;
            }catch(e){
                try{await io.removeDirectory(root);await io.commit();}catch(_){}
                throw e;
            }
        }
        function legacyFiles(){
            var files=Object.create(null);slots.forEach(function(slot){if(slot&&slot.version===1)slot.entries.forEach(function(e){files[e.file]=true;});});return Object.keys(files);
        }
        async function cleanupLegacy(files){
            if(!io.remove)return;
            for(var i=0;i<files.length;i++)await io.remove(C.path(files[i]));
            if(files.length)await io.commit();
        }
        async function legacyPackage(entry){
            var text=await io.read(C.path(entry.file),C.maxFrame,false);
            if(text===null||C.encode(text).length!==entry.bytes||C.hash(text)!==entry.checksum)throw Error("Legacy payload is missing or corrupt: "+entry.name);
            var p=C.package(C.open(text));if(p.id!==entry.id||p.name!==entry.name)throw Error("Legacy payload identity mismatch.");return p;
        }
        async function load(){
            if(mutating)throw Error("Storage is busy.");mutating=true;
            try{
                var existing=0,failures=[];state=null;slots=[null,null];
                for(var i=0;i<2;i++){
                    try{
                        var text=await io.read(C.path("catalog-"+i+".json"),65536,false);
                        if(text===null)continue;existing++;
                        var candidate=C.catalog(C.open(text));if(candidate.generation%2!==i)throw Error("Catalog slot mismatch.");slots[i]=candidate;
                    }catch(e){existing++;failures.push(e.message);}
                }
                var valid=slots.filter(Boolean).sort(function(a,b){return b.generation-a.generation;});
                if(!valid.length&&existing){poisoned=true;throw Error("Both catalog slots are unreadable. Files were preserved; recover from a backup before installing.");}
                state=valid[0]||{version:2,generation:0,entries:[]};poisoned=false;
                var oldFiles=legacyFiles(),migrated=state.version===1;
                if(migrated){
                    var entries=[];
                    for(var j=0;j<state.entries.length;j++)entries.push(await writeFolder(C.installPlan(await legacyPackage(state.entries[j]))));
                    await publish(entries);
                }else if(oldFiles.length){
                    // Finish an interrupted catalog mirror before retiring legacy packages.
                    for(var k=0;k<state.entries.length;k++)await manifest(state.entries[k].id);
                    await publish(state.entries);
                }
                await cleanupLegacy(oldFiles);
                return {entries:state.entries.slice(),recovered:failures.length>0,migrated:migrated};
            }catch(e){poisoned=true;throw e;}finally{mutating=false;}
        }
        function entryFor(id){C.id(id);var e=state&&state.entries.find(function(x){return x.id===id;});if(!e)throw Error("Payload not installed.");return e;}
        async function manifest(id){
            var entry=entryFor(id),text=await io.read(C.appPath(id,"manifest.json"),65536,false);
            if(text===null||C.hash(text)!==entry.checksum)throw Error("App manifest is missing or corrupt: "+entry.name+". Reinstall it from the PC.");
            var value=C.installedManifest(JSON.parse(text)),total=C.encode(text).length;
            value.scripts.forEach(function(s){total+=s.bytes;});if(value.icon)total+=value.icon.bytes;
            if(value.id!==entry.id||value.name!==entry.name||total!==entry.bytes)throw Error("Installed app identity or size mismatch.");return value;
        }
        async function icon(id){
            var m=await manifest(id);if(!m.icon)return "";
            var raw=await io.read(C.appPath(id,"icon.png"),m.icon.bytes,true);
            if(raw===null||raw.length!==m.icon.bytes||C.hash(raw)!==m.icon.checksum)throw Error("App icon is missing or corrupt.");
            return "data:image/png;base64,"+C.base64(C.png(raw));
        }
        async function read(id,onProgress){
            var m=await manifest(id),scripts=[],loaded=0,total=m.scripts.reduce(function(n,s){return n+s.bytes;},0);
            function progress(bytes){if(typeof onProgress==="function")onProgress(bytes,total);}
            progress(0);
            for(var i=0;i<m.scripts.length;i++){
                var s=m.scripts[i],source=await io.read(C.appPath(id,s.path),s.bytes,false,function(bytes){
                    // The final byte is complete only after integrity verification.
                    progress(Math.min(total-1,loaded+Math.max(0,Math.min(s.bytes,bytes))));
                });
                if(source===null||!source.trim()||C.encode(source).length!==s.bytes||C.hash(source)!==s.checksum)throw Error("App script is missing or corrupt: "+s.name+". Reinstall it from the PC.");
                scripts.push({name:s.name,source:source});loaded+=s.bytes;progress(loaded);
            }
            return {format:"civswitch-app",version:1,id:m.id,name:m.name,metadata:m.metadata,scripts:scripts,icon:""};
        }
        async function install(input){
            ready();if(mutating)throw Error("Storage is busy.");mutating=true;
            try{
                var plan=C.installPlan(input),original=state.entries,position=original.findIndex(function(e){return e.id===plan.id;});
                var entries=original.filter(function(e){return e.id!==plan.id;});entries.splice(position<0?entries.length:position,0,plan.entry);
                // Validate names, all paths, count and quota before deleting a previous app.
                C.catalog({version:2,generation:state.generation+1,entries:entries});await ensure();
                if(position>=0)await publish(original.filter(function(e){return e.id!==plan.id;}));
                var entry=await writeFolder(plan);
                await publish(entries);return entry;
            }finally{mutating=false;}
        }
        return {load:load,install:install,list:function(){return state?state.entries.slice():[];},manifest:manifest,icon:icon,read:read};
    };
})(typeof window!=="undefined"?window:globalThis);
