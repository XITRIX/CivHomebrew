/* Real localhost FTP with the actual resident installer and system store. */
const net=require('node:net'),fs=require('node:fs'),vm=require('node:vm'),readline=require('node:readline');
const c=vm.createContext({setTimeout,clearTimeout});
for(const name of ['core','storage','system','ftp-settings','ftp-files','resident','ftp'])vm.runInContext(fs.readFileSync(__dirname+'/../app/src/'+name+'.js','utf8'),c);
const FTP=c.CivFtp,files=new Map(),servers=[];let ftp,apiRef;
const io={read:async p=>files.get(p)??null,write:async(p,s)=>files.set(p,s),commit:async()=>{},ensureDirectory:async()=>{},remove:async p=>files.delete(p),removeDirectory:async p=>{for(const k of files.keys())if(k.startsWith(p+'/'))files.delete(k);}};
const dirs=new Set(['save:/','save:/example']);files.set('save:/example/original.txt','original bytes');
const saveFiles={
 list:async p=>{const prefix=p.endsWith('/')?p:p+'/',out=new Map();for(const d of dirs)if(d.startsWith(prefix)&&d!==p){const rest=d.slice(prefix.length);if(rest&&!rest.includes('/'))out.set(rest,{name:rest,type:'dir',bytes:0});}for(const [k,v]of files)if(k.startsWith(prefix)){const rest=k.slice(prefix.length),name=rest.split('/')[0];if(name)out.set(name,{name,type:rest.includes('/')?'dir':'file',bytes:rest.includes('/')?0:Buffer.byteLength(v,'latin1')});}return [...out.values()];},
 stat:async p=>{if(p==='save:/'||dirs.has(p)||[...files.keys()].some(k=>k.startsWith(p+'/')))return {type:'dir',bytes:0};if(files.has(p))return {type:'file',bytes:Buffer.byteLength(files.get(p),'latin1')};throw Error('File not found.');},
 read:io.read,write:io.write,commit:io.commit,remove:async p=>{if(!files.has(p))throw Error('File not found.');files.delete(p);},mkdir:async p=>{if(dirs.has(p))throw Error('Directory exists.');dirs.add(p);},
 rmdir:async p=>{if([...files.keys(),...dirs].some(k=>k.startsWith(p+'/')))throw Error('Directory not empty.');if(!dirs.delete(p))throw Error('Not a directory.');},
 rename:async(a,b)=>{if(files.has(a)){files.set(b,files.get(a));files.delete(a);}else if(dirs.has(a)){dirs.add(b);dirs.delete(a);for(const [k,v]of [...files])if(k.startsWith(a+'/')){files.set(b+k.slice(a.length),v);files.delete(k);}}else throw Error('Missing file.');}
};
async function listen(port){
 const queue=[],clients=new Set();let closed=false;
 const server=net.createServer(socket=>{
  clients.add(socket);socket.on('close',()=>clients.delete(socket));socket.on('error',()=>{});let chunks=[],ended=false;
  socket.on('data',bytes=>{for(let i=0;i<bytes.length;i+=16384)chunks.push(bytes.subarray(i,i+16384).toString('latin1'));});socket.on('end',()=>ended=true);socket.on('close',()=>ended=true);
  const write=bytes=>new Promise((resolve,reject)=>{if(socket.destroyed){reject(Error('closed'));return;}socket.write(bytes,error=>error?reject(error):resolve());});
  queue.push({receive:()=>chunks.length?chunks.shift():ended?'':null,write:text=>write(Buffer.from(text,'utf8')),writeBinary:bytes=>write(Buffer.from(bytes,'latin1')),close:()=>socket.destroy()});
 });
 await new Promise((r,j)=>{server.once('error',j);server.listen(port,'127.0.0.1',r);});servers.push(server);
 return {port:server.address().port,accept:()=>queue.shift()||null,close:()=>{if(closed)return;closed=true;for(const socket of clients)socket.destroy();server.close();}};
}
function output(data){process.stdout.write(JSON.stringify(data)+'\n');}
(async()=>{
 c.makeLauncher=async api=>{
  apiRef=api;ftp=api.ftpSettings.enabled?await FTP.create({listen,port:0,ip:()=> '127.0.0.1',maxBytes:4096,fs:api.files,settings:api.ftpSettings}):null;
  return {id:'civhomebrew',close:()=>ftp&&ftp.stop(),stopServices:()=>ftp&&ftp.stop(),ftpState:()=>ftp?ftp.getState():{running:false},refresh:()=>{}};
 };
 const system=c.CivSystem.create(io),source='({api:1,mount:makeLauncher})';await system.stage({format:'civswitch-system',version:1,api:1,component:'launcher',release:'1',source,checksum:c.PayloadCore.hash(source)});
 const core=c.CivResident.create({io,files:saveFiles,system,evaluate:async s=>vm.runInContext(s,c),ip:()=> '127.0.0.1',listen,log:()=>{}});await core.start();output({port:ftp&&ftp.port});
 const input=readline.createInterface({input:process.stdin});
 for await(const command of input){
  if(command.startsWith('settings ')){await apiRef.saveFtpSettings(JSON.parse(command.slice(9)));await core.showLauncher();output({port:ftp&&ftp.port,state:core.getState()});}
  if(command==='status')output({state:core.getState(),entries:core.store.list(),port:ftp&&ftp.port});
  if(command==='terminal'){core.showTerminal();await core.idle();output({state:core.getState()});}
  if(command==='launcher'){await core.showLauncher();output({port:ftp&&ftp.port});}
  if(command==='stop'){await core.shutdown();output({stopped:true,openServers:servers.filter(s=>s.listening).length});input.close();break;}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
