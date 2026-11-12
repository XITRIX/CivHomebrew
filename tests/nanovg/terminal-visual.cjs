/* Actual resident terminal/layout vs shared NanoVG owner. Host-only evidence. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');const {open,sleep}=require('./chrome.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'build/nanovg/terminal-visual');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const chrome=await open(),{call,evaluate,until}=chrome,report=[];
 try{
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1.5,mobile:false});
  await call('Page.navigate',{url:pathToFileURL(path.join(root,'app/nanovg-terminal.html')).href+'?demo=1'});
  await until('!!window.CivNanoVGSession?.current?.active?.ui.stats.frames&&window.__civhomebrewCore?.getState().mode==="launcher"');
  const action=async name=>{await evaluate('window.dispatchEvent(new CustomEvent("engine-input",{detail:{name:'+JSON.stringify(name)+',status:0}}))');await sleep(350);};
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
     var col=command.color.map(v=>v*255),metrics=ui.geometry.metrics(command.size,command.font===undefined?command.bold:command.font),right=command.x+ui.geometry.measure(command.text,command.size,command.font===undefined?command.bold:command.font);
     var x0=Math.max(0,Math.ceil(command.x),Math.ceil(command.clip[0])),x1=Math.min(1920,Math.ceil(right),Math.ceil(command.clip[2])),y0=Math.max(0,Math.floor(command.baseline-metrics[0]),Math.ceil(command.clip[1])),y1=Math.min(1080,Math.ceil(command.baseline-metrics[1]),Math.ceil(command.clip[3]));
     for(var y=y0;y<y1;y++)for(var x=x0;x<x1;x++){var at=(y*1920+x)*4;if(Math.max(Math.abs(a[at]-col[0]),Math.abs(a[at+1]-col[1]),Math.abs(a[at+2]-col[2]))>20)continue;ink++;var found=false;
      for(var dy=-2;dy<=2&&!found;dy++)for(var dx=-2;dx<=2;dx++){var nx=x+dx,ny=y+dy;if(nx<0||nx>=1920||ny<0||ny>=1080)continue;var k=(ny*1920+nx)*4;if(Math.max(Math.abs(b[k]-col[0]),Math.abs(b[k+1]-col[1]),Math.abs(b[k+2]-col[2]))<64){found=true;break;}}
      if(found)matchedInk++;
     }
    }
    // Dense terminal text exposes font-rasterizer edges across most rows. Check
    // both directions within a 2px monochrome font-edge mask (coverage values
    // differ between the STB and Chrome rasterizers);
    // retain raw error metrics rather than treating a black frame as parity.
    var nativeInk=0,matchedNativeInk=0,edgeBad=0;
    function nearby(bytes,x,y,col,tolerance){for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++){var nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=1920||ny>=1080)continue;var k=(ny*1920+nx)*4;if(Math.max(Math.abs(bytes[k]-col[0]),Math.abs(bytes[k+1]-col[1]),Math.abs(bytes[k+2]-col[2]))<=tolerance)return true;}return false;}
    if(ui.scene.commands.some(c=>c.id==='terminal-output'))for(var y=0;y<1080;y++)for(var x=0;x<1920;x++){var k=(y*1920+x)*4;
     if(b[k]>220&&b[k+1]>220&&b[k+2]>220){nativeInk++;if(nearby(a,x,y,[255,255,255],64))matchedNativeInk++;}
     if(Math.max(Math.abs(a[k]-b[k]),Math.abs(a[k+1]-b[k+1]),Math.abs(a[k+2]-b[k+2]))>32&&!(Math.max(a[k],a[k+1],a[k+2])-Math.min(a[k],a[k+1],a[k+2])<2&&Math.max(b[k],b[k+1],b[k+2])-Math.min(b[k],b[k+1],b[k+2])<2&&nearby(a,x,y,[255,255,255],64)&&nearby(b,x,y,[255,255,255],64)))edgeBad++;
    }
    var diff=document.createElement('canvas');diff.width=1920;diff.height=1080;var dc=diff.getContext('2d'),pixels=dc.createImageData(1920,1080);for(var i=0;i<a.length;i+=4){pixels.data[i]=Math.abs(a[i]-b[i]);pixels.data[i+1]=Math.abs(a[i+1]-b[i+1]);pixels.data[i+2]=Math.abs(a[i+2]-b[i+2]);pixels.data[i+3]=255;}dc.putImageData(pixels,0,0);
    return {meanMaxChannelError:sum/(1920*1080),badPixelFraction:bad/(1920*1080),textInkRecall:ink?matchedInk/ink:1,textInkPixels:ink,nativeInkPrecision:nativeInk?matchedNativeInk/nativeInk:1,edgeMismatchFraction:edgeBad/(1920*1080),maxError:max,draws:ui.packet.draws,triangles:ui.packet.triangles,warnings:ui.stats.warnings,stats:ui.stats,geometry:ui.geometry.stats,native:c.toDataURL('image/png').split(',')[1],diff:diff.toDataURL('image/png').split(',')[1]};
   })()`);
   fs.writeFileSync(path.join(out,name+'-nanovg.png'),Buffer.from(result.native,'base64'));fs.writeFileSync(path.join(out,name+'-diff.png'),Buffer.from(result.diff,'base64'));delete result.native;delete result.diff;report.push({name,...result});
   const binary=await evaluate(`(()=>{var ui=CivNanoVGPrototype.current;function base64(bytes){var s='';for(var i=0;i<bytes.length;i+=8192)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));return btoa(s);}return {packet:base64(new Uint8Array(ui.packet.data.buffer)),pixels:base64(ui.renderer.read()),bins:base64(new Uint8Array(CivNanoVGWeb.bins(ui.packet).buffer))};})()`);
   fs.writeFileSync(path.join(out,name+'-packet.bin'),Buffer.from(binary.packet,'base64'));fs.writeFileSync(path.join(out,name+'-web.rgba'),Buffer.from(binary.pixels,'base64'));fs.writeFileSync(path.join(out,name+'-bins.bin'),Buffer.from(binary.bins,'base64'));
   await evaluate('document.getElementById("nanovg-output").style.display="block"');
   console.log(name,JSON.stringify({error:result.meanMaxChannelError,badFraction:result.badPixelFraction,textRecall:result.textInkRecall,draws:result.draws,triangles:result.triangles,warnings:result.warnings}));
   if(name.startsWith('terminal-')){assert(result.edgeMismatchFraction<.0025,name+': edge-tolerant mismatch exceeds 0.25%');assert(result.nativeInkPrecision>.99,name+': unexpected native text');assert(result.textInkRecall>.99,name+': missing/misaligned terminal text');}
   else{assert(result.badPixelFraction<.025,name+': DOM/NanoVG mismatch exceeds 2.5% of pixels');assert(result.meanMaxChannelError<3,name+': mean difference exceeds 3/255');}assert.deepEqual(result.warnings,[]);
   assert(result.textInkPixels>1000,name+': missing DOM text reference');assert(result.textInkRecall>.95,name+': too much expected text is missing/misaligned');
  }

  await sleep(400);await capture('launcher-shared');
  await action('terminal');await until('__civhomebrewCore.getState().mode==="terminal"&&CivNanoVGSession.current.active?.root.id==="civhomebrew-core"&&CivNanoVGSession.current.active.ui.stats.frames>0');
  await evaluate('document.fonts.ready');await sleep(100);await capture('terminal-initial');
  await evaluate('log("NANOVG_TERMINAL_LOG ! 123 iiii WWWW — model unchanged")');await sleep(250);await capture('terminal-log');
  const cache=await evaluate('CivNanoVGSession.current.geometry.stats.geometryHits');assert(cache>0,'unchanged terminal lines reuse geometry');
  await evaluate('(async()=>{for(var i=0;i<40;i++)await log("line "+i+" "+(i===39?"X".repeat(160):"retained row"));})()');await sleep(350);await capture('terminal-rollover');
  assert.equal(await evaluate('document.getElementById("terminal-output").textContent.split(String.fromCharCode(10)).length'),37);
  for(let i=0;i<3;i++){
   await action('cancel');await until('__civhomebrewCore.getState().mode==="launcher"&&CivNanoVGSession.current.active?.root.id==="civhomebrew"&&CivNanoVGSession.current.active.ui.stats.frames>0');
   assert.equal(await evaluate('document.querySelectorAll("#nanovg-output").length'),1,'one shared output surface');
   await action('terminal');await until('__civhomebrewCore.getState().mode==="terminal"&&CivNanoVGSession.current.active?.root.id==="civhomebrew-core"&&CivNanoVGSession.current.active.ui.stats.frames>0');
  }
  await capture('terminal-returned');const frames=await evaluate('CivNanoVGPrototype.current.stats.frames');await sleep(350);assert.equal(await evaluate('CivNanoVGPrototype.current.stats.frames'),frames,'idle terminal submits no extra frames');
  assert.deepEqual(await evaluate('CivNanoVGSession.current.stats.errors'),[]);
  await evaluate('CivNanoVGSession.current.close()');assert.equal(await evaluate('CivNanoVGSession.current'),null);assert.equal(await evaluate('document.getElementById("nanovg-output")'),null);
  console.log('Shared owner, resident terminal logs/layout, rollover, repeated input switching and cleanup passed.');
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await chrome.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
