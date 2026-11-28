import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {createVegetationInstanceCuller} from '../src/scene-spatial-instances.js';
import {createFoliageMaterial} from '../src/scene-vegetation.js';
import {createExistingVegetationGroup} from '../src/scene-existing-vegetation.js';
import {createGardenLightBoundary} from '../src/scene-light-boundary.js?v=1.40.0';

const vendor=readFileSync(new URL('../vendor/three.module.js',import.meta.url),'utf8');
function material(){
  const result=new THREE.MeshStandardMaterial({alphaTest:.33,alphaToCoverage:true,side:THREE.DoubleSide});
  result.userData.botanicalCutouts=true;return result;
}
function fixture(surface=material()){
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),mesh=new THREE.Mesh(geometry,surface),culler=createVegetationInstanceCuller();
  mesh.name='focal-botanical-tree';root.add(mesh);culler.setRoots([root]);
  let sorter=null;const changes=[],renderer={setOpaqueSort(value){sorter=value;changes.push(value);}};
  return {root,geometry,mesh,material:surface,culler,renderer,changes,get sorter(){return sorter;},dispose(){culler.dispose();geometry.dispose();surface.dispose();}};
}
function stateTrace(surface){
  // Execute the actual pinned WebGLState material setup, not a reproduction.
  const start=vendor.indexOf('\tfunction setMaterial( material, frontFaceCW ) {'),end=vendor.indexOf('\n\t//\n\n\tfunction setFlipSided',start);
  assert.ok(start>=0&&end>start);const trace=[],record=name=>(...args)=>trace.push([name,...args]);
  const names=['DoubleSide','BackSide','NormalBlending','NoBlending','gl','disable','enable','setFlipSided','setBlending','depthBuffer','colorBuffer','stencilBuffer','setPolygonOffset'];
  const gl={CULL_FACE:'CULL_FACE',SAMPLE_ALPHA_TO_COVERAGE:'SAMPLE_ALPHA_TO_COVERAGE'};
  const buffer=(name,methods)=>Object.fromEntries(methods.map(method=>[method,record(name+'.'+method)]));
  new Function(...names,vendor.slice(start,end)+'\nreturn setMaterial;')(
    THREE.DoubleSide,THREE.BackSide,THREE.NormalBlending,THREE.NoBlending,gl,record('disable'),record('enable'),record('flip'),record('blend'),
    buffer('depth',['setFunc','setTest','setMask']),buffer('color',['setMask']),buffer('stencil',['setTest','setMask','setFunc','setOp']),record('polygon')
  )(surface,false);return trace;
}
function shaderSource(surface){
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  surface.onBeforeCompile(shader,{});return {vertexShader:shader.vertexShader,fragmentShader:shader.fragmentShader,key:surface.customProgramCacheKey()};
}

test('eligible shared botanical materials change only redundant GL coverage during one main pass',()=>{
  const base=new THREE.MeshStandardMaterial(),foliage=createFoliageMaterial(base,'pine'),f=fixture(foliage),other=new THREE.Mesh(f.geometry,foliage);
  const canopy=material();canopy.userData={existingCanopy:true};const canopyMesh=new THREE.Mesh(f.geometry,canopy);f.root.add(other,canopyMesh);
  f.culler.setRoots([f.root]);const original=foliage.toJSON(),version=foliage.version,map=foliage.map,source=shaderSource(foliage),before=stateTrace(foliage);
  try{
    assert.equal(f.culler.getDiagnostics().sourceBatches,0,'Focal non-instanced trees are included independently of compaction');
    const result=f.culler.withOpaqueDepthOrder(f.renderer,()=>{
      assert.equal(foliage.alphaToCoverage,false);assert.equal(canopy.alphaToCoverage,false);assert.equal(typeof f.sorter,'function');
      assert.equal(f.culler.getDiagnostics().opaqueCoverageMaterials,2);assert.equal(f.culler.getDiagnostics().opaqueCoverageMeshes,3);
      assert.equal(f.culler.getDiagnostics().opaqueCoverageRestored,false);
      assert.equal(foliage.version,version);assert.equal(foliage.map,map);assert.equal(f.mesh.geometry,f.geometry);
      assert.deepEqual(shaderSource(foliage),source,'The material program and shader text are unchanged');
      const during=stateTrace(foliage),coverage=entry=>entry[1]==='SAMPLE_ALPHA_TO_COVERAGE';
      assert.deepEqual(before.filter(coverage),[['enable','SAMPLE_ALPHA_TO_COVERAGE']]);
      assert.deepEqual(during.filter(coverage),[['disable','SAMPLE_ALPHA_TO_COVERAGE']]);
      assert.deepEqual(during.filter(entry=>!coverage(entry)),before.filter(entry=>!coverage(entry)),'Every other actual WebGL material state is identical');
      return 'rendered';
    },{enabled:true});
    assert.equal(result,'rendered');assert.equal(foliage.alphaToCoverage,true);assert.equal(canopy.alphaToCoverage,true);assert.equal(f.sorter,null);
    assert.deepEqual(foliage.toJSON(),original);assert.equal(foliage.version,version);assert.equal(f.culler.getDiagnostics().opaqueCoverageRestored,true);
    assert.equal(f.culler.getDiagnostics().opaqueCoverageMaterials,2,'Completed-pass activation remains observable after CPU state restoration');
    for(const options of [{enabled:true,optimizeOpaqueCoverage:false},{enabled:false}]){
      f.culler.withOpaqueDepthOrder(f.renderer,()=>{assert.equal(foliage.alphaToCoverage,true);assert.equal(canopy.alphaToCoverage,true);},options);
      assert.equal(f.culler.getDiagnostics().opaqueCoverageMaterials,0);assert.equal(f.culler.getDiagnostics().opaqueCoverageMeshes,0);
      assert.equal(f.culler.getDiagnostics().opaqueCoverageRestored,true);
    }
  }finally{f.dispose();base.dispose();canopy.dispose();}
});

