/* Small post-ROP dispatcher; the large bootstrap is read only after initialization. */
(async function(){
 var civBootPath=__BOOT_PATH__,civBootExpected=__BOOT_ID__,civBootBase=sdk_base,civBootMod=civBootBase+read32(civBootBase+4n);
 if(read32(civBootMod)!==0x30444f4dn)throw Error("Unsupported bootstrap SDK.");
 var civBootDynamic=civBootMod+BigInt.asIntN(32,read32(civBootMod+4n)),civBootTags={};
 for(var civBootI=0;civBootI<128;civBootI++){var civBootTag=Number(read64(civBootDynamic+BigInt(civBootI*16)));if(!civBootTag)break;var civBootV=read64(civBootDynamic+BigInt(civBootI*16+8));civBootTags[civBootTag]=civBootV<civBootBase?civBootBase+civBootV:civBootV;}
 var civBootTable=civBootTags[4],civBootStrings=civBootTags[5],civBootSymbols=civBootTags[6];
 if(!civBootTable||!civBootStrings||!civBootSymbols)throw Error("Bootstrap SDK exports missing.");
 var civBootBuckets=Number(read32(civBootTable)),civBootCount=Number(read32(civBootTable+4n));
 if(civBootBuckets<1||civBootBuckets>1000000||civBootCount<1||civBootCount>1000000)throw Error("Invalid SDK export bounds.");
 function civBootResolve(civBootName){
  var civBootHash=0;for(var civBootJ=0;civBootJ<civBootName.length;civBootJ++){civBootHash=((civBootHash<<4)+civBootName.charCodeAt(civBootJ))>>>0;var civBootHigh=civBootHash&0xf0000000;if(civBootHigh)civBootHash^=civBootHigh>>>24;civBootHash=(civBootHash&~civBootHigh)>>>0;}
  var civBootIndex=Number(read32(civBootTable+8n+BigInt((civBootHash%civBootBuckets)*4)));
  for(var civBootK=0;civBootIndex&&civBootK<civBootCount;civBootK++){
   if(civBootIndex>=civBootCount)throw Error("Invalid SDK export chain.");
   var civBootSymbol=civBootSymbols+BigInt(civBootIndex*24),civBootP=civBootStrings+read32(civBootSymbol),civBootS="";
   for(var civBootQ=0;civBootQ<512;civBootQ++){var civBootCh=Number(read8(civBootP+BigInt(civBootQ)));if(!civBootCh)break;civBootS+=String.fromCharCode(civBootCh);}
   if(civBootS===civBootName){var civBootOffset=read64(civBootSymbol+8n);if(civBootOffset)return civBootBase+civBootOffset;break;}
   civBootIndex=Number(read32(civBootTable+8n+BigInt((civBootBuckets+civBootIndex)*4)));
  }throw Error("Missing bootstrap SDK export.");
 }
 var civBootOpen=civBootResolve('_ZN2nn2fs8OpenFileEPNS0_10FileHandleEPKci'),civBootSize=civBootResolve('_ZN2nn2fs11GetFileSizeEPlNS0_10FileHandleE'),civBootRead=civBootResolve('_ZN2nn2fs8ReadFileENS0_10FileHandleElPvm'),civBootClose=civBootResolve('_ZN2nn2fs9CloseFileENS0_10FileHandleE');
 var civBootNamePtr,civBootHandle,civBootSizePtr,civBootBuffer,civBootOpened=false,civBootRaw="";
 function civBootCheck(civBootResult){if(civBootResult&0x3fffffn)throw Error('Bootstrap file operation failed.');}
 try{
  civBootNamePtr=alloc_string(civBootPath);civBootHandle=malloc(8);civBootSizePtr=malloc(8);civBootBuffer=malloc(32768);
  if(!civBootNamePtr||!civBootHandle||!civBootSizePtr||!civBootBuffer)throw Error('Bootstrap allocation failed.');
  civBootCheck(call_rop(civBootOpen,civBootHandle,civBootNamePtr,1n));civBootOpened=true;
  civBootCheck(call_rop(civBootSize,civBootSizePtr,read64(civBootHandle)));var civBootLength=Number(read64(civBootSizePtr));
  if(civBootLength!==civBootExpected.bytes||civBootLength<1||civBootLength>512*1024)throw Error('Bootstrap file size mismatch.');
  var civBootParts=[];
  for(var civBootOff=0;civBootOff<civBootLength;civBootOff+=32768){var civBootN=Math.min(32768,civBootLength-civBootOff);civBootCheck(call_rop(civBootRead,read64(civBootHandle),BigInt(civBootOff),civBootBuffer,BigInt(civBootN)));var civBootBytes=read_buffer(civBootBuffer,civBootN);for(var civBootAt=0;civBootAt<civBootN;civBootAt+=8192)civBootParts.push(String.fromCharCode.apply(null,civBootBytes.subarray(civBootAt,Math.min(civBootAt+8192,civBootN))));await new Promise(function(r){setTimeout(r,0);});}
  civBootRaw=civBootParts.join('');
 }finally{try{if(civBootOpened)call_rop(civBootClose,read64(civBootHandle));}finally{[civBootBuffer,civBootSizePtr,civBootHandle,civBootNamePtr].forEach(function(p){if(p)free(p);});}}
 var civBootDigest=2166136261,civBootMul=Math.imul;for(var civBootC=0;civBootC<civBootRaw.length;civBootC++)civBootDigest=civBootMul(civBootDigest^civBootRaw.charCodeAt(civBootC),16777619);
 if((civBootDigest>>>0).toString(16).padStart(8,'0')!==civBootExpected.checksum)throw Error('Bootstrap checksum mismatch.');
 await log('CivHomebrew bootstrap verified.');
 return await eval(decodeURIComponent(escape(civBootRaw)));
})();
