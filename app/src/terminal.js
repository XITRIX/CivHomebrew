/* Same 37-row / 146-column wrapping as Gezine's terminal; bounded RAM only. */
(function(g){
    "use strict";
    function create(onChange){
        var lines=[];
        function append(value){
            var text=String(value);
            if(text.length>32768)text=text.slice(0,32768)+"\n[message truncated]";
            text.split("\n").forEach(function(part){
                if(!part){lines.push("\u00a0");return;}
                for(var i=0;i<part.length;i+=146)lines.push(part.slice(i,i+146));
            });
            if(lines.length>37)lines.splice(0,lines.length-37);
            if(onChange)onChange(lines.join("\n"));
        }
        return {append:append,text:function(){return lines.join("\n");}};
    }
    g.PayloadTerminal={create:create};
})(typeof window!=="undefined"?window:globalThis);
