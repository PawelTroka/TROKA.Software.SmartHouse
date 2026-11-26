import test from 'node:test';
import assert from 'node:assert/strict';
import {createModelFullscreen} from '../src/model-fullscreen.js';

class Events{
  constructor(){this.handlers=new Map();}
  addEventListener(type,fn){if(!this.handlers.has(type))this.handlers.set(type,new Set());this.handlers.get(type).add(fn);}
  removeEventListener(type,fn){this.handlers.get(type)?.delete(fn);}
  emit(type,values={}){
    const event={target:this,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...values};
    for(const fn of [...this.handlers.get(type)||[]]){fn(event);if(event.stopped)break;}return event;
  }
}
class Element extends Events{
  constructor(doc,id){super();this.doc=doc;this.id=id;this.dataset={};this.attributes=new Map();this.children=[];this.isConnected=true;this.inert=false;this.classes=new Set();
    this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),contains:name=>this.classes.has(name),toggle:(name,enabled)=>enabled?this.classes.add(name):this.classes.delete(name)};
  }
  append(...nodes){for(const node of nodes){this.children.push(node);node.parentElement=this;}}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)??null;}
  removeAttribute(name){this.attributes.delete(name);}
  querySelector(selector){return selector==='[data-fullscreen-label]'?this.label:null;}
  querySelectorAll(){return this.children.flatMap(node=>[node,...node.querySelectorAll()]).filter(node=>node.focusable);}
  getClientRects(){return this.visible===false?[]:[{}];}
  closest(){for(let node=this;node;node=node.parentElement)if(node.inert)return node;return null;}
  contains(other){return other===this||this.children.some(node=>node.contains(other));}
  focus(){this.doc.activeElement=this;}
  scrollIntoView(){this.scrolledIntoView=true;}
}
function fixture({native=true,reject=false,defer=false}={}){
  const doc=new Events(),frames=new Map(),pending=[];let frame=0,requests=0,exits=0,resizes=0;
  doc.documentElement=new Element(doc,'html');doc.body=new Element(doc,'body');doc.documentElement.append(doc.body);doc.fullscreenEnabled=true;
  const win={scrollX:12,scrollY:640,getComputedStyle:node=>({visibility:node.visibility||'visible'}),requestAnimationFrame:fn=>{frames.set(++frame,fn);return frame;},cancelAnimationFrame:id=>frames.delete(id),scrollTo(x,y){this.scrollX=x;this.scrollY=y;},flush(){const pending=[...frames.values()];frames.clear();for(const callback of pending)callback();}};
  const viewer=new Element(doc,'viewer'),interior=new Element(doc,'interior-host'),canvas=new Element(doc,'canvas'),button=new Element(doc,'viewer-fullscreen'),interiorButton=new Element(doc,'interior-fullscreen');
  button.label={textContent:'Fullscreen'};interiorButton.label={textContent:'Fullscreen'};
  for(const node of [button,interiorButton,canvas])node.focusable=true;
  viewer.setAttribute('role','region');interior.setAttribute('role','region');viewer.append(button,canvas);interior.append(interiorButton);doc.body.append(viewer,interior);doc.activeElement=button;
  const applyFullscreen=()=>{doc.fullscreenElement=doc.documentElement;doc.emit('fullscreenchange');};
  if(native)doc.documentElement.requestFullscreen=()=>{
    requests++;if(reject)return Promise.reject(new Error('Fullscreen is restricted'));
    if(defer)return new Promise(resolve=>{pending.push(()=>{applyFullscreen();resolve();});});
    applyFullscreen();return Promise.resolve();
  };
  doc.exitFullscreen=()=>{exits++;doc.fullscreenElement=null;doc.emit('fullscreenchange');return Promise.resolve();};
  const controller=createModelFullscreen({document:doc,window:win,onResize:()=>resizes++});
  controller.register(viewer,{button,focusTarget:()=>canvas});controller.register(interior,{button:interiorButton});
  return {doc,win,viewer,interior,canvas,button,interiorButton,controller,counts:()=>({requests,exits,resizes}),resolve:(index=0)=>pending[index]?.()};
}
const settle=async f=>{await Promise.resolve();await Promise.resolve();f.win.flush();};

