const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(__dirname+'/../app/src/core.js','utf8'),context);
const C=context.PayloadCore;
test('portable base64 works without Gameface-missing atob or btoa',()=>{
 for(let n=0;n<300;n++){const raw=Buffer.from(Array.from({length:n},(_,i)=>(i*47)%256));assert.equal(C.unbase64(raw.toString('base64')),raw.toString('latin1'));}
 assert.throws(()=>C.unbase64('x'),/base64/);
});
const pkg=(id='hello',source='(async function(){return 42;})();')=>({format:'civswitch-app',version:1,id,name:'Hello',metadata:{api:1},scripts:[{name:'app.js',source}],icon:''});
function fixture(){let files=new Map(),failure=null;return {files,set fail(f){failure=f;},io:{read:async(p)=>{if(failure==='readback'&&p.includes('catalog-1'))return 'broken';return files.has(p)?files.get(p):null;},write:async(p,t)=>{if(failure==='write'&&p.includes('catalog-'))throw Error('disk full');files.set(p,t);},commit:async()=>{if(failure==='commit')throw Error('commit failed');},ensure:async()=>{},remove:async p=>files.delete(p)}};}
test('multi-file package preserves completion value and rejects traversal, API mismatch and non-square icons',()=>{
 const p=pkg();p.scripts.unshift({name:'lib/core.js',source:'var answer=42;'});
 assert.equal(C.source(C.package(p)),'var answer=42;\n;\n'+p.scripts[1].source);
 for(const name of ['../x.js','/x.js','a//x.js','a\\x.js','a/./x.js']){const bad=pkg();bad.scripts[0].name=name;assert.throws(()=>C.package(bad));}
 const bad=pkg();bad.metadata.api=2;assert.throws(()=>C.package(bad),/unsupported/);
 const icon=fs.readFileSync(__dirname+'/../examples/hello/icon.png');const good=pkg();good.icon='data:image/png;base64,'+icon.toString('base64');assert.ok(C.package(good));
 icon.writeUInt32BE(128,16);good.icon='data:image/png;base64,'+icon.toString('base64');assert.throws(()=>C.package(good),/256/);
});
test('install, update, reload and package corruption detection',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();await s.install(pkg());assert.equal((await s.read('hello')).name,'Hello');
 const update=pkg('hello','42');update.name='Updated';await s.install(update);
 const reloaded=C.createStore(f.io);await reloaded.load();assert.equal((await reloaded.read('hello')).name,'Updated');
 const e=reloaded.list()[0];f.files.set(C.path(e.file),f.files.get(C.path(e.file))+' ');await assert.rejects(reloaded.read('hello'),/corrupt/);
});
test('catalog recovery uses prior generation and both corrupt slots block all writes',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();await s.install(pkg());await s.install(pkg('second'));
 f.files.set(C.path('catalog-0.json'),'corrupt');const r=C.createStore(f.io);const loaded=await r.load();assert.equal(loaded.recovered,true);assert.equal(r.list().length,1);
 f.files.set(C.path('catalog-1.json'),'corrupt');const blocked=C.createStore(f.io);const before=JSON.stringify([...f.files]);await assert.rejects(blocked.load(),/unreadable/);await assert.rejects(blocked.install(pkg()),/unavailable/);assert.equal(JSON.stringify([...f.files]),before);
});
test('failed catalog writes preserve the previous generation and disallow uncertain reuse',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();await s.install(pkg());f.fail='write';await assert.rejects(s.install(pkg('second')),/disk full/);assert.equal(s.list().length,1);await assert.rejects(s.install(pkg('third')),/unavailable/);
 f.fail=null;const r=C.createStore(f.io);await r.load();assert.equal(r.list().length,1);await r.install(pkg('third'));assert.equal(r.list().length,2);
});
test('failed payload commit never publishes or changes the catalog',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();await s.install(pkg());const old=f.files.get(C.path('catalog-1.json'));f.fail='commit';await assert.rejects(s.install(pkg('other')),/commit/);assert.equal(s.list().length,1);assert.equal(f.files.get(C.path('catalog-1.json')),old);
});
test('important write readback failure blocks further mutation',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();f.fail='readback';await assert.rejects(s.install(pkg()),/readback/);assert.equal(s.list().length,0);await assert.rejects(s.install(pkg('second')),/unavailable/);
});
test('garbage collection retains both catalogs and every live/recovery package',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();for(let i=0;i<8;i++)await s.install(pkg('hello',String(i)));
 assert.deepEqual([...f.files.keys()].sort(),['catalog-0.json','catalog-1.json','package-7.json','package-8.json'].map(C.path).sort());
 const r=C.createStore(f.io);await r.load();assert.equal(C.source(await r.read('hello')),'7');
});
test('framing handles fragmented Unicode, bounds and trailing data',()=>{
 const value={message:'雪 😀',protocol:1},frame=C.frame(value),reader=C.frameReader();let result;
 for(let i=0;i<frame.length;i++)result=reader.push(frame[i]);assert.equal(JSON.stringify(result.value),JSON.stringify(value));
 assert.throws(()=>C.frameReader().push('\xff\xff\xff\xff'),/length/);
 assert.throws(()=>C.frameReader().push(frame+'x'),/Trailing/);
 assert.throws(()=>reader.push('x'),/Extra/);
 for(const name of ['../payload.js','save:/x','package-0.json','catalog-2.json'])assert.throws(()=>C.path(name));
});
test('two scripts launch in the caller lexical scope and await the final promise',async()=>{
 const nativeToken=123;
 const p=pkg();p.scripts=[{name:'setup.js',source:'var token=nativeToken;'}, {name:'app.js',source:'(async function(){await Promise.resolve();return token+1;})();'}];
 assert.equal(await eval(C.source(C.package(p))),124);
});
test('a trailing line comment in one script cannot swallow the bundle separator',async()=>{
 const p=pkg();p.scripts=[{name:'lib.js',source:'var a=42 // no newline'}, {name:'app.js',source:'(async function(){return a;})();'}];
 assert.equal(await eval(C.source(C.package(p))),42);
});
