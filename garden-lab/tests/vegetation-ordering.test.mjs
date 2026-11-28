import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {createVegetationInstanceCuller} from '../src/scene-spatial-instances.js';
import {createExistingVegetationGroup} from '../src/scene-existing-vegetation.js';
import {createGardenLightBoundary,isGardenLightBoundaryOrderSafe} from '../src/scene-light-boundary.js?v=1.41.0';

function fixture(positions=[[0,0,-12],[0,0,-3],[0,0,-7]],material=new THREE.MeshStandardMaterial({alphaTest:.33,alphaToCoverage:true})){
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(.5,.5,.5),mesh=new THREE.InstancedMesh(geometry,material,positions.length),matrix=new THREE.Matrix4();
  mesh.name='existing-canopies-ordering';
  for(const [i,position] of positions.entries()){
    matrix.makeRotationY(i*.17);matrix.setPosition(...position);mesh.setMatrixAt(i,matrix);
    mesh.setColorAt(i,new THREE.Color().setRGB((i+1)/(positions.length+1),.27+i*.03,.61-i*.04));
  }
  root.add(mesh);root.updateMatrixWorld(true);
  const matrices=mesh.instanceMatrix.array.slice(),colors=mesh.instanceColor.array.slice(),culler=createVegetationInstanceCuller();
  const camera=new THREE.PerspectiveCamera(70,1,.1,100);camera.updateMatrixWorld();
  culler.setRoots([root]);
  return {root,geometry,material,mesh,camera,culler,matrices,colors,dispose(){culler.dispose();mesh.dispose();geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.dispose();}};
}
function assertPrefix(f,indices){
  assert.equal(f.mesh.count,indices.length);
  for(const [destination,source] of indices.entries()){
    assert.deepEqual(f.mesh.instanceMatrix.array.slice(destination*16,destination*16+16),f.matrices.slice(source*16,source*16+16));
    assert.deepEqual(f.mesh.instanceColor.array.slice(destination*3,destination*3+3),f.colors.slice(source*3,source*3+3));
  }
}
function assertCanonical(f){
  assert.equal(f.mesh.count,f.matrices.length/16);assert.deepEqual(f.mesh.instanceMatrix.array,f.matrices);assert.deepEqual(f.mesh.instanceColor.array,f.colors);
}

test('all-visible opaque cutout instances reorder near-to-far with paired colors and exact full restoration',()=>{
  const f=fixture(),matrixAttribute=f.mesh.instanceMatrix,colorAttribute=f.mesh.instanceColor;
  try{
    const matrixVersion=matrixAttribute.version,colorVersion=colorAttribute.version,result=f.culler.prepare(f.camera);
    assertPrefix(f,[1,2,0]);assert.equal(result.culledInstances,0);assert.equal(result.orderedBatches,1);assert.equal(result.orderedInstances,3);
    assert.ok(matrixAttribute.version>matrixVersion);assert.ok(colorAttribute.version>colorVersion);
    assert.equal(f.mesh.instanceMatrix,matrixAttribute);assert.equal(f.mesh.instanceColor,colorAttribute);
    assert.equal(f.mesh.geometry,f.geometry);assert.equal(f.mesh.material,f.material);assert.deepEqual(f.root.children,[f.mesh]);assert.equal(result.drawCallsAdded,0);
    const uploadedVersion=matrixAttribute.version;f.culler.restore();assertCanonical(f);assert.ok(matrixAttribute.version>uploadedVersion);
    f.culler.prepare(f.camera);f.culler.setRoots([f.root]);assertCanonical(f);
    f.culler.prepare(f.camera);f.culler.dispose();assertCanonical(f);
  }finally{f.dispose();}
});

test('transformed batches preserve the native visible set and reverse their depth order with the camera',()=>{
  const f=fixture([[0,0,-12],[300,0,-3],[0,0,-3],[0,0,-7]]),matrix=new THREE.Matrix4(),sphere=new THREE.Sphere();
  try{
    f.root.position.set(7,2,-9);f.root.rotation.y=.47;f.root.scale.set(1.2,.8,1.7);f.mesh.position.set(.2,.3,-1);f.root.updateMatrixWorld(true);
    for(const eye of [[0,0,4],[0,0,-20]]){
      f.camera.position.copy(new THREE.Vector3(...eye).applyMatrix4(f.mesh.matrixWorld));
      f.camera.lookAt(new THREE.Vector3(0,0,-7).applyMatrix4(f.mesh.matrixWorld));f.camera.updateMatrixWorld(true);
      const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(f.camera.projectionMatrix,f.camera.matrixWorldInverse)),expected=[];
      for(let i=0;i<4;i++){
        matrix.fromArray(f.matrices,i*16);sphere.copy(f.geometry.boundingSphere).applyMatrix4(matrix).applyMatrix4(f.mesh.matrixWorld);
        if(frustum.intersectsSphere(sphere))expected.push({index:i,depth:-sphere.center.clone().applyMatrix4(f.camera.matrixWorldInverse).z});
      }
      expected.sort((a,b)=>a.depth-b.depth||a.index-b.index);
      const result=f.culler.prepare(f.camera);assert.equal(result.visibleInstances,3);assert.equal(result.culledInstances,1);
      assertPrefix(f,expected.map(item=>item.index));assert.deepEqual(expected.map(item=>item.index).sort(),[0,2,3]);
      f.culler.restore();assertCanonical(f);
    }
  }finally{f.dispose();}
});

