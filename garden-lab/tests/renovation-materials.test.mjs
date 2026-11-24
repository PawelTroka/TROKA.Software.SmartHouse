import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {DESIGN_STYLES,getDesignStyle} from '../src/design-styles.js';
import {MATERIAL_ASSETS,getMaterialForFinish,getStyleMaterialSamples} from '../src/material-catalogue.js';
import {exteriorPhotographicMapping,exteriorSurfacePixels} from '../src/exterior-materials.js';
import {projectArchitecturalMaterialUVs} from '../src/material-assets.js';
import {batchGroup} from '../src/interior-geometry.js';

test('every baseline/renovation catalogue role resolves to a compact self-hosted material sample',async()=>{
  const unique=new Set();
  for(const style of DESIGN_STYLES)for(const interior of [false,true]){
    const samples=getStyleMaterialSamples(style,{interior});
    assert.deepEqual(samples.map(s=>s.role),['wall','wood','floor','fabric']);
    for(const sample of samples){
      assert.ok(sample.asset&&sample.id&&sample.label&&sample.source,`${style.id}/${sample.role}`);
      assert.equal(sample.license,'CC0-1.0');assert.ok(sample.meters.every(n=>n>0));
      assert.ok(sample.url.endsWith('_swatch.jpg'));unique.add(sample.url);
    }
  }
  let bytes=0;for(const url of unique){const file=await stat(new URL(url));assert.ok(file.size<90_000);bytes+=file.size;}
  assert.ok(bytes<1_000_000,'Browsing all style cards must not download the full-resolution albedo library');
});

test('finish identity selects genuine material families and geometry joints get matching mortar-free samples',()=>{
  const ids=['clinker','terracotta','terrazzo','travertine','limestone','concrete','slate-floor','marble','porcelain'].map(name=>getMaterialForFinish(name).id);
  assert.equal(new Set(ids).size,ids.length,'Mineral finishes cannot all alias marble');
  assert.equal(new Set(['oak','ash','teak','walnut','cedar'].map(name=>getMaterialForFinish(name).id)).size,5);
  assert.equal(new Set(['linen','boucle','leather','velvet'].map(name=>getMaterialForFinish(name).id)).size,4);
  for(const finish of ['clinker','terracotta','terrazzo','limestone','sandstone']){
    const bonded=getMaterialForFinish(finish),unit=getMaterialForFinish(finish,{seams:false});
    assert.equal(unit.id,bonded.id+'_unit');assert.ok(unit.meters[0]<bonded.meters[0]);
  }
  assert.equal(getMaterialForFinish('zellige'),null,'Unsupported photographs retain the real authored tile pattern, not a stone substitute');
  assert.equal(getMaterialForFinish('painted-weatherboard').proceduralBond,true);
});

test('deck mapping cancels module normalization once and aligns real wood grain along the board',()=>{
  for(const id of ['hidden-bali','coastal','mediterranean-villa','modern-minimal']){
    const style=getDesignStyle(id),spec=getMaterialForFinish(id==='hidden-bali'?'teak':id==='coastal'?'whitewashed-oak':id==='modern-minimal'?'porcelain':'terracotta',{seams:false});
    const mapping=exteriorPhotographicMapping(style,'deck',spec),[length,width]=style.recipe.module;
    const texture=new THREE.Texture();texture.repeat.set(...mapping.repeat);texture.rotation=mapping.rotation||0;texture.updateMatrix();
    const timber=['boards','cross-boards'].includes(style.recipe.paving);
    const at=(x,z)=>new THREE.Vector2(timber?z/(8*width):x/length,timber?x/length:z/(8*width)).applyMatrix3(texture.matrix);
    const origin=at(0,0),along=at(1,0).sub(origin),across=at(0,1).sub(origin);
    if(timber&&spec.grainAxis==='u'){
      assert.ok(Math.abs(along.x-1/spec.meters[0])<1e-9);assert.ok(Math.abs(across.y+1/spec.meters[1])<1e-9);
    }else if(!timber){
      assert.ok(Math.abs(along.x-1/spec.meters[0])<1e-9);assert.ok(Math.abs(across.y-1/spec.meters[1])<1e-9);
    }
    assert.equal(mapping.metric,false);texture.dispose();
  }
});

test('wood fibres follow both vertical posts and horizontal rails while preserving vertex geometry',()=>{
  const material=new THREE.MeshStandardMaterial();material.userData.metricTexture=true;material.userData.woodGrainAxis='u';
  for(const scale of [[.1,2,.1],[2,.1,.1]]){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);mesh.scale.set(...scale);
    const before=Array.from(mesh.geometry.attributes.position.array);projectArchitecturalMaterialUVs(mesh);
    const {uv,normal}=mesh.geometry.attributes,values=[];
    for(let i=0;i<uv.count;i++)if(normal.getZ(i)>.9)values.push(uv.getX(i));
    assert.ok(Math.abs(Math.max(...values)-Math.min(...values)-2)<1e-6);
    assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),before);mesh.geometry.dispose();
  }
  material.dispose();
});

