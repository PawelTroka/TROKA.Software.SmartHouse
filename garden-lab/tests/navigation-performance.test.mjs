import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createDimensionOcclusionIndex} from '../src/dimension-occlusion.js';
import {createAdaptiveMotionQuality,createFramePerformance,frameTimeSummary} from '../src/frame-performance.js';
import {partitionVegetationInstances} from '../src/scene-spatial-instances.js';
import {renderBudget} from '../src/render-quality.js';
import {updateMirrorCamera,installMirrorMaterial} from '../src/scene-mirrors.js';
import {batchRepeatedGardenDetails} from '../src/scene-static-details.js';

test('accelerated measurement rays match native triangle intersections through a transformed aperture',()=>{
  const root=new THREE.Group(),mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});root.position.set(2,.8,-3);root.rotation.y=.37;
  for(const [x,y,z,w,h,d] of [[-2,1.5,0,2,3,.2],[2,1.5,0,2,3,.2],[0,2.6,0,2,.8,.2],[0,.2,0,2,.4,.2]]){
    const wall=new THREE.Mesh(new THREE.BoxGeometry(w,h,d,8,8,2),mat);wall.position.set(x,y,z);root.add(wall);
  }
  root.updateMatrixWorld(true);const index=createDimensionOcclusionIndex([root]),native=new THREE.Raycaster(),a=new THREE.Vector3(),b=new THREE.Vector3(),direction=new THREE.Vector3();
  for(let i=0;i<180;i++){
    a.set(-3+6*(i%19)/18,.1+3*((i*7)%29)/28,3).applyMatrix4(root.matrixWorld);
    b.set(-3+6*((i*11)%23)/22,.1+3*((i*5)%31)/30,-3).applyMatrix4(root.matrixWorld);
    direction.copy(b).sub(a).normalize();const far=a.distanceTo(b);native.set(a,direction);native.near=.035;native.far=far;
    assert.equal(index.blocked(a,direction,far),native.intersectObjects(root.children,false).length>0,`ray ${i}`);
  }
  const d=index.getDiagnostics();assert.ok(d.triangleTests<180*root.children[0].geometry.index.count/3*.2,'BVH rejects remote triangles before intersection');
  root.visible=false;index.refresh();assert.equal(index.blocked(a,direction,10),false);root.visible=true;
  root.position.x+=12;index.refresh();assert.equal(index.blocked(a,direction,10),false,'Moving assemblies refresh their inverse matrices');
  root.traverse(o=>o.geometry?.dispose());mat.dispose();
});

test('navigation telemetry excludes resting frames and adaptive quality cannot oscillate during walking',()=>{
  const timing=createFramePerformance(12);timing.begin(10,false);timing.begin(5000,true);timing.begin(5030,true);timing.end(12,true);timing.begin(5060,true);timing.begin(20000,false);
  assert.equal(timing.getDiagnostics().frameTimeMs.mean,30);assert.equal(timing.getDiagnostics().frameTimeMs.samples,2);
  const stats=frameTimeSummary([10,20,30,60,120,300]);assert.equal(stats.stalls50ms,3);assert.equal(stats.stalls100ms,2);assert.equal(stats.stalls250ms,1);assert.equal(stats.onePercentLowFps,1000/300);
  const adaptive=createAdaptiveMotionQuality();let previous=1,changes=0;
  for(let i=1;i<220;i++){if(adaptive.sample(i*34,34,true))changes++;assert.ok(adaptive.scale<=previous);previous=adaptive.scale;}
  assert.equal(changes,3);assert.equal(adaptive.scale,.54);
  for(let i=220;i<400;i++)adaptive.sample(i*34,10,true);
  assert.equal(adaptive.scale,.54,'Fast frames do not cause resolution pumping within the gesture');
  const moving=renderBudget('auto',1600,1000,2,{interacting:true,motionScale:adaptive.scale}),idle=renderBudget('auto',1600,1000,2,{interacting:false,motionScale:adaptive.scale});
  assert.ok(moving.pixelRatio<idle.pixelRatio*.5);assert.equal(moving.shadowSize,idle.shadowSize);
  adaptive.reset();assert.equal(adaptive.scale,1);
});

