/* Bounded HTTPS GET, shared framing and redirects; transport is replaceable. */
(function(g){
 "use strict";
 function cancelled(){var e=Error("Cancelled.");e.cancelled=true;return e;}
 function active(o){if(o.cancel.cancelled)throw cancelled();if(Date.now()>=o.deadline)throw Error("HTTPS request timed out.");}
 function url(input){
  if(typeof input!=="string"||input.length>8192||/[^\x21-\x7e]|[\\#]/.test(input))throw Error("Invalid HTTPS URL.");
  var m=/^https:\/\/([a-z0-9.-]+)(?::443)?(\/[^\s]*)?$/i.exec(input);
  if(!m||m[1].length>253||m[1].split(".").some(function(p){return !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(p);}))throw Error("Only HTTPS URLs on port 443 are supported.");
  return {host:m[1].toLowerCase(),path:m[2]||"/",href:"https://"+m[1].toLowerCase()+(m[2]||"/")};
 }
 function reader(limit,onProgress){
  var pending="",headers=null,status=0,chunks=[],length=0,expected=null,chunked=false,remaining=null,done=false,framing=0,trailers=false;
  function append(s){if(length+s.length>limit)throw Error("HTTPS response exceeds its size limit.");if(s.length){chunks.push(s);length+=s.length;if(onProgress)onProgress(length,expected);}}
  function parseHead(text){
   var lines=text.split("\r\n"),m=/^HTTP\/1\.[01] ([2-5]\d\d)(?: [\x20-\x7e]*)?$/.exec(lines.shift());if(!m)throw Error("Invalid HTTP status.");status=Number(m[1]);headers={};
   lines.forEach(function(line){var p=/^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*([^\x00-\x08\x0a-\x1f\x7f]*)$/.exec(line);if(!p)throw Error("Invalid HTTP header.");var key=p[1].toLowerCase(),value=p[2].trim();if(headers[key]!==undefined&&["content-length","transfer-encoding","location","content-encoding"].indexOf(key)>=0)throw Error("Duplicate HTTP framing header.");headers[key]=value;});
   if(headers["content-encoding"]&&headers["content-encoding"]!=="identity")throw Error("Compressed HTTP responses are unsupported.");
   if(headers["transfer-encoding"]!==undefined){if(headers["content-length"]!==undefined||headers["transfer-encoding"].toLowerCase()!=="chunked")throw Error("Conflicting HTTP framing.");chunked=true;}
   if(headers["content-length"]!==undefined){if(!/^\d+$/.test(headers["content-length"]))throw Error("Invalid HTTP content length.");expected=Number(headers["content-length"]);if(!Number.isSafeInteger(expected)||expected>limit)throw Error("HTTPS response exceeds its size limit.");}
   if(status===204||status===304){expected=0;if(chunked)throw Error("Unexpected HTTP body.");}
   if(expected===0)done=true;
  }
  function push(s){
   if(typeof s!=="string"||/[^\x00-\xff]/.test(s))throw Error("HTTP transport must supply binary bytes.");if(done){if(s.length)throw Error("Trailing HTTP data.");return;}
   pending+=s;
   if(!headers){var end=pending.indexOf("\r\n\r\n");if(end<0){if(pending.length>32768)throw Error("HTTP headers too large.");return;}if(end>32768)throw Error("HTTP headers too large.");parseHead(pending.slice(0,end));pending=pending.slice(end+4);}
   if(!chunked){if(expected!==null&&length+pending.length>expected)throw Error("Trailing HTTP data.");append(pending);pending="";if(expected!==null&&length===expected)done=true;return;}
   while(pending.length&&!done){
    if(trailers){var e=pending.indexOf("\r\n");if(e<0){if(pending.length>32768)throw Error("HTTP trailers too large.");break;}var trailer=pending.slice(0,e);pending=pending.slice(e+2);framing+=e+2;if(!trailer){done=true;break;}if(!/^[A-Za-z0-9-]+:[\x20-\x7e\t]*$/.test(trailer)||/^(content-length|transfer-encoding|location):/i.test(trailer))throw Error("Invalid HTTP trailer.");}
    else if(remaining===null){var at=pending.indexOf("\r\n");if(at<0){if(pending.length>1024)throw Error("HTTP chunk header too large.");break;}var line=pending.slice(0,at);if(!/^[0-9a-fA-F]{1,8}(?:;[\x20-\x7e]*)?$/.test(line))throw Error("Invalid HTTP chunk.");remaining=parseInt(line,16);if(length+remaining>limit)throw Error("HTTPS response exceeds its size limit.");pending=pending.slice(at+2);framing+=at+2;if(!remaining)trailers=true;}
    else if(remaining>0){var n=Math.min(pending.length,remaining);append(pending.slice(0,n));pending=pending.slice(n);remaining-=n;}
    else{if(pending.length<2)break;if(pending.slice(0,2)!=="\r\n")throw Error("Invalid HTTP chunk ending.");pending=pending.slice(2);remaining=null;framing+=2;}
    if(framing>1048576)throw Error("HTTP framing exceeds its size limit.");
   }if(done&&pending.length)throw Error("Trailing HTTP data.");
  }
  return {push:push,done:function(){return done;},end:function(){if(!headers||chunked&&!done||expected!==null&&length!==expected)throw Error("Incomplete HTTP response.");done=true;return {status:status,headers:headers,body:chunks.join("")};}};
 }
 async function browserExchange(address,o){
  var controller=new AbortController(),timer=setInterval(function(){if(o.cancel.cancelled||Date.now()>=o.deadline)controller.abort();},20);
  try{
   active(o);var response=await g.fetch(address.href,{headers:o.headers,redirect:"manual",signal:controller.signal});active(o);
   if(response.type==="opaqueredirect")throw Error("Browser preview cannot inspect this redirect.");
   var headers={};response.headers.forEach(function(v,k){headers[k.toLowerCase()]=v;});var parts=[],length=0;
   if(!response.body)throw Error("Browser response streaming is unavailable.");var stream=response.body.getReader();
   try{while(true){active(o);var chunk=await stream.read();if(chunk.done)break;length+=chunk.value.length;if(length>o.maxBytes)throw Error("HTTPS response exceeds its size limit.");var text="";for(var i=0;i<chunk.value.length;i++)text+=String.fromCharCode(chunk.value[i]);parts.push(text);if(o.progress)o.progress(length,Number(headers["content-length"])||null);}}finally{await stream.cancel().catch(function(){});}
   return {status:response.status,headers:headers,body:parts.join("")};
  }catch(e){if(o.cancel.cancelled)throw cancelled();if(Date.now()>=o.deadline)throw Error("HTTPS request timed out.");throw e;}finally{clearInterval(timer);}
 }
 function create(options){
  options=options||{};var exchange=options.exchange,requests=[],closed=false;
  function get(input,settings){
   settings=settings||{};var token=settings.cancel||{cancelled:false};
   var task=(async function(){
    if(closed)throw cancelled();var address=url(input),max=settings.maxBytes===undefined?1048576:settings.maxBytes,timeout=settings.timeoutMs===undefined?30000:settings.timeoutMs;
    if(!Number.isSafeInteger(max)||max<1||max>((g.PayloadCore&&g.PayloadCore.maxFrame)||12582912))throw Error("Invalid HTTPS size limit.");
    if(!Number.isSafeInteger(timeout)||timeout<1||timeout>120000)throw Error("Invalid HTTPS deadline.");
    var o={cancel:token,deadline:Date.now()+timeout,maxBytes:max,progress:settings.progress,headers:{"User-Agent":"CivHomebrew/0.3","Accept":settings.accept||"application/octet-stream","Accept-Encoding":"identity"}};
    if(!exchange)exchange=g.CivNativeHttps&&g.CivNativeHttps.available?g.CivNativeHttps.create():browserExchange;
    for(var redirects=0;;redirects++){
     active(o);if(settings.allowHost&&!settings.allowHost(address.host))throw Error("Unexpected HTTPS redirect host.");var r=await exchange(address,o);active(o);
     if(r.body.length>max)throw Error("HTTPS response exceeds its size limit.");
     if([301,302,303,307,308].indexOf(r.status)<0)return r;
     if(redirects>=5||!r.headers.location)throw Error("Invalid HTTPS redirect.");var location=r.headers.location;
     address=url(location[0]==="/"&&location[1]!=="/"?"https://"+address.host+location:location);
    }
   })();var record={cancel:token,task:task};requests.push(record);task.then(function(){requests.splice(requests.indexOf(record),1);},function(){requests.splice(requests.indexOf(record),1);});return task;
  }
  return {get:get,close:async function(){closed=true;var activeRequests=requests.slice();activeRequests.forEach(function(r){r.cancel.cancelled=true;});await Promise.all(activeRequests.map(function(r){return r.task.catch(function(){});}));}};
 }
 g.CivHttp={url:url,reader:reader,active:active,cancelled:cancelled,create:create};
})(typeof window!=="undefined"?window:globalThis);
