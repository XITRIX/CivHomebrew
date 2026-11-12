const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const root=path.resolve(__dirname,'../..');
test('RAM trial supplies a non-trial launcher without staging components, and restores the original lookup',async()=>{
 let closes=0;const original=async name=>({name}),system={choose:original},session={close:async()=>{closes++;}},factory={mount(){}};
 const g={__civhomebrewCore:{},__civhomebrewBoot:{system},CivHomebrewLauncher:factory,CivFtp:{},CivHomebrewNativeUI:{start:async()=>session},PayloadCore:{hash:()=> '01234567'},log:async()=>{},CivNanoVGPrototype:{enabled:true}};g.window=g;const context=vm.createContext(g);
 await vm.runInContext(fs.readFileSync(path.join(root,'investigation/probes/nanovg/terminal-trial.js'),'utf8'),context);const t=g.__civNanoVGTerminalTrial;
 assert.equal((await system.choose('core')).name,'core');const selected=await system.choose('launcher');assert.equal(selected.trial,false);delete g.CivHomebrewLauncher;assert.equal(vm.runInContext(selected.source,context),factory);
 await t.stop();assert.equal(system.choose,original);assert.equal(closes,1);assert.equal(t.active,false);
});
test('finite concatenated activation awaits the shared owner before defining switch checks',async()=>{
 let release;const scheduled=[],system={choose:async()=>({})},session={close:async()=>{}};
 const g={__civhomebrewCore:{},__civhomebrewBoot:{system},CivHomebrewLauncher:{mount(){}},CivFtp:{},CivHomebrewNativeUI:{start:()=>new Promise(r=>{release=r;})},PayloadCore:{hash:()=> '01234567'},log:async()=>{},setTimeout:fn=>{scheduled.push(fn);return 1;},CivNanoVGPrototype:{enabled:true}};g.window=g;
 const source=['terminal-trial.js','terminal-checks.js'].map(n=>fs.readFileSync(path.join(root,'investigation/probes/nanovg',n),'utf8')).join('\n');
 const completion=vm.runInContext(source,vm.createContext(g));assert.equal(g.__civNanoVGTerminalTrial,undefined);assert.equal(scheduled.length,0);release(session);await completion;
 assert.equal(g.__civNanoVGTerminalTrial.active,true);assert.equal(typeof g.__civNanoVGTerminalTrial.snapshot,'function');assert.equal(scheduled.length,1);await g.__civNanoVGTerminalTrial.stop();
});