test('failed renders and failed sorter setup restore coverage and cannot advertise a completed optimization',()=>{
  const f=fixture();
  try{
    assert.throws(()=>f.culler.withOpaqueDepthOrder(f.renderer,()=>{
      assert.equal(f.material.alphaToCoverage,false);throw new Error('draw failed');
    },{enabled:true}),/draw failed/);
    assert.equal(f.material.alphaToCoverage,true);assert.equal(f.sorter,null);
    assert.equal(f.culler.getDiagnostics().opaqueCoverageRestored,true);assert.equal(f.culler.getDiagnostics().opaqueCoverageMaterials,0);
    const calls=[];
    assert.throws(()=>f.culler.withOpaqueDepthOrder({setOpaqueSort(value){calls.push(value);if(value)throw new Error('sort setup failed');}},()=>assert.fail('No draw'),{enabled:true}),/sort setup failed/);
    assert.equal(calls.at(-1),null);assert.equal(f.material.alphaToCoverage,true);assert.equal(f.culler.getDiagnostics().opaqueCoverageMaterials,0);
    f.material.alphaToCoverage=false;
    f.culler.withOpaqueDepthOrder(f.renderer,()=>assert.equal(f.material.alphaToCoverage,false),{enabled:true});
    assert.equal(f.material.alphaToCoverage,false);assert.equal(f.culler.getDiagnostics().opaqueCoverageMaterials,0);
  }finally{f.dispose();}
});

test('coverage proof rejects every unsupported shader, render hook and non-OPAQUE state',()=>{
  const mutations=[
    f=>f.material.transparent=true,f=>f.material.opacity=.5,f=>f.material.blending=THREE.NoBlending,
    f=>f.material.blending=THREE.AdditiveBlending,f=>f.material.transmission=.1,
    f=>f.material.onBeforeCompile=()=>{},f=>f.material.customProgramCacheKey=()=> 'custom',f=>f.material.onBeforeRender=()=>{},
    f=>f.mesh.onBeforeRender=()=>{},f=>f.mesh.onAfterRender=()=>{},f=>f.mesh.material=[f.material],
    f=>f.material.defines.USE_TRANSMISSION='',f=>f.material.defines.STANDARD='custom',f=>f.material.defines=null,
    f=>f.material.defines=Object.assign(Object.create({CUSTOM:''}),{STANDARD:''}),
    f=>f.material.depthTest=false,f=>f.material.depthWrite=false,f=>f.material.colorWrite=false,
    f=>f.material.depthFunc=THREE.AlwaysDepth,f=>f.material.stencilWrite=true,f=>f.material.polygonOffset=true,
    f=>f.material.wireframe=true,f=>f.material.alphaHash=true,f=>delete f.material.userData.botanicalCutouts,
    f=>f.material.visible=false,f=>f.mesh.visible=false,f=>f.root.visible=false,
  ];
  for(const mutate of mutations){
    const f=fixture();try{
      mutate(f);f.culler.withOpaqueDepthOrder(f.renderer,()=>assert.equal(f.material.alphaToCoverage,true),{enabled:true});
      assert.equal(f.culler.getDiagnostics().opaqueCoverageMaterials,0,mutate.toString());assert.equal(f.material.alphaToCoverage,true);
    }finally{f.dispose();}
  }
  class CustomStandard extends THREE.MeshStandardMaterial{}
  for(const surface of [new THREE.MeshPhysicalMaterial({alphaToCoverage:true}),new CustomStandard({alphaToCoverage:true})]){
    surface.userData.botanicalCutouts=true;const f=fixture(surface);
    try{f.culler.withOpaqueDepthOrder(f.renderer,()=>assert.equal(surface.alphaToCoverage,true),{enabled:true});assert.equal(f.culler.getDiagnostics().opaqueCoverageMaterials,0);}finally{f.dispose();}
  }
});

