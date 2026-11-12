const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'../..');
test('persistent component caches dependencies and factory across resident reevaluation',()=>{
 execFileSync('python3',['tools/nanovg/package-main.py'],{cwd:root});const image=JSON.parse(fs.readFileSync(path.join(root,'dist/launcher-nanovg-main.civupdate'))),g={console};g.window=g;g.globalThis=g;const c=vm.createContext(g);
 vm.runInContext(fs.readFileSync(path.join(root,'app/src/core.js'),'utf8'),c);assert.equal(image.checksum,g.PayloadCore.hash(image.source));
 const factory=vm.runInContext(image.source,c),sessions=g.CivNanoVGSession,compiled=g.CivNanoVGFactory;assert.equal(factory.api,1);assert.equal(typeof factory.mount,'function');
 delete g.CivFtp;delete g.CivHomebrewLauncher;assert.equal(vm.runInContext(image.source,c),factory);assert.equal(g.CivNanoVGSession,sessions);assert.equal(g.CivNanoVGFactory,compiled);
 assert.throws(()=>vm.runInContext(image.source.replace(/var identity="[0-9a-f]+"/,'var identity="different"'),c),/Restart Civ VII/);
});
test('main adapter starts once, restores FTP exports on remount, waits for a frame and preserves resident app launching',async()=>{
 let starts=0,mounts=0,closes=0;const shared={stats:{errors:[]},active:null},sessions={current:null,pending:null,start:async()=>{starts++;sessions.current=shared;return shared;}},ftp={},prototype={enabled:false};
 const base={mount:async()=>{mounts++;shared.active={root:{id:'civhomebrew'},ui:{stats:{frames:1,error:''},update(){}}};return {close(){closes++;shared.active=null;}};}};
 const g={setTimeout,PayloadNative:{available:true},__civhomebrewCore:{}};g.window=g;vm.runInContext(fs.readFileSync(path.join(root,'app/src/nanovg/main-component.js'),'utf8'),vm.createContext(g));
 const component=g.CivNanoVGMainComponent.create({identity:'test',release:'test',factory:base,ftp,sessions,prototype}),api={launch(){return "resident launch";}};let view=await component.factory.mount(api);await view.close();delete g.CivFtp;view=await component.factory.mount(api);
 assert.equal(starts,1);assert.equal(mounts,2);assert.equal(component.mounts,2);assert.equal(closes,1);assert.equal(g.CivFtp,ftp);assert.equal(prototype.enabled,true);assert.equal(api.launch(),"resident launch");await view.close();
});
test('failed first native frame closes only the view and rejects acknowledgement',async()=>{
 let closes=0;const shared={stats:{errors:[]},active:{root:{id:'civhomebrew'},ui:{stats:{frames:0,error:'GPU failed'},update(){}}}},g={};g.window=g;
 vm.runInContext(fs.readFileSync(path.join(root,'app/src/nanovg/main-component.js'),'utf8'),vm.createContext(g));const component=g.CivNanoVGMainComponent.create({factory:{mount:async()=>({close(){closes++;}})},ftp:{},sessions:{current:shared},prototype:{}});
 await assert.rejects(()=>component.factory.mount({}),/GPU failed/);assert.equal(closes,1);assert.equal(component.mounts,0);
});
