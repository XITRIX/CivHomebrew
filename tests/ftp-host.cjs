/* Real localhost FTP with the actual resident installer and system store. */
const net=require('node:net'),fs=require('node:fs'),vm=require('node:vm'),readline=require('node:readline');
const c=vm.createContext({setTimeout,clearTimeout});
for(const name of ['core','storage','system','resident','ftp'])vm.runInContext(fs.readFileSync(__dirname+'/../app/src/'+name+'.js','utf8'),c);
const FTP=c.CivFtp,files=new Map(),servers=[];let ftp;
const io={read:async p=>files.get(p)??null,write:async(p,s)=>files.set(p,s),commit:async()=>{},ensureDirectory:async()=>{},remove:async p=>files.delete(p),removeDirectory:async p=>{for(const k of files.keys())if(k.startsWith(p+'/'))files.delete(k);}};
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
  ftp=await FTP.create({listen,port:0,ip:()=> '127.0.0.1',maxBytes:4096,list:api.inboxList,read:api.inboxRead,remove:api.inboxRemove,submit:api.submit});
  return {id:'civhomebrew',close:()=>ftp.stop(),stopServices:()=>ftp.stop(),ftpState:()=>ftp.getState(),refresh:()=>{}};
 };
 const system=c.CivSystem.create(io),source='({api:1,mount:makeLauncher})';await system.stage({format:'civswitch-system',version:1,api:1,component:'launcher',release:'1',source,checksum:c.PayloadCore.hash(source)});
 const core=c.CivResident.create({io,system,evaluate:async s=>vm.runInContext(s,c),ip:()=> '127.0.0.1',listen,log:()=>{}});await core.start();output({port:ftp.port});
 const input=readline.createInterface({input:process.stdin});
 for await(const command of input){
  if(command==='status')output({state:core.getState(),entries:core.store.list(),port:ftp.port});
  if(command==='terminal'){core.showTerminal();await core.idle();output({state:core.getState()});}
  if(command==='launcher'){await core.showLauncher();output({port:ftp.port});}
  if(command==='stop'){await core.shutdown();output({stopped:true,openServers:servers.filter(s=>s.listening).length});input.close();break;}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
