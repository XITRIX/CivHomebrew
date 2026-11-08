/* Gezine raw-JS protocol; transport is injected for the SDK and host tests. */
(function(g){
    "use strict";
    var limit=500*1024;
    function create(options){
        var stopped=false,active=null;
        function pause(){return new Promise(function(r){setTimeout(r,10);});}
        var task=(async function(){
            try{
                while(!stopped){
                    if(options.busy()){await pause();continue;}
                    active=options.transport.accept();
                    if(!active){await pause();continue;}
                    try{
                        var chunks=[],length=0,start=Date.now(),idle=start;
                        while(!stopped){
                            if(Date.now()-idle>10000||Date.now()-start>120000)throw Error("Payload upload timed out.");
                            var bytes=active.receive();
                            if(bytes===null){await pause();continue;}
                            if(bytes==="")break;
                            idle=Date.now();length+=bytes.length;
                            if(length>=limit)throw Error("Payload exceeds the strict 500 KiB limit.");
                            chunks.push(bytes);await pause();
                        }
                        if(stopped)break;
                        if(!length)throw Error("No valid data received");
                        var source=g.PayloadCore.decode(chunks.join(""));chunks=[];
                        if(options.busy())throw Error("Menu is busy.");
                        options.record("Executing payload...");
                        await active.write("Executing payload...\n");
                        await options.execute(source,active.write);
                        options.record("Executed successfully");
                        await active.write("Executed successfully\n");
                    }catch(e){
                        if(!stopped){
                            var message="Error in payload: "+String(e.message).slice(0,512);
                            options.record(message);
                            var stack=e&&e.stack?String(e.stack).slice(0,4096):"";
                            if(stack)options.record(stack);
                            try{await active.write(message+"\n"+(stack?stack+"\n":""));}catch(_){}
                        }
                    }finally{active.close();active=null;}
                    if(!stopped)options.ready();
                }
            }catch(e){if(!stopped)options.error(e);}
            finally{if(active){active.close();active=null;}try{options.transport.close();}catch(e){options.error(e);}}
        })();
        return {stop:function(){stopped=true;return task;}};
    }
    g.PayloadLegacy={create:create,limit:limit};
})(typeof window!=="undefined"?window:globalThis);
