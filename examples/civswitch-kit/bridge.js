/* GPL-2.0. Diagnostic subset of civswitch-kit BRIDGE-CONTRACT.md, revision
 * 9a9589147e9852120e0c04e2847ea38b347fe7ab. No FS/process/worker calls. */
(function (g) {
    "use strict";
    function endpoint(ip, port, hardware) {
        if (typeof ip !== "string" || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.split(".").some(function(v){return Number(v)>255 || String(Number(v))!==v;}) || ip === "0.0.0.0" || Number(ip.split(".")[0]) >= 224) throw Error("Enter the PC's LAN IPv4 address.");
        if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Port must be 1024..65535.");
        if (hardware !== "switch1" && hardware !== "switch2") throw Error("Choose Switch 1 or Switch 2 explicitly.");
    }
    function range(p, size, base, length) { return size >= 0n && p >= base && p <= base + length && size <= base + length - p; }
    function record(n, scratch, at) {
        var fn = n.read64(at), args = [8,16,24,32].map(function(off){return n.read64(at+BigInt(off));});
        if (fn !== n.memcpy && fn !== n.memmove) throw Error("Diagnostic bridge rejects this native function.");
        var size = args[2], work = scratch + 0x10000n, output = scratch + 0x4040n, input = scratch + 0x40080n;
        var destination = range(args[0],size,work,0x8000n) || range(args[0],size,output,0x8000n);
        var source = range(args[1],size,work,0x8000n) || range(args[1],size,output,0x8000n) || range(args[1],size,input,0x8000n);
        if (size > 0x8000n || !destination || !source || args[3] !== 0n) throw Error("Diagnostic copy is outside its owned windows.");
        if (fn === n.memcpy && size && args[0] !== args[1] && args[0] < args[1]+size && args[1] < args[0]+size) throw Error("Overlapping copies require memmove.");
        return {fn:fn,args:args};
    }
    function equal(a,b) { return a.length === b.length && Array.prototype.every.call(a,function(v,i){return Number(v)===Number(b[i]);}); }
    async function run(n, o) {
        endpoint(o.pcIp,o.port,o.hardware);
        var allocation = null, scratch, fd = -1, count = 0, clean = false, deadline = Date.now()+60000;
        var guard = new Uint8Array(32); guard.fill(0xa7);
        function verifyGuard() {
            if (!equal(n.read(allocation,32),guard) || !equal(n.read(scratch+0x80000n,32),guard)) throw Error("Scratch guard changed; restart the game before another check.");
        }
        try {
            allocation = n.alloc(0x80040); scratch = allocation+32n;
            n.write(allocation,guard); n.write(scratch+0x80000n,guard);
            // Copies are synchronous, confined to this allocation, with no native
            // workers. An input cancellation can free it once the call returns.
            var marker = new Uint8Array(64);
            for (var i=0;i<marker.length;i++) marker[i]=(i*31+17)&255;
            var work=scratch+0x10000n;
            n.write(work,marker);
            if (n.call(n.memcpy,[work+128n,work,64n,0n])!==work+128n || !equal(n.read(work+128n,64),marker)) throw Error("Native memcpy challenge failed.");
            var expected = new Uint8Array(marker); expected.set(marker.slice(0,48),8);
            if (n.call(n.memmove,[work+8n,work,48n,0n])!==work+8n || !equal(n.read(work,64),expected)) throw Error("Native overlapping memmove challenge failed.");
            verifyGuard(); o.progress("Native memcpy and overlapping memmove passed. Connecting to PC...");
            fd=await n.open(o.pcIp,o.port,o);
            // Exact upstream 128-byte HELLO layout. Hardware is user declared.
            // CRC=0 deliberately marks an unqualified SDK; the full exploit
            // engine must reject this diagnostic-only greeting.
            var fields=[0x31545344n,1n,o.hardware==="switch1"?1n:2n,scratch,0x80000n,n.main,n.sdk,0n,n.memmove,0n,0n,0n,0n,0n,0n,0n];
            fields.forEach(function(v,i){n.write64(scratch+BigInt(i*8),v);});
            await n.transfer(fd,scratch,128,true,o,deadline);
            o.progress("Connected. Checking bridge copies; B cancels.");
            for (;count<128;count++) {
                var input=scratch+0x40000n;
                await n.transfer(fd,input,0x8080,false,o,deadline);
                if (n.read64(input)===0n && n.read64(input+8n)===0n && n.read32(input+16n)===0n) { clean=true; break; }
                // Validate both records before executing either one.
                var a=record(n,scratch,input), b=record(n,scratch,input+0x28n);
                var ra=n.call(a.fn,a.args), rb=n.call(b.fn,b.args);
                n.write64(scratch+0x4030n,rb); n.write64(scratch+0x4038n,ra);
                verifyGuard();
                await n.transfer(fd,scratch+0x4030n,0x8010,true,o,deadline);
            }
            if (!clean) throw Error("Diagnostic request limit reached.");
            verifyGuard();
            return {exchanges:count,localCopies:true,terminated:true};
        } finally {
            try { if (fd>=0) n.close(fd); }
            finally { if (allocation!==null) n.free(allocation); }
        }
    }
    g.CivKitBridge={run:run,endpoint:endpoint,record:record};
})(window);
