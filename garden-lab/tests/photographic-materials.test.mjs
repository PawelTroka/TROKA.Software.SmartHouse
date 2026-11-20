import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {MATERIAL_ASSETS,createPhotographicMaps,calibratePhotographicTint,projectArchitecturalMaterialUVs,surfaceAssetDiagnostics} from '../src/material-assets.js';
import {exteriorSurfacePixels} from '../src/exterior-materials.js';

// These are shipped runtime assets: a missing or corrupt map silently destroys
// normal/roughness fidelity even though the geometric scene can still render.
test('all photographic PBR channels match the vendored provenance manifest',async()=>{
  const folder=new URL('../assets/materials/',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('manifest.json',folder),'utf8'));
  assert.equal(manifest.assets.length,6);
  let total=0;
  for(const asset of manifest.assets){
    assert.equal(asset.license,'CC0-1.0');assert.ok(asset.authors&&Object.keys(asset.authors).length);
    assert.ok(asset.physicalSizeMeters.every(size=>size>.1&&size<5));
    const spec=Object.values(MATERIAL_ASSETS).find(s=>s.id===asset.id);assert.ok(spec);
    for(const [i,value] of spec.meters.entries())assert.ok(Math.abs(value-asset.physicalSizeMeters[i])<1e-6);
    for(const [channel,entry] of Object.entries(asset.maps)){
      const bytes=await readFile(new URL(entry.file,folder));total+=bytes.length;
      assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
      assert.equal(createHash('md5').update(bytes).digest('hex'),entry.md5);
      assert.equal(entry.colorSpace,channel==='Diffuse'?'sRGB':'linear');
      assert.equal(entry.width,1024);assert.ok(entry.height>=1024&&entry.height<=1030,'Provider 1K linen retains its measured non-square aspect');
    }
  }
  assert.ok(total<11_000_000,'The entire six-material download has a fixed browser asset budget');
});

test('headless geometry imports never request images and palette calibration remains bounded and repeatable',()=>{
  assert.equal(createPhotographicMaps('wood'),null);
  assert.equal(surfaceAssetDiagnostics().requested,0);
  const material=new THREE.MeshStandardMaterial({color:'#fffaf1'}),original=material.color.clone();
  calibratePhotographicTint(material,'wood');const once=material.color.toArray();
  assert.ok(once.every(c=>c>=0&&c<=1));calibratePhotographicTint(material,'wood');assert.deepEqual(material.color.toArray(),once);
  assert.deepEqual(material.userData.photographicTint.base,original.toArray());material.dispose();
});

test('metric texturing changes no vertices and accounts for actual instance scale without modifying shared geometry',()=>{
  const root=new THREE.Group(),shared=new THREE.BoxGeometry();shared.userData.sharedPrimitive=true;
  const before=Array.from(shared.attributes.position.array),originalUV=Array.from(shared.attributes.uv.array);
  const material=new THREE.MeshStandardMaterial();material.userData.metricTexture=true;
  const a=new THREE.Mesh(shared,material);a.scale.set(2,3,4);a.position.set(10,20,30);root.add(a);
  const b=new THREE.Mesh(shared,material);b.scale.set(4,6,8);b.position.set(-10,-20,-30);root.add(b);
  assert.equal(projectArchitecturalMaterialUVs(root),2);
  assert.notEqual(a.geometry,shared);assert.notEqual(b.geometry,shared);
  assert.deepEqual(Array.from(shared.attributes.position.array),before);assert.deepEqual(Array.from(shared.attributes.uv.array),originalUV);
  for(const mesh of [a,b]){
    assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),before);
    const {position,normal,uv}=mesh.geometry.attributes;
    for(let i=0;i<position.count;i++)if(normal.getY(i)>.99){
      assert.ok(Math.abs(uv.getX(i)-(position.getX(i)*mesh.scale.x+mesh.position.x))<1e-6);
      assert.ok(Math.abs(uv.getY(i)-(position.getZ(i)*mesh.scale.z+mesh.position.z))<1e-6);
    }
  }
  assert.equal(projectArchitecturalMaterialUVs(root),0,'Repeating scene updates must not progressively alter UVs');
  a.geometry.dispose();b.geometry.dispose();shared.dispose();material.dispose();
});

test('procedural finish fallback has an independent, nonconstant linear roughness channel',()=>{
  for(const kind of ['oak','linen','porcelain','standing-seam']){
    const maps=exteriorSurfacePixels(kind);
    assert.ok(maps.roughness instanceof Uint8Array);assert.equal(maps.roughness.length,maps.color.length);
    assert.notDeepEqual(maps.roughness,maps.color);assert.notDeepEqual(maps.roughness,maps.relief);
    assert.ok(new Set(maps.roughness.filter((_,i)=>i%4===1)).size>1);
  }
});