test('equal camera depths retain canonical ties and diagnostics count only actual permutations',()=>{
  const f=fixture([[0,0,-8],[-.5,0,-3],[.5,0,-3]]),alreadyOrdered=fixture([[-.5,0,-3],[.5,0,-3],[0,0,-8]]);
  try{
    assert.equal(f.culler.prepare(f.camera).orderedBatches,1);assertPrefix(f,[1,2,0]);f.culler.restore();assertCanonical(f);
    const version=alreadyOrdered.mesh.instanceMatrix.version,result=alreadyOrdered.culler.prepare(alreadyOrdered.camera);
    assertCanonical(alreadyOrdered);assert.equal(result.orderedBatches,0);assert.equal(result.orderedInstances,0);
    assert.equal(alreadyOrdered.mesh.instanceMatrix.version,version,'An unchanged full prefix needs no upload');
  }finally{f.dispose();alreadyOrdered.dispose();}
});

test('only ordinary opaque depth-writing materials and supported instance data can change order',()=>{
  const mutations=[
    m=>m.transparent=true,m=>m.opacity=.5,m=>m.depthWrite=false,m=>m.depthTest=false,m=>m.colorWrite=false,
    m=>m.depthFunc=THREE.AlwaysDepth,m=>m.blending=THREE.AdditiveBlending,m=>m.stencilWrite=true,
    m=>m.polygonOffset=true,m=>m.wireframe=true,m=>m.alphaHash=true,
    m=>m.onBeforeCompile=()=>{},m=>m.customProgramCacheKey=()=> 'custom',
  ];
  for(const mutate of mutations){const f=fixture();try{mutate(f.material);assert.equal(f.culler.prepare(f.camera).orderedBatches,0);assertCanonical(f);}finally{f.dispose();}}
  for(const material of [new THREE.MeshBasicMaterial(),new THREE.MeshPhysicalMaterial(),[new THREE.MeshStandardMaterial()]]){
    const f=fixture(undefined,material);try{assert.equal(f.culler.prepare(f.camera).orderedBatches,0);assertCanonical(f);}finally{f.dispose();}
  }
  for(const mutate of [f=>f.mesh.userData.requiresStableInstanceId=true,f=>f.geometry.setAttribute('phase',new THREE.InstancedBufferAttribute(new Float32Array(3),1)),
    f=>f.geometry.morphAttributes.position=[new THREE.Float32BufferAttribute(new Float32Array(f.geometry.attributes.position.array),3)]]){
    const f=fixture();try{f.culler.setRoots([]);mutate(f);f.culler.setRoots([f.root]);assert.equal(f.culler.prepare(f.camera).sourceBatches,0);assertCanonical(f);}finally{f.dispose();}
  }
  const hook=fixture();try{hook.mesh.onBeforeRender=()=>{};assert.equal(hook.culler.prepare(hook.camera).orderedBatches,0);assertCanonical(hook);}finally{hook.dispose();}
  for(const options of [{alphaToCoverage:false},{blending:THREE.NoBlending},{depthFunc:THREE.LessDepth}]){
    const f=fixture();try{Object.assign(f.material,options);assert.equal(f.culler.prepare(f.camera).orderedBatches,1);assertPrefix(f,[1,2,0]);}finally{f.dispose();}
  }
});

test('shadow and post-shadow passes retain canonical GPU data before ordering and idle restoration upload',()=>{
  const source=readFileSync(new URL('../vendor/three.module.js',import.meta.url),'utf8'),start=source.indexOf('function WebGLObjects( '),end=source.indexOf('\nclass DepthTexture ',start);
  assert.ok(start>=0&&end>start);const WebGLObjects=new Function(source.slice(start,end)+'\nreturn WebGLObjects;')();
  const f=fixture(),info={render:{frame:10}},gpu=new WeakMap();
  const attributes={update(attribute){if(gpu.get(attribute)?.version!==attribute.version)gpu.set(attribute,{version:attribute.version,array:attribute.array.slice()});},remove(attribute){gpu.delete(attribute);}};
  const objects=WebGLObjects({ARRAY_BUFFER:34962},{get(object,g){return g;},update(){}},attributes,info);
  try{
    let result=f.culler.prepare(f.camera,{enabled:true,shadowPassPending:true});assert.equal(result.orderedBatches,0);assert.equal(result.shadowUploadGuard,'shadow-pass');
    objects.update(f.mesh);info.render.frame++;objects.update(f.mesh);f.culler.restore();
    result=f.culler.prepare(f.camera);assert.equal(result.orderedBatches,0);assert.equal(result.shadowUploadGuard,'post-shadow-full-pass');objects.update(f.mesh);assertCanonical(f);
    assert.deepEqual(gpu.get(f.mesh.instanceMatrix).array,f.matrices);info.render.frame++;f.culler.restore();
    result=f.culler.prepare(f.camera);assert.equal(result.orderedBatches,1);objects.update(f.mesh);assertPrefix(f,[1,2,0]);
    assert.deepEqual(gpu.get(f.mesh.instanceMatrix).array,f.mesh.instanceMatrix.array);assert.deepEqual(gpu.get(f.mesh.instanceColor).array,f.mesh.instanceColor.array);
    info.render.frame++;f.culler.restore();f.culler.prepare(f.camera,{enabled:false});objects.update(f.mesh);assertCanonical(f);
    assert.deepEqual(gpu.get(f.mesh.instanceMatrix).array,f.matrices);assert.deepEqual(gpu.get(f.mesh.instanceColor).array,f.colors);
    assert.throws(()=>{try{f.culler.prepare(f.camera);throw new Error('render failed');}finally{f.culler.restore();}},/render failed/);assertCanonical(f);
  }finally{objects.dispose();f.dispose();}
});

