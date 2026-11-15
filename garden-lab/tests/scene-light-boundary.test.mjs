import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {createGardenLightBoundary} from '../src/scene-light-boundary.js';

const rectangle=[[0,0],[10,0],[10,8],[0,8],[0,0]];
const compile=material=>{
  const library=material.isMeshPhysicalMaterial?THREE.ShaderLib.physical:THREE.ShaderLib.standard;
  const shader={uniforms:{},vertexShader:library.vertexShader,fragmentShader:library.fragmentShader};
  material.onBeforeCompile(shader,{});return shader;
};
const fixture=material=>{
  const group=new THREE.Group(),geometry=new THREE.BoxGeometry();
  group.add(new THREE.Mesh(geometry,material));return group;
};

test('each mapped plot uses its exact polygon, including cadastral concavity, and only its actual uniform count',()=>{
  for(const file of ['site-data.json','korzeniowskiego-40.json','nadmorska-17.json']){
    const data=JSON.parse(readFileSync(new URL('../data/'+file,import.meta.url))),before=JSON.stringify(data.site.boundary);
    const boundary=createGardenLightBoundary(data.site.boundary),material=new THREE.MeshStandardMaterial();
    boundary.install(fixture(material));const shader=compile(material),ring=data.site.boundary.slice(0,-1);
    assert.equal(boundary.vertexCount,ring.length);
    assert.deepEqual(shader.uniforms.gardenLightBoundary.value.map(p=>p.toArray()),ring);
    assert.deepEqual(shader.uniforms.gardenLightBounds.value.toArray(),[
      Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1])),
    ]);
    assert.ok(shader.fragmentShader.includes(`uniform vec2 gardenLightBoundary[${ring.length}];`));
    assert.ok(shader.fragmentShader.includes(`i < ${ring.length};`),'Only actual edges are visited per fragment');
    assert.equal(JSON.stringify(data.site.boundary),before);
  }
});

test('only point and spot direct light is scoped; sun, ambient and shared Three shader chunks stay intact',()=>{
  const originalChunk=THREE.ShaderChunk.lights_fragment_begin,material=new THREE.MeshPhysicalMaterial();
  createGardenLightBoundary(rectangle).install(fixture(material));const shader=compile(material);
  for(const kind of ['Point','Spot'])assert.ok(shader.fragmentShader.includes(
    `get${kind}LightInfo( ${kind.toLowerCase()}Light, geometryPosition, directLight );\n    directLight.color *= gardenLocalLightCoverage;`));
  const directionalAndIndirect=originalChunk.slice(originalChunk.indexOf('#if ( NUM_DIR_LIGHTS > 0 )'));
  assert.ok(shader.fragmentShader.includes(directionalAndIndirect),'Directional and indirect lighting code remains unchanged');
  assert.equal((shader.fragmentShader.match(/gardenPlotLightMask\( vGardenLightWorldXZ \)/g)||[]).length,1,'The polygon is evaluated once, not once per light');
  assert.match(shader.fragmentShader,/#if \( NUM_POINT_LIGHTS > 0 \) \|\| \( NUM_SPOT_LIGHTS > 0 \)\nfloat gardenLocalLightCoverage/);
  assert.equal(THREE.ShaderChunk.lights_fragment_begin,originalChunk);
});

test('world-position sampling includes batching and instance transforms before the model transform',()=>{
  const material=new THREE.MeshStandardMaterial();createGardenLightBoundary(rectangle).install(fixture(material));
  const shader=compile(material),source=shader.vertexShader;
  const transformed=source.indexOf('vec4 gardenLightWorldPosition = vec4( transformed, 1.0 );');
  const batching=source.indexOf('gardenLightWorldPosition = batchingMatrix * gardenLightWorldPosition;');
  const instancing=source.indexOf('gardenLightWorldPosition = instanceMatrix * gardenLightWorldPosition;');
  const world=source.indexOf('vGardenLightWorldXZ = ( modelMatrix * gardenLightWorldPosition ).xz;');
  assert.ok(transformed>=0&&transformed<batching&&batching<instancing&&instancing<world);
  assert.ok(source.indexOf('#include <project_vertex>')<transformed,'Morph/skinning/project preparation already occurred');
  assert.match(source,/#ifdef USE_INSTANCING\n  gardenLightWorldPosition = instanceMatrix/);
});

test('installation is idempotent, composes existing hooks/cache keys and leaves emissive Basic overlays alone',()=>{
  const material=new THREE.MeshStandardMaterial(),overlay=new THREE.MeshBasicMaterial();
  let calls=0,key='original-one';const marker={value:7};
  material.onBeforeCompile=function(shader){assert.equal(this,material);calls++;shader.uniforms.existingMarker=marker;};
  material.customProgramCacheKey=()=>key;
  const group=fixture([material,overlay]);group.add(new THREE.Mesh(group.children[0].geometry,material));
  const overlayHook=overlay.onBeforeCompile,overlayVersion=overlay.version,boundary=createGardenLightBoundary(rectangle);
  boundary.install(group);const version=material.version,hook=material.onBeforeCompile;
  boundary.install(group);assert.equal(material.version,version);assert.equal(material.onBeforeCompile,hook);
  const shader=compile(material);assert.equal(calls,1);assert.equal(shader.uniforms.existingMarker,marker);
  assert.match(material.customProgramCacheKey(),/^original-one\|garden-local-light-boundary-v1:4$/);
  key='original-two';assert.match(material.customProgramCacheKey(),/^original-two\|/);
  assert.equal(overlay.onBeforeCompile,overlayHook);assert.equal(overlay.version,overlayVersion);
  const late=material.clone();late.userData.transient=true;
  group.add(new THREE.InstancedMesh(new THREE.BoxGeometry(),late,2));boundary.install(group);
  assert.ok(compile(late).uniforms.gardenLightBoundary,'New cloned/transient foliage materials receive the same boundary');
});

test('coordinate updates share uniforms without recompilation; vertex-count changes invalidate compiled materials',()=>{
  const material=new THREE.MeshStandardMaterial(),group=fixture(material),boundary=createGardenLightBoundary(rectangle);
  boundary.install(group);const shader=compile(material),binding=shader.uniforms.gardenLightBoundary,key=material.customProgramCacheKey(),version=material.version;
  boundary.setBoundary([[1,2],[11,2],[11,10],[1,10]]);boundary.install(group);
  assert.equal(shader.uniforms.gardenLightBoundary,binding);
  assert.deepEqual(binding.value.map(p=>p.toArray()),[[1,2],[11,2],[11,10],[1,10]]);
  assert.equal(material.customProgramCacheKey(),key);assert.equal(material.version,version);
  boundary.setBoundary([[0,0],[10,0],[10,8],[5,6],[0,8]]);boundary.install(group);
  assert.equal(material.version,version+1);assert.notEqual(material.customProgramCacheKey(),key);
  const next=compile(material);assert.equal(next.uniforms.gardenLightBoundary,binding);
  assert.ok(next.fragmentShader.includes('uniform vec2 gardenLightBoundary[5];'));
});

test('invalid and unbounded polygons fail explicitly rather than silently disabling the spill constraint',()=>{
  for(const input of [null,[],[[0,0],[1,1]],[[0,0],[1,1],[2,2]],[[0,0],[1,0],[NaN,1]],
    Array.from({length:33},(_,i)=>[Math.cos(i*2*Math.PI/33),Math.sin(i*2*Math.PI/33)])])assert.throws(()=>createGardenLightBoundary(input));
});
