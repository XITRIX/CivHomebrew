/* Lay out the 1280x720 design in screen pixels; never scale rendered text. */
(function(g){
 "use strict";
 function create(){
  function changed(){if(g.CivNanoVGPrototype&&g.CivNanoVGPrototype.enabled)g.CivNanoVGPrototype.invalidate();}
  var scale=Math.min((g.innerWidth||1280)/1280,(g.innerHeight||720)/720);
  function px(value){return Math.round(value*scale);}
  function value(text){return text.replace(/(-?(?:\d*\.)?\d+)px/g,function(_,n){return px(Number(n))+"px";});}
  function node(tag,parent,styles,text){
   changed();
   var n=document.createElement(tag),pixels={};
   Object.keys(styles||{}).forEach(function(key){
    var original=styles[key];n.style[key]=typeof original==="string"?value(original):original;
    if(typeof original!=="string"||original.indexOf("px")<0)return;
    // Reapplying a border shorthand would erase the current focus colour.
    var border=/^border(?:Top|Right|Bottom|Left)?$/.test(key),size=original.match(/(-?(?:\d*\.)?\d+)px/);
    pixels[border?key+"Width":key]=border?size[0]:original;
   });
   n.__civLayoutPixels=pixels;
   if(text!==undefined)n.textContent=text;if(parent)parent.appendChild(n);return n;
  }
  function apply(n){var pixels=n.__civLayoutPixels;if(pixels)Object.keys(pixels).forEach(function(key){n.style[key]=value(pixels[key]);});}
  function resize(stage){
   changed();
   scale=Math.min((g.innerWidth||1280)/1280,(g.innerHeight||720)/720);
   apply(stage);var nodes=stage.querySelectorAll("*");for(var i=0;i<nodes.length;i++)apply(nodes[i]);
   stage.style.transform="none";stage.style.left=Math.round((g.innerWidth-px(1280))/2)+"px";stage.style.top=Math.round((g.innerHeight-px(720))/2)+"px";
  }
  return {node:node,px:px,resize:resize,changed:changed};
 }
 g.CivLayout={create:create};
})(typeof window!=="undefined"?window:globalThis);
