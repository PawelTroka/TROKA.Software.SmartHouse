import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {poolReflectionBudget,updatePoolReflectionCamera,installPoolReflectionMaterial,createPoolReflections} from '../src/scene-reflections.js';
import {createGardenLightBoundary} from '../src/scene-light-boundary.js';

test('pool reflection mirrors the real viewpoint and clips only geometry below the water',()=>{
  const source=new THREE.PerspectiveCamera(48,1.5,.08,600),virtual=new THREE.PerspectiveCamera(),projection=new THREE.Matrix4();
  source.position.set(3,6,12);source.lookAt(0,2,0);source.updateMatrixWorld(true);
  const originalProjection=source.projectionMatrix.clone(),originalPose=source.matrixWorld.clone();
  assert.equal(updatePoolReflectionCamera(source,2,virtual,projection),true);
  assert.deepEqual(virtual.position.toArray(),[3,-2,12]);
  assert.deepEqual(source.projectionMatrix,originalProjection);assert.deepEqual(source.matrixWorld,originalPose);
  const clip=y=>new THREE.Vector4(0,y,0,1).applyMatrix4(virtual.matrixWorldInverse).applyMatrix4(virtual.projectionMatrix);
  assert.ok(clip(3).z>=-clip(3).w,'Above-water objects must appear in the reflection');
  assert.ok(clip(1).z< -clip(1).w,'Pool walls and under-water objects must be clipped out');
  assert.ok(virtual.projectionMatrix.elements.every(Number.isFinite));
  assert.ok(projection.elements.every(Number.isFinite));
  source.position.y=1;source.updateMatrixWorld(true);
  assert.equal(updatePoolReflectionCamera(source,2,virtual,projection),false,'An underwater observer cannot acquire an above-water reflection');
});

test('reflection is reserved for stationary High-quality frames with a bounded render target',()=>{
  for(const quality of ['auto','eco'])assert.equal(poolReflectionBudget(quality,4000,3000).enabled,false);
  for(const state of [{visible:false},{interacting:true}])assert.equal(poolReflectionBudget('high',1920,1080,state).enabled,false);
  const budget=poolReflectionBudget('high',7680,4320);
  assert.equal(budget.enabled,true);assert.ok(budget.width<=1024&&budget.height<=1024);
  assert.ok(budget.width*budget.height<=650000);
});

test('physical-water and garden-light shader hooks compose in either installation order',()=>{
  for(const order of ['reflection-first','boundary-first']){
    const normal=new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1);
    const material=new THREE.MeshPhysicalMaterial({normalMap:normal,ior:1.333,opacity:.62,transparent:true});
    const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
    const boundary=createGardenLightBoundary([[0,0],[10,0],[10,8],[0,8],[0,0]]),uniform={value:1};
    if(order==='boundary-first')boundary.install(root);
    installPoolReflectionMaterial(material,{poolReflectionEnabled:uniform});
    if(order==='reflection-first')boundary.install(root);
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
    material.onBeforeCompile(shader,{});
    assert.equal(shader.uniforms.poolReflectionEnabled,uniform);
    assert.ok(shader.uniforms.gardenLightBoundary);
    assert.match(shader.fragmentShader,/gardenPlotLightMask/);
    assert.match(shader.fragmentShader,/reflectedLight\.indirectSpecular/);
    assert.match(shader.fragmentShader,/0\.02037/);
    assert.equal(material.normalMap,normal);assert.equal(material.opacity,.62);assert.equal(material.transparent,true);
    assert.match(material.customProgramCacheKey(),/garden-planar-pool-v1/);
    assert.match(material.customProgramCacheKey(),/garden-local-light-boundary-v1/);
  }
});

test('reflection pass restores renderer/scene state, caches static frames and owns its target',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(48,1.5,.08,600);
  camera.position.set(0,6,12);camera.lookAt(0,2,0);
  const water=new THREE.MeshPhysicalMaterial({transparent:true,opacity:.62});
  const pool=new THREE.Mesh(new THREE.BoxGeometry(8,.02,4),water);pool.position.y=1.99;pool.name='pool-water';scene.add(pool);
  const otherWater=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),water);scene.add(otherWater);
  const marker=new THREE.Group();scene.add(marker);
  const hiddenMarker=new THREE.Group();hiddenMarker.visible=false;scene.add(hiddenMarker);
  const sky=new THREE.Object3D();sky.position.set(0,6,12);scene.add(sky);
  let target=null,viewport=new THREE.Vector4(2,3,1200,800),scissor=viewport.clone(),scissorTest=true,draws=0,disposed=0;
  const initialViewport=viewport.clone(),initialSky=sky.position.clone();
  const renderer={
    capabilities:{isWebGL2:true,maxTextureSize:4096},extensions:{has:()=>true},
    xr:{enabled:true},shadowMap:{autoUpdate:false,needsUpdate:true},autoClear:true,info:{render:{calls:13}},
    getRenderTarget:()=>target,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,
    getViewport:v=>v.copy(viewport),getScissor:v=>v.copy(scissor),getScissorTest:()=>scissorTest,
    setRenderTarget:t=>{target=t;if(t&&!t.userData){t.userData={};t.addEventListener('dispose',()=>disposed++);}},
    setViewport:v=>viewport.copy(v),setScissor:v=>scissor.copy(v),setScissorTest:v=>scissorTest=v,
    state:{buffers:{depth:{setMask(){}}}},
    render(_scene,view){
      draws++;assert.equal(pool.visible,false);assert.equal(otherWater.visible,false);assert.equal(marker.visible,false);
      assert.equal(renderer.xr.enabled,false);assert.equal(renderer.shadowMap.autoUpdate,false);
      assert.deepEqual(sky.position,view.position);renderer.shadowMap.needsUpdate=false;
    },
  };
  const reflections=createPoolReflections(renderer,scene,camera,{sky,exclude:[marker,hiddenMarker],waterMaterials:[water]});
  reflections.setSurface(pool);
  const options={quality:'high',width:1200,height:800,revision:1};
  assert.equal(reflections.render(options),true);assert.equal(draws,1);
  assert.equal(pool.visible,true);assert.equal(otherWater.visible,true);assert.equal(marker.visible,true);assert.equal(hiddenMarker.visible,false);
  assert.equal(renderer.xr.enabled,true);assert.equal(target,null);assert.equal(scissorTest,true);
  assert.deepEqual(viewport,initialViewport);assert.deepEqual(sky.position,initialSky);
  assert.equal(renderer.shadowMap.needsUpdate,false,'A pending shadow update is consumed once, not replayed in the main frame');
  assert.equal(reflections.render(options),false);assert.equal(draws,1,'Water-wave animation alone reuses captured scene radiance');
  reflections.invalidate();assert.equal(reflections.render(options),true);assert.equal(draws,2);
  assert.equal(reflections.render({...options,quality:'eco'}),false);assert.equal(reflections.getDiagnostics().poolReflections,false);
  reflections.dispose();reflections.dispose();assert.equal(disposed,1);
});
