(async function(){
 var g=window,v=g.__civAppLaunchWatch;
 if(!v||v.error||!v.closed||!v.ready||v.ready.labels.slice(0,3).join(',')!=='doom.wad,doom1.wad,doom2.wad')throw Error('Launch incomplete: '+(v&&v.error||'not ready'));
 clearInterval(v.timer);delete g.__civAppLaunchWatch;
 await log('CIV_APP_LAUNCH_VERIFIED '+JSON.stringify(v.ready));
})();
