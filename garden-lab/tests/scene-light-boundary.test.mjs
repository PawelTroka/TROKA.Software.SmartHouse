import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {createGardenLightBoundary,isGardenLightBoundaryOrderSafe} from '../src/scene-light-boundary.js';

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

test('exact-zero local BRDF guards preserve every nonzero path and all original texture/shadow operations',()=>{
  const guard=/if \( directLight\.color != vec3\( 0\.0 \) \) \{\n        (RE_Direct\( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight \);)\n      \}/g;
  for(const Material of [THREE.MeshStandardMaterial,THREE.MeshPhysicalMaterial]){
    const optimized=new Material(),reference=new Material();
    // A custom no-op hook deliberately retains the previous unguarded shader.
    reference.onBeforeCompile=()=>{};
    const boundary=createGardenLightBoundary(rectangle);boundary.install(fixture(optimized));boundary.install(fixture(reference));
    const actual=compile(optimized),previous=compile(reference);
    assert.equal((actual.fragmentShader.match(guard)||[]).length,2,'Only point and spot direct calls are conditional');
    assert.deepEqual(actual.fragmentShader.replace(guard,'$1'),previous.fragmentShader,
      'Removing only the exact-zero guards recovers the entire prior shader byte for byte');
    assert.equal(actual.vertexShader,previous.vertexShader,'Transforms, alpha coverage and geometric inputs stay unchanged');
    const point=actual.fragmentShader.slice(actual.fragmentShader.indexOf('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )'),actual.fragmentShader.indexOf('#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )'));
    const spot=actual.fragmentShader.slice(actual.fragmentShader.indexOf('#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )'),actual.fragmentShader.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )'));
    assert.ok(point.indexOf('if ( directLight.color !=')>point.indexOf('getPointShadow('));
    assert.ok(spot.indexOf('if ( directLight.color !=')>spot.indexOf('texture2D( spotLightMap'));
    assert.ok(spot.indexOf('if ( directLight.color !=')>spot.indexOf('getShadow('));
    assert.match(optimized.customProgramCacheKey(),/\|exact-zero-local-direct-v1$/);
    assert.doesNotMatch(reference.customProgramCacheKey(),/exact-zero-local-direct/);
    optimized.dispose();reference.dispose();
  }
  const physical=THREE.ShaderChunk.lights_physical_pars_fragment;
  const direct=physical.slice(physical.indexOf('void RE_Direct_Physical('),physical.indexOf('void RE_IndirectDiffuse_Physical('));
  assert.match(direct,/vec3 irradiance = dotNL \* directLight\.color/);
  assert.match(direct,/vec3 ccIrradiance = dotNLcc \* directLight\.color/);
  for(const line of direct.split('\n').filter(line=>line.includes('+=')))assert.match(line,/\+= (?:irradiance|ccIrradiance) \*/,
    'Every direct accumulator is multiplied by the incident light color');
  // Follow only the direct BRDF's actual helper graph. Rect-area lighting in
  // the same vendor chunk legitimately samples LTC textures and is untouched.
  const library=physical+THREE.ShaderChunk.bsdfs+THREE.ShaderChunk.common,functions=new Map();
  const declaration=/\b(?:void|float|vec[234]|mat[234]|int|bool)\s+(\w+)\s*\([^)]*\)\s*\{/g;
  for(let match;(match=declaration.exec(library));){
    let end=declaration.lastIndex,depth=1;
    while(end<library.length&&depth){const c=library[end++];if(c==='{')depth++;else if(c==='}')depth--;}
    const body=library.slice(declaration.lastIndex,end-1),name=match[1];
    // Conditional alternative declarations elsewhere in the raw chunk may
    // share one closing brace; keep scanning declarations independently.
    functions.set(name,(functions.get(name)||'')+body);
  }
  const pending=['RE_Direct_Physical'],visited=new Set();
  while(pending.length){
    const name=pending.pop();if(visited.has(name))continue;visited.add(name);
    const body=functions.get(name);assert.ok(body,'Pinned direct BRDF helper '+name+' must exist');
    assert.doesNotMatch(body,/\b(?:texture\w*|dFdx|dFdy|fwidth)\s*\(|\bdiscard\b/,
      name+' cannot introduce conditional texture derivatives or discard side effects');
    for(const [,called] of body.matchAll(/\b(\w+)\s*\(/g))if(functions.has(called))pending.push(called);
  }
  for(const name of ['BRDF_GGX','BRDF_GGX_Clearcoat','BRDF_Sheen','BRDF_Lambert','F_Schlick'])assert.ok(visited.has(name));
});

test('the pinned Three loop unroller retains one zero guard per actual point/spot light with balanced scope',()=>{
  const vendor=readFileSync(new URL('../vendor/three.module.js',import.meta.url),'utf8'),start=vendor.indexOf('const unrollLoopPattern = '),end=vendor.indexOf('function generatePrecision(',start);
  assert.ok(start>=0&&end>start);const unroll=new Function(vendor.slice(start,end)+'\nreturn unrollLoops;')();
  const material=new THREE.MeshStandardMaterial();createGardenLightBoundary(rectangle).install(fixture(material));const shader=compile(material).fragmentShader;
  for(const points of [0,1,3])for(const spots of [0,1,2]){
    const counts={POINT:points,SPOT:spots,DIR:1,RECT_AREA:0,HEMI:1};
    const expanded=unroll(shader.replace(/NUM_(POINT|SPOT|DIR|RECT_AREA|HEMI)_LIGHTS\b/g,(_,kind)=>String(counts[kind])));
    assert.equal((expanded.match(/if \( directLight\.color != vec3\( 0\.0 \) \)/g)||[]).length,points+spots);
    assert.equal((expanded.match(/RE_Direct\( directLight,/g)||[]).length,points+spots+1,'Directional light still executes its original unconditional call');
    assert.equal((expanded.match(/\{/g)||[]).length,(expanded.match(/\}/g)||[]).length,'The nested guard survives the real unroll implementation');
    assert.doesNotMatch(expanded,/#pragma unroll_loop_start|#pragma unroll_loop_end/);
  }
  material.dispose();
});

test('unknown or subsequently replaced shader hooks do not acquire the zero-work optimization or order-safe allowance',()=>{
  const boundary=createGardenLightBoundary(rectangle),material=new THREE.MeshStandardMaterial();boundary.install(fixture(material));
  const installed=material.onBeforeCompile,key=material.customProgramCacheKey;
  assert.equal(isGardenLightBoundaryOrderSafe(material),true);assert.match(compile(material).fragmentShader,/if \( directLight\.color != vec3\( 0\.0 \) \)/);
  material.onBeforeCompile=function(shader,renderer){installed.call(this,shader,renderer);};
  assert.equal(isGardenLightBoundaryOrderSafe(material),false);assert.doesNotMatch(compile(material).fragmentShader,/if \( directLight\.color != vec3\( 0\.0 \) \)/);
  assert.doesNotMatch(key.call(material),/exact-zero-local-direct/);
  material.onBeforeCompile=installed;material.customProgramCacheKey=()=> 'later-cache-key';
  assert.equal(isGardenLightBoundaryOrderSafe(material),false);assert.doesNotMatch(compile(material).fragmentShader,/if \( directLight\.color != vec3\( 0\.0 \) \)/);
  const customKey=new THREE.MeshStandardMaterial();customKey.customProgramCacheKey=()=> 'prior-cache-key';boundary.install(fixture(customKey));
  assert.equal(isGardenLightBoundaryOrderSafe(customKey),false);assert.doesNotMatch(compile(customKey).fragmentShader,/if \( directLight\.color != vec3\( 0\.0 \) \)/);
  material.dispose();customKey.dispose();
});
