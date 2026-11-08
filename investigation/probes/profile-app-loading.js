/* Finite, read-only installed Moonlight profile. Never evaluates app source. */
(async function(){
 var C=window.PayloadCore,io=window.__civhomebrewBoot.native.io,store=C.createStore(io);
 await store.load();
 var originals={read:io.read,hash:C.hash,encode:C.encode,decode:C.decode},rows=[],totals={read:0,hash:0,encode:0,decode:0},counts={read:0,hash:0,encode:0,decode:0};
 for(var key of ['hash','encode','decode'])(function(name){C[name]=function(value){var begin=Date.now();try{return originals[name](value);}finally{totals[name]+=Date.now()-begin;counts[name]++;}};})(key);
 io.read=async function(path,limit,binary,onProgress){var begin=Date.now();try{return await originals.read(path,limit,binary,onProgress);}finally{var ms=Date.now()-begin;totals.read+=ms;counts.read++;rows.push({file:path.split('/').slice(-2).join('/'),ms:ms});}};
 var begin=Date.now(),p;
 try{p=await store.read('moonlight-civswitch');}
 finally{io.read=originals.read;C.hash=originals.hash;C.encode=originals.encode;C.decode=originals.decode;}
 await log('CIV_LOAD_PROFILE '+JSON.stringify({ms:Date.now()-begin,scripts:p.scripts.length,bytes:p.scripts.reduce(function(n,s){return n+C.encode(s.source).length;},0),totals:totals,counts:counts}));
 for(var i=0;i<rows.length;i++)await log('CIV_LOAD_FILE '+JSON.stringify(rows[i]));
})();
