/* Recheck the real resident roundtrip after a live snapshot-module correction. */
(function(g){
 var t=g.__civNanoVGTerminalTrial;if(!t||!t.complete||t.error)throw Error('A passing terminal trial is required');
 t.postLayout={firstCheck:t.checks.length,complete:false,error:null};var previous=t.snapshot;t.snapshot=function(){var r=previous();r.postLayout=t.postLayout;return r;};
 setTimeout(async function(){try{g.__civhomebrewCore.showTerminal();await t.runChecks(2);t.postLayout.complete=!t.error;t.postLayout.error=t.error;}catch(e){t.postLayout.error=String(e.message);}},300);
})(window);
