// Expand the existing model surfaces without moving or rebuilding their canvases.
// Fullscreen belongs to the document so the interior → walking handoff can keep it.
const FOCUSABLE='button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function createModelFullscreen({document:doc=globalThis.document,window:win=globalThis.window,onResize=()=>{}}={}) {
  const entries=new Map(),listeners=[];
  let active=null,entryTarget=null,returnFocus=null,scroll=null,mode='',generation=0,resizeFrame=0,disposed=false,requestedNative=false,escapeExitUntil=0;
  const root=doc.documentElement,body=doc.body;
  const now=()=>win.performance?.now?.()??Date.now();
  const native=()=>doc.fullscreenElement===root;
  const listen=(target,type,callback,options)=>{target.addEventListener(type,callback,options);listeners.push(()=>target.removeEventListener(type,callback,options));};
  const focus=node=>{if(node?.isConnected!==false)node?.focus?.({preventScroll:true});};
  const preferredFocus=entry=>entry?.focusTarget?.()||[...entry?.buttons||[]][0]||entry?.target;
  function resize(focusEntry=false,restore=false) {
    if(resizeFrame)win.cancelAnimationFrame(resizeFrame);
    body.dataset.fullscreenResizePending='true';
    resizeFrame=win.requestAnimationFrame(()=>{
      resizeFrame=0;if(disposed)return;
      try{onResize();}finally{delete body.dataset.fullscreenResizePending;}
      if(focusEntry&&active)focus(preferredFocus(active));
      if(restore&&!active){
        if(scroll&&entryTarget===restore.target)win.scrollTo(scroll.x,scroll.y);
        else restore.target?.scrollIntoView?.({block:'start',behavior:'instant'});
        focus(restore.focus||returnFocus);
      }
    });
  }
  function sync() {
    body.classList.toggle('model-fullscreen-open',Boolean(active));
    root.classList.toggle('model-fullscreen-open',Boolean(active));
    if(active){body.dataset.modelFullscreen=mode;body.dataset.fullscreenTarget=active.target.id;active.target.setAttribute('role','dialog');active.target.setAttribute('aria-modal','true');}
    else{delete body.dataset.modelFullscreen;delete body.dataset.fullscreenTarget;delete body.dataset.fullscreenPending;}
    for(const entry of entries.values())for(const button of entry.buttons){
      const selected=entry===active;
      button.setAttribute('aria-pressed',String(selected));
      button.setAttribute('aria-label',selected?'Exit fullscreen':'Enter fullscreen');
      button.title=selected?'Exit fullscreen (Esc)':'Make this model fullscreen';
      const label=button.querySelector('[data-fullscreen-label]');
      if(label)label.textContent=selected?'Exit fullscreen':'Fullscreen';
    }
  }
  function restoreTarget(entry) {
    if(!entry)return;
    entry.target.classList.remove('is-model-fullscreen');
    for(const [name,value] of Object.entries(entry.attributes)){
      if(value===null)entry.target.removeAttribute(name);else entry.target.setAttribute(name,value);
    }
    entry.attributes=null;
  }
  function select(entry) {
    if(entry===active)return;
    restoreTarget(active);active=entry;
    entry.attributes=Object.fromEntries(['role','aria-modal','tabindex'].map(name=>[name,entry.target.getAttribute(name)]));
    entry.target.classList.add('is-model-fullscreen');
    entry.target.setAttribute('role','dialog');entry.target.setAttribute('aria-modal','true');entry.target.setAttribute('tabindex','-1');
    // The interior workspace independently owns page inertness. Modal focus
    // containment here must not overwrite that state during a view handoff.
    sync();resize(true);
  }
  function leave() {
    if(!active)return;
    const previous=active,restore={target:previous.target,focus:preferredFocus(previous)};
    // Some browsers deliver the Escape key only after their native fullscreen
    // exit event. Consume that same key cycle before it can exit the walker too.
    if(mode==='native')escapeExitUntil=now()+250;
    generation++;restoreTarget(previous);active=null;mode='';sync();resize(false,restore);
  }
  async function exit() {
    if(!active)return;
    generation++;delete body.dataset.fullscreenPending;
    if(native()&&requestedNative&&typeof doc.exitFullscreen==='function'){
      try{await doc.exitFullscreen();}catch{if(native())return;}
    }
    leave();
  }
  async function enter(entry) {
    if(disposed)return;
    if(active){select(entry);return;}
    const token=++generation;
    entryTarget=entry.target;returnFocus=doc.activeElement;scroll={x:win.scrollX||0,y:win.scrollY||0};
    mode='expanded';select(entry);
    if(typeof root.requestFullscreen!=='function'||doc.fullscreenEnabled===false)return;
    requestedNative=true;body.dataset.fullscreenPending='true';
    try{
      // This request remains synchronous with the user's click/keyboard gesture.
      await root.requestFullscreen();
      // A newer entry may already be using the same document fullscreen session.
      // Only clean up an orphan request; an older promise must not exit that view.
      if(disposed||token!==generation||!active){if(!active&&native())await doc.exitFullscreen?.();return;}
      if(native()){mode='native';sync();resize(true);}
    }catch{
      // Restricted/unsupported browsers retain the usable full-window view.
      if(active&&token===generation){mode=native()?'native':'expanded';sync();}
    }finally{if(token===generation)delete body.dataset.fullscreenPending;}
  }
  function register(target,{button,focusTarget}={}) {
    let entry=entries.get(target);
    if(!entry){entry={target,buttons:new Set(),focusTarget:null,attributes:null};entries.set(target,entry);}
    if(focusTarget)entry.focusTarget=focusTarget;
    if(button&&!entry.buttons.has(button)){
      entry.buttons.add(button);button.setAttribute('aria-controls',target.id);
      listen(button,'click',()=>{void(entry===active?exit():enter(entry));});
    }
    sync();return entry;
  }
  function setTarget(target) {
    if(active&&active.target!==target)select(entries.get(target)||register(target));
  }
  listen(doc,'fullscreenchange',()=>{
    if(native()){
      if(active){mode='native';sync();resize(true);}
      else if(requestedNative)void doc.exitFullscreen?.().catch?.(()=>{});
    }else if(active&&mode==='native'){requestedNative=false;leave();}
  });
  listen(doc,'keydown',event=>{
    if(!active&&event.key==='Escape'&&now()<escapeExitUntil){event.preventDefault();event.stopImmediatePropagation();escapeExitUntil=0;return;}
    if(!active)return;
    if(event.key==='Escape'){
      event.preventDefault();event.stopImmediatePropagation();void exit();return;
    }
    if(event.key!=='Tab')return;
    const controls=[...active.target.querySelectorAll(FOCUSABLE)].filter(node=>node.getClientRects().length&&!node.closest('[inert]')&&!['hidden','collapse'].includes(win.getComputedStyle(node).visibility));
    const first=controls[0],last=controls.at(-1),inside=active.target.contains(doc.activeElement);
    if(!first){event.preventDefault();focus(active.target);}
    else if(event.shiftKey&&(!inside||doc.activeElement===first)){event.preventDefault();focus(last);}
    else if(!event.shiftKey&&(!inside||doc.activeElement===last)){event.preventDefault();focus(first);}
  },true);
  listen(doc,'focusin',event=>{
    if(active&&!active.target.contains(event.target))focus(preferredFocus(active));
  });
  return {
    register,setTarget,exit,
    get active(){return Boolean(active);},
    get target(){return active?.target||null;},
    dispose(){
      if(disposed)return;generation++;
      if(resizeFrame)win.cancelAnimationFrame(resizeFrame);
      for(const unlisten of listeners)unlisten();
      restoreTarget(active);active=null;mode='';sync();disposed=true;
      delete body.dataset.fullscreenResizePending;
      if(native()&&requestedNative)void doc.exitFullscreen?.().catch?.(()=>{});
    },
  };
}
