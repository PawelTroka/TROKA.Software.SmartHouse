import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {indexExactFoliageGeometry} from '../src/foliage-vertex-index.js';
import {createExistingVegetationGroup} from '../src/scene-existing-vegetation.js';
import {createHedgeVegetation} from '../src/scene-vegetation.js';
import {hedgeSegments,hedgeGroundAt,hedgeTopAt} from '../src/geometry.js';
import {boundaryFenceLayout} from '../src/boundary-fence.js';
import {DEFAULTS} from '../src/state.js';

const sizes={position:3,normal:3,uv:2,color:3};
const bytes=array=>new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
function expandedAttribute(geometry,name){
  const attribute=geometry.attributes[name],source=bytes(attribute.array),stride=attribute.itemSize*4;
  if(!geometry.index)return source.slice();
  const result=new Uint8Array(geometry.index.count*stride);
  for(let i=0;i<geometry.index.count;i++){
    const vertex=geometry.index.getX(i);result.set(source.subarray(vertex*stride,(vertex+1)*stride),i*stride);
  }
  return result;
}
function fixture(count=9){
  const geometry=new THREE.BufferGeometry();
  for(const [name,size] of Object.entries(sizes)){
    const array=new Float32Array(count*size);
    for(let i=0;i<count;i++)for(let axis=0;axis<size;axis++)array[i*size+axis]=(i%3)*10+axis;
    geometry.setAttribute(name,new THREE.BufferAttribute(array,size));
  }
  return geometry;
}

test('exact indexing preserves every attribute bit, triangle corner, range and metadata without mutating its source',()=>{
  const source=fixture(),positionBits=new Uint32Array(source.attributes.position.array.buffer),colorBits=new Uint32Array(source.attributes.color.array.buffer);
  // Distinct signed zeros and NaN payloads must not be merged or rounded.
  positionBits[0]=0;positionBits[9]=0x80000000;positionBits[18]=0;
  colorBits[3]=0x7fc00001;colorBits[12]=0x7fc00002;colorBits[21]=0x7fc00001;
  source.name='exact-foliage';source.userData={sprayCount:1,source:{id:'unchanged'}};
  source.addGroup(0,3,2);source.addGroup(3,6,1);source.setDrawRange(3,6);
  source.boundingBox=new THREE.Box3(new THREE.Vector3(-2,-3,-4),new THREE.Vector3(5,6,7));
  source.boundingSphere=new THREE.Sphere(new THREE.Vector3(1,2,3),8);
  source.attributes.color.name='leaf-shade';source.attributes.color.normalized=true;
  source.attributes.color.setUsage(THREE.DynamicDrawUsage);
  const before=Object.fromEntries(Object.keys(sizes).map(name=>[name,expandedAttribute(source,name)]));
  const result=indexExactFoliageGeometry(source);
  assert.notEqual(result,source);assert.equal(source.index,null);
  assert.equal(result.index.count,9);assert.equal(result.attributes.position.count,5);
  for(const name of Object.keys(sizes)){
    assert.deepEqual(expandedAttribute(result,name),before[name],name);
    assert.deepEqual(expandedAttribute(source,name),before[name],`${name}: canonical source remains unchanged`);
    assert.equal(result.attributes[name].itemSize,source.attributes[name].itemSize);
    assert.equal(result.attributes[name].normalized,source.attributes[name].normalized);
    assert.equal(result.attributes[name].usage,source.attributes[name].usage);
    assert.equal(result.attributes[name].gpuType,source.attributes[name].gpuType);
    assert.equal(result.attributes[name].name,source.attributes[name].name);
  }
  for(const key of ['name','userData','groups','drawRange','boundingBox','boundingSphere'])assert.deepEqual(result[key],source[key],key);
  assert.notEqual(result.boundingBox,source.boundingBox);assert.notEqual(result.boundingSphere,source.boundingSphere);
});

test('unsupported or vertex-ID-dependent geometry and already-indexed cylinders are left untouched',()=>{
  const cases=[new THREE.CylinderGeometry(),Object.assign(fixture(),{isInstancedBufferGeometry:true})];
  const extra=fixture();extra.setAttribute('custom',new THREE.BufferAttribute(new Float32Array(9),1));cases.push(extra);
  const morph=fixture();morph.morphAttributes.position=[morph.attributes.position.clone()];cases.push(morph);
  const ids=fixture();ids.userData.requiresStableVertexId=true;cases.push(ids);
  const instanced=fixture();instanced.setAttribute('color',new THREE.InstancedBufferAttribute(new Float32Array(27),3));cases.push(instanced);
  const interleaved=fixture();interleaved.setAttribute('position',new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Float32Array(27),3),3,0));cases.push(interleaved);
  for(const source of cases)assert.equal(indexExactFoliageGeometry(source),source);
});

