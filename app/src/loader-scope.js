/* Created beside (not inside) the UI so SDK/socket helper names stay unshadowed. */
(function () {
    window.PayloadLoaderScope = {
        port: typeof PORT !== "undefined" ? Number(PORT) : 9026,
        listener: typeof sock_fd !== "undefined" ? sock_fd : null,
        evaluate: async function (__civswitchSource) { return await eval(__civswitchSource); }
    };
})();
