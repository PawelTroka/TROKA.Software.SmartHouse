import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createScreeningTreeGroup} from '../src/scene-trees.js';

const material = new THREE.MeshBasicMaterial({vertexColors: true});
const materials = {bark: material, pine: material, spruce: material, deciduous: material, ghost: material};
const specimen = {id: 'austrian-pine-1', x: 12, y: 31, groundZ: 3.4,
  crownBottomZ: 5.9, crownTopZ: 12.9, crownWidth: 5, crownDepth: 5,
  trunkTopZ: 10.05, trunkRadius: .2375, rotation: 0,
  form: 'ellipsoid', evergreen: true, foliageActive: true, plantable: true, enabled: true};

function assertContained(group, v) {
  group.updateMatrixWorld(true);
  const theta = v.rotation * Math.PI / 180, c = Math.cos(theta), s = Math.sin(theta);
  const centreZ = (v.crownTopZ + v.crownBottomZ) / 2;
  let checked = 0;
  group.traverse(mesh => {
    if (!mesh.userData.withinCrownEnvelope) return;
    const positions = mesh.geometry.getAttribute('position');
    const vertex = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      const dx = vertex.x - v.x, dy = vertex.z - v.y;
      const localX = dx * c + dy * s, localY = -dx * s + dy * c;
      const q = (localX / (v.crownWidth / 2)) ** 2 + (localY / (v.crownDepth / 2)) ** 2
        + ((vertex.y - centreZ) / ((v.crownTopZ - v.crownBottomZ) / 2)) ** 2;
      assert.ok(q <= 1.000001, `${mesh.name} vertex escapes analytical crown: ${q}`);
      assert.ok(vertex.y >= v.crownBottomZ - 1e-6 && vertex.y <= v.crownTopZ + 1e-6,
        'Foliage or crown branches entered the clear stem or exceeded tree height');
      checked++;
    }
  });
  assert.ok(checked > 1000, 'The check must inspect actual botanical vertices');
}

test('pine foliage and branch vertices stay inside the rotated analytical crown, including narrow edited crowns', () => {
  for (const svgMode of [false, true]) for (const dimensions of [
    {crownWidth: 5, crownDepth: 5, rotation: 0},
    {crownWidth: 6, crownDepth: 2, rotation: 37},
    {crownWidth: .3, crownDepth: .2, rotation: 90},
  ]) {
    const v = {...specimen, ...dimensions};
    assertContained(createScreeningTreeGroup(v, materials, svgMode), v);
  }
});

test('the visual pine uses merged needle pads while unpainted proxies preserve numerical shadow envelopes', () => {
  const group = createScreeningTreeGroup(specimen, materials);
  const foliage = group.getObjectByName('pine-needle-pads');
  const crown = group.getObjectByName('crown-envelope');
  assert.ok(foliage.userData.padCount > 60, 'A pine needs branch-scale foliage detail, not a replacement oval');
  assert.equal(crown.material.colorWrite, false);
  assert.equal(crown.material.depthWrite, false);
  assert.equal(crown.castShadow, true);
  assert.equal(crown.visible, true, 'WebGL must include the unpainted envelope in its shadow pass');
  assert.equal(foliage.castShadow, false, 'Fine detail cannot add shadow outside the shared envelope');
  let meshCount = 0;
  group.traverse(object => { if (object.isMesh) meshCount++; });
  assert.ok(meshCount <= 6, 'Fine foliage and branches must remain a bounded number of draw calls');
  assert.ok(new Set(foliage.geometry.getAttribute('color').array).size > 20, 'Needle pads need tonal variation');
  const trunk = group.getObjectByName('pine-tapered-trunk');
  const positions = trunk.geometry.getAttribute('position');
  let bottomRadius = 0, topRadius = 0;
  const halfHeight = (specimen.trunkTopZ - specimen.groundZ) / 2;
  for (let i = 0; i < positions.count; i++) {
    const radius = Math.hypot(positions.getX(i), positions.getZ(i));
    assert.ok(radius <= specimen.trunkRadius + 1e-6);
    if (Math.abs(positions.getY(i) + halfHeight) < 1e-6) bottomRadius = Math.max(bottomRadius, radius);
    if (Math.abs(positions.getY(i) - halfHeight) < 1e-6) topRadius = Math.max(topRadius, radius);
  }
  assert.ok(topRadius < bottomRadius * .7, 'The trunk must visibly taper');
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group.getObjectByName('trunk-envelope'));
  assert.ok(Math.abs(bounds.min.y - specimen.groundZ) < 1e-6);
  assert.ok(Math.abs(bounds.max.y - specimen.trunkTopZ) < 1e-6);
});

test('specimen detail is deterministic when moved, varies by tree, and SVG keeps the layered silhouette', () => {
  const getPositions = (v, svgMode = false) => createScreeningTreeGroup(v, materials, svgMode)
    .getObjectByName('pine-needle-pads').geometry.getAttribute('position').array;
  const original = getPositions(specimen);
  assert.deepEqual(getPositions({...specimen, x: 3, y: 40, rotation: 67}), original,
    'Moving or rotating the same specimen must not regenerate its branches');
  assert.notDeepEqual(getPositions({...specimen, id: 'austrian-pine-2'}), original);
  const svg = createScreeningTreeGroup(specimen, materials, true);
  assert.ok(svg.getObjectByName('pine-needle-pads').geometry.getAttribute('position').count < original.length / 9,
    'Fallback foliage should cost substantially fewer vertices');
  assert.equal(svg.getObjectByName('crown-envelope').visible, false, 'SVG must not paint the analytical oval');
  assert.equal(svg.getObjectByName('trunk-envelope').visible, false);
});

test('disabled and leaf-off states do not accidentally regain botanical screening or shadow credit', () => {
  for (const state of [{plantable: false}, {enabled: false}]) {
    const group = createScreeningTreeGroup({...specimen, ...state}, materials);
    assert.equal(group.getObjectByName('crown-envelope').castShadow, false);
    assert.equal(group.getObjectByName('trunk-envelope').castShadow, false);
    assert.equal(group.getObjectByName('pine-needle-pads').material, materials.ghost);
  }
  const winter = createScreeningTreeGroup({...specimen, foliageActive: false}, materials);
  assert.equal(winter.getObjectByName('pine-needle-pads'), undefined);
  assert.equal(winter.getObjectByName('crown-envelope'), undefined);
  assert.ok(winter.getObjectByName('pine-branches'));
});
