/* Chrome DOM reference vs actual NanoVG geometry + shared GPU raster shader.
 * These are browser parity checks, not screenshots of console Gameface/Vulkan. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {open,sleep}=require('./chrome.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'build/nanovg/visual');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const chrome=await open(),{call,evaluate,until}=chrome,report=[];
 try{
  await call('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:pathToFileURL(path.join(root,'app/nanovg.html')).href+'?demo=1'});
  await until('!!window.CivNanoVGPrototype?.current&&CivNanoVGPrototype.current.stats.frames>0');
  const action=async name=>{await evaluate('window.dispatchEvent(new CustomEvent("engine-input",{detail:{name:'+JSON.stringify(name)+',status:0}}))');await sleep(250);await evaluate('CivNanoVGPrototype.current.update()');};
  async function capture(name){
   await evaluate('document.getElementById("nanovg-output").style.display="none"');await sleep(50);
   const reference=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'-dom.png'),Buffer.from(reference.data,'base64'));
   const result=await evaluate(`(async()=>{
    var ui=CivNanoVGPrototype.current,c=document.getElementById('nanovg-output');
    var image=new Image();image.src='data:image/png;base64,${reference.data}';await image.decode();
    var ref=document.createElement('canvas');ref.width=1920;ref.height=1080;var ctx=ref.getContext('2d');ctx.drawImage(image,0,0,1920,1080);var a=ctx.getImageData(0,0,1920,1080).data,b=ui.renderer.read();
    var sum=0,bad=0,max=0;for(var i=0;i<a.length;i+=4){var d=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));sum+=d;if(d>32)bad++;max=Math.max(max,d);}
    // Weight expected text separately: a mostly black screen must not let
    // missing labels pass a whole-frame average. Allow a 2px font-edge radius.
    var ink=0,matchedInk=0;
    for(var command of ui.scene.commands){if(command.kind!=='text'||command.color[3]<.95)continue;
     var col=command.color.map(v=>v*255),metrics=ui.geometry.metrics(command.size,command.bold),right=command.x+ui.geometry.measure(command.text,command.size,command.bold);
     var x0=Math.max(0,Math.ceil(command.x),Math.ceil(command.clip[0])),x1=Math.min(1920,Math.ceil(right),Math.ceil(command.clip[2])),y0=Math.max(0,Math.floor(command.baseline-metrics[0]),Math.ceil(command.clip[1])),y1=Math.min(1080,Math.ceil(command.baseline-metrics[1]),Math.ceil(command.clip[3]));
     for(var y=y0;y<y1;y++)for(var x=x0;x<x1;x++){var at=(y*1920+x)*4;if(Math.max(Math.abs(a[at]-col[0]),Math.abs(a[at+1]-col[1]),Math.abs(a[at+2]-col[2]))>20)continue;ink++;var found=false;
      for(var dy=-2;dy<=2&&!found;dy++)for(var dx=-2;dx<=2;dx++){var nx=x+dx,ny=y+dy;if(nx<0||nx>=1920||ny<0||ny>=1080)continue;var k=(ny*1920+nx)*4;if(Math.max(Math.abs(b[k]-col[0]),Math.abs(b[k+1]-col[1]),Math.abs(b[k+2]-col[2]))<64){found=true;break;}}
      if(found)matchedInk++;
     }
    }
    var diff=document.createElement('canvas');diff.width=1920;diff.height=1080;var dc=diff.getContext('2d'),pixels=dc.createImageData(1920,1080);for(var i=0;i<a.length;i+=4){pixels.data[i]=Math.abs(a[i]-b[i]);pixels.data[i+1]=Math.abs(a[i+1]-b[i+1]);pixels.data[i+2]=Math.abs(a[i+2]-b[i+2]);pixels.data[i+3]=255;}dc.putImageData(pixels,0,0);
    return {meanMaxChannelError:sum/(1920*1080),badPixelFraction:bad/(1920*1080),textInkRecall:ink?matchedInk/ink:1,textInkPixels:ink,maxError:max,draws:ui.packet.draws,triangles:ui.packet.triangles,warnings:ui.stats.warnings,stats:ui.stats,geometry:ui.geometry.stats,native:c.toDataURL('image/png').split(',')[1],diff:diff.toDataURL('image/png').split(',')[1]};
   })()`);
   fs.writeFileSync(path.join(out,name+'-nanovg.png'),Buffer.from(result.native,'base64'));fs.writeFileSync(path.join(out,name+'-diff.png'),Buffer.from(result.diff,'base64'));delete result.native;delete result.diff;report.push({name,...result});
   const binary=await evaluate(`(()=>{var ui=CivNanoVGPrototype.current;function base64(bytes){var s='';for(var i=0;i<bytes.length;i+=8192)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));return btoa(s);}return {packet:base64(new Uint8Array(ui.packet.data.buffer)),pixels:base64(ui.renderer.read()),bins:base64(new Uint8Array(CivNanoVGWeb.bins(ui.packet).buffer))};})()`);
   fs.writeFileSync(path.join(out,name+'-packet.bin'),Buffer.from(binary.packet,'base64'));fs.writeFileSync(path.join(out,name+'-web.rgba'),Buffer.from(binary.pixels,'base64'));fs.writeFileSync(path.join(out,name+'-bins.bin'),Buffer.from(binary.bins,'base64'));
   await evaluate('document.getElementById("nanovg-output").style.display="block"');
   console.log(name,JSON.stringify({error:result.meanMaxChannelError,badFraction:result.badPixelFraction,textRecall:result.textInkRecall,draws:result.draws,triangles:result.triangles,warnings:result.warnings}));
   assert(result.badPixelFraction<.025,name+': DOM/NanoVG mismatch exceeds 2.5% of pixels');assert(result.meanMaxChannelError<3,name+': mean difference exceeds 3/255');assert.deepEqual(result.warnings,[]);
   assert(result.textInkPixels>1000,name+': missing DOM text reference');assert(result.textInkRecall>.95,name+': too much expected text is missing/misaligned');
  }
  await sleep(350);await capture('selector');
  await action('nav-right');await capture('selection');
  await evaluate('window.__nanoSelectionPixels=CivNanoVGPrototype.current.renderer.read()');
  await action('nav-left');await action('nav-right');
  assert.equal(await evaluate('CivNanoVGPrototype.current.stats.sceneHit'),true,'returning selection reuses its snapshot');
  assert.equal(await evaluate('CivNanoVGPrototype.current.geometry.stats.preparedHit'),true,'returning selection reuses prepared geometry');
  assert.equal(await evaluate('(()=>{var a=__nanoSelectionPixels,b=CivNanoVGPrototype.current.renderer.read();return a.every((v,i)=>v===b[i]);})()'),true,'warm navigation preserves every output channel');
  await evaluate('delete window.__nanoSelectionPixels');
  await action('nav-down');await action('nav-down');await capture('scrolled');
  await action('options');await capture('options');
  await action('accept');await capture('ftp-options');
  await action('nav-down');await capture('ftp-selection');
  await action('cancel');await action('cancel');await action('menu');await capture('app-menu');
  await action('accept');await capture('app-information');
  await action('cancel');await action('cancel');
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await sleep(250);await evaluate('CivNanoVGPrototype.current.update()');await capture('720p-layout');
  await evaluate('document.createRange=undefined;CivNanoVGPrototype.current.resetLayoutCache();CivNanoVGPrototype.current.update()');await capture('no-text-range');
  await evaluate('(async()=>{await CivNanoVGPrototype.current.close();window.MutationObserver=undefined;await CivNanoVGPrototype.attach(document.getElementById("civhomebrew"),{browser:true});})()');await action('nav-left');await capture('no-mutation-observer');
  const frames=await evaluate('CivNanoVGPrototype.current.stats.frames');await sleep(350);assert.equal(await evaluate('CivNanoVGPrototype.current.stats.frames'),frames,'idle UI submits no GPU frames');
  await evaluate('CivNanoVGPrototype.current.update()');assert.equal(await evaluate('CivNanoVGPrototype.current.stats.frames'),frames,'identical snapshot skips geometry/render');
  assert.equal(await evaluate('CivNanoVGPrototype.current.stats.error'),'');
  await evaluate('CivNanoVGPrototype.current.close()');assert.equal(await evaluate('CivNanoVGPrototype.current'),null);
  console.log('NanoVG browser parity, input, caching and cleanup passed.');
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await chrome.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
