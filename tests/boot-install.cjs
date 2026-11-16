const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path'),{execFileSync}=require('node:child_process');
let generated;
function nativeBootstrap(){
 if(!generated){
  const script="import sys,json,base64;sys.path.insert(0,'tools');import install_homebrew as i;body=i.pm.bundle(boot_integrated=True);expected=i.identity(body);print(json.dumps({'data':base64.b64encode(body).decode(),'expected':expected,'limit':i.BOOTSTRAP_LIMIT,'startup':i.startup_source('save:/civhomebrew/boot-install/test.js',expected)}))";
  generated=JSON.parse(execFileSync('python3',['-B','-c',script],{cwd:path.resolve(__dirname,'..'),maxBuffer:8*1024*1024}));
 }
 return generated;
}
// Run the shipped cold-start reader against mocked SDK exports and file I/O.
// eval captures the verified payload instead of executing native graphics.
function startupReader(image,bytes,expected=image.expected,reportedLength=bytes.length){
 const base=0x100000n,mod=base+0x1000n,dynamic=base+0x2000n,table=base+0x3000n,strings=base+0x4000n,symbols=base+0x5000n;
 const words32=new Map([[base+4n,0x1000n],[mod,0x30444f4dn],[mod+4n,0x1000n],[table,1n],[table+4n,5n],[table+8n,1n]]),words64=new Map(),chars=new Map(),functions=new Map(),allocations=new Map();
 for(const [i,tag,offset] of [[0,4,0x3000],[1,5,0x4000],[2,6,0x5000]]){words64.set(dynamic+BigInt(i*16),BigInt(tag));words64.set(dynamic+BigInt(i*16+8),BigInt(offset));}words64.set(dynamic+48n,0n);
 const names=['_ZN2nn2fs8OpenFileEPNS0_10FileHandleEPKci','_ZN2nn2fs11GetFileSizeEPlNS0_10FileHandleE','_ZN2nn2fs8ReadFileENS0_10FileHandleElPvm','_ZN2nn2fs9CloseFileENS0_10FileHandleE'];
 names.forEach((name,index)=>{const i=index+1,offset=BigInt(i*128),fn=BigInt(0x6000+i*256);words32.set(symbols+BigInt(i*24),offset);words64.set(symbols+BigInt(i*24+8),fn);words32.set(table+8n+BigInt((1+i)*4),BigInt(i===4?0:i+1));for(let j=0;j<name.length;j++)chars.set(strings+offset+BigInt(j),BigInt(name.charCodeAt(j)));functions.set(base+fn,index);});
 let next=0x1000000n,reads=0,closes=0,evaluated=null;
 function malloc(n){const pointer=next;next+=BigInt(n+16);allocations.set(pointer,Buffer.alloc(n));return pointer;}
 const read=(words,p)=>{assert.ok(words.has(p),'unexpected mocked SDK read: '+p.toString(16));return words.get(p);};
 const g={sdk_base:base,read32:p=>read(words32,p),read64:p=>read(words64,p),read8:p=>chars.get(p)||0n,malloc,alloc_string:s=>malloc(s.length+1),free:p=>{assert.ok(allocations.delete(p));},read_buffer:(p,n)=>allocations.get(p).subarray(0,n),setTimeout,log:async()=>{},eval:source=>{evaluated=source;return 'verified';},
  call_rop(fn,...args){switch(functions.get(fn)){
   case 0:words64.set(args[0],99n);break;
   case 1:words64.set(args[0],BigInt(reportedLength));break;
   case 2:{const [,offset,pointer,count]=args;assert.ok(count<=32768n);assert.equal(Number(offset),reads*32768);bytes.copy(allocations.get(pointer),0,Number(offset),Number(offset+count));reads++;break;}
   case 3:closes++;break;
   default:throw Error('Unexpected native call');
  }return 0n;}
 };
 const source=image.startup.replace(/civBootExpected=.*?,civBootBase=/,'civBootExpected='+JSON.stringify(expected)+',civBootBase=');
 return {run:vm.runInContext(source,vm.createContext(g)),allocations,get reads(){return reads;},get closes(){return closes;},get evaluated(){return evaluated;}};
}
function fixture(){
 const c=vm.createContext({});for(const p of ['app/src/core.js','app/install/service.js'])vm.runInContext(fs.readFileSync(__dirname+'/../'+p,'utf8'),c);
 const target='save:/saves/Single/XSTRIG.Civ7Save',root='save:/civhomebrew/boot-install',original='CIV7-original',candidate='CIV7-candidate',bootstrap='// bootstrap',files=new Map([[target,original],['save:/saves/Single/other.Civ7Save','untouched']]);let fail=()=>{};
 const io={read:async p=>{fail('read',p);return files.get(p)??null;},write:async(p,b)=>{fail('write',p);files.set(p,b);},commit:async()=>{fail('commit');},mkdir:async()=>{},list:async()=>[],stat:async()=>({type:'dir'}),remove:async p=>{fail('remove',p);files.delete(p);},rename:async(a,b)=>{fail('rename',a,b);if(!files.has(a)||files.has(b))throw Error('rename rejected');files.set(b,files.get(a));files.delete(a);}};
 const service=c.CivBootInstaller.create(io),id=s=>({bytes:s.length,checksum:c.PayloadCore.hash(s)}),call=(op,v={})=>service.dispatch({protocol:1,op,...v});
 return {files,root,target,original,candidate,bootstrap,call,id,c,set fail(fn){fail=fn;}};
}
async function prepare(f){await f.call('bootstrap',{data:f.c.PayloadCore.base64(f.bootstrap),expected:f.id(f.bootstrap)});await f.call('backup',{expected:f.id(f.original)});await f.call('stage',{data:f.c.PayloadCore.base64(f.candidate),expected:f.id(f.candidate)});}
const publish=f=>f.call('publish',{current:f.id(f.original),candidate:f.id(f.candidate),original:f.id(f.original),bootstrap:f.id(f.bootstrap),mode:'install'});
test('generated installer starts without a prior menu and keeps its lifetime through cleanup',async()=>{
 const source=execFileSync('python3',['-B','-c',"import sys;sys.path.insert(0,'tools');import install_homebrew as i;sys.stdout.buffer.write(i.service_bundle(9041))"],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
 assert.ok(Buffer.byteLength(source,'utf8')<500*1024,'installer must fit one raw-loader upload');
 for(const warm of [false,true]){
  const logs=[],timers=new Set();let dispatch,stops=0,creates=0,settled=false,releaseStop;
  const stopped=new Promise(resolve=>releaseStop=resolve);
  const c=vm.createContext({log:async text=>logs.push(text),setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>assert.ok(timers.delete(fn))});c.window=c;
  assert.equal(c.CivHomebrewSDK,undefined);
  if(warm)vm.runInContext(fs.readFileSync(__dirname+'/../app/vendor/civhomebrew-sdk.js','utf8'),c);
  const previous=c.CivHomebrewSDK;
  // Mock the native I/O boundary, leaving the generated script order, SDK,
  // transfer adapter, installer dispatch and final lifetime promise intact.
  let platform;
  Object.defineProperty(c,'PayloadNative',{get:()=>platform,set:value=>{
   platform={...value,create(){
    creates++;assert.equal(typeof c.CivHomebrewSDK.native.create,'function');
    assert.equal(c.PayloadNativeBuffer,c.CivHomebrewSDK.transfer);
    assert.equal(typeof c.PayloadNativeBuffer.create,'function');
    return {io:{},files:{read:async()=>null,list:async()=>[]},serve(port,handler){
     assert.equal(port,9041);dispatch=handler;return {stop:()=>{stops++;return stopped;}};
    }};
   }};
  }});
  const lifetime=vm.runInContext(source,c);lifetime.then(()=>settled=true);
  await Promise.resolve();assert.equal(creates,1);assert.ok(logs.includes('CIV_BOOT_INSTALLER_READY 9041'));
  assert.equal(settled,false);assert.equal(timers.size,1);assert.equal(typeof c.__civBootInstaller.close,'function');
  if(warm)assert.equal(c.CivHomebrewSDK,previous,'a compatible resident SDK is retained');
  const inspection=await dispatch({protocol:1,op:'inspect'});
  assert.equal(inspection.response.ok,true);assert.equal(inspection.response.current,null);assert.equal(inspection.response.original,null);
  const finish=await dispatch({protocol:1,op:'finish'});assert.equal(finish.response.ok,true);finish.after();
  await Promise.resolve();assert.equal(stops,1);assert.equal(timers.size,0);assert.equal(settled,false,'cleanup remains part of the returned promise');
  releaseStop();await lifetime;assert.equal(c.__civBootInstaller,undefined);assert.ok(logs.includes('CIV_BOOT_INSTALLER_STOPPED'));
 }
});
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

test('the real native bootstrap installs, reads in bounded chunks and verifies before evaluation',async()=>{
 const image=nativeBootstrap(),bytes=Buffer.from(image.data,'base64'),f=fixture();
 assert.ok(bytes.length>512*1024,'fixture must cover the former installer limit');assert.ok(bytes.length<=image.limit);
 const installed=await f.call('bootstrap',{data:image.data,expected:image.expected});
 assert.equal(f.files.get(installed.path),bytes.toString('latin1'));
 const reader=startupReader(image,bytes);assert.equal(await reader.run,'verified');
 assert.equal(reader.evaluated,bytes.toString('utf8'));assert.equal(reader.reads,Math.ceil(bytes.length/32768));assert.equal(reader.closes,1);assert.equal(reader.allocations.size,0);
 const seeds=JSON.parse(reader.evaluated.split('\n',1)[0].replace(/^window\.__payloadMenuConfig=/,'').replace(/;$/,''));
 assert.ok(seeds.seeds.launcher.source.includes('CivNanoVGMainComponent.create'));
 new vm.Script(reader.evaluated);
});

test('bootstrap bounds and corruption reject before evaluation and release native file resources',async()=>{
 const image=nativeBootstrap(),bytes=Buffer.from(image.data,'base64');
 for(const size of [0,image.limit+1]){
  const reader=startupReader(image,bytes,{...image.expected,bytes:size},size);
  await assert.rejects(reader.run,/file size mismatch/);assert.equal(reader.reads,0);assert.equal(reader.evaluated,null);assert.equal(reader.closes,1);assert.equal(reader.allocations.size,0);
 }
 const corrupt=Buffer.from(bytes);corrupt[0]^=1;const reader=startupReader(image,corrupt);
 await assert.rejects(reader.run,/checksum mismatch/);assert.equal(reader.evaluated,null);assert.equal(reader.closes,1);assert.equal(reader.allocations.size,0);
 const f=fixture(),oversized='x'.repeat(image.limit+1);
 await assert.rejects(f.call('bootstrap',{data:Buffer.from(oversized).toString('base64'),expected:f.id(oversized)}),/Invalid bootstrap image/);
 assert.equal(f.files.get(f.target),f.original);
 await assert.rejects(f.call('bootstrap',{data:'',expected:f.id('')}),/Invalid bootstrap image/);
});