test('an unsafe consumer vetoes shared material changes and root replacement releases old consumers',()=>{
  const f=fixture(),other=new THREE.Mesh(f.geometry,f.material);f.root.add(other);f.culler.setRoots([f.root]);
  try{
    for(const hidden of [false,true]){
      other.visible=!hidden;other.onBeforeRender=()=>{};
      f.culler.withOpaqueDepthOrder(f.renderer,()=>assert.equal(f.material.alphaToCoverage,true),{enabled:true});
      assert.equal(f.culler.getDiagnostics().opaqueCoverageMaterials,0,'Even a hidden custom consumer vetoes its shared material');
    }
    other.onBeforeRender=THREE.Object3D.prototype.onBeforeRender;other.material=[f.material];
    f.culler.withOpaqueDepthOrder(f.renderer,()=>assert.equal(f.material.alphaToCoverage,true),{enabled:true});
    assert.equal(f.culler.getDiagnostics().opaqueCoverageMaterials,0,'An array consumer is not silently changed through another mesh');
    other.material=f.material;other.visible=true;
    f.culler.withOpaqueDepthOrder(f.renderer,()=>assert.equal(f.material.alphaToCoverage,false),{enabled:true});
    assert.equal(f.culler.getDiagnostics().opaqueCoverageMaterials,1);assert.equal(f.culler.getDiagnostics().opaqueCoverageMeshes,2);
    f.culler.setRoots([]);f.culler.withOpaqueDepthOrder(f.renderer,()=>assert.equal(f.material.alphaToCoverage,true),{enabled:true});
    assert.equal(f.culler.getDiagnostics().opaqueCoverageMaterials,0);
    f.culler.setRoots([f.root]);f.culler.dispose();f.culler.withOpaqueDepthOrder(f.renderer,()=>assert.equal(f.material.alphaToCoverage,true),{enabled:true});
    assert.equal(f.culler.getDiagnostics().opaqueCoverageMaterials,0);
  }finally{f.dispose();}
});

test('real existing canopies allow only verified light hooks and exclude shadow/post-shadow guarded passes',()=>{
  const boundary=[[-100,-100],[100,-100],[100,100],[-100,100]],data={site:{id:'sternicza-11',boundary},existingVegetation:{siteId:'sternicza-11',canopies:
    Array.from({length:8},(_,i)=>({id:'coverage-tree-'+i,x:(i%4)*.4,y:i<4?-18:-5,baseZ:0,crownBaseZ:1,topZ:3,radiusX:1,radiusY:1}))}};
  const root=createExistingVegetationGroup(data,{existingVegetation:true,sunDate:'2026-06-21'},{origin:[0,0]}),lighting=createGardenLightBoundary(boundary);
  const culler=createVegetationInstanceCuller(),camera=new THREE.PerspectiveCamera(70,1,.1,100),renderer={setOpaqueSort(){}},materials=new Set();
  camera.position.set(0,2,2);camera.lookAt(0,2,-10);camera.updateMatrixWorld(true);root.updateMatrixWorld(true);
  root.traverse(mesh=>{if(mesh.material)materials.add(mesh.material);});culler.setRoots([root]);lighting.install(root);
  const foliage=[...materials].filter(m=>m.userData.existingCanopy);assert.equal(foliage.length,1);
  const leaf=foliage[0],shader=shaderSource(leaf),version=leaf.version,compile=leaf.onBeforeCompile,key=leaf.customProgramCacheKey;
  try{
    for(const shadowPassPending of [true,false]){
      const prepared=culler.prepare(camera,{shadowPassPending});assert.equal(prepared.compacted,false);
      culler.withOpaqueDepthOrder(renderer,()=>assert.equal(leaf.alphaToCoverage,true),{enabled:prepared.compacted});culler.restore();
      assert.equal(culler.getDiagnostics().opaqueCoverageMaterials,0);
    }
    const prepared=culler.prepare(camera);assert.equal(prepared.compacted,true);
    culler.withOpaqueDepthOrder(renderer,()=>{assert.equal(leaf.alphaToCoverage,false);assert.deepEqual(shaderSource(leaf),shader);},{enabled:prepared.compacted});culler.restore();
    assert.equal(culler.getDiagnostics().opaqueCoverageMaterials,1);assert.ok(culler.getDiagnostics().opaqueCoverageMeshes>=4);
    assert.equal(leaf.alphaToCoverage,true);assert.equal(leaf.version,version);
    for(const change of [()=>leaf.onBeforeCompile=()=>{},()=>{leaf.onBeforeCompile=compile;leaf.customProgramCacheKey=()=> 'later';}]){
      change();culler.withOpaqueDepthOrder(renderer,()=>assert.equal(leaf.alphaToCoverage,true),{enabled:true});assert.equal(culler.getDiagnostics().opaqueCoverageMaterials,0);
    }
    leaf.onBeforeCompile=compile;leaf.customProgramCacheKey=key;
    for(const mesh of root.children)if(mesh.isInstancedMesh&&mesh.material===leaf)mesh.count=0;
    culler.withOpaqueDepthOrder(renderer,()=>assert.equal(leaf.alphaToCoverage,true),{enabled:true});assert.equal(culler.getDiagnostics().opaqueCoverageMaterials,0,'Empty compacted batches do not count as active consumers');
    const unknown=fixture();try{
      unknown.material.onBeforeCompile=()=>{};lighting.install(unknown.root);
      unknown.culler.withOpaqueDepthOrder(unknown.renderer,()=>assert.equal(unknown.material.alphaToCoverage,true),{enabled:true});
      assert.equal(unknown.culler.getDiagnostics().opaqueCoverageMaterials,0,'Wrapping an unknown prior hook never establishes the proof');
    }finally{unknown.dispose();}
  }finally{culler.dispose();root.traverse(mesh=>{if(mesh.isInstancedMesh)mesh.dispose();mesh.geometry?.dispose();});for(const surface of materials)surface.dispose();}
});

