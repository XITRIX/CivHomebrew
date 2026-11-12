const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),build=path.join(root,'build/nanovg'),dir=process.env.NANOVG_VISUAL_DIR?path.resolve(process.env.NANOVG_VISUAL_DIR):path.join(build,'visual');
fs.mkdirSync(build,{recursive:true});
const vm=require('node:vm'),g={};g.window=g;vm.runInContext(fs.readFileSync(path.join(root,'app/vendor/native-ui-runtime.js'),'utf8'),vm.createContext(g));
for(const [name,hex] of Object.entries(g.CivNanoVGShaders.spirv))fs.writeFileSync(path.join(build,name+'.spv'),Buffer.from(hex,'hex'));
const headers=process.env.VULKAN_INCLUDE||'/opt/homebrew/opt/vulkan-headers/include';
const lib=process.env.VULKAN_LIB||'/opt/homebrew/opt/molten-vk/lib';
execFileSync(process.env.CC||'cc',['-std=c11','-O2','-Wall','-Wextra','-I'+headers,path.join(root,'tools/civapps-native-ui/vulkan-host.c'),'-L'+lib,process.platform==='darwin'?'-lMoltenVK':'-lvulkan','-o',path.join(build,'vulkan-host')],{stdio:'inherit'});
let total=0,max=0,over=0;const results=[];
for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('-packet.bin')).map(n=>n.slice(0,-11))){
 const output=path.join(dir,name+'-vulkan.rgba'),bins=path.join(dir,name+'-vulkan-bins.bin');
 execFileSync(path.join(build,'vulkan-host'),[path.join(build,'bin.comp.spv'),path.join(build,'raster.comp.spv'),path.join(dir,name+'-packet.bin'),output,bins],{stdio:'inherit',timeout:30000});
 const a=fs.readFileSync(output),b=fs.readFileSync(path.join(dir,name+'-web.rgba'));assert.equal(a.length,b.length);let local=0,localMax=0;
 for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);localMax=Math.max(localMax,d);if(d>1){over++;local++;}}
 assert(local/a.length<.0005,name+': native SPIR-V differs from browser raster by >1 on too many channels');
 const actual=new Uint32Array(Uint8Array.from(fs.readFileSync(bins)).buffer),expected=new Uint32Array(Uint8Array.from(fs.readFileSync(path.join(dir,name+'-bins.bin'))).buffer);
 assert.equal(actual.length,expected.length);assert.equal(actual.at(-1),0);
 for(let base=0;base<actual.length-1;base+=897){assert.equal(actual[base],expected[base],name+': draw count');let tris=0;for(let i=0;i<expected[base];i++){const rec=base+1+i*3;assert.deepEqual(actual.slice(rec,rec+3),expected.slice(rec,rec+3),name+': ordered draw records');tris=Math.max(tris,expected[rec+1]+expected[rec+2]);}assert.deepEqual(actual.slice(base+385,base+385+tris),expected.slice(base+385,base+385+tris),name+': live triangle list');}
 total+=a.length;results.push({name,channels:a.length,differingByMoreThanOne:local,maxError:localMax});
}
// Exercise the same compact geometry relocation and retained bin-slot addressing
// as the native LRU. Poison the old geometry so fixed-offset reads cannot pass.
{
 const relocateName=fs.existsSync(path.join(dir,'selection-packet.bin'))?'selection':'launcher-shared';
 const bytes=Buffer.from(fs.readFileSync(path.join(dir,relocateName+'-packet.bin'))),d=new Uint32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);
 const draw=d[4]*4,tri=d[5]*4,drawBytes=d[2]*128,triBytes=d[3]*64,slot=5,at=64+slot*524288,binWords=d[10]*d[11]*897;
 const draws=Buffer.from(bytes.subarray(draw,draw+drawBytes)),tris=Buffer.from(bytes.subarray(tri,tri+triBytes));
 bytes.fill(0,draw,draw+drawBytes);bytes.fill(0,tri,tri+triBytes);draws.copy(bytes,at);tris.copy(bytes,at+drawBytes);
 d[4]=at/4;d[5]=(at+drawBytes)/4;d[9]=slot*binWords;d[12]=8*binWords;
 const file=path.join(build,'relocated-packet.bin'),output=path.join(build,'relocated-vulkan.rgba'),bins=path.join(build,'relocated-bins.bin');fs.writeFileSync(file,bytes);
 execFileSync(path.join(build,'vulkan-host'),[path.join(build,'bin.comp.spv'),path.join(build,'raster.comp.spv'),file,output,bins],{stdio:'inherit',timeout:30000});
 const a=fs.readFileSync(output),b=fs.readFileSync(path.join(dir,relocateName+'-web.rgba'));let local=0,localMax=0;
 for(let i=0;i<a.length;i++){const delta=Math.abs(a[i]-b[i]);localMax=Math.max(localMax,delta);if(delta>1)local++;}
 assert.equal(local,0,'relocated geometry and retained bin slot preserve output');
 total+=a.length;max=Math.max(max,localMax);results.push({name:'gpu-scene-slot-5',channels:a.length,differingByMoreThanOne:local,maxError:localMax});
}
assert(total>0,'Run the browser visual suite first');fs.writeFileSync(path.join(dir,'vulkan-report.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({totalChannels:total,maxChannelError:max,channelsDifferingByMoreThanOne:over}));
