const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app/src/platform/native.js','utf8');
// Exercise the shipped reader with mocked SDK calls, including its finally path.
const implementation=source.slice(source.indexOf('async function read('),source.indexOf('async function write('));
function fixture(text,options={}){
 let time=0,offset=0,next=100n,closed=0;const allocations=new Set(),freed=[],yields=[],reads=[];
 const context=vm.createContext({Number,BigInt,Math,Promise,Error,Date:{now:()=>time},
  C:{maxFrame:48*1024*1024,decode:s=>{if(options.decodeError)throw Error('decode');return Buffer.from(s,'latin1').toString('utf8');}},
  owned:path=>assert.equal(path,'save:/civhomebrew/apps/test/scripts/app.js'),savePath:()=>{},
  alloc:()=>{const p=next++;allocations.add(p);return p;},alloc_string:()=>{const p=next++;allocations.add(p);return p;},free:p=>{assert(allocations.delete(p));freed.push(p);},
  code:n=>n,call:(name)=>{if(name.includes('OpenFile'))return options.missing?0x202:0;if(name.includes('CloseFile'))closed++;return 0;},
  read64:p=>p===102n?BigInt(text.length):500n,
  checked:(name,handle,off,buffer,n)=>{if(!name.includes('ReadFile'))return;offset=off;reads.push(n);time+=options.chunkMs??1;if(options.failRead===reads.length)throw Error('read failed');},
  get:(p,n)=>text.slice(offset,offset+n),setTimeout:(fn,ms)=>{yields.push(ms);queueMicrotask(fn);}
 });
 const read=vm.runInContext('('+implementation+')',context);
 return {read:()=>read('save:/civhomebrew/apps/test/scripts/app.js',options.limit??48*1024*1024,options.binary??false,options.progress),reads,yields,allocations,freed,get closed(){return closed;}};
}
test('large native reads retain exact UTF-8/binary content and yield between bounded batches',async()=>{
 const text=Buffer.from('雪😀abc'.repeat(100000)).toString('latin1'),progress=[];
 const f=fixture(text,{progress:n=>progress.push(n)});assert.equal(await f.read(),Buffer.from(text,'latin1').toString('utf8'));
 assert(f.reads.every(n=>n<=65536));assert.equal(progress.at(-1),text.length);assert.equal(progress.length,f.reads.length);
 assert.equal(f.yields.length,Math.floor((f.reads.length-1)/4));assert(f.yields.every(ms=>ms===0));assert.equal(f.closed,1);assert.equal(f.allocations.size,0);
 const binary=fixture(text,{binary:true,chunkMs:10});assert.equal(await binary.read(),text);assert.equal(binary.yields.length,binary.reads.length-1);
});
test('empty/short reads avoid needless timers; missing and failed files release all owned memory',async()=>{
 for(const text of ['', 'hello', 'a'.repeat(65536)]){const f=fixture(text);assert.equal(await f.read(),text);assert.equal(f.yields.length,0);assert.equal(f.closed,1);assert.equal(f.allocations.size,0);}
 const missing=fixture('',{missing:true});assert.equal(await missing.read(),null);assert.equal(missing.closed,0);assert.equal(missing.allocations.size,0);
 for(const options of [{limit:1},{failRead:2},{decodeError:true},{progress:()=>{throw Error('progress');}}]){
  const f=fixture('a'.repeat(300000),options);await assert.rejects(f.read());assert.equal(f.closed,1);assert.equal(f.allocations.size,0);
 }
});
