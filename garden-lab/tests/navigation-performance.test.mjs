import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createDimensionOcclusionIndex} from '../src/dimension-occlusion.js';
import {createAdaptiveMotionQuality,createFramePerformance,frameTimeSummary} from '../src/frame-performance.js';
import {createVegetationInstanceCuller} from '../src/scene-spatial-instances.js';
import {renderBudget} from '../src/render-quality.js';
import {updateMirrorCamera,installMirrorMaterial} from '../src/scene-mirrors.js';
import {batchRepeatedGardenDetails} from '../src/scene-static-details.js';
import {createFoliageMaterial} from '../src/scene-vegetation.js';

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
  timing.phase('sceneRender',12,true);timing.phase('adaptiveResize',22550,true);timing.phase('idleRender',5000,false);
  assert.equal(timing.getDiagnostics().phasesMs.sceneRender.mean,12);assert.equal(timing.getDiagnostics().phasesMs.adaptiveResize.mean,22550);
  assert.equal(timing.getDiagnostics().phasesMs.idleRender,undefined,'Resting render work cannot contaminate navigation phase timings');
  timing.reset();assert.deepEqual(timing.getDiagnostics().phasesMs,{});
  const adaptive=createAdaptiveMotionQuality();let previous=1,changes=0;
  for(let i=1;i<220;i++){if(adaptive.sample(i*34,34,true))changes++;assert.ok(adaptive.scale<=previous);previous=adaptive.scale;}
  assert.equal(changes,3);assert.equal(adaptive.scale,.54);
  for(let i=220;i<400;i++)adaptive.sample(i*34,10,true);
  assert.equal(adaptive.scale,.54,'Fast frames do not cause resolution pumping within the gesture');
  const moving=renderBudget('auto',1600,1000,2,{interacting:true,motionScale:adaptive.scale}),idle=renderBudget('auto',1600,1000,2,{interacting:false,motionScale:adaptive.scale});
  assert.ok(moving.pixelRatio<idle.pixelRatio*.5);assert.equal(moving.shadowSize,idle.shadowSize);
  adaptive.reset();assert.equal(adaptive.scale,1);
});

test('moving vegetation culls individual instances without adding draw batches and restores exact full geometry for other passes',()=>{
  const root=new THREE.Group(),g=new THREE.IcosahedronGeometry(1,2),m=new THREE.MeshBasicMaterial(),source=new THREE.InstancedMesh(g,m,120),matrix=new THREE.Matrix4();source.name='existing-canopies-near-0';
  root.position.set(7,1,-9);root.rotation.y=.31;root.scale.setScalar(1.2);source.position.x=3;
  for(let i=0;i<120;i++){matrix.makeTranslation((i%12-6)*20,3,Math.floor(i/12)*20);source.setMatrixAt(i,matrix);source.setColorAt(i,new THREE.Color().setRGB(i/120,.6,.3));}
  root.add(source);root.updateMatrixWorld(true);
  const originalMatrices=source.instanceMatrix.array.slice(),originalColors=source.instanceColor.array.slice(),originalMatrixAttribute=source.instanceMatrix;
  const culler=createVegetationInstanceCuller();culler.setRoots([root]);
  const camera=new THREE.PerspectiveCamera(70,1.4,.05,300);camera.position.set(0,2,90);
  const expectedFor=target=>{
    camera.lookAt(...target);camera.updateMatrixWorld();root.updateMatrixWorld(true);
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)),sphere=new THREE.Sphere(),expected=[];
    for(let i=0;i<120;i++){
      matrix.fromArray(originalMatrices,i*16);sphere.copy(g.boundingSphere).applyMatrix4(matrix).applyMatrix4(source.matrixWorld);
      if(frustum.intersectsSphere(sphere))expected.push(i);
    }
    return expected;
  };
  for(const target of [[0,2,140],[0,2,-80]]){
    const expected=expectedFor(target),result=culler.prepare(camera);
    assert.ok(source.count>0&&source.count<120*.7);assert.equal(source.count,expected.length);
    for(const [packed,original] of expected.entries()){
      assert.deepEqual(source.instanceMatrix.array.slice(packed*16,packed*16+16),originalMatrices.slice(original*16,original*16+16));
      assert.deepEqual(source.instanceColor.array.slice(packed*3,packed*3+3),originalColors.slice(original*3,original*3+3));
    }
    assert.equal(result.sourceBatches,1);assert.equal(result.nonemptyBatches,1);assert.equal(result.drawCallsAdded,0);
    assert.equal(root.children.length,1);assert.equal(source.geometry,g);assert.equal(source.material,m);assert.equal(source.instanceMatrix,originalMatrixAttribute);
    culler.restore();assert.equal(source.count,120);assert.deepEqual(source.instanceMatrix.array,originalMatrices);assert.deepEqual(source.instanceColor.array,originalColors);
  }
  culler.prepare(camera);culler.prepare(camera,{enabled:false});
  assert.equal(source.count,120,'Shadow and idle passes retain offscreen casters');assert.deepEqual(source.instanceMatrix.array,originalMatrices);
  culler.prepare(camera);culler.setRoots([root]);
  assert.equal(culler.getDiagnostics().instances,120,'Re-registering a partially viewed scene never loses source instances');assert.equal(source.count,120);
  culler.prepare(camera);culler.dispose();assert.equal(source.count,120);assert.deepEqual(source.instanceColor.array,originalColors);
  root.traverse(o=>o.isInstancedMesh&&o.dispose());g.dispose();m.dispose();
});