test('native fullscreen begins during the user gesture and preserves the same canvas through handoff',async()=>{
  const f=fixture(),canvas=f.canvas;
  f.button.emit('click');assert.equal(f.counts().requests,1,'Native permission is requested synchronously with the click');await settle(f);
  assert.equal(f.doc.body.dataset.modelFullscreen,'native');assert.equal(f.doc.body.dataset.fullscreenTarget,'viewer');assert.equal(f.button.getAttribute('aria-pressed'),'true');assert.equal(f.viewer.getAttribute('role'),'dialog');assert.equal(f.doc.activeElement,canvas);
  f.controller.setTarget(f.interior);await settle(f);
  assert.equal(f.doc.body.dataset.fullscreenTarget,'interior-host');assert.equal(f.counts().requests,1,'The existing native session survives the interior/walk handoff');assert.equal(f.viewer.getAttribute('role'),'region');assert.equal(f.interiorButton.label.textContent,'Exit fullscreen');assert.equal(f.canvas,canvas);assert.equal(canvas.parentElement,f.viewer);
  await f.controller.exit();await settle(f);
  assert.equal(f.counts().exits,1);assert.equal(f.controller.active,false);assert.equal(f.interior.getAttribute('role'),'region');assert.equal(f.interior.getAttribute('aria-modal'),null);assert.equal(f.interiorButton.label.textContent,'Fullscreen');assert.ok(f.interior.scrolledIntoView);
});
test('denied native permission retains the full-window model, and Escape restores the page without reaching walk handling',async()=>{
  const f=fixture({reject:true});let walkExits=0;
  f.doc.addEventListener('keydown',event=>{if(event.key==='Escape')walkExits++;});
  f.button.emit('click');await settle(f);
  assert.equal(f.doc.body.dataset.modelFullscreen,'expanded');assert.ok(f.viewer.classList.contains('is-model-fullscreen'));assert.equal(f.doc.body.dataset.fullscreenPending,undefined);
  f.win.scrollX=0;f.win.scrollY=0;
  const event=f.doc.emit('keydown',{key:'Escape'});await settle(f);
  assert.equal(event.prevented,true);assert.equal(event.stopped,true);assert.equal(walkExits,0);assert.equal(f.controller.active,false);assert.equal(f.counts().exits,0);assert.equal(f.win.scrollX,12);assert.equal(f.win.scrollY,640);assert.equal(f.doc.activeElement,f.canvas);assert.equal(f.doc.body.classList.contains('model-fullscreen-open'),false);
});
test('unsupported fullscreen keeps keyboard focus inside the model and leaves independent workspace inertness alone',async()=>{
  const f=fixture({native:false});f.interior.inert=true;
  f.button.emit('click');await settle(f);
  assert.equal(f.counts().requests,0);assert.equal(f.doc.body.dataset.modelFullscreen,'expanded');assert.equal(f.interior.inert,true);
  const tab=f.doc.emit('keydown',{key:'Tab'});assert.equal(tab.prevented,true);assert.equal(f.doc.activeElement,f.button);
  const shift=f.doc.emit('keydown',{key:'Tab',shiftKey:true});assert.equal(shift.prevented,true);assert.equal(f.doc.activeElement,f.canvas);
  f.doc.activeElement=f.doc.body;f.doc.emit('focusin',{target:f.doc.body});assert.equal(f.doc.activeElement,f.canvas);
  await f.controller.exit();await settle(f);assert.equal(f.interior.inert,true);
});
test('a browser-level native exit cleans up layout and preserves walking focus',async()=>{
  const f=fixture();f.button.emit('click');await settle(f);
  f.doc.fullscreenElement=null;f.doc.emit('fullscreenchange');await settle(f);
  assert.equal(f.controller.active,false);assert.equal(f.doc.body.dataset.modelFullscreen,undefined);assert.equal(f.doc.documentElement.classList.contains('model-fullscreen-open'),false);assert.equal(f.doc.activeElement,f.canvas);assert.ok(f.counts().resizes>=2);
  const lateEscape=f.doc.emit('keydown',{key:'Escape'});assert.equal(lateEscape.stopped,true,'The native exit key must not also leave walking if delivered after fullscreenchange');
});
test('fullscreen Tab containment skips controls in a visibility-hidden mobile stage',async()=>{
  const f=fixture({native:false}),hiddenStageButton=new Element(f.doc,'hidden-stage-button');
  hiddenStageButton.focusable=true;hiddenStageButton.visibility='hidden';f.interior.append(hiddenStageButton);
  f.interiorButton.emit('click');await settle(f);
  assert.equal(f.doc.activeElement,f.interiorButton);assert.equal(hiddenStageButton.getClientRects().length,1,'A hidden stage can retain layout rectangles');
  const event=f.doc.emit('keydown',{key:'Tab',shiftKey:true});assert.equal(event.prevented,true);assert.equal(f.doc.activeElement,f.interiorButton,'Focus must not jump to an invisible stage control');
  await f.controller.exit();
});
test('exiting during an outstanding native request does not leave an orphan fullscreen session',async()=>{
  const f=fixture({defer:true});f.button.emit('click');assert.equal(f.doc.body.dataset.fullscreenPending,'true');
  await f.controller.exit();f.resolve();await settle(f);
  assert.equal(f.controller.active,false);assert.equal(f.doc.fullscreenElement,null);assert.equal(f.doc.body.dataset.fullscreenPending,undefined);assert.ok(f.counts().exits>=1);
});
test('an older native request cannot exit a newer fullscreen entry',async()=>{
  const f=fixture({defer:true});f.button.emit('click');await f.controller.exit();f.button.emit('click');
  assert.equal(f.counts().requests,2);f.resolve(0);await settle(f);
  assert.equal(f.controller.active,true);assert.equal(f.doc.body.dataset.modelFullscreen,'native');assert.equal(f.counts().exits,0);
  f.resolve(1);await settle(f);
  assert.equal(f.controller.active,true);assert.equal(f.doc.body.dataset.fullscreenPending,undefined);assert.equal(f.counts().exits,0);
  await f.controller.exit();await settle(f);assert.equal(f.controller.active,false);assert.equal(f.counts().exits,1);
});
test('dispose removes modal styling and event handlers even while fullscreen is active',async()=>{
  const f=fixture();f.button.emit('click');await settle(f);f.controller.dispose();await settle(f);
  assert.equal(f.doc.body.classList.contains('model-fullscreen-open'),false);assert.equal(f.viewer.getAttribute('role'),'region');assert.equal(f.doc.handlers.get('keydown').size,0);assert.equal(f.doc.fullscreenElement,null);assert.equal(f.doc.body.dataset.fullscreenTarget,undefined);
});