test('the fixed WebGL2 restart index uses a 32-bit index array while the preceding range stays 16-bit',()=>{
  for(const unique of [65535,65536]){
    const count=Math.ceil((unique+1)/3)*3,source=fixture(count);
    for(let i=0;i<count;i++){
      const id=i<unique?i:0;
      for(const [name,size] of Object.entries(sizes))for(let axis=0;axis<size;axis++)source.attributes[name].array[i*size+axis]=axis===0?id:axis;
    }
    const result=indexExactFoliageGeometry(source);
    assert.equal(result.attributes.position.count,unique);
    assert.equal(result.index.array.constructor,unique===65535?Uint16Array:Uint32Array);
    assert.equal(result.index.getX(unique-1),unique-1);
    assert.equal(result.index.getX(count-1),0);
  }
});

// These hashes were captured from the expanded builders before indexing.
// Expanding the new index must reproduce every position/normal/UV/color byte
// in exactly the old triangle order, including the actual fence-clipped hedge.
const originalHashes={
  'existing-canopies-far-0':'0b07542f759e0ed8bcc9ccf6b47b596124079d4c3e06e77c0f1150ce3b3bc60e',
  'existing-canopies-far-1':'8090284e94ed2ec4859fb4654a3c29ba70ca3bfd3e8330ca440f411fa6c557f4',
  'existing-canopies-far-2':'9a7bdc39bdef5cd9fd54d26b3c483fc5a6f16603fbdf7f26a9454b0b8a8811fd',
  'existing-canopies-far-3':'22ebe170a7ca7fcdb9bb3c8fed29ed6b788ed2610bafc794ef6080698d5917fb',
  'existing-canopies-near-0':'94fb407d269aef23661ab2dc94811c71b4f9932772fcdd104f383c165ca7c9e7',
  'existing-canopies-near-1':'f12e7acb976fd0ee2d7ee0582122072d531673470b6738d6e7c4b1efa4fce7bb',
  'existing-canopies-near-2':'ac9f3713ff45e4ad0acbbdea4dd32ed5d7621423de7f13f4ca33875f896e3249',
  'existing-canopies-near-3':'6f66fddb2b4e18a22beafa650883e4083c04a2ba7e7c0e4796c08eb1b167afb5',
  'hedge-sprays-4-0':'a3fac94c5d110ea70730db132c67ec00dc50e5b41632f2e76a3e59f2c3e176b8',
  'hedge-sprays-4-1':'f38a1afe3f973f0cd90338d84bc9d2fd8b326e65de53e31d86b1791b9dd1a1d1',
  'hedge-sprays-4-2':'ad947756ef69a004efbde86280ae6bfc3d19a6946e6d058051cf5726f1c0a9a3',
  'hedge-sprays-4-3':'a1b159077b7d2d3254040c9ee8ad252dcd7ae68c53ab6078e66966bbfd4321b6',
};
test('actual canopy and final clipped hedge builders retain the original expanded triangle bytes with fewer vertex entries',()=>{
  const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url)));
  const data={...read('site-data.json'),existingVegetation:read('sternicza-surrounding-nature.json')};
  const settings={...DEFAULTS,designStyle:'scandinavian',styleHouseFinish:true,interiorLayout:'renovation',planExteriorApplied:true,sceneMotion:false,sunMinutes:780};
  const xs=data.site.boundary.map(p=>p[0]),zs=data.site.boundary.map(p=>p[1]);
  const origin=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2];
  const roots=[createExistingVegetationGroup(data,settings,{origin}),createHedgeVegetation(hedgeSegments(settings,data),{
    material:new THREE.MeshStandardMaterial(),fence:boundaryFenceLayout(settings,data),
    groundAt:(x,y,s)=>hedgeGroundAt(x,y,s.side,settings,data,s.groundZone),
    topAt:(x,y,s)=>hedgeTopAt(x,y,s.side,settings,data,s.groundZone),
  })];
  const checked=new Set();
  for(const root of roots)root.traverse(mesh=>{
    if(!originalHashes[mesh.name])return;
    const geometry=mesh.geometry,hash=createHash('sha256');
    for(const name of Object.keys(sizes).sort()){hash.update(name);hash.update(expandedAttribute(geometry,name));}
    assert.equal(hash.digest('hex'),originalHashes[mesh.name],mesh.name);
    assert.ok(geometry.index,mesh.name);assert.ok(geometry.attributes.position.count<geometry.index.count);
    if(mesh.name.startsWith('existing-canopies'))assert.equal(geometry.attributes.position.count/geometry.index.count,2/3);
    checked.add(mesh.name);
  });
  assert.deepEqual([...checked].sort(),Object.keys(originalHashes).sort());
});