test('vegetation compaction leaves custom instance attributes and stable-instance-ID shaders untouched',()=>{
  const root=new THREE.Group(),g=new THREE.BoxGeometry(),m=new THREE.MeshBasicMaterial(),custom=new THREE.InstancedMesh(g,m,4),stable=new THREE.InstancedMesh(new THREE.BoxGeometry(),m,4);
  custom.name='hedge-sprays-custom';g.setAttribute('windPhase',new THREE.InstancedBufferAttribute(new Float32Array(4),1));
  stable.name='existing-canopies-custom';stable.userData.requiresStableInstanceId=true;root.add(custom,stable);
  const culler=createVegetationInstanceCuller();culler.setRoots([root]);culler.prepare(new THREE.PerspectiveCamera());
  assert.equal(culler.getDiagnostics().sourceBatches,0);assert.equal(custom.count,4);assert.equal(stable.count,4);culler.dispose();
  custom.dispose();stable.dispose();g.dispose();stable.geometry.dispose();m.dispose();
});

test('moving opaque order draws architecture before foliage while preserving explicit priorities and restoring the renderer',()=>{
  const root=new THREE.Group(),g=new THREE.BoxGeometry(),leafMaterial=new THREE.MeshStandardMaterial({alphaTest:.3}),wallMaterial=new THREE.MeshStandardMaterial();
  const foliage=new THREE.InstancedMesh(g,leafMaterial,2),wall=new THREE.Mesh(g,wallMaterial);foliage.name='existing-canopies-depth-order';root.add(foliage,wall);
  const culler=createVegetationInstanceCuller();culler.setRoots([root]);
  const item=(object,{groupOrder=0,renderOrder=object.renderOrder,z=0,id=object.id}={})=>({object,material:object.material,groupOrder,renderOrder,z,id});
  let sorter=null;const changes=[],renderer={setOpaqueSort(value){sorter=value;changes.push(value);}};
  const originalLeaf=leafMaterial.toJSON(),originalWall=wallMaterial.toJSON(),originalMatrices=foliage.instanceMatrix.array.slice();
  foliage.count=1; // A compacted single-instance batch still belongs last.
  culler.withOpaqueDepthOrder(renderer,()=>{
    assert.equal(typeof sorter,'function');
    const leaf=item(foliage,{z:.1}),architecture=item(wall,{z:.8});
    assert.ok(leafMaterial.id<wallMaterial.id,'Default material order would draw this foliage first');
    assert.deepEqual([leaf,architecture].sort(sorter),[architecture,leaf]);
    assert.ok(sorter(item(foliage,{groupOrder:-1}),architecture)<0,'Explicit group priority wins');
    assert.ok(sorter(item(foliage,{renderOrder:-1}),architecture)<0,'Explicit object priority wins');
    assert.ok(sorter(leaf,item(wall,{renderOrder:999}))<0,'Late sky and overlays keep their explicit order');
    const near=item(wall,{z:.1,id:20}),far=item(wall,{z:.8,id:10}),tied=item(wall,{z:.1,id:30});
    assert.deepEqual([far,tied,near].sort(sorter),[near,tied,far],'Ordinary opaque depth and ID tie-breaks remain unchanged');
    assert.ok(sorter(item(foliage,{renderOrder:2}),item(wall,{renderOrder:3}))<0);
    assert.equal(culler.getDiagnostics().opaqueOrder,'architecture-before-vegetation');
  },{enabled:true});
  assert.equal(sorter,null,'Default opaque ordering is restored before any other pass');
  assert.throws(()=>culler.withOpaqueDepthOrder(renderer,()=>{throw new Error('render failed');},{enabled:true}),/render failed/);
  assert.equal(sorter,null,'A failed render cannot leak moving order into reflection or idle passes');
  const previousChanges=changes.length;
  culler.withOpaqueDepthOrder(renderer,()=>{assert.equal(sorter,null);},{enabled:false});
  assert.equal(changes.length,previousChanges,'Shadow/idle passes do not replace the default sorter');
  assert.equal(culler.getDiagnostics().opaqueOrder,'default');
  assert.deepEqual(leafMaterial.toJSON(),originalLeaf);assert.deepEqual(wallMaterial.toJSON(),originalWall);
  assert.deepEqual(foliage.instanceMatrix.array,originalMatrices);assert.equal(foliage.geometry,g);assert.equal(foliage.renderOrder,0);
  culler.dispose();foliage.dispose();g.dispose();leafMaterial.dispose();wallMaterial.dispose();
});

