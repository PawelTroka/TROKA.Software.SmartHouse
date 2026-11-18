import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {renderBudget} from '../src/render-quality.js';
import {terrainVertexBuffer} from '../src/terrain-mesh.js';
import {createDetailMaps} from '../src/scene-materials.js';
import {batchGardenBoxes,finishDeckBox,projectWaterUVs,proposedMaterials,disposeProposedMaterials} from '../src/scene-static-details.js';
import {getDesignStyle} from '../src/design-styles.js';

test('quality caps limit total pixels on large/high-DPI viewports and shadow size on constrained hardware',()=>{
  for(const [mode,limit] of [['eco',720000],['auto',2100000],['high',4000000]]){
    const {pixelRatio,shadowSize}=renderBudget(mode,3840,2160,3,{maxTextureSize:1024});
    assert.ok(pixelRatio**2*3840*2160<=limit+1);assert.equal(shadowSize,1024);
  }
  const stable=renderBudget('auto',1280,720,2);
  const moving=renderBudget('auto',1280,720,2,{interacting:true});
  assert.ok(moving.pixelRatio<stable.pixelRatio);
  assert.equal(moving.shadowSize,stable.shadowSize);
  assert.equal(renderBudget('auto',393,700,3).shadowSize,1024);
  assert.equal(renderBudget('auto',1280,720,2,{memoryGB:2}).shadowSize,1024);
  assert.equal(renderBudget('high',1200,800,1).pixelRatio,1);
});

test('indexed terrain samples each distinct plan coordinate once and preserves triangle order, UVs and slopes',()=>{
  let samples=0;
  const builder=terrainVertexBuffer((x,y)=>{samples++;return 3+x*.2+y*.1;},true);
  const triangles=[[0,0],[1,1],[1,0],[0,0],[0,1],[1,1]];
  triangles.forEach(p=>builder.add(...p));
  const g=builder.finish(),{position,uv,normal}=g.attributes;
  assert.equal(position.count,4);assert.equal(samples,4);assert.equal(g.index.count,6);
  for(const [ordinal,index] of g.index.array.entries()){
    const [x,y]=triangles[ordinal];
    assert.deepEqual([position.getX(index),position.getZ(index)],[x,y]);
    assert.ok(Math.abs(position.getY(index)-(3+.2*x+.1*y))<1e-6);
    assert.ok(Math.abs(uv.getX(index)-x/2.5)<1e-6);
    assert.ok(Math.abs(normal.getY(index)-1/Math.sqrt(1.05))<1e-6);
  }
  g.dispose();
});

test('water normals and surface relief use deterministic mipmapped numeric data',()=>{
  const {waterNormal,microHeight,barkHeight}=createDetailMaps(32);
  for(const map of [waterNormal,microHeight,barkHeight]){
    assert.equal(map.colorSpace,THREE.NoColorSpace);assert.equal(map.wrapS,THREE.RepeatWrapping);
    assert.equal(map.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(map.generateMipmaps,true);
  }
  const values=waterNormal.image.data;
  for(let i=0;i<values.length;i+=4){
    const n=[values[i],values[i+1],values[i+2]].map(v=>v/127.5-1);
    assert.ok(Math.abs(Math.hypot(...n)-1)<.007);assert.ok(n[2]>.9);
  }
  assert.ok(new Set(microHeight.image.data).size>60);
  waterNormal.dispose();microHeight.dispose();barkHeight.dispose();
});

test('batching fixed opaque boxes retains their world bounds, topology and shadow/picking exceptions',()=>{
  const group=new THREE.Group(),material=new THREE.MeshStandardMaterial();
  const box=(x,name='')=>{const m=new THREE.Mesh(new THREE.BoxGeometry(.5,.8,1.2),material);m.name=name;
    m.position.set(x,0,2);m.rotation.x=.3;m.castShadow=true;m.receiveShadow=true;group.add(m);return m;};
  const items=[box(1),box(2),box(3)],target=box(4,'pool-coping'),different=box(5);
  different.castShadow=false;group.updateMatrixWorld(true);
  const expected=new THREE.Box3();for(const item of items)expected.expandByObject(item,true);
  assert.equal(batchGardenBoxes(group),2);assert.ok(group.children.includes(target)&&group.children.includes(different));
  const combined=group.getObjectByName('garden-fixed-boxes'),actual=new THREE.Box3().setFromObject(combined,true);
  assert.ok(actual.min.distanceTo(expected.min)<1e-6&&actual.max.distanceTo(expected.max)<1e-6);
  assert.equal(combined.geometry.index.count,108);assert.ok(combined.castShadow&&combined.receiveShadow);
  assert.equal(combined.geometry.attributes.uv.count,72);group.traverse(o=>o.geometry?.dispose());material.dispose();
});

test('water UV periods remain two metres across differently sized pools and translated tubs',()=>{
  const material=new THREE.MeshPhysicalMaterial(),group=new THREE.Group();
  for(const [x,length] of [[0,6],[11,3]]){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,.05,length),material);mesh.position.set(x,1,2);group.add(mesh);
  }
  projectWaterUVs(group,material);
  for(const m of group.children){
    const {position,normal,uv}=m.geometry.attributes;
    for(let i=0;i<position.count;i++)if(normal.getY(i)>.9){
      assert.ok(Math.abs(uv.getX(i)-(position.getX(i)+m.position.x)/2)<1e-6);
      assert.ok(Math.abs(uv.getY(i)-(position.getZ(i)+m.position.z)/2)<1e-6);
    }
    m.geometry.dispose();
  }
  material.dispose();
});

test('board recipes bind grain to the metric joint module and release only their palette',()=>{
  const base=Object.fromEntries(['stone','stoneLight','wood','woodLight','metal','linen','wall','roof','plinth']
    .map(key=>[key,new THREE.MeshStandardMaterial()]));
  const style=getDesignStyle('hidden-bali'),proposal=proposedMaterials(base,style);
  assert.equal(proposedMaterials(base,getDesignStyle('current')),base);
  const [length,width]=style.recipe.module;
  const slab=new THREE.Mesh(new THREE.BoxGeometry(length,.12,8*width),proposal.stone);
  slab.position.set(length/2,1,4*width);finishDeckBox(slab,proposal.deck,style,0,0);
  const g=slab.geometry;
  assert.equal(g.index.count,36);assert.deepEqual(g.groups.map(g=>g.count),[30,6]);
  assert.equal(slab.material[1],proposal.deck);
  for(const i of [...g.index.array].slice(-6)){
    assert.ok(g.attributes.normal.getY(i)>.99);
    assert.ok(Math.min(...[0,1].map(v=>Math.abs(g.attributes.uv.getY(i)-v)))<1e-6);
  }
  const tracked=new Set();for(const m of Object.values({...base,...proposal}))m.addEventListener('dispose',()=>tracked.add(m));
  disposeProposedMaterials(proposal,base);assert.ok(tracked.has(proposal.deck));assert.ok(!tracked.has(base.wood));
  g.dispose();Object.values(base).forEach(m=>m.dispose());
});
