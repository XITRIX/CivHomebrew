(async function(){
 var g=window,v=g.__doomLaunchVerification;
 if(!v||v.error||!v.closed||!v.ready||v.ready.labels.slice(0,3).join(',')!=='doom.wad,doom1.wad,doom2.wad')throw Error('Normal Doom launch not verified: '+(v&&v.error||'incomplete'));
 clearInterval(v.timer);delete g.__doomLaunchVerification;
 await log('DOOM_NORMAL_LAUNCH_VERIFIED '+JSON.stringify({selector:true,closed:v.closed,labels:v.ready.labels}));
})();
