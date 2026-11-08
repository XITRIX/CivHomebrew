/* Portable package, framing and recovery logic. No browser-only APIs. */
(function (g) {
    "use strict";
    var C = {root:"save:/civhomebrew", maxSource:8*1024*1024, maxIcon:512*1024,
        maxFrame:12*1024*1024, quota:32*1024*1024, maxApps:64};
    C.encode = function (s) { return unescape(encodeURIComponent(s)); };
    C.decode = function (s) { return decodeURIComponent(escape(s)); };
    C.unbase64 = function(s){
        if(typeof s!=="string"||s.length%4||! /^[A-Za-z0-9+/]*={0,2}$/.test(s))throw Error("Invalid base64 icon.");
        var alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",out="",value=0,bits=0;
        for(var i=0;i<s.length&&s.charAt(i)!=="=";i++){
            value=(value<<6)|alphabet.indexOf(s.charAt(i));bits+=6;
            if(bits>=8){bits-=8;out+=String.fromCharCode((value>>>bits)&255);}
        }
        return out;
    };
    C.hash = function (s) {
        var h=2166136261;
        for(var i=0;i<s.length;i++) h=Math.imul(h^s.charCodeAt(i),16777619);
        return (h>>>0).toString(16).padStart(8,"0");
    };
    C.id = function (id) {
        if(typeof id!=="string"||! /^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) throw Error("Invalid payload ID (use lowercase letters, digits and hyphens).");
        return id;
    };
    C.path = function (name) {
        if(typeof name!=="string"||! /^(catalog-[01]\.json|package-[1-9][0-9]*\.json)$/.test(name)) throw Error("Invalid owned filename.");
        return C.root+"/"+name;
    };
    C.package = function (p) {
        if(!p||p.format!=="civswitch-app"||p.version!==1) throw Error("Unsupported .civapp package version.");
        C.id(p.id);
        if(typeof p.name!=="string"||!p.name.trim()||p.name.length>80||/[\x00-\x1f\x7f]/.test(p.name)) throw Error("Payload name must be 1–80 printable characters.");
        if(!Array.isArray(p.scripts)||!p.scripts.length||p.scripts.length>64) throw Error("Package requires 1–64 ordered scripts.");
        var names={},size=0;
        var scripts=p.scripts.map(function(s){
            if(!s||typeof s.name!=="string"||s.name.length>160||! /^[a-zA-Z0-9_./-]+\.js$/.test(s.name)||s.name.split("/").some(function(c){return !c||c==="."||c==="..";})||names[s.name]) throw Error("Invalid or duplicate script name.");
            names[s.name]=true;
            if(typeof s.source!=="string"||!s.source.trim()) throw Error("Empty script.");
            size+=C.encode(s.source).length;
            return {name:s.name,source:s.source};
        });
        if(size>C.maxSource) throw Error("Payload scripts exceed 8 MiB.");
        var m=p.metadata||{},metadata={};
        [["author",80],["release",32],["description",500]].forEach(function(field){var v=m[field[0]]||"";if(typeof v!=="string"||v.length>field[1]||/[\x00-\x1f\x7f]/.test(v))throw Error("Invalid "+field[0]+" metadata.");metadata[field[0]]=v;});
        if(m.api!==undefined&&m.api!==1)throw Error("Package requires an unsupported launcher API.");metadata.api=1;
        var icon=p.icon||"";
        if(typeof icon!=="string") throw Error("Invalid icon.");
        if(icon) {
            if(icon.length>22+Math.ceil(C.maxIcon/3)*4||!/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(icon)) throw Error("Icon must be a PNG data URL (at most 512 KiB).");
            var raw=C.unbase64(icon.slice(22));
            if(raw.length<33||raw.length>C.maxIcon||raw.slice(0,8)!=="\x89PNG\r\n\x1a\n"||raw.slice(12,16)!=="IHDR") throw Error("Invalid PNG icon.");
            function u32(i){return (raw.charCodeAt(i)*16777216+raw.charCodeAt(i+1)*65536+raw.charCodeAt(i+2)*256+raw.charCodeAt(i+3));}
            if(u32(16)!==256||u32(20)!==256) throw Error("Icon must be exactly 256×256 pixels.");
        }
        return {format:"civswitch-app",version:1,id:p.id,name:p.name.trim(),scripts:scripts,metadata:metadata,icon:icon};
    };
    C.source = function(p){return p.scripts.map(function(s){return s.source;}).join("\n;\n");};
    C.seal = function (value) {var data=JSON.stringify(value);return JSON.stringify({data:data,checksum:C.hash(data)});};
    C.open = function (text) {
        var e=JSON.parse(text);
        if(!e||typeof e.data!=="string"||e.checksum!==C.hash(e.data)) throw Error("Stored data checksum mismatch.");
        return JSON.parse(e.data);
    };
    C.catalog = function (value) {
        if(!value||value.version!==1||!Number.isSafeInteger(value.generation)||value.generation<1||!Array.isArray(value.entries)||value.entries.length>C.maxApps) throw Error("Invalid catalog.");
        var ids={},files={},total=0;
        value.entries.forEach(function(e){
            C.id(e.id);C.path(e.file);
            if(!/^package-/.test(e.file)||ids[e.id]||files[e.file]||typeof e.name!=="string"||e.name.length>80||!Number.isSafeInteger(e.bytes)||e.bytes<1||e.bytes>C.maxFrame||! /^[0-9a-f]{8}$/.test(e.checksum)) throw Error("Invalid catalog entry.");
            ids[e.id]=files[e.file]=true;total+=e.bytes;
        });
        if(total>C.quota) throw Error("Catalog exceeds storage quota.");
        return value;
    };
    C.createStore = function (io) {
        var state=null, slots=[null,null], poisoned=false;
        async function load() {
            var existing=0, failures=[];slots=[null,null];
            for(var i=0;i<2;i++) {
                try {
                    var text=await io.read(C.path("catalog-"+i+".json"),65536);
                    if(text===null) continue;
                    existing++;
                    var candidate=C.catalog(C.open(text));
                    if(candidate.generation%2!==i) throw Error("Catalog slot mismatch.");
                    slots[i]=candidate;
                } catch(e) {existing++;failures.push(e.message);}
            }
            var valid=slots.filter(Boolean).sort(function(a,b){return b.generation-a.generation;});
            if(!valid.length&&existing) {poisoned=true;throw Error("Both catalog slots are unreadable. Files were preserved; recover from a backup before installing.");}
            state=valid[0]||{version:1,generation:0,entries:[]};poisoned=false;
            return {entries:state.entries.slice(),recovered:failures.length>0};
        }
        async function readPackage(entry) {
            var text=await io.read(C.path(entry.file),C.maxFrame);
            if(text===null||C.encode(text).length!==entry.bytes||C.hash(text)!==entry.checksum) throw Error("Payload is missing or corrupt: "+entry.name+". Reinstall it from the PC.");
            var p=C.package(C.open(text));
            if(p.id!==entry.id||p.name!==entry.name) throw Error("Payload identity mismatch.");
            return p;
        }
        async function install(input) {
            if(!state||poisoned) throw Error("Catalog unavailable; installation disabled.");
            var p=C.package(input), generation=state.generation+1;
            if(!Number.isSafeInteger(generation)) throw Error("Generation overflow.");
            var file="package-"+generation+".json", text=C.seal(p), bytes=C.encode(text).length;
            if(bytes>C.maxFrame) throw Error("Packaged payload is too large.");
            var entries=state.entries.filter(function(e){return e.id!==p.id;});
            var entry={id:p.id,name:p.name,file:file,bytes:bytes,checksum:C.hash(text)};
            var priorIndex=state.entries.findIndex(function(e){return e.id===p.id;});
            entries.splice(priorIndex<0?entries.length:priorIndex,0,entry);
            if(entries.length>C.maxApps) throw Error("At most 64 installed payloads are supported.");
            // Reserve the previous generation too, so an update remains recoverable.
            var usage=bytes, seen={};
            slots.filter(Boolean).forEach(function(s){s.entries.forEach(function(e){if(!seen[e.file]){seen[e.file]=true;usage+=e.bytes;}});});
            if(usage>C.quota) throw Error("32 MiB payload quota exceeded (including recovery copies).");
            var next=C.catalog({version:1,generation:generation,entries:entries});
            await io.ensure();
            await io.write(C.path(file),text);await io.commit();
            if(await io.read(C.path(file),C.maxFrame)!==text) throw Error("Payload readback failed; catalog unchanged.");
            var catalog=C.seal(next), slot=generation%2;
            // From this point a failed commit/readback has an uncertain outcome.
            // Require a fresh load before another mutation; never reuse the generation.
            poisoned=true;
            await io.write(C.path("catalog-"+slot+".json"),catalog);await io.commit();
            if(await io.read(C.path("catalog-"+slot+".json"),65536)!==catalog) throw Error("Catalog readback failed; restart the menu before installing again.");
            var old=slots[slot];slots[slot]=next;state=next;poisoned=false;
            // Remove only files known to an overwritten valid slot and no longer referenced.
            if(old&&io.remove) {
                var retained={};slots.filter(Boolean).forEach(function(s){s.entries.forEach(function(e){retained[e.file]=true;});});
                try {for(var j=0;j<old.entries.length;j++) if(!retained[old.entries[j].file]) await io.remove(C.path(old.entries[j].file));await io.commit();} catch(_) { /* Recoverable stale files; never fail an already committed install. */ }
            }
            return entry;
        }
        return {load:load,install:install,list:function(){return state?state.entries.slice():[];},
            read:async function(id){C.id(id);var e=state&&state.entries.find(function(x){return x.id===id;});if(!e)throw Error("Payload not installed.");return readPackage(e);}};
    };
    C.frame = function (value) {
        var s=C.encode(JSON.stringify(value)), n=s.length;
        if(n<1||n>C.maxFrame) throw Error("Frame too large.");
        return String.fromCharCode(n>>>24,(n>>>16)&255,(n>>>8)&255,n&255)+s;
    };
    C.frameReader = function () {
        var chunks=[],length=0,expected=null,done=false;
        return {push:function(bytes){
            if(done)throw Error("Extra frame data.");
            chunks.push(bytes);length+=bytes.length;
            if(expected===null&&length>=4){var head=chunks.join("");expected=head.charCodeAt(0)*16777216+head.charCodeAt(1)*65536+head.charCodeAt(2)*256+head.charCodeAt(3);if(expected<1||expected>C.maxFrame)throw Error("Invalid frame length.");chunks=[head];}
            if(expected!==null&&length>expected+4)throw Error("Trailing frame data.");
            if(expected!==null&&length===expected+4){done=true;return {value:JSON.parse(C.decode(chunks.join("").slice(4)))};}
            return null;
        }};
    };
    g.PayloadCore=C;
})(typeof window!=="undefined"?window:globalThis);
