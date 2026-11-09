/* Verify the actual CI output through the app's release provider and codecs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
(async()=>{
 const root=path.resolve(__dirname,'..'),c=vm.createContext({setTimeout,clearTimeout,setInterval,clearInterval});
 for(const name of ['core','app-metadata','system','versions','http','sha256','github-releases'])vm.runInContext(fs.readFileSync(path.join(root,'app/src',name+'.js'),'utf8'),c);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/civhomebrew-release.json'),'utf8'));
 const repository=process.env.GITHUB_REPOSITORY||'XITRIX/CivHomebrew',tag='v'+manifest.release.replace(/^v/,''),blobs={};
 for(const name of ['civhomebrew-release.json','core.civupdate','launcher.civupdate','hello.civapp'])blobs[name]=fs.readFileSync(path.join(root,'dist',name));
 const response={tag_name:tag,draft:false,prerelease:false,assets:Object.entries(blobs).map(([name,blob])=>({name,state:'uploaded',size:blob.length,digest:'sha256:'+crypto.createHash('sha256').update(blob).digest('hex'),browser_download_url:'https://github.com/'+repository+'/releases/download/'+tag+'/'+name}))};
 const http={get:async(url,o)=>{if(url.includes('api.github.com'))return {status:200,body:c.PayloadCore.encode(JSON.stringify(response))};const blob=blobs[url.slice(url.lastIndexOf('/')+1)];assert.ok(blob,'unexpected asset');assert.ok(blob.length<=o.maxBytes);return {status:200,body:blob.toString('latin1')};}};
 const provider=c.CivGithubReleases.create(http),release=await provider.latestSystem({repository},{});assert.equal(c.CivVersions.compare(release.version,manifest.release),0);assert.equal(release.assets.length,2);
 for(const asset of release.assets){const downloaded=await provider.download(asset,{}),image=c.CivSystem.image(JSON.parse(c.PayloadCore.decode(downloaded.body)));assert.equal(image.component,asset.component);assert.equal(image.release,asset.release);assert.equal(image.checksum,asset.checksum);assert.equal('sha256:'+await c.CivSha256.hash(downloaded.body),asset.digest);}
 const hello=c.PayloadCore.package(JSON.parse(blobs['hello.civapp'].toString('utf8'))),declaration=c.CivGithubReleases.config(hello.metadata);assert.equal(declaration.repository,repository);assert.equal(declaration.asset,'hello.civapp');assert.equal(c.CivVersions.compare(hello.metadata.release,manifest.release),0);assert.equal((await provider.latest(declaration,{})).name,'hello.civapp');
 console.log('Release artifacts passed the actual system/app provider, package codecs and digest checks.');
})().catch(e=>{console.error(e);process.exitCode=1;});
