/* Finite pure-JS FNV-1a variants over existing script text. No save writes. */
(async function(){
 var C=window.PayloadCore,io=window.__civhomebrewBoot.native.io,manifest=JSON.parse(await io.read(C.appPath('moonlight-civswitch','manifest.json'),65536,false)),script=manifest.scripts.find(function(s){return /moonlight-stream\.js$/.test(s.path);}),text=await io.read(C.appPath('moonlight-civswitch',script.path),C.maxSource,false);
 if(text===null)throw Error('Benchmark script missing');text=text.slice(0,131072);
 await log('CIV_HASH_BUILTINS '+String(Math.imul).slice(0,400)+' / '+String(String.prototype.charCodeAt).slice(0,200));
 var variants={baseline:C.hash,
 local:function(s){var h=2166136261,mul=Math.imul;for(var i=0,n=s.length;i<n;i++)h=mul(h^s.charCodeAt(i),16777619);return(h>>>0).toString(16).padStart(8,'0');},
 shifts:function(s){var h=2166136261;for(var i=0,n=s.length;i<n;i++){h^=s.charCodeAt(i);h=(h+(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24))|0;}return(h>>>0).toString(16).padStart(8,'0');},
 unroll:function(s){var h=2166136261,mul=Math.imul,i=0,n=s.length;for(;i+4<=n;i+=4){h=mul(h^s.charCodeAt(i),16777619);h=mul(h^s.charCodeAt(i+1),16777619);h=mul(h^s.charCodeAt(i+2),16777619);h=mul(h^s.charCodeAt(i+3),16777619);}for(;i<n;i++)h=mul(h^s.charCodeAt(i),16777619);return(h>>>0).toString(16).padStart(8,'0');}};
 var expected=C.hash(text);
 for(var key of Object.keys(variants)){var begin=Date.now(),hash=variants[key](text);if(hash!==expected)throw Error('Hash mismatch: '+key);await log('CIV_HASH_BENCH '+JSON.stringify({variant:key,ms:Date.now()-begin,units:text.length,hash:hash}));}
})();
