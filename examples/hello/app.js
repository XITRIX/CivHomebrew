/* CivSwitch direct-eval entry point. Keep this IIFE last in the source bundle. */
(async function () {
    "use strict";
    var appId = "hello-civswitch";
    var previous = window.__civswitchApp;
    if (previous && typeof previous.close === "function") await previous.close();

    var finish, closed = false, selected = 0, count = 0, frame = null;
    var lifetime = new Promise(function (resolve) { finish = resolve; });
    var nativeInput = false, subscription = null;
    var owner = {owner: appId}, removers = [], diagnostics = [];
    var held = "", nextRepeat = 0, last = {name:"",time:0}, buttons = {};
    function record(message) {
        diagnostics.push({time:Date.now(),message:String(message).slice(0,512)});
        if (diagnostics.length > 64) diagnostics.shift();
    }
    function listen(target, name, callback) {
        target.addEventListener(name, callback, true);
        removers.push(function () { target.removeEventListener(name, callback, true); });
    }
    function node(tag, parent, style, text) {
        var result = document.createElement(tag);
        Object.assign(result.style, style || {});
        if (text !== undefined) result.textContent = text;
        parent.appendChild(result);
        return result;
    }
    var root = node("div", document.body, {
        position:"fixed",left:"0",right:"0",top:"0",bottom:"0",display:"flex",
        flexDirection:"column",alignItems:"center",justifyContent:"center",backgroundColor:"#0c1220",
        color:"#f4f7ff",fontFamily:"Arial, sans-serif",zIndex:"1",boxSizing:"border-box",outline:"none"
    });
    root.id = appId;
    root.tabIndex = -1;
    var panel = node("div", root, {
        display:"flex",flexDirection:"column",width:"600px",maxWidth:"88vw",padding:"32px",
        border:"1px solid #29354b",borderRadius:"18px",backgroundColor:"#131d2e",boxSizing:"border-box"
    });
    node("div", panel, {fontSize:"17px",color:"#94b6e2",marginBottom:"6px"}, "Installed from CivHomebrew");
    node("h2", panel, {fontSize:"36px",lineHeight:"1.2",margin:"0 0 20px"}, "Hello CivSwitch");
    var status = node("div", panel, {fontSize:"20px",lineHeight:"1.4",marginBottom:"20px"}, "Choose an action.");
    status.id = appId + "-status";
    status.setAttribute("role", "status");
    var controls = [];
    function addAction(title, run) {
        var index = controls.length;
        var button = node("button", panel, {
            display:"flex",alignItems:"center",justifyContent:"center",width:"100%",minHeight:"58px",
            padding:"12px 16px",marginTop:"12px",border:"2px solid #35435b",borderRadius:"9px",
            backgroundColor:"#0c1423",color:"#f4f7ff",fontFamily:"Arial, sans-serif",fontSize:"22px",outline:"none"
        }, title);
        button.type = "button";
        button.tabIndex = -1;
        controls.push({node:button,run:run});
        listen(button, "click", function () { if (closed) return; selected = index; paint(); run(); });
    }
    function paint() {
        controls.forEach(function (control, index) {
            var active = selected === index;
            control.node.style.borderColor = active ? "#94c6ff" : "#35435b";
            control.node.style.backgroundColor = active ? "#284c83" : "#0c1423";
            control.node.setAttribute("data-selected", active ? "true" : "false");
        });
    }
    function choose(delta) {
        selected = (selected + delta + controls.length) % controls.length;
        paint();
    }
    function close() {
        if (closed) return lifetime;
        closed = true;
        // If the app grows native tasks/I/O/media, await their safe teardown
        // before finish(). The starter owns only DOM, subscriptions and a RAF.
        if (frame !== null) cancelAnimationFrame(frame);
        removers.forEach(function (remove) { remove(); });
        try {
            if (subscription && typeof subscription.clear === "function") subscription.clear();
            else if (nativeInput && window.engine && typeof window.engine.off === "function")
                window.engine.off("InputAction", onNative, owner);
        } catch (error) { record("Input cleanup: " + error.message); }
        if (root.parentNode) root.parentNode.removeChild(root);
        if (window.__civswitchApp === instance) delete window.__civswitchApp;
        finish();
        return lifetime;
    }
    addAction("Run action", function () {
        count++;
        status.textContent = "Action ran " + count + (count === 1 ? " time." : " times.");
        record("Action ran");
    });
    addAction("Close app", close);
    node("div", root, {fontSize:"17px",color:"#a7b6cf",marginTop:"24px"}, "D-pad: Move    A: Select    B: Close");

    function action(name, phase, x, y) {
        if (closed) return;
        phase = Number(phase);
        if (name === "keyboard-escape") name = "cancel";
        if (name === "nav-move") {
            if (Math.abs(Number(x)) > Math.abs(Number(y)) && Math.abs(Number(x)) > .5)
                name = Number(x) > 0 ? "nav-right" : "nav-left";
            else if (Math.abs(Number(y)) > .5) name = Number(y) > 0 ? "nav-up" : "nav-down";
            else if (phase !== 0 && phase !== 3 && held) name = held;
            else return;
        }
        if (["nav-up","nav-down","nav-left","nav-right","accept","cancel"].indexOf(name) < 0) return;
        if (phase !== 0 && phase !== 3) { if (held === name) held = ""; return; }
        var now = Date.now();
        if (last.name === name && now - last.time < 90) return;
        if (name.indexOf("nav-") === 0) {
            if (phase === 3 && (held !== name || now < nextRepeat)) return;
            held = name;
            nextRepeat = now + (phase === 0 ? 350 : 150);
            if (name === "nav-up" || name === "nav-down") choose(name === "nav-up" ? -1 : 1);
        } else {
            if (phase !== 0) return;
            // Invoke actions directly: Gameface need not support button.click().
            if (name === "accept") controls[selected].run();
            else close();
        }
        last = {name:name,time:now};
    }
    function consume(event) { event.preventDefault(); event.stopImmediatePropagation(); }
    function onNative(name, phase, x, y) { action(name, phase, x, y); }
    function onGame(event) {
        var detail = event.detail || {};
        if (["nav-up","nav-down","nav-left","nav-right","nav-move","accept","cancel","keyboard-escape"].indexOf(detail.name) < 0) return;
        action(detail.name, detail.status, detail.x, detail.y);
        consume(event);
    }
    listen(window, "navigate-input", onGame);
    listen(window, "engine-input", onGame);
    listen(window, "keydown", function (event) {
        if (event.key === "F8") { close(); consume(event); return; }
        if (event.key === "Tab") { choose(event.shiftKey ? -1 : 1); consume(event); return; }
        var name = {ArrowUp:"nav-up",ArrowDown:"nav-down",ArrowLeft:"nav-left",ArrowRight:"nav-right",Enter:"accept",Escape:"cancel"}[event.key];
        if (name) { action(name, event.repeat ? 3 : 0); consume(event); }
    });
    listen(window, "keyup", function (event) {
        var name = {ArrowUp:"nav-up",ArrowDown:"nav-down",ArrowLeft:"nav-left",ArrowRight:"nav-right"}[event.key];
        if (name) { action(name, 1); consume(event); }
    });
    if (window.engine && typeof window.engine.on === "function") {
        try { subscription = window.engine.on("InputAction", onNative, owner); nativeInput = true; }
        catch (error) { record("Native input unavailable: " + error.message); }
    }
    function poll() {
        if (closed) return;
        if (!nativeInput && navigator.getGamepads) {
            var pads;
            try { pads = navigator.getGamepads(); } catch (_) { pads = []; }
            var mapping = [[12,"nav-up"],[13,"nav-down"],[14,"nav-left"],[15,"nav-right"],[0,"accept"],[1,"cancel"]];
            for (var p = 0; p < pads.length; p++) {
                if (!pads[p]) continue;
                for (var b = 0; b < mapping.length; b++) {
                    var index = mapping[b][0], key = p + ":" + index;
                    var down = !!(pads[p].buttons[index] && pads[p].buttons[index].pressed);
                    if (down) action(mapping[b][1], buttons[key] ? 3 : 0);
                    else if (buttons[key]) action(mapping[b][1], 1);
                    buttons[key] = down;
                }
            }
        }
        if (!closed) frame = requestAnimationFrame(poll);
    }
    var instance = {id:appId,close:close,lifetime:lifetime,diagnostics:diagnostics};
    window.__civswitchApp = instance;
    paint();
    root.focus();
    frame = requestAnimationFrame(poll);
    // This bounded startup marker is the only loader-network log. Keep live
    // diagnostics in RAM so input/exit does not depend on network logging.
    if (typeof log === "function") await log("CIVSWITCH_APP_READY");
    await lifetime;
})();
