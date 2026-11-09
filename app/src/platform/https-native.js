/* Civ VII 1.0.0 SDK HTTPS: verified socket/SSL object ABI, public host trust.
 * DNS uses nonblocking UDP and configured resolvers; no blocking getaddrinfo.
 * VerifyOption bits and InAddr outputs: see docs/app-updates.md sources.
 */
(function(g){
 "use strict";
 var available=typeof sdk_base!=="undefined"&&typeof call_rop==="function",S="_ZN2nn3ssl",N="_ZN2nn6socket";
 function create(){
  if(!available)throw Error("Native HTTPS is unavailable.");
  var cache={},addresses={},mod=sdk_base+read32(sdk_base+4n);if(read32(mod)!==0x30444f4dn)throw Error("Unsupported SDK module.");
  var dyn=mod+BigInt.asIntN(32,read32(mod+4n)),tags={};for(var i=0;i<128;i++){var tag=Number(read64(dyn+BigInt(i*16)));if(!tag)break;var value=read64(dyn+BigInt(i*16+8));tags[tag]=value<sdk_base?sdk_base+value:value;}
  if(!tags[4]||!tags[5]||!tags[6])throw Error("SDK export table missing.");var buckets=Number(read32(tags[4])),count=Number(read32(tags[4]+4n));if(buckets<1||buckets>1000000||count<1||count>1000000)throw Error("SDK export bounds.");
  function resolve(name){
   if(cache[name])return cache[name];var hash=0;for(var i=0;i<name.length;i++){hash=((hash<<4)+name.charCodeAt(i))>>>0;var hi=hash&0xf0000000;if(hi)hash^=hi>>>24;hash=(hash&~hi)>>>0;}
   var index=Number(read32(tags[4]+8n+BigInt(hash%buckets*4)));
   for(var step=0;index&&step<count;step++){if(index>=count)throw Error("SDK symbol chain mismatch.");var entry=tags[6]+BigInt(index*24),p=tags[5]+read32(entry),s="";for(var j=0;j<512;j++){var c=Number(read8(p+BigInt(j)));if(!c)break;s+=String.fromCharCode(c);}if(s===name){var off=read64(entry+8n);if(off)return cache[name]=sdk_base+off;break;}index=Number(read32(tags[4]+8n+BigInt((buckets+index)*4)));}throw Error("Missing HTTPS SDK export: "+name);
  }
  function call(name){return call_rop.apply(null,[resolve(name)].concat(Array.prototype.slice.call(arguments,1).map(BigInt)));}
  function code(r){return Number(r&0x3fffffn);}
  function checked(name){var r=code(call.apply(null,arguments));if(r)throw Error("HTTPS native operation failed: 0x"+r.toString(16));}
  function sock(name){return Number(BigInt.asIntN(32,call.apply(null,[N+name].concat(Array.prototype.slice.call(arguments,1)))));}
  function retry(){var n=sock("12GetLastErrnoEv");return n===11||n===35||n===4;}
  function pause(){return new Promise(function(r){setTimeout(r,10);});}
  function take(owned,n){var p=malloc(n);if(!p)throw Error("HTTPS native allocation failed.");owned.push(p);return p;}
  var transfer=null;if(g.PayloadNativeBuffer&&typeof addrof_compressed==="function"&&typeof memcpy_addr==="bigint")transfer=g.PayloadNativeBuffer.create({addrof:addrof_compressed,read64:read64_compressed,read32:read32_compressed,read8:read8,call:call_rop,memcpy:memcpy_addr});
  function put(p,s){if(transfer)return transfer.write(p,s);var bytes=new Uint8Array(s.length);for(var i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i);write_buffer(p,bytes);}
  function get(p,n){if(transfer)return transfer.read(p,n);var bytes=read_buffer(p,n),s="";for(var i=0;i<n;i++)s+=String.fromCharCode(Number(bytes[i]));return s;}
  function address(p,ip,port){var octets=ip.split(".").map(Number);if(octets.length!==4||octets.some(function(n){return !Number.isInteger(n)||n<0||n>255;}))throw Error("Invalid DNS address.");put(p,String.fromCharCode.apply(null,[16,2,port>>>8,port&255].concat(octets,[0,0,0,0,0,0,0,0])));}
  function nonblock(fd){var flags=sock("5FcntlEiiz",fd,3,0);if(flags<0||sock("5FcntlEiiz",fd,4,flags|0x800)<0)throw Error("Cannot make HTTPS socket nonblocking.");}
  // Resolve all required entry points before allocating or starting native work.
  [N+"6SocketEiii",N+"5CloseEi",N+"5FcntlEiiz",N+"7ConnectEiPK8sockaddrj",N+"4SendEiPKvmi",N+"4RecvEiPvmi",N+"12GetLastErrnoEv",
   "_ZN2nn4nifm22GetCurrentIpConfigInfoEPNS_6socket6InAddrES3_S3_S3_S3_","_ZN2nn6crypto36GenerateCryptographicallyRandomBytesEPvm",
   S+"6detail14ServiceSession13IsInitializedEv",S+"10InitializeEv",S+"7ContextC1Ev",S+"7Context6CreateENS1_10SslVersionE",S+"7Context7DestroyEv",S+"10ConnectionC1Ev",S+"10Connection6CreateEPNS0_7ContextE",S+"10Connection9SetOptionENS1_10OptionTypeEb",S+"10Connection19SetSocketDescriptorEi",S+"10Connection11SetHostNameEPKcj",S+"10Connection15SetVerifyOptionENS1_12VerifyOptionE",S+"10Connection15GetVerifyOptionEPNS1_12VerifyOptionE",S+"10Connection9SetIoModeENS1_6IoModeE",S+"10Connection11DoHandshakeEv",S+"10Connection5WriteEPKcPij",S+"10Connection4ReadEPcPij",S+"10Connection7DestroyEv"].forEach(resolve);
  async function dns(host,o,depth){
   g.CivHttp.active(o);if(addresses[host]&&addresses[host].expires>Date.now())return addresses[host].ip;if(depth>5)throw Error("DNS alias limit exceeded.");
   var owned=[],fd=-1;
   try{
    var config=take(owned,40);put(config,"\0".repeat(40));checked("_ZN2nn4nifm22GetCurrentIpConfigInfoEPNS_6socket6InAddrES3_S3_S3_S3_",config,config+8n,config+16n,config+24n,config+32n);
    var servers=[get(config+24n,4),get(config+32n,4)].map(function(s){return s.split("").map(function(c){return c.charCodeAt(0);}).join(".");}).filter(function(ip,i,a){return ip!=="0.0.0.0"&&a.indexOf(ip)===i;});if(!servers.length)throw Error("No configured DNS server.");
    var seed=take(owned,2);call("_ZN2nn6crypto36GenerateCryptographicallyRandomBytesEPvm",seed,2);var id=Number(read8(seed))*256+Number(read8(seed+1n)),packet=g.CivDns.query(host,id),wire=take(owned,packet.length),buffer=take(owned,4096),peer=take(owned,16);put(wire,packet);
    for(var server=0;server<servers.length;server++){
     fd=sock("6SocketEiii",2,2,0);if(fd<0)throw Error("Cannot create DNS socket.");nonblock(fd);address(peer,servers[server],53);if(sock("7ConnectEiPK8sockaddrj",fd,peer,16)<0)throw Error("DNS connect failed.");
     var expires=Math.min(o.deadline,Date.now()+4000),sent=false;
     while(Date.now()<expires){g.CivHttp.active(o);if(!sent){var n=sock("4SendEiPKvmi",fd,wire,packet.length,0x80);if(n===packet.length)sent=true;else if(n>=0||!retry())throw Error("DNS send failed.");}
      var n=sock("4RecvEiPvmi",fd,buffer,4096,0x80);if(n>0){var reply=g.CivDns.parse(get(buffer,n),host,id);sock("5CloseEi",fd);fd=-1;var ip=reply.address||await dns(reply.alias,o,depth+1);addresses[host]={ip:ip,expires:Date.now()+60000};return ip;}if(n<0&&!retry())throw Error("DNS read failed.");await pause();
     }sock("5CloseEi",fd);fd=-1;
    }throw Error("DNS lookup timed out.");
   }finally{try{if(fd>=0)sock("5CloseEi",fd);}finally{owned.reverse().forEach(free);}}
  }
  async function exchange(target,o){
   var ip=await dns(target.host,o,0),owned=[],fd=-1,context,connection,hasContext=false,hasConnection=false;
   try{
    g.CivHttp.active(o);var peer=take(owned,16),buffer=take(owned,8192),out=take(owned,8);address(peer,ip,443);fd=sock("6SocketEiii",2,1,0);if(fd<0)throw Error("Cannot create HTTPS socket.");nonblock(fd);
    for(;;){g.CivHttp.active(o);var result=sock("7ConnectEiPK8sockaddrj",fd,peer,16);if(result===0)break;var errno=sock("12GetLastErrnoEv");if(errno===106||errno===56)break;if([115,114,36,37,11,35,4].indexOf(errno)<0)throw Error("HTTPS connect failed (errno "+errno+").");await pause();}
    if(!call(S+"6detail14ServiceSession13IsInitializedEv"))checked(S+"10InitializeEv");
    context=take(owned,64);call(S+"7ContextC1Ev",context);checked(S+"7Context6CreateENS1_10SslVersionE",context,32);hasContext=true;
    connection=take(owned,64);call(S+"10ConnectionC1Ev",connection);checked(S+"10Connection6CreateEPNS0_7ContextE",connection,context);hasConnection=true;
    checked(S+"10Connection9SetOptionENS1_10OptionTypeEb",connection,0,1);checked(S+"10Connection19SetSocketDescriptorEi",connection,fd);
    var hostname=take(owned,target.host.length+1);put(hostname,target.host+"\0");checked(S+"10Connection11SetHostNameEPKcj",connection,hostname,target.host.length+1);
    checked(S+"10Connection15SetVerifyOptionENS1_12VerifyOptionE",connection,7);checked(S+"10Connection15GetVerifyOptionEPNS1_12VerifyOptionE",connection,out);if((Number(read32(out))&7)!==7)throw Error("TLS verification flags were not retained.");
    checked(S+"10Connection9SetIoModeENS1_6IoModeE",connection,2);
    for(;;){g.CivHttp.active(o);var r=code(call(S+"10Connection11DoHandshakeEv",connection));if(!r)break;if(r!==0x1987b)throw Error("Verified TLS handshake failed: 0x"+r.toString(16));await pause();}
    var request="GET "+target.path+" HTTP/1.1\r\nHost: "+target.host+"\r\nConnection: close\r\n";Object.keys(o.headers).forEach(function(k){if(!/^[A-Za-z-]+$/.test(k)||/[^\x20-\x7e]/.test(o.headers[k]))throw Error("Invalid HTTPS request header.");request+=k+": "+o.headers[k]+"\r\n";});request+="\r\n";
    var wire=take(owned,request.length);put(wire,request);for(var offset=0;offset<request.length;){g.CivHttp.active(o);var r=code(call(S+"10Connection5WriteEPKcPij",connection,wire+BigInt(offset),out,request.length-offset));if(r&&r!==0x1987b)throw Error("TLS write failed: 0x"+r.toString(16));var n=r?0:Number(read32(out));if(n<0||n>request.length-offset)throw Error("TLS write bounds.");offset+=n;if(!n)await pause();}
    var response=g.CivHttp.reader(o.maxBytes,o.progress),sinceYield=0;
    while(!response.done()){g.CivHttp.active(o);var r=code(call(S+"10Connection4ReadEPcPij",connection,buffer,out,8192));if(r&&r!==0x1987b)throw Error("TLS read failed: 0x"+r.toString(16));if(r){await pause();continue;}var n=Number(read32(out));if(n<0||n>8192)throw Error("TLS read bounds.");if(!n)break;response.push(get(buffer,n));sinceYield+=n;if(sinceYield>=65536){sinceYield=0;await pause();}}
    return response.end();
   }finally{try{if(hasConnection)call(S+"10Connection7DestroyEv",connection);}finally{try{if(fd>=0)sock("5CloseEi",fd);}finally{try{if(hasContext)call(S+"7Context7DestroyEv",context);}finally{owned.reverse().forEach(free);}}}}
  }
  return exchange;
 }
 g.CivNativeHttps={available:available,create:create};
})(typeof window!=="undefined"?window:globalThis);
