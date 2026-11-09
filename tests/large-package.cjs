// Separate constrained process: small Unicode UI + 24 MiB of ASCII game data.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({});
for(const name of ['core','app-metadata','storage'])vm.runInContext(fs.readFileSync(__dirname+'/../app/src/'+name+'.js','utf8'),context);
function wire(){
 const p={format:'civswitch-app',version:1,id:'large-game',name:'Game 雪 😀',metadata:{api:1},icon:'',scripts:[
  {name:'data.js',source:'var data="__GAME_DATA__";'},
  {name:'ui.js',source:'var message="雪 😀";'}]};
 const text=JSON.stringify({protocol:1,op:'install',package:p}).replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 const parts=text.split('__GAME_DATA__');
 return Buffer.concat([Buffer.from(parts[0],'ascii'),Buffer.alloc(24*1024*1024,'A+/'),Buffer.from(parts[1],'ascii')]);
}
let bytes=wire();global.gc();const C=context.PayloadCore,reader=C.frameReader(),header=Buffer.alloc(4);header.writeUInt32BE(bytes.length);
reader.push(header.toString('latin1'));let result;
for(let i=0;i<bytes.length;i+=16384)result=reader.push(bytes.subarray(i,i+16384).toString('latin1'));
bytes=null;const plan=C.installPlan(result.value.package);
assert.equal(plan.manifest.name,'Game 雪 😀');assert.equal(plan.files[1].data,'var message="雪 😀";');
assert.equal(plan.files[0].bytes,24*1024*1024+12);assert.equal(plan.manifest.scripts.length,2);
assert.throws(()=>reader.push('x'),/Extra frame/);console.log('LARGE_PACKAGE_OK');
