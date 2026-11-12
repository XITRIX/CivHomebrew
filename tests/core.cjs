const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({});
for(const name of ['core','app-metadata','storage','app-library'])vm.runInContext(fs.readFileSync(__dirname+'/../app/src/'+name+'.js','utf8'),context);
const C=context.PayloadCore;
test('ordered evaluator retains native lexical scope and var bindings until the final lifetime settles',async()=>{
 const c=vm.createContext({setTimeout});c.window=c;
 vm.runInContext('(function(){var nativeSentinel=41;'+fs.readFileSync(__dirname+'/../app/src/loader-scope.js','utf8')+'})();',c);
 const sources=['var shared=nativeSentinel;','(async function(){globalThis.entered=true;await new Promise(r=>globalThis.finish=r);return shared+1;})();'];
 let completed=false;const lifetime=c.PayloadLoaderScope.evaluateScripts(async()=>sources.length?sources.shift():null).then(v=>{completed=true;return v;});
 for(let i=0;i<100&&!c.entered;i++)await new Promise(r=>setTimeout(r,2));
 assert.equal(c.entered,true);assert.equal(completed,false);assert.equal(c.shared,undefined);assert.equal(c.nativeSentinel,undefined);
 c.finish();assert.equal(await lifetime,42);
});
test('Doom-sized ASCII transport parses and validates under a 64 MiB jitless heap',()=>{
 const child=require('node:child_process').spawnSync(process.execPath,['--jitless','--expose-gc','--max-old-space-size=64',__dirname+'/large-package.cjs'],{encoding:'utf8',timeout:60000});
 assert.equal(child.status,0,child.stderr.slice(-3000));assert.match(child.stdout,/LARGE_PACKAGE_OK/);
});
test('ASCII codec fast path preserves all UTF-8 and malformed-input behavior',()=>{
 for(const text of ['', 'A+/=%\\\"\n\u0000', '雪 😀', String.fromCharCode(...Array.from({length:256},(_,i)=>i))]){
  assert.equal(C.encode(text),Buffer.from(text,'utf8').toString('latin1'));
  assert.equal(C.decode(C.encode(text)),text);
 }
 assert.throws(()=>C.encode('\ud800'));assert.throws(()=>C.decode('\xff'));assert.throws(()=>C.decode('\xc3'));
});
const pkg=(id='hello',source='(async function(){return 42;})();')=>({format:'civswitch-app',version:1,id,name:'Hello',metadata:{api:1},scripts:[{name:'app.js',source}],icon:''});
const png=()=>fs.readFileSync(__dirname+'/../examples/hello/icon.png').toString('latin1');
test('feature core accepts bounded large v1 data bundles while recovery and system limits stay conservative',async()=>{
 const legacy=vm.createContext({});vm.runInContext(fs.readFileSync(__dirname+'/../app/src/core.js','utf8'),legacy);
 assert.equal(legacy.PayloadCore.maxSource,8*1024*1024);
 assert.equal(C.maxSource,32*1024*1024);assert.equal(C.maxFrame,48*1024*1024);assert.equal(C.quota,128*1024*1024);
 const p=pkg('bundled-doom','window.data="'+'A'.repeat(9*1024*1024)+'";');
 assert.throws(()=>legacy.PayloadCore.package(p),/8 MiB/);assert.equal(C.package(p).version,1);
 const f=fixture(),store=C.createStore(f.io);await store.load();const entry=await store.install(p);
 assert.equal((await store.read(p.id)).scripts[0].source,p.scripts[0].source);
 f.files.set('save:/civhomebrew/data/doom/saves/slot.json','persistent save');
 await context.CivAppLibrary.create({appStore:store.transaction}).remove(p.id,entry.checksum);
 assert(![...f.files.keys()].some(name=>name.startsWith(C.appPath(p.id)+'/')));
 assert.equal(f.files.get('save:/civhomebrew/data/doom/saves/slot.json'),'persistent save');
 const oversized=pkg('oversized','A'.repeat(C.maxSource+1));assert.throws(()=>C.package(oversized),/32 MiB/);
});
function fixture(){
 const files=new Map(),dirs=new Set(),trace=[];let fail=null;
 const before=(op,path,data,binary)=>{trace.push({op,path,data,binary});if(fail)fail(op,path,data,binary);};
 return {files,dirs,trace,set fail(fn){fail=fn;},io:{
  read:async(path,limit,binary)=>{before('read',path,undefined,binary);if(!files.has(path))return null;const value=files.get(path);assert.ok((binary?value.length:C.encode(value).length)<=limit,'read limit');return value;},
  write:async(path,data,binary)=>{before('write',path,data,binary);assert.ok(dirs.has(path.slice(0,path.lastIndexOf('/'))),'parent directory exists');files.set(path,data);},
  ensureDirectory:async path=>{before('mkdir',path);dirs.add(path);},
  removeDirectory:async path=>{before('rmdir',path);assert.match(path,/^save:\/civhomebrew\/apps\/[a-z0-9-]+$/);for(const p of files.keys())if(p.startsWith(path+'/'))files.delete(p);for(const d of dirs)if(d===path||d.startsWith(path+'/'))dirs.delete(d);},
  commit:async()=>before('commit'),remove:async path=>{before('remove',path);files.delete(path);}
 }};
}
function legacy(f,packages){
 const entries=packages.map((p,i)=>{const text=C.seal(C.package(p)),file='package-'+(i+1)+'.json';f.files.set(C.path(file),text);return {id:p.id,name:p.name,file,bytes:C.encode(text).length,checksum:C.hash(text)};});
 f.files.set(C.path('catalog-1.json'),C.seal({version:1,generation:1,entries:entries.slice(0,1)}));
 f.files.set(C.path('catalog-0.json'),C.seal({version:1,generation:2,entries}));return entries;
}
test('checksum stays compatible with independent UTF-16 FNV-1a across unroll boundaries',()=>{
 const reference=s=>{let h=2166136261n;for(let i=0;i<s.length;i++)h=((h^BigInt(s.charCodeAt(i)))*16777619n)&0xffffffffn;return h.toString(16).padStart(8,'0');};
 assert.equal(C.hash('hello'),'4f9f2cab');
 for(const n of [0,1,2,3,4,5,7,8,9,31,32,33,8191,8192,8193,65535,65536,65537]){
  const s=Array.from({length:n},(_,i)=>String.fromCharCode((i*7919)&65535)).join('');assert.equal(C.hash(s),reference(s));
 }
 for(const s of ['雪 😀','a\u0000b','\ud800','\udfff','😀'.repeat(131073)])assert.equal(C.hash(s),reference(s));
});
test('portable binary codec works without atob/btoa, including the real PNG',()=>{
 for(let n=0;n<300;n++){const raw=Buffer.from(Array.from({length:n},(_,i)=>(i*47)%256));assert.equal(C.base64(raw.toString('latin1')),raw.toString('base64'));assert.equal(C.unbase64(raw.toString('base64')),raw.toString('latin1'));}
 assert.equal(C.unbase64(C.base64(png())),png());assert.throws(()=>C.unbase64('x'),/base64/);
});
test('package validates all traversal, collisions and metadata before installation',()=>{
 for(const name of ['../x.js','/x.js','a//x.js','a\\x.js','a/./x.js']){const p=pkg();p.scripts[0].name=name;assert.throws(()=>C.package(p));}
 for(const names of [['a.js','a.js/x.js'],['a.js/x.js','a.js'],['App.js','app.js']]){const p=pkg();p.scripts=names.map(name=>({name,source:'1'}));assert.throws(()=>C.package(p),/conflict|duplicate/i);}
 const p=pkg();p.metadata.api=2;assert.throws(()=>C.package(p),/unsupported/);
 const icon=Buffer.from(png(),'latin1');icon.writeUInt32BE(128,16);const bad=pkg();bad.icon='data:image/png;base64,'+icon.toString('base64');assert.throws(()=>C.package(bad),/256/);
 for(const path of ['../payload.js','save:/x','apps/../manifest.json','apps/hello/scripts/../../x.js','apps/hello/data/x','apps/hello/scripts/a\\b.js'])assert.throws(()=>C.path(path));
});
test('installation extracts a plain manifest, real PNG and ordered raw UTF-8 scripts',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();const p=pkg();p.scripts.unshift({name:'lib/library.js',source:'var message="雪 😀";'});p.icon='data:image/png;base64,'+C.base64(png());
 const e=await s.install(p),m=JSON.parse(f.files.get(C.appPath('hello','manifest.json')));
 assert.equal(m.format,'civswitch-installed-app');assert.equal(m.scripts[0].path,'scripts/lib/library.js');assert.equal(m.scripts[0].source,undefined);assert.equal(m.icon.path,'icon.png');
 assert.equal(f.files.get(C.appPath('hello','scripts/lib/library.js')),p.scripts[0].source);assert.equal(f.files.get(C.appPath('hello','icon.png')),png());
 assert.equal(e.bytes,[...f.files].filter(([path])=>path.startsWith(C.appPath('hello')+'/')).reduce((n,[path,data])=>n+(path.endsWith('.png')?data.length:C.encode(data).length),0));
 assert.equal([...f.files.keys()].some(path=>/package-\d+/.test(path)),false);
 assert.equal(C.source(await s.read('hello')),p.scripts.map(s=>s.source).join('\n;\n'));
});
test('selector reads manifests and PNG only; launch reads scripts without loading icons',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();const p=pkg();p.icon='data:image/png;base64,'+C.base64(png());await s.install(p);
 f.trace.length=0;s.list();assert.equal(f.trace.length,0);
 assert.equal(await s.icon('hello'),p.icon);assert.equal(f.trace.some(e=>e.path&&e.path.includes('/scripts/')),false);
 f.trace.length=0;await s.read('hello');assert.equal(f.trace.some(e=>e.path&&e.path.endsWith('/icon.png')),false);
});
test('replaceable app actions inspect metadata without scripts and delete only the selected installation',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();const p=pkg();p.metadata={api:1,author:'Developer 雪',release:'1.2.3',description:'Details'};p.scripts.unshift({name:'lib/nested.js',source:'1'});p.icon='data:image/png;base64,'+C.base64(png());
 const entry=await s.install(p);await s.install(pkg('other'));f.files.set('save:/moonlight/pairing.json','private');f.files.set(C.path('ftp-settings.json'),'settings');
 const library=context.CivAppLibrary.create({appStore:s.transaction});f.trace.length=0;
 const info=await library.describe('hello',entry.checksum);assert.equal(info.metadata.author,'Developer 雪');assert.equal(info.metadata.release,'1.2.3');assert.equal(info.scripts,2);assert.equal(info.bytes,entry.bytes);assert.equal(f.trace.some(e=>e.path?.includes('/scripts/')),false);
 f.trace.length=0;await library.remove('hello',entry.checksum);
 assert.equal(s.list().length,1);assert.equal(s.list()[0].id,'other');assert.equal([...f.files.keys()].some(p=>p.startsWith(C.appPath('hello')+'/')),false);assert.equal(f.dirs.has(C.appPath('hello')),false);
 assert.equal(f.files.get('save:/moonlight/pairing.json'),'private');assert.equal(f.files.get(C.path('ftp-settings.json')),'settings');assert.ok(await s.read('other'));
 const deletion=f.trace.findIndex(e=>e.op==='rmdir');assert.equal(f.trace.slice(0,deletion).filter(e=>e.op==='write'&&e.path.includes('catalog-')).length,2);
 const reload=C.createStore(f.io);await reload.load();assert.equal(reload.list().length,1);await assert.rejects(reload.read('hello'),/not installed/);
});
test('app-store actions reject stale selection and generic transactions are scoped, exclusive and expire',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();const old=await s.install(pkg()),current=await s.install(pkg('hello','42'));const library=context.CivAppLibrary.create({appStore:s.transaction});f.trace.length=0;
 await assert.rejects(library.remove('hello',old.checksum),/changed/);assert.equal(f.trace.length,0);assert.equal(s.list()[0].checksum,current.checksum);
 let captured;
 await s.transaction(async store=>{captured=store;store.entries[0].name='changed snapshot';assert.equal(s.list()[0].name,'Hello');await assert.rejects(s.install(pkg('other')),/busy/);await assert.rejects(s.transaction(()=>{}),/busy/);
  assert.throws(()=>store.files.removeDirectory('../hello'),/Invalid/);assert.throws(()=>store.files.write('hello','../../ftp-settings.json','bad'),/Invalid/);assert.throws(()=>store.files.remove('hello','scripts/../manifest.json'),/Invalid/);
 });assert.throws(()=>captured.files.removeDirectory('hello'),/ended/);assert.throws(()=>captured.publish([]),/ended/);assert.ok(await s.read('hello'));
});
test('delete failures preserve other apps and never remove files before verified catalog retirement',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();const entry=await s.install(pkg());await s.install(pkg('other'));const library=context.CivAppLibrary.create({appStore:s.transaction});f.trace.length=0;
 f.fail=(op,path)=>{if(op==='write'&&path.includes('catalog-'))throw Error('catalog failure');};
 await assert.rejects(library.remove('hello',entry.checksum),/catalog/);assert.equal(f.trace.some(e=>e.op==='rmdir'),false);assert.ok(f.files.has(C.appPath('hello','manifest.json')));await assert.rejects(s.transaction(()=>{}),/unavailable/);
 f.fail=null;const reload=C.createStore(f.io);await reload.load();f.fail=(op)=>{if(op==='rmdir')throw Error('directory failure');};
 await assert.rejects(context.CivAppLibrary.create({appStore:reload.transaction}).remove('hello',entry.checksum),/directory/);assert.equal(reload.list().some(e=>e.id==='hello'),false);assert.ok(await reload.read('other'));assert.ok(f.files.has(C.appPath('hello','manifest.json')));
 f.fail=null;await reload.install(pkg());assert.ok(await reload.read('hello'));
});
test('older cores provide Information through read-only files and reject deletion without mutating settings',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();const p=pkg();p.metadata={api:1,author:'雪',release:'2'};const entry=await s.install(p);f.trace.length=0;
 const library=context.CivAppLibrary.create({list:s.list,files:{read:async path=>{assert.equal(path,'/Root/civhomebrew/apps/hello/manifest.json');return C.encode(f.files.get(C.appPath('hello','manifest.json')));}}});
 assert.equal((await library.describe('hello',entry.checksum)).metadata.author,'雪');await assert.rejects(library.remove('hello',entry.checksum),/Update the core once/);assert.equal(f.trace.length,0);
});
test('replacement removes the entire previous folder before writes, including obsolete files, icons and nested directories',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();const old=pkg();old.icon='data:image/png;base64,'+C.base64(png());old.scripts.unshift({name:'old/sub/library.js',source:'1'});await s.install(old);await s.install(pkg('other'));
 f.files.set(C.appPath('hello')+'/old-data.bin','old data');f.trace.length=0;
 await s.install(pkg('hello','42'));
 assert.equal(f.files.has(C.appPath('hello','scripts/old/sub/library.js')),false);assert.equal(f.files.has(C.appPath('hello','icon.png')),false);assert.equal(f.files.has(C.appPath('hello')+'/old-data.bin'),false);
 assert.equal(f.dirs.has(C.appPath('hello','scripts/old')),false);assert.equal(C.source(await s.read('other')),pkg().scripts[0].source);
 const deletion=f.trace.findIndex(e=>e.op==='rmdir'),firstWrite=f.trace.findIndex(e=>e.op==='write'&&e.path.startsWith(C.appPath('hello')+'/'));
 assert.ok(deletion>=0&&firstWrite>deletion);assert.equal(f.trace[deletion+1].op,'commit');
 assert.deepEqual([...f.files.keys()].filter(p=>p.startsWith(C.appPath('hello')+'/')).sort(),[C.appPath('hello','manifest.json'),C.appPath('hello','scripts/app.js')].sort());
});
test('replacement preserves every catalog position without overlapping array insertion',async()=>{
 const isolated=vm.createContext({});
 for(const name of ['core','app-metadata','storage'])vm.runInContext(fs.readFileSync(__dirname+'/../app/src/'+name+'.js','utf8'),isolated);
 vm.runInContext('Array.prototype.splice=function(){throw Error("unsafe array insertion");}',isolated);
 const f=fixture(),s=isolated.PayloadCore.createStore(f.io);await s.load();
 for(const id of ['first','middle','last'])await s.install(pkg(id,id));
 for(const id of ['first','middle','last']){
  await s.install(pkg(id,id+' updated'));
  assert.deepEqual(Array.from(s.list(),e=>e.id),['first','middle','last']);
  for(const other of ['first','middle','last'])assert.equal((await s.read(other)).scripts[0].source,other+(['first','middle','last'].indexOf(other)<=['first','middle','last'].indexOf(id)?' updated':''));
 }
 await s.install(pkg('appended'));assert.deepEqual(Array.from(s.list(),e=>e.id),['first','middle','last','appended']);
 const reload=isolated.PayloadCore.createStore(f.io);await reload.load();assert.deepEqual(Array.from(reload.list(),e=>e.id),['first','middle','last','appended']);
});
test('invalid replacements leave the old folder and catalog untouched',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();await s.install(pkg());const before=JSON.stringify([...f.files]);const bad=pkg();bad.scripts.push({name:'../escape.js',source:'1'});
 await assert.rejects(s.install(bad));assert.equal(JSON.stringify([...f.files]),before);
});
test('replacement reclaims old app bytes; quota preflight rejects additions before deleting files',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();const original=C.quota,p=pkg(),size=C.installPlan(p).entry.bytes;C.quota=size*2+100;
 try{await s.install(p);await s.install(pkg('other'));await s.install(p);const before=JSON.stringify([...f.files]);await assert.rejects(s.install(pkg('third')),/quota/);assert.equal(JSON.stringify([...f.files]),before);}finally{C.quota=original;}
});
test('failed extraction leaves the replaced app unlisted across restart and removes partial files',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();await s.install(pkg());await s.install(pkg('other'));
 f.fail=(op,path)=>{if(op==='write'&&path.endsWith('/hello/scripts/app.js'))throw Error('disk full');};
 await assert.rejects(s.install(pkg('hello','42')),/disk full/);assert.equal(s.list().some(e=>e.id==='hello'),false);assert.equal([...f.files.keys()].some(p=>p.startsWith(C.appPath('hello')+'/')),false);
 f.fail=null;const reload=C.createStore(f.io);await reload.load();await assert.rejects(reload.read('hello'),/not installed/);assert.ok(await reload.read('other'));await reload.install(pkg());assert.ok(await reload.read('hello'));
});
test('manifest is committed only after all extracted file readbacks pass',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();f.fail=(op,path)=>{if(op==='read'&&path.endsWith('/scripts/app.js'))throw Error('readback failure');};
 await assert.rejects(s.install(pkg()),/readback/);assert.equal(f.trace.some(e=>e.op==='write'&&e.path.endsWith('/manifest.json')),false);assert.equal(s.list().length,0);
});
test('extraction commits and verifies each file before writing the next',async()=>{
 const f=fixture(),store=C.createStore(f.io);await store.load();const p=pkg();
 p.scripts.unshift({name:'data/first.js',source:'var first=1;'});await store.install(p);
 const writes=f.trace.map((e,i)=>({e,i})).filter(({e})=>e.op==='write'&&e.path.includes('/scripts/'));
 assert.equal(writes.length,2);
 for(let n=0;n<writes.length;n++){
  const {e,i}=writes[n],end=n+1<writes.length?writes[n+1].i:f.trace.findIndex(t=>t.op==='write'&&t.path.endsWith('/manifest.json'));
  const between=f.trace.slice(i+1,end);
  assert.equal(between[0].op,'commit');assert(between.some(t=>t.op==='read'&&t.path===e.path));
 }
});
test('failed catalog removal prevents deletion and blocks uncertain subsequent mutation',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();await s.install(pkg());const source=f.files.get(C.appPath('hello','scripts/app.js'));f.trace.length=0;
 f.fail=(op,path)=>{if(op==='write'&&path.includes('catalog-'))throw Error('catalog write failed');};
 await assert.rejects(s.install(pkg('hello','42')),/catalog/);assert.equal(f.trace.some(e=>e.op==='rmdir'),false);assert.equal(f.files.get(C.appPath('hello','scripts/app.js')),source);await assert.rejects(s.install(pkg('new')),/unavailable/);
 f.fail=null;const reload=C.createStore(f.io);await reload.load();assert.equal(C.source(await reload.read('hello')),source);
});
test('uncertain final publication preserves verified files for recovery instead of deleting them',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();let failed=false;
 f.fail=(op,path)=>{if(!failed&&op==='read'&&path&&path.includes('catalog-')){failed=true;throw Error('catalog readback failed');}};
 await assert.rejects(s.install(pkg()),/readback/);assert.ok(f.files.has(C.appPath('hello','manifest.json')));await assert.rejects(s.install(pkg('new')),/unavailable/);
 f.fail=null;const reload=C.createStore(f.io);await reload.load();assert.ok(await reload.read('hello'));
});
test('catalog mirror recovery preserves current app membership; both corrupt slots preserve all files',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();await s.install(pkg());await s.install(pkg('second'));f.files.set(C.path('catalog-0.json'),'corrupt');
 const reload=C.createStore(f.io);assert.equal((await reload.load()).recovered,true);assert.equal(reload.list().length,2);
 f.files.set(C.path('catalog-1.json'),'corrupt');const blocked=C.createStore(f.io),before=JSON.stringify([...f.files]);await assert.rejects(blocked.load(),/unreadable/);await assert.rejects(blocked.install(pkg()),/unavailable/);assert.equal(JSON.stringify([...f.files]),before);
});
test('legacy JSON installations migrate to files and retire legacy blobs only after both catalogs commit',async()=>{
 const f=fixture(),p=pkg();p.icon='data:image/png;base64,'+C.base64(png());legacy(f,[p,pkg('other')]);const s=C.createStore(f.io);assert.equal((await s.load()).migrated,true);
 assert.equal(C.source(await s.read('hello')),p.scripts[0].source);assert.equal(await s.icon('hello'),p.icon);assert.ok(await s.read('other'));assert.equal([...f.files.keys()].some(p=>/package-\d+\.json$/.test(p)),false);
 for(let i=0;i<2;i++)assert.equal(C.open(f.files.get(C.path('catalog-'+i+'.json'))).version,2);
 const reload=C.createStore(f.io);assert.equal((await reload.load()).migrated,false);assert.equal(reload.list().length,2);
});
test('interrupted migration catalog mirror resumes before deleting legacy packages',async()=>{
 const f=fixture();legacy(f,[pkg()]);let failed=false;
 f.fail=(op,path)=>{if(!failed&&op==='write'&&path===C.path('catalog-0.json')){failed=true;throw Error('mirror interrupted');}};
 const s=C.createStore(f.io);await assert.rejects(s.load(),/mirror interrupted/);assert.ok(f.files.has(C.path('package-1.json')));assert.equal(C.open(f.files.get(C.path('catalog-1.json'))).version,2);
 f.fail=null;const reload=C.createStore(f.io);await reload.load();assert.ok(await reload.read('hello'));assert.equal(f.files.has(C.path('package-1.json')),false);for(let i=0;i<2;i++)assert.equal(C.open(f.files.get(C.path('catalog-'+i+'.json'))).version,2);
});
test('failed migration preserves original blobs/catalogs and can retry on a fresh load',async()=>{
 const f=fixture();legacy(f,[pkg()]);const legacyBefore=[...f.files];f.fail=(op,path)=>{if(op==='write'&&path.endsWith('/scripts/app.js'))throw Error('write failed');};
 const s=C.createStore(f.io);await assert.rejects(s.load(),/write failed/);for(const [path,text]of legacyBefore)assert.equal(f.files.get(path),text);await assert.rejects(s.install(pkg()),/unavailable/);
 f.fail=null;const reload=C.createStore(f.io);assert.equal((await reload.load()).migrated,true);assert.ok(await reload.read('hello'));
});
test('script corruption blocks execution; corrupt PNG does not prevent launching valid scripts',async()=>{
 const f=fixture(),s=C.createStore(f.io);await s.load();const p=pkg();p.icon='data:image/png;base64,'+C.base64(png());await s.install(p);
 f.files.set(C.appPath('hello','icon.png'),'bad');await assert.rejects(s.icon('hello'));assert.ok(await s.read('hello'));
 f.files.set(C.appPath('hello','scripts/app.js'),'corrupt');await assert.rejects(s.read('hello'),/corrupt/);
});
test('installed loading progress counts UTF-8 bytes across unequal files and finishes after verification',async()=>{
 const f=fixture(),store=C.createStore(f.io);await store.load();
 const p=pkg();p.scripts=[{name:'lib.js',source:'var text="雪 😀";'}, {name:'app.js',source:'/*'+'x'.repeat(1000)+'*/42'}];await store.install(p);
 const original=f.io.read;
 f.io.read=async(path,limit,binary,onProgress)=>{const text=await original(path,limit,binary);if(onProgress){const n=C.encode(text).length;onProgress(Math.floor(n/2));await Promise.resolve();onProgress(n);}return text;};
 const events=[];const loaded=await store.read('hello',(done,total)=>events.push({done,total}));
 const total=p.scripts.reduce((n,s)=>n+Buffer.byteLength(s.source),0);
 assert.equal(C.source(loaded),C.source(p));assert.equal(events[0].done,0);assert.equal(events.at(-1).done,total);
 assert.ok(events.every(e=>e.total===total&&e.done>=0&&e.done<=total));
 assert.ok(events.every((e,i)=>!i||e.done>=events[i-1].done));
 assert.ok(events.some(e=>e.done===Buffer.byteLength(p.scripts[0].source)));
 assert.ok(events.some(e=>e.done>0&&e.done<Buffer.byteLength(p.scripts[0].source)));
 f.files.set(C.appPath('hello','scripts/app.js'),'x'.repeat(p.scripts[1].source.length));
 const failed=[];await assert.rejects(store.read('hello',(done,total)=>failed.push({done,total})),/corrupt/);
 assert.ok(failed.every(e=>e.done<e.total),'corrupt final file never reports completion');
});
test('installation progress counts UTF-8 and binary write/readback bytes and completes only after catalog publication',async()=>{
 const f=fixture(),store=C.createStore(f.io);await store.load();const p=pkg();p.scripts.unshift({name:'lib.js',source:'var text="雪 😀";'});p.icon='data:image/png;base64,'+C.base64(png());
 const plan=C.installPlan(p),events=[];await store.install(p,(done,total)=>{events.push([done,total]);if(done===total)assert.equal(C.open(f.files.get(C.path('catalog-0.json'))).entries[0].id,p.id);});
 const total=plan.entry.bytes*2+1;assert.deepEqual(events[0],[0,total]);assert.deepEqual(events.at(-1),[total,total]);
 assert.ok(events.length>5);for(let i=1;i<events.length;i++){assert.ok(events[i][0]>=events[i-1][0]);assert.equal(events[i][1],total);if(i<events.length-1)assert.ok(events[i][0]<total);}
 const failed=[];f.fail=(op,path)=>{if(op==='read'&&path.endsWith('/scripts/app.js'))throw Error('Readback failed');};
 await assert.rejects(store.install(p,(done,total)=>failed.push([done,total])),/Readback/);assert.ok(failed.length>1);assert.ok(failed.every(([done,total])=>done<total));
});
test('framing handles fragmented Unicode and rejects bounds/trailing data',()=>{
 const value={message:'雪 😀',protocol:1},frame=C.frame(value),reader=C.frameReader();let result;for(const byte of frame)result=reader.push(byte);assert.equal(JSON.stringify(result.value),JSON.stringify(value));assert.throws(()=>C.frameReader().push('\xff\xff\xff\xff'),/length/);assert.throws(()=>C.frameReader().push(frame+'x'),/Trailing/);assert.throws(()=>reader.push('x'),/Extra/);
});
test('multiple installed scripts preserve caller scope and the final awaited completion value',async()=>{
 const nativeToken=123,p=pkg();p.scripts=[{name:'lib.js',source:'var a=nativeToken // no newline'}, {name:'app.js',source:'(async function(){await Promise.resolve();return a+1;})();'}];assert.equal(await eval(C.source(C.package(p))),124);
});
