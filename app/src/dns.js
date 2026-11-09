/* Bounded RFC 1035 A queries. TLS separately authenticates the resolved host. */
(function(g){
 "use strict";
 function word(n){return String.fromCharCode((n>>>8)&255,n&255);}
 function query(host,id){var text=word(id)+word(0x100)+word(1)+word(0)+word(0)+word(0);host.split(".").forEach(function(label){if(!/^[a-z0-9-]{1,63}$/i.test(label))throw Error("Invalid DNS name.");text+=String.fromCharCode(label.length)+label;});return text+"\0"+word(1)+word(1);}
 function parse(bytes,host,id){
  function u16(at){if(at+2>bytes.length)throw Error("Truncated DNS response.");return bytes.charCodeAt(at)*256+bytes.charCodeAt(at+1);}
  function name(at){
   var labels=[],end=null,seen={},steps=0;
   for(;;){if(at>=bytes.length||seen[at]||++steps>128)throw Error("Invalid DNS name pointer.");seen[at]=true;var n=bytes.charCodeAt(at++);
    if((n&0xc0)===0xc0){var p=((n&63)<<8)|(u16(at-1)&255);if(end===null)end=at+1;at=p;continue;}
    if(n&0xc0||n>63||at+n>bytes.length)throw Error("Invalid DNS name.");if(!n)break;labels.push(bytes.slice(at,at+n).toLowerCase());at+=n;if(labels.join(".").length>253)throw Error("DNS name too long.");
   }return {value:labels.join("."),end:end===null?at:end};
  }
  if(bytes.length<12||bytes.length>4096||u16(0)!==id)throw Error("Unexpected DNS response.");var flags=u16(2);
  if(!(flags&0x8000)||(flags&0x7800)||(flags&0x200)||(flags&15)||u16(4)!==1)throw Error("DNS lookup failed.");
  var question=name(12),at=question.end;if(question.value!==host.toLowerCase()||u16(at)!==1||u16(at+2)!==1)throw Error("DNS question mismatch.");at+=4;
  var count=u16(6);if(count>128)throw Error("Too many DNS answers.");var records=[];
  for(var i=0;i<count;i++){var owner=name(at);at=owner.end;var type=u16(at),klass=u16(at+2),length=u16(at+8);at+=10;if(at+length>bytes.length)throw Error("Truncated DNS record.");
   if(klass===1&&type===1&&length===4)records.push({owner:owner.value,address:[0,1,2,3].map(function(j){return bytes.charCodeAt(at+j);}).join(".")});
   if(klass===1&&type===5){var alias=name(at);if(alias.end>at+length)throw Error("Invalid DNS alias.");records.push({owner:owner.value,alias:alias.value});}at+=length;
  }
  var reachable={};reachable[host.toLowerCase()]=true;
  for(var pass=0;pass<16;pass++)records.forEach(function(r){if(reachable[r.owner]&&r.alias)reachable[r.alias]=true;});
  var address=records.find(function(r){return reachable[r.owner]&&r.address;});if(address)return {address:address.address};
  var alias=records.find(function(r){return reachable[r.owner]&&r.alias;});if(alias)return {alias:alias.alias};throw Error("DNS returned no IPv4 address.");
 }
 g.CivDns={query:query,parse:parse};
})(typeof window!=="undefined"?window:globalThis);