test('actual canopy and branch builders remain orderable through only their verified plot-light hooks',()=>{
  const boundary=[[-100,-100],[100,-100],[100,100],[-100,100]],data={site:{id:'sternicza-11',boundary},existingVegetation:{siteId:'sternicza-11',canopies:
    Array.from({length:8},(_,i)=>({id:'ordering-tree-'+i,x:(i%4)*.4,y:i<4?-18:-5,baseZ:0,crownBaseZ:1,topZ:3,radiusX:1,radiusY:1}))}};
  const root=createExistingVegetationGroup(data,{existingVegetation:true,sunDate:'2026-06-21'},{origin:[0,0]}),lighting=createGardenLightBoundary(boundary);
  lighting.install(root);root.updateMatrixWorld(true);
  const culler=createVegetationInstanceCuller(),camera=new THREE.PerspectiveCamera(70,1,.1,100),snapshots=[],materials=new Set();
  camera.position.set(0,2,2);camera.lookAt(0,2,-10);camera.updateMatrixWorld(true);
  root.traverse(mesh=>{if(mesh.isInstancedMesh){snapshots.push({mesh,count:mesh.count,matrices:mesh.instanceMatrix.array.slice(),colors:mesh.instanceColor?.array.slice()||null});materials.add(mesh.material);}});
  const records=(matrix,color,count)=>Array.from({length:count},(_,i)=>JSON.stringify([Array.from(matrix.slice(i*16,i*16+16)),color?Array.from(color.slice(i*3,i*3+3)):null])).sort();
  try{
    assert.equal(snapshots.filter(entry=>entry.mesh.name.startsWith('existing-canopies-')).length,4);
    for(const material of materials){assert.notEqual(material.onBeforeCompile,THREE.Material.prototype.onBeforeCompile);assert.equal(isGardenLightBoundaryOrderSafe(material),true);}
    culler.setRoots([root]);const result=culler.prepare(camera);assert.ok(result.orderedBatches>=4,'The real wrapped canopy materials must not make ordering a no-op');assert.equal(result.culledInstances,0);
    for(const entry of snapshots)assert.deepEqual(records(entry.mesh.instanceMatrix.array,entry.mesh.instanceColor?.array,entry.mesh.count),records(entry.matrices,entry.colors,entry.count),'Every visible source matrix/color pair survives ordering');
    culler.restore();for(const entry of snapshots){assert.deepEqual(entry.mesh.instanceMatrix.array,entry.matrices);if(entry.colors)assert.deepEqual(entry.mesh.instanceColor.array,entry.colors);}
    const hooks=[...materials].map(material=>({material,compile:material.onBeforeCompile,key:material.customProgramCacheKey}));
    for(const {material} of hooks){material.onBeforeCompile=()=>{};assert.equal(isGardenLightBoundaryOrderSafe(material),false);}
    assert.equal(culler.prepare(camera).orderedBatches,0);culler.restore();
    for(const {material,compile} of hooks){material.onBeforeCompile=compile;material.customProgramCacheKey=()=> 'later-custom-key';assert.equal(isGardenLightBoundaryOrderSafe(material),false);}
    assert.equal(culler.prepare(camera).orderedBatches,0);culler.restore();
    const custom=new THREE.MeshStandardMaterial();custom.onBeforeCompile=()=>{};
    const customRoot=new THREE.Mesh(new THREE.BoxGeometry(),custom);lighting.install(customRoot);assert.equal(isGardenLightBoundaryOrderSafe(custom),false,'Wrapping an unknown prior hook never blesses it');customRoot.geometry.dispose();custom.dispose();
  }finally{culler.dispose();root.traverse(mesh=>{if(mesh.isInstancedMesh)mesh.dispose();mesh.geometry?.dispose();});for(const material of materials)material.dispose();}
});
