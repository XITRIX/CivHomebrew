const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({setTimeout,clearTimeout});
for(const name of ['core','terminal','legacy-loader'])vm.runInContext(fs.readFileSync(__dirname+'/../app/src/'+name+'.js','utf8'),context);
const C=context.PayloadCore,L=context.PayloadLegacy,T=context.PayloadTerminal;
async function session(parts,execute){
 let closeResolve,closed=new Promise(r=>closeResolve=r),offered=false,wire='',executions=0,transportClosed=false;
 const records=[],channel={receive:()=>parts.length?parts.shift():null,write:async text=>{wire+=text;},close:()=>closeResolve()};
 const service=L.create({transport:{accept:()=>{if(offered)return null;offered=true;return channel;},close:()=>{transportClosed=true;}},
 busy:()=>false,execute:async(source,write)=>{executions++;await execute(source,write);},record:s=>records.push(s),ready:()=>{},error:e=>{throw e;}});
 await Promise.race([closed,new Promise((_,reject)=>setTimeout(()=>reject(Error('session timeout')),2000))]);
 await service.stop();return {wire,records,executions,transportClosed};
}
test('Gezine half-close framing streams output, awaits lifetime and closes with exact completion marker',async()=>{
 const source='(async()=>{await log("雪 😀");})();';const bytes=C.encode(source);
 const r=await session([bytes.slice(0,17),null,bytes.slice(17),''],async(s,write)=>{assert.equal(s,source);await new Promise(r=>setTimeout(r,20));await write('雪 😀\n');});
 assert.equal(r.wire,'Executing payload...\n雪 😀\nExecuted successfully\n');assert.equal(r.executions,1);assert.equal(r.transportClosed,true);
});
test('failed payloads send the original error prefix, then the listener stays usable',async()=>{
 const r=await session(['throw Error("fixture")',''],async()=>{throw Error('fixture');});
 assert.match(r.wire,/Executing payload\.\.\.\nError in payload: fixture\n/);assert.doesNotMatch(r.wire,/Executed successfully/);assert.equal(r.transportClosed,true);
});
test('strict wire bound rejects exactly 500 KiB and malformed UTF-8 before evaluation',async()=>{
 for(const parts of [['x'.repeat(L.limit),''],['\xff','']]){
  const r=await session(parts,()=>assert.fail('invalid upload executed'));assert.equal(r.executions,0);assert.match(r.wire,/Error in payload:/);
 }
 const valid=await session([' '.repeat(L.limit-2)+'1',''],async source=>assert.equal(source.length,L.limit-1));assert.equal(valid.executions,1);
});
test('stopping a partial upload closes its client and restores transport ownership',async()=>{
 let accepted=false,channelClosed=false,transportClosed=false;
 const service=L.create({transport:{accept:()=>{if(accepted)return null;accepted=true;return {receive:()=>null,close:()=>{channelClosed=true;}};},close:()=>{transportClosed=true;}},busy:()=>false,execute:()=>assert.fail('partial upload executed'),record:()=>{},ready:()=>{},error:()=>{}});
 await new Promise(r=>setTimeout(r,20));await service.stop();assert.equal(channelClosed,true);assert.equal(transportClosed,true);
});
test('terminal follows 37 rows and 146 columns and treats payload output as plain text',()=>{
 let value;const terminal=T.create(text=>value=text);terminal.append('<img src=x>');assert.equal(value,'<img src=x>');
 terminal.append('x'.repeat(147));assert.equal(value.split('\n').at(-2).length,146);assert.equal(value.split('\n').at(-1),'x');
 for(let i=0;i<100;i++)terminal.append(String(i));assert.equal(value.split('\n').length,37);assert.equal(value.split('\n')[0],'63');assert.equal(value.split('\n').at(-1),'99');
});
test('evaluator is created in loader scope without menu helper collisions',async()=>{
 const native={calls:[]},scope=vm.createContext({window:{},sock_fd:7n,PORT:9026,close:fd=>{native.calls.push(fd);return 9;}});
 vm.runInContext(fs.readFileSync(__dirname+'/../app/src/loader-scope.js','utf8'),scope);
 assert.equal(scope.window.PayloadLoaderScope.listener,7n);
 assert.equal(await scope.window.PayloadLoaderScope.evaluate('(async function(){return close(12);})();'),9);assert.deepEqual(native.calls,[12]);
});
