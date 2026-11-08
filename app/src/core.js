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
        if(typeof name!=="string")throw Error("Invalid owned path.");
        if(/^(catalog-[01]\.json|package-[1-9][0-9]*\.json)$/.test(name))return C.root+"/"+name;
        var parts=name.split("/");
        if(parts[0]!=="apps")throw Error("Invalid owned path.");
        if(parts.length===1)return C.root+"/apps";
        C.id(parts[1]);
        if(parts.length>2){
            var tail=parts.slice(2);
            if(tail[0]!=="scripts"&&!(tail.length===1&&(tail[0]==="manifest.json"||tail[0]==="icon.png")))throw Error("Invalid app path.");
            tail.forEach(function(part){if(!part||part==="."||part===".."||! /^[A-Za-z0-9_.-]+$/.test(part))throw Error("Invalid app path.");});
        }
        return C.root+"/"+name;
    };
    C.appPath = function(id,name){return C.path("apps/"+C.id(id)+(name?"/"+name:""));};
    C.scriptName = function(name){
        if(typeof name!=="string"||name.length>160||! /^[A-Za-z0-9_./-]+\.js$/.test(name)||name.split("/").some(function(c){return !c||c==="."||c==="..";}))throw Error("Invalid script name.");
        return name;
    };
    C.scriptNames = function(scripts){
        var files=Object.create(null),directories=Object.create(null);
        scripts.forEach(function(s){
            if(!s)throw Error("Invalid script.");var name=C.scriptName(s.name).toLowerCase();
            if(files[name]||directories[name])throw Error("Duplicate or conflicting script path.");
            files[name]=true;var parts=name.split("/");parts.pop();
            while(parts.length){var parent=parts.join("/");if(files[parent])throw Error("Conflicting script file/directory path.");directories[parent]=true;parts.pop();}
        });
    };
    C.metadata = function(input){
        var m=input===undefined?{}:input,out={};
        if(!m||typeof m!=="object"||Array.isArray(m))throw Error("Invalid metadata.");
        [["author",80],["release",32],["description",500]].forEach(function(f){var v=m[f[0]]===undefined?"":m[f[0]];if(typeof v!=="string"||v.length>f[1]||/[\x00-\x1f\x7f]/.test(v))throw Error("Invalid "+f[0]+" metadata.");out[f[0]]=v;});
        if(m.api!==undefined&&m.api!==1)throw Error("Package requires an unsupported launcher API.");out.api=1;return out;
    };
    C.png = function(raw){
        if(typeof raw!=="string"||raw.length<33||raw.length>C.maxIcon||raw.slice(0,8)!=="\x89PNG\r\n\x1a\n"||raw.slice(12,16)!=="IHDR")throw Error("Invalid PNG icon.");
        function u32(i){return raw.charCodeAt(i)*16777216+raw.charCodeAt(i+1)*65536+raw.charCodeAt(i+2)*256+raw.charCodeAt(i+3);}
        if(u32(16)!==256||u32(20)!==256)throw Error("Icon must be exactly 256×256 pixels.");return raw;
    };
    C.base64 = function(raw){
        var alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",out="";
        for(var i=0;i<raw.length;i+=3){var a=raw.charCodeAt(i),b=i+1<raw.length?raw.charCodeAt(i+1):0,c=i+2<raw.length?raw.charCodeAt(i+2):0;
            out+=alphabet.charAt(a>>2)+alphabet.charAt(((a&3)<<4)|(b>>4))+(i+1<raw.length?alphabet.charAt(((b&15)<<2)|(c>>6)):"=")+(i+2<raw.length?alphabet.charAt(c&63):"=");}
        return out;
    };
    C.package = function (p) {
        if(!p||p.format!=="civswitch-app"||p.version!==1) throw Error("Unsupported .civapp package version.");
        C.id(p.id);
        if(typeof p.name!=="string"||!p.name.trim()||p.name.length>80||/[\x00-\x1f\x7f]/.test(p.name)) throw Error("Payload name must be 1–80 printable characters.");
        if(!Array.isArray(p.scripts)||!p.scripts.length||p.scripts.length>64) throw Error("Package requires 1–64 ordered scripts.");
        C.scriptNames(p.scripts);var size=0;
        var scripts=p.scripts.map(function(s){
            if(!s)throw Error("Invalid script.");C.scriptName(s.name);
            if(typeof s.source!=="string"||!s.source.trim()) throw Error("Empty script.");
            size+=C.encode(s.source).length;
            return {name:s.name,source:s.source};
        });
        if(size>C.maxSource) throw Error("Payload scripts exceed 8 MiB.");
        var metadata=C.metadata(p.metadata);
        var icon=p.icon||"";
        if(typeof icon!=="string") throw Error("Invalid icon.");
        if(icon) {
            if(icon.length>22+Math.ceil(C.maxIcon/3)*4||!/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(icon)) throw Error("Icon must be a PNG data URL (at most 512 KiB).");
            C.png(C.unbase64(icon.slice(22)));
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
    C.catalog = function(value){
        if(!value||(value.version!==1&&value.version!==2)||!Number.isSafeInteger(value.generation)||value.generation<1||!Array.isArray(value.entries)||value.entries.length>C.maxApps)throw Error("Invalid catalog.");
        var ids=Object.create(null),files=Object.create(null),total=0;
        value.entries.forEach(function(e){
            C.id(e.id);
            if(ids[e.id]||typeof e.name!=="string"||!e.name.trim()||e.name.length>80||!Number.isSafeInteger(e.bytes)||e.bytes<1||e.bytes>C.maxFrame||! /^[0-9a-f]{8}$/.test(e.checksum))throw Error("Invalid catalog entry.");
            if(value.version===1){C.path(e.file);if(! /^package-/.test(e.file)||files[e.file])throw Error("Invalid legacy package.");files[e.file]=true;}
            ids[e.id]=true;total+=e.bytes;
        });
        if(total>C.quota)throw Error("Catalog exceeds storage quota.");return value;
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
