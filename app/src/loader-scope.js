/* Created beside (not inside) the UI so SDK/socket helper names stay unshadowed. */
(function () {
    window.PayloadLoaderScope = {
        port: typeof PORT !== "undefined" ? Number(PORT) : 9026,
        listener: typeof sock_fd !== "undefined" ? sock_fd : null,
        evaluate: async function (__civswitchSource) { return await eval(__civswitchSource); },
        // Opt-in apps use var/IIFE initializers and a final awaited lifetime.
        // One activation preserves var bindings and the loader's native scope,
        // while each source can be released before the next file is read.
        evaluateScripts: async function (__civswitchNext) {
            var __civswitchPiece, __civswitchResult;
            while((__civswitchPiece=await __civswitchNext())!==null){
                if(typeof __civswitchPiece!=="string"||!__civswitchPiece.trim())throw Error("Invalid ordered script.");
                __civswitchResult=await eval(__civswitchPiece);
                __civswitchPiece=null;
            }
            return __civswitchResult;
        }
    };
})();
