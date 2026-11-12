const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const context=vm.createContext({});for(const name of ['core','system','resident'])vm.runInContext(fs.readFileSync(__dirname+'/../app/src/'+name+'.js','utf8'),context);const C=context.PayloadCore,S=context.CivSystem;
function fixture(){const files=new Map(),writes=[];let failure=null;return {files,writes,set fail(fn){failure=fn;},io:{read:async p=>files.get(p)??null,write:async(p,s)=>{writes.push(p);if(failure)failure(p,s);files.set(p,s);},commit:async()=>{},ensureDirectory:async()=>{}}};}
const image=(source='({api:1})',component='launcher',release='1')=>({format:'civswitch-system',version:1,api:1,component,release,source,checksum:C.hash(source)});
async function working(s,p=image()){await s.stage(p);const trial=await s.choose(p.component,false);await s.confirm(p.component,trial);return trial;}
test('system update stages inactive files and acknowledges only matching verified trial',async()=>{
 const f=fixture(),s=S.create(f.io);await working(s);const original=f.files.get(C.path('system/launcher/slot-0.js'));
 await s.stage(image('({api:1,version:2})','launcher','2'));assert.equal(f.files.get(C.path('system/launcher/slot-0.js')),original);
 const trial=await s.choose('launcher',false);assert.equal(trial.slot,1);assert.equal((await s.status('launcher')).attempted,true);
 await assert.rejects(s.confirm('launcher',{trial:true,slot:0}),/changed/);await s.confirm('launcher',trial);
 assert.equal((await s.status('launcher')).active,1);assert.equal((await s.status('launcher')).previous,0);
});
test('interrupted trial returns to acknowledged active version on next boot',async()=>{
 const f=fixture(),s=S.create(f.io);await working(s);await s.stage(image('throw Error("bad")','launcher','bad'));
 assert.equal((await s.choose('launcher',false)).release,'bad');
 const reboot=S.create(f.io);assert.equal((await reboot.choose('launcher',false)).release,'1');assert.equal((await reboot.status('launcher')).pending,null);
});
test('recovery bypass does not execute a pending candidate',async()=>{
 const f=fixture(),s=S.create(f.io);await working(s);await s.stage(image('throw Error("bad")','launcher','bad'));
 assert.equal((await s.choose('launcher',true)).release,'1');assert.equal((await s.status('launcher')).attempted,false);
});
test('partial component writes leave working version bootable',async()=>{
 const f=fixture(),s=S.create(f.io);await working(s);f.fail=p=>{if(p.endsWith('slot-1.json'))throw Error('disk full');};
 await assert.rejects(s.stage(image('({api:1,version:2})')),/disk full/);assert.equal((await S.create(f.io).choose('launcher',false)).release,'1');
});
test('corrupt candidate is rejected; corrupt active falls back to previous known hash',async()=>{
 const f=fixture(),s=S.create(f.io);await working(s);await s.stage(image('({api:1,version:2})','launcher','2'));
 f.files.set(C.path('system/launcher/slot-1.js'),'corrupt');assert.equal((await s.choose('launcher',false)).release,'1');
 await s.stage(image('({api:1,version:2})','launcher','2'));await s.confirm('launcher',await s.choose('launcher',false));
 f.files.set(C.path('system/launcher/slot-1.js'),'corrupt');assert.equal((await s.choose('launcher',false)).release,'1');
});
test('state recovery never silently executes an overwritten slot as an older version',async()=>{
 const f=fixture(),s=S.create(f.io);await working(s);await working(s,image('({api:1,v:2})','launcher','2'));
 await s.stage(image('({api:1,v:3})','launcher','3'));
 const status=await s.status('launcher');f.files.set(C.path('system/launcher/state-'+status.generation%2+'.json'),'corrupt');
 const selected=await S.create(f.io).choose('launcher',true);assert.notEqual(selected.release,'3');
});
test('unreadable states and malformed updates preserve owned files',async()=>{
 const f=fixture(),s=S.create(f.io);f.files.set(C.path('system/core/state-0.json'),'bad');f.files.set(C.path('system/core/state-1.json'),'bad');
 await assert.rejects(s.stage(image('1','core')),/unreadable/);assert.equal(f.writes.length,0);
 for(const p of [image('1','../core'),{...image(),api:2},{...image(),checksum:'00000000'}])assert.throws(()=>S.image(p));
 for(const p of ['system/../core','system/core/../../x','inbox/../x.civapp','system/core/anything.js','inbox/a/b.civapp'])assert.throws(()=>C.path(p));
});

test('explicit rollback validates previous slot and schedules it without rewriting component source',async()=>{
 const f=fixture(),s=S.create(f.io);await working(s);await working(s,image('({api:1,v:2})','launcher','2'));
 f.writes.length=0;await s.rollback('launcher');assert.equal((await s.choose('launcher',false)).release,'1');assert.ok(f.writes.every(p=>p.includes('state-')));
});

test('deferred metadata cannot overlap acknowledgement on a yielding bootstrap adapter',async()=>{
 const f=fixture(),s=S.create(f.io);await working(s);await s.stage(image('({api:1,v:2})','launcher','2'));
 const trial=await s.choose('launcher',false),read=f.io.read,write=f.io.write;
 let held,release;const blocked=new Promise(r=>held=r);let readers=0;
 f.io.read=async p=>{if(p.endsWith('state-0.json')){readers++;held();await new Promise(r=>release=r);readers--;}return read(p);};
 f.io.write=async(p,v)=>{if(readers)throw Error('File operation failed: 0xe02');return write(p,v);};
 // Model a bootstrap status read holding its native file across a timer yield.
 const originalStatus=s.status;context.CivResident.serializeSystem(s);assert.equal(context.CivResident.serializeSystem(s),s);
 const status=s.status('launcher');await blocked;
 let confirmed=false;const confirm=s.confirm('launcher',trial).then(()=>{confirmed=true;});
 await new Promise(r=>setTimeout(r,5));assert.equal(confirmed,false);assert.equal(readers,1);
 // Only the deliberately held status read is delayed; later queued reads close.
 f.io.read=read;release();await status;await confirm;
 assert.equal((await s.status('launcher')).pending,null);assert.notEqual(s.status,originalStatus);
});
test('system queue remains usable after a rejected operation and wraps the original boot object in place',async()=>{
 const f=fixture(),s=S.create(f.io);await working(s);const boot={system:s};context.CivResident.serializeSystem(s);
 await assert.rejects(s.stage({...image(),checksum:'bad'}));
 await s.stage(image('({api:1,v:2})','launcher','2'));await boot.system.confirm('launcher',await s.choose('launcher',false));
 assert.equal((await boot.system.status('launcher')).active,1);
});
