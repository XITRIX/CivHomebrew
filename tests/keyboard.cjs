const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app/src/keyboard.js','utf8');
function harness(){
 const subs=[],components=[],opened=[];let focus=0;
 const engine={on(name,fn,owner){const s={name,fn,owner};subs.push(s);return {clear(){const i=subs.indexOf(s);if(i>=0)subs.splice(i,1);}};},off(name,fn,owner){for(let i=subs.length-1;i>=0;i--)if(subs[i].name===name&&subs[i].fn===fn&&subs[i].owner===owner)subs.splice(i,1);}};
 class Node{constructor(tag){this.tag=tag;this.style={};this.children=[];this.value='';this.readOnly=false;}appendChild(n){this.children.push(n);n.parentNode=this;}removeChild(n){this.children.splice(this.children.indexOf(n),1);n.parentNode=null;}setAttribute(k,v){this[k]=v;if(this.maybeComponent)this.maybeComponent.onAttributeChanged(k,null,v);}focus(){}blur(){}querySelector(){return this.children[0];}}
 const document={createElement(tag){const n=new Node(tag);if(tag==='fxs-textbox'){
  const c={Root:n,textInput:new Node('input'),onAttributeChanged(k,o,v){if(k==='value')this.textInput.value=v;},onActivate(){opened.push(this.textInput.value);engine.on('IMEValidated',this.onVirtualKeyboardTextEntered,this);engine.on('IMECanceled',this.clearVirtualKeyboardCallbacks,this);},onVirtualKeyboardTextEntered(data){this.Root.setAttribute('value',this.textInput.value);this.clearVirtualKeyboardCallbacks();},clearVirtualKeyboardCallbacks(){engine.off('IMEValidated',this.onVirtualKeyboardTextEntered,this);engine.off('IMECanceled',this.clearVirtualKeyboardCallbacks,this);}};
  n.appendChild(c.textInput);n.maybeComponent=c;components.push(c);
 }return n;}};
 const c=vm.createContext({document,engine,setTimeout,clearTimeout,addEventListener(){},removeEventListener(){}});vm.runInContext(source,c);
 const root=new Node('root'),keyboard=c.CivKeyboard.create({root,native:()=>true,loadTextbox:async()=>({}),focus(){focus++;},error(e){throw Error(e);}});
 return {keyboard,root,components,opened,subs,focus:()=>focus,emit(name,data){for(const s of subs.slice())if(s.name===name)s.fn.call(s.owner,data);}};
}
const tick=()=>new Promise(r=>setTimeout(r,5));
test('native editor opens blank and replaces stale Element-mode text with the exact confirmation',async()=>{
 const h=harness(),p=h.keyboard.edit('5000',5,false,'Port');await tick();assert.equal(h.root.children[0].style.opacity,'0','no extra native textbox popup');assert.deepEqual(h.opened,['']);assert.equal(h.components[0].textInput.readOnly,false);
 h.components[0].textInput.value='500012';h.emit('IMEValidated',{data:'12'});assert.equal(await p,'12');assert.equal(h.subs.length,0);assert.equal(h.root.children.length,0);assert.equal(h.keyboard.active(),false);assert.equal(h.focus(),1);
 const again=h.keyboard.edit('12',128,true,'Password');await tick();assert.equal(h.opened[1],'');h.emit('IMEValidated',{data:' secret '});assert.equal(await again,' secret ');assert.equal(h.subs.length,0);
});
test('native cancellation and unload discard entry and release callbacks without changing saved text',async()=>{
 const h=harness(),p=h.keyboard.edit('5000',5,false,'Port');await tick();h.components[0].textInput.value='12';h.emit('IMECanceled');assert.equal(await p,null);assert.equal(h.subs.length,0);
 const next=h.keyboard.edit('5000',5,false,'Port');await tick();h.keyboard.cancel();assert.equal(await next,null);assert.equal(h.subs.length,0);assert.equal(h.root.children.length,0);
});
