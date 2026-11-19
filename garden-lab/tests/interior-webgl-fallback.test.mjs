import test from 'node:test';
import assert from 'node:assert/strict';
import {createInteriorScene} from '../src/scene-interior.js';

test('a refused WebGL context returns an unavailable viewer without replacing the existing plan host',t=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),contexts=[],messages=[];
  const canvas={style:{},width:300,height:150,addEventListener(){},setAttribute(){},
    getContext(name){contexts.push(name);return null;}};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElementNS(ns,name){
    assert.equal(ns,'http://www.w3.org/1999/xhtml');assert.equal(name,'canvas');return canvas;
  }}});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});
  // Exercise Three's real context refusal branch while silencing its expected
  // diagnostic. No GPU/browser is simulated and this is not visual evidence.
  const expected=t.mock.method(console,'error',()=>{});
  const planNode={id:'existing-floor-plan'},host={children:[planNode],append(node){this.children.push(node);}};
  const viewer=createInteriorScene(host,{onError:message=>messages.push(message)});
  assert.ok(contexts.includes('webgl2')&&contexts.includes('webgl'));
  assert.ok(expected.mock.calls.some(call=>String(call.arguments[0]).includes('THREE.WebGLRenderer')));
  assert.equal(viewer.getDiagnostics().available,false);
  assert.deepEqual(messages,['WebGL is unavailable. The floor plan remains available.']);
  assert.deepEqual(host.children,[planNode],'The fallback must not erase the existing interactive plan');
  for(const method of ['update','resize','home','setVisible','dispose'])assert.doesNotThrow(()=>viewer[method]());
});
