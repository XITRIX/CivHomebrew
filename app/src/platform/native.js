/* Civ VII 1.0.0 SDK bridge, adapted from the verified CivSwitch Moonlight ABI. */
(function () {
    "use strict";
    var C=window.PayloadCore, S="_ZN2nn6socket";
    var available=typeof sdk_base!=="undefined"&&typeof call_rop==="function";
    window.PayloadNative={available:available,create:create};
    function create() {
        if(!available) throw Error("CivSwitch native bridge unavailable.");
        var cache={},mod=sdk_base+read32(sdk_base+4n);
        if(read32(mod)!==0x30444f4dn) throw Error("Unsupported SDK module.");
        var dynamic=mod+BigInt.asIntN(32,read32(mod+4n)), tags={};
        for(var i=0;i<128;i++){var tag=Number(read64(dynamic+BigInt(i*16)));if(!tag)break;var v=read64(dynamic+BigInt(i*16+8));tags[tag]=v<sdk_base?sdk_base+v:v;}
        var table=tags[4],strings=tags[5],symbols=tags[6];
        if(!table||!strings||!symbols) throw Error("SDK export table missing.");
        var buckets=Number(read32(table)),count=Number(read32(table+4n));
        if(buckets<1||buckets>1000000||count<1||count>1000000) throw Error("Invalid SDK export bounds.");
        function resolve(name){
            if(cache[name])return cache[name];
            var hash=0;
            for(var j=0;j<name.length;j++){hash=((hash<<4)+name.charCodeAt(j))>>>0;var high=hash&0xf0000000;if(high)hash^=high>>>24;hash=(hash&~high)>>>0;}
            var index=Number(read32(table+8n+BigInt((hash%buckets)*4)));
            for(var k=0;index&&k<count;k++){
                if(index>=count)throw Error("Invalid SDK symbol chain.");
                var symbol=symbols+BigInt(index*24),p=strings+read32(symbol),s="";
                for(var q=0;q<512;q++){var ch=Number(read8(p+BigInt(q)));if(!ch)break;s+=String.fromCharCode(ch);}
                if(s===name){var offset=read64(symbol+8n);if(offset)return cache[name]=sdk_base+offset;break;}
                index=Number(read32(table+8n+BigInt((buckets+index)*4)));
            }
            throw Error("Missing SDK export: "+name);
        }
        function call(name){return call_rop.apply(null,[resolve(name)].concat(Array.prototype.slice.call(arguments,1).map(BigInt)));}
        function code(v){return Number(v&0x3fffffn);}
        function checked(name){var r=call.apply(null,arguments);if(code(r))throw Error("File operation failed: 0x"+code(r).toString(16));return r;}
        function signed(v){return Number(BigInt.asIntN(32,v));}
        function sock(name){return signed(call.apply(null,[S+name].concat(Array.prototype.slice.call(arguments,1))));}
        function retry(){var e=sock("12GetLastErrnoEv");return e===11||e===35||e===4;}
        function pause(){return new Promise(function(r){setTimeout(r,10);});}
        function alloc(n){var p=malloc(n);if(!p)throw Error("Native allocation failed.");return p;}
        function binary(bytes){var s="";for(var n=0;n<bytes.length;n++)s+=String.fromCharCode(Number(bytes[n]));return s;}
        function put(p,s){var bytes=new Uint8Array(s.length);for(var n=0;n<s.length;n++)bytes[n]=s.charCodeAt(n);write_buffer(p,bytes);}
        function nonblock(fd){var f=sock("5FcntlEiiz",fd,3,0);if(f<0||sock("5FcntlEiiz",fd,4,f|0x800)<0)throw Error("Cannot make socket nonblocking.");}
        function pathOp(name,path,allowed){var p=alloc_string(path);try{var r=code(call("_ZN2nn2fs"+name,p));if(r&&r!==allowed)throw Error("Save operation failed: 0x"+r.toString(16));}finally{free(p);}}
        function owned(path,allowRoot){if(allowRoot&&path===C.root)return;var name=typeof path==="string"&&path.slice(C.root.length+1);if(!name||C.path(name)!==path)throw Error("Refusing a path outside CivHomebrew.");}
        async function read(path,limit,asBinary){
            owned(path);if(!Number.isInteger(limit)||limit<1||limit>C.maxFrame)throw Error("Invalid file limit.");
            var p,handle,size,buffer,opened=false;
            try{
                p=alloc_string(path);handle=alloc(8);size=alloc(8);buffer=alloc(65536);
                var r=code(call("_ZN2nn2fs8OpenFileEPNS0_10FileHandleEPKci",handle,p,1));
                if(r===0x202)return null;if(r)throw Error("Save read failed: 0x"+r.toString(16));opened=true;
                checked("_ZN2nn2fs11GetFileSizeEPlNS0_10FileHandleE",size,read64(handle));
                var length=Number(read64(size));if(!Number.isSafeInteger(length)||length<0||length>limit)throw Error("Stored file exceeds its limit.");
                var parts=[];
                for(var off=0;off<length;off+=65536){var n=Math.min(65536,length-off);checked("_ZN2nn2fs8ReadFileENS0_10FileHandleElPvm",read64(handle),off,buffer,n);parts.push(binary(read_buffer(buffer,n)));await pause();}
                return asBinary?parts.join(""):C.decode(parts.join(""));
            }finally{try{if(opened)call("_ZN2nn2fs9CloseFileENS0_10FileHandleE",read64(handle));}finally{[buffer,size,handle,p].forEach(function(x){if(x)free(x);});}}
        }
        async function write(path,text,asBinary){
            owned(path);var bytes=asBinary?text:C.encode(text);if(typeof bytes!=="string")throw Error("Expected file bytes.");if(bytes.length>C.maxFrame)throw Error("Save file too large.");
            var p,handle,option,buffer,opened=false;
            try{
                p=alloc_string(path);handle=alloc(8);option=alloc(8);buffer=alloc(65536);
                var r=code(call("_ZN2nn2fs10CreateFileEPKcl",p,bytes.length));if(r&&r!==0x402)throw Error("Save create failed: 0x"+r.toString(16));
                checked("_ZN2nn2fs8OpenFileEPNS0_10FileHandleEPKci",handle,p,6);opened=true;
                checked("_ZN2nn2fs11SetFileSizeENS0_10FileHandleEl",read64(handle),bytes.length);write32(option,1n);
                for(var off=0;off<bytes.length;off+=65536){var piece=bytes.slice(off,off+65536);put(buffer,piece);checked("_ZN2nn2fs9WriteFileENS0_10FileHandleElPKvmRKNS0_11WriteOptionE",read64(handle),off,buffer,piece.length,option);await pause();}
            }finally{try{if(opened)call("_ZN2nn2fs9CloseFileENS0_10FileHandleE",read64(handle));}finally{[buffer,option,handle,p].forEach(function(x){if(x)free(x);});}}
        }
        ["_ZN2nn2fs15CreateDirectoryEPKc","_ZN2nn2fs26DeleteDirectoryRecursivelyEPKc"].forEach(resolve);
        var io={read:read,write:write,
            ensureDirectory:function(path){owned(path,true);pathOp("15CreateDirectoryEPKc",path,0x402);},
            removeDirectory:function(path){
                var prefix=C.root+"/apps/",id=typeof path==="string"&&path.slice(prefix.length);
                if(!id||C.appPath(id)!==path)throw Error("Refusing to remove anything outside one app directory.");
                pathOp("26DeleteDirectoryRecursivelyEPKc",path,0x202);
            },
            commit:function(){pathOp("6CommitEPKc","save",0);},remove:function(path){owned(path);pathOp("10DeleteFileEPKc",path,0x202);}};
        function ip(){
            var fd=-1,p,len;
            try{
                p=alloc(16);len=alloc(8);fd=sock("6SocketEiii",2,2,0);if(fd<0)return null;nonblock(fd);
                // UDP route lookup only: no packet is sent to this address.
                put(p,String.fromCharCode(16,2,0,80,8,8,8,8,0,0,0,0,0,0,0,0));
                if(sock("7ConnectEiPK8sockaddrj",fd,p,16)<0)return null;
                write32(len,16n);if(sock("11GetSockNameEiP8sockaddrPj",fd,p,len)<0)return null;
                var parts=[];for(var i=4;i<8;i++)parts.push(Number(read8(p+BigInt(i))));return parts.join(".")!=="0.0.0.0"?parts.join("."):null;
            }finally{try{if(fd>=0)sock("5CloseEi",fd);}finally{if(len)free(len);if(p)free(p);}}
        }
        function serve(port,dispatch,onError){
            if(!Number.isInteger(port)||port<1||port>65535)throw Error("Invalid companion port.");
            // Resolve the new server exports before allocating/starting anything.
            ["6SocketEiii","4BindEiPK8sockaddrj","6ListenEii","6AcceptEiP8sockaddrPj","5FcntlEiiz","4RecvEiPvmi","4SendEiPKvmi","5CloseEi","10SetSockOptEiiiPKvj"].forEach(function(n){resolve(S+n);});
            var listener=-1,client=-1,address,buffer,stopped=false,task;
            function drop(){if(client>=0){sock("5CloseEi",client);client=-1;}}
            try{
                address=alloc(16);buffer=alloc(16384);listener=sock("6SocketEiii",2,1,0);if(listener<0)throw Error("Cannot create companion listener.");nonblock(listener);
                write32(buffer,1n);sock("10SetSockOptEiiiPKvj",listener,0xffff,4,buffer,4);
                put(address,String.fromCharCode(16,2,port>>8,port&255,0,0,0,0,0,0,0,0,0,0,0,0));
                if(sock("4BindEiPK8sockaddrj",listener,address,16)<0||sock("6ListenEii",listener,3)<0)throw Error("Cannot listen on companion port "+port+".");
            }catch(e){if(listener>=0)sock("5CloseEi",listener);if(buffer)free(buffer);if(address)free(address);throw e;}
            async function sendResponse(value){
                var wire=C.frame(value),offset=0,deadline=Date.now()+10000;
                while(!stopped&&offset<wire.length){
                    if(Date.now()>deadline)throw Error("Companion response timed out.");
                    var piece=wire.slice(offset,offset+16384);put(buffer,piece);
                    var n=sock("4SendEiPKvmi",client,buffer,piece.length,0x80);
                    if(n>0)offset+=n;else if(n===0||!retry())throw Error("Companion disconnected.");
                    await pause();
                }
                return offset===wire.length;
            }
            task=(async function(){
                try{
                    while(!stopped){
                        write32(buffer,16n);client=sock("6AcceptEiP8sockaddrPj",listener,address,buffer);
                        if(client<0){if(!retry())throw Error("Companion accept failed.");await pause();continue;}
                        var after=null;
                        try{
                            nonblock(client);write32(buffer,1n);sock("10SetSockOptEiiiPKvj",client,0xffff,0x800,buffer,4);var reader=C.frameReader(),start=Date.now(),idle=start,result=null;
                            while(!stopped&&!result){
                                if(Date.now()-start>120000||Date.now()-idle>10000)throw Error("Companion upload timed out.");
                                // At most 16 KiB of new work per turn, even with readable sockets.
                                var n=sock("4RecvEiPvmi",client,buffer,16384,0x80);
                                if(n>0){idle=Date.now();result=reader.push(binary(read_buffer(buffer,n)));}
                                else if(n===0||!retry())throw Error("Incomplete companion request.");
                                await pause();
                            }
                            if(result&&!stopped){var reply=await dispatch(result.value);if(await sendResponse(reply.response))after=reply.after;}
                        }catch(e){if(!stopped){try{await sendResponse({ok:false,error:String(e.message).slice(0,240)});}catch(_){} }}
                        finally{drop();}
                        // Schedule only after the response has been written and this client is closed.
                        if(after&&!stopped)setTimeout(after,0);
                        await pause();
                    }
                }catch(e){if(!stopped&&onError)onError(e);}
                finally{try{drop();if(listener>=0)sock("5CloseEi",listener);}finally{listener=-1;free(buffer);free(address);}}
            })();
            return {stop:function(){stopped=true;return task;}};
        }
        function rawTransport(borrowed,port){
            var listener=-1,originalFlags=null,address=null,buffer=null,owned=borrowed===null||borrowed===undefined,closed=false;
            try{
                address=alloc(16);buffer=alloc(16384);
                if(owned){
                    listener=sock("6SocketEiii",2,1,0);if(listener<0)throw Error("Cannot create legacy listener.");
                    write32(buffer,1n);sock("10SetSockOptEiiiPKvj",listener,0xffff,4,buffer,4);
                    put(address,String.fromCharCode(16,2,port>>8,port&255,0,0,0,0,0,0,0,0,0,0,0,0));
                    if(sock("4BindEiPK8sockaddrj",listener,address,16)<0||sock("6ListenEii",listener,3)<0)throw Error("Cannot listen for Gezine payloads.");
                }else{
                    listener=Number(borrowed);if(!Number.isInteger(listener)||listener<0)throw Error("Invalid inherited loader socket.");
                    originalFlags=sock("5FcntlEiiz",listener,3,0);if(originalFlags<0)throw Error("Cannot inspect inherited loader socket.");
                }
                nonblock(listener);
            }catch(e){if(owned&&listener>=0)sock("5CloseEi",listener);if(buffer)free(buffer);if(address)free(address);throw e;}
            function acceptRaw(){
                if(closed)return null;
                write32(buffer,16n);var fd=sock("6AcceptEiP8sockaddrPj",listener,address,buffer);
                if(fd<0){if(retry())return null;throw Error("Legacy accept failed.");}
                var clientBuffer=null,clientClosed=false,tail=Promise.resolve();
                function closeClient(){if(clientClosed)return;clientClosed=true;try{sock("5CloseEi",fd);}finally{if(clientBuffer)free(clientBuffer);}}
                try{nonblock(fd);clientBuffer=alloc(16384);write32(clientBuffer,1n);sock("10SetSockOptEiiiPKvj",fd,0xffff,0x800,clientBuffer,4);}catch(e){closeClient();throw e;}
                return {
                    receive:function(){
                        if(clientClosed)return "";
                        var n=sock("4RecvEiPvmi",fd,clientBuffer,16384,0x80);
                        if(n<0){if(retry())return null;throw Error("Legacy receive failed.");}
                        return n?binary(read_buffer(clientBuffer,n)):"";
                    },
                    write:function(text){
                        var bytes=C.encode(text);
                        tail=tail.then(async function(){
                            var offset=0,deadline=Date.now()+10000;
                            while(offset<bytes.length){
                                if(clientClosed)throw Error("Payload sender disconnected.");
                                if(Date.now()>deadline)throw Error("Payload log send timed out.");
                                var part=bytes.slice(offset,offset+16384);put(clientBuffer,part);
                                var n=sock("4SendEiPKvmi",fd,clientBuffer,part.length,0x80);
                                if(n>0)offset+=n;else if(n===0||!retry())throw Error("Payload sender disconnected.");
                                await pause();
                            }
                        });
                        return tail;
                    },close:closeClient
                };
            }
            return {accept:acceptRaw,close:function(){
                if(closed)return;closed=true;
                try{
                    if(owned)sock("5CloseEi",listener);
                    else if(sock("5FcntlEiiz",listener,4,originalFlags)<0)throw Error("Cannot restore original loader socket flags.");
                }finally{free(buffer);free(address);}
            }};
        }
        function controllerButtons(){
            var prefix="_ZN2nn3hid6detail",owned=[],selected=null,nextScan=0,closed=false;
            var styles=resolve(prefix+"15GetNpadStyleSetEPNS_4util10BitFlagSetILi32ENS0_12NpadStyleTagEEERKj");
            var getters=[{bit:2,name:"17NpadHandheldState"},{bit:1,name:"16NpadFullKeyState"},{bit:4,name:"16NpadJoyDualState"}].map(function(t){return {bit:t.bit,address:resolve(prefix+"13GetNpadStatesEPiPNS0_"+t.name+"EiRKj")};});
            function take(n){var p=alloc(n);owned.push(p);return p;}
            function closeButtons(){if(closed)return;closed=true;owned.reverse().forEach(free);owned=[];}
            var id,style,count,sample;
            try{id=take(8);style=take(8);count=take(8);sample=take(64);}catch(e){closeButtons();throw e;}
            function readButtons(controller,getter){
                write32(id,BigInt(controller));write32(count,0n);
                var r=call_rop(getter.address,count,sample,1n,id);if(code(r))throw Error("Controller state failed.");
                if(read32(count)!==1n||!(read32(sample+32n)&1n))return null;
                return read64(sample+8n);
            }
            return {poll:function(){
                if(closed)return null;
                if(selected){var value=readButtons(selected.id,selected.getter);if(value!==null)return value;selected=null;nextScan=0;}
                if(Date.now()<nextScan)return null;nextScan=Date.now()+500;
                for(var controller of [32,0,1,2,3,4,5,6,7]){
                    write32(id,BigInt(controller));write32(style,0n);if(code(call_rop(styles,style,id)))throw Error("Controller style failed.");
                    var bits=Number(read32(style));
                    for(var getter of getters)if(bits&getter.bit){var value=readButtons(controller,getter);if(value!==null){selected={id:controller,getter:getter};return value;}}
                }
                return null;
            },close:closeButtons};
        }
        return {io:io,ip:ip,serve:serve,rawTransport:rawTransport,controllerButtons:controllerButtons};
    }
})();
