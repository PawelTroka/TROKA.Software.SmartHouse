import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHedgeVegetation, createFoliageMaterial} from '../src/scene-vegetation.js';
import {cloneOwnedScene} from '../src/scene-house-model.js';

const material = new THREE.MeshStandardMaterial({color:'#a5b68b', roughness:.95});
const spans = [
  {side:'front', a:[0,0], b:[4,0]},
  {side:'front', a:[10,0], b:[20,0]},
  {side:'left', a:[20,0], b:[20,38]},
  {side:'rear', a:[20,38], b:[0,38]},
  {side:'right', a:[0,38], b:[0,0]},
];
const make = (segments = spans, options = {}) => createHedgeVegetation(segments, {
  material, spacing:.65, groundAt:()=>2, topAt:()=>6, ...options,
});
function vertices(group, inspect) {
  const matrix = new THREE.Matrix4(), vertex = new THREE.Vector3();
  let count = 0;
  group.traverse(mesh => {
    if (!mesh.isInstancedMesh) return;
    for (let instance = 0; instance < mesh.count; instance++) {
      mesh.getMatrixAt(instance, matrix);
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        inspect(vertex.fromBufferAttribute(positions, i).applyMatrix4(matrix), mesh);
        count++;
      }
    }
  });
  return count;
}

test('detailed hedges leave real access openings clear and respect terrain-dependent top levels', () => {
  const groundAt = (x,y) => 2 + x * .018 + y * .026;
  const topAt = (x,y) => groundAt(x,y) + 4;
  const front = make(spans.slice(0,2), {groundAt, topAt});
  const checked = vertices(front, p => {
    assert.ok(p.x >= -1e-6 && p.x <= 20 + 1e-6);
    assert.ok(p.x <= 4 + 1e-6 || p.x >= 10 - 1e-6, 'Decorative foliage must not intrude into the actual garage/entrance opening');
    assert.ok(p.y <= topAt(p.x,p.z) + 1e-6, 'Needle tips cannot falsely increase the configured hedge height');
  });
  assert.ok(checked > 10000, 'Validate every transformed needle vertex, not just instance centres');
  for (const mesh of front.children) {
    assert.equal(mesh.castShadow,false,'The existing ideal hedge plane owns numerical/shadow coverage');
    assert.equal(mesh.userData.contactShading,false,'AO overrides must not occlude with opaque spray rectangles');
  }
});

test('a full perimeter batches botanical sprays with fewer triangles than the old ball clusters', () => {
  const group = make();
  assert.equal(group.userData.drawCalls,4);
  assert.ok(group.userData.plantCount > 150);
  let triangles = 0;
  for (const mesh of group.children) {
    triangles += mesh.count * mesh.geometry.attributes.position.count / 3;
    assert.ok(mesh.geometry.userData.sprayCount >= 150);
    assert.ok(mesh.material.alphaTest > 0);
    assert.equal(mesh.material.transparent,false,'Cutouts should write stable depth and avoid transparency sorting');
    assert.equal(mesh.material.alphaToCoverage,true);
    assert.equal(mesh.material.map.wrapS,THREE.ClampToEdgeWrapping);
    assert.ok(mesh.geometry.boundingBox.max.y <= 1);
  }
  assert.ok(triangles < 150000, `Perimeter foliage costs ${triangles} triangles`);
  assert.equal(group.userData.analyticalScreen,false);
  assert.equal(make(spans,{svgMode:true}).children.length,0,'SVG retains its explicit fallback hedge planes');
  assert.equal(make(spans,{topAt:()=>2}).children.length,0,'A zero-height hedge creates no decorative blocking');
});

test('hedge specimens are deterministic across rebuilds and retain several distinct silhouettes', () => {
  const a = make(), b = make();
  assert.equal(a.children.length,b.children.length);
  for (let i = 0; i < a.children.length; i++) {
    assert.deepEqual(a.children[i].instanceMatrix.array,b.children[i].instanceMatrix.array);
    assert.deepEqual(a.children[i].geometry.attributes.position.array,b.children[i].geometry.attributes.position.array);
  }
  assert.notDeepEqual(a.children[0].geometry.attributes.position.array,a.children[1].geometry.attributes.position.array);
  assert.equal(material.color.getHexString(),'a5b68b','Vegetation must not recolour caller-owned shared materials');
  assert.equal(material.map,null);
});

test('foliage atlases release with originals and independently owned interior clones', () => {
  const group = make(), original = group.children[0].material, originalMap = original.map;
  const clone = cloneOwnedScene([group]), copied = clone.root.children[0].children[0].material;
  assert.notEqual(copied,original);
  assert.notEqual(copied.map,originalMap);
  let originalDisposed = 0, copiedDisposed = 0;
  originalMap.addEventListener('dispose',()=>originalDisposed++);
  copied.map.addEventListener('dispose',()=>copiedDisposed++);
  clone.dispose();
  assert.equal(copiedDisposed,1);
  assert.equal(originalDisposed,0,'Disposing the room context must leave the exterior atlas alive');
  original.dispose();
  assert.equal(originalDisposed,1);
  const pine = createFoliageMaterial(material,'pine');
  const alpha = pine.map.image.data;
  let cutout = 0, solid = 0;
  for (let i = 3; i < alpha.length; i += 4) {if(alpha[i]===0)cutout++; if(alpha[i]===255)solid++;}
  assert.ok(cutout > 20000 && solid > 60000,'Atlas needs both real transparent needle gaps and a dense interior tile');
  pine.dispose();
});