test('spatial vegetation batches preserve every instance exactly and cull distant geometry',()=>{
  const root=new THREE.Group(),g=new THREE.IcosahedronGeometry(1,2),m=new THREE.MeshBasicMaterial(),source=new THREE.InstancedMesh(g,m,120),matrix=new THREE.Matrix4();source.name='existing-canopies-near-0';
  const expected=[];
  for(let i=0;i<120;i++){matrix.makeTranslation((i%12-6)*20,3,Math.floor(i/12)*20);source.setMatrixAt(i,matrix);source.setColorAt(i,new THREE.Color().setRGB(i/120,.6,.3));expected.push(Array.from(matrix.elements).join(','));}
  root.add(source);const result=partitionVegetationInstances(root);assert.equal(result.instances,120);assert.equal(result.positionsChanged,false);assert.ok(result.spatialBatches>10);
  const actual=[];for(const mesh of root.children)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);actual.push(Array.from(matrix.elements).join(','));}
  assert.deepEqual(actual.sort(),expected.sort());assert.ok(root.children.every(mesh=>mesh.geometry===g&&mesh.material===m));
  const camera=new THREE.PerspectiveCamera(70,1.4,.05,300);camera.position.set(0,2,90);camera.lookAt(0,2,140);camera.updateMatrixWorld();root.updateMatrixWorld(true);
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const visible=root.children.filter(mesh=>frustum.intersectsObject(mesh)).reduce((s,mesh)=>s+mesh.count,0);
  assert.ok(visible<120*.7,`${visible} / 120 instances survive the actual camera frustum`);
  assert.equal(partitionVegetationInstances(root).sourceBatches,0,'Repeated style refreshes do not partition already bounded batches');
  root.traverse(o=>o.isInstancedMesh&&o.dispose());g.dispose();m.dispose();
});

test('hall mirror reflects the real camera and clips geometry behind its arbitrary wall plane',()=>{
  const surface=new THREE.Mesh(new THREE.PlaneGeometry(2.55,2.34),new THREE.MeshStandardMaterial());surface.position.set(4.608,1.35,7.295);surface.rotation.y=Math.PI/2;surface.userData.mirrorLocalNormal=[0,0,1];
  const camera=new THREE.PerspectiveCamera(70,1.4,.035,200),virtual=new THREE.PerspectiveCamera(),matrix=new THREE.Matrix4();camera.position.set(7,1.57,7);camera.lookAt(4.608,1.35,7.295);
  assert.equal(updateMirrorCamera(camera,surface,virtual,matrix),true);assert.ok(Math.abs(virtual.position.x-(2*4.608-7))<1e-8);assert.ok(Math.abs(virtual.position.y-1.57)<1e-8);
  const before=new THREE.Vector3(5,1.35,7.295).project(virtual),behind=new THREE.Vector3(4,1.35,7.295).project(virtual);assert.ok(before.z>=-1&&behind.z< -1,'Near-plane clipping keeps the reflected room side');
  camera.position.x=3;assert.equal(updateMirrorCamera(camera,surface,virtual,matrix),false);
  const shader={uniforms:{},vertexShader:'#include <common>\n#include <worldpos_vertex>',fragmentShader:'#include <common>\n#include <opaque_fragment>'};
  installMirrorMaterial(surface.material,{roomMirrorEnabled:{value:1}});surface.material.onBeforeCompile(shader,{});assert.match(shader.fragmentShader,/texture2D\(roomMirrorTexture/);assert.equal(shader.uniforms.roomMirrorEnabled.value,1);
  surface.geometry.dispose();surface.material.dispose();
});

test('static sauna detail batching preserves translated geometry and shadow flags while keeping moving targets intact',()=>{
  const root=new THREE.Group(),parent=new THREE.Group(),material=new THREE.MeshStandardMaterial();root.position.set(7,2,9);parent.rotation.y=.31;root.add(parent);
  for(let i=0;i<48;i++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(.05,2,.035),material);mesh.name='sauna-timber-fin';mesh.position.set(i*.12,1,.5);mesh.castShadow=false;mesh.receiveShadow=true;parent.add(mesh);}
  const lid=new THREE.Mesh(new THREE.BoxGeometry(1,.1,1),material);lid.name='cold-plunge-cover-panel-0';parent.add(lid);
  root.updateMatrixWorld(true);const before=new THREE.Box3().setFromObject(root,true),result=batchRepeatedGardenDetails(root);root.updateMatrixWorld(true);const after=new THREE.Box3().setFromObject(root,true);
  assert.equal(result.savedDrawCalls,47);assert.equal(result.parts,48);assert.equal(parent.children.length,2);assert.ok(parent.children.includes(lid));
  const batch=parent.getObjectByName('sauna-timber-fin');assert.equal(batch.castShadow,false);assert.equal(batch.receiveShadow,true);assert.equal(batch.geometry.index.count,48*36);
  assert.ok(before.min.distanceTo(after.min)<1e-6&&before.max.distanceTo(after.max)<1e-6);assert.equal(batchRepeatedGardenDetails(root).savedDrawCalls,0);
  root.traverse(o=>o.geometry?.dispose());material.dispose();
});
