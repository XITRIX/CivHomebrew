/* Strict SemVer precedence, with an optional release-tag v prefix. */
(function(g){
 "use strict";
 function parse(s){
  if(typeof s!=="string"||s.length>128)return null;
  var m=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(s.trim());
  if(!m)return null;var pre=m[4]?m[4].split("."):[];
  if(pre.some(function(p){return /^\d+$/.test(p)&&p.length>1&&p[0]==="0";}))return null;
  return {parts:m.slice(1,4),pre:pre};
 }
 function numeric(a,b){return a.length!==b.length?(a.length>b.length?1:-1):(a===b?0:a>b?1:-1);}
 function compare(a,b){
  a=parse(a);b=parse(b);if(!a||!b)return null;
  for(var i=0;i<3;i++){var c=numeric(a.parts[i],b.parts[i]);if(c)return c;}
  if(!a.pre.length||!b.pre.length)return a.pre.length===b.pre.length?0:a.pre.length?-1:1;
  for(var j=0;j<Math.max(a.pre.length,b.pre.length);j++){
   var x=a.pre[j],y=b.pre[j];if(x===undefined||y===undefined)return x===undefined?-1:1;if(x===y)continue;
   var xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);return xn&&yn?numeric(x,y):xn!==yn?(xn?-1:1):(x>y?1:-1);
  }return 0;
 }
 function format(value){return parse(value)?"v"+value.trim().replace(/^v/,""):null;}
 g.CivVersions={parse:parse,compare:compare,format:format};
})(typeof window!=="undefined"?window:globalThis);