test('moving depth order covers botanical meshes outside the compaction registry and respects material guards',()=>{
  const g=new THREE.BoxGeometry(),base=new THREE.MeshStandardMaterial(),botanical=createFoliageMaterial(base,'pine'),wallMaterial=new THREE.MeshStandardMaterial();
  const pine=new THREE.Mesh(g,botanical),wall=new THREE.Mesh(g,wallMaterial),root=new THREE.Group();pine.name='focal-screening-pine';root.add(pine,wall);
  const culler=createVegetationInstanceCuller();culler.setRoots([root]);assert.equal(culler.getDiagnostics().sourceBatches,0);
  const item=object=>({object,material:object.material,id:object.id,groupOrder:0,renderOrder:0,z:.5});
  const pineItem=item(pine),wallItem=item(wall);let sorter=null;
  culler.withOpaqueDepthOrder({setOpaqueSort(value){sorter=value;}},()=>{
    assert.ok(botanical.id<wallMaterial.id,'The default material order would put this focal pine ahead of the wall');
    assert.deepEqual([pineItem,wallItem].sort(sorter),[wallItem,pineItem]);
    for(const [key,value] of [['depthWrite',false],['depthTest',false],['transparent',true]]){
      const original=botanical[key];botanical[key]=value;
      assert.deepEqual([wallItem,pineItem].sort(sorter),[pineItem,wallItem],`${key} guard keeps an ineligible material in the native order`);
      botanical[key]=original;
    }
    assert.equal(pine.geometry,g);assert.equal(pine.material,botanical);assert.equal(pine.renderOrder,0);
  },{enabled:true});
  assert.equal(sorter,null);assert.equal(botanical.userData.botanicalCutouts,true);
  culler.dispose();g.dispose();base.dispose();botanical.dispose();wallMaterial.dispose();
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