test('pinned r160 OPAQUE shader writes alpha one after discard and coverage never changes its shader program',()=>{
  assert.equal(THREE.REVISION,'160');
  const programsStart=vendor.indexOf('function WebGLPrograms('),programsEnd=vendor.indexOf('function WebGLProperties(',programsStart);
  assert.ok(programsStart>=0&&programsEnd>programsStart);
  const programs=vendor.slice(programsStart,programsEnd);
  assert.match(programs,/opaque: material\.transparent === false && material\.blending === NormalBlending/);
  assert.doesNotMatch(programs,/alphaToCoverage/,'Coverage is not a shader parameter or cache-key input');
  assert.match(vendor,/parameters\.opaque \? '#define OPAQUE' : ''/);
  assert.equal(THREE.ShaderChunk.alphatest_fragment,'#ifdef USE_ALPHATEST\n\tif ( diffuseColor.a < alphaTest ) discard;\n#endif');
  assert.equal(THREE.ShaderChunk.opaque_fragment,'#ifdef OPAQUE\ndiffuseColor.a = 1.0;\n#endif\n#ifdef USE_TRANSMISSION\ndiffuseColor.a *= material.transmissionAlpha;\n#endif\ngl_FragColor = vec4( outgoingLight, diffuseColor.a );');
  const fragment=THREE.ShaderLib.standard.fragmentShader,opaque=fragment.indexOf('#include <opaque_fragment>');
  assert.ok(fragment.indexOf('#include <alphatest_fragment>')<opaque);
  const tail=fragment.slice(opaque+'#include <opaque_fragment>'.length),chunks=[...tail.matchAll(/#include <([^>]+)>/g)].map(match=>match[1]);
  assert.deepEqual(chunks,['tonemapping_fragment','colorspace_fragment','fog_fragment','premultiplied_alpha_fragment','dithering_fragment']);
  for(const name of chunks.filter(name=>name!=='colorspace_fragment')){
    assert.doesNotMatch(THREE.ShaderChunk[name],/gl_FragColor\s*=|gl_FragColor\.(?:a|w|rgba)\s*[*+\-/]?=/,`${name} preserves alpha`);
  }
  assert.equal(THREE.ShaderChunk.colorspace_fragment,'gl_FragColor = linearToOutputTexel( gl_FragColor );');
  assert.match(THREE.ShaderChunk.colorspace_pars_fragment,/vec4 LinearTransferOETF\( in vec4 value \) \{\n\treturn value;\n\}/);
  assert.match(THREE.ShaderChunk.colorspace_pars_fragment,/vec4 sRGBTransferOETF\( in vec4 value \) \{\n\treturn vec4\( [^\n]*, value\.a \);\n\}/);
  // GL alpha-to-coverage at alpha=1 supplies all sample bits. The existing
  // alpha discard and geometric MSAA coverage remain exactly the same; the
  // separately tested GL state change does not change alphaTest or samples.
});
