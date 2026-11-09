const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function harness(){const c=vm.createContext({setTimeout,clearTimeout,setInterval,clearInterval});for(const n of ['core','app-metadata','storage','versions','http','dns','sha256','github-releases','app-library','app-updates'])vm.runInContext(fs.readFileSync(__dirname+'/../app/src/'+n+'.js','utf8'),c);return c;}
const declaration={schema:1,releasesUrl:'https://github.com/test/project/releases/latest',asset:'app.civapp'};
const packageFor=(version='1.2.0')=>({format:'civswitch-app',version:1,id:'app',name:'App',metadata:{api:1,release:version,extensions:{updates:declaration}},icon:'',scripts:[{name:'app.js',source:'42'}]});
function fixture(){
 const c=harness(),files=new Map(),io={read:async p=>files.get(p)??null,write:async(p,b)=>files.set(p,b),ensureDirectory:async()=>{},removeDirectory:async p=>{for(const key of files.keys())if(key.startsWith(p+'/'))files.delete(key);},remove:async p=>files.delete(p),commit:async()=>{}};
 const store=c.PayloadCore.createStore(io);return {c,files,store,io};
}
test('SemVer compares numbers, prereleases and build metadata; unverifiable versions stay unknown',()=>{
 const V=harness().CivVersions;for(const [a,b,result] of [['1.10.0','1.9.0',1],['v1.2.0','1.2.0',0],['1.2.0+abc','1.2.0+xyz',0],['1.0.0-rc.1','1.0.0',-1],['1.0.0-beta.11','1.0.0-beta.2',1],['1.0.0-1','1.0.0-alpha',-1],['1.0.0-a','1.0.0-a.1',-1],['99999999999999999999.0.0','9999999999999999999.0.0',1]])assert.equal(V.compare(a,b),result);
 for(const v of ['1.2','latest','1.02.0','1.2.0-01','1.2.0.4','1.2.0-','1.2.0\nother',null])assert.equal(V.compare(v,'1.0.0'),null);
 assert.equal(V.format('1.2.3'),'v1.2.3');assert.equal(V.format('v1.2.3'),'v1.2.3');assert.equal(V.format('1.2.3-rc.1+build.2'),'v1.2.3-rc.1+build.2');assert.equal(V.format('rolling'),null);
});
test('generic extensions survive package normalization, installed manifests and restart without executing scripts',async()=>{
 const {c,store,io}=fixture();await store.load();const p=packageFor();p.metadata.extensions.other={values:[true,null,3,'雪']};const entry=await store.install(p),reload=c.PayloadCore.createStore(io);await reload.load();
 assert.equal(JSON.stringify((await reload.manifest('app')).metadata.extensions),JSON.stringify(p.metadata.extensions));assert.equal((await reload.read('app')).metadata.extensions.updates.releasesUrl,declaration.releasesUrl);assert.equal(entry.id,'app');
 const C=c.PayloadCore;for(const extensions of [[],null,{x:'x'.repeat(17000)},{x:Infinity},JSON.parse('{"__proto__":1}'),{a:{b:{c:{d:{e:{f:{g:{h:{i:1}}}}}}}}}])assert.throws(()=>C.metadata({extensions}));
 assert.equal(Object.hasOwn(C.metadata({api:1}),'extensions'),false,'old metadata retains its exact shape');
});
test('HTTP framing handles fragmented binary, chunked bodies, trailers and EOF',()=>{
 const H=harness().CivHttp;
 for(const wire of ['HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\na\0\xffb','HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2;x=y\r\na\0\r\n2\r\n\xffb\r\n0\r\nX-Test: yes\r\n\r\n','HTTP/1.0 200 OK\r\n\r\na\0\xffb']){
  for(const size of [1,3,17,1000]){const r=H.reader(4);for(let i=0;i<wire.length;i+=size)r.push(wire.slice(i,i+size));assert.equal(r.end().body,'a\0\xffb');}
 }
 const bad=['HTTP/1.1 200 OK\r\nContent-Length: 1\r\nContent-Length: 1\r\n\r\na','HTTP/1.1 200 OK\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n\r\n','HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\na','HTTP/1.1 200 OK\r\nContent-Length: 1\r\n\r\nab','HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1\r\naXX','HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\n\r\n','HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n0\r\nContent-Length: 0\r\n\r\n'];
 for(const wire of bad)assert.throws(()=>{const r=H.reader(10);r.push(wire);r.end();});assert.throws(()=>{const r=H.reader(1);r.push('HTTP/1.0 200 OK\r\n\r\nab');});
});
test('HTTPS redirects preserve limits and reject insecure or unexpected destinations',async()=>{
 const H=harness().CivHttp;let calls=0;const http=H.create({exchange:async url=>{calls++;return url.path==='/first'?{status:302,headers:{location:'/second'},body:''}:{status:200,headers:{},body:'ok'};}});
 assert.equal((await http.get('https://github.com/first')).body,'ok');assert.equal(calls,2);await http.close();await assert.rejects(http.get('https://github.com/first'),/Cancelled/);
 for(const location of ['http://github.com/a','https://evil.example/a','https://github.com:8443/a','https://user@github.com/a']){const client=H.create({exchange:async()=>({status:302,headers:{location},body:''})});await assert.rejects(client.get('https://github.com/a',{allowHost:h=>h==='github.com'}));await client.close();}
 const loop=H.create({exchange:async()=>({status:302,headers:{location:'/again'},body:''})});await assert.rejects(loop.get('https://github.com/a'),/redirect/);await loop.close();
 for(const settings of [{maxBytes:0},{maxBytes:12582913},{timeoutMs:0},{timeoutMs:NaN},{timeoutMs:120001}])await assert.rejects(H.create().get('https://github.com/a',settings));
});
test('client close cancels pending transport and waits for owned network cleanup',async()=>{
 const H=harness().CivHttp;let cleaned=false;const client=H.create({exchange:async(url,o)=>{try{while(true){H.active(o);await new Promise(r=>setTimeout(r,1));}}finally{cleaned=true;}}});
 const request=client.get('https://github.com/a');const rejected=assert.rejects(request,/Cancelled/);await client.close();await rejected;assert.equal(cleaned,true);
});
test('DNS verifies transaction, question and compressed owners before accepting an address',()=>{
 const D=harness().CivDns,q=D.query('api.github.com',1234);let reply=Buffer.from(q,'latin1');reply.writeUInt16BE(0x8180,2);reply.writeUInt16BE(1,6);reply=Buffer.concat([reply,Buffer.from([0xc0,0x0c,0,1,0,1,0,0,0,60,0,4,140,82,112,6])]);
 assert.equal(D.parse(reply.toString('latin1'),'api.github.com',1234).address,'140.82.112.6');assert.throws(()=>D.parse(reply.toString('latin1'),'evil.example',1234));assert.throws(()=>D.parse(reply.toString('latin1'),'api.github.com',3));
 reply[reply.length-16]=0xc0;reply[reply.length-15]=reply.length-16;assert.throws(()=>D.parse(reply.toString('latin1'),'api.github.com',1234),/pointer/);
});
test('SHA-256 matches independent crypto across padding, binary and yield boundaries',async()=>{
 const c=harness();for(const size of [0,1,55,56,63,64,65,65535,65536,65537,150000]){const b=Buffer.alloc(size);for(let i=0;i<size;i++)b[i]=(i*37)%256;assert.equal(await c.CivSha256.hash(b.toString('latin1')),crypto.createHash('sha256').update(b).digest('hex'));}
 await assert.rejects(c.CivSha256.hash('abc',{cancelled:true}),/Cancelled/);
});
test('GitHub config and provider select an explicit uploaded asset and bound repository/size/digest',async()=>{
 const c=harness(),P=c.CivGithubReleases;assert.ok(P.config({extensions:{updates:declaration}}));for(const change of [{schema:2},{releasesUrl:'http://github.com/test/project/releases/latest'},{releasesUrl:'https://github.com.evil/test/project/releases/latest'},{asset:'../app.civapp'}])assert.equal(P.config({extensions:{updates:{...declaration,...change}}}),null);
 let release={tag_name:'v1.3.0',draft:false,prerelease:false,assets:[{name:'app.civapp',state:'uploaded',size:123,browser_download_url:'https://github.com/test/project/releases/download/v1.3.0/app.civapp',digest:null}]};
 const provider=P.create({get:async()=>({status:200,body:c.PayloadCore.encode(JSON.stringify(release))})}),config=P.config({extensions:{updates:declaration}});assert.equal((await provider.latest(config,{})).version,'v1.3.0');
 release.assets.push({...release.assets[0]});await assert.rejects(provider.latest(config,{}),/exactly one/);release.assets.pop();release.assets[0].browser_download_url='https://github.com/other/repo/releases/download/v1.3.0/app.civapp';await assert.rejects(provider.latest(config,{}),/repository/);
});
test('checking does not reserve the store; only a verified newer package reaches the existing installer',async()=>{
 const {c,store}=fixture();await store.load();const entry=await store.install(packageFor()),candidate=packageFor('1.10.0'),bytes=c.PayloadCore.encode(JSON.stringify(candidate));let installs=0,download=0;
 const api={list:store.list,appStore:store.transaction,submit:async(name,data)=>{installs++;assert.equal(name,'app.civapp');return store.install(JSON.parse(c.PayloadCore.decode(data)));}};
 const release={version:'v1.10.0',bytes:bytes.length,digest:'sha256:'+crypto.createHash('sha256').update(Buffer.from(bytes,'latin1')).digest('hex')};
 const updates=c.CivAppUpdates.create({api,library:c.CivAppLibrary.create(api),provider:{latest:async()=>{await store.transaction(()=>{});return release;},download:async()=>{download++;return {status:200,body:bytes};}}});
 const offer=await updates.check(entry,{});assert.equal(offer.kind,'update');assert.equal(installs,0);assert.equal(download,0);await updates.install(offer,{cancel:{}});assert.equal(installs,1);assert.equal((await store.manifest('app')).metadata.release,'1.10.0');await updates.close();
});
test('equal, older, unknown and failed checks map to latest without downloads',async()=>{
 for(const version of ['1.2.0','v1.1.0','nonsense',null,'network-error']){const {c,store}=fixture();await store.load();const entry=await store.install(packageFor()),api={list:store.list,appStore:store.transaction,submit:()=>assert.fail('must not install')};
  const updates=c.CivAppUpdates.create({api,library:c.CivAppLibrary.create(api),provider:{latest:async()=>{if(version==='network-error')throw Error('offline');return version?{version}:null;},download:()=>assert.fail('must not download')}});assert.equal((await updates.check(entry,{})).kind,'latest');await updates.close();
 }
});
test('bad size, digest, identity, version, cancellation and stale selection never invoke the installer',async()=>{
 for(const scenario of ['size','digest','id','version','cancel','changed']){const {c,store}=fixture();await store.load();const entry=await store.install(packageFor()),candidate=packageFor('1.3.0');if(scenario==='id')candidate.id='other';if(scenario==='version')candidate.metadata.release='1.4.0';const bytes=c.PayloadCore.encode(JSON.stringify(candidate)),cancel={};
  const api={list:store.list,appStore:store.transaction,submit:()=>assert.fail('invalid download must not install')};const release={version:'1.3.0',bytes:bytes.length+(scenario==='size'?1:0),digest:scenario==='digest'?'sha256:'+'0'.repeat(64):null};
  const updates=c.CivAppUpdates.create({api,library:c.CivAppLibrary.create(api),provider:{latest:async()=>release,download:async()=>{if(scenario==='cancel')cancel.cancelled=true;if(scenario==='changed')await store.install(packageFor('1.2.1'));return {status:200,body:bytes};}}});
  const offer=await updates.check(entry,{});await assert.rejects(updates.install(offer,{cancel}));await updates.close();assert.equal((await store.manifest('app')).metadata.release,scenario==='changed'?'1.2.1':'1.2.0');
 }
});