test('the production furniture batch preserves each timber member’s UV axis and leaves Current on its original final-pass path',()=>{
  const timber=new THREE.MeshStandardMaterial();timber.userData.metricTexture=true;timber.userData.woodGrainAxis='u';
  const current=new THREE.MeshStandardMaterial();current.userData.metricTexture=true;
  const make=material=>{
    const group=new THREE.Group();group.position.set(3,1,4);group.rotation.y=.37;
    for(const [scale,position] of [[[.1,2,.1],[0,1,0]],[[2,.1,.1],[1,2,0]]]){
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);mesh.scale.set(...scale);mesh.position.set(...position);group.add(mesh);
    }
    return group;
  };
  const expected=make(timber),batched=make(timber),baseline=make(current);
  projectArchitecturalMaterialUVs(expected);
  const expectedUV=expected.children.flatMap(mesh=>Array.from(mesh.geometry.attributes.uv.array));
  const originalUV=baseline.children.flatMap(mesh=>Array.from(mesh.geometry.attributes.uv.array));
  batchGroup(batched);assert.equal(batched.children.length,1);
  const geometry=batched.children[0].geometry;
  assert.deepEqual(Array.from(geometry.attributes.uv.array),expectedUV,'Batching must retain the separately projected post and rail');
  assert.equal(geometry.userData.architecturalMetricUVs,true);
  const scene=new THREE.Group();scene.rotation.y=.61;scene.position.x=20;scene.add(batched);
  assert.equal(projectArchitecturalMaterialUVs(scene),0,'The final scene pass must not replace member axes with the combined furniture bounds');
  assert.deepEqual(Array.from(geometry.attributes.uv.array),expectedUV);
  batchGroup(baseline);
  assert.notEqual(baseline.children[0].geometry.userData.architecturalMetricUVs,true);
  assert.deepEqual(Array.from(baseline.children[0].geometry.attributes.uv.array),originalUV,'Current must not receive the renovation prepass');
  assert.equal(projectArchitecturalMaterialUVs(baseline),1,'Current retains its existing final scene projection');
  for(const group of [expected,batched,baseline])group.traverse(mesh=>mesh.geometry?.dispose());
  timber.dispose();current.dispose();
});

function fakeDocument(){return {createElementNS(){},createElement(){return {width:0,height:0,getContext(){return {
  fillRect(){},drawImage(){},putImageData(){},getImageData(){return {data:new Uint8ClampedArray([128,128,128,255])};},
};}};}};}

test('optional interior materials stay unloaded; shared clones remain live and idle decoded sources stay bounded',async()=>{
  const oldDocument=globalThis.document,oldLoad=THREE.ImageLoader.prototype.load,pending=[];
  const materials=[],handles=[];
  try{
    globalThis.document=fakeDocument();THREE.ImageLoader.prototype.load=function(url,ready){pending.push({url,ready});return {};};
    const photos=await import('../src/material-assets.js?renovation-lifecycle-test');
    const unused=new THREE.MeshStandardMaterial(),used=new THREE.MeshStandardMaterial();materials.push(unused,used);
    photos.deferPhotographicSurface(unused,'travertine',{},maps=>handles.push(...maps));
    photos.deferPhotographicSurface(used,'oak',{},maps=>handles.push(...maps));
    assert.equal(pending.length,0);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(),used);photos.projectArchitecturalMaterialUVs(mesh);
    assert.equal(pending.length,3);assert.equal(used.userData.photographicSurface,'oak_veneer_02');
    assert.ok(pending.every(p=>!p.url.includes('Travertine')));mesh.geometry.dispose();
    for(const item of pending.splice(0))item.ready({width:1024,height:1024});
    const clone=used.map.clone(),source=clone.source;handles.push(clone);used.map.dispose();
    assert.equal(clone.source,source);assert.equal(clone.image.width,1024);assert.equal(used.map.image,null);
    for(const name of ['travertine','parquet','velvet','boucle','clay-plaster','limestone']){
      const maps=photos.createPhotographicMaps(name),spec=MATERIAL_ASSETS[name];handles.push(...Object.values(maps));
      for(const item of pending.splice(0))item.ready({width:spec.pixels[0],height:spec.pixels[1]});
      for(const texture of Object.values(maps))texture.dispose();
    }
    assert.ok(photos.surfaceAssetDiagnostics().idleBytes<=48*1024*1024);
    assert.equal(clone.source,source,'Idle eviction cannot damage another renderer’s live clone');
    for(const texture of handles)texture.dispose();assert.equal(photos.surfaceAssetDiagnostics().liveTextures,0);
  }finally{
    for(const texture of handles)texture.dispose();for(const material of materials)material.dispose();
    THREE.ImageLoader.prototype.load=oldLoad;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
  }
});

test('delivery compression keeps normal direction and roughness close to the verified source',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../assets/materials/manifest.json',import.meta.url),'utf8'));
  let saved=0;
  for(const asset of manifest.assets.filter(a=>!a.derivedFrom))for(const [channel,map] of Object.entries(asset.maps)){
    const quality=map.deliveryCompression;if(!quality)continue;
    assert.ok(quality.quality>=94&&quality.quality<=96);assert.equal(quality.sourceSha256.length,64);
    assert.ok(quality.meanAbsoluteError8Bit<3,`${asset.id}/${channel}`);
    if(channel==='nor_gl')assert.ok(quality.normalAngularErrorP95Degrees<4,asset.id);
    saved+=quality.sourceBytes-map.bytes;
  }
  assert.ok(saved>20_000_000,'Production delivery must actually reduce transfer, not just rename the source files');
});

test('authored ceramic fallbacks retain different physical bonds in their independent normal channels',()=>{
  const normals=['penny-tile','zellige','encaustic','riverstone'].map(kind=>exteriorSurfacePixels(kind,128).normals);
  for(let i=0;i<normals.length;i++)for(let j=0;j<i;j++)assert.notDeepEqual(normals[i],normals[j]);
});
