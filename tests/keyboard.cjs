const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app/src/keyboard.js','utf8');
function harness(options={}){
 const subs=[],components=[],opened=[],errors=[],overlays=[],events=[];let focus=0;
 const engine={on(name,fn,owner){const s={name,fn,owner};subs.push(s);return {clear(){const i=subs.indexOf(s);if(i>=0)subs.splice(i,1);}};},off(name,fn,owner){for(let i=subs.length-1;i>=0;i--)if(subs[i].name===name&&subs[i].fn===fn&&subs[i].owner===owner)subs.splice(i,1);}};
 class Node{constructor(tag){this.tag=tag;this.style={};this.children=[];this.value='';this.readOnly=false;}appendChild(n){this.children.push(n);n.parentNode=this;}removeChild(n){this.children.splice(this.children.indexOf(n),1);n.parentNode=null;}setAttribute(k,v){this[k]=v;if(this.maybeComponent)this.maybeComponent.onAttributeChanged(k,null,v);}focus(){}blur(){}querySelector(){return this.children[0];}}
 const document={createElement(tag){const n=new Node(tag);if(tag==='fxs-textbox'){
  const c={Root:n,textInput:new Node('input'),onAttributeChanged(k,o,v){if(k==='value')this.textInput.value=v;},onActivate(){events.push('activate');if(options.activationError)throw options.activationError;opened.push(this.textInput.value);engine.on('IMEValidated',this.onVirtualKeyboardTextEntered,this);engine.on('IMECanceled',this.clearVirtualKeyboardCallbacks,this);},onVirtualKeyboardTextEntered(data){this.Root.setAttribute('value',this.textInput.value);this.clearVirtualKeyboardCallbacks();},clearVirtualKeyboardCallbacks(){engine.off('IMEValidated',this.onVirtualKeyboardTextEntered,this);engine.off('IMECanceled',this.clearVirtualKeyboardCallbacks,this);}};
  n.appendChild(c.textInput);n.maybeComponent=c;components.push(c);
 }return n;}};
 const globals={document,engine,setTimeout,clearTimeout,addEventListener(){},removeEventListener(){}};
 const root=new Node('options'),appRoot=new Node('launcher');appRoot.appendChild(root);
 const session={renderer:{owner:{}},active:{root:appRoot,lease:{}}};
 if(options.nativeUi){globals.CivNanoVGSession={current:session};if(!options.missingKeyboard)globals.CivSDKKeyboard={open(o){events.push('overlay');if(options.overlayError)throw options.overlayError;const overlay={options:o,closed:0,close(){this.closed++;events.push('close-overlay');}};overlays.push(overlay);return overlay;}};}
 if(options.publicKeyboard){globals.CivAppsNativeUI={keyboard:globals.CivSDKKeyboard};delete globals.CivSDKKeyboard;}
 const c=vm.createContext(globals);vm.runInContext(source,c);
 const keyboard=c.CivKeyboard.create({root,native:()=>true,loadTextbox:options.loadTextbox||(async()=>({})),focus(){focus++;},error(e){errors.push(e);}});
 return {keyboard,root,appRoot,session,components,opened,subs,errors,overlays,events,focus:()=>focus,emit(name,data){for(const s of subs.slice())if(s.name===name)s.fn.call(s.owner,data);}};
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
test('FTP editors acquire the whole Launcher native view before activation and release it on every close route',async()=>{
 for(const route of ['confirm','cancel','unload']){
  const h=harness({nativeUi:true}),p=h.keyboard.edit('5000',5,false,'Port');await tick();
  assert.deepEqual(h.events,['overlay','activate']);assert.equal(h.overlays[0].options.root,h.appRoot);assert.notEqual(h.overlays[0].options.root,h.root);assert.equal(h.overlays[0].options.view,h.session.active.lease);assert.equal(h.overlays[0].options.session,h.session);
  if(route==='confirm')h.emit('IMEValidated',{data:'5001'});else if(route==='cancel')h.emit('IMECanceled');else h.keyboard.cancel();
  assert.equal(await p,route==='confirm'?'5001':null);assert.equal(h.overlays[0].closed,1);assert.equal(h.subs.length,0);assert.equal(h.root.children.length,0);h.keyboard.cancel();assert.equal(h.overlays[0].closed,1);
 }
});
test('overlay acquisition and textbox activation errors leave FTP settings unchanged and release ownership',async()=>{
 for(const options of [{overlayError:Error('unsupported keyboard build')},{missingKeyboard:true},{activationError:Error('activation failed')}]){
  const h=harness({nativeUi:true,...options}),p=h.keyboard.edit('saved-secret',128,true,'Password');assert.equal(await p,null);assert.equal(h.opened.length,0);assert.equal(h.errors.length,1);assert.equal(h.subs.length,0);assert.equal(h.root.children.length,0);assert.equal(h.keyboard.active(),false);
  if(options.activationError)assert.equal(h.overlays[0].closed,1);else assert.equal(h.overlays.length,0);
 }
});
test('an asynchronous overlay failure preserves IME ownership until confirm/cancel and stale callbacks cannot affect a later editor',async()=>{
 for(const route of ['confirm','cancel']){
  const h=harness({nativeUi:true}),first=h.keyboard.edit('5000',5,false,'Port');await tick();const old=h.overlays[0];old.options.error(Error('image read failed'));await tick();
  assert.equal(h.keyboard.active(),true,'OS applet still owns the input context');assert.equal(old.closed,0);assert.equal(h.root.children.length,1);assert(h.subs.some(s=>s.name==='IMEValidated'));assert.deepEqual(h.errors,['image read failed']);
  if(route==='confirm')h.emit('IMEValidated',{data:'5001'});else h.emit('IMECanceled');assert.equal(await first,route==='confirm'?'5001':null);assert.equal(old.closed,1);assert.equal(h.subs.length,0);
  const second=h.keyboard.edit('username',128,false,'Username');await tick();old.options.error(Error('stale failure'));assert.equal(h.keyboard.active(),true);assert.equal(h.overlays[1].closed,0);assert.deepEqual(h.errors,['image read failed']);h.emit('IMEValidated',{data:'new-user'});assert.equal(await second,'new-user');assert.equal(h.overlays[1].closed,1);
 }
});
test('canceling during textbox import cannot open an overlay or activate a closed FTP editor',async()=>{
 let loaded;const h=harness({nativeUi:true,loadTextbox:()=>new Promise(resolve=>loaded=resolve)}),p=h.keyboard.edit('5000',5,false,'Port');h.keyboard.cancel();assert.equal(await p,null);loaded({});await tick();assert.equal(h.overlays.length,0);assert.equal(h.opened.length,0);assert.equal(h.root.children.length,0);assert.equal(h.subs.length,0);
});

test('all FTP text fields use the public shared keyboard with blank, bounded and appropriately masked entry',async()=>{
 for(const field of [{label:'Port',previous:'5000',max:5,password:false,text:'5001'},{label:'Username',previous:'old-user',max:128,password:false,text:'new-user'},{label:'Password',previous:'saved-secret',max:128,password:true,text:' secret '}]){
  const h=harness({nativeUi:true,publicKeyboard:true}),p=h.keyboard.edit(field.previous,field.max,field.password,field.label);await tick();
  const textbox=h.components[0].Root;assert.equal(textbox.enabled,'true');assert.equal(textbox['max-length'],String(field.max));assert.equal(textbox.type,field.password?'password':'text');assert.equal(h.components[0].textInput.maxLength,field.max);assert.deepEqual(h.opened,['']);assert.equal(h.overlays.length,1);assert.deepEqual(h.events,['overlay','activate']);
  h.emit('IMEValidated',{data:field.text});assert.equal(await p,field.text);assert.equal(h.overlays[0].closed,1);assert.equal(h.subs.length,0);
 }
});
