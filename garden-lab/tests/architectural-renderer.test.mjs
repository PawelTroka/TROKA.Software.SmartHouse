import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {architecturalRenderBudget,contributesToContactShading,createArchitecturalRenderer} from '../src/architectural-renderer.js';

test('contact shading has bounded quality and switches off while navigating or on constrained devices',()=>{
  const high=architecturalRenderBudget('high',1600,1000);
  const auto=architecturalRenderBudget('auto',1600,1000);
  assert.ok(high.enabled&&auto.enabled&&high.samples>auto.samples);
  assert.ok(high.aoScale<=1&&auto.aoScale<high.aoScale);
  for(const [q,w,options] of [['eco',1600,{}],['auto',390,{}],['auto',1600,{memoryGB:4}],['auto',1600,{interacting:true}]])
    assert.equal(architecturalRenderBudget(q,w,900,options).enabled,false);
});

test('glass, cutout leaves and analytical screens never occlude as solid rectangles',()=>{
  const geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(geometry,material);
  assert.equal(contributesToContactShading(mesh),true);
  for(const [key,value] of [['transparent',true],['alphaTest',.33],['depthWrite',false],['colorWrite',false]]){
    const previous=material[key];material[key]=value;assert.equal(contributesToContactShading(mesh),false,key);material[key]=previous;
  }
  mesh.userData.contactShading=false;assert.equal(contributesToContactShading(mesh),false);
  assert.equal(contributesToContactShading(new THREE.Line(geometry)),false);
  geometry.dispose();material.dispose();
});

test('unsupported WebGL retains the direct renderer and accurate scene diagnostics',()=>{
  let calls=0;const renderer={capabilities:{isWebGL2:false},info:{render:{calls:17,triangles:642}},render(){calls++;}};
  const presentation=createArchitecturalRenderer(renderer,{},{});
  presentation.resize(1200,800,1,'high');presentation.render();
  assert.equal(calls,1);assert.equal(presentation.getDiagnostics().contactShading,false);
  assert.deepEqual(presentation.sceneInfo,renderer.info.render);
  presentation.dispose();presentation.render();assert.equal(calls,1);
});
