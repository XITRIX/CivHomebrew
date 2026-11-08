const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const c=vm.createContext({});for(const p of ['app/src/core.js','app/install/service.js'])vm.runInContext(fs.readFileSync(__dirname+'/../'+p,'utf8'),c);
 const target='save:/saves/Single/XSTRIG.Civ7Save',root='save:/civhomebrew/boot-install',original='CIV7-original',candidate='CIV7-candidate',bootstrap='// bootstrap',files=new Map([[target,original],['save:/saves/Single/other.Civ7Save','untouched']]);let fail=()=>{};
 const io={read:async p=>{fail('read',p);return files.get(p)??null;},write:async(p,b)=>{fail('write',p);files.set(p,b);},commit:async()=>{fail('commit');},mkdir:async()=>{},list:async()=>[],stat:async()=>({type:'dir'}),remove:async p=>{fail('remove',p);files.delete(p);},rename:async(a,b)=>{fail('rename',a,b);if(!files.has(a)||files.has(b))throw Error('rename rejected');files.set(b,files.get(a));files.delete(a);}};
 const service=c.CivBootInstaller.create(io),id=s=>({bytes:s.length,checksum:c.PayloadCore.hash(s)}),call=(op,v={})=>service.dispatch({protocol:1,op,...v});
 return {files,root,target,original,candidate,bootstrap,call,id,c,set fail(fn){fail=fn;}};
}
async function prepare(f){await f.call('bootstrap',{data:f.c.PayloadCore.base64(f.bootstrap),expected:f.id(f.bootstrap)});await f.call('backup',{expected:f.id(f.original)});await f.call('stage',{data:f.c.PayloadCore.base64(f.candidate),expected:f.id(f.candidate)});}
const publish=f=>f.call('publish',{current:f.id(f.original),candidate:f.id(f.candidate),original:f.id(f.original),bootstrap:f.id(f.bootstrap),mode:'install'});
test('trigger-only installer verifies backups, replaces one file and restores the exact original',async()=>{
 const f=fixture();await prepare(f);await publish(f);assert.equal(f.files.get(f.target),f.candidate);assert.equal(f.files.get(f.root+'/original.Civ7Save'),f.original);assert.equal(f.files.get('save:/saves/Single/other.Civ7Save'),'untouched');
 await f.call('stage',{data:f.c.PayloadCore.base64(f.original),expected:f.id(f.original)});await f.call('publish',{current:f.id(f.candidate),candidate:f.id(f.original),original:f.id(f.original),mode:'restore'});assert.equal(f.files.get(f.target),f.original);
});
test('changed trigger, mismatched candidate and different existing backup are preserved',async()=>{
 const f=fixture();await prepare(f);f.files.set(f.target,'CIV7-other');await assert.rejects(publish(f),/changed/);assert.equal(f.files.get(f.target),'CIV7-other');await assert.rejects(f.call('backup',{expected:f.id('CIV7-other')}),/different original/);
 await assert.rejects(f.call('stage',{data:f.c.PayloadCore.base64('bad'),expected:f.id(f.candidate)}),/Invalid/);assert.equal(f.files.get(f.root+'/candidate.Civ7Save'),f.candidate);
});
test('failed final rename rolls back the active trigger while preserving the original backup',async()=>{
 const f=fixture();await prepare(f);f.fail=(op,a)=>{if(op==='rename'&&a.endsWith('/candidate.Civ7Save'))throw Error('simulated interrupted publication');};await assert.rejects(publish(f),/restored/);assert.equal(f.files.get(f.target),f.original);assert.equal(f.files.get(f.root+'/original.Civ7Save'),f.original);
});
test('failed receipt write rolls publication back to the previous trigger',async()=>{
 const f=fixture();await prepare(f);f.fail=(op,a)=>{if(op==='write'&&a.endsWith('/receipt.json'))throw Error('receipt write failed');};await assert.rejects(publish(f),/restored/);assert.equal(f.files.get(f.target),f.original);
});
test('failed rollback reports uncertain state and refuses further mutations',async()=>{
 const f=fixture();await prepare(f);f.fail=(op,a)=>{if(op==='rename'&&(a.endsWith('/candidate.Civ7Save')||a.endsWith('/previous.Civ7Save')))throw Error('rename failure');};await assert.rejects(publish(f),/state uncertain/);await assert.rejects(f.call('backup',{expected:f.id(f.original)}),/uncertain/);assert.equal((await f.call('inspect')).uncertain,true);assert.equal(f.files.get(f.root+'/original.Civ7Save'),f.original);assert.equal(f.files.get(f.root+'/previous.Civ7Save'),f.original);
});
