/* GPL-2.0. SDK export resolver/nonblocking I/O adapted from CivHomebrew's
 * app/src/platform/native.js and Moonlight's verified native-network.js. */
(function (g) {
    "use strict";
    g.CivKitNative = {available: typeof sdk_base === "bigint" && typeof call_rop === "function", create: create};
    function create() {
        if (!g.CivKitNative.available) throw Error("Run this app inside CivHomebrew on the console.");
        var cache = {}, mod = sdk_base + read32(sdk_base + 4n);
        if (read32(mod) !== 0x30444f4dn) throw Error("Unsupported SDK MOD0.");
        var dynamic = mod + BigInt.asIntN(32, read32(mod + 4n)), tags = {}, ended = false;
        for (var i = 0; i < 128; i++) {
            var tag = Number(read64(dynamic + BigInt(i * 16)));
            if (!tag) { ended = true; break; }
            var v = read64(dynamic + BigInt(i * 16 + 8));
            tags[tag] = v < sdk_base ? sdk_base + v : v;
        }
        if (!ended) throw Error("Unterminated SDK dynamic table.");
        var table = tags[4], strings = tags[5], symbols = tags[6];
        if (!table || !strings || !symbols) throw Error("Missing SDK exports.");
        var buckets = Number(read32(table)), count = Number(read32(table + 4n));
        if (buckets < 1 || buckets > 1000000 || count < 1 || count > 1000000) throw Error("Invalid SDK export bounds.");
        function resolve(name) {
            if (cache[name]) return cache[name];
            var hash = 0;
            for (var j = 0; j < name.length; j++) {
                hash = ((hash << 4) + name.charCodeAt(j)) >>> 0;
                var high = hash & 0xf0000000;
                if (high) hash ^= high >>> 24;
                hash = (hash & ~high) >>> 0;
            }
            var index = Number(read32(table + 8n + BigInt((hash % buckets) * 4)));
            for (var k = 0; index && k < count; k++) {
                if (index >= count) throw Error("Invalid SDK symbol chain.");
                var symbol = symbols + BigInt(index * 24), p = strings + read32(symbol), s = "";
                for (var q = 0; q < 512; q++) { var ch = Number(read8(p + BigInt(q))); if (!ch) break; s += String.fromCharCode(ch); }
                if (s === name) { var offset = read64(symbol + 8n); if (offset) return cache[name] = sdk_base + offset; break; }
                index = Number(read32(table + 8n + BigInt((buckets + index) * 4)));
            }
            throw Error("Missing SDK export: " + name);
        }
        var prefix = "_ZN2nn6socket", names = ["6SocketEiii", "5FcntlEiiz", "7ConnectEiPK8sockaddrj", "4RecvEiPvmi", "4SendEiPKvmi", "5CloseEi", "12GetLastErrnoEv"];
        names.forEach(function (name) { resolve(prefix + name); });
        var copy = resolve("memcpy"), move = resolve("memmove");
        // Check the loader's already qualified memcpy import before any copy.
        if (typeof memcpy_addr !== "bigint" || copy !== memcpy_addr) throw Error("SDK memcpy differs from loader import.");
        function sock(name) {
            var args = Array.prototype.slice.call(arguments, 1).map(BigInt);
            return Number(BigInt.asIntN(32, call_rop.apply(null, [resolve(prefix + name)].concat(args))));
        }
        function active(options, deadline) {
            if (options.stopped()) throw Error("Check cancelled.");
            if (Date.now() >= deadline) throw Error("Bridge I/O timed out.");
        }
        function pause() { return new Promise(function (r) { setTimeout(r, 2); }); }
        function alloc(n) { var p = malloc(n); if (!p) throw Error("Native allocation failed."); return p; }
        async function open(ip, port, options) {
            var address = alloc(16), fd = -1, deadline = Date.now() + 5000;
            try {
                active(options, deadline);
                write_buffer(address, new Uint8Array([16, 2, port >> 8, port & 255].concat(ip.split(".").map(Number), [0,0,0,0,0,0,0,0])));
                fd = sock("6SocketEiii", 2, 1, 0);
                if (fd < 0) throw Error("Cannot create bridge socket.");
                var flags = sock("5FcntlEiiz", fd, 3, 0);
                if (flags < 0 || sock("5FcntlEiiz", fd, 4, flags | 0x800) < 0) throw Error("Cannot make bridge socket nonblocking.");
                var result = sock("7ConnectEiPK8sockaddrj", fd, address, 16);
                while (result < 0) {
                    var errno = sock("12GetLastErrnoEv");
                    if (errno === 56 || errno === 106) break;
                    if ([115,114,36,37,11,35,4].indexOf(errno) < 0) throw Error("TCP connect failed (errno " + errno + ").");
                    active(options, deadline); await pause(); active(options, deadline);
                    result = sock("7ConnectEiPK8sockaddrj", fd, address, 16);
                }
                return fd;
            } catch (error) { if (fd >= 0) sock("5CloseEi", fd); throw error; }
            finally { free(address); }
        }
        async function transfer(fd, p, length, sending, options, sessionDeadline) {
            var offset = 0, deadline = Math.min(Date.now() + 15000, sessionDeadline);
            while (offset < length) {
                active(options, deadline);
                var n = sock(sending ? "4SendEiPKvmi" : "4RecvEiPvmi", fd, p + BigInt(offset), length - offset, 0x80);
                if (n > 0) { if (n > length - offset) throw Error("Invalid socket byte count."); offset += n; }
                else if (!n || [11,35,4].indexOf(sock("12GetLastErrnoEv")) < 0) throw Error("PC disconnected before bridge completion.");
                await pause();
            }
        }
        return {main:main_base, sdk:sdk_base, memcpy:copy, memmove:move, alloc:alloc, free:free,
            read:read_buffer, write:write_buffer, read64:read64, read32:read32, write64:write64,
            call:function(fn,args){return call_rop.apply(null,[fn].concat(args));}, open:open,
            transfer:transfer, close:function(fd){sock("5CloseEi",fd);}};
    }
})(window);
